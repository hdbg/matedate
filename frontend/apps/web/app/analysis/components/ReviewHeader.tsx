interface ReviewHeaderProps {
  title: string;
  dateISO: string;
  personaName: string | null;
  youEval: number; // final interest split, for the "71–29" result
  endReason: string | null;
  onBack: () => void;
  onShare: () => void;
}

const RESULT_WORD: Record<string, string> = {
  scored: "wrapped",
  blocked: "blocked",
  timeout: "flagged",
  resignation: "left",
  date_landed: "landed",
};

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));
  } catch {
    return "";
  }
}

/** Review header: back · eyebrow/title/opponent · share. */
export function ReviewHeader({
  title,
  dateISO,
  personaName,
  youEval,
  endReason,
  onBack,
  onShare,
}: ReviewHeaderProps) {
  const split = `${Math.round(youEval)}–${100 - Math.round(youEval)}`;
  const word = endReason ? (RESULT_WORD[endReason] ?? endReason) : null;
  const opp = [personaName ? `vs ${personaName}` : "Solo game", word ? `${word} ${split}` : split]
    .filter(Boolean)
    .join(" · ");

  return (
    <header className="flex flex-shrink-0 items-center gap-3 border-b border-ink/[0.08] px-4 py-3 lg:px-7 lg:py-5">
      <button
        type="button"
        title="Back"
        onClick={onBack}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-[24px] leading-none text-ink opacity-70 hover:bg-ink/[0.06] hover:opacity-100"
      >
        ‹
      </button>
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-rosy-deep lg:text-[11px]">
          Game Review · {formatDate(dateISO)}
        </div>
        <h1 className="truncate text-[19px] font-extrabold leading-[1.05] tracking-[-0.03em] lg:text-[23px]">
          {title}
        </h1>
        <div className="mt-0.5 truncate font-mono text-[11px] font-bold text-ink-mute">{opp}</div>
      </div>
      <button
        type="button"
        title="Share"
        onClick={onShare}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-[22px] leading-none text-ink opacity-70 hover:bg-ink/[0.06] hover:opacity-100"
      >
        ↗
      </button>
    </header>
  );
}
