import type { PreparedBody, PreparedRequest } from "../ipc";
import { applyAuth, resolveAuth, type Chain } from "./auth";
import type { LoadedCollection, TreeNode } from "./collectionRepo";
import { emptyCollection, type Body, type FolderDoc, type GlobalSettings, type HttpRequestDoc, type KeyValue, type RequestSettings } from "./model";
import { samePath } from "./path";
import { interpolate, type VarScopes } from "./variables";

export type { Chain } from "./auth";

const RAW_CONTENT_TYPE = { json: "application/json", text: "text/plain", xml: "application/xml", html: "text/html" } as const;

export class PrepareError extends Error {}

export interface PreparedResult {
  request: PreparedRequest;
  unresolved: string[];
}

/** Collection → folders → request chain for a request at `requestPath` (null for unsaved requests). */
export function buildChain(col: LoadedCollection | undefined, requestPath: string | null, request: HttpRequestDoc): Chain {
  const collection = col?.doc ?? emptyCollection("Untitled");
  if (!col || !requestPath) return { collection, folders: [], request };
  const find = (nodes: TreeNode[], trail: FolderDoc[]): FolderDoc[] | null => {
    for (const n of nodes) {
      if (n.type === "request" && samePath(n.path, requestPath)) return trail;
      if (n.type === "folder") {
        const found = find(n.children, [...trail, n.doc]);
        if (found) return found;
      }
    }
    return null;
  };
  return { collection, folders: find(col.children, []) ?? [], request };
}

const enabled = <T extends KeyValue>(items: T[]) => items.filter((i) => i.enabled && i.key.trim() !== "");
const hasHeader = (headers: [string, string][], name: string) =>
  headers.some(([k]) => k.toLowerCase() === name.toLowerCase());

export function withScheme(url: string): string {
  const trimmed = url.trim();
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

export function toPreparedBody(body: Body, t: (v: string) => string): PreparedBody {
  switch (body.type) {
    case "none":
      return { type: "none" };
    case "raw":
      return { type: "text", content: t(body.content) };
    case "urlencoded":
      return { type: "url-encoded", fields: enabled(body.fields).map((f) => [t(f.key), t(f.value)]) };
    case "form-data":
      return {
        type: "form-data",
        fields: enabled(body.fields).map((f) => ({ name: t(f.key), kind: f.kind, value: f.kind === "file" ? f.value : t(f.value) })),
      };
    case "binary":
      return body.filePath ? { type: "binary", path: body.filePath } : { type: "none" };
    case "graphql": {
      let variables: unknown = {};
      const raw = t(body.variables).trim();
      if (raw) {
        try {
          variables = JSON.parse(raw);
        } catch {
          throw new PrepareError("GraphQL variables are not valid JSON");
        }
      }
      return { type: "text", content: JSON.stringify({ query: t(body.query), variables }) };
    }
  }
}

export function mergeSettings(req: RequestSettings, global: GlobalSettings) {
  return {
    timeoutMs: req.timeoutMs ?? global.timeoutMs,
    followRedirects: req.followRedirects ?? global.followRedirects,
    verifySsl: req.verifySsl ?? global.verifySsl,
    proxy: global.proxy,
  };
}

export function prepareRequest(chain: Chain, scopes: VarScopes, settings: GlobalSettings): PreparedResult {
  const req = chain.request;
  const unresolved = new Set<string>();
  const t = (v: string) => {
    const r = interpolate(v, scopes);
    r.unresolved.forEach((u) => unresolved.add(u));
    return r.value;
  };
  if (!req.url.trim()) throw new PrepareError("URL is empty");

  const headers: [string, string][] = enabled(req.headers).map((h) => [t(h.key), t(h.value)]);
  const cookie = enabled(req.cookies).map((c) => `${t(c.key)}=${t(c.value)}`).join("; ");
  if (cookie) headers.push(["Cookie", cookie]);

  const authed = applyAuth(resolveAuth(chain), { url: withScheme(t(req.url)), headers }, t);
  const body = toPreparedBody(req.body, t);
  if (req.body.type === "raw" && !hasHeader(authed.headers, "content-type"))
    authed.headers.push(["Content-Type", RAW_CONTENT_TYPE[req.body.language]]);
  if (req.body.type === "graphql" && !hasHeader(authed.headers, "content-type"))
    authed.headers.push(["Content-Type", "application/json"]);

  return {
    request: { method: req.method, url: authed.url, headers: authed.headers, body, ...mergeSettings(req.settings, settings) },
    unresolved: [...unresolved],
  };
}
