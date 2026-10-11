import { expect, it } from "vitest";
import { applyVarChanges } from "./varChanges";

const v = (key: string, value: string, extra: { enabled?: boolean; secret?: boolean } = {}) => ({ key, value, enabled: true, secret: false, ...extra });

it("returns null when nothing changed", () => {
  expect(applyVarChanges([v("a", "1")], { a: "1" }, { a: "1" })).toBeNull();
});

it("updates values and keeps secret flags", () => {
  expect(applyVarChanges([v("t", "old", { secret: true })], { t: "old" }, { t: "new" })).toEqual([v("t", "new", { secret: true })]);
});

it("appends new keys and re-enables a disabled variable with the same key", () => {
  expect(applyVarChanges([v("d", "x", { enabled: false })], {}, { d: "y", n: "1" })).toEqual([v("d", "y"), v("n", "1")]);
});

it("removes unset keys", () => {
  expect(applyVarChanges([v("a", "1"), v("b", "2")], { a: "1", b: "2" }, { a: "1" })).toEqual([v("a", "1")]);
});
