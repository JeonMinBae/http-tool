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

const list = (key: string, items: { key: string; value: string; enabled: boolean }[]) => ({ key, value: "", enabled: true, secret: false, type: "list" as const, items });
const it_ = (key: string, value: string, enabled = true) => ({ key, value, enabled });

it("updates, appends and removes list items without touching a plain variable of the same name", () => {
  const vars = [v("tool", "plain"), list("tool", [it_("A", "1"), it_("B", "2")])];
  const before = { tool: "plain", "tool:": "", "tool:A": "1", "tool:B": "2" };
  const after = { tool: "plain", "tool:": "", "tool:A": "x", "tool:C": "3" };
  expect(applyVarChanges(vars, before, after)).toEqual([v("tool", "plain"), list("tool", [it_("A", "x"), it_("C", "3")])]);
});

it("creates a list when a script sets an item of an unknown list", () => {
  expect(applyVarChanges([], {}, { "n:": "", "n:k": "v" })).toEqual([list("n", [it_("k", "v")])]);
});

it("deletes the list when its marker disappears", () => {
  expect(applyVarChanges([list("n", [it_("k", "v")])], { "n:": "", "n:k": "v" }, {})).toEqual([]);
});

it("returns null when list items are unchanged", () => {
  const rec = { "n:": "", "n:k": "v" };
  expect(applyVarChanges([list("n", [it_("k", "v")])], rec, { ...rec })).toBeNull();
});
