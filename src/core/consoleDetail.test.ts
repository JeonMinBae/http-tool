import { describe, expect, it } from "vitest";
import type { HttpResult, PreparedRequest } from "../ipc";
import { consoleDetail } from "./consoleDetail";
import { utf8ToBase64 } from "./encoding";

const result = (over: Partial<HttpResult> = {}): HttpResult => ({
  status: 200, statusText: "OK", httpVersion: "HTTP/1.1", headers: [["content-type", "application/json"]],
  bodyBase64: utf8ToBase64('{"a":1}'), isText: true, size: 7, elapsedMs: 5,
  sent: { method: "POST", url: "https://a.com/x", headers: [["authorization", "Bearer real"]], bodyPreview: "{}" },
  redirects: [], streaming: false, ...over,
});

describe("consoleDetail", () => {
  it("shows what went on the wire, secrets included", () => {
    const d = consoleDetail({ result: result() });
    expect(d.request).toEqual({ head: "POST /x HTTP/1.1\nhost: a.com\nauthorization: Bearer real", body: { text: "{}", truncated: false } });
    expect(d.response).toMatchObject({ status: 200, statusText: "OK", body: { text: '{"a":1}', truncated: false } });
  });

  it("cuts bodies at 64 KB on a character boundary", () => {
    const big = "가".repeat(30_000); // 3 bytes each → 90,000 bytes
    const d = consoleDetail({ result: result({ bodyBase64: utf8ToBase64(big), size: 90_000 }) });
    expect(d.response?.body).toEqual({ text: "가".repeat(21_845), truncated: true }); // floor(65536 / 3)
  });

  it("shows binary bodies as a size", () => {
    expect(consoleDetail({ result: result({ isText: false, size: 2048 }) }).response?.body.text).toBe("<binary 2048 bytes>");
  });

  it("falls back to the prepared request when sending failed", () => {
    const prepared: PreparedRequest = {
      method: "POST", url: "http://localhost:1/x", headers: [], body: { type: "url-encoded", fields: [["a", "1"], ["b", "x y"]] },
      timeoutMs: 0, followRedirects: true, verifySsl: true, proxy: { mode: "system", url: "", bypass: "" },
    };
    const d = consoleDetail({ prepared, error: "connection refused" });
    expect(d.request?.body.text).toBe("a=1&b=x+y");
    expect(d.response).toBeUndefined();
    expect(d.error).toBe("connection refused");
  });
});
