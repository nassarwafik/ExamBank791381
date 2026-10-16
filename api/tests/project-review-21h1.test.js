import { describe, it, expect } from "vitest";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { school, NOW } from "./fixtures/analytics-school.js";
import { handler as todayHandler } from "../src/functions/teacher-today.js";
import { handler as trackerHandler } from "../src/functions/project-tracker.js";
import { getProjectDefinition, getStorageNamespace } from "../src/lib/project-tracker/registry.js";

// Phase 21H.1 (decision D2) — the Today hub's project work is the stages students SUBMITTED for review (ready_for_review on an
// active stage of a current member) — the same figure as the sidebar badge (projects-summary) — instead of every ungraded
// stage. A student who never touched the project is not «waiting for the teacher». The 9C counters stay as they were.
const AUTH_OK = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
const NOW_MS = Date.parse(NOW);
const req = url => ({ method: "GET", url, headers: { get: () => null } });
const deps = ctx => ({ ...AUTH_OK, teacherDirectUnread: async () => ({ totalUnread: 0, capped: false }), container: ctx.container, nowMs: NOW_MS, recordAuditEvent: async () => {} });
const NS = { A: getStorageNamespace("899373"), L: getStorageNamespace("794589") };
const ids = code => getProjectDefinition(code).stages.filter(s => s.active === true).map(s => s.stageId);
const doc = (code, cid, sid, stages) => ({ schemaVersion: 1, programCode: code, classId: cid, studentId: sid, stages, history: [], updatedAt: NOW });
const st = (status, score) => ({ status, ...(score === undefined ? {} : { score }), updatedAt: NOW });

function seed() {
  const s = school();
  s["platform/classes/c1.json"].programCodes = ["899373"];
  s["platform/classes/c2.json"].programCodes = ["794589"];
  s["platform/classes/c3.json"].programCodes = ["899373"];                                      // archived class
  const A = ids("899373"), L = ids("794589");
  s[NS.A.progressName("c1", "s01")] = doc("899373", "c1", "s01", { [A[0]]: st("ready_for_review"), [A[1]]: st("ready_for_review", 80), [A[2]]: st("in_progress") });
  s[NS.A.progressName("c1", "s02")] = doc("899373", "c1", "s02", { [A[0]]: st("approved", 90) });              // nothing submitted
  s[NS.A.progressName("c1", "s05")] = doc("899373", "c1", "s05", { [A[0]]: st("ready_for_review") });          // archived student
  s[NS.A.progressName("c1", "s03")] = doc("899373", "c1", "s03", { GONE: st("ready_for_review"), [A[3]]: st("ready_for_review"), [A[4]]: st("ready_for_review"), [A[5]]: st("ready_for_review") }); // + one unknown stage
  s[NS.L.progressName("c2", "s11")] = doc("794589", "c2", "s11", { [L[0]]: st("ready_for_review") });
  s[NS.A.progressName("c3", "s21")] = doc("899373", "c3", "s21", { [A[0]]: st("ready_for_review") });          // archived class
  return s;
}
const review = async ctx => (await todayHandler(req("https://x/api/teacher-today"), deps(ctx))).jsonBody.projectEvaluation.review;

describe("21H.1 projectEvaluation.review — submitted stages awaiting the teacher", () => {
  it("counts only submitted stages of current members on active stages; most stages first", async () => {
    const r = await review(createMemoryContainer(seed()));
    expect(r.attention.map(x => [x.studentId, x.projectCode, x.readyStages])).toEqual([["s03", "899373", 3], ["s01", "899373", 2], ["s11", "794589", 1]]);   // most submitted first, not by name
    expect(r).toMatchObject({ studentsAwaitingReview: 3, totalReadyStages: 6, attentionTotal: 3, capped: false });
    expect(r.attention[1]).toMatchObject({ displayName: "طالب s01", classId: "c1", gradedStages: 1, totalStages: ids("899373").length });
    expect(JSON.stringify(r)).not.toMatch(/s02|s04|s05|s21|c3/);                                     // untouched, archived, archived class
  });

  it("is the same figure as the sidebar badge (projects-summary)", async () => {
    const ctx = createMemoryContainer(seed());
    const badge = await trackerHandler(req("https://x/api/project-tracker?resource=projects-summary"), deps(ctx));
    expect(badge.status).toBe(200);
    expect((await review(ctx)).totalReadyStages).toBe(badge.jsonBody.totalReadyForReview);
  });

  it("the 9C counters are unchanged: an untouched student still counts as having ungraded stages", async () => {
    const r = (await todayHandler(req("https://x/api/teacher-today"), deps(createMemoryContainer(seed())))).jsonBody.projectEvaluation;
    expect(r.attention.some(x => x.studentId === "s04")).toBe(true);
    expect(r.review.attention.some(x => x.studentId === "s04")).toBe(false);
  });
});
