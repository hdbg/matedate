import { cn } from "@/app/lib/utils";
import type { ProfileData } from "../profileData";

/** Four career tiles: games, win rate, avg accuracy, brilliants. Nulls render as "—". */
export function CareerStats({ career }: { career: ProfileData["career"] }) {
  const tiles = [
    { value: String(career.games), label: "Games" },
    {
      value: career.winRatePct != null ? `${career.winRatePct}%` : "—",
      label: "Win rate",
      valueClassName: "text-m-good",
    },
    { value: career.avgAccuracyPct != null ? `${career.avgAccuracyPct}%` : "—", label: "Avg acc." },
    { value: String(career.brilliants), label: "Brilliants", valueClassName: "text-m-brilliant" },
  ];

  return (
    <div className="grid grid-cols-4 gap-[9px] lg:grid-cols-2 lg:gap-[11px]">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="rounded-2xl border border-ink/[0.07] bg-white px-1.5 py-3.5 text-center shadow-[0_3px_10px_rgba(39,35,32,0.05)] lg:p-4 lg:text-left"
        >
          <div
            className={cn(
              "font-mono text-[21px] font-bold tracking-[-0.02em] lg:text-[26px]",
              tile.valueClassName,
            )}
          >
            {tile.value}
          </div>
          <div className="mt-1 font-mono text-[9px] uppercase leading-[1.3] tracking-[0.06em] text-ink-mute lg:text-[10px]">
            {tile.label}
          </div>
        </div>
      ))}
    </div>
  );
}
