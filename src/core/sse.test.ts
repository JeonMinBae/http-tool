import { describe, expect, it } from "vitest";
import { SseParser } from "./sse";

const parse = (...chunks: string[]) => {
  const p = new SseParser(() => 1000);
  return [...chunks.flatMap((c) => p.feed(c)), ...p.flush()];
};

describe("SseParser", () => {
  it("parses events split across chunk boundaries", () => {
    expect(parse("data: hel", "lo\n", "\ndata: world\n\n")).toEqual([
      { event: "message", data: "hello", receivedAt: 1000 },
      { event: "message", data: "world", receivedAt: 1000 },
    ]);
  });

  it("supports event, id, multi-line data and CRLF", () => {
    expect(parse("event: update\r\nid: 7\r\ndata: a\r\ndata: b\r\n\r\n")).toEqual([{ event: "update", id: "7", data: "a\nb", receivedAt: 1000 }]);
  });

  it("ignores comments and lines without data", () => {
    expect(parse(": ping\n\n", "retry: 10\n\n", "data:x\n\n")).toEqual([{ event: "message", data: "x", receivedAt: 1000 }]);
  });

  it("emits a trailing event without blank line on flush", () => {
    expect(parse("data: last")).toEqual([{ event: "message", data: "last", receivedAt: 1000 }]);
  });

  it("strips only one leading space from values", () => {
    expect(parse("data:  two\n\n")[0].data).toBe(" two");
  });
});
