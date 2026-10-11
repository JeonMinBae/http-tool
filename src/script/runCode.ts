import { createPm, type PmHooks } from "./pmApi";
import type { ScriptInput, ScriptOutput } from "./protocol";

/** Globals shadowed inside user scripts so they cannot reach the network or the host. */
const BLOCKED = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "indexedDB", "caches", "self", "globalThis", "window", "postMessage", "__TAURI__", "__TAURI_INTERNALS__"];

export async function runScriptCode(input: ScriptInput, hooks: PmHooks): Promise<ScriptOutput> {
  const { pm, console, require, settle, output } = createPm(input, hooks);
  let error: string | undefined;
  try {
    const fn = new Function("pm", "console", "require", ...BLOCKED, `"use strict"; return (async () => {\n${input.code}\n})();`);
    await fn(pm, console, require);
    await settle();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    await settle().catch(() => {});
  }
  return { ...output(), ...(error !== undefined ? { error } : {}) };
}
