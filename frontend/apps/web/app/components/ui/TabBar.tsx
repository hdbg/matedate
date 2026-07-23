import Link from "next/link";
import { cn } from "@/app/lib/utils";

export type TabLabel = "Play" | "Ladder" | "Reviews" | "You";

interface TabItem {
  icon: string;
  label: TabLabel;
  /** Route the tab navigates to; null = not built yet (falls back to a toast). */
  href: string | null;
}

export const TABS: TabItem[] = [
  { icon: "♟", label: "Play", href: "/play" },
  { icon: "🏆", label: "Ladder", href: null },
  { icon: "🗂", label: "Reviews", href: null },
  { icon: "👤", label: "You", href: "/profile" },
];

interface TabBarProps {
  active: TabLabel;
  /** Called for tabs without a route yet (Ladder/Reviews) — show a coming-soon toast. */
  onInactive: (label: TabLabel) => void;
  className?: string;
}

/** Persistent bottom tab bar. Tabs with a route navigate; the rest toast. */
export function TabBar({ active, onInactive, className }: TabBarProps) {
  return (
    <div
      className={cn(
        "flex h-[66px] flex-shrink-0 items-center justify-around border-t border-ink/10 bg-paper/90 px-2 pb-1.5 backdrop-blur-md",
        className,
      )}
    >
      {TABS.map((tab) => {
        const itemClass = cn(
          "flex cursor-pointer flex-col items-center gap-[3px] px-3.5 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.06em]",
          tab.label === active ? "text-rosy-deep" : "text-ink-mute",
        );
        if (tab.href) {
          return (
            <Link key={tab.label} href={tab.href} className={itemClass}>
              <span className="text-[20px]">{tab.icon}</span>
              {tab.label}
            </Link>
          );
        }
        return (
          <button
            key={tab.label}
            type="button"
            onClick={() => onInactive(tab.label)}
            className={itemClass}
          >
            <span className="text-[20px]">{tab.icon}</span>
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
