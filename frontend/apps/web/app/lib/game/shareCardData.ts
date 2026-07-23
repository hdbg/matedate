import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isSoloWin,
  soloResultBadge,
  toWireMoves,
  type EvalRow,
  type ShareCardData,
} from "@matedate/visuals";
import type { ArchetypeSource } from "./useArchetype";

// The card-data shape + row mapping live in @matedate/visuals (the video app reuses them);
// re-exported so `ShareCardModal` keeps importing `ShareCardData` from here.
export type { ShareCardData };

// Loose client typing (frontend Supabase clients are intentionally untyped — see the memory note).
type DB = SupabaseClient;

async function loadGame(supabase: DB, gameId: string): Promise<ShareCardData | null> {
  const [{ data: game }, { data: solo }, { data: moveRows }, { data: rating }, { data: hist }] =
    await Promise.all([
      supabase.from("games").select("accuracy, end_reason, title").eq("id", gameId).maybeSingle(),
      supabase.from("solo_games").select("rating_delta").eq("game_id", gameId).maybeSingle(),
      supabase
        .from("moves")
        .select("position, side, content, eval_delta, eval_after")
        .eq("game_id", gameId)
        .order("position"),
      supabase.from("player_ratings").select("elo_rating").maybeSingle(),
      supabase
        .from("rating_history")
        .select("rating_after")
        .eq("source_id", gameId)
        .eq("kind", "elo")
        .maybeSingle(),
    ]);
  if (!game) return null;
  const endReason = (game.end_reason as string | null) ?? "scored";
  const ratingDelta = (solo?.rating_delta as number | null) ?? 0;
  const win = isSoloWin(endReason, ratingDelta);
  return {
    moves: toWireMoves((moveRows ?? []) as EvalRow[]),
    accuracy: (game.accuracy as number | null) ?? 0,
    accuracySub: "Accuracy",
    ratingLabel: "Rizz Rating",
    ratingValue: (hist?.rating_after as number | null) ?? (rating?.elo_rating as number | null),
    ratingDelta,
    resultLabel: soloResultBadge(endReason, win),
    resultColor: win ? "var(--m-good)" : "var(--m-blunder)",
    titleFallback: (game.title as string | null) ?? "MateDate",
  };
}

async function loadMatch(supabase: DB, matchId: string, side: "a" | "b"): Promise<ShareCardData | null> {
  const [{ data: match }, { data: pvp }, { data: moveRows }] = await Promise.all([
    supabase.from("matches").select("rated, winner_side").eq("id", matchId).maybeSingle(),
    supabase.from("pvp_matches").select("*").eq("match_id", matchId).maybeSingle(),
    supabase
      .from("match_moves")
      .select("position, speaker, content, eval_delta, eval_after")
      .eq("match_id", matchId)
      .eq("side", side)
      .order("position"),
  ]);
  if (!match || !pvp) return null;
  const other = side === "a" ? "b" : "a";
  const acc = (pvp[`player_${side}_accuracy`] as number | null) ?? 0;
  const oppAcc = (pvp[`player_${other}_accuracy`] as number | null) ?? 0;
  const rated = match.rated as boolean;
  const eloBefore = pvp[`player_${side}_elo_before`] as number | null;
  const eloAfter = pvp[`player_${side}_elo_after`] as number | null;
  const winner = match.winner_side as "a" | "b" | null;
  const outcome = winner === null ? "draw" : winner === side ? "win" : "loss";
  const label = outcome === "win" ? "Victory" : outcome === "loss" ? "Defeat" : "Draw";
  const color =
    outcome === "win" ? "var(--m-good)" : outcome === "loss" ? "var(--m-blunder)" : "var(--ink-mute)";
  const rows = ((moveRows ?? []) as { position: number; speaker: "You" | "Match"; content: string; eval_delta: number | null; eval_after: number | null }[]).map(
    (m) => ({ position: m.position, side: m.speaker, content: m.content, eval_delta: m.eval_delta, eval_after: m.eval_after }),
  );
  return {
    moves: toWireMoves(rows),
    accuracy: acc,
    accuracySub: `You · vs ${Math.round(oppAcc)}%`,
    ratingLabel: "Ranked Elo",
    ratingValue: rated ? eloAfter : null,
    ratingDelta: rated && eloBefore != null && eloAfter != null ? eloAfter - eloBefore : 0,
    unratedLabel: "Friendly · unrated",
    resultLabel: `⚔️ ${label}`,
    resultColor: color,
    titleFallback: rated ? "Ranked match" : "Friendly match",
  };
}

export function loadShareCardData(supabase: DB, source: ArchetypeSource): Promise<ShareCardData | null> {
  return source.kind === "game"
    ? loadGame(supabase, source.gameId)
    : loadMatch(supabase, source.matchId, source.side);
}
