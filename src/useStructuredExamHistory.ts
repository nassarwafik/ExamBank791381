// Phase 13A — the React binding of the pure history authority (examHistory.ts) for the state owner (App.tsx).
// One ExamHistory replaces the bare `StructuredExam | null` state; every transition is a functional setState over the
// LATEST history, so late async updaters (AI image / upload / save response) are applied to the latest exam exactly
// as before (Phase 5B invariant) and can never recreate a cleared exam or leak into another one.
import { useCallback, useMemo, useState } from "react";
import type { StructuredExam } from "./examTypes";
import type { StructuredExamUpdater } from "./examBuilderState";
import {
  emptyExamHistory, openExamHistory, updateExamHistory, undoExamHistory, redoExamHistory, commitSavedExamHistory,
  recoverExamHistory, canUndo, canRedo, isExamDirty, type ExamHistory
} from "./examHistory";

export function useStructuredExamHistory() {
  const [history, setHistory] = useState<ExamHistory>(emptyExamHistory);
  const open = useCallback((exam: StructuredExam, source: "saved" | "unsaved" = "saved") => setHistory(openExamHistory(exam, source)), []);
  const clear = useCallback(() => setHistory(emptyExamHistory()), []);
  const update = useCallback((updater: StructuredExamUpdater) => setHistory(h => updateExamHistory(h, updater)), []);
  const undo = useCallback(() => setHistory(h => undoExamHistory(h)), []);
  const redo = useCallback(() => setHistory(h => redoExamHistory(h)), []);
  const commitSaved = useCallback((snapshot: StructuredExam, saved: StructuredExam) => setHistory(h => commitSavedExamHistory(h, snapshot, saved)), []);
  const recover = useCallback((backup: StructuredExam) => setHistory(h => recoverExamHistory(h, backup)), []);
  return useMemo(() => ({
    history, present: history.present, canUndo: canUndo(history), canRedo: canRedo(history), dirty: isExamDirty(history),
    open, clear, update, undo, redo, commitSaved, recover
  }), [history, open, clear, update, undo, redo, commitSaved, recover]);
}
