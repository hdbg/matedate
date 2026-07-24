"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Seconds at/under which the clock is "low" — fires `onLowTime` once, matches the red warn UI. */
const LOW_TIME_THRESHOLD = 10;

/**
 * Per-move countdown clock. Ticks once a second while running; invokes `onFlag`
 * exactly once when it reaches zero, and `onLowTime` once per turn the first tick it
 * drops to the low-time threshold. Ranked matches run it; bot matches leave it
 * paused (relaxed).
 */
export function useMatchClock(onFlag: () => void, onLowTime?: () => void) {
  const [remaining, setRemaining] = useState(0);
  const [running, setRunning] = useState(false);
  const remainingRef = useRef(0);
  const onFlagRef = useRef(onFlag);
  const onLowTimeRef = useRef(onLowTime);
  // One low-time cue per turn; re-armed whenever a fresh turn `start`s.
  const lowFiredRef = useRef(false);

  // Keep the callbacks current without writing the ref during render.
  useEffect(() => {
    onFlagRef.current = onFlag;
    onLowTimeRef.current = onLowTime;
  });

  const start = useCallback((seconds: number) => {
    remainingRef.current = seconds;
    lowFiredRef.current = false;
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
      if (next <= LOW_TIME_THRESHOLD && next > 0 && !lowFiredRef.current) {
        lowFiredRef.current = true;
        onLowTimeRef.current?.();
      }
      if (next === 0) {
        setRunning(false);
        onFlagRef.current();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  return { remaining, running, start, stop, set };
}
