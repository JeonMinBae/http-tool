import { expect as chaiExpect } from "chai";
import CryptoJS from "crypto-js";
import lodash from "lodash";
import type { Body } from "../core/model";
import { interpolate, isListMarker, resolveVar, setScopeVar, visibleVars, type VarScope, type VarScopes } from "../core/variables";
import type { LogEntry, ScriptInput, ScriptRequest, ScriptResponse, ScriptSendRequest, TestResult } from "./protocol";

export interface PmHooks {
  sendRequest(req: ScriptSendRequest): Promise<ScriptResponse>;
}

const MODULES: Record<string, unknown> = { "crypto-js": CryptoJS, lodash, chai: { expect: chaiExpect } };

function stringify(v: unknown): string {
  if (typeof v === "string") return v;
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  try {
    return typeof v === "object" ? JSON.stringify(v) : String(v);
  } catch {
    return String(v);
  }
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Response wrapper mirroring Postman's pm.response / sendRequest response. */
function wrapResponse(r: ScriptResponse) {
  const headers = {
    get: (name: string) => r.headers.find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1],
    has: (name: string) => r.headers.some(([k]) => k.toLowerCase() === name.toLowerCase()),
    toObject: () => Object.fromEntries(r.headers),
    all: () => r.headers.map(([key, value]) => ({ key, value })),
  };
  const res = {
    code: r.code,
    status: r.status,
    responseTime: r.responseTime,
    responseSize: r.size,
    headers,
    text: () => r.body,
    json: () => JSON.parse(r.body),
    to: {
      have: {
        status(expected: number | string) {
          if (typeof expected === "number") chaiExpect(r.code, "response status").to.equal(expected);
          else chaiExpect(r.status, "response status").to.equal(expected);
        },
        header(name: string, value?: string) {
          chaiExpect(headers.has(name), `header ${name}`).to.equal(true);
          if (value !== undefined) chaiExpect(headers.get(name)).to.equal(value);
        },
        jsonBody(path?: string) {
          const body = JSON.parse(r.body);
          if (path) chaiExpect(lodash.has(body, path), `json path ${path}`).to.equal(true);
        },
      },
      be: {
        get ok() {
          chaiExpect(r.code, "response status").to.be.within(200, 299);
          return true;
        },
        get success() {
          chaiExpect(r.code, "response status").to.be.within(200, 299);
          return true;
        },
      },
    },
  };
  return res;
}

function bodyApi(req: ScriptRequest) {
  const body = req.body;
  const raw = body.type === "raw" ? body.content : body.type === "graphql" ? body.query : "";
  return {
    mode: body.type,
    raw,
    toString: () => raw,
    /** Replaces the body with raw text. */
    update(content: string | object) {
      const text = typeof content === "string" ? content : JSON.stringify(content);
      const language = req.body.type === "raw" ? req.body.language : "text";
      req.body = { type: "raw", language, content: text } as Body;
    },
  };
}

export function createPm(input: ScriptInput, hooks: PmHooks) {
  const scopes: VarScopes = structuredClone(input.scopes);
  const request: ScriptRequest = structuredClone(input.request);
  const tests: TestResult[] = [];
  const logs: LogEntry[] = [];
  const pending = new Set<Promise<unknown>>();
  const track = <T>(p: Promise<T>) => {
    pending.add(p);
    void p.finally(() => pending.delete(p)).catch(() => {});
    return p;
  };

  const log = (level: LogEntry["level"]) => (...args: unknown[]) => logs.push({ level, args: args.map(stringify) });
  const console = { log: log("log"), info: log("info"), warn: log("warn"), error: log("error"), debug: log("log") };

  const scopeApi = (scope: VarScope) => ({
    get: (k: string) => scopes[scope][k],
    has: (k: string) => Object.hasOwn(scopes[scope], k),
    set(k: string, v: unknown) {
      if (scope === "environment" && !input.hasEnvironment) {
        console.warn(`pm.environment.set("${k}") ignored: no active environment`);
        return;
      }
      setScopeVar(scopes[scope], k, typeof v === "string" ? v : stringify(v));
    },
    unset: (k: string) => void delete scopes[scope][k],
    clear: () => void (scopes[scope] = {}),
    toObject: () => Object.fromEntries(Object.entries(scopes[scope]).filter(([k]) => !isListMarker(k))),
    replaceIn: (t: string) => interpolate(t, scopes).value,
  });

  const headersApi = {
    get: (k: string) => request.headers.find((h) => h.enabled && h.key.toLowerCase() === k.toLowerCase())?.value,
    has: (k: string) => request.headers.some((h) => h.enabled && h.key.toLowerCase() === k.toLowerCase()),
    add: (h: { key: string; value: string }) => void request.headers.push({ key: h.key, value: String(h.value), enabled: true }),
    upsert(h: { key: string; value: string }) {
      const existing = request.headers.find((x) => x.key.toLowerCase() === h.key.toLowerCase());
      if (existing) {
        existing.value = String(h.value);
        existing.enabled = true;
      } else headersApi.add(h);
    },
    remove: (k: string) => void (request.headers = request.headers.filter((h) => h.key.toLowerCase() !== k.toLowerCase())),
    toObject: () => Object.fromEntries(request.headers.filter((h) => h.enabled).map((h) => [h.key, h.value])),
  };

  const urlObject = () => ({ toString: () => request.url, valueOf: () => request.url });

  const pmRequest = {
    get url() {
      return urlObject();
    },
    set url(v: unknown) {
      request.url = String(v);
    },
    get method() {
      return request.method;
    },
    set method(v: string) {
      request.method = String(v).toUpperCase();
    },
    get name() {
      return request.name;
    },
    headers: headersApi,
    get body() {
      return bodyApi(request);
    },
  };

  type SendSpec = string | { url: string; method?: string; header?: Record<string, string> | { key: string; value: string }[]; body?: { mode?: string; raw?: string; urlencoded?: { key: string; value: string }[] } };

  function sendRequest(spec: SendSpec, cb?: (err: unknown, res: ReturnType<typeof wrapResponse> | null) => void) {
    const r: ScriptSendRequest =
      typeof spec === "string"
        ? { method: "GET", url: spec, headers: [] }
        : {
            method: (spec.method ?? "GET").toUpperCase(),
            url: spec.url,
            headers: Array.isArray(spec.header) ? spec.header.map((h) => [h.key, h.value]) : Object.entries(spec.header ?? {}),
            ...(spec.body?.mode === "urlencoded"
              ? { body: new URLSearchParams((spec.body.urlencoded ?? []).map((p) => [p.key, p.value])).toString() }
              : spec.body?.raw !== undefined
                ? { body: spec.body.raw }
                : {}),
          };
    const p = hooks.sendRequest(r).then(
      (res) => {
        try {
          cb?.(null, wrapResponse(res));
        } catch (e) {
          console.error(`pm.sendRequest callback: ${errorMessage(e)}`);
        }
        return wrapResponse(res);
      },
      (err) => {
        try {
          cb?.(errorMessage(err), null);
        } catch (e) {
          console.error(`pm.sendRequest callback: ${errorMessage(e)}`);
        }
        if (!cb) throw err;
        return null;
      },
    );
    return track(p);
  }

  const pm = {
    info: { eventName: input.phase === "pre" ? "prerequest" : "test", requestName: input.request.name },
    variables: {
      get: (k: string) => resolveVar(k, scopes),
      has: (k: string) => resolveVar(k, scopes) !== undefined,
      set: (k: string, v: unknown) => setScopeVar(scopes.local, k, typeof v === "string" ? v : stringify(v)),
      unset: (k: string) => void delete scopes.local[k],
      replaceIn: (t: string) => interpolate(t, scopes).value,
      toObject: () => Object.fromEntries(visibleVars(scopes).map((x) => [x.name, x.value])),
    },
    environment: scopeApi("environment"),
    collectionVariables: scopeApi("collection"),
    globals: scopeApi("global"),
    request: pmRequest,
    response: input.response ? wrapResponse(input.response) : undefined,
    expect: chaiExpect,
    test(name: string, fn: () => unknown) {
      const result: TestResult = { name, passed: true };
      tests.push(result);
      const fail = (e: unknown) => {
        result.passed = false;
        result.error = errorMessage(e);
      };
      try {
        const r = fn();
        if (r && typeof (r as Promise<unknown>).then === "function") track(Promise.resolve(r).catch(fail));
      } catch (e) {
        fail(e);
      }
    },
    sendRequest,
  };

  const require = (name: string) => {
    if (!Object.hasOwn(MODULES, name)) throw new Error(`Module "${name}" is not available. Available: ${Object.keys(MODULES).join(", ")}`);
    return MODULES[name];
  };

  /** Resolves once every pending test and sendRequest (including ones started later) has settled. */
  async function settle() {
    while (pending.size) await Promise.allSettled([...pending]);
  }

  return { pm, console, require, settle, output: () => ({ scopes, request, tests, logs }) };
}
