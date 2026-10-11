import { describe, expect, it } from "vitest";
import { syncParamsFromUrl, syncUrlFromParams } from "./params";

const kv = (key: string, value: string, enabled = true) => ({ key, value, enabled });

describe("syncParamsFromUrl", () => {
  it("parses query including variables and keeps encoding as typed", () => {
    expect(syncParamsFromUrl("{{base}}/x?a=1&b={{id}}&c=%20&flag", [])).toEqual([
      kv("a", "1"),
      kv("b", "{{id}}"),
      kv("c", "%20"),
      kv("flag", ""),
    ]);
  });

  it("keeps disabled params and ignores the fragment", () => {
    expect(syncParamsFromUrl("http://a?x=1#frag", [kv("off", "2", false), kv("x", "old")])).toEqual([kv("x", "1"), kv("off", "2", false)]);
  });

  it("handles url without query", () => {
    expect(syncParamsFromUrl("http://a", [kv("off", "2", false)])).toEqual([kv("off", "2", false)]);
  });

  it("keeps values containing '='", () => {
    expect(syncParamsFromUrl("http://a?t=a=b", [])).toEqual([kv("t", "a=b")]);
  });
});

describe("syncUrlFromParams", () => {
  it("rebuilds query from enabled params only", () => {
    expect(syncUrlFromParams("http://a?old=1", [kv("a", "1"), kv("b", "", true), kv("off", "x", false)])).toBe("http://a?a=1&b");
  });

  it("drops the query when no enabled params remain and preserves the fragment", () => {
    expect(syncUrlFromParams("http://a?x=1#top", [kv("x", "1", false)])).toBe("http://a#top");
  });

  it("round-trips", () => {
    const url = "{{h}}/p?a=1&b={{v}}";
    expect(syncUrlFromParams(url, syncParamsFromUrl(url, []))).toBe(url);
  });
});
