import type { RequestSettings } from "../../core/model";
import { useSettings } from "../../state/settings";

function TriState({ label, value, global, onChange }: { label: string; value: boolean | undefined; global: boolean; onChange: (v: boolean | undefined) => void }) {
  return (
    <label className="grid grid-cols-[200px_1fr] items-center gap-3">
      <span>{label}</span>
      <select
        className="w-56 rounded border border-line bg-elevated px-2 py-1.5"
        value={value === undefined ? "" : value ? "on" : "off"}
        onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value === "on")}
      >
        <option value="">Default ({global ? "On" : "Off"})</option>
        <option value="on">On</option>
        <option value="off">Off</option>
      </select>
    </label>
  );
}

export function SettingsTab({ settings, onChange }: { settings: RequestSettings; onChange: (s: RequestSettings) => void }) {
  const global = useSettings((s) => s.settings);
  const set = <K extends keyof RequestSettings>(k: K, v: RequestSettings[K]) => {
    const next = { ...settings };
    if (v === undefined) delete next[k];
    else next[k] = v;
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-3">
      <label className="grid grid-cols-[200px_1fr] items-center gap-3">
        <span>Timeout (ms)</span>
        <input
          type="number"
          min={0}
          className="w-56 rounded border border-line bg-elevated px-2 py-1.5"
          placeholder={`Default (${global.timeoutMs})`}
          value={settings.timeoutMs ?? ""}
          onChange={(e) => set("timeoutMs", e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)))}
        />
      </label>
      <TriState label="Follow redirects" value={settings.followRedirects} global={global.followRedirects} onChange={(v) => set("followRedirects", v)} />
      <TriState label="Verify SSL certificates" value={settings.verifySsl} global={global.verifySsl} onChange={(v) => set("verifySsl", v)} />
      <p className="text-[12px] text-muted">Empty values use the global settings.</p>
    </div>
  );
}
