import { describe, expect, it } from "vitest";
import { emptyRequest } from "../core/model";
import type { HistoryEntry, HttpResult } from "../ipc";
import { historyExecState } from "./history";

const result: HttpResult = {
  status: 200,
  statusText: "OK",
  httpVersion: "HTTP/1.1",
  headers: [],
  bodyBase64: "",
  isText: true,
  size: 2 * 1024 * 1024,
  elapsedMs: 5,
  sent: { method: "GET", url: "http://a/", headers: [], bodyPreview: null },
  redirects: [],
  streaming: false,
};
const entry = (p: Partial<HistoryEntry>): HistoryEntry => ({
  id: "h1",
  time: 1000,
  method: "GET",
  url: "http://a/",
  root: null,
  path: null,
  request: emptyRequest("R"),
  ...p,
});

describe("historyExecState", () => {
  it("marks responses whose stored body was truncated", () => {
    expect(historyExecState(entry({ result, truncated: true }))).toMatchObject({ status: "done", result, truncated: true, receivedAt: 1000 });
  });

  it("leaves complete responses unmarked", () => {
    expect(historyExecState(entry({ result }))).not.toHaveProperty("truncated");
  });

  it("restores errors and ignores empty entries", () => {
    expect(historyExecState(entry({ error: "boom" }))).toEqual({ status: "error", requestId: "h1", error: "boom", unresolved: [] });
    expect(historyExecState(entry({}))).toBeUndefined();
  });
});
