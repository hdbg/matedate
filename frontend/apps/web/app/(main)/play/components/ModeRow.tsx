import type { ReactNode } from "react";
import { cn } from "@/app/lib/utils";

interface ModeRowProps {
  icon: string;
  iconClassName: string;
  name: string;
  badge?: ReactNode;
  description: string;
  /** Right-aligned meta (e.g. tier / count) shown instead of the chevron. */
  meta?: { value: string; label: string };
  onClick: () => void;
  disabled?: boolean;
}

export function ModeRow({
  icon,
  iconClassName,
  name,
  badge,
  description,
  meta,
  onClick,
  disabled,
}: ModeRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-[15px] rounded-[20px] border border-ink/[0.07] bg-white p-4 text-left shadow-[0_3px_10px_rgba(39,35,32,0.06)] transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-[0_10px_22px_rgba(39,35,32,0.12)] active:translate-y-0 disabled:pointer-events-none disabled:opacity-55"
    >
      <div className={cn("grid h-[52px] w-[52px] flex-shrink-0 place-items-center rounded-[15px] text-[25px]", iconClassName)}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[17px] font-bold tracking-[-0.01em]">{name}</span>
          {badge}
        </div>
        <div className="mt-0.5 text-[13px] leading-[1.35] text-ink-mute">{description}</div>
      </div>
      {meta ? (
        <div className="flex-shrink-0 text-right font-mono text-[12px] font-bold text-ink-mute">
          {meta.value}
          <small className="block text-[9px] uppercase tracking-[0.08em]">{meta.label}</small>
        </div>
      ) : (
        <div className="flex-shrink-0 text-[22px] text-ink-mute">›</div>
      )}
    </button>
  );
}

/** Small classification-style pill used as a mode badge. */
export function ModeBadge({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-[3px] font-mono text-[9px] font-bold uppercase tracking-[0.06em]",
        className,
      )}
    >
      {children}
    </span>
  );
}
