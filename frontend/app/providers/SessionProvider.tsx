"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { PlayerRatingsRow, ProfileRow } from "@/app/lib/supabase/types";
import { useSupabase } from "./SupabaseProvider";

/** New accounts start at 1000 (the player_ratings default, minted by the signup trigger). */
const FALLBACK_ELO = 1000;

/** The signed-in user plus the lite identity snapshot the chrome needs everywhere. */
export interface SessionValue {
  user: User | null;
  userId: string | null;
  username: string | null;
  displayName: string | null;
  avatarPath: string | null;
  elo: number;
  /** True until the first auth resolution completes. */
  loading: boolean;
  /** Re-read the identity snapshot (call after editing the profile / finishing onboarding). */
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

interface Snapshot {
  username: string | null;
  displayName: string | null;
  avatarPath: string | null;
  elo: number;
}

const EMPTY_SNAPSHOT: Snapshot = {
  username: null,
  displayName: null,
  avatarPath: null,
  elo: FALLBACK_ELO,
};

/**
 * App-wide session state: the current auth user (kept fresh via `onAuthStateChange`) and a
 * lightweight profile snapshot (username, display name, avatar, ELO). Heavy per-screen data (career,
 * history) still loads in its own screen loader — this only holds what the shared chrome reads.
 * Tolerates the no-user state (pre-signup onboarding): `user` is simply null.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const supabase = useSupabase();
  const [user, setUser] = useState<User | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);

  const loadSnapshot = useCallback(
    async (userId: string) => {
      const [{ data: profileRow }, { data: ratingRow }] = await Promise.all([
        supabase
          .from("profiles")
          .select("username, display_name, avatar_path")
          .eq("id", userId)
          .maybeSingle(),
        supabase.from("player_ratings").select("elo_rating").eq("user_id", userId).maybeSingle(),
      ]);
      const profile = (profileRow ?? null) as Pick<
        ProfileRow,
        "username" | "display_name" | "avatar_path"
      > | null;
      const rating = (ratingRow ?? null) as Pick<PlayerRatingsRow, "elo_rating"> | null;
      setSnapshot({
        username: profile?.username ?? null,
        displayName: profile?.display_name ?? null,
        avatarPath: profile?.avatar_path ?? null,
        elo: rating?.elo_rating ?? FALLBACK_ELO,
      });
    },
    [supabase],
  );

  const refresh = useCallback(async () => {
    if (user) await loadSnapshot(user.id);
    else setSnapshot(EMPTY_SNAPSHOT);
  }, [user, loadSnapshot]);

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      setUser(data.user ?? null);
      if (data.user) await loadSnapshot(data.user.id);
      if (alive) setLoading(false);
    })();

    // Sign-in / anonymous / sign-out flip the user; reload (or clear) the snapshot to match.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      if (nextUser) void loadSnapshot(nextUser.id);
      else setSnapshot(EMPTY_SNAPSHOT);
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [supabase, loadSnapshot]);

  const value = useMemo<SessionValue>(
    () => ({
      user,
      userId: user?.id ?? null,
      username: snapshot.username,
      displayName: snapshot.displayName,
      avatarPath: snapshot.avatarPath,
      elo: snapshot.elo,
      loading,
      refresh,
    }),
    [user, snapshot, loading, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used within <SessionProvider>");
  return value;
}
