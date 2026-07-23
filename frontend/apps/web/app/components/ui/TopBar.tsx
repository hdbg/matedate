import Link from "next/link";
import { Logo } from "@/app/components/ui/Logo";
import { NotificationsBell } from "@/app/components/ui/NotificationsBell";
import { TABS, type TabLabel } from "@/app/components/ui/TabBar";
import { cn } from "@/app/lib/utils";

interface TopBarProps {
  /** Which tab is the current screen (highlighted; not a link to itself). */
  active: TabLabel;
  /** ELO shown in the right-hand pill. */
  elo: number;
  /** Called for tabs without a route yet (Ladder/Reviews) — show a coming-soon toast. */
  onInactive: (label: TabLabel) => void;
}

/**
 * The app's desktop top navigation: logo, the tab nav (desktop only — mobile uses the bottom
 * `TabBar`), and the notifications bell + ELO pill. Shared across the main screens so navigation
 * is consistent; each passes its own `active` tab.
 */
export function TopBar({ active, elo, onInactive }: TopBarProps) {
  return (
    <header className="flex flex-shrink-0 items-center justify-between gap-4 border-b border-ink/[0.06] px-5 py-3.5 lg:px-10">
      <Link href="/play" aria-label="MateDate home">
        <Logo markSize={30} wordmarkClassName="text-[22px] tracking-[-0.03em] text-ink" />
      </Link>

      <nav className="hidden items-center gap-1 lg:flex">
        {TABS.map((tab) => {
          const navClass = cn(
            "rounded-full px-4 py-2 text-[14px] font-semibold transition-colors",
            tab.label === active ? "bg-ink text-king" : "text-ink-soft hover:bg-ink/[0.05]",
          );
          return tab.href ? (
            <Link key={tab.label} href={tab.href} className={navClass}>
              {tab.label}
            </Link>
          ) : (
            <button
              key={tab.label}
              type="button"
              onClick={() => onInactive(tab.label)}
              className={navClass}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      <div className="flex items-center gap-2.5">
        <NotificationsBell />
        <div className="flex items-center gap-2 rounded-full bg-ink py-[7px] pl-[11px] pr-[13px] text-king shadow-[0_3px_10px_rgba(39,35,32,0.2)]">
          <span className="text-[15px]">♟</span>
          <span className="font-mono text-[16px] font-bold">{elo}</span>
        </div>
      </div>
    </header>
  );
}
