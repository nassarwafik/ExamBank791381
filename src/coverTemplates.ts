// Roadmap #16 — built-in COVER TEMPLATES. A template is nothing more than a preset of the EXISTING
// ExamCoverPage model (examCover.ts) — no new schema, no persistence, no student identity, no banner,
// no HTML / external URL. Applying one is an EXPLICIT teacher action that produces a valid, normalized
// cover while preserving the teacher's own uploaded banner by default.

import { normalizeCoverPage, type ExamCoverPage } from "./examCover";

// The preset fields a template carries — every ExamCoverPage field EXCEPT `enabled` (always true after
// apply) and `banner` (never in a template; the teacher's existing safe banner is preserved on apply).
export type CoverTemplatePreset = Omit<ExamCoverPage, "enabled" | "banner">;
export type CoverTemplate = { id: string; label: string; preset: CoverTemplatePreset };

const flags = (over: Partial<CoverTemplatePreset> = {}): Partial<CoverTemplatePreset> => ({
  showStudentName: true, showClassName: true, showExamDate: true,
  showDuration: false, showTotalMarks: true, showMarksDistribution: true, ...over
});

// A small, practical built-in set. Labels are plain Arabic display text; instructions are plain multi-line
// text (each line becomes a bullet). Nothing here identifies a specific student.
export const COVER_TEMPLATES: CoverTemplate[] = [
  {
    id: "formal-exam", label: "امتحان رسمي",
    preset: { activityType: "exam", subtitle: "امتحان",
      instructions: "اقرأ جميع الأسئلة جيدًا قبل الإجابة.\nأجب حسب التعليمات في كل قسم.\nراجع إجاباتك قبل التسليم.",
      allowedMaterials: "", ...flags() } as CoverTemplatePreset
  },
  {
    id: "short-quiz", label: "اختبار قصير",
    preset: { activityType: "exam", subtitle: "اختبار قصير",
      instructions: "أجب عن جميع الأسئلة.\nانتبه للوقت المحدد.",
      allowedMaterials: "", ...flags({ showDuration: true, showMarksDistribution: false }) } as CoverTemplatePreset
  },
  {
    id: "training", label: "تدريب",
    preset: { activityType: "training", subtitle: "نشاط تدريبي",
      instructions: "هذا النشاط للتدريب والمراجعة.\nيمكنك حل الأسئلة بالترتيب المناسب.\nراجع الإجابات قبل إنهاء التدريب.",
      allowedMaterials: "", ...flags({ showExamDate: false }) } as CoverTemplatePreset
  },
  {
    id: "open-material", label: "امتحان مع مواد مسموحة",
    preset: { activityType: "exam", subtitle: "امتحان (مواد مسموحة)",
      instructions: "يسمح باستخدام المادة/الكتاب حسب تعليمات المعلم.\nيمنع التواصل مع طلاب آخرين أثناء الحل.\nراجع إجاباتك قبل التسليم.",
      allowedMaterials: "مادة مفتوحة حسب تعليمات المعلم", ...flags() } as CoverTemplatePreset
  },
  {
    id: "simple", label: "غلاف بسيط",
    preset: { activityType: "exam", subtitle: "", instructions: "", allowedMaterials: "",
      ...flags({ showExamDate: false, showMarksDistribution: false }) } as CoverTemplatePreset
  }
];

export const findCoverTemplate = (id: string): CoverTemplate | undefined => COVER_TEMPLATES.find(t => t.id === id);

// Apply a template EXPLICITLY: build a fresh, normalized, enabled cover from the template preset while
// PRESERVING the teacher's existing safe banner by default. normalizeCoverPage guarantees a valid shape
// and drops any unsafe banner — a template can never introduce an unsafe banner or an external URL, and
// never carries student identity. The exam's questions/sections/marks/grading are untouched (this only
// returns a cover object; the caller assigns it to exam.coverPage).
export function applyCoverTemplate(current: ExamCoverPage | undefined, template: CoverTemplate): ExamCoverPage {
  const banner = current?.banner; // already-normalized safe banner (or undefined)
  return normalizeCoverPage({ ...template.preset, enabled: true, ...(banner ? { banner } : {}) }) as ExamCoverPage;
}
