/**
 * Featured "Solo vs. the AI date" promo card with the hero scene bleeding off
 * the corner. Dark surface, rosy CTA.
 */
export function FeaturedCard({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="relative w-full overflow-hidden rounded-3xl bg-ink px-5 pb-[18px] pt-5 text-left text-king shadow-[0_14px_30px_rgba(39,35,32,0.28)] transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 disabled:pointer-events-none disabled:opacity-55"
    >
      <div className="absolute -bottom-3.5 -right-1.5 flex items-end gap-0.5 opacity-90">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/black-queen.svg"
          alt=""
          aria-hidden
          className="h-24 [filter:drop-shadow(1px_0_0_rgba(241,232,217,0.4))_drop-shadow(-1px_0_0_rgba(241,232,217,0.4))_drop-shadow(0_1px_0_rgba(241,232,217,0.4))_drop-shadow(0_-1px_0_rgba(241,232,217,0.4))]"
        />
        <div className="relative">
          <span className="absolute left-[64%] -top-0.5 text-[34px] font-extrabold tracking-[-0.04em] text-rosy [text-shadow:0_0_20px_rgba(214,83,106,0.55)]">
            !!
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/white-king.svg"
            alt=""
            aria-hidden
            className="h-[110px] origin-bottom rotate-[11deg]"
          />
        </div>
      </div>

      <span className="inline-flex items-center gap-1.5 rounded-full bg-rosy px-[11px] py-[5px] font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-white">
        ● Default · always instant
      </span>
      <h2 className="mb-1.5 mt-3 max-w-[62%] text-[26px] font-extrabold leading-[1.05] tracking-[-0.03em]">
        Solo vs. the AI date
      </h2>
      <p className="mb-4 max-w-[60%] text-[14px] leading-[1.4] text-[#cfc6b6]">
        Flirt with an AI persona. Get graded move by move.
      </p>
      <span className="inline-flex items-center gap-2 rounded-full bg-rosy px-5 py-[11px] text-[15px] font-bold text-white shadow-[0_5px_0_var(--rosy-deep)]">
        Play now →
      </span>
    </button>
  );
}
