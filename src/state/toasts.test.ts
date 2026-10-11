import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_TOASTS, TOAST_MS, toast, useToasts } from "./toasts";

const s = () => useToasts.getState();

beforeEach(() => {
  vi.useFakeTimers();
  useToasts.setState({ toasts: [] });
});
afterEach(() => vi.useRealTimers());

describe("toasts", () => {
  it("keeps at most MAX_TOASTS, dropping the oldest", () => {
    for (let i = 0; i < MAX_TOASTS + 1; i++) toast.success(`t${i}`);
    expect(s().toasts.map((t) => t.message)).toEqual(["t1", "t2", "t3"]);
  });

  it("closes success after 2 s and errors after 5 s", () => {
    toast.success("ok");
    toast.error("Could not save", new Error("disk full"));
    vi.advanceTimersByTime(TOAST_MS.success);
    expect(s().toasts.map((t) => t.kind)).toEqual(["error"]);
    vi.advanceTimersByTime(TOAST_MS.error - TOAST_MS.success);
    expect(s().toasts).toEqual([]);
  });

  it("formats errors with the title as message and the error text as detail", () => {
    toast.error("Could not move", "target exists");
    expect(s().toasts[0]).toMatchObject({ kind: "error", message: "Could not move", detail: "target exists" });
  });

  it("dismiss removes immediately and the later timer is harmless", () => {
    const id = toast.success("x");
    s().dismiss(id);
    expect(s().toasts).toEqual([]);
    vi.advanceTimersByTime(TOAST_MS.success);
    expect(s().toasts).toEqual([]);
  });
});
