import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPublicPath, onboardingPath } from "@/app/lib/auth/sessionGuard";
import { AUTH_COOKIE_OPTIONS } from "./cookieOptions";

/**
 * Refreshes the Supabase auth session on every request and forwards the updated
 * auth cookies to both the request and the response. Invoked from the root
 * `proxy.ts` (the Next.js 16 replacement for `middleware.ts`).
 *
 * It is also the route guard: a request without a session for anything outside the
 * public paths (see `app/lib/auth/sessionGuard.ts`) is redirected to onboarding,
 * carrying the original destination as `?next=` so onboarding can send the player
 * back once a session exists. Runs on client-side navigations too (the RSC fetch
 * passes through the proxy), so every route is covered from one place.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: AUTH_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Touch the user so expired tokens get refreshed and re-set on the response.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;
  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    const target = new URL(onboardingPath(pathname, search), url.origin);
    // Keep any refreshed auth cookies on the redirect so the session state stays coherent.
    const redirect = NextResponse.redirect(target);
    for (const cookie of supabaseResponse.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  }

  return supabaseResponse;
}
