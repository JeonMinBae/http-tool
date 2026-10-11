import { arr, isObj, str, type Obj } from "../../yaml";
import type { RefResolver } from "./refs";

const MAX_DEPTH = 8;
const STRING_FORMATS: Record<string, string> = {
  "date-time": "2024-01-01T00:00:00Z",
  date: "2024-01-01",
  email: "user@example.com",
  uuid: "00000000-0000-0000-0000-000000000000",
  uri: "https://example.com",
};

/** Upper bound on schema nodes expanded for one sample; wide non-cyclic $ref graphs otherwise blow up. */
const MAX_NODES = 5000;

/** example → default → const → enum → type-based dummy. */
export function sampleFromSchema(schema: unknown, r: RefResolver): unknown {
  const budget = { left: MAX_NODES };
  const out = sample(schema, r, [], 0, budget);
  if (budget.left < 0) r.warnings.add("Some examples were cut short because their schemas are very large.");
  return out;
}

/** `stack` holds $refs being expanded (cycle guard). */
function sample(schema: unknown, r: RefResolver, stack: string[], depth: number, budget: { left: number }): unknown {
  if (!isObj(schema) || depth > MAX_DEPTH || --budget.left < 0) return null;
  if (typeof schema.$ref === "string") {
    if (stack.includes(schema.$ref)) return null;
    return sample(r.deref(schema), r, [...stack, schema.$ref], depth + 1, budget);
  }
  if ("example" in schema) return schema.example;
  if (Array.isArray(schema.examples) && schema.examples.length) return schema.examples[0];
  if ("default" in schema) return schema.default;
  if ("const" in schema) return schema.const;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  const next = (s: unknown) => sample(s, r, stack, depth + 1, budget);
  // fromEntries defines keys, so a "__proto__" key from the document cannot swap the prototype.
  if (Array.isArray(schema.allOf)) return Object.fromEntries(schema.allOf.map(next).filter(isObj).flatMap((o) => Object.entries(o)));
  const alt = arr(schema.oneOf)[0] ?? arr(schema.anyOf)[0];
  if (alt !== undefined) return next(alt);
  const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== "null") : schema.type;
  switch (type ?? (isObj(schema.properties) ? "object" : undefined)) {
    case "object":
      return Object.fromEntries(Object.entries(isObj(schema.properties) ? schema.properties : {}).map(([k, s]) => [k, next(s)]));
    case "array":
      return [next(schema.items)];
    case "integer":
    case "number":
      return 0;
    case "boolean":
      return true;
    case "string":
      return STRING_FORMATS[str(schema.format)] ?? "string";
    default:
      return null;
  }
}

export const toText = (v: unknown): string => (v == null ? "" : typeof v === "string" ? v : JSON.stringify(v));

/** Value of a parameter or media object: example → first of examples → schema sample. */
export function exampleOf(o: Obj, r: RefResolver): unknown {
  if ("example" in o) return o.example;
  const first = isObj(o.examples) ? Object.values(o.examples)[0] : undefined;
  if (first !== undefined) return r.deref(first).value;
  return sampleFromSchema(o.schema, r);
}
