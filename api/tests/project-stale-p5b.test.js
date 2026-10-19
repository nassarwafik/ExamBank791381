import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "node:module";

// Phase P-5b — the server's «بلا تحديث» (stale) rule. A student who never started is NOT «بلا تحديث»: an empty updatedAt
// used to read as infinitely old (daysSince("") = Infinity), so every never-started student was counted stale — in the
// dashboard hint («بلا تحديث N+ أيام: staleCount»), the reports page and the delayed report's reasons.
//   - stale = started && !complete && no update for ≥ staleDays; «started» = at least one ACTIVE stage left «لم يبدأ»
//     (in progress, waiting for review or approved — the P-5 client rule, now the server's);
//   - a never-started student carries `notStarted: true` (present only then, like P6's selfReportedCount);
//   - the delayed report gives a never-started student the single reason «لم يبدأ بعد» (not «بلا تحديث» + a 0 % reason).
// Fail-first: run against 61cd4d3b (never-started stale:true, counted in staleCount, delayed reason «بلا تحديث 7+ أيام»).
const require = createRequire(import.meta.url);
const core = require("../src/lib/project-tracker/core.js");
const analytics = require("../src/lib/project-tracker/analytics.js");
const registry = require("../src/lib/project-tracker/registry.js");
const service = require("../src/lib/project-tracker/service.js");
const { createMemoryContainer } = require("./fixtures/memory-container.js");
const { handler: tracker } = require("../src/functions/project-tracker.js");
const { handler: reports } = require("../src/functions/reports.js");

const NOW = "2026-10-19T10:00:00.000Z";
const OLD = "2026-09-01T10:00:00.000Z";       // 48 days ago (staleDays 7)
const RECENT = "2026-10-18T10:00:00.000Z";
const CODE = "899373";
const NS = registry.getStorageNamespace(CODE);
const DEF = registry.getProjectDefinition(CODE);
const ACTIVE = DEF.stages.filter(s => s.active === true).sort((a, b) => a.order - b.order);
const [S1, S2] = ACTIVE.map(s => s.stageId);
const INACTIVE = { stageId: "OFF1", track: ACTIVE[0].track, groupId: ACTIVE[0].groupId, title: "معطّلة", order: 999, weight: 1, required: true, active: false };
const snap = () => { const s = service.buildClassSnapshot(DEF, "c1", NOW); return { ...s, stages: [...s.stages, INACTIVE] }; };
const workDef = () => service.workingDefinition(CODE, snap());
const doc = (stages, updatedAt) => ({ schemaVersion: 1, programCode: CODE, classId: "c1", studentId: "x", startedAt: OLD, updatedAt, stages, history: [] });

const CASES = {
  noDoc: null,                                                                               // never opened
  emptyOld: doc({ [S1]: { status: "not_started" } }, OLD),                                   // a note-only touch long ago, nothing started
  inactiveOnly: doc({ OFF1: { status: "approved" } }, OLD),                                  // activity only on a stage the class turned off
  inProgressOld: doc({ [S1]: { status: "in_progress" } }, OLD),
  readyOld: doc({ [S1]: { status: "ready_for_review" } }, OLD),
  approvedOld: doc({ [S1]: { status: "approved", approvedAt: OLD } }, OLD),
  inProgressRecent: doc({ [S1]: { status: "in_progress" }, [S2]: { status: "approved" } }, RECENT)
};

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"], now: new Date(NOW) }); });
afterEach(() => { vi.useRealTimers(); });

describe("P-5b — the student summary", () => {
  it("never started → notStarted, never stale; started and idle ≥ staleDays → stale; recent → not stale", () => {
    const s = Object.fromEntries(Object.entries(CASES).map(([k, d]) => [k, core.buildStudentSummary(workDef(), d, NOW)]));
    expect(Object.fromEntries(Object.entries(s).map(([k, v]) => [k, [v.stale, v.notStarted === true]]))).toEqual({
      noDoc: [false, true], emptyOld: [false, true], inactiveOnly: [false, true],
      inProgressOld: [true, false], readyOld: [true, false], approvedOld: [true, false], inProgressRecent: [false, false]
    });
    // the flag is additive: absent (not false) when the student has started, so every other body is unchanged
    for (const k of ["inProgressOld", "readyOld", "approvedOld", "inProgressRecent"]) expect("notStarted" in s[k], k).toBe(false);
  });
  it("a complete student is never stale, however old", () => {
    const all = Object.fromEntries(ACTIVE.map(st => [st.stageId, { status: "approved", approvedAt: OLD }]));
    const s = core.buildStudentSummary(workDef(), doc(all, OLD), NOW);
    expect([s.complete, s.stale, "notStarted" in s]).toEqual([true, false, false]);
  });
  it("the class summary's staleCount counts started, idle students only", () => {
    const entries = Object.entries(CASES).map(([k, d]) => ({ studentId: k, displayName: k, progress: d }));
    expect(analytics.buildClassSummary(workDef(), entries, NOW).staleCount).toBe(3);   // inProgressOld, readyOld, approvedOld
  });
});

describe("P-5b — through the real routes", () => {
  function school() {
    const seed = { [NS.configName("c1")]: snap(), "platform/classes/c1.json": { classId: "c1", name: "صف c1", grade: "11", schoolYear: "2026", active: true, status: "active", studentIds: [], programCodes: [CODE], createdAt: OLD, updatedAt: OLD } };
    for (const [k, d] of Object.entries(CASES)) {
      seed["platform/users/" + k + ".json"] = { userId: k, role: "student", active: true, archived: false, authVersion: 1, classId: "c1", displayName: "طالب " + k, code: "C" + k };
      if (d) seed[NS.progressName("c1", k)] = { ...d, studentId: k };
    }
    const ctx = createMemoryContainer(seed);
    const deps = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {} };
    const get = (fn, url) => fn({ method: "GET", url: "https://x" + url, json: async () => ({}) }, deps);
    return { get };
  }
  it("resource=students: a never-started card is notStarted and not stale; the summary's staleCount agrees", async () => {
    const t = school();
    const cards = (await t.get(tracker, "/api/project-tracker?projectCode=" + CODE + "&resource=students&classId=c1")).jsonBody.students;
    const by = Object.fromEntries(cards.map(c => [c.studentId, c]));
    expect([by.noDoc.stale, by.noDoc.notStarted]).toEqual([false, true]);
    expect([by.emptyOld.stale, by.emptyOld.notStarted]).toEqual([false, true]);
    expect([by.inProgressOld.stale, "notStarted" in by.inProgressOld]).toEqual([true, false]);
    expect((await t.get(tracker, "/api/project-tracker?projectCode=" + CODE + "&resource=summary&classId=c1")).jsonBody.summary.staleCount).toBe(3);
  });
  it("the delayed report: «لم يبدأ بعد» for a never-started student, «بلا تحديث» only for a started, idle one", async () => {
    const t = school();
    const r = await t.get(reports, "/api/reports?type=delayed&projectCode=" + CODE + "&classId=c1");
    expect(r.status).toBe(200);
    const by = Object.fromEntries(r.jsonBody.students.map(s => [s.studentId, s.reasons]));
    for (const k of ["noDoc", "emptyOld", "inactiveOnly"]) expect(by[k], k).toEqual(["لم يبدأ بعد"]);
    for (const k of ["inProgressOld", "readyOld", "approvedOld"]) expect(by[k][0], k).toBe("بلا تحديث 7+ أيام");
    for (const k of Object.keys(by)) expect(by[k].includes("بلا تحديث 7+ أيام") && by[k].includes("لم يبدأ بعد"), k).toBe(false);
  });
});
