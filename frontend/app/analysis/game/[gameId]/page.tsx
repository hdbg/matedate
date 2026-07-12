"use client";

import { useCallback } from "react";
import { useParams } from "next/navigation";
import { ReviewLoader } from "../../components/ReviewLoader";
import { loadReviewByGame } from "../../review";

/**
 * Game Review by game id — every completed game is reviewable here. With a deep review it's
 * the full analysis; without one it's a live-eval replay plus a "Request deep review" card.
 */
export default function GameReviewPage() {
  const gameId = String(useParams().gameId);
  const load = useCallback(() => loadReviewByGame(gameId), [gameId]);
  return <ReviewLoader load={load} storageKey={`matedate.reviewStep.game.${gameId}`} />;
}
