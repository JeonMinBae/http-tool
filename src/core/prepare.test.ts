import { describe, expect, it } from "vitest";
import type { LoadedCollection } from "./collectionRepo";
import { DEFAULT_SETTINGS, emptyCollection, emptyFolder, emptyRequest, type HttpRequestDoc } from "./model";
import { buildChain, prepareRequest, PrepareError } from "./prepare";
import { buildScopes } from "./variables";

const scopes = buildScopes({ globals: [{ key: "host", value: "api.test", enabled: true, secret: false }, { key: "id", value: "7", enabled: true, secret: false }] });
const chainFor = (request: HttpRequestDoc) => buildChain(undefined, null, request);
const req = (p: Partial<HttpRequestDoc>): HttpRequestDoc => ({ ...emptyRequest("r"), url: "http://{{host}}/x", ...p });

describe("buildChain", () => {
  it("collects folders from outermost to innermost", () => {
    const r = emptyRequest("r");
    const col: LoadedCollection = {
      root: "/c",
      doc: emptyCollection("c"),
      errors: [],
      hasCollectionFile: true,
      children: [
        { type: "folder", path: "/c/a", doc: emptyFolder("a"), children: [
          { type: "folder", path: "/c/a/b", doc: emptyFolder("b"), children: [{ type: "request", path: "/c/a/b/r.yaml", doc: r }] },
        ] },
      ],
    };
    expect(buildChain(col, "/c/a/b/r.yaml", r).folders.map((f) => f.name)).toEqual(["a", "b"]);
    expect(buildChain(col, null, r).folders).toEqual([]);
  });
});

describe("prepareRequest", () => {
  it("interpolates url, headers and reports unresolved variables", () => {
    const r = prepareRequest(chainFor(req({ url: "{{host}}/u/{{id}}?q={{nope}}", headers: [{ key: "X-Id", value: "{{id}}", enabled: true }] })), scopes, DEFAULT_SETTINGS);
    expect(r.request.url).toBe("http://api.test/u/7?q={{nope}}");
    expect(r.request.headers).toEqual([["X-Id", "7"]]);
    expect(r.unresolved).toEqual(["nope"]);
  });

  it("skips disabled items and joins request cookies into one header", () => {
    const r = prepareRequest(chainFor(req({
      headers: [{ key: "A", value: "1", enabled: false }, { key: "", value: "x", enabled: true }],
      cookies: [{ key: "a", value: "1", enabled: true }, { key: "b", value: "{{id}}", enabled: true }],
    })), scopes, DEFAULT_SETTINGS);
    expect(r.request.headers).toEqual([["Cookie", "a=1; b=7"]]);
  });

  it("sets raw content type unless the user set one", () => {
    const json = prepareRequest(chainFor(req({ method: "POST", body: { type: "raw", language: "json", content: '{"id":{{id}}}' } })), scopes, DEFAULT_SETTINGS);
    expect(json.request.headers).toEqual([["Content-Type", "application/json"]]);
    expect(json.request.body).toEqual({ type: "text", content: '{"id":7}' });
    const own = prepareRequest(chainFor(req({ headers: [{ key: "content-type", value: "text/x", enabled: true }], body: { type: "raw", language: "json", content: "" } })), scopes, DEFAULT_SETTINGS);
    expect(own.request.headers).toEqual([["content-type", "text/x"]]);
  });

  it("converts graphql to JSON and rejects invalid variables", () => {
    const ok = prepareRequest(chainFor(req({ body: { type: "graphql", query: "{ a }", variables: '{"id": {{id}}}' } })), scopes, DEFAULT_SETTINGS);
    expect(ok.request.body).toEqual({ type: "text", content: '{"query":"{ a }","variables":{"id":7}}' });
    expect(() => prepareRequest(chainFor(req({ body: { type: "graphql", query: "{ a }", variables: "{" } })), scopes, DEFAULT_SETTINGS)).toThrow(PrepareError);
  });

  it("keeps form-data file paths verbatim and drops disabled fields", () => {
    const r = prepareRequest(chainFor(req({ body: { type: "form-data", fields: [
      { key: "f", value: "/tmp/{{id}}.png", enabled: true, kind: "file" },
      { key: "t", value: "{{id}}", enabled: true, kind: "text" },
      { key: "off", value: "x", enabled: false, kind: "text" },
    ] } })), scopes, DEFAULT_SETTINGS);
    expect(r.request.body).toEqual({ type: "form-data", fields: [
      { name: "f", kind: "file", value: "/tmp/{{id}}.png" },
      { name: "t", kind: "text", value: "7" },
    ] });
  });

  it("applies inherited auth and request setting overrides", () => {
    const chain = { ...chainFor(req({ settings: { timeoutMs: 5, verifySsl: false } })), collection: { ...emptyCollection("c"), auth: { type: "bearer" as const, token: "{{id}}" } } };
    const r = prepareRequest(chain, scopes, DEFAULT_SETTINGS);
    expect(r.request.headers).toEqual([["Authorization", "Bearer 7"]]);
    expect(r.request).toMatchObject({ timeoutMs: 5, verifySsl: false, followRedirects: true });
  });

  it("rejects an empty url", () => {
    expect(() => prepareRequest(chainFor(req({ url: "  " })), scopes, DEFAULT_SETTINGS)).toThrow(/URL/);
  });
});
