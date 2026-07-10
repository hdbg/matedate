"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/app/components/ui/AppShell";
import {
  TIME_CONTROL_LABEL,
  type TimeControl,
  type VersusMode,
} from "@/app/lib/game/service";
import { Composer } from "./components/Composer";
import { CompetitiveStrip } from "./components/CompetitiveStrip";
import { EvalBar } from "./components/EvalBar";
import { MatchHeader } from "./components/MatchHeader";
import { MessageThread } from "./components/MessageThread";
import { VerdictFlash } from "./components/VerdictFlash";
import { useMatchGame } from "./useMatchGame";

function parseMode(value: string | null): VersusMode {
  return value === "bot" ? "bot" : "ranked";
}

function parseTimeControl(value: string | null): TimeControl {
  return value === "bullet" || value === "classical" || value === "rapid" ? value : "rapid";
}

function MatchScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = parseMode(searchParams.get("mode"));
  const timeControl = parseTimeControl(searchParams.get("tc"));

  const game = useMatchGame(mode, timeControl);

  const leave = () => {
    if (
      mode === "ranked" &&
      !game.flagged &&
      !window.confirm(
        "Leaving now forfeits the match (counts as a timeout loss for ranked ELO). Leave?",
      )
    ) {
      return;
    }
    router.push("/play");
  };

  const peek = () =>
    window.alert(
      "🔒 The Brilliant line is a paid reveal.\n\nStart your 3-day free trial to unlock best moves in every match.",
    );

  if (!game.persona) {
    return (
      <AppShell>
        <div className="flex flex-1 items-center justify-center font-mono text-[13px] text-ink-mute">
          Loading match…
        </div>
      </AppShell>
    );
  }

  const clockLabel = game.flagged
    ? "Flagged — you lose"
    : mode === "bot"
      ? "Practice · relaxed"
      : `${TIME_CONTROL_LABEL[timeControl]} · your move`;

  return (
    <AppShell>
      <div className="flex h-full min-h-0 flex-col lg:grid lg:grid-cols-[340px_1fr]">
        {/* Match meta — a top strip on mobile, a left sidebar on desktop. */}
        <aside className="flex flex-shrink-0 flex-col border-b border-ink/[0.08] pb-3 pt-4 lg:h-full lg:overflow-y-auto lg:border-b-0 lg:border-r lg:bg-cream/30 lg:pb-6">
          <MatchHeader
            persona={game.persona}
            clockValue={game.clock.remaining}
            clockLabel={clockLabel}
            warn={game.clock.warn}
            dim={mode === "bot"}
            onBack={leave}
          />
          <CompetitiveStrip mode={mode} yourAcc={game.yourAcc} oppAcc={game.oppAcc} />
          <EvalBar interest={game.interest} personaName={game.persona.name} />
        </aside>

        {/* Conversation — thread + composer, capped for readability on desktop. */}
        <main className="relative flex min-h-0 flex-1 flex-col">
          <MessageThread messages={game.messages} typing={game.typing} />
          <Composer
            suggestions={game.suggestions}
            disabled={game.flagged}
            onSuggestion={game.sendSuggestion}
            onSend={game.send}
            onPeek={peek}
          />
          {game.verdict && <VerdictFlash key={game.verdict.id} verdict={game.verdict} />}
        </main>
      </div>
    </AppShell>
  );
}

export default function MatchPage() {
  return (
    <Suspense fallback={<AppShell />}>
      <MatchScreen />
    </Suspense>
  );
}
