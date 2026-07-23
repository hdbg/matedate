import { KingIcon } from "@matedate/icons";
import { cn } from "../lib/cn";
import { Wordmark } from "./Wordmark";

interface LogoMarkProps {
  /** King height in px; the marks scale with it. */
  size?: number;
  className?: string;
}

/**
 * The tilted king with its "!!" burst. The marks sit off the king's top-right corner with a small
 * gap (angled with the king's lean) so they clear the cross instead of overlapping it. They keep a
 * lower z-index than the king so, if a size ever tightens the gap, the piece still paints on top.
 */
export function LogoMark({ size = 28, className }: LogoMarkProps) {
  return (
    <span
      aria-hidden
      className={cn("relative inline-block", className)}
      style={{ width: size, height: size }}
    >
      <span
        className="absolute left-[76%] top-[-30%] z-0 rotate-[24deg] font-extrabold leading-none tracking-[-0.04em] text-rosy [text-shadow:0_0_18px_rgba(214,83,106,0.5)]"
        style={{ fontSize: size * 0.45 }}
      >
        !!
      </span>
      <KingIcon
        className="relative z-[1] origin-bottom rotate-12"
        style={{ width: size, height: size }}
      />
    </span>
  );
}

interface LogoProps {
  markSize?: number;
  className?: string;
  wordmarkClassName?: string;
}

/** Full logo: the king mark + the "MateDate" wordmark. */
export function Logo({ markSize = 26, className, wordmarkClassName }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <LogoMark size={markSize} />
      <Wordmark className={wordmarkClassName} />
    </span>
  );
}
