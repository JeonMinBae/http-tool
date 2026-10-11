import { useEffect, useRef } from "react";
import { useConsole } from "../../state/console";

const LEVEL = { log: "text-fg", info: "text-info", warn: "text-warn", error: "text-danger" } as const;

export function ConsolePanel() {
  const { entries, clear, toggle } = useConsole();
  const end = useRef<HTMLDivElement>(null);
  // Braces matter: scrollIntoView returns a Promise in recent Chromium, which must not become the effect cleanup.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [entries.length]);
  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="flex h-7 shrink-0 items-center gap-3 border-b border-line px-3">
        <span className="font-medium">Console</span>
        <div className="flex-1" />
        <button type="button" className="text-[12px] text-muted hover:text-fg" onClick={clear}>
          Clear
        </button>
        <button type="button" className="text-[12px] text-muted hover:text-fg" onClick={() => toggle(false)}>
          Hide
        </button>
      </div>
      <div className="mono min-h-0 flex-1 select-text overflow-auto px-3 py-1">
        {entries.length === 0 && <p className="text-muted">Requests and script logs appear here.</p>}
        {entries.map((e) => (
          <div key={e.id} className="border-b border-line py-1">
            <div className="flex gap-2">
              <span className="text-muted">{new Date(e.time).toLocaleTimeString()}</span>
              <span className="font-semibold">{e.method}</span>
              <span className="min-w-0 flex-1 truncate">{e.url}</span>
              {e.status !== undefined && <span className={e.status >= 400 ? "text-warn" : "text-ok"}>{e.status}</span>}
              {e.elapsedMs !== undefined && <span className="text-muted">{e.elapsedMs} ms</span>}
            </div>
            {e.logs.map((l, i) => (
              <div key={i} className={`whitespace-pre-wrap break-all pl-4 ${LEVEL[l.level]}`} title={l.source}>
                {l.args.join(" ")}
              </div>
            ))}
            {e.errors.map((err, i) => (
              <div key={`e${i}`} className="whitespace-pre-wrap break-all pl-4 text-danger">
                {err}
              </div>
            ))}
          </div>
        ))}
        <div ref={end} />
      </div>
    </div>
  );
}
