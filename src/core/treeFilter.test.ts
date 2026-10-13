import { describe, expect, it } from "vitest";
import type { LoadedCollection, TreeNode } from "./collectionRepo";
import { emptyCollection, emptyFolder, emptyRequest } from "./model";
import { filterTree } from "./treeFilter";

const req = (name: string, url: string, path: string): TreeNode => ({ type: "request", path, doc: { ...emptyRequest(name), url } });
const folder = (name: string, path: string, children: TreeNode[]): TreeNode => ({ type: "folder", path, doc: emptyFolder(name), children });
const col = (name: string, children: TreeNode[]): LoadedCollection => ({ root: "/c", doc: emptyCollection(name), children, errors: [], hasCollectionFile: true });
const paths = (nodes: TreeNode[]): string[] => nodes.flatMap((n) => [n.path, ...(n.type === "folder" ? paths(n.children) : [])]);

const tree = col("API", [
  folder("Users", "/c/users", [req("List", "/users", "/c/users/list.yaml"), req("Get", "/users/1", "/c/users/get.yaml")]),
  folder("Orders", "/c/orders", [req("Create order", "/orders", "/c/orders/create.yaml")]),
]);

describe("filterTree", () => {
  it("keeps matching requests with their ancestors and opens the ancestors", () => {
    const r = filterTree([tree], "CREATE");
    expect(paths(r.collections[0].children)).toEqual(["/c/orders", "/c/orders/create.yaml"]);
    expect([...r.open].sort()).toEqual(["/c", "/c/orders"]);
  });

  it("matches request URLs", () => {
    expect(paths(filterTree([tree], "/users/1").collections[0].children)).toEqual(["/c/users", "/c/users/get.yaml"]);
  });

  it("keeps the whole subtree of a matching folder and opens it", () => {
    const r = filterTree([tree], "users");
    expect(paths(r.collections[0].children)).toEqual(["/c/users", "/c/users/list.yaml", "/c/users/get.yaml"]);
    expect(r.open.has("/c/users")).toBe(true);
  });

  it("keeps a whole collection whose name matches", () => {
    expect(filterTree([tree], "api").collections[0]).toBe(tree);
  });

  it("drops collections without matches", () => {
    expect(filterTree([tree], "nothing").collections).toEqual([]);
  });
});
