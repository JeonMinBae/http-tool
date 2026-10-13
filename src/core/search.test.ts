import { describe, expect, it } from "vitest";
import type { LoadedCollection } from "./collectionRepo";
import { emptyCollection, type Variable } from "./model";
import { buildIndex, search } from "./search";

const v = (key: string, value: string, secret: boolean): Variable => ({ key, value, enabled: true, secret });

function col(variables: Variable[] = []): LoadedCollection {
  return { root: "/c", doc: { ...emptyCollection("API"), variables }, children: [], errors: [], hasCollectionFile: true };
}

describe("search", () => {
  it("ranks name matches above value matches and skips secret values", () => {
    const index = buildIndex({
      collections: [col([v("apiToken", "x", false), v("k", "token-secret", true), v("other", "has-token", false)])],
      globals: [],
      environments: [],
    });
    expect(search("token", index).map((x) => x.label)).toEqual(["apiToken", "other"]);
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
    const many = Array.from({ length: 80 }, (_, i) => v(`item${i}`, "x y", false));
    const index = buildIndex({ collections: [], globals: many, environments: [] });
    expect(search("ITEM", index)).toHaveLength(50);
    expect(search("item7 y", index).map((h) => h.label)).toContain("item7");
    expect(search("   ", index)).toEqual([]);
  });
});
