import { useEffect, useRef, useState } from "react";
import { prettyJson } from "../../core/responseFormat";
import { useStreams } from "../../state/streams";
import { Button } from "../common/Button";
import { PulseDot } from "../common/Spinner";

export function EventsView({ tabId }: { tabId: string }) {
  const stream = useStreams((s) => s.byTab[tabId]);
  const [follow, setFollow] = useState(true);
  const [open, setOpen] = useState<number | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const count = stream?.events.length ?? 0;
  useEffect(() => {
    if (follow) end.current?.scrollIntoView({ block: "end" });
  }, [count, follow]);

  if (!stream) return <p className="text-muted">The stream is no longer available.</p>;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex items-center gap-3">
        <span className={`flex items-center gap-1.5 ${stream.status === "open" ? "text-ok" : stream.status === "error" ? "text-danger" : "text-muted"}`}>
          {stream.status === "open" ? (
            <>
              <PulseDot /> Connected
            </>
          ) : stream.status === "error" ? (
            `Error: ${stream.error}`
          ) : (
            "Closed"
          )}
        </span>
        <span className="text-muted">{count} events</span>
        <label className="flex items-center gap-1 text-muted">
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Auto-scroll
        </label>
        <div className="flex-1" />
        {stream.status === "open" && <Button onClick={() => useStreams.getState().stop(tabId)}>Stop</Button>}
      </div>
      <div className="mono min-h-0 flex-1 select-text overflow-auto rounded border border-line">
        {stream.events.map((e, i) => (
          <div key={i} className="cursor-pointer border-b border-line px-2 py-1 hover:bg-hover" onClick={() => setOpen(open === i ? null : i)}>
            <div className="flex gap-3">
              <span className="shrink-0 text-muted">{new Date(e.receivedAt).toLocaleTimeString()}</span>
              <span className="shrink-0 text-accent">{e.event}</span>
              {e.id && <span className="shrink-0 text-muted">#{e.id}</span>}
              <span className={`min-w-0 flex-1 ${open === i ? "whitespace-pre-wrap break-all" : "truncate"}`}>{open === i ? prettyJson(e.data) : e.data}</span>
            </div>
          </div>
        ))}
        {count === 0 && <p className="p-2 text-muted">Waiting for events…</p>}
        <div ref={end} />
      </div>
    </div>
  );
}
