import { isDirty, useTabs, type Tab } from "../../state/tabs";
import { closeTab, newUntitledRequest } from "../actions";
import { showMenu } from "../common/ContextMenu";
import { Icon } from "../common/icons";
import { methodColor, methodLabel } from "../common/methodColor";

function TabLabel({ tab }: { tab: Tab }) {
  const d = tab.draft;
  if (d.kind === "http") return <span className={`mono text-[10px] font-bold ${methodColor(d.method)}`}>{methodLabel(d.method)}</span>;
  if (d.kind === "websocket") return <span className="mono text-[10px] font-bold text-[#0d9488] dark:text-[#2dd4bf]">WS</span>;
  if (d.kind === "runner") return <Icon name="play" size={12} className="text-accent" />;
  return <Icon name={d.kind === "folder" ? "folder" : "collection"} size={12} className="text-muted" />;
}

export function TabBar() {
  const { tabs, activeId, activate } = useTabs();
  return (
    <div className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-line bg-panel">
      {tabs.map((t) => {
        const dirty = isDirty(t);
        return (
          <div
            key={t.id}
            onClick={() => activate(t.id)}
            onMouseDown={(e) => e.button === 1 && (e.preventDefault(), void closeTab(t.id))}
            onContextMenu={(e) =>
              showMenu(e, [
                { label: "Close", onSelect: () => closeTab(t.id) },
                {
                  label: "Close Others",
                  onSelect: async () => {
                    for (const o of useTabs.getState().tabs) if (o.id !== t.id) await closeTab(o.id);
                  },
                },
              ])
            }
            title={t.path ?? "Unsaved request"}
            className={`group flex max-w-56 shrink-0 cursor-pointer items-center gap-1.5 border-r border-line px-3 ${
              t.id === activeId ? "bg-bg shadow-[inset_0_2px_0_var(--accent)]" : "text-muted hover:bg-hover"
            }`}
          >
            <TabLabel tab={t} />
            <span className={`truncate ${t.path ? "" : "italic"}`}>{t.draft.name}</span>
            <button
              type="button"
              className="ml-1 flex h-4 w-4 items-center justify-center rounded hover:bg-selected"
              onClick={(e) => {
                e.stopPropagation();
                void closeTab(t.id);
              }}
              title="Close"
            >
              {dirty ? (
                <>
                  <span className="text-[10px] text-accent group-hover:hidden">●</span>
                  <Icon name="close" size={10} className="hidden group-hover:block" />
                </>
              ) : (
                <Icon name="close" size={10} className="invisible group-hover:visible" />
              )}
            </button>
          </div>
        );
      })}
      <button type="button" className="px-3 text-muted hover:text-fg" onClick={() => newUntitledRequest()} title="New request">
        <Icon name="plus" />
      </button>
    </div>
  );
}
