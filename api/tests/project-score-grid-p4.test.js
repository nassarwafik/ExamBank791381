import { describe, it, expect } from "vitest";
import { handler as tracker } from "../src/functions/project-tracker.js";
import { getProjectDefinition, getStorageNamespace } from "../src/lib/project-tracker/registry.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase P4 — the score grid (`score.bulk`): many (student, stage) scores of ONE class, each with its own value (null =
// clear), through the canonical per-pair pipeline (membership, active stage, CAS, audit, milestones). A score never
// changes a status. `expected` refuses a pair whose stored score changed since the grid was read (stale), writing
// nothing for it. Validation failures write nothing at all; archived classes stay read-only.
// Fail-first: run against a4061e6f (the action did not exist).

const NOW = "2026-10-01T10:00:00.000Z";
const CODE = "899373";
const NS = getStorageNamespace(CODE);
const STAGES = getProjectDefinition(CODE).stages.filter(s => s.active === true);
const [S1, S2, S3] = STAGES.map(s => s.stageId);
const user = (id, cid, extra = {}) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: "طالب " + id, code: "C" + id, ...extra });
const room = (id, extra = {}) => ({ classId: id, name: "صف " + id, grade: "11", schoolYear: "2026", active: true, status: "active", studentIds: [], programCodes: [CODE], createdAt: NOW, updatedAt: NOW, ...extra });

function setup(extra = {}) {
  const ctx = createMemoryContainer({
    "platform/classes/c1.json": room("c1"), "platform/classes/c2.json": room("c2"),
    "platform/users/s1.json": user("s1", "c1"), "platform/users/s2.json": user("s2", "c1"), "platform/users/s3.json": user("s3", "c1"),
    "platform/users/x1.json": user("x1", "c2"),
    ...extra
  });
  const audits = [], milestones = [];
  const deps = {
    requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }),
    container: ctx.container, getContainer: () => ctx.container,
    recordAuditEvent: async (_c, ev) => { audits.push(ev); },
    recordProjectMilestones: async (_c, ev) => { milestones.push(ev); }
  };
  const call = async body => (await tracker({ method: "POST", url: "https://x/api/project-tracker", json: async () => ({ projectCode: CODE, classId: "c1", ...body }) }, deps));
  const grid = items => call({ action: "score.bulk", items });
  const get = async params => (await tracker({ method: "GET", url: "https://x/api/project-tracker?" + new URLSearchParams({ projectCode: CODE, classId: "c1", ...params }), json: async () => ({}) }, deps));
  const progress = sid => ctx.getJson(NS.progressName("c1", sid));
  return { ctx, audits, milestones, call, grid, get, progress };
}

describe("P4 score.bulk — each pair its own score", () => {
  it("stores a different score for every pair in one request, never touching a status, auditing each change", async () => {
    const t = setup();
    const r = await t.grid([
      { studentId: "s1", stageId: S1, score: 80 }, { studentId: "s1", stageId: S2, score: 92.5 },
      { studentId: "s2", stageId: S1, score: "70" }, { studentId: "s3", stageId: S3, score: 0 }
    ]);
    expect(r.status).toBe(200);
    expect(r.jsonBody.totals).toEqual({ requested: 4, changed: 4, unchanged: 0, failed: 0 });
    expect(t.progress("s1").stages[S1]).toMatchObject({ score: 80 });
    expect(t.progress("s1").stages[S2]).toMatchObject({ score: 92.5 });
    expect(t.progress("s2").stages[S1]).toMatchObject({ score: 70 });
    expect(t.progress("s3").stages[S3]).toMatchObject({ score: 0 });
    for (const [sid, st] of [["s1", S1], ["s1", S2], ["s2", S1], ["s3", S3]]) expect(t.progress(sid).stages[st].status ?? "not_started").not.toBe("approved");
    expect(t.audits.map(a => a.action)).toEqual(["project.stage.score", "project.stage.score", "project.stage.score", "project.stage.score"]);
    expect(t.audits.every(a => a.details.via === "score.bulk")).toBe(true);
    expect(t.milestones).toHaveLength(4);
    expect(r.jsonBody.results.map(x => [x.studentId, x.stageId, x.score])).toEqual([["s1", S1, 80], ["s1", S2, 92.5], ["s2", S1, 70], ["s3", S3, 0]]);
  });

  it("keeps an approved stage approved when its score changes (a score is never an approval decision)", async () => {
    const t = setup();
    await t.call({ action: "progress.bulk", items: [{ studentId: "s1", stageId: S1 }], status: "approved" });
    const r = await t.grid([{ studentId: "s1", stageId: S1, score: 65 }]);
    expect(r.jsonBody.totals.changed).toBe(1);
    expect(t.progress("s1").stages[S1]).toMatchObject({ status: "approved", score: 65 });
  });

  it("null clears a score; an unchanged score is reported unchanged and not audited", async () => {
    const t = setup();
    await t.grid([{ studentId: "s1", stageId: S1, score: 50 }, { studentId: "s2", stageId: S1, score: 60 }]);
    t.audits.length = 0;
    const r = await t.grid([{ studentId: "s1", stageId: S1, score: null }, { studentId: "s2", stageId: S1, score: 60 }]);
    expect(r.jsonBody.totals).toEqual({ requested: 2, changed: 1, unchanged: 1, failed: 0 });
    expect(t.progress("s1").stages[S1].score ?? null).toBe(null);
    expect(t.progress("s2").stages[S1].score).toBe(60);
    expect(t.audits).toHaveLength(1);
    expect(t.audits[0].details).toMatchObject({ studentId: "s1", oldScore: 50, newScore: null });
  });

  it("the board reflects the stored scores at once", async () => {
    const t = setup();
    await t.grid([{ studentId: "s2", stageId: S2, score: 88 }]);
    const b = await t.get({ resource: "board" });
    expect(b.jsonBody.students.find(s => s.studentId === "s2").cells[S2]).toEqual({ status: "not_started", score: 88 });
  });
});

describe("P4 score.bulk — the stale guard", () => {
  it("refuses a pair whose stored score is no longer the one the grid showed, and writes the others", async () => {
    const t = setup();
    await t.grid([{ studentId: "s1", stageId: S1, score: 40 }]);
    // another teacher changes s1/S1 to 75 after our grid was read with 40
    await t.call({ action: "score.set", studentId: "s1", stageId: S1, score: 75 });
    const r = await t.grid([
      { studentId: "s1", stageId: S1, score: 90, expected: 40 },
      { studentId: "s2", stageId: S1, score: 55, expected: null }
    ]);
    expect(r.jsonBody.results[0]).toEqual({ studentId: "s1", stageId: S1, ok: false, error: "stale", score: 75 });
    expect(r.jsonBody.results[1]).toMatchObject({ ok: true, changed: true, score: 55 });
    expect(t.progress("s1").stages[S1].score).toBe(75);                    // the newer score survives
    expect(t.progress("s2").stages[S1].score).toBe(55);
  });

  it("an expected null (the grid showed an empty cell) is stale once a score exists", async () => {
    const t = setup();
    await t.call({ action: "score.set", studentId: "s3", stageId: S2, score: 10 });
    const r = await t.grid([{ studentId: "s3", stageId: S2, score: 99, expected: null }]);
    expect(r.jsonBody.results[0]).toMatchObject({ ok: false, error: "stale", score: 10 });
    expect(t.progress("s3").stages[S2].score).toBe(10);
  });

  it("a matching expected value writes normally; without expected the last write wins (as score.set)", async () => {
    const t = setup();
    await t.grid([{ studentId: "s1", stageId: S1, score: 40 }]);
    expect((await t.grid([{ studentId: "s1", stageId: S1, score: 45, expected: 40 }])).jsonBody.totals.changed).toBe(1);
    expect((await t.grid([{ studentId: "s1", stageId: S1, score: 47 }])).jsonBody.totals.changed).toBe(1);
    expect(t.progress("s1").stages[S1].score).toBe(47);
  });
});

describe("P4 score.bulk — refusals", () => {
  it("validation failures write nothing at all", async () => {
    const t = setup();
    const bad = [
      [],
      [{ studentId: "s1", stageId: S1, score: 101 }],
      [{ studentId: "s1", stageId: S1, score: -1 }],
      [{ studentId: "s1", stageId: S1, score: "abc" }],
      [{ studentId: "s1", stageId: S1, score: 50, expected: 200 }],
      [{ studentId: "s1", stageId: S1, score: 50 }, { studentId: "s1", stageId: S1, score: 60 }],
      [{ studentId: "", stageId: S1, score: 50 }],
      Array.from({ length: 301 }, (_, i) => ({ studentId: "s" + i, stageId: S1, score: 1 }))
    ];
    for (const items of bad) expect((await t.grid(items)).status, JSON.stringify(items).slice(0, 80)).toBe(400);
    expect((await t.call({ action: "score.bulk", items: [{ studentId: "s1", stageId: S1, score: 5 }], status: "approved" })).status).toBe(400);
    expect((await t.call({ action: "score.bulk", items: [{ studentId: "s1", stageId: S1, score: 5 }], note: "x" })).status).toBe(400);
    expect(t.ctx.names(NS.progressPrefix("c1"))).toEqual([]);
    expect(t.audits).toEqual([]);
  });

  it("a pair for a student of another class or an inactive stage fails alone; the rest is written", async () => {
    const t = setup();
    const r = await t.grid([
      { studentId: "x1", stageId: S1, score: 50 },
      { studentId: "s1", stageId: "NOPE", score: 50 },
      { studentId: "s2", stageId: S1, score: 50 }
    ]);
    expect(r.jsonBody.results.map(x => x.ok ? "ok" : x.error)).toEqual(["not_member", "stage_inactive", "ok"]);
    expect(t.ctx.has(NS.progressName("c1", "x1"))).toBe(false);
    expect(t.progress("s2").stages[S1].score).toBe(50);
  });

  it("an archived class refuses the grid write", async () => {
    const t = setup({ "platform/classes/c1.json": room("c1", { status: "archived", active: false }) });
    expect((await t.grid([{ studentId: "s1", stageId: S1, score: 50 }])).status).toBe(403);
    expect(t.ctx.names(NS.progressPrefix("c1"))).toEqual([]);
  });

  it("another teacher's tenant cannot write the grid of this class", async () => {
    const t = setup({ "platform/classes/c1.json": room("c1", { ownerId: "teacher-9" }) });
    const deps = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1", am: "multi-user" } }), container: t.ctx.container, getContainer: () => t.ctx.container, recordAuditEvent: async () => {}, recordProjectMilestones: async () => {} };
    const r = await tracker({ method: "POST", url: "https://x/api/project-tracker", json: async () => ({ projectCode: CODE, classId: "c1", action: "score.bulk", items: [{ studentId: "s1", stageId: S1, score: 50 }] }) }, deps);
    expect(r.status).toBe(404);
    expect(t.ctx.names(NS.progressPrefix("c1"))).toEqual([]);
  });
});
