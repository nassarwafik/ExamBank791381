// Class gradebook GB6 (docs/enterprise-class-gradebook-gb.md §4.8) — approving a part and the final mark, through the REAL handlers
// (classes, students, assignments, gradebook, student gradebook) over the in-memory container.
//
// The invariants first (AGENTS.md §10): a part is approved only when COMPLETE (a result awaiting review, a missing submission or a missing
// typed mark blocks it — only a mark or the teacher's explicit «صفر» / «معفى» counts) and only when its assignments' results are released;
// an approved part is locked (cells, columns), the final locks the whole scheme; reopening is explicit, needs a reason, and is audited;
// students see the FROZEN snapshot of approved parts only — their own row, never a live value, never a part whose results are hidden
// again. Then: idempotent approval, stale scheme revision, drift after approval, tenancy, archived class, corrupt documents (503).
// TEST data only.
import { describe, it, expect, beforeAll } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const classrooms = require("../src/functions/manage-classrooms.js");
const students = require("../src/functions/manage-students.js");
const assignments = require("../src/functions/manage-assignments.js");
const gradebook = require("../src/functions/class-gradebook.js");
const studentGradebook = require("../src/functions/student-gradebook.js");
const { createStudentToken } = require("../src/lib/student-auth.js");
const { capabilityFor } = require("../src/lib/access/route-capabilities.js");
const { createMemoryContainer } = require("./fixtures/memory-container.js");

beforeAll(() => { process.env.STUDENT_SESSION_SECRET = "gb6-test-student-secret"; });

const multi = sub => ({ ok: true, user: { ver: 2, role: "teacher", sub, am: "multi-user" } });
const req = (method, body, url = "http://x/api/class-gradebook", headers = {}) => ({ method, url, headers: { get: n => headers[n] || "" }, json: async () => body });
const EXAM = { examId: "", title: "امتحان", questions: [{ id: "q1", type: "trueFalse", text: "عبارة", marks: 1, answer: true }] };
const attempt = (n, score, total = 10, extra = {}) => ({ attemptNumber: n, score, totalMarks: total, percentage: (score / total) * 100, submittedAt: "2026-10-1" + n + "T08:00:00.000Z", finalized: true, manualReviewMarks: 0, ...extra });
const ALL = { ok: true, has: () => true };
const REASON = "تصحيح خطأ في رصد علامة";

async function setup() {
  const mem = createMemoryContainer();
  const audit = [];
  const deps = (auth, extra = {}) => ({ requireBuilderAuth: () => auth, container: mem.container, getContainer: () => mem.container, recordAuditEvent: async (_c, e) => { audit.push(e); }, ensurePublishedAssignmentIndexed: async () => {}, removePublishedAssignmentFromIndex: async () => {}, sessionGrants: async () => ALL, ...extra });
  const A = multi("teacher-a"), B = multi("teacher-b");
  const mkClass = async (auth, name) => (await classrooms.handler(req("POST", { action: "create", name, grade: "11", schoolYear: "2026-2027" }), deps(auth))).jsonBody.classroom.classId;
  const mkStudent = async (auth, classId, firstName, identityNumber) => (await (students.handler || students.manageStudentsHandler)(req("POST", { action: "create", classId, firstName, familyName: "الطالب", identityNumber, password: "secret-123" }), deps(auth))).jsonBody.student.userId;
  const mkAssignment = async (auth, classId, title) => (await assignments.handler(req("POST", { action: "create", classId, title, examSnapshot: EXAM, publish: true }), deps(auth))).jsonBody.assignment.assignmentId;
  const a1 = await mkClass(A, "صف أ"), b1 = await mkClass(B, "صف ب");
  const s1 = await mkStudent(A, a1, "سارة", "111111111"), s2 = await mkStudent(A, a1, "أحمد", "222222222"), s3 = await mkStudent(A, a1, "باسل", "333333333");
  const sB = await mkStudent(B, b1, "تالا", "444444444");
  const hw = await mkAssignment(A, a1, "الوظيفة 1"), ex = await mkAssignment(A, a1, "امتحان 1");
  const sub = (aid, sid, doc) => mem.setJson("platform/submissions/" + aid + "/" + sid + ".json", { assignmentId: aid, studentId: sid, ...doc });
  sub(hw, s1, { attempts: [attempt(1, 8)] });                                                   // 80
  sub(hw, s2, { attempts: [attempt(1, 6)] });                                                   // 60
  sub(hw, s3, { attempts: [attempt(1, 5, 10, { finalized: false, manualReviewMarks: 2 })] });   // pending review
  sub(ex, s1, { attempts: [attempt(1, 18, 20)] });                                              // 90
  sub(ex, s2, { attempts: [attempt(1, 14, 20)] });                                              // 70 — s3 has no submission
  const get = async (auth = A, classId = a1, extra = {}) => gradebook.handler(req("GET", null, "http://x/api/class-gradebook?classId=" + classId), deps(auth, extra));
  const post = async (body, auth = A, extra = {}) => gradebook.handler(req("POST", { classId: a1, ...body }), deps(auth, extra));
  const SCHEME = {
    categories: [
      { categoryId: "monthly", title: "الشهري", weight: 30, items: [{ itemId: "i_hw", weight: 100, source: { kind: "assignment", assignmentId: hw } }] },
      { categoryId: "term", title: "الفصل", weight: 70, items: [{ itemId: "i_ex", weight: 60, source: { kind: "assignment", assignmentId: ex } }, { itemId: "paper", weight: 40, source: { kind: "manual", title: "ورقي", maxScore: 20 } }] }
    ]
  };
  const saved = await post({ action: "scheme.save", etag: null, scheme: SCHEME });
  expect(saved.jsonBody).toMatchObject({ ok: true, revision: 1, status: "active" });
  const entries = async items => post({ action: "entries.save", items });
  const asStudent = async (studentId, extra = {}) => {
    const u = mem.getJson("platform/users/" + studentId + ".json");
    const token = createStudentToken({ userId: studentId, authVersion: u.authVersion, code: u.code, displayName: u.displayName, classId: u.classId });
    return studentGradebook.handler(req("GET", null, "http://x/api/student-gradebook", { "x-student-token": token }), { container: mem.container, getContainer: () => mem.container, ...extra });
  };
  const setAssignment = (id, patch) => { const n = "platform/assignments/" + id + ".json"; mem.setJson(n, { ...mem.getJson(n), ...patch }); };
  const approvals = () => mem.getJson("platform/gradebooks/" + a1 + "/approvals.json");
  return { mem, audit, A, B, a1, b1, s1, s2, s3, sB, hw, ex, get, post, entries, asStudent, setAssignment, approvals, SCHEME, sub };
}
/** Completes the monthly part: s3's result awaiting review gets the teacher's explicit decision. */
const completeMonthly = s => s.entries([{ itemId: "i_hw", studentId: s.s3, expected: null, value: { decision: "zero" } }]);
/** Completes the term part: s3 excused from the exam, a typed mark for everyone on paper. */
const completeTerm = s => s.entries([
  { itemId: "i_ex", studentId: s.s3, expected: null, value: { decision: "excused" } },
  { itemId: "paper", studentId: s.s1, expected: null, value: { score: 20 } },
  { itemId: "paper", studentId: s.s2, expected: null, value: { score: 10 } },
  { itemId: "paper", studentId: s.s3, expected: null, value: { score: 15 } }
]);

describe("GB6 — a part is approved only when it is complete and released (never a manufactured zero)", () => {
  it("the gradebook says why each part cannot be approved yet: a result awaiting review, a missing submission, missing typed marks", async () => {
    const s = await setup();
    const g = (await s.get()).jsonBody;
    expect(g.approvals).toMatchObject({ revision: 0, parts: {}, final: null, history: [] });
    expect(g.readiness.parts.monthly).toMatchObject({ ready: false, issues: [{ code: "PART_INCOMPLETE", cells: 1, students: 1 }] });
    expect(g.readiness.parts.term).toMatchObject({ ready: false, issues: [{ code: "PART_INCOMPLETE", cells: 4, students: 3 }] });
    expect(g.readiness.final.ready).toBe(false);
    expect(g.readiness.final.issues.map(i => i.code)).toEqual(["PARTS_NOT_APPROVED", "FINAL_INCOMPLETE"]);
  });
  it("approving an incomplete part is refused (409) and writes nothing — a result awaiting review is never turned into a mark", async () => {
    const s = await setup();
    const r = await s.post({ action: "part.approve", categoryId: "monthly", schemeRevision: 1 });
    expect(r.status).toBe(409);
    expect(r.jsonBody).toMatchObject({ ok: false, code: "PART_NOT_READY", issues: [{ code: "PART_INCOMPLETE", cells: 1 }] });
    expect(s.approvals()).toBeNull();
    expect(s.audit.some(e => e.action === "gradebook.part.approve")).toBe(false);
  });
  it("the teacher's explicit decision completes it; the approval freezes every student's cells and part mark", async () => {
    const s = await setup();
    await completeMonthly(s);
    const r = await s.post({ action: "part.approve", categoryId: "monthly", schemeRevision: 1 });
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ ok: true, revision: 1, categoryId: "monthly" });
    const doc = s.approvals();
    expect(doc.parts.monthly).toMatchObject({ approvedBy: "teacher-a", schemeRevision: 1 });
    expect(doc.parts.monthly.snapshot.items).toEqual([{ itemId: "i_hw", weight: 100, source: { kind: "assignment", assignmentId: s.hw }, title: "الوظيفة 1" }]);
    expect(doc.parts.monthly.snapshot.students).toEqual({
      [s.s1]: { value: 80, cells: { i_hw: { state: "graded", percent: 80 } } },
      [s.s2]: { value: 60, cells: { i_hw: { state: "graded", percent: 60 } } },
      [s.s3]: { value: 0, cells: { i_hw: { state: "zero", percent: 0 } } }
    });
    expect(doc.history).toEqual([expect.objectContaining({ action: "part.approve", categoryId: "monthly", by: "teacher-a" })]);
    expect(s.audit.filter(e => e.action === "gradebook.part.approve").map(e => e.details)).toEqual([expect.objectContaining({ classId: s.a1, categoryId: "monthly", students: 3, items: 1 })]);
    const g = (await s.get()).jsonBody;
    expect(g.approvals.parts.monthly).toMatchObject({ schemeRevision: 1, drift: { structure: false, students: 0 } });
    expect(g.readiness.parts.monthly).toBeUndefined();
    expect(JSON.stringify(g.approvals)).not.toContain("teacher-a");          // who approved is in the audit, not on the page
  });
  it("results not yet released to students block the approval, even when the part is complete", async () => {
    const s = await setup();
    await completeMonthly(s);
    s.setAssignment(s.hw, { resultsRelease: "manual" });
    const r = await s.post({ action: "part.approve", categoryId: "monthly", schemeRevision: 1 });
    expect(r.status).toBe(409);
    expect(r.jsonBody.issues).toEqual([expect.objectContaining({ code: "RESULTS_NOT_RELEASED", itemIds: ["i_hw"] })]);
    s.setAssignment(s.hw, { resultsReleasedAt: "2026-11-01T08:00:00.000Z" });
    expect((await s.post({ action: "part.approve", categoryId: "monthly", schemeRevision: 1 })).status).toBe(200);
  });
  it("a repeated approval changes nothing; a stale scheme revision, an unknown part or a missing revision is refused", async () => {
    const s = await setup();
    await completeMonthly(s);
    expect((await s.post({ action: "part.approve", categoryId: "monthly", schemeRevision: 2 })).jsonBody.code).toBe("STALE_SCHEME");
    expect((await s.post({ action: "part.approve", categoryId: "nope", schemeRevision: 1 })).status).toBe(404);
    expect((await s.post({ action: "part.approve", categoryId: "monthly" })).status).toBe(400);
    expect(s.approvals()).toBeNull();
    await s.post({ action: "part.approve", categoryId: "monthly", schemeRevision: 1 });
    const before = JSON.stringify(s.approvals());
    const again = await s.post({ action: "part.approve", categoryId: "monthly", schemeRevision: 1 });
    expect(again.jsonBody).toMatchObject({ ok: true, unchanged: true });
    expect(JSON.stringify(s.approvals())).toBe(before);
    expect(s.audit.filter(e => e.action === "gradebook.part.approve")).toHaveLength(1);
  });
});

describe("GB6 — an approved part is locked; reopening is explicit, with a reason, and audited", () => {
  it("its cells cannot be changed (409, nothing written); other parts stay editable", async () => {
    const s = await setup();
    await completeMonthly(s);
    await s.post({ action: "part.approve", categoryId: "monthly", schemeRevision: 1 });
    const entriesBefore = JSON.stringify(s.mem.getJson("platform/gradebooks/" + s.a1 + "/entries.json"));
    const r = await s.entries([{ itemId: "paper", studentId: s.s1, expected: null, value: { score: 5 } }, { itemId: "i_hw", studentId: s.s3, expected: { decision: "zero" }, value: { decision: "excused" } }]);
    expect(r.status).toBe(409);
    expect(r.jsonBody).toMatchObject({ code: "PART_APPROVED", errors: [{ index: 1, categoryId: "monthly" }] });
    expect(JSON.stringify(s.mem.getJson("platform/gradebooks/" + s.a1 + "/entries.json"))).toBe(entriesBefore);
    expect((await s.entries([{ itemId: "paper", studentId: s.s1, expected: null, value: { score: 5 } }])).status).toBe(200);
  });
  it("its columns cannot be changed or removed; another part and the part weights can (until the final is approved)", async () => {
    const s = await setup();
    await completeMonthly(s);
    await s.post({ action: "part.approve", categoryId: "monthly", schemeRevision: 1 });
    const etag = (await s.get()).jsonBody.etags.scheme;
    const save = scheme => s.post({ action: "scheme.save", etag, scheme });
    const monthly = s.SCHEME.categories[0], term = s.SCHEME.categories[1];
    const changedItem = { ...monthly, items: [{ ...monthly.items[0], weight: 50 }, { itemId: "extra", weight: 50, source: { kind: "manual", title: "إضافي", maxScore: 10 } }] };
    for (const scheme of [{ categories: [changedItem, term] }, { categories: [{ ...term, weight: 100 }] }]) {
      const r = await save(scheme);
      expect(r.status).toBe(409);
      expect(r.jsonBody).toMatchObject({ code: "PART_APPROVED", categoryIds: ["monthly"] });
    }
    expect(s.mem.getJson("platform/gradebooks/" + s.a1 + "/scheme.json").revision).toBe(1);
    const ok = await save({ categories: [{ ...monthly, title: "الشهري الأول", weight: 40 }, { ...term, weight: 60, items: [{ ...term.items[0], weight: 50 }, { ...term.items[1], weight: 50 }] }] });
    expect(ok.jsonBody).toMatchObject({ ok: true, revision: 2 });
  });
  it("reopen needs a reason; it unlocks the part, is kept in the history and the audit (with the reason)", async () => {
    const s = await setup();
    await completeMonthly(s);
    await s.post({ action: "part.approve", categoryId: "monthly", schemeRevision: 1 });
    for (const reason of [undefined, "", "  ", "اب", "x".repeat(301)]) expect((await s.post({ action: "part.reopen", categoryId: "monthly", reason })).jsonBody.code).toBe("REASON_REQUIRED");
    expect((await s.post({ action: "part.reopen", categoryId: "term", reason: REASON })).jsonBody.code).toBe("NOT_APPROVED");
    const r = await s.post({ action: "part.reopen", categoryId: "monthly", reason: REASON });
    expect(r.jsonBody).toMatchObject({ ok: true, revision: 2 });
    expect(s.approvals().parts).toEqual({});
    expect(s.approvals().history.map(h => [h.action, h.reason])).toEqual([["part.approve", undefined], ["part.reopen", REASON]]);
    expect(s.audit.filter(e => e.action === "gradebook.part.reopen").map(e => e.details)).toEqual([expect.objectContaining({ categoryId: "monthly", reason: REASON, previous: expect.objectContaining({ schemeRevision: 1 }) })]);
    expect((await s.get()).jsonBody.approvals.history.map(h => h.action)).toEqual(["part.approve", "part.reopen"]);
    expect((await s.entries([{ itemId: "i_hw", studentId: s.s3, expected: { decision: "zero" }, value: { decision: "excused" } }])).status).toBe(200);
  });
  it("a mark that changes after approval (a regrade) is shown as drift; the approved value stays frozen; the final is refused until reapproved", async () => {
    const s = await setup();
    await completeMonthly(s); await completeTerm(s);
    await s.post({ action: "part.approve", categoryId: "monthly", schemeRevision: 1 });
    await s.post({ action: "part.approve", categoryId: "term", schemeRevision: 1 });
    s.sub(s.hw, s.s1, { attempts: [attempt(1, 10)] });                              // regraded in the assignment: 80 → 100
    const g = (await s.get()).jsonBody;
    expect(g.approvals.parts.monthly.drift).toEqual({ structure: false, students: 1 });
    expect(g.approvals.parts.term.drift).toEqual({ structure: false, students: 0 });
    expect(s.approvals().parts.monthly.snapshot.students[s.s1].value).toBe(80);
    const mine = (await s.asStudent(s.s1)).jsonBody.classes[0].parts.find(p => p.categoryId === "monthly");
    expect(mine.display).toBe(80);
    const f = await s.post({ action: "final.approve", schemeRevision: 1 });
    expect(f.status).toBe(409);
    expect(f.jsonBody.issues).toEqual([expect.objectContaining({ code: "PART_DRIFT", categoryIds: ["monthly"] })]);
    await s.post({ action: "part.reopen", categoryId: "monthly", reason: REASON });
    await s.post({ action: "part.approve", categoryId: "monthly", schemeRevision: 1 });
    expect((await s.post({ action: "final.approve", schemeRevision: 1 })).status).toBe(200);
  });
  it("a student who joins the class after the approval is drift too (their row was never approved)", async () => {
    const s = await setup();
    await completeMonthly(s);
    await s.post({ action: "part.approve", categoryId: "monthly", schemeRevision: 1 });
    await (students.handler || students.manageStudentsHandler)(req("POST", { action: "create", classId: s.a1, firstName: "جديد", familyName: "الطالب", identityNumber: "555555555", password: "secret-123" }),
      { requireBuilderAuth: () => s.A, container: s.mem.container, getContainer: () => s.mem.container, recordAuditEvent: async () => {}, sessionGrants: async () => ALL });
    expect((await s.get()).jsonBody.approvals.parts.monthly.drift).toEqual({ structure: false, students: 1 });
  });
});

describe("GB6 — the final mark", () => {
  it("needs every part approved; then it is frozen and locks the whole scheme and every part; reopening it comes first", async () => {
    const s = await setup();
    await completeMonthly(s); await completeTerm(s);
    await s.post({ action: "part.approve", categoryId: "monthly", schemeRevision: 1 });
    const early = await s.post({ action: "final.approve", schemeRevision: 1 });
    expect(early.jsonBody).toMatchObject({ code: "FINAL_NOT_READY", issues: [{ code: "PARTS_NOT_APPROVED", categoryIds: ["term"] }] });
    await s.post({ action: "part.approve", categoryId: "term", schemeRevision: 1 });
    const r = await s.post({ action: "final.approve", schemeRevision: 1 });
    expect(r.status).toBe(200);
    // s1: monthly 80, term (90·60 + 100·40)/100 = 94 → 80·0.3 + 94·0.7 = 89.8 ; s3: monthly 0, term paper only 75 → 52.5
    const fin = s.approvals().final.snapshot;
    expect(fin.weights).toEqual({ monthly: 30, term: 70 });
    expect(fin.students[s.s1].value).toBeCloseTo(89.8, 9);
    expect(fin.students[s.s3].value).toBeCloseTo(52.5, 9);
    expect(s.audit.filter(e => e.action === "gradebook.final.approve")).toHaveLength(1);
    const etag = (await s.get()).jsonBody.etags.scheme;
    expect((await s.post({ action: "scheme.save", etag, scheme: s.SCHEME })).jsonBody.code).toBe("FINAL_APPROVED");
    expect((await s.post({ action: "part.reopen", categoryId: "term", reason: REASON })).jsonBody.code).toBe("FINAL_APPROVED");
    expect((await s.post({ action: "final.reopen" })).jsonBody.code).toBe("REASON_REQUIRED");
    expect((await s.post({ action: "final.reopen", reason: REASON })).jsonBody.ok).toBe(true);
    expect(s.approvals().final).toBeNull();
    expect(s.audit.filter(e => e.action === "gradebook.final.reopen").map(e => e.details.reason)).toEqual([REASON]);
    expect((await s.post({ action: "final.reopen", reason: REASON })).jsonBody.code).toBe("NOT_APPROVED");
  });
});

describe("GB6 — students see approved parts only: their own row, frozen, and only while results are released", () => {
  it("nothing before an approval; then the approved part with their own items; another class's student sees nothing", async () => {
    const s = await setup();
    let r = await s.asStudent(s.s1);
    expect(r.status).toBe(200);
    expect(r.headers["Cache-Control"]).toBe("no-store");
    expect(r.jsonBody).toEqual({ ok: true, classes: [] });
    await completeMonthly(s); await completeTerm(s);
    await s.post({ action: "part.approve", categoryId: "monthly", schemeRevision: 1 });
    r = await s.asStudent(s.s3);
    expect(r.jsonBody.classes).toEqual([{
      classId: s.a1, className: "صف أ", final: null,
      parts: [{ categoryId: "monthly", title: "الشهري", weight: 30, approvedAt: expect.any(String), value: 0, display: 0,
        items: [{ itemId: "i_hw", title: "الوظيفة 1", weight: 100, kind: "assignment", state: "zero", display: 0 }] }]
    }]);
    const body = JSON.stringify(r.jsonBody);
    for (const other of [s.s1, s.s2, "teacher-a", "term"]) expect(body).not.toContain(other);        // no other row, no open part
    expect((await s.asStudent(s.sB)).jsonBody.classes).toEqual([]);
  });
  it("the final once approved; a part whose results are hidden again is withheld, and the final with it", async () => {
    const s = await setup();
    await completeMonthly(s); await completeTerm(s);
    for (const categoryId of ["monthly", "term"]) await s.post({ action: "part.approve", categoryId, schemeRevision: 1 });
    await s.post({ action: "final.approve", schemeRevision: 1 });
    let c = (await s.asStudent(s.s1)).jsonBody.classes[0];
    expect(c.parts.map(p => [p.categoryId, p.display])).toEqual([["monthly", 80], ["term", 94]]);
    expect(c.final).toMatchObject({ display: 89.8 });
    s.setAssignment(s.hw, { resultsRelease: "manual", resultsReleasedAt: "" });
    c = (await s.asStudent(s.s1)).jsonBody.classes[0];
    expect(c.parts.map(p => p.categoryId)).toEqual(["term"]);
    expect(c.final).toBeNull();
  });
  it("a reopened part disappears from the student's page", async () => {
    const s = await setup();
    await completeMonthly(s);
    await s.post({ action: "part.approve", categoryId: "monthly", schemeRevision: 1 });
    expect((await s.asStudent(s.s1)).jsonBody.classes).toHaveLength(1);
    await s.post({ action: "part.reopen", categoryId: "monthly", reason: REASON });
    expect((await s.asStudent(s.s1)).jsonBody.classes).toEqual([]);
  });
  it("no session, a forged token or an archived account: 401 and nothing read", async () => {
    const s = await setup();
    const anon = await studentGradebook.handler(req("GET", null, "http://x/api/student-gradebook"), { container: s.mem.container });
    expect(anon.status).toBe(401);
    const forged = await studentGradebook.handler(req("GET", null, "http://x/api/student-gradebook", { "x-student-token": "a.b.c" }), { container: s.mem.container });
    expect(forged.status).toBe(401);
    const n = "platform/users/" + s.s1 + ".json";
    const token = createStudentToken({ userId: s.s1, authVersion: s.mem.getJson(n).authVersion });
    s.mem.setJson(n, { ...s.mem.getJson(n), archived: true });
    expect((await studentGradebook.handler(req("GET", null, "http://x/api/student-gradebook", { "x-student-token": token }), { container: s.mem.container })).status).toBe(401);
  });
});

describe("GB6 — authority, tenancy, the archived class and corrupt documents", () => {
  it("approving and reopening are publishing results: assignments.results.release", () => {
    for (const action of ["part.approve", "part.reopen", "final.approve", "final.reopen"]) expect(capabilityFor("class-gradebook.js", action)).toBe("assignments.results.release");
  });
  it("another teacher's class is missing (404) and nothing is written; an archived class cannot be approved", async () => {
    const s = await setup();
    await completeMonthly(s);
    expect((await s.post({ action: "part.approve", categoryId: "monthly", schemeRevision: 1 }, s.B)).status).toBe(404);
    expect(s.approvals()).toBeNull();
    const n = "platform/classes/" + s.a1 + ".json";
    s.mem.setJson(n, { ...s.mem.getJson(n), status: "archived" });
    expect((await s.post({ action: "part.approve", categoryId: "monthly", schemeRevision: 1 })).jsonBody.code).toBe("CLASS_ARCHIVED");
    expect(s.approvals()).toBeNull();
  });
  it("a corrupt approvals document is a 503 everywhere — never read as «nothing approved», never overwritten", async () => {
    const s = await setup();
    await completeMonthly(s);
    const n = "platform/gradebooks/" + s.a1 + "/approvals.json";
    s.mem.setJson(n, { parts: { monthly: { snapshot: "broken" } } });
    expect((await s.get()).status).toBe(503);
    expect((await s.entries([{ itemId: "i_hw", studentId: s.s3, expected: { decision: "zero" }, value: { decision: "excused" } }])).status).toBe(503);
    expect((await s.post({ action: "scheme.save", etag: "any", scheme: s.SCHEME })).status).toBe(503);      // checked before the etag
    expect((await s.post({ action: "part.approve", categoryId: "monthly", schemeRevision: 1 })).status).toBe(503);
    expect((await s.post({ action: "part.reopen", categoryId: "monthly", reason: REASON })).status).toBe(503);
    expect((await s.asStudent(s.s1)).status).toBe(503);
    expect(s.mem.getJson(n)).toEqual({ parts: { monthly: { snapshot: "broken" } } });
  });
});
