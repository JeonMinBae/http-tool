import { useEffect, useState } from "react";
import { useSettings } from "./state/settings";
import { useVariables } from "./state/variables";
import { useWorkspace } from "./state/workspace";
import { AppLayout } from "./ui/AppLayout";
import { ContextMenuHost } from "./ui/common/ContextMenu";
import { DialogHost } from "./ui/common/dialogs";
import { useShortcuts } from "./ui/useShortcuts";

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useShortcuts();

  useEffect(() => {
    Promise.all([useSettings.getState().load(), useVariables.getState().load(), useWorkspace.getState().restore()])
      .catch((e) => setError(String(e)))
      .finally(() => setReady(true));
  }, []);

  if (!ready) return null;
  return (
    <>
      {error && <div className="bg-danger px-3 py-1 text-white">Failed to load app data: {error}</div>}
      <AppLayout />
      <ContextMenuHost />
      <DialogHost />
    </>
  );
}
