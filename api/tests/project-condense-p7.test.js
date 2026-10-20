import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { handler as tracker } from "../src/functions/project-tracker.js";
import { handler as studentTracker } from "../src/functions/student-project-tracker.js";
import { handler as reports } from "../src/functions/reports.js";
import { getProjectDefinition, getStorageNamespace } from "../src/lib/project-tracker/registry.js";
import { buildCondensePlan, condenseEntry, condenseProgressDoc, dropCondensedKeys } from "../src/lib/project-tracker/condense.js";
import { buildProjectPerformanceSummary } from "../src/lib/project-tracker/performance.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase P7 — condensed stages (owner-approved lists for 899373, 883589, 794589). A class that started on the old set is
// converted the first time it is read: its snapshot gets the condensed stages (the teacher's activation / weights
// respected, own stages carried), and every student's progress is carried by the owner's rules — all old stages approved
// → approved with the average score; partly done → «بانتظار الاعتماد» with a note for the teacher; nothing is lost (the
// old entries are archived in the document). Idempotent, locked, audited once; archived classes are never touched.
// Fail-first: run against 69a6705b (the old 28 / 52 / 105 stage sets, no conversion).
const require = createRequire(import.meta.url);
const OLD = code => require("./fixtures/project-templates-pre-p7/" + code + ".json");
const NOW = "2026-10-01T10:00:00.000Z";
const CODE = "899373";
const NS = getStorageNamespace(CODE);
const T = "teacher-1";
const approved = (score, extra = {}) => ({ status: "approved", approvedBy: T, approvedAt: NOW, updatedAt: NOW, ...(score === undefined ? {} : { score }), ...extra });
const user = (id, cid) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: "طالب " + id, code: "C" + id });
const room = (id, extra = {}) => ({ classId: id, name: "صف " + id, grade: "11", schoolYear: "2026", active: true, status: "active", studentIds: [], programCodes: [CODE], createdAt: NOW, updatedAt: NOW, ...extra });
// The class snapshot exactly as the OLD code created it (generic shape, template v1).
function oldSnapshot(code, cid, mutate = s => s) {
  const t = JSON.parse(JSON.stringify(OLD(code)));
  return mutate({ schemaVersion: 1, projectCode: code, classId: cid, templateVersion: t.templateVersion, tracks: getProjectDefinition(code).tracks, trackWeights: t.trackWeights, config: t.config, groups: t.groups, stages: t.stages, createdAt: NOW, updatedAt: NOW });
}
const progress = (sid, cid, stages, extra = {}) => ({ schemaVersion: 1, programCode: CODE, classId: cid, studentId: sid, startedAt: NOW, updatedAt: NOW, stages, history: [], ...extra });

function setup(seed = {}) {
  const ctx = createMemoryContainer({
    "platform/classes/c1.json": room("c1"), "platform/users/s1.json": user("s1", "c1"), "platform/users/s2.json": user("s2", "c1"),
    [NS.configName("c1")]: oldSnapshot(CODE, "c1"),
    ...seed
  });
  const deps = { requireBuilderAuth: () => ({ ok: true, user: { sub: T } }), container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {}, recordProjectMilestones: async () => {} };
  const get = async (resource, cid = "c1", code = CODE) => tracker({ method: "GET", url: "https://x/api/project-tracker?" + new URLSearchParams({ projectCode: code, classId: cid, resource }), json: async () => ({}) }, deps);
  const post = async body => tracker({ method: "POST", url: "https://x/api/project-tracker", json: async () => ({ projectCode: CODE, classId: "c1", ...body }) }, deps);
  const audits = () => ctx.names("platform/audit/").map(n => ctx.getJson(n)).filter(a => String(a.action).startsWith("project.template.condense"));
  // Phase P-9 — reads never write: the conversion is SHOWN by every read (in memory) and persisted by the first write
  // (`activate` = program.activate, the plainest write: it only persists the class snapshot through ensureClassConfig).
  const activate = async (cid = "c1", code = CODE) => tracker({ method: "POST", url: "https://x/api/project-tracker", json: async () => ({ projectCode: code, classId: cid, action: "program.activate" }) }, deps);
  const store = () => JSON.stringify(ctx.names("").sort().map(n => [n, ctx.getJson(n)]));
  return { ctx, deps, get, post, activate, store, audits, snap: (cid = "c1") => ctx.getJson(NS.configName(cid)), doc: (sid, cid = "c1") => ctx.getJson(NS.progressName(cid, sid)) };
}

describe("P7 templates — the owner-approved condensed sets", () => {
  it("899373 → 11, 883589 → 18, 794589 → 20; every old active stage is merged exactly once; weight = merged count", () => {
    for (const [code, n, version] of [["899373", 11, 2], ["883589", 18, 2], ["794589", 20, 3]]) {
      const d = getProjectDefinition(code);
      expect(d.templateVersion).toBe(version);
      expect(d.stages.filter(s => s.active === true)).toHaveLength(n);
      const merged = d.stages.flatMap(s => s.mergedFrom);
      expect(merged.slice().sort()).toEqual(OLD(code).stages.filter(s => s.active === true).map(s => s.stageId).sort());
      expect(new Set(merged).size).toBe(merged.length);
      for (const s of d.stages) { expect(s.weight).toBe(s.mergedFrom.length); expect(s.description.split(" · ")).toHaveLength(s.mergedFrom.length); }
    }
  });
});

describe("P7 conversion rules (pure)", () => {
  const titles = { B01: "صفحة الغلاف", B02: "الفهرست", B03: "المقدمة" };
  it("all approved and scored → approved with the average score, no note", () => {
    expect(condenseEntry(["B01", "B02", "B03"], { B01: approved(90), B02: approved(100), B03: approved(80) }, titles)).toEqual({ status: "approved", score: 90, updatedAt: NOW, approvedAt: NOW, approvedBy: T });
  });
  it("all approved, one unscored → approved WITHOUT a score, and a note shows the scores that existed", () => {
    const e = condenseEntry(["B01", "B02"], { B01: approved(90), B02: approved() }, titles);
    expect(e.status).toBe("approved");
    expect(e.score).toBeUndefined();
    expect(e.note).toBe("تحويل المراحل المختصرة — B01 صفحة الغلاف: معتمدة (90) · B02 الفهرست: معتمدة");
  });
  it("partly done (2 of 3 approved) → «بانتظار الاعتماد» with a note; never an automatic approval", () => {
    const e = condenseEntry(["B01", "B02", "B03"], { B01: approved(90), B02: approved(100) }, titles);
    expect(e.status).toBe("ready_for_review");
    expect(e.score).toBeUndefined();
    expect(e.note).toBe("تحويل المراحل المختصرة — B01 صفحة الغلاف: معتمدة (90) · B02 الفهرست: معتمدة (100) · لم تبدأ: B03");
    expect(e.approvedAt).toBeUndefined();
  });
  it("all ready → ready; ready + not started → in progress; nothing → no entry", () => {
    expect(condenseEntry(["B01", "B02"], { B01: { status: "ready_for_review" }, B02: { status: "ready_for_review" } }, titles).status).toBe("ready_for_review");
    expect(condenseEntry(["B01", "B02"], { B01: { status: "ready_for_review" } }, titles).status).toBe("in_progress");
    expect(condenseEntry(["B01", "B02"], {}, titles)).toBeNull();
  });
  it("the student's own unconfirmed marks stay the student's own on the merged stage; the teacher's notes are carried", () => {
    const self = { status: "approved", approvedBy: "s1", approvedAt: NOW, selfReportedAt: NOW, selfReportedBy: "s1", selfReportedFrom: "not_started" };
    const all = condenseEntry(["B01", "B02"], { B01: self, B02: self }, titles);
    expect(all).toMatchObject({ status: "approved", selfReportedAt: NOW, selfReportedBy: "s1", selfReportedFrom: "not_started" });
    const mixed = condenseEntry(["B01", "B02"], { B01: approved(90, { note: "ممتاز" }), B02: self }, titles);
    expect(mixed).toMatchObject({ status: "approved", selfReportedFrom: "ready_for_review" });
    expect(mixed.note).toContain("B01: ممتاز");
  });

  it("the plan respects the teacher's settings: a deactivated old stage is left out, an all-inactive group is inactive, weights add up", () => {
    const snap = oldSnapshot(CODE, "c1", s => ({ ...s, stages: s.stages.map(x => (x.stageId === "B02" ? { ...x, active: false } : x.stageId === "B01" ? { ...x, weight: 3 } : ["A07"].includes(x.stageId) ? { ...x, active: false } : x)) }));
    const d = getProjectDefinition(CODE);
    const plan = buildCondensePlan(d.stages, d.groups, snap);
    const bk01 = plan.stages.find(s => s.stageId === "BK01");
    expect(plan.map.BK01).toEqual(["B01", "B03"]);
    expect(bk01.weight).toBe(4);
    expect(plan.stages.find(s => s.stageId === "AC03")).toMatchObject({ active: false });
  });

  it("a merged stage is required when ANY of its active old stages is required; optional only when all of them are", () => {
    const snap = oldSnapshot(CODE, "c1", s => ({ ...s, stages: s.stages.map(x => (x.stageId === "B03" || ["B04", "B05", "B06", "B07"].includes(x.stageId) ? { ...x, required: false } : x)) }));
    const d = getProjectDefinition(CODE);
    const plan = buildCondensePlan(d.stages, d.groups, snap);
    expect(plan.stages.find(s => s.stageId === "BK01").required).toBe(true);     // B01, B02 required, B03 optional
    expect(plan.stages.find(s => s.stageId === "BK02").required).toBe(false);    // B04–B07 all optional
  });

  it("a document is converted once: a converted one is returned as it is, and an existing new entry is never overwritten", () => {
    const d = getProjectDefinition(CODE);
    const plan = buildCondensePlan(d.stages, d.groups, oldSnapshot(CODE, "c1"));
    const converted = progress("s1", "c1", { BK01: approved(70), B01: approved(90), B02: approved(90), B03: approved(90) }, { stageTemplateVersion: 2 });
    expect(condenseProgressDoc(converted, plan, 2, 1, NOW)).toBe(converted);
    const mixed = progress("s1", "c1", { BK01: { status: "in_progress", updatedAt: NOW }, B01: approved(90), B02: approved(90), B03: approved(90) });
    const out = condenseProgressDoc(mixed, plan, 2, 1, NOW);
    expect(out.stages.BK01).toEqual({ status: "in_progress", updatedAt: NOW });   // the newer write wins
    expect(out.condensedFrom.stages.B01).toEqual(approved(90));
  });

  it("a teacher's own stage and group are carried; a colliding id makes the class skip conversion", () => {
    const withOwn = oldSnapshot(CODE, "c1", s => ({ ...s, groups: [...s.groups, { groupId: "mine", track: "book", title: "مجموعتي", order: 9 }], stages: [...s.stages, { stageId: "X1", track: "book", groupId: "mine", title: "مرحلتي", order: 99, weight: 2, required: true, active: true }] }));
    const d = getProjectDefinition(CODE);
    const plan = buildCondensePlan(d.stages, d.groups, withOwn);
    expect(plan.stages.find(s => s.stageId === "X1")).toMatchObject({ groupId: "mine", weight: 2 });
    expect(plan.groups.find(g => g.groupId === "mine")).toBeTruthy();
    const clash = oldSnapshot(CODE, "c1", s => ({ ...s, stages: [...s.stages, { stageId: "BK01", track: "book", groupId: "book_g1", title: "x", order: 99, weight: 1, required: true, active: true }] }));
    expect(buildCondensePlan(d.stages, d.groups, clash).skip).toBe("stage-id-collision:BK01");
  });

  it("a fully approved group keeps EXACTLY its project value (grade and progress unchanged)", () => {
    const d = getProjectDefinition(CODE);
    const snap = oldSnapshot(CODE, "c1");
    const old = progress("s1", "c1", { B01: approved(90), B02: approved(100), B03: approved(80), A01: approved(70), A02: approved(70), A03: approved(70), A04: approved(70) });
    const plan = buildCondensePlan(d.stages, d.groups, snap);
    const converted = dropCondensedKeys(condenseProgressDoc(old, plan, 2, 1, NOW), plan, 2);
    const before = buildProjectPerformanceSummary({ ...d, stages: snap.stages, groups: snap.groups }, old, NOW);
    const after = buildProjectPerformanceSummary({ ...d, stages: plan.stages, groups: plan.groups }, converted, NOW);
    expect(after.gradePrecise).toBeCloseTo(before.gradePrecise, 6);
    expect(after.grade).toBe(before.grade);
  });
});

describe("P7 class conversion (real handlers, in-memory storage)", () => {
  it("every read SHOWS the converted class without writing; the first write converts it; old entries are archived; later writes and reads change nothing", async () => {
    const t = setup({
      [NS.progressName("c1", "s1")]: progress("s1", "c1", { B01: approved(90), B02: approved(100), B03: approved(80), B04: approved(95), B05: { status: "in_progress" } }),
      [NS.progressName("c1", "s2")]: progress("s2", "c1", { A08: { status: "ready_for_review", note: "راجع التقرير" } })
    });
    const pristine = t.store();
    const r = await t.get("board");
    expect(r.status).toBe(200);
    expect(r.jsonBody.stages.map(s => s.stageId)).toEqual(getProjectDefinition(CODE).stages.map(s => s.stageId));
    expect(r.jsonBody.students.find(s => s.studentId === "s1").cells.BK01).toEqual({ status: "approved", score: 90 });
    const shown = (await t.get("template")).jsonBody.template;
    await t.get("students"); await t.get("summary"); await t.get("analytics");
    expect(t.store()).toBe(pristine);                                          // P-9: no read writes or audits
    expect(t.audits()).toEqual([]);
    expect((await t.activate()).status).toBe(200);                             // the first write persists the conversion
    const stamps = d => ({ ...d, updatedAt: "", condensedAt: "" });              // the read and the write run at different instants
    expect(stamps(t.snap())).toEqual(stamps(shown));                           // exactly what the reads showed
    expect(t.snap()).toMatchObject({ templateVersion: 2, condensedFromVersion: 1, createdAt: NOW });
    expect(t.snap().conversion).toBeUndefined();
    const s1 = t.doc("s1");
    expect(s1.stages.BK01).toMatchObject({ status: "approved", score: 90 });
    expect(s1.stages.BK02.status).toBe("ready_for_review");                    // B04 approved, B05 in progress, B06–B07 not started
    expect(s1.stages.B01).toBeUndefined();                                     // old keys left `stages`…
    expect(s1.condensedFrom.stages.B01).toMatchObject({ status: "approved", score: 90 });   // …and stay archived
    expect(s1.stageTemplateVersion).toBe(2);
    expect(t.doc("s2").stages.AC04).toMatchObject({ status: "ready_for_review" });
    expect(t.doc("s2").stages.AC04.note).toContain("A08: راجع التقرير");
    expect(t.audits().map(a => a.action)).toEqual(["project.template.condense"]);
    const etag = JSON.stringify([t.snap(), t.doc("s1"), t.doc("s2")]);
    await t.activate(); await t.get("students"); await t.get("board");
    expect(JSON.stringify([t.snap(), t.doc("s1"), t.doc("s2")])).toBe(etag);
    expect(t.audits()).toHaveLength(1);
  });

  it("an archived class is never converted", async () => {
    const t = setup({ "platform/classes/c1.json": room("c1", { status: "archived", active: false }), [NS.progressName("c1", "s1")]: progress("s1", "c1", { B01: approved(90) }) });
    const r = await t.get("board");
    expect(r.jsonBody.stages.some(s => s.stageId === "B01")).toBe(true);
    expect((await t.post({ action: "progress.update", studentId: "s1", stageId: "B01", status: "in_progress" })).status).toBe(403);
    expect(t.snap().templateVersion).toBe(1);
    expect(t.doc("s1").stages.B01).toBeTruthy();
  });

  it("while another request holds a fresh conversion lock, reads show the converted set without writing and writes are refused (retryable)", async () => {
    const t = setup({ [NS.configName("c1")]: oldSnapshot(CODE, "c1", s => ({ ...s, conversion: { toVersion: 2, lockId: "other", startedAt: new Date().toISOString() } })) });
    const before = t.store();
    expect((await t.get("board")).jsonBody.stages.some(s => s.stageId === "BK01")).toBe(true);
    expect(t.store()).toBe(before);
    expect((await t.activate()).jsonBody.template.templateVersion).toBe(1);   // the lock holder converts it, not this write
    expect(t.snap().conversion.lockId).toBe("other");
    const w = await t.post({ action: "progress.update", studentId: "s1", stageId: "B01", status: "approved" });
    expect(w.status).toBe(503);
    expect(t.doc("s1")).toBeNull();
  });

  it("a stale lock (a crashed conversion) is taken over and the conversion completes", async () => {
    const t = setup({ [NS.configName("c1")]: oldSnapshot(CODE, "c1", s => ({ ...s, conversion: { toVersion: 2, lockId: "crashed", startedAt: "2020-01-01T00:00:00.000Z" } })), [NS.progressName("c1", "s1")]: progress("s1", "c1", { B01: approved(90) }) });
    await t.activate();
    expect(t.snap().templateVersion).toBe(2);
    expect(t.doc("s1").stages.BK01.status).toBe("ready_for_review");
  });

  it("a conversion that fails mid-way releases its lock at once (no 2-minute write freeze); the next write completes it", async () => {
    const t = setup({ [NS.progressName("c1", "s1")]: progress("s1", "c1", { B01: approved(90) }), [NS.progressName("c1", "s2")]: progress("s2", "c1", { B02: approved(80) }) });
    const realUpload = t.ctx.container.getBlockBlobClient.bind(t.ctx.container);
    let fail = true;
    t.ctx.container.getBlockBlobClient = name => {
      const client = realUpload(name);
      if (fail && name === NS.progressName("c1", "s2")) return { ...client, upload: async () => { const e = new Error("conflict"); e.statusCode = 412; throw e; } };
      return client;
    };
    const r = await t.activate();
    expect(r.status).toBe(200);                                                // the write is served on the stored (old) set…
    expect(r.jsonBody.template.templateVersion).toBe(1);
    expect(t.snap().templateVersion).toBe(1);
    expect(t.doc("s1").stageTemplateVersion).toBe(2);                          // …s1 already converted refuses old-set writes
    expect((await t.post({ action: "progress.update", studentId: "s1", stageId: "B01", status: "in_progress" })).status).toBe(503);
    expect(t.snap().conversion).toBeUndefined();                               // lock released
    expect((await t.get("board")).jsonBody.stages.some(s => s.stageId === "BK01")).toBe(true);   // reads still show the target
    fail = false;
    await t.activate();
    expect(t.snap().templateVersion).toBe(2);
    expect(t.doc("s1").stages.BK01.status).toBe("ready_for_review");
    expect(t.doc("s2").stages.BK01.status).toBe("ready_for_review");
  });

  it("a progress document that appears while the class converts (a write already past its checks) is converted by the sweep", async () => {
    const t = setup({ [NS.progressName("c1", "s1")]: progress("s1", "c1", { B01: approved(90) }) });
    const real = t.ctx.container.getBlockBlobClient.bind(t.ctx.container);
    let injected = false;
    t.ctx.container.getBlockBlobClient = name => {
      const client = real(name);
      if (name !== NS.configName("c1")) return client;
      return { ...client, upload: async (...args) => {
        const r = await client.upload(...args);
        // Right after the snapshot switch, the late document lands (old keys, never seen by pass 1).
        if (!injected && String(args[0]).includes("\"condensedAt\"")) { injected = true; t.ctx.setJson(NS.progressName("c1", "s2"), progress("s2", "c1", { B01: approved(80), B02: approved(80), B03: approved(80) })); }
        return r;
      } };
    };
    expect((await t.activate()).status).toBe(200);
    expect(injected).toBe(true);
    expect(t.snap().templateVersion).toBe(2);
    expect(t.doc("s2").stageTemplateVersion).toBe(2);
    expect(t.doc("s2").stages.BK01).toMatchObject({ status: "approved", score: 80 });
    expect(t.doc("s2").stages.B01).toBeUndefined();
    expect(t.doc("s2").condensedFrom.stages.B01).toEqual(approved(80));
  });

  it("a write never lands on a document converted to a newer set than the snapshot it was checked against", async () => {
    const t = setup({ [NS.progressName("c1", "s1")]: progress("s1", "c1", {}, { stageTemplateVersion: 2 }), [NS.configName("c1")]: oldSnapshot(CODE, "c1", s => ({ ...s, conversion: { toVersion: 2, lockId: "other", startedAt: "2020-01-01T00:00:00.000Z" }, condenseSkipped: { toVersion: 2, reason: "test", at: NOW } })) });
    const w = await t.post({ action: "progress.update", studentId: "s1", stageId: "B01", status: "approved" });
    expect(w.status).toBe(503);
    expect(t.doc("s1").stages.B01).toBeUndefined();
  });

  it("a class whose own stage id collides with a new id is left exactly as it is, skipped once (audited once)", async () => {
    const clash = oldSnapshot(CODE, "c1", s => ({ ...s, stages: [...s.stages, { stageId: "BK01", track: "book", groupId: "book_g1", title: "مرحلتي", order: 99, weight: 1, required: true, active: true }] }));
    const t = setup({ [NS.configName("c1")]: clash, [NS.progressName("c1", "s1")]: progress("s1", "c1", { B01: approved(90) }) });
    const before = t.store();
    expect((await t.get("board")).jsonBody.stages.filter(s => s.stageId === "BK01")).toHaveLength(1);   // shown as it is
    expect(t.store()).toBe(before);
    await t.activate(); await t.activate();
    expect(t.snap()).toMatchObject({ templateVersion: 1, condenseSkipped: { toVersion: 2, reason: "stage-id-collision:BK01" } });
    expect(t.doc("s1").stages.B01).toBeTruthy();
    expect(t.audits().map(a => a.action)).toEqual(["project.template.condense_skipped"]);
  });

  it("the project reports read the class as the conversion will store it (ready / track / student), and write nothing", async () => {
    const t = setup({ [NS.progressName("c1", "s1")]: progress("s1", "c1", { B01: approved(90), B02: { status: "ready_for_review", updatedAt: NOW }, B04: approved(80), B05: approved(80), B06: approved(80), B07: approved(80) }) });
    const before = t.store();
    const report = async q => (await reports({ method: "GET", url: "https://x/api/reports?" + new URLSearchParams(q), json: async () => ({}) }, t.deps)).jsonBody;
    const ready = await report({ type: "ready", projectCode: CODE, classId: "c1" });
    expect(ready.students.find(s => s.studentId === "s1").stages.map(s => s.stageId)).toEqual(["BK01"]);   // B01 approved + B02 ready
    const track = await report({ type: "track", projectCode: CODE, classId: "c1", track: "book" });
    expect(track.rows.find(r => r.stageId === "BK02")).toMatchObject({ approved: 1 });
    const student = await report({ type: "student", studentId: "s1" });
    expect(student.projects.find(p => p.projectCode === CODE).nextStages.book.stageId).toBe("BK01");
    expect(t.store()).toBe(before);
    expect(t.audits()).toEqual([]);
  });

  it("a skipped class WITHOUT progress is served as it is by reads and writes (never sent down the upgrade path)", async () => {
    const clash = oldSnapshot(CODE, "c1", s => ({ ...s, stages: [...s.stages, { stageId: "BK01", track: "book", groupId: "book_g1", title: "مرحلتي", order: 99, weight: 1, required: true, active: true }] }));
    const t = setup({ [NS.configName("c1")]: clash });
    await t.activate();                                                        // marks it skipped (audited once)
    const skipped = t.snap();
    expect(skipped.condenseSkipped).toBeTruthy();
    expect((await t.get("board")).status).toBe(200);
    expect((await t.activate()).status).toBe(200);
    expect((await t.post({ action: "progress.update", studentId: "s1", stageId: "B01", status: "in_progress" })).status).toBe(200);
    expect(t.snap()).toEqual(skipped);
  });

  it("the student's read SHOWS the converted class without writing; «أنجزتها» then converts it and works on a new stage", async () => {
    const t = setup({ [NS.progressName("c1", "s1")]: progress("s1", "c1", { B01: approved(90), B02: approved(80), B03: approved(70) }) });
    const sdeps = { ...t.deps, requireActiveStudentSession: async () => ({ ok: true, container: t.ctx.container, user: { sub: "s1", sv: 1 }, student: t.ctx.getJson("platform/users/s1.json") }) };
    const before = JSON.stringify([t.snap(), t.doc("s1")]);
    const g = await studentTracker({ method: "GET", url: "https://x/api/student-project-tracker", json: async () => ({}) }, sdeps);
    expect(g.jsonBody.projects[0].stages.map(s => s.stageId)).toContain("BK01");
    expect(g.jsonBody.projects[0].progress.BK01).toMatchObject({ status: "approved", score: 80 });
    expect(JSON.stringify([t.snap(), t.doc("s1")])).toBe(before);                     // a student read never writes
    expect(t.audits()).toEqual([]);
    const mark = async stageIds => studentTracker({ method: "POST", url: "https://x/api/student-project-tracker", json: async () => ({ projectCode: CODE, stageIds, mark: true }) }, sdeps);
    expect((await mark(["BK02"])).jsonBody.results[0]).toMatchObject({ stageId: "BK02", ok: true });
    expect((await mark(["B04"])).jsonBody.results[0]).toMatchObject({ stageId: "B04", ok: false, error: "stage_inactive" });
  });

  it("794589: a v2 class with progress converts to the v3 set; a v1 class with progress restarts from zero (P7b)", async () => {
    const NS7 = getStorageNamespace("794589");
    const v2 = JSON.parse(JSON.stringify(OLD("794589")));
    const legacySnap = { schemaVersion: 1, programCode: "794589", classId: "c7", templateVersion: 2, trackWeights: v2.trackWeights, config: v2.config, groups: v2.groups, stages: v2.stages, createdAt: NOW, updatedAt: NOW };
    const t = setup({
      "platform/classes/c7.json": room("c7", { programCodes: ["794589"] }), "platform/users/p1.json": user("p1", "c7"),
      [NS7.configName("c7")]: legacySnap,
      [NS7.progressName("c7", "p1")]: { schemaVersion: 1, programCode: "794589", classId: "c7", studentId: "p1", startedAt: NOW, updatedAt: NOW, stages: { P51: approved(88) }, history: [] },
      "platform/classes/c8.json": room("c8", { programCodes: ["794589"] }), "platform/users/p2.json": user("p2", "c8"),
      [NS7.configName("c8")]: { ...legacySnap, classId: "c8", templateVersion: 1 },
      [NS7.progressName("c8", "p2")]: { schemaVersion: 1, programCode: "794589", classId: "c8", studentId: "p2", startedAt: NOW, updatedAt: NOW, stages: { B01: approved(88) }, history: [] }
    });
    await t.activate("c7", "794589");
    const s7 = t.ctx.getJson(NS7.configName("c7"));
    expect(s7).toMatchObject({ templateVersion: 3, programCode: "794589" });
    expect("projectCode" in s7).toBe(false);                                   // the legacy snapshot keeps its own shape
    expect(t.ctx.getJson(NS7.progressName("c7", "p1")).stages.PT10).toMatchObject({ status: "approved", score: 88 });
    await t.activate("c8", "794589");
    expect(t.ctx.getJson(NS7.configName("c8")).templateVersion).toBe(3);             // P7b (owner decision): no longer left on v1
    expect(t.ctx.getJson(NS7.progressName("c8", "p2")).stages).toEqual({});
  });
});

// Phase P7b — owner decision: 794589 classes still on template v1 WITH progress restart from zero on the condensed v3 set.
// The old work leaves the document's `stages` / `history` and is deleted (Phase P7c, owner decision: no `resetFrom`
// archive; api/tests/project-reset-archive-p7c.test.js), the snapshot becomes the current template in the legacy shape,
// one `project.template.reset` audit. Same locked passes and
// writer guards as the conversion; archived classes untouched; student reads show the fresh set without writing.
describe("P7b — 794589 v1 classes with progress restart from zero", () => {
  const NS7 = getStorageNamespace("794589");
  const v2 = JSON.parse(JSON.stringify(OLD("794589")));
  const v1Snap = (cid, extra = {}) => ({ schemaVersion: 1, programCode: "794589", classId: cid, templateVersion: 1, trackWeights: v2.trackWeights, config: v2.config, groups: v2.groups, stages: v2.stages, createdAt: NOW, updatedAt: NOW, ...extra });
  const doc7 = (sid, cid, stages, history = []) => ({ schemaVersion: 1, programCode: "794589", classId: cid, studentId: sid, startedAt: NOW, updatedAt: NOW, stages, history });
  const HIST = [{ type: "status", stageId: "B01", to: "approved", at: NOW, by: T }];
  function setup7(roomExtra = {}, snapExtra = {}) {
    const t = setup({
      "platform/classes/c8.json": room("c8", { programCodes: ["794589"], ...roomExtra }), "platform/users/p2.json": user("p2", "c8"), "platform/users/p3.json": user("p3", "c8"),
      [NS7.configName("c8")]: v1Snap("c8", snapExtra),
      [NS7.progressName("c8", "p2")]: doc7("p2", "c8", { B01: approved(88), P01: { status: "ready_for_review", updatedAt: NOW } }, HIST),
      [NS7.progressName("c8", "p3")]: doc7("p3", "c8", {})
    });
    const resets = () => t.ctx.names("platform/audit/").map(n => t.ctx.getJson(n)).filter(a => a.action === "project.template.reset");
    return { ...t, snap7: () => t.ctx.getJson(NS7.configName("c8")), doc7: sid => t.ctx.getJson(NS7.progressName("c8", sid)), resets };
  }

  it("a read SHOWS the reset without writing; the first write resets the class: v3 set (legacy shape), every document from zero, old work deleted, audited once", async () => {
    const t = setup7();
    const pristine = t.store();
    const r = await t.get("board", "c8", "794589");
    expect(r.status).toBe(200);
    expect(r.jsonBody.stages.map(s => s.stageId)).toContain("PT01");
    expect(r.jsonBody.stages.some(s => s.stageId === "B01")).toBe(false);
    expect(t.store()).toBe(pristine);                                          // P-9: the read wrote nothing
    expect((await t.activate("c8", "794589")).status).toBe(200);
    const snap = t.snap7();
    expect(snap).toMatchObject({ templateVersion: 3, programCode: "794589", resetFromVersion: 1 });
    expect("projectCode" in snap).toBe(false);
    expect(snap.conversion).toBeUndefined();
    expect(snap.stages.filter(s => s.active === true)).toHaveLength(20);
    const d = t.doc7("p2");
    expect(d).toMatchObject({ studentId: "p2", classId: "c8", startedAt: NOW, stageTemplateVersion: 3, stages: {}, history: [] });
    expect("resetFrom" in d).toBe(false);                                      // P7c: the old work is deleted, not archived
    expect(t.doc7("p3")).toMatchObject({ stages: {}, stageTemplateVersion: 3 });
    expect(t.resets()).toHaveLength(1);
    expect(t.resets()[0].details).toMatchObject({ projectCode: "794589", fromVersion: 1, toVersion: 3, students: 2 });
    expect(t.audits()).toEqual([]);                                            // a reset is never also recorded as a conversion
    const after = JSON.stringify([t.snap7(), t.doc7("p2"), t.doc7("p3")]);
    await t.activate("c8", "794589"); await t.get("board", "c8", "794589");
    expect(JSON.stringify([t.snap7(), t.doc7("p2"), t.doc7("p3")])).toBe(after);       // a second write or a read changes nothing
    expect(t.resets()).toHaveLength(1);
  });

  it("the reset student counts nothing, before (shown) and after (stored) the reset: no approved stage, no grade, no ready stage", async () => {
    const t = setup7();
    for (const step of ["shown", "stored"]) {
      if (step === "stored") await t.activate("c8", "794589");
      const card = (await t.get("students", "c8", "794589")).jsonBody.students.find(s => s.studentId === "p2");
      expect(card.overallProgress, step).toBe(0);
      expect(card.readyForReviewCount || 0, step).toBe(0);
    }
  });

  it("a v1 class WITHOUT progress keeps the progress-free upgrade (not a reset); an archived v1 class is never touched", async () => {
    const free = setup({ "platform/classes/c8.json": room("c8", { programCodes: ["794589"] }), [NS7.configName("c8")]: v1Snap("c8") });
    await free.activate("c8", "794589");
    expect(free.ctx.getJson(NS7.configName("c8"))).toMatchObject({ templateVersion: 3, upgradedFromVersion: 1 });
    expect(free.ctx.getJson(NS7.configName("c8")).resetFromVersion).toBeUndefined();
    const t = setup7({ status: "archived", active: false });
    const before = JSON.stringify([t.snap7(), t.doc7("p2")]);
    expect((await t.get("board", "c8", "794589")).jsonBody.stages.some(s => s.stageId === "B01")).toBe(true);   // shown as stored
    expect((await t.activate("c8", "794589")).status).toBe(403);
    expect(JSON.stringify([t.snap7(), t.doc7("p2")])).toBe(before);
    expect(t.resets()).toEqual([]);
  });

  it("while another request holds a fresh lock, reads show the reset without writing and writes are refused; a stale lock is taken over", async () => {
    const t = setup7({}, { conversion: { toVersion: 3, lockId: "other", startedAt: new Date().toISOString() } });
    const before = t.store();
    expect((await t.get("board", "c8", "794589")).jsonBody.stages.some(s => s.stageId === "PT01")).toBe(true);
    expect(t.store()).toBe(before);
    expect((await t.post({ projectCode: "794589", classId: "c8", action: "progress.update", studentId: "p2", stageId: "B01", status: "in_progress" })).status).toBe(503);
    expect(t.doc7("p2").stages.B01).toEqual(approved(88));
    const stale = setup7({}, { conversion: { toVersion: 3, lockId: "other", startedAt: "2020-01-01T00:00:00.000Z" } });
    await stale.activate("c8", "794589");
    expect(stale.snap7().templateVersion).toBe(3);
    expect(stale.doc7("p2").stages).toEqual({});
  });

  it("the student's read shows the fresh set and nothing done, without writing; «أنجزتها» resets the class and marks a new stage", async () => {
    const t = setup7();
    const sdeps = { ...t.deps, requireActiveStudentSession: async () => ({ ok: true, container: t.ctx.container, user: { sub: "p2", sv: 1 }, student: t.ctx.getJson("platform/users/p2.json") }) };
    const before = JSON.stringify([t.snap7(), t.doc7("p2"), t.doc7("p3")]);
    const g = await studentTracker({ method: "GET", url: "https://x/api/student-project-tracker", json: async () => ({}) }, sdeps);
    const p = g.jsonBody.projects.find(x => x.projectCode === "794589");
    expect(p.stages.map(s => s.stageId)).toContain("PT01");
    expect(p.stages.some(s => s.stageId === "B01")).toBe(false);
    expect(p.progress).toEqual({});
    expect(JSON.stringify([t.snap7(), t.doc7("p2"), t.doc7("p3")])).toBe(before);     // a student read never writes
    const m = await studentTracker({ method: "POST", url: "https://x/api/student-project-tracker", json: async () => ({ projectCode: "794589", stageIds: ["PT01"], mark: true }) }, sdeps);
    expect(m.jsonBody.results[0]).toMatchObject({ stageId: "PT01", ok: true });
    expect(t.snap7().templateVersion).toBe(3);
    expect(Object.keys(t.doc7("p2").stages)).toEqual(["PT01"]);
    expect("resetFrom" in t.doc7("p2")).toBe(false);                           // P7c: deleted, not archived
    expect(t.resets()).toHaveLength(1);
  });
});
