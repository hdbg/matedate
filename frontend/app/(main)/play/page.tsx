"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { TimeControl } from "@/app/lib/game/service";
import { useLiveGame } from "@/app/providers/LiveGameProvider";
import { FeaturedCard } from "./components/FeaturedCard";
import { ModeBadge, ModeRow } from "./components/ModeRow";
import { ResumeBanner } from "./components/ResumeBanner";
import { TimeControlSheet } from "./components/TimeControlSheet";
import { useToast } from "../toast";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-0.5 mb-3 mt-[22px] font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-ink-mute">
      {children}
    </div>
  );
}

export default function PlayPage() {
  const router = useRouter();
  const showToast = useToast();
  const { activeGame } = useLiveGame();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [chosenTC, setChosenTC] = useState<TimeControl>("bullet");

  const startRanked = useCallback(() => {
    setSheetOpen(false);
    router.push(`/match?mode=ranked&tc=${chosenTC}`);
  }, [chosenTC, router]);

  // A game is already live: block new starts and offer a resume link instead (the backend resumes
  // it on reconnect). The screenshot/puzzle rows aren't games, so they stay enabled. All live games
  // run on the solo backend and `mode` is only a cosmetic label, so resume into the relaxed view.
  const blocked = !!activeGame;
  const resume = () => router.push("/match?mode=bot");

  return (
    <>
      <div className="flex-1 overflow-y-auto px-5 pb-8 pt-5 lg:px-10">
        <div className="mx-auto w-full max-w-5xl">
          {/* greeting */}
          <div className="my-1">
            <h1 className="text-[29px] font-extrabold leading-[1.05] tracking-[-0.035em] lg:text-[38px]">
              Make your move.
            </h1>
            <p className="mt-1.5 text-[15px] text-ink-soft lg:text-[17px]">
              Pick a mode. Every game ends in a shareable review.
            </p>
          </div>

          {activeGame && (
            <ResumeBanner personaName={activeGame.personaName} onResume={resume} />
          )}

          <SectionLabel>Start here</SectionLabel>
          <FeaturedCard onClick={() => router.push("/match?mode=bot")} disabled={blocked} />

          <SectionLabel>Compete</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-2">
            <ModeRow
              icon="⚔️"
              iconClassName="bg-rosy-tint text-rosy-deep"
              name="Ranked PvP"
              badge={<ModeBadge className="bg-rosy-tint text-rosy-deep">ELO</ModeBadge>}
              description="Same persona, same clock. Higher accuracy wins the round."
              meta={{ value: "Gold II", label: "tier" }}
              onClick={() => setSheetOpen(true)}
              disabled={blocked}
            />
            <ModeRow
              icon="🤖"
              iconClassName="bg-cream-2"
              name="Practice"
              badge={<ModeBadge className="bg-cream-2 text-ink-soft">🤖 Disclosed AI</ModeBadge>}
              description="Unlimited casual matches vs. badged bots. Doesn't touch ranked ELO."
              onClick={() => router.push("/match?mode=bot")}
              disabled={blocked}
            />
          </div>

          <SectionLabel>Review &amp; sharpen</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-2">
            <ModeRow
              icon="📸"
              iconClassName="bg-m-brilliant/[0.15] text-m-brilliant"
              name="Screenshot review"
              badge={<ModeBadge className="bg-m-brilliant text-white">Most shared</ModeBadge>}
              description="Drop a real convo. Get an anonymized game-review card."
              meta={{ value: "3 left", label: "today" }}
              onClick={() => showToast("Screenshot review coming soon")}
            />
            <ModeRow
              icon="🧩"
              iconClassName="bg-m-great/[0.15] text-m-great"
              name="Daily puzzle"
              badge={<ModeBadge className="bg-ink text-king">🔥 5-day streak</ModeBadge>}
              description="One tricky position. Find the Brilliant reply."
              onClick={() => showToast("Today's puzzle coming soon")}
            />
          </div>

          <p className="mx-2 mb-1 mt-[22px] text-center font-mono text-[11px] leading-[1.6] text-ink-mute">
            🤖 = you&apos;re playing a bot, and we&apos;ll always tell you.
            <br />
            For entertainment &amp; practice. Be yourself.
          </p>
        </div>
      </div>

      <TimeControlSheet
        open={sheetOpen}
        chosen={chosenTC}
        onPick={setChosenTC}
        onClose={() => setSheetOpen(false)}
        onFind={startRanked}
      />
    </>
  );
}
