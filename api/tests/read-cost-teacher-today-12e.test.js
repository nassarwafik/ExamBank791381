import { describe, it, expect } from "vitest";
import { handler } from "../src/functions/teacher-today.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { instrumentReadCost } from "./helpers/read-cost.js";

// Phase 12E-A → 12E-B — READ-COST GUARDS for GET /api/teacher-today.
//
// REAL handler + REAL in-memory container: classes / users scans, the per-class assignment index + its bootstrap, the
// per-assignment submission-folder listing and downloads all run for real. Stubbed ONLY: teacher auth and the two
// OPTIONAL, separately-owned blocks (unread-messages summary, project-evaluation sources).
//
// 12E-A BEFORE (kept in docs/read-cost-baseline-12e.md): lists = 3 + P_active, downloads = A_total + C + U + S_active.
//
// 12E-B AFTER (measured here, deliberately replacing the 12E-A BASELINE guards). Classes and users are STILL scanned.
// With at least one active class (X = C_active ? 1 : 0) the index AUTHORITY control is read first, and an
// AUTHORITATIVE result is confirmed by a FINAL control read of the same epoch (2X control reads):
//   MIGRATING (not activated) lists = 2 + X + P_active  downloads = C + U + X + X·A_total (ONE legacy scan) + S_active
//   AUTHORITATIVE, WARM       lists = 2 + P_active      downloads = C + U + 2X + C_active index reads + P_active + S_active
//   AUTHORITATIVE, COLD       lists = 2 + X + P_active  downloads = C + U + 2X + C_active + X·A_total + C_active CAS reads
//                                                                   + S_active;   uploads = C_active (reconciled indexes)
//   C_active = active classes, P_active = published assignments of active classes, S_active = their submission documents.

const AP = "platform/assignments/", CP = "platform/classes/", UP = "platform/users/", SP = "platform/submissions/", IX = "platform/assignment-index/classes/";
const CONTROL = "platform/assignment-index/control.json";
const NOW = Date.UTC(2026, 8, 1, 8, 0, 0);
const req = () => ({ method: "GET", url: "http://x/api/teacher-today", headers: { get: () => null } });
const cls = (classId, status = "active") => ({ classId, name: "صف " + classId, status, active: status === "active" });
const stu = (userId, classId) => ({ userId, role: "student", classId, active: true, archived: false, displayName: "طالب " + userId, code: "C" + userId });
const asg = (id, classId, status = "published") => ({ assignmentId: id, classId, status, title: "واجب " + id, maxAttempts: 2, attemptModelVersion: 2, openAt: "", dueAt: "", questionCount: 1, totalMarks: 10 });
const pending = (aid, sid) => ({ assignmentId: aid, studentId: sid, attempts: [{ attemptNumber: 1, submittedAt: "2026-08-31T10:00:00.000Z", score: 5, totalMarks: 10, percentage: 50, manualReviewMarks: 5, finalized: false }], activeAttempt: null });

function world({ classes = [], students = {}, assignments = [], authoritative = true } = {}) {
  const seed = authoritative ? { [CONTROL]: { schemaVersion: 1, state: "authoritative", epoch: "E1", updatedAt: "2026-01-01T00:00:00.000Z" } } : {};
  for (const c of classes) seed[CP + c.classId + ".json"] = c;
  for (const [classId, n] of Object.entries(students)) for (let i = 0; i < n; i++) { const id = classId + "-s" + i; seed[UP + id + ".json"] = stu(id, classId); }
  for (const { a, subs } of assignments) {
    seed[AP + a.assignmentId + ".json"] = a;
    for (let i = 0; i < subs; i++) { const sid = a.classId + "-s" + i; seed[SP + a.assignmentId + "/" + sid + ".json"] = pending(a.assignmentId, sid); }
  }
  const ctx = createMemoryContainer(seed);
  const activeIds = classes.filter(c => c.status === "active").map(c => c.classId);
  const rel = assignments.filter(({ a }) => a.status === "published" && activeIds.includes(a.classId));
  return {
    ctx, rc: instrumentReadCost(ctx.container), activeIds,
    A_total: assignments.length, C_total: classes.length, C_active: activeIds.length, U_total: Object.values(students).reduce((n, v) => n + v, 0),
    P_active: rel.length, S_active: rel.reduce((n, x) => n + x.subs, 0), relevantIds: rel.map(x => x.a.assignmentId)
  };
}
const logs = [];
const OBS = { logInfo: (event, fields) => logs.push({ event, fields }), logWarn: () => {}, logError: () => {} };
const deps = w => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container: w.ctx.container, nowMs: NOW, teacherDirectUnread: async () => ({ totalUnread: 0, capped: false }), loadProjectEvaluationSources: async () => [] });
async function run(w, obs = OBS) { logs.length = 0; w.rc.reset(); const r = await handler(req(), deps(w), obs); return { r, snap: w.rc.snapshot() }; }
function cost(w, snap) {
  return {
    globalAssignmentLists: w.rc.listsOf(AP), scans: [w.rc.listsOf(CP), w.rc.listsOf(UP)], folderListings: w.rc.listsUnder(SP),
    otherLists: snap.lists - w.rc.listsOf(AP) - w.rc.listsOf(CP) - w.rc.listsOf(UP) - w.rc.listsUnder(SP),
    classDocs: w.rc.downloadsOf(CP), userDocs: w.rc.downloadsOf(UP), controlReads: w.rc.downloadsExact(CONTROL), indexReads: w.rc.downloadsOf(IX), assignmentDocs: w.rc.downloadsOf(AP), submissionDocs: w.rc.downloadsOf(SP),
    otherDownloads: snap.downloads - w.rc.downloadsOf(CP) - w.rc.downloadsOf(UP) - w.rc.downloadsExact(CONTROL) - w.rc.downloadsOf(IX) - w.rc.downloadsOf(AP) - w.rc.downloadsOf(SP),
    indexWrites: w.rc.uploadsOf(IX), otherUploads: snap.uploads - w.rc.uploadsOf(IX)
  };
}
const X = w => (w.C_active ? 1 : 0);
const warm = w => ({ globalAssignmentLists: 0, scans: [1, 1], folderListings: w.P_active, otherLists: 0, classDocs: w.C_total, userDocs: w.U_total, controlReads: 2 * X(w), indexReads: w.C_active, assignmentDocs: w.P_active, submissionDocs: w.S_active, otherDownloads: 0, indexWrites: 0, otherUploads: 0 });
const migrating = w => ({ globalAssignmentLists: X(w), scans: [1, 1], folderListings: w.P_active, otherLists: 0, classDocs: w.C_total, userDocs: w.U_total, controlReads: X(w), indexReads: 0, assignmentDocs: X(w) * w.A_total, submissionDocs: w.S_active, otherDownloads: 0, indexWrites: 0, otherUploads: 0 });
const cold = w => ({ globalAssignmentLists: X(w), scans: [1, 1], folderListings: w.P_active, otherLists: 0, classDocs: w.C_total, userDocs: w.U_total, controlReads: 2 * X(w), indexReads: 2 * w.C_active, assignmentDocs: w.C_active ? w.A_total : 0, submissionDocs: w.S_active, otherDownloads: 0, indexWrites: w.C_active, otherUploads: 0 });
const published = (n, classId, subs, prefix = classId + "-p") => Array.from({ length: n }, (_, i) => ({ a: asg(prefix + i, classId), subs }));
const archivedHistory = (n, classId, subs = 3) => Array.from({ length: n }, (_, i) => ({ a: asg(classId + "-h" + i, classId, i % 2 ? "draft" : "archived"), subs }));
const strip = body => { const { generatedAt: _g, ...rest } = body; return rest; };

describe("12E-B teacher today — MIGRATING (index authority not activated): the pre-12E-B assignment read, every request", () => {
  for (const [name, spec] of [["T1", { classes: [cls("c1")], students: { c1: 3 }, assignments: published(1, "c1", 2) }], ["T-MANY-OTHER/INACTIVE", { classes: [cls("c1"), cls("c2", "archived")], students: { c1: 3, c2: 3 }, assignments: [...published(1, "c1", 2), ...published(40, "c2", 3)] }]]) {
    it(name + ": one legacy scan per request, no index read or write — even with a stale ready index present", async () => {
      const w = world({ ...spec, authoritative: false });
      w.ctx.setJson(IX + "c1.json", { schemaVersion: 1, classId: "c1", ready: true, epoch: "OLD", publishedAssignmentIds: [], updatedAt: "2026-01-01T00:00:00.000Z" });
      for (let i = 0; i < 2; i++) {
        const { r, snap } = await run(w);
        expect(r.jsonBody.scope.publishedAssignments).toBe(w.P_active);
        expect(cost(w, snap)).toEqual(migrating(w));
      }
    });
  }
});

describe("12E-B teacher today — AUTHORITATIVE: cold (reconcile) then warm (steady state), real handler + real container", () => {
  const scenarios = [
    ["T0 — empty school", {}],
    ["T1 — one active class, one published assignment, 2 submissions", { classes: [cls("c1")], students: { c1: 3 }, assignments: published(1, "c1", 2) }],
    ["T10 — ten published assignments × 3 submissions", { classes: [cls("c1")], students: { c1: 3 }, assignments: published(10, "c1", 3) }],
    ["T-MANY-ARCHIVED — 1 published + 30 archived + 10 drafts (all with submissions)", { classes: [cls("c1")], students: { c1: 3 }, assignments: [...published(1, "c1", 2), ...Array.from({ length: 30 }, (_, i) => ({ a: asg("c1-r" + i, "c1", "archived"), subs: 3 })), ...Array.from({ length: 10 }, (_, i) => ({ a: asg("c1-d" + i, "c1", "draft"), subs: 1 }))] }],
    ["T-MANY-OTHER/INACTIVE — 1 published in the active class + 40 published in an ARCHIVED class", { classes: [cls("c1"), cls("c2", "archived")], students: { c1: 3, c2: 3 }, assignments: [...published(1, "c1", 2), ...published(40, "c2", 3)] }],
  ];
  for (const [name, spec] of scenarios) {
    it(name + ": cold = at most one legacy scan; warm = no assignment listing, only published documents of active classes", async () => {
      const w = world(spec);
      const c = await run(w);
      expect(c.r.status).toBe(200);
      expect(c.r.jsonBody.scope.publishedAssignments).toBe(w.P_active);
      expect(c.r.jsonBody.attention.pendingReview.count).toBe(w.S_active);
      expect(cost(w, c.snap)).toEqual(cold(w));
      const h = await run(w);
      expect(cost(w, h.snap)).toEqual(warm(w));
      expect(w.rc.ops.lists.filter(p => p.startsWith(SP)).sort()).toEqual(w.relevantIds.map(id => SP + id + "/").sort());
      expect(w.rc.ops.downloads.filter(n => n.startsWith(AP)).sort()).toEqual(w.relevantIds.map(id => AP + id + ".json").sort());
      expect(strip(h.r.jsonBody)).toEqual(strip(c.r.jsonBody));                   // cold == warm response
    });
  }

  it("exact WARM numbers of the named fixtures (documented in docs/read-cost-baseline-12e.md, 12E-B section)", async () => {
    const measured = {};
    for (const [name, spec] of scenarios) { const w = world(spec); await run(w); const { snap } = await run(w); measured[name.split(" — ")[0]] = { lists: snap.lists, downloads: snap.downloads, assignmentDocs: w.rc.downloadsOf(AP), globalScans: w.rc.listsOf(AP) }; }
    expect(measured).toEqual({
      T0: { lists: 2, downloads: 0, assignmentDocs: 0, globalScans: 0 },
      T1: { lists: 3, downloads: 10, assignmentDocs: 1, globalScans: 0 },
      T10: { lists: 12, downloads: 47, assignmentDocs: 10, globalScans: 0 },
      "T-MANY-ARCHIVED": { lists: 3, downloads: 10, assignmentDocs: 1, globalScans: 0 },
      "T-MANY-OTHER/INACTIVE": { lists: 3, downloads: 14, assignmentDocs: 1, globalScans: 0 },
    });
  });
});

describe("12E-B teacher today — steady-state guards (replace the 12E-A BASELINE: history costs NOTHING)", () => {
  // 12E-A BEFORE: assignment downloads = 1 / 11 / 101 for 0 / 10 / 100 historical assignments (fixed relevant set).
  for (const history of [0, 10, 100]) {
    it(`WARM fixed relevant set + ${history} draft/archived assignments in the SAME class: 1 assignment document, 1 folder, 2 submissions, 0 scans`, async () => {
      const w = world({ classes: [cls("c1")], students: { c1: 3 }, assignments: [...published(1, "c1", 2), ...archivedHistory(history, "c1")] });
      await run(w);
      const { r, snap } = await run(w);
      expect(r.jsonBody.scope.publishedAssignments).toBe(1);
      expect(cost(w, snap)).toEqual(warm(w));
      expect(cost(w, snap).assignmentDocs).toBe(1);
    });
  }

  it("WARM: the same relevant set with 0 history, 100 same-class history, or 100 assignments of an ARCHIVED class reads the same assignment metadata", async () => {
    const worlds = [
      world({ classes: [cls("c1")], students: { c1: 3 }, assignments: published(1, "c1", 2) }),
      world({ classes: [cls("c1")], students: { c1: 3 }, assignments: [...published(1, "c1", 2), ...archivedHistory(100, "c1")] }),
      world({ classes: [cls("c1"), cls("old", "archived")], students: { c1: 3 }, assignments: [...published(1, "c1", 2), ...published(100, "old", 1)] }),
    ];
    const out = [];
    for (const w of worlds) { await run(w); const { r } = await run(w); out.push({ body: strip(r.jsonBody), assignmentDocs: w.rc.downloadsOf(AP), folders: w.rc.listsUnder(SP), subs: w.rc.downloadsOf(SP), scans: w.rc.listsOf(AP) }); }
    for (const o of out) expect([o.assignmentDocs, o.folders, o.subs, o.scans]).toEqual([1, 1, 2, 0]);
    expect(out[1].body).toEqual(out[0].body);
    expect(out[2].body).toEqual(out[0].body);
  });

  it("COLD multi-class: 4 active classes without an index share ONE global scan and are all bootstrapped; the next request scans nothing", async () => {
    const w = world({ classes: [cls("a"), cls("b"), cls("c"), cls("d"), cls("z", "archived")], students: { a: 1, b: 1, c: 1, d: 1 }, assignments: [...published(2, "a", 1), ...published(1, "b", 1), ...published(3, "d", 0), ...published(5, "z", 0), ...archivedHistory(20, "c")] });
    const c = await run(w);
    expect(w.rc.listsOf(AP)).toBe(1);
    expect(cost(w, c.snap)).toEqual(cold(w));
    for (const id of ["a", "b", "c", "d"]) expect(w.ctx.getJson(IX + id + ".json")).toMatchObject({ ready: true, epoch: "E1" });
    expect(w.ctx.has(IX + "z.json")).toBe(false);                                // archived classes are not bootstrapped
    const h = await run(w);
    expect(w.rc.listsOf(AP)).toBe(0);
    expect(cost(w, h.snap)).toEqual(warm(w));
    expect(strip(h.r.jsonBody)).toEqual(strip(c.r.jsonBody));
  });
});

describe("12E-B teacher today — count-only observability + response parity", () => {
  it("emits ONE teacher.today.read_cost event with exactly the eleven numeric fields (cold, warm, migrating)", async () => {
    const w = world({ classes: [cls("c1"), cls("c2", "archived")], students: { c1: 3, c2: 1 }, assignments: [...published(2, "c1", 3), { a: asg("c1-d0", "c1", "draft"), subs: 1 }, ...published(1, "c2", 1)] });
    await run(w);
    expect(logs.filter(l => l.event === "teacher.today.read_cost").map(l => l.fields)).toEqual([{ assignmentDocsScanned: 4, classDocsScanned: 2, userDocsScanned: 4, publishedActiveAssignments: 2, submissionFolderListings: 2, submissionDocsLoaded: 6, assignmentIndexReads: 1, assignmentIndexesBootstrapped: 1, globalAssignmentScans: 1, assignmentIndexAuthoritative: 1, assignmentIndexAuthorityChanges: 0 }]);
    await run(w);
    expect(logs.filter(l => l.event === "teacher.today.read_cost").map(l => l.fields)).toEqual([{ assignmentDocsScanned: 2, classDocsScanned: 2, userDocsScanned: 4, publishedActiveAssignments: 2, submissionFolderListings: 2, submissionDocsLoaded: 6, assignmentIndexReads: 1, assignmentIndexesBootstrapped: 0, globalAssignmentScans: 0, assignmentIndexAuthoritative: 1, assignmentIndexAuthorityChanges: 0 }]);
    const m = world({ authoritative: false, classes: [cls("c1"), cls("c2", "archived")], students: { c1: 3, c2: 1 }, assignments: [...published(2, "c1", 3), { a: asg("c1-d0", "c1", "draft"), subs: 1 }, ...published(1, "c2", 1)] });
    await run(m);
    expect(logs.filter(l => l.event === "teacher.today.read_cost").map(l => l.fields)).toEqual([{ assignmentDocsScanned: 4, classDocsScanned: 2, userDocsScanned: 4, publishedActiveAssignments: 2, submissionFolderListings: 2, submissionDocsLoaded: 6, assignmentIndexReads: 0, assignmentIndexesBootstrapped: 0, globalAssignmentScans: 1, assignmentIndexAuthoritative: 0, assignmentIndexAuthorityChanges: 0 }]);
    const text = JSON.stringify(logs);
    for (const leak of ["c1", "c2", "teacher-1", "واجب", "طالب", "p0", "platform/"]) expect(text).not.toContain(leak);
  });

  it("a throwing logger never fails the request; the response is identical with or without observability and has no metrics / index field", async () => {
    const w = world({ classes: [cls("c1")], students: { c1: 2 }, assignments: published(3, "c1", 2) });
    const withObs = (await run(w)).r, noObs = (await run(w, null)).r;
    const broken = (await run(w, { logInfo: () => { throw new Error("sink down"); }, logError: () => {}, logWarn: () => { throw new Error("x"); } })).r;
    expect(broken.status).toBe(200);
    expect(noObs.jsonBody).toEqual(withObs.jsonBody);
    expect(broken.jsonBody).toEqual(withObs.jsonBody);
    expect(Object.keys(withObs.jsonBody).sort()).toEqual(["attention", "generatedAt", "ok", "partial", "projectEvaluation", "recent", "scope"]);
    for (const k of ["readCost", "read_cost", "debug", "metrics", "submissionDocsLoaded", "assignment-index", "publishedAssignmentIds"]) expect(JSON.stringify(withObs.jsonBody)).not.toContain(k);
  });
});
