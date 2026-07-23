import { MoveIcon } from "./MoveIcon";
import { formatSwing, MOVE_CLASSES } from "../lib/grading";
import { cn } from "../lib/cn";
import type { MoveClassKey } from "../types";

interface VerdictFlashProps {
  classKey: MoveClassKey;
  swing: number;
  /** App-supplied animation class for the center-screen pop. The web app passes
   * "animate-verdict-pop" (its @keyframes live in globals.css); the video app omits it and drives
   * the motion via `progress`, so the package defines no animation. Re-key the element on each new
   * verdict so the animation replays. */
  className?: string;
}

/** Center-screen verdict pop shown after each graded move. */
export function VerdictFlash({ classKey, swing, className }: VerdictFlashProps) {
  const mv = MOVE_CLASSES[classKey];
  return (
    <div
      className={cn(
        "pointer-events-none absolute left-1/2 top-[38%] z-[8] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2",
        className,
      )}
    >
      <MoveIcon classKey={classKey} size={78} className="drop-shadow-[0_12px_30px_rgba(39,35,32,0.3)]" />
      <div className="rounded-full bg-ink px-4 py-[5px] text-[20px] font-extrabold tracking-[-0.02em] text-king">
        {mv.label}
      </div>
      <div className="font-mono text-[14px] font-bold" style={{ color: mv.color }}>
        {formatSwing(swing)}
      </div>
    </div>
  );
}
