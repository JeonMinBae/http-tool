import { create } from "zustand";
import { historyApi, type HistoryEntry, type HistorySummary } from "../ipc";
import type { ExecState } from "./responses";
import { useSettings } from "./settings";

/** Response state for a tab reopened from a history entry (none when the entry has neither result nor error). */
export function historyExecState(entry: HistoryEntry): ExecState | undefined {
  if (entry.result)
    return { status: "done", requestId: entry.id, result: entry.result, unresolved: [], receivedAt: entry.time, ...(entry.truncated ? { truncated: true } : {}) };
  if (entry.error) return { status: "error", requestId: entry.id, error: entry.error, unresolved: [] };
  return undefined;
}

interface HistoryState {
  items: HistorySummary[];
  load(): Promise<void>;
  record(entry: HistoryEntry): Promise<void>;
  clear(): Promise<void>;
}

export const useHistory = create<HistoryState>((set) => ({
  items: [],
  async load() {
    set({ items: await historyApi.list() });
  },
  async record(entry) {
    await historyApi.append(entry, useSettings.getState().settings.historyLimit);
    set({ items: await historyApi.list() });
  },
  async clear() {
    await historyApi.clear();
    set({ items: [] });
  },
}));
