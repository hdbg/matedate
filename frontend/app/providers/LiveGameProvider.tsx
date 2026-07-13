"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSupabase } from "./SupabaseProvider";
import { useSession } from "./SessionProvider";

/** The user's in-progress game, surfaced so the Play screen can offer "resume" and block new starts. */
export interface ActiveGame {
  gameId: string;
  /** Only 'solo' games are live today; kept so the resume link can carry the right mode. */
  mode: string;
  personaName: string | null;
}

export interface LiveGameValue {
  activeGame: ActiveGame | null;
  loading: boolean;
  /** Re-query the active game (called on focus, and by the match screen when a game finishes). */
  refresh: () => Promise<void>;
}

const LiveGameContext = createContext<LiveGameValue | null>(null);

/** PostgREST returns embedded to-one resources as either an object or a single-element array. */
function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

interface ActiveGameRow {
  id: string;
  mode: string;
  solo_games: { personas: { name: string } | { name: string }[] | null } | null | Array<{
    personas: { name: string } | { name: string }[] | null;
  }>;
}

/**
 * Tracks whether the signed-in user has an active (unfinished) game. The backend enforces one active
 * game per user and resumes it on WS reconnect, but nothing outside the match socket knew about it —
 * so the Play buttons would happily start a second game. This queries the owner's active row on mount
 * + window focus and subscribes to realtime changes on `games`, so the Play screen can block the
 * queue and offer a resume link, updating the instant a game starts or finishes.
 */
export function LiveGameProvider({ children }: { children: React.ReactNode }) {
  const supabase = useSupabase();
  const { userId } = useSession();
  const [activeGame, setActiveGame] = useState<ActiveGame | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setActiveGame(null);
      return;
    }
    const { data } = await supabase
      .from("games")
      .select("id, mode, solo_games(personas(name))")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = (data ?? null) as ActiveGameRow | null;
    if (!row) {
      setActiveGame(null);
      return;
    }
    const solo = firstOf(row.solo_games);
    const persona = firstOf(solo?.personas);
    setActiveGame({ gameId: row.id, mode: row.mode, personaName: persona?.name ?? null });
  }, [supabase, userId]);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      // `refresh` handles the signed-out case too (clears activeGame), so always run it first.
      await refresh();
      if (cancelled) return;
      setLoading(false);
      if (!userId) return; // no realtime channel without a user

      // A game starting (backend INSERT) or finishing (UPDATE status→completed/abandoned) re-queries.
      channel = supabase
        .channel(`games:${userId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "games", filter: `user_id=eq.${userId}` },
          () => void refresh(),
        )
        .subscribe();
    })();

    // Cheap safety net for anything realtime missed while the tab was backgrounded.
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [supabase, userId, refresh]);

  const value = useMemo<LiveGameValue>(
    () => ({ activeGame, loading, refresh }),
    [activeGame, loading, refresh],
  );

  return <LiveGameContext.Provider value={value}>{children}</LiveGameContext.Provider>;
}

export function useLiveGame(): LiveGameValue {
  const value = useContext(LiveGameContext);
  if (!value) throw new Error("useLiveGame must be used within <LiveGameProvider>");
  return value;
}
