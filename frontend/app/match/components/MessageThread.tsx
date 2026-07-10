"use client";

import { useEffect, useRef } from "react";
import { formatSwing, MOVE_CLASSES, type GradedMove } from "@/app/lib/game/service";
import { cn } from "@/app/lib/utils";
import type { Message } from "../useMatchGame";

function MoveTag({ move }: { move: GradedMove }) {
  const mv = MOVE_CLASSES[move.classKey];
  return (
    <span
      className="mt-1.5 inline-flex items-center gap-[5px] rounded-full px-[9px] py-[3px] font-mono text-[11px] font-bold text-white"
      style={{ background: mv.color }}
    >
      {mv.glyph} {mv.label} {formatSwing(move.swing)}
    </span>
  );
}

function TypingIndicator() {
  return (
    <div className="inline-flex gap-1 rounded-[20px] rounded-bl-[6px] bg-white px-4 py-[13px] shadow-[0_2px_6px_rgba(39,35,32,0.08)]">
      {[0, 0.15, 0.3].map((delay) => (
        <span
          key={delay}
          className="h-[7px] w-[7px] rounded-full bg-ink-mute"
          style={{ animation: `typing-dot 1.1s ease-in-out ${delay}s infinite` }}
        />
      ))}
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  if (message.side === "system") {
    return (
      <div className="animate-bubble-in self-start">
        <div className="rounded-[20px] rounded-bl-[6px] bg-cream-2 px-[15px] py-[11px] font-mono text-[13px] leading-[1.38]">
          {message.text}
        </div>
      </div>
    );
  }

  const isYou = message.side === "you";
  return (
    <div className={cn("animate-bubble-in flex max-w-[82%] flex-col", isYou ? "self-end items-end" : "self-start")}>
      <div
        className={cn(
          "px-[15px] py-[11px] text-[15px] leading-[1.38]",
          isYou
            ? "rounded-[20px] rounded-br-[6px] bg-rosy text-white"
            : "rounded-[20px] rounded-bl-[6px] bg-white shadow-[0_2px_6px_rgba(39,35,32,0.08)]",
        )}
      >
        {message.text}
      </div>
      {message.move && <MoveTag move={message.move} />}
    </div>
  );
}

interface MessageThreadProps {
  messages: Message[];
  typing: boolean;
}

export function MessageThread({ messages, typing }: MessageThreadProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  return (
    <div className="flex-1 overflow-y-auto px-[18px] pb-1.5 pt-4">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3.5">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {typing && (
          <div className="self-start">
            <TypingIndicator />
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
