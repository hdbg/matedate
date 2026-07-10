import { type NextRequest } from "next/server";
import { updateSession } from "@/app/lib/supabase/middleware";

/**
 * Next.js 16 renamed the `middleware` convention to `proxy` (nodejs runtime).
 * We use it to keep the Supabase auth session fresh across navigations.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on all paths except static assets and image files, so the auth
     * cookies stay fresh without touching the asset pipeline.
     */
    "/((?!_next/static|_next/image|favicon.ico|assets|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
