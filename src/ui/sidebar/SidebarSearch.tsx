import { useEffect, useRef } from "react";
import { useSidebar, type SearchMode } from "../../state/sidebar";
import { Icon } from "../common/icons";

const MODES: { id: SearchMode; label: string }[] = [
  { id: "requests", label: "Requests" },
  { id: "variables", label: "Variables" },
];

export function SidebarSearch() {
  const { query, mode, setQuery, setMode } = useSidebar();
  const focusPending = useSidebar((s) => s.focusPending);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focusPending) return;
    input.current?.focus();
    input.current?.select();
    useSidebar.getState().consumeFocus();
  }, [focusPending]);

  return (
    <div className="shrink-0 border-b border-line p-2">
      <div className="flex items-center gap-2 rounded border border-line bg-elevated px-2 py-1 text-muted focus-within:text-fg">
        <Icon name="search" size={13} />
        <input
          ref={input}
          className="min-w-0 flex-1 bg-transparent text-fg outline-none"
          placeholder={mode === "requests" ? "Search requests…" : "Search variables…"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQuery("")}
        />
      </div>
      <div className="mt-1.5 flex gap-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`rounded px-2 py-0.5 text-[12px] ${mode === m.id ? "bg-selected font-medium" : "text-muted hover:text-fg"}`}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
