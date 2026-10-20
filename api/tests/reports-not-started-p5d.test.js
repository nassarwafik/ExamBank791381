import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "node:module";

// Phase P-5d — the reports route carries the class's «لم يبدأوا» count (P-5c notStartedCount, P-5b rule): `type=project` in its
// summary (already, through the shared buildClassSummary — pinned here), and `type=class` in each project section. Additive:
// absent when everyone started. Fail-first: run against 4e3683bb (the class report's project sections had no count).
const require = createRequire(import.meta.url);
const registry = require("../src/lib/project-tracker/registry.js");
const { createMemoryContainer } = require("./fixtures/memory-container.js");
const { handler: reports } = require("../src/functions/reports.js");

const NOW = "2026-10-20T10:00:00.000Z";
const CODE = "899373";
const NS = registry.getStorageNamespace(CODE);
const S1 = registry.getProjectDefinition(CODE).stages.filter(s => s.active === true).sort((a, b) => a.order - b.order)[0].stageId;

function school(students) {
  const seed = { "platform/classes/c1.json": { classId: "c1", name: "صف", grade: "11", schoolYear: "2026", active: true, status: "active", studentIds: Object.keys(students), programCodes: [CODE], createdAt: NOW, updatedAt: NOW } };
  for (const [id, stages] of Object.entries(students)) {
    seed["platform/users/" + id + ".json"] = { userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: "c1", displayName: id, code: "C" + id };
    if (stages) seed[NS.progressName("c1", id)] = { schemaVersion: 1, programCode: CODE, classId: "c1", studentId: id, startedAt: NOW, updatedAt: NOW, stages, history: [] };
  }
  const ctx = createMemoryContainer(seed);
  const deps = { requireBuilderAuth: () => ({ ok: true, user: { sub: "t" } }), container: ctx.container, getContainer: () => ctx.container };
  return q => reports({ method: "GET", url: "https://x/api/reports?" + q, json: async () => ({}) }, deps);
}

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"], now: new Date(NOW) }); });
afterEach(() => { vi.useRealTimers(); });

describe("P-5d — reports carry «لم يبدأوا»", () => {
  it("type=class: each project section reports notStartedCount when some students have not started", async () => {
    const get = school({ s1: null, s2: { [S1]: { status: "in_progress" } }, s3: { [S1]: { status: "not_started" } } });
    const r = await get("type=class&classId=c1");
    expect(r.status).toBe(200);
    expect(r.jsonBody.projects.find(p => p.projectCode === CODE).notStartedCount).toBe(2);
  });
  it("type=class: absent when everyone started", async () => {
    const get = school({ s1: { [S1]: { status: "approved" } }, s2: { [S1]: { status: "ready_for_review" } } });
    const p = (await get("type=class&classId=c1")).jsonBody.projects.find(x => x.projectCode === CODE);
    expect("notStartedCount" in p).toBe(false);
    expect(Object.keys(p).sort()).toEqual(["avgOverall", "completedCount", "projectCode", "title", "trackAverages", "tracks"]);
  });
  it("type=project: the summary carries the same count (pin: the shared class summary)", async () => {
    const get = school({ s1: null, s2: { [S1]: { status: "in_progress" } } });
    expect((await get("type=project&projectCode=" + CODE + "&classId=c1")).jsonBody.summary.notStartedCount).toBe(1);
  });
});
