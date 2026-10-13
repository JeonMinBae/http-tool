import type { PathParam } from "./model";
import { splitUrl } from "./params";

/** `{name}` but not part of `{{var}}`: the lookarounds reject a neighbouring brace. */
const PATH_PARAM = /(?<!\{)\{([^{}/?#\s]+)\}(?!\})/g;

/** [from, to) of the path: after `scheme://authority` (or the first segment without a scheme), before `?`/`#`. */
export function pathRange(url: string): { from: number; to: number } {
  const { base } = splitUrl(url);
  const scheme = base.match(/^[a-z][a-z0-9+.-]*:\/\//i)?.[0].length ?? 0;
  const slash = base.indexOf("/", scheme);
  return slash < 0 ? { from: base.length, to: base.length } : { from: slash, to: base.length };
}

export function pathParamSpans(url: string): { from: number; to: number; name: string }[] {
  const { from, to } = pathRange(url);
  return [...url.slice(from, to).matchAll(PATH_PARAM)].map((m) => ({ from: from + m.index!, to: from + m.index! + m[0].length, name: m[1] }));
}

export const pathParamNames = (url: string): string[] => [...new Set(pathParamSpans(url).map((s) => s.name))];

/** URL names in order (values kept by name), then rows no longer in the URL so a retyped name gets its value back. */
export function syncPathParams(url: string, prev: PathParam[]): PathParam[] {
  const names = pathParamNames(url);
  const current = names.map((key) => prev.find((p) => p.key === key) ?? { key, value: "", description: "" });
  return [...current, ...prev.filter((p) => !names.includes(p.key))];
}

export const visiblePathParams = (url: string, rows: PathParam[]): PathParam[] => {
  const names = pathParamNames(url);
  return names.map((key) => rows.find((p) => p.key === key) ?? { key, value: "", description: "" });
};

/** Bulk `key: value` lines update values of existing rows only; unknown names and `//` lines are ignored, missing lines keep their value. */
export function applyBulkValues(rows: PathParam[], text: string): PathParam[] {
  const values = new Map<string, string>();
  for (const line of text.split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("//")) continue;
    const i = line.indexOf(":");
    values.set((i < 0 ? line : line.slice(0, i)).trim(), i < 0 ? "" : line.slice(i + 1).trim());
  }
  return rows.map((r) => (values.has(r.key) ? { ...r, value: values.get(r.key)! } : r));
}
