import { useCallback, useEffect, useMemo, useState } from "react";
import { cookieApi, type CookieInfo } from "../../ipc";
import { useResponses } from "../../state/responses";
import { Button } from "../common/Button";
import { alertError, confirmDanger, Modal, openDialog } from "../common/dialogs";
import { Icon } from "../common/icons";

const blank = (domain = ""): CookieInfo => ({ domain, hostOnly: true, path: "/", name: "", value: "", expires: null, httpOnly: false, secure: false });

const toLocalInput = (ms: number | null) => {
  if (ms === null) return "";
  const d = new Date(ms);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

function CookieForm({ initial, onCancel, onSave }: { initial: CookieInfo; onCancel: () => void; onSave: (c: CookieInfo) => void }) {
  const [c, setC] = useState(initial);
  const field = "rounded border border-line bg-elevated px-2 py-1";
  return (
    <div className="grid grid-cols-[90px_1fr] items-center gap-2 rounded border border-line p-3">
      <span className="text-muted">Domain</span>
      <input className={`${field} mono`} value={c.domain} onChange={(e) => setC({ ...c, domain: e.target.value })} placeholder="example.com" />
      <span className="text-muted">Name</span>
      <input className={`${field} mono`} value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />
      <span className="text-muted">Value</span>
      <input className={`${field} mono`} value={c.value} onChange={(e) => setC({ ...c, value: e.target.value })} />
      <span className="text-muted">Path</span>
      <input className={`${field} mono`} value={c.path} onChange={(e) => setC({ ...c, path: e.target.value })} />
      <span className="text-muted">Expires</span>
      <input
        type="datetime-local"
        className={field}
        value={toLocalInput(c.expires)}
        onChange={(e) => setC({ ...c, expires: e.target.value ? new Date(e.target.value).getTime() : null })}
      />
      <span />
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-1"><input type="checkbox" checked={!c.hostOnly} onChange={(e) => setC({ ...c, hostOnly: !e.target.checked })} /> Include subdomains</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={c.httpOnly} onChange={(e) => setC({ ...c, httpOnly: e.target.checked })} /> HttpOnly</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={c.secure} onChange={(e) => setC({ ...c, secure: e.target.checked })} /> Secure</label>
      </div>
      <span />
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" disabled={!c.domain.trim() || !c.name.trim()} onClick={() => onSave({ ...c, domain: c.domain.trim().replace(/^\./, ""), name: c.name.trim() })}>
          Save Cookie
        </Button>
      </div>
    </div>
  );
}

function CookieManagerBody({ close }: { close: () => void }) {
  const [cookies, setCookies] = useState<CookieInfo[]>([]);
  const [domain, setDomain] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ original: CookieInfo | null; draft: CookieInfo } | null>(null);
  const responseVersion = useResponses((s) => s.byTab);

  const reload = useCallback(() => cookieApi.list().then(setCookies).catch((e) => alertError("Could not load cookies", e)), []);
  useEffect(() => {
    void reload();
  }, [reload, responseVersion]);

  const domains = useMemo(() => [...new Set(cookies.map((c) => c.domain))].sort(), [cookies]);
  const selected = domain && domains.includes(domain) ? domain : (domains[0] ?? null);
  const rows = cookies.filter((c) => c.domain === selected);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      await alertError("Cookie operation failed", e);
    }
    await reload();
  };

  const saveCookie = (c: CookieInfo) =>
    run(async () => {
      const o = editing?.original;
      if (o && (o.domain !== c.domain || o.path !== c.path || o.name !== c.name)) await cookieApi.remove(o.domain, o.path, o.name);
      await cookieApi.upsert(c);
      setEditing(null);
      setDomain(c.domain);
    });

  return (
    <Modal title="Cookies" width={860} onClose={close} footer={<Button onClick={close}>Close</Button>}>
      <div className="flex h-[55vh] gap-3">
        <div className="flex w-56 shrink-0 flex-col border-r border-line pr-2">
          <div className="mb-1 flex items-center justify-between px-2 text-[11px] uppercase text-muted">
            Domains
            <button type="button" className="text-accent" title="Add cookie" onClick={() => setEditing({ original: null, draft: blank(selected ?? "") })}>
              +
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {domains.map((d) => (
              <div key={d} className={`group flex items-center rounded ${d === selected ? "bg-selected" : "hover:bg-hover"}`}>
                <button type="button" className="mono min-w-0 flex-1 truncate px-2 py-1 text-left" onClick={() => setDomain(d)}>
                  {d}
                </button>
                <button
                  type="button"
                  title="Delete all cookies for this domain"
                  className="invisible px-1 text-muted hover:text-danger group-hover:visible"
                  onClick={async () => (await confirmDanger("Clear cookies", `Delete all cookies for ${d}?`)) && run(() => cookieApi.clear(d))}
                >
                  <Icon name="trash" size={12} />
                </button>
              </div>
            ))}
            {domains.length === 0 && <p className="px-2 text-[12px] text-muted">No cookies stored.</p>}
          </div>
          {domains.length > 0 && (
            <button
              type="button"
              className="mt-2 px-2 text-left text-[12px] text-danger hover:underline"
              onClick={async () => (await confirmDanger("Clear all cookies", "Delete every stored cookie?")) && run(() => cookieApi.clear())}
            >
              Clear all cookies
            </button>
          )}
        </div>
        <div className="min-w-0 flex-1 overflow-auto">
          {editing ? (
            <CookieForm key={JSON.stringify(editing.original)} initial={editing.draft} onCancel={() => setEditing(null)} onSave={saveCookie} />
          ) : (
            <table className="w-full table-fixed border-collapse text-left">
              <thead className="text-[12px] text-muted">
                <tr>
                  <th className="w-1/4 border-b border-line py-1 font-normal">Name</th>
                  <th className="border-b border-line py-1 font-normal">Value</th>
                  <th className="w-16 border-b border-line py-1 font-normal">Path</th>
                  <th className="w-36 border-b border-line py-1 font-normal">Expires</th>
                  <th className="w-14 border-b border-line" />
                </tr>
              </thead>
              <tbody className="mono">
                {rows.map((c) => (
                  <tr key={`${c.path}|${c.name}`} className="group cursor-pointer border-b border-line hover:bg-hover" onClick={() => setEditing({ original: c, draft: c })}>
                    <td className="truncate py-1 pr-2">{c.name}</td>
                    <td className="truncate py-1 pr-2" title={c.value}>{c.value}</td>
                    <td className="truncate py-1 pr-2">{c.path}</td>
                    <td className="truncate py-1 pr-2">{c.expires === null ? "Session" : new Date(c.expires).toLocaleString()}</td>
                    <td className="py-1 text-right">
                      <button
                        type="button"
                        className="invisible px-1 text-muted hover:text-danger group-hover:visible"
                        onClick={(e) => {
                          e.stopPropagation();
                          void run(() => cookieApi.remove(c.domain, c.path, c.name));
                        }}
                      >
                        <Icon name="trash" size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function openCookieManager() {
  return openDialog((close) => <CookieManagerBody close={close} />);
}
