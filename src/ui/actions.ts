import { open as openDialogPicker, save as saveDialogPicker } from "@tauri-apps/plugin-dialog";
import { fileApi } from "../ipc";
import { sanitizeName, type TreeNode } from "../core/collectionRepo";
import { countRequests, type ImportPlan, type TransferNode } from "../core/transfer/model";
import { emptyRequest, emptyWebSocket, type HttpRequestDoc } from "../core/model";
import { samePath } from "../core/path";
import { visiblePathParams } from "../core/pathParams";
import { useStreams } from "../state/streams";
import { useExpanded } from "../state/treeExpand";
import { useWebSockets } from "../state/websockets";
import { isDirty, useTabs } from "../state/tabs";
import { toast } from "../state/toasts";
import { collectionRepo, useWorkspace } from "../state/workspace";
import { askChoice, askText, confirmDanger } from "./common/dialogs";
import { forgetArrival } from "./response/arrival";
import { pickSaveLocation } from "./tabs/SaveAsDialog";

const ws = () => useWorkspace.getState();
const tabs = () => useTabs.getState();

async function guard<T>(title: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    toast.error(title, e);
    return undefined;
  }
}

const importedMessage = (items: TransferNode[]) => {
  const n = countRequests(items);
  return `Imported ${n} ${n === 1 ? "request" : "requests"}`;
};

export async function openCollectionFromDialog() {
  const picked = await openDialogPicker({ directory: true, multiple: false, title: "Open collection folder" });
  if (typeof picked !== "string") return;
  await guard("Could not open collection", async () => {
    const col = await ws().openCollection(picked);
    if (!col.hasCollectionFile) await ws().saveCollectionDoc(col.root, col.doc);
    useExpanded.getState().expand(col.root);
    await ws().reload(col.root);
  });
}

/** Asks for a destination and writes the text `render` builds for that path. Returns false on cancel or error. */
export async function exportToFile(
  defaultPath: string,
  filters: { name: string; extensions: string[] }[],
  render: (path: string) => string,
): Promise<boolean> {
  const path = await saveDialogPicker({ title: "Export", defaultPath, filters });
  if (!path) return false;
  const done = await guard("Could not export", async () => {
    await fileApi.saveText(path, render(path));
    toast.success("Exported", path);
    return true;
  });
  return done ?? false;
}

/** Creates a new collection folder under a user-picked directory and writes the plan into it. */
export async function importAsCollection(plan: Extract<ImportPlan, { kind: "collection" }>, name: string): Promise<boolean> {
  const parent = await openDialogPicker({ directory: true, multiple: false, title: "Choose where to create the collection" });
  if (typeof parent !== "string") return false;
  const done = await guard("Could not import", async () => {
    const dir = await fileApi.createUniqueDir(parent, sanitizeName(name, "collection"));
    const col = await ws().openCollection(dir);
    await ws().saveCollectionDoc(col.root, { ...plan.collection, name });
    await collectionRepo.importItems(col.root, plan.items);
    useExpanded.getState().expand(col.root);
    await ws().reload(col.root);
    toast.success(importedMessage(plan.items));
    return true;
  });
  return done ?? false;
}

/** Adds imported folders/requests to an open collection, after the items already in `dir`. */
export async function importIntoFolder(root: string, dir: string, items: TransferNode[]): Promise<boolean> {
  const done = await guard("Could not import", async () => {
    await collectionRepo.importItems(dir, items);
    useExpanded.getState().expand(root, dir);
    await ws().reload(root);
    toast.success(importedMessage(items));
    return true;
  });
  return done ?? false;
}

export async function closeCollection(root: string) {
  const open = tabs().tabs.filter((t) => t.root && samePath(t.root, root));
  if (open.some(isDirty)) {
    const choice = await askChoice("Close collection", "Some tabs in this collection have unsaved changes. Close them anyway?", [
      { id: "cancel", label: "Cancel" },
      { id: "close", label: "Close", variant: "danger" },
    ]);
    if (choice !== "close") return;
  }
  open.forEach((t) => tabs().close(t.id));
  await ws().closeCollection(root);
}

export function openNode(root: string, node: TreeNode) {
  tabs().open(root, node.path, node.doc);
}

export function openRunner(root: string, path: string, name: string) {
  tabs().open(root, path, { kind: "runner", name: `Run: ${name}` });
}

export function openCollectionSettings(root: string) {
  const col = ws().collections.find((c) => samePath(c.root, root));
  if (col) tabs().open(col.root, col.root, col.doc);
}

export async function newRequest(root: string, dir: string) {
  const name = await askText("New request", "Name", "New Request");
  if (!name) return;
  await guard("Could not create request", async () => {
    const path = await collectionRepo.createRequest(dir, emptyRequest(name));
    useExpanded.getState().expand(root, dir);
    await ws().reload(root);
    tabs().open(root, path, await collectionRepo.readRequest(path));
  });
}

export async function newWebSocket(root: string, dir: string) {
  const name = await askText("New WebSocket", "Name", "New WebSocket");
  if (!name) return;
  await guard("Could not create WebSocket", async () => {
    const path = await collectionRepo.createRequest(dir, emptyWebSocket(name));
    useExpanded.getState().expand(root, dir);
    await ws().reload(root);
    tabs().open(root, path, await collectionRepo.readRequest(path));
  });
}

export async function newFolder(root: string, parent: string) {
  const name = await askText("New folder", "Name", "New Folder");
  if (!name) return;
  await guard("Could not create folder", async () => {
    await collectionRepo.createFolder(parent, name);
    useExpanded.getState().expand(root, parent);
    await ws().reload(root);
  });
}

export async function renameNode(root: string, node: TreeNode) {
  const name = await askText(`Rename ${node.type}`, "Name", node.doc.name);
  if (!name || name === node.doc.name) return;
  await guard("Could not rename", async () => {
    const next = await collectionRepo.rename(node, name);
    tabs().renamePath(node.path, next);
    await ws().reload(root);
    syncTabsWithTree(root);
  });
}

export async function duplicateNode(root: string, node: TreeNode) {
  await guard("Could not duplicate", async () => {
    await collectionRepo.duplicate(node.path);
    await ws().reload(root);
  });
}

export async function deleteNode(root: string, node: TreeNode) {
  const what = node.type === "folder" ? `folder "${node.doc.name}" and everything in it` : `request "${node.doc.name}"`;
  if (!(await confirmDanger("Delete", `Delete ${what}? This removes the files from disk.`))) return;
  await guard("Could not delete", async () => {
    await collectionRepo.remove(node.path);
    tabs().removePath(node.path);
    await ws().reload(root);
  });
}

/**
 * Moves `path` into `targetDir` (appended at the end). `siblingsAfterMove` may return the desired
 * sibling order, given the moved node's new path, to place it elsewhere.
 */
export async function moveNode(root: string, path: string, targetDir: string, siblingsAfterMove?: (moved: string) => string[]) {
  await guard("Could not move", async () => {
    const moved = await collectionRepo.move(path, targetDir);
    if (!samePath(moved, path)) tabs().renamePath(path, moved);
    if (siblingsAfterMove) await collectionRepo.reorder(siblingsAfterMove(moved));
    await ws().reload(root);
    syncTabsWithTree(root);
  });
}

/** After tree changes, refresh saved snapshots of open tabs (names, seq). */
function syncTabsWithTree(root: string) {
  const col = ws().collections.find((c) => samePath(c.root, root));
  if (!col) return;
  const walk = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      tabs().refreshSaved(n.path, n.doc);
      if (n.type === "folder") walk(n.children);
    }
  };
  walk(col.children);
}

export function newUntitledRequest(doc?: HttpRequestDoc) {
  tabs().open(null, null, doc ?? emptyRequest("Untitled Request"));
}

export async function saveTab(id: string): Promise<boolean> {
  const tab = tabs().tabs.find((t) => t.id === id);
  if (!tab) return false;
  const result = await guard("Could not save", async () => {
    // Values remembered for names removed from the URL are dropped on save.
    const doc = tab.draft.kind === "http" ? { ...tab.draft, pathParams: visiblePathParams(tab.draft.url, tab.draft.pathParams) } : tab.draft;
    if (doc.kind === "runner") return true;
    if (doc.kind === "collection") {
      await ws().saveCollectionDoc(tab.root!, doc);
      tabs().markSaved(id, tab.root!, tab.path!);
      return true;
    }
    if (doc.kind === "folder") {
      await collectionRepo.saveFolder(tab.path!, doc);
      tabs().markSaved(id, tab.root!, tab.path!);
      await ws().reload(tab.root!);
      return true;
    }
    if (tab.path && tab.root) {
      await collectionRepo.saveRequest(tab.path, doc);
      tabs().markSaved(id, tab.root, tab.path, doc);
      await ws().reload(tab.root);
      return true;
    }
    const target = await pickSaveLocation(doc.name);
    if (!target) return false;
    const path = await collectionRepo.createRequest(target.dir, { ...doc, name: target.name });
    useExpanded.getState().expand(target.root, target.dir);
    const saved = await collectionRepo.readRequest(path);
    tabs().markSaved(id, target.root, path, saved);
    await ws().reload(target.root);
    return true;
  });
  return result ?? false;
}

export async function saveActiveTab() {
  const id = tabs().activeId;
  if (id) await saveTab(id);
}

/** Closes a tab, asking to save when it has unsaved changes. */
export async function closeTab(id: string) {
  const tab = tabs().tabs.find((t) => t.id === id);
  if (!tab) return;
  if (isDirty(tab)) {
    const choice = await askChoice("Unsaved changes", `Save changes to "${tab.draft.name}" before closing?`, [
      { id: "cancel", label: "Cancel" },
      { id: "discard", label: "Don't Save" },
      { id: "save", label: "Save", variant: "primary" },
    ]);
    if (choice === "cancel") return;
    if (choice === "save" && !(await saveTab(id))) return;
  }
  await useStreams.getState().stop(id);
  await useWebSockets.getState().disconnect(id);
  useStreams.getState().clear(id);
  forgetArrival(id);
  tabs().close(id);
}
