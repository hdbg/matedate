import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/app/lib/utils";

export type ButtonVariant = "primary" | "ink" | "ghost" | "oauth" | "link";

const BASE =
  "font-sans font-bold cursor-pointer transition-[transform,box-shadow,background] duration-150 disabled:cursor-not-allowed";

const PILL =
  "w-full flex items-center justify-center gap-2.5 rounded-full px-6 py-4 text-[17px]";

/** Shared class string for a variant, so <Link> can share button styling. */
export function buttonClass(variant: ButtonVariant = "primary"): string {
  switch (variant) {
    case "primary":
      return cn(
        BASE,
        PILL,
        "bg-rosy text-white shadow-[0_6px_0_var(--rosy-deep)]",
        "hover:bg-rosy-deep active:translate-y-[3px] active:shadow-[0_3px_0_var(--rosy-deep)]",
        "disabled:bg-[#c9beae] disabled:shadow-[0_6px_0_#ab9f8d]",
      );
    case "ink":
      return cn(BASE, PILL, "bg-ink text-king hover:bg-black");
    case "ghost":
      return cn(
        BASE,
        PILL,
        "bg-transparent border-2 border-ink/20 hover:border-current",
      );
    case "oauth":
      return cn(
        BASE,
        PILL,
        "bg-white text-ink text-[16px] border border-ink/10 shadow-[0_2px_8px_rgba(39,35,32,0.1)] hover:bg-[#faf6ee]",
      );
    case "link":
      return cn(
        BASE,
        "w-full text-center px-3 py-3 mt-1.5 text-[15px] font-normal text-ink-mute",
      );
  }
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ variant = "primary", className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonClass(variant), className)} {...props} />;
}
