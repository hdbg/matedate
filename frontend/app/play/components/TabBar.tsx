import { cn } from "@/app/lib/utils";

interface TabItem {
  icon: string;
  label: string;
}

export const TABS: TabItem[] = [
  { icon: "♟", label: "Play" },
  { icon: "🏆", label: "Ladder" },
  { icon: "🗂", label: "Reviews" },
  { icon: "👤", label: "You" },
];

interface TabBarProps {
  onInactive: (label: string) => void;
  className?: string;
}

/** Persistent bottom tab bar. "Play" is the only wired tab; others toast. */
export function TabBar({ onInactive, className }: TabBarProps) {
  return (
    <div
      className={cn(
        "flex h-[66px] flex-shrink-0 items-center justify-around border-t border-ink/10 bg-paper/90 px-2 pb-1.5 backdrop-blur-md",
        className,
      )}
    >
      {TABS.map((tab, i) => {
        const active = i === 0;
        return (
          <button
            key={tab.label}
            type="button"
            onClick={() => (active ? undefined : onInactive(tab.label))}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-[3px] px-3.5 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.06em]",
              active ? "text-rosy-deep" : "text-ink-mute",
            )}
          >
            <span className="text-[20px]">{tab.icon}</span>
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
