import { useState, type DragEvent, type MouseEvent } from "react";
import type { LoadedCollection, TreeNode } from "../../core/collectionRepo";
import { dirName, isInside, samePath } from "../../core/path";
import { useTabs } from "../../state/tabs";
import { toast } from "../../state/toasts";
import { useExpanded } from "../../state/treeExpand";
import {
  closeCollection,
  deleteNode,
  duplicateNode,
  moveNode,
  newFolder,
  newRequest,
  newWebSocket,
  openCollectionSettings,
  openNode,
  openRunner,
  renameNode,
} from "../actions";
import { COLLAPSE_MS, Collapsible } from "../common/Collapsible";
import { showMenu, type MenuEntry } from "../common/ContextMenu";
import { Icon } from "../common/icons";
import { methodColor, methodLabel } from "../common/methodColor";
import { openExportDialog } from "../transfer/ExportDialog";
import { useTreeExpand } from "./treeExpandContext";

const DRAG_TYPE = "application/x-httptool-node";
type DropMode = "into" | "before";

function useActivePath() {
  return useTabs((s) => s.tabs.find((t) => t.id === s.activeId)?.path ?? null);
}

function nodeMenu(col: LoadedCollection, node: TreeNode): MenuEntry[] {
  const root = col.root;
  const items: MenuEntry[] = [];
  if (node.type === "folder") {
    items.push(
      { label: "New Request", onSelect: () => newRequest(root, node.path) },
      { label: "New WebSocket", onSelect: () => newWebSocket(root, node.path) },
      { label: "New Folder", onSelect: () => newFolder(root, node.path) },
      { label: "Folder Settings", onSelect: () => openNode(root, node) },
      { label: "Run Folder", onSelect: () => openRunner(root, node.path, node.doc.name) },
      "separator",
    );
  }
  items.push(
    { label: "Rename", onSelect: () => renameNode(root, node) },
    { label: "Duplicate", onSelect: () => duplicateNode(root, node) },
    { label: "Export…", onSelect: () => openExportDialog(col, node) },
    "separator",
    { label: "Delete", danger: true, onSelect: () => deleteNode(root, node) },
  );
  return items;
}

/** Sibling paths of the target directory after `moved` is inserted before `before`. */
function orderWithInsert(siblings: TreeNode[], moved: string, before: string): string[] {
  const paths = siblings.map((s) => s.path).filter((p) => !samePath(p, moved));
  const i = paths.findIndex((p) => samePath(p, before));
  paths.splice(i < 0 ? paths.length : i, 0, moved);
  return paths;
}

function findChildren(col: LoadedCollection, dir: string): TreeNode[] {
  if (samePath(dir, col.root)) return col.children;
  const walk = (nodes: TreeNode[]): TreeNode[] | null => {
    for (const n of nodes) {
      if (n.type !== "folder") continue;
      if (samePath(n.path, dir)) return n.children;
      const found = walk(n.children);
      if (found) return found;
    }
    return null;
  };
  return walk(col.children) ?? [];
}

const Chevron = ({ open }: { open: boolean }) => (
  <Icon
    name="chevronRight"
    size={12}
    className={`shrink-0 text-muted transition-transform ${open ? "rotate-90" : ""}`}
    style={{ transitionDuration: `${COLLAPSE_MS}ms` }}
  />
);

function Row({ col, node, depth }: { col: LoadedCollection; node: TreeNode; depth: number }) {
  const { expanded, toggle, filtering } = useTreeExpand();
  const activePath = useActivePath();
  const [drop, setDrop] = useState<DropMode | null>(null);
  const isOpen = node.type === "folder" && expanded.has(node.path);
  const active = activePath !== null && samePath(activePath, node.path);

  const onDragStart = (e: DragEvent) => {
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ root: col.root, path: node.path }));
    e.dataTransfer.effectAllowed = "move";
  };
  const modeFor = (e: DragEvent): DropMode => {
    if (node.type === "request") return "before";
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return e.clientY - rect.top < rect.height * 0.3 ? "before" : "into";
  };
  const onDragOver = (e: DragEvent) => {
    if (filtering || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
    e.preventDefault();
    setDrop(modeFor(e));
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    if (filtering) return;
    const mode = modeFor(e);
    setDrop(null);
    const data = JSON.parse(e.dataTransfer.getData(DRAG_TYPE) || "null") as { root: string; path: string } | null;
    if (!data || !samePath(data.root, col.root) || samePath(data.path, node.path)) return;
    if (isInside(node.path, data.path)) return; // dropping a folder into its own subtree
    if (mode === "into") {
      useExpanded.getState().expand(node.path);
      void moveNode(col.root, data.path, node.path);
    } else {
      const parent = dirName(node.path);
      void moveNode(col.root, data.path, parent, (moved) => orderWithInsert(findChildren(col, parent), moved, node.path));
    }
  };

  const onClick = () => {
    if (node.type === "folder") toggle(node.path);
    else openNode(col.root, node);
  };
  const onMenu = (e: MouseEvent) => showMenu(e, nodeMenu(col, node));

  return (
    <>
      <div
        draggable={!filtering}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={() => setDrop(null)}
        onDrop={onDrop}
        onClick={onClick}
        onDoubleClick={() => node.type === "folder" && openNode(col.root, node)}
        onContextMenu={onMenu}
        className={`group relative flex h-7 cursor-pointer items-center gap-1 pr-1 transition-colors ${active ? "bg-selected" : "hover:bg-hover active:bg-selected"} ${drop === "into" ? "outline outline-1 -outline-offset-1 outline-accent" : ""}`}
        style={{ paddingLeft: 6 + depth * 14 }}
      >
        {drop === "before" && <div className="absolute inset-x-0 top-0 h-0.5 bg-accent" />}
        {node.type === "folder" ? (
          <>
            <Chevron open={isOpen} />
            <Icon name="folder" size={14} className="shrink-0 text-muted" />
          </>
        ) : node.type === "websocket" ? (
          <span className="mono w-9 shrink-0 text-right text-[10px] font-bold text-[#0d9488] dark:text-[#2dd4bf]">WS</span>
        ) : (
          <span className={`mono w-9 shrink-0 text-right text-[10px] font-bold ${methodColor(node.doc.method)}`}>{methodLabel(node.doc.method)}</span>
        )}
        <span className="min-w-0 flex-1 truncate">{node.doc.name}</span>
        <button
          type="button"
          className="invisible rounded p-0.5 text-muted hover:bg-selected group-hover:visible"
          onClick={onMenu}
          title="More"
        >
          <Icon name="more" />
        </button>
      </div>
      {node.type === "folder" && (
        <Collapsible open={isOpen}>
          {node.children.map((c) => <Row key={c.path} col={col} node={c} depth={depth + 1} />)}
          {node.children.length === 0 && (
            <div className="h-6 text-[11px] leading-6 text-muted" style={{ paddingLeft: 26 + (depth + 1) * 14 }}>
              Empty folder
            </div>
          )}
        </Collapsible>
      )}
    </>
  );
}

export function CollectionTree({ col }: { col: LoadedCollection }) {
  const { expanded, toggle, filtering } = useTreeExpand();
  const [drop, setDrop] = useState(false);
  const isOpen = expanded.has(col.root);

  const menu: MenuEntry[] = [
    { label: "New Request", onSelect: () => newRequest(col.root, col.root) },
    { label: "New WebSocket", onSelect: () => newWebSocket(col.root, col.root) },
    { label: "New Folder", onSelect: () => newFolder(col.root, col.root) },
    { label: "Collection Settings", onSelect: () => openCollectionSettings(col.root) },
    { label: "Run Collection", onSelect: () => openRunner(col.root, col.root, col.doc.name) },
    { label: "Export…", onSelect: () => openExportDialog(col) },
    "separator",
    {
      label: "Copy Path",
      onSelect: () =>
        void navigator.clipboard.writeText(col.root).then(
          () => toast.success("Path copied", col.root),
          (e) => toast.error("Could not copy path", e),
        ),
    },
    { label: "Close Collection", onSelect: () => closeCollection(col.root) },
  ];

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrop(false);
    if (filtering) return;
    const data = JSON.parse(e.dataTransfer.getData(DRAG_TYPE) || "null") as { root: string; path: string } | null;
    if (data && samePath(data.root, col.root)) void moveNode(col.root, data.path, col.root);
  };

  return (
    <div className="mb-1">
      <div
        className={`group flex h-7 cursor-pointer items-center gap-1 pl-1.5 pr-1 font-medium transition-colors hover:bg-hover active:bg-selected ${drop ? "outline outline-1 outline-accent" : ""}`}
        onClick={() => toggle(col.root)}
        onDoubleClick={() => openCollectionSettings(col.root)}
        onContextMenu={(e) => showMenu(e, menu)}
        onDragOver={(e) => {
          if (!filtering && e.dataTransfer.types.includes(DRAG_TYPE)) {
            e.preventDefault();
            setDrop(true);
          }
        }}
        onDragLeave={() => setDrop(false)}
        onDrop={onDrop}
        title={col.root}
      >
        <Chevron open={isOpen} />
        <Icon name="collection" size={14} className="shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate">{col.doc.name}</span>
        {col.errors.length > 0 && (
          <span className="text-warn" title={col.errors.map((e) => `${e.path}: ${e.message}`).join("\n")}>
            ⚠ {col.errors.length}
          </span>
        )}
        <button type="button" className="invisible rounded p-0.5 text-muted hover:bg-selected group-hover:visible" onClick={(e) => showMenu(e, menu)}>
          <Icon name="more" />
        </button>
      </div>
      <Collapsible open={isOpen}>
        {col.children.map((n) => <Row key={n.path} col={col} node={n} depth={1} />)}
        {col.children.length === 0 && (
          <button type="button" className="ml-7 h-6 text-[11px] text-muted hover:text-fg" onClick={() => newRequest(col.root, col.root)}>
            + Add a request
          </button>
        )}
      </Collapsible>
    </div>
  );
}
