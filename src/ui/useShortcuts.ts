import { useEffect } from "react";
import { executeRequest } from "../core/execute";
import { closeTab, newUntitledRequest, saveActiveTab } from "./actions";
import { useResponses } from "../state/responses";
import { useSidebar } from "../state/sidebar";
import { useTabs } from "../state/tabs";
import { isDialogOpen } from "./common/dialogs";
import { cycleBodyMode } from "./response/ResponseViewer";
import { openSettings } from "./settings/SettingsDialog";

export const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

/** True for Cmd on macOS and Ctrl elsewhere. */
export const isPrimaryModifier = (e: KeyboardEvent | React.KeyboardEvent) => (isMac ? e.metaKey : e.ctrlKey);

/** Activates the tab `step` positions away from the active one, wrapping around. */
function stepTab(step: number) {
  const { tabs, activeId, activate } = useTabs.getState();
  if (!tabs.length) return;
  const i = tabs.findIndex((t) => t.id === activeId);
  activate(tabs[(i + step + tabs.length) % tabs.length].id);
}

/** ⌘1–8 pick that tab, ⌘9 the last one. */
function pickTab(n: number) {
  const { tabs, activate } = useTabs.getState();
  const tab = n === 9 ? tabs[tabs.length - 1] : tabs[n - 1];
  if (tab) activate(tab.id);
}

function sendActive() {
  const tab = useTabs.getState().active();
  if (tab?.draft.kind !== "http" || useResponses.getState().byTab[tab.id]?.status === "sending") return;
  void executeRequest(tab.id);
}

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ctrl+Tab is Ctrl on both platforms, so it sits outside the primary-modifier check.
      if (e.ctrlKey && !e.metaKey && !e.altKey && e.key === "Tab") {
        e.preventDefault();
        if (!isDialogOpen()) stepTab(e.shiftKey ? -1 : 1);
        return;
      }
      if (!isPrimaryModifier(e) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "s") {
        e.preventDefault();
        void saveActiveTab();
      } else if (key === "n" && !e.shiftKey) {
        e.preventDefault();
        newUntitledRequest();
      } else if (key === "k") {
        e.preventDefault();
        if (!isDialogOpen()) useSidebar.getState().focusSearch();
      } else if (key === "w") {
        e.preventDefault();
        const id = useTabs.getState().activeId;
        if (id) void closeTab(id);
      } else if (key === "enter") {
        e.preventDefault();
        if (!isDialogOpen()) sendActive();
      } else if (key === "," && !e.shiftKey) {
        e.preventDefault();
        if (!isDialogOpen()) openSettings();
      } else if (key === "b" && e.shiftKey) {
        e.preventDefault();
        if (!isDialogOpen()) cycleBodyMode();
      } else if (/^[1-9]$/.test(e.key) && !e.shiftKey) {
        e.preventDefault();
        if (!isDialogOpen()) pickTab(Number(e.key));
      } else if (isMac && e.shiftKey && (e.code === "BracketLeft" || e.code === "BracketRight")) {
        // Shift turns the key into "{" / "}", so match the physical key.
        e.preventDefault();
        if (!isDialogOpen()) stepTab(e.code === "BracketLeft" ? -1 : 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
