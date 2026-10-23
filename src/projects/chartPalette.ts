// Teacher project charts — ONE contained palette derived from the ExamBank design tokens. Chart.js needs
// resolved colour strings (it cannot read `var(--eb-*)`), so each entry is read from the live token on
// :root when available and otherwise falls back to the token's documented value (design-tokens.css; kept equal by
// chartPalette.tokenMirror.ux-r1.test.ts).
// Presentation only: it never changes datasets, and status colours keep their semantic distinction.
import type { StageStatus } from "./types";
import { resolveThemeColor } from "../ui/themeColor";

const FALLBACK: Record<string, string> = {
  "--eb-primary": "#2a0a4e",
  "--eb-primary-strong": "#4a2380",
  "--eb-primary-300": "#8b74b8",
  "--eb-info": "#0284c7",
  "--eb-success": "#16a34a",
  "--eb-warn": "#d97706",
  "--eb-danger": "#dc2626",
  "--eb-line-2": "#dedce6",
  "--eb-faint": "#a9a5b4",
  "--eb-muted": "#5f5a6e"
};

export function tokenColor(name: string): string {
  if (typeof document !== "undefined" && typeof getComputedStyle === "function") {
    try {
      // UX-R18a — a colour token is light-dark(<light>, <dark>): resolve the half the page shows
      const v = resolveThemeColor(getComputedStyle(document.documentElement).getPropertyValue(name).trim());
      if (v) return v;
    } catch { /* fall back below */ }
  }
  return FALLBACK[name] || "#000000";
}

// Hex → rgba with alpha (tokens are 6-digit hex; anything else is returned unchanged).
export function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export type ChartPalette = {
  /** Series colours cycled by track index (stable per track position). UX-R3: the deep purple, then its lavender step, then the
   *  warn and success hues — the redesign palette first, distinct hues after it. */
  series: string[];
  /** UX-R3 — a three-step judgement scale for value bars (below 60 · 60–79 · 80+), from the semantic tokens. */
  scale: { low: string; mid: string; high: string };
  primary: string;
  primarySoft: string;
  grid: string;
  status: Record<StageStatus, string>;
};

export function chartPalette(): ChartPalette {
  const primary = tokenColor("--eb-primary");
  const info = tokenColor("--eb-info");
  const warn = tokenColor("--eb-warn");
  const success = tokenColor("--eb-success");
  return {
    series: [withAlpha(primary, 0.85), withAlpha(tokenColor("--eb-primary-300"), 0.9), withAlpha(warn, 0.85), withAlpha(success, 0.85)],
    scale: { low: withAlpha(tokenColor("--eb-danger"), 0.76), mid: withAlpha(warn, 0.76), high: withAlpha(success, 0.76) },
    primary,
    primarySoft: withAlpha(primary, 0.14),
    grid: withAlpha(tokenColor("--eb-faint"), 0.25),
    status: {
      approved: success,
      ready_for_review: info,
      in_progress: warn,
      not_started: tokenColor("--eb-line-2")
    }
  };
}
