import { useRef, useState } from "react";
import { useConsole } from "../state/console";
import { Split } from "./common/Split";
import { Icon } from "./common/icons";
import { ConsolePanel } from "./console/ConsolePanel";
import { RequestPane } from "./request/RequestPane";
import { Sidebar } from "./sidebar/Sidebar";
import { TabBar } from "./tabs/TabBar";
import { TopBar } from "./TopBar";

function StatusBar() {
  const { open, toggle, entries } = useConsole();
  const errors = entries.reduce((n, e) => n + e.errors.length, 0);
  return (
    <div className="flex h-6 shrink-0 items-center gap-3 border-t border-line bg-panel px-3 text-[12px] text-muted">
      <button type="button" className={`flex items-center gap-1 hover:text-fg ${open ? "text-fg" : ""}`} onClick={() => toggle()}>
        <Icon name="terminal" size={12} /> Console
        {errors > 0 && <span className="text-danger">({errors})</span>}
      </button>
    </div>
  );
}

function Workspace() {
  return (
    <div className="flex h-full flex-col">
      <TabBar />
      <div className="min-h-0 flex-1">
        <RequestPane />
      </div>
    </div>
  );
}

const DOCK_KEY = "console-height";

function readHeight() {
  try {
    const v = Number(localStorage.getItem(DOCK_KEY));
    return Number.isFinite(v) && v >= 80 ? v : 220;
  } catch {
    return 220;
  }
}

/** Bottom console with a drag handle; the main layout stays mounted when it opens or closes. */
function ConsoleDock() {
  const [height, setHeight] = useState(readHeight);
  const drag = useRef<{ startY: number; startH: number } | null>(null);
  const onMouseDown = (e: React.MouseEvent) => {
    drag.current = { startY: e.clientY, startH: height };
    const move = (ev: MouseEvent) => {
      if (!drag.current) return;
      const next = Math.min(window.innerHeight * 0.7, Math.max(80, drag.current.startH + drag.current.startY - ev.clientY));
      setHeight(next);
    };
    const up = () => {
      drag.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setHeight((h) => {
        try {
          localStorage.setItem(DOCK_KEY, String(Math.round(h)));
        } catch {
          /* ignore */
        }
        return h;
      });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  return (
    <div className="flex shrink-0 flex-col" style={{ height }}>
      <div className="h-1 shrink-0 cursor-row-resize border-t border-line hover:bg-accent" onMouseDown={onMouseDown} />
      <div className="min-h-0 flex-1">
        <ConsolePanel />
      </div>
    </div>
  );
}

export function AppLayout() {
  const consoleOpen = useConsole((s) => s.open);
  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="min-h-0 flex-1">
        <Split
          id="main"
          orientation="horizontal"
          className="h-full"
          panes={[
            { id: "sidebar", defaultSize: "22", minSize: 180, maxSize: "45", children: <Sidebar /> },
            { id: "content", minSize: "40", children: <Workspace /> },
          ]}
        />
      </div>
      {consoleOpen && <ConsoleDock />}
      <StatusBar />
    </div>
  );
}
