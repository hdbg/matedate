"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/app/components/ui/AppShell";
import { TabBar } from "@/app/components/ui/TabBar";
import { TopBar } from "@/app/components/ui/TopBar";
import { cn } from "@/app/lib/utils";
import { CareerStats } from "./components/CareerStats";
import { EditProfileModal } from "./components/EditProfileModal";
import { GameHistory } from "./components/GameHistory";
import { PreferencesCard } from "./components/PreferencesCard";
import { ProfileHeader } from "./components/ProfileHeader";
import { RankCard } from "./components/RankCard";
import { loadProfile, type ProfileData } from "./profileData";

function SectionLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mx-0.5 mb-3 mt-6 flex items-center justify-between font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-ink-mute first:mt-0 lg:mb-3.5">
      {children}
      {action}
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const [data, setData] = useState<ProfileData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [toast, setToast] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    const profile = await loadProfile();
    setData(profile);
    setState(profile ? "ready" : "missing");
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const profile = await loadProfile();
      if (!active) return;
      setData(profile);
      setState(profile ? "ready" : "missing");
    })();
    return () => {
      active = false;
    };
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1900);
  }, []);

  if (state !== "ready" || !data) {
    return (
      <AppShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center font-mono text-[13px] text-ink-mute">
          {state === "missing" ? (
            <>
              <span className="text-m-blunder">No profile — you&apos;re not signed in.</span>
              <button
                type="button"
                onClick={() => router.push("/onboarding")}
                className="cursor-pointer text-rosy-deep underline"
              >
                Get started
              </button>
            </>
          ) : (
            "Loading profile…"
          )}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <TopBar active="You" elo={data.elo} onInactive={(label) => showToast(`${label} coming soon`)} />

      <div className="flex-1 overflow-y-auto">
        <ProfileHeader data={data} onToast={showToast} onEdit={() => setEditing(true)} />

        <div className="mx-auto w-full max-w-[1180px] px-5 pb-6 pt-5 lg:grid lg:grid-cols-[376px_1fr] lg:items-start lg:gap-7 lg:px-12 lg:pb-11 lg:pt-8">
          <div>
            <SectionLabel>Rank &amp; rating</SectionLabel>
            <RankCard elo={data.elo} peak={data.peak} tier={data.tier} ratedGames={data.ratedGames} />

            <SectionLabel>Career</SectionLabel>
            <CareerStats career={data.career} />

            <SectionLabel
              action={
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="cursor-pointer font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-rosy-deep"
                >
                  Edit
                </button>
              }
            >
              From your setup
            </SectionLabel>
            <PreferencesCard prefs={data.prefs} />
          </div>

          <div>
            <SectionLabel>Game history</SectionLabel>
            <GameHistory counts={data.counts} history={data.history} />
          </div>
        </div>
      </div>

      {editing && (
        <EditProfileModal
          data={data}
          onSaved={(msg) => {
            showToast(msg);
            void reload();
          }}
          onClose={() => setEditing(false)}
        />
      )}

      <TabBar
        className="lg:hidden"
        active="You"
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
  );
}
