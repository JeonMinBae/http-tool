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

export const redactVariables = (vars: Variable[]): Variable[] => vars.map((v) => (v.secret ? { ...v, value: "" } : v));

export function redactNodes(items: TransferNode[]): TransferNode[] {
  return items.map((n) => {
    if (n.kind === "folder") return { ...n, auth: redactAuth(n.auth), items: redactNodes(n.items) };
    if (n.kind === "http") return { ...n, auth: redactAuth(n.auth) };
    return n;
  });
}
