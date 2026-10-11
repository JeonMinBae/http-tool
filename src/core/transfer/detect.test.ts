import { describe, expect, it } from "vitest";
import { emptyFolder, emptyRequest } from "../model";
import { detectImport } from "./detect";
import { toNative } from "./native";

describe("detectImport", () => {
  it("detects OpenAPI YAML and JSON", () => {
    expect(detectImport("openapi: 3.1.0\ninfo: {title: A}\npaths: {}").kind).toBe("collection");
    expect(detectImport('{"openapi":"3.0.1","info":{"title":"A"},"paths":{}}').kind).toBe("collection");
  });

  it("detects native partial exports and adds file warnings", () => {
    const text = toNative("request", [{ ...emptyRequest("b"), body: { type: "binary", filePath: "/a" } }], undefined, false);
    const plan = detectImport(text);
    expect(plan.kind).toBe("partial");
    expect(plan.warnings).toHaveLength(1);
  });

  it("rejects swagger 2.0, OpenAPI 4 and garbage", () => {
    expect(() => detectImport('{"swagger":"2.0"}')).toThrow(/Swagger 2.0/);
    expect(() => detectImport("openapi: 4.0.0")).toThrow(/not supported/);
    expect(() => detectImport("just text")).toThrow(/Unrecognized/);
    expect(() => detectImport("{ bad")).toThrow(/Not valid/);
  });

  it("warns about imported scripts", () => {
    const text = toNative("folder", [{ ...emptyFolder("F"), scripts: { pre: "pm.x()", post: "" }, items: [emptyRequest("r")] }], undefined, false);
    expect(detectImport(text).warnings.join()).toMatch(/scripts are included.*"F"/);
  });

  it("accepts YAML flow mappings that are not strict JSON", () => {
    expect(detectImport("{openapi: 3.0.0, info: {title: A}, paths: {}}").kind).toBe("collection");
  });
});
