import { describe, expect, it } from "vitest";
import { buildScopes, interpolate, resolveVar, varSource, type VarScopes } from "./variables";

const s = (p: Partial<VarScopes>): VarScopes => ({ local: {}, environment: {}, collection: {}, global: {}, ...p });
const v = (key: string, value: string, enabled = true) => ({ key, value, enabled, secret: false });

describe("interpolate", () => {
  it("environment overrides collection and global", () => {
    expect(interpolate("{{a}}", s({ environment: { a: "env" }, collection: { a: "col" }, global: { a: "g" } })).value).toBe("env");
  });

  it("local overrides everything", () => {
    expect(resolveVar("a", s({ local: { a: "L" }, environment: { a: "E" } }))).toBe("L");
  });

  it("keeps unresolved placeholders", () => {
    expect(interpolate("x/{{missing}}", s({}))).toEqual({ value: "x/{{missing}}", unresolved: ["missing"] });
  });

  it("tolerates whitespace inside braces", () => {
    expect(interpolate("{{ a }}", s({ global: { a: "1" } })).value).toBe("1");
  });

  it("resolves nested variables", () => {
    expect(interpolate("{{url}}/x", s({ global: { url: "{{host}}:80", host: "h" } })).value).toBe("h:80/x");
  });

  it("terminates on cycles", () => {
    expect(() => interpolate("{{a}}", s({ global: { a: "{{b}}", b: "{{a}}" } }))).not.toThrow();
  });

  it("does not treat empty value as unresolved", () => {
    expect(interpolate("[{{e}}]", s({ global: { e: "" } }))).toEqual({ value: "[]", unresolved: [] });
  });
});

describe("buildScopes", () => {
  it("skips disabled and empty-key variables", () => {
    const scopes = buildScopes({ globals: [v("a", "1"), v("b", "2", false), v("", "x")] });
    expect(scopes.global).toEqual({ a: "1" });
  });

  it("reports the source scope", () => {
    const scopes = buildScopes({ globals: [v("a", "g")], environment: [v("a", "e")] });
    expect(varSource("a", scopes)).toBe("environment");
    expect(varSource("zz", scopes)).toBeUndefined();
  });
});
