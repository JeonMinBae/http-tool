import { useEffect } from "react";
import { closeTab, newUntitledRequest, saveActiveTab } from "./actions";
import { useTabs } from "../state/tabs";

export const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

/** True for Cmd on macOS and Ctrl elsewhere. */
export const isPrimaryModifier = (e: KeyboardEvent | React.KeyboardEvent) => (isMac ? e.metaKey : e.ctrlKey);

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isPrimaryModifier(e) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "s") {
        e.preventDefault();
        void saveActiveTab();
      } else if (key === "n" && !e.shiftKey) {
        e.preventDefault();
        newUntitledRequest();
      } else if (key === "w") {
        e.preventDefault();
        const id = useTabs.getState().activeId;
        if (id) void closeTab(id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
