import type { ReactNode } from "react";
import { cn } from "@/app/lib/utils";

/** Scrollable onboarding screen body; children lay out as a flex column. */
export function OnboardingScreen({
  dark = false,
  children,
}: {
  dark?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex flex-1 flex-col overflow-y-auto px-[26px] pb-[26px] pt-5",
        dark && "bg-ink text-king",
      )}
    >
      {children}
    </section>
  );
}

export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Back"
      className="-ml-1.5 mb-1.5 w-[34px] cursor-pointer p-1 text-[22px] leading-none opacity-70 hover:opacity-100"
    >
      ‹
    </button>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="mb-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-rosy">
      {children}
    </div>
  );
}

export function Title({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h1
      className={cn(
        "mb-2.5 mt-1.5 text-[32px] font-extrabold leading-[1.02] tracking-[-0.035em]",
        className,
      )}
    >
      {children}
    </h1>
  );
}

export function Sub({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("mb-5 text-[16px] leading-[1.45] text-ink-soft", className)}>{children}</p>
  );
}

/** Pushes trailing content (CTAs) to the bottom of the screen. */
export function Spacer() {
  return <div className="flex-1" />;
}
