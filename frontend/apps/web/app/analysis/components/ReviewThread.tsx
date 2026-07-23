"use client";

import { useEffect, useRef } from "react";
import { MoveBadge } from "@matedate/visuals";
import { cn } from "@/app/lib/utils";
import type { ReviewThreadItem } from "../review";

interface ReviewThreadProps {
  thread: ReviewThreadItem[];
  /** Thread index of the current You move; -1 at the overview (all hidden). */
  currentIndex: number;
}

/** The conversation, revealed beat-by-beat: bubbles up to the current move show (the current one
 * ringed, earlier ones dimmed), later ones stay hidden. The current bubble scrolls into view. */
export function ReviewThread({ thread, currentIndex }: ReviewThreadProps) {
  const currentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentIndex]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-[18px] pb-3 pt-3.5 lg:px-7 lg:pt-4">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3.5">
        {thread.map((item, i) => {
          if (i > currentIndex) return null; // hidden (incl. all of them at the overview)
          const isCurrent = i === currentIndex;
          const isYou = item.side === "you";
          return (
            <div
              key={item.key}
              ref={isCurrent ? currentRef : undefined}
              className={cn(
                "flex max-w-[82%] flex-col transition-[opacity] duration-300",
                isYou ? "items-end self-end" : "self-start",
                isCurrent ? "opacity-100" : "opacity-50",
              )}
            >
              <div
                className={cn(
                  "text-[15px] leading-[1.38]",
                  isYou
                    ? "rounded-[20px] rounded-br-[6px] bg-rosy px-[15px] py-[11px] text-white"
                    : "rounded-[20px] rounded-bl-[6px] bg-white px-[15px] py-[11px] shadow-[var(--sh-1)]",
                  isCurrent && isYou && "shadow-[0_0_0_3px_var(--paper),0_0_0_6px_var(--rosy)]",
                  isCurrent && !isYou && "shadow-[0_0_0_3px_var(--paper),0_0_0_5px_rgba(39,35,32,0.35)]",
                  isCurrent && "animate-bubble-in",
                )}
              >
                {item.content}
              </div>
              {item.move && (
                <MoveBadge classKey={item.move.classKey} swing={item.move.swing} className="mt-1.5" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
