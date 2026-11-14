// Phase F3 — the teacher's review of a student's project exam form: the evidence of the auto-marked questions, the rating of
// each section on the form's rubric, returning the form for correction, approving it (the mark is computed then, once) and
// taking an approval back. Pure: no storage, no clock, no session (docs/enterprise-project-exam-form-f3.md).
//
// Grading safety (AGENTS.md §10):
//   - nothing is ever marked by default: a section without the teacher's rating blocks the approval, it is never a zero;
//   - a form that was not submitted cannot be rated, returned or approved, so it never gets a mark;
//   - the mark is computed from the ratings stored in the SAME write that approves, and approving an approved form
//     changes nothing (idempotent);
//   - an auto-marked question is evidence for the teacher inside its section. It carries no points of its own.
const NOTE_MAX = 1000;

function fail(message, httpStatus = 400, code) {
  const err = new Error(message);
  err.httpStatus = httpStatus;
  if (code) err.code = code;
  throw err;
}
const isObject = v => !!v && typeof v === "object" && !Array.isArray(v);
const clone = v => JSON.parse(JSON.stringify(v));
const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));

// Sections the teacher must rate before approving: every section that carries weight.
const ratedSections = template => template.sections.filter(s => s.weight > 0);
const topLevel = template => template.rubric.levels.length - 1;

/**
 * Is the student's answer to an auto-marked question right? true / false, or null when the question is not auto-marked or
 * was not answered. Exact rules: the one option, exactly the right set, every pair, the exact order.
 */
function evaluateAuto(question, answer) {
  if (question.grading !== "auto" || !isObject(question.answer)) return null;
  if (!isObject(answer)) return null;
  switch (question.kind) {
    case "choice": return typeof answer.optionId === "string" ? answer.optionId === question.answer.correctOptionId : null;
    case "multiChoice": return Array.isArray(answer.optionIds) && answer.optionIds.length ? sameSet(answer.optionIds, question.answer.correctOptionIds) : null;
    case "matching": {
      if (!isObject(answer.pairs) || !Object.keys(answer.pairs).length) return null;
      return question.left.every(l => answer.pairs[l.id] === question.answer.pairs[l.id]);
    }
    case "ordering": return Array.isArray(answer.order) && answer.order.length ? answer.order.length === question.answer.order.length && answer.order.every((id, i) => id === question.answer.order[i]) : null;
    default: return null;
  }
}

// { questionId: true | false | null } for the auto-marked questions, and the counts.
function autoEvidence(template, answers) {
  const stored = isObject(answers) ? answers : {};
  const byQuestion = {};
  let total = 0, correct = 0, answered = 0;
  for (const q of template.sections.flatMap(s => s.questions)) {
    if (q.grading !== "auto") continue;
    const verdict = evaluateAuto(q, stored[q.questionId]);
    byQuestion[q.questionId] = verdict;
    total += 1;
    if (verdict !== null) answered += 1;
    if (verdict === true) correct += 1;
  }
  return { byQuestion, total, answered, correct };
}

// The mark out of 100 from complete ratings: Σ weight × level / top level. Kept to two decimals; never rounded up to a pass.
function computeResult(template, ratings) {
  const top = topLevel(template);
  const sections = ratedSections(template).map(s => {
    const level = ratings[s.sectionId].level;
    return { sectionId: s.sectionId, level, weight: s.weight, points: Math.round((s.weight * level * 100) / top) / 100 };
  });
  return { mark: Math.round(sections.reduce((sum, s) => sum + s.points, 0) * 100) / 100, outOf: 100, topLevel: top, sections };
}

function assertReviewable(doc, expectedRevision, statuses, what) {
  if (!doc) fail("لم يسلّم الطالب الاستمارة بعد.", 409, "FORM_NOT_SUBMITTED");
  if (!statuses.includes(doc.status)) {
    if (doc.status === "approved") fail("الاستمارة معتمدة. ألغِ الاعتماد أولًا لتعديلها.", 409, "FORM_APPROVED");
    fail(what, 409, "FORM_NOT_SUBMITTED");
  }
  if (!Number.isInteger(expectedRevision) || expectedRevision !== doc.revision) fail("تغيّرت الاستمارة منذ فتحتها. حدّث الصفحة.", 409, "REVIEW_STALE");
}

function cleanNote(value, what) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.length > NOTE_MAX) fail(what + " أطول من الحد المسموح (" + NOTE_MAX + ").");
  return value.trim();
}

/**
 * Saves the teacher's ratings and notes on a SUBMITTED form. `ratings` = { sectionId: { level, note? } | null } for the
 * sections that changed (null clears one). Returns { doc, changed }.
 */
function applyReview(current, template, { ratings, generalNote, expectedRevision, actor, now }) {
  assertReviewable(current, expectedRevision, ["submitted"], "لا يمكن تقدير استمارة لم تُسلَّم.");
  if (!isObject(ratings)) fail("طلب غير صحيح.");
  const doc = clone(current);
  const review = isObject(doc.review) ? doc.review : { ratings: {}, generalNote: "" };
  if (!isObject(review.ratings)) review.ratings = {};
  const known = new Map(template.sections.map(s => [s.sectionId, s]));
  const top = topLevel(template);
  const before = JSON.stringify({ ratings: review.ratings, generalNote: review.generalNote || "" });
  for (const [sectionId, rating] of Object.entries(ratings)) {
    if (!known.has(sectionId)) fail("قسم غير موجود في الاستمارة: " + sectionId);
    if (rating === null) { delete review.ratings[sectionId]; continue; }
    if (!isObject(rating) || !Number.isInteger(rating.level) || rating.level < 0 || rating.level > top) fail("تقدير القسم " + sectionId + " يجب أن يكون بين 0 و" + top + ".");
    const note = cleanNote(rating.note, "ملاحظة القسم " + sectionId);
    review.ratings[sectionId] = note ? { level: rating.level, note } : { level: rating.level };
  }
  if (generalNote !== undefined) review.generalNote = cleanNote(generalNote, "الملاحظة العامة");
  if (JSON.stringify({ ratings: review.ratings, generalNote: review.generalNote || "" }) === before) return { doc: current, changed: false };
  review.updatedAt = now;
  review.updatedBy = actor || "";
  doc.review = review;
  doc.revision += 1;
  doc.updatedAt = now;
  return { doc, changed: true };
}

// Which weighted sections still have no rating (what blocks an approval).
function unratedSections(template, doc) {
  const ratings = doc && isObject(doc.review) && isObject(doc.review.ratings) ? doc.review.ratings : {};
  const top = topLevel(template);
  return ratedSections(template).filter(s => !(isObject(ratings[s.sectionId]) && Number.isInteger(ratings[s.sectionId].level) && ratings[s.sectionId].level >= 0 && ratings[s.sectionId].level <= top)).map(s => s.sectionId);
}

// Returns a submitted form to the student for correction: the student can edit and submit again; the ratings stay.
function applyReturn(current, template, { note, expectedRevision, actor, now }) {
  assertReviewable(current, expectedRevision, ["submitted"], "لا يمكن إعادة استمارة لم تُسلَّم.");
  const doc = clone(current);
  doc.status = "returned";
  doc.returnedAt = now;
  doc.returnedBy = actor || "";
  doc.returnNote = cleanNote(note, "ملاحظة الإعادة");
  doc.revision += 1;
  doc.updatedAt = now;
  return { doc, changed: true };
}

/**
 * Approves a submitted form: every weighted section must be rated. The mark is computed here, from the stored ratings.
 * Approving an approved form changes nothing.
 */
function applyApprove(current, template, { expectedRevision, actor, now }) {
  if (current && current.status === "approved") return { doc: current, changed: false };
  assertReviewable(current, expectedRevision, ["submitted"], "لا يمكن اعتماد استمارة لم تُسلَّم.");
  const missing = unratedSections(template, current);
  if (missing.length) {
    const err = new Error("قدّر كل الأقسام قبل الاعتماد (" + missing.length + ").");
    err.httpStatus = 400; err.code = "REVIEW_INCOMPLETE"; err.missing = missing;
    throw err;
  }
  const doc = clone(current);
  doc.status = "approved";
  doc.approvedAt = now;
  doc.approvedBy = actor || "";
  doc.result = computeResult(template, doc.review.ratings);
  doc.revision += 1;
  doc.updatedAt = now;
  return { doc, changed: true };
}

// Takes an approval back: the form is «submitted» again with its ratings; the stored result is removed (it is computed again
// on the next approval). The student sees no result meanwhile.
function applyUnapprove(current, { expectedRevision, actor, now }) {
  if (!current || current.status !== "approved") fail("الاستمارة ليست معتمدة.", 409, "FORM_NOT_APPROVED");
  if (!Number.isInteger(expectedRevision) || expectedRevision !== current.revision) fail("تغيّرت الاستمارة منذ فتحتها. حدّث الصفحة.", 409, "REVIEW_STALE");
  const doc = clone(current);
  doc.status = "submitted";
  doc.unapprovedAt = now;
  doc.unapprovedBy = actor || "";
  delete doc.result;
  delete doc.approvedAt;
  delete doc.approvedBy;
  doc.revision += 1;
  doc.updatedAt = now;
  return { doc, changed: true };
}

/**
 * What the STUDENT may see of the review. Before the approval: nothing but the note of a returned form. After it: the mark,
 * each section's level and note, the general note, and for each auto-marked question only whether it was right — never
 * the key, because the same form is still open for classmates.
 */
function studentReviewView(template, doc) {
  if (!doc) return {};
  if (doc.status === "returned") return { returnNote: doc.returnNote || "", returnedAt: doc.returnedAt || "" };
  if (doc.status !== "approved" || !isObject(doc.result)) return {};
  const ratings = isObject(doc.review) && isObject(doc.review.ratings) ? doc.review.ratings : {};
  const levels = template.rubric.levels;
  return {
    result: {
      mark: doc.result.mark, outOf: doc.result.outOf, approvedAt: doc.approvedAt || "",
      generalNote: (isObject(doc.review) && doc.review.generalNote) || "",
      sections: doc.result.sections.map(s => ({
        sectionId: s.sectionId, level: s.level, topLevel: doc.result.topLevel, weight: s.weight, points: s.points,
        levelLabel: (levels[s.level] && levels[s.level].label) || "", note: (isObject(ratings[s.sectionId]) && ratings[s.sectionId].note) || ""
      })),
      auto: autoEvidence(template, doc.answers).byQuestion
    }
  };
}

module.exports = { NOTE_MAX, evaluateAuto, autoEvidence, computeResult, unratedSections, applyReview, applyReturn, applyApprove, applyUnapprove, studentReviewView };
