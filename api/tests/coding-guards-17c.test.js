import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Phase 17C — architecture guards for official coding grading:
//   • the Functions process still NEVER executes student code (no eval / Function / vm / child_process / worker_threads /
//     Docker / shell in any 17C API module); official execution goes ONLY through the signed runner client;
//   • ONE canonical attempt-score rebuild shared by manual review and the automatic callback (no duplicated total algorithm),
//     byte-for-byte parity with the Phase 2 algorithm it replaces;
//   • the synchronous gradeExam / coding@1 built-in grader stays synchronous and manual (score 0, manual review);
//   • the runner never imports application code; the official runner path keeps child_process inside sandbox.js only.
// Fail-first on 543fa9f4: the 17C modules do not exist and assignment-review.js owns its private rebuild.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require_ = createRequire(import.meta.url);
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const raw = f => fs.readFileSync(path.join(repo, f), "utf8");
const read = f => strip(raw(f));
const exists = f => fs.existsSync(path.join(repo, f));

const API_17C = ["api/src/lib/coding/official-grading.js", "api/src/lib/coding/callback-protocol.js", "api/src/lib/attempt-grade-rebuild.js", "api/src/functions/coding-grading.js"];
const RUNNER_17C = ["runner/gateway/official.js", "runner/gateway/callback.js"];
const EXEC = [/(?<![.\w$])eval\s*\(/, /\bnew\s+Function\s*\(/, /["'](node:)?vm["']/, /child_process/, /worker_threads/, /(?<![.\w$])(exec|execSync|execFile|spawn|spawnSync|fork)\s*\(/, /docker\.sock|dockerode|\bdocker\b\s*(run|exec)/i, /shell:\s*true/];

describe("17C guards — the API never executes student code; official execution only through the runner seam", () => {
  it("every 17C module exists", () => { for (const f of [...API_17C, ...RUNNER_17C]) expect(exists(f), f).toBe(true); });
  it("no 17C API module contains an execution primitive", () => {
    for (const f of API_17C) for (const re of EXEC) expect(re.test(read(f)), f + " " + re).toBe(false);
  });
  it("the official grading library reaches the runner ONLY through a signed HTTPS request (runner-config + runner-protocol), never a local fallback", () => {
    const src = read("api/src/lib/coding/official-grading.js");
    expect(src).toMatch(/readCodingRunnerConfig/); expect(src).toMatch(/signRunnerRequest/);
    expect(src).toMatch(/redirect:\s*["']error["']/);
    expect(src).not.toMatch(/fake-coding-execution-provider|executeLocally|runLocally/);
  });
  it("the callback route verifies its OWN key (not the runner request key, not a session secret)", () => {
    const p = read("api/src/lib/coding/callback-protocol.js");
    expect(p).toMatch(/CODING_GRADING_CALLBACK_HMAC_KEY/);
    expect(p).toMatch(/timingSafeEqual/);
    expect(p).not.toMatch(/CODING_RUNNER_HMAC_KEY|BUILDER_SESSION_SECRET|STUDENT_SESSION_SECRET|BANK_SETUP_KEY/);
  });
});

describe("17C guards — ONE canonical attempt-score rebuild (manual review AND automatic callback)", () => {
  it("assignment-review and the callback both import attempt-grade-rebuild; no module keeps a private total algorithm", () => {
    for (const f of ["api/src/functions/assignment-review.js", "api/src/lib/coding/official-grading.js"]) expect(read(f), f).toMatch(/require\(["']\.\.?\/(\.\.\/)?(lib\/)?attempt-grade-rebuild(\.js)?["']\)/);
    expect(read("api/src/functions/assignment-review.js")).not.toMatch(/function\s+rebuildAttempt\s*\(/);
    expect(read("api/src/functions/assignment-review.js")).not.toMatch(/sectionCappedScore\(/);
  });
  it("parity: the extracted rebuild reproduces the Phase 2 algorithm byte-for-byte on legacy, sectioned, capped, overridden attempts", () => {
    const { rebuildAttemptGrades } = require_("../src/lib/attempt-grade-rebuild.js");
    const { sectionCappedScore, effectiveMaxMarks } = require_("../src/lib/exam-structure.js");
    // the ORIGINAL assignment-review.js rebuildAttempt at 543fa9f4, verbatim
    function round(n) { return Number(Number(n || 0).toFixed(2)); }
    function clamp(v, min, max) { return Math.min(max, Math.max(min, Number(v) || 0)); }
    function original(attempt) {
      const grades = Array.isArray(attempt.questionGrades) ? attempt.questionGrades : [], overrides = attempt.manualOverrides && typeof attempt.manualOverrides === "object" ? attempt.manualOverrides : {}; let remaining = 0; const scoreById = new Map();
      attempt.questionGrades = grades.map(g => { const id = String(g.questionId || ""), o = overrides[id], cap = effectiveMaxMarks(g); if (o && o.score !== undefined && o.score !== null) { const s = clamp(o.score, 0, cap); scoreById.set(id, s); return { ...g, score: round(s), manualScore: round(s), manualReview: false, reviewed: true, teacherComment: String(o.comment || "") }; } const s = Number(g.score || 0); scoreById.set(id, s); if (g.manualReview) remaining += cap; return { ...g, reviewed: !g.manualReview }; });
      let score; const sections = Array.isArray(attempt.sections) ? attempt.sections : null;
      if (sections && sections.length) { score = sectionCappedScore(sections, id => scoreById.get(id) || 0); } else { score = 0; for (const s of scoreById.values()) score += s; }
      attempt.score = round(score); attempt.manualReviewMarks = round(remaining); attempt.totalMarks = round(attempt.totalMarks); attempt.percentage = attempt.totalMarks ? round(attempt.score / attempt.totalMarks * 100) : 0; attempt.finalized = remaining === 0; return attempt;
    }
    const fixtures = [
      { totalMarks: 15, questionGrades: [{ questionId: "q1", score: 5, maxMarks: 5, manualReview: false }, { questionId: "q2", score: 0, maxMarks: 10, manualReview: true }], manualOverrides: {} },
      { totalMarks: 15, questionGrades: [{ questionId: "q1", score: 5, maxMarks: 5, manualReview: false }, { questionId: "q2", score: 0, maxMarks: 10, manualReview: true }], manualOverrides: { q2: { score: 7.333, comment: " ok " } } },
      { totalMarks: 60, sections: [{ id: "s", gradingPolicy: "capScore", maxMarks: 60, questionIds: ["a", "b", "c"] }], questionGrades: [{ questionId: "a", score: 30, maxMarks: 30 }, { questionId: "b", score: 30, maxMarks: 30 }, { questionId: "c", score: 0, maxMarks: 30, manualReview: true }], manualOverrides: { c: { score: 25 } } },
      { totalMarks: 20, sections: [{ id: "s", gradingPolicy: "firstNAnswered", maxMarks: 20, questionIds: ["a", "b", "c"] }], questionGrades: [{ questionId: "a", score: 10, maxMarks: 10, countedMaxMarks: 10 }, { questionId: "b", score: 0, maxMarks: 10, countedMaxMarks: 10, manualReview: true }, { questionId: "c", score: 0, maxMarks: 10, countedMaxMarks: 0 }], manualOverrides: { c: { score: 9 }, b: { score: 99 } } },
      { totalMarks: 0, questionGrades: [], manualOverrides: null },
      { totalMarks: 10, questionGrades: [{ questionId: "x", score: "4", maxMarks: 10, manualReview: false }], manualOverrides: { x: { score: null } } }
    ];
    for (const f of fixtures) expect(rebuildAttemptGrades(JSON.parse(JSON.stringify(f)))).toEqual(original(JSON.parse(JSON.stringify(f))));
  });
});

describe("17C guards — the synchronous engine stays synchronous; coding@1 built-in grade stays manual", () => {
  it("gradeExam is synchronous and coding@1 still grades to score 0 / manual review whatever mode (the official layer upgrades it later)", () => {
    const { gradeExam, gradeQuestion } = require_("../src/lib/assignment-grading.js");
    const F = require_("./fixtures/coding-17c.js");
    const r = gradeExam(F.exam(), { auto1: F.code("print(1)") });
    expect(typeof r.then).toBe("undefined");
    expect(r.questions.find(q => q.questionId === "auto1")).toMatchObject({ score: 0, manualReview: true });
    expect(gradeQuestion(F.autoQ(), F.code(F.CANARY.reference))).toMatchObject({ score: 0, manualReview: true });
  });
  it("coding@1 is still NOT compound-capable (target identity = questionId); a code answer inside a compound part is dropped", () => {
    const cat = require_("../src/lib/shared-finalization/questionTypeCatalog.js");
    expect(cat.questionTypeDefinition("coding").capabilities.compoundPart).toBe(false);
    const { normalizeDraftAnswers } = require_("../src/lib/draft-answers.js");
    const exam = { sections: [{ id: "s", questions: [{ examQuestionId: "cq", presentationType: "compound", parts: [{ id: "p1", type: "coding" }] }] }] };
    expect(normalizeDraftAnswers({ cq: { kind: "compound", parts: { p1: { kind: "code", language: "python", languageVersion: 1, source: "x" } } } }, exam).answers.cq.parts).toEqual({});
  });
});

describe("17C guards — runner boundaries", () => {
  it("application / API code never imports runner/ and the runner never imports application code", () => {
    for (const f of API_17C) expect(raw(f), f).not.toMatch(/runner\/gateway/);
    for (const f of RUNNER_17C) expect(raw(f), f).not.toMatch(/api\/src|platform-storage|assignment-grading|student-auth|builder-auth|\.\.\/\.\.\/src\//);
  });
  it("the official runner modules spawn nothing themselves (child_process stays in sandbox.js) and never read application secrets", () => {
    for (const f of RUNNER_17C) {
      expect(read(f), f).not.toMatch(/child_process|(?<![.\w$])(spawn|exec)\s*\(/);
      expect(raw(f), f).not.toMatch(/AZURE_STORAGE_CONNECTION_STRING|STUDENT_SESSION_SECRET|BUILDER_SESSION_SECRET|OPENAI_API_KEY|CODING_GRADING_CALLBACK_HMAC_KEY/);
    }
    expect(read("runner/gateway/callback.js")).toMatch(/SMARTASSESS_CALLBACK_HMAC_KEY|SMARTASSESS_CALLBACK_BASE_URL/);
  });
});
