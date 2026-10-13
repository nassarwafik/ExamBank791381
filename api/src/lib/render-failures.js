// Phase 21E.3 — assessment integrity when a question renderer cannot recover on the student's device.
//
// The student client REPORTS (never decides): `renderFailures: [{ questionId, code }]` rides on saveDraft / pauseAttempt (kept
// with the draft as `draftRenderFailures`) and on submit (the client's current knowledge). The API owns the grading decision:
//
//   1. the report is UNTRUSTED input — normalizeRenderFailures keeps only entries that name a question of the PUBLISHED exam
//      with a registered technical code, one per question, bounded; anything else is dropped (nothing malformed is ever stored);
//   2. applyRenderFailureHolds verifies each surviving report against the graded attempt: ONLY a question with NO admitted
//      answer (the student could not answer what they could not see) whose marks would otherwise count is HELD — score 0,
//      manualReview true, the exact mechanism a compile error (17F-C2) or a key-less table already uses — so the attempt stays
//      pendingReview and never publishes an automatic zero; an answered question is graded exactly as before (the report is
//      recorded as `held: false`, information for the teacher only);
//   3. a report can only move a grade TOWARD the teacher: it never awards marks, never changes another question, never raises
//      a score. The worst a forged report can do is route a blank to the teacher, who sees the reason and decides.
//
// Legacy attempts (no `renderFailures`) and clients that never send the field are byte-for-byte unchanged.
const { flattenQuestions, normalizeExamStructure, sectionQuestionId, isAdmittedAnswered, selectGradedUnits, effectiveMaxMarks } = require("./exam-structure");
const { rebuildAttemptGrades, round } = require("./attempt-grade-rebuild");

const RENDER_FAILURE_CODES = new Set(["chunk-load", "runtime"]);
const ID_LIMIT = 256;
const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);
const setOwn = (o, k, v) => Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });

/** normalizeRenderFailures(raw, exam) → [{ questionId, code }] — only questions of the published exam, registered codes, one per question
 *  (the first valid entry wins), in the exam's own order. A missing / malformed field or exam yields [] (nothing stored). */
function normalizeRenderFailures(raw, exam) {
  if (!Array.isArray(raw) || !raw.length || !exam || typeof exam !== "object") return [];
  let known;
  try { known = new Map(flattenQuestions(exam).map((x, i) => [String(x.questionId), i])); } catch { return []; }
  const seen = new Map();
  for (const e of raw) {
    if (!isObj(e) || typeof e.questionId !== "string" || !e.questionId || e.questionId.length > ID_LIMIT || FORBIDDEN.has(e.questionId)) continue;
    if (typeof e.code !== "string" || !RENDER_FAILURE_CODES.has(e.code)) continue;
    if (!known.has(e.questionId) || seen.has(e.questionId)) continue;
    seen.set(e.questionId, { questionId: e.questionId, code: e.code });
    if (seen.size >= known.size) break;
  }
  return [...seen.values()].sort((a, b) => known.get(a.questionId) - known.get(b.questionId));
}

/** The draft record as stored with a draft (an empty report clears it). */
function draftRenderFailuresPatch(doc, failures) {
  if (failures.length) doc.draftRenderFailures = failures; else delete doc.draftRenderFailures;
}

// A question in a firstNAnswered section is held only while the quota is NOT met: with N counted answers already in the section the
// unseen question could not have changed the score (excess answers are ignored by design), so there is nothing for a teacher to award.
// Review Fix 4 (P2): the open slots are CONSUMED by the holds themselves — at most (requiredAnswers − counted) reported questions are held,
// in exam order — so a report can never inflate a section's maximum beyond the slots the student could have filled.
function quotaOpen(norm, questionId, answers, slots) {
  for (const section of norm.sections) {
    const ids = section.questions.map((q, i) => sectionQuestionId(section, q, i));
    if (!ids.includes(questionId)) continue;
    if (section.gradingPolicy !== "firstNAnswered" || section.requiredAnswers == null) return true;
    const key = String(section.id);
    if (!slots.has(key)) slots.set(key, Math.max(0, Number(section.requiredAnswers) - selectGradedUnits(section, answers).countedKeys.size));
    const open = slots.get(key);
    if (!(open > 0)) return false;
    slots.set(key, open - 1);
    return true;
  }
  return false;
}
function holdGrade(g, code) {
  g.score = 0; g.correct = false; g.manualReview = true; g.ignored = false;
  if (!(effectiveMaxMarks(g) > 0)) g.countedMaxMarks = round(g.maxMarks);
  if (Array.isArray(g.parts)) g.parts = g.parts.map(p => {
    if (!isObj(p)) return p;
    const next = { ...p, score: 0, correct: false, manualReview: true };
    if (p.counted !== undefined) { next.counted = true; next.ignored = false; }
    if (p.countedMaxMarks !== undefined && !(Number(p.countedMaxMarks) > 0)) next.countedMaxMarks = round(p.maxMarks);
    return next;
  });
  g.technicalFailure = { code, reason: "renderFailure" };
}

/**
 * applyRenderFailureHolds(grade, failures, answers, exam) — mutates the gradeExam() result in place (questions, sections, totals) and
 * returns the attempt-level record `{ [questionId]: { code, held, reportedAt } }` (null when nothing was reported). `failures` must
 * come from normalizeRenderFailures (the same published exam) and `answers` from normalizeDraftAnswers (the graded map).
 */
function applyRenderFailureHolds(grade, failures, answers, exam, nowIso) {
  if (!Array.isArray(failures) || !failures.length || !grade || !Array.isArray(grade.questions)) return null;
  const reportedAt = typeof nowIso === "string" && nowIso ? nowIso : new Date().toISOString();
  const byId = new Map(flattenQuestions(exam).map(x => [String(x.questionId), x.question]));
  const norm = normalizeExamStructure(exam);
  const record = {};
  let heldAny = false;
  const sectionDelta = new Map(), slots = new Map();
  for (const f of failures) {
    const q = byId.get(f.questionId), g = grade.questions.find(x => isObj(x) && String(x.questionId) === f.questionId);
    if (!q || !g) continue;
    const answered = isAdmittedAnswered(q, answers ? answers[f.questionId] : undefined);
    const held = !answered && Number(g.maxMarks) > 0 && quotaOpen(norm, f.questionId, answers || {}, slots);
    setOwn(record, f.questionId, { code: f.code, held, reportedAt });
    if (!held) continue;
    const before = effectiveMaxMarks(g);
    holdGrade(g, f.code);
    heldAny = true;
    const gained = effectiveMaxMarks(g) - before;
    if (gained > 0) sectionDelta.set(String(g.sectionId), (sectionDelta.get(String(g.sectionId)) || 0) + gained);
  }
  if (!heldAny) return record;
  // A firstN section WITHOUT an explicit maximum derives it from the counted marks (gradeExam's own rule): the held question now counts.
  if (Array.isArray(grade.sections)) {
    norm.sections.forEach(section => {
      const delta = sectionDelta.get(String(section.id));
      if (!delta || section.gradingPolicy !== "firstNAnswered" || section.maxMarks != null) return;
      const s = grade.sections.find(x => isObj(x) && String(x.id) === String(section.id));
      if (s) s.maxMarks = round(Number(s.maxMarks || 0) + delta);
    });
    grade.totalMarks = round(grade.sections.reduce((n, s) => n + (Number(s && s.maxMarks) || 0), 0));
  }
  // Totals through the ONE canonical rebuild (score / manualReviewMarks / finalized / percentage), exactly as a review save recomputes them.
  const tmp = { questionGrades: grade.questions, sections: grade.sections, totalMarks: grade.totalMarks, manualOverrides: {} };
  rebuildAttemptGrades(tmp);
  grade.questions = tmp.questionGrades; grade.score = tmp.score; grade.manualReviewMarks = tmp.manualReviewMarks;
  grade.totalMarks = tmp.totalMarks; grade.percentage = tmp.percentage; grade.finalized = tmp.finalized;
  return record;
}

/** Number of questions of a completed attempt still (or ever) held for a technical reason — the student-safe aggregate (0 ⇒ omitted). */
function technicalHoldCount(attempt) {
  const r = attempt && isObj(attempt.renderFailures) ? attempt.renderFailures : null;
  if (!r) return 0;
  let n = 0;
  for (const v of Object.values(r)) if (isObj(v) && v.held === true) n++;
  return n;
}
function technicalHoldsField(attempt) { const n = technicalHoldCount(attempt); return n ? { technicalHolds: n } : {}; }

module.exports = { RENDER_FAILURE_CODES, normalizeRenderFailures, draftRenderFailuresPatch, applyRenderFailureHolds, technicalHoldCount, technicalHoldsField };
