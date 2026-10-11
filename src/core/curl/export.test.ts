import { describe, expect, it } from "vitest";
import type { PreparedRequest } from "../../ipc";
import { toCurl } from "./export";
import { parseCurl } from "./import";

const base: PreparedRequest = {
  method: "GET",
  url: "https://a.com/x?q=1",
  headers: [],
  body: { type: "none" },
  timeoutMs: 0,
  followRedirects: false,
  verifySsl: true,
  proxy: { mode: "system", url: "", bypass: "" },
};

describe("toCurl bash", () => {
  it("emits a minimal GET", () => {
    expect(toCurl(base, "bash")).toBe("curl 'https://a.com/x?q=1'");
  });

  it("escapes single quotes and adds options", () => {
    const out = toCurl(
      { ...base, method: "POST", headers: [["X-Name", "O'Brien"]], body: { type: "text", content: `{"a":"it's"}` }, followRedirects: true, verifySsl: false, timeoutMs: 1500 },
      "bash",
    );
    expect(out).toBe(
      [
        "curl -X POST 'https://a.com/x?q=1'",
        `-H 'X-Name: O'\\''Brien'`,
        `--data-raw '{"a":"it'\\''s"}'`,
        "-L",
        "-k",
        "--max-time 1.5",
      ].join(" \\\n  "),
    );
  });

  it("uses -F for form-data and @ for files", () => {
    const out = toCurl({ ...base, method: "POST", body: { type: "form-data", fields: [{ name: "t", kind: "text", value: "a;b" }, { name: "f", kind: "file", value: "/tmp/x y.png" }] } }, "bash");
    expect(out).toContain("--form-string 't=a;b'");
    expect(out).toContain("-F 'f=@\"/tmp/x y.png\"'");
  });

  it("url-encodes form fields and references binary files", () => {
    expect(toCurl({ ...base, method: "POST", body: { type: "url-encoded", fields: [["a", "1 2"], ["b", "&"]] } }, "bash")).toContain("--data-raw 'a=1+2&b=%26'");
    expect(toCurl({ ...base, method: "PUT", body: { type: "binary", path: "/p/f.bin" } }, "bash")).toContain("--data-binary '@/p/f.bin'");
  });

  it("includes a manual proxy", () => {
    expect(toCurl({ ...base, proxy: { mode: "manual", url: "http://p:8080", bypass: "localhost" } }, "bash")).toContain("-x 'http://p:8080' \\\n  --noproxy 'localhost'");
  });
});

describe("toCurl windows shells", () => {
  it("cmd escapes quotes, percent and specials with carets", () => {
    const content = '{"p":"C:\\\\dir\\\\"}';
    const out = toCurl({ ...base, method: "POST", url: "https://a.com/?a=1&b=%41", body: { type: "text", content } }, "cmd");
    expect(out.startsWith('curl -X POST ^"https://a.com/?a=1^&b=%^41^"')).toBe(true);
    expect(out).toContain(" ^\n  ");
    expect(parseCurl(out).request.body).toEqual({ type: "raw", language: "json", content });
  });

  it("powershell uses curl.exe, doubled single quotes and backtick continuation", () => {
    const out = toCurl({ ...base, headers: [["A", "it's"]] }, "powershell");
    expect(out).toBe("curl.exe 'https://a.com/x?q=1' `\n  -H 'A: it''s'");
  });
});

describe("round trip", () => {
  it("bash export parses back to the same request", () => {
    const req: PreparedRequest = { ...base, method: "PATCH", headers: [["Content-Type", "application/json"], ["X", "a'b"]], body: { type: "text", content: '{"x": 1}' } };
    const parsed = parseCurl(toCurl(req, "bash")).request;
    expect(parsed.method).toBe("PATCH");
    expect(parsed.url).toBe("https://a.com/x?q=1");
    expect(parsed.headers).toEqual([{ key: "Content-Type", value: "application/json", enabled: true }, { key: "X", value: "a'b", enabled: true }]);
    expect(parsed.body).toEqual({ type: "raw", language: "json", content: '{"x": 1}' });
  });

  it("cmd export parses back", () => {
    const req: PreparedRequest = { ...base, method: "POST", url: "https://a.com/?a=1&b=2", headers: [["X", '"q" 100%']], body: { type: "text", content: "line1\nline2" } };
    const parsed = parseCurl(toCurl(req, "cmd")).request;
    expect(parsed.url).toBe("https://a.com/?a=1&b=2");
    expect(parsed.headers).toEqual([{ key: "X", value: '"q" 100%', enabled: true }]);
    expect(parsed.body).toEqual({ type: "raw", language: "text", content: "line1\nline2" });
  });

  it("powershell export parses back", () => {
    const parsed = parseCurl(toCurl({ ...base, headers: [["A", "it's"]] }, "powershell")).request;
    expect(parsed.headers).toEqual([{ key: "A", value: "it's", enabled: true }]);
  });
});
