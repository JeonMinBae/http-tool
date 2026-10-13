import { describe, expect, it } from "vitest";
import { buildScopes, interpolate, resolveVar, setScopeVar, varSource, visibleVars, type VarScopes } from "./variables";

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

const list = (key: string, items: [string, string, boolean?][], enabled = true) =>
  ({ key, value: "", enabled, secret: false, type: "list" as const, items: items.map(([k, v, e = true]) => ({ key: k, value: v, enabled: e })) });

describe("list variables", () => {
  it("resolves {{list:key}} separately from a plain variable with the same name", () => {
    const scopes = buildScopes({ collection: [v("tool", "plain"), list("tool", [["A", "qq"], ["B", "ww"]])] });
    expect(interpolate("{{tool}} {{tool:A}} {{tool:B}}", scopes).value).toBe("plain qq ww");
  });

  it("a higher scope list replaces the whole lower scope list", () => {
    const scopes = buildScopes({ environment: [list("tool", [["A", "env"]])], collection: [list("tool", [["A", "c"], ["B", "c"]])] });
    expect(interpolate("{{tool:A}}|{{tool:B}}", scopes)).toEqual({ value: "env|{{tool:B}}", unresolved: ["tool:B"] });
  });

  it("treats disabled items, empty keys and plain names with ':' as unresolved", () => {
    const scopes = buildScopes({ globals: [list("t", [["off", "x", false]]), v("a:b", "1")] });
    expect(interpolate("{{t:off}}{{t:}}{{a:b}}", scopes).unresolved).toEqual(["t:off", "t:", "a:b"]);
  });

  it("resolves nested variables inside item values and keys containing ':'", () => {
    const scopes = buildScopes({ globals: [v("h", "x"), list("t", [["a:b", "{{h}}/1"]])] });
    expect(interpolate("{{t:a:b}}", scopes).value).toBe("x/1");
  });

  it("visibleVars hides markers and overridden list items", () => {
    const scopes = buildScopes({ environment: [list("t", [["A", "e"]])], collection: [list("t", [["B", "c"]])] });
    expect(visibleVars(scopes)).toEqual([{ name: "t:A", scope: "environment", value: "e" }]);
  });

  it("setScopeVar creates the list marker for item writes", () => {
    const rec: Record<string, string> = {};
    setScopeVar(rec, "t:A", "1");
    expect(varSource("t:A", s({ local: rec }))).toBe("local");
  });
});
