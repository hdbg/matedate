import type { GradedMove, Suggestion } from "./types";

/**
 * Interim client-side gameplay logic — ported from the prototype in
 * mocks/MateDate Match.html. Personas, ratings and profiles come from Supabase
 * (the local CLI instance during dev), but move *scoring* has no backend engine
 * yet, so grading, canned suggestions and replies are produced locally. Replace
 * these with real engine calls once it exists.
 */

export const SUGGESTIONS: Suggestion[] = [
  { text: "honestly? cereal is a soup and I'll take that to court ⚖️", classKey: "brilliant", swing: 2.7 },
  { text: "pancakes obviously. what's your hill?", classKey: "good", swing: 0.6 },
  { text: "idk lol breakfast is breakfast", classKey: "blunder", swing: -3.2 },
];

const PERSONA_REPLIES = [
  "ok that was actually kind of elite 😂 go on",
  "hmm bold. I respect the conviction",
  "...you're gonna have to work harder than that",
  "wait that's unhinged (complimentary)",
  "see now I'm invested. keep going",
];

/** Loose heuristic grade so free-typed text produces a plausible verdict. */
export function gradeText(text: string): GradedMove {
  const t = text.toLowerCase();
  if (t.length < 6 || /^(idk|lol|k|hey|hi|sup)\b/.test(t)) {
    return { classKey: "mistake", swing: -1.4 };
  }
  if (/[😂😏🔥⚖️👀]|\?$/u.test(text) || t.length > 40) {
    return { classKey: "great", swing: 1.5 };
  }
  return { classKey: "good", swing: 0.7 };
}

export function randomReply(): string {
  return PERSONA_REPLIES[Math.floor(Math.random() * PERSONA_REPLIES.length)];
}
