import { beforeEach, describe, expect, it } from "vitest";
import { emptyFolder, emptyRequest, type HttpRequestDoc } from "../core/model";
import { isDirty, useTabs } from "./tabs";

const s = () => useTabs.getState();

beforeEach(() => useTabs.setState({ tabs: [], closedTabs: [], activeId: null }));

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

  it("keeps edits made while saving and leaves the tab dirty", () => {
    const id = s().open("/c", "/c/a.yaml", emptyRequest("A"));
    const started = s().tabs[0].draft;
    s().update<HttpRequestDoc>(id, (d) => ({ ...d, url: "http://edited" }));
    s().markSaved(id, "/c", "/c/a.yaml", { ...emptyRequest("A"), url: "http://saved" }, started);
    expect((s().tabs[0].draft as HttpRequestDoc).url).toBe("http://edited");
    expect(isDirty(s().tabs[0])).toBe(true);
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

  it("reopens closed tabs in reverse order at their original position with unsaved edits", () => {
    s().open(null, null, emptyRequest("A"));
    const b = s().open(null, null, emptyRequest("B"));
    const c = s().open(null, null, emptyRequest("C"));
    s().update<HttpRequestDoc>(b, (d) => ({ ...d, url: "https://edited" }));
    s().close(b);
    s().close(c);
    s().reopenClosed();
    expect(s().active()?.draft.name).toBe("C");
    s().reopenClosed();
    expect(s().tabs.map((t) => t.draft.name)).toEqual(["A", "B", "C"]);
    expect(s().active()?.draft).toMatchObject({ url: "https://edited" });
    expect(s().activeId).not.toBe(b);
    expect(isDirty(s().active()!)).toBe(true);
    s().reopenClosed();
    expect(s().tabs).toHaveLength(3);
  });

  it("activates an already reopened file without overwriting newer edits", () => {
    const id = s().open("/c", "/c/a.yaml", emptyRequest("A"));
    s().close(id);
    const newer = s().open("/c", "/c/a.yaml", emptyRequest("Newer"));
    s().reopenClosed();
    expect(s().tabs).toHaveLength(1);
    expect(s().activeId).toBe(newer);
    expect(s().active()?.draft.name).toBe("Newer");
  });

  it("bounds recovery history and excludes collection-close operations", () => {
    for (let i = 0; i < 21; i++) s().close(s().open(null, null, emptyRequest(String(i))));
    expect(s().closedTabs).toHaveLength(20);
    const id = s().open("/c", "/c/a.yaml", emptyRequest("A"));
    s().close(id, false);
    expect(s().closedTabs).toHaveLength(20);
  });

  it("follows renamed paths and forgets deleted files and closed collections", () => {
    const id = s().open("/c", "/c/f/a.yaml", emptyRequest("A"));
    s().close(id);
    s().renamePath("/c/f", "/c/new");
    expect(s().closedTabs[0].tab.path).toBe("/c/new/a.yaml");
    s().refreshSaved("/c/new/a.yaml", emptyRequest("Renamed"));
    expect(s().closedTabs[0].tab.draft.name).toBe("Renamed");
    s().removePath("/c/new");
    expect(s().closedTabs).toEqual([]);
    s().close(s().open("/c", "/c/b.yaml", emptyRequest("B")));
    s().close(s().open("/other", "/other/a.yaml", emptyRequest("Other")));
    s().forgetClosed("/c");
    expect(s().closedTabs.map(({ tab }) => tab.root)).toEqual(["/other"]);
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
