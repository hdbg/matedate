import { createClient } from "@/app/lib/supabase/client";
import { classifyEvalDelta, type MoveClassKey } from "@/app/lib/game/service";
import type {
  GameAnalysisMoveRevealRow,
  GameAnalysisMoveRow,
  GameAnalysisRow,
  GameRow,
  MatchRow,
  PvpMatchRow,
  SoloGameRow,
  PersonaRow,
} from "@/app/lib/supabase/types";

type SupabaseClient = ReturnType<typeof createClient>;

/** One graded "You" move, aligned to a replay step (1..N). */
export interface ReviewMove {
  position: number;
  threadIndex: number; // index into `thread` so the replay can reveal up to this bubble
  classKey: MoveClassKey;
  swing: number; // eval_delta / 10
  evalAfter: number; // 0–100 interest after this move
  comment: string;
  isTop: boolean; // brilliant — no best line needed, shown free
  /** The paid best line, only present when the game is unlocked (RLS-gated). */
  bestLine: string | null;
  /** True when a best line exists but is locked (non-top move without a returned reveal). */
  bestLineLocked: boolean;
}

export interface ReviewThreadItem {
  key: string;
  side: "you" | "match";
  content: string;
  move: ReviewMove | null; // present on graded You bubbles
}

/** PvP source context: which side of which match this review annotates. */
export interface ReviewMatchContext {
  matchId: string;
  side: "a" | "b";
  /** Whether the viewed side is the signed-in player's own board. */
  isYou: boolean;
  rated: boolean;
  /** Where the side switch navigates: the other side's analysis when one exists, else its
   * live-eval replay (`/analysis/match/<id>?board=<side>` — always available post-match). */
  otherHref: string;
}

export interface ReviewData {
  title: string;
  description: string;
  tags: string[];
  accuracy: number | null;
  ratingDelta: number | null;
  personaName: string | null;
  endReason: string | null;
  dateISO: string;
  thread: ReviewThreadItem[];
  youMoves: ReviewMove[]; // ordered; youMoves[step-1] is the move at replay step `step`
  finalEval: number; // eval after the last You move (the overview split)
  /** False for a live-eval replay (no deep review yet) — ranks only, no comments/best lines. */
  hasAnalysis: boolean;
  /** Source game, when there is one — lets the replay screen request a deep review. */
  gameId: string | null;
  /** PvP source, when the analysis annotates one side of a match — drives the side switch. */
  match: ReviewMatchContext | null;
}

interface MoveRow {
  position: number;
  side: "You" | "Match";
  content: string;
  eval_after: number | null;
  eval_delta: number | null;
}

const DEFAULT_EVAL = 50;

/**
 * Load + normalize everything the Game Review screen needs for one analysis. All reads are
 * owner-scoped by RLS. The analysis holds the re-scored You moves; the full conversation (both
 * sides) comes from the source `moves`, matched by `position`. Falls back to a You-only thread for
 * sources without a live transcript (future screenshot / PvP), and returns null if the analysis
 * isn't found / readable.
 */
export async function loadReview(analysisId: string): Promise<ReviewData | null> {
  const supabase = createClient();

  const { data: analysisRow } = await supabase
    .from("game_analyses")
    .select("*")
    .eq("id", analysisId)
    .maybeSingle();
  if (!analysisRow) return null;
  const analysis = analysisRow as GameAnalysisRow;

  // The moves and (separately, RLS-gated) their best-line reveals: the reveal rows come back only
  // when the game is unlocked, so a non-top move with no reveal is a locked best line.
  const [{ data: moveRows }, { data: revealRows }] = await Promise.all([
    supabase.from("game_analysis_moves").select("*").eq("analysis_id", analysisId).order("position"),
    supabase.from("game_analysis_move_reveals").select("*").eq("analysis_id", analysisId),
  ]);
  const analysisMoves = (moveRows ?? []) as GameAnalysisMoveRow[];
  const bestLineByMoveId = new Map<string, string>();
  for (const r of (revealRows ?? []) as GameAnalysisMoveRevealRow[]) {
    bestLineByMoveId.set(r.analysis_move_id, r.best_line);
  }

  // Per-position re-scored verdict (before we know each move's place in the rendered thread).
  const verdictByPosition = new Map<number, Omit<ReviewMove, "threadIndex">>();
  for (const m of analysisMoves) {
    const classKey = classifyEvalDelta(m.eval_delta, m.eval_after);
    const isTop = classKey === "brilliant" || classKey === "checkmate_win";
    const bestLine = bestLineByMoveId.get(m.id) ?? null;
    verdictByPosition.set(m.position, {
      position: m.position,
      classKey,
      swing: (m.eval_delta ?? 0) / 10,
      evalAfter: m.eval_after ?? DEFAULT_EVAL,
      comment: m.comment,
      isTop,
      bestLine,
      bestLineLocked: !isTop && bestLine === null, // a better line exists but isn't unlocked
    });
  }

  // Source context: a game, or one side of a PvP match (absent for future sourceless kinds).
  const source: SourceContext =
    analysis.game_id != null
      ? await loadGameSource(supabase, analysis.game_id)
      : analysis.match_id != null && analysis.side != null
        ? await loadMatchSource(supabase, analysis.match_id, analysis.side)
        : EMPTY_SOURCE;

  const rows: MoveRow[] =
    source.moves.length > 0
      ? source.moves
      : // No transcript: reconstruct a You-only thread from the analysis snapshots.
        analysisMoves.map((m) => ({
          position: m.position,
          side: "You" as const,
          content: m.content,
          eval_after: m.eval_after,
          eval_delta: m.eval_delta,
        }));

  const { thread, youMoves } = buildThread(rows, verdictByPosition);

  return {
    title: analysis.title,
    description: analysis.description,
    tags: analysis.tags ?? [],
    accuracy: source.accuracy,
    ratingDelta: source.ratingDelta,
    personaName: source.personaName,
    endReason: source.endReason,
    dateISO: source.dateISO ?? analysis.created_at,
    thread,
    youMoves,
    finalEval: finalEval(youMoves),
    hasAnalysis: true,
    gameId: analysis.game_id,
    match: source.match,
  };
}

/** What a review needs from its source, whatever kind of source it is. */
interface SourceContext {
  accuracy: number | null;
  ratingDelta: number | null;
  personaName: string | null;
  endReason: string | null;
  dateISO: string | null;
  moves: MoveRow[];
  match: ReviewMatchContext | null;
}

const EMPTY_SOURCE: SourceContext = {
  accuracy: null,
  ratingDelta: null,
  personaName: null,
  endReason: null,
  dateISO: null,
  moves: [],
  match: null,
};

async function loadGameSource(supabase: SupabaseClient, gameId: string): Promise<SourceContext> {
  const source = await loadGameContext(supabase, gameId);
  return {
    accuracy: source.game?.accuracy ?? null,
    ratingDelta: source.solo?.rating_delta ?? null,
    personaName: source.persona?.name ?? null,
    endReason: source.game?.end_reason ?? null,
    dateISO: source.game?.created_at ?? null,
    moves: source.moves,
    match: null,
  };
}

/** One side of a finished PvP match: that side's conversation (RLS opens the opponent's side
 * once the match is over), the per-side accuracy/elo snapshot, and the other side's analysis
 * id so the review screen can switch boards. */
async function loadMatchSource(
  supabase: SupabaseClient,
  matchId: string,
  side: "a" | "b",
): Promise<SourceContext> {
  const otherSide = side === "a" ? "b" : "a";
  const [{ data: matchRow }, { data: pvpRow }, { data: mv }, { data: otherRow }, { data: auth }] =
    await Promise.all([
      supabase.from("matches").select("*").eq("id", matchId).maybeSingle(),
      supabase.from("pvp_matches").select("*").eq("match_id", matchId).maybeSingle(),
      supabase
        .from("match_moves")
        .select("position, speaker, content, eval_after, eval_delta")
        .eq("match_id", matchId)
        .eq("side", side)
        .order("position"),
      supabase
        .from("game_analyses")
        .select("id")
        .eq("match_id", matchId)
        .eq("side", otherSide)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.auth.getUser(),
    ]);
  const match = (matchRow ?? null) as MatchRow | null;
  const pvp = (pvpRow ?? null) as PvpMatchRow | null;

  let personaName: string | null = null;
  if (match?.persona_id) {
    const { data: p } = await supabase
      .from("personas")
      .select("name")
      .eq("id", match.persona_id)
      .maybeSingle();
    personaName = (p as Pick<PersonaRow, "name"> | null)?.name ?? null;
  }

  const sideUserId = side === "a" ? pvp?.player_a : pvp?.player_b;
  const accuracy = (side === "a" ? pvp?.player_a_accuracy : pvp?.player_b_accuracy) ?? null;
  const eloBefore = (side === "a" ? pvp?.player_a_elo_before : pvp?.player_b_elo_before) ?? null;
  const eloAfter = (side === "a" ? pvp?.player_a_elo_after : pvp?.player_b_elo_after) ?? null;
  const rated = match?.rated ?? true;

  const moves: MoveRow[] = (
    (mv ?? []) as { position: number; speaker: "You" | "Match"; content: string; eval_after: number | null; eval_delta: number | null }[]
  ).map((m) => ({
    position: m.position,
    side: m.speaker,
    content: m.content,
    eval_after: m.eval_after,
    eval_delta: m.eval_delta,
  }));

  const otherAnalysisId = (otherRow as Pick<GameAnalysisRow, "id"> | null)?.id ?? null;
  return {
    accuracy,
    ratingDelta: rated && eloBefore != null && eloAfter != null ? eloAfter - eloBefore : null,
    personaName,
    endReason: match?.end_reason ?? null,
    dateISO: match?.completed_at ?? match?.created_at ?? null,
    moves,
    match: {
      matchId,
      side,
      isYou: !!auth.user?.id && sideUserId === auth.user.id,
      rated,
      otherHref: otherAnalysisId
        ? `/analysis/${otherAnalysisId}`
        : `/analysis/match/${matchId}?board=${otherSide}`,
    },
  };
}

/**
 * Load the review screen for one board of a finished PvP match, whether or not a deep review
 * exists yet — the match twin of `loadReviewByGame`. `board` defaults to the signed-in
 * player's own side. With a deep review of that side it delegates to `loadReview`; without
 * one it replays the live move evals (ranks only, no comments/best lines) with a
 * request-review card. Null when the match isn't visible (RLS) or not completed.
 */
export async function loadReviewByMatch(
  matchId: string,
  board?: "a" | "b" | null,
): Promise<ReviewData | null> {
  const supabase = createClient();

  const [{ data: matchRow }, { data: pvpRow }, { data: auth }] = await Promise.all([
    supabase.from("matches").select("id, status").eq("id", matchId).maybeSingle(),
    supabase.from("pvp_matches").select("player_a, player_b").eq("match_id", matchId).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  const match = (matchRow ?? null) as Pick<MatchRow, "id" | "status"> | null;
  const pvp = (pvpRow ?? null) as Pick<PvpMatchRow, "player_a" | "player_b"> | null;
  if (!match || match.status !== "completed" || !pvp) return null;

  const mySide: "a" | "b" = pvp.player_b === auth.user?.id ? "b" : "a";
  const side = board ?? mySide;

  const { data: analysisRow } = await supabase
    .from("game_analyses")
    .select("id")
    .eq("match_id", matchId)
    .eq("side", side)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const analysisId = (analysisRow as Pick<GameAnalysisRow, "id"> | null)?.id;
  if (analysisId) return loadReview(analysisId);

  const source = await loadMatchSource(supabase, matchId, side);

  // Grade the board's moves off their live evals — same rules as the solo replay: `isTop`
  // is forced so the panel never renders a best-line box (there's no line to reveal yet).
  const verdictByPosition = new Map<number, Omit<ReviewMove, "threadIndex">>();
  for (const m of source.moves) {
    if (m.side !== "You") continue;
    verdictByPosition.set(m.position, {
      position: m.position,
      classKey: classifyEvalDelta(m.eval_delta, m.eval_after),
      swing: (m.eval_delta ?? 0) / 10,
      evalAfter: m.eval_after ?? DEFAULT_EVAL,
      comment: "",
      isTop: true,
      bestLine: null,
      bestLineLocked: false,
    });
  }
  const { thread, youMoves } = buildThread(source.moves, verdictByPosition);
  const rated = source.match?.rated ?? true;

  return {
    title: `${rated ? "Ranked" : "Friendly"} match replay`,
    description: "Request a deep review for move-by-move coaching on both boards.",
    tags: [],
    accuracy: source.accuracy,
    ratingDelta: source.ratingDelta,
    personaName: source.personaName,
    endReason: source.endReason,
    dateISO: source.dateISO ?? new Date().toISOString(),
    thread,
    youMoves,
    finalEval: finalEval(youMoves),
    hasAnalysis: false,
    gameId: null,
    match: source.match,
  };
}

/**
 * Load the review screen for a game, whether or not a deep review exists yet. With one (latest
 * created_at wins — re-analysis is allowed) it delegates to `loadReview`. Without one it builds a
 * replay from the live move evals: the same ranks the player already saw in-game, but no comments
 * and no best lines — hints stay behind the deep review. Null when the game isn't visible (RLS)
 * or not completed.
 */
export async function loadReviewByGame(gameId: string): Promise<ReviewData | null> {
  const supabase = createClient();

  const [{ data: gameRow }, { data: analysisRow }] = await Promise.all([
    supabase.from("games").select("*").eq("id", gameId).maybeSingle(),
    supabase
      .from("game_analyses")
      .select("id")
      .eq("game_id", gameId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const game = (gameRow ?? null) as GameRow | null;
  if (!game || game.status !== "completed") return null;

  const analysisId = (analysisRow as Pick<GameAnalysisRow, "id"> | null)?.id;
  if (analysisId) return loadReview(analysisId);

  const source = await loadGameContext(supabase, gameId, game);

  // Grade the You moves off their live evals. `isTop` is forced so the per-move panel never
  // renders a best-line box (not even a locked teaser) — there is no line to reveal yet.
  const verdictByPosition = new Map<number, Omit<ReviewMove, "threadIndex">>();
  for (const m of source.moves) {
    if (m.side !== "You") continue;
    verdictByPosition.set(m.position, {
      position: m.position,
      classKey: classifyEvalDelta(m.eval_delta, m.eval_after),
      swing: (m.eval_delta ?? 0) / 10,
      evalAfter: m.eval_after ?? DEFAULT_EVAL,
      comment: "",
      isTop: true,
      bestLine: null,
      bestLineLocked: false,
    });
  }

  const { thread, youMoves } = buildThread(source.moves, verdictByPosition);

  return {
    title: game.title ?? "Game replay",
    description: game.description ?? "Request a deep review for move-by-move coaching.",
    tags: [],
    accuracy: game.accuracy ?? null,
    ratingDelta: source.solo?.rating_delta ?? null,
    personaName: source.persona?.name ?? null,
    endReason: game.end_reason ?? null,
    dateISO: game.created_at,
    thread,
    youMoves,
    finalEval: finalEval(youMoves),
    hasAnalysis: false,
    gameId,
    match: null,
  };
}

/** Source-game context: the game row + its solo child, persona, and the full transcript. */
async function loadGameContext(
  supabase: SupabaseClient,
  gameId: string,
  knownGame?: GameRow,
): Promise<{
  game: GameRow | null;
  solo: SoloGameRow | null;
  persona: PersonaRow | null;
  moves: MoveRow[];
}> {
  const [game, { data: s }, { data: mv }] = await Promise.all([
    knownGame ??
      supabase
        .from("games")
        .select("*")
        .eq("id", gameId)
        .maybeSingle()
        .then(({ data }) => (data ?? null) as GameRow | null),
    supabase.from("solo_games").select("*").eq("game_id", gameId).maybeSingle(),
    supabase
      .from("moves")
      .select("position, side, content, eval_after, eval_delta")
      .eq("game_id", gameId)
      .order("position"),
  ]);
  const solo = (s as SoloGameRow) ?? null;
  let persona: PersonaRow | null = null;
  if (solo?.persona_id) {
    const { data: p } = await supabase
      .from("personas")
      .select("*")
      .eq("id", solo.persona_id)
      .maybeSingle();
    persona = (p as PersonaRow) ?? null;
  }
  return { game, solo, persona, moves: (mv ?? []) as MoveRow[] };
}

/** Build the rendered thread, attaching each verdict to its You bubble by position. */
function buildThread(
  rows: MoveRow[],
  verdictByPosition: Map<number, Omit<ReviewMove, "threadIndex">>,
): { thread: ReviewThreadItem[]; youMoves: ReviewMove[] } {
  const thread: ReviewThreadItem[] = [];
  const youMoves: ReviewMove[] = [];
  rows.forEach((row, threadIndex) => {
    const side = row.side === "You" ? "you" : "match";
    let move: ReviewMove | null = null;
    if (side === "you") {
      const verdict = verdictByPosition.get(row.position);
      if (verdict) {
        move = { ...verdict, threadIndex };
        youMoves.push(move);
      }
    }
    thread.push({ key: `${row.position}-${threadIndex}`, side, content: row.content, move });
  });
  return { thread, youMoves };
}

function finalEval(youMoves: ReviewMove[]): number {
  return youMoves.length > 0 ? youMoves[youMoves.length - 1].evalAfter : DEFAULT_EVAL;
}

/** Counts for the summary strip, derived from the re-scored moves (never stored). */
export function rankCounts(youMoves: ReviewMove[]): { brilliant: number; blunder: number } {
  let brilliant = 0;
  let blunder = 0;
  for (const m of youMoves) {
    if (m.classKey === "brilliant") brilliant += 1;
    else if (m.classKey === "blunder") blunder += 1;
  }
  return { brilliant, blunder };
}
