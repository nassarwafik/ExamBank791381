import { describe, it, expect } from "vitest";
import { handler as tracker } from "../src/functions/project-tracker.js";
import { getProjectDefinition, getStorageNamespace } from "../src/lib/project-tracker/registry.js";
import { buildClassSnapshot } from "../src/lib/project-tracker/service.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase P-1 (B3 / B4) — `template.update` on the generic route validates the patch against the class's CURRENT snapshot
// before writing (inside the same CAS round). A malformed patch is refused with 400 and the snapshot is left exactly as
// it was; a valid edit (rename, reweight, reorder, (de)activate, optional, a new stage in an existing group, weights,
// config) still saves. A stage weight must be a finite number > 0 — except an unchanged legacy value already stored.

const NOW = "2026-10-01T10:00:00.000Z";
const CODE = "899373";
const NS = getStorageNamespace(CODE);
const room = (id, extra = {}) => ({ classId: id, name: "صف " + id, grade: "11", schoolYear: "2026", active: true, status: "active", studentIds: [], programCodes: [CODE], createdAt: NOW, updatedAt: NOW, ...extra });

function setup(mutateSnapshot) {
  const snap = buildClassSnapshot(getProjectDefinition(CODE), "c1", NOW);
  if (mutateSnapshot) mutateSnapshot(snap);
  const ctx = createMemoryContainer({ "platform/classes/c1.json": room("c1"), [NS.configName("c1")]: snap });
  const audits = [];
  const deps = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async (_c, ev) => { audits.push(ev); } };
  const save = template => tracker({ method: "POST", url: "https://x/api/project-tracker", json: async () => ({ projectCode: CODE, classId: "c1", action: "template.update", template }) }, deps);
  const stored = () => ctx.getJson(NS.configName("c1"));
  const before = JSON.stringify(stored());
  return { save, stored, before, audits, snap };
}
const clone = v => JSON.parse(JSON.stringify(v));
const edit = (snap, fn) => { const stages = clone(snap.stages); fn(stages); return { stages, trackWeights: clone(snap.trackWeights), config: clone(snap.config) }; };

describe("P-1 template.update — malformed patches are refused and write nothing", () => {
  const cases = [
    ["stages that is not an array", s => ({ stages: { a: 1 }, trackWeights: s.trackWeights, config: s.config })],
    ["a duplicate stageId", s => edit(s, st => { st[1].stageId = st[0].stageId; })],
    ["an empty stageId", s => edit(s, st => { st[0].stageId = "  "; })],
    ["an unknown track", s => edit(s, st => { st[0].track = "nope"; })],
    ["a group that does not exist in the stage's track", s => edit(s, st => { st[0].groupId = "nope"; })],
    ["an empty title", s => edit(s, st => { st[0].title = "   "; })],
    ["a title longer than 200 characters", s => edit(s, st => { st[0].title = "س".repeat(201); })],
    ["a non-numeric order", s => edit(s, st => { st[0].order = "x"; })],
    ["a weight of 0", s => edit(s, st => { st[0].weight = 0; })],
    ["a negative weight", s => edit(s, st => { st[0].weight = -2; })],
    ["a non-numeric weight", s => edit(s, st => { st[0].weight = "heavy"; })],
    ["a non-boolean active flag", s => edit(s, st => { st[0].active = "yes"; })],
    ["a removed existing stage (deactivate instead)", s => edit(s, st => { st.splice(0, 1); })],
    ["a negative track weight", s => ({ stages: s.stages, trackWeights: { ...s.trackWeights, book: -1 }, config: s.config })],
    ["an unknown track weight key", s => ({ stages: s.stages, trackWeights: { ...s.trackWeights, nope: 10 }, config: s.config })],
    ["track weights that sum to 0", s => ({ stages: s.stages, trackWeights: { book: 0, access: 0 }, config: s.config })],
    ["an out-of-range lateThreshold", s => ({ stages: s.stages, trackWeights: s.trackWeights, config: { ...s.config, lateThreshold: 150 } })],
    ["a non-integer staleDays", s => ({ stages: s.stages, trackWeights: s.trackWeights, config: { ...s.config, staleDays: 2.5 } })],
    ["an unknown config key", s => ({ stages: s.stages, trackWeights: s.trackWeights, config: { ...s.config, hack: 1 } })]
  ];
  it.each(cases)("%s → 400, snapshot unchanged, no audit", async (_label, build) => {
    const t = setup();
    const r = await t.save(build(t.snap));
    expect(r.status).toBe(400);
    expect(typeof r.jsonBody.error).toBe("string");
    expect(JSON.stringify(t.stored())).toBe(t.before);
    expect(t.audits).toHaveLength(0);
  });
});

describe("P-1 template.update — valid edits still save", () => {
  it("rename, reweight, reorder, deactivate, optional and a new stage in an existing group", async () => {
    const t = setup();
    const patch = edit(t.snap, st => {
      st[0].title = "عنوان جديد"; st[1].weight = 2.5; st[2].order = 99; st[3].active = false; st[4].required = false;
      st.push({ stageId: "B99", track: st[0].track, groupId: st[0].groupId, title: "مرحلة جديدة", description: "", order: 100, weight: 1, required: true, active: true });
    });
    const r = await t.save(patch);
    expect(r.status).toBe(200);
    const s = t.stored();
    expect(s.stages.find(x => x.stageId === t.snap.stages[0].stageId).title).toBe("عنوان جديد");
    expect(s.stages.find(x => x.stageId === "B99")).toBeTruthy();
    expect(t.audits.map(a => a.action)).toEqual(["project.template.update"]);
  });

  it("track weights and config within range", async () => {
    const t = setup();
    const r = await t.save({ stages: t.snap.stages, trackWeights: { book: 70, access: 30 }, config: { staleDays: 14, lateThreshold: 30, balanceWarningThreshold: 20 } });
    expect(r.status).toBe(200);
    expect(t.stored().trackWeights).toEqual({ book: 70, access: 30 });
  });

  it("an unchanged legacy weight of 0 already stored does not block other edits", async () => {
    const t = setup(snap => { snap.stages[0].weight = 0; });
    const patch = edit(t.snap, st => { st[1].title = "تعديل آخر"; });
    const r = await t.save(patch);
    expect(r.status).toBe(200);
    expect(t.stored().stages[0].weight).toBe(0);
  });
});
