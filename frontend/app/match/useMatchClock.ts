"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Per-move countdown clock. Ticks once a second while running; invokes `onFlag`
 * exactly once when it reaches zero. Ranked matches run it; bot matches leave it
 * paused (relaxed).
 */
export function useMatchClock(onFlag: () => void) {
  const [remaining, setRemaining] = useState(0);
  const [running, setRunning] = useState(false);
  const remainingRef = useRef(0);
  const onFlagRef = useRef(onFlag);

  // Keep the flag callback current without writing the ref during render.
  useEffect(() => {
    onFlagRef.current = onFlag;
  });

  const start = useCallback((seconds: number) => {
    remainingRef.current = seconds;
    setRemaining(seconds);
    setRunning(true);
  }, []);

  const stop = useCallback(() => setRunning(false), []);

  const set = useCallback((seconds: number) => {
    remainingRef.current = seconds;
    setRemaining(seconds);
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      // setState / flag run in the timer callback, not the effect body.
      const next = Math.max(0, remainingRef.current - 1);
      remainingRef.current = next;
      setRemaining(next);
      if (next === 0) {
        setRunning(false);
        onFlagRef.current();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  return { remaining, running, start, stop, set };
}
