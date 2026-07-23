/**
 * @matedate/visuals — branded, composed visuals shared by the web app and the Remotion video app.
 *
 * Depends on @matedate/icons + its own theme tokens. Owns the grading vocabulary, archetype/tier
 * logic, the card-data shapes, the theme, and (from step 5) the Logo/Wordmark/MoveIcon/ShareCard
 * tree. Still pure presentational — same Remotion constraints as icons: no `next/*`, no `remotion`,
 * no `'use client'`, no CSS transitions/animations, no browser globals; all motion is driven by a
 * single `progress` prop.
 */
export * from "./types";
export * from "./lib/grading";
export * from "./lib/archetypes";
export * from "./lib/tiers";
export * from "./lib/cardHelpers";
export * from "./lib/cardData";
