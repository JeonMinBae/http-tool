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
}

export const isDirty = (t: Tab) => JSON.stringify(t.draft) !== JSON.stringify(t.saved);

interface TabsState {
  tabs: Tab[];
  activeId: string | null;
  open(root: string | null, path: string | null, doc: TabDoc): string;
  activate(id: string): void;
  close(id: string): void;
  update<D extends TabDoc>(id: string, fn: (draft: D) => D): void;
  markSaved(id: string, root: string, path: string, doc?: TabDoc): void;
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

  close(id) {
    const tabs = get().tabs;
    const i = tabs.findIndex((t) => t.id === id);
    if (i < 0) return;
    const next = tabs.filter((t) => t.id !== id);
    const activeId = get().activeId === id ? (next[Math.min(i, next.length - 1)]?.id ?? null) : get().activeId;
    set({ tabs: next, activeId });
  },

  update(id, fn) {
    set({ tabs: get().tabs.map((t) => (t.id === id ? { ...t, draft: fn(t.draft as never) } : t)) });
  },

  markSaved(id, root, path, doc) {
    set({
      tabs: get().tabs.map((t) => {
        if (t.id !== id) return t;
        const saved = structuredClone(doc ?? t.draft);
        return { ...t, root, path, draft: doc ? structuredClone(doc) : t.draft, saved };
      }),
    });
  },

  renamePath(from, to) {
    set({
      tabs: get().tabs.map((t) => (t.path && affected(t.path, from) ? { ...t, path: replacePrefix(t.path, from, to) } : t)),
    });
  },

  removePath(path) {
    const tabs: Tab[] = [];
    for (const t of get().tabs) {
      if (!affected(t.path, path)) tabs.push(t);
      else if (t.draft.kind === "http" && isDirty(t)) tabs.push({ ...t, root: null, path: null });
    }
    const activeId = tabs.some((t) => t.id === get().activeId) ? get().activeId : (tabs[tabs.length - 1]?.id ?? null);
    set({ tabs, activeId });
  },

  refreshSaved(path, doc) {
    set({
      tabs: get().tabs.map((t) =>
        t.path && samePath(t.path, path) && t.draft.kind === doc.kind
          ? isDirty(t)
            ? { ...t, saved: structuredClone(doc), draft: { ...t.draft, name: doc.name } }
            : { ...t, saved: structuredClone(doc), draft: structuredClone(doc) }
          : t,
      ),
    });
  },

  active() {
    return get().tabs.find((t) => t.id === get().activeId);
  },
}));
