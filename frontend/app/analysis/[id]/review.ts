import { createClient } from "@/app/lib/supabase/client";
import { classifyEvalDelta, type MoveClassKey } from "@/app/lib/game/service";
import type {
  GameAnalysisMoveRevealRow,
  GameAnalysisMoveRow,
  GameAnalysisRow,
  GameRow,
  SoloGameRow,
  PersonaRow,
} from "@/app/lib/supabase/types";

/** One re-scored "You" move, aligned to a replay step (1..N). */
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
}

interface MoveRow {
  position: number;
  side: "You" | "Match";
  content: string;
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
    const classKey = classifyEvalDelta(m.eval_delta);
    const isTop = classKey === "brilliant";
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

  // Source-game context (may be absent for non-game sources).
  let game: GameRow | null = null;
  let solo: SoloGameRow | null = null;
  let persona: PersonaRow | null = null;
  let sourceMoves: MoveRow[] = [];

  if (analysis.game_id) {
    const [{ data: g }, { data: s }, { data: mv }] = await Promise.all([
      supabase.from("games").select("*").eq("id", analysis.game_id).maybeSingle(),
      supabase.from("solo_games").select("*").eq("game_id", analysis.game_id).maybeSingle(),
      supabase
        .from("moves")
        .select("position, side, content")
        .eq("game_id", analysis.game_id)
        .order("position"),
    ]);
    game = (g as GameRow) ?? null;
    solo = (s as SoloGameRow) ?? null;
    sourceMoves = (mv ?? []) as MoveRow[];
    if (solo?.persona_id) {
      const { data: p } = await supabase
        .from("personas")
        .select("*")
        .eq("id", solo.persona_id)
        .maybeSingle();
      persona = (p as PersonaRow) ?? null;
    }
  }

  // Build the rendered thread, attaching each verdict to its You bubble by position.
  const thread: ReviewThreadItem[] = [];
  const youMoves: ReviewMove[] = [];

  const rows: MoveRow[] =
    sourceMoves.length > 0
      ? sourceMoves
      : // No transcript: reconstruct a You-only thread from the analysis snapshots.
        analysisMoves.map((m) => ({ position: m.position, side: "You" as const, content: m.content }));

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

  const finalEval = youMoves.length > 0 ? youMoves[youMoves.length - 1].evalAfter : DEFAULT_EVAL;

  return {
    title: analysis.title,
    description: analysis.description,
    tags: analysis.tags ?? [],
    accuracy: game?.accuracy ?? null,
    ratingDelta: solo?.rating_delta ?? null,
    personaName: persona?.name ?? null,
    endReason: game?.end_reason ?? null,
    dateISO: game?.created_at ?? analysis.created_at,
    thread,
    youMoves,
    finalEval,
  };
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
