import { httpApi, type HttpResult, type PreparedRequest } from "../ipc";
import { runScript } from "../script/host";
import type { LogEntry, ScriptInput, ScriptRequest, ScriptResponse, ScriptSendRequest, TestResult } from "../script/protocol";
import { useConsole } from "../state/console";
import { useHistory } from "../state/history";
import { useResponses } from "../state/responses";
import { useSettings } from "../state/settings";
import { useTabs } from "../state/tabs";
import { useVariables } from "../state/variables";
import { useWorkspace } from "../state/workspace";
import { resolveAuth, type Chain } from "./auth";
import { ensureFreshToken, tokenKey } from "./oauth2";
import { oauthDeps, resolveOAuth, tokenCache } from "../state/oauthTokens";
import { base64ToUtf8 } from "./encoding";
import type { HttpRequestDoc } from "./model";
import { buildChain, prepareRequest, withScheme } from "./prepare";
import { applyVarChanges } from "./varChanges";
import { buildScopes, type VarScopes } from "./variables";

export interface ExecutionOutcome {
  request?: PreparedRequest;
  result?: HttpResult;
  error?: string;
  tests: TestResult[];
  scriptError?: string;
  unresolved: string[];
}

/** Variable scopes visible to a request in the given collection. */
export function scopesFor(root: string | null) {
  const col = root ? useWorkspace.getState().collectionOf(root) : undefined;
  const env = useVariables.getState().activeEnvironment();
  return buildScopes({ globals: useVariables.getState().globals, environment: env?.variables, collection: col?.doc.variables });
}

const chainFor = (root: string | null, path: string | null, doc: HttpRequestDoc) =>
  buildChain(root ? useWorkspace.getState().collectionOf(root) : undefined, path, doc);

/** Prepares a tab's request exactly as it would be sent (variables, inherited auth, settings) — scripts excluded. */
export function prepareForTab(root: string | null, path: string | null, doc: HttpRequestDoc) {
  const chain = chainFor(root, path, doc);
  const scopes = scopesFor(root);
  const auth = resolveAuth(chain);
  // Uses the cached OAuth token only; no network here.
  const oauthToken = auth.type === "oauth2" ? tokenCache.get(tokenKey(resolveOAuth(auth, scopes)))?.accessToken : undefined;
  return prepareRequest(chain, scopes, useSettings.getState().settings, { oauthToken });
}

const toScriptRequest = (d: HttpRequestDoc): ScriptRequest => ({
  name: d.name,
  method: d.method,
  url: d.url,
  headers: d.headers.map((h) => ({ ...h })),
  body: structuredClone(d.body),
});

function toScriptResponse(r: HttpResult): ScriptResponse {
  return { code: r.status, status: r.statusText, headers: r.headers, body: r.isText ? base64ToUtf8(r.bodyBase64) : "", responseTime: r.elapsedMs, size: r.size };
}

/** Requests made with pm.sendRequest use the global settings and the cookie jar, but no collection auth. */
async function scriptSend(req: ScriptSendRequest): Promise<ScriptResponse> {
  const s = useSettings.getState().settings;
  const result = await httpApi.send({
    method: req.method,
    url: withScheme(req.url),
    headers: req.headers,
    body: req.body === undefined ? { type: "none" } : { type: "text", content: req.body },
    timeoutMs: s.timeoutMs,
    followRedirects: s.followRedirects,
    verifySsl: s.verifySsl,
    proxy: s.proxy,
  });
  return toScriptResponse(result);
}

interface PhaseResult {
  ok: boolean;
  scopes: VarScopes;
  request: ScriptRequest;
}

async function runPhase(
  phase: "pre" | "post",
  chain: Chain,
  ctx: { scopes: VarScopes; request: ScriptRequest; response?: ScriptResponse; hasEnvironment: boolean },
  out: { tests: TestResult[]; logs: (LogEntry & { source: string })[]; errors: string[] },
): Promise<PhaseResult> {
  let { scopes, request } = ctx;
  const levels = [chain.collection, ...chain.folders, chain.request];
  for (const node of levels) {
    const code = node.scripts[phase];
    if (!code.trim()) continue;
    const input: ScriptInput = { phase, code, scopes, request, response: ctx.response, hasEnvironment: ctx.hasEnvironment };
    const result = await runScript(input, { sendRequest: scriptSend });
    const source = `${phase === "pre" ? "Pre-request" : "Post-response"} (${node.kind}: ${node.name})`;
    scopes = result.scopes;
    request = result.request;
    out.tests.push(...result.tests);
    out.logs.push(...result.logs.map((l) => ({ ...l, source })));
    if (result.error) {
      out.errors.push(`${source}: ${result.error}`);
      return { ok: false, scopes, request };
    }
  }
  return { ok: true, scopes, request };
}

/** Persists environment / collection / global changes made by scripts; local variables are discarded. */
async function commitVariables(root: string | null, before: VarScopes, after: VarScopes) {
  const vars = useVariables.getState();
  const env = vars.activeEnvironment();
  if (env) {
    const next = applyVarChanges(env.variables, before.environment, after.environment);
    if (next) await vars.saveEnvironments(vars.environments.map((e) => (e.id === env.id ? { ...e, variables: next } : e)));
  }
  const globals = applyVarChanges(vars.globals, before.global, after.global);
  if (globals) await vars.saveGlobals(globals);
  const col = root ? useWorkspace.getState().collectionOf(root) : undefined;
  if (col) {
    const next = applyVarChanges(col.doc.variables, before.collection, after.collection);
    if (next) {
      await useWorkspace.getState().saveCollectionDoc(col.root, { ...col.doc, variables: next });
      // Keep an open collection settings tab in sync.
      useTabs.getState().refreshSaved(col.root, { ...col.doc, variables: next });
    }
  }
}

export interface ExecuteTarget {
  root: string | null;
  path: string | null;
  doc: HttpRequestDoc;
}

/** Runs pre-request scripts, sends the request, runs post-response scripts and records history/console. */
export async function executeDoc(target: ExecuteTarget, requestId: string = crypto.randomUUID()): Promise<ExecutionOutcome> {
  const { root, path, doc } = target;
  const settings = useSettings.getState().settings;
  const chain = chainFor(root, path, doc);
  const initial = scopesFor(root);
  const hasEnvironment = !!useVariables.getState().activeEnvironment();
  const out = { tests: [] as TestResult[], logs: [] as (LogEntry & { source: string })[], errors: [] as string[] };
  const started = Date.now();
  let prepared: PreparedRequest | undefined;
  let result: HttpResult | undefined;
  let error: string | undefined;
  let unresolved: string[] = [];
  let scopes = initial;

  try {
    const pre = await runPhase("pre", chain, { scopes, request: toScriptRequest(doc), hasEnvironment }, out);
    scopes = pre.scopes;
    if (!pre.ok) throw new Error(out.errors[out.errors.length - 1]);
    const modified: HttpRequestDoc = { ...doc, method: pre.request.method as HttpRequestDoc["method"], url: pre.request.url, headers: pre.request.headers, body: pre.request.body };
    const finalChain = { ...chain, request: modified };
    const auth = resolveAuth(finalChain);
    const oauthToken = auth.type === "oauth2" ? (await ensureFreshToken(resolveOAuth(auth, scopes), oauthDeps, tokenCache)).accessToken : undefined;
    const p = prepareRequest(finalChain, scopes, settings, { oauthToken });
    prepared = p.request;
    unresolved = p.unresolved;
    result = await httpApi.send(prepared);
    const post = await runPhase("post", chain, { scopes, request: pre.request, response: toScriptResponse(result), hasEnvironment }, out);
    scopes = post.scopes;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  await commitVariables(root, initial, scopes).catch((e) => out.errors.push(`Saving variables failed: ${e}`));
  const scriptError = result ? out.errors[0] : undefined;

  useConsole.getState().add({
    id: requestId,
    time: started,
    method: prepared?.method ?? doc.method,
    url: prepared?.url ?? doc.url,
    status: result?.status,
    elapsedMs: result?.elapsedMs,
    logs: out.logs,
    errors: error && !out.errors.includes(error) ? [...out.errors, error] : out.errors,
  });
  if (prepared) {
    void useHistory
      .getState()
      .record({
        id: requestId,
        time: started,
        method: prepared.method,
        url: prepared.url,
        root,
        path,
        request: structuredClone(doc),
        ...(result ? { result } : { error }),
      })
      .catch((e) => console.error("history", e));
  }
  return { request: prepared, result, error, tests: out.tests, scriptError, unresolved };
}

export async function executeRequest(tabId: string): Promise<ExecutionOutcome | undefined> {
  const tab = useTabs.getState().tabs.find((t) => t.id === tabId);
  if (!tab || tab.draft.kind !== "http") return undefined;
  const requestId = crypto.randomUUID();
  useResponses.getState().start(tabId, requestId, []);
  const outcome = await executeDoc({ root: tab.root, path: tab.path, doc: tab.draft }, requestId);
  const responses = useResponses.getState();
  if (outcome.result) responses.finish(tabId, requestId, outcome.result, { tests: outcome.tests, scriptError: outcome.scriptError, unresolved: outcome.unresolved });
  else responses.fail(tabId, requestId, outcome.error ?? "Request failed", outcome.unresolved);
  return outcome;
}
