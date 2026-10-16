// Phase 21F.7 — the saved-exams list gains ADDITIVE summary fields for «امتحاناتي»: `kind` (structured / legacy), `status`
// (draft / final) and `readiness` (counts only, from the SERVER finalization authority — never an exam body or an answer key).
// The existing fields keep their values, so older clients that ignore the new ones are unaffected.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const saved = require("../src/functions/manage-saved-exams.js");
const { createMemoryContainer } = require("./fixtures/memory-container.js");

const auth = () => ({ ok: true, user: { ver: 2, role: "teacher", sub: "builder", am: "legacy" } });
const req = method => ({ method, url: "http://x/api", headers: { get: () => "" }, json: async () => ({}) });
const tf = (id, text, marks = 1) => ({ examQuestionId: id, presentationType: "trueFalse", marks, text, answer: { correct: true } });
const structured = (id, status, questions) => ({ examId: id, title: "منظّم " + id, status, sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", questions }] });
const doc = (exam, savedAt) => ({ exam, savedAt });

async function list(seed) {
  const mem = createMemoryContainer(seed);
  const res = await saved.handler(req("GET"), { requireBuilderAuth: auth, getContainer: () => mem.container });
  expect(res.status).toBe(200);
  return new Map(res.jsonBody.exams.map(e => [e.examId, e]));
}

describe("21F.7 saved-exams list summary fields", () => {
  it("a ready structured draft: kind, status and readiness counts", async () => {
    const exams = await list({ "exams/A.json": doc(structured("A", "draft", [tf("q1", "عبارة"), tf("q2", "عبارة ثانية", 2)]), "2026-10-02T00:00:00Z") });
    const a = exams.get("A");
    expect(a).toMatchObject({ kind: "structured", status: "draft", questionCount: 2, totalMarks: 3 });
    expect(a.readiness).toEqual({ canFinalize: true, blockers: 0, warnings: expect.any(Number) });
  });
  it("a structured exam with a structural error is not ready; a final one says so", async () => {
    const exams = await list({
      "exams/B.json": doc(structured("B", "draft", [tf("q1", "")]), "2026-10-02T00:00:00Z"),
      "exams/C.json": doc(structured("C", "final", [tf("q1", "عبارة")]), "2026-10-03T00:00:00Z")
    });
    expect(exams.get("B").readiness.canFinalize).toBe(false);
    expect(exams.get("B").readiness.blockers).toBeGreaterThan(0);
    expect(exams.get("C").status).toBe("final");
  });
  it("a legacy flat exam is listed as legacy with no readiness (its editor has no finalization decision)", async () => {
    const exams = await list({ "exams/L.json": doc({ examId: "L", title: "قديم", questions: [{ id: "x", text: "؟" }] }, "2026-10-01T00:00:00Z") });
    expect(exams.get("L")).toMatchObject({ kind: "legacy", status: "draft", readiness: null, questionCount: 1 });
  });
  it("carries counts only: no exam body, question text or answer key leaks into the list", async () => {
    const exams = await list({ "exams/S.json": doc(structured("S", "draft", [tf("q1", "نص سري للسؤال")]), "2026-10-02T00:00:00Z") });
    const json = JSON.stringify(exams.get("S"));
    expect(json).not.toMatch(/نص سري|correct|sections|answer/);
  });
});
