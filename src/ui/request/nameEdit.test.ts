import { describe, expect, it } from "vitest";
import { nextName } from "./nameEdit";

describe("nextName", () => {
  it("returns the trimmed new name", () => expect(nextName("Old", "  New  ")).toBe("New"));
  it("ignores unchanged names", () => expect(nextName("Same", " Same ")).toBeNull());
  it("ignores blank input", () => expect(nextName("Old", "   ")).toBeNull());
});
