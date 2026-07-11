interface SummaryStripProps {
  accuracy: number | null;
  brilliant: number;
  blunder: number;
  ratingDelta: number | null;
  youEval: number; // current step's interest, drives the eval meter
}

function Stat({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <div className="relative flex-1 text-center before:absolute before:left-0 before:top-[14%] before:hidden before:h-[72%] before:w-px before:bg-ink/[0.12] [&:not(:first-child)]:before:block">
      <div className="font-mono text-[22px] font-bold leading-none tracking-[-0.02em] lg:text-[26px]" style={color ? { color } : undefined}>
        {value}
      </div>
      <div className="mt-[5px] font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-ink-mute">
        {label}
      </div>
    </div>
  );
}

/** The four-up summary (accuracy · brilliant · blunder · rizz Δ) plus the live eval meter. */
export function SummaryStrip({ accuracy, brilliant, blunder, ratingDelta, youEval }: SummaryStripProps) {
  const you = Math.round(youEval);
  const delta =
    ratingDelta == null ? "—" : `${ratingDelta >= 0 ? "+" : ""}${ratingDelta}`;

  return (
    <div className="flex-shrink-0">
      <div className="flex items-stretch px-4 pb-2.5 pt-3 lg:px-7 lg:pt-4">
        <Stat value={accuracy == null ? "—" : `${Math.round(accuracy)}%`} label="Accuracy" color="var(--rosy-deep)" />
        <Stat value={String(brilliant)} label="Brilliant" color="var(--m-brilliant)" />
        <Stat value={String(blunder)} label="Blunder" color="var(--m-blunder)" />
        <Stat value={delta} label="Rizz Δ" />
      </div>
      <div className="px-4 pb-3 lg:px-7">
        <div className="flex h-2.5 overflow-hidden rounded-full bg-ink shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]">
          <div
            className="h-full bg-rosy transition-[width] duration-500 ease-[cubic-bezier(0.34,1.2,0.4,1)]"
            style={{ width: `${you}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-[10px] font-bold text-ink-mute">
          <span className="text-rosy-deep">YOU {you}</span>
          <span>MATCH {100 - you}</span>
        </div>
      </div>
    </div>
  );
}
