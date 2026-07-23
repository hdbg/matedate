import { createClient } from "@/app/lib/supabase/client";
import { classifyEvalDelta } from "@/app/lib/game/service";
import type {
  AnalysisJobRow,
  DatingGoal,
  GameRow,
  MatchRow,
  MoveEvalRow,
  PlayerRatingsRow,
  ProfileRow,
  PvpMatchRow,
  RatingHistoryRow,
  SoloGameRow,
  TextingStyle,
} from "@/app/lib/supabase/types";
import { tierFor, type TierInfo } from "@matedate/visuals";

/** New accounts start at 1000 (the player_ratings default, minted by the signup trigger). */
const DEFAULT_ELO = 1000;

export type HistoryCategory = "solo" | "ranked" | "practice" | "review" | "puzzle";

export type ResultTone = "w" | "l" | "solve" | "rev";

export interface HistoryItem {
  gameId: string;
  category: HistoryCategory;
  title: string;
  accuracy: number | null;
  /** Standout meta segment, e.g. "2 Brilliants" or the engine's verdict title. */
  highlight: { text: string; tone: "brilliant" | "blunder" | "plain" } | null;
  whenISO: string;
  result: { label: string; tone: ResultTone };
  /** Elo delta; null renders `flatLabel` instead ("casual", "—"). */
  delta: number | null;
  flatLabel: string | null;
  /** Completed deep review to open on click, if one exists. */
  analysisId: string | null;
  /** For ranked rows: the viewer's own side of the match (drives the Share Card side chooser). */
  ownSide?: "a" | "b";
}

export interface ProfileData {
  userId: string;
  displayName: string;
  handle: string | null;
  /** Raw editable fields, prefilling the edit modal. */
  username: string | null;
  rawDisplayName: string | null;
  avatarPath: string | null;
  elo: number;
  peak: number;
  tier: TierInfo;
  /** Rated (elo-affecting) games — rating_history rows; gates the provisional rank. */
  ratedGames: number;
  streakDays: number;
  career: {
    games: number;
    winRatePct: number | null;
    avgAccuracyPct: number | null;
    brilliants: number;
  };
  prefs: {
    goal: DatingGoal | null;
    styles: TextingStyle[];
    clockLabel: string;
  };
  counts: Record<"all" | HistoryCategory, number>;
  history: HistoryItem[];
}

/** Last successful load, kept so a repeat visit paints instantly (revalidated in the background). */
let lastProfile: ProfileData | null = null;

/** The cached profile, if any — used to seed state on mount and avoid a loading flash. */
export function cachedProfile(): ProfileData | null {
  return lastProfile;
}

/**
 * Load + derive everything the Profile screen shows. All reads are owner-scoped by RLS
 * (`moves`/`solo_games` need no explicit game filter — their policies check game ownership).
 * Stats the DB doesn't store (peak, streak, brilliants, win rate, tier) are derived here,
 * the same way move ranks derive from evals. Returns null when there's no signed-in user.
 */
export async function loadProfile(): Promise<ProfileData | null> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return null;

  const [
    { data: profileRow },
    { data: ratingRow },
    { data: historyRows },
    { data: gameRows },
    { data: soloRows },
    { data: moveRows },
    { data: pvpRows },
    { data: jobRows },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("username, display_name, avatar_path, dating_goal, texting_style")
      .eq("id", userId)
      .maybeSingle(),
    supabase.from("player_ratings").select("elo_rating").eq("user_id", userId).maybeSingle(),
    supabase.from("rating_history").select("rating_after").eq("user_id", userId).eq("kind", "elo"),
    supabase
      .from("games")
      .select("id, mode, title, accuracy, status, end_reason, created_at, ended_at")
      .eq("user_id", userId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("solo_games")
      .select("game_id, persona_id, is_practice, rating_delta, base_seconds, increment_seconds"),
    supabase.from("moves").select("game_id, eval_delta, eval_after").eq("side", "You"),
    // Finished PvP matches (participant-scoped by RLS; both the parent and the sides row).
    supabase
      .from("pvp_matches")
      .select("*, matches!inner(*)")
      .eq("matches.status", "completed")
      .limit(100),
    supabase
      .from("analysis_jobs")
      .select("game_id, match_id, analysis_id")
      .eq("kind", "game_analysis")
      .eq("status", "completed"),
  ]);

  const profile = (profileRow ?? null) as Pick<
    ProfileRow,
    "username" | "display_name" | "avatar_path" | "dating_goal" | "texting_style"
  > | null;
  const rating = (ratingRow ?? null) as Pick<PlayerRatingsRow, "elo_rating"> | null;
  const ratingHistory = (historyRows ?? []) as Pick<RatingHistoryRow, "rating_after">[];
  const games = (gameRows ?? []) as GameRow[];
  const solos = (soloRows ?? []) as SoloGameRow[];
  const moves = (moveRows ?? []) as MoveEvalRow[];
  const pvps = (pvpRows ?? []) as (PvpMatchRow & { matches: MatchRow })[];
  const jobs = (jobRows ?? []) as Pick<AnalysisJobRow, "game_id" | "match_id" | "analysis_id">[];

  const soloByGame = new Map(solos.map((s) => [s.game_id, s]));

  // Persona names label solo/practice/ranked rows ("AI date · Maya", "Ranked · Maya").
  const personaIds = [
    ...new Set(
      [...solos.map((s) => s.persona_id), ...pvps.map((p) => p.matches.persona_id)].filter(
        (id): id is string => !!id,
      ),
    ),
  ];
  const personaNameById = new Map<string, string>();
  if (personaIds.length > 0) {
    const { data: personaRows } = await supabase
      .from("personas")
      .select("id, name")
      .in("id", personaIds);
    for (const p of (personaRows ?? []) as { id: string; name: string }[]) {
      personaNameById.set(p.id, p.name);
    }
  }

  const elo = rating?.elo_rating ?? DEFAULT_ELO;
  const peak = Math.max(elo, ...ratingHistory.map((r) => r.rating_after));
  const analysisByGame = new Map(
    jobs.filter((j) => j.game_id && j.analysis_id).map((j) => [j.game_id!, j.analysis_id!]),
  );
  // Only my own jobs are visible (RLS), i.e. the side I requested — exactly the board to open.
  const analysisByMatch = new Map(
    jobs.filter((j) => j.match_id && j.analysis_id).map((j) => [j.match_id!, j.analysis_id!]),
  );

  const moveStats = moveStatsByGame(moves);
  let brilliants = 0;
  for (const s of moveStats.values()) brilliants += s.brilliant;

  const history = [
    ...games.map((game) =>
      toHistoryItem(game, soloByGame.get(game.id), {
        personaNameById,
        moveStats: moveStats.get(game.id),
        analysisId: analysisByGame.get(game.id) ?? null,
      }),
    ),
    ...pvps.map((pvp) =>
      toPvpHistoryItem(pvp, userId, personaNameById, analysisByMatch.get(pvp.match_id) ?? null),
    ),
  ].sort((a, b) => (a.whenISO < b.whenISO ? 1 : -1));

  const counts: ProfileData["counts"] = { all: 0, solo: 0, ranked: 0, practice: 0, review: 0, puzzle: 0 };
  for (const item of history) counts[item.category] += 1;
  counts.all = history.length;

  // Win rate covers the conversational games (solo + practice); reviews/puzzles have no W/L.
  const decided = history.filter((h) => h.category === "solo" || h.category === "practice");
  const wins = decided.filter((h) => h.result.tone === "w").length;

  const accuracies = games.map((g) => g.accuracy).filter((a): a is number => a != null);

  lastProfile = {
    userId,
    displayName: profile?.display_name ?? profile?.username ?? "Anonymous player",
    handle: profile?.username ? `@${profile.username}` : null,
    username: profile?.username ?? null,
    rawDisplayName: profile?.display_name ?? null,
    avatarPath: profile?.avatar_path ?? null,
    elo,
    peak,
    tier: tierFor(elo, ratingHistory.length),
    ratedGames: ratingHistory.length,
    streakDays: streakDays(games.map((g) => g.created_at)),
    career: {
      games: games.length,
      winRatePct: decided.length > 0 ? Math.round((wins / decided.length) * 100) : null,
      avgAccuracyPct:
        accuracies.length > 0
          ? Math.round(accuracies.reduce((sum, a) => sum + a, 0) / accuracies.length)
          : null,
      brilliants,
    },
    prefs: {
      goal: profile?.dating_goal ?? null,
      styles: profile?.texting_style ?? [],
      clockLabel: clockLabel(games, soloByGame),
    },
    counts,
    history,
  };
  return lastProfile;
}

interface GameMoveStats {
  brilliant: number;
  great: number;
  blunder: number;
}

function moveStatsByGame(moves: MoveEvalRow[]): Map<string, GameMoveStats> {
  const byGame = new Map<string, GameMoveStats>();
  for (const move of moves) {
    let stats = byGame.get(move.game_id);
    if (!stats) {
      stats = { brilliant: 0, great: 0, blunder: 0 };
      byGame.set(move.game_id, stats);
    }
    const key = classifyEvalDelta(move.eval_delta, move.eval_after);
    if (key === "brilliant") stats.brilliant += 1;
    else if (key === "great") stats.great += 1;
    else if (key === "blunder") stats.blunder += 1;
  }
  return byGame;
}

function toHistoryItem(
  game: GameRow,
  solo: SoloGameRow | undefined,
  ctx: {
    personaNameById: Map<string, string>;
    moveStats: GameMoveStats | undefined;
    analysisId: string | null;
  },
): HistoryItem {
  const category: HistoryCategory =
    game.mode === "screenshot"
      ? "review"
      : game.mode === "puzzle"
        ? "puzzle"
        : solo?.is_practice
          ? "practice"
          : "solo";

  const personaName = solo?.persona_id ? ctx.personaNameById.get(solo.persona_id) : undefined;
  const title =
    category === "solo" && personaName
      ? `AI date · ${personaName}`
      : category === "practice" && personaName
        ? `Practice vs. ${personaName}`
        : (game.title ?? categoryMeta(category).fallbackTitle);

  return {
    gameId: game.id,
    category,
    title,
    accuracy: game.accuracy != null ? Math.round(game.accuracy) : null,
    highlight: highlightFor(ctx.moveStats, game.title),
    whenISO: game.ended_at ?? game.created_at,
    result: resultFor(category, game.end_reason, solo),
    delta: category === "solo" ? (solo?.rating_delta ?? null) : null,
    flatLabel: category === "solo" ? "—" : category === "practice" ? "casual" : "—",
    analysisId: ctx.analysisId,
  };
}

/** A finished PvP match as a history row. The opponent's profile isn't readable (RLS),
 * so rows are labeled by the shared persona; the result derives from winner_side. */
function toPvpHistoryItem(
  pvp: PvpMatchRow & { matches: MatchRow },
  userId: string,
  personaNameById: Map<string, string>,
  analysisId: string | null,
): HistoryItem {
  const match = pvp.matches;
  const side: "a" | "b" = pvp.player_a === userId ? "a" : "b";
  const personaName = personaNameById.get(match.persona_id);
  const accuracy = side === "a" ? pvp.player_a_accuracy : pvp.player_b_accuracy;
  const eloBefore = side === "a" ? pvp.player_a_elo_before : pvp.player_b_elo_before;
  const eloAfter = side === "a" ? pvp.player_a_elo_after : pvp.player_b_elo_after;
  const result: HistoryItem["result"] =
    match.winner_side === null
      ? { label: "DRAW", tone: "rev" }
      : match.winner_side === side
        ? { label: "WON", tone: "w" }
        : { label: "LOST", tone: "l" };
  return {
    gameId: match.id,
    category: "ranked",
    title: personaName
      ? `${match.rated ? "Ranked" : "Friendly"} · ${personaName}`
      : match.rated
        ? "Ranked match"
        : "Friendly match",
    accuracy: accuracy != null ? Math.round(accuracy) : null,
    highlight: null,
    whenISO: match.completed_at ?? match.created_at,
    result,
    delta: match.rated && eloBefore != null && eloAfter != null ? eloAfter - eloBefore : null,
    flatLabel: match.rated ? "—" : "friendly",
    analysisId,
    ownSide: side,
  };
}

function resultFor(
  category: HistoryCategory,
  endReason: string | null,
  solo: SoloGameRow | undefined,
): HistoryItem["result"] {
  if (category === "review") return { label: "CARD", tone: "rev" };
  if (category === "puzzle") return { label: "SOLVED", tone: "solve" };
  // solo / practice: checkmates decide outright; a scored game is judged by the server's
  // rating delta — the one authoritative outcome signal (never client-computed).
  if (endReason === "date_landed") return { label: "WON", tone: "w" };
  if (endReason === "blocked" || endReason === "timeout") return { label: "LOST", tone: "l" };
  return (solo?.rating_delta ?? 0) > 0 ? { label: "MATCH", tone: "w" } : { label: "LOST", tone: "l" };
}

function highlightFor(
  stats: GameMoveStats | undefined,
  verdictTitle: string | null,
): HistoryItem["highlight"] {
  if (stats?.brilliant) {
    return { text: `${stats.brilliant} Brilliant${stats.brilliant > 1 ? "s" : ""}`, tone: "brilliant" };
  }
  if (stats?.blunder) {
    return { text: `${stats.blunder} Blunder${stats.blunder > 1 ? "s" : ""}`, tone: "blunder" };
  }
  if (stats?.great) return { text: `${stats.great} Great`, tone: "plain" };
  return verdictTitle ? { text: verdictTitle, tone: "plain" } : null;
}

export function categoryMeta(category: HistoryCategory): {
  label: string;
  icon: string;
  iconClassName: string;
  fallbackTitle: string;
} {
  switch (category) {
    case "solo":
      return { label: "Solo", icon: "💘", iconClassName: "bg-cream-2", fallbackTitle: "AI date" };
    case "ranked":
      return {
        label: "Ranked",
        icon: "⚔️",
        iconClassName: "bg-rosy-tint text-rosy-deep",
        fallbackTitle: "Ranked match",
      };
    case "practice":
      return { label: "Practice", icon: "🤖", iconClassName: "bg-cream-2", fallbackTitle: "Practice match" };
    case "review":
      return {
        label: "Review",
        icon: "📸",
        iconClassName: "bg-m-brilliant/[0.15] text-m-brilliant",
        fallbackTitle: "Screenshot review",
      };
    case "puzzle":
      return {
        label: "Puzzle",
        icon: "🧩",
        iconClassName: "bg-m-great/[0.15] text-m-great",
        fallbackTitle: "Daily puzzle",
      };
  }
}

/** Consecutive calendar days (local) with at least one game, counting back from today.
 * A streak whose latest day is yesterday still counts; today just hasn't been played yet. */
export function streakDays(gameISOs: string[], now: Date = new Date()): number {
  const days = new Set(gameISOs.map((iso) => localDayKey(new Date(iso))));
  const cursor = new Date(now);
  if (!days.has(localDayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(localDayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** The player's clock setup, read from their most recent solo game's Fischer settings. */
function clockLabel(games: GameRow[], soloByGame: Map<string, SoloGameRow>): string {
  for (const game of games) {
    const solo = soloByGame.get(game.id);
    if (solo) {
      const name = solo.base_seconds <= 30 ? "Bullet" : solo.base_seconds <= 45 ? "Rapid" : "Classical";
      return `${name} · ${solo.base_seconds}s +${solo.increment_seconds}s`;
    }
  }
  return "Bullet · 30s +5s";
}
