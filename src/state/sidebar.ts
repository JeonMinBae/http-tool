import { create } from "zustand";

export type SidebarSection = "collections" | "history";
export type SearchMode = "requests" | "variables";

interface SidebarState {
  section: SidebarSection;
  query: string;
  mode: SearchMode;
  /** Set by ⌘K; the search input takes focus once mounted, so it also works when coming from the History tab. */
  focusPending: boolean;
  setSection(section: SidebarSection): void;
  setQuery(query: string): void;
  setMode(mode: SearchMode): void;
  focusSearch(): void;
  consumeFocus(): void;
}

export const useSidebar = create<SidebarState>((set) => ({
  section: "collections",
  query: "",
  mode: "requests",
  focusPending: false,
  setSection: (section) => set({ section }),
  setQuery: (query) => set({ query }),
  setMode: (mode) => set({ mode }),
  focusSearch: () => set({ section: "collections", focusPending: true }),
  consumeFocus: () => set({ focusPending: false }),
}));
