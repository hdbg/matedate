"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface ReplayControls {
  step: number; // 0 = overview, 1..stepMax = a You move
  stepMax: number;
  playing: boolean;
  goTo: (n: number) => void;
  first: () => void;
  prev: () => void;
  next: () => void;
  togglePlay: () => void;
}

const PLAY_INTERVAL_MS = 2400;

function readSavedStep(storageKey: string, stepMax: number): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(storageKey);
    const saved = raw == null ? NaN : parseInt(raw, 10);
    if (!Number.isNaN(saved) && saved >= 0 && saved <= stepMax) return saved;
  } catch {
    /* storage disabled */
  }
  return 0;
}

/**
 * The replay state machine behind the Game Review scrubber/transport (ported from the mock's JS):
 * a step from 0 (overview) to N (one per You move), autoplay that advances every 2.4s and stops at
 * the end, `localStorage` persistence keyed per analysis, and ←/→/space keyboard control. Mount
 * only once the move count is known so the restored/clamped step uses the right maximum.
 */
export function useReviewReplay(youMoveCount: number, storageKey: string): ReplayControls {
  const stepMax = youMoveCount;
  const [step, setStep] = useState(() => readSavedStep(storageKey, youMoveCount));
  const [playing, setPlaying] = useState(false);

  // Latest step for the async autoplay tick, without re-arming the interval every step.
  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, String(step));
    } catch {
      /* storage disabled */
    }
  }, [storageKey, step]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setStep((s) => Math.min(stepMax, s + 1));
      if (stepRef.current + 1 >= stepMax) setPlaying(false); // async callback — stops at the end
    }, PLAY_INTERVAL_MS);
    return () => clearInterval(id);
  }, [playing, stepMax]);

  const goTo = useCallback(
    (n: number) => {
      setPlaying(false);
      setStep(Math.max(0, Math.min(stepMax, n)));
    },
    [stepMax],
  );
  const first = useCallback(() => goTo(0), [goTo]);
  const prev = useCallback(() => {
    setPlaying(false);
    setStep((s) => Math.max(0, s - 1));
  }, []);
  const next = useCallback(() => {
    setPlaying(false);
    setStep((s) => Math.min(stepMax, s + 1));
  }, [stepMax]);
  const togglePlay = useCallback(() => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (step >= stepMax) setStep(0); // restart from the overview if parked at the end
    setPlaying(true);
  }, [playing, step, stepMax]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, togglePlay]);

  return { step, stepMax, playing, goTo, first, prev, next, togglePlay };
}
