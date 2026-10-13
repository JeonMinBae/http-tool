import type { Variable } from "./model";

export interface VarScopes {
  local: Record<string, string>;
  environment: Record<string, string>;
  collection: Record<string, string>;
  global: Record<string, string>;
}

export type VarScope = keyof VarScopes;

/** Highest precedence first. */
export const SCOPE_ORDER: readonly VarScope[] = ["local", "environment", "collection", "global"];
const PATTERN = /\{\{\s*([^{}\s]+)\s*\}\}/g;
const MAX_DEPTH = 5;

const toRecord = (vars: Variable[] = []) =>
  Object.fromEntries(vars.filter((v) => v.enabled && v.key).map((v) => [v.key, v.value]));

export function buildScopes(input: {
  globals?: Variable[];
  environment?: Variable[];
  collection?: Variable[];
  local?: Record<string, string>;
}): VarScopes {
  return {
    local: { ...input.local },
    environment: toRecord(input.environment),
    collection: toRecord(input.collection),
    global: toRecord(input.globals),
  };
}

export function varSource(name: string, s: VarScopes): VarScope | undefined {
  return SCOPE_ORDER.find((k) => Object.hasOwn(s[k], name));
}

export function resolveVar(name: string, s: VarScopes): string | undefined {
  const k = varSource(name, s);
  return k ? s[k][name] : undefined;
}

export function interpolate(text: string, s: VarScopes, depth = 0): { value: string; unresolved: string[] } {
  const unresolved: string[] = [];
  const value = text.replace(PATTERN, (match, name: string) => {
    const v = resolveVar(name, s);
    if (v === undefined) {
      unresolved.push(name);
      return match;
    }
    if (depth >= MAX_DEPTH) return v;
    const inner = interpolate(v, s, depth + 1);
    unresolved.push(...inner.unresolved);
    return inner.value;
  });
  return { value, unresolved: [...new Set(unresolved)] };
}

/** Variable names referenced in `text`. */
export function referencedVars(text: string): string[] {
  return [...new Set([...text.matchAll(PATTERN)].map((m) => m[1]))];
}

export interface VisibleVar {
  name: string;
  scope: VarScope;
  value: string;
}

/** Every variable visible in `s`, taken from its highest-precedence scope, sorted by name. */
export function listVars(s: VarScopes): VisibleVar[] {
  const out = new Map<string, VisibleVar>();
  for (const scope of SCOPE_ORDER) {
    for (const [name, value] of Object.entries(s[scope])) if (!out.has(name)) out.set(name, { name, scope, value });
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}
