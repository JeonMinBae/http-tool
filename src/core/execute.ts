import { httpApi, type HttpResult, type PreparedRequest } from "../ipc";
import type { HttpRequestDoc } from "./model";
import { buildChain, prepareRequest } from "./prepare";
import { buildScopes } from "./variables";
import { useHistory } from "../state/history";
import { useResponses } from "../state/responses";
import { useSettings } from "../state/settings";
import { useTabs } from "../state/tabs";
import { useVariables } from "../state/variables";
import { useWorkspace } from "../state/workspace";

export interface ExecutionOutcome {
  request?: PreparedRequest;
  result?: HttpResult;
  error?: string;
}

/** Variable scopes visible to a request in the given collection. */
export function scopesFor(root: string | null) {
  const col = root ? useWorkspace.getState().collectionOf(root) : undefined;
  const env = useVariables.getState().activeEnvironment();
  return buildScopes({ globals: useVariables.getState().globals, environment: env?.variables, collection: col?.doc.variables });
}

/** Prepares a tab's request exactly as it would be sent (variables, inherited auth, settings). */
export function prepareForTab(root: string | null, path: string | null, doc: HttpRequestDoc) {
  const col = root ? useWorkspace.getState().collectionOf(root) : undefined;
  return prepareRequest(buildChain(col, path, doc), scopesFor(root), useSettings.getState().settings);
}

export async function executeRequest(tabId: string): Promise<ExecutionOutcome> {
  const tab = useTabs.getState().tabs.find((t) => t.id === tabId);
  if (!tab || tab.draft.kind !== "http") return { error: "not a request tab" };
  const responses = useResponses.getState();
  const requestId = crypto.randomUUID();

  let prepared;
  try {
    prepared = prepareForTab(tab.root, tab.path, tab.draft);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    responses.start(tabId, requestId, []);
    responses.fail(tabId, requestId, error);
    return { error };
  }

  responses.start(tabId, requestId, prepared.unresolved);
  const record = (outcome: { result?: HttpResult; error?: string }) =>
    useHistory
      .getState()
      .record({
        id: requestId,
        time: Date.now(),
        method: prepared.request.method,
        url: prepared.request.url,
        root: tab.root,
        path: tab.path,
        request: structuredClone(tab.draft) as HttpRequestDoc,
        ...outcome,
      })
      .catch((e) => console.error("history", e));
  try {
    const result = await httpApi.send(prepared.request);
    useResponses.getState().finish(tabId, requestId, result);
    void record({ result });
    return { request: prepared.request, result };
  } catch (e) {
    const error = String(e);
    useResponses.getState().fail(tabId, requestId, error);
    void record({ error });
    return { request: prepared.request, error };
  }
}
