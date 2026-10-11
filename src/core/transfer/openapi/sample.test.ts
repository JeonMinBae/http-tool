import { describe, expect, it } from "vitest";
import { RefResolver } from "./refs";
import { exampleOf, sampleFromSchema } from "./sample";

const spec = {
  components: {
    schemas: {
      Node: { type: "object", properties: { id: { type: "integer" }, next: { $ref: "#/components/schemas/Node" } } },
      User: { type: "object", properties: { email: { type: "string", format: "email" }, role: { enum: ["admin", "user"] } } },
      "a/b": { type: "boolean" },
    },
  },
};

describe("openapi samples", () => {
  it("terminates on recursive schemas", () => {
    const r = new RefResolver(spec);
    expect(sampleFromSchema({ $ref: "#/components/schemas/Node" }, r)).toEqual({ id: 0, next: null });
  });

  it("uses formats and enums", () => {
    expect(sampleFromSchema({ $ref: "#/components/schemas/User" }, new RefResolver(spec))).toEqual({ email: "user@example.com", role: "admin" });
  });

  it("prefers example over schema, then named examples", () => {
    const r = new RefResolver(spec);
    expect(exampleOf({ example: 7, schema: { type: "integer" } }, r)).toBe(7);
    expect(exampleOf({ examples: { one: { value: "x" } }, schema: { type: "integer" } }, r)).toBe("x");
  });

  it("3.1 type arrays skip null", () => {
    expect(sampleFromSchema({ type: ["null", "string"] }, new RefResolver(spec))).toBe("string");
  });

  it("decodes escaped pointer segments", () => {
    expect(sampleFromSchema({ $ref: "#/components/schemas/a~1b" }, new RefResolver(spec))).toBe(true);
  });

  it("warns on external and broken refs", () => {
    const r = new RefResolver(spec);
    expect(r.deref({ $ref: "other.yaml#/X" })).toEqual({});
    expect(r.deref({ $ref: "#/nope" })).toEqual({});
    expect([...r.warnings]).toEqual(["External $ref is not supported: other.yaml#/X", "Unresolved $ref: #/nope"]);
  });

  it("caps wide non-cyclic $ref graphs", () => {
    const wide = (next: string) => ({ type: "object", properties: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`p${i}`, { $ref: next }])) });
    const r = new RefResolver({ components: { schemas: { A: wide("#/components/schemas/B"), B: wide("#/components/schemas/C"), C: wide("#/components/schemas/D"), D: { type: "string" } } } });
    sampleFromSchema({ $ref: "#/components/schemas/A" }, r);
    expect([...r.warnings].join()).toMatch(/cut short/);
  });

  it("allOf merge keeps __proto__ as a plain key", () => {
    const r = new RefResolver(spec);
    const out = sampleFromSchema({ allOf: [{ example: JSON.parse('{"__proto__":{"polluted":1},"a":1}') }] }, r) as Record<string, unknown>;
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect((out as { polluted?: number }).polluted).toBeUndefined();
    expect(out.a).toBe(1);
  });
});
