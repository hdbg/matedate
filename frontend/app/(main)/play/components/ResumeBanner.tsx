/**
 * Shown at the top of the Play screen while the user has an unfinished game (from `useLiveGame`).
 * The backend keeps that game active and resumes it on reconnect, so this offers a one-tap way back
 * in — and the mode buttons below are disabled while it's up, so a second game can't be started.
 */
export function ResumeBanner({
  personaName,
  onResume,
}: {
  personaName: string | null;
  onResume: () => void;
}) {
  return (
    <div className="mb-4 flex items-center gap-4 rounded-[20px] border border-rosy/30 bg-rosy-tint px-4 py-3.5 shadow-[0_6px_18px_rgba(184,50,76,0.12)]">
      <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-[14px] bg-rosy text-[22px] text-white">
        ♟
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-bold tracking-[-0.01em] text-ink">
          You have a game in progress
        </div>
        <div className="mt-0.5 truncate text-[13px] text-rosy-deep">
          {personaName ? `vs. ${personaName} — finish the date to play again` : "Finish it to play again"}
        </div>
      </div>
      <button
        type="button"
        onClick={onResume}
        className="flex-shrink-0 cursor-pointer rounded-full bg-rosy px-[18px] py-[10px] text-[14px] font-bold text-white shadow-[0_4px_0_var(--rosy-deep)] transition hover:bg-rosy-deep active:translate-y-[2px] active:shadow-[0_2px_0_var(--rosy-deep)]"
      >
        Resume →
      </button>
    </div>
  );
}
