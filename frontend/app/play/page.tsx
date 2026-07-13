"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/app/components/ui/AppShell";
import { TopBar } from "@/app/components/ui/TopBar";
import { createClient } from "@/app/lib/supabase/client";
import type { TimeControl } from "@/app/lib/game/service";
import { cn } from "@/app/lib/utils";
import { TabBar } from "@/app/components/ui/TabBar";
import { FeaturedCard } from "./components/FeaturedCard";
import { ModeBadge, ModeRow } from "./components/ModeRow";
import { TimeControlSheet } from "./components/TimeControlSheet";

// New accounts start at 1000 (the player_ratings default, minted by the signup trigger).
const FALLBACK_ELO = 1000;

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-0.5 mb-3 mt-[22px] font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-ink-mute">
      {children}
    </div>
  );
}

export default function PlayPage() {
  const router = useRouter();
  const [elo, setElo] = useState<number>(FALLBACK_ELO);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [chosenTC, setChosenTC] = useState<TimeControl>("bullet");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data } = await supabase
        .from("player_ratings")
        .select("elo_rating")
        .eq("user_id", userData.user.id)
        .maybeSingle();
      const row = data as { elo_rating: number } | null;
      if (active && row) setElo(row.elo_rating);
    })();
    return () => {
      active = false;
    };
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1900);
  }, []);

  const startRanked = useCallback(() => {
    setSheetOpen(false);
    router.push(`/match?mode=ranked&tc=${chosenTC}`);
  }, [chosenTC, router]);

  return (
    <AppShell>
      {/* Header — full width. Nav lives here on desktop, in the tab bar on mobile. */}
      <TopBar active="Play" elo={elo} onInactive={(label) => showToast(`${label} coming soon`)} />

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

          <SectionLabel>Start here</SectionLabel>
          <FeaturedCard onClick={() => router.push("/match?mode=bot")} />

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
            />
            <ModeRow
              icon="🤖"
              iconClassName="bg-cream-2"
              name="Practice"
              badge={<ModeBadge className="bg-cream-2 text-ink-soft">🤖 Disclosed AI</ModeBadge>}
              description="Unlimited casual matches vs. badged bots. Doesn't touch ranked ELO."
              onClick={() => router.push("/match?mode=bot")}
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

      <TabBar
        className="lg:hidden"
        active="Play"
        onInactive={(label) => showToast(`${label} coming soon`)}
      />

      <TimeControlSheet
        open={sheetOpen}
        chosen={chosenTC}
        onPick={setChosenTC}
        onClose={() => setSheetOpen(false)}
        onFind={startRanked}
      />

      <div
        className={cn(
          "pointer-events-none absolute bottom-[82px] left-1/2 z-[30] -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-5 py-3 text-[14px] font-semibold text-king shadow-[0_10px_24px_rgba(39,35,32,0.3)] transition-all duration-[280ms]",
          toast ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
        )}
      >
        {toast}
      </div>
    </AppShell>
  );
}
