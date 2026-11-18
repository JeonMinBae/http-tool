import { createPm, type PmHooks } from "./pmApi";
import { loadModules, MODULE_GLOBALS } from "./modules";
import type { ScriptInput, ScriptOutput } from "./protocol";

/** Globals shadowed inside user scripts so they cannot reach the network or the host. */
const BLOCKED = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "indexedDB", "caches", "self", "globalThis", "window", "postMessage", "__TAURI__", "__TAURI_INTERNALS__"];

export async function runScriptCode(input: ScriptInput, hooks: PmHooks): Promise<ScriptOutput> {
  let error: string | undefined;
  const modules = await loadModules(input.code).catch((e) => {
    error = `Failed to load modules: ${e instanceof Error ? e.message : String(e)}`;
    return {};
  });
  const { pm, console, require, settle, output } = createPm(input, hooks, modules);
  if (error !== undefined) return { ...output(), error };
  try {
    const fn = new Function("pm", "console", "require", ...Object.keys(MODULE_GLOBALS), ...BLOCKED, `"use strict"; return (async () => {\n${input.code}\n})();`);
    await fn(pm, console, require, ...Object.values(MODULE_GLOBALS));
    await settle();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    await settle().catch(() => {});
  }
  return { ...output(), ...(error !== undefined ? { error } : {}) };
}
