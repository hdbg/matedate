"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/app/providers/SessionProvider";
import { useSupabase } from "@/app/providers/SupabaseProvider";
import type { AnalysisJobRow } from "@/app/lib/supabase/types";

/** A terminal analysis outcome surfaced in the notifications bell. */
export interface AnalysisNotification {
  jobId: string;
  status: "completed" | "failed";
  analysisId: string | null; // present on success → links to /analysis/[id]
  at: string; // ISO timestamp used for ordering
}

const SEEN_KEY = "matedate.seenAnalysisJobs";
const MAX = 20;

function loadSeen(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<string>): void {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-200)));
  } catch {
    /* storage disabled — badge just won't persist across reloads */
  }
}

function toNotification(job: AnalysisJobRow): AnalysisNotification | null {
  if (job.status !== "completed" && job.status !== "failed") return null;
  return {
    jobId: job.id,
    status: job.status,
    analysisId: job.analysis_id,
    at: job.finished_at ?? job.updated_at ?? job.created_at,
  };
}

/**
 * Watches the current user's game-analysis jobs and surfaces a notification when one finishes
 * (successfully or not). It does an initial catch-up query (for reviews that finished while the
 * user was away) and subscribes to realtime UPDATEs on analysis_jobs for live results. "Unread" is
 * tracked in localStorage so the badge survives reloads; `markAllRead` clears it (call on open).
 */
export function useAnalysisNotifications() {
  const supabase = useSupabase();
  const { userId } = useSession();
  const [notifications, setNotifications] = useState<AnalysisNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const seenRef = useRef<Set<string>>(loadSeen());

  const recount = useCallback((list: AnalysisNotification[]) => {
    setUnread(list.filter((n) => !seenRef.current.has(n.jobId)).length);
  }, []);

  const upsert = useCallback(
    (incoming: AnalysisNotification) => {
      setNotifications((prev) => {
        const next = [incoming, ...prev.filter((n) => n.jobId !== incoming.jobId)]
          .sort((a, b) => b.at.localeCompare(a.at))
          .slice(0, MAX);
        recount(next);
        return next;
      });
    },
    [recount],
  );

  const markAllRead = useCallback(() => {
    for (const n of notifications) seenRef.current.add(n.jobId);
    saveSeen(seenRef.current);
    setUnread(0);
  }, [notifications]);

  useEffect(() => {
    if (!userId) return;
    // The channel is created after `await`s; a `cancelled` guard checked after each await lets a
    // torn-down mount (React StrictMode double-invokes effects) bail before subscribing — otherwise
    // the second mount reuses the same-named channel instance and `.on()` throws "after subscribe()".
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      // Catch up on reviews that finished while we weren't listening.
      const { data } = await supabase
        .from("analysis_jobs")
        .select("*")
        .eq("kind", "game_analysis")
        .in("status", ["completed", "failed"])
        .order("updated_at", { ascending: false })
        .limit(MAX);
      if (cancelled) return;
      const initial = ((data ?? []) as AnalysisJobRow[])
        .map(toNotification)
        .filter((n): n is AnalysisNotification => n !== null);
      setNotifications(initial);
      recount(initial);

      // Live results: analysis_jobs transitions to completed/failed as the worker runs.
      channel = supabase
        .channel(`analysis-jobs:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "analysis_jobs",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const notification = toNotification(payload.new as AnalysisJobRow);
            if (notification) upsert(notification);
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [supabase, userId, recount, upsert]);

  return { notifications, unread, markAllRead };
}
