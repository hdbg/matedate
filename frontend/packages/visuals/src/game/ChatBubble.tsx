import { cn } from "../lib/cn";
import { MoveBadge } from "./MoveIcon";
import type { MoveClassKey } from "../types";

interface ChatBubbleProps {
  side: "you" | "match" | "system";
  text: string;
  /** The graded verdict shown as a pill under a "you" bubble. */
  move?: { classKey: MoveClassKey; swing: number };
  /** App-supplied entrance animation class. The web app passes "animate-bubble-in" (its keyframes
   * live in the app's CSS); the video app omits it and drives the entrance via `progress`. */
  className?: string;
}

/** One message bubble in the match thread: your rosy bubble (with an optional verdict pill), the
 * match's white bubble, or a mono "system" note. The auto-scrolling thread container stays in the
 * web app (it owns the layout + scroll effect); this is the reusable bubble the video app reuses. */
export function ChatBubble({ side, text, move, className }: ChatBubbleProps) {
  if (side === "system") {
    return (
      <div className={cn("self-start", className)}>
        <div className="rounded-[20px] rounded-bl-[6px] bg-cream-2 px-[15px] py-[11px] font-mono text-[13px] leading-[1.38]">
          {text}
        </div>
      </div>
    );
  }

  const isYou = side === "you";
  return (
    <div className={cn("flex max-w-[82%] flex-col", isYou ? "self-end items-end" : "self-start", className)}>
      <div
        className={cn(
          "px-[15px] py-[11px] text-[15px] leading-[1.38]",
          isYou
            ? "rounded-[20px] rounded-br-[6px] bg-rosy text-white"
            : "rounded-[20px] rounded-bl-[6px] bg-white shadow-[0_2px_6px_rgba(39,35,32,0.08)]",
        )}
      >
        {text}
      </div>
      {move && <MoveBadge classKey={move.classKey} swing={move.swing} className="mt-1.5" />}
    </div>
  );
}
