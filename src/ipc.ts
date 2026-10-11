import { invoke } from "@tauri-apps/api/core";

export interface FsEntry {
  name: string;
  path: string;
  isDir: boolean;
  content: string | null;
  children: FsEntry[];
}

/** File system operations on collection directories (paths must be inside a registered root). */
export interface FsApi {
  register(root: string): Promise<string>;
  unregister(root: string): Promise<void>;
  readTree(root: string): Promise<FsEntry>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  createDir(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  copy(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
}

export const fsApi: FsApi = {
  register: (root) => invoke("collection_register", { root }),
  unregister: (root) => invoke("collection_unregister", { root }),
  readTree: (root) => invoke("fs_read_tree", { root }),
  readFile: (path) => invoke("fs_read_file", { path }),
  writeFile: (path, content) => invoke("fs_write_file", { path, content }),
  createDir: (path) => invoke("fs_create_dir", { path }),
  rename: (from, to) => invoke("fs_rename", { from, to }),
  copy: (from, to) => invoke("fs_copy", { from, to }),
  remove: (path) => invoke("fs_delete", { path }),
};
