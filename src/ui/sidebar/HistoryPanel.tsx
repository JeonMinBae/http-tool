import { useEffect } from "react";
import { HTTP_METHODS, type HttpMethod } from "../../core/model";
import { historyApi, type HistorySummary } from "../../ipc";
import { useHistory } from "../../state/history";
import { useResponses } from "../../state/responses";
import { useTabs } from "../../state/tabs";
import { alertError, confirmDanger } from "../common/dialogs";
import { methodColor, methodLabel } from "../common/methodColor";

function dayLabel(time: number): string {
  const d = new Date(time);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString();
}

function shortUrl(url: string) {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

async function restore(item: HistorySummary) {
  try {
    const entry = await historyApi.get(item.id);
    const id = useTabs.getState().open(null, null, { ...entry.request, name: entry.request.name || shortUrl(entry.url) });
    const responses = useResponses.getState();
    if (entry.result) responses.set(id, { status: "done", requestId: entry.id, result: entry.result, unresolved: [], receivedAt: entry.time });
    else if (entry.error) responses.set(id, { status: "error", requestId: entry.id, error: entry.error, unresolved: [] });
  } catch (e) {
    await alertError("Could not open history entry", e);
  }
}

export function HistoryPanel() {
  const { items, load, clear } = useHistory();
  useEffect(() => {
    load().catch((e) => console.error("history", e));
  }, [load]);

  if (!items.length) return <div className="p-4 text-center text-muted">No history yet.</div>;

  const groups = new Map<string, HistorySummary[]>();
  for (const it of items) {
    const k = dayLabel(it.time);
    groups.set(k, [...(groups.get(k) ?? []), it]);
  }

  return (
    <div>
      <div className="flex justify-end px-2 pb-1">
        <button
          type="button"
          className="text-[12px] text-muted hover:text-danger"
          onClick={async () => (await confirmDanger("Clear history", "Delete all history entries?", "Clear")) && clear()}
        >
          Clear all
        </button>
      </div>
      {[...groups.entries()].map(([day, list]) => (
        <div key={day} className="mb-2">
          <div className="px-3 py-1 text-[11px] uppercase text-muted">{day}</div>
          {list.map((it) => {
            const m = (HTTP_METHODS as readonly string[]).includes(it.method) ? (it.method as HttpMethod) : "GET";
            return (
              <button
                key={it.id}
                type="button"
                title={`${it.url}\n${new Date(it.time).toLocaleString()}${it.error ? `\n${it.error}` : ""}`}
                className="flex h-7 w-full items-center gap-1.5 px-2 text-left hover:bg-hover"
                onClick={() => restore(it)}
              >
                <span className={`mono w-9 shrink-0 text-right text-[10px] font-bold ${methodColor(m)}`}>{methodLabel(m)}</span>
                <span className="min-w-0 flex-1 truncate">{shortUrl(it.url)}</span>
                <span className={`mono text-[11px] ${it.error ? "text-danger" : it.status && it.status >= 400 ? "text-warn" : "text-muted"}`}>
                  {it.error ? "ERR" : it.status}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
