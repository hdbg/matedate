import { KingIcon, QueenIcon } from "@matedate/icons";
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
      <QueenIcon className="h-[118px] w-auto [filter:drop-shadow(1px_0_0_rgba(241,232,217,0.5))_drop-shadow(-1px_0_0_rgba(241,232,217,0.5))_drop-shadow(0_1px_0_rgba(241,232,217,0.5))_drop-shadow(0_-1px_0_rgba(241,232,217,0.5))]" />
      <div className="relative">
        {/* The "!!" sits off the king's top-right corner, angled with the king's lean and behind
            it (z-0) so it peeks past the cross instead of overlapping — same treatment as LogoMark. */}
        <span className="absolute left-[74%] top-[-8%] z-0 rotate-[24deg] text-[46px] font-extrabold leading-none tracking-[-0.04em] text-rosy [text-shadow:0_0_22px_rgba(214,83,106,0.5)]">
          !!
        </span>
        <KingIcon className="relative z-[1] h-[134px] w-auto origin-bottom rotate-12" />
      </div>
    </div>
  );
}
