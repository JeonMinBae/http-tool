import { describe, expect, it } from "vitest";
import { detectKind, formatSent, formatSize, parseSetCookie, prettyXml } from "./responseFormat";

describe("responseFormat", () => {
  it("detects kind from content type, then content", () => {
    expect(detectKind("application/problem+json", true)).toBe("json");
    expect(detectKind("image/png", false)).toBe("image");
    expect(detectKind("text/html; charset=utf-8", true)).toBe("html");
    expect(detectKind(undefined, true, ' {"a":1}')).toBe("json");
    expect(detectKind("application/octet-stream", false)).toBe("binary");
  });

  it("formats sizes", () => {
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(2048)).toBe("2.00 KB");
    expect(formatSize(3 * 1024 * 1024)).toBe("3.00 MB");
  });

  it("formats the sent request with host and body", () => {
    expect(formatSent({ method: "POST", url: "https://a.com:8443/x?y=1", headers: [["cookie", "a=1"]], bodyPreview: "{}" })).toBe(
      "POST /x?y=1 HTTP/1.1\nhost: a.com:8443\ncookie: a=1\n\n{}",
    );
  });

  it("parses Set-Cookie attributes", () => {
    expect(parseSetCookie("sid=a=b; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=60")).toEqual({
      name: "sid", value: "a=b", path: "/", httpOnly: true, secure: true, sameSite: "Lax", maxAge: "60",
    });
  });

  it("indents xml", () => {
    expect(prettyXml("<a><b>1</b><c/></a>")).toBe("<a>\n  <b>1</b>\n  <c/>\n</a>");
  });
});
