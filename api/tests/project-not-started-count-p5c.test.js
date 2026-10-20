import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "node:module";

// Phase P-5c — the class summary counts the students who have not started («لم يبدأوا»), by the P-5b rule (no ACTIVE stage
// left «لم يبدأ»: nothing in progress, waiting for review or approved). Additive: `notStartedCount` is present only when at
// least one student has not started, so a class where everyone started keeps a byte-identical summary.
// Fail-first: run against 1012b131 (no notStartedCount).
const require = createRequire(import.meta.url);
const analytics = require("../src/lib/project-tracker/analytics.js");
const registry = require("../src/lib/project-tracker/registry.js");
const service = require("../src/lib/project-tracker/service.js");
const { createMemoryContainer } = require("./fixtures/memory-container.js");
const { handler: tracker } = require("../src/functions/project-tracker.js");

const NOW = "2026-10-20T10:00:00.000Z";
const CODE = "899373";
const NS = registry.getStorageNamespace(CODE);
const DEF = registry.getProjectDefinition(CODE);
const ACTIVE = DEF.stages.filter(s => s.active === true).sort((a, b) => a.order - b.order);
const [S1] = ACTIVE.map(s => s.stageId);
const workDef = () => service.workingDefinition(CODE, service.buildClassSnapshot(DEF, "c1", NOW));
const doc = stages => ({ schemaVersion: 1, programCode: CODE, classId: "c1", studentId: "x", startedAt: NOW, updatedAt: NOW, stages, history: [] });
const entry = (id, progress) => ({ studentId: id, displayName: id, progress });

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"], now: new Date(NOW) }); });
afterEach(() => { vi.useRealTimers(); });

describe("P-5c — class summary notStartedCount", () => {
  it("counts the never-started students (no document, untouched, every kind of start excluded)", () => {
    const entries = [
      entry("none", null),
      entry("untouched", doc({ [S1]: { status: "not_started" } })),
      entry("inProgress", doc({ [S1]: { status: "in_progress" } })),
      entry("ready", doc({ [S1]: { status: "ready_for_review" } })),
      entry("approved", doc({ [S1]: { status: "approved" } }))
    ];
    expect(analytics.buildClassSummary(workDef(), entries, NOW).notStartedCount).toBe(2);
  });
  it("is absent (not 0) when everyone started, and the rest of the summary is unchanged", () => {
    const entries = [entry("a", doc({ [S1]: { status: "in_progress" } })), entry("b", doc({ [S1]: { status: "approved" } }))];
    const s = analytics.buildClassSummary(workDef(), entries, NOW);
    expect("notStartedCount" in s).toBe(false);
    expect(Object.keys(s).sort()).toEqual(["avgOverall", "completedCount", "staleCount", "staleDays", "studentCount", "studentsReadyForReview", "totalReadyStages", "trackAverages", "trackWeights"]);
  });
  it("through the real route: resource=summary carries the count", async () => {
    const seed = { "platform/classes/c1.json": { classId: "c1", name: "صف", grade: "11", schoolYear: "2026", active: true, status: "active", studentIds: [], programCodes: [CODE], createdAt: NOW, updatedAt: NOW } };
    for (const [id, stages] of [["s1", null], ["s2", { [S1]: { status: "in_progress" } }], ["s3", null]]) {
      seed["platform/users/" + id + ".json"] = { userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: "c1", displayName: id, code: "C" + id };
      if (stages) seed[NS.progressName("c1", id)] = { ...doc(stages), studentId: id };
    }
    const ctx = createMemoryContainer(seed);
    const deps = { requireBuilderAuth: () => ({ ok: true, user: { sub: "t" } }), container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {} };
    const r = await tracker({ method: "GET", url: "https://x/api/project-tracker?projectCode=" + CODE + "&resource=summary&classId=c1", json: async () => ({}) }, deps);
    expect(r.status).toBe(200);
    expect(r.jsonBody.summary.notStartedCount).toBe(2);
  });
});
