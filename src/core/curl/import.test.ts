import { describe, expect, it } from "vitest";
import { parseCurl } from "./import";

describe("parseCurl", () => {
  it('parses Chrome "Copy as cURL (bash)"', () => {
    const r = parseCurl(`curl 'https://a.com/x?y=1' \\\n  -H 'accept: application/json' \\\n  --data-raw '{"a":1}'`);
    expect(r.request.method).toBe("POST");
    expect(r.request.body).toEqual({ type: "raw", language: "json", content: '{"a":1}' });
    expect(r.request.params).toEqual([{ key: "y", value: "1", enabled: true }]);
    expect(r.request.headers).toEqual([{ key: "accept", value: "application/json", enabled: true }]);
  });

  it("parses Windows cmd caret continuation", () => {
    expect(parseCurl('curl ^"https://a.com^" ^\n  -H ^"x: 1^"').request.headers).toEqual([{ key: "x", value: "1", enabled: true }]);
  });

  it("-u becomes basic auth", () => {
    expect(parseCurl(`curl -u me:pw https://a.com`).request.auth).toEqual({ type: "basic", username: "me", password: "pw" });
  });

  it("form posts become urlencoded fields", () => {
    const r = parseCurl(`curl https://a.com -d 'a=1+2' -d 'b=%26'`);
    expect(r.request.body).toEqual({ type: "urlencoded", fields: [{ key: "a", value: "1 2", enabled: true }, { key: "b", value: "&", enabled: true }] });
  });

  it("-F builds form-data with files", () => {
    const r = parseCurl(`curl -F 'name=kim' -F 'avatar=@/tmp/a.png' https://a.com/up`);
    expect(r.request.method).toBe("POST");
    expect(r.request.body).toEqual({ type: "form-data", fields: [
      { key: "name", value: "kim", enabled: true, kind: "text" },
      { key: "avatar", value: "/tmp/a.png", enabled: true, kind: "file" },
    ] });
  });

  it("handles -X, -b cookies, -L, -k, -G and double quotes", () => {
    const r = parseCurl(`curl -X DELETE "https://a.com/x" -b "a=1; b=2" -L -k -G -d q=x --compressed --max-time 3`);
    expect(r.request.method).toBe("DELETE");
    expect(r.request.url).toBe("https://a.com/x?q=x");
    expect(r.request.cookies).toEqual([{ key: "a", value: "1", enabled: true }, { key: "b", value: "2", enabled: true }]);
    expect(r.request.settings).toEqual({ followRedirects: true, verifySsl: false, timeoutMs: 3000 });
    expect(r.request.body).toEqual({ type: "none" });
  });

  it("--data-binary @file becomes binary body", () => {
    expect(parseCurl(`curl https://a.com --data-binary @/tmp/f.bin`).request.body).toEqual({ type: "binary", filePath: "/tmp/f.bin" });
  });

  it("reports unknown options without failing", () => {
    const r = parseCurl(`curl --http2 --foo https://a.com`);
    expect(r.request.url).toBe("https://a.com");
    expect(r.warnings).toEqual(["Ignored option --foo"]);
  });

  it("rejects text that is not a curl command", () => {
    expect(() => parseCurl("wget https://a.com")).toThrow(/curl/);
    expect(() => parseCurl("curl -H 'a: b'")).toThrow(/URL/);
  });

  it("supports PowerShell backtick continuation and curl.exe", () => {
    const r = parseCurl("curl.exe 'https://a.com' `\n  -H 'A: it''s'");
    expect(r.request.headers).toEqual([{ key: "A", value: "it's", enabled: true }]);
  });
});
