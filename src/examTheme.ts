// Presentation-only exam themes. A theme controls ONLY how an exam is laid out for the student -
// it never touches question content, order, marks, answers, or grading. Kept as its own tiny,
// dependency-free module (no React import) so both StudentExamPage.tsx (the real student view)
// and ExamThemePreview.tsx (the teacher-facing real preview) can share the exact same helpers.

export type ExamTheme = "default" | "cards" | "classic" | "focus" | "compact" | "modern";

export const EXAM_THEMES: ExamTheme[] = ["default", "cards", "classic", "focus", "compact", "modern"];

export const THEME_LABELS: Record<ExamTheme, { name: string; description: string }> = {
  default: { name: "الافتراضي", description: "الشكل الحالي للامتحان" },
  cards: { name: "بطاقات", description: "كل سؤال يظهر داخل بطاقة مستقلة" },
  classic: { name: "ورقة امتحان", description: "شكل قريب من الامتحان الورقي التقليدي" },
  focus: { name: "تركيز", description: "سؤال واحد فقط في كل مرة" },
  compact: { name: "مدمج", description: "مساحات أقل، رؤية أسئلة أكثر" },
  modern: { name: "حديث", description: "واجهة عصرية ومريحة" }
};

// undefined/null/any invalid value -> "default", so legacy exams with no stored theme (and any
// exam whose stored value somehow isn't one of the six known themes) render exactly as before.
export function normalizeExamTheme(value: unknown): ExamTheme {
  return typeof value === "string" && (EXAM_THEMES as string[]).includes(value)
    ? (value as ExamTheme)
    : "default";
}

export function clampFocusIndex(index: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.min(Math.max(index, 0), total - 1);
}

export function nextFocusIndex(current: number, total: number): number {
  return clampFocusIndex(current + 1, total);
}

export function previousFocusIndex(current: number, total: number): number {
  return clampFocusIndex(current - 1, total);
}

export function focusProgressPercent(index: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.round(((clampFocusIndex(index, total) + 1) / total) * 100);
}
