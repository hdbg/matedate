"use client";

import { useEffect, useMemo, useState } from "react";
import { useSupabase } from "@/app/providers/SupabaseProvider";
import { LoadingScene } from "@/app/components/ui/LoadingScene";
import { ARCHETYPES } from "@matedate/visuals";
import { loadShareCardData, type ShareCardData } from "@/app/lib/game/shareCardData";
import { useArchetypeBySource, type ArchetypeSource } from "@/app/lib/game/useArchetype";
import { ShareCard } from "./ShareCard";
import { useShareCard } from "./useShareCard";

/** Source for a historic share card: a solo game, or a PvP match (with the viewer's own side so
 * the side chooser can label the boards). */
export type ShareCardModalSource =
  | { kind: "game"; gameId: string }
  | { kind: "match"; matchId: string; ownSide: "a" | "b" };

interface ShareCardModalProps {
  source: ShareCardModalSource;
  onClose: () => void;
}

/** Re-open a shareable card for a finished game from the profile. For PvP matches the viewer can
 * flip between their own board and the opponent's (both readable once the match is over). */
export function ShareCardModal({ source, onClose }: ShareCardModalProps) {
  const supabase = useSupabase();
  const [side, setSide] = useState<"a" | "b">(source.kind === "match" ? source.ownSide : "a");

  const archetypeSource: ArchetypeSource = useMemo(
    () =>
      source.kind === "game"
        ? { kind: "game", gameId: source.gameId }
        : { kind: "match", matchId: source.matchId, side },
    [source, side],
  );

  const { archetype, status } = useArchetypeBySource(archetypeSource);
  const [data, setData] = useState<ShareCardData | null>(null);
  const sourceKey =
    archetypeSource.kind === "game"
      ? `game:${archetypeSource.gameId}`
      : `match:${archetypeSource.matchId}:${archetypeSource.side}`;

  useEffect(() => {
    let cancelled = false;
    // Reset inside the async body (not synchronously in the effect) to avoid a cascading-render
    // lint warning; a changed source re-shows the "building" loader.
    void (async () => {
      setData(null);
      const d = await loadShareCardData(supabase, archetypeSource);
      if (!cancelled) setData(d);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, sourceKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const title = archetype ? ARCHETYPES[archetype.key].title : (data?.titleFallback ?? "MateDate");
  const { cardRef, exporting, capturing, share } = useShareCard(
    () => `${title} — ${data ? Math.round(data.accuracy) : 0}% accuracy on MateDate`,
  );

  const loading = status === "loading" || !data;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/70 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Share card"
        onClick={(e) => e.stopPropagation()}
        className="animate-after-game-pop relative m-auto w-full max-w-[392px] rounded-[30px] bg-paper p-[26px_22px_22px] shadow-[0_40px_90px_rgba(0,0,0,0.5)] lg:max-w-[440px] lg:p-[30px_28px_26px]"
      >
        <button
          type="button"
          title="Close"
          onClick={onClose}
          className="absolute right-4 top-4 grid h-[34px] w-[34px] cursor-pointer place-items-center rounded-full border-none bg-ink/[0.08] text-[16px] text-ink hover:bg-ink/[0.16]"
        >
          ✕
        </button>

        <div className="mb-3.5 text-center">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-rosy-deep">
            Share card
          </div>
        </div>

        {/* PvP: flip between your board and the opponent's (both readable once the match is over) */}
        {source.kind === "match" && (
          <div className="mx-auto mb-3 flex w-fit gap-1 rounded-pill bg-cream-2 p-1">
            {(
              [
                { key: source.ownSide, label: "You" },
                { key: source.ownSide === "a" ? "b" : "a", label: "Opponent" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => setSide(opt.key)}
                className={`cursor-pointer rounded-pill px-4 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] transition-colors ${
                  side === opt.key ? "bg-ink text-king" : "text-ink-soft hover:text-ink"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {loading || !data ? (
          <LoadingScene inline status="Building your card" />
        ) : (
          <ShareCard
            ref={cardRef}
            accuracy={data.accuracy}
            accuracySub={data.accuracySub}
            archetype={archetype}
            moves={data.moves}
            ratingLabel={data.ratingLabel}
            ratingValue={data.ratingValue}
            ratingDelta={data.ratingDelta}
            unratedLabel={data.unratedLabel}
            resultLabel={data.resultLabel}
            resultColor={data.resultColor}
            capturing={capturing}
          />
        )}

        <div className="mt-4 text-center">
          <button
            type="button"
            disabled={exporting || loading}
            onClick={() => void share()}
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border-none bg-rosy px-[22px] py-[13px] text-[15px] font-bold text-white shadow-[0_6px_0_var(--rosy-deep)] transition hover:bg-rosy-deep active:translate-y-[3px] active:shadow-[0_3px_0_var(--rosy-deep)] disabled:cursor-default disabled:opacity-70 disabled:active:translate-y-0"
          >
            {exporting ? "⏳ Exporting…" : "↗ Share this card"}
          </button>
        </div>
      </div>
    </div>
  );
}
