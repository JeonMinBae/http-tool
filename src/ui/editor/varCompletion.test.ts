import { describe, expect, it } from "vitest";
import type { VarScopes } from "../../core/variables";
import { matchVarPrefix, varOptions } from "./varCompletion";

const s = (p: Partial<VarScopes>): VarScopes => ({ local: {}, environment: {}, collection: {}, global: {}, ...p });

describe("matchVarPrefix", () => {
  it("returns the partial name after an unclosed {{", () => {
    expect(matchVarPrefix("a {{ to")).toEqual({ prefix: "to", offset: 5 });
    expect(matchVarPrefix("{{done}} x")).toBeNull();
  });
});

describe("varOptions", () => {
  const scopes = s({ environment: { tool: "p", "tool:": "", "tool:A": "qq", "tool:B": "ww" }, global: { sec: "x" } });
  it("lists plain names and list items, masking secrets", () => {
    expect(varOptions("", scopes, new Set(["sec"])).options.map((o) => [o.label, o.detail])).toEqual([
      ["tool", "environment: p"], ["tool:A", "environment: qq"], ["tool:B", "environment: ww"], ["sec", "global: ••••••"],
    ]);
  });
  it("narrows to keys after 'list:'", () => {
    const r = varOptions("tool:", scopes, new Set());
    expect(r.skip).toBe(5);
    expect(r.options.map((o) => o.label)).toEqual(["A", "B"]);
  });
});
