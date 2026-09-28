import { describe, it, expect } from "vitest";
import { handler } from "../src/functions/student-dashboard.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { instrumentReadCost } from "./helpers/read-cost.js";

// Phase 12E-A — READ-COST BASELINE for GET /api/student-dashboard.
//
// Drives the REAL handler over the REAL in-memory blob container (real listBlobsFlat / download semantics through the
// real platform-storage listJson / downloadJsonOrNull / mapConcurrent). Only UNRELATED authorities are injected: the
// student token check (the session itself is still the real requireActiveStudentSession reading the user document),
// the stage-milestone writer and the recognition aggregate (both would add their own reads/writes to the fixture).
// NOT mocked — and exactly what is measured: the assignment listing, every assignment download, the per-assignment
// submission reads.
//
// CURRENT FORMULA (measured, this commit):
//   lists     = 1                       (platform/assignments/)
//   downloads = K + A_total + P_class   with K = 5 fixed documents (user, class, practice, study, games) for a class
//                                       without projects
//   A_total  = every stored assignment document (all classes, drafts, archived — the global scan)
//   P_class  = published assignments of THIS student's class (one submission read each, 404 included)
//
// ⚠ BASELINE guards: the tests labelled BASELINE pin the CURRENT scaling ON PURPOSE (assignment metadata reads grow with
// A_total). Phase 12E-B is expected to change them deliberately — update those numbers only together with that change.

const AP = "platform/assignments/", SP = "platform/submissions/", UP = "platform/users/", CP = "platform/classes/";
const FIXED = ["platform/users/u1.json", "platform/classes/c1.json", "platform/learning-practice/u1.json", "platform/learning-study/u1.json", "platform/games/results/u1.json"];
const K = FIXED.length;
const req = () => ({ method: "GET", url: "http://x/api/student-dashboard", headers: { get: () => null } });
const student = { userId: "u1", role: "student", classId: "c1", active: true, archived: false, authVersion: 1, code: "S1", displayName: "علي" };
const assignment = (id, classId, over = {}) => ({ assignmentId: id, classId, status: "published", title: "واجب " + id, instructions: "", maxAttempts: 2, durationMinutes: 0, attemptModelVersion: 2, questionCount: 1, totalMarks: 10, openAt: "", dueAt: "", createdAt: "2026-01-01T00:00:00.000Z", ...over });

/**
 * mine = published assignments of the student's class c1 (P_class); other = published assignments of class c2;
 * drafts / archived = c1 assignments that are NOT published; withSubmission = how many of `mine` have a stored submission.
 */
function scenario({ mine = 0, other = 0, drafts = 0, archived = 0, withSubmission = 0 } = {}) {
  const seed = { [UP + "u1.json"]: student, [CP + "c1.json"]: { classId: "c1", name: "أ", status: "active", active: true }, [CP + "c2.json"]: { classId: "c2", name: "ب", status: "active", active: true } };
  for (let i = 0; i < mine; i++) seed[AP + "m" + i + ".json"] = assignment("m" + i, "c1");
  for (let i = 0; i < other; i++) seed[AP + "o" + i + ".json"] = assignment("o" + i, "c2");
  for (let i = 0; i < drafts; i++) seed[AP + "d" + i + ".json"] = assignment("d" + i, "c1", { status: "draft" });
  for (let i = 0; i < archived; i++) seed[AP + "r" + i + ".json"] = assignment("r" + i, "c1", { status: "archived" });
  for (let i = 0; i < withSubmission; i++) seed[SP + "m" + i + "/u1.json"] = { assignmentId: "m" + i, studentId: "u1", classId: "c1", attempts: [{ attemptNumber: 1, submittedAt: "2026-02-01T10:00:00.000Z", score: 8, totalMarks: 10, percentage: 80, manualReviewMarks: 0, finalized: true }], activeAttempt: null };
  const ctx = createMemoryContainer(seed);
  return { ctx, rc: instrumentReadCost(ctx.container), A_total: mine + other + drafts + archived, P_class: mine };
}
const logs = [];
const OBS = { logInfo: (event, fields) => logs.push({ event, fields }), logWarn: () => {}, logError: () => {} };
const deps = ctx => ({ container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub: "u1", sv: 1 } }), recordGlobalRankMilestone: async () => {}, aggregateRecognition: async () => new Map() });
async function run(s, obs = OBS) { logs.length = 0; const r = await handler(req(), deps(s.ctx), obs); return { r, snap: s.rc.snapshot() }; }

/** The measured cost of one request, split into the variables of the formula. */
function cost(s, snap) {
  return {
    assignmentLists: s.rc.listsOf(AP), otherLists: snap.lists - s.rc.listsOf(AP),
    assignmentDocs: s.rc.downloadsOf(AP), submissionReads: s.rc.downloadsOf(SP),
    fixed: snap.downloads - s.rc.downloadsOf(AP) - s.rc.downloadsOf(SP), uploads: snap.uploads
  };
}

describe("12E-A student dashboard — measured read cost (real handler + real memory container)", () => {
  const table = [
    ["S0 — no assignment", { mine: 0 }, { A: 0, P: 0 }],
    ["S1 — one published class assignment", { mine: 1, withSubmission: 1 }, { A: 1, P: 1 }],
    ["S10 — ten published class assignments", { mine: 10, withSubmission: 5 }, { A: 10, P: 10 }],
    ["S50 — fifty published class assignments", { mine: 50, withSubmission: 20 }, { A: 50, P: 50 }],
    ["S-OTHER — 3 in the class, 100 in another class, + 5 drafts + 5 archived", { mine: 3, other: 100, drafts: 5, archived: 5, withSubmission: 3 }, { A: 113, P: 3 }],
  ];
  for (const [name, spec, exp] of table) {
    it(name + ": 1 listing, A_total assignment downloads, P_class submission reads, K fixed reads, 0 writes", async () => {
      const s = scenario(spec);
      expect([s.A_total, s.P_class]).toEqual([exp.A, exp.P]);
      const { r, snap } = await run(s);
      expect(r.status).toBe(200);
      // logical output: exactly this student's published class assignments
      expect(r.jsonBody.assignments.map(a => a.assignmentId).sort()).toEqual(Array.from({ length: exp.P }, (_, i) => "m" + i).sort());
      expect(r.jsonBody.stats.assigned).toBe(exp.P);
      expect(r.jsonBody.stats.finalized).toBe(spec.withSubmission || 0);
      // physical storage operations
      expect(cost(s, snap)).toEqual({ assignmentLists: 1, otherLists: 0, assignmentDocs: exp.A, submissionReads: exp.P, fixed: K, uploads: 0 });
      expect(snap.downloads).toBe(K + exp.A + exp.P);
      for (const name of FIXED) expect(s.rc.downloadsExact(name)).toBe(1);
      // one submission read per SELECTED assignment only — never for drafts / archived / other classes
      expect(snap.log.downloads.filter(n => n.startsWith(SP)).sort()).toEqual(Array.from({ length: exp.P }, (_, i) => SP + "m" + i + "/u1.json").sort());
    });
  }
});

describe("12E-A student dashboard — BASELINE guards for Phase 12E-B (current scaling pinned on purpose)", () => {
  // P_class stays 1; unrelated history grows. TODAY the assignment metadata reads grow with A_total (the global scan).
  for (const [A_total, others] of [[1, 0], [10, 9], [100, 99]]) {
    it(`BASELINE P_class=1, A_total=${A_total}: assignment docs downloaded = ${A_total}, submission reads = 1`, async () => {
      const s = scenario({ mine: 1, other: others, withSubmission: 1 });
      const { r, snap } = await run(s);
      expect(r.jsonBody.assignments.map(a => a.assignmentId)).toEqual(["m0"]);
      expect(cost(s, snap)).toEqual({ assignmentLists: 1, otherLists: 0, assignmentDocs: A_total, submissionReads: 1, fixed: K, uploads: 0 });
    });
  }

  it("BASELINE regression evidence: 1 class assignment + 100 unrelated assignments of other classes → 100 extra assignment downloads, same response", async () => {
    const small = scenario({ mine: 1, withSubmission: 1 }), big = scenario({ mine: 1, other: 100, withSubmission: 1 });
    const a = await run(small), b = await run(big);
    expect(cost(big, b.snap).assignmentDocs - cost(small, a.snap).assignmentDocs).toBe(100);   // the global scan
    expect(cost(big, b.snap).submissionReads).toBe(cost(small, a.snap).submissionReads);       // submissions do NOT grow
    expect(b.r.jsonBody.assignments).toEqual(a.r.jsonBody.assignments);                         // identical output
  });
});

describe("12E-A student dashboard — count-only observability + response parity", () => {
  it("emits ONE student.dashboard.read_cost event with exactly the three numeric fields (no identifier, title or mark)", async () => {
    const s = scenario({ mine: 3, other: 7, drafts: 2, withSubmission: 1 });
    await run(s);
    const rc = logs.filter(l => l.event === "student.dashboard.read_cost");
    expect(rc).toHaveLength(1);
    expect(rc[0].fields).toEqual({ assignmentDocsScanned: 12, publishedClassAssignments: 3, submissionReads: 3 });
    for (const v of Object.values(rc[0].fields)) expect(typeof v).toBe("number");
    const text = JSON.stringify(logs);
    for (const leak of ["u1", "c1", "m0", "واجب", "علي", "S1"]) expect(text).not.toContain(leak);
  });

  it("a throwing logger never fails the request, and the response is identical with or without observability", async () => {
    const s = scenario({ mine: 2, other: 3, withSubmission: 1 });
    const withObs = (await run(s)).r;
    const noObs = (await run(s, null)).r;
    const broken = (await run(s, { logInfo: () => { throw new Error("sink down"); }, logError: () => {}, logWarn: () => {} })).r;
    expect(broken.status).toBe(200);
    const strip = b => { const { strength, ...rest } = b; return { ...rest, strength: strength && { ...strength } }; };
    expect(strip(noObs.jsonBody)).toEqual(strip(withObs.jsonBody));
    expect(strip(broken.jsonBody)).toEqual(strip(withObs.jsonBody));
  });

  it("the public response carries no read-cost / debug / metrics field", async () => {
    const s = scenario({ mine: 1, withSubmission: 1 });
    const { r } = await run(s);
    expect(Object.keys(r.jsonBody).sort()).toEqual(["assignments", "classroom", "ok", "phase", "recognition", "stats", "strength", "student", "study"]);
    const text = JSON.stringify(r.jsonBody);
    for (const k of ["readCost", "read_cost", "debug", "metrics", "assignmentDocsScanned", "submissionReads"]) expect(text).not.toContain(k);
  });
});
