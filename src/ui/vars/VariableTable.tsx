import { useState } from "react";
import { isListVar, type Variable } from "../../core/model";
import { isValidVarName, toggleVarType } from "../../core/variables";
import { KeyValueTable } from "../common/KeyValueTable";
import { Icon } from "../common/icons";
import { ListItemsTable } from "./ListItemsTable";

const makeVar = (key: string, value: string, enabled: boolean, prev?: Variable): Variable => ({ key, value, enabled, secret: prev?.secret ?? false });

/** Variables with a per-row secret flag; secret values are masked unless revealed. */
export function VariableTable({ variables, onChange, secretHint }: { variables: Variable[]; onChange: (v: Variable[]) => void; secretHint?: string }) {
  const [reveal, setReveal] = useState(false);
  // Keyed by list name; same-named lists expand together (rare edge case).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  return (
    <div>
      <div className="mb-1 flex items-center gap-3 text-[12px] text-muted">
        <span className="flex-1">{secretHint}</span>
        <button type="button" className="flex items-center gap-1 hover:text-fg" onClick={() => setReveal(!reveal)}>
          <Icon name={reveal ? "eyeOff" : "eye"} size={13} />
          {reveal ? "Hide secrets" : "Show secrets"}
        </button>
      </div>
      <KeyValueTable<Variable>
        rows={variables}
        onChange={onChange}
        makeRow={makeVar}
        keyPlaceholder="Variable"
        valuePlaceholder="Value"
        extraHeader="Type · Secret"
        allowBulk={!variables.some(isListVar)}
        renderValue={(row, update) => (
          <div>
            {isListVar(row) ? (
              <>
                <button type="button" className="h-7 px-2 text-left text-muted hover:text-fg" onClick={() => toggleExpanded(row.key)}>
                  {expanded.has(row.key) ? "▾" : "▸"} {(row.items ?? []).filter((i) => i.key).length} items
                </button>
                {expanded.has(row.key) && (
                  <div className="p-1">
                    <ListItemsTable items={row.items ?? []} onChange={(items) => update({ items })} masked={row.secret && !reveal} />
                  </div>
                )}
              </>
            ) : (
              <input
                className="mono h-7 w-full bg-transparent px-2 outline-none focus:bg-elevated"
                type={row.secret && !reveal ? "password" : "text"}
                value={row.value}
                onChange={(e) => update({ value: e.target.value })}
              />
            )}
            {!isValidVarName(row.key) && <div className="px-2 pb-1 text-[11px] text-danger">':' is not allowed in variable names</div>}
          </div>
        )}
        renderExtra={(row, update) => (
          <div className="flex h-7 items-center justify-center gap-2">
            <select
              className="bg-transparent text-[12px] outline-none"
              value={isListVar(row) ? "list" : "text"}
              onChange={(e) => {
                // update() merges, so dropped fields must be reset explicitly
                if ((e.target.value === "list") !== isListVar(row)) update({ type: undefined, items: undefined, ...toggleVarType(row) });
              }}
            >
              <option value="text">Text</option>
              <option value="list">List</option>
            </select>
            <input type="checkbox" title="Secret" checked={row.secret} onChange={(e) => update({ secret: e.target.checked })} />
          </div>
        )}
      />
    </div>
  );
}
