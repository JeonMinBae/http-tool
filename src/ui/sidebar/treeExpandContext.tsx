import { createContext, useContext } from "react";
import { useExpanded } from "../../state/treeExpand";

export interface TreeExpand {
  expanded: Set<string>;
  toggle(path: string): void;
  /** Filtered view: drag-and-drop is off because sibling order would be computed from the pruned tree. */
  filtering: boolean;
}

export const TreeExpandContext = createContext<TreeExpand | null>(null);

/** Expansion state for the tree: the persistent store normally, a throwaway set while filtering. */
export function useTreeExpand(): TreeExpand {
  const ctx = useContext(TreeExpandContext);
  const store = useExpanded();
  return ctx ?? { expanded: store.expanded, toggle: store.toggle, filtering: false };
}
