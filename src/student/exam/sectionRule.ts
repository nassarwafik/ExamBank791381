// The student-facing wording of a structured section's grading rule. Pure and React-free so the long-form
// StructuredExamSection (teacher preview) and the paged ExamSectionContext (UX-7b-2) show the exact same text.
import type { NormalizedSection } from "../../examStructure";

export function sectionRuleLine(section: NormalizedSection): string {
  if (section.gradingPolicy === "capScore") return "أجب عمّا تشاء من الأسئلة — تُحتسب العلامات حتى الحد الأقصى" + (section.maxMarks != null ? " (" + section.maxMarks + " علامة)" : "");
  if (section.gradingPolicy === "firstNAnswered" && section.requiredAnswers != null) return "أجب عن " + section.requiredAnswers + " " + (section.answerUnit === "part" ? "بنود" : "أسئلة") + " فقط — سيتم تصحيح أول " + section.requiredAnswers + " مجاب عنها";
  return "";
}
