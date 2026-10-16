// Phase 21F.2 — the Exam Studio's four-step workflow (الإعداد ← المحتوى ← المراجعة ← النشر).
export type StudioStepKey = "setup" | "content" | "review" | "publish";
export const STUDIO_STEPS: readonly { key: StudioStepKey; label: string }[] = [
  { key: "setup", label: "الإعداد" },
  { key: "content", label: "المحتوى" },
  { key: "review", label: "المراجعة" },
  { key: "publish", label: "النشر" }
];

// Phase 21F.4 — the inspector's tabs for the active question.
export type InspectorTab = "question" | "classify" | "media" | "advanced";
export const INSPECTOR_TABS: readonly { key: InspectorTab; label: string }[] = [
  { key: "question", label: "السؤال" }, { key: "classify", label: "التصنيف" }, { key: "media", label: "الوسائط" }, { key: "advanced", label: "متقدم" }
];
