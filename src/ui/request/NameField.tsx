import { useEffect, useRef, useState } from "react";
import type { HttpRequestDoc, WebSocketDoc } from "../../core/model";
import { useTabs, type Tab } from "../../state/tabs";
import { renameAt } from "../actions";
import { nextName } from "./nameEdit";

export function NameField({ tab }: { tab: Tab<HttpRequestDoc | WebSocketDoc> }) {
  const saved = tab.draft.name;
  const [value, setValue] = useState(saved);
  const cancelled = useRef(false);
  // Follow renames made elsewhere (tree menu, Save As).
  useEffect(() => setValue(saved), [saved]);

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const name = nextName(saved, value);
    if (!name) return setValue(saved);
    if (tab.root && tab.path) {
      const type = tab.draft.kind === "websocket" ? "websocket" : "request";
      void renameAt(tab.root, { type, path: tab.path }, name).then((ok) => ok || setValue(saved));
    } else {
      useTabs.getState().update<HttpRequestDoc | WebSocketDoc>(tab.id, (d) => ({ ...d, name }));
    }
  };

  return (
    <div className="px-3 pt-2">
      <input
        className="w-full rounded bg-transparent px-1 py-0.5 text-[14px] font-medium outline-none hover:bg-hover focus:bg-elevated focus:ring-1 focus:ring-accent"
        value={value}
        aria-label="Request name"
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") {
            cancelled.current = true;
            setValue(saved);
            e.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}
