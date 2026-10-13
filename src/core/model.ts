export interface KeyValue {
  key: string;
  value: string;
  enabled: boolean;
}

/** form-data field; when kind is 'file', value holds the file path. */
export interface FormField extends KeyValue {
  kind: "text" | "file";
}

export type RawLanguage = "json" | "text" | "xml" | "html";

export type Body =
  | { type: "none" }
  | { type: "raw"; language: RawLanguage; content: string }
  | { type: "urlencoded"; fields: KeyValue[] }
  | { type: "form-data"; fields: FormField[] }
  | { type: "binary"; filePath: string }
  | { type: "graphql"; query: string; variables: string };

export type BodyType = Body["type"];

export type Auth =
  | { type: "inherit" }
  | { type: "none" }
  | { type: "bearer"; token: string }
  | { type: "basic"; username: string; password: string }
  | { type: "apikey"; key: string; value: string; in: "header" | "query" }
  | OAuth2Auth;

export interface OAuth2Auth {
  type: "oauth2";
  grant: "client_credentials" | "authorization_code";
  authUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope: string;
  usePkce: boolean;
  /** Empty uses http://127.0.0.1:<random port>/callback. */
  redirectUri: string;
  clientAuth: "header" | "body";
  tokenPrefix: string;
}

export type AuthType = Auth["type"];

export interface Scripts {
  pre: string;
  post: string;
}

export interface RequestSettings {
  timeoutMs?: number;
  followRedirects?: boolean;
  verifySsl?: boolean;
}

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface PathParam {
  key: string;
  value: string;
  description: string;
}

export interface HttpRequestDoc {
  kind: "http";
  name: string;
  seq: number;
  method: HttpMethod;
  url: string;
  params: KeyValue[];
  pathParams: PathParam[];
  headers: KeyValue[];
  cookies: KeyValue[];
  body: Body;
  auth: Auth;
  scripts: Scripts;
  settings: RequestSettings;
}

export interface SavedMessage {
  name: string;
  /** binary messages hold base64 content */
  type: "text" | "binary";
  content: string;
}

export interface WebSocketDoc {
  kind: "websocket";
  name: string;
  seq: number;
  url: string;
  headers: KeyValue[];
  subprotocols: string[];
  savedMessages: SavedMessage[];
}

export function emptyWebSocket(name: string, seq = 0): WebSocketDoc {
  return { kind: "websocket", name, seq, url: "", headers: [], subprotocols: [], savedMessages: [] };
}

export interface FolderDoc {
  kind: "folder";
  name: string;
  seq: number;
  auth: Auth;
  scripts: Scripts;
}

export interface Variable {
  key: string;
  value: string;
  enabled: boolean;
  secret: boolean;
}

export interface CollectionDoc {
  kind: "collection";
  name: string;
  auth: Auth;
  scripts: Scripts;
  variables: Variable[];
}

export interface Environment {
  id: string;
  name: string;
  variables: Variable[];
}

export interface GlobalSettings {
  timeoutMs: number;
  followRedirects: boolean;
  verifySsl: boolean;
  /** url: http://, https://, socks5://, socks5h://; bypass: NO_PROXY style list */
  proxy: { mode: "system" | "none" | "manual"; url: string; bypass: string };
  historyLimit: number;
}

export const DEFAULT_SETTINGS: GlobalSettings = {
  timeoutMs: 30000,
  followRedirects: true,
  verifySsl: true,
  proxy: { mode: "system", url: "", bypass: "" },
  historyLimit: 500,
};

export const emptyScripts = (): Scripts => ({ pre: "", post: "" });

export function emptyRequest(name: string, seq = 0): HttpRequestDoc {
  return {
    kind: "http",
    name,
    seq,
    method: "GET",
    url: "",
    params: [],
    pathParams: [],
    headers: [],
    cookies: [],
    body: { type: "none" },
    auth: { type: "inherit" },
    scripts: emptyScripts(),
    settings: {},
  };
}

export function emptyFolder(name: string, seq = 0): FolderDoc {
  return { kind: "folder", name, seq, auth: { type: "inherit" }, scripts: emptyScripts() };
}

export function emptyCollection(name: string): CollectionDoc {
  return { kind: "collection", name, auth: { type: "none" }, scripts: emptyScripts(), variables: [] };
}
