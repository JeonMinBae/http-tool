import { create } from "zustand";
import { openUrl } from "@tauri-apps/plugin-opener";
import { appDataApi, httpApi, oauthApi } from "../ipc";
import { base64ToUtf8 } from "../core/encoding";
import { randomString, type CachedToken, type OAuth2Deps, type TokenCache } from "../core/oauth2";
import type { OAuth2Auth } from "../core/model";
import { interpolate, type VarScopes } from "../core/variables";
import { useSettings } from "./settings";

interface TokensState {
  tokens: Record<string, CachedToken>;
  load(): Promise<void>;
  set(key: string, token: CachedToken): Promise<void>;
  remove(key: string): Promise<void>;
}

export const useOAuthTokens = create<TokensState>((set, get) => ({
  tokens: {},
  async load() {
    set({ tokens: (await appDataApi.read<Record<string, CachedToken>>("oauth-tokens")) ?? {} });
  },
  async set(key, token) {
    const tokens = { ...get().tokens, [key]: token };
    set({ tokens });
    await appDataApi.write("oauth-tokens", tokens);
  },
  async remove(key) {
    const tokens = { ...get().tokens };
    delete tokens[key];
    set({ tokens });
    await appDataApi.write("oauth-tokens", tokens);
  },
}));

export const tokenCache: TokenCache = {
  get: (key) => useOAuthTokens.getState().tokens[key],
  set: (key, token) => useOAuthTokens.getState().set(key, token),
  remove: (key) => useOAuthTokens.getState().remove(key),
};

export const oauthDeps: OAuth2Deps = {
  async post(url, body, headers) {
    const s = useSettings.getState().settings;
    const r = await httpApi.send({
      method: "POST",
      url,
      headers,
      body: { type: "text", content: body },
      timeoutMs: s.timeoutMs,
      followRedirects: true,
      verifySsl: s.verifySsl,
      proxy: s.proxy,
    });
    return { status: r.status, text: r.isText ? base64ToUtf8(r.bodyBase64) : "" };
  },
  async listen(redirectUri) {
    const info = await oauthApi.listen(redirectUri);
    return { redirectUri: info.redirectUri, wait: () => oauthApi.wait(info.port) };
  },
  openUrl: (url) => openUrl(url),
  random: randomString,
  now: () => Date.now(),
};

/** OAuth settings with {{variables}} replaced. */
export function resolveOAuth(c: OAuth2Auth, scopes: VarScopes): OAuth2Auth {
  const t = (v: string) => interpolate(v, scopes).value;
  return { ...c, authUrl: t(c.authUrl), tokenUrl: t(c.tokenUrl), clientId: t(c.clientId), clientSecret: t(c.clientSecret), scope: t(c.scope), redirectUri: t(c.redirectUri) };
}
