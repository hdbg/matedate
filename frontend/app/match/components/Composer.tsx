"use client";

import { useState } from "react";
import { cn } from "@/app/lib/utils";

interface ComposerProps {
  suggestions: string[];
  disabled: boolean;
  onSuggestion: (text: string) => void;
  onSend: (text: string) => void;
  onPeek: () => void;
}

export function Composer({ suggestions, disabled, onSuggestion, onSend, onPeek }: ComposerProps) {
  const [value, setValue] = useState("");

  const submit = () => {
    const text = value.trim();
    if (!text) return;
    onSend(text);
    setValue("");
  };

  return (
    <div className="flex-shrink-0 border-t border-ink/[0.08] bg-paper px-4 pb-[calc(14px+env(safe-area-inset-bottom))] pt-2.5">
      <div className="mx-auto w-full max-w-2xl">
      {suggestions.length > 0 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-2.5">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              disabled={disabled}
              onClick={() => onSuggestion(suggestion)}
              className="flex-shrink-0 cursor-pointer whitespace-nowrap rounded-full border-[1.5px] border-ink/[0.14] bg-white px-3.5 py-2 text-[13px] font-semibold transition-[border-color,transform] duration-100 hover:-translate-y-px hover:border-rosy disabled:opacity-50"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-[9px]">
        <div className="flex flex-1 items-center rounded-[22px] border-2 border-ink/[0.14] bg-white py-1 pl-4 pr-1 focus-within:border-rosy">
          <input
            value={value}
            disabled={disabled}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder={disabled ? "Round over" : "Type your move…"}
            autoComplete="off"
            className="flex-1 bg-transparent py-[9px] text-[15px] text-ink outline-none disabled:cursor-not-allowed"
          />
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={disabled || value.trim().length === 0}
          aria-label="Send move"
          className={cn(
            "grid h-10 w-10 flex-shrink-0 place-items-center rounded-full text-[19px] text-white transition-[transform,box-shadow] duration-100",
            "bg-rosy shadow-[0_4px_0_var(--rosy-deep)] hover:bg-rosy-deep active:translate-y-[3px] active:shadow-[0_1px_0_var(--rosy-deep)]",
            "disabled:cursor-not-allowed disabled:bg-[#c9beae] disabled:shadow-[0_4px_0_#ab9f8d]",
          )}
        >
          ➤
        </button>
      </div>

      <div className="mt-2 text-center font-mono text-[10px] font-bold text-ink-mute">
        💡 Stuck?{" "}
        <button type="button" onClick={onPeek} className="cursor-pointer text-rosy-deep">
          Reveal the Brilliant line
        </button>{" "}
        · locked
      </div>
      </div>
    </div>
  );
}
