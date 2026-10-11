import { useEffect, useRef, useState } from "react";
import { useResponses } from "../../state/responses";
import { isDirty, useTabs, type Tab } from "../../state/tabs";
import { closeTab, newUntitledRequest } from "../actions";
import { showMenu } from "../common/ContextMenu";
import { Icon } from "../common/icons";
import { Spinner } from "../common/Spinner";
import { useTransientFlag } from "../common/useTransientFlag";
import { methodColor, methodLabel } from "../common/methodColor";
import { mergeExiting, type Exiting } from "./exiting";

function TabLabel({ tab }: { tab: Tab }) {
  const d = tab.draft;
  if (d.kind === "http") return <span className={`mono text-[10px] font-bold ${methodColor(d.method)}`}>{methodLabel(d.method)}</span>;
  if (d.kind === "websocket") return <span className="mono text-[10px] font-bold text-[#0d9488] dark:text-[#2dd4bf]">WS</span>;
  if (d.kind === "runner") return <Icon name="play" size={12} className="text-accent" />;
  return <Icon name={d.kind === "folder" ? "folder" : "collection"} size={12} className="text-muted" />;
}

const TAB_BASE = "flex max-w-56 shrink-0 items-center gap-1.5 overflow-hidden whitespace-nowrap border-r border-line px-3";
/** Upper bound for the tab-out animation (120ms) before a closed tab is removed anyway. */
const TAB_OUT_FALLBACK_MS = 300;

/** Method label, or a spinner while the tab's request is in flight. */
function TabIcon({ tab }: { tab: Tab }) {
  const sending = useResponses((s) => s.byTab[tab.id]?.status === "sending");
  return sending ? <Spinner size={10} className="text-accent" /> : <TabLabel tab={tab} />;
}

/** Store tabs plus recently closed ones, kept until their exit animation ends. */
function useExitingTabs(tabs: Tab[]) {
  const [list, setList] = useState<Exiting<Tab>[]>(() => tabs.map((item) => ({ item, exiting: false })));
  const [seen, setSeen] = useState(tabs);
  if (seen !== tabs) {
    setSeen(tabs);
    setList(mergeExiting(list, tabs, (t) => t.id));
  }
  const drop = (id: string) => setList((l) => l.filter((e) => !(e.exiting && e.item.id === id)));
  return [list, drop] as const;
}

/** A closed tab shrinking away; it is already gone from the store. */
function ClosingTab({ tab, onDone }: { tab: Tab; onDone: () => void }) {
  const done = useRef(onDone);
  done.current = onDone;
  // Fallback in case animationend never fires (e.g. hidden window).
  useEffect(() => {
    const t = setTimeout(() => done.current(), TAB_OUT_FALLBACK_MS);
    return () => clearTimeout(t);
  }, []);
  return (
    <div
      onAnimationEnd={(e) => e.target === e.currentTarget && onDone()}
      className={`${TAB_BASE} pointer-events-none animate-tab-out text-muted`}
    >
      <TabLabel tab={tab} />
      <span className="truncate">{tab.draft.name}</span>
    </div>
  );
}

function TabCloseButton({ tab }: { tab: Tab }) {
  const justSaved = useTransientFlag(tab.savedAt, 1200);
  // Shown in place of the close icon until hover: unsaved dot, or a brief check after saving.
  const marker = isDirty(tab) ? (
    <span className="text-[10px] text-accent group-hover:hidden">●</span>
  ) : justSaved ? (
    <Icon name="check" size={10} className="animate-fade-in text-ok group-hover:hidden" />
  ) : null;
  return (
    <button
      type="button"
      className="ml-1 flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-selected"
      onClick={(e) => {
        e.stopPropagation();
        void closeTab(tab.id);
      }}
      title="Close"
    >
      {marker ? (
        <>
          {marker}
          <Icon name="close" size={10} className="hidden group-hover:block" />
        </>
      ) : (
        <Icon name="close" size={10} className="invisible group-hover:visible" />
      )}
    </button>
  );
}

export function TabBar() {
  const { tabs, activeId, activate } = useTabs();
  const [list, drop] = useExitingTabs(tabs);
  return (
    <div className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-line bg-panel">
      {list.map(({ item: t, exiting }) =>
        exiting ? (
          <ClosingTab key={t.id} tab={t} onDone={() => drop(t.id)} />
        ) : (
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
            className={`${TAB_BASE} group animate-tab-in cursor-pointer transition-colors ${
              t.id === activeId ? "bg-bg shadow-[inset_0_2px_0_var(--accent)]" : "text-muted hover:bg-hover active:bg-selected"
            }`}
          >
            <TabIcon tab={t} />
            <span className={`truncate ${t.path ? "" : "italic"}`}>{t.draft.name}</span>
            <TabCloseButton tab={t} />
          </div>
        ),
      )}
      <button type="button" className="px-3 text-muted transition-colors hover:text-fg" onClick={() => newUntitledRequest()} title="New request">
        <Icon name="plus" />
      </button>
    </div>
  );
}
