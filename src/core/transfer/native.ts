import type { CollectionDoc } from "../model";
import { arr, isObj, str, toCollection, toFolder, toRequest, toWebSocket, type Obj } from "../yaml";
import type { ImportPlan, TransferNode } from "./model";
import { redactAuth, redactNodes, redactVariables } from "./redact";

export const NATIVE_FORMAT = "httptool";
export const NATIVE_VERSION = 1;
export type NativeScope = "collection" | "folder" | "request";

export interface NativeFile {
  format: typeof NATIVE_FORMAT;
  version: number;
  scope: NativeScope;
  collection?: CollectionDoc;
  items: TransferNode[];
}

export function toNative(scope: NativeScope, items: TransferNode[], collection: CollectionDoc | undefined, includeSecrets: boolean): string {
  const file: NativeFile = {
    format: NATIVE_FORMAT,
    version: NATIVE_VERSION,
    scope,
    ...(collection && {
      collection: includeSecrets ? collection : { ...collection, auth: redactAuth(collection.auth), variables: redactVariables(collection.variables) },
    }),
    items: includeSecrets ? items : redactNodes(items),
  };
  return JSON.stringify(file, null, 2);
}

function toNode(v: unknown, warnings: string[]): TransferNode | null {
  const o = isObj(v) ? v : {};
  switch (o.kind) {
    case "http":
      return toRequest(o);
    case "websocket":
      return toWebSocket(o);
    case "folder":
      return { ...toFolder(o), items: arr(o.items).map((c) => toNode(c, warnings)).filter((c) => c !== null) };
    default:
      warnings.push(`Skipped an item with unknown kind "${str(o.kind)}".`);
      return null;
  }
}

export function parseNative(o: Obj): ImportPlan {
  if (typeof o.version !== "number" || o.version > NATIVE_VERSION)
    throw new Error(`Unsupported HTTP Tool export version: ${String(o.version)}`);
  const warnings: string[] = [];
  const items = arr(o.items).map((v) => toNode(v, warnings)).filter((n) => n !== null);
  if (o.scope === "collection") return { kind: "collection", source: "native", collection: toCollection(o.collection), items, warnings };
  return { kind: "partial", items, warnings };
}
