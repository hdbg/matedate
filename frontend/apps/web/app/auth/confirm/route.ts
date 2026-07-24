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
 * `verifyOtp` writes the session cookies onto this response (Route Handler cookie writes
 * land on what we return). We then redirect with a **relative** Location so the browser
 * stays on the exact host it arrived on: the session cookie is host-only, so redirecting
 * to a different host (e.g. 127.0.0.1 → localhost, or apex → www) would drop it and bounce
 * the user to onboarding. For the same reason `next` is reduced to a path — its host, if
 * any, is ignored.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextParam = searchParams.get("next");

  if (!tokenHash || !type) {
    return redirectTo("/login?error=invalid_link");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    return redirectTo("/login?error=link_expired");
  }

  // A recovery link exists only to set a new password — always land on /auth/reset.
  // Signup links honor the intended destination (deep-links) and default to /play.
  return redirectTo(type === "recovery" ? "/auth/reset" : nextPath(nextParam, "/play"));
}

/** Relative 303 redirect — the browser resolves it against its current host. */
function redirectTo(path: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

/**
 * `next` arrives as the `emailRedirectTo`/`redirectTo` we passed at signup/reset — usually
 * an absolute URL. Keep only its path (host discarded) and validate it as a safe internal
 * path, so we never redirect off-site or to a mismatched host.
 */
function nextPath(nextParam: string | null, fallback: string): string {
  if (!nextParam) return fallback;
  try {
    const url = new URL(nextParam, "http://placeholder.invalid");
    return safeNext(url.pathname + url.search) ?? fallback;
  } catch {
    return fallback;
  }
}
