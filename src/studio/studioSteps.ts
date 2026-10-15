// Phase 21F.2 — the Exam Studio's four-step workflow (الإعداد ← المحتوى ← المراجعة ← النشر).
export type StudioStepKey = "setup" | "content" | "review" | "publish";
export const STUDIO_STEPS: readonly { key: StudioStepKey; label: string }[] = [
  { key: "setup", label: "الإعداد" },
  { key: "content", label: "المحتوى" },
  { key: "review", label: "المراجعة" },
  { key: "publish", label: "النشر" }
];
