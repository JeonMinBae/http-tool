import { useMemo } from "react";
import { buildIndex, search, type SearchHit } from "../../core/search";
import { useSidebar } from "../../state/sidebar";
import { useVariables } from "../../state/variables";
import { useWorkspace } from "../../state/workspace";
import { openCollectionSettings } from "../actions";
import { openVariablesDialog } from "../vars/VariablesDialog";

function openHit(hit: SearchHit) {
  const t = hit.target;
  if (t.scope === "collection") openCollectionSettings(t.root);
  else if (t.scope === "global") void openVariablesDialog({ kind: "globals" });
  else void openVariablesDialog({ kind: "env", id: t.id });
}

export function VariableResults() {
  const query = useSidebar((s) => s.query);
  const collections = useWorkspace((s) => s.collections);
  const globals = useVariables((s) => s.globals);
  const environments = useVariables((s) => s.environments);
  const index = useMemo(() => buildIndex({ collections, globals, environments }), [collections, globals, environments]);
  const hits = useMemo(() => search(query, index), [query, index]);

  if (!query.trim()) return <p className="p-3 text-muted">Type to search variables.</p>;
  if (!hits.length) return <p className="p-3 text-muted">No matches.</p>;
  return (
    <>
      {hits.map((h, i) => (
        <button
          key={`${h.label}-${h.detail}-${i}`}
          type="button"
          className="flex w-full flex-col px-3 py-1.5 text-left hover:bg-hover active:bg-selected"
          onClick={() => openHit(h)}
        >
          <span className="truncate">{h.label}</span>
          <span className="mono truncate text-[11px] text-muted">{h.secret ? "••••••" : h.value}</span>
          <span className="truncate text-[11px] text-muted">{h.detail}</span>
        </button>
      ))}
    </>
  );
}
