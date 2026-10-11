import type { Auth, Variable } from "../model";
import type { TransferNode } from "./model";

const isVarRef = (s: string) => /^\s*\{\{[^{}]+\}\}\s*$/.test(s);
const blank = (s: string) => (isVarRef(s) ? s : "");

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

export const redactVariables = (vars: Variable[]): Variable[] => vars.map((v) => (v.secret ? { ...v, value: blank(v.value) } : v));

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
      const literal = (kv: { value: string }) => kv.value !== "" && !isVarRef(kv.value);
      const headers = n.headers.filter((h) => SENSITIVE_NAME.test(h.key) && literal(h)).map((h) => `header ${h.key}`);
      const cookies = n.kind === "http" ? n.cookies.filter((c) => c.key && literal(c)).map((c) => `cookie ${c.key}`) : [];
      const found = [...headers, ...cookies];
      if (found.length) out.push(`"${n.name}": ${found.join(", ")} will be exported as plain text.`);
    }
  };
  walk(items);
  return out;
}
