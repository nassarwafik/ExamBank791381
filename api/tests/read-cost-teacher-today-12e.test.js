import { describe, it, expect } from "vitest";
import { handler } from "../src/functions/teacher-today.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { instrumentReadCost } from "./helpers/read-cost.js";

// Phase 12E-A — READ-COST BASELINE for GET /api/teacher-today.
//
// REAL handler + REAL in-memory container: the assignments / classes / users scans (platform-storage listJson), the
// per-assignment submission-folder listing (listBlobNames) and its downloads (downloadManyJson) all run for real.
// Stubbed ONLY: teacher auth and the two OPTIONAL, separately-owned blocks (the unread-messages summary and the
// project-evaluation sources), which would otherwise add their own reads to the fixture.
//
// CURRENT FORMULA (measured, this commit):
//   lists     = 3 + P_active            (assignments/, classes/, users/ + one folder listing per relevant assignment)
//   downloads = A_total + C_total + U_total + S_active
//   A_total  = every stored assignment document        C_total = every class document     U_total = every user document
//   P_active = published assignments of ACTIVE classes S_active = submission documents in those P_active folders
// Drafts, archived assignments and assignments of archived classes are downloaded by the global assignments scan
// (A_total) but NEVER cause a submission-folder listing or a submission download.
//
// ⚠ BASELINE guards pin the CURRENT scaling ON PURPOSE; Phase 12E-B is expected to change them deliberately.

const AP = "platform/assignments/", CP = "platform/classes/", UP = "platform/users/", SP = "platform/submissions/";
const NOW = Date.UTC(2026, 8, 1, 8, 0, 0);
const req = () => ({ method: "GET", url: "http://x/api/teacher-today", headers: { get: () => null } });
const cls = (classId, status = "active") => ({ classId, name: "صف " + classId, status, active: status === "active" });
const stu = (userId, classId) => ({ userId, role: "student", classId, active: true, archived: false, displayName: "طالب " + userId, code: "C" + userId });
const asg = (id, classId, status = "published") => ({ assignmentId: id, classId, status, title: "واجب " + id, maxAttempts: 2, attemptModelVersion: 2, openAt: "", dueAt: "", questionCount: 1, totalMarks: 10 });
const pending = (aid, sid) => ({ assignmentId: aid, studentId: sid, attempts: [{ attemptNumber: 1, submittedAt: "2026-08-31T10:00:00.000Z", score: 5, totalMarks: 10, percentage: 50, manualReviewMarks: 5, finalized: false }], activeAttempt: null });

/** A seedable world: classes, students per class, assignments (with a status) and the number of submissions per assignment. */
function world({ classes = [], students = {}, assignments = [] } = {}) {
  const seed = {};
  for (const c of classes) seed[CP + c.classId + ".json"] = c;
  for (const [classId, n] of Object.entries(students)) for (let i = 0; i < n; i++) { const id = classId + "-s" + i; seed[UP + id + ".json"] = stu(id, classId); }
  let S_all = 0;
  for (const { a, subs } of assignments) {
    seed[AP + a.assignmentId + ".json"] = a;
    for (let i = 0; i < subs; i++) { const sid = a.classId + "-s" + i; seed[SP + a.assignmentId + "/" + sid + ".json"] = pending(a.assignmentId, sid); S_all++; }
  }
  const ctx = createMemoryContainer(seed);
  const activeIds = new Set(classes.filter(c => c.status === "active").map(c => c.classId));
  const rel = assignments.filter(({ a }) => a.status === "published" && activeIds.has(a.classId));
  return {
    ctx, rc: instrumentReadCost(ctx.container),
    A_total: assignments.length, C_total: classes.length, U_total: Object.values(students).reduce((n, v) => n + v, 0),
    P_active: rel.length, S_active: rel.reduce((n, x) => n + x.subs, 0), S_all, relevantIds: rel.map(x => x.a.assignmentId)
  };
}
const logs = [];
const OBS = { logInfo: (event, fields) => logs.push({ event, fields }), logWarn: () => {}, logError: () => {} };
const deps = w => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container: w.ctx.container, nowMs: NOW, teacherDirectUnread: async () => ({ totalUnread: 0, capped: false }), loadProjectEvaluationSources: async () => [] });
async function run(w, obs = OBS) { logs.length = 0; const r = await handler(req(), deps(w), obs); return { r, snap: w.rc.snapshot() }; }
function cost(w, snap) {
  return {
    scans: [w.rc.listsOf(AP), w.rc.listsOf(CP), w.rc.listsOf(UP)],
    folderListings: w.rc.listsUnder(SP), otherLists: snap.lists - 3 - w.rc.listsUnder(SP),
    assignmentDocs: w.rc.downloadsOf(AP), classDocs: w.rc.downloadsOf(CP), userDocs: w.rc.downloadsOf(UP), submissionDocs: w.rc.downloadsOf(SP),
    otherDownloads: snap.downloads - w.rc.downloadsOf(AP) - w.rc.downloadsOf(CP) - w.rc.downloadsOf(UP) - w.rc.downloadsOf(SP), uploads: snap.uploads
  };
}
const expected = w => ({ scans: [1, 1, 1], folderListings: w.P_active, otherLists: 0, assignmentDocs: w.A_total, classDocs: w.C_total, userDocs: w.U_total, submissionDocs: w.S_active, otherDownloads: 0, uploads: 0 });
const published = (n, classId, subs, prefix = classId + "-p") => Array.from({ length: n }, (_, i) => ({ a: asg(prefix + i, classId), subs }));

describe("12E-A teacher today — measured read cost (real handler + real memory container)", () => {
  const scenarios = [
    ["T0 — empty school", {}],
    ["T1 — one active class, one published assignment, 2 submissions", { classes: [cls("c1")], students: { c1: 3 }, assignments: published(1, "c1", 2) }],
    ["T10 — ten published assignments × 3 submissions", { classes: [cls("c1")], students: { c1: 3 }, assignments: published(10, "c1", 3) }],
    ["T-MANY-ARCHIVED — 1 published + 30 archived + 10 drafts (all with submissions)", { classes: [cls("c1")], students: { c1: 3 }, assignments: [...published(1, "c1", 2), ...Array.from({ length: 30 }, (_, i) => ({ a: asg("c1-r" + i, "c1", "archived"), subs: 3 })), ...Array.from({ length: 10 }, (_, i) => ({ a: asg("c1-d" + i, "c1", "draft"), subs: 1 }))] }],
    ["T-MANY-OTHER/INACTIVE — 1 published in the active class + 40 published in an ARCHIVED class", { classes: [cls("c1"), cls("c2", "archived")], students: { c1: 3, c2: 3 }, assignments: [...published(1, "c1", 2), ...published(40, "c2", 3)] }],
  ];
  for (const [name, spec] of scenarios) {
    it(name + ": 3 scans + P_active folder listings; downloads = A + C + U + S_active", async () => {
      const w = world(spec);
      const { r, snap } = await run(w);
      expect(r.status).toBe(200);
      expect(r.jsonBody.scope.publishedAssignments).toBe(w.P_active);
      expect(r.jsonBody.attention.pendingReview.count).toBe(w.S_active);           // every seeded submission is pending
      expect(cost(w, snap)).toEqual(expected(w));
      // folder listings are EXACTLY the relevant assignments' folders — never a draft / archived / archived-class one
      expect(w.rc.ops.lists.filter(p => p.startsWith(SP)).sort()).toEqual(w.relevantIds.map(id => SP + id + "/").sort());
      expect(w.rc.ops.downloads.filter(n => n.startsWith(SP)).every(n => w.relevantIds.some(id => n.startsWith(SP + id + "/")))).toBe(true);
    });
  }

  it("exact numbers of the named fixtures (documented in docs/read-cost-baseline-12e.md)", async () => {
    const measured = {};
    for (const [name, spec] of scenarios) { const w = world(spec); const { snap } = await run(w); measured[name.split(" — ")[0]] = { A: w.A_total, C: w.C_total, U: w.U_total, P: w.P_active, S: w.S_active, lists: snap.lists, downloads: snap.downloads }; }
    expect(measured).toEqual({
      T0: { A: 0, C: 0, U: 0, P: 0, S: 0, lists: 3, downloads: 0 },
      T1: { A: 1, C: 1, U: 3, P: 1, S: 2, lists: 4, downloads: 7 },
      T10: { A: 10, C: 1, U: 3, P: 10, S: 30, lists: 13, downloads: 44 },
      "T-MANY-ARCHIVED": { A: 41, C: 1, U: 3, P: 1, S: 2, lists: 4, downloads: 47 },
      "T-MANY-OTHER/INACTIVE": { A: 41, C: 2, U: 6, P: 1, S: 2, lists: 4, downloads: 51 },
    });
  });
});

describe("12E-A teacher today — BASELINE guards for Phase 12E-B (current scaling pinned on purpose)", () => {
  // Active relevant work stays FIXED (1 published assignment, 2 submissions); unrelated history grows.
  for (const history of [0, 10, 100]) {
    it(`BASELINE fixed relevant set + ${history} archived historical assignments: assignment downloads = ${1 + history}, folder listings = 1, submission downloads = 2`, async () => {
      const w = world({ classes: [cls("c1")], students: { c1: 3 }, assignments: [...published(1, "c1", 2), ...Array.from({ length: history }, (_, i) => ({ a: asg("h" + i, "c1", "archived"), subs: 3 }))] });
      const { r, snap } = await run(w);
      expect(r.jsonBody.scope.publishedAssignments).toBe(1);
      expect(cost(w, snap)).toEqual({ ...expected(w), assignmentDocs: 1 + history, folderListings: 1, submissionDocs: 2 });
    });
  }

  it("BASELINE: unrelated historical assignments change only the metadata scan, never the submission work or the response", async () => {
    const base = world({ classes: [cls("c1")], students: { c1: 3 }, assignments: published(1, "c1", 2) });
    const hist = world({ classes: [cls("c1"), cls("old", "archived")], students: { c1: 3 }, assignments: [...published(1, "c1", 2), ...published(60, "old", 3)] });
    const a = await run(base), b = await run(hist);
    expect(cost(hist, b.snap).assignmentDocs - cost(base, a.snap).assignmentDocs).toBe(60);
    expect([cost(hist, b.snap).folderListings, cost(hist, b.snap).submissionDocs]).toEqual([1, 2]);
    const { generatedAt: _g1, ...ra } = a.r.jsonBody, { generatedAt: _g2, ...rb } = b.r.jsonBody;
    expect(rb).toEqual(ra);
  });
});

describe("12E-A teacher today — count-only observability + response parity", () => {
  it("emits ONE teacher.today.read_cost event with exactly the six numeric fields (no identifier, name, title or mark)", async () => {
    const w = world({ classes: [cls("c1"), cls("c2", "archived")], students: { c1: 3, c2: 1 }, assignments: [...published(2, "c1", 3), { a: asg("c1-d0", "c1", "draft"), subs: 1 }, ...published(1, "c2", 1)] });
    await run(w);
    const rc = logs.filter(l => l.event === "teacher.today.read_cost");
    expect(rc).toHaveLength(1);
    expect(rc[0].fields).toEqual({ assignmentDocsScanned: 4, classDocsScanned: 2, userDocsScanned: 4, publishedActiveAssignments: 2, submissionFolderListings: 2, submissionDocsLoaded: 6 });
    const text = JSON.stringify(logs);
    for (const leak of ["c1", "c2", "teacher-1", "واجب", "طالب", "p0"]) expect(text).not.toContain(leak);
  });

  it("a throwing logger never fails the request; the response is identical with or without observability and has no metrics field", async () => {
    const w = world({ classes: [cls("c1")], students: { c1: 2 }, assignments: published(3, "c1", 2) });
    const withObs = (await run(w)).r, noObs = (await run(w, null)).r;
    const broken = (await run(w, { logInfo: () => { throw new Error("sink down"); }, logError: () => {}, logWarn: () => {} })).r;
    expect(broken.status).toBe(200);
    expect(noObs.jsonBody).toEqual(withObs.jsonBody);
    expect(broken.jsonBody).toEqual(withObs.jsonBody);
    expect(Object.keys(withObs.jsonBody).sort()).toEqual(["attention", "generatedAt", "ok", "partial", "projectEvaluation", "recent", "scope"]);
    for (const k of ["readCost", "read_cost", "debug", "metrics", "submissionDocsLoaded"]) expect(JSON.stringify(withObs.jsonBody)).not.toContain(k);
  });
});
