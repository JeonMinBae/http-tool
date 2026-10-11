import { create } from "zustand";
import { wsApi, type WsConnectParams, type WsEvent } from "../ipc";

export interface WsLogEntry {
  at: number;
  kind: "in" | "out" | "open" | "close" | "error";
  binary?: boolean;
  data: string;
}

export interface WsConnection {
  id: string;
  status: "connecting" | "open" | "closed";
  log: WsLogEntry[];
}

const MAX_LOG = 5000;

interface WebSocketsState {
  byTab: Record<string, WsConnection | undefined>;
  connect(tabId: string, params: WsConnectParams): Promise<void>;
  send(tabId: string, binary: boolean, data: string): Promise<void>;
  disconnect(tabId: string): Promise<void>;
  clearLog(tabId: string): void;
}

export const useWebSockets = create<WebSocketsState>((set, get) => {
  const update = (tabId: string, id: string, fn: (c: WsConnection) => WsConnection) => {
    const c = get().byTab[tabId];
    if (c?.id === id) set({ byTab: { ...get().byTab, [tabId]: fn(c) } });
  };
  const append = (tabId: string, id: string, entry: WsLogEntry, status?: WsConnection["status"]) =>
    update(tabId, id, (c) => ({ ...c, status: status ?? c.status, log: [...c.log, entry].slice(-MAX_LOG) }));

  return {
    byTab: {},
    async connect(tabId, params) {
      await get().disconnect(tabId);
      const id = crypto.randomUUID();
      const previous = get().byTab[tabId]?.log ?? [];
      set({ byTab: { ...get().byTab, [tabId]: { id, status: "connecting", log: previous } } });
      const onEvent = (e: WsEvent) => {
        if (e.type === "open") append(tabId, id, { at: Date.now(), kind: "open", data: `Connected to ${params.url}${e.protocol ? ` (protocol: ${e.protocol})` : ""}` }, "open");
        else if (e.type === "message") append(tabId, id, { at: e.atMs, kind: e.direction, binary: e.binary, data: e.data });
        else if (e.type === "close") append(tabId, id, { at: Date.now(), kind: "close", data: `Disconnected${e.code !== null ? ` (${e.code})` : ""}${e.reason ? `: ${e.reason}` : ""}` }, "closed");
        else append(tabId, id, { at: Date.now(), kind: "error", data: e.message }, "closed");
      };
      try {
        await wsApi.connect(id, params, onEvent);
      } catch (e) {
        append(tabId, id, { at: Date.now(), kind: "error", data: String(e) }, "closed");
      }
    },
    async send(tabId, binary, data) {
      const c = get().byTab[tabId];
      if (!c || c.status !== "open") return;
      try {
        await wsApi.send(c.id, binary, data);
      } catch (e) {
        append(tabId, c.id, { at: Date.now(), kind: "error", data: String(e) });
      }
    },
    async disconnect(tabId) {
      const c = get().byTab[tabId];
      if (c && c.status !== "closed") await wsApi.close(c.id);
    },
    clearLog(tabId) {
      const c = get().byTab[tabId];
      if (c) set({ byTab: { ...get().byTab, [tabId]: { ...c, log: [] } } });
    },
  };
});
