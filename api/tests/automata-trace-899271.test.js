import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// AUTO-A15b (docs/enterprise-automata-lab-a4.md §23) — «تتبّع الآلات»: the book's own simulators as ready machineTrace@1 questions, 5 Exam
// Library items TR899271-01…05 (one per batch that has simulators). This suite proves: the items are exactly the build of the course
// (regenerating changes no byte); each question is its simulator's machine (canonical keys) and word; repeats and runs past the limit are left
// out — and only those; every node is valid and every item finalizable; the student sees the machines and no key; end to end, a teacher
// assigns an item by libraryRef and the official grader gives each true run, written as a student writes it, every mark.
const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "a15b-automata-trace-test-only-root-secret";   // TEST value — never a real secret
process.env.BUILDER_PASSWORD = "the shared teacher password";
delete process.env.BUILDER_SESSION_SECRET;
delete process.env.BUILDER_USERS;
delete process.env.BUILDER_USER_CODE;
delete process.env.BUILDER_SESSION_VERSION;
delete process.env.LEGACY_DATA_OWNER;

const LIB = path.join(__dirname, "..", "src", "data", "exam-library");
const B = await import("../../scripts/build-899271-automata-trace.mjs");
const { evaluateExamFinalization } = cjs("../src/lib/shared-finalization/examFinalization.js");
const { engineOfTraceMachine, trueTrace, rowOfConfig } = cjs("../src/lib/shared-finalization/machineTraceQuestion.js");
const { sanitizeExamForStudent } = cjs("../src/lib/student-exam-sanitize.js");
const { gradeExam } = cjs("../src/lib/assignment-grading.js");
const { readLibraryCatalog } = cjs("../src/lib/exam-library-store.js");
const { handler: assignments } = await import("../src/functions/manage-assignments.js");
const { createBuilderToken } = await import("../src/lib/builder-auth.js");

const IDS = [1, 2, 3, 4, 5].map(B.itemId);
const readItem = id => JSON.parse(fs.readFileSync(path.join(LIB, "items", id + ".json"), "utf8"));
const catalogFile = () => JSON.parse(fs.readFileSync(path.join(LIB, "catalog.json"), "utf8"));
const qs = item => item.examSnapshot.sections.flatMap(s => s.questions);
const sims = B.readSimulators();
const built = B.buildTrace(sims);
const ALL = IDS.flatMap(id => qs(readItem(id)));
const keyAnswer = q => { const m = engineOfTraceMachine(q.machineTrace.machine), run = trueTrace(m, [...q.machineTrace.word]); return { kind: "machineTrace", rows: run.rows.map(c => rowOfConfig(m, c)), verdict: run.verdict }; };

describe("AUTO-A15b — the trace exams are exactly the build of the course's simulators", () => {
  it("91 simulators → 86 questions (4 repeats and 1 run past the limit left out) in 5 items of 33 / 31 / 7 / 10 / 5; headers = catalog entries", () => {
    expect(sims).toHaveLength(91);
    expect(sims.filter(s => !s.ok).map(s => [s.id, s.reason])).toEqual([
      ...sims.filter(s => s.reason === "repeat").map(s => [s.id, "repeat"]),
      ["m10-l04-p01-b03", "TRACE_RUN_TOO_LONG"],
    ].sort((a, b) => sims.findIndex(s => s.id === a[0]) - sims.findIndex(s => s.id === b[0])));
    expect(sims.filter(s => s.reason === "repeat")).toHaveLength(4);
    expect(fs.readdirSync(path.join(LIB, "items")).filter(f => f.startsWith("TR899271-")).sort()).toEqual(IDS.map(id => id + ".json"));
    const ours = catalogFile().filter(e => e.source?.repository === B.REPOSITORY);
    expect(ours.map(e => e.libraryItemId)).toEqual(IDS);
    for (const e of ours) { const { schemaVersion, examSnapshot, ...header } = readItem(e.libraryItemId); expect([schemaVersion, header]).toEqual([1, e]); void examSnapshot; }
    expect(IDS.map(id => qs(readItem(id)).length)).toEqual([33, 31, 7, 10, 5]);
    expect(ours.every(e => e.category === "trace-899271" && e.totalMarks === e.questionCount * 4)).toBe(true);
  });
  it("regenerating changes no byte; the catalog merge keeps every other source", () => {
    const catalog = catalogFile();
    for (const b of built) {
      expect(b.problems, b.entry.libraryItemId).toEqual([]);
      expect(JSON.stringify(b.item, null, 2)).toBe(fs.readFileSync(path.join(LIB, "items", b.entry.libraryItemId + ".json"), "utf8"));
      expect(catalog.find(e => e.libraryItemId === b.entry.libraryItemId)).toEqual(b.entry);
    }
    expect(B.mergeCatalog(catalog, built.map(b => b.entry))).toEqual(catalog);
  });
  it("each question is its simulator: the machine with canonical keys only, its first word; the text names the machine and the word", () => {
    const kept = sims.filter(s => s.ok);
    expect(ALL.map(q => q.sourceQuestionId)).toEqual(kept.map(s => s.id));
    ALL.forEach((q, i) => {
      expect(q.machineTrace).toEqual({ v: 1, machine: kept[i].machine, word: kept[i].word });
      expect(Object.keys(q.machineTrace.machine).every(k => ["kind", "states", "alphabet", "start", "accept", "transitions", "bottom", "stackAlphabet", "blank", "tapeAlphabet", "leftEnd"].includes(k))).toBe(true);
      expect(q.answer).toEqual({});
      expect(q.text).toContain("على الكلمة " + (kept[i].word === "" ? "ε" : kept[i].word));
      expect((q.text.match(/تتبّع/g) || []).length, q.examQuestionId).toBe(1);
    });
    const kinds = {};
    for (const q of ALL) kinds[q.machineTrace.machine.kind] = (kinds[q.machineTrace.machine.kind] ?? 0) + 1;
    expect(kinds).toEqual({ DFA: 47, NFA: 19, PDA: 8, TM: 12 });
  });
  it("every item is a finalizable structured exam; the student sees the machines and the words, no key", () => {
    for (const id of IDS) {
      const item = readItem(id);
      expect(evaluateExamFinalization(item.examSnapshot).canFinalize, id).toBe(true);
      const view = sanitizeExamForStudent(item.examSnapshot);
      expect(view.sections.flatMap(s => s.questions).map(q => [q.machineTrace, q.answer ?? {}])).toEqual(qs(item).map(q => [q.machineTrace, {}]));
    }
    expect(readLibraryCatalog().filter(e => e.category === "trace-899271").map(e => e.libraryItemId)).toEqual(IDS);
  });
});

async function assignFromLibrary(itemId) {
  const mem = createMemoryContainer({ "platform/classes/c1.json": { classId: "c1", name: "الصف", active: true, status: "active" } });
  const deps = { getContainer: () => mem.container, now: () => "2026-11-26T20:00:00.000Z", ensurePublishedAssignmentIndexed: async () => {}, recordAuditEvent: async () => {}, recordEventSafely: async () => {} };
  const headers = { "x-builder-token": createBuilderToken("teacher") };
  const r = await assignments({ method: "POST", url: "http://x/assignments", params: {}, headers: { get: k => headers[String(k).toLowerCase()] ?? null }, json: async () => ({ action: "create", classId: "c1", title: "واجب", publish: true, examSnapshot: { title: "ignored", questions: [] }, libraryRef: { itemId } }) }, deps);
  expect(r.status, itemId).toBe(200);
  return mem.getJson("platform/assignments/" + r.jsonBody.assignment.assignmentId + ".json");
}

describe("AUTO-A15b — end to end: assigned by libraryRef, every true run earns every mark", () => {
  for (const id of IDS) {
    it(id, async () => {
      const stored = await assignFromLibrary(id), item = readItem(id);
      expect(stored.examSnapshot.sections.flatMap(s => s.questions)).toEqual(qs(item));
      const answers = Object.fromEntries(qs(item).map(q => [q.examQuestionId, keyAnswer(q)]));
      const r = gradeExam(stored.examSnapshot, answers);
      expect([r.score, r.totalMarks, r.manualReviewMarks]).toEqual([item.totalMarks, item.totalMarks, 0]);
    });
  }
});
