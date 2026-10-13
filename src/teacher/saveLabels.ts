// Phase 21E.2 (F) — the ONE authority for teacher-facing save / finalize vocabulary (21E.0 audit T-4). Each entry names an
// operation with a DIFFERENT consequence; two buttons share a label only when they do the same thing. Never relabel an
// approval as an ordinary save (or the reverse): the teacher must be able to tell from the button alone whether the action
// only stores work or also makes it final / visible to students. RF3 I-4: the save STATUS a teacher reads next to those
// buttons («محفوظ» …) lives here too, so a status and a button never say two different things for one state.
//
// A guard (src/teacher/saveLabels.guard.21e2.test.ts) refuses the listed literals anywhere else in teacher UI source.
import type { ExamSaveState } from "../examHistory";

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
  /** Progress text while any of the above is in flight — also the save status while it runs (one string, RF3 I-4). */
  saving: "جارٍ الحفظ…",
  // Save status (RF3 I-4) — plain sentences: a status line may add a decorative glyph, hidden from assistive technology.
  /** Status: the server holds what the teacher sees. */
  saved: "محفوظ",
  /** Status: edits since the last save are not on the server yet. */
  dirty: "تغييرات غير محفوظة",
  /** Status: a recovered local copy is shown; it is not on the server yet. */
  recovered: "نسخة مسترجعة — غير محفوظة"
} as const;

export type SaveLabelKey = keyof typeof SAVE_LABELS;

/** RF3 I-4 — the sentence a save-status region says for each state (the builder's role=status): entries of the table above, the
 *  in-flight state sharing `saving` with the buttons. */
export const SAVE_STATE_LABELS = {
  saved: SAVE_LABELS.saved,
  dirty: SAVE_LABELS.dirty,
  saving: SAVE_LABELS.saving,
  recovered: SAVE_LABELS.recovered
} as const satisfies Record<ExamSaveState, string>;
