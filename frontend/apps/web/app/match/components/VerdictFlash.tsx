import { MoveIcon } from "@matedate/visuals";
import { formatSwing, MOVE_CLASSES } from "@/app/lib/game/service";
import type { VerdictState } from "../useMatchGame";

/**
 * Center-screen verdict pop shown after each graded move. Keyed by verdict id
 * by the caller so the animation replays on every new move.
 */
export function VerdictFlash({ verdict }: { verdict: VerdictState }) {
  const mv = MOVE_CLASSES[verdict.classKey];
  return (
    <div className="animate-verdict-pop pointer-events-none absolute left-1/2 top-[38%] z-[8] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
      <MoveIcon
        classKey={verdict.classKey}
        size={78}
        className="drop-shadow-[0_12px_30px_rgba(39,35,32,0.3)]"
      />
      <div className="rounded-full bg-ink px-4 py-[5px] text-[20px] font-extrabold tracking-[-0.02em] text-king">
        {mv.label}
      </div>
      <div className="font-mono text-[14px] font-bold" style={{ color: mv.color }}>
        {formatSwing(verdict.swing)}
      </div>
    </div>
  );
}
