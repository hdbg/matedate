"use client";

import { useEffect } from "react";
import { Logo, LogoMark } from "@/app/components/ui/Logo";
import { MoveIcon } from "@/app/components/ui/MoveIcon";
import { formatSwing, type MoveClassKey } from "@/app/lib/game/service";
import type { WireMove } from "@/app/lib/game/live";
import type { GameResult } from "../useMatchGame";

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

/** The last few exchanges, newest last — a compact recap for the share card. */
function recapMoves(moves: WireMove[]): WireMove[] {
  return moves.slice(-4);
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

  const accuracy = Math.round(result.accuracy);
  const interest = Math.round(result.interest);
  const deltaSign = result.ratingDelta >= 0 ? "+" : "";
  const deltaColor = result.ratingDelta >= 0 ? "var(--m-good)" : "var(--m-blunder)";
  const recap = recapMoves(result.moves);
  const analysis = ANALYSIS_COPY[analysisStatus];
  const analysisBusy = analysisStatus === "pending" || analysisStatus === "requested";

  const share = () => {
    const text = `${result.title} — ${accuracy}% accuracy on MateDate`;
    if (typeof navigator !== "undefined" && navigator.share) {
      void navigator.share({ title: "MateDate", text }).catch(() => {});
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(text).catch(() => {});
    }
  };

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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/black-queen.svg"
              alt=""
              aria-hidden
              className="h-[52px] [filter:drop-shadow(1px_0_0_rgba(39,35,32,0.25))_drop-shadow(-1px_0_0_rgba(39,35,32,0.25))_drop-shadow(0_1px_0_rgba(39,35,32,0.25))_drop-shadow(0_-1px_0_rgba(39,35,32,0.25))]"
            />
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

        {/* share card */}
        <div className="overflow-hidden rounded-[22px] bg-ink text-king shadow-[var(--sh-3)]">
          <div className="flex items-center justify-between px-[17px] pb-[11px] pt-[15px]">
            <Logo markSize={22} wordmarkClassName="text-[18px] tracking-[-0.03em]" />
            <div className="text-right">
              <div className="text-[24px] font-extrabold leading-none tracking-[-0.03em]">
                {accuracy}%
              </div>
              <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-mute">
                Accuracy
              </div>
            </div>
          </div>
          <div className="mx-[17px] flex h-2 bg-[#100e0c] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
            <div className="h-full bg-rosy" style={{ width: `${interest}%` }} />
          </div>
          <div className="flex flex-col gap-2 bg-[#332e2a] px-[17px] py-[15px]">
            {recap.map((mv) => (
              <RecapBubble key={mv.position} move={mv} />
            ))}
            <div className="mt-0.5 rounded-[12px] border-[1.5px] border-dashed border-rosy bg-rosy/[0.14] px-3 py-2.5 text-center">
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-rosy">
                🔒 Best move · unlock
              </div>
              <div className="mt-[3px] select-none text-[13px] font-bold blur-[5px]">
                audition me sunday — I&apos;m cooking shakshuka
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between px-[17px] py-3">
            <div className="flex items-center gap-2 text-[17px] font-extrabold">
              <span aria-hidden>♟</span> elo
              <span className="font-mono text-[13px] font-bold" style={{ color: deltaColor }}>
                {deltaSign}
                {result.ratingDelta}
              </span>
            </div>
            <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-mute">
              🛡 Anonymized
            </div>
          </div>
        </div>

        {/* share affordance */}
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={share}
            className="inline-flex cursor-pointer items-center gap-1.5 border-none bg-none p-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-ink-mute hover:text-rosy-deep"
          >
            ↗ Share this card
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

function RecapBubble({ move }: { move: WireMove }) {
  if (move.side === "Match") {
    return (
      <div className="relative max-w-[80%] self-start rounded-[16px] rounded-bl-[5px] bg-[#4a443c] px-3 py-2.5 text-[13px] leading-[1.35] text-king">
        {move.content}
      </div>
    );
  }
  const cls = move.classification as MoveClassKey | null | undefined;
  return (
    <div className="relative max-w-[80%] self-end rounded-[16px] rounded-br-[5px] bg-rosy px-3 py-2.5 text-[13px] leading-[1.35] text-white">
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
