// Shared medal system (single source of truth) — originally introduced in StudentPortal.tsx.
// Do not duplicate these thresholds/colors elsewhere; import from here instead.
export type MedalTier = "gold" | "silver" | "bronze";

export const MEDAL_COLORS: Record<MedalTier, string> = { gold: "#eab308", silver: "#94a3b8", bronze: "#c2703d" };
export const MEDAL_LABELS: Record<MedalTier, string> = { gold: "ذهبية", silver: "فضية", bronze: "برونزية" };

export function medalTier(pct: number): MedalTier | null {
  if (pct >= 90) return "gold";
  if (pct >= 80) return "silver";
  if (pct >= 70) return "bronze";
  return null;
}
