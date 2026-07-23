"use client";

import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/app/components/ui/AppShell";
import { Logo } from "@/app/components/ui/Logo";

/**
 * Friend-challenge landing: the link a creator shares (`/join/<code>`). The unguessable
 * code is the whole invitation — accepting hands it to the PvP socket, which resolves it
 * server-side (there is no client lookup, so codes can't be probed). Auth is handled by
 * the match screen's token resolution (anonymous sign-in fallback included).
 */
export default function JoinChallengePage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const code = params.code;

  return (
    <AppShell>
      <div className="flex h-full flex-1 flex-col items-center justify-center px-8 text-center">
        <Logo markSize={40} wordmarkClassName="text-[26px] tracking-[-0.03em]" />
        <div className="mt-8 font-mono text-[12px] font-bold uppercase tracking-[0.26em] text-rosy-deep">
          ⚔️ You&apos;ve been challenged
        </div>
        <h1 className="mt-3 max-w-[420px] text-[34px] font-extrabold leading-[1.05] tracking-[-0.035em]">
          A friend wants to see your <span className="text-rosy">game.</span>
        </h1>
        <p className="mt-3 max-w-[360px] text-[15px] text-ink-soft">
          You&apos;ll both flirt with the same AI date on the same clock — higher accuracy wins.
          Friendly match, no ELO at stake.
        </p>
        <button
          type="button"
          onClick={() => router.push(`/match?mode=friend&code=${encodeURIComponent(code)}`)}
          className="mt-8 inline-flex cursor-pointer items-center gap-2.5 rounded-full border-none bg-rosy px-8 py-4 text-[17px] font-bold tracking-[-0.01em] text-white shadow-[0_6px_0_var(--rosy-deep)] transition hover:bg-rosy-deep active:translate-y-[3px] active:shadow-[0_3px_0_var(--rosy-deep)]"
        >
          ⚔️ Accept the challenge
        </button>
        <button
          type="button"
          onClick={() => router.push("/play")}
          className="mt-4 cursor-pointer font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-ink-mute underline hover:text-ink"
        >
          Not now
        </button>
      </div>
    </AppShell>
  );
}
