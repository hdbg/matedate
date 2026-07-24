import { QueenIcon } from "@matedate/icons";
import type { Persona } from "@/app/lib/game/service";
import { cn } from "@/app/lib/utils";

function formatClock(remaining: number): string {
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

interface MatchHeaderProps {
  persona: Persona;
  clockValue: number;
  clockLabel: string;
  warn: boolean;
  /** Dim + relax the clock (bot practice mode). */
  dim: boolean;
  onBack: () => void;
}

export function MatchHeader({
  persona,
  clockValue,
  clockLabel,
  warn,
  dim,
  onBack,
}: MatchHeaderProps) {
  return (
    <div className="flex items-center gap-3 px-[18px] pt-0.5">
      <button
        type="button"
        onClick={onBack}
        aria-label="Leave match"
        className="cursor-pointer px-1 py-0.5 text-[24px] leading-none text-ink opacity-70 hover:opacity-100"
      >
        ‹
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-[11px]">
        <div className="grid h-11 w-11 flex-shrink-0 place-items-center overflow-hidden rounded-[14px] bg-ink">
          <QueenIcon className="mt-1.5 h-[38px] w-auto" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[18px] font-extrabold leading-[1.1] tracking-[-0.02em]">
            {persona.name}
          </div>
          <div className="mt-px truncate font-mono text-[11px] font-bold text-ink-mute">
            {persona.hint}
          </div>
        </div>
      </div>

      <div className={cn("flex-shrink-0 text-center", dim && "opacity-55")}>
        <div
          className={cn(
            "rounded-[12px] px-2.5 py-1.5 font-mono text-[22px] font-bold leading-none tracking-[-0.02em] transition-colors",
            warn ? "animate-clock-pulse bg-rosy text-white" : "bg-ink text-king",
          )}
        >
          {formatClock(clockValue)}
        </div>
        <div className="mt-[3px] font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-ink-mute">
          {clockLabel}
        </div>
      </div>
    </div>
  );
}
