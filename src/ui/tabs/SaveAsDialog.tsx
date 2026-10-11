import { useState } from "react";
import type { TreeNode } from "../../core/collectionRepo";
import { samePath } from "../../core/path";
import { useWorkspace } from "../../state/workspace";
import { Button } from "../common/Button";
import { Modal, openDialog } from "../common/dialogs";
import { Icon } from "../common/icons";

export interface SaveLocation {
  root: string;
  dir: string;
  name: string;
}

function FolderRows({ nodes, depth, root, selected, onSelect }: {
  nodes: TreeNode[];
  depth: number;
  root: string;
  selected: string | null;
  onSelect: (root: string, dir: string) => void;
}) {
  return (
    <>
      {nodes.map((n) =>
        n.type === "folder" ? (
          <div key={n.path}>
            <button
              type="button"
              className={`block w-full truncate rounded px-2 py-1 text-left hover:bg-hover ${selected && samePath(selected, n.path) ? "bg-selected" : ""}`}
              style={{ paddingLeft: 8 + depth * 14 }}
              onClick={() => onSelect(root, n.path)}
            >
              <Icon name="folder" className="mr-1.5 inline text-muted" />
              {n.doc.name}
            </button>
            <FolderRows nodes={n.children} depth={depth + 1} root={root} selected={selected} onSelect={onSelect} />
          </div>
        ) : null,
      )}
    </>
  );
}

function SaveAsBody({ initialName, close }: { initialName: string; close: (v: SaveLocation | null) => void }) {
  const collections = useWorkspace((s) => s.collections);
  const [name, setName] = useState(initialName);
  const [target, setTarget] = useState<{ root: string; dir: string } | null>(
    collections[0] ? { root: collections[0].root, dir: collections[0].root } : null,
  );
  const select = (root: string, dir: string) => setTarget({ root, dir });
  return (
    <Modal
      title="Save request"
      width={460}
      onClose={() => close(null)}
      footer={
        <>
          <Button onClick={() => close(null)}>Cancel</Button>
          <Button variant="primary" disabled={!target || !name.trim()} onClick={() => target && close({ ...target, name: name.trim() })}>
            Save
          </Button>
        </>
      }
    >
      <label className="mb-1 block text-muted">Name</label>
      <input autoFocus className="mb-3 w-full rounded border border-line bg-elevated px-2 py-1.5" value={name} onChange={(e) => setName(e.target.value)} />
      <label className="mb-1 block text-muted">Location</label>
      <div className="h-56 overflow-auto rounded border border-line bg-elevated p-1">
        {collections.length === 0 && <p className="p-2 text-muted">Open a collection folder first.</p>}
        {collections.map((c) => (
          <div key={c.root}>
            <button
              type="button"
              className={`block w-full truncate rounded px-2 py-1 text-left font-medium hover:bg-hover ${target && samePath(target.dir, c.root) ? "bg-selected" : ""}`}
              onClick={() => select(c.root, c.root)}
            >
              <Icon name="collection" className="mr-1.5 inline text-muted" />
              {c.doc.name}
            </button>
            <FolderRows nodes={c.children} depth={1} root={c.root} selected={target?.dir ?? null} onSelect={select} />
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function pickSaveLocation(initialName: string): Promise<SaveLocation | null> {
  return new Promise((resolve) => {
    let result: SaveLocation | null = null;
    void openDialog((close) => (
      <SaveAsBody
        initialName={initialName}
        close={(v) => {
          result = v;
          close();
        }}
      />
    )).then(() => resolve(result));
  });
}
