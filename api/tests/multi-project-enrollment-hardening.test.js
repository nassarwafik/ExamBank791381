import { describe, it, expect } from "vitest";
import { handler as classrooms } from "../src/functions/manage-classrooms.js";
import { handler as legacyTracker } from "../src/functions/project-794589.js";
import { handler as tracker } from "../src/functions/project-tracker.js";
import { handler as studentTracker } from "../src/functions/student-project-tracker.js";
import { handler as reports } from "../src/functions/reports.js";
import { addToRosterIndex } from "../src/lib/class-roster-index.js";
import { getProjectDefinition, getStorageNamespace } from "../src/lib/project-tracker/registry.js";
import { buildClassSnapshotFromDefault } from "../src/lib/project-794589-template.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Multi-project class enrollment — post-merge hardening (audit of current main after PR #50 + R8–R30).
// Real handlers over the in-memory container:
//   A. classroom API: canonical create shape (programCodes[], never a new legacy scalar), legacy read
//      compatibility, add/remove/remove-all, stale scalar dropped, persisted round-trip, [] authoritative,
//      400/403 without mutation, setProgram wrapper, dedupe, removed legacy project never resurrects.
//   B. student tracker: all and only enrolled projects, no duplicates, legacy scalar, [] => not enrolled.
//   C. legacy 794589 route: multi-project gate, progress.update membership parity (foreign/archived →
//      404 and NO ghost blob; login-disabled member OK), resource=student parity.
//   D. reset isolation across the three namespaces (generic and legacy reset).
//   E. reports: class/student sections per enrolled project, per-project ready, non-enrolled → 400.
//   F. projects-summary: per-project independent counts, total = sum, archived class excluded.
//   G. concurrency: setPrograms vs roster-index write, forced ETag conflicts preserve foreign fields.

const NOW = "2026-03-01T00:00:00.000Z";
const AUTH = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
const deps = ctx => ({ ...AUTH, container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {} });
const post = (h, ctx, url, body) => h({ method: "POST", url: "https://x" + url, json: async () => body }, deps(ctx));
const get = (h, ctx, url) => h({ method: "GET", url: "https://x" + url, json: async () => ({}) }, deps(ctx));
const cls = (ctx, b) => post(classrooms, ctx, "/api/classrooms", b);
const listClasses = async ctx => (await get(classrooms, ctx, "/api/classrooms")).jsonBody.classes;
const doc = (ctx, id) => ctx.getJson("platform/classes/" + id + ".json");
const codesOf = (ctx, id) => (doc(ctx, id).programCodes);
const user = (id, cid, extra = {}) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: "طالب " + id, code: "1000000" + id.slice(-2).padStart(2, "0"), ...extra });
const room = (id, extra = {}) => ({ classId: id, name: "صف " + id, active: true, status: "active", studentIds: [], schoolYear: "2026", updatedAt: "2026-01-01T00:00:00.000Z", createdAt: "2026-01-01", ...extra });
const NS = { A: getStorageNamespace("899373"), B: getStorageNamespace("883589"), L: getStorageNamespace("794589") };
const firstStage = code => getProjectDefinition(code).stages.find(s => s.active !== false).stageId;
const legacyStage = () => buildClassSnapshotFromDefault("c1", NOW).stages.find(s => s.active !== false).stageId;
const progress = (code, cid, sid, statuses) => {
  const ids = getProjectDefinition(code).stages.filter(s => s.active !== false).slice(0, statuses.length).map(s => s.stageId);
  return { programCode: code, classId: cid, studentId: sid, stages: Object.fromEntries(ids.map((id, i) => [id, { status: statuses[i], updatedAt: NOW }])), history: [], updatedAt: NOW };
};
function school() {
  const s = { "platform/classes/c1.json": room("c1", { programCodes: ["899373", "883589"], studentIds: ["s1", "s2"] }), "platform/classes/c2.json": room("c2", { programCodes: ["794589"], studentIds: ["s3"] }),
    "platform/users/s1.json": user("s1", "c1"), "platform/users/s2.json": user("s2", "c1", { active: false }), "platform/users/s3.json": user("s3", "c2"), "platform/users/s4.json": user("s4", "c1", { archived: true, active: false }) };
  s[NS.A.progressName("c1", "s1")] = progress("899373", "c1", "s1", ["approved", "ready_for_review"]);
  s[NS.B.progressName("c1", "s1")] = progress("883589", "c1", "s1", ["in_progress"]);
  s[NS.L.progressName("c1", "s1")] = progress("794589", "c1", "s1", ["approved", "approved"]);   // stale 794589 data of a class no longer in 794589
  s[NS.A.configName("c1")] = { ...getProjectDefinition("899373"), classId: "c1", createdAt: NOW, updatedAt: NOW };
  return s;
}

describe("A. classroom API — canonical create shape and multi-project mutations", () => {
  it("A1 create with one project stores programCodes [code], never a legacy scalar; response exposes programCodes", async () => {
    const ctx = createMemoryContainer({});
    const r = await cls(ctx, { action: "create", name: "جديد", grade: "12", schoolYear: "2026", programCode: "899373" });
    expect(r.status).toBe(200); expect(r.jsonBody.classroom.programCodes).toEqual(["899373"]);
    const stored = doc(ctx, r.jsonBody.classroom.classId);
    expect(stored.programCodes).toEqual(["899373"]); expect("programCode" in stored).toBe(false);
    expect((await listClasses(ctx))[0].programCodes).toEqual(["899373"]);
  });
  it("A2 zero-project create stores the canonical empty state programCodes []", async () => {
    const ctx = createMemoryContainer({});
    const r = await cls(ctx, { action: "create", name: "بدون", grade: "", schoolYear: "" });
    const stored = doc(ctx, r.jsonBody.classroom.classId);
    expect(stored.programCodes).toEqual([]); expect("programCode" in stored).toBe(false); expect(r.jsonBody.classroom.programCodes).toEqual([]);
  });
  it("A3 legacy scalar-only documents stay readable through the list (fallback)", async () => {
    const ctx = createMemoryContainer({ "platform/classes/old.json": room("old", { programCode: "794589" }) });
    expect((await listClasses(ctx))[0].programCodes).toEqual(["794589"]);
    expect("programCodes" in doc(ctx, "old")).toBe(false);                        // no migration on read
  });
  it("A4–A7 add a second project, remove one, remove all; the stale scalar is dropped on the first canonical write", async () => {
    const ctx = createMemoryContainer({ "platform/classes/c1.json": room("c1", { programCode: "794589" }) });
    let r = await cls(ctx, { action: "setPrograms", classId: "c1", programCodes: ["794589", "899373"] });
    expect(r.status).toBe(200); expect(codesOf(ctx, "c1")).toEqual(["794589", "899373"]); expect("programCode" in doc(ctx, "c1")).toBe(false);
    r = await cls(ctx, { action: "setPrograms", classId: "c1", programCodes: ["899373"] });
    expect(codesOf(ctx, "c1")).toEqual(["899373"]);
    r = await cls(ctx, { action: "setPrograms", classId: "c1", programCodes: [] });
    expect(r.jsonBody.programCodes).toEqual([]); expect(codesOf(ctx, "c1")).toEqual([]);
  });
  it("A8 persisted round-trip: what setPrograms wrote is exactly what the next GET returns", async () => {
    const ctx = createMemoryContainer({ "platform/classes/c1.json": room("c1") });
    await cls(ctx, { action: "setPrograms", classId: "c1", programCodes: ["883589", "794589"] });
    expect((await listClasses(ctx)).find(c => c.classId === "c1").programCodes).toEqual(["883589", "794589"]);
  });
  it("A9 an explicit programCodes [] stays authoritative over a stale scalar (list + write path)", async () => {
    const ctx = createMemoryContainer({ "platform/classes/c1.json": room("c1", { programCodes: [], programCode: "794589" }) });
    expect((await listClasses(ctx))[0].programCodes).toEqual([]);
  });
  it("A10 unsupported project → 400 and the document is byte-identical", async () => {
    const ctx = createMemoryContainer({ "platform/classes/c1.json": room("c1", { programCodes: ["899373"] }) });
    const before = JSON.stringify(doc(ctx, "c1"));
    const r = await cls(ctx, { action: "setPrograms", classId: "c1", programCodes: ["899373", "nope"] });
    expect(r.status).toBe(400); expect(JSON.stringify(doc(ctx, "c1"))).toBe(before);
  });
  it("A11 archived classroom → 403 and the document is byte-identical", async () => {
    const ctx = createMemoryContainer({ "platform/classes/cA.json": room("cA", { active: false, status: "archived", programCodes: ["899373"] }) });
    const before = JSON.stringify(doc(ctx, "cA"));
    const r = await cls(ctx, { action: "setPrograms", classId: "cA", programCodes: ["883589"] });
    expect(r.status).toBe(403); expect(JSON.stringify(doc(ctx, "cA"))).toBe(before);
  });
  it("A12 setProgram compatibility wrapper writes the canonical array through the same path", async () => {
    const ctx = createMemoryContainer({ "platform/classes/c1.json": room("c1", { programCode: "794589" }) });
    let r = await cls(ctx, { action: "setProgram", classId: "c1", programCode: "899373" });
    expect(r.jsonBody.programCodes).toEqual(["899373"]); expect("programCode" in doc(ctx, "c1")).toBe(false);
    r = await cls(ctx, { action: "setProgram", classId: "c1", programCode: "" });
    expect(codesOf(ctx, "c1")).toEqual([]);
  });
  it("A13 duplicates and whitespace are normalized; nothing stored twice", async () => {
    const ctx = createMemoryContainer({ "platform/classes/c1.json": room("c1") });
    const r = await cls(ctx, { action: "setPrograms", classId: "c1", programCodes: [" 899373", "899373", "883589 ", "883589"] });
    expect(r.jsonBody.programCodes).toEqual(["899373", "883589"]); expect(codesOf(ctx, "c1")).toEqual(["899373", "883589"]);
  });
  it("A14 a removed legacy project never resurrects: list, generic route and legacy route all agree", async () => {
    const ctx = createMemoryContainer({ "platform/classes/c1.json": room("c1", { programCode: "794589" }) });
    await cls(ctx, { action: "setPrograms", classId: "c1", programCodes: ["899373"] });
    expect((await listClasses(ctx))[0].programCodes).toEqual(["899373"]);
    expect((await get(tracker, ctx, "/api/project-tracker?projectCode=794589&resource=classes")).jsonBody.classes).toEqual([]);
    expect((await get(legacyTracker, ctx, "/api/project-794589?resource=summary&classId=c1")).status).toBe(403);
    expect((await get(legacyTracker, ctx, "/api/project-794589?resource=classes")).jsonBody.classes).toEqual([]);
  });
});

describe("B. student tracker — all and only enrolled projects", () => {
  const studentDeps = (ctx, id) => ({ ...deps(ctx), requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: id }, student: ctx.getJson("platform/users/" + id + ".json") }) });
  const load = (ctx, id) => studentTracker({ method: "GET", url: "https://x/api/student-project-tracker", json: async () => ({}) }, studentDeps(ctx, id));
  it("B1 a student of a two-project class gets exactly those two projects, each from its own namespace; stale 794589 data is not returned", async () => {
    const ctx = createMemoryContainer(school());
    const r = await load(ctx, "s1");
    expect(r.status).toBe(200); expect(r.jsonBody.enrolled).toBe(true);
    expect(r.jsonBody.projects.map(p => p.projectCode)).toEqual(["899373", "883589"]);
    const a = r.jsonBody.projects[0], b = r.jsonBody.projects[1];
    expect(a.summary.overallProgress).toBeGreaterThan(0); expect(Object.keys(a.progress)).toHaveLength(2); expect(Object.keys(b.progress)).toHaveLength(1);
    expect(new Set(r.jsonBody.projects.map(p => p.projectCode)).size).toBe(2);
  });
  it("B2 duplicate codes on disk do not produce duplicate projects (raw returned list, first-occurrence order)", async () => {
    const s = school(); s["platform/classes/c1.json"].programCodes = ["899373", "899373", "883589"];
    const r = await load(createMemoryContainer(s), "s1");
    expect(r.jsonBody.projects.map(p => p.projectCode)).toEqual(["899373", "883589"]);
    expect(r.jsonBody.projects).toHaveLength(2);
  });
  it("B3 legacy scalar class → one project; B4 programCodes [] with stale scalar → not enrolled", async () => {
    const s = school(); s["platform/classes/c1.json"] = room("c1", { programCode: "794589" });
    let r = await load(createMemoryContainer(s), "s1"); expect(r.jsonBody.projects.map(p => p.projectCode)).toEqual(["794589"]);
    s["platform/classes/c1.json"] = room("c1", { programCode: "794589", programCodes: [] });
    r = await load(createMemoryContainer(s), "s1"); expect(r.jsonBody).toEqual({ ok: true, enrolled: false, projects: [] });
  });
  it("B5 a student of another class only sees that class's projects (never c1's)", async () => {
    const r = await load(createMemoryContainer(school()), "s3");
    expect(r.jsonBody.projects.map(p => p.projectCode)).toEqual(["794589"]);
  });
});

describe("C. legacy 794589 route — multi-project gate and membership parity", () => {
  const legacy = (ctx, url) => get(legacyTracker, ctx, url);
  const update = (ctx, studentId, stageId) => post(legacyTracker, ctx, "/api/project-794589", { action: "progress.update", classId: "c1", studentId, stageId, status: "in_progress" });
  const seed = () => ({ "platform/classes/c1.json": room("c1", { programCodes: ["794589", "899373"], studentIds: ["s1", "s2"] }), "platform/users/s1.json": user("s1", "c1"), "platform/users/s2.json": user("s2", "c1", { active: false }), "platform/users/s3.json": user("s3", "c2"), "platform/users/s4.json": user("s4", "c1", { archived: true, active: false }), "platform/classes/c2.json": room("c2", { programCodes: ["794589"] }) });
  it("C1 multi-project enrollment keeps the legacy route open; a class without 794589 is refused (403)", async () => {
    const ctx = createMemoryContainer(seed());
    expect((await legacy(ctx, "/api/project-794589?resource=summary&classId=c1")).status).toBe(200);
    ctx.setJson("platform/classes/c1.json", room("c1", { programCodes: ["899373"] }));
    expect((await legacy(ctx, "/api/project-794589?resource=summary&classId=c1")).status).toBe(403);
  });
  it("C2 progress.update rejects a student of another class (404) and creates NO progress blob", async () => {
    const ctx = createMemoryContainer(seed());
    const r = await update(ctx, "s3", legacyStage());
    expect(r.status).toBe(404); expect(ctx.has(NS.L.progressName("c1", "s3"))).toBe(false);
  });
  it("C3 progress.update rejects an ARCHIVED student of the class (404, no blob) and an unknown id", async () => {
    const ctx = createMemoryContainer(seed());
    expect((await update(ctx, "s4", legacyStage())).status).toBe(404); expect(ctx.has(NS.L.progressName("c1", "s4"))).toBe(false);
    expect((await update(ctx, "ghost", legacyStage())).status).toBe(404); expect(ctx.has(NS.L.progressName("c1", "ghost"))).toBe(false);
  });
  it("C4 a login-disabled (active:false) member and an active member succeed, writing ONLY under the legacy namespace", async () => {
    const ctx = createMemoryContainer(seed());
    for (const id of ["s1", "s2"]) {
      const r = await update(ctx, id, legacyStage());
      expect(r.status).toBe(200); expect(r.jsonBody.stage.status).toBe("in_progress");
      expect(ctx.has(NS.L.progressName("c1", id))).toBe(true); expect(ctx.has(NS.A.progressName("c1", id))).toBe(false); expect(ctx.has(NS.B.progressName("c1", id))).toBe(false);
    }
  });
  it("C5 resource=student uses the canonical membership rule: disabled member belongs, archived does not, foreign does not", async () => {
    const ctx = createMemoryContainer(seed());
    const st = async id => (await legacy(ctx, "/api/project-794589?resource=student&classId=c1&studentId=" + id)).jsonBody.student;
    expect((await st("s2")).displayName).toBe("طالب s2");
    expect(await st("s4")).toEqual({ studentId: "s4", displayName: "", code: "" });
    expect(await st("s3")).toEqual({ studentId: "s3", displayName: "", code: "" });
  });
  it("C6 the generic route enforces the same membership rule for progress.update (parity check)", async () => {
    const ctx = createMemoryContainer(seed());
    const r = await post(tracker, ctx, "/api/project-tracker", { projectCode: "899373", action: "progress.update", classId: "c1", studentId: "s4", stageId: firstStage("899373"), status: "in_progress" });
    expect(r.status).toBe(404); expect(ctx.has(NS.A.progressName("c1", "s4"))).toBe(false);
  });
});

describe("D. reset isolation across namespaces", () => {
  it("D1 generic reset of 899373 deletes only 899373 blobs; 883589 and legacy 794589 data of the same class survive", async () => {
    const s = school(); s["platform/classes/c1.json"].programCodes = ["899373", "883589", "794589"]; s[NS.B.configName("c1")] = { ...getProjectDefinition("883589"), classId: "c1" }; s[NS.L.configName("c1")] = buildClassSnapshotFromDefault("c1", NOW);
    const ctx = createMemoryContainer(s);
    const r = await post(tracker, ctx, "/api/project-tracker", { projectCode: "899373", action: "project.reset", classId: "c1" });
    expect(r.status).toBe(200); expect(r.jsonBody.deletedProgressCount).toBe(1);
    expect(ctx.has(NS.A.progressName("c1", "s1"))).toBe(false); expect(ctx.has(NS.A.configName("c1"))).toBe(false);
    expect(ctx.has(NS.B.progressName("c1", "s1"))).toBe(true); expect(ctx.has(NS.B.configName("c1"))).toBe(true);
    expect(ctx.has(NS.L.progressName("c1", "s1"))).toBe(true); expect(ctx.has(NS.L.configName("c1"))).toBe(true);
    expect(ctx.has("platform/classes/c1.json")).toBe(true); expect(ctx.has("platform/users/s1.json")).toBe(true);
  });
  it("D2 legacy 794589 reset deletes only the legacy namespace; 899373 and 883589 data survive", async () => {
    const s = school(); s["platform/classes/c1.json"].programCodes = ["899373", "883589", "794589"]; s[NS.L.configName("c1")] = buildClassSnapshotFromDefault("c1", NOW);
    const ctx = createMemoryContainer(s);
    const r = await post(legacyTracker, ctx, "/api/project-794589", { action: "project.reset", classId: "c1" });
    expect(r.status).toBe(200); expect(r.jsonBody.deletedProgressCount).toBe(1);
    expect(ctx.has(NS.L.progressName("c1", "s1"))).toBe(false); expect(ctx.has(NS.L.configName("c1"))).toBe(false);
    expect(ctx.has(NS.A.progressName("c1", "s1"))).toBe(true); expect(ctx.has(NS.A.configName("c1"))).toBe(true); expect(ctx.has(NS.B.progressName("c1", "s1"))).toBe(true);
  });
});

describe("E. reports — one independent section per enrolled project", () => {
  const rep = (ctx, q) => get(reports, ctx, "/api/reports?" + q);
  it("E1 class report lists the two enrolled projects with independent averages; stale 794589 data is excluded", async () => {
    const r = await rep(createMemoryContainer(school()), "type=class&classId=c1");
    expect(r.status).toBe(200);
    expect(r.jsonBody.projects.map(p => p.projectCode)).toEqual(["899373", "883589"]);
    expect(r.jsonBody.projects[0].avgOverall).toBeGreaterThan(r.jsonBody.projects[1].avgOverall);
  });
  it("E2 student report has one section per enrolled project, each from its own namespace", async () => {
    const r = await rep(createMemoryContainer(school()), "type=student&studentId=s1");
    expect(r.jsonBody.projects.map(p => [p.projectCode, p.summary.overallProgress > 0])).toEqual([["899373", true], ["883589", false]]);
  });
  it("E3 ready report is per project: 899373 has s1's ready stage, 883589 has none", async () => {
    const ctx = createMemoryContainer(school());
    expect((await rep(ctx, "type=ready&projectCode=899373&classId=c1")).jsonBody.totalReady).toBe(1);
    expect((await rep(ctx, "type=ready&projectCode=883589&classId=c1")).jsonBody.totalReady).toBe(0);
  });
  it("E4 a project report for a project the class is not enrolled in → 400", async () => {
    const r = await rep(createMemoryContainer(school()), "type=project&projectCode=794589&classId=c1");
    expect(r.status).toBe(400);
  });
});

describe("F. projects-summary — per-project readiness of a multi-project class", () => {
  it("F1 byProject is independent per project, total is their sum, archived classes and non-members are excluded", async () => {
    const s = school();
    s[NS.B.progressName("c1", "s2")] = progress("883589", "c1", "s2", ["ready_for_review", "ready_for_review"]); // disabled member: counts
    s[NS.B.progressName("c1", "s4")] = progress("883589", "c1", "s4", ["ready_for_review"]);                     // archived: never counts
    s["platform/classes/c3.json"] = room("c3", { active: false, status: "archived", programCodes: ["899373"] });
    s["platform/users/s9.json"] = user("s9", "c3"); s[NS.A.progressName("c3", "s9")] = progress("899373", "c3", "s9", ["ready_for_review"]);
    const r = await get(tracker, createMemoryContainer(s), "/api/project-tracker?resource=projects-summary");
    expect(r.status).toBe(200);
    expect(r.jsonBody.byProject).toEqual({ "794589": 0, "899373": 1, "883589": 2 });
    expect(r.jsonBody.totalReadyForReview).toBe(3);
  });
});

describe("G. concurrency — setPrograms is CAS-protected and never clobbers unrelated fields", () => {
  it("G1 setPrograms concurrent with a roster-index membership write: both land", async () => {
    const ctx = createMemoryContainer({ "platform/classes/c1.json": room("c1", { programCodes: ["794589"] }) });
    const [a, b] = await Promise.all([cls(ctx, { action: "setPrograms", classId: "c1", programCodes: ["794589", "899373"] }), addToRosterIndex(ctx.container, "c1", ["s9"], { operation: "create" })]);
    expect(a.status).toBe(200); expect(b.synced).toBe(true);
    expect(codesOf(ctx, "c1")).toEqual(["794589", "899373"]); expect(doc(ctx, "c1").studentIds).toEqual(["s9"]);
  });
  it("G2 forced ETag conflicts are retried and the foreign writes made in between are preserved", async () => {
    let n = 0;
    const ctx = createMemoryContainer({ "platform/classes/c1.json": room("c1", { programCodes: [], studentIds: [] }) }, { beforeConditionalUpload: (name, api) => { if (name === "platform/classes/c1.json" && n < 2) { n++; const d = api.getJson(name); d.studentIds = [...d.studentIds, "x" + n]; d.name = "renamed"; api.setJson(name, d); } } });
    const r = await cls(ctx, { action: "setPrograms", classId: "c1", programCodes: ["883589"] });
    expect(r.status).toBe(200); expect(n).toBe(2);
    expect(doc(ctx, "c1")).toMatchObject({ programCodes: ["883589"], studentIds: ["x1", "x2"], name: "renamed" });
  });
});
