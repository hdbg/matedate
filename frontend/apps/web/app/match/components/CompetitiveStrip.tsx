import type { VersusMode } from "@/app/lib/game/service";
import { cn } from "@/app/lib/utils";

function accuracyLabel(acc: number): string {
  return acc > 0 ? `${Math.round(acc)}%` : "—";
}

interface Opponent {
  name: string;
  avatar: string;
  avatarClassName: string;
}

const OPPONENTS: Record<VersusMode, Opponent> = {
  ranked: { name: "Alex_M", avatar: "A", avatarClassName: "bg-rosy-tint text-rosy-deep" },
  bot: { name: "RizzBot-1400", avatar: "🤖", avatarClassName: "bg-cream-2 text-ink" },
};

interface CompetitiveStripProps {
  mode: VersusMode;
  yourAcc: number;
}

/** You-vs-opponent accuracy strip; discloses bot matches. (Real PvP uses OpponentPanel.) */
export function CompetitiveStrip({ mode, yourAcc }: CompetitiveStripProps) {
  const opp = OPPONENTS[mode];
  const centerLabel = mode === "ranked" ? "ELO" : "casual";

  return (
    <div className="mt-3 px-[18px]">
      <div className="flex items-center gap-2.5 rounded-[14px] bg-cream px-3 py-[9px]">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="grid h-[26px] w-[26px] flex-shrink-0 place-items-center rounded-[8px] bg-ink font-mono text-[14px] font-extrabold text-king">
            ♟
          </div>
          <div className="min-w-0 text-[12px] font-bold leading-[1.1]">You</div>
          <div className="font-mono text-[14px] font-bold leading-none text-rosy-deep">
            {accuracyLabel(yourAcc)}
          </div>
        </div>

        <div className="flex flex-shrink-0 flex-col items-center gap-1">
          <div className="font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-ink-mute">
            {centerLabel}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <div className="min-w-0 truncate text-right text-[12px] font-bold leading-[1.1]">
            {opp.name}
          </div>
          <div
            className={cn(
              "grid h-[26px] w-[26px] flex-shrink-0 place-items-center rounded-[8px] font-mono text-[14px] font-extrabold",
              opp.avatarClassName,
            )}
          >
            {opp.avatar}
          </div>
        </div>
      </div>

      {mode === "bot" && (
        <div className="mt-[9px] flex items-center justify-center gap-1.5 font-mono text-[10px] font-bold tracking-[0.04em] text-ink-soft">
          <span className="rounded-full bg-cream-2 px-2 py-0.5">
            🤖 You&apos;re playing a bot — unranked
          </span>
        </div>
      )}
    </div>
  );
}
