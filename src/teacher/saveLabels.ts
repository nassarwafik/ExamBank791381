// Phase 21E.2 (F) — the ONE authority for teacher-facing save / finalize vocabulary (21E.0 audit T-4). Each entry names an
// operation with a DIFFERENT consequence; two buttons share a label only when they do the same thing. Never relabel an
// approval as an ordinary save (or the reverse): the teacher must be able to tell from the button alone whether the action
// only stores work or also makes it final / visible to students.
//
// A guard (src/teacher/saveLabels.guard.21e2.test.ts) refuses the listed literals anywhere else in teacher UI source.
export const SAVE_LABELS = {
  /** Stores the current exam as a draft; nothing becomes final or visible to students. */
  saveDraft: "حفظ مسودة",
  /** Legacy flat exam editor: stores the exam (it has no draft / final states). */
  saveExam: "حفظ الامتحان",
  /** Stores edits to an existing record (student details, a bank question, settings); no approval implied. */
  saveChanges: "حفظ التغييرات",
  /** Finalizes the exam: runs the finalization decision and marks it final (structured builder). */
  finalizeExam: "اعتماد نهائي",
  /** Stores the teacher's grading decisions on an attempt AND finalizes the grade when nothing is left for review. */
  saveGradingDecision: "حفظ واعتماد التصحيح",
  /** Stores a deadline / attempt-time extension for one student. */
  saveExtension: "حفظ التمديد",
  /** Stores a reopen for one student. */
  saveReopen: "حفظ إعادة الفتح",
  /** Progress text while any of the above is in flight. */
  saving: "جارٍ الحفظ…"
} as const;

export type SaveLabelKey = keyof typeof SAVE_LABELS;
