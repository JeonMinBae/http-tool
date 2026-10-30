import { create } from "zustand";
import type { CollectionDoc, FolderDoc, HttpRequestDoc, WebSocketDoc } from "../core/model";
import { isInside, samePath } from "../core/path";

/** Collection runner tab for a collection root or folder (`path`). */
export interface RunnerDoc {
  kind: "runner";
  name: string;
}

export type TabDoc = HttpRequestDoc | WebSocketDoc | FolderDoc | CollectionDoc | RunnerDoc;

export interface Tab<D extends TabDoc = TabDoc> {
  id: string;
  /** Collection root; null for unsaved requests. */
  root: string | null;
  /** Request file, folder directory or collection root; null for unsaved requests. */
  path: string | null;
  draft: D;
  saved: D;
  /** Time of the last explicit save; drives the brief "saved" check in the tab bar. */
  savedAt?: number;
}

export const isDirty = (t: Tab) => JSON.stringify(t.draft) !== JSON.stringify(t.saved);

interface TabsState {
  tabs: Tab[];
  closedTabs: { tab: Tab; index: number }[];
  activeId: string | null;
  open(root: string | null, path: string | null, doc: TabDoc): string;
  activate(id: string): void;
  close(id: string, remember?: boolean): void;
  reopenClosed(): void;
  forgetClosed(root: string): void;
  update<D extends TabDoc>(id: string, fn: (draft: D) => D): void;
  /** `from` is the draft the save started with; if the draft changed since, it is kept (and stays dirty). */
  markSaved(id: string, root: string, path: string, doc?: TabDoc, from?: TabDoc): void;
  /** Re-points tabs after a rename/move of `from` (file or folder) to `to`. */
  renamePath(from: string, to: string): void;
  /** Handles deletion of `path`: clean tabs close, dirty request tabs become unsaved. */
  removePath(path: string): void;
  /** Updates the saved snapshot of a clean tab (e.g. after the file changed via the tree). */
  refreshSaved(path: string, doc: TabDoc): void;
  active(): Tab | undefined;
}

const affected = (p: string | null, target: string) => p !== null && (samePath(p, target) || isInside(p, target));
const replacePrefix = (p: string, from: string, to: string) => (samePath(p, from) ? to : to + p.slice(from.length));

export const useTabs = create<TabsState>((set, get) => ({
  tabs: [],
  closedTabs: [],
  activeId: null,

  open(root, path, doc) {
    const existing = path ? get().tabs.find((t) => t.path && samePath(t.path, path) && t.draft.kind === doc.kind) : undefined;
    if (existing) {
      set({ activeId: existing.id });
      return existing.id;
    }
    const tab: Tab = { id: crypto.randomUUID(), root, path, draft: structuredClone(doc), saved: structuredClone(doc) };
    set({ tabs: [...get().tabs, tab], activeId: tab.id });
    return tab.id;
  },

  activate(id) {
    set({ activeId: id });
  },

  close(id, remember = true) {
    const tabs = get().tabs;
    const i = tabs.findIndex((t) => t.id === id);
    if (i < 0) return;
    const next = tabs.filter((t) => t.id !== id);
    const activeId = get().activeId === id ? (next[Math.min(i, next.length - 1)]?.id ?? null) : get().activeId;
    const closedTabs = remember ? [...get().closedTabs, { tab: structuredClone(tabs[i]), index: i }].slice(-20) : get().closedTabs;
    set({ tabs: next, activeId, closedTabs });
  },

  reopenClosed() {
    const closedTabs = [...get().closedTabs];
    const entry = closedTabs.pop();
    if (!entry) return;
    const existing = entry.tab.path ? get().tabs.find((t) => t.path && samePath(t.path, entry.tab.path!) && t.draft.kind === entry.tab.draft.kind) : undefined;
    if (existing) {
      set({ closedTabs, activeId: existing.id });
      return;
    }
    // Execution state belongs to the old ID; reopening does not restart a request or connection.
    const tab = { ...entry.tab, id: crypto.randomUUID() };
    const tabs = [...get().tabs];
    tabs.splice(Math.min(entry.index, tabs.length), 0, tab);
    set({ tabs, closedTabs, activeId: tab.id });
  },

  forgetClosed(root) {
    set({ closedTabs: get().closedTabs.filter(({ tab }) => !tab.root || !samePath(tab.root, root)) });
  },

  update(id, fn) {
    set({ tabs: get().tabs.map((t) => (t.id === id ? { ...t, draft: fn(t.draft as never) } : t)) });
  },

  markSaved(id, root, path, doc, from) {
    set({
      tabs: get().tabs.map((t) => {
        if (t.id !== id) return t;
        const saved = structuredClone(doc ?? t.draft);
        const editedSince = from !== undefined && t.draft !== from;
        return { ...t, root, path, draft: doc && !editedSince ? structuredClone(doc) : t.draft, saved, savedAt: Date.now() };
      }),
    });
  },

  renamePath(from, to) {
    set({
      tabs: get().tabs.map((t) => (t.path && affected(t.path, from) ? { ...t, path: replacePrefix(t.path, from, to) } : t)),
      closedTabs: get().closedTabs.map((entry) => entry.tab.path && affected(entry.tab.path, from)
        ? { ...entry, tab: { ...entry.tab, path: replacePrefix(entry.tab.path, from, to) } } : entry),
    });
  },

  removePath(path) {
    const tabs: Tab[] = [];
    for (const t of get().tabs) {
      if (!affected(t.path, path)) tabs.push(t);
      else if (t.draft.kind === "http" && isDirty(t)) tabs.push({ ...t, root: null, path: null });
    }
    const activeId = tabs.some((t) => t.id === get().activeId) ? get().activeId : (tabs[tabs.length - 1]?.id ?? null);
    set({ tabs, activeId, closedTabs: get().closedTabs.filter(({ tab }) => !affected(tab.path, path)) });
  },

  refreshSaved(path, doc) {
    const refresh = (t: Tab): Tab => t.path && samePath(t.path, path) && t.draft.kind === doc.kind
      ? isDirty(t)
        ? { ...t, saved: structuredClone(doc), draft: { ...t.draft, name: doc.name } }
        : { ...t, saved: structuredClone(doc), draft: structuredClone(doc) }
      : t;
    set({
      tabs: get().tabs.map(refresh),
      closedTabs: get().closedTabs.map((entry) => ({ ...entry, tab: refresh(entry.tab) })),
    });
  },

  active() {
    return get().tabs.find((t) => t.id === get().activeId);
  },
}));
