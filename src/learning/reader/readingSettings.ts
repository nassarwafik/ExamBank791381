// Phase 21E L2-C — reading comfort settings (text size, line spacing, reading theme), remembered on this device.
//
// A per-device convenience for every reader of the book (teacher preview and students alike): it changes only how the
// page READS — the Reader's own typography tokens and the reading surface's colours — never the content, the
// interactive semantics or presentation mode. Browser storage can be unavailable or hold malformed data: every access
// is guarded and anything unreadable falls back to the defaults.

export type ReadingTextSize = 1 | 2 | 3;
export type ReadingSpacing = 1 | 2 | 3;
export type ReadingTheme = "light" | "sepia";
export type ReadingSettings = { size: ReadingTextSize; spacing: ReadingSpacing; theme: ReadingTheme };

export const DEFAULT_READING_SETTINGS: ReadingSettings = { size: 2, spacing: 1, theme: "light" };

/** Body text size of each step (CSS: reader-enterprise-l2c.css sets --eb-read-fs-body to exactly these). */
export const TEXT_SIZE_PX: Record<ReadingTextSize, number> = { 1: 17, 2: 19, 3: 21 };
/** Line height of each spacing step (CSS sets --eb-read-lh to exactly these). */
export const LINE_SPACING: Record<ReadingSpacing, number> = { 1: 1.85, 2: 2.05, 3: 2.25 };

const KEY = "eb.learning.readingSettings.v1";
const isStep = (v: unknown): v is 1 | 2 | 3 => v === 1 || v === 2 || v === 3;

function storage(): Storage | null {
  try { return typeof window !== "undefined" && window.localStorage ? window.localStorage : null; } catch { return null; }
}

/** This device's settings; each unreadable field falls back to its default independently. */
export function loadReadingSettings(): ReadingSettings {
  const s = storage();
  if (!s) return DEFAULT_READING_SETTINGS;
  try {
    const raw = s.getItem(KEY);
    if (!raw) return DEFAULT_READING_SETTINGS;
    const v = JSON.parse(raw) as Partial<Record<keyof ReadingSettings, unknown>> | null;
    if (!v || typeof v !== "object") return DEFAULT_READING_SETTINGS;
    return {
      size: isStep(v.size) ? v.size : DEFAULT_READING_SETTINGS.size,
      spacing: isStep(v.spacing) ? v.spacing : DEFAULT_READING_SETTINGS.spacing,
      theme: v.theme === "sepia" || v.theme === "light" ? v.theme : DEFAULT_READING_SETTINGS.theme,
    };
  } catch { return DEFAULT_READING_SETTINGS; }
}

export function saveReadingSettings(settings: ReadingSettings): void {
  const s = storage();
  if (!s) return;
  try { s.setItem(KEY, JSON.stringify(settings)); } catch { /* storage unavailable: the choice lasts for this view */ }
}
