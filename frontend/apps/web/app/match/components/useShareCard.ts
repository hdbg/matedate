"use client";

import { useCallback, useRef, useState } from "react";
import { toPng } from "html-to-image";

/**
 * Shared share-card export for the after-game / PvP result modals. Renders the card node
 * (`cardRef`) to a PNG and hands it to the share sheet (or downloads it), with a text fallback.
 *
 * `capturing` is true only while the PNG is being rendered — the CTA band keys off it so
 * "Score yours → …" appears in the exported image but not in the on-screen modal. `exporting`
 * drives the button's busy state. Uses html-to-image because Tailwind v4 emits color-mix()/oklch,
 * which the html2canvas family can't parse.
 */
export function useShareCard(buildText: () => string) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const shareText = useCallback((text: string) => {
    if (typeof navigator !== "undefined" && navigator.share) {
      void navigator.share({ title: "MateDate", text }).catch(() => {});
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(text).catch(() => {});
    }
  }, []);

  const share = useCallback(async () => {
    const node = cardRef.current;
    const text = buildText();
    if (!node || exporting) {
      shareText(text);
      return;
    }
    setExporting(true);
    // Reveal the CTA band (image-only) and wait a frame so it paints before the capture.
    setCapturing(true);
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    try {
      // Safari can paint the first pass before fonts/images are inlined — render twice, keep the
      // second. Square the card's outer corners for the capture (`style.borderRadius`) so the PNG
      // is a full-bleed card with no transparent corner triangles (those render as white in most
      // viewers, which reads as a "white background" on the rounded corners). Do NOT pass
      // `backgroundColor` — html-to-image applies it to the root node, which would override the
      // card's own `bg-ink` and blank the whole background to white.
      const opts = {
        pixelRatio: 2,
        cacheBust: true,
        style: { borderRadius: "0px" },
      };
      await toPng(node, opts);
      const dataUrl = await toPng(node, opts);
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], "matedate-result.png", { type: "image/png" });
      if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: "MateDate", text, files: [file] });
      } else {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = "matedate-result.png";
        a.click();
      }
    } catch (err) {
      // A dismissed share sheet isn't a failure; anything else falls back to sharing text.
      if (!(err instanceof DOMException && err.name === "AbortError")) shareText(text);
    } finally {
      setCapturing(false);
      setExporting(false);
    }
  }, [buildText, exporting, shareText]);

  return { cardRef, exporting, capturing, share };
}
