"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CareerStats } from "./components/CareerStats";
import { EditProfileModal } from "./components/EditProfileModal";
import { GameHistory } from "./components/GameHistory";
import { PreferencesCard } from "./components/PreferencesCard";
import { ProfileHeader } from "./components/ProfileHeader";
import { RankCard } from "./components/RankCard";
import { cachedProfile, loadProfile, type ProfileData } from "./profileData";
import { useToast } from "../layout";

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
  const showToast = useToast();
  // Seed from the module cache so a repeat visit paints instantly and revalidates in the
  // background — no full-screen "Loading profile…" flash when tabbing back.
  const cached = cachedProfile();
  const [data, setData] = useState<ProfileData | null>(cached);
  const [state, setState] = useState<"loading" | "ready" | "missing">(cached ? "ready" : "loading");
  const [editing, setEditing] = useState(false);

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

  if (state !== "ready" || !data) {
    return (
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
    );
  }

  return (
    <>
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
    </>
  );
}
