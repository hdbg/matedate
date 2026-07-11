import type { TierInfo } from "@/app/lib/game/tiers";
import { PROVISIONAL_GAMES } from "@/app/lib/game/tiers";

interface RankCardProps {
  elo: number;
  peak: number;
  tier: TierInfo;
  ratedGames: number;
}

/** Tier medal + ELO/peak + progress toward the next division (SPEC §3.1 ladder). */
export function RankCard({ elo, peak, tier, ratedGames }: RankCardProps) {
  const apex = tier.nextFloor === null;

  return (
    <div className="rounded-[22px] border border-ink/[0.07] bg-white p-[18px] shadow-[0_4px_14px_rgba(39,35,32,0.07)] lg:p-[22px]">
      <div className="mb-4 flex items-center gap-3.5 lg:mb-[18px]">
        <div className="grid h-[52px] w-[52px] flex-shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#e8c25f] to-gold text-[26px] shadow-[0_4px_12px_rgba(201,154,51,0.35),inset_0_1px_0_rgba(255,255,255,0.5)] lg:h-[58px] lg:w-[58px] lg:text-[29px]">
          {tier.provisional ? "?" : tier.glyph}
        </div>
        <div>
          <div className="text-[20px] font-extrabold leading-[1.1] tracking-[-0.02em] lg:text-[23px]">
            {tier.provisional ? "Unrated" : tier.label}
          </div>
          <div className="mt-0.5 font-mono text-[12px] text-ink-mute">
            {tier.provisional
              ? `${Math.max(0, PROVISIONAL_GAMES - ratedGames)} more rated games to place`
              : `“${tier.flavor}”`}
          </div>
        </div>
        <div className="ml-auto text-right">
          <div className="font-mono text-[26px] font-bold leading-none tracking-[-0.02em] lg:text-[28px]">
            <span className="text-rosy">♟</span> {elo}
          </div>
          <div className="mt-[3px] font-mono text-[9px] uppercase tracking-[0.12em] text-ink-mute">
            Rizz ELO · peak {peak}
          </div>
        </div>
      </div>

      {!tier.provisional && (
        <>
          <div className="h-2.5 overflow-hidden rounded-pill bg-cream-2 shadow-[inset_0_1px_2px_rgba(39,35,32,0.12)] lg:h-[11px]">
            <div
              className="h-full rounded-pill bg-gradient-to-r from-rosy to-rosy-deep"
              style={{ width: `${tier.progressPct}%` }}
            />
          </div>
          <div className="mt-[7px] flex justify-between font-mono text-[11px] font-bold text-ink-mute lg:mt-2">
            <span>
              <b className="text-ink">{tier.label}</b> · {elo}
            </span>
            {!apex && (
              <span>
                {tier.nextLabel} · {tier.nextFloor}
              </span>
            )}
          </div>
          <div className="mt-[11px] text-center text-[12.5px] text-ink-soft lg:mt-[13px] lg:text-[13px]">
            {apex ? (
              <>
                Apex tier — <b className="text-rosy-deep">nothing above Checkmate</b>. The number is
                the flex.
              </>
            ) : (
              <>
                {tier.pointsToNext} ELO to <b className="text-rosy-deep">{tier.nextLabel}</b> — about{" "}
                {tier.cleanWins} clean win{tier.cleanWins === 1 ? "" : "s"}.
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
