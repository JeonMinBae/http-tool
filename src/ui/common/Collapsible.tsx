import { useEffect, useState, type ReactNode } from "react";

/** Shared with the folder chevron so both finish together. */
export const COLLAPSE_MS = 150;

/**
 * Animates height by transitioning grid rows 0fr ↔ 1fr. Children mount when opening and
 * unmount after the collapse finishes (timer, not transitionend, so older WebViews without
 * grid-row transitions still unmount).
 */
export function Collapsible({ open, children }: { open: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  const [expanded, setExpanded] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Two frames so the 0fr state is painted before switching to 1fr.
      let inner = 0;
      const outer = requestAnimationFrame(() => (inner = requestAnimationFrame(() => setExpanded(true))));
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    setExpanded(false);
    const t = setTimeout(() => setMounted(false), COLLAPSE_MS);
    return () => clearTimeout(t);
  }, [open]);

  if (!mounted) return null;
  return (
    <div
      className={`grid transition-[grid-template-rows] ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      style={{ transitionDuration: `${COLLAPSE_MS}ms` }}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
