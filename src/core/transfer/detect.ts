import { parse } from "yaml";
import { isObj } from "../yaml";
import { filePathWarnings, type ImportPlan } from "./model";
import { NATIVE_FORMAT, parseNative } from "./native";
import { importOpenApi } from "./openapi/import";

const UNRECOGNIZED = "Unrecognized format: expected an HTTP Tool export or an OpenAPI 3.x document.";

/** Parses pasted or loaded text (JSON is valid YAML) and builds an import plan. */
export function detectImport(text: string): ImportPlan {
  let data: unknown;
  try {
    data = parse(text);
  } catch (e) {
    throw new Error(`Not valid JSON or YAML: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!isObj(data)) throw new Error(UNRECOGNIZED);
  let plan: ImportPlan;
  if (data.format === NATIVE_FORMAT) plan = parseNative(data);
  else if (typeof data.openapi === "string") {
    if (!/^3\.[01]\./.test(data.openapi)) throw new Error(`OpenAPI ${data.openapi} is not supported (3.0 and 3.1 only).`);
    plan = importOpenApi(data);
  } else if ("swagger" in data) throw new Error("Swagger 2.0 is not supported. Convert it to OpenAPI 3.x first.");
  else throw new Error(UNRECOGNIZED);
  return { ...plan, warnings: [...plan.warnings, ...filePathWarnings(plan.items)] };
}
