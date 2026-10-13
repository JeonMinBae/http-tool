import { useCallback, useMemo } from "react";
import { parseCurl } from "../../core/curl/import";
import { executeRequest } from "../../core/execute";
import { HTTP_METHODS, type HttpMethod, type HttpRequestDoc } from "../../core/model";
import { syncParamsFromUrl } from "../../core/params";
import { syncPathParams } from "../../core/pathParams";
import { useResponses } from "../../state/responses";
import { useStreams } from "../../state/streams";
import { useTabs, type Tab } from "../../state/tabs";
import { saveTab } from "../actions";
import { Button, IconButton } from "../common/Button";
import { alertError } from "../common/dialogs";
import { Icon } from "../common/icons";
import { openCurlExport } from "../curl/CurlDialogs";
import { methodColor } from "../common/methodColor";
import { pathParamHighlight } from "../editor/pathParamHighlight";
import { CodeEditor } from "../editor/CodeEditor";
import { useVarExtension } from "../editor/useScopes";

export function UrlBar({ tab }: { tab: Tab<HttpRequestDoc> }) {
  const update = useTabs((s) => s.update);
  const exec = useResponses((s) => s.byTab[tab.id]);
  const sending = exec?.status === "sending";
  const send = useCallback(() => void executeRequest(tab.id), [tab.id]);
  const d = tab.draft;
  const varExt = useVarExtension(tab.root);
  const pathKey = JSON.stringify(d.pathParams);
  const pathExt = useMemo(() => pathParamHighlight(d.pathParams), [pathKey]);
  const urlExt = useMemo(() => [...varExt, ...pathExt], [varExt, pathExt]);
  const onPaste = useCallback(
    (text: string) => {
      if (!/^\s*curl(\.exe)?\s/i.test(text)) return false;
      try {
        const { request, warnings } = parseCurl(text);
        // Keep identity (name/seq) of the tab; replace the request definition.
        update<HttpRequestDoc>(tab.id, (x) => ({ ...request, name: x.name, seq: x.seq, scripts: x.scripts }));
        if (warnings.length) void alertError("Imported with warnings", warnings.join("\n"));
      } catch (e) {
        void alertError("Could not import cURL", e);
      }
      return true;
    },
    [tab.id, update],
  );

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <div className="flex min-w-0 flex-1 items-stretch rounded border border-line bg-elevated">
        <select
          className={`mono w-24 shrink-0 cursor-pointer border-r border-line bg-transparent px-2 font-bold outline-none ${methodColor(d.method)}`}
          value={d.method}
          onChange={(e) => update<HttpRequestDoc>(tab.id, (x) => ({ ...x, method: e.target.value as HttpMethod }))}
        >
          {HTTP_METHODS.map((m) => (
            <option key={m} value={m} className="text-fg">
              {m}
            </option>
          ))}
        </select>
        <div className="min-w-0 flex-1">
          <CodeEditor
            singleLine
            extensions={urlExt}
            value={d.url}
            placeholder="Enter URL or paste text"
            onEnter={send}
            onPaste={onPaste}
            onChange={(url) => update<HttpRequestDoc>(tab.id, (x) => ({ ...x, url, params: syncParamsFromUrl(url, x.params), pathParams: syncPathParams(url, x.pathParams) }))}
          />
        </div>
      </div>
      {sending ? (
        <Button
          className="w-20"
          onClick={() => {
            useResponses.getState().cancel(tab.id);
            void useStreams.getState().stop(tab.id);
          }}
        >
          Cancel
        </Button>
      ) : (
        <Button variant="primary" className="w-20" onClick={send}>
          Send
        </Button>
      )}
      <Button onClick={() => void saveTab(tab.id)}>Save</Button>
      <IconButton title="Export as cURL" onClick={() => openCurlExport(tab)}>
        <Icon name="code" />
      </IconButton>
    </div>
  );
}
