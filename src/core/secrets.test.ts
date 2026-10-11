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
