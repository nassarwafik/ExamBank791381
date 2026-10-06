// Phase 20D — the TEACHER review of a composite@1 question (GET payload) and the per-part manual review authority (POST validation).
//
// Review payload: one entry per shared context (a SmartSim context is replayed ONCE and its server-derived state + plugin review details are
// shown ONCE) and one entry per part keyed by its child key <questionId>::part::<partId> (the SAME identity as the coding target, the
// parametric generation key and the per-part override key): the child node (teacher-only: it carries the private key — this payload never
// reaches a student), the student's child answer, the stored part grade, the part override / comment, and the type's own evidence computed by
// the SAME authorities that graded it (linked SmartSim part → only ITS check facts on the shared replay; open response → the stored rubric
// review; parametric → the official instance regenerated from the child key; coding → the teacher-safe evidence of the child target).
//
// Per-part overrides: a key that is a top-level question id keeps the original path (unchanged). A child key binds ONLY to a real part of a
// real composite grade of THIS attempt; an unknown part is refused (400 COMPOSITE_PART_UNKNOWN); a part that is not COUNTED (excess /
// unanswered first-N, or an ignored composite) is refused (400 COMPOSITE_PART_IGNORED) — an override can never resurrect it; an
// open-response child is graded ONLY through its published rubric (rubricAwards bound to THAT child's rubric, score computed here; a
// client score never counts). Nothing is written when any entry is refused.
const { flattenQuestions, effectiveMaxMarks } = require("./exam-structure");
const { compositeStructure, compositeChildNode, compositeChildKey, parseCompositeChildKey, isCompositeQuestionNode } = require("./shared-finalization/compositeQuestion");
const { prepareSmartSimEvaluation, evaluatePreparedSmartSimChecks, describePreparedSmartSim, evaluateSmartSim, smartSimQuestionVersion } = require("./shared-finalization/trustedSimPlugins");
const { scoreOpenResponseRubric, isOpenResponseQuestion } = require("./shared-finalization/openResponseQuestion");
const { parametricReviewInstance } = require("./shared-finalization/parametricNumericQuestion");
const { bindCodingTemplateAnswerToQuestion } = require("./shared-finalization/codingQuestion");
const { teacherCodingEvidence } = require("./coding/official-grading");

const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const own = (o, k) => (isObj(o) && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);
const checksView = e => ({ valid: e.valid, score: e.score, maxMarks: e.maxMarks, totalWeight: e.totalWeight, passedWeight: e.passedWeight, manualReview: e.manualReview, checks: e.checks, ...(e.issues ? { issues: e.issues.map(i => i.message) } : {}) });

/** The teacher review of ONE composite question of a stored attempt, or null for a non-composite question. */
function compositeReviewOf(q, questionId, attempt, { assignmentId, studentId }) {
  if (!isCompositeQuestionNode(q)) return null;
  const st = compositeStructure(q);
  if (!st.ok) return { valid: false, issues: st.issues.map(i => i.message), contexts: [], parts: [] };
  const answer = own(attempt.answers, questionId);
  const partAnswers = isObj(answer) && answer.kind === "composite" && isObj(answer.parts) ? answer.parts : {};
  const ctxAnswers = isObj(answer) && answer.kind === "composite" && isObj(answer.contexts) ? answer.contexts : {};
  const grade = (Array.isArray(attempt.questionGrades) ? attempt.questionGrades : []).find(g => isObj(g) && String(g.questionId) === questionId) || null;
  const partGrades = new Map((grade && Array.isArray(grade.parts) ? grade.parts : []).filter(isObj).map(p => [String(p.partId), p]));
  const overrides = isObj(attempt.manualOverrides) ? attempt.manualOverrides : {};
  const topIds = new Set((Array.isArray(attempt.questionGrades) ? attempt.questionGrades : []).filter(isObj).map(g => String(g.questionId)));
  const prepared = new Map();
  const prep = c => { if (!prepared.has(c.id)) prepared.set(c.id, prepareSmartSimEvaluation({ envelope: c.envelope, response: own(ctxAnswers, c.id) })); return prepared.get(c.id); };
  const contexts = st.model.contexts.map(c => {
    const head = { id: c.id, kind: c.kind, ...(c.title !== undefined ? { title: c.title } : {}), ...(c.instructions !== undefined ? { instructions: c.instructions } : {}) };
    if (c.kind === "source") return { ...head, sources: c.sources };
    const d = describePreparedSmartSim(prep(c));
    return { ...head, smartSim: c.envelope, studentAnswer: own(ctxAnswers, c.id) ?? null, review: { valid: d.valid, answered: d.answered, ...(d.state !== undefined ? { state: d.state } : {}), ...(d.details || {}), ...(d.issues ? { issues: d.issues.map(i => i.message) } : {}) } };
  });
  const parts = [];
  for (const g of st.model.groups) for (const p of g.parts) {
    const childKey = compositeChildKey(questionId, p.id), child = { ...compositeChildNode(p.raw), marks: p.marks };
    const studentAnswer = own(partAnswers, p.id) ?? null, pg = partGrades.get(p.id) || null, o = topIds.has(childKey) ? undefined : own(overrides, childKey);   // RF1: an ambiguous key is never the part's
    const entry = {
      partId: p.id, groupId: g.id, childKey, label: p.label, type: p.type, questionTypeVersion: p.raw.questionTypeVersion ?? null, marks: p.marks,
      text: typeof p.raw.text === "string" ? p.raw.text : "", ...(p.contextId !== undefined ? { contextId: p.contextId } : {}),
      node: child, studentAnswer, expectedAnswer: p.raw.answer ?? null, autoGrade: pg, manualScore: isObj(o) && o.score !== undefined ? o.score : null, teacherComment: String((isObj(o) && o.comment) || "")
    };
    if (p.type === "smartSim") {
      if (p.linkedSmartSim) { const c = st.model.contextById.get(p.contextId); entry.smartSimReview = c && c.kind === "smartSim" ? checksView(evaluatePreparedSmartSimChecks(prep(c), { answerKey: p.raw.answer, maxMarks: p.marks })) : { valid: false, checks: [] }; }
      else if (smartSimQuestionVersion(child) === 1) { try { const e = evaluateSmartSim({ envelope: child.smartSim, answerKey: child.answer, response: studentAnswer, maxMarks: p.marks }, { withDetails: true }); entry.smartSimReview = { ...checksView(e), ...(e.state !== undefined ? { state: e.state } : {}), ...(e.details || {}) }; } catch { entry.smartSimReview = { valid: false, checks: [] }; } }
      else entry.smartSimReview = { valid: false, manualReview: true, checks: [] };
    }
    if (isOpenResponseQuestion(child)) entry.rubricReview = isObj(o) && o.rubric ? o.rubric : null;
    if (p.type === "parametricNumeric") entry.parametricInstance = parametricReviewInstance(child, { assignmentId: String(assignmentId), studentId: String(studentId), attemptNumber: Number(attempt.attemptNumber), questionKey: childKey });
    if (isObj(studentAnswer) && studentAnswer.kind === "codeTemplate") { const b = bindCodingTemplateAnswerToQuestion(studentAnswer, child); entry.codeTemplateReview = b.ok ? { ok: true, language: b.answer.language, source: b.source } : { ok: false, code: b.code }; }
    if (p.type === "coding") { const v = teacherCodingEvidence({ questionId: childKey, node: child, grade: pg, rawAnswer: studentAnswer ?? undefined }, attempt); if (v) entry.codingEvidence = v; }
    parts.push(entry);
  }
  return { valid: true, contexts, parts };
}

const RUBRIC_MESSAGES = { RUBRIC_GRADE_REQUIRED: "هذا البند يُصحَّح بسلم التقييم فقط: اختر مستوى لكل معيار.", RUBRIC_AUTHORITY_INVALID: "سلم التقييم المنشور لهذا البند غير صالح؛ لا يمكن احتساب درجة منه." };
const MESSAGES = { COMPOSITE_PART_UNKNOWN: "البند غير موجود في السؤال المركّب المنشور لهذه المحاولة.", COMPOSITE_PART_IGNORED: "هذا البند غير محتسب في هذه المحاولة (إجابة زائدة أو غير مجاب عنه ضمن «أول عدد محدد»)؛ لا يمكن منحه علامة." };
/**
 * Validates every incoming per-PART override (child keys) against the published snapshot and the stored attempt BEFORE anything is
 * written. → { entries: Map(childKey → { score, rubric? }) } | { error: { code, questionId, message, criterionId? } }.
 * Keys that are top-level question ids (or that do not address a composite grade of this attempt) are left to the original path.
 */
function compositePartOverrides(snapshot, attempt, incoming) {
  const entries = new Map();
  const grades = Array.isArray(attempt && attempt.questionGrades) ? attempt.questionGrades : [];
  const topIds = new Set(grades.filter(isObj).map(g => String(g.questionId)));
  const flat = flattenQuestions(snapshot);
  for (const [key, value] of Object.entries(isObj(incoming) ? incoming : {})) {
    if (topIds.has(String(key)) || !isObj(value)) continue;
    const c = parseCompositeChildKey(key);
    if (!c) continue;
    const pg = grades.find(g => isObj(g) && String(g.questionId) === c.questionId);
    if (!pg || !isObj(pg.composite)) continue;
    const fail = (code, criterionId) => ({ error: { code, questionId: String(key), ...(criterionId ? { criterionId } : {}), message: MESSAGES[code] || RUBRIC_MESSAGES[code] || "اختيارات سلم التقييم غير صالحة لهذا البند." } });
    const parent = flat.find(x => x.questionId === c.questionId);
    const st = parent && isCompositeQuestionNode(parent.question) ? compositeStructure(parent.question) : null;
    const part = st && st.ok ? st.model.partById.get(c.partId) : undefined;
    const partGrade = Array.isArray(pg.parts) ? pg.parts.find(x => isObj(x) && String(x.partId) === c.partId) : undefined;
    if (!part || !partGrade) return fail("COMPOSITE_PART_UNKNOWN");
    if (!(effectiveMaxMarks(partGrade) > 0) || !(effectiveMaxMarks(pg) > 0)) return fail("COMPOSITE_PART_IGNORED");
    const child = { ...compositeChildNode(part.raw), marks: part.marks };
    if (isOpenResponseQuestion(child)) {
      const probe = scoreOpenResponseRubric(child, {});
      if (!probe.ok && probe.code === "RUBRIC_AUTHORITY_INVALID") return fail("RUBRIC_AUTHORITY_INVALID");
      if (!Object.prototype.hasOwnProperty.call(value, "rubricAwards")) return fail("RUBRIC_GRADE_REQUIRED");
      const r = scoreOpenResponseRubric(child, value.rubricAwards);
      if (!r.ok) return fail(r.code, r.criterionId);
      entries.set(String(key), { score: r.score, rubric: { v: 1, awards: r.awards, awarded: r.awarded, total: r.total } });
    } else entries.set(String(key), { score: value.score });
  }
  return { entries };
}
/** The CURRENT counted cap of a child key inside a (CAS-fresh) attempt, or 0 when it is not a counted part of a counted composite. */
function compositePartCap(attempt, key) {
  const c = parseCompositeChildKey(key);
  if (!c) return 0;
  const pg = (Array.isArray(attempt.questionGrades) ? attempt.questionGrades : []).find(g => isObj(g) && String(g.questionId) === c.questionId);
  if (!pg || !isObj(pg.composite) || !(effectiveMaxMarks(pg) > 0) || !Array.isArray(pg.parts)) return 0;
  const p = pg.parts.find(x => isObj(x) && String(x.partId) === c.partId);
  return p ? effectiveMaxMarks(p) : 0;
}

module.exports = { compositeReviewOf, compositePartOverrides, compositePartCap };
