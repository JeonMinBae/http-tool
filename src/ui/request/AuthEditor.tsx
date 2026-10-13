import type { Auth, AuthType } from "../../core/model";
import { VarInput } from "../editor/VarInput";
import { OAuth2Editor } from "./OAuth2Editor";
const LABELS: Record<AuthType, string> = {
  inherit: "Inherit from parent",
  none: "No Auth",
  bearer: "Bearer Token",
  basic: "Basic Auth",
  apikey: "API Key",
  oauth2: "OAuth 2.0",
};

function defaults(type: AuthType): Auth {
  switch (type) {
    case "bearer":
      return { type, token: "" };
    case "basic":
      return { type, username: "", password: "" };
    case "apikey":
      return { type, key: "", value: "", in: "header" };
    case "oauth2":
      return { type, grant: "client_credentials", authUrl: "", tokenUrl: "", clientId: "", clientSecret: "", scope: "", usePkce: true, redirectUri: "", clientAuth: "header", tokenPrefix: "Bearer" };
    default:
      return { type } as Auth;
  }
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="grid grid-cols-[120px_1fr] items-center gap-3">
      <span className="text-muted">{label}</span>
      {type === "password" ? (
        <input type="password" className="mono rounded border border-line bg-elevated px-2 py-1.5 outline-none" value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <VarInput className="mono rounded border border-line bg-elevated" value={value} onChange={onChange} />
      )}
    </label>
  );
}

export function AuthEditor({ auth, onChange, allowInherit = true, root = null }: { auth: Auth; onChange: (a: Auth) => void; allowInherit?: boolean; root?: string | null }) {
  const types = (Object.keys(LABELS) as AuthType[]).filter((t) => allowInherit || t !== "inherit");
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <label className="grid grid-cols-[120px_1fr] items-center gap-3">
        <span className="text-muted">Type</span>
        <select className="rounded border border-line bg-elevated px-2 py-1.5" value={auth.type} onChange={(e) => onChange(defaults(e.target.value as AuthType))}>
          {types.map((t) => (
            <option key={t} value={t}>
              {LABELS[t]}
            </option>
          ))}
        </select>
      </label>
      {auth.type === "inherit" && <p className="text-muted">Uses the auth of the parent folder or collection.</p>}
      {auth.type === "bearer" && <Field label="Token" value={auth.token} onChange={(token) => onChange({ ...auth, token })} />}
      {auth.type === "basic" && (
        <>
          <Field label="Username" value={auth.username} onChange={(username) => onChange({ ...auth, username })} />
          <Field label="Password" type="password" value={auth.password} onChange={(password) => onChange({ ...auth, password })} />
        </>
      )}
      {auth.type === "apikey" && (
        <>
          <Field label="Key" value={auth.key} onChange={(key) => onChange({ ...auth, key })} />
          <Field label="Value" value={auth.value} onChange={(value) => onChange({ ...auth, value })} />
          <label className="grid grid-cols-[120px_1fr] items-center gap-3">
            <span className="text-muted">Add to</span>
            <select className="rounded border border-line bg-elevated px-2 py-1.5" value={auth.in} onChange={(e) => onChange({ ...auth, in: e.target.value as "header" | "query" })}>
              <option value="header">Header</option>
              <option value="query">Query Params</option>
            </select>
          </label>
        </>
      )}
      {auth.type === "oauth2" && <OAuth2Editor auth={auth} onChange={onChange} root={root} />}
      {auth.type !== "inherit" && auth.type !== "none" && auth.type !== "oauth2" && <p className="text-[12px] text-muted">{"Values support {{variables}}."}</p>}
    </div>
  );
}
