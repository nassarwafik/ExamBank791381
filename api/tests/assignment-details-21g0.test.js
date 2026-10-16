// Phase 21G.0 — the teacher edits an assignment's title and instructions at any time, also after students started. Only those two
// presentation fields change: the exam snapshot, marks, status, timing, attempt policy and every submission stay byte-identical.
// Drives the REAL handler over the in-memory blob container.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const classrooms = require("../src/functions/manage-classrooms.js");
const assignments = require("../src/functions/manage-assignments.js");
const { createMemoryContainer } = require("./fixtures/memory-container.js");

const multi = sub => ({ ok: true, user: { ver: 2, role: "teacher", sub, am: "multi-user" } });
const req = (method, body, url = "http://x/api") => ({ method, url, headers: { get: () => "" }, json: async () => body });
const EXAM = { examId: "", title: "امتحان", questions: [{ id: "q1", type: "trueFalse", text: "عبارة", marks: 1, answer: true }] };

async function setup() {
  const mem = createMemoryContainer();
  const audits = [];
  const deps = auth => ({ requireBuilderAuth: () => auth, container: mem.container, getContainer: () => mem.container, recordAuditEvent: async (_c, ev) => { audits.push(ev); }, ensurePublishedAssignmentIndexed: async () => {}, removePublishedAssignmentFromIndex: async () => {} });
  const A = multi("teacher-a");
  const classId = (await classrooms.handler(req("POST", { action: "create", name: "صف أ", grade: "11", schoolYear: "2026-2027" }), deps(A))).jsonBody.classroom.classId;
  const created = (await assignments.handler(req("POST", { action: "create", classId, title: "واجب", instructions: "قديم", examSnapshot: EXAM, publish: true, dueAt: "2030-01-01T10:00:00Z" }), deps(A))).jsonBody.assignment;
  const id = created.assignmentId;
  // A student already started: a submission exists.
  mem.setJson("platform/submissions/" + id + "/s1.json", { assignmentId: id, studentId: "s1", attempts: [{ attemptNumber: 1, score: 1, totalMarks: 1, finalized: true }] });
  const post = (auth, body) => assignments.handler(req("POST", body), deps(auth));
  return { mem, audits, id, post, A, doc: () => mem.getJson("platform/assignments/" + id + ".json") };
}

describe("21G.0 edit an assignment's title and instructions", () => {
  it("changes only the title and instructions, also after students started", async () => {
    const { mem, id, post, A, doc, audits } = await setup();
    const before = doc();
    const submission = JSON.stringify(mem.getJson("platform/submissions/" + id + "/s1.json"));
    const res = await post(A, { action: "updateDetails", assignmentId: id, title: "  واجب الوحدة الأولى  ", instructions: "اقرأ السؤال جيدًا." });
    expect(res.status).toBe(200);
    expect(res.jsonBody.assignment).toMatchObject({ assignmentId: id, title: "واجب الوحدة الأولى", instructions: "اقرأ السؤال جيدًا." });
    const after = doc();
    const { title: _t1, instructions: _i1, updatedAt: _u1, ...restBefore } = before;
    const { title: _t2, instructions: _i2, updatedAt: _u2, ...restAfter } = after;
    expect(restAfter).toEqual(restBefore);
    expect(JSON.stringify(mem.getJson("platform/submissions/" + id + "/s1.json"))).toBe(submission);
    expect(audits.filter(a => a.action === "assignment.updateDetails")).toEqual([expect.objectContaining({ targetId: id, details: { assignmentId: id, titleChanged: true, instructionsChanged: true } })]);
  });

  it("keeps the instructions when only the title is sent", async () => {
    const { id, post, A, doc } = await setup();
    expect((await post(A, { action: "updateDetails", assignmentId: id, title: "عنوان جديد" })).status).toBe(200);
    expect(doc()).toMatchObject({ title: "عنوان جديد", instructions: "قديم" });
  });

  it("refuses an empty or over-long title and over-long instructions, changing nothing", async () => {
    const { id, post, A, doc } = await setup();
    const before = JSON.stringify(doc());
    for (const body of [{ title: "   " }, { title: 7 }, { title: "x".repeat(201) }, { title: "ok", instructions: "x".repeat(5001) }]) {
      expect((await post(A, { action: "updateDetails", assignmentId: id, ...body })).status).toBe(400);
    }
    expect(JSON.stringify(doc())).toBe(before);
  });

  it("an archived assignment is read-only; a missing or another teacher's assignment is not found", async () => {
    const { id, post, A, doc } = await setup();
    expect((await post(A, { action: "archive", assignmentId: id })).status).toBe(200);
    const archived = await post(A, { action: "updateDetails", assignmentId: id, title: "تغيير" });
    expect(archived.status).toBe(409);
    expect(doc().title).toBe("واجب");
    expect((await post(A, { action: "updateDetails", assignmentId: "no-such", title: "x" })).status).toBe(404);
    expect((await post(multi("teacher-b"), { action: "updateDetails", assignmentId: id, title: "دخيل" })).status).toBe(404);
  });
});
