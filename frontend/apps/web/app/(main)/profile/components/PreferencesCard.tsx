import { DATING_GOALS, TEXTING_STYLES } from "@/app/onboarding/options";
import { cn } from "@/app/lib/utils";
import type { ProfileData } from "../profileData";

function PrefChip({ icon, label, neutral }: { icon?: string; label: string; neutral?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill border-[1.5px] px-3 py-[7px] text-[13.5px] font-semibold lg:px-3.5 lg:py-2 lg:text-[14px]",
        neutral
          ? "border-ink/[0.12] bg-cream text-ink-soft"
          : "border-rosy/30 bg-rosy-tint text-rosy-deep",
      )}
    >
      {icon && <span className="text-[15px] lg:text-[16px]">{icon}</span>}
      {label}
    </span>
  );
}

function PrefRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 border-b border-dashed border-ink/[0.13] py-3.5 last:border-b-0 lg:gap-4 lg:py-4">
      <div className="w-[78px] flex-shrink-0 pt-1.5 font-mono text-[10px] font-bold uppercase leading-[1.4] tracking-[0.08em] text-ink-mute lg:w-[90px]">
        {label}
      </div>
      <div className="flex flex-1 flex-wrap gap-[7px] lg:gap-2">{children}</div>
    </div>
  );
}

/** "From your setup" — the onboarding quiz answers, rendered with their original chips. */
export function PreferencesCard({ prefs }: { prefs: ProfileData["prefs"] }) {
  const goal = DATING_GOALS.find((g) => g.value === prefs.goal);
  const styles = TEXTING_STYLES.filter((s) => prefs.styles.includes(s.value));

  return (
    <div className="rounded-[20px] border border-ink/[0.07] bg-white px-4 py-1.5 shadow-[0_3px_10px_rgba(39,35,32,0.05)] lg:px-5">
      <PrefRow label="Playing for">
        {goal ? <PrefChip icon={goal.icon} label={goal.title} /> : <PrefChip neutral label="Not set yet" />}
      </PrefRow>
      <PrefRow label="Texting style">
        {styles.length > 0 ? (
          styles.map((s) => <PrefChip key={s.value} icon={s.icon} label={s.title} />)
        ) : (
          <PrefChip neutral label="Not set yet" />
        )}
      </PrefRow>
      <PrefRow label="Clock">
        <PrefChip neutral icon="⚡" label={prefs.clockLabel} />
      </PrefRow>
    </div>
  );
}
