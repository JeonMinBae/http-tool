/** Minimal path helpers that work with both `/` and `\` separated absolute paths. */

const sepOf = (p: string) => (p.includes("\\") && !p.includes("/") ? "\\" : "/");

export function joinPath(dir: string, name: string): string {
  const sep = sepOf(dir);
  return dir.endsWith(sep) ? dir + name : dir + sep + name;
}

export function baseName(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

export function dirName(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i <= 0 ? p.slice(0, i + 1) : p.slice(0, i);
}

const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");

export const samePath = (a: string, b: string) => norm(a) === norm(b);

export const isInside = (child: string, parent: string) => norm(child).startsWith(norm(parent) + "/");
