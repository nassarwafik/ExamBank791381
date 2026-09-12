// Optional structured-exam COVER page — pure, shared model + helpers (no React, no DOM).
//
// A cover is OPTIONAL and configured POST-import in the builder. It never contains student identity
// (name/class are resolved at runtime from the authenticated student / assignment), never contains
// answer keys, and never duplicates authoritative numbers: total marks and the per-section marks
// distribution are COMPUTED from the normalized exam structure using the SAME cap rule as
// computeTotalMarks / the backend grader (all → sum; capScore|firstNAnswered with a cap → cap).
//
// Banner security: only a safe embedded RASTER data: URL (png/jpeg/jpg/webp/gif) is ever accepted or
// rendered — no external URLs (no network fetch), no SVG (script), no HTML. Instructions are plain
// text, split into clean lines for safe bullet rendering (never HTML / dangerouslySetInnerHTML).

import type { NormalizedExam, NormalizedSection } from "./examStructure";

export type SafeImageAsset = { dataUrl?: string };
export type ActivityType = "exam" | "training";

export type ExamCoverPage = {
  enabled: boolean;
  banner?: SafeImageAsset;
  activityType?: ActivityType;
  subtitle?: string;
  instructions?: string;
  allowedMaterials?: string;
  showStudentName?: boolean;
  showClassName?: boolean;
  showExamDate?: boolean;
  showDuration?: boolean;
  showTotalMarks?: boolean;
  showMarksDistribution?: boolean;
};

// Only safe embedded raster images may be a renderable banner source (same policy as the importer).
export const SAFE_BANNER_DATA_URL = /^data:image\/(png|jpe?g|webp|gif)\b/i;
// ~4 MB is plenty for a wide school banner while keeping the artifact reasonable.
export const MAX_BANNER_BYTES = 4 * 1024 * 1024;

export function isSafeBannerDataUrl(url: unknown): url is string {
  return typeof url === "string" && SAFE_BANNER_DATA_URL.test(url);
}

// Approximate decoded byte length of a data: URL's payload (base64 → *3/4).
export function dataUrlByteLength(url: string): number {
  const comma = url.indexOf(",");
  const payload = comma >= 0 ? url.slice(comma + 1) : url;
  const isB64 = /;base64,/i.test(url.slice(0, comma + 8));
  return isB64 ? Math.floor(payload.length * 3 / 4) : payload.length;
}

export type BannerValidation = { ok: true; dataUrl: string } | { ok: false; reason: string };

// Validate an uploaded banner data URL: safe raster type AND within the size limit.
export function validateBannerDataUrl(url: string): BannerValidation {
  if (!isSafeBannerDataUrl(url)) return { ok: false, reason: "صيغة الصورة غير مدعومة — استخدم PNG أو JPG أو WebP." };
  if (dataUrlByteLength(url) > MAX_BANNER_BYTES) return { ok: false, reason: "حجم البانر كبير جدًّا (الحد الأقصى ~4 ميغابايت)." };
  return { ok: true, dataUrl: url };
}

const boolOr = (v: unknown, d: boolean): boolean => (typeof v === "boolean" ? v : d);
const strOrUndef = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

// Normalize a possibly-partial / foreign coverPage into a well-formed one. Returns undefined when there
// is no cover object at all, so an exam without a cover stays exactly as before. An unsafe banner is
// dropped (not rendered, not persisted). Display flags default to sensible "on" values; showDuration
// defaults off (there is no authoritative duration field to source it from today).
export function normalizeCoverPage(raw: unknown): ExamCoverPage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const bannerUrl = (r.banner && typeof r.banner === "object" ? (r.banner as Record<string, unknown>).dataUrl : undefined);
  const banner = isSafeBannerDataUrl(bannerUrl) ? { dataUrl: bannerUrl } : undefined;
  const activityType: ActivityType | undefined = r.activityType === "training" ? "training" : r.activityType === "exam" ? "exam" : undefined;
  return {
    enabled: boolOr(r.enabled, false),
    ...(banner ? { banner } : {}),
    activityType,
    subtitle: strOrUndef(r.subtitle),
    instructions: strOrUndef(r.instructions),
    allowedMaterials: strOrUndef(r.allowedMaterials),
    showStudentName: boolOr(r.showStudentName, true),
    showClassName: boolOr(r.showClassName, true),
    showExamDate: boolOr(r.showExamDate, true),
    showDuration: boolOr(r.showDuration, false),
    showTotalMarks: boolOr(r.showTotalMarks, true),
    showMarksDistribution: boolOr(r.showMarksDistribution, true)
  };
}

// A fresh default cover the builder enables when the teacher turns the panel on.
export function defaultCoverPage(activityType: ActivityType = "exam"): ExamCoverPage {
  return {
    enabled: true, activityType,
    showStudentName: true, showClassName: true, showExamDate: true,
    showDuration: false, showTotalMarks: true, showMarksDistribution: true
  };
}

// ── marks (computed, never hand-entered) ─────────────────────────────────────
// Displayed maximum for ONE section — identical rule to computeTotalMarks / the backend grader.
export function sectionMaxMarks(s: NormalizedSection): number {
  const sum = (s.questions || []).reduce((a, q) => a + (Number((q as { marks?: unknown }).marks) || 0), 0);
  const capped = s.gradingPolicy !== "all" && s.maxMarks != null;
  return capped ? Number(s.maxMarks) || 0 : sum;
}

export type MarksDistribution = { rows: { title: string; marks: number }[]; total: number };

// Per-section distribution + total, derived from the normalized exam so it always reflects the REAL
// current structure and updates automatically when marks change in the builder.
export function examMarksDistribution(norm: NormalizedExam): MarksDistribution {
  const rows = norm.sections.map((s, i) => ({ title: s.title || ("القسم " + (i + 1)), marks: sectionMaxMarks(s) }));
  return { rows, total: rows.reduce((a, r) => a + r.marks, 0) };
}

// Teacher instructions → clean, non-empty lines for safe bullet rendering (plain text only).
export function instructionLines(text: string | undefined | null): string[] {
  return String(text ?? "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
}

// Activity-type wording helpers (exam vs training) — the ONLY thing activityType changes.
export const activityStartLabel = (t: ActivityType | undefined): string => (t === "training" ? "ابدأ التدريب" : "ابدأ الامتحان");
export const activityInstructionsTitle = (t: ActivityType | undefined): string => (t === "training" ? "تعليمات التدريب" : "تعليمات الامتحان");

// Keep ONLY safe, known cover fields for the student payload (drops any teacher-only/foreign keys and an
// unsafe banner). Defense-in-depth companion to the server sanitizer; contains no answer keys ever.
export function sanitizeCoverForStudent(raw: unknown): ExamCoverPage | undefined {
  const c = normalizeCoverPage(raw);
  return c;
}
