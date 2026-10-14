import type { KeyValue } from "./model";

/** URL may contain {{vars}}, so query handling is string based and keeps text as typed. */
export function splitUrl(url: string): { base: string; query: string | null; hash: string } {
  const hashAt = url.indexOf("#");
  const hash = hashAt >= 0 ? url.slice(hashAt) : "";
  const rest = hashAt >= 0 ? url.slice(0, hashAt) : url;
  const q = rest.indexOf("?");
  return q >= 0 ? { base: rest.slice(0, q), query: rest.slice(q + 1), hash } : { base: rest, query: null, hash };
}

export function syncParamsFromUrl(url: string, prev: KeyValue[]): KeyValue[] {
  const { query } = splitUrl(url);
  const active: KeyValue[] = query
    ? query
        .split("&")
        .filter((p) => p !== "")
        .map((p) => {
          const i = p.indexOf("=");
          return i < 0 ? { key: p, value: "", enabled: true } : { key: p.slice(0, i), value: p.slice(i + 1), enabled: true };
        })
    : [];
  return [...active, ...prev.filter((p) => !p.enabled)];
}

export function syncUrlFromParams(url: string, params: KeyValue[]): string {
  const { base, hash } = splitUrl(url);
  const q = params
    .filter((p) => p.enabled && p.key)
    .map((p) => (p.value === "" ? p.key : `${p.key}=${p.value}`))
    .join("&");
  return (q ? `${base}?${q}` : base) + hash;
}
