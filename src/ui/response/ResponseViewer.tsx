import { base64ToUtf8 } from "../../core/encoding";
import { useResponses } from "../../state/responses";

export function ResponseViewer({ tabId }: { tabId: string }) {
  const exec = useResponses((s) => s.byTab[tabId]);
  if (!exec) return <div className="flex h-full items-center justify-center text-muted">Send a request to see the response.</div>;
  if (exec.status === "sending") return <div className="flex h-full items-center justify-center text-muted">Sending…</div>;
  if (exec.status === "error")
    return (
      <div className="p-4">
        <p className="mb-1 font-semibold text-danger">Request failed</p>
        <p className="mono whitespace-pre-wrap break-all">{exec.error}</p>
      </div>
    );
  const r = exec.result;
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-3 py-1.5">
        {r.status} {r.statusText} · {r.elapsedMs} ms · {r.size} B
      </div>
      <pre className="mono min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-all p-3">{r.isText ? base64ToUtf8(r.bodyBase64) : "(binary)"}</pre>
    </div>
  );
}
