import type { LoadedCollection, TreeNode } from "./collectionRepo";

export interface FilteredTree {
  collections: LoadedCollection[];
  /** Collection roots and folders to show expanded. */
  open: Set<string>;
}

/** Keeps folders matching by name and requests matching by name or URL, plus their ancestors. A matching folder keeps its whole subtree. */
export function filterTree(collections: LoadedCollection[], query: string): FilteredTree {
  const q = query.trim().toLowerCase();
  const has = (s: string) => s.toLowerCase().includes(q);
  const open = new Set<string>();
  // A matching folder shows its whole subtree, so every folder below it opens too.
  const openAll = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      if (n.type !== "folder") continue;
      open.add(n.path);
      openAll(n.children);
    }
  };
  const prune = (nodes: TreeNode[]): TreeNode[] =>
    nodes.flatMap((n): TreeNode[] => {
      if (n.type !== "folder") return has(n.doc.name) || has(n.doc.url) ? [n] : [];
      if (has(n.doc.name)) {
        open.add(n.path);
        openAll(n.children);
        return [n];
      }
      const children = prune(n.children);
      if (!children.length) return [];
      open.add(n.path);
      return [{ ...n, children }];
    });
  const kept = collections.flatMap((c): LoadedCollection[] => {
    if (has(c.doc.name)) {
      open.add(c.root);
      openAll(c.children);
      return [c];
    }
    const children = prune(c.children);
    if (!children.length) return [];
    open.add(c.root);
    return [{ ...c, children }];
  });
  return { collections: kept, open };
}
