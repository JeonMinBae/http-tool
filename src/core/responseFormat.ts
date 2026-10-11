import type { SentRequest } from "../ipc";

export type BodyKind = "json" | "xml" | "html" | "image" | "text" | "binary";

export const PRETTY_LIMIT = 5 * 1024 * 1024;

export function headerValue(headers: [string, string][], name: string): string | undefined {
  return headers.find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1];
}

export function detectKind(contentType: string | undefined, isText: boolean, text?: string): BodyKind {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.startsWith("image/")) return "image";
  if (ct.includes("json")) return "json";
  if (ct.includes("html")) return "html";
  if (ct.includes("xml")) return "xml";
  if (!isText) return "binary";
  const t = text?.trimStart() ?? "";
  if (t.startsWith("{") || t.startsWith("[")) return "json";
  if (t.startsWith("<")) return "xml";
  return "text";
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** Indents XML/HTML tags without validating them. */
export function prettyXml(text: string): string {
  const tokens = text.replace(/>\s+</g, "><").replace(/></g, ">\n<").split("\n");
  let depth = 0;
  return tokens
    .map((line) => {
      const t = line.trim();
      if (/^<\/[^>]+>$/.test(t)) depth = Math.max(0, depth - 1);
      const out = "  ".repeat(depth) + t;
      const opens = /^<[^!?/][^>]*[^/]>$/.test(t) || /^<[a-zA-Z][^>]*>$/.test(t);
      const closesInline = /^<[^>]+>.*<\/[^>]+>$/.test(t);
      if (opens && !closesInline && !/\/>$/.test(t)) depth++;
      return out;
    })
    .join("\n");
}

/** HTTP/1.1-style rendering of the request that was actually sent. */
export function formatSent(s: SentRequest): string {
  let target = s.url;
  let host = "";
  try {
    const u = new URL(s.url);
    target = `${u.pathname}${u.search}`;
    host = u.host;
  } catch {
    /* keep raw url */
  }
  const lines = [`${s.method} ${target} HTTP/1.1`];
  if (host && !s.headers.some(([k]) => k.toLowerCase() === "host")) lines.push(`host: ${host}`);
  lines.push(...s.headers.map(([k, v]) => `${k}: ${v}`));
  return lines.join("\n") + (s.bodyPreview ? `\n\n${s.bodyPreview}` : "");
}

export interface ResponseCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: string;
  maxAge?: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: string;
}

export function parseSetCookie(header: string): ResponseCookie {
  const [pair, ...attrs] = header.split(";");
  const i = pair.indexOf("=");
  const cookie: ResponseCookie = {
    name: (i < 0 ? pair : pair.slice(0, i)).trim(),
    value: i < 0 ? "" : pair.slice(i + 1).trim(),
    httpOnly: false,
    secure: false,
  };
  for (const a of attrs) {
    const j = a.indexOf("=");
    const key = (j < 0 ? a : a.slice(0, j)).trim().toLowerCase();
    const val = j < 0 ? "" : a.slice(j + 1).trim();
    if (key === "domain") cookie.domain = val;
    else if (key === "path") cookie.path = val;
    else if (key === "expires") cookie.expires = val;
    else if (key === "max-age") cookie.maxAge = val;
    else if (key === "httponly") cookie.httpOnly = true;
    else if (key === "secure") cookie.secure = true;
    else if (key === "samesite") cookie.sameSite = val;
  }
  return cookie;
}
