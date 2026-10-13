import { describe, expect, it } from "vitest";
import { createSerial } from "./serial";

describe("createSerial", () => {
  it("starts a task only after the previous one finished, even if the earlier one is slower", async () => {
    const serial = createSerial();
    const log: string[] = [];
    const slow = serial(async () => {
      log.push("rename:start");
      await new Promise((r) => setTimeout(r, 20));
      log.push("rename:end");
    });
    const fast = serial(async () => {
      log.push("save");
    });
    await Promise.all([slow, fast]);
    expect(log).toEqual(["rename:start", "rename:end", "save"]);
  });

  it("keeps running after a task fails", async () => {
    const serial = createSerial();
    await expect(serial(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(serial(async () => 1)).resolves.toBe(1);
  });
});
