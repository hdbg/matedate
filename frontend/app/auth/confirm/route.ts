import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { safeNext } from "@/app/lib/auth/sessionGuard";
import { createClient } from "@/app/lib/supabase/server";

/**
 * Email link handler for signup confirmation AND password recovery.
 *
 * We use the `token_hash` + `verifyOtp` flow (not the PKCE `?code=` exchange): the PKCE
 * code-verifier lives only in the browser that started the flow, so a link opened on a
 * different device would fail. `token_hash` verifies anywhere. The email templates
 * (supabase/templates/*.html) point here with `token_hash`, `type`, and `next`.
 *
 * On success the server client writes the session cookies (this is a Route Handler, so
 * cookie writes land on the response) and we redirect to the intended destination.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextParam = searchParams.get("next");

  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL("/login?error=invalid_link", origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    return NextResponse.redirect(new URL("/login?error=link_expired", origin));
  }

  // A recovery link exists only to set a new password — always land on /auth/reset.
  // Signup links honor the intended destination (deep-links) and default to /play.
  const dest = type === "recovery" ? "/auth/reset" : resolveNext(nextParam, origin, "/play");
  return NextResponse.redirect(new URL(dest, origin));
}

/**
 * `next` arrives as the `emailRedirectTo`/`redirectTo` we passed at signup/reset —
 * a same-origin absolute URL. Normalize it back to a safe internal path; reject
 * anything cross-origin or malformed.
 */
function resolveNext(nextParam: string | null, origin: string, fallback: string): string {
  if (!nextParam) return fallback;
  try {
    const url = new URL(nextParam, origin);
    if (url.origin !== origin) return fallback;
    return safeNext(url.pathname + url.search) ?? fallback;
  } catch {
    return fallback;
  }
}
