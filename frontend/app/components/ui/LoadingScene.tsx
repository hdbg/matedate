/**
 * Full-screen "Analyzing your moves" loader — the queen looming over a shaking king with a
 * bursting "!!", ported from mocks/MateDate Loading.html. Shown while the after-game flow awaits
 * its analysis row over realtime. Decorative SVGs use plain <img> (see HeroScene).
 */
export function LoadingScene({ status = "Analyzing your moves" }: { status?: string }) {
  return (
    <div
      role="status"
      aria-label={status}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-ink"
    >
      <div className="flex aspect-square w-[min(88vmin,560px)] flex-col items-center justify-center gap-[clamp(20px,5vmin,44px)]">
        <div className="relative flex h-[56%] w-full items-end justify-center gap-[clamp(4px,1.5vmin,14px)]">
          <div className="absolute bottom-0 left-1/2 h-[26px] w-[70%] -translate-x-1/2 animate-floor-pulse rounded-[50%] [background:radial-gradient(ellipse_at_center,rgba(214,83,106,0.28),rgba(214,83,106,0)_70%)]" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/black-queen.svg"
            alt=""
            aria-hidden
            className="block h-[clamp(120px,30vmin,205px)] w-auto origin-bottom animate-queen-loom [filter:drop-shadow(1px_0_0_rgba(241,232,217,0.5))_drop-shadow(-1px_0_0_rgba(241,232,217,0.5))_drop-shadow(0_1px_0_rgba(241,232,217,0.5))_drop-shadow(0_-1px_0_rgba(241,232,217,0.5))]"
          />
          <div className="relative flex origin-bottom items-end animate-king-bob">
            <span className="absolute -right-[14%] -top-[2%] origin-bottom-left animate-bang-burst text-[clamp(28px,8vmin,62px)] font-extrabold leading-[0.8] tracking-[-0.04em] text-rosy [text-shadow:0_0_22px_rgba(214,83,106,0.55)]">
              !!
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/white-king.svg"
              alt=""
              aria-hidden
              className="block h-[clamp(135px,34vmin,230px)] w-auto origin-bottom animate-king-shake"
            />
          </div>
        </div>

        <div className="text-[clamp(34px,9vmin,62px)] font-extrabold leading-none tracking-[-0.035em]">
          <span className="text-king">Mate</span>
          <span className="text-rosy">Date</span>
        </div>

        <div className="flex items-center gap-[0.5em] font-mono text-[clamp(12px,2.6vmin,15px)] font-bold uppercase tracking-[0.14em] text-ink-mute">
          <span>{status}</span>
          <span className="inline-flex gap-[0.28em]">
            <i className="inline-block h-[0.42em] w-[0.42em] animate-loading-dot rounded-full bg-rosy" />
            <i className="inline-block h-[0.42em] w-[0.42em] animate-loading-dot rounded-full bg-rosy [animation-delay:0.16s]" />
            <i className="inline-block h-[0.42em] w-[0.42em] animate-loading-dot rounded-full bg-rosy [animation-delay:0.32s]" />
          </span>
        </div>
      </div>
    </div>
  );
}
