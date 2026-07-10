import { cn } from "@/app/lib/utils";

interface WordmarkProps {
  className?: string;
}

/**
 * "MateDate" logotype. "Mate" inherits currentColor (so it flips light/dark
 * with its container); "Date" is always rosy.
 */
export function Wordmark({ className }: WordmarkProps) {
  return (
    <span className={cn("font-sans font-extrabold tracking-[-0.035em]", className)}>
      Mate<span className="text-rosy">Date</span>
    </span>
  );
}
