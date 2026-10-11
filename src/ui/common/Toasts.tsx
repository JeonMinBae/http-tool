import { useToasts } from "../../state/toasts";
import { Icon } from "./icons";

/** Bottom-right toasts, above the status bar. Click to dismiss. */
export function ToastHost() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed bottom-8 right-3 z-50 flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className="pointer-events-auto flex w-full animate-toast-in items-start gap-2 rounded-md border border-line bg-elevated px-3 py-2 text-left shadow-lg"
        >
          <Icon name={t.kind === "success" ? "check" : "alert"} size={14} className={`mt-0.5 shrink-0 ${t.kind === "success" ? "text-ok" : "text-danger"}`} />
          <span className="min-w-0 flex-1">
            <span className="block">{t.message}</span>
            {t.detail && <span className="mono block max-h-24 overflow-auto whitespace-pre-wrap break-words text-[12px] text-muted">{t.detail}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}
