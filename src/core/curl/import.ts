import { emptyRequest, HTTP_METHODS, type Body, type FormField, type HttpMethod, type HttpRequestDoc, type KeyValue } from "../model";
import { syncParamsFromUrl } from "../params";
import { syncPathParams } from "../pathParams";
import { tokenize } from "./tokenize";

export interface CurlImport {
  request: HttpRequestDoc;
  warnings: string[];
}

const kv = (key: string, value: string): KeyValue => ({ key, value, enabled: true });

/** Options that take a value and are otherwise irrelevant to the request model. */
const IGNORED_WITH_VALUE = new Set(["-o", "--output", "--connect-timeout", "-w", "--write-out", "--retry", "--cacert", "--cert", "--key", "-c", "--cookie-jar", "--resolve", "--limit-rate", "-r", "--range"]);
const IGNORED_FLAGS = new Set(["--compressed", "-s", "--silent", "-S", "--show-error", "-v", "--verbose", "-i", "--include", "--http1.1", "--http2", "--http2-prior-knowledge", "-f", "--fail", "-#", "--progress-bar", "--globoff", "-g", "--no-buffer", "-N"]);

const DATA_OPTS = new Set(["-d", "--data", "--data-raw", "--data-ascii", "--data-binary", "--data-urlencode", "--json"]);

interface DataPart {
  opt: string;
  value: string;
}

function decodeForm(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}

const looksLikeForm = (s: string) => /^[^=&\s{[<]+=[^&]*(&[^=&]+=[^&]*)*$/.test(s);
const isJson = (s: string) => {
  try {
    JSON.parse(s);
    return /^\s*[[{]/.test(s);
  } catch {
    return false;
  }
};

function nameFromUrl(url: string, method: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    return `${method} ${last ?? u.host}`;
  } catch {
    return "Imported request";
  }
}

function buildBody(data: DataPart[], form: FormField[], contentType: string | undefined, warnings: string[]): Body {
  if (form.length) return { type: "form-data", fields: form };
  if (!data.length) return { type: "none" };
  if (data.length === 1 && data[0].value.startsWith("@") && data[0].opt !== "--data-raw") {
    return { type: "binary", filePath: data[0].value.slice(1) };
  }
  const ct = (contentType ?? "").toLowerCase();
  const urlencodeParts = data.filter((d) => d.opt === "--data-urlencode");
  if (urlencodeParts.length === data.length) {
    return {
      type: "urlencoded",
      fields: urlencodeParts.map((d) => {
        const i = d.value.indexOf("=");
        return i < 0 ? kv(d.value, "") : kv(d.value.slice(0, i), d.value.slice(i + 1));
      }),
    };
  }
  if (data.some((d) => d.value.startsWith("@") && d.opt !== "--data-raw")) warnings.push("Data read from files (@file) was not imported");
  const joined = data.map((d) => d.value).join("&");
  if (ct.includes("json") || data.some((d) => d.opt === "--json") || (!ct && isJson(joined))) {
    return { type: "raw", language: "json", content: data.map((d) => d.value).join("") };
  }
  if ((ct.includes("x-www-form-urlencoded") || !ct) && looksLikeForm(joined)) {
    return {
      type: "urlencoded",
      fields: joined.split("&").map((p) => {
        const i = p.indexOf("=");
        return kv(decodeForm(p.slice(0, i)), decodeForm(p.slice(i + 1)));
      }),
    };
  }
  const language = ct.includes("xml") ? "xml" : ct.includes("html") ? "html" : "text";
  return { type: "raw", language, content: joined };
}

export function parseCurl(text: string): CurlImport {
  const args = tokenize(text.trim());
  if (!args.length || !/^curl(\.exe)?$/i.test(args[0])) throw new Error("Not a curl command");

  const warnings: string[] = [];
  const headers: KeyValue[] = [];
  const cookies: KeyValue[] = [];
  const data: DataPart[] = [];
  const form: FormField[] = [];
  const req = emptyRequest("Imported request");
  let method: string | undefined;
  let url: string | undefined;
  let getMode = false;

  for (let i = 1; i < args.length; i++) {
    let a = args[i];
    let inline: string | undefined;
    if (a.startsWith("--") && a.includes("=")) {
      inline = a.slice(a.indexOf("=") + 1);
      a = a.slice(0, a.indexOf("="));
    } else if (/^-[A-Za-z]./.test(a) && !a.startsWith("--") && "XHdFubAe".includes(a[1])) {
      inline = a.slice(2);
      a = a.slice(0, 2);
    }
    const next = () => inline ?? args[++i] ?? "";

    if (a === "-X" || a === "--request") method = next().toUpperCase();
    else if (a === "-H" || a === "--header") {
      const h = next();
      const c = h.indexOf(":");
      if (c > 0) {
        const key = h.slice(0, c).trim();
        const value = h.slice(c + 1).trim();
        if (key.toLowerCase() === "cookie") value.split(";").forEach((p) => p.trim() && cookies.push(kv(p.slice(0, p.indexOf("=")).trim(), p.slice(p.indexOf("=") + 1).trim())));
        else headers.push(kv(key, value));
      }
    } else if (DATA_OPTS.has(a)) {
      const value = next();
      data.push({ opt: a, value });
      if (a === "--json") {
        if (!headers.some((h) => h.key.toLowerCase() === "content-type")) headers.push(kv("Content-Type", "application/json"));
        if (!headers.some((h) => h.key.toLowerCase() === "accept")) headers.push(kv("Accept", "application/json"));
      }
    } else if (a === "-F" || a === "--form" || a === "--form-string") {
      const v = next();
      const eq = v.indexOf("=");
      const key = v.slice(0, eq);
      let value = v.slice(eq + 1);
      if (a !== "--form-string" && value.startsWith("@")) {
        value = value.slice(1).split(";")[0].replace(/^"(.*)"$/, "$1");
        form.push({ key, value, enabled: true, kind: "file" });
      } else form.push({ key, value, enabled: true, kind: "text" });
    } else if (a === "-u" || a === "--user") {
      const v = next();
      const c = v.indexOf(":");
      req.auth = { type: "basic", username: c < 0 ? v : v.slice(0, c), password: c < 0 ? "" : v.slice(c + 1) };
    } else if (a === "-b" || a === "--cookie") {
      const v = next();
      if (!v.includes("=")) warnings.push(`Cookie file ${v} was not imported`);
      else v.split(";").forEach((p) => p.trim() && cookies.push(kv(p.slice(0, p.indexOf("=")).trim(), p.slice(p.indexOf("=") + 1).trim())));
    } else if (a === "-A" || a === "--user-agent") headers.push(kv("User-Agent", next()));
    else if (a === "-e" || a === "--referer") headers.push(kv("Referer", next()));
    else if (a === "-L" || a === "--location") req.settings.followRedirects = true;
    else if (a === "-k" || a === "--insecure") req.settings.verifySsl = false;
    else if (a === "-m" || a === "--max-time") req.settings.timeoutMs = Math.round(Number(next()) * 1000) || undefined;
    else if (a === "-G" || a === "--get") getMode = true;
    else if (a === "-I" || a === "--head") method = "HEAD";
    else if (a === "--url") url = next();
    else if (IGNORED_WITH_VALUE.has(a)) next();
    else if (IGNORED_FLAGS.has(a)) continue;
    else if (a.startsWith("-") && a.length > 1) warnings.push(`Ignored option ${a}`);
    else if (url === undefined) url = a;
    else warnings.push(`Ignored argument ${a}`);
  }

  if (!url) throw new Error("No URL found in curl command");
  if (req.settings.timeoutMs === undefined) delete req.settings.timeoutMs;

  const contentType = headers.find((h) => h.key.toLowerCase() === "content-type")?.value;
  if (getMode && data.length) {
    url += (url.includes("?") ? "&" : "?") + data.map((d) => d.value).join("&");
    data.length = 0;
  }
  const body = buildBody(data, form, contentType, warnings);
  const finalMethod = method ?? (body.type !== "none" ? "POST" : "GET");
  req.method = (HTTP_METHODS as readonly string[]).includes(finalMethod) ? (finalMethod as HttpMethod) : "GET";
  if (finalMethod !== req.method) warnings.push(`Unsupported method ${finalMethod}`);

  req.url = url;
  req.params = syncParamsFromUrl(url, []);
  req.pathParams = syncPathParams(url, []);
  req.headers = headers;
  req.cookies = cookies;
  req.body = body;
  req.name = nameFromUrl(url, req.method);
  return { request: req, warnings };
}
