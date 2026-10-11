export interface Exiting<T> {
  item: T;
  exiting: boolean;
}

/** `next` as live entries, plus entries of `prev` missing from `next` kept at their old index as exiting. */
export function mergeExiting<T>(prev: Exiting<T>[], next: T[], key: (t: T) => string): Exiting<T>[] {
  const nextKeys = new Set(next.map(key));
  const out: Exiting<T>[] = next.map((item) => ({ item, exiting: false }));
  prev.forEach((p, i) => {
    if (!nextKeys.has(key(p.item))) out.splice(Math.min(i, out.length), 0, { item: p.item, exiting: true });
  });
  return out;
}
