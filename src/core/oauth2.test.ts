import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OAuth2Auth } from "./model";
import { authorizationCode, buildAuthUrl, clientCredentials, ensureFreshToken, isExpired, pkceChallenge, tokenKey, type OAuth2Deps, type TokenCache } from "./oauth2";

const cfg: OAuth2Auth = {
  type: "oauth2", grant: "client_credentials", authUrl: "https://id/authorize", tokenUrl: "https://id/token", clientId: "app", clientSecret: "s3c",
  scope: "read write", usePkce: true, redirectUri: "", clientAuth: "header", tokenPrefix: "Bearer",
};

class MemCache implements TokenCache {
  map = new Map<string, import("./oauth2").CachedToken>();
  get = (k: string) => this.map.get(k);
  set = async (k: string, t: import("./oauth2").CachedToken) => void this.map.set(k, t);
  remove = async (k: string) => void this.map.delete(k);
}

const jsonResult = (status: number, body: object) => ({ status, text: JSON.stringify(body) });

let deps: OAuth2Deps & { post: ReturnType<typeof vi.fn> };
let cache: MemCache;

beforeEach(() => {
  cache = new MemCache();
  deps = {
    post: vi.fn(async () => jsonResult(200, { access_token: "new", token_type: "Bearer", expires_in: 3600, refresh_token: "r2" })),
    listen: vi.fn(async () => ({ redirectUri: "http://127.0.0.1:5555/callback", wait: async () => "code=c1&state=S" })),
    openUrl: vi.fn(async () => {}),
    random: () => "S",
    now: () => 1_000_000,
  };
});

const sentBody = () => new URLSearchParams(deps.post.mock.calls.at(-1)![1] as string);
const sentHeaders = () => deps.post.mock.calls.at(-1)![2] as [string, string][];

describe("pkce", () => {
  it("matches the RFC 7636 example", async () => {
    expect(await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});

describe("token requests", () => {
  it("client credentials uses basic client auth by default", async () => {
    const t = await clientCredentials(cfg, deps);
    expect(t).toMatchObject({ accessToken: "new", refreshToken: "r2", expiresAt: 1_000_000 + 3600_000 });
    expect(sentBody().get("grant_type")).toBe("client_credentials");
    expect(sentBody().get("scope")).toBe("read write");
    expect(sentBody().has("client_secret")).toBe(false);
    expect(sentHeaders()).toContainEqual(["Authorization", `Basic ${btoa("app:s3c")}`]);
  });

  it("client auth in body sends id and secret as form fields", async () => {
    await clientCredentials({ ...cfg, clientAuth: "body" }, deps);
    expect(sentBody().get("client_id")).toBe("app");
    expect(sentBody().get("client_secret")).toBe("s3c");
  });

  it("surfaces error responses", async () => {
    deps.post.mockResolvedValueOnce(jsonResult(400, { error: "invalid_client", error_description: "bad secret" }));
    await expect(clientCredentials(cfg, deps)).rejects.toThrow(/invalid_client: bad secret/);
  });
});

describe("authorization code", () => {
  const ac = { ...cfg, grant: "authorization_code" as const };

  it("opens the browser with PKCE and exchanges the code", async () => {
    const t = await authorizationCode(ac, deps);
    const opened = new URL((deps.openUrl as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(opened.searchParams.get("response_type")).toBe("code");
    expect(opened.searchParams.get("code_challenge_method")).toBe("S256");
    expect(opened.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:5555/callback");
    expect(sentBody().get("code")).toBe("c1");
    expect(sentBody().get("code_verifier")).toBeTruthy();
    expect(t.accessToken).toBe("new");
  });

  it("rejects callback with mismatched state", async () => {
    deps.listen = vi.fn(async () => ({ redirectUri: "http://127.0.0.1:1/callback", wait: async () => "code=c&state=WRONG" }));
    await expect(authorizationCode(ac, deps)).rejects.toThrow(/state/);
  });

  it("reports provider errors from the callback", async () => {
    deps.listen = vi.fn(async () => ({ redirectUri: "http://127.0.0.1:1/callback", wait: async () => "error=access_denied&state=S" }));
    await expect(authorizationCode(ac, deps)).rejects.toThrow(/access_denied/);
  });

  it("builds an auth url that keeps existing query params", () => {
    const url = new URL(buildAuthUrl({ ...ac, authUrl: "https://id/auth?tenant=x" }, "http://r", "st", "ch"));
    expect(url.searchParams.get("tenant")).toBe("x");
    expect(url.searchParams.get("state")).toBe("st");
  });
});

describe("ensureFreshToken", () => {
  it("returns a valid cached token without network", async () => {
    await cache.set(tokenKey(cfg), { accessToken: "cached", tokenType: "Bearer", expiresAt: 1_000_000 + 600_000 });
    expect((await ensureFreshToken(cfg, deps, cache)).accessToken).toBe("cached");
    expect(deps.post).not.toHaveBeenCalled();
  });

  it("refreshes expired token when refresh_token exists", async () => {
    await cache.set(tokenKey(cfg), { accessToken: "old", refreshToken: "r", tokenType: "Bearer", expiresAt: 1_000_000 - 1 });
    expect((await ensureFreshToken({ ...cfg, grant: "authorization_code" }, deps, cache)).accessToken).toBe("new");
    expect(sentBody().get("grant_type")).toBe("refresh_token");
    expect(cache.get(tokenKey(cfg))?.refreshToken).toBe("r2");
  });

  it("keeps the old refresh token when the server does not rotate it", async () => {
    deps.post.mockResolvedValueOnce(jsonResult(200, { access_token: "n2", expires_in: 60 }));
    await cache.set(tokenKey(cfg), { accessToken: "old", refreshToken: "keep", tokenType: "Bearer", expiresAt: 0 });
    await ensureFreshToken({ ...cfg, grant: "authorization_code" }, deps, cache);
    expect(cache.get(tokenKey(cfg))?.refreshToken).toBe("keep");
  });

  it("fetches automatically for client credentials when nothing is cached", async () => {
    expect((await ensureFreshToken(cfg, deps, cache)).accessToken).toBe("new");
  });

  it("asks for interactive login for authorization code without a token", async () => {
    await expect(ensureFreshToken({ ...cfg, grant: "authorization_code" }, deps, cache)).rejects.toThrow(/Get New Access Token/);
  });

  it("treats tokens within 30s of expiry as expired", () => {
    expect(isExpired({ accessToken: "a", tokenType: "Bearer", expiresAt: 1000 + 29_000 }, 1000)).toBe(true);
    expect(isExpired({ accessToken: "a", tokenType: "Bearer" }, 1000)).toBe(false);
  });
});
