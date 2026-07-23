import { cn } from "../lib/cn";

interface EvalBarProps {
  /** Persona's interest, 0–100. */
  interest: number;
  personaName: string;
  /** App-supplied class for the fill's width transition. The web app passes its
   * `transition-[width] duration-[600ms] …` (a CSS transition it owns); the video app omits it and
   * animates `interest` frame-by-frame, so the package defines no transition. */
  fillClassName?: string;
}

/** The interest meter — a tug-of-war fill between you and the match. */
export function EvalBar({ interest, personaName, fillClassName }: EvalBarProps) {
  const rounded = Math.round(interest);
  // Persona names look like "Maya, 26"; use the first name for the label.
  const firstName = personaName.split(",")[0];

  return (
    <div className="flex-shrink-0 px-[18px] pb-2.5 pt-3">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-ink-mute">
          {firstName}&apos;s interest
        </span>
        <span className="font-mono text-[14px] font-bold">
          <span className="text-rosy-deep">{rounded}</span>{" "}
          <span className="text-ink-mute">/ 100</span>
        </span>
      </div>
      <div className="flex h-[14px] overflow-hidden rounded-full bg-ink shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]">
        <div className={cn("h-full bg-rosy", fillClassName)} style={{ width: `${rounded}%` }} />
      </div>
    </div>
  );
}
