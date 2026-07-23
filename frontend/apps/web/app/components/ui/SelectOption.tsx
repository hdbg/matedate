import { cn } from "@/app/lib/utils";

interface SelectOptionProps {
  icon: string;
  title: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}

/** Selectable list row (the `.opt` pattern) used by both quiz steps. */
export function SelectOption({ icon, title, description, selected, onSelect }: SelectOptionProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center gap-3.5 rounded-2xl border-2 px-[18px] py-4 text-left",
        "cursor-pointer text-[16px] font-semibold shadow-[0_2px_6px_rgba(39,35,32,0.07)]",
        "transition-[border-color,background,transform] duration-150 hover:-translate-y-px",
        selected ? "border-rosy bg-rosy-tint" : "border-transparent bg-white",
      )}
    >
      <span className="w-[26px] flex-shrink-0 text-center text-[22px]">{icon}</span>
      <span className="flex-1">
        {title}
        <span className="mt-px block text-[13px] font-normal text-ink-mute">{description}</span>
      </span>
      <span
        className={cn(
          "grid h-6 w-6 flex-shrink-0 place-items-center rounded-full border-2 text-[14px] text-white transition-[background,border-color] duration-150",
          selected ? "border-rosy bg-rosy" : "border-ink/20",
        )}
      >
        ✓
      </span>
    </button>
  );
}
