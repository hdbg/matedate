"use client";

import { Avatar } from "@/app/components/ui/Avatar";
import { MoveIcon } from "@/app/components/ui/MoveIcon";
import type { WireOppMove } from "@/app/lib/game/pvpLive";
import { cn } from "@/app/lib/utils";
import type { PvpOpponent } from "../usePvpGame";

function accuracyLabel(acc: number): string {
  return acc > 0 ? `${Math.round(acc)}%` : "—";
}

function formatClock(remaining: number): string {
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

interface OpponentPanelProps {
  opponent: PvpOpponent;
  rated: boolean;
  yourAcc: number;
  oppAcc: number;
  /** Their persona's interest in THEM (derived from their swings), 0–100. */
  oppInterest: number;
  /** The opponent's gated move feed — glyphs/swings only until the match ends. */
  oppMoves: WireOppMove[];
  clock: { remaining: number; running: boolean };
  turn: "you" | "opponent" | "processing";
}

/**
 * Everything the player may see of the opponent mid-match (SPEC §2.2): who they are, whose
 * clock is running, their move-quality glyphs, and their interest meter — never their words.
 * The full transcript is revealed on the finish screen (a live view is a future premium).
 */
export function OpponentPanel({
  opponent,
  rated,
  yourAcc,
  oppAcc,
  oppInterest,
  oppMoves,
  clock,
  turn,
}: OpponentPanelProps) {
  const name = opponent.displayName || opponent.username || "Opponent";
  const glyphs = oppMoves.filter((m) => m.speaker === "You" && m.classification);
  const status =
    turn === "opponent" ? "on the clock…" : turn === "processing" ? "grading…" : "waiting on you";
  const interest = Math.round(oppInterest);

  return (
    <div className="mt-3 px-[18px]">
      {/* you-vs-them accuracy strip */}
      <div className="flex items-center gap-2.5 rounded-t-[14px] bg-cream px-3 py-[9px]">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="grid h-[26px] w-[26px] flex-shrink-0 place-items-center rounded-[8px] bg-ink font-mono text-[14px] font-extrabold text-king">
            ♟
          </div>
          <div className="min-w-0 text-[12px] font-bold leading-[1.1]">You</div>
          <div className="font-mono text-[14px] font-bold leading-none text-rosy-deep">
            {accuracyLabel(yourAcc)}
          </div>
        </div>
        <div className="flex-shrink-0 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-ink-mute">
          {rated ? "ELO" : "friendly"}
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <div className="font-mono text-[14px] font-bold leading-none text-ink-soft">
            {accuracyLabel(oppAcc)}
          </div>
          <div className="min-w-0 truncate text-right text-[12px] font-bold leading-[1.1]">
            {name}
          </div>
          <Avatar path={opponent.avatarPath} size={26} className="flex-shrink-0 rounded-[8px]" />
        </div>
      </div>

      {/* their board: clock + status, glyph row, interest bar */}
      <div className="rounded-b-[14px] border-t border-ink/[0.06] bg-cream px-3 pb-[10px] pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-ink-mute">
            <span
              className={cn(
                "h-[7px] w-[7px] rounded-full",
                turn === "opponent" ? "animate-pulse bg-rosy" : "bg-ink/[0.25]",
              )}
            />
            {status}
            {opponent.rankedElo != null && (
              <span className="ml-1 rounded-full bg-cream-2 px-1.5 py-0.5 normal-case tracking-normal">
                ♟ {opponent.rankedElo}
              </span>
            )}
          </div>
          <div
            className={cn(
              "rounded-[8px] px-2 py-1 font-mono text-[14px] font-bold leading-none",
              turn === "opponent" ? "bg-ink text-king" : "bg-ink/[0.08] text-ink-soft",
            )}
          >
            {formatClock(clock.remaining)}
          </div>
        </div>

        <div className="mt-2 flex min-h-[18px] flex-wrap items-center gap-1">
          {glyphs.length === 0 ? (
            <span className="font-mono text-[10px] text-ink-mute">no moves yet</span>
          ) : (
            glyphs.map((m) => <MoveIcon key={m.position} classKey={m.classification!} size={16} />)
          )}
        </div>

        <div className="mt-2">
          <div className="mb-1 flex items-baseline justify-between font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-ink-mute">
            <span>their date&apos;s interest</span>
            <span>{interest} / 100</span>
          </div>
          <div className="flex h-[8px] overflow-hidden rounded-full bg-ink/[0.85] shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]">
            <div
              className="h-full bg-ink-soft transition-[width] duration-[600ms] ease-[cubic-bezier(0.34,1.2,0.4,1)]"
              style={{ width: `${interest}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
