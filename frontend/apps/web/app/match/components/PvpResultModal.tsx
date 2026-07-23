"use client";

import { useEffect, useState } from "react";
import { LogoMark } from "@/app/components/ui/Logo";
import { LoadingScene } from "@/app/components/ui/LoadingScene";
import { MoveIcon } from "@/app/components/ui/MoveIcon";
import { formatSwing, type MoveClassKey } from "@/app/lib/game/service";
import { ARCHETYPES } from "@/app/lib/game/archetypes";
import { useArchetype } from "@/app/lib/game/useArchetype";
import type { WireMove } from "@/app/lib/game/live";
import type { PvpResult } from "../usePvpGame";
import { ShareCard } from "./ShareCard";
import { useShareCard } from "./useShareCard";

/** State of the "Deep analysis" request — fire-and-forget, same contract as the solo modal:
 * once `requested`, both boards are analyzed in the background and the main screen's
 * notifications bell announces the result. */
export type PvpAnalysisStatus = "idle" | "pending" | "requested" | "error";

const ANALYSIS_COPY: Record<PvpAnalysisStatus, { label: string; sub: string }> = {
  idle: { label: "Deep analysis", sub: "Both boards, move by move" },
  pending: { label: "Requesting…", sub: "Queuing your review" },
  requested: { label: "Review requested ✓", sub: "We'll notify you when it's ready" },
  error: { label: "Retry analysis", sub: "That didn't go through" },
};

interface PvpResultModalProps {
  result: PvpResult;
  analysisStatus: PvpAnalysisStatus;
  onRequestAnalysis: () => void;
  onNewGame: () => void;
  onClose: () => void;
}

/** The chess-styled headline under the mark, keyed off the server's end reason. */
function verdictLine(reason: string, outcome: PvpResult["result"]): string {
  switch (reason) {
    case "scored":
      return "Scored · higher accuracy takes it";
    case "date_landed":
      return outcome === "win" ? "Checkmate · you landed the date" : "Checkmate · they landed the date";
    case "blocked":
      return outcome === "loss" ? "Checkmate · you got blocked" : "Checkmate · they got blocked";
    case "timeout":
      return outcome === "loss" ? "Flagged · you ran out of time" : "Flagged · they ran out of time";
    default:
      return "Match over";
  }
}

const RESULT_BADGE: Record<PvpResult["result"], { label: string; className: string }> = {
  win: { label: "Victory", className: "bg-m-good/[0.15] text-m-good" },
  loss: { label: "Defeat", className: "bg-m-blunder/[0.15] text-m-blunder" },
  draw: { label: "Draw", className: "bg-cream-2 text-ink-soft" },
};

export function PvpResultModal({
  result,
  analysisStatus,
  onRequestAnalysis,
  onNewGame,
  onClose,
}: PvpResultModalProps) {
  const [showOpp, setShowOpp] = useState(false);
  const analysis = ANALYSIS_COPY[analysisStatus];
  const analysisBusy = analysisStatus === "pending" || analysisStatus === "requested";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const { archetype, status: archetypeStatus } = useArchetype(result.archetypeId);
  const analyzing = archetypeStatus === "loading";

  const badge = RESULT_BADGE[result.result];
  const oppName = result.opponent.displayName || result.opponent.username || "Opponent";
  const { cardRef, exporting, capturing, share } = useShareCard(
    () =>
      `${archetype ? ARCHETYPES[archetype.key].title : result.title} — ${badge.label} on MateDate`,
  );
  const resultColor =
    result.result === "win"
      ? "var(--m-good)"
      : result.result === "loss"
        ? "var(--m-blunder)"
        : "var(--ink-mute)";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/70 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Match over"
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
          <div className="mb-1.5 flex justify-center">
            <LogoMark size={56} />
          </div>
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-rosy-deep">
            {verdictLine(result.endReason, result.result)}
          </div>
          <div className="mt-2">
            <span
              className={`inline-block rounded-full px-3.5 py-1 font-mono text-[12px] font-bold uppercase tracking-[0.12em] ${badge.className}`}
            >
              {badge.label}
            </span>
          </div>
          <h1 className="my-[5px] text-[28px] font-extrabold leading-none tracking-[-0.035em] lg:text-[32px]">
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
            accuracy={result.yourAccuracy}
            accuracySub={`You · vs ${Math.round(result.oppAccuracy)}%`}
            archetype={archetype}
            moves={result.yourMoves}
            ratingLabel="Ranked Elo"
            ratingValue={result.rated ? result.rating : null}
            ratingDelta={result.ratingDelta}
            unratedLabel="Friendly · unrated"
            resultLabel={`⚔️ ${badge.label}`}
            resultColor={resultColor}
            capturing={capturing}
          />
        )}

        {/* share affordance */}
        {!analyzing && (
          <div className="mt-3 text-center">
            <button
              type="button"
              disabled={exporting}
              onClick={() => void share()}
              className="inline-flex cursor-pointer items-center gap-1.5 border-none bg-none p-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-ink-mute hover:text-rosy-deep disabled:cursor-default disabled:opacity-50"
            >
              {exporting ? "⏳ Exporting…" : "↗ Share this card"}
            </button>
          </div>
        )}

        {/* opponent transcript — the post-match reveal */}
        <div className="mt-3 overflow-hidden rounded-[18px] border border-ink/[0.08] bg-cream">
          <button
            type="button"
            onClick={() => setShowOpp((v) => !v)}
            className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-ink-soft hover:text-ink"
          >
            <span>🔎 How {oppName} played it</span>
            <span aria-hidden>{showOpp ? "▴" : "▾"}</span>
          </button>
          {showOpp && (
            <div className="flex max-h-[280px] flex-col gap-2 overflow-y-auto px-4 pb-4">
              {result.oppMoves.map((mv) => (
                <TranscriptBubble key={`${mv.side}-${mv.position}`} move={mv} />
              ))}
            </div>
          )}
        </div>

        {/* actions — Deep analysis leads (reviews both boards, powers the side switch) */}
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
              ⚔️
            </span>
            <span className="flex flex-col items-start leading-[1.05]">
              New game
              <small className="font-mono text-[9.5px] font-bold uppercase tracking-[0.06em] opacity-70">
                Back to modes
              </small>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

function TranscriptBubble({ move }: { move: WireMove }) {
  if (move.side === "Match") {
    return (
      <div className="relative max-w-[85%] self-start rounded-[16px] rounded-bl-[5px] bg-white px-3 py-2.5 text-[13px] leading-[1.35] text-ink shadow-[var(--sh-1)]">
        {move.content}
      </div>
    );
  }
  const cls = move.classification as MoveClassKey | null | undefined;
  return (
    <div className="relative mt-1 max-w-[85%] self-end rounded-[16px] rounded-br-[5px] bg-ink px-3 py-2.5 text-[13px] leading-[1.35] text-king">
      {move.content}
      {cls && (
        <span className="absolute right-1.5 top-[-9px] inline-flex items-center gap-[4px] rounded-full bg-white py-[2px] pl-[2px] pr-[7px] font-mono text-[10px] font-bold text-ink shadow-[var(--sh-1)]">
          <MoveIcon classKey={cls} size={15} />
          {formatSwing(move.swing ?? 0)}
        </span>
      )}
    </div>
  );
}
