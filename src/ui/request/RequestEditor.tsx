import { useState } from "react";
import type { HttpRequestDoc, KeyValue } from "../../core/model";
import { syncUrlFromParams } from "../../core/params";
import { useTabs, type Tab } from "../../state/tabs";
import { paramsBadge, visiblePathParams } from "../../core/pathParams";
import { KeyValueTable } from "../common/KeyValueTable";
import { PathParamsTable } from "./PathParamsTable";
import { AuthEditor } from "./AuthEditor";
import { BodyEditor } from "./BodyEditor";
import { ScriptsEditor } from "./ScriptsEditor";
import { SettingsTab } from "./SettingsTab";
import { NameField } from "./NameField";
import { UrlBar } from "./UrlBar";
import { useVarExtension } from "../editor/useScopes";
import { VarRootContext } from "../editor/VarInput";

type Section = "params" | "headers" | "body" | "auth" | "cookies" | "scripts" | "settings";

const kv = (key: string, value: string, enabled: boolean): KeyValue => ({ key, value, enabled });
const count = (rows: KeyValue[]) => rows.filter((r) => r.enabled && r.key).length;

export function SectionTabs<S extends string>({ sections, active, onSelect }: { sections: { id: S; label: string; badge?: number | string }[]; active: S; onSelect: (s: S) => void }) {
  return (
    <div className="flex shrink-0 gap-4 border-b border-line px-3">
      {sections.map((s) => (
        <button
          key={s.id}
          type="button"
          className={`-mb-px border-b-2 py-1.5 transition-colors ${active === s.id ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"}`}
          onClick={() => onSelect(s.id)}
        >
          {s.label}
          {s.badge ? <span className="ml-1 text-[11px] text-ok">{s.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function RequestEditor({ tab }: { tab: Tab<HttpRequestDoc> }) {
  const [section, setSection] = useState<Section>("params");
  const update = useTabs((s) => s.update);
  const d = tab.draft;
  const varExt = useVarExtension(tab.root);
  const patch = (p: Partial<HttpRequestDoc>) => update<HttpRequestDoc>(tab.id, (x) => ({ ...x, ...p }));

  return (
    <VarRootContext.Provider value={tab.root}>
      <div className="flex h-full flex-col">
        <NameField tab={tab} />
        <UrlBar tab={tab} />
        <SectionTabs<Section>
          active={section}
          onSelect={setSection}
          sections={[
            { id: "params", label: "Params", badge: paramsBadge(d) },
            { id: "headers", label: "Headers", badge: count(d.headers) },
            { id: "body", label: "Body", badge: d.body.type === "none" ? undefined : "●" },
            { id: "auth", label: "Auth", badge: d.auth.type === "inherit" || d.auth.type === "none" ? undefined : "●" },
            { id: "cookies", label: "Cookies", badge: count(d.cookies) },
            { id: "scripts", label: "Scripts", badge: d.scripts.pre.trim() || d.scripts.post.trim() ? "●" : undefined },
            { id: "settings", label: "Settings", badge: Object.keys(d.settings).length ? "●" : undefined },
          ]}
        />
        <div className="min-h-0 flex-1 overflow-auto p-3">
          {section === "params" && (
            <>
              <h3 className="mb-1 text-[12px] text-muted">Query Params</h3>
              <KeyValueTable
                rows={d.params}
                makeRow={kv}
                extensions={varExt}
                onChange={(params) => update<HttpRequestDoc>(tab.id, (x) => ({ ...x, params, url: syncUrlFromParams(x.url, params) }))}
              />
              {visiblePathParams(d.url, d.pathParams).length > 0 && (
                <>
                  <h3 className="mb-1 mt-4 text-[12px] text-muted">Path Params</h3>
                  <PathParamsTable url={d.url} rows={d.pathParams} onChange={(pathParams) => patch({ pathParams })} />
                </>
              )}
            </>
          )}
          {section === "headers" && <KeyValueTable rows={d.headers} makeRow={kv} extensions={varExt} onChange={(headers) => patch({ headers })} />}
          {section === "body" && <BodyEditor body={d.body} extensions={varExt} onChange={(body) => patch({ body })} />}
          {section === "auth" && <AuthEditor auth={d.auth} root={tab.root} onChange={(auth) => patch({ auth })} />}
          {section === "cookies" && (
            <>
              <p className="mb-2 text-[12px] text-muted">
                Sent as a Cookie header. When set, cookies from the cookie jar are not added to this request.
              </p>
              <KeyValueTable rows={d.cookies} makeRow={kv} extensions={varExt} onChange={(cookies) => patch({ cookies })} />
            </>
          )}
          {section === "scripts" && <ScriptsEditor scripts={d.scripts} onChange={(scripts) => patch({ scripts })} />}
          {section === "settings" && <SettingsTab settings={d.settings} onChange={(settings) => patch({ settings })} />}
        </div>
      </div>
    </VarRootContext.Provider>
  );
}
