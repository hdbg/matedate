"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/app/components/ui/Avatar";
import {
  TIME_CONTROL_LABEL,
  TIME_CONTROL_SECONDS,
  type Persona,
  type TimeControl,
  type VersusMode,
} from "@/app/lib/game/service";
import { tierFor } from "@/app/lib/game/tiers";

/**
 * How long the intro holds before play begins. Kept in sync with the server's first-turn grace
 * (`solo_intro_grace_seconds`, backend/app/config.py) so the animation is genuinely off-clock.
 */
export const INTRO_MS = 5000;

/** Cross-fade out into the match board so the hand-off isn't an abrupt cut. */
const EXIT_MS = 350;

/** A concrete rank chip (never provisional here — these are just for show). */
const RATED = 999;

interface PlayerInfo {
  displayName: string | null;
  username: string | null;
  avatarPath: string | null;
  elo: number;
}

interface MatchIntroProps {
  mode: VersusMode;
  timeControl: TimeControl;
  persona: Persona;
  player: PlayerInfo;
  /** Called when the reveal finishes (or the player taps to skip) — starts the held clock. */
  onDone: () => void;
}

/** Stable pseudo-ELO for the persona so ranked reads like a real pairing (no PvH ratings yet). */
function placeholderElo(slug: string, playerElo: number): number {
  let hash = 0;
  for (const ch of slug) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return Math.max(400, playerElo + ((hash % 121) - 40)); // roughly player ±50
}

/**
 * "Opponent found" face-off shown before every new game (ported from
 * mocks/MateDate Opponent Found.html). Ranked shows a competitive opponent (persona name + a
 * placeholder ELO/tier); practice / versus-AI shows the persona name + a disclosed-AI badge and no
 * ELO. Auto-advances after INTRO_MS; tap anywhere to skip.
 */
export function MatchIntro({ mode, timeControl, persona, player, onDone }: MatchIntroProps) {
  const ranked = mode === "ranked";
  const [count, setCount] = useState(3);
  const [exiting, setExiting] = useState(false);
  const finishedRef = useRef(false);

  // Fade the overlay out first, then hand off to play — so the board is revealed, not snapped in.
  // `onDone` still lands at ~INTRO_MS (fade starts EXIT_MS earlier), keeping the intro off-clock.
  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setExiting(true);
    setTimeout(onDone, EXIT_MS);
  }, [onDone]);

  useEffect(() => {
    const done = setTimeout(finish, Math.max(0, INTRO_MS - EXIT_MS));
    if (!ranked) return () => clearTimeout(done);
    // Ranked countdown, kicked off after the reveal settles (~2.4s).
    let ticker: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      ticker = setInterval(() => setCount((n) => Math.max(0, n - 1)), 800);
    }, 2400);
    return () => {
      clearTimeout(done);
      clearTimeout(start);
      if (ticker) clearInterval(ticker);
    };
  }, [ranked, finish]);

  const youName = player.displayName?.trim() || "You";
  const youTier = tierFor(player.elo, RATED);
  const oppElo = placeholderElo(persona.slug, player.elo);
  const oppTier = tierFor(oppElo, RATED);
  const tcSeconds = TIME_CONTROL_SECONDS[timeControl];

  return (
    <div
      role="dialog"
      aria-label="Opponent found"
      onClick={finish}
      className={`absolute inset-0 z-50 overflow-hidden select-none transition-opacity duration-[350ms] ease-out ${
        exiting ? "pointer-events-none opacity-0" : "cursor-pointer opacity-100"
      }`}
    >
      {/* dark radial stage (shakes on impact) */}
      <div
        className="intro-stage absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 80% at 50% 32%, rgba(214,83,106,.20), transparent 60%), radial-gradient(circle at 50% 40%, #322c28, #201d1a 70%)",
        }}
      />
      <div
        className="intro-streaks pointer-events-none absolute inset-0"
        style={{
          background:
            "repeating-linear-gradient(90deg, transparent 0 22px, rgba(251,246,236,.05) 22px 24px)",
        }}
      />
      <div
        className="intro-flash pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 40%, rgba(255,255,255,.9), rgba(214,83,106,.35) 30%, transparent 60%)",
        }}
      />

      {/* Only the face-off content narrows to a phone-like column on desktop; the dark stage,
          streaks and flash above stay full-screen. */}
      <div className="relative z-[5] flex h-full flex-col items-center px-6 pb-8 pt-8 text-king lg:mx-auto lg:max-w-[400px]">
        {/* eyebrow: searching → found */}
        <div className="relative h-4 w-full text-center">
          <span className="intro-eb-search absolute inset-0 font-mono text-[12px] font-bold uppercase tracking-[0.26em] text-ink-mute">
            Finding a worthy opponent…
          </span>
          <span className="intro-eb-found absolute inset-0 font-mono text-[12px] font-bold uppercase tracking-[0.26em] text-rosy opacity-0">
            {ranked ? "⚔️ Opponent found" : "🤖 Practice partner found"}
          </span>
        </div>

        <h1 className="intro-title mt-3.5 text-center text-[34px] font-extrabold leading-none tracking-[-0.035em] opacity-0">
          Make your <span className="text-rosy">move.</span>
        </h1>

        {/* face-off */}
        <div className="relative mt-1.5 flex w-full flex-1 items-center justify-between px-1.5">
          {/* YOU */}
          <div className="intro-you flex w-32 flex-col items-center gap-3 opacity-0">
            <div className="relative">
              <Avatar
                path={player.avatarPath}
                size={110}
                className="ring-[3px] ring-rosy shadow-[0_10px_30px_rgba(0,0,0,0.4)]"
              />
              <TierChip tier={youTier.glyph} label={youTier.label} />
            </div>
            <FighterInfo
              name={youName}
              handle={`@${player.username ?? "you"}`}
              elo={player.elo}
            />
          </div>

          {/* VS medallion */}
          <div className="intro-vs absolute left-1/2 top-[38%] z-[7] flex flex-col items-center">
            <div
              className="relative grid h-[78px] w-[78px] place-items-center rounded-full text-[26px] font-extrabold tracking-[-0.03em] text-white"
              style={{
                background: "linear-gradient(150deg, var(--rosy), var(--rosy-deep))",
                boxShadow: "0 0 0 5px rgba(214,83,106,.22), 0 14px 34px rgba(184,50,76,.5)",
              }}
            >
              <span className="absolute -top-[26px] text-[34px] [filter:drop-shadow(0_2px_4px_rgba(0,0,0,0.4))]">
                ⚔️
              </span>
              VS
              <span className="intro-bang absolute -right-[22px] -top-[14px] text-[30px] font-extrabold text-king opacity-0 [text-shadow:0_0_20px_rgba(255,255,255,0.6)]">
                !!
              </span>
            </div>
          </div>

          {/* OPPONENT */}
          <div className="intro-opp flex w-32 flex-col items-center gap-3 opacity-0">
            <div className="relative">
              <div className="grid h-[110px] w-[110px] place-items-center rounded-full border-[3px] border-gold bg-ink/40 shadow-[0_10px_30px_rgba(0,0,0,0.4)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/assets/black-queen.svg" alt="" aria-hidden className="h-[68%] w-[68%]" />
              </div>
              {ranked && <TierChip tier={oppTier.glyph} label={oppTier.label} />}
            </div>
            {ranked ? (
              <FighterInfo name={persona.name} handle={`@${persona.slug}`} elo={oppElo} />
            ) : (
              <div className="text-center">
                <div className="text-[18px] font-extrabold leading-[1.05] tracking-[-0.02em]">
                  {persona.name}
                </div>
                <div className="mt-[3px] font-mono text-[11px] text-ink-mute">AI · disclosed</div>
                <div className="mt-2.5 inline-block rounded-full border border-king/20 bg-king/10 px-[11px] py-[5px] font-mono text-[10px] font-bold text-king">
                  🤖 Unranked bot
                </div>
              </div>
            )}
          </div>
        </div>

        {/* matchup terms */}
        <div className="intro-terms mb-3.5 flex items-center justify-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-[#cfc6b6] opacity-0">
          <span className="rounded-full bg-rosy px-3 py-1.5 text-white">
            ⚡ {TIME_CONTROL_LABEL[timeControl]} · {tcSeconds}s
          </span>
          <span className="rounded-full border border-king/15 bg-king/10 px-3 py-1.5">
            {ranked ? "Ranked · ELO on the line" : "Practice · doesn’t touch ELO"}
          </span>
        </div>

        {ranked ? (
          <div className="intro-cta font-mono text-[12px] font-bold uppercase tracking-[0.12em] text-ink-mute opacity-0">
            Starting in <b className="text-rosy">{count}</b>
          </div>
        ) : (
          <div className="intro-cta font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-ink-mute opacity-0">
            Tap to start →
          </div>
        )}
      </div>
    </div>
  );
}

function FighterInfo({ name, handle, elo }: { name: string; handle: string; elo: number }) {
  return (
    <div className="text-center">
      <div className="text-[18px] font-extrabold leading-[1.05] tracking-[-0.02em]">{name}</div>
      <div className="mt-[3px] font-mono text-[11px] text-ink-mute">{handle}</div>
      <div className="mt-2 font-mono font-bold">
        <div className="flex items-center justify-center gap-1.5 text-[20px]">
          <span className="text-rosy">♟</span>
          {elo}
        </div>
        <div className="mt-0.5 text-[8px] uppercase tracking-[0.12em] text-ink-mute">ELO</div>
      </div>
    </div>
  );
}

function TierChip({ tier, label }: { tier: string; label: string }) {
  return (
    <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border-2 border-ink bg-gold px-[9px] py-[3px] font-mono text-[9px] font-bold tracking-[0.05em] text-ink">
      {tier} {label.toUpperCase()}
    </span>
  );
}
