import type { PreparedRequest } from "../../ipc";

export type Shell = "bash" | "cmd" | "powershell";

const bashQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

const psQuote = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** MSVCRT argument quoting (backslashes before quotes doubled), then cmd caret escaping. */
function cmdQuote(s: string): string {
  const msvcrt = s.replace(/(\\*)"/g, (_, bs: string) => `${bs}${bs}\\"`).replace(/(\\+)$/, "$1$1");
  const caret = msvcrt
    .replace(/[^a-zA-Z0-9\s_\-:=+~'/.,?;()*`%\r\n]/g, "^$&")
    .replace(/%(?=[a-zA-Z0-9_])/g, "%^")
    .replace(/\r?\n/g, "^\n\n");
  return `^"${caret}^"`;
}

const SHELLS: Record<Shell, { bin: string; q: (s: string) => string; nl: string }> = {
  bash: { bin: "curl", q: bashQuote, nl: " \\\n  " },
  cmd: { bin: "curl", q: cmdQuote, nl: " ^\n  " },
  powershell: { bin: "curl.exe", q: psQuote, nl: " `\n  " },
};

function encodeForm(fields: [string, string][]): string {
  const params = new URLSearchParams();
  for (const [k, v] of fields) params.append(k, v);
  return params.toString();
}

/** curl command for an already-prepared request (variables resolved). */
export function toCurl(req: PreparedRequest, shell: Shell): string {
  const { bin, q, nl } = SHELLS[shell];
  const first = [bin];
  if (req.method !== "GET") first.push(`-X ${req.method}`);
  first.push(q(req.url));
  const parts = [first.join(" ")];

  for (const [k, v] of req.headers) parts.push(`-H ${q(`${k}: ${v}`)}`);

  const body = req.body;
  if (body.type === "text") parts.push(`--data-raw ${q(body.content)}`);
  else if (body.type === "url-encoded") parts.push(`--data-raw ${q(encodeForm(body.fields))}`);
  else if (body.type === "binary") parts.push(`--data-binary ${q(`@${body.path}`)}`);
  else if (body.type === "form-data") {
    for (const f of body.fields) {
      parts.push(f.kind === "file" ? `-F ${q(`${f.name}=@"${f.value}"`)}` : `--form-string ${q(`${f.name}=${f.value}`)}`);
    }
  }

  if (req.followRedirects) parts.push("-L");
  if (!req.verifySsl) parts.push("-k");
  if (req.timeoutMs > 0) parts.push(`--max-time ${req.timeoutMs / 1000}`);
  if (req.proxy.mode === "manual" && req.proxy.url) {
    parts.push(`-x ${q(req.proxy.url)}`);
    if (req.proxy.bypass) parts.push(`--noproxy ${q(req.proxy.bypass)}`);
  } else if (req.proxy.mode === "none") {
    parts.push(`--noproxy ${q("*")}`);
  }
  return parts.join(nl);
}
