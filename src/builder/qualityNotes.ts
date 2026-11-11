// Phase 21W — the composer's 21Q quality checks, offered in the Structured Exam Builder for ANY exam (written by hand or generated):
// answer leaked in the stem, the correct option always the longest / always in the same position, true/false imbalance, near-duplicate
// stems, marks concentrated on one question. ADVISORY ONLY: these notes never join the structural issues — they change no error or
// warning count, no save, no finalization and no announcement; they only point at a question. Pure (no React).
import type { StructuredExam } from "../examTypes";
import { qualityWarnings } from "../aiComposer/composerQuality";

export type QualityNote = { key: string; code: string; message: string; questionId: string | null; number: number | null };

/** The exam's quality notes in exam order (by the question's running number; exam-level notes last), identical notes once. */
export function editorQualityNotes(exam: StructuredExam): QualityNote[] {
  const numberOf = new Map<string, number>();
  let n = 0;
  for (const s of exam.sections || []) for (const q of s.questions || []) if (!numberOf.has(q.examQuestionId)) numberOf.set(q.examQuestionId, ++n);
  if (n === 0) return [];
  const seen = new Set<string>();
  const notes: QualityNote[] = [];
  for (const w of qualityWarnings(exam)) {
    const qid = w.questionId && numberOf.has(w.questionId) ? w.questionId : null;   // an id the exam does not hold is never invented
    const key = w.code + "|" + (qid ?? "") + "|" + w.message;
    if (seen.has(key)) continue;
    seen.add(key);
    notes.push({ key, code: w.code, message: w.message, questionId: qid, number: qid ? numberOf.get(qid)! : null });
  }
  return notes.sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity));
}
