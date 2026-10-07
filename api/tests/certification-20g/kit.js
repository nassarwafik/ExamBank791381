// Phase 20G — CORE ENTERPRISE CERTIFICATION: the exam AUTHORING kit. Plain-data builders for every production question family, written
// the way a teacher's saved exam looks (canonical keys only, explicit ids and marks, explicit versions). Nothing here decides anything:
// validation, finalization, sanitization and grading are always the production authorities. Canary strings are planted in every
// teacher-private field so the privacy scans can look for VALUES, not only for property names.
export const CANARY = "CERT20G-PRIVATE";
export const canary = tag => CANARY + "-" + tag;

const lv = (id, label, points) => ({ id, label, points, description: "" });
/** A rubric with explicit levels; criteria = [[id, title, maxPoints, levels:[[id, points]...]]]. Guidance carries a canary. */
export const rubric = (tag, criteria) => ({ v: 1, criteria: criteria.map(([id, title, maxPoints, levels]) => ({ id, title, description: "", maxPoints, allowCustomPoints: false, guidance: canary("GUIDANCE-" + tag + "-" + id), levels: levels.map(([lid, p]) => lv(lid, lid, p)) })) });

const base = (id, type, text, marks, extra = {}) => ({ examQuestionId: id, presentationType: type, text, marks, ...extra });
export const mcq = (id, text, marks, options, correct, extra = {}) => base(id, "multipleChoice", text, marks, { options: options.map(t => ({ text: t })), answer: { correctOptionIndex: correct }, teacherNote: canary("NOTE-" + id), ...extra });
export const trueFalse = (id, text, marks, correct) => base(id, "trueFalse", text, marks, { options: [{ text: "صحيح" }, { text: "غير صحيح" }], answer: { correctOptionIndex: correct ? 0 : 1 } });
export const multiTrueFalse = (id, text, marks, rows) => base(id, "multiTrueFalse", text, marks, { fields: rows.map(([rid, statement, correct]) => ({ id: rid, statement, kind: "boolean", correct })) });
export const shortAnswer = (id, text, marks, key) => base(id, "shortAnswer", text, marks, { answer: { text: key } });
export const multipleSelect = (id, text, marks, options, correctIds, scoring = "partialNoPenalty") => base(id, "multipleSelect", text, marks, { questionTypeVersion: 1, options: options.map(([oid, t]) => ({ id: oid, text: t })), answer: { correctOptionIds: correctIds, scoring } });
export const numeric = (id, text, marks, expected, tolerance, extra = {}) => base(id, "numericResponse", text, marks, { questionTypeVersion: 1, numeric: { unitRequired: false }, answer: { mode: "tolerance", expected, tolerance }, ...extra });
export const matrix = (id, text, marks, rows, columns, correct) => base(id, "matrix", text, marks, { questionTypeVersion: 1, matrix: { rows: rows.map(([rid, label]) => ({ id: rid, label })), columns: columns.map(([cid, label]) => ({ id: cid, label })) }, answer: { correctColumnByRow: correct } });
export const categorization = (id, text, marks, categories, items, correct) => base(id, "categorization", text, marks, { questionTypeVersion: 1, categorization: { categories: categories.map(([cid, label]) => ({ id: cid, label })), items: items.map(([iid, label]) => ({ id: iid, label })) }, answer: { correctCategoryByItem: correct } });
export const fillBlank = (id, text, marks, blanks) => base(id, "fillBlank", text, marks, { fields: blanks.map(([fid, label, correct]) => ({ id: fid, label, correct })), answer: { values: blanks.map(b => b[2]) } });
export const wordBank = (id, text, marks, bank, blanks) => base(id, "wordBank", text, marks, { wordBank: bank, fields: blanks.map(([fid, label, correct]) => ({ id: fid, label, correct })), answer: { values: blanks.map(b => b[2]) } });
export const ordering = (id, text, marks, steps) => base(id, "ordering", text, marks, { fields: steps.map((s, i) => ({ id: "o" + (i + 1), label: "الخطوة " + (i + 1), correct: s })), wordBank: [...steps].reverse(), answer: { mode: "exactSequence", values: steps } });
export const matching = (id, text, marks, pairs, options) => base(id, "matching", text, marks, { fields: pairs.map(([fid, label, correct]) => ({ id: fid, label, kind: "select", options: options.map(t => ({ text: t })), correct })), answer: { text: pairs.map(p => p[1] + "=" + p[2]).join(";") } });
export const tableFill = (id, text, marks, headers, rows, cells) => base(id, "tableFill", text, marks, { tableHeaders: headers, tableRows: rows, fields: cells.map(([fid, row, column, correct]) => ({ id: fid, row, column, label: fid, correct })) });
export const cliFill = (id, text, marks, cli, fields) => base(id, "cliFill", text, marks, { cli, fields: fields.map(([fid, label, correct]) => ({ id: fid, label, correct })) });
export const inlineCloze = (id, text, marks, segments, blanks) => base(id, "inlineCloze", text, marks, { questionTypeVersion: 1, inlineCloze: { v: 1, segments }, answer: { scoring: "proportional", blanks } });
export const openResponse = (id, text, marks, tag, criteria, extra = {}) => base(id, "openResponse", text, marks, { questionTypeVersion: 1, openResponse: { v: 1, profile: extra.profile || "explain", instructions: "", response: { minChars: 0, maxChars: 4000 }, studentRubricVisibility: extra.visibility || "hidden" }, answer: { rubric: rubric(tag, criteria), modelAnswer: canary("MODEL-" + tag) } });
export const parametric = (id, text, marks, parametricConfig, key) => base(id, "parametricNumeric", text, marks, { questionTypeVersion: 1, parametric: parametricConfig, answer: key });
export const networkCli = (id, text, marks, targetState, initial = { v: 1, device: "switch", hostname: "Switch", vlans: {}, interfaces: {} }) => base(id, "networkCli", text, marks, { questionTypeVersion: 1, networkCli: { device: "switch", initialState: initial }, answer: { targetState, scoring: "proportional" } });
export const smartSim = (id, text, marks, pluginKey, pluginVersion, config, checks, scoring = "proportional") => base(id, "smartSim", text, marks, { questionTypeVersion: 1, smartSim: { schemaVersion: 1, pluginKey, pluginVersion, config }, answer: { scoring, checks } });
export const coding = (id, text, marks, version, cfg, key) => base(id, "coding", text, marks, { questionTypeVersion: version, coding: cfg, answer: key });
export const composite = (id, text, marks, contexts, groups, extra = {}) => base(id, "composite", text, marks, { questionTypeVersion: 1, composite: { v: 1, contexts, groups }, ...extra });
export const group = (id, title, parts, policy = { gradingPolicy: "all", requiredAnswers: null, maxMarks: null }) => ({ id, title, ...policy, parts });
export const firstN = (n, maxMarks) => ({ gradingPolicy: "firstNAnswered", requiredAnswers: n, maxMarks });
/** A composite child: the standalone node of the same family minus the question-level identity, plus part identity. */
export const part = (pid, label, node, extra = {}) => { const { examQuestionId: _id, presentationType, teacherNote: _n, ...rest } = node; return { id: pid, label, type: presentationType, questionTypeVersion: node.questionTypeVersion ?? 1, ...rest, ...extra }; };
export const linkedSim = (pid, label, text, marks, contextId, checks) => ({ id: pid, label, type: "smartSim", questionTypeVersion: 1, contextId, text, marks, answer: { scoring: "proportional", checks } });
export const sourceContext = (id, title, sources) => ({ id, version: 1, kind: "source", title, sources });
export const simContext = (id, title, pluginKey, pluginVersion, config) => ({ id, version: 1, kind: "smartSim", title, smartSim: { schemaVersion: 1, pluginKey, pluginVersion, config } });
export const compound = (id, text, marks, parts) => base(id, "compound", text, marks, { parts });

export const section = (id, title, questions, policy = { gradingPolicy: "all" }) => ({ id, title, stimuli: {}, ...policy, questions });
export const exam = (examId, title, sections, extra = {}) => ({ schemaVersion: 2, examId, title, status: "draft", metadata: {}, ...extra, sections });
export const cover = (subtitle, instructions) => ({ enabled: true, activityType: "exam", subtitle, instructions, allowedMaterials: "آلة حاسبة علمية غير مبرمجة", showStudentName: true, showClassName: true, showExamDate: true, showDuration: true, showTotalMarks: true, showMarksDistribution: true });

// ── student answers ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const A = {
  choice: index => ({ kind: "choice", index }),
  text: value => ({ kind: "text", value }),
  fields: values => ({ kind: "fields", values }),
  seq: values => ({ kind: "sequence", values }),
  numeric: value => ({ kind: "numeric", value: String(value) }),
  multi: optionIds => ({ kind: "multiChoice", optionIds }),
  sim: (pluginKey, pluginVersion, actions, state = { forged: true, score: 999 }) => ({ kind: "smartSim", pluginKey, pluginVersion, actions, state }),
  // the client sends its locally derived device state; the server discards it and re-derives by replay (a structurally valid stand-in here)
  cli: (commands, state = { v: 1, device: "switch", hostname: "FORGED", vlans: {}, interfaces: {} }) => ({ kind: "networkCli", commands, state }),
  code: (source, language = "python") => ({ kind: "code", language, languageVersion: 1, source }),
  template: (values, language = "python") => ({ kind: "codeTemplate", language, languageVersion: 1, values }),
  composite: (parts, contexts = {}) => ({ kind: "composite", parts, contexts }),
  compound: parts => ({ kind: "compound", parts })
};
