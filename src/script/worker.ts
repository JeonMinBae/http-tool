/// <reference lib="webworker" />
import type { HostMessage, ScriptResponse, ScriptSendRequest, WorkerMessage } from "./protocol";
import { lockdownScope } from "./lockdown";
import { runScriptCode } from "./runCode";

const scope = self as unknown as DedicatedWorkerGlobalScope;

// Remove network and storage capabilities from the worker itself (user code also gets them shadowed).
for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "indexedDB", "caches"]) {
  try {
    Object.defineProperty(scope, name, { value: undefined, configurable: false, writable: false });
  } catch {
    /* non-configurable in this engine */
  }
}

// Last: keeps postMessage and the message listener private and freezes the global.
const { post } = lockdownScope<WorkerMessage, HostMessage>(scope, onHostMessage);

let nextId = 1;
const waiting = new Map<number, { resolve: (r: ScriptResponse) => void; reject: (e: Error) => void }>();

function sendRequest(request: ScriptSendRequest): Promise<ScriptResponse> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    post({ type: "sendRequest", id, request });
  });
}

async function onHostMessage(msg: HostMessage) {
  if (msg.type === "sendResult") {
    const w = waiting.get(msg.id);
    waiting.delete(msg.id);
    if (!w) return;
    if (msg.response) w.resolve(msg.response);
    else w.reject(new Error(msg.error ?? "request failed"));
    return;
  }
  if (msg.type === "run") {
    const output = await runScriptCode(msg.input, { sendRequest });
    post({ type: "done", output });
  }
}
