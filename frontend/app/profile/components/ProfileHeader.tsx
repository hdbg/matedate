import { Avatar } from "@/app/components/ui/Avatar";
import type { ProfileData } from "../profileData";

interface ProfileHeaderProps {
  data: ProfileData;
  onToast: (msg: string) => void;
  onEdit: () => void;
}

/** Dark identity header: brand, avatar + tier chip, name/handle, flags, actions. */
export function ProfileHeader({ data, onToast, onEdit }: ProfileHeaderProps) {
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

      <div className="relative z-[2] items-center gap-7 pt-3 lg:flex lg:pt-4">
        <div className="flex items-center gap-4">
          <div className="relative h-[88px] w-[88px] flex-shrink-0 lg:h-[124px] lg:w-[124px]">
            <button
              type="button"
              title={data.avatarPath ? "Change photo" : "Add photo"}
              onClick={onEdit}
              className="grid h-full w-full cursor-pointer place-items-center overflow-hidden rounded-full border-[3px] border-rosy bg-king/[0.06] shadow-[0_6px_18px_rgba(0,0,0,0.3)]"
            >
              <Avatar path={data.avatarPath} className="rounded-none" />
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
            onClick={onEdit}
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
