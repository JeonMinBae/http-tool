import { create } from "zustand";
import type { HttpResult } from "../ipc";

export type ExecState =
  | { status: "sending"; requestId: string; startedAt: number; unresolved: string[] }
  | { status: "done"; requestId: string; result: HttpResult; unresolved: string[]; receivedAt: number }
  | { status: "error"; requestId: string; error: string; unresolved: string[] };

interface ResponsesState {
  byTab: Record<string, ExecState | undefined>;
  start(tabId: string, requestId: string, unresolved: string[]): void;
  finish(tabId: string, requestId: string, result: HttpResult): void;
  fail(tabId: string, requestId: string, error: string, unresolved?: string[]): void;
  /** Late results for a cancelled request are ignored because the requestId no longer matches. */
  cancel(tabId: string): void;
  set(tabId: string, state: ExecState): void;
}

export const useResponses = create<ResponsesState>((set, get) => {
  const current = (tabId: string, requestId: string) => get().byTab[tabId]?.requestId === requestId;
  const put = (tabId: string, s: ExecState | undefined) => set({ byTab: { ...get().byTab, [tabId]: s } });
  return {
    byTab: {},
    start: (tabId, requestId, unresolved) => put(tabId, { status: "sending", requestId, startedAt: Date.now(), unresolved }),
    finish(tabId, requestId, result) {
      const prev = get().byTab[tabId];
      if (current(tabId, requestId))
        put(tabId, { status: "done", requestId, result, unresolved: prev?.unresolved ?? [], receivedAt: Date.now() });
    },
    fail(tabId, requestId, error, unresolved) {
      const prev = get().byTab[tabId];
      if (current(tabId, requestId) || !prev || prev.status !== "sending")
        put(tabId, { status: "error", requestId, error, unresolved: unresolved ?? prev?.unresolved ?? [] });
    },
    cancel: (tabId) => put(tabId, undefined),
    set: (tabId, state) => put(tabId, state),
  };
});
