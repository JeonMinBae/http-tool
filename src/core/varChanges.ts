import type { Variable } from "./model";

/**
 * Applies script changes (difference between `before` and `after` value maps) to a stored variable list.
 * Changed values update the existing variable (keeping its secret flag), new keys are appended and
 * removed keys are deleted. Returns null when nothing changed.
 */
export function applyVarChanges(vars: Variable[], before: Record<string, string>, after: Record<string, string>): Variable[] | null {
  let changed = false;
  let next = vars.map((v) => {
    if (!v.enabled || !Object.hasOwn(after, v.key) || after[v.key] === before[v.key]) return v;
    changed = true;
    return { ...v, value: after[v.key] };
  });
  for (const key of Object.keys(before)) {
    if (!Object.hasOwn(after, key)) {
      next = next.filter((v) => !(v.enabled && v.key === key));
      changed = true;
    }
  }
  for (const [key, value] of Object.entries(after)) {
    if (!Object.hasOwn(before, key)) {
      const existing = next.find((v) => v.key === key);
      if (existing) next = next.map((v) => (v === existing ? { ...v, value, enabled: true } : v));
      else next = [...next, { key, value, enabled: true, secret: false }];
      changed = true;
    }
  }
  return changed ? next : null;
}
