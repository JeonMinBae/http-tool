import { describe, expect, it } from "vitest";
import type { LoadedCollection } from "./collectionRepo";
import { emptyCollection, emptyFolder, emptyRequest, type Variable } from "./model";
import { buildIndex, search } from "./search";

const req = (name: string, url: string, path = `/c/${name}.yaml`) => ({ type: "request" as const, path, doc: { ...emptyRequest(name), url } });
const v = (key: string, value: string, secret: boolean): Variable => ({ key, value, enabled: true, secret });

function col(children: LoadedCollection["children"], variables: Variable[] = []): LoadedCollection {
  return { root: "/c", doc: { ...emptyCollection("API"), variables }, children, errors: [], hasCollectionFile: true };
}

describe("search", () => {
  it("ranks name match above url match and skips secret values", () => {
    const index = buildIndex({
      collections: [col([req("Get user", "/token"), req("Token refresh", "/auth")], [v("apiToken", "x", false), v("k", "token-secret", true)])],
      globals: [],
      environments: [],
    });
    expect(search("token", index).map((x) => x.label)).toEqual(["Token refresh", "apiToken", "Get user"]);
  });

  it("indexes nested folders with a breadcrumb", () => {
    const index = buildIndex({
      collections: [col([{ type: "folder", path: "/c/users", doc: emptyFolder("Users"), children: [req("List", "/users", "/c/users/list.yaml")] }])],
      globals: [],
      environments: [],
    });
    const [hit] = search("list", index);
    expect(hit).toMatchObject({ kind: "request", label: "List", detail: "API / Users", path: "/c/users/list.yaml" });
  });

  it("finds global and environment variables by value", () => {
    const index = buildIndex({
      collections: [],
      globals: [v("host", "api.example.com", false)],
      environments: [{ id: "e1", name: "Dev", variables: [v("baseUrl", "https://dev.example.com", false)] }],
    });
    expect(search("example", index).map((h) => [h.label, h.detail])).toEqual([
      ["host", "Globals"],
      ["baseUrl", "Environment: Dev"],
    ]);
  });

  it("is case-insensitive, requires all words, and limits results", () => {
    const many = Array.from({ length: 80 }, (_, i) => req(`Item ${i}`, "/x", `/c/i${i}.yaml`));
    const index = buildIndex({ collections: [col(many)], globals: [], environments: [] });
    expect(search("ITEM", index)).toHaveLength(50);
    expect(search("item 7 x", index).map((h) => h.label)).toContain("Item 7");
    expect(search("   ", index)).toEqual([]);
  });
});
