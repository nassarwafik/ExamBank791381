import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { handler as tracker } from "../src/functions/project-tracker.js";
import { handler as studentTracker } from "../src/functions/student-project-tracker.js";
import { getStorageNamespace } from "../src/lib/project-tracker/registry.js";
import { resetProgressDoc } from "../src/lib/project-tracker/condense.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase P7c — owner decision: the work done on template v1 by the 794589 classes that P7b restarted from zero is DELETED,
// not archived. A new reset keeps nothing of the old work (no `resetFrom`); a class reset earlier loses its `resetFrom`
// archives on its first write (reads never write, P-9): every progress document of the class, once, audited once
// (`project.template.reset_archive_deleted`). The work done since the reset, the class snapshot and the student's identity
// are untouched. Fail-first: run against 47aca61c (P7b keeps `resetFrom`).
const require = createRequire(import.meta.url);
const V2 = require("./fixtures/project-templates-pre-p7/794589.json");
const CODE = "794589";
const NS = getStorageNamespace(CODE);
const NOW = "2026-10-01T10:00:00.000Z";
const RESET_AT = "2026-10-19T08:00:00.000Z";
const T = "teacher-1";
const approved = score => ({ status: "approved", approvedBy: T, approvedAt: NOW, updatedAt: NOW, score });
const user = (id, cid) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: "طالب " + id, code: "C" + id });
const room = (id, extra = {}) => ({ classId: id, name: "صف " + id, grade: "11", schoolYear: "2026", active: true, status: "active", studentIds: [], programCodes: [CODE], createdAt: NOW, updatedAt: NOW, ...extra });
const doc = (sid, stages, extra = {}) => ({ schemaVersion: 1, programCode: CODE, classId: "c8", studentId: sid, startedAt: NOW, updatedAt: NOW, stages, history: [], ...extra });
const OLD_WORK = { B01: approved(88), P01: { status: "ready_for_review", updatedAt: NOW } };
const OLD_HIST = [{ type: "status", stageId: "B01", to: "approved", at: NOW, by: T }];
const v1Snap = () => ({ schemaVersion: 1, programCode: CODE, classId: "c8", templateVersion: 1, trackWeights: V2.trackWeights, config: V2.config, groups: V2.groups, stages: V2.stages, createdAt: NOW, updatedAt: NOW });

function setup(seed) {
  const ctx = createMemoryContainer({
    "platform/classes/c8.json": room("c8"), "platform/users/p2.json": user("p2", "c8"), "platform/users/p3.json": user("p3", "c8"),
    ...seed
  });
  const deps = { requireBuilderAuth: () => ({ ok: true, user: { sub: T } }), container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {}, recordProjectMilestones: async () => {} };
  const get = resource => tracker({ method: "GET", url: "https://x/api/project-tracker?" + new URLSearchParams({ projectCode: CODE, classId: "c8", resource }), json: async () => ({}) }, deps);
  const post = body => tracker({ method: "POST", url: "https://x/api/project-tracker", json: async () => ({ projectCode: CODE, classId: "c8", ...body }) }, deps);
  const activate = () => post({ action: "program.activate" });
  const store = () => JSON.stringify(ctx.names("").sort().map(n => [n, ctx.getJson(n)]));
  const auditsOf = action => ctx.names("platform/audit/").map(n => ctx.getJson(n)).filter(a => a.action === action);
  const progressDocs = () => ctx.names(NS.progressPrefix("c8")).map(n => ctx.getJson(n));
  return { ctx, deps, get, post, activate, store, auditsOf, progressDocs, snap: () => ctx.getJson(NS.configName("c8")), doc: sid => ctx.getJson(NS.progressName("c8", sid)) };
}

// A class P7b already reset (before P7c): the v3 legacy snapshot with resetAt / resetFromVersion, each document from zero
// with the old work archived in `resetFrom`; p2 has done PT01 since the reset.
async function resetEarlier() {
  const t = setup({ [NS.configName("c8")]: v1Snap(), [NS.progressName("c8", "p2")]: doc("p2", OLD_WORK, { history: OLD_HIST }), [NS.progressName("c8", "p3")]: doc("p3", {}) });
  const snap = (await t.get("template")).jsonBody.template;                      // the snapshot the reset stores
  expect(snap).toMatchObject({ templateVersion: 3, resetFromVersion: 1 });
  const archived = (sid, stages, history) => ({ ...doc(sid, stages), updatedAt: RESET_AT, stageTemplateVersion: 3, resetFrom: { templateVersion: 1, at: RESET_AT, stages: sid === "p2" ? OLD_WORK : {}, history: sid === "p2" ? OLD_HIST : [] }, history });
  const { resetArchiveDeletedAt, ...earlier } = { ...snap, resetAt: RESET_AT, updatedAt: RESET_AT };   // eslint-disable-line no-unused-vars
  const PT01 = { status: "in_progress", updatedAt: RESET_AT };
  return setup({
    [NS.configName("c8")]: earlier,
    [NS.progressName("c8", "p2")]: archived("p2", { PT01 }, [{ type: "status", stageId: "PT01", to: "in_progress", at: RESET_AT, by: T }]),
    [NS.progressName("c8", "p3")]: archived("p3", {}, []),
    [NS.progressName("c8", "gone")]: archived("gone", {}, []),                    // a document of a student who left the class
    [NS.progressName("c8", "new")]: { ...doc("new", {}), stageTemplateVersion: 3 }  // started after the reset: no archive
  });
}
const hasOldWork = d => /"B01"|"P01"/.test(JSON.stringify(d));

describe("P7c — a new reset keeps nothing of the old work", () => {
  it("the pure reset: stages and history from zero, no archive, identity kept; a document already reset loses its archive", () => {
    const d = resetProgressDoc(doc("p2", OLD_WORK, { history: OLD_HIST }), 3, 1, RESET_AT);
    expect(d).toEqual({ ...doc("p2", {}), updatedAt: RESET_AT, stageTemplateVersion: 3 });
    expect(resetProgressDoc(d, 3, 1, "2026-10-20T00:00:00.000Z")).toBe(d);       // idempotent: nothing to change, same object
    const old = { ...d, resetFrom: { templateVersion: 1, at: RESET_AT, stages: OLD_WORK, history: OLD_HIST } };
    expect(resetProgressDoc(old, 3, 1, "2026-10-20T00:00:00.000Z")).toEqual(d);
  });

  it("the first write resets the class from zero and stores no trace of the v1 work; the snapshot says the archive is gone", async () => {
    const t = setup({ [NS.configName("c8")]: v1Snap(), [NS.progressName("c8", "p2")]: doc("p2", OLD_WORK, { history: OLD_HIST }), [NS.progressName("c8", "p3")]: doc("p3", {}) });
    expect((await t.activate()).status).toBe(200);
    expect(t.snap()).toMatchObject({ templateVersion: 3, resetFromVersion: 1, resetArchiveDeletedAt: t.snap().resetAt });
    for (const d of t.progressDocs()) {
      expect(d).toMatchObject({ stages: {}, history: [], stageTemplateVersion: 3, startedAt: NOW });
      expect("resetFrom" in d).toBe(false);
      expect(hasOldWork(d)).toBe(false);
    }
    expect(t.auditsOf("project.template.reset")).toHaveLength(1);
    expect(t.auditsOf("project.template.reset")[0].details).toMatchObject({ fromVersion: 1, toVersion: 3, students: 2, archive: "deleted" });
    expect(t.auditsOf("project.template.reset_archive_deleted")).toEqual([]);   // nothing was ever archived
    const state = () => JSON.stringify([t.snap(), t.progressDocs()]);
    const after = state();
    await t.activate();
    expect(state()).toBe(after);                                                  // a second write changes nothing
    expect(t.auditsOf("project.template.reset")).toHaveLength(1);
  });
});

describe("P7c — the archives of a class reset earlier are deleted on its first write", () => {
  it("reads show the same and write nothing; the first write deletes every archive once, keeps the new work, audits once", async () => {
    const t = await resetEarlier();
    const pristine = t.store();
    const before = (await t.get("students")).jsonBody;
    expect(t.store()).toBe(pristine);                                             // P-9: a read never writes
    expect((await t.activate()).status).toBe(200);
    for (const d of t.progressDocs()) { expect("resetFrom" in d).toBe(false); expect(hasOldWork(d)).toBe(false); }
    expect(t.doc("new")).toEqual({ ...doc("new", {}), stageTemplateVersion: 3 });  // a document without an archive is left as it is
    expect(t.doc("p2")).toMatchObject({ studentId: "p2", startedAt: NOW, stageTemplateVersion: 3, stages: { PT01: { status: "in_progress" } } });
    expect(t.doc("p2").history).toHaveLength(1);                                  // the work since the reset is untouched
    expect(t.snap().resetArchiveDeletedAt).toEqual(expect.any(String));
    expect(t.snap()).toMatchObject({ templateVersion: 3, resetAt: RESET_AT, resetFromVersion: 1 });
    const audits = t.auditsOf("project.template.reset_archive_deleted");
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actor: "system", targetId: "c8", details: { projectCode: CODE, fromVersion: 1, documents: 3, reason: "owner-decision-delete-old-work" } });
    expect(JSON.stringify(audits[0])).not.toMatch(/"B01"|"P01"/);                // the audit names counts, never the deleted work
    expect((await t.get("students")).jsonBody.students).toEqual(before.students);  // nothing shown or counted changed
    const after = t.store();
    const listed = [];
    const realList = t.ctx.container.listBlobsFlat.bind(t.ctx.container);
    t.ctx.container.listBlobsFlat = (o = {}) => { listed.push(o.prefix); return realList(o); };
    await t.activate();
    expect(listed).not.toContain(NS.progressPrefix("c8"));                        // done once: a later write never scans the documents again…
    await t.get("board");
    expect(t.store()).toBe(after);                                                // …and a later write or read changes nothing
    expect(t.auditsOf("project.template.reset_archive_deleted")).toHaveLength(1);
  });

  it("a progress write (the teacher's score / status) deletes the class's archives before it lands", async () => {
    const t = await resetEarlier();
    const r = await t.post({ action: "progress.update", studentId: "p3", stageId: "PT01", status: "in_progress" });
    expect(r.status).toBe(200);
    expect(t.doc("p3").stages.PT01.status).toBe("in_progress");
    for (const d of t.progressDocs()) expect("resetFrom" in d).toBe(false);
    expect(t.auditsOf("project.template.reset_archive_deleted")).toHaveLength(1);
  });

  it("the student's «أنجزتها» deletes them too; the student's read never does", async () => {
    const t = await resetEarlier();
    const sdeps = { ...t.deps, requireActiveStudentSession: async () => ({ ok: true, container: t.ctx.container, user: { sub: "p3", sv: 1 }, student: t.ctx.getJson("platform/users/p3.json") }) };
    const pristine = t.store();
    await studentTracker({ method: "GET", url: "https://x/api/student-project-tracker", json: async () => ({}) }, sdeps);
    expect(t.store()).toBe(pristine);
    const m = await studentTracker({ method: "POST", url: "https://x/api/student-project-tracker", json: async () => ({ projectCode: CODE, stageIds: ["PT01"], mark: true }) }, sdeps);
    expect(m.jsonBody.results[0]).toMatchObject({ stageId: "PT01", ok: true });
    for (const d of t.progressDocs()) expect("resetFrom" in d).toBe(false);
    expect(t.auditsOf("project.template.reset_archive_deleted")).toHaveLength(1);
  });

  it("a deletion that fails part-way never fails the write and is not marked done; the next write completes it", async () => {
    const t = await resetEarlier();
    const real = t.ctx.container.getBlockBlobClient.bind(t.ctx.container);
    let fail = true;
    t.ctx.container.getBlockBlobClient = name => {
      const client = real(name);
      if (fail && name === NS.progressName("c8", "p3")) return { ...client, upload: async () => { const e = new Error("conflict"); e.statusCode = 412; throw e; } };
      return client;
    };
    const r = await t.activate();
    expect(r.status).toBe(200);
    expect(t.snap().resetArchiveDeletedAt).toBeUndefined();
    expect("resetFrom" in t.doc("p3")).toBe(true);
    expect(t.auditsOf("project.template.reset_archive_deleted")).toEqual([]);
    fail = false;
    await t.activate();
    for (const d of t.progressDocs()) expect("resetFrom" in d).toBe(false);
    expect(t.snap().resetArchiveDeletedAt).toEqual(expect.any(String));
    expect(t.auditsOf("project.template.reset_archive_deleted")).toHaveLength(1);
  });

  it("an archived class is never touched (pin: no write reaches it)", async () => {
    const t = await resetEarlier();
    t.ctx.setJson("platform/classes/c8.json", room("c8", { status: "archived", active: false }));
    const before = t.store();
    expect((await t.activate()).status).toBe(403);
    expect(t.store()).toBe(before);
  });
});
