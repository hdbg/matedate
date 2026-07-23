/**
 * Auth-cookie options shared by the browser, server, and middleware Supabase clients.
 *
 * `@supabase/ssr` stores the session in cookies. Without an explicit `maxAge` the tokens can land
 * in *session* cookies that a browser drops on close, so a returning player (especially an
 * anonymous one, whose whole history hangs off that session) silently loses everything. Pinning a
 * long max-age makes them persistent cookies that survive reloads and browser restarts. All three
 * clients must agree, or a server-side refresh would rewrite the cookie with a shorter lifetime.
 *
 * 400 days is the ceiling Chrome clamps cookie lifetimes to; we don't set `httpOnly` — the browser
 * client must read these via `document.cookie` to restore the session.
 */
export const AUTH_COOKIE_OPTIONS = {
  maxAge: 60 * 60 * 24 * 400,
} as const;
