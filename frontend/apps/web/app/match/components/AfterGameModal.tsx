"use client";

import { useEffect } from "react";
import { QueenIcon } from "@matedate/icons";
import { ARCHETYPES, isSoloWin, LoadingScene, LogoMark, ShareCard, soloResultBadge } from "@matedate/visuals";
import { useArchetype } from "@/app/lib/game/useArchetype";
import type { GameResult } from "../useMatchGame";
import { useShareCard } from "./useShareCard";

/** State of the "Deep analysis" request. It's fire-and-forget: once `requested`, the review runs
 * in the background and the main screen's notifications bell announces the result. */
export type AnalysisStatus = "idle" | "pending" | "requested" | "error";

interface AfterGameModalProps {
  result: GameResult;
  analysisStatus: AnalysisStatus;
  onRequestAnalysis: () => void;
  onNewGame: () => void;
  onClose: () => void;
}

/** The chess-styled headline under the glyphs, keyed off the server's end reason. */
function verdictLine(reason: string): string {
  switch (reason) {
    case "scored":
      return "Wrapped · played to the final move";
    case "date_landed":
      return "Checkmate · you landed the date";
    case "blocked":
      return "Checkmate · they unmatched you";
    case "timeout":
      return "Flagged · you ran out of time";
    case "resignation":
      return "Resigned · you left the date";
    default:
      return "Game over";
  }
}

/** Deep-analysis button copy for each request phase. */
const ANALYSIS_COPY: Record<AnalysisStatus, { label: string; sub: string }> = {
  idle: { label: "Deep analysis", sub: "Replay every move" },
  pending: { label: "Requesting…", sub: "Queuing your review" },
  requested: { label: "Review requested ✓", sub: "We'll notify you when it's ready" },
  error: { label: "Retry analysis", sub: "That didn't go through" },
};

export function AfterGameModal({
  result,
  analysisStatus,
  onRequestAnalysis,
  onNewGame,
  onClose,
}: AfterGameModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const { archetype, status: archetypeStatus } = useArchetype(result.archetypeId);
  const analyzing = archetypeStatus === "loading";

  const accuracy = Math.round(result.accuracy);
  const win = isSoloWin(result.endReason, result.ratingDelta);
  const archetypeTitle = archetype ? ARCHETYPES[archetype.key].title : result.title;
  const analysis = ANALYSIS_COPY[analysisStatus];
  const analysisBusy = analysisStatus === "pending" || analysisStatus === "requested";
  const { cardRef, exporting, capturing, share } = useShareCard(
    () => `${archetypeTitle} — ${accuracy}% accuracy on MateDate`,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/70 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Game over"
        onClick={(e) => e.stopPropagation()}
        className="animate-after-game-pop relative m-auto w-full max-w-[392px] rounded-[30px] bg-paper p-[26px_22px_22px] shadow-[0_40px_90px_rgba(0,0,0,0.5)] lg:max-w-[440px] lg:p-[30px_28px_26px]"
      >
        <button
          type="button"
          title="Close"
          onClick={onClose}
          className="absolute right-4 top-4 grid h-[34px] w-[34px] cursor-pointer place-items-center rounded-full border-none bg-ink/[0.08] text-[16px] text-ink hover:bg-ink/[0.16]"
        >
          ✕
        </button>

        {/* result banner */}
        <div className="mb-[18px] text-center">
          <div className="relative mb-1.5 flex h-[66px] items-end justify-center gap-1.5">
            <QueenIcon className="h-[52px] w-auto [filter:drop-shadow(1px_0_0_rgba(39,35,32,0.25))_drop-shadow(-1px_0_0_rgba(39,35,32,0.25))_drop-shadow(0_1px_0_rgba(39,35,32,0.25))_drop-shadow(0_-1px_0_rgba(39,35,32,0.25))]" />
            <LogoMark size={64} />
          </div>
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-rosy-deep">
            {verdictLine(result.endReason)}
          </div>
          <h1 className="my-[5px] text-[30px] font-extrabold leading-none tracking-[-0.035em] lg:text-[34px]">
            {result.title}
          </h1>
          <p className="m-0 text-[14px] text-ink-soft">{result.description}</p>
        </div>

        {/* share card — while the archetype classifies, the card slot shows the loader */}
        {analyzing ? (
          <LoadingScene inline status="Analyzing your match" />
        ) : (
          <ShareCard
            ref={cardRef}
            accuracy={result.accuracy}
            accuracySub="Accuracy"
            archetype={archetype}
            moves={result.moves}
            ratingLabel="Rizz Rating"
            ratingValue={result.rating}
            ratingDelta={result.ratingDelta}
            resultLabel={soloResultBadge(result.endReason, win)}
            resultColor={win ? "var(--m-good)" : "var(--m-blunder)"}
            capturing={capturing}
            legendaryTitleClassName="animate-legendary-glow"
          />
        )}

        {/* share affordance */}
        <div className="mt-3 text-center">
          <button
            type="button"
            disabled={exporting || analyzing}
            onClick={() => void share()}
            className="inline-flex cursor-pointer items-center gap-1.5 border-none bg-none p-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-ink-mute hover:text-rosy-deep disabled:cursor-default disabled:opacity-50"
          >
            {exporting ? "⏳ Exporting…" : "↗ Share this card"}
          </button>
        </div>

        {/* actions — Deep analysis leads on wider screens */}
        <div className="mt-4 flex flex-col gap-[11px] lg:flex-row-reverse">
          <button
            type="button"
            onClick={onRequestAnalysis}
            disabled={analysisBusy}
            className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2.5 rounded-full border-none bg-rosy px-[22px] py-[15px] text-[16px] font-bold tracking-[-0.01em] text-white shadow-[0_6px_0_var(--rosy-deep)] transition hover:bg-rosy-deep active:translate-y-[3px] active:shadow-[0_3px_0_var(--rosy-deep)] disabled:cursor-default disabled:opacity-80 disabled:active:translate-y-0"
          >
            <span className="font-mono text-[13px]" aria-hidden>
              🔍
            </span>
            <span className="flex flex-col items-start leading-[1.05]">
              {analysis.label}
              <small className="font-mono text-[9.5px] font-bold uppercase tracking-[0.06em] opacity-70">
                {analysis.sub}
              </small>
            </span>
          </button>
          <button
            type="button"
            onClick={onNewGame}
            className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2.5 rounded-full border-none bg-ink px-[22px] py-[15px] text-[16px] font-bold tracking-[-0.01em] text-king shadow-[var(--sh-1)] transition hover:bg-black active:translate-y-px"
          >
            <span className="font-mono text-[13px]" aria-hidden>
              ♟
            </span>
            <span className="flex flex-col items-start leading-[1.05]">
              New game
              <small className="font-mono text-[9.5px] font-bold uppercase tracking-[0.06em] opacity-70">
                Next match
              </small>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
