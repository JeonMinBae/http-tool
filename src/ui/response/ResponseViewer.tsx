import { save } from "@tauri-apps/plugin-dialog";
import { useMemo, useState } from "react";
import { base64ToUtf8 } from "../../core/encoding";
import { detectKind, formatSent, formatSize, headerValue, parseSetCookie, prettyJson, prettyXml, PRETTY_LIMIT, type BodyKind } from "../../core/responseFormat";
import { fileApi, type HttpResult } from "../../ipc";
import { useResponses } from "../../state/responses";
import { alertError } from "../common/dialogs";
import { CodeEditor, type EditorLanguage } from "../editor/CodeEditor";
import { SectionTabs } from "../request/RequestEditor";

type Section = "body" | "headers" | "cookies" | "request";
type BodyMode = "pretty" | "raw" | "preview";

function statusColor(status: number) {
  if (status < 300) return "text-ok";
  if (status < 400) return "text-[#2563eb] dark:text-[#60a5fa]";
  if (status < 500) return "text-warn";
  return "text-danger";
}

const LANG: Record<BodyKind, EditorLanguage> = { json: "json", xml: "xml", html: "html", image: "text", text: "text", binary: "text" };

function Table({ rows }: { rows: [string, string][] }) {
  if (!rows.length) return <p className="text-muted">None</p>;
  return (
    <table className="w-full table-fixed border-collapse">
      <tbody>
        {rows.map(([k, v], i) => (
          <tr key={i} className="border-b border-line align-top">
            <td className="mono w-1/3 break-all py-1 pr-3 font-medium">{k}</td>
            <td className="mono select-text break-all py-1">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Body({ r }: { r: HttpResult }) {
  const contentType = headerValue(r.headers, "content-type");
  const text = useMemo(() => (r.isText ? base64ToUtf8(r.bodyBase64) : ""), [r]);
  const kind = detectKind(contentType, r.isText, text);
  const tooLarge = r.size > PRETTY_LIMIT;
  const modes: BodyMode[] = kind === "binary" ? [] : kind === "image" ? ["preview"] : kind === "html" ? ["pretty", "raw", "preview"] : ["pretty", "raw"];
  const [mode, setMode] = useState<BodyMode>(kind === "image" ? "preview" : tooLarge ? "raw" : "pretty");
  const active = modes.includes(mode) ? mode : modes[0];
  const pretty = useMemo(() => {
    if (active !== "pretty") return "";
    return kind === "json" ? prettyJson(text) : kind === "xml" || kind === "html" ? prettyXml(text) : text;
  }, [active, kind, text]);

  const saveToFile = async () => {
    const path = await save({ title: "Save response body" });
    if (path) await fileApi.saveBase64(path, r.bodyBase64).catch((e) => alertError("Could not save", e));
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex items-center gap-1">
        {modes.map((m) => (
          <button
            key={m}
            type="button"
            disabled={m === "pretty" && tooLarge}
            title={m === "pretty" && tooLarge ? "Response too large to format" : undefined}
            className={`rounded px-2 py-0.5 capitalize disabled:opacity-40 ${active === m ? "bg-selected" : "text-muted hover:text-fg"}`}
            onClick={() => setMode(m)}
          >
            {m}
          </button>
        ))}
        <div className="flex-1" />
        <button type="button" className="text-[12px] text-muted hover:text-fg" onClick={saveToFile}>
          Save to file
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded border border-line">
        {kind === "binary" ? (
          <div className="p-3 text-muted">Binary response ({contentType ?? "unknown type"}). Use "Save to file" to inspect it.</div>
        ) : active === "preview" ? (
          kind === "image" ? (
            <div className="flex h-full items-center justify-center overflow-auto p-3">
              <img alt="response" src={`data:${contentType};base64,${r.bodyBase64}`} className="max-h-full max-w-full" />
            </div>
          ) : (
            <iframe title="preview" sandbox="" srcDoc={text} className="h-full w-full bg-white" />
          )
        ) : (
          <CodeEditor readOnly lineWrapping value={active === "pretty" ? pretty : text} language={active === "pretty" ? LANG[kind] : "text"} />
        )}
      </div>
    </div>
  );
}

function Cookies({ r }: { r: HttpResult }) {
  const cookies = r.headers.filter(([k]) => k.toLowerCase() === "set-cookie").map(([, v]) => parseSetCookie(v));
  if (!cookies.length) return <p className="text-muted">No cookies set by this response.</p>;
  return (
    <table className="w-full border-collapse text-left">
      <thead className="text-[12px] text-muted">
        <tr>
          {["Name", "Value", "Domain", "Path", "Expires", "HttpOnly", "Secure"].map((h) => (
            <th key={h} className="border-b border-line py-1 pr-3 font-normal">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="mono">
        {cookies.map((c, i) => (
          <tr key={i} className="border-b border-line">
            <td className="py-1 pr-3">{c.name}</td>
            <td className="max-w-64 select-text break-all py-1 pr-3">{c.value}</td>
            <td className="py-1 pr-3">{c.domain ?? ""}</td>
            <td className="py-1 pr-3">{c.path ?? ""}</td>
            <td className="py-1 pr-3">{c.expires ?? (c.maxAge ? `max-age ${c.maxAge}` : "Session")}</td>
            <td className="py-1 pr-3">{c.httpOnly ? "✓" : ""}</td>
            <td className="py-1 pr-3">{c.secure ? "✓" : ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Redirects({ r }: { r: HttpResult }) {
  if (!r.redirects.length) return null;
  return (
    <div className="mono flex flex-wrap items-center gap-1 border-b border-line px-3 py-1 text-[11px] text-muted">
      {r.redirects.map((h, i) => (
        <span key={i} title={h.url}>
          {h.status} {h.method} {new URL(h.url).pathname} →
        </span>
      ))}
      <span>
        {r.status} {r.sent.method} {new URL(r.sent.url).pathname}
      </span>
    </div>
  );
}

function Result({ r }: { r: HttpResult }) {
  const [section, setSection] = useState<Section>("body");
  const cookieCount = r.headers.filter(([k]) => k.toLowerCase() === "set-cookie").length;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 border-b border-line px-3 py-1.5">
        <span className="font-semibold">Response</span>
        <span className={`font-semibold ${statusColor(r.status)}`}>
          {r.status} {r.statusText}
        </span>
        <span className="text-muted">{r.elapsedMs} ms</span>
        <span className="text-muted">{formatSize(r.size)}</span>
        <span className="text-muted">{r.httpVersion}</span>
      </div>
      <Redirects r={r} />
      <SectionTabs<Section>
        active={section}
        onSelect={setSection}
        sections={[
          { id: "body", label: "Body" },
          { id: "headers", label: "Headers", badge: r.headers.length },
          { id: "cookies", label: "Cookies", badge: cookieCount },
          { id: "request", label: "Request" },
        ]}
      />
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {section === "body" && <Body key={r.bodyBase64.length + r.elapsedMs} r={r} />}
        {section === "headers" && <Table rows={r.headers} />}
        {section === "cookies" && <Cookies r={r} />}
        {section === "request" && (
          <div className="h-full rounded border border-line">
            <CodeEditor readOnly lineWrapping value={formatSent(r.sent)} />
          </div>
        )}
      </div>
    </div>
  );
}

export function ResponseViewer({ tabId }: { tabId: string }) {
  const exec = useResponses((s) => s.byTab[tabId]);
  if (!exec) return <div className="flex h-full items-center justify-center text-muted">Send a request to see the response.</div>;
  if (exec.status === "sending") return <div className="flex h-full items-center justify-center text-muted">Sending…</div>;
  if (exec.status === "error")
    return (
      <div className="p-4">
        <p className="mb-1 font-semibold text-danger">Request failed</p>
        <p className="mono select-text whitespace-pre-wrap break-all">{exec.error}</p>
      </div>
    );
  return <Result r={exec.result} />;
}
