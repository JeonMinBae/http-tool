import { useEffect, useMemo, useState } from "react";
import { filterTree } from "../../core/treeFilter";
import { useSidebar } from "../../state/sidebar";
import { useWorkspace } from "../../state/workspace";
import { newUntitledRequest, openCollectionFromDialog } from "../actions";
import { IconButton } from "../common/Button";
import { Icon } from "../common/icons";
import { CollectionTree } from "./CollectionTree";
import { HistoryPanel } from "./HistoryPanel";
import { openCurlImport } from "../curl/CurlDialogs";
import { openImportDialog } from "../transfer/ImportDialog";
import { SidebarSearch } from "./SidebarSearch";
import { TreeExpandContext } from "./treeExpandContext";
import { VariableResults } from "./VariableResults";

function FilteredTrees({ query }: { query: string }) {
  const collections = useWorkspace((s) => s.collections);
  const filtered = useMemo(() => filterTree(collections, query), [collections, query]);
  const [expanded, setExpanded] = useState(filtered.open);
  // Reset only when the query changes (not on collection reloads), starting from its computed open set;
  // the persistent expansion state is never touched.
  useEffect(() => setExpanded(filtered.open), [query]);
  const toggle = (p: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });
  if (!filtered.collections.length) return <p className="p-3 text-muted">No matches.</p>;
  return (
    <TreeExpandContext.Provider value={{ expanded, toggle, filtering: true }}>
      {filtered.collections.map((c) => (
        <CollectionTree key={c.root} col={c} />
      ))}
    </TreeExpandContext.Provider>
  );
}

export function Sidebar() {
  const section = useSidebar((s) => s.section);
  const setSection = useSidebar((s) => s.setSection);
  const query = useSidebar((s) => s.query);
  const mode = useSidebar((s) => s.mode);
  const collections = useWorkspace((s) => s.collections);
  const missing = useWorkspace((s) => s.missing);

  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line px-2">
        {(["collections", "history"] as const).map((s) => (
          <button
            key={s}
            type="button"
            className={`rounded px-2 py-1 capitalize ${section === s ? "bg-selected font-medium" : "text-muted hover:text-fg"}`}
            onClick={() => setSection(s)}
          >
            {s}
          </button>
        ))}
        <div className="flex-1" />
        {section === "collections" && (
          <>
            <IconButton title="New request" onClick={() => newUntitledRequest()}>
              <Icon name="plus" />
            </IconButton>
            <IconButton title="Import (HTTP Tool JSON / OpenAPI)" onClick={() => openImportDialog()}>
              <Icon name="upload" />
            </IconButton>
            <IconButton title="Import cURL" onClick={() => openCurlImport()}>
              <Icon name="import" />
            </IconButton>
            <IconButton title="Open collection folder" onClick={() => openCollectionFromDialog()}>
              <Icon name="folder" />
            </IconButton>
          </>
        )}
      </div>
      {section === "collections" && <SidebarSearch />}
      <div className="min-h-0 flex-1 overflow-auto py-1">
        {section === "collections" && mode === "variables" && <VariableResults />}
        {section === "collections" && mode === "requests" && query.trim() !== "" && <FilteredTrees query={query} />}
        {section === "collections" && mode === "requests" && query.trim() === "" && (
          <>
            {missing.length > 0 && (
              <div className="mx-2 mb-2 rounded border border-warn/40 p-2 text-[12px] text-warn">
                Could not reopen: {missing.join(", ")}
              </div>
            )}
            {collections.map((c) => (
              <CollectionTree key={c.root} col={c} />
            ))}
            {collections.length === 0 && (
              <div className="p-4 text-center text-muted">
                <p className="mb-2">No collections open.</p>
                <button type="button" className="text-accent hover:underline" onClick={() => openCollectionFromDialog()}>
                  Open a folder as a collection
                </button>
              </div>
            )}
          </>
        )}
        {section === "history" && <HistoryPanel />}
      </div>
    </div>
  );
}
