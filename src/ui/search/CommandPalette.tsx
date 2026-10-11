import { useMemo, useState } from "react";
import type { TreeNode } from "../../core/collectionRepo";
import { samePath } from "../../core/path";
import { buildIndex, search, type SearchHit } from "../../core/search";
import { useTabs } from "../../state/tabs";
import { useVariables } from "../../state/variables";
import { useWorkspace } from "../../state/workspace";
import { openCollectionSettings } from "../actions";
import { openDialog } from "../common/dialogs";
import { methodColor, methodLabel } from "../common/methodColor";
import { openVariablesDialog } from "../vars/VariablesDialog";

function findNode(nodes: TreeNode[], path: string): TreeNode | undefined {
  for (const n of nodes) {
    if (samePath(n.path, path)) return n;
    if (n.type === "folder") {
      const found = findNode(n.children, path);
      if (found) return found;
    }
  }
  return undefined;
}

function openHit(hit: SearchHit) {
  if (hit.kind === "request") {
    const col = useWorkspace.getState().collections.find((c) => samePath(c.root, hit.root));
    const node = col && findNode(col.children, hit.path);
    if (node) useTabs.getState().open(hit.root, node.path, node.doc);
    return;
  }
  const t = hit.target;
  if (t.scope === "collection") openCollectionSettings(t.root);
  else if (t.scope === "global") void openVariablesDialog({ kind: "globals" });
  else void openVariablesDialog({ kind: "env", id: t.id });
}

function Palette({ close }: { close: () => void }) {
  const collections = useWorkspace((s) => s.collections);
  const globals = useVariables((s) => s.globals);
  const environments = useVariables((s) => s.environments);
  const index = useMemo(() => buildIndex({ collections, globals, environments }), [collections, globals, environments]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const hits = useMemo(() => search(query, index), [query, index]);

  const choose = (hit: SearchHit | undefined) => {
    if (!hit) return;
    close();
    openHit(hit);
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-center bg-black/30 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="flex max-h-[60vh] w-[600px] flex-col overflow-hidden rounded-lg border border-line bg-panel shadow-2xl">
        <input
          autoFocus
          className="border-b border-line bg-transparent px-4 py-3 text-[14px] outline-none"
          placeholder="Search requests and variables…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setSelected((i) => Math.min(i + 1, hits.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSelected((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") choose(hits[selected]);
          }}
        />
        <div className="min-h-0 flex-1 overflow-auto py-1">
          {query.trim() && hits.length === 0 && <p className="px-4 py-3 text-muted">No results.</p>}
          {!query.trim() && <p className="px-4 py-3 text-muted">Type to search request names, URLs and variables.</p>}
          {hits.map((h, i) => (
            <button
              key={`${h.kind}-${h.label}-${h.detail}-${i}`}
              type="button"
              className={`flex w-full items-center gap-2 px-4 py-1.5 text-left ${i === selected ? "bg-selected" : "hover:bg-hover"}`}
              onMouseEnter={() => setSelected(i)}
              onClick={() => choose(h)}
            >
              {h.kind === "request" ? (
                <span className={`mono w-9 shrink-0 text-right text-[10px] font-bold ${methodColor(h.method)}`}>{methodLabel(h.method)}</span>
              ) : (
                <span className="mono w-9 shrink-0 text-right text-[10px] text-muted">{"{{}}"}</span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{h.label}</span>
                <span className="mono block truncate text-[11px] text-muted">
                  {h.kind === "request" ? h.url || h.detail : h.secret ? "••••••" : h.value}
                </span>
              </span>
              <span className="max-w-48 shrink-0 truncate text-[11px] text-muted">{h.detail}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

let open = false;

export function openCommandPalette() {
  if (open) return;
  open = true;
  void openDialog((close) => <Palette close={close} />).then(() => {
    open = false;
  });
}
