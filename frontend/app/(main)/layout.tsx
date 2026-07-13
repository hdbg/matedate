"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AppShell } from "@/app/components/ui/AppShell";
import { TabBar, type TabLabel } from "@/app/components/ui/TabBar";
import { TopBar } from "@/app/components/ui/TopBar";
import { createClient } from "@/app/lib/supabase/client";
import { cn } from "@/app/lib/utils";

/** New accounts start at 1000 (the player_ratings default, minted by the signup trigger). */
const FALLBACK_ELO = 1000;

/** Lets the tab pages raise a toast on the shared chrome without owning one each. */
const ToastContext = createContext<(msg: string) => void>(() => {});
export function useToast(): (msg: string) => void {
  return useContext(ToastContext);
}

function activeTab(pathname: string): TabLabel {
  return pathname.startsWith("/profile") ? "You" : "Play";
}

/**
 * Shared chrome for the main tab screens (Play / You …). Living in one layout means the top bar,
 * notifications bell, and ELO persist across tab switches instead of remounting and refetching —
 * so navigating feels like a transition, not a reload. Only the page segment swaps, and it fades
 * in (keyed on the pathname).
 */
export default function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const active = activeTab(pathname);
  const [elo, setElo] = useState(FALLBACK_ELO);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1900);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data } = await supabase
        .from("player_ratings")
        .select("elo_rating")
        .eq("user_id", userData.user.id)
        .maybeSingle();
      const row = data as { elo_rating: number } | null;
      if (alive && row) setElo(row.elo_rating);
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      <AppShell>
        <TopBar
          active={active}
          elo={elo}
          onInactive={(label) => showToast(`${label} coming soon`)}
        />

        {/* key on the route so the page fades in on each tab switch */}
        <div key={pathname} className="animate-page-in flex min-h-0 flex-1 flex-col">
          {children}
        </div>

        <TabBar
          className="lg:hidden"
          active={active}
          onInactive={(label) => showToast(`${label} coming soon`)}
        />

        <div
          className={cn(
            "pointer-events-none absolute bottom-[82px] left-1/2 z-[30] -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-5 py-3 text-[14px] font-semibold text-king shadow-[0_10px_24px_rgba(39,35,32,0.3)] transition-all duration-[280ms]",
            toast ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
          )}
        >
          {toast}
        </div>
      </AppShell>
    </ToastContext.Provider>
  );
}
