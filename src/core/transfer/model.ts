import type { TreeNode } from "../collectionRepo";
import type { CollectionDoc, FolderDoc, HttpRequestDoc, WebSocketDoc } from "../model";

/** Format-neutral tree used by every import and export path. */
export type TransferFolder = FolderDoc & { items: TransferNode[] };
export type TransferNode = HttpRequestDoc | WebSocketDoc | TransferFolder;

export type ImportPlan =
  | { kind: "collection"; source: "native" | "openapi"; collection: CollectionDoc; items: TransferNode[]; warnings: string[] }
  | { kind: "partial"; items: TransferNode[]; warnings: string[] };

export function fromTree(nodes: TreeNode[]): TransferNode[] {
  return nodes.map((n) => (n.type === "folder" ? { ...n.doc, items: fromTree(n.children) } : n.doc));
}

export function countRequests(items: TransferNode[]): number {
  return items.reduce((sum, n) => sum + (n.kind === "folder" ? countRequests(n.items) : 1), 0);
}

/** Binary bodies and form-data files point at local paths that may not exist on another computer. */
export function filePathWarnings(items: TransferNode[]): string[] {
  const out: string[] = [];
  const walk = (nodes: TransferNode[]) => {
    for (const n of nodes) {
      if (n.kind === "folder") walk(n.items);
      else if (n.kind === "http") {
        const paths =
          n.body.type === "binary"
            ? [n.body.filePath]
            : n.body.type === "form-data"
              ? n.body.fields.filter((f) => f.kind === "file").map((f) => f.value)
              : [];
        for (const p of paths.filter(Boolean)) out.push(`"${n.name}" references local file "${p}", which may not exist on this computer.`);
      }
    }
  };
  walk(items);
  return out;
}
