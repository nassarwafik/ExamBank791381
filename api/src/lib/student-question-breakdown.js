// D4 (item 7) — the student's per-question mark breakdown. Before D4 a student saw only the total and the teacher's general feedback:
// which questions lost marks, which await the teacher and what the teacher wrote on a question never reached them, although the
// attempt stores all of it (questionGrades).
//
// Owner decision: marks and the teacher's comment ONLY — never the correct answer, the student's answer, a model answer, a rubric, an
// expected output, a hidden-test detail or any part structure. The projection is an explicit ALLOWLIST built field by field from the
// stored grade (nothing is spread), so a field added to the grade later can never leak through here.
//
// Gating (by the caller, student-submission pub()): only inside a RELEASED result (results release, Phase 21G.5 — before release the
// whole result is withheld), and never while official coding grading can still change a mark (the score itself is withheld then).
//
// Status of one question:
//   pending     the teacher has not marked it yet (manual review, a render-failure hold, a compile error awaiting review)
//   notCounted  outside the section's counted answers ("answer N of M" sections) — it never affects the score
//   full / partial / zero   by the earned mark against the question's maximum
const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const num = v => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; };
const MAX_COMMENT = 1000;

function statusOf(g) {
  if (g.ignored === true) return "notCounted";
  if (g.manualReview === true || isObj(g.technicalFailure) && g.reviewed !== true) return "pending";
  const score = num(g.score), max = num(g.maxMarks);
  if (max > 0 && score >= max) return "full";
  if (score > 0) return "partial";
  return "zero";
}

/** PURE: the student-safe breakdown of one attempt → { sections: [...], questions: [...] } or null when there is nothing to show. */
function questionBreakdown(attempt) {
  const grades = attempt && Array.isArray(attempt.questionGrades) ? attempt.questionGrades.filter(isObj) : [];
  if (!grades.length) return null;
  const questions = grades.map((g, i) => {
    const status = statusOf(g);
    const item = { number: Number.isInteger(g.questionNumber) && g.questionNumber > 0 ? g.questionNumber : i + 1, sectionId: typeof g.sectionId === "string" ? g.sectionId.slice(0, 120) : "", status, maxMarks: num(g.maxMarks) };
    if (status !== "pending") item.score = num(g.score);
    const comment = typeof g.teacherComment === "string" ? g.teacherComment.trim().slice(0, MAX_COMMENT) : "";
    if (comment) item.comment = comment;
    return item;
  });
  const sections = (attempt && Array.isArray(attempt.sections) ? attempt.sections.filter(isObj) : []).map(s => ({
    id: typeof s.id === "string" ? s.id.slice(0, 120) : "",
    title: typeof s.title === "string" ? s.title.slice(0, 200) : "",
    // a capped section's total is not the sum of its questions; the stored section score is not recomputed after a review, so
    // only the fact is shown (the attempt total stays the one authority)
    capped: s.gradingPolicy === "capScore" || s.gradingPolicy === "firstNAnswered"
  }));
  return { sections, questions };
}

module.exports = { questionBreakdown, statusOf };
