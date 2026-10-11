import { create } from "zustand";
import { historyApi, type HistoryEntry, type HistorySummary } from "../ipc";
import { useSettings } from "./settings";

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
