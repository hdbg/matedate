"use client";

import { useState } from "react";
import { TIME_CONTROL_LABEL, type TimeControl } from "@/app/lib/game/service";

interface SearchingOverlayProps {
  timeControl: TimeControl;
  onCancel: () => void;
}

/** Matchmaking wait state: the queue has no fixed duration, so this idles honestly with a
 * cancel affordance; the `match_found` frame swaps it for the full MatchIntro face-off. */
export function SearchingOverlay({ timeControl, onCancel }: SearchingOverlayProps) {
  return (
    <WaitStage
      eyebrow="Finding a worthy opponent…"
      title={
        <>
          Same persona. <span className="text-rosy">Same clock.</span>
        </>
      }
      sub={`${TIME_CONTROL_LABEL[timeControl]} pool · paired by preference`}
      onCancel={onCancel}
      cancelLabel="Cancel search"
    />
  );
}

interface InviteWaitProps {
  code: string;
  timeControl: TimeControl;
  onCancel: () => void;
}

/** Friend-challenge wait state: shows the shareable /join link (the unguessable code IS the
 * invitation — only someone holding it can join) until the friend connects. */
export function InviteWait({ code, timeControl, onCancel }: InviteWaitProps) {
  const [copied, setCopied] = useState(false);
  const link =
    typeof window !== "undefined" ? `${window.location.origin}/join/${code}` : `/join/${code}`;

  const copy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(link).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      });
    }
  };

  return (
    <WaitStage
      eyebrow="⚔️ Challenge a friend"
      title={
        <>
          Send the link. <span className="text-rosy">Wait for them.</span>
        </>
      }
      sub={`${TIME_CONTROL_LABEL[timeControl]} · friendly — no ELO at stake`}
      onCancel={onCancel}
      cancelLabel="Cancel challenge"
    >
      <div className="mt-5 w-full max-w-[340px]">
        <div className="flex items-center gap-2 rounded-[14px] border border-king/15 bg-king/10 p-2 pl-3.5">
          <div className="min-w-0 flex-1 truncate font-mono text-[12px] text-king/90">{link}</div>
          <button
            type="button"
            onClick={copy}
            className="flex-shrink-0 cursor-pointer rounded-full bg-rosy px-3.5 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-white hover:bg-rosy-deep"
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
        <div className="mt-3 text-center font-mono text-[11px] text-ink-mute">
          The invite stays open while you wait on this screen.
        </div>
      </div>
    </WaitStage>
  );
}

function WaitStage({
  eyebrow,
  title,
  sub,
  onCancel,
  cancelLabel,
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  sub: string;
  onCancel: () => void;
  cancelLabel: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="absolute inset-0 z-50 overflow-hidden select-none">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 80% at 50% 32%, rgba(214,83,106,.20), transparent 60%), radial-gradient(circle at 50% 40%, #322c28, #201d1a 70%)",
        }}
      />
      <div className="relative z-[5] flex h-full flex-col items-center justify-center px-6 text-center text-king lg:mx-auto lg:max-w-[400px]">
        <div className="animate-pulse font-mono text-[12px] font-bold uppercase tracking-[0.26em] text-ink-mute">
          {eyebrow}
        </div>
        <h1 className="mt-3.5 text-[32px] font-extrabold leading-[1.05] tracking-[-0.035em]">
          {title}
        </h1>
        <div className="mt-2 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-ink-mute">
          {sub}
        </div>
        {children}
        <button
          type="button"
          onClick={onCancel}
          className="mt-8 cursor-pointer rounded-full border border-king/20 bg-king/10 px-5 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-king hover:bg-king/20"
        >
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
