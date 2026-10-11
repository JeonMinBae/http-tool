import type { GlobalSettings } from "./model";

const PROXY_SCHEMES = ["http:", "https:", "socks5:", "socks5h:"];

/** Returns an error message, or null when the settings are valid. */
export function validateSettings(s: GlobalSettings): string | null {
  if (!Number.isFinite(s.timeoutMs) || s.timeoutMs < 0) return "Timeout must be 0 or more milliseconds (0 = no timeout).";
  if (!Number.isInteger(s.historyLimit) || s.historyLimit < 1 || s.historyLimit > 10000) return "History size must be between 1 and 10000.";
  if (s.proxy.mode === "manual") {
    let url: URL;
    try {
      url = new URL(s.proxy.url.trim());
    } catch {
      return "Proxy URL is not valid (e.g. http://proxy.local:8080).";
    }
    if (!PROXY_SCHEMES.includes(url.protocol)) return "Proxy URL must start with http://, https://, socks5:// or socks5h://.";
  }
  return null;
}
