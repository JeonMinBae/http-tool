import { Channel, invoke } from "@tauri-apps/api/core";

export interface FsEntry {
  name: string;
  path: string;
  isDir: boolean;
  content: string | null;
  children: FsEntry[];
}

/** File system operations on collection directories (paths must be inside a registered root). */
export interface FsApi {
  register(root: string): Promise<string>;
  unregister(root: string): Promise<void>;
  readTree(root: string): Promise<FsEntry>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  createDir(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  copy(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
}

export const fsApi: FsApi = {
  register: (root) => invoke("collection_register", { root }),
  unregister: (root) => invoke("collection_unregister", { root }),
  readTree: (root) => invoke("fs_read_tree", { root }),
  readFile: (path) => invoke("fs_read_file", { path }),
  writeFile: (path, content) => invoke("fs_write_file", { path, content }),
  createDir: (path) => invoke("fs_create_dir", { path }),
  rename: (from, to) => invoke("fs_rename", { from, to }),
  copy: (from, to) => invoke("fs_copy", { from, to }),
  remove: (path) => invoke("fs_delete", { path }),
};

/** JSON documents stored in the app data folder (never inside collections). */
export type AppDataName = "globals" | "environments" | "settings" | "workspace" | "oauth-tokens" | `secrets/${string}`;

export interface AppDataApi {
  read<T>(name: AppDataName): Promise<T | null>;
  write(name: AppDataName, value: unknown): Promise<void>;
}

export const appDataApi: AppDataApi = {
  read: (name) => invoke("appdata_read", { name }),
  write: (name, value) => invoke("appdata_write", { name, value }),
};

export type PreparedBody =
  | { type: "none" }
  | { type: "text"; content: string }
  | { type: "url-encoded"; fields: [string, string][] }
  | { type: "form-data"; fields: { name: string; kind: "text" | "file"; value: string }[] }
  | { type: "binary"; path: string };

export interface ProxyConfig {
  mode: "system" | "none" | "manual";
  url: string;
  bypass: string;
}

export interface PreparedRequest {
  method: string;
  url: string;
  headers: [string, string][];
  body: PreparedBody;
  timeoutMs: number;
  followRedirects: boolean;
  verifySsl: boolean;
  proxy: ProxyConfig;
}

export interface SentRequest {
  method: string;
  url: string;
  headers: [string, string][];
  bodyPreview: string | null;
}

export interface RedirectHop {
  url: string;
  status: number;
  method: string;
}

export interface HttpResult {
  status: number;
  statusText: string;
  httpVersion: string;
  headers: [string, string][];
  bodyBase64: string;
  isText: boolean;
  size: number;
  elapsedMs: number;
  sent: SentRequest;
  redirects: RedirectHop[];
  /** Body is delivered through the stream channel (text/event-stream). */
  streaming: boolean;
}

export type StreamEvent = { type: "chunk"; text: string } | { type: "end" } | { type: "error"; message: string };

export interface StreamOptions {
  id: string;
  onEvent: (e: StreamEvent) => void;
}

export interface CookieInfo {
  domain: string;
  hostOnly: boolean;
  path: string;
  name: string;
  value: string;
  /** epoch ms; null for session cookies */
  expires: number | null;
  httpOnly: boolean;
  secure: boolean;
}

export const httpApi = {
  /** With `stream`, an event-stream response returns immediately and its body arrives via `onEvent`. */
  send(request: PreparedRequest, stream?: StreamOptions) {
    const onEvent = new Channel<StreamEvent>();
    if (stream) onEvent.onmessage = stream.onEvent;
    return invoke<HttpResult>("http_send", { request, streamId: stream?.id ?? null, onEvent });
  },
  cancelStream: (streamId: string) => invoke<boolean>("stream_cancel", { streamId }),
};

export const cookieApi = {
  list: () => invoke<CookieInfo[]>("cookie_list"),
  upsert: (cookie: CookieInfo) => invoke<void>("cookie_upsert", { cookie }),
  remove: (domain: string, path: string, name: string) => invoke<void>("cookie_delete", { domain, path, name }),
  clear: (domain?: string) => invoke<void>("cookie_clear", { domain: domain ?? null }),
};

export const fileApi = {
  saveBase64: (path: string, data: string) => invoke<void>("file_save_base64", { path, data }),
};

export interface HistorySummary {
  id: string;
  time: number;
  method: string;
  url: string;
  status: number | null;
  elapsedMs: number | null;
  error: string | null;
}

export interface HistoryEntry {
  id: string;
  time: number;
  method: string;
  /** Resolved URL that was sent. */
  url: string;
  root: string | null;
  path: string | null;
  /** Request definition before variable substitution (secrets stay as {{vars}}). */
  request: import("./core/model").HttpRequestDoc;
  result?: HttpResult;
  error?: string;
  truncated?: boolean;
}

export const historyApi = {
  append: (entry: HistoryEntry, limit: number) => invoke<void>("history_append", { entry, limit }),
  list: () => invoke<HistorySummary[]>("history_list"),
  get: (id: string) => invoke<HistoryEntry>("history_get", { id }),
  clear: () => invoke<void>("history_clear"),
};

export const oauthApi = {
  listen: (redirectUri: string) => invoke<{ redirectUri: string; port: number }>("oauth_listen", { redirectUri }),
  wait: (port: number) => invoke<string>("oauth_wait", { port }),
};

export type WsEvent =
  | { type: "open"; protocol: string | null }
  | { type: "message"; direction: "in" | "out"; binary: boolean; data: string; atMs: number }
  | { type: "close"; code: number | null; reason: string }
  | { type: "error"; message: string };

export interface WsConnectParams {
  url: string;
  headers: [string, string][];
  subprotocols: string[];
  verifySsl: boolean;
}

export const wsApi = {
  connect(id: string, params: WsConnectParams, onMessage: (e: WsEvent) => void) {
    const onEvent = new Channel<WsEvent>();
    onEvent.onmessage = onMessage;
    return invoke<void>("ws_connect", { id, params, onEvent });
  },
  send: (id: string, binary: boolean, data: string) => invoke<void>("ws_send", { id, binary, data }),
  close: (id: string) => invoke<void>("ws_close", { id }),
};
