import { useEffect, useRef } from "react";
import { create } from "zustand";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}
export type MenuEntry = MenuItem | "separator";

interface MenuState {
  open: { x: number; y: number; items: MenuEntry[] } | null;
  show(x: number, y: number, items: MenuEntry[]): void;
  hide(): void;
}

export const useContextMenu = create<MenuState>((set) => ({
  open: null,
  show: (x, y, items) => set({ open: { x, y, items } }),
  hide: () => set({ open: null }),
}));

export function showMenu(e: { clientX: number; clientY: number; preventDefault(): void; stopPropagation(): void }, items: MenuEntry[]) {
  e.preventDefault();
  e.stopPropagation();
  useContextMenu.getState().show(e.clientX, e.clientY, items);
}

export function ContextMenuHost() {
  const { open, hide } = useContextMenu();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) hide();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && hide();
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    window.addEventListener("blur", hide);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
      window.removeEventListener("blur", hide);
    };
  }, [open, hide]);

  if (!open) return null;
  const x = Math.min(open.x, window.innerWidth - 200);
  const y = Math.min(open.y, window.innerHeight - open.items.length * 28 - 8);
  return (
    <div ref={ref} className="fixed z-50 min-w-44 rounded-md border border-line bg-elevated py-1 shadow-lg" style={{ left: x, top: y }}>
      {open.items.map((item, i) =>
        item === "separator" ? (
          <div key={i} className="my-1 border-t border-line" />
        ) : (
          <button
            key={i}
            type="button"
            disabled={item.disabled}
            className={`block w-full px-3 py-1 text-left hover:bg-hover disabled:opacity-40 ${item.danger ? "text-danger" : ""}`}
            onClick={() => {
              hide();
              item.onSelect();
            }}
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}
