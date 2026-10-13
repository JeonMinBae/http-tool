import { useEffect, useRef, useState } from "react";
import type { ClippedText, ConsoleDetail } from "../../core/consoleDetail";
import { useConsole } from "../../state/console";
import { Icon } from "../common/icons";

const LEVEL = { log: "text-fg", info: "text-info", warn: "text-warn", error: "text-danger" } as const;

export function ConsolePanel() {
  const { entries, clear, toggle } = useConsole();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const flip = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
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
            <button type="button" className="flex w-full gap-2 text-left" onClick={() => flip(e.id)} disabled={!e.detail}>
              <Icon name="chevronRight" size={12} className={`mt-0.5 shrink-0 text-muted transition-transform ${open.has(e.id) ? "rotate-90" : ""}`} />
              <span className="text-muted">{new Date(e.time).toLocaleTimeString()}</span>
              <span className="font-semibold">{e.method}</span>
              <span className="min-w-0 flex-1 truncate">{e.url}</span>
              {e.status !== undefined && <span className={e.status >= 400 ? "text-warn" : "text-ok"}>{e.status}</span>}
              {e.elapsedMs !== undefined && <span className="text-muted">{e.elapsedMs} ms</span>}
            </button>
            {e.detail && open.has(e.id) && <EntryDetail d={e.detail} />}
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

function Body({ body }: { body: ClippedText }) {
  if (!body.text) return null;
  return (
    <>
      <pre className="mt-1 whitespace-pre-wrap break-all">{body.text}</pre>
      {body.truncated && <p className="text-[11px] text-warn">… truncated to 64 KB</p>}
    </>
  );
}

function EntryDetail({ d }: { d: ConsoleDetail }) {
  return (
    <div className="my-1 ml-4 grid gap-2 border-l border-line pl-3">
      <section>
        <div className="text-[11px] uppercase text-muted">Request</div>
        {d.request ? (
          <>
            <pre className="whitespace-pre-wrap break-all">{d.request.head}</pre>
            <Body body={d.request.body} />
          </>
        ) : (
          <p className="text-muted">Not sent.</p>
        )}
      </section>
      <section>
        <div className="text-[11px] uppercase text-muted">Response</div>
        {d.response ? (
          <>
            <pre className="whitespace-pre-wrap break-all">{[`${d.response.status} ${d.response.statusText}`, ...d.response.headers.map(([k, v]) => `${k}: ${v}`)].join("\n")}</pre>
            <Body body={d.response.body} />
          </>
        ) : (
          <p className="text-danger">{d.error ?? "No response."}</p>
        )}
      </section>
    </div>
  );
}
