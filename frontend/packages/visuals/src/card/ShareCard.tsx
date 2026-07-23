import { forwardRef, type CSSProperties } from "react";
import { Logo } from "../brand/Logo";
import { MoveIcon } from "../game/MoveIcon";
import { ARCHETYPES, type Archetype } from "../lib/archetypes";
import { SITE_DOMAIN, memeMoves, titleParts } from "../lib/cardHelpers";
import { formatSwing } from "../lib/grading";
import { stagger } from "../lib/progress";
import type { MoveClassKey, WireMove } from "../types";
import { EvalGraph } from "./EvalGraph";

/** Staggered reveal for one card section, driven by the sub-range progress `t` (0→1). Returns an
 * EMPTY style at rest (`t >= 1`) so the web app (which passes `progress={1}`) renders with no inline
 * style at all — byte-identical to a static card. A Remotion app passes a live `progress` to build
 * the card up section by section. */
function reveal(t: number): CSSProperties {
  return t >= 1 ? {} : { opacity: t, transform: `translateY(${((1 - t) * 8).toFixed(2)}px)` };
}

export interface ShareCardProps {
  accuracy: number;
  /** Sub-label under the accuracy %, e.g. "Accuracy" (solo) or "You · vs 71%" (PvP). */
  accuracySub: string;
  archetype: Archetype | null;
  /** Drives the eval graph and (via `archetype.memePositions`) the meme excerpt. */
  moves: WireMove[];
  ratingLabel: string; // "Rizz Rating" | "Ranked Elo"
  /** The post-game rating; when null, `unratedLabel` shows instead (friendly PvP). */
  ratingValue: number | null;
  ratingDelta: number;
  unratedLabel?: string;
  resultLabel: string;
  resultColor: string;
  /** True only while capturing the PNG — reveals the CTA band (image-only). */
  capturing: boolean;
  /** Class applied to the legendary title for the app's gold-sweep animation. The web app passes
   * "animate-legendary-glow" (its keyframes live in the app's CSS); the video app omits it and
   * drives the sweep via `progress`, so the package itself defines no motion. */
  legendaryTitleClassName?: string;
  /** Overall reveal progress 0→1 (SPEC card build-up for video). Defaults to 1 = fully revealed
   * static card; each section reveals over its own sub-range. */
  progress?: number;
}

/** The exportable shareable card (SPEC §9.1) — the identity + eval graph + meme excerpt + CTA.
 * Shared by the after-game modal, the PvP result modal, and the profile "Share Card" flow. The
 * archetype-loading state is handled by the caller (it swaps in the LoadingScene). */
export const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(function ShareCard(
  {
    accuracy,
    accuracySub,
    archetype,
    moves,
    ratingLabel,
    ratingValue,
    ratingDelta,
    unratedLabel,
    resultLabel,
    resultColor,
    capturing,
    legendaryTitleClassName,
    progress = 1,
  },
  ref,
) {
  const meta = archetype ? ARCHETYPES[archetype.key] : null;
  const [titleLead, titleRest] = titleParts(meta?.title ?? "MateDate");
  const meme = memeMoves(moves, archetype?.memePositions ?? null);
  const deltaColor = ratingDelta >= 0 ? "var(--m-good)" : "var(--m-blunder)";

  return (
    <div ref={ref} className="overflow-hidden rounded-[22px] bg-ink text-king shadow-[var(--sh-3)]">
      <div
        className="flex items-center justify-between px-[17px] pb-[11px] pt-[15px]"
        style={reveal(stagger(progress, 0, 0.2))}
      >
        <Logo markSize={22} wordmarkClassName="text-[18px] tracking-[-0.03em]" />
        <div className="text-right">
          <div className="text-[24px] font-extrabold leading-none tracking-[-0.03em]">
            {Math.round(accuracy)}%
          </div>
          <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-mute">
            {accuracySub}
          </div>
        </div>
      </div>

      {/* archetype identity — the postable title + flavor line. A slightly darker shade than the
          ink header/footer gives the section visual separation (the gold radial layers on top for
          legendaries). */}
      <div
        className={`relative bg-[#1f1b18] px-[17px] pb-[13px] pt-0.5 text-center ${
          meta?.legendary
            ? "[background-image:radial-gradient(120%_90%_at_50%_0%,rgba(227,178,60,.18),transparent_70%)]"
            : ""
        }`}
        style={reveal(stagger(progress, 0, 0.25))}
      >
        <div
          className={`font-mono text-[9px] uppercase ${
            meta?.legendary ? "tracking-[0.28em] text-[#f6d878]" : "tracking-[0.2em] text-ink-mute"
          }`}
        >
          {meta?.legendary ? "◆ Legendary ◆" : "Archetype"}
        </div>
        <h2
          className={`mt-1 text-[25px] font-extrabold leading-[1.02] tracking-[-0.035em] ${
            meta?.legendary
              ? `${legendaryTitleClassName ?? ""} bg-[linear-gradient(100deg,#f6d878,#e3b23c_45%,#fff_55%,#f6d878)] bg-[length:200%_auto] bg-clip-text text-transparent`
              : "text-king"
          }`}
        >
          {titleLead}
          <span className={meta?.legendary ? "" : "text-rosy"}>{titleRest}</span>
        </h2>
        {archetype?.flavor && (
          <p
            className={`mx-auto mt-1.5 max-w-[30ch] text-[11.5px] leading-[1.35] ${
              meta?.legendary ? "text-[rgba(246,216,120,0.75)]" : "text-ink-mute"
            }`}
          >
            {archetype.flavor}
          </p>
        )}
      </div>

      <div style={reveal(stagger(progress, 0.2, 0.35))}>
        <EvalGraph moves={moves} />
      </div>

      {/* meme moment — the shareable excerpt */}
      <div
        className="flex flex-col gap-2 bg-[#332e2a] px-[17px] py-[15px]"
        style={reveal(stagger(progress, 0.35, 0.3))}
      >
        {meme.map((mv) => (
          <MemeBubble key={mv.position} move={mv} />
        ))}
        <div className="mt-0.5 rounded-[12px] border-[1.5px] border-dashed border-rosy bg-rosy/[0.14] px-3 py-2.5 text-center">
          <div className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-rosy">
            🔒 Best move · unlock
          </div>
          <div className="mt-[3px] select-none text-[13px] font-bold blur-[5px]">
            audition me sunday — I&apos;m cooking shakshuka
          </div>
        </div>
      </div>

      {/* footer — rating (prev + change) + result badge */}
      <div
        className="flex items-center justify-between px-[17px] py-3"
        style={reveal(stagger(progress, 0.75, 0.25))}
      >
        <div className="flex items-baseline gap-[7px]">
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-ink-mute">
            {ratingLabel}
          </span>
          {ratingValue != null ? (
            <>
              <span className="text-[18px] font-extrabold tracking-[-0.02em]">{ratingValue}</span>
              <span className="font-mono text-[13px] font-bold" style={{ color: deltaColor }}>
                {ratingDelta >= 0 ? "▲" : "▼"}
                {Math.abs(ratingDelta)}
              </span>
            </>
          ) : (
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-mute">
              {unratedLabel}
            </span>
          )}
        </div>
        <div
          className="font-mono text-[9px] font-bold uppercase tracking-[0.12em]"
          style={{ color: resultColor }}
        >
          {resultLabel}
        </div>
      </div>

      {/* CTA band — shown only in the exported/shared image */}
      {capturing && (
        <a
          href={`https://${SITE_DOMAIN}`}
          className="flex items-center justify-center gap-[7px] bg-rosy px-[17px] py-3 font-mono text-[12px] font-bold tracking-[0.04em] text-white no-underline hover:bg-rosy-deep"
        >
          Score yours <span className="text-[14px]">→</span>{" "}
          <span className="tracking-[0.02em]">{SITE_DOMAIN}</span>
        </a>
      )}
    </div>
  );
});

function MemeBubble({ move }: { move: WireMove }) {
  if (move.side === "Match") {
    return (
      <div className="relative max-w-[80%] self-start rounded-[16px] rounded-bl-[5px] bg-[#4a443c] px-3 py-2.5 text-[13px] leading-[1.35] text-king">
        {move.content}
      </div>
    );
  }
  const cls = move.classification as MoveClassKey | null | undefined;
  return (
    <div className="relative max-w-[80%] self-end rounded-[16px] rounded-br-[5px] bg-rosy px-3 py-2.5 text-[13px] leading-[1.35] text-white">
      {move.content}
      {cls && (
        <span className="absolute right-1.5 top-[-9px] inline-flex items-center gap-[4px] rounded-full bg-white py-[2px] pl-[2px] pr-[7px] font-mono text-[10px] font-bold text-ink shadow-[var(--sh-1)]">
          <MoveIcon classKey={cls} size={15} />
          {formatSwing(move.swing ?? 0)}
        </span>
      )}
    </div>
  );
}
