import { describe, expect, it } from "vitest";
import { emptyCollection, emptyFolder, emptyRequest, emptyWebSocket, type CollectionDoc } from "../model";
import type { TransferNode } from "./model";
import { parseNative, toNative } from "./native";

const col: CollectionDoc = {
  ...emptyCollection("C"),
  auth: { type: "bearer", token: "lit" },
  variables: [{ key: "k", value: "v", enabled: true, secret: true }],
};
const items: TransferNode[] = [
  { ...emptyFolder("F", 0), items: [{ ...emptyRequest("R", 0), method: "POST", url: "{{baseUrl}}/x", scripts: { pre: "a", post: "b" } }] },
  { ...emptyWebSocket("W", 1), subprotocols: ["chat"], savedMessages: [{ name: "m", type: "text", content: "hi" }] },
];

describe("native json", () => {
  it("round-trips losslessly with secrets", () => {
    const plan = parseNative(JSON.parse(toNative("collection", items, col, true)));
    expect(plan).toEqual({ kind: "collection", source: "native", collection: col, items, warnings: [] });
  });

  it("strips secrets by default", () => {
    const plan = parseNative(JSON.parse(toNative("collection", items, col, false)));
    expect(plan.kind === "collection" && plan.collection.variables[0].value).toBe("");
    expect(plan.kind === "collection" && plan.collection.auth).toEqual({ type: "bearer", token: "" });
  });

  it("folder/request scope becomes a partial plan without collection", () => {
    const text = toNative("folder", [items[0]], undefined, false);
    expect(JSON.parse(text).collection).toBeUndefined();
    expect(parseNative(JSON.parse(text)).kind).toBe("partial");
  });

  it("rejects a newer version", () => {
    expect(() => parseNative({ format: "httptool", version: 2, scope: "request", items: [] })).toThrow(/version/);
  });

  it("skips unknown item kinds with a warning", () => {
    const plan = parseNative({ format: "httptool", version: 1, scope: "request", items: [{ kind: "grpc" }] });
    expect(plan.items).toEqual([]);
    expect(plan.warnings).toHaveLength(1);
  });
});
