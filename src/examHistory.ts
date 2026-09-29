// Phase 13A — Enterprise Exam Builder reliability: the Structured Exam Builder's HISTORY + SAVED AUTHORITY.
//
// A pure, immutable module (no React, no DOM). The state owner (App.tsx) holds ONE ExamHistory instead of a bare
// StructuredExam and derives everything else from it:
//
//   present          the exam the builder edits (null = no structured exam open)
//   past / future    undo / redo stacks of PRESENT snapshots — bounded, immutable, never display numbers or DOM
//   savedCheckpoint  the exam exactly as the server last confirmed it (the payload that was ACTUALLY persisted)
//   recovered        present came from a local autosave backup and has not been saved since
//
// Invariants:
//   • Every edit is a FUNCTIONAL updater applied to the LATEST present (the Phase 5B invariant): a slow AI image /
//     upload result merges into newer edits instead of reverting them. A no-op updater (same reference or a
//     structurally equal result) creates no history entry.
//   • Undo / redo move whole snapshots between the stacks; a new edit after an undo clears the redo stack.
//   • Opening ANY exam (new, imported, legacy conversion, saved) RESETS the history completely; a cleared present is
//     never recreated by a late updater. Exam-identity guards stay in the builder's updater wrapper.
//   • Dirty = present differs STRUCTURALLY from savedCheckpoint. exam.status (draft / final) is NOT a dirty signal.
//   • A save commits the checkpoint from the SNAPSHOT that was sent: if present is still that snapshot, present
//     becomes the saved payload; otherwise newer edits are kept (reconcileSavedStructuredExam semantics) and the exam
//     stays dirty — a late save response never labels newer edits as saved and never erases them.
import type { StructuredExam } from "./examTypes";
import { reconcileSavedStructuredExam, type StructuredExamUpdater } from "./examBuilderState";

export const HISTORY_LIMIT = 100;

export type ExamHistory = {
  present: StructuredExam | null;
  past: readonly StructuredExam[];
  future: readonly StructuredExam[];
  savedCheckpoint: StructuredExam | null;
  recovered: boolean;
};

export type ExamSaveState = "saved" | "dirty" | "saving" | "recovered";

const EMPTY: ExamHistory = Object.freeze({ present: null, past: Object.freeze([]), future: Object.freeze([]), savedCheckpoint: null, recovered: false }) as ExamHistory;

/** No structured exam open. Always the same frozen object. */
export function emptyExamHistory(): ExamHistory { return EMPTY; }

/**
 * Open an exam: a COMPLETE reset of history. `source` says what the server holds: a "saved" exam (reopened from Saved
 * Exams) IS the checkpoint; an "unsaved" one (new / imported / converted from the legacy editor) has no checkpoint yet,
 * so it is dirty until its first successful save.
 */
export function openExamHistory(exam: StructuredExam, source: "saved" | "unsaved" = "saved"): ExamHistory {
  return { present: exam, past: [], future: [], savedCheckpoint: source === "saved" ? exam : null, recovered: false };
}

/** Close the structured exam. A later updater can never bring it back (see updateExamHistory). */
export function clearExamHistory(_h: ExamHistory): ExamHistory { return EMPTY; }

/** Structural equality with reference short-circuit: untouched subtrees keep their references, so this is cheap. */
export function examDeepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const y = b as unknown[];
    if (a.length !== y.length) return false;
    for (let i = 0; i < a.length; i++) if (!examDeepEqual(a[i], y[i])) return false;
    return true;
  }
  const ka = Object.keys(a as Record<string, unknown>).filter(k => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b as Record<string, unknown>).filter(k => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!examDeepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  return true;
}

/** Apply a functional updater to the LATEST present. No-op results create no entry; a null present stays null. */
export function updateExamHistory(h: ExamHistory, updater: StructuredExamUpdater): ExamHistory {
  if (!h.present) return h;
  const next = updater(h.present);
  if (next === h.present || examDeepEqual(next, h.present)) return h;
  const past = h.past.length >= HISTORY_LIMIT ? [...h.past.slice(h.past.length - HISTORY_LIMIT + 1), h.present] : [...h.past, h.present];
  return { ...h, present: next, past, future: [] };
}

export function canUndo(h: ExamHistory): boolean { return h.present !== null && h.past.length > 0; }
export function canRedo(h: ExamHistory): boolean { return h.present !== null && h.future.length > 0; }

export function undoExamHistory(h: ExamHistory): ExamHistory {
  if (!canUndo(h)) return h;
  const previous = h.past[h.past.length - 1];
  return { ...h, present: previous, past: h.past.slice(0, -1), future: [h.present as StructuredExam, ...h.future] };
}

export function redoExamHistory(h: ExamHistory): ExamHistory {
  if (!canRedo(h)) return h;
  const [next, ...rest] = h.future;
  return { ...h, present: next, past: [...h.past, h.present as StructuredExam], future: rest };
}

/**
 * A save of `snapshot` succeeded and the server now holds `saved` (the payload that was sent). The checkpoint is set
 * from that payload ONLY for the exam that is still open. Present follows reconcileSavedStructuredExam: unchanged →
 * the payload; edited meanwhile → the newer edits are kept and the exam stays dirty (status demoted to draft).
 */
export function commitSavedExamHistory(h: ExamHistory, snapshot: StructuredExam, saved: StructuredExam): ExamHistory {
  if (!h.present || h.present.examId !== saved.examId) return h;
  const present = reconcileSavedStructuredExam(h.present, snapshot, saved);
  // The snapshot that was persisted IS the saved checkpoint, wherever it sits in history. Every occurrence of that EXACT
  // reference (never a merely equal-looking state) becomes the persisted payload, so navigating back to the saved point
  // lands on what the server really holds (stamped, not dirty). Stacks keep their length: the bound is untouched.
  const stamp = (e: StructuredExam) => (e === snapshot ? saved : e);
  return { ...h, present, past: h.past.map(stamp), future: h.future.map(stamp), savedCheckpoint: saved, recovered: false };
}

/** Restore a local autosave backup of the SAME exam: present = backup (undoable back to the server copy), still dirty. */
export function recoverExamHistory(h: ExamHistory, backup: StructuredExam): ExamHistory {
  if (!h.present || h.present.examId !== backup.examId) return h;
  if (examDeepEqual(backup, h.present)) return h;
  return { ...h, present: backup, past: [...h.past, h.present], future: [], recovered: true };
}

export function isExamDirty(h: ExamHistory): boolean {
  if (!h.present) return false;
  return !examDeepEqual(h.present, h.savedCheckpoint);
}

export function examSaveState(h: ExamHistory, saving: boolean): ExamSaveState {
  if (saving) return "saving";
  if (!isExamDirty(h)) return "saved";
  return h.recovered ? "recovered" : "dirty";
}
