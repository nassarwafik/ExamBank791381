// Class gradebook GB2 (docs/enterprise-class-gradebook-gb.md §4.1, §4.5) — the class-gradebook route, driven through the REAL handlers
// (classes, students, assignments, gradebook) over the in-memory container. Covers: the empty gradebook, saving the scheme with its ETag
// (create-only, stale → 409), source validation, the computed rows, the manual marks and decisions with their per-cell stale guard,
// tenancy (another teacher's class is missing and untouched), the archived class (read-only), storage errors (503, never an empty
// gradebook), reads limited to the assignments of the scheme, project columns (withheld without projects.tracker.view), and an output
// that carries marks and states only. TEST data only.
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const classrooms = require("../src/functions/manage-classrooms.js");
const students = require("../src/functions/manage-students.js");
const assignments = require("../src/functions/manage-assignments.js");
const gradebook = require("../src/functions/class-gradebook.js");
const { createMemoryContainer } = require("./fixtures/memory-container.js");

const multi = sub => ({ ok: true, user: { ver: 2, role: "teacher", sub, am: "multi-user" } });
const req = (method, body, url = "http://x/api/class-gradebook") => ({ method, url, headers: { get: () => "" }, json: async () => body });
const EXAM = { examId: "", title: "امتحان", questions: [{ id: "q1", type: "trueFalse", text: "عبارة", marks: 1, answer: true }] };
const attempt = (n, score, total = 10, extra = {}) => ({ attemptNumber: n, score, totalMarks: total, percentage: (score / total) * 100, submittedAt: "2026-10-1" + n + "T08:00:00.000Z", finalized: true, manualReviewMarks: 0, ...extra });
const ALL = { ok: true, has: () => true };
const NO_PROJECTS = { ok: true, has: c => c !== "projects.tracker.view" };

async function setup() {
  const mem = createMemoryContainer();
  const audit = [];
  const deps = (auth, extra = {}) => ({ requireBuilderAuth: () => auth, container: mem.container, getContainer: () => mem.container, recordAuditEvent: async (_c, e) => { audit.push(e); }, ensurePublishedAssignmentIndexed: async () => {}, removePublishedAssignmentFromIndex: async () => {}, sessionGrants: async () => ALL, ...extra });
  const A = multi("teacher-a"), B = multi("teacher-b");
  const mkClass = async (auth, name) => (await classrooms.handler(req("POST", { action: "create", name, grade: "11", schoolYear: "2026-2027" }), deps(auth))).jsonBody.classroom.classId;
  const mkStudent = async (auth, classId, firstName, identityNumber) => (await (students.handler || students.manageStudentsHandler)(req("POST", { action: "create", classId, firstName, familyName: "الطالب", identityNumber, password: "secret-123" }), deps(auth))).jsonBody.student.userId;
  const mkAssignment = async (auth, classId, title, publish) => (await assignments.handler(req("POST", { action: "create", classId, title, examSnapshot: EXAM, publish }), deps(auth))).jsonBody.assignment.assignmentId;
  const a1 = await mkClass(A, "صف أ"), b1 = await mkClass(B, "صف ب");
  const s1 = await mkStudent(A, a1, "سارة", "111111111"), s2 = await mkStudent(A, a1, "أحمد", "222222222"), s3 = await mkStudent(A, a1, "باسل", "333333333");
  const sB = await mkStudent(B, b1, "تالا", "444444444");
  const hw = await mkAssignment(A, a1, "الوظيفة 1", true), ex = await mkAssignment(A, a1, "امتحان 1", true), draft = await mkAssignment(A, a1, "مسودة", false), unused = await mkAssignment(A, a1, "غير مستعمل", true);
  const other = await mkAssignment(B, b1, "واجب ب", true);
  const sub = (aid, sid, doc) => mem.setJson("platform/submissions/" + aid + "/" + sid + ".json", { assignmentId: aid, studentId: sid, ...doc });
  sub(hw, s1, { attempts: [attempt(1, 8)] });                                          // 80
  sub(hw, s2, { attempts: [attempt(1, 9), attempt(2, 6)] });                           // latest 60 (D1)
  sub(hw, s3, { attempts: [attempt(1, 5, 10, { finalized: false, manualReviewMarks: 2 })] });   // pending review
  sub(ex, s1, { attempts: [attempt(1, 18, 20)] });                                     // 90
  sub(ex, s2, { attempts: [attempt(1, 14, 20)] });                                     // 70
  sub(unused, s1, { attempts: [attempt(1, 10)] });
  const get = async (auth, classId = a1, extra = {}, query = "") => gradebook.handler(req("GET", null, "http://x/api/class-gradebook?classId=" + classId + query), deps(auth, extra));
  const post = async (auth, body, extra = {}) => gradebook.handler(req("POST", body), deps(auth, extra));
  const scheme = (items = [{ itemId: "i_hw", weight: 40, source: { kind: "assignment", assignmentId: hw } }, { itemId: "i_ex", weight: 60, source: { kind: "assignment", assignmentId: ex } }], extra = []) => ({
    categories: [{ categoryId: "term1", title: "الفصل الأول", weight: 100, items: [...items, ...extra] }]
  });
  return { mem, audit, deps, A, B, a1, b1, s1, s2, s3, sB, hw, ex, draft, unused, other, get, post, scheme };
}
const gradebookBlobs = mem => mem.names("platform/gradebooks/");
const snapshot = mem => JSON.stringify(gradebookBlobs(mem).map(n => [n, mem.getJson(n)]));

describe("GB2 — the empty gradebook and saving the scheme", () => {
  it("no scheme yet: the roster, no columns, and the ETags a first save needs (null)", async () => {
    const s = await setup();
    const r = await s.get(s.A);
    expect(r.status).toBe(200);
    expect(r.headers["Cache-Control"]).toBe("no-store");
    expect(r.jsonBody).toMatchObject({ ok: true, classId: s.a1, scheme: null, columns: [], rows: [], readOnly: false, etags: { scheme: null, entries: null }, withheld: [] });
    expect(r.jsonBody.students.map(x => x.studentId).sort()).toEqual([s.s1, s.s2, s.s3].sort());
  });
  it("create-only with etag null, then an update with the returned etag; a stale etag is 409 and writes nothing", async () => {
    const s = await setup();
    const first = await s.post(s.A, { action: "scheme.save", classId: s.a1, etag: null, scheme: s.scheme() });
    expect(first.status).toBe(200);
    expect(first.jsonBody).toMatchObject({ ok: true, revision: 1, status: "active", sumIssues: [] });
    const again = await s.post(s.A, { action: "scheme.save", classId: s.a1, etag: null, scheme: s.scheme() });
    expect(again.status).toBe(409);
    expect(again.jsonBody.code).toBe("STALE_SCHEME");
    const second = await s.post(s.A, { action: "scheme.save", classId: s.a1, etag: first.jsonBody.etag, scheme: s.scheme() });
    expect(second.jsonBody).toMatchObject({ ok: true, revision: 2 });
    const before = snapshot(s.mem);
    expect((await s.post(s.A, { action: "scheme.save", classId: s.a1, etag: first.jsonBody.etag, scheme: s.scheme() })).status).toBe(409);
    expect(snapshot(s.mem)).toBe(before);
    expect(s.mem.getJson("platform/gradebooks/" + s.a1 + "/scheme.json")).toMatchObject({ classId: s.a1, revision: 2, status: "active", updatedBy: "teacher-a" });
    expect(s.audit.filter(e => e.action === "gradebook.scheme.save").map(e => e.details.revision)).toEqual([1, 2]);
  });
  it("the etag is required (null for a new scheme)", async () => {
    const s = await setup();
    expect((await s.post(s.A, { action: "scheme.save", classId: s.a1, scheme: s.scheme() })).status).toBe(400);
    expect(gradebookBlobs(s.mem)).toEqual([]);
  });
  it("sums that are not 100 save a DRAFT, with no final mark", async () => {
    const s = await setup();
    const r = await s.post(s.A, { action: "scheme.save", classId: s.a1, etag: null, scheme: s.scheme([{ itemId: "i_hw", weight: 40, source: { kind: "assignment", assignmentId: s.hw } }]) });
    expect(r.jsonBody).toMatchObject({ ok: true, status: "draft", sumIssues: [{ path: "categories.term1.items", sum: 40 }] });
    const g = (await s.get(s.A)).jsonBody;
    expect(g.schemeStatus).toBe("draft");
    expect(g.rows.every(row => row.final.value === null && row.final.status === "draft")).toBe(true);
  });
  it("sources: a draft, another teacher's assignment and an unknown one are refused; nothing is written", async () => {
    const s = await setup();
    for (const assignmentId of [s.draft, s.other, "nope"]) {
      const r = await s.post(s.A, { action: "scheme.save", classId: s.a1, etag: null, scheme: s.scheme([{ itemId: "x", weight: 100, source: { kind: "assignment", assignmentId } }]) });
      expect(r.status).toBe(400);
      expect(r.jsonBody.errors.map(e => e.code)).toEqual(["ASSIGNMENT_NOT_IN_CLASS"]);
    }
    expect(gradebookBlobs(s.mem)).toEqual([]);
  });
  it("an unknown action is refused", async () => {
    const s = await setup();
    expect((await s.post(s.A, { action: "scheme.delete", classId: s.a1 })).jsonBody.code).toBe("UNKNOWN_ACTION");
  });
});

describe("GB2 — the computed gradebook", () => {
  it("rows from the real submissions: latest final attempt, pending review, nothing submitted", async () => {
    const s = await setup();
    await s.post(s.A, { action: "scheme.save", classId: s.a1, etag: null, scheme: s.scheme() });
    const g = (await s.get(s.A)).jsonBody;
    expect(g.schemeStatus).toBe("active");
    expect(g.columns.map(c => [c.itemId, c.title, c.weight])).toEqual([["i_hw", "الوظيفة 1", 40], ["i_ex", "امتحان 1", 60]]);
    const row = id => g.rows.find(r => r.studentId === id);
    expect(row(s.s1).final).toMatchObject({ status: "complete", display: 86 });                        // 80·.4 + 90·.6
    expect(row(s.s2).cells.i_hw).toMatchObject({ state: "graded", display: 60 });                       // the latest attempt
    expect(row(s.s2).final.display).toBe(66);                                                           // 60·.4 + 70·.6
    expect(row(s.s3).cells.i_hw).toEqual({ state: "pending" });
    expect(row(s.s3).cells.i_ex).toEqual({ state: "missing" });
    expect(row(s.s3).final).toMatchObject({ value: null, status: "incomplete" });
  });
  it("reads only the submissions of the assignments in the scheme", async () => {
    const s = await setup();
    await s.post(s.A, { action: "scheme.save", classId: s.a1, etag: null, scheme: s.scheme() });
    // Every download and listing is recorded at the container itself (GB7: submissions are listed per assignment and read through
    // the shared document cache, not through downloadJsonOrNull).
    // A submission left by a student who is no longer in the class (moved, or another class's student) is listed but never downloaded.
    s.mem.setJson("platform/submissions/" + s.hw + "/" + s.sB + ".json", { assignmentId: s.hw, studentId: s.sB, attempts: [attempt(1, 3)] });
    const read = [], listed = [];
    const watched = { ...s.mem.container,
      getBlobClient: name => { read.push(name); return s.mem.container.getBlobClient(name); },
      listBlobsFlat: opts => { listed.push(opts && opts.prefix); return s.mem.container.listBlobsFlat(opts); } };
    expect((await s.get(s.A, s.a1, { container: watched, getContainer: () => watched })).status).toBe(200);
    const subs = read.filter(n => n.startsWith("platform/submissions/"));
    expect(subs.length).toBe(5);                                    // 2 assignments × 3 students, of which s3 never submitted the exam
    expect(subs.some(n => n.includes("/" + s.unused + "/"))).toBe(false);
    expect(subs.some(n => n.endsWith("/" + s.sB + ".json"))).toBe(false);
    expect(listed.filter(p => String(p).startsWith("platform/submissions/")).sort()).toEqual(["platform/submissions/" + s.ex + "/", "platform/submissions/" + s.hw + "/"].sort());
  });
  it("an assignment purged after the scheme was saved is a missing source, never a zero", async () => {
    const s = await setup();
    await s.post(s.A, { action: "scheme.save", classId: s.a1, etag: null, scheme: s.scheme() });
    s.mem.store.delete("platform/assignments/" + s.ex + ".json");
    const g = (await s.get(s.A)).jsonBody;
    expect(g.warnings).toEqual([{ itemId: "i_ex", code: "MISSING_SOURCE" }]);
    const row = g.rows.find(r => r.studentId === s.s1);
    expect(row.cells.i_ex).toEqual({ state: "missingSource" });
    expect(row.final).toMatchObject({ status: "incomplete", display: 80 });
  });
  it("a scheme assignment that no longer belongs to the class, or is no longer reportable, is a missing source — its results are never read", async () => {
    const s = await setup();
    await s.post(s.A, { action: "scheme.save", classId: s.a1, etag: null, scheme: s.scheme() });
    const name = "platform/assignments/" + s.ex + ".json";
    for (const change of [{ classId: "another-class" }, { status: "draft" }]) {
      const original = s.mem.getJson(name);
      s.mem.setJson(name, { ...original, ...change });
      const g = (await s.get(s.A)).jsonBody;
      expect(g.warnings).toEqual([{ itemId: "i_ex", code: "MISSING_SOURCE" }]);
      expect(g.rows.find(r => r.studentId === s.s1).cells.i_ex).toEqual({ state: "missingSource" });
      s.mem.setJson(name, original);
    }
  });
  it("marks and states only: no answer, question grade, code or password leaves the route", async () => {
    const s = await setup();
    await s.post(s.A, { action: "scheme.save", classId: s.a1, etag: null, scheme: s.scheme() });
    const text = JSON.stringify((await s.get(s.A)).jsonBody);
    for (const word of ["questionGrades", "answers", "\"answer\"", "examSnapshot", "password", "identityNumber"]) expect(text).not.toContain(word);
  });
  it("a corrupt stored scheme is a 503, never a half-computed gradebook", async () => {
    const s = await setup();
    s.mem.setJson("platform/gradebooks/" + s.a1 + "/scheme.json", { categories: [{ categoryId: "x", weight: "a lot", items: [] }] });
    const r = await s.get(s.A);
    expect(r.status).toBe(503);
    expect(r.jsonBody.code).toBe("GRADEBOOK_UNAVAILABLE");
  });
});

describe("GB2 — manual marks and decisions (entries.save)", () => {
  const withManual = s => s.scheme([{ itemId: "i_hw", weight: 40, source: { kind: "assignment", assignmentId: s.hw } }], [{ itemId: "i_paper", weight: 60, source: { kind: "manual", title: "امتحان ورقي", maxScore: 20 } }]);
  it("a typed score and a zero decision are saved with the value the teacher saw; the gradebook uses them", async () => {
    const s = await setup();
    await s.post(s.A, { action: "scheme.save", classId: s.a1, etag: null, scheme: withManual(s) });
    const r = await s.post(s.A, { action: "entries.save", classId: s.a1, items: [
      { itemId: "i_paper", studentId: s.s1, expected: null, value: { score: 15 } },
      { itemId: "i_paper", studentId: s.s3, expected: null, value: { decision: "zero" } }
    ] });
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ ok: true, revision: 1, stale: [] });
    expect(r.jsonBody.applied).toHaveLength(2);
    const g = (await s.get(s.A)).jsonBody;
    const row = id => g.rows.find(x => x.studentId === id);
    expect(row(s.s1).cells.i_paper).toMatchObject({ state: "graded", display: 75 });
    expect(row(s.s1).final.display).toBe(77);                                                           // 80·.4 + 75·.6
    expect(row(s.s3).cells.i_paper).toEqual({ state: "zero", percent: 0, display: 0 });
    expect(s.audit.find(e => e.action === "gradebook.entries.save").details).toMatchObject({ applied: 2, stale: 0 });
  });
  it("a cell changed elsewhere since it was shown is stale: kept, reported with the server's value, the others saved", async () => {
    const s = await setup();
    await s.post(s.A, { action: "scheme.save", classId: s.a1, etag: null, scheme: withManual(s) });
    await s.post(s.A, { action: "entries.save", classId: s.a1, items: [{ itemId: "i_paper", studentId: s.s1, expected: null, value: { score: 15 } }] });
    const r = await s.post(s.A, { action: "entries.save", classId: s.a1, items: [
      { itemId: "i_paper", studentId: s.s1, expected: null, value: { score: 12 } },
      { itemId: "i_paper", studentId: s.s2, expected: null, value: { score: 10 } }
    ] });
    expect(r.jsonBody.stale).toEqual([{ itemId: "i_paper", studentId: s.s1, current: { score: 15 } }]);
    expect(r.jsonBody.applied).toEqual([{ itemId: "i_paper", studentId: s.s2 }]);
    expect(s.mem.getJson("platform/gradebooks/" + s.a1 + "/entries.json").cells.i_paper[s.s1].score).toBe(15);
    const allStale = await s.post(s.A, { action: "entries.save", classId: s.a1, items: [{ itemId: "i_paper", studentId: s.s1, expected: { score: 1 }, value: null }] });
    expect(allStale.status).toBe(409);
    expect(allStale.jsonBody.code).toBe("STALE_ENTRIES");
  });
  it("clearing a cell (value null) with the right expected value removes it", async () => {
    const s = await setup();
    await s.post(s.A, { action: "scheme.save", classId: s.a1, etag: null, scheme: withManual(s) });
    await s.post(s.A, { action: "entries.save", classId: s.a1, items: [{ itemId: "i_hw", studentId: s.s3, expected: null, value: { decision: "excused" } }] });
    const r = await s.post(s.A, { action: "entries.save", classId: s.a1, items: [{ itemId: "i_hw", studentId: s.s3, expected: { decision: "excused" }, value: null }] });
    expect(r.status).toBe(200);
    expect(s.mem.getJson("platform/gradebooks/" + s.a1 + "/entries.json").cells.i_hw).toEqual({});
  });
  it("any invalid item refuses the whole request and writes nothing", async () => {
    const s = await setup();
    await s.post(s.A, { action: "scheme.save", classId: s.a1, etag: null, scheme: withManual(s) });
    const cases = [
      [{ itemId: "i_hw", studentId: s.s1, expected: null, value: { score: 5 } }, "SCORE_NOT_MANUAL"],
      [{ itemId: "i_paper", studentId: s.s1, expected: null, value: { score: 21 } }, "SCORE_INVALID"],
      [{ itemId: "i_paper", studentId: s.s1, expected: null, value: { score: 12.345 } }, "SCORE_INVALID"],
      [{ itemId: "i_paper", studentId: s.sB, expected: null, value: { score: 5 } }, "STUDENT_NOT_IN_CLASS"],
      [{ itemId: "nope", studentId: s.s1, expected: null, value: { score: 5 } }, "ITEM_UNKNOWN"],
      [{ itemId: "i_paper", studentId: s.s1, value: { score: 5 } }, "EXPECTED_REQUIRED"],
      [{ itemId: "i_paper", studentId: s.s1, expected: null, value: { decision: "drop" } }, "VALUE_INVALID"]
    ];
    for (const [bad, code] of cases) {
      const r = await s.post(s.A, { action: "entries.save", classId: s.a1, items: [{ itemId: "i_paper", studentId: s.s2, expected: null, value: { score: 4 } }, bad] });
      expect(r.status).toBe(400);
      expect(r.jsonBody.errors.map(e => e.code)).toEqual([code]);
    }
    expect(s.mem.has("platform/gradebooks/" + s.a1 + "/entries.json")).toBe(false);
    expect((await s.post(s.A, { action: "entries.save", classId: s.a1, items: Array.from({ length: 301 }, () => ({})) })).status).toBe(400);
  });
  it("no scheme yet → 409 NO_SCHEME", async () => {
    const s = await setup();
    const r = await s.post(s.A, { action: "entries.save", classId: s.a1, items: [{ itemId: "x", studentId: s.s1, expected: null, value: null }] });
    expect(r.jsonBody.code).toBe("NO_SCHEME");
  });
});

describe("GB2 — authority", () => {
  it("another teacher's class is missing: read and both writes → 404, nothing stored changes", async () => {
    const s = await setup();
    await s.post(s.A, { action: "scheme.save", classId: s.a1, etag: null, scheme: s.scheme() });
    const before = snapshot(s.mem);
    expect((await s.get(s.B)).status).toBe(404);
    expect((await s.get(s.B, s.a1, {}, "&resource=sources")).status).toBe(404);
    expect((await s.post(s.B, { action: "scheme.save", classId: s.a1, etag: null, scheme: s.scheme() })).status).toBe(404);
    expect((await s.post(s.B, { action: "entries.save", classId: s.a1, items: [{ itemId: "i_hw", studentId: s.s1, expected: null, value: { decision: "zero" } }] })).status).toBe(404);
    expect(snapshot(s.mem)).toBe(before);
  });
  it("an archived class is read-only: it reads (readOnly) and refuses both writes", async () => {
    const s = await setup();
    await s.post(s.A, { action: "scheme.save", classId: s.a1, etag: null, scheme: s.scheme() });
    const name = "platform/classes/" + s.a1 + ".json";
    s.mem.setJson(name, { ...s.mem.getJson(name), status: "archived" });
    const before = snapshot(s.mem);
    expect((await s.get(s.A)).jsonBody.readOnly).toBe(true);
    for (const body of [{ action: "scheme.save", classId: s.a1, etag: null, scheme: s.scheme() }, { action: "entries.save", classId: s.a1, items: [] }]) {
      const r = await s.post(s.A, body);
      expect(r.status).toBe(409);
      expect(r.jsonBody.code).toBe("CLASS_ARCHIVED");
    }
    expect(snapshot(s.mem)).toBe(before);
  });
  it("a storage error is a 503, never an empty gradebook", async () => {
    const s = await setup();
    await s.post(s.A, { action: "scheme.save", classId: s.a1, etag: null, scheme: s.scheme() });
    const down = async () => { throw Object.assign(new Error("down"), { statusCode: 500 }); };
    for (const extra of [{ downloadJsonOrNull: down }, { downloadJsonWithEtagOrNull: down }, { loadDocs: down }, { mapConcurrent: down }]) {
      const r = await s.get(s.A, s.a1, extra);
      expect(r.status).toBe(503);
      expect(r.jsonBody).toEqual({ ok: false, code: "GRADEBOOK_UNAVAILABLE", error: expect.any(String) });
    }
  });
  it("a bad classId is refused before any read", async () => {
    const s = await setup();
    const dl = vi.fn();
    expect((await s.get(s.A, "../auth/x", { downloadJsonOrNull: dl })).status).toBe(400);
    expect(dl).not.toHaveBeenCalled();
  });
  it("the session-grants refusal (access unavailable) is passed through", async () => {
    const s = await setup();
    const response = { status: 503, jsonBody: { ok: false, code: "ACCESS_UNAVAILABLE" } };
    expect(await s.get(s.A, s.a1, { sessionGrants: async () => ({ ok: false, response }) })).toBe(response);
  });
});

describe("GB2 — project columns", () => {
  async function withProject(s) {
    const name = "platform/classes/" + s.a1 + ".json";
    s.mem.setJson(name, { ...s.mem.getJson(name), programCodes: ["794589"] });
    return s.scheme([{ itemId: "i_hw", weight: 50, source: { kind: "assignment", assignmentId: s.hw } }], [{ itemId: "i_proj", weight: 50, source: { kind: "project", projectCode: "794589" } }]);
  }
  it("with projects.tracker.view: a student with no project record shows «—», never a zero; the sources list the project", async () => {
    const s = await setup();
    const scheme = await withProject(s);
    expect((await s.post(s.A, { action: "scheme.save", classId: s.a1, etag: null, scheme })).status).toBe(200);
    const g = (await s.get(s.A)).jsonBody;
    expect(g.columns.find(c => c.itemId === "i_proj").title).not.toBe("");
    const row = g.rows.find(r => r.studentId === s.s1);
    expect(row.cells.i_proj).toEqual({ state: "missing" });
    expect(row.final).toMatchObject({ status: "incomplete", display: 80 });
    expect((await s.get(s.A, s.a1, {}, "&resource=sources")).jsonBody.projects.map(p => p.projectCode)).toEqual(["794589"]);
  });
  it("a project removed from the class is a missing source", async () => {
    const s = await setup();
    await s.post(s.A, { action: "scheme.save", classId: s.a1, etag: null, scheme: await withProject(s) });
    const name = "platform/classes/" + s.a1 + ".json";
    s.mem.setJson(name, { ...s.mem.getJson(name), programCodes: [] });
    expect((await s.get(s.A)).jsonBody.warnings).toEqual([{ itemId: "i_proj", code: "MISSING_SOURCE" }]);
  });
  it("without projects.tracker.view: project cells are withheld (never read), the sources omit projects, and a project column cannot be saved", async () => {
    const s = await setup();
    const scheme = await withProject(s);
    await s.post(s.A, { action: "scheme.save", classId: s.a1, etag: null, scheme });
    // Every read and listing is recorded at the container itself (the project service reads storage directly, not through deps).
    const read = [];
    const watched = { ...s.mem.container,
      getBlobClient: name => { read.push(name); return s.mem.container.getBlobClient(name); },
      listBlobsFlat: opts => { read.push("list:" + (opts && opts.prefix)); return s.mem.container.listBlobsFlat(opts); } };
    const g = (await s.get(s.A, s.a1, { sessionGrants: async () => NO_PROJECTS, container: watched, getContainer: () => watched })).jsonBody;
    expect(g.withheld).toEqual(["projects"]);
    expect(g.rows.every(r => r.cells.i_proj.state === "withheld")).toBe(true);
    expect(read.length).toBeGreaterThan(0);
    expect(read.filter(n => /794589|project/i.test(n))).toEqual([]);
    // Control: with the capability, the same request does read the project's documents.
    read.length = 0;
    await s.get(s.A, s.a1, { container: watched, getContainer: () => watched });
    expect(read.filter(n => /project/i.test(n)).length).toBeGreaterThan(0);
    const src = (await s.get(s.A, s.a1, { sessionGrants: async () => NO_PROJECTS }, "&resource=sources")).jsonBody;
    expect(src.projects).toEqual([]);
    expect(src.assignments.map(a => a.title).sort()).toEqual(["الوظيفة 1", "امتحان 1", "غير مستعمل"].sort());
    const saved = await s.post(s.A, { action: "scheme.save", classId: s.a1, etag: g.etags.scheme, scheme }, { sessionGrants: async () => NO_PROJECTS });
    expect(saved.status).toBe(403);
    expect(saved.jsonBody.capability).toBe("projects.tracker.view");
    const entry = await s.post(s.A, { action: "entries.save", classId: s.a1, items: [{ itemId: "i_proj", studentId: s.s1, expected: null, value: { decision: "excused" } }] }, { sessionGrants: async () => NO_PROJECTS });
    expect(entry.jsonBody.errors.map(e => e.code)).toEqual(["WITHHELD"]);
  });
});

describe("GB5 — the stored entries in the read (the page edits what it saw)", () => {
  const withManual = s => s.scheme([{ itemId: "i_hw", weight: 40, source: { kind: "assignment", assignmentId: s.hw } }], [{ itemId: "i_paper", weight: 60, source: { kind: "manual", title: "امتحان ورقي", maxScore: 20 } }]);
  it("returns each stored value (score or decision) without who / when; nothing before any entry", async () => {
    const s = await setup();
    await s.post(s.A, { action: "scheme.save", classId: s.a1, etag: null, scheme: withManual(s) });
    expect((await s.get(s.A)).jsonBody.entries).toEqual({});
    await s.post(s.A, { action: "entries.save", classId: s.a1, items: [
      { itemId: "i_paper", studentId: s.s1, expected: null, value: { score: 12.5 } },
      { itemId: "i_hw", studentId: s.s3, expected: null, value: { decision: "excused" } }
    ] });
    const g = (await s.get(s.A)).jsonBody;
    expect(g.entries).toEqual({ i_paper: { [s.s1]: { score: 12.5 } }, i_hw: { [s.s3]: { decision: "excused" } } });
    expect(JSON.stringify(g.entries)).not.toMatch(/"(at|by)"/);
  });
  it("only the scheme's columns and the roster's students: a removed column or a foreign student is not returned", async () => {
    const s = await setup();
    await s.post(s.A, { action: "scheme.save", classId: s.a1, etag: null, scheme: withManual(s) });
    s.mem.setJson("platform/gradebooks/" + s.a1 + "/entries.json", { schemaVersion: 1, classId: s.a1, revision: 3, cells: {
      i_paper: { [s.s1]: { score: 10, at: "x", by: "y" }, [s.sB]: { score: 20 } },
      i_gone: { [s.s1]: { decision: "zero" } }
    } });
    expect((await s.get(s.A)).jsonBody.entries).toEqual({ i_paper: { [s.s1]: { score: 10 } } });
  });
  it("a withheld project column's entries are never returned", async () => {
    const s = await setup();
    const name = "platform/classes/" + s.a1 + ".json";
    s.mem.setJson(name, { ...s.mem.getJson(name), programCodes: ["794589"] });
    await s.post(s.A, { action: "scheme.save", classId: s.a1, etag: null, scheme: s.scheme([{ itemId: "i_hw", weight: 50, source: { kind: "assignment", assignmentId: s.hw } }], [{ itemId: "i_proj", weight: 50, source: { kind: "project", projectCode: "794589" } }]) });
    await s.post(s.A, { action: "entries.save", classId: s.a1, items: [{ itemId: "i_proj", studentId: s.s1, expected: null, value: { decision: "excused" } }] });
    expect((await s.get(s.A)).jsonBody.entries).toEqual({ i_proj: { [s.s1]: { decision: "excused" } } });
    expect((await s.get(s.A, s.a1, { sessionGrants: async () => NO_PROJECTS })).jsonBody.entries).toEqual({});
  });
});
