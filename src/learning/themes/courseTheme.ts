// Course visual themes — the presentation skin a course may opt into (colour, type, icons), never its content.
//
// A theme changes how the Reader DRAWS a course's pages: a colour per booklet group (the manifest's batches), a heading
// typeface and an icon + colour per printed box label. It never touches a block, a word, an order or a page: the book
// stays exactly the printed book the students annotate (enforced for 791381s by its book lock,
// src/learning/content/791381s/bookLock.test.ts). A course with no entry here renders exactly as before.
//
// Everything here is pure data and pure functions: the Reader turns the result into `data-*` attributes and one icon per
// callout; the colours live in the theme's stylesheet (src/learning/themes/booklet-theme.css), scoped to those attributes.

import type { CalloutKind, LearningCourseManifest } from "../content/types";

/** The skins that exist. A content string never names a component or a stylesheet: only these ids reach the DOM. */
export type CourseThemeId = "booklet";

/** The colour families a page can carry (one per booklet group); anything else falls back to "base". */
export const THEME_TONES = ["base", "intro", "b1", "b2", "b3", "b4", "b5", "b6", "summary"] as const;
export type ThemeTone = (typeof THEME_TONES)[number];

/** Which course wears which skin. 791381 (the full book) keeps the established Reader look. */
const COURSE_THEMES: Readonly<Record<string, CourseThemeId>> = {
  "791381s": "booklet",
};

/** The theme a page is drawn with: the skin and the colour of the group its module belongs to. */
export type PageTheme = { id: CourseThemeId; tone: ThemeTone };

export function courseThemeId(courseId: string): CourseThemeId | null {
  return Object.prototype.hasOwnProperty.call(COURSE_THEMES, courseId) ? COURSE_THEMES[courseId] : null;
}

/**
 * The page theme for a module of a themed course: the manifest batch that holds the module names the tone (when that
 * batch id is a known tone), else "base". Null for an unthemed course, so its DOM stays byte-identical to before.
 */
export function pageThemeFor(courseId: string, manifest: Pick<LearningCourseManifest, "batches"> | null | undefined, moduleId: string | undefined): PageTheme | null {
  const id = courseThemeId(courseId);
  if (!id) return null;
  const batch = moduleId ? manifest?.batches?.find(b => b.moduleIds.includes(moduleId)) : undefined;
  const tone = batch && (THEME_TONES as readonly string[]).includes(batch.id) ? (batch.id as ThemeTone) : "base";
  return { id, tone };
}

/**
 * The visual family of a printed box label. The booklet prints its own labels («تذكّر», «انتبه», «مثال», «الفكرة» …);
 * each family gets one icon and one colour so the student recognises the box before reading it.
 */
export const CALLOUT_TONES = ["remember", "warning", "example", "idea", "rule", "note", "mistake", "analogy", "prevention", "benefit", "why", "exam"] as const;
export type CalloutTone = (typeof CALLOUT_TONES)[number];

/** Arabic label normalisation: drop diacritics/tatweel and punctuation, unify alef / yaa / taa-marbuta forms, collapse spaces. */
function normaliseLabel(label: string): string {
  return label
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
    .replace(/[!؟?.:·،,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Ordered rules over the NORMALISED label: the first match wins. Each rule names whole printed labels or a label's
// leading word, never a page.
const LABEL_RULES: ReadonlyArray<{ tone: CalloutTone; test: (l: string) => boolean }> = [
  { tone: "exam", test: l => l.includes("امتحان") || l === "للطالب" || l === "الاهم للطالب" },
  { tone: "mistake", test: l => l === "خطا شائع" || l.startsWith("مشكله") },
  { tone: "warning", test: l => l === "انتبه" || l === "احذر" || l === "تحذير" || l.startsWith("اشاره تحذير") },
  { tone: "example", test: l => l.startsWith("مثال") },
  { tone: "why", test: l => l.startsWith("لماذا") || l.startsWith("متي ") || l.startsWith("كيف ") },
  { tone: "remember", test: l => l === "تذكر" || l === "احفظ" || l.includes("الحفظ") || l.includes("للحفظ") },
  { tone: "idea", test: l => l === "الفكره" },
  { tone: "analogy", test: l => l === "تشبيه" },
  { tone: "rule", test: l => l === "قاعده" || l === "القاعده" || l === "شرط اساسي" || l === "التعيين" },
  { tone: "prevention", test: l => l === "الوقايه" },
  { tone: "benefit", test: l => l === "الفائده" },
  { tone: "note", test: l => l === "لاحظ" || l === "ملاحظه" || l === "تاكد" || l === "النتيجه" || l === "الخلاصه" },
];

/** The family a callout's KIND falls back to when its printed label is not one of the known labels. */
const KIND_FALLBACK: Readonly<Record<CalloutKind, CalloutTone>> = {
  remember: "remember", warning: "warning", tip: "example", important: "exam", summary: "note", clarification: "note",
};

/** The visual family for a callout: by its printed label when recognised, else by its kind. Pure and total. */
export function calloutTone(title: string | undefined, kind: CalloutKind): CalloutTone {
  if (title) {
    const l = normaliseLabel(title);
    for (const rule of LABEL_RULES) if (rule.test(l)) return rule.tone;
  }
  return KIND_FALLBACK[kind];
}
