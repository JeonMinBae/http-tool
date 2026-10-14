import { isListVar, type KeyValue, type Variable } from "./model";
import { listMarker, splitListRef } from "./variables";

/**
 * Applies the difference between `before` and `after` value maps to rows: changed values update the
 * enabled row (keeping its other fields), removed keys delete it, new keys re-enable a same-key row or append.
 * `own` limits which rows take part (plain variables ignore list variables of the same name).
 */
function applyRecordChanges<T extends KeyValue>(
  rows: T[],
  before: Record<string, string>,
  after: Record<string, string>,
  make: (key: string, value: string) => T,
  own: (row: T) => boolean = () => true,
): { rows: T[]; changed: boolean } {
  let changed = false;
  let next = rows.map((v) => {
    if (!own(v) || !v.enabled || !Object.hasOwn(after, v.key) || after[v.key] === before[v.key]) return v;
    changed = true;
    return { ...v, value: after[v.key] };
  });
  for (const key of Object.keys(before)) {
    if (!Object.hasOwn(after, key)) {
      next = next.filter((v) => !(own(v) && v.enabled && v.key === key));
      changed = true;
    }
  }
  for (const [key, value] of Object.entries(after)) {
    if (!Object.hasOwn(before, key)) {
      const existing = next.find((v) => own(v) && v.key === key);
      if (existing) next = next.map((v) => (v === existing ? { ...v, value, enabled: true } : v));
      else next = [...next, make(key, value)];
      changed = true;
    }
  }
  return { rows: next, changed };
}

/**
 * Applies script changes (difference between `before` and `after` value maps) to a stored variable list.
 * Returns null when nothing changed. Flattened list keys (`list:key`, marker `list:`) map back onto
 * list variables; see variables.ts.
 */
export function applyVarChanges(vars: Variable[], before: Record<string, string>, after: Record<string, string>): Variable[] | null {
  const plain = (r: Record<string, string>) => Object.fromEntries(Object.entries(r).filter(([k]) => !k.includes(":")));
  const base = applyRecordChanges<Variable>(vars, plain(before), plain(after), (key, value) => ({ key, value, enabled: true, secret: false }), (v) => !isListVar(v));
  let changed = base.changed;
  let next = base.rows;

  const lists = new Set([...Object.keys(before), ...Object.keys(after)].flatMap((k) => splitListRef(k)?.list ?? []));
  for (const list of lists) {
    const marker = listMarker(list);
    // null = list absent from the record; {} = present but empty
    const items = (r: Record<string, string>) =>
      Object.hasOwn(r, marker)
        ? Object.fromEntries(Object.entries(r).filter(([k]) => k.startsWith(marker) && k !== marker).map(([k, v]) => [k.slice(marker.length), v]))
        : null;
    const b = items(before);
    const a = items(after);
    if (JSON.stringify(b) === JSON.stringify(a)) continue;
    changed = true;
    const idx = next.findIndex((v) => isListVar(v) && v.enabled && v.key === list);
    if (a === null) {
      next = next.filter((_, i) => i !== idx);
      continue;
    }
    const current = idx >= 0 ? next[idx] : { key: list, value: "", enabled: true, secret: false, type: "list" as const, items: [] };
    const merged = applyRecordChanges<KeyValue>(current.items ?? [], b ?? {}, a, (key, value) => ({ key, value, enabled: true })).rows;
    next = idx >= 0 ? next.map((v, i) => (i === idx ? { ...v, items: merged } : v)) : [...next, { ...current, items: merged }];
  }
  return changed ? next : null;
}
