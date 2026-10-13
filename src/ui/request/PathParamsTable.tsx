import { useState } from "react";
import type { PathParam } from "../../core/model";
import { applyBulkValues, visiblePathParams } from "../../core/pathParams";
import { toBulk } from "../common/KeyValueTable";
import { VarInput } from "../editor/VarInput";

const cell = "h-7 w-full bg-transparent px-2 outline-none placeholder:text-muted/60 focus:bg-elevated";

/** Rows follow the URL; names are not editable here. `rows` is the full draft list (incl. remembered rows). */
export function PathParamsTable({ url, rows, onChange }: { url: string; rows: PathParam[]; onChange: (rows: PathParam[]) => void }) {
  const [bulk, setBulk] = useState<string | null>(null);
  const visible = visiblePathParams(url, rows);
  // Visible rows missing from the draft are added so edits and bulk text can target them.
  const full = [...rows, ...visible.filter((v) => !rows.some((r) => r.key === v.key))];
  const setRow = (key: string, patch: Partial<PathParam>) => onChange(full.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  if (bulk !== null) {
    return (
      <div>
        <div className="mb-1 flex justify-end">
          <button type="button" className="text-[12px] text-accent hover:underline" onClick={() => setBulk(null)}>
            Key-Value Edit
          </button>
        </div>
        <textarea
          autoFocus
          className="mono h-48 w-full rounded border border-line bg-elevated p-2 outline-none"
          value={bulk}
          placeholder="name: value"
          onChange={(e) => {
            setBulk(e.target.value);
            onChange(applyBulkValues(full, e.target.value));
          }}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1 flex justify-end">
        <button
          type="button"
          className="text-[12px] text-accent hover:underline"
          onClick={() => setBulk(toBulk(visible.map((p) => ({ key: p.key, value: p.value, enabled: true }))))}
        >
          Bulk Edit
        </button>
      </div>
      <table className="w-full table-fixed border-collapse border border-line">
        <colgroup>
          <col className="w-[35%]" />
          <col />
          <col className="w-[30%]" />
        </colgroup>
        <thead>
          <tr className="text-left text-[12px] text-muted">
            <th className="border border-line px-2 py-1 font-normal">Key</th>
            <th className="border border-line px-2 py-1 font-normal">Value</th>
            <th className="border border-line px-2 py-1 font-normal">Description</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <tr key={row.key}>
              <td className="mono border border-line px-2">{row.key}</td>
              <td className="border border-line">
                <VarInput className="min-h-7 w-full bg-transparent focus-within:bg-elevated mono" value={row.value} onChange={(v) => setRow(row.key, { value: v })} />
              </td>
              <td className="border border-line">
                <input className={cell} value={row.description} onChange={(e) => setRow(row.key, { description: e.target.value })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
