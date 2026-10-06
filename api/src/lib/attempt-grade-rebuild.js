// Phase 17C — the ONE canonical attempt-score rebuild. Extracted verbatim from assignment-review.js (Phase 2 manual review) so
// that EVERY authority that changes a completed attempt's question grades — the teacher's manual review and the automatic coding
// grading callback — recomputes the official totals with the same algorithm (no second total-score implementation; parity-tested
// against the original in api/tests/coding-guards-17c.test.js).
//   • a teacher manual override always wins over the stored (automatic or manual-review) base grade, clamped to the EFFECTIVE
//     (counted) max, so a firstN-excluded answer can never be awarded marks;
//   • section-cap-aware totals (capScore / firstNAnswered) when the attempt was graded structured; legacy flat sum otherwise;
//   • manualReviewMarks = the counted marks of questions still awaiting review; finalized = nothing left to review.
const { sectionCappedScore, effectiveMaxMarks } = require("./exam-structure");
// Phase 20D — a composite@1 grade is rebuilt FROM ITS PARTS: each part keeps its stored base (automatic, coding callback, or manual-review
// hold) unless a per-part teacher override exists under the child key <questionId>::part::<partId> (clamped to the part's COUNTED max, so an
// ignored first-N part can never earn marks); the parent = Σ_groups min(Σ counted part scores, group official max) clamped to its counted
// max, pending = the exact counted marks of parts still awaiting review. A whole-question override (manualOverrides[questionId]) still wins
// over everything. Every non-composite grade takes the original path below, byte-for-byte.
const { compositeChildKey } = require("./shared-finalization/compositeModel");

function round(n) { return Number(Number(n || 0).toFixed(2)); }
function clamp(v, min, max) { return Math.min(max, Math.max(min, Number(v) || 0)); }
const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const validOverride = o => !!o && o.score !== undefined && o.score !== null;
function rebuildCompositeGrade(g, id, overrides, topIds) {
  const cap = effectiveMaxMarks(g);
  const parts = g.parts.map(p => {
    if (!isObj(p)) return p;
    // 20D RF1 — a child key that is ALSO a top-level question id of this attempt is ambiguous: that override belongs to the top-level
    // question (legacy path), never to the part (the part stays as graded / pending — fail closed, never a borrowed score).
    const ck = compositeChildKey(id, String(p.partId));
    const o = topIds.has(ck) ? undefined : overrides[ck], pcap = effectiveMaxMarks(p);
    if (validOverride(o)) { const s = clamp(o.score, 0, pcap); return { ...p, score: round(s), manualScore: round(s), manualReview: false, reviewed: true, teacherComment: String(o.comment || "") }; }
    return { ...p, reviewed: !p.manualReview };
  });
  const byId = new Map(parts.filter(isObj).map(p => [String(p.partId), p]));
  let sum = 0, pending = 0, allCorrect = true;
  for (const grp of g.composite.groups) {
    let gs = 0;
    for (const pid of Array.isArray(grp.partIds) ? grp.partIds : []) {
      const p = byId.get(String(pid));
      if (!p || !(effectiveMaxMarks(p) > 0)) continue;                                              // ignored / unanswered first-N: no slot
      gs += Number(p.score) || 0;
      if (p.manualReview) pending += effectiveMaxMarks(p);
      if (!(p.correct === true && !p.manualReview && (Number(p.score) || 0) >= effectiveMaxMarks(p) - 1e-9)) allCorrect = false;
    }
    sum += Math.min(gs, Number(grp.maxMarks) || 0);
  }
  if (!(cap > 0)) { sum = 0; pending = 0; }                                                          // an ignored composite counts nothing
  const score = clamp(sum, 0, cap);
  return { grade: { ...g, parts, score: round(score), manualReview: pending > 0, reviewed: pending === 0, correct: cap > 0 && allCorrect && pending === 0 && score >= cap - 1e-9 }, score, pending };
}

/** Mutates and returns `attempt` with its questionGrades / score / manualReviewMarks / totalMarks / percentage / finalized rebuilt. */
function rebuildAttemptGrades(attempt) {
  const grades = Array.isArray(attempt.questionGrades) ? attempt.questionGrades : [], overrides = attempt.manualOverrides && typeof attempt.manualOverrides === "object" ? attempt.manualOverrides : {};
  let remaining = 0; const scoreById = new Map();
  const topIds = new Set(grades.filter(isObj).map(g => String(g.questionId || "")));
  attempt.questionGrades = grades.map(g => {
    const id = String(g.questionId || ""), o = overrides[id], cap = effectiveMaxMarks(g);
    if (isObj(g) && isObj(g.composite) && Array.isArray(g.composite.groups) && Array.isArray(g.parts)) {
      const c = rebuildCompositeGrade(g, id, overrides, topIds);
      if (o && o.score !== undefined && o.score !== null) { const s = clamp(o.score, 0, cap); scoreById.set(id, s); return { ...c.grade, score: round(s), manualScore: round(s), manualReview: false, reviewed: true, teacherComment: String(o.comment || "") }; }
      scoreById.set(id, c.score); remaining += c.pending; return c.grade;
    }
    if (o && o.score !== undefined && o.score !== null) { const s = clamp(o.score, 0, cap); scoreById.set(id, s); return { ...g, score: round(s), manualScore: round(s), manualReview: false, reviewed: true, teacherComment: String(o.comment || "") }; }
    const s = Number(g.score || 0); scoreById.set(id, s); if (g.manualReview) remaining += cap; return { ...g, reviewed: !g.manualReview };
  });
  let score; const sections = Array.isArray(attempt.sections) ? attempt.sections : null;
  if (sections && sections.length) { score = sectionCappedScore(sections, id => scoreById.get(id) || 0); }
  else { score = 0; for (const s of scoreById.values()) score += s; }
  attempt.score = round(score); attempt.manualReviewMarks = round(remaining); attempt.totalMarks = round(attempt.totalMarks); attempt.percentage = attempt.totalMarks ? round(attempt.score / attempt.totalMarks * 100) : 0; attempt.finalized = remaining === 0;
  return attempt;
}

module.exports = { rebuildAttemptGrades, round, clamp };
