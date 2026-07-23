import { MoveIcon } from "@matedate/visuals";
import { formatSwing, MOVE_CLASSES } from "@/app/lib/game/service";
import { cn } from "@/app/lib/utils";
import type { ReviewMove } from "../review";

interface Overview {
  title: string;
  description: string;
  tags: string[];
}

interface AnalysisPanelProps {
  step: number;
  overview: Overview;
  move: ReviewMove | null; // the You move at `step` (null at the overview)
  onUnlock: () => void;
  /** False for a live-eval replay: ranks only — no comments, no best-line box. */
  hasAnalysis: boolean;
  /** True when reviewing the OPPONENT's side of a PvP match — flips the "your reply" label. */
  opponentBoard?: boolean;
  /** Rendered on the overview when there's no analysis yet (the request-review card). */
  requestSlot?: React.ReactNode;
}

const LOCKED_PLACEHOLDER = "audition me sunday — I'm cooking a dangerously good shakshuka";

/** The analysis card — the game overview at step 0, a per-move verdict + best line otherwise. */
export function AnalysisPanel({
  step,
  overview,
  move,
  onUnlock,
  hasAnalysis,
  opponentBoard = false,
  requestSlot,
}: AnalysisPanelProps) {
  if (step === 0 || !move) {
    return (
      <div className="p-[18px] lg:p-[26px]">
        <div className="mb-2.5 flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink text-[18px] text-white shadow-[var(--sh-1)]">
            ♟
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[19px] font-extrabold leading-none tracking-[-0.02em] lg:text-[24px]">
              {overview.title}
            </div>
            <div className="mt-[3px] font-mono text-[11px] font-bold text-ink-mute">
              {hasAnalysis ? "Generated game report" : "Game replay"}
            </div>
          </div>
        </div>
        <p className="mb-3 text-[14.5px] leading-[1.5] text-ink-soft lg:text-[16px]">
          {overview.description}
        </p>
        {overview.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {overview.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-[5px] rounded-full border border-ink/[0.12] bg-white px-[9px] py-1 font-mono text-[10px] font-bold tracking-[0.04em]"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        <p className="mt-3.5 text-[13px] text-ink-mute">
          ▶ Press play or tap a move to replay the game beat by beat.
        </p>
        {requestSlot}
      </div>
    );
  }

  const mv = MOVE_CLASSES[move.classKey];
  // Top moves need no better line (free). Otherwise the best line is the paid reveal: shown when
  // unlocked (RLS returned it), else locked behind a real gate.
  const free = move.isTop;
  const locked = move.bestLineLocked;
  const shownLine = locked ? LOCKED_PLACEHOLDER : (move.bestLine ?? "This was the strongest line here — no notes.");

  return (
    <div className="p-[18px] lg:p-[26px]">
      <div className="mb-2.5 flex items-center gap-3">
        <MoveIcon
          classKey={move.classKey}
          size={40}
          className="drop-shadow-[0_2px_6px_rgba(39,35,32,0.12)]"
        />
        <div className="min-w-0 flex-1">
          <div className="text-[19px] font-extrabold leading-none tracking-[-0.02em] lg:text-[24px]">
            {mv.label}
          </div>
          <div className="mt-[3px] font-mono text-[11px] font-bold text-ink-mute">
            Move {step} · {opponentBoard ? "their reply" : "your reply"}
          </div>
        </div>
        <div className="shrink-0 font-mono text-[20px] font-bold lg:text-[24px]" style={{ color: mv.color }}>
          {formatSwing(move.swing)}
        </div>
      </div>

      {/* Live replay: the rank + swing are what the player already saw in-game; the comment and
          best line only exist once a deep review has run. */}
      {!hasAnalysis && (
        <p className="text-[13px] leading-[1.5] text-ink-mute">
          Your live rating for this move. Request a deep review from the overview (step 0) for
          coaching notes and best lines.
        </p>
      )}
      {hasAnalysis && (
        <>
          <p className="mb-3 text-[14.5px] leading-[1.5] text-ink-soft lg:text-[16px]">
            {move.comment}
          </p>

          <div className="relative rounded-[14px] border-[1.5px] border-ink/[0.1] bg-white px-[13px] py-[11px]">
            <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-rosy-deep">
              {free ? "✓ Top move" : "✦ Best line"}
            </div>
            <div
              className={cn(
                "text-[14.5px] font-semibold leading-[1.45] lg:text-[16px]",
                locked && "select-none blur-[5px]",
              )}
            >
              {shownLine}
            </div>
            {locked && (
              <div className="absolute inset-0 grid place-items-center">
                <button
                  type="button"
                  onClick={onUnlock}
                  className="rounded-full bg-ink px-[15px] py-[9px] font-mono text-[11px] font-bold tracking-[0.04em] text-king shadow-[var(--sh-2)] hover:bg-black"
                >
                  🔒 Unlock best move
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
