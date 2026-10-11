import { useEffect, useRef, useState } from "react";

/**
 * True for `ms` after `trigger` changes. The initial value never fires, so remounts
 * (and StrictMode's double effect) do not replay the flag.
 */
export function useTransientFlag(trigger: unknown, ms: number): boolean {
  const [on, setOn] = useState(false);
  const prev = useRef(trigger);
  useEffect(() => {
    if (Object.is(prev.current, trigger)) return;
    prev.current = trigger;
    setOn(true);
    const t = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(t);
  }, [trigger, ms]);
  return on;
}
