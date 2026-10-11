import { useTabs } from "../../state/tabs";

export function RequestPane() {
  const tab = useTabs((s) => s.tabs.find((t) => t.id === s.activeId));
  if (!tab) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        Open a request from the sidebar or press <span className="mono mx-1">⌘/Ctrl+N</span> to create one.
      </div>
    );
  }
  return <div className="p-4 text-muted">{tab.draft.name}</div>;
}
