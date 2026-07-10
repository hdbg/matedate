import { HeroScene } from "@/app/components/ui/HeroScene";
import { Wordmark } from "@/app/components/ui/Wordmark";
import { cn } from "@/app/lib/utils";

/**
 * Desktop-only marketing panel shown alongside the onboarding flow. Carries the
 * hero + wordmark + tagline so the flow pane on the right can focus on the step.
 */
export function BrandPanel({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex-col items-center justify-center gap-2 bg-ink px-12 py-16 text-king",
        className,
      )}
    >
      <HeroScene className="mb-2 scale-125" />
      <Wordmark className="text-center text-[56px] leading-none text-king" />
      <p className="mt-4 max-w-[22rem] text-center text-[17px] leading-[1.5] text-[#cfc6b6]">
        Flirting, graded like a chess engine. Every text gets a verdict —{" "}
        <span className="font-mono text-m-brilliant">!! Brilliant</span> to{" "}
        <span className="font-mono text-rosy">?? Blunder</span>.
      </p>
    </div>
  );
}
