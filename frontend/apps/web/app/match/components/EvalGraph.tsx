import type { WireMove } from "@/app/lib/game/live";
import { MOVE_CLASSES, classifySwing, type MoveClassKey } from "@/app/lib/game/types";

/** Move classes worth flagging with a colored dot on the graph (the dramatic ones). */
const DOT_CLASSES: ReadonlySet<MoveClassKey> = new Set<MoveClassKey>([
  "checkmate_win",
  "brilliant",
  "blunder",
  "checkmate_loss",
]);

const BASELINE = 50; // opening interest (START_EVAL) — the graph starts mid, like the mock

interface Point {
  x: number; // 0–100 (%)
  y: number; // 0–100 (%) — 0 = top (interest 100), 100 = bottom (interest 0)
  evalAfter: number;
  classKey: MoveClassKey | null;
}

/** Per-You-move eval trajectory for the share card — the eval BAR replacement. The line color is
 * the brand rosy; a dot marks each dramatic move, colored by its move class (SPEC card redesign).
 * Reads `eval_after` off the wire (server-authoritative); falls back to the swing when absent. */
export function EvalGraph({ moves }: { moves: WireMove[] }) {
  const you = moves.filter((m) => m.side === "You");
  const evals: number[] = [BASELINE];
  const classes: (MoveClassKey | null)[] = [null];
  for (const m of you) {
    const evalAfter = m.eval_after ?? clampEval(BASELINE + (m.swing ?? 0) * 10);
    evals.push(evalAfter);
    classes.push(m.classification ?? classifySwing(m.swing ?? 0, m.eval_after));
  }

  const n = evals.length;
  const points: Point[] = evals.map((evalAfter, i) => ({
    x: n <= 1 ? 0 : (i / (n - 1)) * 100,
    y: 100 - clampEval(evalAfter),
    evalAfter,
    classKey: classes[i],
  }));

  const line = points.map((p) => `${p.x.toFixed(1)},${((p.y / 100) * 40).toFixed(2)}`).join(" ");
  const area = `${line} 100,40 0,40`;
  const finalEval = Math.round(evals[evals.length - 1]);

  return (
    <div className="relative mx-[17px] mb-0.5 h-12 overflow-hidden rounded-[9px] bg-[#100e0c] shadow-[inset_0_1px_3px_rgba(0,0,0,0.55)]">
      <span className="absolute left-[9px] top-[5px] font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-ink-mute">
        Eval
      </span>
      <span className="absolute right-[9px] top-[5px] font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-rosy">
        You {finalEval}
      </span>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden className="block h-full w-full">
        <line
          x1="0"
          y1="20"
          x2="100"
          y2="20"
          stroke="rgba(241,232,217,.16)"
          strokeWidth="1"
          strokeDasharray="2 3"
          vectorEffect="non-scaling-stroke"
        />
        <polygon points={area} fill="rgba(214,83,106,.22)" />
        <polyline
          points={line}
          fill="none"
          stroke="var(--rosy)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {points.map((p, i) =>
        p.classKey && DOT_CLASSES.has(p.classKey) ? (
          <span
            key={i}
            title={MOVE_CLASSES[p.classKey].label}
            className="absolute h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#100e0c] shadow-[0_0_6px_rgba(0,0,0,0.4)]"
            style={{ left: `${p.x}%`, top: `${p.y}%`, background: MOVE_CLASSES[p.classKey].color }}
          />
        ) : null,
      )}
    </div>
  );
}

function clampEval(v: number): number {
  return Math.max(0, Math.min(100, v));
}
