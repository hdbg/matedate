import { Button } from "@/app/components/ui/Button";
import {
  TIME_CONTROL_SECONDS,
  type TimeControl,
} from "@/app/lib/game/service";
import { cn } from "@/app/lib/utils";

interface TimeControlOption {
  value: TimeControl;
  icon: string;
  name: string;
  description: string;
}

const OPTIONS: TimeControlOption[] = [
  { value: "bullet", icon: "⚡", name: "Bullet", description: "Fast hands, sharp instincts" },
  { value: "rapid", icon: "🎯", name: "Rapid", description: "Room to craft a line" },
  { value: "classical", icon: "🧠", name: "Classical", description: "Think it all the way through" },
];

interface TimeControlSheetProps {
  open: boolean;
  chosen: TimeControl;
  onPick: (tc: TimeControl) => void;
  onClose: () => void;
  onFind: () => void;
}

export function TimeControlSheet({ open, chosen, onPick, onClose, onFind }: TimeControlSheetProps) {
  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className={cn(
        "absolute inset-0 z-30 flex items-end bg-ink/50 backdrop-blur-[3px] transition-opacity duration-[280ms] lg:items-center lg:justify-center lg:p-6",
        open ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      {/* Bottom sheet on mobile; centered modal card on desktop. */}
      <div
        className={cn(
          "w-full rounded-t-[28px] bg-paper px-[22px] pb-[26px] pt-2.5 shadow-[0_-14px_40px_rgba(39,35,32,0.28)]",
          "transition-[transform,opacity] duration-[340ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
          "lg:max-w-md lg:rounded-[28px] lg:pt-6 lg:shadow-[0_24px_60px_rgba(39,35,32,0.3)]",
          open
            ? "translate-y-0 opacity-100 lg:scale-100"
            : "translate-y-full opacity-0 lg:translate-y-0 lg:scale-95",
        )}
      >
        <div className="mx-auto mb-3.5 h-[5px] w-[42px] rounded-full bg-ink/[0.18] lg:hidden" />
        <h3 className="mb-[3px] text-[22px] font-extrabold tracking-[-0.03em]">Choose your clock</h3>
        <p className="mb-4 text-[14px] text-ink-soft">
          You&apos;ll be paired with someone on the same time control — same persona, same clock.
          Flag on time = you lose.
        </p>

        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onPick(opt.value)}
            className={cn(
              "mb-[11px] flex w-full items-center gap-[15px] rounded-[18px] border-2 bg-white px-4 py-[15px] text-left shadow-[0_3px_10px_rgba(39,35,32,0.06)] transition-[border-color,background,transform] duration-150 hover:-translate-y-0.5",
              chosen === opt.value ? "border-rosy bg-rosy-tint" : "border-transparent",
            )}
          >
            <div className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-[14px] bg-cream-2 text-[24px]">
              {opt.icon}
            </div>
            <div className="flex-1">
              <div className="text-[17px] font-bold">{opt.name}</div>
              <div className="mt-px text-[13px] text-ink-mute">{opt.description}</div>
            </div>
            <div className="flex-shrink-0 font-mono text-[16px] font-bold text-rosy-deep">
              {TIME_CONTROL_SECONDS[opt.value]}s
            </div>
          </button>
        ))}

        <Button className="mt-1.5" onClick={onFind}>
          Find a match →
        </Button>
      </div>
    </div>
  );
}
