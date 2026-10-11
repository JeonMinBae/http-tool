import { useMemo, useRef, useState } from "react";
import type { TreeNode } from "../../core/collectionRepo";
import { base64ToUtf8 } from "../../core/encoding";
import { executeDoc, type ExecutionOutcome } from "../../core/execute";
import type { HttpRequestDoc } from "../../core/model";
import { samePath } from "../../core/path";
import { runCollection, type RunItem, type RunResult, type RunSummary } from "../../core/runner";
import { useWorkspace } from "../../state/workspace";
import { Button } from "../common/Button";
import { Icon } from "../common/icons";
import { methodColor, methodLabel } from "../common/methodColor";

interface Row extends RunItem {
  doc: HttpRequestDoc;
  enabled: boolean;
}

function collect(nodes: TreeNode[], prefix: string[]): Row[] {
  return nodes.flatMap((n) =>
    n.type === "folder"
      ? collect(n.children, [...prefix, n.doc.name])
      : n.type === "request"
        ? [{ path: n.path, name: [...prefix, n.doc.name].join(" / "), doc: n.doc, enabled: true }]
        : [],
  );
}

function useRequests(root: string, path: string): Row[] {
  const col = useWorkspace((s) => s.collections.find((c) => samePath(c.root, root)));
  return useMemo(() => {
    if (!col) return [];
    if (samePath(path, root)) return collect(col.children, []);
    const find = (nodes: TreeNode[]): TreeNode[] | null => {
      for (const n of nodes) {
        if (n.type !== "folder") continue;
        if (samePath(n.path, path)) return n.children;
        const f = find(n.children);
        if (f) return f;
      }
      return null;
    };
    return collect(find(col.children) ?? [], []);
  }, [col, path, root]);
}

type Result = RunResult & { outcome: ExecutionOutcome };

export function RunnerView({ root, path }: { root: string; path: string }) {
  const available = useRequests(root, path);
  const [order, setOrder] = useState<string[] | null>(null);
  const [disabled, setDisabled] = useState<Set<string>>(new Set());
  const [iterations, setIterations] = useState(1);
  const [delayMs, setDelayMs] = useState(0);
  const [stopOnFailure, setStopOnFailure] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const dragFrom = useRef<number | null>(null);

  // Keep user ordering but follow tree changes (new requests appended, removed ones dropped).
  const rows: Row[] = useMemo(() => {
    const byPath = new Map(available.map((r) => [r.path, r]));
    const ordered = (order ?? []).filter((p) => byPath.has(p)).map((p) => byPath.get(p)!);
    const rest = available.filter((r) => !(order ?? []).includes(r.path));
    return [...ordered, ...rest].map((r) => ({ ...r, enabled: !disabled.has(r.path) }));
  }, [available, order, disabled]);

  const move = (from: number, to: number) => {
    const paths = rows.map((r) => r.path);
    const [p] = paths.splice(from, 1);
    paths.splice(to, 0, p);
    setOrder(paths);
  };

  const run = async () => {
    const items = rows.filter((r) => r.enabled);
    if (!items.length) return;
    const ctrl = new AbortController();
    abort.current = ctrl;
    setRunning(true);
    setResults([]);
    setSummary(null);
    setSelected(null);
    const docs = new Map(items.map((r) => [r.path, r.doc]));
    const s = await runCollection(
      {
        items: items.map(({ path, name }) => ({ path, name })),
        iterations: Math.max(1, iterations),
        delayMs: Math.max(0, delayMs),
        stopOnFailure,
        signal: ctrl.signal,
        execute: (item) => executeDoc({ root, path: item.path, doc: docs.get(item.path)! }),
      },
      (r) => setResults((prev) => [...prev, r as Result]),
    );
    setSummary(s);
    setRunning(false);
  };

  const sel = selected !== null ? results[selected] : undefined;
  const input = "rounded border border-line bg-elevated px-2 py-1";

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-[42%] min-w-72 flex-col border-r border-line">
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
          <label className="flex items-center gap-1">
            Iterations
            <input type="number" min={1} className={`${input} w-16`} value={iterations} onChange={(e) => setIterations(Number(e.target.value))} />
          </label>
          <label className="flex items-center gap-1">
            Delay (ms)
            <input type="number" min={0} className={`${input} w-20`} value={delayMs} onChange={(e) => setDelayMs(Number(e.target.value))} />
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={stopOnFailure} onChange={(e) => setStopOnFailure(e.target.checked)} /> Stop on failure
          </label>
          <div className="flex-1" />
          {running ? (
            <Button onClick={() => abort.current?.abort()}>
              <Icon name="stop" size={12} /> Stop
            </Button>
          ) : (
            <Button variant="primary" disabled={!rows.some((r) => r.enabled)} onClick={run}>
              <Icon name="play" size={12} /> Run
            </Button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-auto py-1">
          {rows.length === 0 && <p className="p-3 text-muted">No requests in this folder.</p>}
          {rows.map((r, i) => (
            <div
              key={r.path}
              draggable={!running}
              onDragStart={() => (dragFrom.current = i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => dragFrom.current !== null && move(dragFrom.current, i)}
              className={`flex h-7 cursor-grab items-center gap-2 px-3 hover:bg-hover ${r.enabled ? "" : "opacity-50"}`}
            >
              <input
                type="checkbox"
                checked={r.enabled}
                disabled={running}
                onChange={(e) => {
                  const next = new Set(disabled);
                  if (e.target.checked) next.delete(r.path);
                  else next.add(r.path);
                  setDisabled(next);
                }}
              />
              <span className={`mono w-9 shrink-0 text-right text-[10px] font-bold ${methodColor(r.doc.method)}`}>{methodLabel(r.doc.method)}</span>
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
            </div>
          ))}
        </div>
        <p className="border-t border-line px-3 py-1.5 text-[11px] text-muted">Saved versions of requests are run. Drag to reorder.</p>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-4 border-b border-line px-3 py-2">
          <span className="font-semibold">Results</span>
          {summary ? (
            <span className="text-muted">
              {summary.total} requests · <span className={summary.failed ? "text-danger" : "text-ok"}>{summary.failed} failed</span> · tests{" "}
              <span className="text-ok">{summary.testsPassed} passed</span>
              {summary.testsFailed > 0 && <span className="text-danger">, {summary.testsFailed} failed</span>} · {summary.elapsedMs} ms
              {summary.stopped && " · stopped"}
            </span>
          ) : (
            running && <span className="text-muted">Running… {results.length} done</span>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 bg-bg text-[12px] text-muted">
              <tr>
                <th className="w-10 px-3 py-1 font-normal">#</th>
                <th className="px-2 py-1 font-normal">Request</th>
                <th className="w-20 px-2 py-1 font-normal">Status</th>
                <th className="w-20 px-2 py-1 font-normal">Time</th>
                <th className="w-24 px-2 py-1 font-normal">Tests</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => {
                const passed = r.outcome.tests.filter((t) => t.passed).length;
                return (
                  <tr key={i} className={`cursor-pointer border-b border-line ${selected === i ? "bg-selected" : "hover:bg-hover"}`} onClick={() => setSelected(i)}>
                    <td className="px-3 py-1 text-muted">{r.iteration}</td>
                    <td className="truncate px-2 py-1">{r.name}</td>
                    <td className={`px-2 py-1 ${r.outcome.error ? "text-danger" : (r.outcome.result?.status ?? 0) >= 400 ? "text-warn" : "text-ok"}`}>
                      {r.outcome.error ? "Error" : r.outcome.result?.status}
                    </td>
                    <td className="px-2 py-1 text-muted">{r.outcome.result ? `${r.outcome.result.elapsedMs} ms` : "–"}</td>
                    <td className={`px-2 py-1 ${r.failed ? "text-danger" : "text-ok"}`}>
                      {r.outcome.tests.length ? `${passed}/${r.outcome.tests.length}` : r.failed ? "failed" : "–"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {sel && (
          <div className="h-[40%] min-h-32 overflow-auto border-t border-line p-3">
            <p className="mono mb-2 break-all text-[12px]">
              {sel.outcome.request?.method} {sel.outcome.request?.url}
            </p>
            {sel.outcome.error && <p className="mono mb-2 text-danger">{sel.outcome.error}</p>}
            {sel.outcome.scriptError && <p className="mono mb-2 text-danger">{sel.outcome.scriptError}</p>}
            {sel.outcome.tests.map((t, i) => (
              <p key={i} className={t.passed ? "text-ok" : "text-danger"}>
                {t.passed ? "PASS" : "FAIL"} {t.name}
                {t.error && <span className="text-muted"> — {t.error}</span>}
              </p>
            ))}
            {sel.outcome.result && (
              <pre className="mono mt-2 max-h-64 select-text overflow-auto whitespace-pre-wrap break-all rounded border border-line p-2">
                {sel.outcome.result.isText ? base64ToUtf8(sel.outcome.result.bodyBase64).slice(0, 20000) : "(binary response)"}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
