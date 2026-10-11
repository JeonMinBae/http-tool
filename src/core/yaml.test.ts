import { describe, expect, it } from "vitest";
import { emptyCollection, emptyFolder, emptyRequest, type HttpRequestDoc } from "./model";
import {
  parseCollection,
  parseFolder,
  parseRequest,
  serializeCollection,
  serializeFolder,
  serializeRequest,
} from "./yaml";

describe("request yaml", () => {
  it("round-trips a full request", () => {
    const doc: HttpRequestDoc = {
      ...emptyRequest("Create user", 3),
      method: "POST",
      url: "{{baseUrl}}/users",
      headers: [{ key: "Accept", value: "application/json", enabled: true }],
      cookies: [{ key: "sid", value: "1", enabled: false }],
      body: { type: "form-data", fields: [{ key: "f", value: "/tmp/a.png", enabled: true, kind: "file" }] },
      auth: { type: "apikey", key: "X-Key", value: "{{key}}", in: "header" },
      scripts: { pre: "", post: 'pm.test("ok", () => {});\n' },
      settings: { timeoutMs: 1000, followRedirects: false },
    };
    expect(parseRequest(serializeRequest(doc))).toEqual(doc);
  });

  it("multiline content uses block literal", () => {
    const doc: HttpRequestDoc = {
      ...emptyRequest("A"),
      body: { type: "raw", language: "json", content: '{\n  "a": 1\n}' },
    };
    const text = serializeRequest(doc);
    expect(text).toMatch(/content: \|/);
    expect(parseRequest(text)).toEqual(doc);
  });

  it("fills defaults for missing fields", () => {
    const r = parseRequest("kind: http\nname: X\nmethod: GET\nurl: http://a");
    expect(r.headers).toEqual([]);
    expect(r.params).toEqual([]);
    expect(r.auth).toEqual({ type: "inherit" });
    expect(r.body).toEqual({ type: "none" });
    expect(r.scripts).toEqual({ pre: "", post: "" });
    expect(r.seq).toBe(0);
  });

  it("normalizes partially specified key-values and bodies", () => {
    const r = parseRequest(
      "kind: http\nname: X\nheaders:\n  - key: A\nbody:\n  type: raw\n  content: hi\nmethod: post",
    );
    expect(r.headers).toEqual([{ key: "A", value: "", enabled: true }]);
    expect(r.body).toEqual({ type: "raw", language: "text", content: "hi" });
    expect(r.method).toBe("POST");
  });

  it("rejects wrong kind", () => {
    expect(() => parseRequest("kind: folder\nname: X")).toThrow(/kind/);
  });

  it("rejects non-mapping documents", () => {
    expect(() => parseRequest("- a\n- b")).toThrow();
  });
});

describe("folder and collection yaml", () => {
  it("round-trips folder", () => {
    const f = { ...emptyFolder("users", 2), auth: { type: "bearer" as const, token: "t" } };
    expect(parseFolder(serializeFolder(f))).toEqual(f);
  });

  it("round-trips collection with variables", () => {
    const c = {
      ...emptyCollection("api"),
      variables: [{ key: "baseUrl", value: "http://x", enabled: true, secret: false }],
    };
    expect(parseCollection(serializeCollection(c))).toEqual(c);
  });

  it("does not write secret collection variable values", () => {
    const c = {
      ...emptyCollection("api"),
      variables: [{ key: "token", value: "s3cr3t", enabled: true, secret: true }],
    };
    const text = serializeCollection(c);
    expect(text).not.toContain("s3cr3t");
    expect(parseCollection(text).variables[0]).toEqual({ key: "token", value: "", enabled: true, secret: true });
  });
});

describe("oauth2 auth yaml", () => {
  it("round-trips and fills defaults", () => {
    const r = parseRequest("kind: http\nname: X\nauth:\n  type: oauth2\n  tokenUrl: https://t\n  clientId: c");
    expect(r.auth).toEqual({
      type: "oauth2", grant: "client_credentials", authUrl: "", tokenUrl: "https://t", clientId: "c", clientSecret: "",
      scope: "", usePkce: true, redirectUri: "", clientAuth: "header", tokenPrefix: "Bearer",
    });
    expect(parseRequest(serializeRequest(r))).toEqual(r);
  });
});
