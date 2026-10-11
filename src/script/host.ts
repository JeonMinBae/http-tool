import type { HostMessage, ScriptInput, ScriptOutput, ScriptResponse, ScriptSendRequest, WorkerMessage } from "./protocol";

export const SCRIPT_TIMEOUT_MS = 10_000;

export interface ScriptHostDeps {
  sendRequest(req: ScriptSendRequest): Promise<ScriptResponse>;
  timeoutMs?: number;
}

/** Runs one script in a fresh Web Worker; the worker is terminated on completion or timeout. */
export function runScript(input: ScriptInput, deps: ScriptHostDeps): Promise<ScriptOutput> {
  const timeoutMs = deps.timeoutMs ?? SCRIPT_TIMEOUT_MS;
  return new Promise((resolve) => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    const send = (m: HostMessage) => worker.postMessage(m);
    let finished = false;
    const finish = (output: ScriptOutput) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      worker.terminate();
      resolve(output);
    };
    const failed = (error: string): ScriptOutput => ({ scopes: input.scopes, request: input.request, tests: [], logs: [], error });

    const timer = setTimeout(() => finish(failed(`Script timed out after ${timeoutMs / 1000}s`)), timeoutMs);

    worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      const msg = e.data;
      if (msg.type === "done") finish(msg.output);
      else if (msg.type === "sendRequest") {
        deps.sendRequest(msg.request).then(
          (response) => !finished && send({ type: "sendResult", id: msg.id, response }),
          (err) => !finished && send({ type: "sendResult", id: msg.id, error: err instanceof Error ? err.message : String(err) }),
        );
      }
    };
    worker.onerror = (e) => finish(failed(e.message || "Script worker failed"));
    send({ type: "run", input });
  });
}
