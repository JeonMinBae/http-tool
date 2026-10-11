import { create } from "zustand";

export type ToastKind = "success" | "error";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  detail?: string;
}

export const MAX_TOASTS = 3;
export const TOAST_MS: Record<ToastKind, number> = { success: 2000, error: 5000 };

interface ToastsState {
  toasts: Toast[];
  push(kind: ToastKind, message: string, detail?: string): number;
  dismiss(id: number): void;
}

let seq = 0;

export const useToasts = create<ToastsState>((set, get) => ({
  toasts: [],
  push(kind, message, detail) {
    const id = ++seq;
    set({ toasts: [...get().toasts, { id, kind, message, detail }].slice(-MAX_TOASTS) });
    setTimeout(() => get().dismiss(id), TOAST_MS[kind]);
    return id;
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = {
  success: (message: string, detail?: string) => useToasts.getState().push("success", message, detail),
  error: (title: string, error: unknown) =>
    useToasts.getState().push("error", title, error instanceof Error ? error.message : String(error)),
};
