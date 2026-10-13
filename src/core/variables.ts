import { isListVar, type Variable } from "./model";

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

/**
 * Lists are flattened into the scope record: item `A` of list `tool` is `"tool:A"`, plus a `"tool:"` marker
 * saying the list exists in that scope. Plain names never contain ':', so these keys cannot collide.
 */
export const listMarker = (list: string) => `${list}:`;
export const isListMarker = (name: string) => name.endsWith(":") && name.indexOf(":") === name.length - 1;
export const isValidVarName = (name: string) => !name.includes(":");

/** `tool:A:B` → list `tool`, key `A:B` (split at the first ':'). */
export function splitListRef(name: string): { list: string; key: string } | null {
  const i = name.indexOf(":");
  return i < 0 ? null : { list: name.slice(0, i), key: name.slice(i + 1) };
}

function toRecord(vars: Variable[] = []): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of vars) {
    if (!v.enabled || !v.key || !isValidVarName(v.key)) continue;
    if (!isListVar(v)) {
      out[v.key] = v.value;
      continue;
    }
    out[listMarker(v.key)] = "";
    for (const i of v.items) if (i.enabled && i.key) out[`${v.key}:${i.key}`] = i.value;
  }
  return out;
}

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

/** A list reference only looks in the highest scope that defines the list (lists replace each other whole). */
export function varSource(name: string, s: VarScopes): VarScope | undefined {
  const ref = splitListRef(name);
  if (!ref) return SCOPE_ORDER.find((k) => Object.hasOwn(s[k], name));
  if (!ref.key) return undefined;
  const scope = SCOPE_ORDER.find((k) => Object.hasOwn(s[k], listMarker(ref.list)));
  return scope && Object.hasOwn(s[scope], name) ? scope : undefined;
}

/** Script writes: `"tool:A"` also creates the list marker so the item resolves. */
export function setScopeVar(record: Record<string, string>, name: string, value: string) {
  record[name] = value;
  const ref = splitListRef(name);
  if (ref?.key) record[listMarker(ref.list)] ??= "";
}

/** Every resolvable name with its winning scope and value (markers excluded), for completion and toObject. */
export function visibleVars(s: VarScopes): { name: string; scope: VarScope; value: string }[] {
  const names = new Set(SCOPE_ORDER.flatMap((k) => Object.keys(s[k])).filter((n) => !isListMarker(n)));
  return [...names].flatMap((name) => {
    const scope = varSource(name, s);
    return scope ? [{ name, scope, value: s[scope][name] }] : [];
  });
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
