// Class gradebook GB10 (docs/enterprise-class-gradebook-gb.md §4.11) — POST /api/gradebook-scheme-ai through the REAL handlers
// (classes, assignments, gradebook) over the in-memory container, with a FAKE provider: the proposal, what the model is shown (this
// class's sources under references — never an id, a student, a mark or another class), every refusal before any provider call
// (tenancy, archive, approval lock, bad input), the provider's failures, the two capabilities in the enforce mode, and nothing written.
// TEST data only; no provider or network is reached.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { recordedManagedToken } from "./fixtures/managed-session.js";
const require = createRequire(import.meta.url);
const classrooms = require("../src/functions/manage-classrooms.js");
const assignments = require("../src/functions/manage-assignments.js");
const gradebook = require("../src/functions/class-gradebook.js");
const schemeAi = require("../src/functions/gradebook-scheme-ai.js");
const { createMemoryContainer } = require("./fixtures/memory-container.js");
const { buildRevision, revisionName, resetRevisionCache } = require("../src/lib/access/revisions.js");
const { ACCESS_CONTROL_DOC } = require("../src/lib/access/access-mode.js");
const { teacherAccountName } = require("../src/lib/identity/teacher-accounts.js");
const { newTeacherSessionId } = require("../src/lib/identity/teacher-token.js");
const { resetOperatorGateCache } = require("../src/lib/identity/operator-gate.js");

const multi = sub => ({ ok: true, user: { ver: 2, role: "teacher", sub, am: "multi-user" } });
const req = (method, body, url = "http://x/api/gradebook-scheme-ai") => ({ method, url, headers: { get: () => "" }, json: async () => body });
const exam = examId => ({ examId, title: "امتحان", questions: [{ id: "q1", type: "trueFalse", text: "عبارة", marks: 1, answer: true }] });
const NO_PROJECTS = { ok: true, has: c => c !== "projects.tracker.view" };
const DESCRIPTION = "الشهري 20% (الوظيفة 1 بـ10 والباقي بالتساوي على الامتحانات)، والفصل 80%: الحضور والمشاركة من 10 بنسبة 20% وامتحان 4 بنسبة 80%.";

/** A fake model that reads the references it was shown and answers the description above. */
function fakeModel(calls, override) {
  return async args => {
    calls.push(args);
    if (override) return override(args);
    const ref = title => (args.prompt.match(new RegExp("^(A\\d+) \\| واجب أو امتحان \\| " + title + " \\|", "m")) || [])[1] || "";
    const it = (r, weight, weightSource = "stated") => ({ kind: "source", ref: r, manualTitle: "", manualMaxScore: null, weight, weightSource, mention: r });
    return { result: {
      categories: [
        { title: "الشهري", weight: 20, weightSource: "stated", items: [it(ref("الوظيفة 1"), 10), it(ref("امتحان 1"), null, "equalShare"), it(ref("امتحان 2"), null, "equalShare")] },
        { title: "الفصل", weight: 80, weightSource: "stated", items: [{ kind: "manual", ref: "", manualTitle: "الحضور والمشاركة", manualMaxScore: 10, weight: 20, weightSource: "stated", mention: "الحضور" }] }
      ],
      unmatched: [{ category: "الفصل", mention: "امتحان 4", candidates: [ref("امتحان 2")] }],
      assumptions: []
    }, model: "fake" };
  };
}

async function setup() {
  const mem = createMemoryContainer();
  const deps = (auth, extra = {}) => ({ requireBuilderAuth: () => auth, container: mem.container, getContainer: () => mem.container, recordAuditEvent: async () => {}, ensurePublishedAssignmentIndexed: async () => {}, removePublishedAssignmentFromIndex: async () => {}, ...extra });
  const A = multi("teacher-a"), B = multi("teacher-b");
  const mkClass = async (auth, name) => (await classrooms.handler({ method: "POST", url: "http://x/api/classrooms", headers: { get: () => "" }, json: async () => ({ action: "create", name, grade: "10", schoolYear: "2025-2026" }) }, deps(auth))).jsonBody.classroom.classId;
  const mkAssignment = async (auth, classId, title, examId) => (await assignments.handler({ method: "POST", url: "http://x/api/assignments", headers: { get: () => "" }, json: async () => ({ action: "create", classId, title, examSnapshot: exam(examId), publish: true }) }, deps(auth))).jsonBody.assignment.assignmentId;
  const cls = await mkClass(A, "العاشر أ"), other = await mkClass(B, "صف معلم آخر");
  const ids = [await mkAssignment(A, cls, "الوظيفة 1", "e1"), await mkAssignment(A, cls, "امتحان 1", "e2"), await mkAssignment(A, cls, "امتحان 2", "e3")];
  const foreign = await mkAssignment(B, other, "واجب سري لمعلم آخر", "e9");
  mem.setJson("platform/users/st_1.json", { userId: "st_1", role: "student", displayName: "طالبة اسمها سلمى", code: "S-1", classId: cls });
  const calls = [];
  const ask = (auth, body, extra = {}) => schemeAi.handler(req("POST", body), deps(auth, { callTextJson: fakeModel(calls, extra.override), ...extra }));
  const snapshot = () => JSON.stringify([...mem.store.entries()].map(([n, e]) => [n, e.content.toString("base64")]).sort());
  return { mem, deps, A, B, cls, other, ids, foreign, calls, ask, snapshot };
}

describe("GB10 — the proposal", () => {
  it("answers this class's proposal: stated weights kept, the equal shares computed, the missing exam listed — and writes nothing", async () => {
    const s = await setup();
    const before = s.snapshot();
    const r = await s.ask(s.A, { classId: s.cls, description: DESCRIPTION });
    expect(r.status).toBe(200);
    expect(r.headers["Cache-Control"]).toBe("no-store");
    expect(r.jsonBody).toMatchObject({ ok: true, classId: s.cls });
    const p = r.jsonBody.proposal;
    expect(p.categories).toEqual([
      { title: "الشهري", weight: 20, items: [
        { weight: 10, source: { kind: "assignment", assignmentId: s.ids[0] }, title: "الوظيفة 1" },
        { weight: 45, source: { kind: "assignment", assignmentId: s.ids[1] }, title: "امتحان 1" },
        { weight: 45, source: { kind: "assignment", assignmentId: s.ids[2] }, title: "امتحان 2" }
      ] },
      { title: "الفصل", weight: 80, items: [{ weight: 20, source: { kind: "manual", title: "الحضور والمشاركة", maxScore: 10 }, title: "الحضور والمشاركة" }] }
    ]);
    expect(p.unmatched).toEqual([expect.objectContaining({ category: "الفصل", title: "امتحان 4", code: "NOT_FOUND", candidates: ["امتحان 2"] })]);
    expect(s.snapshot()).toBe(before);
  });
  it("the proposal saved by the teacher through scheme.save is accepted (a draft: «الفصل» lost its exam and is not rescaled)", async () => {
    const s = await setup();
    const p = (await s.ask(s.A, { classId: s.cls, description: DESCRIPTION })).jsonBody.proposal;
    let n = 0;
    const scheme = { categories: p.categories.map(c => ({ categoryId: "c" + (++n), title: c.title, weight: c.weight, items: c.items.map(i => ({ itemId: "i" + (++n), weight: i.weight, source: i.source })) })) };
    const saved = await gradebook.handler({ method: "POST", url: "http://x/api/class-gradebook", headers: { get: () => "" }, json: async () => ({ action: "scheme.save", classId: s.cls, etag: null, scheme }) }, s.deps(s.A));
    expect(saved.jsonBody).toMatchObject({ ok: true, status: "draft", sumIssues: [{ path: "categories.c5.items", sum: 20 }] });
  });
  it("the model is shown this class's sources by reference only: no id, no student, no other class, no class name", async () => {
    const s = await setup();
    await s.ask(s.A, { classId: s.cls, description: DESCRIPTION });
    expect(s.calls).toHaveLength(1);
    const { prompt, schemaName, timeoutMs } = s.calls[0];
    expect(schemaName).toBe("gradebook_scheme_proposal");
    expect(timeoutMs).toBeLessThanOrEqual(25000);
    expect(prompt).toMatch(/^A\d \| واجب أو امتحان \| الوظيفة 1 \| العلامة الكاملة 1 \|/m);   // (same publication time here: any order)
    expect(prompt).toContain(DESCRIPTION);
    for (const secret of [...s.ids, s.foreign, s.cls, s.other, "واجب سري لمعلم آخر", "سلمى", "S-1", "st_1", "العاشر أ"]) expect(prompt).not.toContain(secret);
  });
  it("projects are offered only to a session that may see them", async () => {
    const s = await setup();
    const n = "platform/classes/" + s.cls + ".json";
    s.mem.setJson(n, { ...s.mem.getJson(n), programCodes: ["899373"] });
    await s.ask(s.A, { classId: s.cls, description: DESCRIPTION });
    expect(s.calls[0].prompt).toMatch(/^P1 \| مشروع \| /m);
    await s.ask(s.A, { classId: s.cls, description: DESCRIPTION }, { sessionGrants: async () => NO_PROJECTS });
    expect(s.calls[1].prompt).not.toMatch(/\| مشروع \|/);
  });
  it("the model understood no scheme → 200 ok:false AI_NO_SCHEME; an invented reference never reaches the proposal", async () => {
    const s = await setup();
    let r = await s.ask(s.A, { classId: s.cls, description: "اكتب لي قصيدة" }, { override: async () => ({ result: { categories: [], unmatched: [], assumptions: [] } }) });
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ ok: false, code: "AI_NO_SCHEME" });
    r = await s.ask(s.A, { classId: s.cls, description: DESCRIPTION }, { override: async () => ({ result: { categories: [{ title: "أ", weight: 100, weightSource: "stated", items: [{ kind: "source", ref: s.foreign, manualTitle: "", manualMaxScore: null, weight: 100, weightSource: "stated", mention: "x" }] }], unmatched: [], assumptions: [] } }) });
    expect(r.jsonBody.ok).toBe(true);
    expect(r.jsonBody.proposal.categories[0].items).toEqual([]);
    expect(JSON.stringify(r.jsonBody)).not.toContain(s.foreign);
  });
});

describe("GB10 — refused before any provider call", () => {
  it("another teacher's class is reported as missing; nothing of it is read into a prompt", async () => {
    const s = await setup();
    const r = await s.ask(s.A, { classId: s.other, description: DESCRIPTION });
    expect(r.status + " " + r.jsonBody.code).toBe("404 CLASS_NOT_FOUND");
    expect(s.calls).toHaveLength(0);
  });
  it("an archived class (409 CLASS_ARCHIVED); a scheme an approval locks (409 SCHEME_LOCKED); a corrupt approvals document (503)", async () => {
    const s = await setup();
    const approvals = "platform/gradebooks/" + s.cls + "/approvals.json";
    s.mem.setJson(approvals, { schemaVersion: 1, classId: s.cls, revision: 1, parts: { c1: { approvedAt: "2026-11-01T00:00:00.000Z", schemeRevision: 1, snapshot: { items: [], students: {} } } }, final: null, history: [] });
    expect((await s.ask(s.A, { classId: s.cls, description: DESCRIPTION })).jsonBody.code).toBe("SCHEME_LOCKED");
    s.mem.setJson(approvals, { parts: "corrupt" });
    expect((await s.ask(s.A, { classId: s.cls, description: DESCRIPTION })).status).toBe(503);
    const n = "platform/classes/" + s.cls + ".json";
    s.mem.setJson(n, { ...s.mem.getJson(n), status: "archived" });
    expect((await s.ask(s.A, { classId: s.cls, description: DESCRIPTION })).jsonBody.code).toBe("CLASS_ARCHIVED");
    expect(s.calls).toHaveLength(0);
  });
  it("bad input: no body, a bad classId, no description, a description over 2000 characters", async () => {
    const s = await setup();
    expect((await s.ask(s.A, null)).status).toBe(400);
    expect((await s.ask(s.A, { classId: "../x", description: DESCRIPTION })).status).toBe(400);
    expect((await s.ask(s.A, { classId: s.cls, description: "   " })).jsonBody.code).toBe("DESCRIPTION_REQUIRED");
    expect((await s.ask(s.A, { classId: s.cls, description: "أ".repeat(2001) })).jsonBody.code).toBe("DESCRIPTION_TOO_LONG");
    expect(s.calls).toHaveLength(0);
  });
  it("no session → 401", async () => {
    const s = await setup();
    const r = await schemeAi.handler(req("POST", { classId: s.cls, description: DESCRIPTION }), s.deps({ ok: false, response: { status: 401, jsonBody: { ok: false } } }));
    expect(r.status).toBe(401);
  });
});

describe("GB10 — the provider's failures", () => {
  it("a provider error → 502 AI_PROVIDER_FAILED; a timeout → 504 AI_TIMEOUT; neither text reaches the teacher", async () => {
    const s = await setup();
    let r = await s.ask(s.A, { classId: s.cls, description: DESCRIPTION }, { override: async () => { throw Object.assign(new Error("secret provider detail"), { name: "APIError" }); } });
    expect(r.status + " " + r.jsonBody.code).toBe("502 AI_PROVIDER_FAILED");
    expect(JSON.stringify(r.jsonBody)).not.toContain("secret provider detail");
    r = await s.ask(s.A, { classId: s.cls, description: DESCRIPTION }, { override: async () => { throw Object.assign(new Error("Request timed out."), { name: "APIConnectionTimeoutError" }); } });
    expect(r.status + " " + r.jsonBody.code).toBe("504 AI_TIMEOUT");
  });
  it("a malformed answer → 200 ok:false AI_RESPONSE_MALFORMED", async () => {
    const s = await setup();
    const r = await s.ask(s.A, { classId: s.cls, description: DESCRIPTION }, { override: async () => ({ result: "not json" }) });
    expect(r.jsonBody).toMatchObject({ ok: false, code: "AI_RESPONSE_MALFORMED" });
  });
});

describe("GB10 — both capabilities, in the enforce mode", () => {
  const TEACHER = "t_00000000000000e1";
  function managed(denies) {
    resetRevisionCache(); resetOperatorGateCache();
    process.env.BANK_SETUP_KEY = "gb10-scheme-ai-root-secret";
    const mem = createMemoryContainer();
    const { revision } = buildRevision({ accountId: TEACHER, presetId: "full-teaching", presetVersion: 1, denies, createdBy: "owner:own_0011223344556677" });
    mem.setJson(revisionName(revision.revisionId), revision);
    mem.setJson(teacherAccountName(TEACHER), { schemaVersion: 1, accountId: TEACHER, role: "teacher", username: "t.gb10", displayName: "معلمة تجريبية", status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [], accessRevisionId: revision.revisionId, accessPreset: { id: "full-teaching", version: 1 } });
    mem.setJson(ACCESS_CONTROL_DOC, { schemaVersion: 1, mode: "enforce" });
    mem.setJson("platform/classes/c1.json", { classId: "c1", name: "صف تجريبي", grade: "11", schoolYear: "2026", status: "active", active: true, ownerId: TEACHER, studentIds: [], createdAt: "2026-01-01T00:00:00.000Z" });
    const token = recordedManagedToken(mem, { accountId: TEACHER, sid: newTeacherSessionId(), authVersion: 1 }).token;
    const calls = [];
    const ask = () => schemeAi.handler({ method: "POST", url: "https://x/api/gradebook-scheme-ai", headers: { get: k => (String(k).toLowerCase() === "x-builder-token" ? token : null) }, json: async () => ({ classId: "c1", description: DESCRIPTION }) },
      { getContainer: () => mem.container, container: mem.container, callTextJson: fakeModel(calls) });
    return { ask, calls };
  }
  it("grading without AI authoring → 403; AI authoring without grading → 403; both → the proposal", async () => {
    let p = managed(["examBuilder.ai.use"]);
    let r = await p.ask();
    expect(r.status + " " + r.jsonBody.code).toBe("403 CAPABILITY_DENIED");
    expect(p.calls).toHaveLength(0);
    p = managed(["assignments.grading.grade"]);
    r = await p.ask();
    expect(r.status + " " + r.jsonBody.code).toBe("403 CAPABILITY_DENIED");
    expect(p.calls).toHaveLength(0);
    p = managed([]);
    r = await p.ask();
    expect(r.status).toBe(200);
    expect(p.calls).toHaveLength(1);
  });
});

// ── GB10c (§4.12) — «تعديل المخطط الحالي»: the same route with mode "edit" ─────────────────────────────────────────────────────────────
describe("GB10c — editing the current scheme through the route", () => {
  const current = s => ({ categories: [
    { key: "k1", title: "الشهري", weight: 40, items: [{ key: "k2", weight: 100, source: { kind: "assignment", assignmentId: s.ids[0] } }] },
    { key: "k3", title: "الفصل", weight: 60, items: [{ key: "k4", weight: 100, source: { kind: "manual", title: "الحضور", maxScore: 10 } }] }
  ] });
  const editModel = operations => async args => ({ result: { operations: operations(args), unmatched: [], assumptions: [] } });
  const o = (op, extra = {}) => ({ op, category: "", item: "", title: "", ref: "", manualTitle: "", manualMaxScore: null, weight: null, weightSource: "stated", mention: op, ...extra });
  const refOf = (args, title) => (args.prompt.match(new RegExp("^(A\\d+) \\| واجب أو امتحان \\| " + title + " \\|", "m")) || [])[1] || "";

  it("answers operations by the draft's own keys and the class's sources; the model saw handles only; nothing is written", async () => {
    const s = await setup();
    const before = s.snapshot();
    const r = await s.ask(s.A, { classId: s.cls, description: "أضف امتحان 1 إلى الشهري بوزن 50 واجعل الفصل 50%", mode: "edit", current: current(s) },
      { override: async args => editModel(a => [o("addItem", { category: "K1", ref: refOf(a, "امتحان 1"), weight: 50 }), o("setCategoryWeight", { category: "K2", weight: 50 })])(args) });
    expect(r.status).toBe(200);
    expect(r.jsonBody.ok).toBe(true);
    expect(r.jsonBody.edit.ops).toEqual([
      { op: "addItem", categoryKey: "k1", source: { kind: "assignment", assignmentId: s.ids[1] }, weight: 50 },
      { op: "setCategoryWeight", categoryKey: "k3", weight: 50 }
    ]);
    expect(r.jsonBody.edit.changes).toHaveLength(2);
    expect(r.jsonBody).not.toHaveProperty("edit.result");                                    // the simulation stays on the server
    expect(s.snapshot()).toBe(before);
    const { prompt, schemaName } = s.calls[0];
    expect(schemaName).toBe("gradebook_scheme_edit");
    expect(prompt).toMatch(/^K1 \| الشهري \| 40% من العلامة النهائية$/m);
    expect(prompt).toMatch(/^  - M1 \| الحضور \(علامة يرصدها المعلم من 10\) \| 100%$/m);
    for (const secret of [...s.ids, s.foreign, "k1", "k2", "k3", "k4", "سلمى"]) expect(prompt).not.toMatch(new RegExp("(^|[^\\w])" + secret + "($|[^\\w])", "m"));
  });
  it("a draft that is not one, or an unknown mode, is refused before any provider call", async () => {
    const s = await setup();
    const bad = current(s); bad.categories[1].key = "k1";
    expect((await s.ask(s.A, { classId: s.cls, description: "x", mode: "edit", current: bad })).jsonBody.code).toBe("CURRENT_INVALID");
    expect((await s.ask(s.A, { classId: s.cls, description: "x", mode: "edit" })).jsonBody.code).toBe("CURRENT_INVALID");
    expect((await s.ask(s.A, { classId: s.cls, description: "x", mode: "rewrite" })).jsonBody.code).toBe("UNKNOWN_MODE");
    expect(s.calls).toHaveLength(0);
  });
  it("the same refusals as a proposal: another teacher's class, a locked scheme", async () => {
    const s = await setup();
    expect((await s.ask(s.A, { classId: s.other, description: "x", mode: "edit", current: current(s) })).status).toBe(404);
    s.mem.setJson("platform/gradebooks/" + s.cls + "/approvals.json", { schemaVersion: 1, classId: s.cls, revision: 1, parts: { k1: { approvedAt: "2026-11-01T00:00:00.000Z", schemeRevision: 1, snapshot: { items: [], students: {} } } }, final: null, history: [] });
    expect((await s.ask(s.A, { classId: s.cls, description: "x", mode: "edit", current: current(s) })).jsonBody.code).toBe("SCHEME_LOCKED");
    expect(s.calls).toHaveLength(0);
  });
  it("no change understood → 200 ok:false AI_NO_CHANGE; another class's assignment id written by the model never becomes an operation", async () => {
    const s = await setup();
    let r = await s.ask(s.A, { classId: s.cls, description: "مرحبا", mode: "edit", current: current(s) }, { override: editModel(() => []) });
    expect(r.jsonBody).toMatchObject({ ok: false, code: "AI_NO_CHANGE" });
    r = await s.ask(s.A, { classId: s.cls, description: "x", mode: "edit", current: current(s) }, { override: editModel(() => [o("addItem", { category: "K1", ref: s.foreign, weight: 10 })]) });
    expect(r.jsonBody.edit.ops).toEqual([]);
    expect(r.jsonBody.edit.unmatched.map(u => u.code)).toEqual(["UNKNOWN_SOURCE"]);
    expect(JSON.stringify(r.jsonBody)).not.toContain(s.foreign);
  });
});
