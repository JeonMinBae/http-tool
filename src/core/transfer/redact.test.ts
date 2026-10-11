import { describe, expect, it } from "vitest";
import { emptyFolder, emptyRequest, emptyWebSocket, type HttpRequestDoc } from "../model";
import { redactAuth, redactNodes, redactVariables, unredactedCredentialWarnings } from "./redact";

describe("redact", () => {
  it("blanks literal credentials but keeps variable references", () => {
    expect(redactAuth({ type: "bearer", token: "abc" })).toEqual({ type: "bearer", token: "" });
    expect(redactAuth({ type: "bearer", token: "{{token}}" })).toEqual({ type: "bearer", token: "{{token}}" });
    expect(redactAuth({ type: "basic", username: "u", password: "p" })).toEqual({ type: "basic", username: "u", password: "" });
  });

  it("redacts nested folder and request auth", () => {
    const req: HttpRequestDoc = { ...emptyRequest("r"), auth: { type: "apikey", key: "X", value: "k", in: "header" } };
    const [folder] = redactNodes([{ ...emptyFolder("f"), auth: { type: "bearer", token: "t" }, items: [req] }]);
    expect(folder.kind === "folder" && folder.auth).toEqual({ type: "bearer", token: "" });
    expect(folder.kind === "folder" && (folder.items[0] as HttpRequestDoc).auth).toMatchObject({ value: "" });
  });

  it("only secret variables are blanked", () => {
    const vars = redactVariables([
      { key: "a", value: "1", enabled: true, secret: false },
      { key: "b", value: "2", enabled: true, secret: true },
    ]);
    expect(vars.map((v) => v.value)).toEqual(["1", ""]);
    expect(redactVariables([{ key: "c", value: "{{envToken}}", enabled: true, secret: true }])[0].value).toBe("{{envToken}}");
  });

  it("warns about literal credentials outside the Auth tab", () => {
    const req: HttpRequestDoc = {
      ...emptyRequest("r"),
      headers: [
        { key: "Authorization", value: "Bearer abc", enabled: true },
        { key: "X-Api-Key", value: "{{key}}", enabled: true },
        { key: "Accept", value: "application/json", enabled: true },
      ],
      cookies: [{ key: "sid", value: "1", enabled: true }],
    };
    const ws = { ...emptyWebSocket("w"), headers: [{ key: "X-Token", value: "t", enabled: true }] };
    expect(unredactedCredentialWarnings([{ ...emptyFolder("f"), items: [req] }, ws])).toEqual([
      '"r": header Authorization, cookie sid will be exported as plain text.',
      '"w": header X-Token will be exported as plain text.',
    ]);
  });
});
