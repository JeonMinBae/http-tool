/** Indeterminate spinner; inherits the text color. */
export function Spinner({ size = 12, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

/** Pulsing dot for a live connection. */
export function PulseDot() {
  return <span className="inline-block h-2 w-2 shrink-0 animate-pulse-dot rounded-full bg-ok" />;
}
