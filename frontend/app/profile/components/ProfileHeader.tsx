import Link from "next/link";
import { TABS } from "@/app/components/ui/TabBar";
import { Wordmark } from "@/app/components/ui/Wordmark";
import { cn } from "@/app/lib/utils";
import type { ProfileData } from "../profileData";

interface ProfileHeaderProps {
  data: ProfileData;
  onToast: (msg: string) => void;
}

/** Dark identity header: brand, avatar + tier chip, name/handle, flags, actions. */
export function ProfileHeader({ data, onToast }: ProfileHeaderProps) {
  const { tier } = data;
  const tierChip = tier.provisional ? "UNRATED" : `${tier.glyph} ${tier.label.toUpperCase()}`;

  const share = () => {
    const rank = tier.provisional ? "Unrated" : tier.label;
    const text = `${data.displayName} — ${data.elo} ELO (${rank}) on MateDate`;
    if (typeof navigator !== "undefined" && navigator.share) {
      void navigator.share({ title: "MateDate", text }).catch(() => {});
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(text).catch(() => {});
      onToast("Copied your card");
    }
  };

  return (
    <div className="relative overflow-hidden bg-ink px-5 pb-6 pt-3 text-king lg:px-12 lg:pb-9 lg:pt-6">
      {/* decorative rosy glow (mock .head::after) */}
      <div
        aria-hidden
        className="absolute -top-8 right-[-40px] h-[190px] w-[190px] rounded-full bg-[radial-gradient(circle,rgba(214,83,106,0.22),transparent_70%)] lg:-top-20 lg:right-16 lg:h-[320px] lg:w-[320px]"
      />

      <div className="relative z-[2] mb-4 flex items-center justify-between lg:mb-6">
        <Link href="/play">
          <Wordmark className="text-[19px] text-king lg:text-[20px]" />
        </Link>

        {/* desktop nav — the mobile mock puts nav in the tab bar; desktop needs it here */}
        <nav className="hidden items-center gap-1 lg:flex">
          {TABS.map((tab) => {
            const navClass = cn(
              "rounded-full px-4 py-2 text-[14px] font-semibold transition-colors",
              tab.label === "You" ? "bg-king/10 text-king" : "text-king/70 hover:bg-king/[0.08]",
            );
            return tab.href ? (
              <Link key={tab.label} href={tab.href} className={navClass}>
                {tab.label}
              </Link>
            ) : (
              <button
                key={tab.label}
                type="button"
                onClick={() => onToast(`${tab.label} coming soon`)}
                className={navClass}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        <button
          type="button"
          title="Settings"
          onClick={() => onToast("Settings coming soon")}
          className="grid h-[38px] w-[38px] cursor-pointer place-items-center rounded-full border border-king/[0.16] bg-king/[0.06] text-[17px] text-king transition-colors hover:bg-king/[0.14] lg:hidden"
        >
          ⚙
        </button>
      </div>

      <div className="relative z-[2] items-center gap-7 lg:flex">
        <div className="flex items-center gap-4">
          <div className="relative h-[88px] w-[88px] flex-shrink-0 lg:h-[124px] lg:w-[124px]">
            {/* avatar upload isn't built yet — no storage bucket, no avatar column */}
            <button
              type="button"
              onClick={() => onToast("Photos coming soon")}
              className="grid h-full w-full cursor-pointer place-items-center rounded-full border-[3px] border-rosy bg-king/[0.06] font-mono text-[10px] uppercase tracking-[0.06em] text-king/60 shadow-[0_6px_18px_rgba(0,0,0,0.3)]"
            >
              Add photo
            </button>
            <span className="absolute -bottom-1 -right-1.5 whitespace-nowrap rounded-pill border-2 border-ink bg-gold px-2 py-[3px] font-mono text-[10px] font-bold tracking-[0.04em] text-ink lg:text-[11px]">
              {tierChip}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="text-[24px] font-extrabold leading-[1.05] tracking-[-0.03em] lg:text-[38px] lg:leading-none">
              {data.displayName}
            </h1>
            {data.handle && (
              <div className="mt-[3px] font-mono text-[13px] text-ink-mute lg:mt-1.5 lg:text-[15px]">
                {data.handle}
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5 lg:mt-3.5 lg:gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-rosy px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.05em] text-white lg:px-3 lg:py-1.5 lg:text-[11px]">
                ♟ {data.elo} ELO
              </span>
              {data.streakDays > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-pill border border-king/20 bg-king/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.05em] text-king lg:px-3 lg:py-1.5 lg:text-[11px]">
                  🔥 {data.streakDays}-day streak
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex gap-2.5 lg:ml-auto lg:mt-1 lg:flex-col lg:self-start">
          <button
            type="button"
            onClick={() => onToast("Edit profile coming soon")}
            className="flex-1 cursor-pointer rounded-pill border border-rosy bg-rosy px-6 py-[11px] text-[14px] font-bold text-king shadow-[0_4px_0_var(--rosy-deep)] transition-colors hover:bg-rosy-deep active:translate-y-[2px] active:shadow-[0_2px_0_var(--rosy-deep)] lg:flex-none lg:py-[13px] lg:text-[15px]"
          >
            Edit profile
          </button>
          <button
            type="button"
            onClick={share}
            className="flex-1 cursor-pointer whitespace-nowrap rounded-pill border border-king/20 bg-king/10 px-6 py-[11px] text-[14px] font-bold text-king transition-colors hover:bg-king/[0.18] lg:flex-none lg:py-[13px] lg:text-[15px]"
          >
            Share card
          </button>
        </div>
      </div>
    </div>
  );
}
