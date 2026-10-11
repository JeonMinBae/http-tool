import { useState } from "react";
import { useWorkspace } from "../../state/workspace";
import { newUntitledRequest, openCollectionFromDialog } from "../actions";
import { IconButton } from "../common/Button";
import { Icon } from "../common/icons";
import { CollectionTree } from "./CollectionTree";

type Section = "collections" | "history";

export function Sidebar() {
  const [section, setSection] = useState<Section>("collections");
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
            <IconButton title="Open collection folder" onClick={() => openCollectionFromDialog()}>
              <Icon name="folder" />
            </IconButton>
          </>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto py-1">
        {section === "collections" && (
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
        {section === "history" && <div className="p-4 text-center text-muted">No history yet.</div>}
      </div>
    </div>
  );
}
