import { parse, stringify } from "yaml";
import {
  HTTP_METHODS,
  type Auth,
  type Body,
  type CollectionDoc,
  type FolderDoc,
  type FormField,
  type HttpMethod,
  type HttpRequestDoc,
  isListVar,
  type KeyValue,
  type PathParam,
  type RawLanguage,
  type RequestSettings,
  type Scripts,
  type Variable,
  type WebSocketDoc,
} from "./model";
import { visiblePathParams } from "./pathParams";

export type Obj = Record<string, unknown>;

const STRINGIFY_OPTIONS = { blockQuote: "literal", lineWidth: 0 } as const;

export const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
export const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : d);
const bool = (v: unknown, d: boolean): boolean => (typeof v === "boolean" ? v : d);
const num = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function load(text: string, kind: string): Obj {
  const data: unknown = parse(text);
  if (!isObj(data)) throw new Error(`expected a ${kind} document`);
  if (data.kind !== kind) throw new Error(`expected kind "${kind}" but got "${String(data.kind)}"`);
  return data;
}

function keyValue(v: unknown): KeyValue {
  const o = isObj(v) ? v : {};
  return { key: str(o.key), value: str(o.value), enabled: bool(o.enabled, true) };
}

function formField(v: unknown): FormField {
  const o = isObj(v) ? v : {};
  return { ...keyValue(o), kind: o.kind === "file" ? "file" : "text" };
}

function body(v: unknown): Body {
  const o = isObj(v) ? v : {};
  switch (o.type) {
    case "raw": {
      const language = (["json", "text", "xml", "html"] as const).includes(o.language as RawLanguage)
        ? (o.language as RawLanguage)
        : "text";
      return { type: "raw", language, content: str(o.content) };
    }
    case "urlencoded":
      return { type: "urlencoded", fields: arr(o.fields).map(keyValue) };
    case "form-data":
      return { type: "form-data", fields: arr(o.fields).map(formField) };
    case "binary":
      return { type: "binary", filePath: str(o.filePath) };
    case "graphql":
      return { type: "graphql", query: str(o.query), variables: str(o.variables) };
    default:
      return { type: "none" };
  }
}

function auth(v: unknown, fallback: Auth): Auth {
  const o = isObj(v) ? v : {};
  switch (o.type) {
    case "inherit":
      return { type: "inherit" };
    case "none":
      return { type: "none" };
    case "bearer":
      return { type: "bearer", token: str(o.token) };
    case "basic":
      return { type: "basic", username: str(o.username), password: str(o.password) };
    case "apikey":
      return { type: "apikey", key: str(o.key), value: str(o.value), in: o.in === "query" ? "query" : "header" };
    case "oauth2":
      return {
        type: "oauth2",
        grant: o.grant === "authorization_code" ? "authorization_code" : "client_credentials",
        authUrl: str(o.authUrl),
        tokenUrl: str(o.tokenUrl),
        clientId: str(o.clientId),
        clientSecret: str(o.clientSecret),
        scope: str(o.scope),
        usePkce: bool(o.usePkce, true),
        redirectUri: str(o.redirectUri),
        clientAuth: o.clientAuth === "body" ? "body" : "header",
        tokenPrefix: str(o.tokenPrefix, "Bearer"),
      };
    default:
      return fallback;
  }
}

function scripts(v: unknown): Scripts {
  const o = isObj(v) ? v : {};
  return { pre: str(o.pre), post: str(o.post) };
}

function settings(v: unknown): RequestSettings {
  const o = isObj(v) ? v : {};
  const s: RequestSettings = {};
  if (typeof o.timeoutMs === "number") s.timeoutMs = o.timeoutMs;
  if (typeof o.followRedirects === "boolean") s.followRedirects = o.followRedirects;
  if (typeof o.verifySsl === "boolean") s.verifySsl = o.verifySsl;
  return s;
}

function method(v: unknown): HttpMethod {
  const m = str(v, "GET").toUpperCase();
  return (HTTP_METHODS as readonly string[]).includes(m) ? (m as HttpMethod) : "GET";
}

export function variable(v: unknown): Variable {
  const o = isObj(v) ? v : {};
  const base = { key: str(o.key), enabled: bool(o.enabled, true), secret: bool(o.secret, false) };
  return o.type === "list" ? { ...base, value: "", type: "list", items: arr(o.items).map(keyValue) } : { ...base, value: str(o.value) };
}

/** On-disk shape: text variables keep the old fields; lists drop the unused value. */
export const storedVariable = (v: Variable) =>
  isListVar(v)
    ? { key: v.key, type: "list", enabled: v.enabled, secret: v.secret, items: v.items }
    : { key: v.key, value: v.value, enabled: v.enabled, secret: v.secret };

function pathParam(v: unknown): PathParam {
  const o = isObj(v) ? v : {};
  return { key: str(o.key), value: str(o.value), description: str(o.description) };
}

/** Tolerant conversion of an already-parsed object (kind is not checked). */
export function toRequest(v: unknown): HttpRequestDoc {
  const o = isObj(v) ? v : {};
  return {
    kind: "http",
    name: str(o.name, "Untitled"),
    seq: num(o.seq, 0),
    method: method(o.method),
    url: str(o.url),
    params: arr(o.params).map(keyValue),
    pathParams: arr(o.pathParams).map(pathParam),
    headers: arr(o.headers).map(keyValue),
    cookies: arr(o.cookies).map(keyValue),
    body: body(o.body),
    auth: auth(o.auth, { type: "inherit" }),
    scripts: scripts(o.scripts),
    settings: settings(o.settings),
  };
}

export const parseRequest = (text: string): HttpRequestDoc => toRequest(load(text, "http"));

export function toFolder(v: unknown): FolderDoc {
  const o = isObj(v) ? v : {};
  return {
    kind: "folder",
    name: str(o.name, "Folder"),
    seq: num(o.seq, 0),
    auth: auth(o.auth, { type: "inherit" }),
    scripts: scripts(o.scripts),
  };
}

export const parseFolder = (text: string): FolderDoc => toFolder(load(text, "folder"));

export function toCollection(v: unknown): CollectionDoc {
  const o = isObj(v) ? v : {};
  return {
    kind: "collection",
    name: str(o.name, "Collection"),
    auth: auth(o.auth, { type: "none" }),
    scripts: scripts(o.scripts),
    variables: arr(o.variables).map(variable),
  };
}

export const parseCollection = (text: string): CollectionDoc => toCollection(load(text, "collection"));

export function toWebSocket(v: unknown): WebSocketDoc {
  const o = isObj(v) ? v : {};
  return {
    kind: "websocket",
    name: str(o.name, "WebSocket"),
    seq: num(o.seq, 0),
    url: str(o.url),
    headers: arr(o.headers).map(keyValue),
    subprotocols: arr(o.subprotocols).map((p) => str(p)).filter(Boolean),
    savedMessages: arr(o.savedMessages).map((m) => {
      const x = isObj(m) ? m : {};
      return { name: str(x.name, "Message"), type: x.type === "binary" ? ("binary" as const) : ("text" as const), content: str(x.content) };
    }),
  };
}

export const parseWebSocket = (text: string): WebSocketDoc => toWebSocket(load(text, "websocket"));

/** Kind of a request file without fully parsing it. */
export function fileKind(text: string): string | undefined {
  const data: unknown = parse(text);
  return isObj(data) && typeof data.kind === "string" ? data.kind : undefined;
}

/** Rows remembered for names removed from the URL are not saved. */
export const serializeRequest = (doc: HttpRequestDoc): string =>
  stringify({ ...doc, pathParams: visiblePathParams(doc.url, doc.pathParams) }, STRINGIFY_OPTIONS);

export const serializeWebSocket = (doc: WebSocketDoc): string => stringify(doc, STRINGIFY_OPTIONS);

export const serializeFolder = (doc: FolderDoc): string => stringify(doc, STRINGIFY_OPTIONS);

/** Secret variable values are never written to the collection file. */
export function serializeCollection(doc: CollectionDoc): string {
  const variables = doc.variables
    .map((v) => (!v.secret ? v : isListVar(v) ? { ...v, items: v.items.map((i) => ({ ...i, value: "" })) } : { ...v, value: "" }))
    .map(storedVariable);
  return stringify({ ...doc, variables }, STRINGIFY_OPTIONS);
}
