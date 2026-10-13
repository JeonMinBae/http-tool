import { useEffect, useState, type ReactNode } from "react";
import type { KeyValue } from "../../core/model";
import { Icon } from "./icons";
import { VarInput } from "../editor/VarInput";

export interface KeyValueTableProps<T extends KeyValue> {
  rows: T[];
  onChange: (rows: T[]) => void;
  /** Builds a new row (used for the trailing blank row and bulk edit). */
  makeRow: (key: string, value: string, enabled: boolean, prev?: T) => T;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  /** Renders the value cell; defaults to a text input. */
  renderValue?: (row: T, update: (patch: Partial<T>) => void) => ReactNode;
  /** Extra cell before the delete button. */
  renderExtra?: (row: T, update: (patch: Partial<T>) => void) => ReactNode;
  extraHeader?: string;
  allowBulk?: boolean;
  readOnly?: boolean;
}

const cell = "h-7 w-full bg-transparent px-2 outline-none placeholder:text-muted/60 focus:bg-elevated";

const varCell = "min-h-7 w-full bg-transparent focus-within:bg-elevated";

/** Bulk format: one `key: value` per line, disabled rows prefixed with `//`. */
export function toBulk(rows: KeyValue[]): string {
  return rows.filter((r) => r.key || r.value).map((r) => `${r.enabled ? "" : "//"}${r.key}: ${r.value}`).join("\n");
}

export function fromBulk<T extends KeyValue>(text: string, makeRow: KeyValueTableProps<T>["makeRow"], prev: T[]): T[] {
  return text
    .split("\n")
    .filter((l) => l.trim())
    .map((line) => {
      const enabled = !line.trimStart().startsWith("//");
      const body = enabled ? line : line.trimStart().slice(2);
      const i = body.indexOf(":");
      const key = (i < 0 ? body : body.slice(0, i)).trim();
      const value = i < 0 ? "" : body.slice(i + 1).trim();
      return makeRow(key, value, enabled, prev.find((p) => p.key === key));
    });
}

export function KeyValueTable<T extends KeyValue>({
  rows,
  onChange,
  makeRow,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
  renderValue,
  renderExtra,
  extraHeader,
  allowBulk = true,
  readOnly,
}: KeyValueTableProps<T>) {
  const [bulk, setBulk] = useState<string | null>(null);
  useEffect(() => {
    if (!allowBulk) setBulk(null);
  }, [allowBulk]);

  // allowBulk can turn off while the editor is open (e.g. secrets hidden again).
  if (bulk !== null && allowBulk) {
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
          placeholder={"key: value\n//disabled: value"}
          onChange={(e) => {
            setBulk(e.target.value);
            onChange(fromBulk(e.target.value, makeRow, rows));
          }}
        />
      </div>
    );
  }

  const update = (i: number, patch: Partial<T>) => {
    if (i === rows.length) onChange([...rows, { ...makeRow("", "", true), ...patch }]);
    else onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };
  const remove = (i: number) => onChange(rows.filter((_, j) => j !== i));
  const all = readOnly ? rows : [...rows, makeRow("", "", true)];

  return (
    <div>
      {allowBulk && !readOnly && (
        <div className="mb-1 flex justify-end">
          <button type="button" className="text-[12px] text-accent hover:underline" onClick={() => setBulk(toBulk(rows))}>
            Bulk Edit
          </button>
        </div>
      )}
      <table className="w-full table-fixed border-collapse border border-line">
        <colgroup>
          <col className="w-8" />
          <col className="w-[35%]" />
          <col />
          {renderExtra && <col className="w-28" />}
          <col className="w-8" />
        </colgroup>
        <thead>
          <tr className="text-left text-[12px] text-muted">
            <th className="border border-line" />
            <th className="border border-line px-2 py-1 font-normal">{keyPlaceholder}</th>
            <th className="border border-line px-2 py-1 font-normal">{valuePlaceholder}</th>
            {renderExtra && <th className="border border-line px-2 py-1 font-normal">{extraHeader}</th>}
            <th className="border border-line" />
          </tr>
        </thead>
        <tbody>
          {all.map((row, i) => {
            const placeholder = i === rows.length;
            const patch = (p: Partial<T>) => update(i, p);
            return (
              <tr key={i} className={`group ${row.enabled || placeholder ? "" : "text-muted"}`}>
                <td className="border border-line text-center">
                  {!placeholder && (
                    <input type="checkbox" checked={row.enabled} disabled={readOnly} onChange={(e) => patch({ enabled: e.target.checked } as Partial<T>)} />
                  )}
                </td>
                <td className="border border-line">
                  <input
                    className={`${cell} mono`}
                    value={row.key}
                    readOnly={readOnly}
                    placeholder={placeholder ? keyPlaceholder : ""}
                    onChange={(e) => patch({ key: e.target.value } as Partial<T>)}
                  />
                </td>
                <td className="border border-line">
                  {renderValue && !placeholder ? (
                    renderValue(row, patch)
                  ) : (
                    <VarInput
                      className={`${varCell} mono`}
                      value={row.value}
                      readOnly={readOnly}
                      placeholder={placeholder ? valuePlaceholder : ""}
                      onChange={(v) => patch({ value: v } as Partial<T>)}
                    />
                  )}
                </td>
                {renderExtra && <td className="border border-line">{renderExtra(row, patch)}</td>}
                <td className="border border-line text-center">
                  {!placeholder && !readOnly && (
                    <button type="button" className="invisible text-muted hover:text-danger group-hover:visible" onClick={() => remove(i)} title="Remove">
                      <Icon name="trash" size={13} />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
