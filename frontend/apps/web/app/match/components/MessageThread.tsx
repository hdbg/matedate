"use client";

import { useEffect, useRef } from "react";
import { ChatBubble } from "@matedate/visuals";
import type { Message } from "../useMatchGame";

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

/** Web adapter: maps a live `Message` onto the shared `ChatBubble`, keeping the entrance animation
 * class (its @keyframes live in globals.css). */
function MessageBubble({ message }: { message: Message }) {
  return (
    <ChatBubble
      side={message.side}
      text={message.text}
      move={message.move ? { classKey: message.move.classKey, swing: message.move.swing } : undefined}
      className="animate-bubble-in"
    />
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
