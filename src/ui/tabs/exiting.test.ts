import { describe, expect, it } from "vitest";
import { mergeExiting, type Exiting } from "./exiting";

const live = (...ids: string[]): Exiting<string>[] => ids.map((item) => ({ item, exiting: false }));
const key = (s: string) => s;
const show = (l: Exiting<string>[]) => l.map((e) => (e.exiting ? `${e.item}*` : e.item));

describe("mergeExiting", () => {
  it("keeps a removed item at its previous position", () => {
    expect(show(mergeExiting(live("A", "B", "C"), ["A", "C"], key))).toEqual(["A", "B*", "C"]);
  });

  it("keeps every item when all are removed", () => {
    expect(show(mergeExiting(live("A", "B"), [], key))).toEqual(["A*", "B*"]);
  });

  it("keeps items that were already exiting and appends new ones", () => {
    const prev: Exiting<string>[] = [{ item: "A", exiting: false }, { item: "B", exiting: true }];
    expect(show(mergeExiting(prev, ["A", "D"], key))).toEqual(["A", "B*", "D"]);
  });

  it("uses the latest value for live items", () => {
    const out = mergeExiting([{ item: { id: "a", n: 1 }, exiting: false }], [{ id: "a", n: 2 }], (t) => t.id);
    expect(out).toEqual([{ item: { id: "a", n: 2 }, exiting: false }]);
  });
});
