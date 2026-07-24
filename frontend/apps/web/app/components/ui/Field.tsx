import type { InputHTMLAttributes } from "react";
import { cn } from "@/app/lib/utils";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

/** Labeled text input (the `.field` pattern) used on the account step. */
export function Field({ label, className, id, ...props }: FieldProps) {
  const inputId = id ?? `field-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="mb-3">
      <label
        htmlFor={inputId}
        className="mb-1.5 block font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-ink-mute"
      >
        {label}
      </label>
      <input
        id={inputId}
        className={cn(
          "w-full rounded-[14px] border-2 border-ink/[0.14] bg-white px-4 py-[15px] text-[16px] text-ink",
          "outline-none focus:border-rosy",
          className,
        )}
        {...props}
      />
    </div>
  );
}
