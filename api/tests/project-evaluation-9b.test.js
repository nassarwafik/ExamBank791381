import { describe, it, expect } from "vitest";
import { handler as tracker } from "../src/functions/project-tracker.js";
import { handler as studentTracker } from "../src/functions/student-project-tracker.js";
import { getProjectDefinition, getStorageNamespace } from "../src/lib/project-tracker/registry.js";
import { buildProjectEvaluation } from "../src/lib/project-tracker/evaluation.js";
import core from "../src/lib/project-tracker/core.js";
import { StorageConflictError } from "../src/lib/platform-storage.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase 9B — Project Performance Foundation. The pure evaluation summary (graded / ungraded active stages, average of
// graded scores incl. 0, null while nothing is graded, orphans ignored), the narrow teacher score actions
// (score.set / score.clear → the SAME CAS pipeline as progress.update, one stage entry merged, never a whole-document
// replacement), authorization (teacher only; student identity from the session only), student × project × stage
// isolation, concurrency (sequential + real CAS conflict), and the read surfaces (teacher `student` / `evaluation`,
// student tracker). Progress (`summary.overallProgress`) stays the workflow authority and is never touched.

const NOW = "2026-03-01T00:00:00.000Z";
const AUTH = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
const NO_AUTH = { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }) };
const deps = (ctx, auth = AUTH, extra = {}) => ({ ...auth, container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async (_c, e) => { ctx.audits.push(e); }, recordProjectMilestones: async () => {}, ...extra });
const post = (ctx, body, auth, extra) => tracker({ method: "POST", url: "https://x/api/project-tracker", json: async () => body }, deps(ctx, auth, extra));
const get = (ctx, qs, auth) => tracker({ method: "GET", url: "https://x/api/project-tracker?" + qs, json: async () => ({}) }, deps(ctx, auth));
const user = (id, cid, over = {}) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: "طالب " + id, code: "1000000" + id.slice(-2).padStart(2, "0"), ...over });
const room = (id, codes, over = {}) => ({ classId: id, name: "صف " + id, active: true, status: "active", studentIds: [], programCodes: codes, schoolYear: "2026", updatedAt: NOW, createdAt: NOW, ...over });
const NS = { A: getStorageNamespace("899373"), B: getStorageNamespace("883589"), L: getStorageNamespace("794589") };
function school(hooks) {
  const ctx = createMemoryContainer({
    "platform/classes/c1.json": room("c1", ["899373", "883589"]), "platform/users/s1.json": user("s1", "c1"), "platform/users/s2.json": user("s2", "c1"),
    "platform/classes/c2.json": room("c2", ["794589"]), "platform/users/s3.json": user("s3", "c2"),
    "platform/classes/c9.json": room("c9", ["899373"], { status: "archived", active: false }), "platform/users/s9.json": user("s9", "c9"),
    "platform/users/s4.json": user("s4", "c1", { archived: true, active: false })
  }, hooks);
  ctx.audits = [];
  return ctx;
}
const setScore = (ctx, over = {}, auth) => post(ctx, { action: "score.set", projectCode: "899373", classId: "c1", studentId: "s1", stageId: "B01", score: 85, ...over }, auth);
const clearScore = (ctx, over = {}, auth) => post(ctx, { action: "score.clear", projectCode: "899373", classId: "c1", studentId: "s1", stageId: "B01", ...over }, auth);
const evalOf = async (ctx, over = {}) => (await get(ctx, new URLSearchParams({ projectCode: "899373", resource: "evaluation", classId: "c1", studentId: "s1", ...over }).toString())).jsonBody;
const studentDeps = (ctx, id = "s1") => ({ requireActiveStudentSession: async () => ({ ok: true, user: { sub: id }, student: ctx.getJson("platform/users/" + id + ".json"), container: ctx.container }), container: ctx.container, getContainer: () => ctx.container });
const studentGet = (ctx, id, qs = "") => studentTracker({ method: "GET", url: "https://x/api/student-project-tracker" + qs, json: async () => ({}) }, studentDeps(ctx, id));
const ACTIVE_A = getProjectDefinition("899373").stages.filter(s => s.active === true);

// Synthetic snapshot: 4 active (X, Y, Z, O — O optional) + 1 inactive (I).
const DEF = {
  projectCode: "syn", tracks: [{ trackId: "a", title: "A" }, { trackId: "b", title: "B" }], trackWeights: { a: 50, b: 50 },
  stages: [
    { stageId: "X", track: "a", groupId: "g", title: "أول", order: 1, weight: 1, required: true, active: true },
    { stageId: "Y", track: "a", groupId: "g", title: "ثانٍ", order: 2, weight: 4, required: true, active: true },
    { stageId: "Z", track: "b", groupId: "h", title: "ثالث", order: 1, weight: 1, required: true, active: true },
    { stageId: "O", track: "b", groupId: "h", title: "اختياري", order: 2, weight: 1, required: false, active: true },
    { stageId: "I", track: "b", groupId: "h", title: "معطّل", order: 3, weight: 1, required: true, active: false }
  ]
};
const doc = (stages, history = []) => ({ stages, history, updatedAt: NOW });

describe("9B-F pure evaluation summary — buildProjectEvaluation", () => {
  it("F1 empty / legacy document → every active stage ungraded, projectScore null (never a fake 0), progress 0", () => {
    for (const p of [null, undefined, {}, { stages: {} }, doc({ X: { status: "in_progress" } })]) {
      const e = buildProjectEvaluation(DEF, p);
      expect(e).toMatchObject({ totalStages: 4, gradedStages: 0, ungradedStages: 4, evaluationProgress: 0, projectScore: null, projectScorePrecise: null, orphanStageIds: [], updatedAt: "" });
      expect(e.stages.map(s => s.stageId)).toEqual(["X", "Y", "Z", "O"]);           // snapshot order, inactive I excluded
      expect(e.stages.every(s => s.score === null && s.graded === false)).toBe(true);
    }
  });
  it("F2 0 is a valid grade; the average counts every graded ACTIVE stage regardless of workflow status; precise kept, rounded exposed", () => {
    const e = buildProjectEvaluation(DEF, doc({ X: { status: "not_started", score: 0 }, Y: { status: "approved", score: 100 }, Z: { status: "ready_for_review", score: 71 } }));
    expect(e).toMatchObject({ totalStages: 4, gradedStages: 3, ungradedStages: 1, evaluationProgress: 75, projectScore: 57 });
    expect(e.projectScorePrecise).toBeCloseTo(57, 10);
    expect(e.stages.find(s => s.stageId === "X")).toMatchObject({ score: 0, graded: true, status: "not_started" });
    expect(e.stages.find(s => s.stageId === "O")).toMatchObject({ score: null, graded: false, required: false });
    const one = buildProjectEvaluation(DEF, doc({ X: { status: "in_progress", score: 0 } }));
    expect(one).toMatchObject({ gradedStages: 1, projectScore: 0, projectScorePrecise: 0, evaluationProgress: 25 });
  });
  it("F3 evaluationProgress is graded / total × 100 and is independent of the workflow progress", () => {
    const p = doc({ X: { status: "approved" }, Y: { status: "approved" }, Z: { status: "approved" } });   // workflow 100, nothing graded
    expect(core.buildStudentSummary(DEF, p, NOW).overallProgress).toBe(100);
    expect(buildProjectEvaluation(DEF, p)).toMatchObject({ evaluationProgress: 0, gradedStages: 0, projectScore: null });
    const q = doc({ X: { status: "not_started", score: 40 }, Y: { status: "not_started", score: 60 } });       // workflow 0, half graded
    expect(core.buildStudentSummary(DEF, q, NOW).overallProgress).toBe(0);
    expect(buildProjectEvaluation(DEF, q)).toMatchObject({ evaluationProgress: 50, gradedStages: 2, projectScore: 50 });
  });
  it("F4 malformed scores are 'not graded' (never coerced), rounding of the average is presentation-only", () => {
    const e = buildProjectEvaluation(DEF, doc({ X: { status: "in_progress", score: "abc" }, Y: { status: "in_progress", score: 101 }, Z: { status: "in_progress", score: -1 }, O: { status: "in_progress", score: Number.NaN } }));
    expect(e).toMatchObject({ gradedStages: 0, projectScore: null });
    const f = buildProjectEvaluation(DEF, doc({ X: { score: 33 }, Y: { score: 34 }, Z: { score: 34 } }));
    expect(f.projectScorePrecise).toBeCloseTo(33.6666, 3); expect(f.projectScore).toBe(34); expect(f.evaluationProgress).toBe(75);
  });
  it("F5 orphan entries (deleted / retired / deactivated stage) are ignored by every count and surfaced as ids; never a crash", () => {
    const e = buildProjectEvaluation(DEF, doc({ GONE: { status: "approved", score: 90 }, I: { status: "approved", score: 80 }, X: { status: "approved", score: 50 }, JUNK: null, OTHER: { status: "approved" } }));
    expect(e).toMatchObject({ totalStages: 4, gradedStages: 1, ungradedStages: 3, projectScore: 50, orphanStageIds: ["GONE", "I"] });
    expect(buildProjectEvaluation({ stages: [] }, doc({ X: { score: 5 } }))).toMatchObject({ totalStages: 0, gradedStages: 0, ungradedStages: 0, evaluationProgress: 0, projectScore: null, orphanStageIds: ["X"] });
    expect(buildProjectEvaluation(null, null)).toMatchObject({ totalStages: 0, projectScore: null, stages: [], orphanStageIds: [] });
  });
  it("F6 per-stage scoredAt / scoredBy come from the latest history score event (fallback: the entry's updatedAt); updatedAt is the newest", () => {
    const h = [
      { eventId: "1", stageId: "X", type: "score", fromScore: null, toScore: 20, actor: "t1", createdAt: "2026-03-01T10:00:00.000Z" },
      { eventId: "2", stageId: "X", type: "score", fromScore: 20, toScore: 85, actor: "t2", createdAt: "2026-03-02T10:00:00.000Z" },
      { eventId: "3", stageId: "X", type: "status", fromStatus: "not_started", toStatus: "approved", actor: "t3", createdAt: "2026-03-03T10:00:00.000Z" }
    ];
    const e = buildProjectEvaluation(DEF, doc({ X: { status: "approved", score: 85, updatedAt: "2026-03-03T10:00:00.000Z" }, Y: { status: "in_progress", score: 60, updatedAt: "2026-02-01T00:00:00.000Z" } }, h));
    expect(e.stages.find(s => s.stageId === "X")).toMatchObject({ scoredAt: "2026-03-02T10:00:00.000Z", scoredBy: "t2" });
    expect(e.stages.find(s => s.stageId === "Y")).toMatchObject({ scoredAt: "2026-02-01T00:00:00.000Z", scoredBy: "" });
    expect(e.updatedAt).toBe("2026-03-02T10:00:00.000Z");
    expect(e.stages.find(s => s.stageId === "Z")).toMatchObject({ scoredAt: "", scoredBy: "" });
  });
});

describe("9B-D/E teacher score actions — narrow, validated, CAS-merged, audited", () => {
  it("L1 read of a student with no document → empty evaluation (legacy-safe); teacher `student` detail carries `evaluation` too", async () => {
    const ctx = school();
    const e = await evalOf(ctx);
    expect(e.ok).toBe(true);
    expect(e.evaluation).toMatchObject({ totalStages: ACTIVE_A.length, gradedStages: 0, ungradedStages: ACTIVE_A.length, evaluationProgress: 0, projectScore: null });
    const detail = (await get(ctx, "projectCode=899373&resource=student&classId=c1&studentId=s1")).jsonBody;
    expect(detail.evaluation).toEqual(e.evaluation);
    expect(ctx.getJson(NS.A.progressName("c1", "s1"))).toBeNull();                              // a read never creates a document
  });
  it("L2/L3/L4 set 85, then 0, then 100 on one stage: stored additively, response carries stage + evaluation + performance, status untouched", async () => {
    const ctx = school();
    let r = await setScore(ctx, { score: 85 });
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ ok: true, action: "score.set", stage: { stageId: "B01", status: "not_started", score: 85 } });
    expect(r.jsonBody.evaluation).toMatchObject({ gradedStages: 1, ungradedStages: ACTIVE_A.length - 1, projectScore: 85 });
    expect(r.jsonBody.performance).toMatchObject({ grade: 0 });                                  // not approved → the grade axis is untouched
    expect(r.jsonBody.summary.overallProgress).toBe(0);                                          // workflow untouched
    r = await setScore(ctx, { score: 0 });
    expect(r.status).toBe(200); expect(r.jsonBody.stage.score).toBe(0); expect(r.jsonBody.evaluation).toMatchObject({ gradedStages: 1, projectScore: 0 });
    r = await setScore(ctx, { score: 100 });
    expect(r.status).toBe(200); expect(r.jsonBody.stage.score).toBe(100); expect(r.jsonBody.evaluation.projectScore).toBe(100);
    const stored = ctx.getJson(NS.A.progressName("c1", "s1"));
    expect(stored.stages.B01).toMatchObject({ status: "not_started", score: 100 });
    expect(stored.history.filter(h => h.type === "score").map(h => [h.fromScore, h.toScore])).toEqual([[null, 85], [85, 0], [0, 100]]);
    expect(ctx.audits.map(a => a.action)).toEqual(["project.stage.score", "project.stage.score", "project.stage.score"]);
    expect(ctx.audits[0].details).toMatchObject({ projectCode: "899373", classId: "c1", studentId: "s1", stageId: "B01", oldScore: null, newScore: 85, via: "score.set" });
  });
  it("L5/L6/L7 negative, > 100, non-number, missing score → 400 with the Arabic message and NOTHING written", async () => {
    const ctx = school();
    for (const bad of [-1, 101, "abc", Number.NaN, true, {}, [], "1e9", undefined, null, ""]) {
      const r = await setScore(ctx, { score: bad });
      expect(r.status, String(bad)).toBe(400);
      expect(r.jsonBody.error).toBe("العلامة يجب أن تكون رقمًا بين 0 و 100.");
    }
    expect(ctx.getJson(NS.A.progressName("c1", "s1"))).toBeNull();
    expect(ctx.audits).toEqual([]);
  });
  it("L5b a score action never changes the workflow: a body with status or note is refused (400), nothing written", async () => {
    const ctx = school();
    expect((await setScore(ctx, { status: "approved" })).status).toBe(400);
    expect((await setScore(ctx, { note: "x" })).status).toBe(400);
    expect((await clearScore(ctx, { status: "approved" })).status).toBe(400);
    expect(ctx.getJson(NS.A.progressName("c1", "s1"))).toBeNull();
  });
  it("L8 invalid project → 400; class not enrolled in the project → 400; unknown class → 404", async () => {
    const ctx = school();
    expect((await setScore(ctx, { projectCode: "000000" })).status).toBe(400);
    expect((await setScore(ctx, { projectCode: "794589" })).status).toBe(400);                 // c1 runs 899373 + 883589 only
    expect((await setScore(ctx, { classId: "nope" })).status).toBe(404);
    expect(ctx.names("platform/project-")).toEqual([]);
  });
  it("L9 invalid / inactive stage → 400 and the stage is NEVER created in the document", async () => {
    const ctx = school();
    await setScore(ctx, { stageId: "B01", score: 50 });                                         // a real document exists first
    const before = JSON.stringify(ctx.getJson(NS.A.progressName("c1", "s1")));
    for (const bad of ["NOPE", "", "P01" /* a 794589 stage id */]) {
      const r = await setScore(ctx, { stageId: bad, score: 50 });
      expect(r.status, bad).toBe(400);
    }
    // deactivate B02 in the class snapshot → scoring it is refused too
    const cfg = ctx.getJson(NS.A.configName("c1"));
    cfg.stages = cfg.stages.map(s => (s.stageId === "B02" ? { ...s, active: false } : s));
    ctx.setJson(NS.A.configName("c1"), cfg);
    expect((await setScore(ctx, { stageId: "B02", score: 50 })).status).toBe(400);
    expect(JSON.stringify(ctx.getJson(NS.A.progressName("c1", "s1")))).toBe(before);
    expect("B02" in ctx.getJson(NS.A.progressName("c1", "s1")).stages).toBe(false);
  });
  it("L10 student not in the class (foreign / archived / unknown) → 404, no ghost document; archived class → 403", async () => {
    const ctx = school();
    for (const sid of ["s3", "s4", "ghost"]) expect((await setScore(ctx, { studentId: sid })).status, sid).toBe(404);
    expect(ctx.names("platform/project-progress")).toEqual([]);
    expect((await setScore(ctx, { classId: "c9", studentId: "s9" })).status).toBe(403);
    expect(ctx.getJson(NS.A.progressName("c9", "s9"))).toBeNull();
  });
  it("L11 a student token cannot mutate (401 on set and clear) and cannot read the teacher evaluation resource", async () => {
    const ctx = school();
    expect((await setScore(ctx, {}, NO_AUTH)).status).toBe(401);
    expect((await clearScore(ctx, {}, NO_AUTH)).status).toBe(401);
    expect((await get(ctx, "projectCode=899373&resource=evaluation&classId=c1&studentId=s1", NO_AUTH)).status).toBe(401);
    expect(ctx.getJson(NS.A.progressName("c1", "s1"))).toBeNull();
  });
  it("L16 clear removes ONLY that stage's score (0 stays a grade until cleared), history records it; clearing an unscored stage is a no-op", async () => {
    const ctx = school();
    await setScore(ctx, { stageId: "B01", score: 0 });
    await setScore(ctx, { stageId: "B02", score: 90 });
    let r = await clearScore(ctx, { stageId: "B01" });
    expect(r.status).toBe(200);
    expect("score" in r.jsonBody.stage).toBe(false);
    expect(r.jsonBody.evaluation).toMatchObject({ gradedStages: 1, projectScore: 90 });
    const stored = ctx.getJson(NS.A.progressName("c1", "s1"));
    expect("score" in stored.stages.B01).toBe(false); expect(stored.stages.B02.score).toBe(90);
    expect(stored.history.at(-1)).toMatchObject({ type: "score", stageId: "B01", fromScore: 0, toScore: null });
    r = await clearScore(ctx, { stageId: "B03" });
    expect(r.status).toBe(200); expect(r.jsonBody.noChange).toBe(true);
    expect("B03" in ctx.getJson(NS.A.progressName("c1", "s1")).stages).toBe(false);            // a no-op never creates the stage
  });
  it("L17 a missing stage id on clear → 400; unknown action stays unknown", async () => {
    const ctx = school();
    expect((await clearScore(ctx, { stageId: "" })).status).toBe(400);
    expect((await post(ctx, { action: "setStageScore", projectCode: "899373", classId: "c1", studentId: "s1", stageId: "B01", score: 5 })).status).toBe(400);
  });
  it("L18 progress.update still carries `evaluation` (additive) and its score path stays equivalent to score.set", async () => {
    const ctx = school();
    const r = await post(ctx, { action: "progress.update", projectCode: "899373", classId: "c1", studentId: "s1", stageId: "B01", score: 42 });
    expect(r.status).toBe(200);
    expect(r.jsonBody.evaluation).toMatchObject({ gradedStages: 1, projectScore: 42 });
    expect((await evalOf(ctx)).evaluation.stages.find(s => s.stageId === "B01")).toMatchObject({ score: 42, graded: true, scoredBy: "teacher-1" });
  });
});

describe("9B-E student read surface — own data only, identity from the session", () => {
  it("L12/L13 the student reads their OWN evaluation; a studentId / classId in the query is ignored (never another student's data)", async () => {
    const ctx = school();
    await setScore(ctx, { studentId: "s1", stageId: "B01", score: 85 });
    await setScore(ctx, { studentId: "s2", stageId: "B01", score: 10 });
    const mine = (await studentGet(ctx, "s1")).jsonBody;
    expect(mine.projects.find(p => p.projectCode === "899373").evaluation).toMatchObject({ gradedStages: 1, projectScore: 85 });
    const spoof = (await studentGet(ctx, "s1", "?studentId=s2&classId=c1")).jsonBody;
    expect(spoof.projects.find(p => p.projectCode === "899373").evaluation.projectScore).toBe(85);   // still s1
    const other = (await studentGet(ctx, "s2")).jsonBody;
    expect(other.projects.find(p => p.projectCode === "899373").evaluation.projectScore).toBe(10);
    // the student route is GET-only: a POST with a score body is not a mutation path (404/405 or ignored → nothing written)
    const before = JSON.stringify(ctx.getJson(NS.A.progressName("c1", "s1")));
    await studentTracker({ method: "POST", url: "https://x/api/student-project-tracker", json: async () => ({ action: "score.set", stageId: "B02", score: 100 }) }, studentDeps(ctx, "s1")).catch(() => {});
    expect(JSON.stringify(ctx.getJson(NS.A.progressName("c1", "s1")))).toBe(before);
  });
  it("L12b a student of a class with no project → enrolled:false, no evaluation, no error", async () => {
    const ctx = school();
    ctx.setJson("platform/classes/c1.json", room("c1", []));
    const r = (await studentGet(ctx, "s1")).jsonBody;
    expect(r).toEqual({ ok: true, enrolled: false, projects: [] });
  });
});

describe("9B-J isolation + concurrency", () => {
  it("L14 project isolation: scoring stage B01 in 899373 never touches 883589's B01 (and vice versa); both evaluations independent", async () => {
    const ctx = school();
    await setScore(ctx, { projectCode: "899373", stageId: "B01", score: 80 });
    await setScore(ctx, { projectCode: "883589", stageId: "B01", score: 30 });
    const a = (await evalOf(ctx, { projectCode: "899373" })).evaluation, b = (await evalOf(ctx, { projectCode: "883589" })).evaluation;
    expect(a).toMatchObject({ gradedStages: 1, projectScore: 80 }); expect(b).toMatchObject({ gradedStages: 1, projectScore: 30 });
    expect(b.totalStages).toBe(getProjectDefinition("883589").stages.filter(s => s.active === true).length);
    await clearScore(ctx, { projectCode: "899373", stageId: "B01" });
    expect((await evalOf(ctx, { projectCode: "883589" })).evaluation).toEqual(b);
    expect(ctx.getJson(NS.B.progressName("c1", "s1")).stages.B01.score).toBe(30);
  });
  it("L15 student isolation: s1's scores never appear in s2's evaluation; each has their own document", async () => {
    const ctx = school();
    await setScore(ctx, { studentId: "s1", stageId: "B01", score: 70 });
    await setScore(ctx, { studentId: "s1", stageId: "B02", score: 90 });
    await setScore(ctx, { studentId: "s2", stageId: "B03", score: 10 });
    expect((await evalOf(ctx, { studentId: "s1" })).evaluation).toMatchObject({ gradedStages: 2, projectScore: 80 });
    expect((await evalOf(ctx, { studentId: "s2" })).evaluation).toMatchObject({ gradedStages: 1, projectScore: 10 });
    expect(ctx.names(NS.A.progressPrefix("c1")).sort()).toEqual([NS.A.progressName("c1", "s1"), NS.A.progressName("c1", "s2")].sort());
  });
  it("J1 stage A then stage B → both remain; clearing A keeps B; a stage entry is merged, never the whole document replaced", async () => {
    const ctx = school();
    await post(ctx, { action: "progress.update", projectCode: "899373", classId: "c1", studentId: "s1", stageId: "B03", status: "approved", note: "أحسنت" });
    await setScore(ctx, { stageId: "B01", score: 60 });
    await setScore(ctx, { stageId: "B02", score: 70 });
    let stored = ctx.getJson(NS.A.progressName("c1", "s1"));
    expect(stored.stages.B01.score).toBe(60); expect(stored.stages.B02.score).toBe(70);
    expect(stored.stages.B03).toMatchObject({ status: "approved", note: "أحسنت" });               // an unrelated stage's status/note survive
    await clearScore(ctx, { stageId: "B01" });
    stored = ctx.getJson(NS.A.progressName("c1", "s1"));
    expect("score" in stored.stages.B01).toBe(false); expect(stored.stages.B02.score).toBe(70); expect(stored.stages.B03.note).toBe("أحسنت");
    expect(stored).toMatchObject({ schemaVersion: 1, programCode: "899373", classId: "c1", studentId: "s1" });
  });
  it("J2 concurrent A / B writes race through the real CAS: an injected conflicting write is retried, no lost update", async () => {
    // The hook fires once: right before the CAS write of B01 lands, B02 is written by "another teacher" → the first
    // write sees a changed ETag (412), re-reads and re-applies on top of the new document.
    let fired = false;
    const ctx = school({ beforeConditionalUpload: (name, api) => {
      if (fired || name !== NS.A.progressName("c1", "s1")) return;
      fired = true;
      const cur = api.getJson(name);
      cur.stages.B02 = { status: "not_started", score: 33, updatedAt: NOW };
      api.setJson(name, cur);
    } });
    await setScore(ctx, { stageId: "B03", score: 1 });                                          // the document exists (CAS path)
    const r = await setScore(ctx, { stageId: "B01", score: 99 });
    expect(r.status).toBe(200); expect(fired).toBe(true);
    const stored = ctx.getJson(NS.A.progressName("c1", "s1"));
    expect(stored.stages.B01.score).toBe(99); expect(stored.stages.B02.score).toBe(33); expect(stored.stages.B03.score).toBe(1);
    expect(r.jsonBody.evaluation).toMatchObject({ gradedStages: 3 });
    // two writers in flight at once (Promise.all) also both land
    const ctx2 = school();
    const [x, y] = await Promise.all([setScore(ctx2, { stageId: "B01", score: 11 }), setScore(ctx2, { stageId: "B02", score: 22 })]);
    expect([x.status, y.status].every(s => s === 200 || s === 503)).toBe(true);
    const s2 = ctx2.getJson(NS.A.progressName("c1", "s1"));
    if (x.status === 200) expect(s2.stages.B01.score).toBe(11);
    if (y.status === 200) expect(s2.stages.B02.score).toBe(22);
    expect(x.status === 200 || y.status === 200).toBe(true);
  });
  it("J3 an exhausted CAS budget surfaces 503 with the shared conflict message (never a silent overwrite)", async () => {
    const ctx = school({ beforeConditionalUpload: (name, api) => { if (name === NS.A.progressName("c1", "s1")) api.setJson(name, api.getJson(name)); } });
    await post(ctx, { action: "progress.update", projectCode: "899373", classId: "c1", studentId: "s1", stageId: "B03", status: "in_progress" }).catch(() => {});
    ctx.setJson(NS.A.progressName("c1", "s1"), { schemaVersion: 1, programCode: "899373", classId: "c1", studentId: "s1", stages: { B03: { status: "in_progress", updatedAt: NOW } }, history: [], updatedAt: NOW });
    const r = await setScore(ctx, { stageId: "B01", score: 5 });
    expect(r.status).toBe(503);
    expect(r.jsonBody.error).toBe("حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.");
    expect(StorageConflictError).toBeTypeOf("function");
    expect("B01" in ctx.getJson(NS.A.progressName("c1", "s1")).stages).toBe(false);
  });
});

describe("9B-K edge cases", () => {
  it("K1 a snapshot whose stages were all deactivated → zero total, progress 0, score null; old scores become orphans (ignored, listed)", async () => {
    const ctx = school();
    await setScore(ctx, { stageId: "B01", score: 77 });
    const cfg = ctx.getJson(NS.A.configName("c1"));
    cfg.stages = cfg.stages.map(s => ({ ...s, active: false }));
    ctx.setJson(NS.A.configName("c1"), cfg);
    const e = (await evalOf(ctx)).evaluation;
    expect(e).toMatchObject({ totalStages: 0, gradedStages: 0, ungradedStages: 0, evaluationProgress: 0, projectScore: null, orphanStageIds: ["B01"] });
    const st = (await studentGet(ctx, "s1")).jsonBody.projects.find(p => p.projectCode === "899373");
    expect(st.evaluation.orphanStageIds).toEqual(["B01"]);                                       // the student surface never crashes either
  });
  it("K2 a renamed stage (same stableId) keeps its score; a stage removed from the snapshot becomes an orphan", async () => {
    const ctx = school();
    await setScore(ctx, { stageId: "B01", score: 64 });
    await setScore(ctx, { stageId: "B02", score: 40 });
    const cfg = ctx.getJson(NS.A.configName("c1"));
    cfg.stages = cfg.stages.filter(s => s.stageId !== "B02").map(s => (s.stageId === "B01" ? { ...s, title: "اسم جديد" } : s));
    ctx.setJson(NS.A.configName("c1"), cfg);
    const e = (await evalOf(ctx)).evaluation;
    expect(e.stages.find(s => s.stageId === "B01")).toMatchObject({ title: "اسم جديد", score: 64 });
    expect(e).toMatchObject({ gradedStages: 1, projectScore: 64, orphanStageIds: ["B02"] });
    expect(e.totalStages).toBe(ACTIVE_A.length - 1);
  });
  it("K3 archived class: evaluation is readable (readOnly:true) but every score action is refused", async () => {
    const ctx = school();
    ctx.setJson(NS.A.progressName("c9", "s9"), { schemaVersion: 1, programCode: "899373", classId: "c9", studentId: "s9", stages: { B01: { status: "approved", score: 55, updatedAt: NOW } }, history: [], updatedAt: NOW });
    const r = await evalOf(ctx, { classId: "c9", studentId: "s9" });
    expect(r.status ?? 200).toBe(200); expect(r.readOnly).toBe(true); expect(r.evaluation).toMatchObject({ gradedStages: 1, projectScore: 55 });
    expect((await clearScore(ctx, { classId: "c9", studentId: "s9" })).status).toBe(403);
    expect(ctx.getJson(NS.A.progressName("c9", "s9")).stages.B01.score).toBe(55);
  });
  it("K4 the legacy 794589 namespace works through the generic route too (paths unchanged)", async () => {
    const ctx = school();
    const r = await post(ctx, { action: "score.set", projectCode: "794589", classId: "c2", studentId: "s3", stageId: "B01", score: 12 });
    expect(r.status).toBe(200);
    expect(ctx.getJson(NS.L.progressName("c2", "s3")).stages.B01.score).toBe(12);
    expect(NS.L.progressName("c2", "s3")).toBe("platform/project-progress/c2/s3.json");
    expect(r.jsonBody.evaluation).toMatchObject({ gradedStages: 1, projectScore: 12 });
  });
  it("K5 existing surfaces keep working with scored documents: students cards / summary / analytics / projects-summary", async () => {
    const ctx = school();
    await setScore(ctx, { stageId: "B01", score: 0 });
    for (const res of ["students", "summary", "analytics"]) expect((await get(ctx, "projectCode=899373&resource=" + res + "&classId=c1")).status, res).toBe(200);
    const ps = await get(ctx, "resource=projects-summary");
    expect(ps.status).toBe(200); expect(ps.jsonBody.totalReadyForReview).toBe(0);                // a score is never a ready_for_review
  });
});
