import lodash from "lodash";
import { stringify } from "yaml";
import type { Auth, CollectionDoc, FolderDoc, HttpRequestDoc, KeyValue } from "../../model";
import { RAW_CONTENT_TYPE } from "../../prepare";
import type { Obj } from "../../yaml";
import type { TransferNode } from "../model";
import { isLiteral, isSensitiveName } from "../redact";

export interface OpenApiExportInput {
  title: string;
  collection: CollectionDoc;
  items: TransferNode[];
  /** Folders enclosing the exported folder/request, outermost first; their auth and name still apply. */
  ancestors?: FolderDoc[];
}

const scopesOf = (a: Auth): string[] => (a.type === "oauth2" ? a.scope.split(/\s+/).filter(Boolean) : []);

export function inferSchema(v: unknown): Obj {
  if (v === null) return { nullable: true };
  if (Array.isArray(v)) return { type: "array", items: v.length ? inferSchema(v[0]) : {} };
  if (typeof v === "object") return { type: "object", properties: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, inferSchema(x)])) };
  if (typeof v === "number") return { type: Number.isInteger(v) ? "integer" : "number" };
  return { type: typeof v === "boolean" ? "boolean" : "string" };
}

/** Server part = a leading `{{var}}` or `scheme://host`; query and hash are dropped (they come from params). */
export function splitServer(url: string): { server: string; path: string } {
  const noQuery = url.split(/[?#]/)[0];
  const m = noQuery.match(/^(\{\{[^{}]+\}\}|[a-z][a-z0-9+.-]*:\/\/[^/]+)(.*)$/i);
  if (m) return { server: m[1], path: m[2] || "/" };
  return { server: "", path: noQuery.startsWith("/") ? noQuery : `/${noQuery}` };
}

/** Best-effort OpenAPI 3.0.3 document; everything that cannot be represented is listed in `warnings`. */
export function toOpenApi(input: OpenApiExportInput): { spec: Obj; warnings: string[] } {
  const warnings: string[] = [];
  const paths: Record<string, Obj> = {};
  const servers: string[] = [];
  const serverVars = new Map<string, string[]>();
  const schemes = new Map<string, { name: string; def: Obj }>();
  const known = new Map(
    input.collection.variables.filter((v) => v.enabled && !v.secret && v.value && !v.value.includes("{{")).map((v) => [v.key, v.value]),
  );

  const toServerUrl = (raw: string) => {
    const s = raw.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^@/]*@/i, "$1");
    if (s !== raw) warnings.push(`Credentials in the server URL ${raw.split("@").pop()} were removed.`);
    const unresolved: string[] = [];
    const url = s.replace(/\{\{([^{}]+)\}\}/g, (_, n: string) => {
      const value = known.get(n);
      if (value !== undefined) return value;
      unresolved.push(n);
      return `{${n}}`;
    });
    if (!serverVars.has(url)) serverVars.set(url, unresolved);
    return url;
  };

  const schemeFor = (auth: Auth): string | null => {
    const def = schemeDef(auth);
    if (!def) return null;
    const sig = JSON.stringify(def);
    const hit = schemes.get(sig);
    if (hit) return hit.name;
    const base = `${auth.type === "apikey" ? "apiKey" : auth.type}Auth`;
    let name = base;
    let n = 2;
    while ([...schemes.values()].some((s) => s.name === name)) name = `${base}${n++}`;
    schemes.set(sig, { name, def });
    return name;
  };

  const walk = (nodes: TransferNode[], tag: string | null, inherited: Auth) => {
    for (const n of nodes) {
      if (n.kind === "folder") {
        if (n.scripts.pre || n.scripts.post) warnings.push(`Folder "${n.name}": scripts are not exported.`);
        walk(n.items, n.name, n.auth.type === "inherit" ? inherited : n.auth);
        continue;
      }
      if (n.kind === "websocket") {
        warnings.push(`WebSocket "${n.name}" is not representable in OpenAPI and was skipped.`);
        continue;
      }
      const { server, path } = splitServer(n.url);
      const oaPath = path.replace(/\{\{([^{}]+)\}\}/g, "{$1}");
      const method = n.method.toLowerCase();
      if (paths[oaPath]?.[method]) {
        warnings.push(`"${n.name}": ${n.method} ${oaPath} already exported; skipped.`);
        continue;
      }
      if (n.scripts.pre || n.scripts.post) warnings.push(`"${n.name}": scripts are not exported.`);
      if (Object.keys(n.settings).length) warnings.push(`"${n.name}": request settings are not exported.`);
      const serverUrl = server ? toServerUrl(server) : "";
      if (serverUrl && !servers.includes(serverUrl)) servers.push(serverUrl);
      const effective = n.auth.type === "inherit" ? inherited : n.auth;
      const op = operationFor(n, oaPath, tag, warnings);
      if (serverUrl && serverUrl !== servers[0]) op.servers = [serverObject(serverUrl, serverVars.get(serverUrl) ?? [])];
      if (!lodash.isEqual(effective, input.collection.auth)) {
        const s = effective.type === "none" ? null : schemeFor(effective);
        op.security = s ? [{ [s]: scopesOf(effective) }] : [];
      }
      (paths[oaPath] ??= {})[method] = op;
    }
  };
  const colScripts = input.collection.scripts;
  if (colScripts.pre || colScripts.post) warnings.push(`Collection "${input.collection.name}": scripts are not exported.`);
  const ancestors = input.ancestors ?? [];
  const inheritedAuth = [...ancestors].reverse().find((f) => f.auth.type !== "inherit")?.auth ?? input.collection.auth;
  walk(input.items, ancestors.at(-1)?.name ?? null, inheritedAuth);

  const colAuth = input.collection.auth;
  const globalScheme = colAuth.type === "none" || colAuth.type === "inherit" ? null : schemeFor(colAuth);
  const spec: Obj = {
    openapi: "3.0.3",
    info: { title: input.title, version: "1.0.0" },
    ...(servers.length > 0 && { servers: [serverObject(servers[0], serverVars.get(servers[0]) ?? [])] }),
    paths,
    ...(schemes.size > 0 && {
      components: { securitySchemes: Object.fromEntries([...schemes.values()].map((s) => [s.name, s.def])) },
    }),
    ...(globalScheme && {
      security: [{ [globalScheme]: scopesOf(colAuth) }],
    }),
  };
  return { spec, warnings };
}

const serverObject = (url: string, vars: string[]): Obj => ({
  url,
  ...(vars.length > 0 && { variables: Object.fromEntries(vars.map((v) => [v, { default: "" }])) }),
});

function schemeDef(a: Auth): Obj | null {
  switch (a.type) {
    case "bearer":
      return { type: "http", scheme: "bearer" };
    case "basic":
      return { type: "http", scheme: "basic" };
    case "apikey":
      return { type: "apiKey", in: a.in, name: a.key };
    case "oauth2": {
      const scopes = Object.fromEntries(scopesOf(a).map((s) => [s, ""]));
      return a.grant === "client_credentials"
        ? { type: "oauth2", flows: { clientCredentials: { tokenUrl: a.tokenUrl, scopes } } }
        : { type: "oauth2", flows: { authorizationCode: { authorizationUrl: a.authUrl, tokenUrl: a.tokenUrl, scopes } } };
    }
    default:
      return null;
  }
}

const SKIP_HEADERS = new Set(["content-type", "authorization"]);

/** Set when a credential-looking literal was left out of an example. */
interface Scrub {
  hit: boolean;
}

const hides = (name: string, value: string, scrub: Scrub, always = false) => {
  const hide = (always || isSensitiveName(name)) && isLiteral(value);
  if (hide) scrub.hit = true;
  return hide;
};

const param = (kv: KeyValue, where: string, scrub: Scrub): Obj => ({
  name: kv.key,
  in: where,
  required: kv.enabled,
  schema: { type: "string" },
  ...(kv.value && !hides(kv.key, kv.value, scrub, where === "cookie") && { example: kv.value }),
});

/** Blanks string values under credential-looking keys, at any depth. */
function scrubExample(v: unknown, scrub: Scrub): unknown {
  if (Array.isArray(v)) return v.map((x) => scrubExample(x, scrub));
  if (v === null || typeof v !== "object") return v;
  return Object.fromEntries(
    Object.entries(v).map(([k, x]) => [k, typeof x === "string" && hides(k, x, scrub) ? "" : scrubExample(x, scrub)]),
  );
}

function operationFor(n: HttpRequestDoc, oaPath: string, tag: string | null, warnings: string[]): Obj {
  const scrub: Scrub = { hit: false };
  const pathParams = [...oaPath.matchAll(/\{([^}]+)\}/g)].map((m) => ({ name: m[1], in: "path", required: true, schema: { type: "string" } }));
  const parameters = [
    ...pathParams,
    ...n.params.filter((p) => p.key).map((p) => param(p, "query", scrub)),
    ...n.headers.filter((h) => h.key && !SKIP_HEADERS.has(h.key.toLowerCase())).map((h) => param(h, "header", scrub)),
    ...n.cookies.filter((c) => c.key).map((c) => param(c, "cookie", scrub)),
  ];
  const requestBody = requestBodyFor(n, warnings, scrub);
  if (scrub.hit) warnings.push(`"${n.name}": credential-like values were left out of the examples.`);
  return {
    ...(tag && { tags: [tag] }),
    summary: n.name,
    ...(parameters.length > 0 && { parameters }),
    ...(requestBody && { requestBody }),
    responses: { default: { description: "Response" } },
  };
}

function requestBodyFor(n: HttpRequestDoc, warnings: string[], scrub: Scrub): Obj | null {
  const b = n.body;
  const ct = n.headers.find((h) => h.enabled && h.key.toLowerCase() === "content-type")?.value;
  const media = (type: string, m: Obj): Obj => ({ content: { [type]: m } });
  switch (b.type) {
    case "raw": {
      if (b.language === "json") {
        try {
          const v: unknown = JSON.parse(b.content);
          return media(ct ?? RAW_CONTENT_TYPE.json, { schema: inferSchema(v), example: scrubExample(v, scrub) });
        } catch {
          warnings.push(`"${n.name}": body is not valid JSON; exported as a string example.`);
          return media(ct ?? RAW_CONTENT_TYPE.json, { example: b.content });
        }
      }
      return media(ct ?? RAW_CONTENT_TYPE[b.language], { schema: { type: "string" }, example: b.content });
    }
    case "urlencoded":
      return media("application/x-www-form-urlencoded", {
        schema: { type: "object", properties: Object.fromEntries(b.fields.map((f) => [f.key, { type: "string" }])) },
        example: scrubExample(Object.fromEntries(b.fields.map((f) => [f.key, f.value])), scrub),
      });
    case "form-data": {
      if (b.fields.some((f) => f.kind === "file" && f.value)) warnings.push(`"${n.name}": form-data file paths are not exported.`);
      const texts = b.fields.filter((f) => f.kind === "text");
      return media("multipart/form-data", {
        schema: {
          type: "object",
          properties: Object.fromEntries(b.fields.map((f) => [f.key, f.kind === "file" ? { type: "string", format: "binary" } : { type: "string" }])),
        },
        ...(texts.length > 0 && { example: scrubExample(Object.fromEntries(texts.map((f) => [f.key, f.value])), scrub) }),
      });
    }
    case "binary":
      if (b.filePath) warnings.push(`"${n.name}": binary body file path is not exported.`);
      return media(ct ?? "application/octet-stream", { schema: { type: "string", format: "binary" } });
    case "graphql": {
      let variables: unknown = {};
      try {
        variables = b.variables.trim() ? JSON.parse(b.variables) : {};
      } catch {
        variables = b.variables;
      }
      return media("application/json", { example: { query: b.query, variables } });
    }
    default:
      return null;
  }
}

export function serializeOpenApi(spec: Obj, format: "json" | "yaml"): string {
  return format === "json" ? JSON.stringify(spec, null, 2) : stringify(spec, { lineWidth: 0 });
}
