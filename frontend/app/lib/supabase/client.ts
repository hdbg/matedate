import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for use in Client Components. The browser client persists the
 * auth session in cookies (via @supabase/ssr) and refreshes tokens automatically.
 *
 * The client is intentionally left untyped (no Database generic): the hand-written
 * schema slice in ./types is used to cast reads/writes at call sites instead, which
 * avoids the supabase-js generic helpers collapsing partial schemas to `never`.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
