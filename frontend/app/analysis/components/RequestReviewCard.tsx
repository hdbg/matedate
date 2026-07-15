"use client";

import { useState } from "react";
import { createClient } from "@/app/lib/supabase/client";

type RequestStatus = "idle" | "pending" | "requested" | "error";

/** Copy per request phase — the same fire-and-forget pattern as the after-game button. */
const COPY: Record<RequestStatus, { label: string; sub: string }> = {
  idle: { label: "Request deep review", sub: "Move-by-move coaching notes" },
  pending: { label: "Requesting…", sub: "Queuing your review" },
  requested: { label: "Review requested ✓", sub: "The bell will ring when it's ready" },
  error: { label: "Retry request", sub: "That didn't go through" },
};

/** What to analyze: a solo/practice game, or a PvP match (both boards). */
export interface ReviewTarget {
  kind: "game" | "match";
  id: string;
}

/**
 * Ask the backend to deep-review this game or match (the `request_game_analysis` /
 * `request_match_analysis` RPC — own completed sources only, idempotent). Fire-and-forget:
 * the notifications bell announces the finished review, and revisiting then shows it.
 */
export function RequestReviewCard({ target }: { target: ReviewTarget }) {
  const [status, setStatus] = useState<RequestStatus>("idle");
  const copy = COPY[status];
  const busy = status === "pending" || status === "requested";

  const request = async () => {
    setStatus("pending");
    const { error } =
      target.kind === "game"
        ? await createClient().rpc("request_game_analysis", { p_game_id: target.id })
        : await createClient().rpc("request_match_analysis", { p_match_id: target.id });
    setStatus(error ? "error" : "requested");
  };

  return (
    <div className="mt-4 rounded-[14px] border-[1.5px] border-dashed border-rosy bg-rosy/[0.08] p-[13px]">
      <p className="mb-2.5 text-[13px] leading-[1.45] text-ink-soft">
        This replay shows your live move ratings only. A deep review re-scores every move with a
        stronger engine and explains what to play instead.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void request()}
        className="inline-flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-full border-none bg-rosy px-[22px] py-[13px] text-[15px] font-bold tracking-[-0.01em] text-white shadow-[0_5px_0_var(--rosy-deep)] transition hover:bg-rosy-deep active:translate-y-[3px] active:shadow-[0_2px_0_var(--rosy-deep)] disabled:cursor-default disabled:opacity-80 disabled:active:translate-y-0"
      >
        <span className="font-mono text-[13px]" aria-hidden>
          🔍
        </span>
        <span className="flex flex-col items-start leading-[1.05]">
          {copy.label}
          <small className="font-mono text-[9.5px] font-bold uppercase tracking-[0.06em] opacity-70">
            {copy.sub}
          </small>
        </span>
      </button>
    </div>
  );
}
