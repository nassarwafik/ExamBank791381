// Classes & Students — pure text helpers for the roster workspace (no React). One place for the Arabic-aware rules the
// screen relies on: digit normalization, search folding, the graduation-grade predicate, the default school year and a
// safe download file name. Unit-tested in rosterText.test.ts.

/** Arabic-Indic (٠-٩) and Extended Arabic-Indic / Persian (۰-۹) digits → ASCII. Everything else unchanged. */
export function toAsciiDigits(value: string): string {
  return String(value ?? "")
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0));
}

/** Identity-number input filter: Arabic digits typed on an Arabic keyboard count as digits; max 9. */
export function identityDigits(value: string): string {
  return toAsciiDigits(value).replace(/\D/g, "").slice(0, 9);
}

/**
 * Search folding for Arabic rosters: lower-case, diacritics (tashkeel, superscript alef) and tatweel removed, alef
 * forms (أ إ آ ٱ) → ا, ة → ه, ى → ي, ؤ → و, ئ → ي, Arabic digits → ASCII, whitespace collapsed. "احمد" finds "أحمد",
 * "فاطمه" finds "فاطمة".
 */
export function foldArabic(value: string): string {
  return toAsciiDigits(String(value ?? ""))
    .toLocaleLowerCase("ar")
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when every whitespace-separated term of `query` occurs in one of `fields` (folded). Empty query matches. */
export function matchesSearch(fields: Array<string | undefined | null>, query: string): boolean {
  const terms = foldArabic(query).split(" ").filter(Boolean);
  if (!terms.length) return true;
  const hay = foldArabic(fields.filter(Boolean).join(" "));
  return terms.every(term => hay.includes(term));
}

/**
 * Graduation eligibility from the free-text grade: 12 in ASCII or Arabic-Indic digits as its own number ("12",
 * "١٢", "12-ب"; never "112"), or the Arabic ordinal ("الثاني عشر", "ثاني عشر", "الصف الثاني عشر").
 */
export function isTwelfthGrade(grade: string): boolean {
  const text = foldArabic(grade);
  if (/(^|\D)12(\D|$)/.test(text)) return true;
  return /(^|\s)(ال)?ثاني عشر(\s|$)/.test(text);
}

/** The school year a class created on `now` most likely belongs to: from August a new year starts ("2026-2027"). */
export function defaultSchoolYear(now: Date = new Date()): string {
  const year = now.getFullYear();
  const start = now.getMonth() >= 7 ? year : year - 1;
  return start + "-" + (start + 1);
}

/** A download file name without path separators / reserved characters (the class name is teacher-typed). */
export function safeFileName(value: string, fallback: string): string {
  const printable = Array.from(String(value ?? "")).map(ch => (ch.codePointAt(0) ?? 0) < 0x20 ? " " : ch).join("");
  const cleaned = printable.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || fallback;
}

const LATIN_AR = "ar-u-nu-latn";
/**
 * A short, human last-activity label ("الآن", "قبل 5 دقائق", "أمس", "قبل 3 أيام") for the last 30 days, then a date
 * ("10‏/10‏/2026"); `full` is the exact timestamp for a tooltip. Latin digits, like the rest of the workspace.
 * An empty / invalid value yields null (the caller shows its own "never" text).
 */
export function relativeTime(value: string, now: Date = new Date()): { label: string; full: string } | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const full = date.toLocaleString(LATIN_AR, { dateStyle: "medium", timeStyle: "short" });
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return { label: "الآن", full };
  let rtf: Intl.RelativeTimeFormat | null = null;
  try { rtf = new Intl.RelativeTimeFormat(LATIN_AR, { numeric: "auto" }); } catch { rtf = null; }
  const steps: Array<[Intl.RelativeTimeFormatUnit, number, number]> = [["minute", 60, 3600], ["hour", 3600, 86400], ["day", 86400, 30 * 86400]];
  for (const [unit, size, limit] of steps) {
    if (abs < limit && rtf) return { label: rtf.format(Math.round(seconds / size), unit), full };
  }
  return { label: date.toLocaleDateString(LATIN_AR, { dateStyle: "medium" }), full };
}
