import { describe, expect, it } from "vitest";
import type { TreeNode } from "../collectionRepo";
import { emptyFolder, emptyRequest, emptyWebSocket } from "../model";
import { countRequests, filePathWarnings, fromTree, type TransferNode } from "./model";

describe("transfer model", () => {
  it("warns about non-empty local file paths only", () => {
    const items: TransferNode[] = [
      { ...emptyRequest("bin"), body: { type: "binary", filePath: "/tmp/a.bin" } },
      { ...emptyRequest("empty"), body: { type: "binary", filePath: "" } },
      {
        ...emptyFolder("f"),
        items: [{ ...emptyRequest("form"), body: { type: "form-data", fields: [{ key: "k", value: "/x.png", enabled: true, kind: "file" }] } }],
      },
    ];
    expect(filePathWarnings(items)).toHaveLength(2);
    expect(countRequests(items)).toBe(3);
  });

  it("fromTree keeps folder docs and nests children", () => {
    const ws = emptyWebSocket("W");
    const tree: TreeNode[] = [{ type: "folder", path: "/c/f", doc: emptyFolder("f"), children: [{ type: "websocket", path: "/c/f/w.yaml", doc: ws }] }];
    expect(fromTree(tree)).toEqual([{ ...emptyFolder("f"), items: [ws] }]);
  });
});
