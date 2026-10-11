import { useEffect, useRef, useState, type ReactNode } from "react";
import { create } from "zustand";
import { Button } from "./Button";

/** Generic modal shell. */
export function Modal({ title, onClose, children, footer, width = 420 }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[85vh] flex-col rounded-lg border border-line bg-panel shadow-xl" style={{ width }}>
        <div className="border-b border-line px-4 py-2.5 font-semibold">{title}</div>
        <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-4 py-2.5">{footer}</div>}
      </div>
    </div>
  );
}

type Dialog =
  | { kind: "choice"; title: string; message: string; buttons: { id: string; label: string; variant?: "primary" | "danger" }[]; resolve: (v: string) => void }
  | { kind: "prompt"; title: string; label: string; initial: string; resolve: (v: string | null) => void }
  | { kind: "custom"; render: (close: () => void) => ReactNode; resolve: () => void };

interface DialogState {
  stack: Dialog[];
  push(d: Dialog): void;
  pop(d: Dialog): void;
}

const useDialogs = create<DialogState>((set, get) => ({
  stack: [],
  push: (d) => set({ stack: [...get().stack, d] }),
  pop: (d) => set({ stack: get().stack.filter((x) => x !== d) }),
}));

/** Resolves with the id of the clicked button, or "cancel" when dismissed. */
export function askChoice(title: string, message: string, buttons: { id: string; label: string; variant?: "primary" | "danger" }[]): Promise<string> {
  return new Promise((resolve) => useDialogs.getState().push({ kind: "choice", title, message, buttons, resolve }));
}

export async function confirmDanger(title: string, message: string, label = "Delete"): Promise<boolean> {
  return (await askChoice(title, message, [{ id: "cancel", label: "Cancel" }, { id: "ok", label, variant: "danger" }])) === "ok";
}

export function askText(title: string, label: string, initial = ""): Promise<string | null> {
  return new Promise((resolve) => useDialogs.getState().push({ kind: "prompt", title, label, initial, resolve }));
}

/** Opens an arbitrary modal; `render` receives a close callback. */
export function openDialog(render: (close: () => void) => ReactNode): Promise<void> {
  return new Promise((resolve) => useDialogs.getState().push({ kind: "custom", render, resolve }));
}

export function alertError(title: string, error: unknown): Promise<string> {
  const message = error instanceof Error ? error.message : String(error);
  return askChoice(title, message, [{ id: "ok", label: "OK", variant: "primary" }]);
}

function PromptBody({ d, close }: { d: Extract<Dialog, { kind: "prompt" }>; close: (v: string | null) => void }) {
  const [value, setValue] = useState(d.initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.select();
  }, []);
  return (
    <Modal
      title={d.title}
      onClose={() => close(null)}
      footer={
        <>
          <Button onClick={() => close(null)}>Cancel</Button>
          <Button variant="primary" disabled={!value.trim()} onClick={() => close(value.trim())}>OK</Button>
        </>
      }
    >
      <label className="mb-1 block text-muted">{d.label}</label>
      <input
        ref={ref}
        autoFocus
        className="w-full rounded border border-line bg-elevated px-2 py-1.5"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && value.trim() && close(value.trim())}
      />
    </Modal>
  );
}

export function DialogHost() {
  const { stack, pop } = useDialogs();
  return (
    <>
      {stack.map((d, i) => {
        if (d.kind === "choice") {
          const close = (v: string) => {
            pop(d);
            d.resolve(v);
          };
          return (
            <Modal
              key={i}
              title={d.title}
              onClose={() => close("cancel")}
              footer={d.buttons.map((b) => (
                <Button key={b.id} variant={b.variant} autoFocus={b.variant === "primary"} onClick={() => close(b.id)}>
                  {b.label}
                </Button>
              ))}
            >
              <p className="whitespace-pre-wrap break-words">{d.message}</p>
            </Modal>
          );
        }
        if (d.kind === "prompt") {
          return (
            <PromptBody
              key={i}
              d={d}
              close={(v) => {
                pop(d);
                d.resolve(v);
              }}
            />
          );
        }
        return (
          <div key={i}>
            {d.render(() => {
              pop(d);
              d.resolve();
            })}
          </div>
        );
      })}
    </>
  );
}
