import { useState } from "react";
import type { Variable } from "../../core/model";
import { KeyValueTable } from "../common/KeyValueTable";
import { Icon } from "../common/icons";

const makeVar = (key: string, value: string, enabled: boolean, prev?: Variable): Variable => ({ key, value, enabled, secret: prev?.secret ?? false });

/** Variables with a per-row secret flag; secret values are masked unless revealed. */
export function VariableTable({ variables, onChange, secretHint }: { variables: Variable[]; onChange: (v: Variable[]) => void; secretHint?: string }) {
  const [reveal, setReveal] = useState(false);
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
        extraHeader="Secret"
        renderValue={(row, update) => (
          <input
            className="mono h-7 w-full bg-transparent px-2 outline-none focus:bg-elevated"
            type={row.secret && !reveal ? "password" : "text"}
            value={row.value}
            onChange={(e) => update({ value: e.target.value })}
          />
        )}
        renderExtra={(row, update) => (
          <label className="flex h-7 items-center justify-center">
            <input type="checkbox" checked={row.secret} onChange={(e) => update({ secret: e.target.checked })} />
          </label>
        )}
      />
    </div>
  );
}
