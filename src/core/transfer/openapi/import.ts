import lodash from "lodash";
import { HTTP_METHODS, emptyCollection, emptyFolder, emptyRequest, type Auth, type Body, type HttpRequestDoc, type KeyValue, type Variable } from "../../model";
import { syncUrlFromParams } from "../../params";
import { RAW_CONTENT_TYPE } from "../../prepare";
import { arr, isObj, str, type Obj } from "../../yaml";
import type { ImportPlan, TransferFolder, TransferNode } from "../model";
import { RefResolver } from "./refs";
import { exampleOf, toText } from "./sample";

type Vars = Map<string, Variable>;

const addVar = (vars: Vars, key: string, value: string, secret = false) => {
  const existing = vars.get(key);
  // A path parameter may already use a credential's name; the variable must still be stored as a secret.
  if (existing) existing.secret ||= secret;
  else vars.set(key, { key, value, enabled: true, secret });
};

interface Ctx {
  r: RefResolver;
  vars: Vars;
  schemes: Obj;
  colAuth: Auth;
  warnings: string[];
}

/** Converts an OpenAPI 3.0/3.1 document into a new-collection import plan. */
export function importOpenApi(spec: Obj): Extract<ImportPlan, { kind: "collection" }> {
  const r = new RefResolver(spec);
  const warnings: string[] = [];
  const vars: Vars = new Map();
  addVar(vars, "baseUrl", serverUrl(spec, warnings));
  const schemes = isObj(spec.components) && isObj(spec.components.securitySchemes) ? spec.components.securitySchemes : {};
  const colAuth = authFromSecurity(spec.security, schemes, r, vars, warnings) ?? { type: "none" };
  const ctx: Ctx = { r, vars, schemes, colAuth, warnings };

  const items: TransferNode[] = [];
  const folders = new Map<string, TransferFolder>();
  for (const [path, rawItem] of Object.entries(isObj(spec.paths) ? spec.paths : {})) {
    const pathItem = r.deref(rawItem);
    for (const m of [...HTTP_METHODS.map((x) => x.toLowerCase()), "trace"]) {
      if (!isObj(pathItem[m])) continue;
      if (m === "trace") {
        warnings.push(`Skipped TRACE ${path}: method not supported.`);
        continue;
      }
      const op = r.deref(pathItem[m]);
      const req = buildRequest(path, m, op, arr(pathItem.parameters), ctx);
      const tag = str(arr(op.tags)[0]);
      if (!tag) {
        items.push(req);
        continue;
      }
      let folder = folders.get(tag);
      if (!folder) {
        folder = { ...emptyFolder(tag), items: [] };
        folders.set(tag, folder);
        items.push(folder);
      }
      folder.items.push(req);
    }
  }
  const info = isObj(spec.info) ? spec.info : {};
  return {
    kind: "collection",
    source: "openapi",
    collection: { ...emptyCollection(str(info.title, "Imported API")), auth: colAuth, variables: [...vars.values()] },
    items,
    warnings: [...warnings, ...r.warnings],
  };
}

function serverUrl(spec: Obj, warnings: string[]): string {
  const first = arr(spec.servers)[0];
  if (!isObj(first)) {
    warnings.push("No servers defined; set the baseUrl collection variable manually.");
    return "";
  }
  const defs = isObj(first.variables) ? first.variables : {};
  const url = str(first.url)
    .replace(/\{([^}]+)\}/g, (_, n: string) => {
      const def = defs[n];
      return isObj(def) ? str(def.default) : "";
    })
    .replace(/\/$/, "");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url))
    warnings.push(`Server URL "${url || "/"}" is relative; set the baseUrl collection variable to the full address (e.g. https://host${url}).`);
  return url;
}

function buildRequest(path: string, method: string, op: Obj, pathParams: unknown[], ctx: Ctx): HttpRequestDoc {
  const byKey = new Map<string, Obj>();
  for (const p of [...pathParams, ...arr(op.parameters)].map((p) => ctx.r.deref(p))) byKey.set(`${str(p.in)}:${str(p.name)}`, p);
  const params: KeyValue[] = [];
  const headers: KeyValue[] = [];
  const cookies: KeyValue[] = [];
  for (const p of byKey.values()) {
    const kv = { key: str(p.name), value: toText(exampleOf(p, ctx.r)), enabled: p.required === true };
    if (p.in === "path") addVar(ctx.vars, kv.key, kv.value);
    else if (p.in === "query") params.push(kv);
    else if (p.in === "header") headers.push(kv);
    else if (p.in === "cookie") cookies.push(kv);
  }
  const label = `${method.toUpperCase()} ${path}`;
  const { body, contentType } = bodyFromRequestBody(ctx.r.deref(op.requestBody), ctx.r, ctx.warnings, label);
  if (contentType) headers.push({ key: "Content-Type", value: contentType, enabled: true });
  const opAuth = op.security === undefined ? null : authFromSecurity(op.security, ctx.schemes, ctx.r, ctx.vars, ctx.warnings);
  // A key like "@evil.example/x" would otherwise move the request to another host.
  const rooted = path.startsWith("/") ? path : `/${path}`;
  const url = `{{baseUrl}}${rooted.replace(/\{([^}]+)\}/g, "{{$1}}")}`;
  return {
    ...emptyRequest(str(op.summary) || str(op.operationId) || label),
    method: method.toUpperCase() as HttpRequestDoc["method"],
    url: syncUrlFromParams(url, params),
    params,
    headers,
    cookies,
    body,
    auth: !opAuth || lodash.isEqual(opAuth, ctx.colAuth) ? { type: "inherit" } : opAuth,
  };
}

/** `contentType` is set only when it differs from what the app adds automatically for that body. */
function bodyFromRequestBody(rb: Obj, r: RefResolver, warnings: string[], label: string): { body: Body; contentType?: string } {
  const content = isObj(rb.content) ? rb.content : {};
  const types = Object.keys(content);
  if (!types.length) return { body: { type: "none" } };
  const pick = (re: RegExp) => types.find((t) => re.test(t));
  const mt =
    pick(/json/i) ??
    pick(/x-www-form-urlencoded/i) ??
    pick(/multipart\/form-data/i) ??
    pick(/xml/i) ??
    pick(/^text\/html/i) ??
    pick(/^text\//i) ??
    pick(/octet-stream/i) ??
    types[0];
  const media = r.deref(content[mt]);
  const ex = exampleOf(media, r);
  const schema = r.deref(media.schema);
  const props = isObj(schema.properties) ? schema.properties : {};
  const raw = (language: keyof typeof RAW_CONTENT_TYPE, text: string) => ({
    body: { type: "raw" as const, language, content: text },
    ...(RAW_CONTENT_TYPE[language] !== mt && { contentType: mt }),
  });
  if (/json/i.test(mt)) return raw("json", typeof ex === "string" ? ex : JSON.stringify(ex, null, 2));
  if (/x-www-form-urlencoded/i.test(mt)) {
    const obj = isObj(ex) ? ex : {};
    return { body: { type: "urlencoded", fields: Object.keys(props).map((k) => ({ key: k, value: toText(obj[k]), enabled: true })) } };
  }
  if (/multipart\/form-data/i.test(mt)) {
    const obj = isObj(ex) ? ex : {};
    const fields = Object.entries(props).map(([k, s]) => {
      const file = r.deref(s).format === "binary";
      return { key: k, value: file ? "" : toText(obj[k]), enabled: true, kind: file ? ("file" as const) : ("text" as const) };
    });
    return { body: { type: "form-data", fields } };
  }
  if (/xml/i.test(mt)) return raw("xml", toText(ex));
  if (/^text\/html/i.test(mt)) return raw("html", toText(ex));
  if (/octet-stream/i.test(mt)) return { body: { type: "binary", filePath: "" } };
  if (!/^text\//i.test(mt)) warnings.push(`${label}: media type ${mt} imported as raw text.`);
  return raw("text", toText(ex));
}

/** null = no requirement given (inherit). Credentials become {{variables}} registered on the collection. */
function authFromSecurity(security: unknown, schemes: Obj, r: RefResolver, vars: Vars, warnings: string[]): Auth | null {
  if (security === undefined) return null;
  const req = arr(security)[0];
  if (!isObj(req) || !Object.keys(req).length) return { type: "none" };
  const [name, scopes] = Object.entries(req)[0];
  const s = r.deref(schemes[name]);
  const scheme = str(s.scheme).toLowerCase();
  if (s.type === "http" && scheme === "bearer") {
    addVar(vars, "token", "", true);
    return { type: "bearer", token: "{{token}}" };
  }
  if (s.type === "http" && scheme === "basic") {
    addVar(vars, "username", "");
    addVar(vars, "password", "", true);
    return { type: "basic", username: "{{username}}", password: "{{password}}" };
  }
  if (s.type === "apiKey" && (s.in === "header" || s.in === "query")) {
    addVar(vars, "apiKey", "", true);
    return { type: "apikey", key: str(s.name), value: "{{apiKey}}", in: s.in === "query" ? "query" : "header" };
  }
  if (s.type === "oauth2" && isObj(s.flows)) {
    const cc = s.flows.clientCredentials;
    const ac = s.flows.authorizationCode;
    const flow = isObj(cc) ? cc : isObj(ac) ? ac : null;
    if (flow) {
      addVar(vars, "clientId", "");
      addVar(vars, "clientSecret", "", true);
      return {
        type: "oauth2",
        grant: flow === cc ? "client_credentials" : "authorization_code",
        authUrl: str(flow.authorizationUrl),
        tokenUrl: str(flow.tokenUrl),
        clientId: "{{clientId}}",
        clientSecret: "{{clientSecret}}",
        scope: arr(scopes).map((x) => str(x)).join(" "),
        usePkce: true,
        redirectUri: "",
        clientAuth: "header",
        tokenPrefix: "Bearer",
      };
    }
  }
  warnings.push(`Security scheme "${name}" (${str(s.type)}) is not supported; auth left as none.`);
  return { type: "none" };
}
