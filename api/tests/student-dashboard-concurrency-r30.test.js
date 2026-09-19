import { describe, it, expect, vi } from "vitest";
import { handler as dashboardHandler } from "../src/functions/student-dashboard.js";
import { mapConcurrent as realMapConcurrent } from "../src/lib/platform-storage.js";

// Roadmap #30 — Concurrent Student Dashboard Submission Reads.
//
// Pre-R30 the dashboard awaited one submission download per published class assignment strictly in sequence
// (max 1 in flight), so a long school year cost (assignments × storage latency) on every student login and on
// every return from an exam. These tests drive the REAL handler through its dependency seams (the R27
// `mapConcurrent` / `getReadConcurrency` seams added by R30 keep them deterministic and never touch the global
// read concurrency) and pin: bounded parallel submission reads, exactly one read per selected assignment and
// none for drafts/archived/other-class assignments, a response deep-equal to the sequential run, and unchanged
// 404/null, 500, 401 and 403 semantics. No timing assertions.

const NOW = Date.now();   // availability is derived against the real clock inside attemptState, so the fixture is relative to now
const iso = ms => new Date(ms).toISOString();
const H = 3600000, D = 24 * H;
const AP = "platform/assignments/", SP = "platform/submissions/", CP = "platform/classes/";
const GENERIC_500 = "تعذر تحميل لوحة الطالب حاليًا.";
const student = { userId: "u1", classId: "c1", code: "S1", displayName: "علي", active: true, shareAchievements: true, avatarId: "a1" };
const req = () => ({ method: "GET", url: "http://x/student-dashboard", headers: { get: () => null } });

// Seams over a Map store with instrumentation: per-prefix read counts, submission in-flight tracking, writes.
function makeDeps(store, { concurrency = 8, failOn = null, sessionOk = true, classroom = null, spyMap = false } = {}) {
  const st = { reads: [], subInflight: 0, maxSubInflight: 0, writes: 0, mapCalls: [] };
  if (classroom) store.set(CP + "c1.json", classroom);
  const deps = {
    requireActiveStudentSession: async () => sessionOk ? { ok: true, container: {}, student } : { ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } },
    downloadJsonOrNull: async (_c, key) => {
      st.reads.push(key);
      if (failOn && key === failOn) { const e = new Error("storage down"); e.statusCode = 503; throw e; }
      const sub = key.startsWith(SP);
      if (sub) { st.subInflight++; st.maxSubInflight = Math.max(st.maxSubInflight, st.subInflight); }
      await new Promise(r => setTimeout(r, 2));
      if (sub) st.subInflight--;
      return store.has(key) ? structuredClone(store.get(key)) : null;
    },
    listJson: async (_c, prefix) => { st.reads.push("LIST " + prefix); return [...store.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => structuredClone(v)); },
    getReadConcurrency: () => concurrency,
    uploadJson: async () => { st.writes++; }
  };
  if (spyMap) deps.mapConcurrent = vi.fn((items, limit, fn) => realMapConcurrent(items, limit, fn));
  return { deps, st };
}
const subs = st => st.reads.filter(k => k.startsWith(SP));
const strip = body => JSON.parse(JSON.stringify(body));

function assignment(id, extra = {}) { return { assignmentId: id, classId: "c1", status: "published", title: "واجب " + id, instructions: "", maxAttempts: 3, durationMinutes: 0, attemptModelVersion: 2, questionCount: 1, totalMarks: 100, openAt: "", dueAt: "", createdAt: iso(NOW - 10 * D), ...extra }; }
const finalAttempt = { attemptNumber: 1, submittedAt: iso(NOW - H), score: 84, totalMarks: 100, percentage: 84, manualReviewMarks: 0, finalized: true, teacherFeedback: "ممتاز" };
const pendingAttempt = { attemptNumber: 1, submittedAt: iso(NOW - 2 * H), score: 62, totalMarks: 100, percentage: 62, manualReviewMarks: 18, finalized: false, teacherFeedback: "" };
const legacyAttempt = { attemptNumber: 1, submittedAt: iso(NOW - 3 * H), score: 70, totalMarks: 100, percentage: 70, manualReviewMarks: 0, teacherFeedback: "" }; // no `finalized` stored
const sub = (aid, attempts, activeAttempt = null) => ({ assignmentId: aid, studentId: "u1", classId: "c1", attempts, activeAttempt });

// Every dashboard state in one store: final, pending review, active attempt, scheduled, closed-unsubmitted,
// available, legacy result without `finalized`, missing submission; several due dates pin the sort; plus a
// draft, an archived assignment and another class's assignment that must never be read.
function fixture() {
  const store = new Map();
  store.set(AP + "aFinal.json", assignment("aFinal", { dueAt: iso(NOW + 3 * D) }));            store.set(SP + "aFinal/u1.json", sub("aFinal", [finalAttempt]));
  store.set(AP + "aPending.json", assignment("aPending", { dueAt: iso(NOW + 1 * D) }));        store.set(SP + "aPending/u1.json", sub("aPending", [pendingAttempt]));
  store.set(AP + "aActive.json", assignment("aActive", { dueAt: iso(NOW + 2 * D), durationMinutes: 30 })); store.set(SP + "aActive/u1.json", sub("aActive", [], { attemptNumber: 1, startedAt: iso(NOW - 600000), endsAt: iso(NOW + 1200000), status: "started" }));
  store.set(AP + "aScheduled.json", assignment("aScheduled", { openAt: iso(NOW + 2 * D), dueAt: iso(NOW + 5 * D) }));
  store.set(AP + "aClosed.json", assignment("aClosed", { dueAt: iso(NOW - 1 * D) }));
  store.set(AP + "aAvailable.json", assignment("aAvailable", { dueAt: iso(NOW + 4 * D) }));
  store.set(AP + "aLegacy.json", assignment("aLegacy", { dueAt: "" }));                        store.set(SP + "aLegacy/u1.json", sub("aLegacy", [legacyAttempt]));
  store.set(AP + "aMissing.json", assignment("aMissing", { dueAt: iso(NOW + 6 * D) }));        // no submission blob
  store.set(AP + "dDraft.json", assignment("dDraft", { status: "draft" }));                    store.set(SP + "dDraft/u1.json", sub("dDraft", [finalAttempt]));
  store.set(AP + "xArchived.json", assignment("xArchived", { status: "archived", archivedFromStatus: "published" })); store.set(SP + "xArchived/u1.json", sub("xArchived", [finalAttempt]));
  store.set(AP + "oOther.json", assignment("oOther", { classId: "c2" }));                       store.set(SP + "oOther/u1.json", sub("oOther", [finalAttempt]));
  return store;
}
const SELECTED = ["aActive", "aAvailable", "aClosed", "aFinal", "aLegacy", "aMissing", "aPending", "aScheduled"];
function manyAssignments(n) { const store = new Map(); for (let i = 1; i <= n; i++) { const id = "a" + String(i).padStart(2, "0"); store.set(AP + id + ".json", assignment(id, { dueAt: iso(NOW + i * D) })); if (i % 2) store.set(SP + id + "/u1.json", sub(id, [finalAttempt])); } return store; }

describe("A. concurrency discrimination (seam-driven, no global change)", () => {
  it("A1 submission reads run in parallel: max in flight > 1 and <= the configured read concurrency (8)", async () => {
    const { deps, st } = makeDeps(manyAssignments(40), { concurrency: 8 });
    const r = await dashboardHandler(req(), deps);
    expect(r.status).toBe(200);
    expect(st.maxSubInflight).toBeGreaterThan(1); expect(st.maxSubInflight).toBeLessThanOrEqual(8);
    expect(subs(st)).toHaveLength(40);
  });
  it("A2 the bound comes from the getReadConcurrency seam: 3 → at most 3 in flight, still > 1", async () => {
    const { deps, st } = makeDeps(manyAssignments(40), { concurrency: 3 });
    await dashboardHandler(req(), deps);
    expect(st.maxSubInflight).toBeGreaterThan(1); expect(st.maxSubInflight).toBeLessThanOrEqual(3);
  });
  it("A3 the reads go through the mapConcurrent seam with the selected assignments and the seam's concurrency", async () => {
    const { deps } = makeDeps(fixture(), { concurrency: 5, spyMap: true });
    await dashboardHandler(req(), deps);
    expect(deps.mapConcurrent).toHaveBeenCalledTimes(1);
    const [items, limit] = deps.mapConcurrent.mock.calls[0];
    expect(limit).toBe(5); expect(items.map(a => a.assignmentId).sort()).toEqual(SELECTED);
  });
  it("A4 concurrency 1 through the seam is strictly sequential (the pre-R30 shape) and still produces the same reads", async () => {
    const { deps, st } = makeDeps(manyAssignments(12), { concurrency: 1 });
    await dashboardHandler(req(), deps);
    expect(st.maxSubInflight).toBe(1); expect(subs(st)).toHaveLength(12);
  });
});

describe("B. output equivalence — concurrency 1 vs 8 over every dashboard state", () => {
  it("B1 the complete successful response is deep-equal", async () => {
    const seq = await dashboardHandler(req(), makeDeps(fixture(), { concurrency: 1 }).deps);
    const par = await dashboardHandler(req(), makeDeps(fixture(), { concurrency: 8 }).deps);
    expect(seq.status).toBe(200); expect(par.status).toBe(200);
    expect(strip(par.jsonBody)).toEqual(strip(seq.jsonBody));
  });
  it("B2 the fixture really exercises every state, the sort and the legacy `finalized` omission", async () => {
    const r = await dashboardHandler(req(), makeDeps(fixture(), { concurrency: 8 }).deps);
    const by = Object.fromEntries(r.jsonBody.assignments.map(a => [a.assignmentId, a]));
    expect(by.aFinal.dashboardState).toBe("completed"); expect(by.aPending.dashboardState).toBe("awaitingReview");
    expect(by.aActive.dashboardState).toBe("inProgress"); expect(by.aScheduled.dashboardState).toBe("scheduled");
    expect(by.aClosed.dashboardState).toBe("closedUnsubmitted"); expect(by.aAvailable.dashboardState).toBe("available");
    expect(by.aMissing.dashboardState).toBe("available"); expect(by.aMissing.latestResult).toBeNull(); expect(by.aMissing.attemptsUsed).toBe(0);
    expect(by.aLegacy.gradingStatus).toBe("final"); expect("finalized" in by.aLegacy.latestResult).toBe(false);   // legacy: never fabricated
    expect(by.aFinal.latestResult.finalized).toBe(true);
    // dueAt ascending, empty dueAt last
    expect(r.jsonBody.assignments.map(a => a.assignmentId)).toEqual(["aClosed", "aPending", "aActive", "aFinal", "aAvailable", "aScheduled", "aMissing", "aLegacy"]);
    expect(r.jsonBody.stats).toEqual({ assigned: 8, completed: 3, average: 72, submitted: 3, inProgress: 1, pendingReview: 1, finalized: 2, scheduled: 1, available: 2, closedUnsubmitted: 1, averageFinalized: 77 });
    expect(r.jsonBody.student).toEqual({ userId: "u1", code: "S1", displayName: "علي", classId: "c1", avatarId: "a1", shareAchievements: true });
  });
  it("B3 with 40 assignments the parallel and sequential responses are deep-equal too", async () => {
    const seq = await dashboardHandler(req(), makeDeps(manyAssignments(40), { concurrency: 1 }).deps);
    const par = await dashboardHandler(req(), makeDeps(manyAssignments(40), { concurrency: 8 }).deps);
    expect(strip(par.jsonBody)).toEqual(strip(seq.jsonBody)); expect(par.jsonBody.assignments).toHaveLength(40);
  });
});

describe("C. read counts", () => {
  it("C1 exactly one submission read per selected published class assignment, none for draft / archived / other class", async () => {
    const { deps, st } = makeDeps(fixture(), { concurrency: 8 });
    await dashboardHandler(req(), deps);
    expect(subs(st).sort()).toEqual(SELECTED.map(id => SP + id + "/u1.json"));
    expect(subs(st).filter(k => /dDraft|xArchived|oOther/.test(k))).toHaveLength(0);
    expect(new Set(subs(st)).size).toBe(subs(st).length);                                        // no duplicates
  });
  it("C2 one classroom read and one assignments listing; the only write is the ONE first-sight recognition baseline (steady state is write-free)", async () => {
    const { deps, st } = makeDeps(fixture(), { concurrency: 8, classroom: { classId: "c1", name: "صف", active: true, status: "active" } });
    const r = await dashboardHandler(req(), deps);
    expect(r.status).toBe(200); expect(r.jsonBody.classroom.name).toBe("صف");
    expect(st.reads.filter(k => k.startsWith(CP))).toEqual([CP + "c1.json"]);
    expect(st.reads.filter(k => k === "LIST " + AP)).toHaveLength(1);
    // Recognition: the global-rank observation doc is written once on first sight (this harness never stores it, so
    // every call is a "first sight"); with the doc present and the tier unchanged no write happens — pinned in
    // achievement-events.test.js. Student data, assignments and submissions are never written by the dashboard.
    expect(st.writes).toBe(1);
    expect(st.reads.filter(k => k.startsWith("platform/recognition/"))).toEqual(["platform/recognition/u1.json"]);
  });
});

describe("D. failure semantics", () => {
  it("D1 a genuine non-404 failure on one selected submission → 500 with the generic message (no partial result)", async () => {
    const { deps } = makeDeps(manyAssignments(20), { concurrency: 8, failOn: SP + "a07/u1.json" });
    const r = await dashboardHandler(req(), deps);
    expect(r.status).toBe(500); expect(r.jsonBody).toEqual({ ok: false, error: GENERIC_500 });
  });
  it("D2 a missing submission (404 → null) keeps the dashboard at 200 and the card unsubmitted/availability-derived", async () => {
    const store = fixture();
    const r = await dashboardHandler(req(), makeDeps(store, { concurrency: 8 }).deps);
    const a = r.jsonBody.assignments.find(x => x.assignmentId === "aMissing");
    expect(r.status).toBe(200);
    expect(a).toMatchObject({ dashboardState: "available", gradingStatus: "notSubmitted", attemptsUsed: 0, hasActiveAttempt: false, latestScore: null, latestPercentage: null, latestResult: null, canAttempt: true });
  });
  it("D3 a failure on a NON-selected blob cannot matter because it is never read", async () => {
    const { deps, st } = makeDeps(fixture(), { concurrency: 8, failOn: SP + "xArchived/u1.json" });
    const r = await dashboardHandler(req(), deps);
    expect(r.status).toBe(200); expect(st.reads).not.toContain(SP + "xArchived/u1.json");
  });
});

describe("E. guards", () => {
  it("E1 session rejection is returned unchanged (401) and nothing is read", async () => {
    const { deps, st } = makeDeps(fixture(), { sessionOk: false });
    const r = await dashboardHandler(req(), deps);
    expect(r.status).toBe(401); expect(st.reads).toHaveLength(0);
  });
  it("E2 an archived classroom is still 403 before any assignment or submission read", async () => {
    const { deps, st } = makeDeps(fixture(), { classroom: { classId: "c1", name: "صف", active: false, status: "archived" } });
    const r = await dashboardHandler(req(), deps);
    expect(r.status).toBe(403); expect(r.jsonBody.error).toBe("هذا الصف مؤرشف وانتهت السنة الدراسية.");
    expect(st.reads).toEqual([CP + "c1.json"]);
  });
  it("E3 production defaults: without seams the handler still uses the R27 primitive and configured concurrency (source guard)", async () => {
    const { readFileSync } = await import("node:fs"); const { fileURLToPath } = await import("node:url"); const path = await import("node:path");
    const src = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "functions", "student-dashboard.js"), "utf8");
    expect(src).toMatch(/mc=deps\.mapConcurrent\|\|mapConcurrent/); expect(src).toMatch(/readConcurrency=deps\.getReadConcurrency\|\|getReadConcurrency/);
    expect(src).toMatch(/await mc\(selected,readConcurrency\(\),a=>dl\(c,SP\+a\.assignmentId\+"\/"\+student\.userId\+"\.json"\)\)/);
    expect(src).not.toMatch(/setReadConcurrency/);
  });
});
