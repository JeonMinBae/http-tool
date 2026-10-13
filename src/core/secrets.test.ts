import { expect, it } from "vitest";
import { applySecrets, extractSecrets, secretsName } from "./secrets";

const v = (key: string, value: string, secret: boolean) => ({ key, value, enabled: true, secret });

it("applies only secret values", () => {
  expect(applySecrets([v("a", "x", false), v("t", "", true), v("u", "", true)], { t: "s", a: "ignored" })).toEqual([
    v("a", "x", false),
    v("t", "s", true),
    v("u", "", true),
  ]);
});

it("extracts secret values", () => {
  expect(extractSecrets([v("a", "x", false), v("t", "s", true)])).toEqual({ t: "s" });
});

it("hashes root to a stable 64-hex name", async () => {
  const n = await secretsName("/a/b");
  expect(n).toMatch(/^secrets\/[0-9a-f]{64}$/);
  expect(await secretsName("/a/b")).toBe(n);
});

it("round-trips secret list items without colliding with a plain variable of the same name", () => {
  const vars = [
    { key: "tool", value: "plain", enabled: true, secret: true },
    { key: "tool", value: "", enabled: true, secret: true, type: "list" as const, items: [{ key: "A", value: "qq", enabled: true }] },
  ];
  const secrets = extractSecrets(vars);
  expect(secrets).toEqual({ tool: "plain", "tool:A": "qq" });
  const blanked = vars.map((v) => (v.type === "list" ? { ...v, items: v.items!.map((i) => ({ ...i, value: "" })) } : { ...v, value: "" }));
  expect(applySecrets(blanked, secrets)).toEqual(vars);
});
