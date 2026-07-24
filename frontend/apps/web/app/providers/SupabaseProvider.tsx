"use client";

import { createContext, useContext } from "react";
import { createClient, type SupabaseBrowserClient } from "@/app/lib/supabase/client";

/**
 * Exposes the shared browser Supabase client through context so components can grab it with
 * `useSupabase()` instead of newing one up. `createClient()` is already a memoized singleton, so
 * this context and the direct library-function calls always resolve to the exact same instance.
 */
const SupabaseContext = createContext<SupabaseBrowserClient | null>(null);

export function SupabaseProvider({ children }: { children: React.ReactNode }) {
  // The client is a stable module singleton, so this value never changes across renders.
  return <SupabaseContext.Provider value={createClient()}>{children}</SupabaseContext.Provider>;
}

export function useSupabase(): SupabaseBrowserClient {
  const client = useContext(SupabaseContext);
  if (!client) throw new Error("useSupabase must be used within <SupabaseProvider>");
  return client;
}
