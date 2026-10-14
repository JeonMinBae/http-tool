import type { LoadedCollection } from "./collectionRepo";
import { isListVar, type Environment, type Variable } from "./model";

export type SearchHit = { label: string; detail: string; value: string; secret: boolean; target: VariableTarget; score: number };

export type VariableTarget = { scope: "global" } | { scope: "environment"; id: string } | { scope: "collection"; root: string };

interface Entry {
  hit: Omit<SearchHit, "score">;
  /** Lower-cased variable name. */
  name: string;
  /** Lower-cased value (empty for secrets). */
  rest: string;
}

export interface SearchIndex {
  entries: Entry[];
}

const MAX_RESULTS = 50;

export function buildIndex(input: { collections: LoadedCollection[]; globals: Variable[]; environments: Environment[] }): SearchIndex {
  const entries: Entry[] = [];
  const addVars = (vars: Variable[], detail: string, target: VariableTarget) => {
    for (const v of vars) {
      if (!v.key) continue;
      if (isListVar(v)) {
        // A list has no value of its own; only its items are indexed.
        for (const i of v.items) {
          if (!i.key) continue;
          const label = `${v.key}:${i.key}`;
          entries.push({ hit: { label, detail, value: v.secret ? "" : i.value, secret: v.secret, target }, name: label.toLowerCase(), rest: v.secret ? "" : i.value.toLowerCase() });
        }
        continue;
      }
      // Secret values are never searchable.
      entries.push({ hit: { label: v.key, detail, value: v.secret ? "" : v.value, secret: v.secret, target }, name: v.key.toLowerCase(), rest: v.secret ? "" : v.value.toLowerCase() });
    }
  };

  for (const col of input.collections) addVars(col.doc.variables, `Collection: ${col.doc.name}`, { scope: "collection", root: col.root });
  addVars(input.globals, "Globals", { scope: "global" });
  for (const env of input.environments) addVars(env.variables, `Environment: ${env.name}`, { scope: "environment", id: env.id });
  return { entries };
}

/** Case-insensitive search; every word must match. Name matches rank above value matches. */
export function search(query: string, index: SearchIndex): SearchHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits: SearchHit[] = [];
  index.entries.forEach((e, order) => {
    let score = 0;
    for (const w of words) {
      if (e.name.startsWith(w)) score += 3;
      else if (e.name.includes(w)) score += 2;
      else if (e.rest.includes(w)) score += 1;
      else return;
    }
    hits.push({ ...e.hit, score: score * 10_000 - order });
  });
  return hits.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS);
}
