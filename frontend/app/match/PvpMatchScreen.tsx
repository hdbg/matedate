"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/app/components/ui/AppShell";
import { useSession } from "@/app/providers/SessionProvider";
import { TIME_CONTROL_LABEL, type TimeControl } from "@/app/lib/game/service";
import { Composer } from "./components/Composer";
import { EvalBar } from "./components/EvalBar";
import { MatchHeader } from "./components/MatchHeader";
import { MatchIntro } from "./components/MatchIntro";
import { MessageThread } from "./components/MessageThread";
import { OpponentPanel } from "./components/OpponentPanel";
import { PvpResultModal } from "./components/PvpResultModal";
import { InviteWait, SearchingOverlay } from "./components/PvpWaiting";
import { VerdictFlash } from "./components/VerdictFlash";
import { usePvpGame, type PvpAction } from "./usePvpGame";

interface PvpMatchScreenProps {
  action: PvpAction;
  timeControl: TimeControl;
}

/**
 * The PvP board: your conversation with the persona on the main pane, the opponent's
 * gated progress (clock / glyphs / interest — never their words) in the sidebar, and the
 * lockstep composer that only opens on your turn. Entered via matchmaking (`mode=ranked`)
 * or a friend invite (`mode=friend`, create or join by code).
 */
export function PvpMatchScreen({ action, timeControl }: PvpMatchScreenProps) {
  const router = useRouter();
  const session = useSession();
  const game = usePvpGame(action);

  // Queue/invite cancelled (by us or a dead socket) — this screen has nothing to show.
  useEffect(() => {
    if (game.cancelled) router.push("/play");
  }, [game.cancelled, router]);

  const leave = () => {
    if (
      game.phase === "playing" &&
      !window.confirm(
        "Leaving mid-match doesn't pause it — your clock keeps running and you'll flag. Leave?",
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

  if (game.error) {
    return (
      <AppShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center font-mono text-[13px] text-ink-mute">
          <span className="text-m-blunder">{game.error}</span>
          <button
            type="button"
            onClick={() => router.push("/play")}
            className="cursor-pointer text-rosy-deep underline"
          >
            Back to modes
          </button>
        </div>
      </AppShell>
    );
  }

  // Pre-match phases render as full-screen stages (no board behind them yet).
  if (game.phase === "connecting" || game.phase === "searching" || game.phase === "inviteWaiting") {
    return (
      <AppShell>
        <div className="relative h-full min-h-0 flex-1">
          {game.phase === "connecting" ? (
            <div className="flex h-full flex-col items-center justify-center px-8 text-center font-mono text-[13px] text-ink-mute">
              Connecting…
            </div>
          ) : game.phase === "searching" ? (
            <SearchingOverlay timeControl={timeControl} onCancel={game.cancel} />
          ) : (
            game.inviteCode && (
              <InviteWait code={game.inviteCode} timeControl={timeControl} onCancel={game.cancel} />
            )
          )}
        </div>
      </AppShell>
    );
  }

  if (!game.persona || !game.opponent) {
    return (
      <AppShell>
        <div className="flex flex-1 items-center justify-center px-8 text-center font-mono text-[13px] text-ink-mute">
          Setting up the match…
        </div>
      </AppShell>
    );
  }

  const clockLabel = game.flagged
    ? "Flagged — you lose"
    : game.turn === "you"
      ? `${TIME_CONTROL_LABEL[timeControl]} · your move`
      : game.turn === "processing"
        ? "grading your move…"
        : "opponent on the clock";

  const oppName = game.opponent.displayName || game.opponent.username || "Opponent";

  return (
    <AppShell>
      <div className="flex h-full min-h-0 flex-col lg:grid lg:grid-cols-[340px_1fr]">
        {/* Match meta — a top strip on mobile, a left sidebar on desktop. */}
        <aside className="flex flex-shrink-0 flex-col border-b border-ink/[0.08] pb-3 pt-4 lg:h-full lg:overflow-y-auto lg:border-b-0 lg:border-r lg:bg-cream/30 lg:pb-6">
          <MatchHeader
            persona={game.persona}
            clockValue={game.yourClock.remaining}
            clockLabel={clockLabel}
            warn={game.yourClock.warn}
            dim={false}
            onBack={leave}
          />
          <OpponentPanel
            opponent={game.opponent}
            rated={game.rated}
            yourAcc={game.yourAcc}
            oppAcc={game.oppAcc}
            oppInterest={game.oppInterest}
            oppMoves={game.oppMoves}
            clock={game.oppClock}
            turn={game.turn}
          />
          <EvalBar interest={game.interest} personaName={game.persona.name} />
        </aside>

        {/* Conversation — thread + composer, capped for readability on desktop. */}
        <main className="relative flex min-h-0 flex-1 flex-col">
          <MessageThread messages={game.messages} typing={game.typing} />
          <Composer
            suggestions={game.suggestions}
            disabled={game.inputDisabled}
            placeholder={
              game.flagged
                ? "Match over"
                : game.turn === "you"
                  ? "Type your move…"
                  : `Waiting for ${oppName}…`
            }
            onSuggestion={game.send}
            onSend={game.send}
            onPeek={peek}
          />
          {game.verdict && <VerdictFlash key={game.verdict.id} verdict={game.verdict} />}
        </main>
      </div>

      {game.phase === "intro" && (
        <MatchIntro
          mode="ranked"
          rated={game.rated}
          timeControl={timeControl}
          persona={game.persona}
          player={{
            displayName: session.displayName,
            username: session.username,
            avatarPath: session.avatarPath,
            elo: session.elo,
          }}
          opponent={{
            name: oppName,
            handle: game.opponent.username ? `@${game.opponent.username}` : "@anonymous",
            avatarPath: game.opponent.avatarPath,
            elo: game.opponent.rankedElo,
          }}
          onDone={game.beginPlay}
        />
      )}
      {game.result && (
        <PvpResultModal
          result={game.result}
          onNewGame={() => router.push("/play")}
          onClose={game.dismissResult}
        />
      )}
    </AppShell>
  );
}
