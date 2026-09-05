// Spreads totalMarks across `count` questions as evenly as whole numbers allow, handing the
// remainder to the first questions one mark each - the total always sums exactly. Same algorithm
// as distributeMarks() in src/ImportQuestionsPanel.tsx (duplicated per this codebase's established
// convention of small, independently duplicated pure helpers across the frontend/backend
// boundary), kept here so this backend-only converter has no dependency on frontend TS.
function distributeMarks(totalMarks, count) {
  const total = Math.max(1, totalMarks || 100);
  const safeCount = Math.max(1, count);
  const base = Math.floor(total / safeCount);
  let remainder = total - base * safeCount;

  return Array.from({ length: safeCount }, () => {
    const value = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    return value;
  });
}

// Maps one raw T-series question ({topic,level,page,text,options,answer,explain}, as extracted by
// embedded-quiz-extract.js's parseLiteral) to a full ExamQuestion (see src/App.tsx).
//
// answer uses correctOptionIndex directly from the source's own integer index - never routed
// through the "visible answer text" anyAccepted mechanism ImportQuestionsPanel.tsx uses for AI
// detection, since that mechanism exists for when the only evidence of a correct answer is its
// text appearing in prose. Here the source already gives an exact, unambiguous index, and
// assignment-grading.js's gradeChoice checks answer.correctOptionIndex first - using it directly
// is both simpler and strictly more reliable than a text-matching round trip.
//
// topic/difficulty are deliberately left at safe, honest fallbacks (never guessed): the source's
// free-text Arabic topic/level labels don't correspond to this app's topics.json codes or its 1-5
// difficulty scale, and normalizeDetectedQuestion.js's own established rule is that an unverifiable
// value becomes null/a neutral default, not an invented one.
function mapTQuestionToExamQuestion(raw, { examId, ordinal, marks }) {
  const options = raw.options.map((text, index) => ({ value: String(index), text }));

  return {
    examQuestionId: examId + "-Q" + String(ordinal).padStart(2, "0"),
    origin: "imported",
    sourceId: examId,
    sourceQuestionId: String(ordinal),
    section: "BASIC",
    topic: "OTHER_NETWORKING",
    secondaryTopics: [],
    difficulty: 2,
    difficultyLabel: "",
    familyKey: examId + "-Q" + String(ordinal).padStart(2, "0"),
    hasCLI: false,
    requiresCalculation: false,
    presentationType: "multipleChoice",
    marks,
    locked: false,
    text: raw.text,
    textHtml: "",
    options,
    fields: [],
    parts: [],
    answer: { correctOptionIndex: raw.answer },
    hint: raw.explain || "",
    teacherNote: "",
    aiInstruction: "",
    wasModified: false,
    image: { exists: false, visible: false, origin: null, assets: [], prompt: null },
    history: [],
    redoStack: []
  };
}

// Builds a full examSnapshot (ExamDraft-shaped) from a T-series file's parsed QUESTIONS array.
// examId is the deterministic "LIB-T05" style id - stable across rebuilds since it depends only on
// the file code, never on a timestamp or random value.
function buildTExamSnapshot(examId, title, rawQuestions) {
  const marksList = distributeMarks(100, rawQuestions.length);
  const now = new Date().toISOString();
  const questions = rawQuestions.map((raw, index) =>
    mapTQuestionToExamQuestion(raw, { examId, ordinal: index + 1, marks: marksList[index] })
  );

  return {
    schemaVersion: 1,
    examId,
    title,
    questions,
    totalMarks: questions.reduce((sum, q) => sum + q.marks, 0),
    status: "final",
    createdAt: now,
    updatedAt: now
  };
}

module.exports = { distributeMarks, mapTQuestionToExamQuestion, buildTExamSnapshot };
