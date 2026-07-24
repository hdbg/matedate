"use client";

import { MOVE_CLASSES } from "@/app/lib/game/service";
import { cn } from "@/app/lib/utils";
import type { ReviewMove } from "../review";
import type { ReplayControls } from "../useReviewReplay";

interface ReviewControlsProps {
  youMoves: ReviewMove[];
  replay: ReplayControls;
}

/** The scrubber (overview pill + a dot per move, colored by rank) and transport row. */
export function ReviewControls({ youMoves, replay }: ReviewControlsProps) {
  const { step, stepMax, playing, goTo, first, prev, next, togglePlay } = replay;

  return (
    <div className="flex-shrink-0 border-t border-ink/[0.08] bg-paper px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-[11px] lg:px-7 lg:pb-5">
      <div className="mb-[11px] flex items-center gap-1.5">
        <button
          type="button"
          title="Overview"
          onClick={() => goTo(0)}
          className={cn(
            "h-[9px] w-6 shrink-0 rounded-full bg-ink transition-transform",
            step === 0 && "shadow-[0_0_0_2px_var(--paper),0_0_0_4px_var(--ink)]",
          )}
        />
        {youMoves.map((move, k) => {
          const on = k + 1 <= step;
          const at = k + 1 === step;
          const color = MOVE_CLASSES[move.classKey].color;
          return (
            <button
              key={move.position}
              type="button"
              title={`Move ${k + 1} · ${MOVE_CLASSES[move.classKey].label}`}
              onClick={() => goTo(k + 1)}
              className={cn(
                "h-[9px] flex-1 rounded-full transition-transform hover:scale-y-150",
                at && "shadow-[0_0_0_2px_var(--paper),0_0_0_4px_var(--ink)]",
              )}
              style={{ background: on ? color : "rgba(39,35,32,0.14)" }}
            />
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-2">
        <TransportButton title="First" disabled={step === 0} onClick={first}>
          ⏮
        </TransportButton>
        <TransportButton title="Previous" disabled={step === 0} onClick={prev}>
          ‹
        </TransportButton>
        <button
          type="button"
          title={playing ? "Pause" : "Play"}
          onClick={togglePlay}
          className="grid h-14 w-14 place-items-center rounded-full bg-rosy text-[22px] text-white shadow-[0_5px_0_var(--rosy-deep)] transition hover:bg-rosy-deep active:translate-y-[3px] active:shadow-[0_2px_0_var(--rosy-deep)]"
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <TransportButton title="Next" disabled={step === stepMax} onClick={next}>
          ›
        </TransportButton>
        <span className="min-w-[74px] text-center font-mono text-[12px] font-bold text-ink-mute">
          {step === 0 ? "Overview" : `Move ${step} / ${stepMax}`}
        </span>
      </div>
    </div>
  );
}

function TransportButton({
  title,
  disabled,
  onClick,
  children,
}: {
  title: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="grid h-11 w-11 place-items-center rounded-full bg-white text-[17px] text-ink shadow-[var(--sh-1)] transition hover:bg-cream active:translate-y-px disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
    </button>
  );
}
