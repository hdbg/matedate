import { cn } from "@/app/lib/utils";
import { Wordmark } from "@/app/components/ui/Wordmark";

interface LogoMarkProps {
  /** King height in px; the marks scale with it. */
  size?: number;
  className?: string;
}

/**
 * The tilted king with its "!!" burst. The marks sit BEHIND the piece (king paints on top via
 * z-index — an absolutely-positioned sibling would otherwise stack over the in-flow img) and are
 * angled with the king's lean, peeking out past the crown's right shoulder.
 */
export function LogoMark({ size = 28, className }: LogoMarkProps) {
  return (
    <span
      aria-hidden
      className={cn("relative inline-block", className)}
      style={{ width: size, height: size }}
    >
      <span
        className="absolute left-[52%] top-[-16%] z-0 rotate-[24deg] font-extrabold leading-none tracking-[-0.04em] text-rosy [text-shadow:0_0_18px_rgba(214,83,106,0.5)]"
        style={{ fontSize: size * 0.45 }}
      >
        !!
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/assets/white-king.svg"
        alt=""
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
