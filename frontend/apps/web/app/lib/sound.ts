"use client";

/**
 * Game sound effects. Every clip is instantiated and warmed up front (`preloadSounds`) so that
 * playing one at an exact moment (a sent move, the intro's sword clash, a win/loss, the low-time
 * warning) never waits on a network fetch and never misses its timing.
 *
 * Playback reuses the single warmed element per key (resetting `currentTime`) rather than cloning,
 * so the preloaded/decoded buffer is what actually plays. These cues never meaningfully overlap
 * (one per turn / one-shots), so restarting an in-flight clip is fine.
 */
export type SoundKey = "move" | "capture" | "newChallenge" | "victory" | "defeat" | "lowTime";

const SOURCES: Record<SoundKey, string> = {
  move: "/assets/Move.mp3",
  capture: "/assets/Capture.mp3",
  newChallenge: "/assets/NewChallenge.mp3",
  victory: "/assets/Victory.mp3",
  defeat: "/assets/Defeat.mp3",
  lowTime: "/assets/LowTime.mp3",
};

/** Per-clip volume — the move/capture ticks sit under the outcome stings so they don't fatigue. */
const VOLUME: Record<SoundKey, number> = {
  move: 0.55,
  capture: 0.6,
  newChallenge: 0.7,
  victory: 0.8,
  defeat: 0.8,
  lowTime: 0.7,
};

let cache: Partial<Record<SoundKey, HTMLAudioElement>> | null = null;

const isBrowser = () => typeof window !== "undefined" && typeof Audio !== "undefined";

/** Instantiate + warm every clip. Idempotent; safe to call on every relevant screen mount. */
export function preloadSounds(): void {
  if (!isBrowser() || cache) return;
  cache = {};
  for (const key of Object.keys(SOURCES) as SoundKey[]) {
    const audio = new Audio(SOURCES[key]);
    audio.preload = "auto";
    audio.volume = VOLUME[key];
    audio.load();
    cache[key] = audio;
  }
}

/** Play a warmed clip from the start. No-ops on the server; swallows autoplay/interrupt rejections. */
export function playSound(key: SoundKey): void {
  if (!isBrowser()) return;
  if (!cache) preloadSounds();
  const audio = cache?.[key];
  if (!audio) return;
  try {
    audio.currentTime = 0;
  } catch {
    /* not seekable yet — play from wherever it is */
  }
  void audio.play().catch(() => {
    /* autoplay blocked before a user gesture, or interrupted — not fatal */
  });
}
