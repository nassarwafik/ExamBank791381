// Learning Materials — SVG VISUAL ENRICHMENT (pilot, Chapter 1).
//
// The runtime contract for a `visual` block's renderer. Mirrors the activity-engine discipline WITHOUT its weight:
// content supplies only a registry KEY (a plain string `visualId`), never a component, path or code, and a renderer
// is reached ONLY through the statically-authored allowlist in `registry.ts` (no eval, no dynamic import of a
// content string). A visual is a lightweight, purely-presentational SVG illustration — it holds NO book wording of
// its own beyond the short generic labels it draws, performs ZERO network/persistence, and takes NO student PII.
//
// Reduced motion is a first-class prop: every registered visual MUST render a correct STILL frame when
// `reducedMotion` is true (the CSS also disables animation under prefers-reduced-motion as defense-in-depth).

import type { ComponentType, LazyExoticComponent } from "react";

/** Props every registered visual SVG component receives. All presentational; no data flows back out. */
export interface LearningVisualProps {
  /** Accessible name for the whole illustration; the component sets it on the root <svg role="img">. */
  ariaLabel: string;
  /** Reduced-motion contract: true ⇒ render a still, non-animated frame (no CSS animation class, no <animate>). */
  reducedMotion: boolean;
  /** Optional extra class on the root <svg> (the view passes the shared figure class). */
  className?: string;
}

export type LearningVisualComponent = ComponentType<LearningVisualProps>;
/** The module shape of a registered visual file (a default-exported component). */
export type LearningVisualModule = { default: LearningVisualComponent };

/** One trusted, registered SVG illustration. Authored in this repo and registered by data — never named by content. */
export interface RegisteredVisual {
  /** The registry key content matches against (`VisualBlock.visualId`). */
  id: string;
  /** The trusted repo component as a LAZY chunk (Phase 8E-6): rendered inside the figure's local Suspense boundary. */
  component: LazyExoticComponent<LearningVisualComponent>;
  /** The same trusted loader (literal repo path + one-shot stale-chunk recovery) for tests/guards that need the raw
   *  component; production renders `component`. Never derived from content. */
  load: () => Promise<LearningVisualModule>;
  /** Whether this visual animates (documentation/guards only; motion still respects reduced-motion at runtime). */
  motion: boolean;
}
