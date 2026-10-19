import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Phase P-9 — Projects clean-up.
//   A. The two legacy routes are gone: /api/project-794589 (teacher) and /api/student-project (student). Every caller
//      already uses /api/project-tracker?projectCode=794589 and /api/student-project-tracker.
//   B. A teacher READ never writes: every GET of /api/project-tracker answers from storage as it is. A class without a
//      snapshot is answered with the in-memory first-create document; a V1 794589 class that qualifies for the upgrade is
//      answered with the in-memory upgraded document. Neither is persisted or audited by the read. The first WRITE
//      (activate, progress, self-report, template) persists exactly that document, as before.
//      The reports route (GET only) reads project snapshots the same way.
//   C. template.update applies the pending upgrade before the teacher's patch, so the patch is never overwritten by a
//      later upgrade (it used to rely on an earlier GET having persisted the upgrade).
// Fail-first: run against ff8f0712 (both routes present; GET lazily created / upgraded the snapshot and audited it;
// a template.update on a V1 class without a prior GET was lost at the next write).
const require = createRequire(import.meta.url);
const API = fileURLToPath(new URL("../", import.meta.url));
const ROOT = path.join(API, "..");
const F = require("./fixtures/r33-fixtures.js");
const { createMemoryContainer } = require("./fixtures/memory-container.js");
const registry = require("../src/lib/project-tracker/registry.js");
const service = require("../src/lib/project-tracker/service.js");
const template = require("../src/lib/project-794589-template.js");
const { handler: tracker } = require("../src/functions/project-tracker.js");
const { handler: studentTracker } = require("../src/functions/student-project-tracker.js");
const { handler: reports } = require("../src/functions/reports.js");

const NS = registry.getStorageNamespace("794589");
const NOW = F.FIXED_NOW;

function school() {
  const ctx = createMemoryContainer(F.seedSchool({ registry, service, template }));
  const audits = [];
  const deps = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async (_c, ev) => { audits.push(ev); }, recordProjectMilestones: async () => {} };
  const qs = p => Object.entries(p).map(([k, v]) => k + "=" + encodeURIComponent(v)).join("&");
  const get = p => tracker({ method: "GET", url: "https://x/api/project-tracker?" + qs({ projectCode: "794589", ...p }), json: async () => ({}) }, deps);
  const post = b => tracker({ method: "POST", url: "https://x/api/project-tracker", json: async () => ({ projectCode: "794589", ...b }) }, deps);
  const store = () => Object.fromEntries(ctx.names().map(n => [n, JSON.stringify(ctx.getJson(n))]));
  return { ctx, audits, get, post, store, deps };
}

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"], now: new Date(NOW) }); });
afterEach(() => { vi.useRealTimers(); });

describe("P-9 A — the legacy routes are gone", () => {
  it("no handler file and no registered route for /api/project-794589 or /api/student-project", () => {
    expect(existsSync(path.join(API, "src/functions/project-794589.js"))).toBe(false);
    expect(existsSync(path.join(API, "src/functions/student-project.js"))).toBe(false);
    for (const f of readdirSync(path.join(API, "src/functions")).filter(n => n.endsWith(".js"))) {
      const src = readFileSync(path.join(API, "src/functions", f), "utf8");
      expect(src, f).not.toMatch(/route:\s*"(project-794589|student-project)"/);
    }
  });
  it("the web app calls neither route (pin: it already used the generic routes)", () => {
    const files = [];
    const walk = d => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) files.push(p); } };
    walk(path.join(ROOT, "src"));
    expect(files.length).toBeGreaterThan(100);
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(/\/api\/(project-794589|student-project)(?![-\w])/);
  });
});

describe("P-9 B — a teacher read never writes", () => {
  const READS = [
    { resource: "template" }, { resource: "student", studentId: "s5" }, { resource: "evaluation", studentId: "s5" },
    { resource: "summary" }, { resource: "students" }, { resource: "analytics" }, { resource: "board" }
  ];
  it("a class without a snapshot: every GET answers 200, stores nothing, audits nothing", async () => {
    for (const p of READS) {
      const t = school();
      const before = t.store();
      const r = await t.get({ classId: "c2", ...p });
      expect(r.status, p.resource).toBe(200);
      expect(t.store(), p.resource).toEqual(before);
      expect(t.audits, p.resource).toEqual([]);
    }
  });
  it("the template a read shows for a class without a snapshot is exactly the one the first write persists", async () => {
    const t = school();
    const shown = (await t.get({ resource: "template", classId: "c2" })).jsonBody.template;
    expect(t.ctx.has(NS.configName("c2"))).toBe(false);
    expect((await t.post({ action: "progress.update", classId: "c2", studentId: "s5", stageId: "BK01", status: "in_progress" })).status).toBe(200);   // Phase P7: condensed ids
    expect(t.ctx.getJson(NS.configName("c2"))).toEqual(shown);
  });
  it("a V1 class that qualifies for the upgrade: the read shows the upgraded template without writing or auditing it", async () => {
    const t = school();
    const before = t.store();
    const r = await t.get({ resource: "template", classId: "c3" });
    expect(r.jsonBody.template.templateVersion).toBe(template.TEMPLATE_VERSION);
    expect(r.jsonBody.template.upgradedFromVersion).toBe(1);
    expect(t.store()).toEqual(before);
    expect(t.ctx.names(F.AUDIT)).toEqual([]);
    // the first write persists that very document and records the upgrade once
    expect((await t.post({ action: "program.activate", classId: "c3" })).status).toBe(200);
    expect(t.ctx.getJson(NS.configName("c3"))).toEqual(r.jsonBody.template);
    expect(t.ctx.names(F.AUDIT).map(n => t.ctx.getJson(n).action)).toEqual(["project.template.upgrade"]);
  });
  // Phase P7b (owner decision): a V1 class WITH progress now restarts from zero on the condensed set — the read SHOWS it
  // (in memory) and still writes nothing; an archived class is shown as stored.
  it("a V1 class WITH progress is shown restarted from zero (P7b) and an archived class as stored; neither read writes", async () => {
    const t = school();
    const before = t.store();
    expect((await t.get({ resource: "template", classId: "c4" })).jsonBody.template).toMatchObject({ templateVersion: 3, resetFromVersion: 1 });
    expect((await t.get({ resource: "template", classId: "cA" })).jsonBody.template.templateVersion).toBe(1);
    expect(t.store()).toEqual(before);
  });
  it("an ARCHIVED V1 class without progress is never upgraded, not even in memory (pin, added after mutant R8b survived)", async () => {
    const t = school();
    t.ctx.setJson(F.CP + "c3.json", { ...t.ctx.getJson(F.CP + "c3.json"), active: false, status: "archived", archivedAt: "2026-06-01T00:00:00.000Z" });
    const before = t.store();
    const r = await t.get({ resource: "template", classId: "c3" });
    expect(r.jsonBody.readOnly).toBe(true);
    expect(r.jsonBody.template.templateVersion).toBe(1);
    expect(t.store()).toEqual(before);
  });
  it("the student read of the same class shows the same stages as the teacher read and writes nothing", async () => {
    const t = school();
    const before = t.store();
    const teacher = (await t.get({ resource: "template", classId: "c2" })).jsonBody.template;
    const s = await studentTracker({ method: "GET", url: "https://x/api/student-project-tracker", json: async () => ({}) }, { requireActiveStudentSession: async () => ({ ok: true, user: { sub: "s5" }, student: t.ctx.getJson(F.UP + "s5.json"), container: t.ctx.container }) });
    expect(s.jsonBody.projects.find(p => p.projectCode === "794589").stages).toEqual(teacher.stages);
    expect(t.store()).toEqual(before);
  });
});

describe("P-9 B — the reports route never writes a project snapshot", () => {
  const rep = (t, q) => reports({ method: "GET", url: "https://x/api/reports?" + q, json: async () => ({}) }, t.deps);
  it("class, student and every project report on a class without a snapshot / waiting for its upgrade: 200, nothing stored, nothing audited", async () => {
    const queries = ["type=class&classId=c2", "type=student&studentId=s5", "type=class&classId=c3", "type=student&studentId=s6"];
    for (const type of ["project", "track", "ready", "delayed", "timeline"]) for (const c of ["c2", "c3"]) queries.push("type=" + type + "&projectCode=794589&classId=" + c + "&track=book");
    for (const q of queries) {
      const t = school();
      const before = t.store();
      const r = await rep(t, q);
      expect(r.status, q).toBe(200);
      expect(t.store(), q).toEqual(before);
    }
  });
  it("the report shows the same stages as the teacher read", async () => {
    const t = school();
    const shown = (await t.get({ resource: "template", classId: "c3" })).jsonBody.template;
    const r = await rep(t, "type=student&studentId=s6");
    const project = r.jsonBody.projects.find(p => p.projectCode === "794589");
    expect(project.nextStages.book.stageId).toBe(shown.stages.filter(s => s.track === "book" && s.active).sort((a, b) => a.order - b.order)[0].stageId);
  });
});

describe("P-9 C — template.update on a class still waiting for its upgrade", () => {
  it("the upgrade is applied first and the teacher's patch survives the next write", async () => {
    const t = school();
    const r = await t.post({ action: "template.update", classId: "c3", template: { config: { staleDays: 11 } } });
    expect(r.status).toBe(200);
    expect(r.jsonBody.template.templateVersion).toBe(template.TEMPLATE_VERSION);
    expect(r.jsonBody.template.config.staleDays).toBe(11);
    expect((await t.post({ action: "progress.update", classId: "c3", studentId: "s6", stageId: r.jsonBody.template.stages.find(s => s.active).stageId, status: "in_progress" })).status).toBe(200);
    const stored = t.ctx.getJson(NS.configName("c3"));
    expect(stored.templateVersion).toBe(template.TEMPLATE_VERSION);
    expect(stored.config.staleDays).toBe(11);
    expect(t.ctx.names(F.AUDIT).map(n => t.ctx.getJson(n).action)).toEqual(["project.template.upgrade"]);
  });
});
