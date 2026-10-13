import type { HttpResult, PreparedBody, PreparedRequest, SentRequest } from "../ipc";
import { base64ToBytes } from "./encoding";
import { formatSent } from "./responseFormat";

/** Per body, in UTF-8 bytes; up to 200 entries stay in memory. */
export const CONSOLE_BODY_LIMIT = 64 * 1024;

export interface ClippedText {
  text: string;
  truncated: boolean;
}

export interface ConsoleDetail {
  request?: { head: string; body: ClippedText };
  response?: { status: number; statusText: string; headers: [string, string][]; body: ClippedText };
  error?: string;
}

// Cutting inside a multi-byte character leaves U+FFFD at the end; drop it.
const decodeHead = (bytes: Uint8Array): ClippedText =>
  bytes.length <= CONSOLE_BODY_LIMIT
    ? { text: new TextDecoder().decode(bytes), truncated: false }
    : { text: new TextDecoder().decode(bytes.subarray(0, CONSOLE_BODY_LIMIT)).replace(/�$/, ""), truncated: true };

export const clipText = (text: string): ClippedText => decodeHead(new TextEncoder().encode(text));

function preparedBodyText(b: PreparedBody): string | null {
  switch (b.type) {
    case "none":
      return null;
    case "text":
      return b.content;
    case "url-encoded":
      return new URLSearchParams(b.fields).toString();
    case "form-data":
      return b.fields.map((f) => `${f.name}: ${f.kind === "file" ? `<file ${f.value}>` : f.value}`).join("\n");
    case "binary":
      return `<binary file ${b.path}>`;
  }
}

function responseBody(r: HttpResult): ClippedText {
  if (r.streaming) return { text: "<event stream: see the response panel>", truncated: false };
  if (!r.isText) return { text: `<binary ${r.size} bytes>`, truncated: false };
  return decodeHead(base64ToBytes(r.bodyBase64));
}

export function consoleDetail({ prepared, result, error }: { prepared?: PreparedRequest; result?: HttpResult; error?: string }): ConsoleDetail {
  const sent: SentRequest | undefined =
    result?.sent ?? (prepared && { method: prepared.method, url: prepared.url, headers: prepared.headers, bodyPreview: preparedBodyText(prepared.body) });
  return {
    request: sent && { head: formatSent({ ...sent, bodyPreview: null }), body: clipText(sent.bodyPreview ?? "") },
    response: result && { status: result.status, statusText: result.statusText, headers: result.headers, body: responseBody(result) },
    error,
  };
}
