import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyValue, SavedMessage, WebSocketDoc } from "../../core/model";
import { interpolate } from "../../core/variables";
import { utf8ToBase64, base64ToBytes } from "../../core/encoding";
import { useSettings } from "../../state/settings";
import { useTabs, type Tab } from "../../state/tabs";
import { useWebSockets } from "../../state/websockets";
import { saveTab } from "../actions";
import { Button } from "../common/Button";
import { askText } from "../common/dialogs";
import { Icon } from "../common/icons";
import { KeyValueTable } from "../common/KeyValueTable";
import { PulseDot, Spinner } from "../common/Spinner";
import { CodeEditor } from "../editor/CodeEditor";
import { useScopes, useVarExtension } from "../editor/useScopes";
import { NameField } from "../request/NameField";
import { SectionTabs } from "../request/RequestEditor";
import { Split } from "../common/Split";

type Section = "message" | "headers" | "settings";

const kv = (key: string, value: string, enabled: boolean): KeyValue => ({ key, value, enabled });

const hexPreview = (b64: string) => {
  try {
    return [...base64ToBytes(b64).slice(0, 64)].map((b) => b.toString(16).padStart(2, "0")).join(" ");
  } catch {
    return b64;
  }
};

function Log({ tabId }: { tabId: string }) {
  const conn = useWebSockets((s) => s.byTab[tabId]);
  const end = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState("");
  const log = useMemo(() => (conn?.log ?? []).filter((e) => !filter || e.data.toLowerCase().includes(filter.toLowerCase())), [conn, filter]);
  // Braces matter: scrollIntoView returns a Promise in recent Chromium, which must not become the effect cleanup.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [log.length]);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-line px-3 py-1.5">
        <span className="font-semibold">Messages</span>
        <input className="w-48 rounded border border-line bg-elevated px-2 py-0.5" placeholder="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <div className="flex-1" />
        <button type="button" className="text-[12px] text-muted hover:text-fg" onClick={() => useWebSockets.getState().clearLog(tabId)}>
          Clear
        </button>
      </div>
      <div className="mono min-h-0 flex-1 select-text overflow-auto">
        {log.length === 0 && <p className="p-3 text-muted">No messages yet.</p>}
        {log.map((e, i) => (
          <div key={i} className="flex gap-2 border-b border-line px-3 py-1">
            <span className="shrink-0 text-muted">{new Date(e.at).toLocaleTimeString()}</span>
            <span
              className={`w-4 shrink-0 ${e.kind === "in" ? "text-ok" : e.kind === "out" ? "text-accent" : e.kind === "error" ? "text-danger" : "text-muted"}`}
              title={e.kind}
            >
              {e.kind === "in" ? "↓" : e.kind === "out" ? "↑" : "•"}
            </span>
            <span className={`min-w-0 flex-1 whitespace-pre-wrap break-all ${e.kind === "error" ? "text-danger" : e.kind === "open" || e.kind === "close" ? "text-muted" : ""}`}>
              {e.binary ? <span title="binary (hex preview)">[binary] {hexPreview(e.data)}</span> : e.data}
            </span>
            {(e.kind === "in" || e.kind === "out") && (
              <span className="shrink-0 text-[11px] text-muted">{e.binary ? Math.floor((e.data.length * 3) / 4) : new TextEncoder().encode(e.data).length} B</span>
            )}
          </div>
        ))}
        <div ref={end} />
      </div>
    </div>
  );
}

export function WsEditor({ tab }: { tab: Tab<WebSocketDoc> }) {
  const update = useTabs((s) => s.update);
  const d = tab.draft;
  const patch = (p: Partial<WebSocketDoc>) => update<WebSocketDoc>(tab.id, (x) => ({ ...x, ...p }));
  const conn = useWebSockets((s) => s.byTab[tab.id]);
  const status = conn?.status ?? "closed";
  const { scopes } = useScopes(tab.root);
  const varExt = useVarExtension(tab.root);
  const verifySsl = useSettings((s) => s.settings.verifySsl);
  const [section, setSection] = useState<Section>("message");
  const [message, setMessage] = useState("");
  const [binary, setBinary] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = () => {
    const t = (v: string) => interpolate(v, scopes).value;
    void useWebSockets.getState().connect(tab.id, {
      url: t(d.url.trim()),
      headers: d.headers.filter((h) => h.enabled && h.key).map((h) => [t(h.key), t(h.value)]),
      subprotocols: d.subprotocols.map(t).filter(Boolean),
      verifySsl,
    });
  };

  const send = () => {
    setError(null);
    const text = interpolate(message, scopes).value;
    if (binary) {
      try {
        base64ToBytes(text.trim());
      } catch {
        setError("Binary messages must be base64 encoded.");
        return;
      }
      void useWebSockets.getState().send(tab.id, true, text.trim());
    } else void useWebSockets.getState().send(tab.id, false, text);
  };

  const saveMessage = async () => {
    const name = await askText("Save message", "Name", `Message ${d.savedMessages.length + 1}`);
    if (name) patch({ savedMessages: [...d.savedMessages, { name, type: binary ? "binary" : "text", content: message }] });
  };

  const load = (m: SavedMessage) => {
    setMessage(m.content);
    setBinary(m.type === "binary");
  };

  return (
    <Split
      id="ws"
      orientation="vertical"
      panes={[
        {
          id: "ws-editor",
          defaultSize: "45",
          minSize: 150,
          children: (
            <div className="flex h-full flex-col">
              <NameField tab={tab} />
              <div className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1 rounded border border-line bg-elevated">
                  <CodeEditor singleLine extensions={varExt} value={d.url} placeholder="wss://example.com/socket" onEnter={connect} onChange={(url) => patch({ url })} />
                </div>
                {status === "closed" ? (
                  <Button variant="primary" className="w-28" disabled={!d.url.trim()} onClick={connect}>
                    Connect
                  </Button>
                ) : (
                  <Button className="w-28" onClick={() => useWebSockets.getState().disconnect(tab.id)}>
                    {status === "connecting" ? (
                      <>
                        <Spinner /> Connecting…
                      </>
                    ) : (
                      <>
                        <PulseDot /> Disconnect
                      </>
                    )}
                  </Button>
                )}
                <Button onClick={() => void saveTab(tab.id)}>Save</Button>
              </div>
              <SectionTabs<Section>
                active={section}
                onSelect={setSection}
                sections={[
                  { id: "message", label: "Message" },
                  { id: "headers", label: "Headers", badge: d.headers.filter((h) => h.enabled && h.key).length },
                  { id: "settings", label: "Settings" },
                ]}
              />
              <div className="min-h-0 flex-1 overflow-auto p-3">
                {section === "message" && (
                  <div className="flex h-full min-h-0 gap-3">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="min-h-0 flex-1 rounded border border-line">
                        <CodeEditor extensions={varExt} language={binary ? "text" : "json"} value={message} onChange={setMessage} />
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <label className="flex items-center gap-1">
                          <input type="radio" checked={!binary} onChange={() => setBinary(false)} /> Text
                        </label>
                        <label className="flex items-center gap-1">
                          <input type="radio" checked={binary} onChange={() => setBinary(true)} /> Binary (base64)
                        </label>
                        {binary && (
                          <button type="button" className="text-[12px] text-accent hover:underline" onClick={() => setMessage(utf8ToBase64(message))}>
                            Encode text as base64
                          </button>
                        )}
                        {error && <span className="text-[12px] text-danger">{error}</span>}
                        <div className="flex-1" />
                        <Button onClick={saveMessage} disabled={!message}>
                          Save Message
                        </Button>
                        <Button variant="primary" disabled={status !== "open" || !message} onClick={send}>
                          Send
                        </Button>
                      </div>
                    </div>
                    <div className="flex w-48 shrink-0 flex-col">
                      <div className="mb-1 text-[11px] uppercase text-muted">Saved messages</div>
                      <div className="min-h-0 flex-1 overflow-auto">
                        {d.savedMessages.length === 0 && <p className="text-[12px] text-muted">None saved.</p>}
                        {d.savedMessages.map((m, i) => (
                          <div key={i} className="group flex items-center rounded hover:bg-hover">
                            <button type="button" className="min-w-0 flex-1 truncate px-2 py-1 text-left" title={m.content} onClick={() => load(m)}>
                              {m.name}
                              {m.type === "binary" && <span className="ml-1 text-[10px] text-muted">bin</span>}
                            </button>
                            <button
                              type="button"
                              className="invisible px-1 text-muted hover:text-danger group-hover:visible"
                              onClick={() => patch({ savedMessages: d.savedMessages.filter((_, j) => j !== i) })}
                            >
                              <Icon name="trash" size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {section === "headers" && <KeyValueTable rows={d.headers} makeRow={kv} extensions={varExt} onChange={(headers) => patch({ headers })} />}
                {section === "settings" && (
                  <label className="grid grid-cols-[160px_1fr] items-center gap-3">
                    <span>Subprotocols</span>
                    <input
                      className="mono rounded border border-line bg-elevated px-2 py-1.5"
                      placeholder="chat.v1, chat.v2"
                      value={d.subprotocols.join(", ")}
                      onChange={(e) => patch({ subprotocols: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                    />
                  </label>
                )}
              </div>
            </div>
          ),
        },
        { id: "ws-log", minSize: 100, children: <Log tabId={tab.id} /> },
      ]}
    />
  );
}
