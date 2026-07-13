"use client";

import { SupabaseProvider } from "./SupabaseProvider";
import { SessionProvider } from "./SessionProvider";
import { LiveGameProvider } from "./LiveGameProvider";

/**
 * Root client providers, rendered by the (server) root layout so every route — onboarding, match,
 * play, profile, analysis — shares one Supabase client, one session snapshot, and one live-game
 * signal. Order matters: session needs the client, live-game needs the session's userId.
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <SupabaseProvider>
      <SessionProvider>
        <LiveGameProvider>{children}</LiveGameProvider>
      </SessionProvider>
    </SupabaseProvider>
  );
}
