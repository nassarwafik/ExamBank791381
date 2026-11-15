// Form version 1 of the 794589 and 883589 exam forms — the forms as they were bundled before the hand-in checklist
// (version 2) replaced their file questions. A class that opened its form under version 1 keeps those questions for good:
// the class form freezes the whole template at its first open. These are byte copies of the two bundled files at
// 6b3282f5, kept so that the behaviour of such a class stays tested: a file question that waits and never blocks, the
// notice the student reads, the line the PDF prints.
const fs = require("fs");
const path = require("path");
const { validateExamFormTemplate } = require("../../src/lib/project-tracker/exam-form");
const { getStorageNamespace } = require("../../src/lib/project-tracker/registry");

const cache = {};

/** The validated version 1 template of one project (a fresh deep copy on every call). */
function v1Template(projectCode) {
  const code = String(projectCode);
  if (!cache[code]) {
    const template = JSON.parse(fs.readFileSync(path.join(__dirname, "exam-form-v1", code + ".json"), "utf8"));
    validateExamFormTemplate(template, { projectCode: code });
    if (template.formVersion !== 1) throw new Error("exam-form-v1 fixture: not version 1 for " + code);
    cache[code] = JSON.stringify(template);
  }
  return JSON.parse(cache[code]);
}

/**
 * Writes the class form a first open would have stored while version 1 was bundled, straight into the test container.
 * `ctx` is a memory container (`createMemoryContainer`); `extra` adds stored fields such as `imageAnswers`.
 */
function seedV1ClassForm(ctx, projectCode, classId, { now = "2026-11-01T00:00:00.000Z", actor = "t1", extra = {} } = {}) {
  const doc = {
    schemaVersion: 1, projectCode: String(projectCode), classId, state: "open", formVersion: 1,
    template: v1Template(projectCode), hiddenQuestionIds: [], openedAt: now, openedBy: actor, updatedAt: now, ...extra
  };
  ctx.setJson(getStorageNamespace(projectCode).examFormClassName(classId), doc);
  return doc;
}

module.exports = { v1Template, seedV1ClassForm };
