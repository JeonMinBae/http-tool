import type { Auth, CollectionDoc, FolderDoc, HttpRequestDoc } from "./model";
import { utf8ToBase64 } from "./encoding";

export interface Chain {
  collection: CollectionDoc;
  /** Outermost first. */
  folders: FolderDoc[];
  request: HttpRequestDoc;
}

/** Nearest non-inherit auth: request → folders (inner → outer) → collection. */
export function resolveAuth(chain: Chain): Auth {
  const levels = [chain.request.auth, ...[...chain.folders].reverse().map((f) => f.auth), chain.collection.auth];
  return levels.find((a) => a.type !== "inherit") ?? { type: "none" };
}

export interface AuthTarget {
  url: string;
  headers: [string, string][];
}

const hasHeader = (headers: [string, string][], name: string) =>
  headers.some(([k]) => k.toLowerCase() === name.toLowerCase());

function appendQuery(url: string, key: string, value: string): string {
  const [base, hash] = url.split("#", 2);
  const sep = base.includes("?") ? (base.endsWith("?") || base.endsWith("&") ? "" : "&") : "?";
  const next = `${base}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  return hash === undefined ? next : `${next}#${hash}`;
}

/** Applies auth to the request; headers the user set explicitly take precedence. */
export function applyAuth(auth: Auth, target: AuthTarget, t: (v: string) => string): AuthTarget {
  const headers = [...target.headers];
  const setHeader = (name: string, value: string) => {
    if (!hasHeader(headers, name)) headers.push([name, value]);
  };
  switch (auth.type) {
    case "bearer":
      setHeader("Authorization", `Bearer ${t(auth.token)}`);
      return { url: target.url, headers };
    case "basic":
      setHeader("Authorization", `Basic ${utf8ToBase64(`${t(auth.username)}:${t(auth.password)}`)}`);
      return { url: target.url, headers };
    case "apikey": {
      const key = t(auth.key);
      if (!key) return target;
      if (auth.in === "query") return { url: appendQuery(target.url, key, t(auth.value)), headers };
      setHeader(key, t(auth.value));
      return { url: target.url, headers };
    }
    default:
      return target;
  }
}
