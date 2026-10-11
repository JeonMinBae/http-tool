import type { FsApi, FsEntry } from "../ipc";
import { emptyCollection, emptyFolder, type CollectionDoc, type FolderDoc, type HttpRequestDoc } from "./model";
import { baseName, dirName, isInside, joinPath, samePath } from "./path";
import {
  parseCollection,
  parseFolder,
  parseRequest,
  serializeCollection,
  serializeFolder,
  serializeRequest,
} from "./yaml";

export type TreeNode =
  | { type: "folder"; path: string; doc: FolderDoc; children: TreeNode[] }
  | { type: "request"; path: string; doc: HttpRequestDoc };

export interface LoadError {
  path: string;
  message: string;
}

export interface LoadedCollection {
  root: string;
  doc: CollectionDoc;
  children: TreeNode[];
  errors: LoadError[];
  /** False when the directory has no collection.yaml yet. */
  hasCollectionFile: boolean;
}

export const FOLDER_FILE = "_folder.yaml";
export const COLLECTION_FILE = "collection.yaml";
const RESERVED = new Set([FOLDER_FILE, COLLECTION_FILE]);

function sanitize(name: string, fallback: string): string {
  return name.trim().replace(/[\\/:*?"<>|]/g, "-").replace(/\.+$/, "") || fallback;
}

/** Unique `.yaml` file name for `name`; `taken` holds lower-cased names already in the directory. */
export function toFileName(name: string, taken: Set<string>): string {
  const base = sanitize(name, "untitled");
  let candidate = `${base}.yaml`;
  let n = 2;
  while (taken.has(candidate.toLowerCase()) || RESERVED.has(candidate.toLowerCase())) candidate = `${base}-${n++}.yaml`;
  return candidate;
}

export function toDirName(name: string, taken: Set<string>): string {
  const base = sanitize(name, "folder");
  let candidate = base;
  let n = 2;
  while (taken.has(candidate.toLowerCase())) candidate = `${base}-${n++}`;
  return candidate;
}

const byOrder = (a: TreeNode, b: TreeNode) =>
  a.doc.seq - b.doc.seq || a.doc.name.localeCompare(b.doc.name);

export class CollectionRepo {
  constructor(private fs: FsApi) {}

  /** Registers the root with the backend and returns its canonical path. */
  register(root: string): Promise<string> {
    return this.fs.register(root);
  }

  unregister(root: string): Promise<void> {
    return this.fs.unregister(root);
  }

  async load(root: string): Promise<LoadedCollection> {
    const tree = await this.fs.readTree(root);
    const errors: LoadError[] = [];
    const colFile = tree.children.find((c) => !c.isDir && c.name === COLLECTION_FILE);
    let doc = emptyCollection(baseName(root));
    if (colFile?.content != null) {
      try {
        doc = parseCollection(colFile.content);
      } catch (e) {
        errors.push({ path: colFile.path, message: String(e) });
      }
    }
    return { root: tree.path, doc, children: this.convert(tree, errors), errors, hasCollectionFile: !!colFile };
  }

  private convert(dir: FsEntry, errors: LoadError[]): TreeNode[] {
    const nodes: TreeNode[] = [];
    for (const entry of dir.children) {
      try {
        if (entry.isDir) {
          const folderFile = entry.children.find((c) => !c.isDir && c.name === FOLDER_FILE);
          const doc = folderFile?.content != null ? parseFolder(folderFile.content) : emptyFolder(entry.name);
          nodes.push({ type: "folder", path: entry.path, doc, children: this.convert(entry, errors) });
        } else if (!RESERVED.has(entry.name) && entry.content != null) {
          nodes.push({ type: "request", path: entry.path, doc: parseRequest(entry.content) });
        }
      } catch (e) {
        errors.push({ path: entry.path, message: e instanceof Error ? e.message : String(e) });
      }
    }
    return nodes.sort(byOrder);
  }

  private async siblings(dir: string): Promise<FsEntry[]> {
    return (await this.fs.readTree(dir)).children;
  }

  private async takenNames(dir: string): Promise<Set<string>> {
    return new Set((await this.siblings(dir)).map((c) => c.name.toLowerCase()));
  }

  private async nextSeq(dir: string): Promise<number> {
    const tree = await this.fs.readTree(dir);
    const seqs = this.convert(tree, []).map((n) => n.doc.seq);
    return seqs.length ? Math.max(...seqs) + 1 : 0;
  }

  saveRequest(path: string, doc: HttpRequestDoc): Promise<void> {
    return this.fs.writeFile(path, serializeRequest(doc));
  }

  saveFolder(dir: string, doc: FolderDoc): Promise<void> {
    return this.fs.writeFile(joinPath(dir, FOLDER_FILE), serializeFolder(doc));
  }

  saveCollection(root: string, doc: CollectionDoc): Promise<void> {
    return this.fs.writeFile(joinPath(root, COLLECTION_FILE), serializeCollection(doc));
  }

  async readRequest(path: string): Promise<HttpRequestDoc> {
    return parseRequest(await this.fs.readFile(path));
  }

  private async readFolder(dir: string): Promise<FolderDoc> {
    try {
      return parseFolder(await this.fs.readFile(joinPath(dir, FOLDER_FILE)));
    } catch {
      return emptyFolder(baseName(dir));
    }
  }

  /** Creates a new request file in `dir`; returns its path. */
  async createRequest(dir: string, doc: HttpRequestDoc): Promise<string> {
    const path = joinPath(dir, toFileName(doc.name, await this.takenNames(dir)));
    await this.saveRequest(path, { ...doc, seq: await this.nextSeq(dir) });
    return path;
  }

  async createFolder(parent: string, name: string): Promise<string> {
    const path = joinPath(parent, toDirName(name, await this.takenNames(parent)));
    const seq = await this.nextSeq(parent);
    await this.fs.createDir(path);
    await this.saveFolder(path, emptyFolder(name, seq));
    return path;
  }

  async renameRequest(path: string, name: string): Promise<string> {
    const doc = await this.readRequest(path);
    const dir = dirName(path);
    const taken = await this.takenNames(dir);
    taken.delete(baseName(path).toLowerCase());
    const next = joinPath(dir, toFileName(name, taken));
    if (!samePath(next, path)) await this.fs.rename(path, next);
    await this.saveRequest(next, { ...doc, name });
    return next;
  }

  async renameFolder(dir: string, name: string): Promise<string> {
    const doc = await this.readFolder(dir);
    const parent = dirName(dir);
    const taken = await this.takenNames(parent);
    taken.delete(baseName(dir).toLowerCase());
    const next = joinPath(parent, toDirName(name, taken));
    if (!samePath(next, dir)) await this.fs.rename(dir, next);
    await this.saveFolder(next, { ...doc, name });
    return next;
  }

  /** Moves a request file or folder into `targetDir`, appending it at the end. Returns the new path. */
  async move(path: string, targetDir: string): Promise<string> {
    if (samePath(path, targetDir) || isInside(targetDir, path)) throw new Error("cannot move a folder into itself");
    if (samePath(dirName(path), targetDir)) return path;
    const isFolder = !path.endsWith(".yaml");
    const taken = await this.takenNames(targetDir);
    const name = baseName(path);
    const next = joinPath(
      targetDir,
      isFolder ? toDirName(name, taken) : toFileName(name.replace(/\.yaml$/, ""), taken),
    );
    const seq = await this.nextSeq(targetDir);
    await this.fs.rename(path, next);
    await this.setSeq(next, seq);
    return next;
  }

  async duplicate(path: string): Promise<string> {
    const dir = dirName(path);
    const taken = await this.takenNames(dir);
    if (path.endsWith(".yaml")) {
      const doc = await this.readRequest(path);
      return this.createRequest(dir, { ...doc, name: `${doc.name} copy` });
    }
    const doc = await this.readFolder(path);
    const next = joinPath(dir, toDirName(`${baseName(path)} copy`, taken));
    await this.fs.copy(path, next);
    await this.saveFolder(next, { ...doc, name: `${doc.name} copy`, seq: await this.nextSeq(dir) });
    return next;
  }

  remove(path: string): Promise<void> {
    return this.fs.remove(path);
  }

  /** Rewrites seq of the given sibling paths to match their order. */
  async reorder(paths: string[]): Promise<void> {
    for (const [i, p] of paths.entries()) await this.setSeq(p, i);
  }

  private async setSeq(path: string, seq: number): Promise<void> {
    if (path.endsWith(".yaml")) {
      const doc = await this.readRequest(path);
      if (doc.seq !== seq) await this.saveRequest(path, { ...doc, seq });
    } else {
      const doc = await this.readFolder(path);
      if (doc.seq !== seq) await this.saveFolder(path, { ...doc, seq });
    }
  }
}
