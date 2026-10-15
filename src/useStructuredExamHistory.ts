// Phase 13A — the React binding of the pure history authority (examHistory.ts) for the state owner (App.tsx).
// One ExamHistory replaces the bare `StructuredExam | null` state; every transition is a functional setState over the
// LATEST history, so late async updaters (AI image / upload / save response) are applied to the latest exam exactly
// as before (Phase 5B invariant) and can never recreate a cleared exam or leak into another one.
import { useCallback, useMemo, useState } from "react";
import type { StructuredExam } from "./examTypes";
import type { StructuredExamUpdater } from "./examBuilderState";
import {
  emptyExamHistory, openExamHistory, updateExamHistory, undoExamHistory, redoExamHistory, commitSavedExamHistory, closeTypingGroup,
  recoverExamHistory, canUndo, canRedo, isExamDirty, type ExamHistory, type EditMeta
} from "./examHistory";

export function useStructuredExamHistory() {
  const [history, setHistory] = useState<ExamHistory>(emptyExamHistory);
  const open = useCallback((exam: StructuredExam, source: "saved" | "unsaved" = "saved", serverEtag?: string | null) => setHistory(openExamHistory(exam, source, serverEtag)), []);
  const clear = useCallback(() => setHistory(emptyExamHistory()), []);
  // Phase 21F.1 — `meta.typing` marks a keyboard-typed edit (coalesced with the previous keystroke in the same field).
  const update = useCallback((updater: StructuredExamUpdater, meta?: EditMeta) => { const m = meta?.typing ? { typing: true, now: Date.now() } : undefined; setHistory(h => updateExamHistory(h, updater, m)); }, []);
  const undo = useCallback(() => setHistory(h => undoExamHistory(h)), []);
  const redo = useCallback(() => setHistory(h => redoExamHistory(h)), []);
  const commitSaved = useCallback((snapshot: StructuredExam, saved: StructuredExam, serverEtag?: string | null) => setHistory(h => commitSavedExamHistory(h, snapshot, saved, serverEtag)), []);
  const recover = useCallback((backup: StructuredExam) => setHistory(h => recoverExamHistory(h, backup)), []);
  // Phase 21F.1 — a field lost focus: the next keystroke is a new undo step even within the typing window.
  const endTyping = useCallback(() => setHistory(h => closeTypingGroup(h)), []);
  return useMemo(() => ({
    history, present: history.present, canUndo: canUndo(history), canRedo: canRedo(history), dirty: isExamDirty(history),
    open, clear, update, undo, redo, commitSaved, recover, endTyping
  }), [history, open, clear, update, undo, redo, commitSaved, recover, endTyping]);
}
