// Class gradebook GB8 (docs/enterprise-class-gradebook-gb.md §4.9) — «نسخ من صف آخر», through the REAL handlers (classes, students,
// assignments, gradebook) over the in-memory container: the list of the teacher's classes that have a scheme (archived ones too, another
// teacher's never), and the proposal of one of them for this class — parts and manual columns as they are, an assignment matched by the
// SAME EXAM, everything else listed by name and never rescaled, another teacher's class reported as missing, and nothing written.
// TEST data only.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const classrooms = require("../src/functions/manage-classrooms.js");
const assignments = require("../src/functions/manage-assignments.js");
const gradebook = require("../src/functions/class-gradebook.js");
const { proposeCopy } = require("../src/lib/gradebook/copy.js");
const { createMemoryContainer } = require("./fixtures/memory-container.js");

const multi = sub => ({ ok: true, user: { ver: 2, role: "teacher", sub, am: "multi-user" } });
const req = (method, body, url = "http://x/api/class-gradebook") => ({ method, url, headers: { get: () => "" }, json: async () => body });
const exam = examId => ({ examId, title: "امتحان", questions: [{ id: "q1", type: "trueFalse", text: "عبارة", marks: 1, answer: true }] });
const ALL = { ok: true, has: () => true };
const NO_PROJECTS = { ok: true, has: c => c !== "projects.tracker.view" };

async function setup() {
  const mem = createMemoryContainer();
  const deps = (auth, extra = {}) => ({ requireBuilderAuth: () => auth, container: mem.container, getContainer: () => mem.container, recordAuditEvent: async () => {}, ensurePublishedAssignmentIndexed: async () => {}, removePublishedAssignmentFromIndex: async () => {}, sessionGrants: async () => ALL, ...extra });
  const A = multi("teacher-a"), B = multi("teacher-b");
  const mkClass = async (auth, name) => (await classrooms.handler(req("POST", { action: "create", name, grade: "10", schoolYear: "2025-2026" }), deps(auth))).jsonBody.classroom.classId;
  const mkAssignment = async (auth, classId, title, examId) => (await assignments.handler(req("POST", { action: "create", classId, title, examSnapshot: exam(examId), publish: true }), deps(auth))).jsonBody.assignment.assignmentId;
  const src = await mkClass(A, "العاشر أ"), dst = await mkClass(A, "العاشر ب"), empty = await mkClass(A, "بلا مخطط"), other = await mkClass(B, "صف معلم آخر");
  // the source class: three assignments from three exams
  const s1 = await mkAssignment(A, src, "الوظيفة 1", "exam-1"), s2 = await mkAssignment(A, src, "الوظيفة 2", "exam-2"), s3 = await mkAssignment(A, src, "الامتحان الشهري", "exam-3");
  // the target class: one from exam-1 (a match), two from exam-2 (ambiguous), none from exam-3
  const d1 = await mkAssignment(A, dst, "الوظيفة 1 (ب)", "exam-1");
  await mkAssignment(A, dst, "الوظيفة 2 (ب)", "exam-2"); await mkAssignment(A, dst, "الوظيفة 2 إعادة", "exam-2");
  const o1 = await mkAssignment(B, other, "واجب آخر", "exam-1");
  await mkAssignment(A, empty, "امتحان شهري في صف ثالث", "exam-3");      // the same teacher's third class: never a candidate for dst
  const get = (auth, classId, query, extra = {}) => gradebook.handler(req("GET", null, "http://x/api/class-gradebook?classId=" + classId + query), deps(auth, extra));
  const post = (auth, body) => gradebook.handler(req("POST", body), deps(auth));
  const SCHEME = { categories: [
    { categoryId: "monthly", title: "الشهري", weight: 30, items: [{ itemId: "i1", weight: 50, source: { kind: "assignment", assignmentId: s1 } }, { itemId: "i2", weight: 50, source: { kind: "assignment", assignmentId: s2 } }] },
    { categoryId: "term", title: "الفصل", weight: 70, items: [{ itemId: "i3", weight: 60, source: { kind: "assignment", assignmentId: s3 } }, { itemId: "paper", weight: 40, source: { kind: "manual", title: "ورقي", maxScore: 20 } }] }
  ] };
  expect((await post(A, { action: "scheme.save", classId: src, etag: null, scheme: SCHEME })).jsonBody).toMatchObject({ ok: true, status: "active" });
  expect((await post(B, { action: "scheme.save", classId: other, etag: null, scheme: { categories: [{ categoryId: "k", title: "ك", weight: 100, items: [{ itemId: "x", weight: 100, source: { kind: "assignment", assignmentId: o1 } }] }] } })).jsonBody.ok).toBe(true);
  return { mem, A, B, src, dst, empty, other, s1, d1, o1, get, post };
}

describe("GB8 — the classes a scheme can be copied from", () => {
  it("the teacher's other classes that have a scheme (archived ones too); never this class, a class without a scheme, or another teacher's", async () => {
    const s = await setup();
    let r = await s.get(s.A, s.dst, "&resource=copy-classes");
    expect(r.status).toBe(200);
    expect(r.headers["Cache-Control"]).toBe("no-store");
    expect(r.jsonBody.classes).toEqual([{ classId: s.src, name: "العاشر أ", schoolYear: "2025-2026", archived: false, categories: 2, items: 4, updatedAt: expect.any(String) }]);
    const n = "platform/classes/" + s.src + ".json";
    s.mem.setJson(n, { ...s.mem.getJson(n), status: "archived" });
    r = await s.get(s.A, s.dst, "&resource=copy-classes");
    expect(r.jsonBody.classes.map(c => [c.classId, c.archived])).toEqual([[s.src, true]]);
    expect((await s.get(s.A, s.src, "&resource=copy-classes")).jsonBody.classes).toEqual([]);
  });
});

describe("GB8 — the proposal: parts and manual columns as they are, an assignment by the same exam, the rest listed", () => {
  it("maps exam-1 to the target's own assignment; lists exam-2 (two candidates) and exam-3 (none); keeps every weight", async () => {
    const s = await setup();
    const r = await s.get(s.A, s.dst, "&resource=copy&from=" + s.src);
    expect(r.status).toBe(200);
    expect(r.headers["Cache-Control"]).toBe("no-store");
    expect(r.jsonBody).toMatchObject({ ok: true, classId: s.dst, from: { classId: s.src, name: "العاشر أ" }, copied: 2 });
    expect(r.jsonBody.categories).toEqual([
      { title: "الشهري", weight: 30, items: [{ weight: 50, source: { kind: "assignment", assignmentId: s.d1 }, title: "الوظيفة 1 (ب)" }] },
      { title: "الفصل", weight: 70, items: [{ weight: 40, source: { kind: "manual", title: "ورقي", maxScore: 20 }, title: "ورقي" }] }
    ]);
    expect(r.jsonBody.unmatched).toEqual([
      expect.objectContaining({ category: "الشهري", title: "الوظيفة 2", weight: 50, kind: "assignment", code: "AMBIGUOUS", candidates: ["الوظيفة 2 (ب)", "الوظيفة 2 إعادة"] }),
      expect.objectContaining({ category: "الفصل", title: "الامتحان الشهري", weight: 60, kind: "assignment", code: "NO_MATCH" })
    ]);
    // no id travels with the proposal: the page gives every part and column a new one
    expect(JSON.stringify(r.jsonBody)).not.toMatch(/"(categoryId|itemId)"/);
    expect(JSON.stringify(r.jsonBody)).not.toContain(s.s1);
  });
  it("reading the proposal writes nothing; the proposal saved as the teacher's draft is accepted by scheme.save (a draft: the sums lost columns)", async () => {
    const s = await setup();
    const before = JSON.stringify(s.mem.names("platform/gradebooks/"));
    const p = (await s.get(s.A, s.dst, "&resource=copy&from=" + s.src)).jsonBody;
    expect(JSON.stringify(s.mem.names("platform/gradebooks/"))).toBe(before);
    const scheme = { categories: p.categories.map((c, ci) => ({ categoryId: "c" + ci, title: c.title, weight: c.weight, items: c.items.map((i, ii) => ({ itemId: "i" + ci + "_" + ii, weight: i.weight, source: i.source })) })) };
    const saved = await s.post(s.A, { action: "scheme.save", classId: s.dst, etag: null, scheme });
    expect(saved.jsonBody).toMatchObject({ ok: true, status: "draft" });
    expect(saved.jsonBody.sumIssues.length).toBeGreaterThan(0);          // never rescaled: 50 and 40 stay 50 and 40
  });
  it("another teacher's class is missing (404) and is never read; a class without a scheme, or this class itself, is refused", async () => {
    const s = await setup();
    const r = await s.get(s.A, s.dst, "&resource=copy&from=" + s.other);
    expect(r.status).toBe(404);
    expect(r.jsonBody.code).toBe("SOURCE_NOT_FOUND");
    expect(JSON.stringify(r.jsonBody)).not.toContain("واجب آخر");
    expect((await s.get(s.A, s.dst, "&resource=copy&from=" + s.empty)).jsonBody.code).toBe("SOURCE_HAS_NO_SCHEME");
    expect((await s.get(s.A, s.dst, "&resource=copy&from=" + s.dst)).status).toBe(400);
    expect((await s.get(s.A, s.dst, "&resource=copy&from=../x")).status).toBe(400);
    expect((await s.get(s.B, s.dst, "&resource=copy&from=" + s.src)).status).toBe(404);      // the target itself is another teacher's
  });
});

describe("GB8 — only the two classes' own assignments are ever used", () => {
  it("a stored source column pointing at another class's assignment is «gone»: its title and exam never reach the proposal", async () => {
    const s = await setup();
    const n = "platform/gradebooks/" + s.src + "/scheme.json";
    const stored = s.mem.getJson(n);
    s.mem.setJson(n, { ...stored, categories: [{ categoryId: "x", title: "مدسوس", weight: 100, items: [{ itemId: "x1", weight: 100, source: { kind: "assignment", assignmentId: s.o1 } }] }] });
    const r = await s.get(s.A, s.dst, "&resource=copy&from=" + s.src);
    expect(r.jsonBody.unmatched).toEqual([expect.objectContaining({ code: "SOURCE_MISSING", title: "" })]);
    expect(r.jsonBody.categories[0].items).toEqual([]);
    expect(JSON.stringify(r.jsonBody)).not.toContain("واجب آخر");
  });
  it("an assignment of the teacher's third class from the same exam is never matched (exam-3 stays unmatched)", async () => {
    const s = await setup();
    const r = await s.get(s.A, s.dst, "&resource=copy&from=" + s.src);
    expect(r.jsonBody.unmatched.find(u => u.title === "الامتحان الشهري")).toMatchObject({ code: "NO_MATCH" });
    expect(JSON.stringify(r.jsonBody)).not.toContain("صف ثالث");
  });
});

describe("GB8 — proposeCopy (pure)", () => {
  const scheme = (items) => ({ categories: [{ title: "ق", weight: 100, items }] });
  it("a source assignment that is gone, a match already used, an assignment without an exam: listed, never copied", () => {
    const r = proposeCopy({
      scheme: scheme([
        { weight: 40, source: { kind: "assignment", assignmentId: "gone" } },
        { weight: 30, source: { kind: "assignment", assignmentId: "a" } },
        { weight: 20, source: { kind: "assignment", assignmentId: "a2" } },
        { weight: 10, source: { kind: "assignment", assignmentId: "noexam" } }
      ]),
      sourceAssignments: new Map([["gone", undefined], ["a", { title: "أ", sourceExamId: "e" }], ["a2", { title: "أ مكرر", sourceExamId: "e" }], ["noexam", { title: "بلا امتحان", sourceExamId: "" }]]),
      targetAssignments: [{ assignmentId: "t", title: "ت", sourceExamId: "e" }, { assignmentId: "u", title: "بلا امتحان", sourceExamId: "" }],
      targetProjects: new Set(), projectsAllowed: true
    });
    expect(r.categories[0].items).toEqual([{ weight: 30, source: { kind: "assignment", assignmentId: "t" }, title: "ت" }]);
    expect(r.unmatched.map(u => u.code)).toEqual(["SOURCE_MISSING", "DUPLICATE", "NO_MATCH"]);
    expect(r.copied).toBe(1);
  });
  it("a project column: copied when the target has the project; listed when it does not, or when projects are withheld", () => {
    const src = scheme([{ weight: 100, source: { kind: "project", projectCode: "794589" } }]);
    const base = { scheme: src, sourceAssignments: new Map(), targetAssignments: [] };
    expect(proposeCopy({ ...base, targetProjects: new Set(["794589"]), projectsAllowed: true }).categories[0].items).toHaveLength(1);
    expect(proposeCopy({ ...base, targetProjects: new Set(), projectsAllowed: true }).unmatched[0].code).toBe("PROJECT_NOT_IN_CLASS");
    expect(proposeCopy({ ...base, targetProjects: new Set(["794589"]), projectsAllowed: false }).unmatched[0].code).toBe("WITHHELD");
  });
  it("route level: a teacher without projects.tracker.view gets project columns listed as withheld", async () => {
    const s = await setup();
    const n = "platform/gradebooks/" + s.src + "/scheme.json";
    const stored = s.mem.getJson(n);
    s.mem.setJson(n, { ...stored, categories: [...stored.categories, { categoryId: "p", title: "مشروع", weight: 10, items: [{ itemId: "pj", weight: 100, source: { kind: "project", projectCode: "794589" } }] }] });
    const r = await s.get(s.A, s.dst, "&resource=copy&from=" + s.src, { sessionGrants: async () => NO_PROJECTS });
    expect(r.jsonBody.unmatched.map(u => u.code)).toContain("WITHHELD");
  });
});
