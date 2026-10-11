import { describe, expect, it, vi } from "vitest";
import { runCollection, type RunOptions, type RunOutcome } from "./runner";

const ok = (): RunOutcome => ({ result: { status: 200, elapsedMs: 5 }, tests: [{ name: "t", passed: true }] });
const failedTest = (): RunOutcome => ({ result: { status: 200, elapsedMs: 5 }, tests: [{ name: "t", passed: false, error: "x" }] });
const errored = (): RunOutcome => ({ error: "connect refused", tests: [] });

const items = (...names: string[]) => names.map((n) => ({ path: `/c/${n}.yaml`, name: n }));
const base = (p: Partial<RunOptions>): RunOptions => ({ items: items("a"), iterations: 1, delayMs: 0, stopOnFailure: false, signal: new AbortController().signal, execute: vi.fn(async () => ok()), ...p });

describe("runCollection", () => {
  it("runs items in order for every iteration", async () => {
    const execute = vi.fn(async () => ok());
    const seen: string[] = [];
    const s = await runCollection(base({ items: items("a", "b"), iterations: 2, execute }), (r) => seen.push(`${r.iteration}:${r.name}`));
    expect(seen).toEqual(["1:a", "1:b", "2:a", "2:b"]);
    expect(s).toMatchObject({ total: 4, failed: 0, testsPassed: 4, testsFailed: 0, stopped: false });
  });

  it("stops after first failure when stopOnFailure", async () => {
    const execute = vi.fn().mockResolvedValueOnce(ok()).mockResolvedValueOnce(failedTest()).mockResolvedValue(ok());
    const s = await runCollection(base({ items: items("a", "b", "c"), iterations: 2, stopOnFailure: true, execute }), () => {});
    expect(execute).toHaveBeenCalledTimes(2);
    expect(s.failed).toBe(1);
    expect(s.stopped).toBe(true);
  });

  it("counts transport errors as failures but continues by default", async () => {
    const execute = vi.fn().mockResolvedValueOnce(errored()).mockResolvedValue(ok());
    const s = await runCollection(base({ items: items("a", "b"), execute }), () => {});
    expect(execute).toHaveBeenCalledTimes(2);
    expect(s.failed).toBe(1);
  });

  it("aborts between requests and during the delay", async () => {
    const ctrl = new AbortController();
    const execute = vi.fn(async () => {
      ctrl.abort();
      return ok();
    });
    const started = Date.now();
    const s = await runCollection(base({ items: items("a", "b"), delayMs: 5000, signal: ctrl.signal, execute }), () => {});
    expect(execute).toHaveBeenCalledTimes(1);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(s.stopped).toBe(true);
  });

  it("waits the delay between requests but not after the last", async () => {
    const execute = vi.fn(async () => ok());
    const started = Date.now();
    await runCollection(base({ items: items("a", "b"), delayMs: 40, execute }), () => {});
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(35);
    expect(elapsed).toBeLessThan(75);
  });
});
