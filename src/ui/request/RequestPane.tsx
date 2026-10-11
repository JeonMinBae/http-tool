import type { CollectionDoc, FolderDoc, HttpRequestDoc, WebSocketDoc } from "../../core/model";
import { WsEditor } from "../ws/WsEditor";
import { ContainerSettings } from "../collection/ContainerSettings";
import { RunnerView } from "../runner/RunnerView";
import { useResponses } from "../../state/responses";
import { useTabs, type Tab } from "../../state/tabs";
import { Split } from "../common/Split";
import { ResponseViewer } from "../response/ResponseViewer";
import { RequestEditor } from "./RequestEditor";

function UnresolvedWarning({ tabId }: { tabId: string }) {
  // Select the stable array reference; a fresh `?? []` per call makes zustand re-render forever.
  const unresolved = useResponses((s) => s.byTab[tabId]?.unresolved);
  if (!unresolved?.length) return null;
  return (
    <div className="border-b border-line bg-warn/10 px-3 py-1 text-[12px] text-warn">
      Unresolved variables: {unresolved.map((u) => `{{${u}}}`).join(", ")}
    </div>
  );
}

export function RequestPane() {
  const tab = useTabs((s) => s.tabs.find((t) => t.id === s.activeId));
  if (!tab) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        Open a request from the sidebar or press <span className="mono mx-1">⌘/Ctrl+N</span> to create one.
      </div>
    );
  }
  if (tab.draft.kind === "websocket") return <WsEditor key={tab.id} tab={tab as Tab<WebSocketDoc>} />;
  if (tab.draft.kind === "runner") return <RunnerView key={tab.id} root={tab.root!} path={tab.path!} />;
  if (tab.draft.kind !== "http") return <ContainerSettings key={tab.id} tab={tab as Tab<CollectionDoc | FolderDoc>} />;
  const reqTab = tab as Tab<HttpRequestDoc>;
  return (
    <Split
      id="request-response"
      orientation="vertical"
      panes={[
        { id: "request", defaultSize: "50", minSize: 120, children: <RequestEditor key={tab.id} tab={reqTab} /> },
        {
          id: "response",
          minSize: 80,
          children: (
            <div className="flex h-full flex-col">
              <UnresolvedWarning tabId={tab.id} />
              <div className="min-h-0 flex-1">
                <ResponseViewer tabId={tab.id} />
              </div>
            </div>
          ),
        },
      ]}
    />
  );
}
