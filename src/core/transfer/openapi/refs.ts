import { isObj, type Obj } from "../../yaml";

const decode = (p: string) => p.replace(/~1/g, "/").replace(/~0/g, "~");

export class RefResolver {
  readonly warnings = new Set<string>();
  constructor(private readonly root: Obj) {}

  /** Follows `$ref` chains inside the document. External or broken refs resolve to `{}` with a warning. */
  deref(v: unknown, seen: Set<string> = new Set()): Obj {
    if (!isObj(v)) return {};
    const ref = v.$ref;
    if (typeof ref !== "string") return v;
    if (!ref.startsWith("#/")) {
      this.warnings.add(`External $ref is not supported: ${ref}`);
      return {};
    }
    if (seen.has(ref)) return {};
    seen.add(ref);
    const target = ref
      .slice(2)
      .split("/")
      .map(decode)
      .reduce<unknown>((cur, key) => (isObj(cur) ? cur[key] : undefined), this.root);
    if (target === undefined) {
      this.warnings.add(`Unresolved $ref: ${ref}`);
      return {};
    }
    return this.deref(target, seen);
  }
}
