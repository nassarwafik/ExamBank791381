import { describe, it, expect } from "vitest";
import { handler as tracker } from "../src/functions/project-tracker.js";
import { handler as legacyTracker } from "../src/functions/project-794589.js";
import { handler as studentTracker } from "../src/functions/student-project-tracker.js";
import { getProjectDefinition, getStorageNamespace } from "../src/lib/project-tracker/registry.js";
import * as perf from "../src/lib/project-tracker/performance.js";
import { applyProgressUpdate } from "../src/lib/project-794589-progress.js";
import core from "../src/lib/project-tracker/core.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Project Performance — the ONE pure calculator (stage project value → weighted score → project grade /100 →
// project-specific Strength /600 → six-band rank), the additive `score` on the progress entry (teacher-only,
// server-validated, history type "score", audit), approved-only contribution, multi-project isolation and the
// read surfaces (teacher student detail / cards, student tracker). Progress stays core.buildStudentSummary.

const NOW = "2026-03-01T00:00:00.000Z";
const AUTH = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
const NO_AUTH = { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }) };
const audits = [];
const deps = (ctx, auth = AUTH) => ({ ...auth, container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async (_c, e) => { audits.push(e); } });
const post = (h, ctx, url, body, auth) => h({ method: "POST", url: "https://x" + url, json: async () => body }, deps(ctx, auth));
const get = (h, ctx, url, auth) => h({ method: "GET", url: "https://x" + url, json: async () => ({}) }, deps(ctx, auth));
const user = (id, cid) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: "طالب " + id, code: "10000000" + id.slice(-1) });
const room = (id, codes) => ({ classId: id, name: "صف " + id, active: true, status: "active", studentIds: ["s1"], programCodes: codes, schoolYear: "2026", updatedAt: NOW, createdAt: NOW });
const NS = { A: getStorageNamespace("899373"), B: getStorageNamespace("883589"), L: getStorageNamespace("794589") };
const school = () => createMemoryContainer({ "platform/classes/c1.json": room("c1", ["899373", "883589"]), "platform/users/s1.json": user("s1", "c1"), "platform/classes/c2.json": room("c2", ["794589"]), "platform/users/s3.json": { ...user("s3", "c2"), classId: "c2" } });
const update = (ctx, code, body, auth) => post(tracker, ctx, "/api/project-tracker", { action: "progress.update", projectCode: code, classId: "c1", studentId: "s1", ...body }, auth);
const studentDeps = (ctx, id = "s1") => ({ requireActiveStudentSession: async () => ({ ok: true, user: { sub: id }, student: ctx.getJson("platform/users/" + id + ".json"), container: ctx.container }), container: ctx.container, getContainer: () => ctx.container });

// Synthetic two-track definition: Track A = 50, Track B = 50; X is 20% of A (1 of 5 weight) → max 10 / 100.
const DEF = {
  projectCode: "syn", tracks: [{ trackId: "a", title: "A" }, { trackId: "b", title: "B" }], trackWeights: { a: 50, b: 50 },
  stages: [
    { stageId: "X", track: "a", groupId: "g", order: 1, weight: 1, required: true, active: true },
    { stageId: "Y", track: "a", groupId: "g", order: 2, weight: 4, required: true, active: true },
    { stageId: "Z", track: "b", groupId: "h", order: 1, weight: 1, required: true, active: true },
    { stageId: "O", track: "b", groupId: "h", order: 2, weight: 1, required: false, active: true },
    { stageId: "I", track: "b", groupId: "h", order: 3, weight: 1, required: true, active: false }
  ]
};
const stage = id => DEF.stages.find(s => s.stageId === id);
const doc = stages => ({ stages });

describe("97/10. stage project value — the SAME weights as the progress math", () => {
  it("Track A 50% × stage X 20% of A → 10 / 100; score 85 → 8.5 (only while approved)", () => {
    expect(perf.calculateStageProjectWeight(DEF, stage("X"))).toBeCloseTo(10, 10);
    expect(perf.calculateStageProjectWeight(DEF, stage("Y"))).toBeCloseTo(40, 10);
    expect(perf.calculateStageProjectWeight(DEF, stage("Z"))).toBeCloseTo(50, 10);
    expect(perf.calculateStageWeightedScore(DEF, stage("X"), { status: "approved", score: 85 })).toBeCloseTo(8.5, 10);
    expect(perf.calculateStageWeightedScore(DEF, stage("X"), { status: "ready_for_review", score: 85 })).toBe(0);
    expect(perf.calculateStageWeightedScore(DEF, stage("X"), { status: "approved" })).toBe(0);
  });
  it("optional / inactive stages carry no project value (never counted, never listed)", () => {
    expect(perf.calculateStageProjectWeight(DEF, stage("O"))).toBe(0);
    expect(perf.calculateStageProjectWeight(DEF, stage("I"))).toBe(0);
    expect(Object.keys(perf.buildStageValues(DEF, doc({})))).toEqual(["X", "Y", "Z"]);
  });
  it("uses the default 50/50 track weights when a definition has none (same fallback as calculateOverall)", () => {
    const d = { ...DEF, trackWeights: undefined };
    expect(perf.calculateStageProjectWeight(d, stage("X"))).toBeCloseTo(10, 10);
  });
});

describe("98/12. project grade — approved-only, precision kept, presentation rounds", () => {
  it("sums approved weighted scores; unapproved / unscored contribute 0; capped at 100", () => {
    expect(perf.calculateProjectGrade(DEF, doc({ X: { status: "approved", score: 85 } }))).toBeCloseTo(8.5, 10);
    expect(perf.calculateProjectGrade(DEF, doc({ X: { status: "approved", score: 85 }, Y: { status: "in_progress", score: 100 }, Z: { status: "approved" } }))).toBeCloseTo(8.5, 10);
    expect(perf.calculateProjectGrade(DEF, doc({ X: { status: "approved", score: 100 }, Y: { status: "approved", score: 100 }, Z: { status: "approved", score: 100 } }))).toBe(100);
    expect(perf.calculateProjectGrade(DEF, doc({ X: { status: "approved", score: 100 }, Y: { status: "approved", score: 100 }, Z: { status: "approved", score: 100 }, O: { status: "approved", score: 100 } }))).toBe(100);
    expect(perf.calculateProjectGrade(DEF, null)).toBe(0);
  });
  it("summary keeps gradePrecise and rounds grade; progress is the canonical summary (never the grade)", () => {
    const p = perf.buildProjectPerformanceSummary(DEF, doc({ X: { status: "approved", score: 85 }, Z: { status: "approved", score: 1 } }), NOW);
    expect(p.gradePrecise).toBeCloseTo(9, 10);
    expect(p.grade).toBe(9);
    expect(p.overallProgress).toBe(core.buildStudentSummary(DEF, doc({ X: { status: "approved", score: 85 }, Z: { status: "approved", score: 1 } }), NOW).overallProgress);
    expect(p.overallProgress).toBe(60);              // (20% of A + 100% of B) / 2 — status only, scores irrelevant
    expect(p.stageValues.X).toMatchObject({ score: 85, maxContribution: 10, contribution: 8.5, counted: true, status: "approved" });
    expect(p.stageValues.Y).toMatchObject({ score: null, maxContribution: 40, contribution: 0, counted: false });
  });
  it("progress 90 / grade 65 and progress 45 / grade 42 are both valid (independent axes)", () => {
    const hi = perf.buildProjectPerformanceSummary(DEF, doc({ X: { status: "approved", score: 50 }, Y: { status: "approved", score: 50 }, Z: { status: "approved", score: 90 } }), NOW);
    expect(hi.overallProgress).toBe(100); expect(hi.grade).toBe(70);
    const lo = perf.buildProjectPerformanceSummary(DEF, doc({ Z: { status: "approved", score: 84 } }), NOW);
    expect(lo.overallProgress).toBe(50); expect(lo.grade).toBe(42);
  });
});

describe("99/16/17. project Strength /600 + bands", () => {
  it("progress 80 + grade 70 → 450 (تنين النار); clamped 0..600", () => {
    expect(perf.calculateProjectStrength(80, 70)).toBe(450);
    expect(perf.projectStrengthTier(450)).toBe("diamond");
    expect(perf.calculateProjectStrength(0, 0)).toBe(0);
    expect(perf.calculateProjectStrength(100, 100)).toBe(600);
    expect(perf.calculateProjectStrength(999, -5)).toBe(600 / 2);
  });
  it("pins the thresholds 0,99,100,199,200,299,300,399,400,499,500,600", () => {
    const t = perf.projectStrengthTier;
    expect([t(0), t(99), t(100), t(199), t(200), t(299), t(300), t(399), t(400), t(499), t(500), t(600)]).toEqual([
      "beginner", "beginner", "bronze", "bronze", "silver", "silver", "gold", "gold", "diamond", "diamond", "legendary", "legendary"
    ]);
    expect(perf.projectRankLevel("legendary")).toBe(6);
    expect(perf.RANK_ORDER).toEqual(["beginner", "bronze", "silver", "gold", "diamond", "legendary"]);
  });
});

describe("6. score validation + 5/8/88. progress entry, history, approved-only", () => {
  it("rejects negative, > 100, NaN, Infinity, strings and objects with the Arabic error; accepts 0, 100, numeric strings", () => {
    for (const bad of [-1, 101, Number.NaN, Number.POSITIVE_INFINITY, "abc", "", {}, [], true, "1e9"]) expect(() => perf.validateScoreInput(bad), String(bad)).toThrow("العلامة يجب أن تكون رقمًا بين 0 و 100.");
    expect(perf.validateScoreInput(0)).toBe(0); expect(perf.validateScoreInput(100)).toBe(100); expect(perf.validateScoreInput("85")).toBe(85); expect(perf.validateScoreInput(85.5)).toBe(85.5);
  });
  it("applyProgressUpdate stores score additively, records history type score with from/to, and clears with null", () => {
    const base = { stageId: "X", actor: "t", now: NOW, programCode: "syn", classId: "c1", studentId: "s1" };
    const a = applyProgressUpdate(null, { ...base, score: 85 });
    expect(a.scoreChanged).toBe(true); expect(a.statusChanged).toBe(false);
    expect(a.doc.stages.X).toMatchObject({ status: "not_started", score: 85 });
    expect(a.doc.history.at(-1)).toMatchObject({ type: "score", stageId: "X", fromScore: null, toScore: 85, actor: "t" });
    const b = applyProgressUpdate(a.doc, { ...base, status: "approved", score: 85 });     // same score + status → status only
    expect(b.statusChanged).toBe(true); expect(b.scoreChanged).toBe(false);
    expect(b.doc.history.filter(h => h.type === "score").length).toBe(1);
    expect(() => applyProgressUpdate(b.doc, { ...base, score: 85 })).toThrow("لا يوجد تغيير.");
    expect(() => applyProgressUpdate(b.doc, { ...base, score: 150 })).toThrow("العلامة يجب أن تكون رقمًا بين 0 و 100.");
    const c = applyProgressUpdate(b.doc, { ...base, score: null });
    expect(c.scoreChanged).toBe(true); expect("score" in c.doc.stages.X).toBe(false);
    expect(c.doc.history.at(-1)).toMatchObject({ type: "score", fromScore: 85, toScore: null });
    // legacy entries without score are untouched by a status-only update (no migration, no invented score)
    const d = applyProgressUpdate({ stages: { X: { status: "in_progress" } }, history: [] }, { ...base, status: "approved" });
    expect("score" in d.doc.stages.X).toBe(false);
  });
  it("moving a stage back from approved keeps the stored score but its contribution becomes 0 until approved again", () => {
    const base = { stageId: "X", actor: "t", now: NOW, programCode: "syn", classId: "c1", studentId: "s1" };
    const approved = applyProgressUpdate(null, { ...base, status: "approved", score: 85 }).doc;
    expect(perf.calculateProjectGrade(DEF, approved)).toBeCloseTo(8.5, 10);
    const back = applyProgressUpdate(approved, { ...base, status: "in_progress" }).doc;
    expect(back.stages.X.score).toBe(85);
    expect(perf.calculateProjectGrade(DEF, back)).toBe(0);
    const again = applyProgressUpdate(back, { ...base, status: "approved" }).doc;
    expect(perf.calculateProjectGrade(DEF, again)).toBeCloseTo(8.5, 10);
  });
});

describe("102/87/88. teacher score authority through the canonical tracker write path", () => {
  it("builder sets a score (with or without a status) → stored, history + audit emitted, performance returned", async () => {
    const ctx = school(); audits.length = 0;
    const r = await update(ctx, "899373", { stageId: "B01", status: "approved", score: 85 });
    expect(r.status).toBe(200);
    expect(r.jsonBody.stage).toMatchObject({ stageId: "B01", status: "approved", score: 85 });
    expect(r.jsonBody.performance).toMatchObject({ grade: 2, gradePrecise: 2.125, maxStrength: 600 });   // B01 = 1/20 of book (50%) = 2.5 → 85% = 2.125
    expect(r.jsonBody.performance.stageValues.B01).toMatchObject({ score: 85, maxContribution: 2.5, contribution: 2.125, counted: true });
    expect(r.jsonBody.history.some(h => h.type === "score" && h.toScore === 85 && h.fromScore === null)).toBe(true);
    expect(audits.map(a => a.action)).toEqual(["project.stage.approve", "project.stage.score"]);
    expect(audits[1].details).toMatchObject({ projectCode: "899373", classId: "c1", studentId: "s1", stageId: "B01", oldScore: null, newScore: 85 });
    const stored = ctx.getJson(NS.A.progressName("c1", "s1"));
    expect(stored.stages.B01.score).toBe(85);
    // score-only follow-up: one score audit, no status audit
    audits.length = 0;
    const r2 = await update(ctx, "899373", { stageId: "B01", score: 90 });
    expect(r2.status).toBe(200); expect(r2.jsonBody.stage.score).toBe(90);
    expect(audits.map(a => a.action)).toEqual(["project.stage.score"]);
    expect(audits[0].details).toMatchObject({ oldScore: 85, newScore: 90 });
  });
  it("invalid scores are rejected server-side with 400 and nothing is written; a student token is denied (401)", async () => {
    const ctx = school();
    for (const bad of [-5, 101, "abc", Number.NaN]) {
      const r = await update(ctx, "899373", { stageId: "B01", score: bad });
      expect(r.status, String(bad)).toBe(400); expect(r.jsonBody.error).toBe("العلامة يجب أن تكون رقمًا بين 0 و 100.");
    }
    expect(ctx.getJson(NS.A.progressName("c1", "s1"))).toBeNull();
    const denied = await update(ctx, "899373", { stageId: "B01", score: 85 }, NO_AUTH);
    expect(denied.status).toBe(401);
    expect(ctx.getJson(NS.A.progressName("c1", "s1"))).toBeNull();
  });
  it("the legacy 794589 route shares the SAME service: score stored + audited there too", async () => {
    const ctx = school(); audits.length = 0;
    const r = await post(legacyTracker, ctx, "/api/project-794589", { action: "progress.update", classId: "c2", studentId: "s3", stageId: "B01", status: "approved", score: 70 });
    expect(r.status).toBe(200);
    expect(ctx.getJson(NS.L.progressName("c2", "s3")).stages.B01).toMatchObject({ status: "approved", score: 70 });
    expect(audits.map(a => a.action)).toEqual(["project.stage.approve", "project.stage.score"]);
  });
});

describe("100/18. multi-project isolation + read surfaces", () => {
  it("project A and B keep independent grade / Strength / rank; scoring A never changes B", async () => {
    const ctx = school();
    // A: approve + score the first 8 book stages high (progress up), B: one low score
    const a = getProjectDefinition("899373").stages.filter(s => s.track === "book").slice(0, 8);
    for (const s of a) await update(ctx, "899373", { stageId: s.stageId, status: "approved", score: 100 });
    const bStage = getProjectDefinition("883589").stages.find(s => s.active !== false && s.required !== false).stageId;
    await update(ctx, "883589", { stageId: bStage, status: "approved", score: 20 });
    const before = (await get(studentTracker, ctx, "/api/student-project-tracker", studentDeps(ctx))).jsonBody.projects;
    const pa = before.find(p => p.projectCode === "899373").performance, pb = before.find(p => p.projectCode === "883589").performance;
    expect(pa.grade).toBe(20); expect(pa.overallProgress).toBe(20); expect(pa.projectStrength).toBe(120); expect(pa.tier).toBe("bronze");
    expect(pb.gradePrecise).toBeGreaterThan(0); expect(pb.grade).toBe(0); expect(pb.tier).toBe("beginner"); expect(pb.projectStrength).toBeLessThan(100);   // one small stage: precise > 0, rounds to 0
    await update(ctx, "899373", { stageId: a[0].stageId, score: 10 });
    const after = (await get(studentTracker, ctx, "/api/student-project-tracker", studentDeps(ctx))).jsonBody.projects;
    expect(after.find(p => p.projectCode === "883589").performance).toEqual(pb);      // B untouched
    expect(after.find(p => p.projectCode === "899373").performance.grade).toBeLessThan(20);
  });
  it("teacher student detail + cards expose performance (grade / projectStrength / projectTier); student rows are read-only values", async () => {
    const ctx = school();
    await update(ctx, "899373", { stageId: "B01", status: "approved", score: 85 });
    const detail = (await get(tracker, ctx, "/api/project-tracker?projectCode=899373&resource=student&classId=c1&studentId=s1")).jsonBody;
    expect(detail.performance).toMatchObject({ grade: 2, projectStrength: expect.any(Number), tier: "beginner", level: 1 });
    expect(detail.performance.stageValues.B01).toMatchObject({ score: 85, maxContribution: 2.5 });
    const cards = (await get(tracker, ctx, "/api/project-tracker?projectCode=899373&resource=students&classId=c1")).jsonBody.students;
    expect(cards[0]).toMatchObject({ studentId: "s1", grade: 2, projectTier: "beginner" });
    expect(typeof cards[0].projectStrength).toBe("number");
    // analytics / summary still work with scored entries (no new field breaks them)
    const analytics = await get(tracker, ctx, "/api/project-tracker?projectCode=899373&resource=analytics&classId=c1");
    expect(analytics.status).toBe(200);
    const summary = await get(tracker, ctx, "/api/project-tracker?projectCode=899373&resource=summary&classId=c1");
    expect(summary.status).toBe(200);
  });
});
