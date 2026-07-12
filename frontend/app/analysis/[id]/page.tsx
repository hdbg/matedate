"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/app/components/ui/AppShell";
import { AnalysisPanel } from "../components/AnalysisPanel";
import { ReviewControls } from "../components/ReviewControls";
import { ReviewHeader } from "../components/ReviewHeader";
import { ReviewThread } from "../components/ReviewThread";
import { SummaryStrip } from "../components/SummaryStrip";
import { loadReview, rankCounts, type ReviewData } from "../review";
import { useReviewReplay } from "../useReviewReplay";

export default function AnalysisPage() {
  const id = String(useParams().id);
  const router = useRouter();
  const [data, setData] = useState<ReviewData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    let active = true;
    (async () => {
      const review = await loadReview(id);
      if (!active) return;
      setData(review);
      setState(review ? "ready" : "missing");
    })();
    return () => {
      active = false;
    };
  }, [id]);

  if (state !== "ready" || !data) {
    return (
      <AppShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center font-mono text-[13px] text-ink-mute">
          {state === "missing" ? (
            <>
              <span className="text-m-blunder">Review not found (or not yours).</span>
              <button
                type="button"
                onClick={() => router.push("/play")}
                className="cursor-pointer text-rosy-deep underline"
              >
                Back to play
              </button>
            </>
          ) : (
            "Loading review…"
          )}
        </div>
      </AppShell>
    );
  }

  return <ReviewScreen id={id} data={data} />;
}

function ReviewScreen({ id, data }: { id: string; data: ReviewData }) {
  const router = useRouter();
  const replay = useReviewReplay(data.youMoves.length, `matedate.reviewStep.${id}`);
  const { step } = replay;

  const currentMove = step === 0 ? null : (data.youMoves[step - 1] ?? null);
  const currentEval = currentMove ? currentMove.evalAfter : data.finalEval;
  const currentIndex = currentMove ? currentMove.threadIndex : -1;
  const counts = rankCounts(data.youMoves);

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
