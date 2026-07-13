import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The browser client, typed with the SDK's default (`any`) schema — same "intentionally untyped"
 * stance as the reads/writes below. (Deriving this from `ReturnType<typeof createBrowserClient>`
 * collapses to `any` and silently poisons every call site, so we alias `SupabaseClient` directly.)
 */
export type SupabaseBrowserClient = SupabaseClient;

/**
 * Supabase client for use in Client Components. The browser client persists the
 * auth session in cookies (via @supabase/ssr) and refreshes tokens automatically.
 *
 * The client is intentionally left untyped (no Database generic): the hand-written
 * schema slice in ./types is used to cast reads/writes at call sites instead, which
 * avoids the supabase-js generic helpers collapsing partial schemas to `never`.
 *
 * A single instance is memoized for the browser session: every caller (React
 * components via `SupabaseProvider`/`useSupabase`, and plain library functions that
 * can't reach context — live.ts, avatar.ts, profileData.ts, review.ts, service.ts,
 * onboarding) shares it, so there's one auth listener and one realtime connection.
 */
let browserClient: SupabaseBrowserClient | null = null;

export function createClient(): SupabaseBrowserClient {
  if (browserClient) return browserClient;
  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return browserClient;
}
