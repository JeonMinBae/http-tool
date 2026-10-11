import { useState } from "react";
import type { GlobalSettings } from "../../core/model";
import { validateSettings } from "../../core/settingsValidation";
import { useSettings } from "../../state/settings";
import { Button } from "../common/Button";
import { Modal, openDialog } from "../common/dialogs";

const input = "rounded border border-line bg-elevated px-2 py-1.5";

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[180px_1fr] items-start gap-3 py-2">
      <div>
        <div>{label}</div>
        {hint && <div className="text-[12px] text-muted">{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function SettingsBody({ close }: { close: () => void }) {
  const store = useSettings();
  const [s, setS] = useState<GlobalSettings>(store.settings);
  const error = validateSettings(s);
  const proxy = (p: Partial<GlobalSettings["proxy"]>) => setS({ ...s, proxy: { ...s.proxy, ...p } });

  return (
    <Modal
      title="Settings"
      width={600}
      onClose={close}
      footer={
        <>
          {error && <span className="mr-auto self-center text-[12px] text-danger">{error}</span>}
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" disabled={!!error} onClick={async () => { await store.update(s); close(); }}>
            Save
          </Button>
        </>
      }
    >
      <h3 className="mb-1 font-semibold">Requests</h3>
      <Row label="Timeout (ms)" hint="0 means no timeout">
        <input type="number" min={0} className={`${input} w-40`} value={s.timeoutMs} onChange={(e) => setS({ ...s, timeoutMs: Number(e.target.value) })} />
      </Row>
      <Row label="Follow redirects">
        <input type="checkbox" checked={s.followRedirects} onChange={(e) => setS({ ...s, followRedirects: e.target.checked })} />
      </Row>
      <Row label="Verify SSL certificates" hint="Turn off for self-signed servers">
        <input type="checkbox" checked={s.verifySsl} onChange={(e) => setS({ ...s, verifySsl: e.target.checked })} />
      </Row>

      <h3 className="mb-1 mt-3 font-semibold">Proxy</h3>
      <Row label="Mode">
        <select className={input} value={s.proxy.mode} onChange={(e) => proxy({ mode: e.target.value as GlobalSettings["proxy"]["mode"] })}>
          <option value="system">Use system proxy</option>
          <option value="none">No proxy</option>
          <option value="manual">Manual</option>
        </select>
      </Row>
      {s.proxy.mode === "manual" && (
        <>
          <Row label="Proxy URL" hint="http, https, socks5 or socks5h">
            <input className={`${input} mono w-full`} placeholder="http://proxy.local:8080" value={s.proxy.url} onChange={(e) => proxy({ url: e.target.value })} />
          </Row>
          <Row label="Bypass" hint="Comma separated hosts">
            <input className={`${input} mono w-full`} placeholder="localhost,127.0.0.1,.internal" value={s.proxy.bypass} onChange={(e) => proxy({ bypass: e.target.value })} />
          </Row>
        </>
      )}

      <h3 className="mb-1 mt-3 font-semibold">History</h3>
      <Row label="Entries to keep">
        <input type="number" min={1} max={10000} className={`${input} w-40`} value={s.historyLimit} onChange={(e) => setS({ ...s, historyLimit: Number(e.target.value) })} />
      </Row>
    </Modal>
  );
}

export function openSettings() {
  return openDialog((close) => <SettingsBody close={close} />);
}
