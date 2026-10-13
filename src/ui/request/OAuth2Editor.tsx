import { useState } from "react";
import { getNewToken, isExpired, tokenKey } from "../../core/oauth2";
import type { OAuth2Auth } from "../../core/model";
import { oauthDeps, resolveOAuth, tokenCache, useOAuthTokens } from "../../state/oauthTokens";
import { toast } from "../../state/toasts";
import { Button } from "../common/Button";
import { Spinner } from "../common/Spinner";
import { VarInput } from "../editor/VarInput";
import { useScopes } from "../editor/useScopes";

function Field({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <label className="grid grid-cols-[140px_1fr] items-center gap-3">
      <span className="text-muted">{label}</span>
      {type === "password" ? (
        <input type="password" className="mono rounded border border-line bg-elevated px-2 py-1.5 outline-none" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <VarInput className="mono rounded border border-line bg-elevated" placeholder={placeholder} value={value} onChange={onChange} />
      )}
    </label>
  );
}

function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <label className="grid grid-cols-[140px_1fr] items-center gap-3">
      <span className="text-muted">{label}</span>
      <select className="rounded border border-line bg-elevated px-2 py-1.5" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

export function OAuth2Editor({ auth, onChange, root }: { auth: OAuth2Auth; onChange: (a: OAuth2Auth) => void; root: string | null }) {
  const { scopes } = useScopes(root);
  const resolved = resolveOAuth(auth, scopes);
  const key = tokenKey(resolved);
  const token = useOAuthTokens((s) => s.tokens[key]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<OAuth2Auth>) => onChange({ ...auth, ...p });

  const fetchToken = async () => {
    setBusy(true);
    setError(null);
    try {
      await getNewToken(resolved, oauthDeps, tokenCache);
      toast.success("Access token received");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      toast.error("Could not get access token", e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Select label="Grant type" value={auth.grant} options={[["client_credentials", "Client Credentials"], ["authorization_code", "Authorization Code"]]} onChange={(grant) => set({ grant })} />
      {auth.grant === "authorization_code" && <Field label="Auth URL" value={auth.authUrl} placeholder="https://id.example.com/authorize" onChange={(authUrl) => set({ authUrl })} />}
      <Field label="Token URL" value={auth.tokenUrl} placeholder="https://id.example.com/token" onChange={(tokenUrl) => set({ tokenUrl })} />
      <Field label="Client ID" value={auth.clientId} onChange={(clientId) => set({ clientId })} />
      <Field label="Client Secret" type="password" value={auth.clientSecret} placeholder="{{clientSecret}}" onChange={(clientSecret) => set({ clientSecret })} />
      <Field label="Scope" value={auth.scope} placeholder="read write" onChange={(scope) => set({ scope })} />
      {auth.grant === "authorization_code" && (
        <>
          <Field label="Redirect URI" value={auth.redirectUri} placeholder="Default: http://127.0.0.1:<random port>/callback" onChange={(redirectUri) => set({ redirectUri })} />
          <label className="grid grid-cols-[140px_1fr] items-center gap-3">
            <span className="text-muted">PKCE</span>
            <input type="checkbox" className="justify-self-start" checked={auth.usePkce} onChange={(e) => set({ usePkce: e.target.checked })} />
          </label>
        </>
      )}
      <Select label="Client auth" value={auth.clientAuth} options={[["header", "Basic auth header"], ["body", "In request body"]]} onChange={(clientAuth) => set({ clientAuth })} />
      <Field label="Header prefix" value={auth.tokenPrefix} onChange={(tokenPrefix) => set({ tokenPrefix })} />
      <p className="text-[12px] text-muted">Tip: keep the client secret in a secret variable, e.g. {"{{clientSecret}}"}.</p>

      <div className="mt-2 rounded border border-line p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="font-medium">Access token</span>
          {token && (
            <span className={`text-[12px] ${isExpired(token) ? "text-warn" : "text-ok"}`}>
              {token.expiresAt ? `${isExpired(token) ? "expired" : "expires"} ${new Date(token.expiresAt).toLocaleString()}` : "no expiry"}
              {token.refreshToken ? " · refresh token available" : ""}
            </span>
          )}
          <div className="flex-1" />
          {token && (
            <Button variant="ghost" onClick={() => tokenCache.remove(key)}>
              Clear
            </Button>
          )}
          <Button variant="primary" disabled={busy} onClick={fetchToken}>
            {busy && <Spinner />}
            {busy ? (auth.grant === "authorization_code" ? "Waiting for browser…" : "Requesting…") : "Get New Access Token"}
          </Button>
        </div>
        {token ? <p className="mono select-text break-all text-[12px]">{token.accessToken}</p> : <p className="text-[12px] text-muted">No token yet.</p>}
        {error && <p className="mt-2 text-[12px] text-danger">{error}</p>}
        <p className="mt-2 text-[12px] text-muted">
          {auth.grant === "client_credentials"
            ? "A token is requested automatically on send when missing; expired tokens are refreshed."
            : "Expired tokens are refreshed automatically when a refresh token is available."}
        </p>
      </div>
    </div>
  );
}
