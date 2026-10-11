import { describe, expect, it, vi } from "vitest";
import type { AppDataApi } from "../ipc";
import type { CollectionRepo, LoadedCollection } from "../core/collectionRepo";
import { emptyCollection } from "../core/model";
import { secretsName } from "../core/secrets";
import { createWorkspaceStore } from "./workspace";

function memAppData(initial: Record<string, unknown> = {}): AppDataApi & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = { ...initial };
  return {
    data,
    read: async <T,>(name: string) => (data[name] as T) ?? null,
    write: async (name: string, value: unknown) => {
      data[name] = value;
    },
  };
}

function fakeRepo(existing: string[]): CollectionRepo {
  const col = (root: string): LoadedCollection => ({
    root,
    doc: { ...emptyCollection("c"), variables: [{ key: "token", value: "", enabled: true, secret: true }] },
    children: [],
    errors: [],
    hasCollectionFile: true,
  });
  return {
    register: vi.fn(async (p: string) => {
      if (!existing.includes(p)) throw new Error("missing");
      return p;
    }),
    unregister: vi.fn(async () => {}),
    load: vi.fn(async (root: string) => col(root)),
    saveCollection: vi.fn(async () => {}),
  } as unknown as CollectionRepo;
}

describe("workspace store", () => {
  it("restores open collections, drops missing ones and applies secrets", async () => {
    const appData = memAppData({
      workspace: { openCollections: ["/a", "/gone"] },
      [await secretsName("/a")]: { token: "s3cr3t" },
    });
    const store = createWorkspaceStore(fakeRepo(["/a"]), appData);
    await store.getState().restore();
    const { collections, missing } = store.getState();
    expect(collections.map((c) => c.root)).toEqual(["/a"]);
    expect(collections[0].doc.variables[0].value).toBe("s3cr3t");
    expect(missing).toEqual(["/gone"]);
    expect(appData.data.workspace).toEqual({ openCollections: ["/a"] });
  });

  it("saves secret values to app data, not via the collection file only", async () => {
    const appData = memAppData();
    const repo = fakeRepo(["/a"]);
    const store = createWorkspaceStore(repo, appData);
    await store.getState().openCollection("/a");
    const doc = { ...emptyCollection("c"), variables: [{ key: "token", value: "new", enabled: true, secret: true }] };
    await store.getState().saveCollectionDoc("/a", doc);
    expect(appData.data[await secretsName("/a")]).toEqual({ token: "new" });
    expect(repo.saveCollection).toHaveBeenCalledWith("/a", doc);
  });

  it("opening the same collection twice keeps one entry", async () => {
    const store = createWorkspaceStore(fakeRepo(["/a"]), memAppData());
    await store.getState().openCollection("/a");
    await store.getState().openCollection("/a");
    expect(store.getState().collections).toHaveLength(1);
  });
});
