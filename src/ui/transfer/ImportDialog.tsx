import { useMemo, useState } from "react";
import type { LoadedCollection, TreeNode } from "../../core/collectionRepo";
import { detectImport } from "../../core/transfer/detect";
import { countRequests, type ImportPlan } from "../../core/transfer/model";
import { fileApi } from "../../ipc";
import { useWorkspace } from "../../state/workspace";
import { importAsCollection, importIntoFolder } from "../actions";
import { Button } from "../common/Button";
import { Modal, openDialog } from "../common/dialogs";

interface Target {
  root: string;
  dir: string;
  label: string;
  depth: number;
}

/** Open collections and their folders, depth-first, for the target picker. */
function targetsOf(cols: LoadedCollection[]): Target[] {
  const out: Target[] = [];
  const walk = (root: string, nodes: TreeNode[], depth: number) => {
    for (const n of nodes) {
      if (n.type !== "folder") continue;
      out.push({ root, dir: n.path, label: n.doc.name, depth });
      walk(root, n.children, depth + 1);
    }
  };
  for (const c of cols) {
    out.push({ root: c.root, dir: c.root, label: c.doc.name, depth: 0 });
    walk(c.root, c.children, 1);
  }
  return out;
}

const SOURCE_LABEL = { native: "HTTP Tool collection", openapi: "OpenAPI document" } as const;

function ImportBody({ close }: { close: () => void }) {
  const collections = useWorkspace((s) => s.collections);
  const targets = useMemo(() => targetsOf(collections), [collections]);
  const [text, setText] = useState("");
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [targetIdx, setTargetIdx] = useState(0);
  const [busy, setBusy] = useState(false);

  const chooseFile = async () => {
    try {
      const picked = await fileApi.pickText("Import file", ["json", "yaml", "yml"]);
      if (!picked) return;
      setText(picked.content);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const preview = () => {
    try {
      const p = detectImport(text);
      setPlan(p);
      setTargetIdx(0);
      if (p.kind === "collection") setName(p.collection.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const run = async () => {
    if (!plan) return;
    setBusy(true);
    const target = targets[targetIdx];
    const ok =
      plan.kind === "collection"
        ? await importAsCollection(plan, name.trim())
        : target
          ? await importIntoFolder(target.root, target.dir, plan.items)
          : false;
    setBusy(false);
    if (ok) close();
  };

  if (!plan) {
    return (
      <Modal
        title="Import"
        width={720}
        onClose={close}
        footer={
          <>
            <Button onClick={close}>Cancel</Button>
            <Button variant="primary" disabled={!text.trim()} onClick={preview}>
              Preview
            </Button>
          </>
        }
      >
        <div className="mb-2 flex items-center gap-2">
          <Button onClick={chooseFile}>Choose file…</Button>
          <span className="text-[12px] text-muted">or paste an HTTP Tool export or an OpenAPI 3.0/3.1 document (JSON or YAML)</span>
        </div>
        <textarea
          autoFocus
          className="mono h-64 w-full rounded border border-line bg-elevated p-2 outline-none"
          placeholder={"openapi: 3.0.3\ninfo:\n  title: My API\npaths: …"}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
        />
        {error && <p className="mt-2 whitespace-pre-wrap text-danger">{error}</p>}
      </Modal>
    );
  }

  const canImport = !busy && (plan.kind === "collection" ? !!name.trim() : targets.length > 0);
  const count = countRequests(plan.items);

  return (
    <Modal
      title="Import"
      width={560}
      onClose={close}
      footer={
        <>
          <Button onClick={() => setPlan(null)}>Back</Button>
          <Button variant="primary" disabled={!canImport} onClick={run}>
            {plan.kind === "collection" ? "Choose location & Import" : "Import"}
          </Button>
        </>
      }
    >
      <p className="mb-3">
        {plan.kind === "collection" ? SOURCE_LABEL[plan.source] : "Folders / requests"} · {count} {count === 1 ? "request" : "requests"}
      </p>
      {plan.kind === "collection" ? (
        <>
          <label className="mb-1 block text-muted">New collection name</label>
          <input
            className="w-full rounded border border-line bg-elevated px-2 py-1.5"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </>
      ) : targets.length > 0 ? (
        <>
          <label className="mb-1 block text-muted">Add to</label>
          <select
            className="w-full rounded border border-line bg-elevated px-2 py-1.5"
            value={targetIdx}
            onChange={(e) => setTargetIdx(Number(e.target.value))}
          >
            {targets.map((t, i) => (
              <option key={t.dir} value={i}>
                {"  ".repeat(t.depth) + t.label}
              </option>
            ))}
          </select>
        </>
      ) : (
        <p className="text-warn">Open a collection first to import these items.</p>
      )}
      {plan.warnings.length > 0 && (
        <>
          <p className="mb-1 mt-3 text-muted">Warnings</p>
          <ul className="max-h-48 list-disc overflow-auto pl-5 text-[12px] text-warn">
            {plan.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}

export function openImportDialog() {
  return openDialog((close) => <ImportBody close={close} />);
}
