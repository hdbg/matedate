"use client";

import { Suspense, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { AppShell } from "@/app/components/ui/AppShell";
import { ReviewLoader } from "../../components/ReviewLoader";
import { loadReviewByMatch } from "../../review";

/**
 * Game Review by match id — every finished PvP match is reviewable here, per board.
 * `?board=a|b` picks the side (defaults to the signed-in player's own); with a deep review
 * of that side it's the full analysis, without one it's a live-eval replay plus a
 * "Request deep review" card. The board switch on the screen flips between the two.
 */
function MatchReview() {
  const matchId = String(useParams().matchId);
  const boardParam = useSearchParams().get("board");
  const board = boardParam === "a" || boardParam === "b" ? boardParam : null;
  const load = useCallback(() => loadReviewByMatch(matchId, board), [matchId, board]);
  return (
    <ReviewLoader
      load={load}
      storageKey={`matedate.reviewStep.match.${matchId}.${board ?? "own"}`}
    />
  );
}

export default function MatchReviewPage() {
  return (
    <Suspense fallback={<AppShell />}>
      <MatchReview />
    </Suspense>
  );
}
