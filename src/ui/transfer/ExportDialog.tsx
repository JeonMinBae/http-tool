import { useMemo, useState } from "react";
import type { LoadedCollection, TreeNode } from "../../core/collectionRepo";
import { fromTree } from "../../core/transfer/model";
import { toNative, type NativeScope } from "../../core/transfer/native";
import { unredactedCredentialWarnings } from "../../core/transfer/redact";
import { serializeOpenApi, toOpenApi } from "../../core/transfer/openapi/export";
import { exportToFile } from "../actions";
import { Button } from "../common/Button";
import { Modal, openDialog } from "../common/dialogs";

type Format = "native" | "openapi";

const FORMATS: { id: Format; label: string }[] = [
  { id: "native", label: "HTTP Tool JSON" },
  { id: "openapi", label: "OpenAPI 3.0.3" },
];

function ExportBody({ col, node, close }: { col: LoadedCollection; node?: TreeNode; close: () => void }) {
  const [format, setFormat] = useState<Format>("native");
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const scope: NativeScope = !node ? "collection" : node.type === "folder" ? "folder" : "request";
  const name = node ? node.doc.name : col.doc.name;
  const items = useMemo(() => fromTree(node ? [node] : col.children), [col, node]);
  const openapi = useMemo(
    () => (format === "openapi" ? toOpenApi({ title: name, collection: col.doc, items }) : null),
    [format, name, col.doc, items],
  );
  const plainCredentials = useMemo(
    () => (format === "native" && !includeSecrets ? unredactedCredentialWarnings(items) : []),
    [format, includeSecrets, items],
  );

  const save = async () => {
    const ok =
      format === "native"
        ? await exportToFile(`${name}.httptool.json`, [{ name: "HTTP Tool JSON", extensions: ["json"] }], () =>
            toNative(scope, items, scope === "collection" ? col.doc : undefined, includeSecrets),
          )
        : await exportToFile(
            `${name}.openapi.yaml`,
            [
              { name: "OpenAPI YAML", extensions: ["yaml", "yml"] },
              { name: "OpenAPI JSON", extensions: ["json"] },
            ],
            (path) => serializeOpenApi(openapi!.spec, /\.ya?ml$/i.test(path) ? "yaml" : "json"),
          );
    if (ok) close();
  };

  return (
    <Modal
      title={`Export ${scope}: ${name}`}
      width={560}
      onClose={close}
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            Save…
          </Button>
        </>
      }
    >
      <div className="mb-3 flex gap-1">
        {FORMATS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`rounded px-2 py-1 ${format === f.id ? "bg-selected" : "text-muted hover:text-fg"}`}
            onClick={() => setFormat(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
      {format === "native" ? (
        <>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={includeSecrets} onChange={(e) => setIncludeSecrets(e.target.checked)} />
            Include secrets
          </label>
          <p className="mt-1 text-[12px] text-muted">
            {includeSecrets
              ? "Secret variable values and auth credentials are written as plain text."
              : "Secret variable values and literal auth credentials are left empty. {{variable}} references are kept."}
          </p>
          {plainCredentials.length > 0 && (
            <>
              <p className="mt-2 text-[12px] text-warn">Only the Auth tab is cleared. These values from Headers / Cookies stay in the file:</p>
              <ul className="mt-1 max-h-48 list-disc overflow-auto pl-5 text-[12px] text-warn">
                {plainCredentials.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : (
        <>
          <p className="text-[12px] text-muted">
            Saved as YAML or JSON depending on the file extension. Variables are not replaced with their values.
          </p>
          {openapi && openapi.warnings.length > 0 && (
            <ul className="mt-2 max-h-48 list-disc overflow-auto pl-5 text-[12px] text-warn">
              {openapi.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </Modal>
  );
}

export function openExportDialog(col: LoadedCollection, node?: TreeNode) {
  return openDialog((close) => <ExportBody col={col} node={node} close={close} />);
}
