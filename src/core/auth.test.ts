import { describe, expect, it } from "vitest";
import { emptyCollection, emptyFolder, emptyRequest, type Auth } from "./model";
import { applyAuth, resolveAuth, type Chain } from "./auth";

const id = (v: string) => v;
const bearer = (token: string): Auth => ({ type: "bearer", token });
const inherit = (): Auth => ({ type: "inherit" });

function chainOf(p: { collection: Auth; folders: Auth[]; request: Auth }): Chain {
  return {
    collection: { ...emptyCollection("c"), auth: p.collection },
    folders: p.folders.map((auth, i) => ({ ...emptyFolder(`f${i}`), auth })),
    request: { ...emptyRequest("r"), auth: p.request },
  };
}

describe("resolveAuth", () => {
  it("nearest non-inherit wins", () => {
    const chain = chainOf({ collection: bearer("c"), folders: [inherit(), bearer("f")], request: inherit() });
    expect(resolveAuth(chain)).toEqual(bearer("f"));
  });
  it("inner folder beats outer folder", () => {
    expect(resolveAuth(chainOf({ collection: bearer("c"), folders: [bearer("outer"), bearer("inner")], request: inherit() })))
      .toEqual(bearer("inner"));
  });
  it("falls back to collection, then none", () => {
    expect(resolveAuth(chainOf({ collection: bearer("c"), folders: [inherit()], request: inherit() }))).toEqual(bearer("c"));
    expect(resolveAuth(chainOf({ collection: inherit(), folders: [], request: inherit() }))).toEqual({ type: "none" });
  });
  it("explicit none on request disables inherited auth", () => {
    expect(resolveAuth(chainOf({ collection: bearer("c"), folders: [], request: { type: "none" } }))).toEqual({ type: "none" });
  });
});

describe("applyAuth", () => {
  it("user Authorization header beats auth tab", () => {
    const r = applyAuth(bearer("x"), { url: "http://a", headers: [["authorization", "Custom y"]] }, id);
    expect(r.headers).toEqual([["authorization", "Custom y"]]);
  });
  it("basic encodes utf-8 credentials", () => {
    const r = applyAuth({ type: "basic", username: "me", password: "pw" }, { url: "http://a", headers: [] }, id);
    expect(r.headers).toEqual([["Authorization", "Basic bWU6cHc="]]);
  });
  it("apikey in query appends param", () => {
    expect(applyAuth({ type: "apikey", key: "k", value: "v", in: "query" }, { url: "http://a?x=1", headers: [] }, id).url)
      .toBe("http://a?x=1&k=v");
    expect(applyAuth({ type: "apikey", key: "k", value: "a b", in: "query" }, { url: "http://a#h", headers: [] }, id).url)
      .toBe("http://a?k=a%20b#h");
  });
  it("interpolates auth values", () => {
    const r = applyAuth(bearer("{{t}}"), { url: "http://a", headers: [] }, (v) => v.replace("{{t}}", "TOKEN"));
    expect(r.headers).toEqual([["Authorization", "Bearer TOKEN"]]);
  });
});
