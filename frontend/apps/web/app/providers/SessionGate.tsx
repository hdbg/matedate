"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isPublicPath, onboardingPath } from "@/app/lib/auth/sessionGuard";
import { useSession } from "./SessionProvider";

/**
 * The client half of the session guard (single source of truth in
 * `app/lib/auth/sessionGuard.ts`; the middleware is the server half). The middleware
 * already blocks sessionless navigations — this catches what it can't: the session
 * disappearing while the user sits on an already-rendered protected page (sign-out in
 * another tab, an expired/deleted auth user, a wiped local DB). Renders nothing on a
 * protected route without a session, so stale screens don't flash while redirecting.
 */
export function SessionGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useSession();

  const blocked = !loading && !user && !isPublicPath(pathname);

  useEffect(() => {
    if (blocked) {
      const search = typeof window !== "undefined" ? window.location.search : "";
      router.replace(onboardingPath(pathname, search));
    }
  }, [blocked, pathname, router]);

  if (blocked) return null;
  return <>{children}</>;
}
