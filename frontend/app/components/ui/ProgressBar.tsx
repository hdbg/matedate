interface ProgressBarProps {
  /** Completion fraction, 0–1. */
  value: number;
}

/** Thin top progress bar shown during the onboarding quiz flow. */
export function ProgressBar({ value }: ProgressBarProps) {
  return (
    <div className="mx-[26px] h-1 flex-shrink-0 overflow-hidden rounded-full bg-ink/12">
      <span
        className="block h-full rounded-full bg-rosy transition-[width] duration-[450ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
      />
    </div>
  );
}
