import { create } from "zustand";
import type { ConsoleDetail } from "../core/consoleDetail";
import type { LogEntry } from "../script/protocol";

export interface ConsoleEntry {
  id: string;
  time: number;
  method: string;
  url: string;
  status?: number;
  elapsedMs?: number;
  logs: (LogEntry & { source: string })[];
  errors: string[];
  detail?: ConsoleDetail;
}

interface ConsoleState {
  entries: ConsoleEntry[];
  open: boolean;
  add(entry: ConsoleEntry): void;
  clear(): void;
  toggle(open?: boolean): void;
}

const MAX_ENTRIES = 200;

export const useConsole = create<ConsoleState>((set, get) => ({
  entries: [],
  open: false,
  add: (entry) => set({ entries: [...get().entries, entry].slice(-MAX_ENTRIES), open: get().open || entry.errors.length > 0 }),
  clear: () => set({ entries: [] }),
  toggle: (open) => set({ open: open ?? !get().open }),
}));
