// Phase 20G — CORE ENTERPRISE CERTIFICATION: the expected SCORE LEDGER. A persona's ledger states, per question, the automatic score and the
// marks still pending a teacher ([auto, pending]) and, per composite, the same per part — derived BY HAND from the key, weights and marks
// (never by calling the grader). These helpers read the stored attempt (the production grader's output) into the same shape and check the
// structural equalities every attempt must satisfy whatever the persona: Σ question scores (section-capped) = attempt score, Σ section maxima
// = attempt total = Σ official question maxima, pending = Σ pending, finalized ⇔ pending = 0, and every score within [0, max].
const r2 = n => Math.round(n * 100) / 100;

/** pending marks of ONE stored question grade: composite → Σ counted parts still in manual review; otherwise its counted max when in review. */
export function pendingOf(g) {
  if (!g.manualReview) return 0;
  if (Array.isArray(g.parts) && g.composite) return r2(g.parts.filter(p => p.counted && p.manualReview).reduce((n, p) => n + p.countedMaxMarks, 0));
  return r2(g.countedMaxMarks);
}
export function ledgerOf(attempt) {
  const q = {}, parts = {};
  for (const g of attempt.questionGrades || []) {
    q[g.questionId] = [r2(g.score), pendingOf(g)];
    if (Array.isArray(g.parts) && g.composite) parts[g.questionId] = Object.fromEntries(g.parts.map(p => [p.partId, [r2(p.score), p.counted && p.manualReview ? r2(p.countedMaxMarks) : 0]]));
  }
  return { questions: q, parts };
}
/** The invariants of ANY graded attempt (returns a list of violations; [] = consistent). */
export function attemptInvariants(attempt, officialTotal) {
  const v = [];
  const grades = attempt.questionGrades || [];
  if (r2(attempt.totalMarks) !== r2(officialTotal)) v.push("totalMarks " + attempt.totalMarks + " ≠ official " + officialTotal);
  const secMax = (attempt.sections || []).reduce((n, s) => n + s.maxMarks, 0);
  if (r2(secMax) !== r2(attempt.totalMarks)) v.push("Σ section max " + secMax + " ≠ total " + attempt.totalMarks);
  if (attempt.score < -1e-9 || attempt.score > attempt.totalMarks + 1e-9) v.push("score " + attempt.score + " outside [0, " + attempt.totalMarks + "]");
  for (const s of attempt.sections || []) if (s.score > s.maxMarks + 1e-9) v.push("section " + s.id + " score " + s.score + " > max " + s.maxMarks);
  for (const g of grades) {
    if (g.score < -1e-9 || g.score > g.maxMarks + 1e-9) v.push(g.questionId + " score " + g.score + " outside [0, " + g.maxMarks + "]");
    if (Array.isArray(g.parts) && g.composite) {
      const counted = g.parts.filter(p => p.counted);
      for (const p of g.parts) if (p.score > p.maxMarks + 1e-9 || (!p.counted && p.score !== 0)) v.push(g.questionId + "::" + p.partId + " score " + p.score);
      const groupSum = g.composite.groups.reduce((n, gr) => n + Math.min(gr.partIds.reduce((m, id) => m + (g.parts.find(p => p.partId === id)?.score || 0), 0), gr.maxMarks), 0);
      if (Math.abs(groupSum - g.score) > 0.011) v.push(g.questionId + " composite Σ groups " + groupSum + " ≠ " + g.score);
      if (counted.length === 0 && g.score !== 0) v.push(g.questionId + " composite scored with nothing counted");
    }
  }
  const pending = grades.reduce((n, g) => n + pendingOf(g), 0);
  if (Math.abs(pending - attempt.manualReviewMarks) > 0.011) v.push("Σ pending " + pending + " ≠ manualReviewMarks " + attempt.manualReviewMarks);
  if ((attempt.manualReviewMarks === 0) !== (attempt.finalized === true)) v.push("finalized " + attempt.finalized + " with pending " + attempt.manualReviewMarks);
  if (attempt.totalMarks > 0 && Math.abs(attempt.percentage - r2(attempt.score / attempt.totalMarks * 100)) > 0.011) v.push("percentage " + attempt.percentage);
  return v;
}
export { r2 };
