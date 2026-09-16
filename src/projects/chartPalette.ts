// Teacher project charts — ONE contained palette derived from the ExamBank design tokens. Chart.js needs
// resolved colour strings (it cannot read `var(--eb-*)`), so each entry is read from the live token on
// :root when available and otherwise falls back to the token's documented value (design-tokens.css).
// Presentation only: it never changes datasets, and status colours keep their semantic distinction.
import type { StageStatus } from "./types";

const FALLBACK: Record<string, string> = {
  "--eb-primary": "#2563eb",
  "--eb-primary-strong": "#1d4ed8",
  "--eb-info": "#0284c7",
  "--eb-success": "#16a34a",
  "--eb-warn": "#d97706",
  "--eb-danger": "#dc2626",
  "--eb-line-2": "#dce2ec",
  "--eb-faint": "#94a3b8",
  "--eb-muted": "#64748b"
};

export function tokenColor(name: string): string {
  if (typeof document !== "undefined" && typeof getComputedStyle === "function") {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
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
  /** Series colours cycled by track index (stable per track position). */
  series: string[];
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
    series: [withAlpha(primary, 0.85), withAlpha(info, 0.85), withAlpha(warn, 0.85), withAlpha(success, 0.85)],
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
