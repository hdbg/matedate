import type { GameService, GradedMove, Persona, Suggestion } from "./types";

/**
 * Mock gameplay engine — ported from the prototype logic in
 * mocks/MateDate Match.html. Grades text loosely so the UI feels alive without
 * a real scoring backend. Swap for the real engine via NEXT_PUBLIC_USE_MOCK.
 */

const PERSONAS: Record<string, Persona> = {
  maya: {
    slug: "maya",
    name: "Maya, 26",
    hint: "🎭 persona type: hidden — read her",
    openingLine:
      'ok your profile says you\'ll "die on a hill about breakfast foods" — defend that immediately 🍳',
  },
  devon: {
    slug: "devon",
    name: "Devon, 28",
    hint: "🎭 persona type: hidden — read them",
    openingLine: "be honest — what's a hobby you're secretly way too into? 👀",
  },
  sasha: {
    slug: "sasha",
    name: "Sasha, 25",
    hint: "🎭 persona type: hidden — read her",
    openingLine:
      "quick: convince me not to swipe left using exactly one weird fact about you",
  },
};

const DEFAULT_PERSONA = "maya";

const SUGGESTIONS: Suggestion[] = [
  { text: "honestly? cereal is a soup and I'll take that to court ⚖️", classKey: "brilliant", swing: 2.4 },
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
function gradeFree(text: string): GradedMove {
  const t = text.toLowerCase();
  if (t.length < 6 || /^(idk|lol|k|hey|hi|sup)\b/.test(t)) {
    return { classKey: "mistake", swing: -1.4 };
  }
  if (/[😂😏🔥⚖️👀]|\?$/u.test(text) || t.length > 40) {
    return { classKey: "great", swing: 1.5 };
  }
  return { classKey: "good", swing: 0.7 };
}

function randomOf<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export const mockGameService: GameService = {
  async getPersona(slug = DEFAULT_PERSONA) {
    return PERSONAS[slug] ?? PERSONAS[DEFAULT_PERSONA];
  },
  getSuggestions() {
    return SUGGESTIONS;
  },
  async gradeMove(text) {
    return gradeFree(text);
  },
  async getPersonaReply() {
    return randomOf(PERSONA_REPLIES);
  },
};
