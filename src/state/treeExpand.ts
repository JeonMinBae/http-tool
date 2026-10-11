import { create } from "zustand";

/** Expanded collection/folder paths in the sidebar tree. */
interface ExpandState {
  expanded: Set<string>;
  toggle(path: string): void;
  expand(...paths: string[]): void;
}

export const useExpanded = create<ExpandState>((set, get) => ({
  expanded: new Set(),
  toggle: (p) => {
    const next = new Set(get().expanded);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    set({ expanded: next });
  },
  expand: (...paths) => {
    if (paths.every((p) => get().expanded.has(p))) return;
    set({ expanded: new Set([...get().expanded, ...paths]) });
  },
}));
