import type { LoadedCollection, TreeNode } from "./collectionRepo";
import { isListVar, type Environment, type HttpMethod, type Variable } from "./model";

export type SearchHit =
  | { kind: "request"; label: string; detail: string; url: string; method: HttpMethod; root: string; path: string; score: number }
  | { kind: "variable"; label: string; detail: string; value: string; secret: boolean; target: VariableTarget; score: number };

export type VariableTarget = { scope: "global" } | { scope: "environment"; id: string } | { scope: "collection"; root: string };

type WithoutScore<T> = T extends unknown ? Omit<T, "score"> : never;

interface Entry {
  hit: WithoutScore<SearchHit>;
  /** Lower-cased primary text (name / key). */
  name: string;
  /** Lower-cased secondary text (url, path, value). */
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
          const hit = { kind: "variable" as const, label, detail, value: v.secret ? "" : i.value, secret: v.secret, target };
          entries.push({ hit, name: label.toLowerCase(), rest: v.secret ? "" : i.value.toLowerCase() });
        }
        continue;
      }
      const hit = { kind: "variable" as const, label: v.key, detail, value: v.secret ? "" : v.value, secret: v.secret, target };
      // Secret values are never searchable.
      entries.push({ hit, name: v.key.toLowerCase(), rest: v.secret ? "" : v.value.toLowerCase() });
    }
  };

  for (const col of input.collections) {
    const walk = (nodes: TreeNode[], trail: string[]) => {
      for (const n of nodes) {
        if (n.type === "folder") walk(n.children, [...trail, n.doc.name]);
        else if (n.type === "request") {
          const detail = trail.join(" / ");
          entries.push({
            hit: { kind: "request", label: n.doc.name, detail, url: n.doc.url, method: n.doc.method, root: col.root, path: n.path },
            name: n.doc.name.toLowerCase(),
            rest: `${n.doc.url} ${detail}`.toLowerCase(),
          });
        }
      }
    };
    walk(col.children, [col.doc.name]);
    addVars(col.doc.variables, `Collection: ${col.doc.name}`, { scope: "collection", root: col.root });
  }
  addVars(input.globals, "Globals", { scope: "global" });
  for (const env of input.environments) addVars(env.variables, `Environment: ${env.name}`, { scope: "environment", id: env.id });
  return { entries };
}

/** Case-insensitive search; every word must match. Name matches rank above other matches. */
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
    hits.push({ ...e.hit, score: score * 10_000 - order } as SearchHit);
  });
  return hits.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS);
}
