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
  oppAcc: number;
}

/** You-vs-opponent accuracy strip with round dots; discloses bot matches. */
export function CompetitiveStrip({ mode, yourAcc, oppAcc }: CompetitiveStripProps) {
  const opp = OPPONENTS[mode];
  const centerLabel = mode === "ranked" ? "Round 1 of 3 · ELO" : "Round 1 of 3 · casual";

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
          <div className="flex gap-1">
            <span className="h-[7px] w-[7px] rounded-full bg-ink shadow-[0_0_0_3px_rgba(39,35,32,0.12)]" />
            <span className="h-[7px] w-[7px] rounded-full bg-ink/[0.18]" />
            <span className="h-[7px] w-[7px] rounded-full bg-ink/[0.18]" />
          </div>
          <div className="font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-ink-mute">
            {centerLabel}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <div className="font-mono text-[14px] font-bold leading-none text-ink-soft">
            {accuracyLabel(oppAcc)}
          </div>
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
