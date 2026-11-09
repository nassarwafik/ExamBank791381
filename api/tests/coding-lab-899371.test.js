import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// 899371 P7 (docs/enterprise-899371-learning-plan.md §20) — «مختبر البرمجة»: 36 runner-graded C# questions based on the book's
// programming questions, shipped as 11 Exam Library items CL899371-01…11 (one per chapter) that a teacher assigns as homework.
// No Docker here (the real-runner proof is runner/tests/docker-official/coding-lab-899371.rtest.js). This suite proves:
//   • the shipped items are EXACTLY what the builder makes from the authoring files and the recorded runs (no hand edit): every
//     expected output is the reference program's recorded output, bound by sha256 to the exact program and inputs;
//   • every node is a valid coding@2 / coding@3 question of the shared validator, hidden tests graded by the API, a compile error
//     goes to the teacher (manualReview, never a zero), the comparator and limits are the lab's;
//   • every known-wrong program (never shipped) fails at least one hidden test under the question's comparator;
//   • the student view carries no hidden test, expected output or reference program;
//   • end to end: a teacher assigns the item by `libraryRef`; the student's answer dispatches ONE job per question carrying only opaque
//     tokens and stdin; the runner's evidence of the reference earns full marks, of the wrong program less, a compile error goes to
//     the teacher. (That the 791381 library build keeps these entries: scripts/build-791381-library.test.js.)
const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "p7-coding-lab-test-only-root-secret";   // TEST value — never a real secret
process.env.BUILDER_PASSWORD = "the shared teacher password";
delete process.env.BUILDER_SESSION_SECRET;
delete process.env.BUILDER_USERS;
delete process.env.BUILDER_USER_CODE;
delete process.env.BUILDER_SESSION_VERSION;
delete process.env.LEGACY_DATA_OWNER;

const ROOT = path.join(__dirname, "..", "..");
const LIB = path.join(ROOT, "api", "src", "data", "exam-library");
const B = await import("../../scripts/build-899371-coding-lab.mjs");
const F = cjs("./fixtures/coding-17c.js");
const { validateQuestionTypeNode } = cjs("../src/lib/shared-finalization/questionTypeValidation.js");
const { compareOutput } = cjs("../src/lib/shared-finalization/codingContract.js");
const { sanitizeExamForStudent } = cjs("../src/lib/student-exam-sanitize.js");
const { readLibraryCatalog, readLibraryItem } = cjs("../src/lib/exam-library-store.js");
const { handler: assignments } = await import("../src/functions/manage-assignments.js");
const { createBuilderToken } = await import("../src/lib/builder-auth.js");
const submission = () => cjs("../src/functions/student-submission.js");
const grading = () => cjs("../src/functions/coding-grading.js");

const lab = B.readLab();
const runs = JSON.parse(fs.readFileSync(path.join(B.LAB_DIR, "runs.json"), "utf8"));
const MIDS = Array.from({ length: 11 }, (_, i) => "m" + String(i + 1).padStart(2, "0"));
const IDS = MIDS.map(B.itemId);
const readItem = id => JSON.parse(fs.readFileSync(path.join(LIB, "items", id + ".json"), "utf8"));
const catalogFile = () => JSON.parse(fs.readFileSync(path.join(LIB, "catalog.json"), "utf8"));

describe("899371 P7 — the shipped coding lab is exactly the build of its authoring files and recorded runs", () => {
  it("11 items CL899371-01…11, one per chapter 1–11, 36 questions; each catalog entry is the item's own header", () => {
    expect(Object.keys(lab)).toEqual(MIDS);
    expect(fs.readdirSync(path.join(LIB, "items")).filter(f => f.startsWith("CL899371-")).sort()).toEqual(IDS.map(id => id + ".json"));
    const lab899371 = catalogFile().filter(e => e.source?.repository === B.REPOSITORY);
    expect(lab899371.map(e => e.libraryItemId)).toEqual(IDS);
    let questions = 0;
    for (const entry of lab899371) {
      const item = readItem(entry.libraryItemId);
      const { schemaVersion, examSnapshot, ...header } = item;
      expect([schemaVersion, header], entry.libraryItemId).toEqual([1, entry]);
      expect(entry).toMatchObject({ category: "coding-899371", publishable: true, conversionStatus: "ready", autoGradableCount: examSnapshot.questions.length, manualReviewCount: 0, questionCount: examSnapshot.questions.length, totalMarks: examSnapshot.questions.length * 10 });
      questions += examSnapshot.questions.length;
    }
    expect(questions).toBe(36);
    expect(Object.keys(runs.runs)).toHaveLength(36);
    expect(runs).toMatchObject({ worker: "csharp@1", comparator: B.COMPARATOR });
  });

  it("regenerating from the authoring files and runs.json changes no byte of any item or catalog entry", () => {
    const catalog = catalogFile();
    for (const mid of MIDS) {
      const nodes = lab[mid].map((q, i) => B.questionNode(mid, i, q, runs.runs[B.questionId(mid, i)]));
      const { entry, item } = B.libraryItem(mid, nodes);
      expect(JSON.stringify(item, null, 2), mid).toBe(fs.readFileSync(path.join(LIB, "items", entry.libraryItemId + ".json"), "utf8"));
      expect(catalog.find(e => e.libraryItemId === entry.libraryItemId), mid).toEqual(entry);
    }
  });

  it("every recorded run belongs to the exact program and inputs (sha256), the reference ends normally everywhere, and the item's outputs ARE its outputs", () => {
    for (const mid of MIDS) lab[mid].forEach((q, i) => {
      const key = B.questionId(mid, i), run = runs.runs[key];
      expect(run.sha, key).toBe(B.runSha(B.programOf(q, "reference"), [q.public, q.hidden]));
      expect(run.wrongSha, key).toBe(B.runSha(B.programOf(q, "wrong"), q.hidden));
      expect(B.judgeQuestion(q, run), key).toEqual([]);
      expect(run.reference.exitCodes, key).toEqual([...q.public, ...q.hidden].map(() => 0));
      const node = readItem(B.itemId(mid)).examSnapshot.questions[i];
      expect(node.examQuestionId, key).toBe(key);
      expect(node.answer.hiddenTests.map(t => [t.input, t.expectedOutput]), key).toEqual(q.hidden.map((input, k) => [input, run.reference.hidden[k]]));
      expect(node.coding.publicTests.map(t => [t.input, t.sampleOutput]), key).toEqual(q.public.map((input, k) => [input, run.reference.public[k]]));
      expect(node.answer.referenceSolutions.csharp, key).toBe(B.programOf(q, "reference"));
    });
  });

  it("every known-wrong program compiles and fails at least one hidden test under the comparator; it is never shipped", () => {
    const shipped = IDS.map(id => JSON.stringify(readItem(id))).join("\n");
    for (const mid of MIDS) lab[mid].forEach((q, i) => {
      const key = B.questionId(mid, i), run = runs.runs[key];
      expect(run.wrong.compileExit, key).toBe(0);
      const fails = q.hidden.map((_, k) => !compareOutput(run.wrong.hidden[k], run.reference.hidden[k], B.COMPARATOR));
      expect(fails, key).toEqual(run.wrong.failsHidden);
      expect(fails.some(Boolean), key + " the wrong program fails somewhere").toBe(true);
      const wrong = q.version === 3 ? Object.values(q.wrongGaps).join("") : q.wrong;
      expect(shipped.includes(JSON.stringify(wrong).slice(1, -1)), key + " the wrong program is not shipped").toBe(false);
    });
  });

  it("every node is a valid coding question: hidden tests graded by the API, compile error → teacher, normalizeWhitespace, the lab's limits", () => {
    const versions = {}, counts = {};
    for (const id of IDS) for (const node of readItem(id).examSnapshot.questions) {
      const v = node.questionTypeVersion;
      versions[v] = (versions[v] || 0) + 1;
      expect(validateQuestionTypeNode(node, "coding", v).filter(x => x.severity === "error"), node.examQuestionId).toEqual([]);
      expect(node).toMatchObject({ presentationType: "coding", marks: 10, origin: "imported" });
      expect(node.answer).toMatchObject({ gradingMode: "hiddenTests", comparator: "normalizeWhitespace", scoringPolicy: "proportional", compileErrorPolicy: "manualReview" });
      expect(node.coding).toMatchObject({ allowedLanguages: ["csharp"], defaultLanguage: "csharp", taskMode: "program", inputMode: "stdin", outputMode: "stdout", limits: { sourceBytes: 65536, outputBytes: 16384, timeMs: 2000, memoryMb: 128 } });
      counts[node.examQuestionId] = node.answer.hiddenTests.length;
      expect(node.answer.hiddenTests.every(t => t.weight === 1 && t.expectedOutput.trim().length > 0), node.examQuestionId).toBe(true);
      expect(new Set(node.answer.hiddenTests.map(t => t.input)).size, node.examQuestionId).toBe(node.answer.hiddenTests.length);
      if (v === 3) {
        expect(node.coding.starterCode, node.examQuestionId).toEqual({});
        expect(node.coding.template.language).toBe("csharp");
        expect(node.coding.template.segments.some(s => s.kind === "editable"), node.examQuestionId).toBe(true);
      } else expect(Object.keys(node.coding.starterCode)).toEqual(["csharp"]);
    }
    expect(versions).toEqual({ 2: 23, 3: 13 });
    // hidden tests per question: at least 3, except where one test is already a whole large run (two of 286 technicians, two of
    // 28 classes, two full leagues) — every count pinned
    expect(counts).toEqual({"CL899371-01-Q01":5,"CL899371-01-Q02":5,"CL899371-01-Q03":5,"CL899371-01-Q04":4,"CL899371-02-Q01":5,"CL899371-03-Q01":5,"CL899371-03-Q02":4,"CL899371-03-Q03":4,"CL899371-03-Q04":4,"CL899371-04-Q01":5,"CL899371-04-Q02":6,"CL899371-04-Q03":5,"CL899371-04-Q04":5,"CL899371-05-Q01":3,"CL899371-05-Q02":3,"CL899371-05-Q03":2,"CL899371-05-Q04":3,"CL899371-06-Q01":4,"CL899371-06-Q02":2,"CL899371-06-Q03":3,"CL899371-06-Q04":3,"CL899371-07-Q01":4,"CL899371-07-Q02":6,"CL899371-07-Q03":5,"CL899371-07-Q04":4,"CL899371-08-Q01":5,"CL899371-08-Q02":4,"CL899371-08-Q03":4,"CL899371-09-Q01":3,"CL899371-09-Q02":2,"CL899371-09-Q03":5,"CL899371-10-Q01":4,"CL899371-10-Q02":4,"CL899371-10-Q03":5,"CL899371-11-Q01":4,"CL899371-11-Q02":4});
  });

  it("the student view carries no hidden test, expected output or reference program", () => {
    for (const id of IDS) {
      const item = readItem(id);
      const view = sanitizeExamForStudent(item.examSnapshot), student = JSON.stringify(view);
      expect(student, id).not.toMatch(/"hiddenTests"|"expectedOutput"|"referenceSolutions"|"comparator"|"weight"/);
      for (const q of view.questions) expect(q.answer ?? {}, q.examQuestionId).toEqual({});
      for (const q of item.examSnapshot.questions) {
        // (a hidden input that equals a PUBLIC sample output is visible by design: ROT13 «uryyb» is the sample output of «hello»)
        const visible = new Set(q.coding.publicTests.flatMap(t => [t.input, t.sampleOutput]));
        for (const t of q.answer.hiddenTests) if (!visible.has(t.input)) expect(student.includes(JSON.stringify(t.input)), q.examQuestionId + " " + t.id + " hidden input").toBe(false);
        if (q.questionTypeVersion === 2) expect(student.includes(JSON.stringify(q.answer.referenceSolutions.csharp)), q.examQuestionId).toBe(false);
      }
    }
  });

  it("the library store reads the items like any other (frozen, same as the file)", () => {
    expect(readLibraryCatalog().filter(e => e.category === "coding-899371").map(e => e.libraryItemId)).toEqual(IDS);
    for (const id of IDS) expect(readLibraryItem(id), id).toEqual(readItem(id));
  });

});

/** A teacher assigns `itemId` by libraryRef (the shared-password identity, single workspace) → the server's frozen assignment. */
async function assignFromLibrary(itemId) {
  const mem = createMemoryContainer({ "platform/classes/c1.json": { classId: "c1", name: "الصف", active: true, status: "active" } });
  const deps = { getContainer: () => mem.container, now: () => "2026-11-09T10:00:00.000Z", ensurePublishedAssignmentIndexed: async () => {}, recordAuditEvent: async () => {}, recordEventSafely: async () => {} };
  const headers = { "x-builder-token": createBuilderToken("teacher") };
  const r = await assignments({ method: "POST", url: "http://x/assignments", params: {}, headers: { get: k => headers[String(k).toLowerCase()] ?? null }, json: async () => ({ action: "create", classId: "c1", title: "واجب", publish: true, examSnapshot: { title: "ignored", questions: [] }, libraryRef: { itemId } }) }, deps);
  expect(r.status, itemId).toBe(200);
  return mem.getJson("platform/assignments/" + r.jsonBody.assignment.assignmentId + ".json");
}
/** The student-side harness of the official pipeline (17C fixture) on that frozen assignment; the runner is a recording double. */
function student(stored) {
  const a = F.assignment({ examSnapshot: stored.examSnapshot, questionCount: stored.questionCount, totalMarks: stored.totalMarks });
  const ctx = F.seed({ a });
  const fetch = F.runnerFetch();
  const sDeps = { container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } }), env: F.ENV, fetch };
  return {
    fetch,
    submit: answers => submission().handler(F.studentRequest(F.submitBody(answers)), sDeps, null),
    callback: body => grading().callbackHandler(F.callbackRequest(body), { getContainer: () => ctx.container, env: F.ENV }, null),
    targets: () => ctx.getJson(F.SUB).attempts.find(x => x.attemptNumber === 1).codingGrading.targets,
  };
}
const answerOf = (node, q, which) => node.questionTypeVersion === 3
  ? { kind: "codeTemplate", language: "csharp", languageVersion: 1, values: which === "reference" ? q.referenceGaps : q.wrongGaps }
  : F.code(B.programOf(q, which), "csharp");

describe("899371 P7 — end to end: assigned by libraryRef, answered, graded officially by the API", () => {
  for (const mid of MIDS) {
    const id = B.itemId(mid);
    it(id + ": one job per question with only tokens and stdin; the reference's evidence earns full marks, the wrong program's less", async () => {
      const stored = await assignFromLibrary(id);
      const pick = n => ({ id: n.examQuestionId, v: n.questionTypeVersion, marks: n.marks, text: n.text, coding: n.coding, answer: n.answer });
      expect(stored.examSnapshot.questions.map(pick)).toEqual(readItem(id).examSnapshot.questions.map(pick));   // the server's frozen copy, keys included
      expect(stored.source).toMatchObject({ kind: "library", itemId: id });
      for (const which of ["reference", "wrong"]) {
        const h = student(stored);
        const answers = Object.fromEntries(stored.examSnapshot.questions.map((node, i) => [node.examQuestionId, answerOf(node, lab[mid][i], which)]));
        expect((await h.submit(answers)).status).toBe(200);
        const jobs = h.fetch.jobs();
        expect(jobs).toHaveLength(stored.examSnapshot.questions.length);
        const secret = /expectedOutput|referenceSolutions|hiddenTests|"weight"/;
        for (const job of jobs) {
          expect(job).toMatchObject({ language: "csharp", languageVersion: 1 });
          expect(job.cases.every(c => Object.keys(c).sort().join() === "stdin,token"), id).toBe(true);
          expect(JSON.stringify(job)).not.toMatch(secret);
          const i = lab[mid].findIndex(q => B.programOf(q, which) === job.source);
          expect(i, id + " the job runs the program the student's answer is").toBeGreaterThanOrEqual(0);
          const q = lab[mid][i], run = runs.runs[B.questionId(mid, i)];
          expect(job.cases.map(c => c.stdin)).toEqual(q.hidden);
          // (an expected output that IS one of the inputs — «no letters here» stays as it is — is necessarily in the job as stdin)
          for (const expected of run.reference.hidden) if (expected.trim().length > 3 && !q.hidden.includes(expected)) expect(JSON.stringify(job).includes(JSON.stringify(expected)), id + " no expected output in the job").toBe(false);
          const outputs = which === "reference" ? run.reference.hidden : run.wrong.hidden;
          expect((await h.callback(F.callbackBody(job, outputs))).status).toBe(200);
          const t = h.targets()[B.questionId(mid, i)];
          expect(t.state, B.questionId(mid, i)).toBe("complete");
          if (which === "reference") expect(t.result.automaticScore, B.questionId(mid, i)).toBe(10);
          else expect(t.result.automaticScore, B.questionId(mid, i)).toBeLessThan(10);
        }
      }
    });
  }

  it("a compile error on a lab question goes to the teacher (reviewRequired), never an automatic zero", async () => {
    for (const id of ["CL899371-01", "CL899371-07"]) {
      const stored = await assignFromLibrary(id);
      const h = student(stored);
      const mid = "m" + id.slice(-2);
      const node = stored.examSnapshot.questions[0];
      expect((await h.submit({ [node.examQuestionId]: answerOf(node, lab[mid][0], "reference") })).status).toBe(200);
      const [job] = h.fetch.jobs();
      expect((await h.callback({ jobId: job.jobId, outcome: "completed", compile: { status: "compile-error", stderr: "error CS1002: ; expected" }, cases: [] })).status).toBe(200);
      expect(h.targets()[node.examQuestionId], id).toMatchObject({ state: "reviewRequired", result: expect.objectContaining({ outcome: "compile-error", reviewRequired: true }) });
    }
  });
});
