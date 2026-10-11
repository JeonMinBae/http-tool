import { beforeEach, describe, expect, it } from "vitest";
import type { FsApi, FsEntry } from "../ipc";
import { emptyFolder, emptyRequest } from "./model";
import { baseName, dirName } from "./path";
import { serializeFolder, serializeRequest, parseRequest, parseFolder } from "./yaml";
import { CollectionRepo, toDirName, toFileName } from "./collectionRepo";

/** In-memory FsApi: files map path -> content, dirs set. */
class MemFs implements FsApi {
  files = new Map<string, string>();
  dirs = new Set<string>();
  constructor(root: string) {
    this.dirs.add(root);
  }
  async register(root: string) {
    return root;
  }
  async unregister() {}
  async readTree(root: string): Promise<FsEntry> {
    const children: FsEntry[] = [];
    for (const d of this.dirs) if (dirName(d) === root) children.push(await this.readTree(d));
    for (const [p, c] of this.files)
      if (dirName(p) === root) children.push({ name: baseName(p), path: p, isDir: false, content: c, children: [] });
    children.sort((a, b) => a.name.localeCompare(b.name));
    return { name: baseName(root), path: root, isDir: true, content: null, children };
  }
  async readFile(p: string) {
    const c = this.files.get(p);
    if (c === undefined) throw new Error(`missing ${p}`);
    return c;
  }
  async writeFile(p: string, c: string) {
    this.files.set(p, c);
  }
  async createDir(p: string) {
    this.dirs.add(p);
  }
  async rename(from: string, to: string) {
    for (const [p, c] of [...this.files])
      if (p === from || p.startsWith(from + "/")) {
        this.files.delete(p);
        this.files.set(to + p.slice(from.length), c);
      }
    for (const d of [...this.dirs])
      if (d === from || d.startsWith(from + "/")) {
        this.dirs.delete(d);
        this.dirs.add(to + d.slice(from.length));
      }
  }
  async copy() {}
  async remove(p: string) {
    this.files.delete(p);
    for (const d of [...this.dirs]) if (d === p || d.startsWith(p + "/")) this.dirs.delete(d);
    for (const f of [...this.files.keys()]) if (f.startsWith(p + "/")) this.files.delete(f);
  }
}

const ROOT = "/c";
let fs: MemFs;
let repo: CollectionRepo;

beforeEach(() => {
  fs = new MemFs(ROOT);
  repo = new CollectionRepo(fs);
  fs.files.set("/c/collection.yaml", "kind: collection\nname: API\n");
  fs.dirs.add("/c/users");
  fs.files.set("/c/users/_folder.yaml", serializeFolder({ kind: "folder", name: "Users", seq: 1, auth: { type: "inherit" }, scripts: { pre: "", post: "" } }));
  fs.files.set("/c/users/b.yaml", serializeRequest({ ...emptyRequest("B", 1) }));
  fs.files.set("/c/users/a.yaml", serializeRequest({ ...emptyRequest("A", 2) }));
  fs.files.set("/c/root.yaml", serializeRequest({ ...emptyRequest("Root", 0) }));
});

describe("toFileName", () => {
  it("replaces forbidden characters", () => {
    expect(toFileName('a/b:c*?"<>|', new Set())).toBe("a-b-c------.yaml");
  });
  it("adds suffix on case-insensitive collision", () => {
    expect(toFileName("Get", new Set(["get.yaml", "get-2.yaml"]))).toBe("Get-3.yaml");
  });
  it("falls back for empty names and reserved file names", () => {
    expect(toFileName("  ", new Set())).toBe("untitled.yaml");
    expect(toFileName("_folder", new Set())).toBe("_folder-2.yaml");
    expect(toFileName("collection", new Set())).toBe("collection-2.yaml");
  });
  it("dir names have no extension", () => {
    expect(toDirName("My: folder", new Set(["my- folder"]))).toBe("My- folder-2");
  });
});

describe("CollectionRepo.load", () => {
  it("builds a tree sorted by seq, ignoring reserved files", async () => {
    const col = await repo.load(ROOT);
    expect(col.doc.name).toBe("API");
    expect(col.children.map((c) => c.doc.name)).toEqual(["Root", "Users"]);
    const users = col.children[1];
    expect(users.type).toBe("folder");
    if (users.type !== "folder") return;
    expect(users.children.map((c) => c.doc.name)).toEqual(["B", "A"]);
  });

  it("uses defaults when collection.yaml or _folder.yaml is missing", async () => {
    fs.files.delete("/c/collection.yaml");
    fs.files.delete("/c/users/_folder.yaml");
    const col = await repo.load(ROOT);
    expect(col.doc.name).toBe("c");
    expect(col.children.find((c) => c.type === "folder")?.doc.name).toBe("users");
  });

  it("reports broken files instead of failing the whole load", async () => {
    fs.files.set("/c/broken.yaml", "kind: [");
    const col = await repo.load(ROOT);
    expect(col.errors).toEqual([expect.objectContaining({ path: "/c/broken.yaml" })]);
    expect(col.children).toHaveLength(2);
  });
});

describe("CollectionRepo mutations", () => {
  it("creates a request with a unique file name and next seq", async () => {
    const path = await repo.createRequest("/c/users", emptyRequest("A"));
    expect(path).toBe("/c/users/A-2.yaml");
    expect(parseRequest(fs.files.get(path)!).seq).toBe(3);
  });

  it("creates a folder with _folder.yaml", async () => {
    const path = await repo.createFolder(ROOT, "Auth");
    expect(path).toBe("/c/Auth");
    expect(parseFolder(fs.files.get("/c/Auth/_folder.yaml")!).name).toBe("Auth");
  });

  it("renames a request file and its name", async () => {
    const path = await repo.renameRequest("/c/users/a.yaml", "Alpha");
    expect(path).toBe("/c/users/Alpha.yaml");
    expect(fs.files.has("/c/users/a.yaml")).toBe(false);
    expect(parseRequest(fs.files.get(path)!).name).toBe("Alpha");
  });

  it("renames a folder directory and its _folder.yaml name", async () => {
    const path = await repo.renameFolder("/c/users", "People");
    expect(path).toBe("/c/People");
    expect(parseFolder(fs.files.get("/c/People/_folder.yaml")!).name).toBe("People");
    expect(fs.files.has("/c/People/a.yaml")).toBe(true);
  });

  it("moves a request into another folder, avoiding collisions", async () => {
    fs.files.set("/c/users/root.yaml", serializeRequest(emptyRequest("Other")));
    const path = await repo.move("/c/root.yaml", "/c/users");
    expect(path).toBe("/c/users/root-2.yaml");
  });

  it("refuses to move a folder into itself", async () => {
    await expect(repo.move("/c/users", "/c/users")).rejects.toThrow(/itself/);
  });

  it("reorders siblings by rewriting seq", async () => {
    await repo.reorder(["/c/users/a.yaml", "/c/users/b.yaml"]);
    expect(parseRequest(fs.files.get("/c/users/a.yaml")!).seq).toBe(0);
    expect(parseRequest(fs.files.get("/c/users/b.yaml")!).seq).toBe(1);
  });
});

describe("websocket files", () => {
  it("loads websocket documents as websocket nodes and renames them", async () => {
    const { serializeWebSocket } = await import("./yaml");
    const { emptyWebSocket } = await import("./model");
    fs.files.set("/c/chat.yaml", serializeWebSocket({ ...emptyWebSocket("Chat", 9), url: "ws://x" }));
    const col = await repo.load(ROOT);
    expect(col.children.find((c) => c.doc.name === "Chat")?.type).toBe("websocket");
    const path = await repo.renameRequest("/c/chat.yaml", "Chat 2");
    expect((await repo.readRequest(path)).kind).toBe("websocket");
  });
});

describe("importItems", () => {
  const DIR = "/c/imported";
  beforeEach(() => {
    fs.dirs.add(DIR);
  });

  it("appends after existing items and suffixes clashing names", async () => {
    await repo.createRequest(DIR, emptyRequest("Get user"));
    await repo.importItems(DIR, [
      emptyRequest("Get user"),
      { ...emptyFolder("F"), auth: { type: "bearer", token: "{{t}}" }, items: [emptyRequest("Get user"), emptyRequest("Get user")] },
    ]);
    const col = await repo.load(DIR);
    expect(col.children.map((n) => [n.doc.name, n.doc.seq])).toEqual([
      ["Get user", 0],
      ["Get user (2)", 1],
      ["F", 2],
    ]);
    const folder = col.children[2];
    expect(folder.type === "folder" && folder.doc.auth).toEqual({ type: "bearer", token: "{{t}}" });
    expect(folder.type === "folder" && folder.children.map((n) => n.doc.name)).toEqual(["Get user", "Get user (2)"]);
  });

  it("does not modify the existing request", async () => {
    const path = await repo.createRequest(DIR, { ...emptyRequest("A"), url: "keep" });
    await repo.importItems(DIR, [{ ...emptyRequest("A"), url: "new" }]);
    expect(parseRequest(fs.files.get(path)!).url).toBe("keep");
  });
});
