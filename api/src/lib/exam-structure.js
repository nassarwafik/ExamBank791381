// Pure, dependency-free structural helpers for the "structured exam" engine.
//
// Goal: represent REAL 791381 exams (sections with grading policies, compound questions with
// independent parts, generalized answer fields) WITHOUT breaking a single legacy exam that only
// carries a flat `exam.questions` array. Every consumer (grading, submission, manual review) goes
// through normalizeExamStructure() so none of them needs `if(sections) ... if(parts) ...` scattered
// around. This is the single source of truth for the selection logic that decides which answered
// units actually count toward a section's score (capScore / firstNAnswered); the front-end has a
// deliberately identical mirror in src/examStructure.ts used only for live display — the server copy
// here remains authoritative for the official score.
//
// NOTHING in this file mutates its input; every function is pure so it can be unit-tested directly.

const GRADING_POLICIES = ["all", "capScore", "firstNAnswered"];

// Stable identity helpers. These MUST match src/StudentQuestionCard.tsx's qid() and the front-end
// mirror so a draft saved by the browser is keyed exactly the way the grader looks it up. Display
// numbers are never used as identity (source exams have repeated / wrong printed numbering).
function questionId(q, i) {
  return String(q?.examQuestionId ?? q?.id ?? q?.number ?? i + 1);
}
// Section-scoped identity for STRUCTURED exams. An explicit examQuestionId/id always wins (so any
// authored id is preserved verbatim). Only when both are absent AND the section is a real structured
// section (not the "__default__" wrapper a legacy flat exam normalizes into) do we build a
// section-scoped positional fallback like "core::q1" — this is what stops question number 1 of the
// core section and question number 1 of the specialization section from colliding on the answer key
// "1". Legacy flat exams keep the exact old fallback (number, then 1-based index), unchanged.
function sectionQuestionId(section, q, i) {
  if (q && q.examQuestionId != null && q.examQuestionId !== "") return String(q.examQuestionId);
  if (q && q.id != null && q.id !== "") return String(q.id);
  if (section && section.id && section.id !== "__default__") return section.id + "::q" + (i + 1);
  return String((q && q.number) || i + 1);
}
function partId(p, i) {
  return String(p?.id ?? i + 1);
}
function fieldId(f, i) {
  return String(f?.id ?? f?.number ?? i + 1);
}

// Arabic ordinal labels for compound-question parts (أ، ب، ج …). Falls back to a plain number past
// the alphabet. An explicit part.label is always preserved.
const ARABIC_ORDINALS = ["أ", "ب", "ج", "د", "هـ", "و", "ز", "ح", "ط", "ي", "ك", "ل", "م", "ن", "س", "ع", "ف", "ص", "ق", "ر", "ش", "ت", "ث", "خ", "ذ", "ض", "ظ", "غ"];
function partLabel(part, i) {
  if (part && part.label != null && String(part.label).trim() !== "") return String(part.label);
  return ARABIC_ORDINALS[i] || String(i + 1);
}

// The max marks a manual grader may award to one question grade. For a firstNAnswered/compound grade
// this is the COUNTED max (0 for an ignored excess answer; the sum of counted part marks for a
// partially-counted compound), never the full maxMarks — so an override can't resurrect marks that
// first-N excluded. Old stored grades without countedMaxMarks fall back to maxMarks (legacy-safe).
function effectiveMaxMarks(grade) {
  const c = grade ? grade.countedMaxMarks : undefined;
  return c == null ? num(grade && grade.maxMarks) : num(c);
}

// صحيح / غير صحيح — the implicit options a trueFalse question is graded/rendered with when it stores
// none. Index 0 = صحيح (true), index 1 = غير صحيح (false).
function defaultTrueFalseOptions() {
  return [{ text: "صحيح" }, { text: "غير صحيح" }];
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function questionParts(q) {
  return Array.isArray(q?.parts) ? q.parts : [];
}
function isCompound(q) {
  return questionParts(q).length > 0;
}

// Marks per part, in part order. Rules (from the task spec):
//  - if EVERY part supplies an explicit `marks`, use them verbatim (preserves floating-point weights);
//  - if NONE do, split the question's total marks equally between the parts;
//  - mixed: honour the explicit ones and split the remaining question marks equally among the rest.
function distributePartMarks(q) {
  const parts = questionParts(q);
  if (!parts.length) return [];
  const total = num(q?.marks ?? q?.points, 0);
  const hasMark = parts.map(p => p && p.marks != null && Number.isFinite(Number(p.marks)));
  if (hasMark.every(Boolean)) return parts.map(p => num(p.marks));
  if (!hasMark.some(Boolean)) {
    const each = parts.length ? total / parts.length : 0;
    return parts.map(() => each);
  }
  const known = parts.reduce((s, p, i) => s + (hasMark[i] ? num(p.marks) : 0), 0);
  const restCount = hasMark.filter(x => !x).length;
  const each = restCount ? Math.max(0, total - known) / restCount : 0;
  return parts.map((p, i) => (hasMark[i] ? num(p.marks) : each));
}

// Is a stored answer (any shape, legacy or new) actually answered? Mirrors StudentQuestionCard's
// answered() for the legacy shapes and extends it to the new "fields"/"compound" shapes.
function isResponseAnswered(a) {
  if (!a || typeof a !== "object") return false;
  const nonEmpty = v => (typeof v === "boolean" ? v : String(v ?? "").trim() !== "");
  switch (a.kind) {
    case "choice":
      return Number.isInteger(a.index);
    case "text":
      return String(a.value ?? "").trim() !== "";
    case "sequence":
    case "table":
      return Array.isArray(a.values) && a.values.some(nonEmpty);
    case "fields":
      return !!a.values && Object.values(a.values).some(v => (Array.isArray(v) ? v.some(nonEmpty) : nonEmpty(v)));
    case "compound":
      return !!a.parts && Object.values(a.parts).some(isResponseAnswered);
    default:
      return false;
  }
}

function normalizeSection(s, si) {
  const policy = GRADING_POLICIES.includes(s?.gradingPolicy) ? s.gradingPolicy : "all";
  const req = s?.requiredAnswers == null ? null : Math.max(0, Math.floor(num(s.requiredAnswers)));
  return {
    id: String(s?.id ?? "section-" + (si + 1)),
    title: String(s?.title ?? ""),
    instructions: String(s?.instructions ?? ""),
    maxMarks: s?.maxMarks == null ? null : num(s.maxMarks),
    gradingPolicy: policy,
    requiredAnswers: req,
    answerUnit: s?.answerUnit === "part" ? "part" : "question",
    // Optional shared-stimulus lookup: { [groupId]: { title?, text?, image? } }. Rendered once before
    // the first question of each group. Passed through untouched (grading ignores it).
    stimuli: s && s.stimuli && typeof s.stimuli === "object" ? s.stimuli : null,
    questions: Array.isArray(s?.questions) ? s.questions : []
  };
}

// The one entry point. Returns { structured, sections[] } for BOTH new and legacy exams. A legacy
// exam becomes a single implicit section with gradingPolicy "all" and no cap, so every downstream
// consumer that iterates `sections` reproduces the exact old flat-list behaviour.
function normalizeExamStructure(exam) {
  const ex = exam || {};
  if (Array.isArray(ex.sections) && ex.sections.length) {
    return { structured: true, sections: ex.sections.map(normalizeSection) };
  }
  return {
    structured: false,
    sections: [
      {
        id: "__default__",
        title: "",
        instructions: "",
        maxMarks: null,
        gradingPolicy: "all",
        requiredAnswers: null,
        answerUnit: "question",
        stimuli: null,
        questions: Array.isArray(ex.questions) ? ex.questions : []
      }
    ]
  };
}

// Flat list of every question across all sections, in display order, tagged with its sectionId and
// a 1-based global display number. Used by manual review / analytics which still want a flat view.
function flattenQuestions(exam) {
  const norm = normalizeExamStructure(exam);
  const out = [];
  let n = 0;
  norm.sections.forEach(section => {
    section.questions.forEach((q, i) => {
      out.push({ question: q, questionId: sectionQuestionId(section, q, i), sectionId: section.id, displayNumber: ++n });
    });
  });
  return out;
}

function unitKey(u) {
  return u.partId ? u.questionId + "::" + u.partId : u.questionId;
}

// The gradable "units" of a section in DISPLAY order. For answerUnit==="question" every question is
// one unit. For answerUnit==="part" a compound question contributes one unit per part (flattened in
// order); a non-compound question in a part-unit section counts as a single unit.
function getAnswerUnits(section, answers) {
  const units = [];
  (section.questions || []).forEach((q, qi) => {
    const qid = sectionQuestionId(section, q, qi);
    const resp = answers ? answers[qid] : undefined;
    if (section.answerUnit === "part" && isCompound(q)) {
      questionParts(q).forEach((p, pi) => {
        const pid = partId(p, pi);
        const pans = resp && resp.kind === "compound" && resp.parts ? resp.parts[pid] : undefined;
        units.push({ questionId: qid, partId: pid, answer: pans, answered: isResponseAnswered(pans) });
      });
    } else {
      units.push({ questionId: qid, partId: null, answer: resp, answered: isResponseAnswered(resp) });
    }
  });
  return units;
}

// Decides which units count toward the score. "all"/"capScore" count every unit. "firstNAnswered"
// scans in display order and counts the first `requiredAnswers` ANSWERED units — unanswered units
// never consume a slot, and answered units beyond the quota are excess (kept, but not graded).
// Returns the set of counted unit keys plus the ordered unit list so callers can flag excess.
function selectGradedUnits(section, answers) {
  const units = getAnswerUnits(section, answers);
  if (section.gradingPolicy !== "firstNAnswered" || section.requiredAnswers == null) {
    return { countedKeys: new Set(units.map(unitKey)), units };
  }
  const countedKeys = new Set();
  let taken = 0;
  for (const u of units) {
    if (taken >= section.requiredAnswers) break;
    if (u.answered) {
      countedKeys.add(unitKey(u));
      taken++;
    }
  }
  return { countedKeys, units };
}

// Display-only summary of a section's progress for the student header/progress bar.
function calculateSectionProgress(section, answers) {
  const units = getAnswerUnits(section, answers);
  const total = units.length;
  const answered = units.filter(u => u.answered).length;
  const required = section.gradingPolicy === "firstNAnswered" ? section.requiredAnswers : null;
  const excess = required != null ? Math.max(0, answered - required) : 0;
  return {
    total,
    answered,
    required,
    counted: required != null ? Math.min(answered, required) : answered,
    excess,
    gradingPolicy: section.gradingPolicy,
    maxMarks: section.maxMarks
  };
}

// Section-cap-aware total from a per-question score lookup. Shared by manual-review reconciliation
// (assignment-review.js) so a teacher's overrides still respect a section's capScore / firstNAnswered
// maxMarks. `sectionsMeta` is the compact [{gradingPolicy,maxMarks,questionIds}] stored on the attempt;
// `scoreOf(id)` returns the (possibly overridden) score for one question id.
function sectionCappedScore(sectionsMeta, scoreOf) {
  let total = 0;
  (sectionsMeta || []).forEach(sec => {
    let sum = (sec.questionIds || []).reduce((a, id) => a + (Number(scoreOf(String(id))) || 0), 0);
    if ((sec.gradingPolicy === "capScore" || sec.gradingPolicy === "firstNAnswered") && sec.maxMarks != null) {
      sum = Math.min(sum, num(sec.maxMarks));
    }
    total += sum;
  });
  return total;
}

module.exports = {
  GRADING_POLICIES,
  sectionCappedScore,
  questionId,
  sectionQuestionId,
  partId,
  partLabel,
  fieldId,
  effectiveMaxMarks,
  defaultTrueFalseOptions,
  questionParts,
  isCompound,
  distributePartMarks,
  isResponseAnswered,
  normalizeExamStructure,
  flattenQuestions,
  getAnswerUnits,
  selectGradedUnits,
  unitKey,
  calculateSectionProgress
};
