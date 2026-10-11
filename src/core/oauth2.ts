import { bytesToBase64, utf8ToBase64 } from "./encoding";
import type { OAuth2Auth } from "./model";

export interface CachedToken {
  accessToken: string;
  tokenType: string;
  refreshToken?: string;
  /** Epoch ms; undefined when the server did not send expires_in. */
  expiresAt?: number;
  scope?: string;
}

export interface TokenCache {
  get(key: string): CachedToken | undefined;
  set(key: string, token: CachedToken): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface OAuth2Deps {
  /** POSTs an application/x-www-form-urlencoded body. */
  post(url: string, body: string, headers: [string, string][]): Promise<{ status: number; text: string }>;
  /** Starts the loopback listener; `wait` resolves with the callback query string. */
  listen(redirectUri: string): Promise<{ redirectUri: string; wait(): Promise<string> }>;
  openUrl(url: string): Promise<void>;
  random(): string;
  now(): number;
}

/** Tokens expiring within this window are refreshed before use. */
const EXPIRY_SKEW_MS = 30_000;

export const tokenKey = (c: OAuth2Auth) => `${c.tokenUrl}|${c.clientId}|${c.scope}`;

export const isExpired = (t: CachedToken, now = Date.now()) => t.expiresAt !== undefined && t.expiresAt - EXPIRY_SKEW_MS <= now;

const base64url = (bytes: Uint8Array) => bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function randomString(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function pkceChallenge(verifier: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}

export function buildAuthUrl(c: OAuth2Auth, redirectUri: string, state: string, challenge?: string): string {
  const url = new URL(c.authUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", c.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  if (c.scope) url.searchParams.set("scope", c.scope);
  url.searchParams.set("state", state);
  if (challenge) {
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

async function tokenRequest(c: OAuth2Auth, params: Record<string, string>, deps: OAuth2Deps, previous?: CachedToken): Promise<CachedToken> {
  if (!c.tokenUrl) throw new Error("Token URL is required");
  const form = new URLSearchParams(params);
  const headers: [string, string][] = [
    ["Content-Type", "application/x-www-form-urlencoded"],
    ["Accept", "application/json"],
  ];
  if (c.clientAuth === "header" && c.clientSecret) {
    headers.push(["Authorization", `Basic ${utf8ToBase64(`${encodeURIComponent(c.clientId)}:${encodeURIComponent(c.clientSecret)}`)}`]);
  } else {
    form.set("client_id", c.clientId);
    if (c.clientSecret) form.set("client_secret", c.clientSecret);
  }
  const res = await deps.post(c.tokenUrl, form.toString(), headers);
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(res.text);
  } catch {
    data = Object.fromEntries(new URLSearchParams(res.text));
  }
  if (res.status >= 400 || typeof data.access_token !== "string") {
    const err = typeof data.error === "string" ? `${data.error}${data.error_description ? `: ${data.error_description}` : ""}` : res.text.slice(0, 300);
    throw new Error(`Token request failed (${res.status}) ${err}`);
  }
  const expiresIn = Number(data.expires_in);
  return {
    accessToken: data.access_token,
    tokenType: typeof data.token_type === "string" ? data.token_type : "Bearer",
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : previous?.refreshToken,
    expiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? deps.now() + expiresIn * 1000 : undefined,
    scope: typeof data.scope === "string" ? data.scope : c.scope || undefined,
  };
}

export function clientCredentials(c: OAuth2Auth, deps: OAuth2Deps): Promise<CachedToken> {
  return tokenRequest(c, { grant_type: "client_credentials", ...(c.scope ? { scope: c.scope } : {}) }, deps);
}

export async function authorizationCode(c: OAuth2Auth, deps: OAuth2Deps): Promise<CachedToken> {
  if (!c.authUrl) throw new Error("Auth URL is required");
  const listener = await deps.listen(c.redirectUri);
  const state = deps.random();
  const verifier = c.usePkce ? deps.random() + deps.random() : undefined;
  const challenge = verifier ? await pkceChallenge(verifier) : undefined;
  await deps.openUrl(buildAuthUrl(c, listener.redirectUri, state, challenge));
  const query = new URLSearchParams(await listener.wait());
  if (query.get("error")) throw new Error(`Authorization failed: ${query.get("error")}${query.get("error_description") ? ` (${query.get("error_description")})` : ""}`);
  if (query.get("state") !== state) throw new Error("Authorization failed: state mismatch");
  const code = query.get("code");
  if (!code) throw new Error("Authorization failed: no code in callback");
  return tokenRequest(c, { grant_type: "authorization_code", code, redirect_uri: listener.redirectUri, ...(verifier ? { code_verifier: verifier } : {}) }, deps);
}

export function refresh(c: OAuth2Auth, token: CachedToken, deps: OAuth2Deps): Promise<CachedToken> {
  return tokenRequest(c, { grant_type: "refresh_token", refresh_token: token.refreshToken!, ...(c.scope ? { scope: c.scope } : {}) }, deps, token);
}

/** Interactive "Get New Access Token" for either grant. */
export async function getNewToken(c: OAuth2Auth, deps: OAuth2Deps, cache: TokenCache): Promise<CachedToken> {
  const token = c.grant === "authorization_code" ? await authorizationCode(c, deps) : await clientCredentials(c, deps);
  await cache.set(tokenKey(c), token);
  return token;
}

/**
 * Token to use for a request: cached if still valid, refreshed when expired, fetched automatically for
 * client credentials. Authorization code without a usable token needs an interactive login.
 */
export async function ensureFreshToken(c: OAuth2Auth, deps: OAuth2Deps, cache: TokenCache): Promise<CachedToken> {
  const key = tokenKey(c);
  const cached = cache.get(key);
  if (cached && !isExpired(cached, deps.now())) return cached;
  if (cached?.refreshToken) {
    try {
      const next = await refresh(c, cached, deps);
      await cache.set(key, next);
      return next;
    } catch (e) {
      if (c.grant !== "client_credentials") throw new Error(`Refreshing the access token failed: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (c.grant === "client_credentials") return getNewToken(c, deps, cache);
  throw new Error("No valid OAuth 2.0 access token. Open the Auth tab and click Get New Access Token.");
}
