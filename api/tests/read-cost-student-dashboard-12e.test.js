import { describe, it, expect } from "vitest";
import { handler } from "../src/functions/student-dashboard.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { instrumentReadCost } from "./helpers/read-cost.js";

// Phase 12E-A → 12E-B — READ-COST GUARDS for GET /api/student-dashboard.
//
// REAL handler over the REAL in-memory blob container (real listBlobsFlat / download / conditional upload through the
// real platform-storage + class-assignment-index). Injected ONLY: the student token check (the session is still the real
// requireActiveStudentSession reading the user document), the stage-milestone writer and the recognition aggregate.
//
// 12E-A BEFORE (kept in docs/read-cost-baseline-12e.md): lists = 1, downloads = K + A_total + P_class — every stored
// assignment of every class was downloaded on every request.
//
// 12E-B AFTER (measured here, deliberately replacing the 12E-A BASELINE guards). Every request first reads the index
// AUTHORITY control document; an AUTHORITATIVE result is returned only after a FINAL control read confirms the same
// epoch (2 control reads in total):
//   MIGRATING (not activated) lists = 1 (legacy) downloads = K + 1 control + A_total + P_class          uploads = 0
//   AUTHORITATIVE, WARM       lists = 0          downloads = K + 2 control + 1 index + P_class + P_class uploads = 0
//   AUTHORITATIVE, COLD       lists = 1 (legacy) downloads = K + 2 control + 1 index + A_total + 1 reconcile CAS read
//     (first request per class                   + P_class;  uploads = 1 (the class index, ready:true, epoch)
//      after activation)
//   K = 5 fixed documents (user, class, practice, study, games) for a class without projects.

const AP = "platform/assignments/", SP = "platform/submissions/", UP = "platform/users/", CP = "platform/classes/";
const IX = "platform/assignment-index/classes/", CONTROL = "platform/assignment-index/control.json";
const AUTHORITATIVE = { [CONTROL]: { schemaVersion: 1, state: "authoritative", epoch: "E1", updatedAt: "2026-01-01T00:00:00.000Z" } };
const FIXED = ["platform/users/u1.json", "platform/classes/c1.json", "platform/learning-practice/u1.json", "platform/learning-study/u1.json", "platform/games/results/u1.json"];
const K = FIXED.length;
const req = () => ({ method: "GET", url: "http://x/api/student-dashboard", headers: { get: () => null } });
const student = { userId: "u1", role: "student", classId: "c1", active: true, archived: false, authVersion: 1, code: "S1", displayName: "علي" };
const assignment = (id, classId, over = {}) => ({ assignmentId: id, classId, status: "published", title: "واجب " + id, instructions: "", maxAttempts: 2, durationMinutes: 0, attemptModelVersion: 2, questionCount: 1, totalMarks: 10, openAt: "", dueAt: "", createdAt: "2026-01-01T00:00:00.000Z", ...over });

/**
 * mine = published c1 assignments (P_class); other = published c2 assignments; drafts / archived = c1 assignments that
 * are NOT published; withSubmission = how many of `mine` have a stored submission.
 */
function scenario({ mine = 0, other = 0, drafts = 0, archived = 0, withSubmission = 0, authoritative = true } = {}) {
  const seed = { ...(authoritative ? AUTHORITATIVE : {}), [UP + "u1.json"]: student, [CP + "c1.json"]: { classId: "c1", name: "أ", status: "active", active: true }, [CP + "c2.json"]: { classId: "c2", name: "ب", status: "active", active: true } };
  for (let i = 0; i < mine; i++) seed[AP + "m" + i + ".json"] = assignment("m" + i, "c1");
  for (let i = 0; i < other; i++) seed[AP + "o" + i + ".json"] = assignment("o" + i, "c2");
  for (let i = 0; i < drafts; i++) seed[AP + "d" + i + ".json"] = assignment("d" + i, "c1", { status: "draft" });
  for (let i = 0; i < archived; i++) seed[AP + "r" + i + ".json"] = assignment("r" + i, "c1", { status: "archived", archivedFromStatus: "published" });
  for (let i = 0; i < withSubmission; i++) seed[SP + "m" + i + "/u1.json"] = { assignmentId: "m" + i, studentId: "u1", classId: "c1", attempts: [{ attemptNumber: 1, submittedAt: "2026-02-01T10:00:00.000Z", score: 8, totalMarks: 10, percentage: 80, manualReviewMarks: 0, finalized: true }], activeAttempt: null };
  const ctx = createMemoryContainer(seed);
  return { ctx, rc: instrumentReadCost(ctx.container), A_total: mine + other + drafts + archived, P_class: mine };
}
const logs = [];
const OBS = { logInfo: (event, fields) => logs.push({ event, fields }), logWarn: () => {}, logError: () => {} };
const deps = ctx => ({ container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub: "u1", sv: 1 } }), recordGlobalRankMilestone: async () => {}, aggregateRecognition: async () => new Map() });
async function run(s, obs = OBS) { logs.length = 0; s.rc.reset(); const r = await handler(req(), deps(s.ctx), obs); return { r, snap: s.rc.snapshot() }; }
function cost(s, snap) {
  return {
    globalAssignmentLists: s.rc.listsOf(AP), otherLists: snap.lists - s.rc.listsOf(AP), controlReads: s.rc.downloadsExact(CONTROL),
    indexReads: s.rc.downloadsOf(IX), assignmentDocs: s.rc.downloadsOf(AP), submissionReads: s.rc.downloadsOf(SP),
    fixed: snap.downloads - s.rc.downloadsExact(CONTROL) - s.rc.downloadsOf(IX) - s.rc.downloadsOf(AP) - s.rc.downloadsOf(SP), indexWrites: s.rc.uploadsOf(IX), otherUploads: snap.uploads - s.rc.uploadsOf(IX)
  };
}
const warmCost = P => ({ globalAssignmentLists: 0, otherLists: 0, controlReads: 2, indexReads: 1, assignmentDocs: P, submissionReads: P, fixed: K, indexWrites: 0, otherUploads: 0 });
const coldCost = (A, P) => ({ globalAssignmentLists: 1, otherLists: 0, controlReads: 2, indexReads: 2, assignmentDocs: A, submissionReads: P, fixed: K, indexWrites: 1, otherUploads: 0 });
const migratingCost = (A, P) => ({ globalAssignmentLists: 1, otherLists: 0, controlReads: 1, indexReads: 0, assignmentDocs: A, submissionReads: P, fixed: K, indexWrites: 0, otherUploads: 0 });
const mineIds = n => Array.from({ length: n }, (_, i) => "m" + i).sort();

describe("12E-B student dashboard — MIGRATING (index authority not activated): the pre-12E-B read path, every request", () => {
  for (const [name, spec] of [["S1", { mine: 1, withSubmission: 1 }], ["S-OTHER", { mine: 3, other: 100, drafts: 5, archived: 5, withSubmission: 3 }]]) {
    it(name + ": one legacy scan per request, no index read, no index write — even with a stale ready index present", async () => {
      const s = scenario({ ...spec, authoritative: false });
      s.ctx.setJson(IX + "c1.json", { schemaVersion: 1, classId: "c1", ready: true, epoch: "OLD", publishedAssignmentIds: [], updatedAt: "2026-01-01T00:00:00.000Z" });
      for (let i = 0; i < 2; i++) {
        const { r, snap } = await run(s);
        expect(r.status).toBe(200);
        expect(r.jsonBody.assignments.map(a => a.assignmentId).sort()).toEqual(mineIds(s.P_class));
        expect(cost(s, snap)).toEqual(migratingCost(s.A_total, s.P_class));
      }
    });
  }
});

describe("12E-B student dashboard — AUTHORITATIVE: cold (reconcile) then warm (steady state), real handler + real container", () => {
  const table = [
    ["S0 — no assignment", { mine: 0 }],
    ["S1 — one published class assignment", { mine: 1, withSubmission: 1 }],
    ["S10 — ten published class assignments", { mine: 10, withSubmission: 5 }],
    ["S50 — fifty published class assignments", { mine: 50, withSubmission: 20 }],
    ["S-OTHER — 3 in the class, 100 in another class, + 5 drafts + 5 archived", { mine: 3, other: 100, drafts: 5, archived: 5, withSubmission: 3 }],
  ];
  for (const [name, spec] of table) {
    it(name + ": cold = ONE legacy scan + bootstrap write; warm = no listing, only the class's published documents", async () => {
      const s = scenario(spec);
      const cold = await run(s);
      expect(cold.r.status).toBe(200);
      expect(cold.r.jsonBody.assignments.map(a => a.assignmentId).sort()).toEqual(mineIds(s.P_class));
      expect(cost(s, cold.snap)).toEqual(coldCost(s.A_total, s.P_class));
      expect(s.ctx.getJson(IX + "c1.json")).toMatchObject({ schemaVersion: 1, classId: "c1", ready: true, epoch: "E1", publishedAssignmentIds: mineIds(s.P_class) });
      const warm = await run(s);
      expect(cost(s, warm.snap)).toEqual(warmCost(s.P_class));
      for (const n of FIXED) expect(s.rc.downloadsExact(n)).toBe(1);
      expect(warm.snap.log.downloads.filter(n => n.startsWith(AP)).sort()).toEqual(mineIds(s.P_class).map(id => AP + id + ".json"));
      expect(warm.snap.log.downloads.filter(n => n.startsWith(SP)).sort()).toEqual(mineIds(s.P_class).map(id => SP + id + "/u1.json"));
      // response parity: the cold (scan) response and the warm (index) response are identical
      expect(warm.r.jsonBody).toEqual(cold.r.jsonBody);
      expect(warm.r.jsonBody.stats.assigned).toBe(s.P_class);
      expect(warm.r.jsonBody.stats.finalized).toBe(spec.withSubmission || 0);
    });
  }
});

describe("12E-B student dashboard — steady-state guards (replace the 12E-A BASELINE: unrelated history costs NOTHING)", () => {
  // 12E-A BEFORE: assignment metadata downloads = 1 / 10 / 100 for A_total = 1 / 10 / 100 (P_class = 1).
  for (const [A_total, others] of [[1, 0], [10, 9], [100, 99], [1000, 999]]) {
    it(`WARM P_class=1, A_total=${A_total}: 0 global listings, exactly ONE assignment document, one submission read`, async () => {
      const s = scenario({ mine: 1, other: others, withSubmission: 1 });
      await run(s);                                                              // cold bootstrap
      const { r, snap } = await run(s);
      expect(r.jsonBody.assignments.map(a => a.assignmentId)).toEqual(["m0"]);
      expect(cost(s, snap)).toEqual(warmCost(1));
    });
  }

  it("WARM same-class history: 1 published + 100 drafts/archived IN c1 → still only the published document is downloaded", async () => {
    const s = scenario({ mine: 1, drafts: 50, archived: 50, withSubmission: 1 });
    await run(s);
    const { r, snap } = await run(s);
    expect(r.jsonBody.assignments.map(a => a.assignmentId)).toEqual(["m0"]);
    expect(cost(s, snap)).toEqual(warmCost(1));
    expect(s.rc.downloadsExact(AP + "m0.json")).toBe(1);
  });

  it("COLD→WARM legacy fixture (no index; 1 published + 200 unrelated/draft/archived): first request scans once and bootstraps, second is indexed and identical", async () => {
    const s = scenario({ mine: 1, other: 100, drafts: 50, archived: 50, withSubmission: 1 });
    expect(s.ctx.has(IX + "c1.json")).toBe(false);
    const cold = await run(s);
    expect(cost(s, cold.snap)).toEqual(coldCost(201, 1));
    expect(s.ctx.getJson(IX + "c1.json").ready).toBe(true);
    const warm = await run(s);
    expect(cost(s, warm.snap)).toEqual(warmCost(1));
    expect(warm.r.jsonBody).toEqual(cold.r.jsonBody);
  });
});

describe("12E-B student dashboard — count-only observability + response parity", () => {
  it("emits ONE student.dashboard.read_cost event with exactly the eight numeric fields (cold, warm, migrating)", async () => {
    const s = scenario({ mine: 3, other: 7, drafts: 2, withSubmission: 1 });
    await run(s);
    const cold = logs.filter(l => l.event === "student.dashboard.read_cost");
    expect(cold).toHaveLength(1);
    expect(cold[0].fields).toEqual({ assignmentDocsScanned: 12, publishedClassAssignments: 3, submissionReads: 3, assignmentIndexReads: 1, assignmentIndexesBootstrapped: 1, globalAssignmentScans: 1, assignmentIndexAuthoritative: 1, assignmentIndexAuthorityChanges: 0 });
    await run(s);
    const warm = logs.filter(l => l.event === "student.dashboard.read_cost");
    expect(warm[0].fields).toEqual({ assignmentDocsScanned: 3, publishedClassAssignments: 3, submissionReads: 3, assignmentIndexReads: 1, assignmentIndexesBootstrapped: 0, globalAssignmentScans: 0, assignmentIndexAuthoritative: 1, assignmentIndexAuthorityChanges: 0 });
    const m = scenario({ mine: 3, other: 7, drafts: 2, withSubmission: 1, authoritative: false });
    await run(m);
    expect(logs.filter(l => l.event === "student.dashboard.read_cost")[0].fields).toEqual({ assignmentDocsScanned: 12, publishedClassAssignments: 3, submissionReads: 3, assignmentIndexReads: 0, assignmentIndexesBootstrapped: 0, globalAssignmentScans: 1, assignmentIndexAuthoritative: 0, assignmentIndexAuthorityChanges: 0 });
    const text = JSON.stringify(logs);
    for (const leak of ["u1", "c1", "m0", "واجب", "علي", "S1", "platform/"]) expect(text).not.toContain(leak);
  });

  it("a throwing logger never fails the request; the response is identical with or without observability", async () => {
    const s = scenario({ mine: 2, other: 3, withSubmission: 1 });
    const withObs = (await run(s)).r;
    const noObs = (await run(s, null)).r;
    const broken = (await run(s, { logInfo: () => { throw new Error("sink down"); }, logError: () => {}, logWarn: () => { throw new Error("x"); } })).r;
    expect(broken.status).toBe(200);
    expect(noObs.jsonBody).toEqual(withObs.jsonBody);
    expect(broken.jsonBody).toEqual(withObs.jsonBody);
  });

  it("the public response carries no read-cost / index / debug / metrics field", async () => {
    const s = scenario({ mine: 1, withSubmission: 1 });
    const { r } = await run(s);
    expect(Object.keys(r.jsonBody).sort()).toEqual(["assignments", "classroom", "ok", "phase", "recognition", "stats", "strength", "student", "study"]);
    const text = JSON.stringify(r.jsonBody);
    for (const k of ["readCost", "read_cost", "debug", "metrics", "assignmentDocsScanned", "assignment-index", "publishedAssignmentIds", "ready"]) expect(text).not.toContain(k);
  });
});
