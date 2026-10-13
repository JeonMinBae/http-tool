import type { KeyValue } from "../../core/model";
import { KeyValueTable } from "../common/KeyValueTable";

const makeItem = (key: string, value: string, enabled: boolean): KeyValue => ({ key, value, enabled });

/** Item table of a list variable; masks values when the list is secret and not revealed. */
export function ListItemsTable({ items, onChange, masked }: { items: KeyValue[]; onChange: (items: KeyValue[]) => void; masked: boolean }) {
  return (
    <KeyValueTable<KeyValue>
      rows={items}
      onChange={onChange}
      makeRow={makeItem}
      keyPlaceholder="Item"
      valuePlaceholder="Value"
      renderValue={(row, update) => (
        <input
          className="mono h-7 w-full bg-transparent px-2 outline-none focus:bg-elevated"
          type={masked ? "password" : "text"}
          value={row.value}
          onChange={(e) => update({ value: e.target.value })}
        />
      )}
    />
  );
}
