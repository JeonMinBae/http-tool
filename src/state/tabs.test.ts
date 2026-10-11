import { beforeEach, describe, expect, it } from "vitest";
import { emptyFolder, emptyRequest, type HttpRequestDoc } from "../core/model";
import { isDirty, useTabs } from "./tabs";

const s = () => useTabs.getState();

beforeEach(() => useTabs.setState({ tabs: [], activeId: null }));

describe("tabs store", () => {
  it("re-activates an already open path instead of duplicating", () => {
    const a = s().open("/c", "/c/a.yaml", emptyRequest("A"));
    s().open("/c", "/c/b.yaml", emptyRequest("B"));
    expect(s().open("/c", "/c/a.yaml", emptyRequest("A"))).toBe(a);
    expect(s().tabs).toHaveLength(2);
    expect(s().activeId).toBe(a);
  });

  it("tracks dirty state and clears it on save", () => {
    const id = s().open("/c", "/c/a.yaml", emptyRequest("A"));
    s().update<HttpRequestDoc>(id, (d) => ({ ...d, url: "http://x" }));
    expect(isDirty(s().tabs[0])).toBe(true);
    s().markSaved(id, "/c", "/c/a.yaml");
    expect(isDirty(s().tabs[0])).toBe(false);
  });

  it("records savedAt on save", () => {
    const id = s().open("/c", "/c/a.yaml", emptyRequest("A"));
    expect(s().tabs[0].savedAt).toBeUndefined();
    s().markSaved(id, "/c", "/c/a.yaml");
    expect(s().tabs[0].savedAt).toEqual(expect.any(Number));
  });

  it("closing the active tab activates its neighbour", () => {
    const a = s().open(null, null, emptyRequest("A"));
    const b = s().open(null, null, emptyRequest("B"));
    s().close(b);
    expect(s().activeId).toBe(a);
  });

  it("re-points tabs inside a renamed folder", () => {
    s().open("/c", "/c/users/a.yaml", emptyRequest("A"));
    s().open("/c", "/c/users", emptyFolder("users"));
    s().open("/c", "/c/usersX/b.yaml", emptyRequest("B"));
    s().renamePath("/c/users", "/c/people");
    expect(s().tabs.map((t) => t.path)).toEqual(["/c/people/a.yaml", "/c/people", "/c/usersX/b.yaml"]);
  });

  it("on delete closes clean tabs and detaches dirty request tabs", () => {
    s().open("/c", "/c/f/a.yaml", emptyRequest("A"));
    const b = s().open("/c", "/c/f/b.yaml", emptyRequest("B"));
    s().update<HttpRequestDoc>(b, (d) => ({ ...d, url: "x" }));
    s().removePath("/c/f");
    expect(s().tabs).toHaveLength(1);
    expect(s().tabs[0]).toMatchObject({ id: b, path: null, root: null });
  });
});
