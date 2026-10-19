import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { handler as tracker } from "../src/functions/project-tracker.js";
import { handler as studentTracker } from "../src/functions/student-project-tracker.js";
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
  return { ctx, deps, get, post, audits, snap: (cid = "c1") => ctx.getJson(NS.configName(cid)), doc: (sid, cid = "c1") => ctx.getJson(NS.progressName(cid, sid)) };
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
  it("the first read converts the class and its progress; old entries are archived; a second read changes nothing", async () => {
    const t = setup({
      [NS.progressName("c1", "s1")]: progress("s1", "c1", { B01: approved(90), B02: approved(100), B03: approved(80), B04: approved(95), B05: { status: "in_progress" } }),
      [NS.progressName("c1", "s2")]: progress("s2", "c1", { A08: { status: "ready_for_review", note: "راجع التقرير" } })
    });
    const r = await t.get("board");
    expect(r.status).toBe(200);
    expect(r.jsonBody.stages.map(s => s.stageId)).toEqual(getProjectDefinition(CODE).stages.map(s => s.stageId));
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
    const cell = r.jsonBody.students.find(s => s.studentId === "s1").cells;
    expect(cell.BK01).toEqual({ status: "approved", score: 90 });
    expect(t.audits().map(a => a.action)).toEqual(["project.template.condense"]);
    const etag = JSON.stringify([t.snap(), t.doc("s1"), t.doc("s2")]);
    await t.get("students"); await t.get("board");
    expect(JSON.stringify([t.snap(), t.doc("s1"), t.doc("s2")])).toBe(etag);
    expect(t.audits()).toHaveLength(1);
  });

  it("an archived class is never converted", async () => {
    const t = setup({ "platform/classes/c1.json": room("c1", { status: "archived", active: false }), [NS.progressName("c1", "s1")]: progress("s1", "c1", { B01: approved(90) }) });
    const r = await t.get("board");
    expect(r.jsonBody.stages.some(s => s.stageId === "B01")).toBe(true);
    expect(t.snap().templateVersion).toBe(1);
    expect(t.doc("s1").stages.B01).toBeTruthy();
  });

  it("while another request holds a fresh conversion lock, reads see the old set and writes are refused (retryable)", async () => {
    const t = setup({ [NS.configName("c1")]: oldSnapshot(CODE, "c1", s => ({ ...s, conversion: { toVersion: 2, lockId: "other", startedAt: new Date().toISOString() } })) });
    expect((await t.get("board")).jsonBody.stages.some(s => s.stageId === "B01")).toBe(true);
    const w = await t.post({ action: "progress.update", studentId: "s1", stageId: "B01", status: "approved" });
    expect(w.status).toBe(503);
    expect(t.doc("s1")).toBeNull();
  });

  it("a stale lock (a crashed conversion) is taken over and the conversion completes", async () => {
    const t = setup({ [NS.configName("c1")]: oldSnapshot(CODE, "c1", s => ({ ...s, conversion: { toVersion: 2, lockId: "crashed", startedAt: "2020-01-01T00:00:00.000Z" } })), [NS.progressName("c1", "s1")]: progress("s1", "c1", { B01: approved(90) }) });
    await t.get("board");
    expect(t.snap().templateVersion).toBe(2);
    expect(t.doc("s1").stages.BK01.status).toBe("ready_for_review");
  });

  it("a conversion that fails mid-way releases its lock at once (no 2-minute write freeze); the next read completes it", async () => {
    const t = setup({ [NS.progressName("c1", "s1")]: progress("s1", "c1", { B01: approved(90) }), [NS.progressName("c1", "s2")]: progress("s2", "c1", { B02: approved(80) }) });
    const realUpload = t.ctx.container.getBlockBlobClient.bind(t.ctx.container);
    let fail = true;
    t.ctx.container.getBlockBlobClient = name => {
      const client = realUpload(name);
      if (fail && name === NS.progressName("c1", "s2")) return { ...client, upload: async () => { const e = new Error("conflict"); e.statusCode = 412; throw e; } };
      return client;
    };
    const r = await t.get("board");
    expect(r.status).toBe(200);                                                // the read is served on the old set…
    expect(r.jsonBody.stages.some(s => s.stageId === "B01")).toBe(true);
    expect(t.snap().templateVersion).toBe(1);
    expect(t.doc("s1").stageTemplateVersion).toBe(2);                          // …s1 already converted refuses old-set writes
    expect((await t.post({ action: "progress.update", studentId: "s1", stageId: "B01", status: "in_progress" })).status).toBe(503);
    expect(t.snap().conversion).toBeUndefined();                               // lock released
    fail = false;
    await t.get("board");
    expect(t.snap().templateVersion).toBe(2);
    expect(t.doc("s1").stages.BK01.status).toBe("ready_for_review");
    expect(t.doc("s2").stages.BK01.status).toBe("ready_for_review");
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
    await t.get("board"); await t.get("board");
    expect(t.snap()).toMatchObject({ templateVersion: 1, condenseSkipped: { toVersion: 2, reason: "stage-id-collision:BK01" } });
    expect(t.doc("s1").stages.B01).toBeTruthy();
    expect(t.audits().map(a => a.action)).toEqual(["project.template.condense_skipped"]);
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

  it("794589: a v2 class with progress converts to the v3 set; a v1 class with progress stays untouched", async () => {
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
    await t.get("board", "c7", "794589");
    const s7 = t.ctx.getJson(NS7.configName("c7"));
    expect(s7).toMatchObject({ templateVersion: 3, programCode: "794589" });
    expect("projectCode" in s7).toBe(false);                                   // the legacy snapshot keeps its own shape
    expect(t.ctx.getJson(NS7.progressName("c7", "p1")).stages.PT10).toMatchObject({ status: "approved", score: 88 });
    await t.get("board", "c8", "794589");
    expect(t.ctx.getJson(NS7.configName("c8")).templateVersion).toBe(1);
    expect(t.ctx.getJson(NS7.progressName("c8", "p2")).stages.B01).toBeTruthy();
  });
});
