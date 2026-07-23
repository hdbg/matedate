/**
 * Rating tiers — the ladder vocabulary (SPEC §3.1). Chess-piece tiers climbing to a
 * "Checkmate" apex; each non-apex tier splits into divisions III → II → I (thirds of the
 * band). Tiers are derived from the rating on read, never stored — same principle as move
 * classification. Below PROVISIONAL_GAMES rated games a player shows as "Unrated".
 */

export interface Tier {
  name: string;
  glyph: string;
  /** Dating-flavor subtitle shown on badges/cards; the rank string itself stays clean. */
  flavor: string;
  floor: number;
}

export const TIERS: Tier[] = [
  { name: "Pawn", glyph: "♟", flavor: "Left on Read", floor: 0 },
  { name: "Knight", glyph: "♞", flavor: "The Wingman", floor: 600 },
  { name: "Bishop", glyph: "♝", flavor: "Smooth Operator", floor: 800 },
  { name: "Rook", glyph: "♜", flavor: "Solid Foundations", floor: 1000 },
  { name: "Queen", glyph: "♛", flavor: "Main Character", floor: 1200 },
  { name: "King", glyph: "♚", flavor: "The Catch", floor: 1400 },
  { name: "Checkmate", glyph: "#", flavor: "Found Their Mate", floor: 1600 },
];

/** Rated games needed before a rank shows (chess-authentic "Unrated" until then). */
export const PROVISIONAL_GAMES = 5;

/** Solo per-game rating cap (±25) — used to phrase progress as "about N clean wins". */
const MAX_DELTA_PER_GAME = 25;

export interface TierInfo {
  name: string;
  division: "III" | "II" | "I" | null; // null at the undivided apex
  /** Display rank, e.g. "Rook III" or "Checkmate". */
  label: string;
  glyph: string;
  flavor: string;
  /** True below PROVISIONAL_GAMES rated games — render "Unrated" instead of the rank. */
  provisional: boolean;
  /** Progress through the current division toward `nextLabel` (0–100; 100 at the apex). */
  progressPct: number;
  /** Rating floor of the next division/tier, e.g. 1067 (null at the apex). */
  nextFloor: number | null;
  pointsToNext: number | null;
  nextLabel: string | null;
  /** pointsToNext expressed in max-delta games, e.g. "about 3 clean wins". */
  cleanWins: number | null;
}

/** Derive the display tier for a rating (pure; mirrors how move ranks derive from evals). */
export function tierFor(elo: number, ratedGames: number): TierInfo {
  const rating = Math.max(0, Math.floor(elo));
  const provisional = ratedGames < PROVISIONAL_GAMES;

  const apex = TIERS[TIERS.length - 1];
  if (rating >= apex.floor) {
    return {
      name: apex.name,
      division: null,
      label: apex.name,
      glyph: apex.glyph,
      flavor: apex.flavor,
      provisional,
      progressPct: 100,
      nextFloor: null,
      pointsToNext: null,
      nextLabel: null,
      cleanWins: null,
    };
  }

  const index = TIERS.findIndex(
    (t, i) => rating >= t.floor && rating < TIERS[i + 1].floor,
  );
  const tier = TIERS[index];
  const ceiling = TIERS[index + 1].floor;
  const width = ceiling - tier.floor;

  // Divisions are ascending thirds of the band: III (bottom) → II → I (top).
  const boundaries = [
    tier.floor,
    tier.floor + Math.round(width / 3),
    tier.floor + Math.round((2 * width) / 3),
    ceiling,
  ];
  const divIndex = rating < boundaries[1] ? 0 : rating < boundaries[2] ? 1 : 2;
  const division = (["III", "II", "I"] as const)[divIndex];
  const divFloor = boundaries[divIndex];
  const nextFloor = boundaries[divIndex + 1];
  const nextLabel =
    divIndex === 2
      ? index + 1 === TIERS.length - 1
        ? apex.name
        : `${TIERS[index + 1].name} III`
      : `${tier.name} ${(["III", "II", "I"] as const)[divIndex + 1]}`;

  const pointsToNext = nextFloor - rating;
  return {
    name: tier.name,
    division,
    label: `${tier.name} ${division}`,
    glyph: tier.glyph,
    flavor: tier.flavor,
    provisional,
    progressPct: Math.round(((rating - divFloor) / (nextFloor - divFloor)) * 100),
    nextFloor,
    pointsToNext,
    nextLabel,
    cleanWins: Math.max(1, Math.ceil(pointsToNext / MAX_DELTA_PER_GAME)),
  };
}
