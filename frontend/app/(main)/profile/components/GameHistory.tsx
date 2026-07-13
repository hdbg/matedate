"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn, formatRelativeTime } from "@/app/lib/utils";
import { categoryMeta, type HistoryCategory, type HistoryItem, type ProfileData } from "../profileData";

const FILTERS: Array<{ key: "all" | HistoryCategory; label: string }> = [
  { key: "all", label: "All" },
  { key: "solo", label: "Solo AI" },
  { key: "ranked", label: "Ranked" },
  { key: "practice", label: "Practice" },
  { key: "review", label: "Reviews" },
  { key: "puzzle", label: "Puzzles" },
];

const RESULT_TONES: Record<HistoryItem["result"]["tone"], string> = {
  w: "bg-m-good/[0.16] text-m-good",
  l: "bg-m-blunder/[0.12] text-m-blunder",
  solve: "bg-m-brilliant/[0.15] text-m-brilliant",
  rev: "bg-cream-2 text-ink-soft",
};

const HIGHLIGHT_TONES = {
  brilliant: "font-bold text-m-brilliant",
  blunder: "font-bold text-m-blunder",
  plain: "",
} as const;

interface GameHistoryProps {
  counts: ProfileData["counts"];
  history: HistoryItem[];
}

/** Filterable game list. Rows with a completed deep review open it; the rest open the replay. */
export function GameHistory({ counts, history }: GameHistoryProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | HistoryCategory>("all");
  const shown = filter === "all" ? history : history.filter((h) => h.category === filter);

  return (
    <div>
      <div className="no-scrollbar -mx-5 mb-3.5 flex gap-2 overflow-x-auto px-5 pb-1 lg:mx-0 lg:mb-4 lg:flex-wrap lg:overflow-visible lg:px-0 lg:pb-0">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              "flex-shrink-0 cursor-pointer whitespace-nowrap rounded-pill border-[1.5px] px-3.5 py-2 font-mono text-[12px] font-bold tracking-[0.02em] transition-colors",
              filter === f.key
                ? "border-ink bg-ink text-king"
                : "border-ink/[0.14] bg-white text-ink-soft hover:border-ink/[0.32]",
            )}
          >
            {f.label}{" "}
            <span className={cn("ml-1", filter === f.key ? "text-king/60" : "text-ink-mute")}>
              {counts[f.key]}
            </span>
          </button>
        ))}
      </div>

      {shown.length > 0 ? (
        <div className="flex flex-col gap-2.5 lg:gap-[11px]">
          {shown.map((item) => {
            const meta = categoryMeta(item.category);
            return (
              <button
                key={item.gameId}
                type="button"
                onClick={() =>
                  router.push(
                    item.analysisId
                      ? `/analysis/${item.analysisId}`
                      : `/analysis/game/${item.gameId}`,
                  )
                }
                className="flex cursor-pointer items-center gap-3 rounded-[18px] border border-ink/[0.07] bg-white p-3.5 text-left shadow-[0_3px_9px_rgba(39,35,32,0.05)] transition-[transform,box-shadow] duration-[120ms] hover:-translate-y-0.5 hover:shadow-[0_9px_20px_rgba(39,35,32,0.11)] lg:gap-4 lg:px-[18px] lg:py-4"
              >
                <div
                  className={cn(
                    "grid h-[46px] w-[46px] flex-shrink-0 place-items-center rounded-[13px] text-[22px] lg:h-[52px] lg:w-[52px] lg:rounded-[14px] lg:text-[25px]",
                    meta.iconClassName,
                  )}
                >
                  {meta.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-[7px] lg:gap-2">
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[15.5px] font-bold tracking-[-0.01em] lg:text-[17px]">
                      {item.title}
                    </span>
                    <span className="flex-shrink-0 rounded-pill bg-cream-2 px-[7px] py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-ink-soft lg:px-2">
                      {meta.label}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[11.5px] text-ink-mute lg:gap-2 lg:text-[12.5px]">
                    {item.accuracy != null && (
                      <>
                        <span>{item.accuracy}% acc</span>
                        <span className="opacity-40">·</span>
                      </>
                    )}
                    {item.highlight && (
                      <>
                        <span className={HIGHLIGHT_TONES[item.highlight.tone]}>
                          {item.highlight.text}
                        </span>
                        <span className="opacity-40">·</span>
                      </>
                    )}
                    <span>{formatRelativeTime(item.whenISO)}</span>
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-col items-end gap-[3px] lg:flex-row lg:items-center lg:gap-4">
                  <span
                    className={cn(
                      "rounded-[7px] px-2 py-[3px] font-mono text-[11px] font-bold tracking-[0.04em] lg:rounded-lg lg:px-2.5 lg:py-1",
                      RESULT_TONES[item.result.tone],
                    )}
                  >
                    {item.result.label}
                  </span>
                  {item.delta != null ? (
                    <span
                      className={cn(
                        "font-mono text-[13px] font-bold lg:w-[52px] lg:text-right lg:text-[16px]",
                        item.delta > 0 ? "text-m-good" : item.delta < 0 ? "text-m-blunder" : "text-ink-mute",
                      )}
                    >
                      {item.delta > 0 ? `+${item.delta}` : item.delta < 0 ? `−${Math.abs(item.delta)}` : "±0"}
                    </span>
                  ) : (
                    <span className="font-mono text-[12px] font-bold text-ink-mute lg:w-[52px] lg:text-right">
                      {item.flatLabel}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="px-5 py-[30px] text-center text-[14px] text-ink-mute">
          No games in this category yet.
          <Link href="/play" className="mt-1.5 block font-mono text-[12px] text-rosy-deep">
            Go play a round →
          </Link>
        </div>
      )}

      <p className="mx-2 mb-1.5 mt-5 text-center font-mono text-[11px] leading-[1.6] text-ink-mute">
        All history is private by default.
        <br />
        Cards are pseudonymized before sharing.
      </p>
    </div>
  );
}
