import { isListVar, type Auth, type Variable } from "../model";
import type { TransferNode } from "./model";

export const isVarRef = (s: string) => /^\s*\{\{[^{}]+\}\}\s*$/.test(s);
const blank = (s: string) => (isVarRef(s) ? s : "");
export const isSensitiveName = (name: string) => SENSITIVE_NAME.test(name);
/** A typed-in value (not empty, not a `{{var}}` reference). */
export const isLiteral = (value: string) => value !== "" && !isVarRef(value);

/** Blanks literal credentials; `{{var}}` references are kept. */
export function redactAuth(a: Auth): Auth {
  switch (a.type) {
    case "bearer":
      return { ...a, token: blank(a.token) };
    case "basic":
      return { ...a, password: blank(a.password) };
    case "apikey":
      return { ...a, value: blank(a.value) };
    case "oauth2":
      return { ...a, clientSecret: blank(a.clientSecret) };
    default:
      return a;
  }
}

export const redactVariables = (vars: Variable[]): Variable[] =>
  vars.map((v) => {
    if (!v.secret) return v;
    return isListVar(v) ? { ...v, items: v.items.map((i) => ({ ...i, value: blank(i.value) })) } : { ...v, value: blank(v.value) };
  });

export function redactNodes(items: TransferNode[]): TransferNode[] {
  return items.map((n) => {
    if (n.kind === "folder") return { ...n, auth: redactAuth(n.auth), items: redactNodes(n.items) };
    if (n.kind === "http") return { ...n, auth: redactAuth(n.auth) };
    return n;
  });
}

const SENSITIVE_NAME = /auth|token|key|secret|password|session|cookie/i;

/**
 * Credentials typed outside the Auth tab (sensitive-looking headers, any cookie) are not redacted;
 * lists them so the export dialog can warn. `{{var}}` references are not reported.
 */
export function unredactedCredentialWarnings(items: TransferNode[]): string[] {
  const out: string[] = [];
  const walk = (nodes: TransferNode[]) => {
    for (const n of nodes) {
      if (n.kind === "folder") {
        walk(n.items);
        continue;
      }
      const headers = n.headers.filter((h) => isSensitiveName(h.key) && isLiteral(h.value)).map((h) => `header ${h.key}`);
      const cookies = n.kind === "http" ? n.cookies.filter((c) => c.key && isLiteral(c.value)).map((c) => `cookie ${c.key}`) : [];
      const found = [...headers, ...cookies];
      if (found.length) out.push(`"${n.name}": ${found.join(", ")} will be exported as plain text.`);
    }
  };
  walk(items);
  return out;
}
