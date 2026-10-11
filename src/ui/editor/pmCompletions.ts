import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { autocompletion } from "@codemirror/autocomplete";

const MEMBERS: Record<string, string[]> = {
  pm: ["variables", "environment", "collectionVariables", "globals", "request", "response", "test", "expect", "sendRequest", "info"],
  "pm.variables": ["get", "set", "has", "unset", "replaceIn", "toObject"],
  "pm.environment": ["get", "set", "has", "unset", "clear", "replaceIn", "toObject"],
  "pm.collectionVariables": ["get", "set", "has", "unset", "clear", "replaceIn", "toObject"],
  "pm.globals": ["get", "set", "has", "unset", "clear", "replaceIn", "toObject"],
  "pm.request": ["url", "method", "name", "headers", "body"],
  "pm.request.headers": ["add", "upsert", "remove", "get", "has", "toObject"],
  "pm.request.body": ["raw", "mode", "update", "toString"],
  "pm.response": ["code", "status", "responseTime", "responseSize", "headers", "json", "text", "to"],
  "pm.response.headers": ["get", "has", "toObject", "all"],
  "pm.response.to": ["have", "be"],
  "pm.response.to.have": ["status", "header", "jsonBody"],
  "pm.response.to.be": ["ok", "success"],
  "pm.info": ["eventName", "requestName"],
};

const FUNCTIONS = new Set(["get", "set", "has", "unset", "clear", "replaceIn", "toObject", "test", "expect", "sendRequest", "add", "upsert", "remove", "json", "text", "status", "header", "jsonBody", "update", "toString", "all"]);

function pmCompletion(ctx: CompletionContext): CompletionResult | null {
  const word = ctx.matchBefore(/[\w.]*$/);
  if (!word) return null;
  const dot = word.text.lastIndexOf(".");
  if (dot < 0) {
    if (!ctx.explicit && word.text.length < 1) return null;
    return { from: word.from, options: [{ label: "pm", type: "variable" }, { label: "console", type: "variable" }, { label: "require", type: "function" }] };
  }
  const owner = word.text.slice(0, dot);
  const members = owner === "console" ? ["log", "info", "warn", "error"] : MEMBERS[owner];
  if (!members) return null;
  return {
    from: word.from + dot + 1,
    options: members.map((m) => ({ label: m, type: FUNCTIONS.has(m) || owner === "console" ? "method" : "property" })),
    validFor: /^\w*$/,
  };
}

export const pmAutocomplete = autocompletion({ override: [pmCompletion] });
