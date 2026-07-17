/** The 20 fixed archetypes (SPEC §9.1). Mirrors the backend DB enum / `app/archetype/vocab.py`;
 * the backend deals only in keys, so the display titles + the legendary flag live here (the same
 * split as `MOVE_CLASSES`). */

export type ArchetypeKey =
  // Bold row (low → high accuracy)
  | "all_gas_no_brakes"
  | "loose_cannon"
  | "the_gambler"
  | "the_closer"
  // Smooth row
  | "certified_cornball"
  | "the_overthinker"
  | "the_diplomat"
  | "smooth_operator"
  // Dry row
  | "ghosted_loading"
  | "one_word_wonder"
  | "the_minimalist"
  | "the_enigma"
  // Chaotic row
  | "the_trainwreck"
  | "feral_texter"
  | "certified_menace"
  | "chaos_charmer"
  // Legendaries
  | "scholars_mate"
  | "the_comeback"
  | "the_brilliancy"
  | "the_massacre";

export interface ArchetypeMeta {
  key: ArchetypeKey;
  /** Display title as it appears on the card (SPEC §9.1). */
  title: string;
  legendary: boolean;
}

export const ARCHETYPES: Record<ArchetypeKey, ArchetypeMeta> = {
  all_gas_no_brakes: { key: "all_gas_no_brakes", title: "All Gas No Brakes", legendary: false },
  loose_cannon: { key: "loose_cannon", title: "Loose Cannon", legendary: false },
  the_gambler: { key: "the_gambler", title: "The Gambler", legendary: false },
  the_closer: { key: "the_closer", title: "The Closer", legendary: false },
  certified_cornball: { key: "certified_cornball", title: "Certified Cornball", legendary: false },
  the_overthinker: { key: "the_overthinker", title: "The Overthinker", legendary: false },
  the_diplomat: { key: "the_diplomat", title: "The Diplomat", legendary: false },
  smooth_operator: { key: "smooth_operator", title: "Smooth Operator", legendary: false },
  ghosted_loading: { key: "ghosted_loading", title: "Ghosted Loading…", legendary: false },
  one_word_wonder: { key: "one_word_wonder", title: "One-Word Wonder", legendary: false },
  the_minimalist: { key: "the_minimalist", title: "The Minimalist", legendary: false },
  the_enigma: { key: "the_enigma", title: "The Enigma", legendary: false },
  the_trainwreck: { key: "the_trainwreck", title: "The Trainwreck", legendary: false },
  feral_texter: { key: "feral_texter", title: "Feral Texter", legendary: false },
  certified_menace: { key: "certified_menace", title: "Certified Menace", legendary: false },
  chaos_charmer: { key: "chaos_charmer", title: "Chaos Charmer", legendary: false },
  scholars_mate: { key: "scholars_mate", title: "Scholar's Mate", legendary: true },
  the_comeback: { key: "the_comeback", title: "The Comeback", legendary: true },
  the_brilliancy: { key: "the_brilliancy", title: "The Brilliancy", legendary: true },
  the_massacre: { key: "the_massacre", title: "The Massacre", legendary: true },
};

/** The classified card identity as delivered to the client (a `game_archetypes` row, awaited
 * over realtime after the game finishes). */
export interface Archetype {
  id: string;
  key: ArchetypeKey;
  legendary: boolean;
  flavor: string;
  /** Transcript positions of the meme excerpt (≤4). */
  memePositions: number[];
}

export const TOTAL_ARCHETYPES = Object.keys(ARCHETYPES).length; // 20 — for the "N / 20" collection
