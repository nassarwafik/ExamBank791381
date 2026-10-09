// Phase 21A.1 — the ExamBank-owned chart THEME: a bounded set of semantic palettes (the spec only names one — never a colour), the animation
// policy and the live design tokens a renderer needs. Pure apart from the optional token read (guarded; tests run without a DOM).
import type { ChartAnimation, ChartPalette } from "./chartSpec";

/** Series colours per semantic palette. Every entry has at least 4.7:1 contrast against white (WCAG 1.4.11 needs 3:1 for graphics). */
export const CHART_PALETTE_COLORS: Readonly<Record<ChartPalette, readonly string[]>> = Object.freeze({
  categorical: Object.freeze(["#2563EB", "#C2410C", "#047857", "#B91C1C", "#6D28D9", "#0E7490", "#BE185D", "#4D7C0F"]),
  sequential: Object.freeze(["#1E3A8A", "#1D4ED8", "#2563EB", "#3B6FD4", "#0369A1", "#0E7490", "#155E75", "#164E63"]),
  diverging: Object.freeze(["#1D4ED8", "#0E7490", "#64748B", "#B45309", "#B91C1C", "#7C3AED", "#047857", "#9D174D"]),
  neutral: Object.freeze(["#1E293B", "#475569", "#64748B", "#334155", "#0F172A", "#52525B", "#57534E", "#3F3F46"])
});
/** Heatmap colour scale (low → high). Cell values are always available in the data table and the tooltip, never by colour alone. */
export const CHART_HEAT_SCALE: readonly string[] = Object.freeze(["#DBEAFE", "#93C5FD", "#3B82F6", "#1D4ED8", "#1E3A8A"]);
/** The selected-target emphasis colour (focus ring and selected marks). */
export const CHART_SELECTED_COLOR = "#F59E0B";

/** Contrast ratio of two #RRGGBB colours (WCAG relative luminance). */
export function contrastRatio(a: string, b: string): number {
  const lum = (h: string) => {
    const n = h.replace("#", "");
    const [r, g, bl] = [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** The heat-scale colour at position t ∈ [0, 1] — the engine's continuous visual map interpolates the scale linearly in RGB the same way. */
export function heatColorAt(t: number): string {
  const s = CHART_HEAT_SCALE, x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * (s.length - 1);
  const i = Math.min(s.length - 2, Math.floor(x)), f = x - i;
  const rgb = (h: string) => [1, 3, 5].map(k => parseInt(h.slice(k, k + 2), 16));
  const [a, b] = [rgb(s[i]), rgb(s[i + 1])];
  return "#" + a.map((v, k) => Math.round(v + (b[k] - v) * f).toString(16).padStart(2, "0")).join("").toUpperCase();
}
const LABEL_DARK = "#0F172A", LABEL_LIGHT = "#FFFFFF";
/** A value label drawn on a coloured cell: the label colour with the better contrast against the cell, and — where neither reaches 4.5:1 (the
 *  middle of the blue scale) — a halo in the opposite colour, so the text always sits on a background it contrasts with (≥ 4.5:1). */
export function labelOn(background: string): { color: string; halo?: string } {
  const dark = contrastRatio(LABEL_DARK, background), light = contrastRatio(LABEL_LIGHT, background);
  const color = dark >= light ? LABEL_DARK : LABEL_LIGHT;
  return Math.max(dark, light) >= 4.5 ? { color } : { color, halo: color === LABEL_DARK ? LABEL_LIGHT : LABEL_DARK };
}

/** The ExamBank animation policy → concrete timings. `none` disables animation entirely. */
export const ANIMATION_TIMINGS: Readonly<Record<ChartAnimation, { duration: number; update: number } | null>> = Object.freeze({
  none: null, subtle: Object.freeze({ duration: 350, update: 200 }), normal: Object.freeze({ duration: 800, update: 300 })
});
/** The effective policy: the spec's (default `subtle` — formal exams), downgraded to `none` for reduced motion and print, and allowed to
 *  become `normal` only where the host asks for it (teacher preview / practice) and the spec did not say `none`. */
export function effectiveAnimation(spec: ChartAnimation | undefined, env: { reducedMotion: boolean; print: boolean; preview?: boolean }): ChartAnimation {
  if (env.reducedMotion || env.print) return "none";
  const base = spec ?? "subtle";
  if (base === "none") return "none";
  return env.preview ? "normal" : base;
}

export type ChartTokens = { text: string; muted: string; grid: string; surface: string; font: string };
const FALLBACK_TOKENS: ChartTokens = { text: "#334155", muted: "#64748b", grid: "#e2e8f0", surface: "#ffffff", font: '"IBM Plex Sans Arabic", "Segoe UI", Tahoma, Arial, sans-serif' };
/** Live design tokens from the element (charts need resolved strings: SVG presentation attributes cannot read CSS variables). */
export function readChartTokens(el?: Element | null): ChartTokens {
  if (!el || typeof getComputedStyle !== "function") return { ...FALLBACK_TOKENS };
  try {
    const cs = getComputedStyle(el);
    const v = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;
    return { text: v("--eb-text", FALLBACK_TOKENS.text), muted: v("--eb-muted", FALLBACK_TOKENS.muted), grid: v("--eb-line", FALLBACK_TOKENS.grid), surface: v("--eb-surface", FALLBACK_TOKENS.surface), font: v("--eb-font", FALLBACK_TOKENS.font) };
  } catch { return { ...FALLBACK_TOKENS }; }
}
export const defaultChartTokens = (): ChartTokens => ({ ...FALLBACK_TOKENS });
