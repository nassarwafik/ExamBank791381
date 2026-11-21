// Phase T12 — one line telling the teacher, anywhere in the builder, what the student will find in the exam's tool bar. It reads the
// SAME canonical spec the panel edits (validateStudentTools) and names the tools with the start screen's own names; nothing is decided
// here (presentation only: the server validates the spec on save).

import { validateStudentTools } from "./studentToolsSpec";
import { studentToolsSummary } from "./studentToolsCatalog";

export type StudentToolsBuilderSummary = {
  state: "none" | "on" | "invalid";
  /** The number of tools the student can open. */
  count: number;
  text: string;
};

export function studentToolsBuilderSummary(value: unknown): StudentToolsBuilderSummary {
  if (value === undefined || value === null) return { state: "none", count: 0, text: "لا توجد أدوات للطالب في هذا الامتحان." };
  const parsed = validateStudentTools(value);
  if (!parsed.ok) return { state: "invalid", count: 0, text: "إعدادات أدوات الطالب غير صالحة؛ صحّحها من لوحة «أدوات الطالب»." };
  const names = studentToolsSummary(parsed.value);
  if (!names.length) return { state: "none", count: 0, text: "لا توجد أدوات للطالب في هذا الامتحان." };
  const limited = parsed.value.sectionOverrides && Object.keys(parsed.value.sectionOverrides).length ? " (بعضها مغلق في أقسام محددة)" : "";
  return { state: "on", count: names.length, text: "يجد الطالب: " + names.join("، ") + limited + "." };
}
