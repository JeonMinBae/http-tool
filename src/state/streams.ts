import { create } from "zustand";
import { SseParser, type SseEvent } from "../core/sse";
import { httpApi, type StreamEvent } from "../ipc";

export interface StreamState {
  streamId: string;
  status: "open" | "closed" | "error";
  events: SseEvent[];
  error?: string;
}

const MAX_EVENTS = 5000;
const parsers = new Map<string, SseParser>();

interface StreamsState {
  byTab: Record<string, StreamState | undefined>;
  /** Starts tracking a stream for a tab and returns the event handler for the channel. */
  begin(tabId: string, streamId: string): (e: StreamEvent) => void;
  stop(tabId: string): Promise<void>;
  clear(tabId: string): void;
}

export const useStreams = create<StreamsState>((set, get) => {
  const update = (tabId: string, streamId: string, fn: (s: StreamState) => StreamState) => {
    const cur = get().byTab[tabId];
    if (cur?.streamId === streamId) set({ byTab: { ...get().byTab, [tabId]: fn(cur) } });
  };
  return {
    byTab: {},
    begin(tabId, streamId) {
      const prev = get().byTab[tabId];
      if (prev?.status === "open") void httpApi.cancelStream(prev.streamId);
      const parser = new SseParser();
      parsers.set(streamId, parser);
      set({ byTab: { ...get().byTab, [tabId]: { streamId, status: "open", events: [] } } });
      return (e) => {
        if (e.type === "chunk") {
          const events = parser.feed(e.text);
          if (events.length) update(tabId, streamId, (s) => ({ ...s, events: [...s.events, ...events].slice(-MAX_EVENTS) }));
        } else {
          const rest = parser.flush();
          parsers.delete(streamId);
          update(tabId, streamId, (s) => ({
            ...s,
            events: [...s.events, ...rest].slice(-MAX_EVENTS),
            status: e.type === "end" ? "closed" : "error",
            error: e.type === "error" ? e.message : undefined,
          }));
        }
      };
    },
    async stop(tabId) {
      const s = get().byTab[tabId];
      if (!s || s.status !== "open") return;
      await httpApi.cancelStream(s.streamId);
      parsers.delete(s.streamId);
      update(tabId, s.streamId, (x) => ({ ...x, status: "closed" }));
    },
    clear(tabId) {
      const next = { ...get().byTab };
      delete next[tabId];
      set({ byTab: next });
    },
  };
});
