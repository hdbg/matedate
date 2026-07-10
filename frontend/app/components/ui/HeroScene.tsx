import { cn } from "@/app/lib/utils";

interface HeroSceneProps {
  className?: string;
}

/**
 * The signature scene: a black queen giving check to a white king (mid-escape,
 * tilted) with a floating rosy "!!". Reused across Welcome and the Mode Selector
 * featured card. Decorative, so the SVGs use plain <img>.
 */
export function HeroScene({ className }: HeroSceneProps) {
  return (
    <div className={cn("flex items-end justify-center gap-2.5", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/assets/black-queen.svg"
        alt=""
        aria-hidden
        className="h-[118px] [filter:drop-shadow(1px_0_0_rgba(241,232,217,0.5))_drop-shadow(-1px_0_0_rgba(241,232,217,0.5))_drop-shadow(0_1px_0_rgba(241,232,217,0.5))_drop-shadow(0_-1px_0_rgba(241,232,217,0.5))]"
      />
      <div className="relative">
        <span className="absolute left-[57%] top-0.5 text-[44px] font-extrabold tracking-[-0.04em] text-rosy [text-shadow:0_0_22px_rgba(214,83,106,0.5)]">
          !!
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/white-king.svg"
          alt=""
          aria-hidden
          className="h-[134px] origin-bottom rotate-12"
        />
      </div>
    </div>
  );
}
