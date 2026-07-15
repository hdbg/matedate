"use client";

import { useRouter } from "next/navigation";
import { AppShell } from "@/app/components/ui/AppShell";
import { cn } from "@/app/lib/utils";
import { rankCounts, type ReviewData, type ReviewMatchContext } from "../review";
import { useReviewReplay } from "../useReviewReplay";
import { AnalysisPanel } from "./AnalysisPanel";
import { RequestReviewCard } from "./RequestReviewCard";
import { ReviewControls } from "./ReviewControls";
import { ReviewHeader } from "./ReviewHeader";
import { ReviewThread } from "./ReviewThread";
import { SummaryStrip } from "./SummaryStrip";

interface ReviewScreenProps {
  data: ReviewData;
  /** localStorage key persisting the replay step — one per route identity. */
  storageKey: string;
}

/** The full Game Review screen: replay player + summary + per-move analysis rail. */
export function ReviewScreen({ data, storageKey }: ReviewScreenProps) {
  const router = useRouter();
  const replay = useReviewReplay(data.youMoves.length, storageKey);
  const { step } = replay;

  const currentMove = step === 0 ? null : (data.youMoves[step - 1] ?? null);
  const currentEval = currentMove ? currentMove.evalAfter : data.finalEval;
  const currentIndex = currentMove ? currentMove.threadIndex : -1;
  const counts = rankCounts(data.youMoves);

  // Close the WHOLE review in one press: all review-internal navigation (the board switch)
  // uses router.replace, so history holds exactly one entry for this screen and back()
  // always leaves it — to the profile / bell / wherever the review was opened from.
  const back = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/play");
  };
  const share = () => {
    const text = `${data.title} — my MateDate game review`;
    if (typeof navigator !== "undefined" && navigator.share) {
      void navigator.share({ title: "MateDate", text }).catch(() => {});
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(text).catch(() => {});
    }
  };

  // Best lines are RLS-gated (the paid best move): unlocking is a purchase/credit that mints a
  // game_reveal_unlocks row server-side. That flow isn't built yet, so the button just informs.
  const onUnlock = () =>
    window.alert(
      "🔒 Best moves are a paid reveal.\n\nStart your 3-day free trial to unlock the best line in every review.",
    );

  const panel = (
    <AnalysisPanel
      step={step}
      overview={{ title: data.title, description: data.description, tags: data.tags }}
      move={currentMove}
      onUnlock={onUnlock}
      hasAnalysis={data.hasAnalysis}
      opponentBoard={data.match ? !data.match.isYou : false}
      requestSlot={
        !data.hasAnalysis && data.gameId ? (
          <RequestReviewCard target={{ kind: "game", id: data.gameId }} />
        ) : !data.hasAnalysis && data.match ? (
          <RequestReviewCard target={{ kind: "match", id: data.match.matchId }} />
        ) : undefined
      }
    />
  );

  return (
    <AppShell>
      <div className="flex h-full min-h-0 flex-col lg:flex-row">
        {/* left column: header, summary, thread, (mobile) analysis sheet, controls */}
        <div className="flex min-h-0 flex-1 flex-col lg:border-r lg:border-ink/10">
          <ReviewHeader
            title={data.title}
            dateISO={data.dateISO}
            personaName={data.personaName}
            youEval={data.finalEval}
            endReason={data.endReason}
            onBack={back}
            onShare={share}
          />
          {data.match && <SideSwitch match={data.match} />}
          <SummaryStrip
            accuracy={data.accuracy}
            brilliant={counts.brilliant}
            blunder={counts.blunder}
            ratingDelta={data.ratingDelta}
            youEval={currentEval}
          />
          <ReviewThread thread={data.thread} currentIndex={currentIndex} />

          {/* analysis as a bottom sheet on mobile (a persistent rail on desktop, below) */}
          <div className="max-h-[38%] flex-shrink-0 overflow-y-auto border-t border-ink/10 bg-cream lg:hidden">
            {panel}
          </div>

          <ReviewControls youMoves={data.youMoves} replay={replay} />
        </div>

        {/* persistent analysis rail on desktop */}
        <aside className="hidden min-h-0 w-[380px] flex-col overflow-y-auto bg-cream lg:flex xl:w-[400px]">
          <div className="px-[26px] pt-[22px] font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-ink-mute">
            Move analysis
          </div>
          {panel}
        </aside>
      </div>
    </AppShell>
  );
}

/** PvP reviews show one board of the match at a time; this toggles which one you're reading.
 * Switching navigates to the other side's analysis (or its live replay when it hasn't been
 * deep-reviewed yet — both boards are always readable once the match is over). It REPLACES
 * the history entry: flipping boards is review-internal state, so the header back arrow
 * (and the browser's) still closes the whole review in a single step. */
function SideSwitch({ match }: { match: ReviewMatchContext }) {
  const router = useRouter();

  const chip = (label: string, active: boolean) => (
    <button
      type="button"
      disabled={active}
      onClick={() => {
        if (!active) router.replace(match.otherHref);
      }}
      className={cn(
        "rounded-full px-3.5 py-1.5 font-mono text-[11px] font-bold tracking-[0.04em] transition",
        active
          ? "cursor-default bg-ink text-king"
          : "cursor-pointer bg-white text-ink-soft shadow-[var(--sh-1)] hover:text-ink",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-shrink-0 items-center gap-2 border-b border-ink/[0.08] bg-cream/60 px-4 py-2 lg:px-7">
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-ink-mute">
        ⚔️ Board
      </span>
      {chip("You", match.isYou)}
      {chip("Opponent", !match.isYou)}
      {!match.rated && (
        <span className="ml-auto font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-ink-mute">
          friendly
        </span>
      )}
    </div>
  );
}
