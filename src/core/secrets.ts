import { isListVar, type Variable } from "./model";

export type SecretValues = Record<string, string>;

/** App data document name holding secret values for a collection root. */
export async function secretsName(root: string): Promise<`secrets/${string}`> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(root));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `secrets/${hex}`;
}

/** Fills secret variable values from the local secret store. */
export function applySecrets(vars: Variable[], secrets: SecretValues): Variable[] {
  return vars.map((v) => {
    if (!v.secret) return v;
    if (isListVar(v)) return { ...v, items: v.items.map((i) => ({ ...i, value: secrets[`${v.key}:${i.key}`] ?? "" })) };
    return { ...v, value: secrets[v.key] ?? "" };
  });
}

/** Collects secret values for the local secret store; list items are keyed `list:key` (plain names never contain ':'). */
export function extractSecrets(vars: Variable[]): SecretValues {
  return Object.fromEntries(
    vars.filter((v) => v.secret && v.key).flatMap((v) => (isListVar(v) ? v.items.filter((i) => i.key).map((i) => [`${v.key}:${i.key}`, i.value]) : [[v.key, v.value]])),
  );
}
