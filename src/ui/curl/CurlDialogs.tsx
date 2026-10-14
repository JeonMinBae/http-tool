import { useMemo, useState } from "react";
import { toCurl, type Shell } from "../../core/curl/export";
import { parseCurl } from "../../core/curl/import";
import { prepareForTab } from "../../core/execute";
import { unresolvedLabel } from "../../core/prepare";
import type { HttpRequestDoc } from "../../core/model";
import type { Tab } from "../../state/tabs";
import { toast } from "../../state/toasts";
import { newUntitledRequest } from "../actions";
import { Button } from "../common/Button";
import { alertError, Modal, openDialog } from "../common/dialogs";
import { Icon } from "../common/icons";
import { useTransientFlag } from "../common/useTransientFlag";
import { CodeEditor } from "../editor/CodeEditor";

const SHELL_KEY = "curl-shell";
const SHELLS: { id: Shell; label: string }[] = [
  { id: "bash", label: "bash / zsh" },
  { id: "cmd", label: "Windows cmd" },
  { id: "powershell", label: "PowerShell 7+" },
];

function loadShell(): Shell {
  try {
    const s = localStorage.getItem(SHELL_KEY);
    if (s === "bash" || s === "cmd" || s === "powershell") return s;
  } catch {
    /* storage unavailable */
  }
  return navigator.platform.startsWith("Win") ? "cmd" : "bash";
}

function ExportBody({ tab, close }: { tab: Tab<HttpRequestDoc>; close: () => void }) {
  const [shell, setShell] = useState<Shell>(loadShell);
  const [copies, setCopies] = useState(0);
  const copied = useTransientFlag(copies, 1500);
  const result = useMemo(() => {
    try {
      const prepared = prepareForTab(tab.root, tab.path, tab.draft);
      return { text: toCurl(prepared.request, shell), unresolved: prepared.unresolved };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [tab, shell]);

  const choose = (s: Shell) => {
    setShell(s);
    try {
      localStorage.setItem(SHELL_KEY, s);
    } catch {
      /* ignore */
    }
  };

  return (
    <Modal
      title="cURL"
      width={720}
      onClose={close}
      footer={
        <>
          <Button onClick={close}>Close</Button>
          <Button
            variant="primary"
            disabled={!("text" in result)}
            onClick={async () => {
              if (!("text" in result && result.text)) return;
              try {
                await navigator.clipboard.writeText(result.text);
                setCopies((n) => n + 1);
              } catch (e) {
                toast.error("Could not copy", e);
              }
            }}
          >
            {copied ? (
              <>
                <Icon name="check" size={12} /> Copied
              </>
            ) : (
              "Copy"
            )}
          </Button>
        </>
      }
    >
      <div className="mb-2 flex gap-1">
        {SHELLS.map((s) => (
          <button key={s.id} type="button" className={`rounded px-2 py-1 ${shell === s.id ? "bg-selected" : "text-muted hover:text-fg"}`} onClick={() => choose(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      {"error" in result ? (
        <p className="text-danger">{result.error}</p>
      ) : (
        <>
          {result.unresolved && result.unresolved.length > 0 && (
            <p className="mb-2 text-[12px] text-warn">Unresolved variables: {result.unresolved.map(unresolvedLabel).join(", ")}</p>
          )}
          <div className="h-72 rounded border border-line">
            <CodeEditor readOnly lineWrapping value={result.text ?? ""} />
          </div>
          <p className="mt-2 text-[12px] text-muted">Variables are replaced with their current values. Secrets are included as plain text.</p>
        </>
      )}
    </Modal>
  );
}

export function openCurlExport(tab: Tab<HttpRequestDoc>) {
  return openDialog((close) => <ExportBody tab={tab} close={close} />);
}

function ImportBody({ close }: { close: () => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const run = () => {
    try {
      const r = parseCurl(text);
      newUntitledRequest(r.request);
      close();
      if (r.warnings.length) void alertError("Imported with warnings", r.warnings.join("\n"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <Modal
      title="Import cURL"
      width={720}
      onClose={close}
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" disabled={!text.trim()} onClick={run}>
            Import
          </Button>
        </>
      }
    >
      <textarea
        autoFocus
        className="mono h-64 w-full rounded border border-line bg-elevated p-2 outline-none"
        placeholder="curl 'https://api.example.com' -H 'Accept: application/json'"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
      />
      {error && <p className="mt-2 text-danger">{error}</p>}
    </Modal>
  );
}

export function openCurlImport() {
  return openDialog((close) => <ImportBody close={close} />);
}
