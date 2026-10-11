import type { ReactNode } from "react";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";

export interface SplitPane {
  id: string;
  children: ReactNode;
  /** Percentages as strings ("25") or pixels as numbers. */
  defaultSize?: string | number;
  minSize?: string | number;
  maxSize?: string | number;
}

/** Resizable split whose layout is remembered per `id`. */
export function Split({ id, orientation, panes, className = "" }: {
  id: string;
  orientation: "horizontal" | "vertical";
  panes: SplitPane[];
  className?: string;
}) {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id, storage: localStorage, panelIds: panes.map((p) => p.id) });
  return (
    <Group orientation={orientation} defaultLayout={defaultLayout} onLayoutChanged={onLayoutChanged} className={className}>
      {panes.flatMap((p, i) => [
        i > 0 && (
          <Separator
            key={`${p.id}-sep`}
            className={`${orientation === "horizontal" ? "w-px" : "h-px"} bg-line transition-colors hover:bg-accent data-[separator=active]:bg-accent`}
          />
        ),
        <Panel key={p.id} id={p.id} defaultSize={p.defaultSize} minSize={p.minSize} maxSize={p.maxSize}>
          {p.children}
        </Panel>,
      ])}
    </Group>
  );
}
