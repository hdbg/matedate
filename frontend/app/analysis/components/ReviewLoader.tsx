"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/app/components/ui/AppShell";
import type { ReviewData } from "../review";
import { ReviewScreen } from "./ReviewScreen";

interface ReviewLoaderProps {
  /** Route-specific fetch (by analysis id or by game id); null means not found / not yours. */
  load: () => Promise<ReviewData | null>;
  storageKey: string;
}

/** Loading/missing shell shared by the two review routes. */
export function ReviewLoader({ load, storageKey }: ReviewLoaderProps) {
  const router = useRouter();
  const [data, setData] = useState<ReviewData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    let active = true;
    (async () => {
      const review = await load();
      if (!active) return;
      setData(review);
      setState(review ? "ready" : "missing");
    })();
    return () => {
      active = false;
    };
  }, [load]);

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

  return <ReviewScreen data={data} storageKey={storageKey} />;
}
