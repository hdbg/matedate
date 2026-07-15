"use client";

import { SupabaseProvider } from "./SupabaseProvider";
import { SessionProvider } from "./SessionProvider";
import { SessionGate } from "./SessionGate";
import { LiveGameProvider } from "./LiveGameProvider";

/**
 * Root client providers, rendered by the (server) root layout so every route — onboarding, match,
 * play, profile, analysis — shares one Supabase client, one session snapshot, and one live-game
 * signal. Order matters: session needs the client, live-game needs the session's userId.
 * SessionGate (inside the session) redirects protected routes to onboarding when there is no
 * session — the client half of the guard the middleware enforces server-side.
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <SupabaseProvider>
      <SessionProvider>
        <SessionGate>
          <LiveGameProvider>{children}</LiveGameProvider>
        </SessionGate>
      </SessionProvider>
    </SupabaseProvider>
  );
}
