import { describe, it, expect, beforeAll, vi } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Roadmap #33 — Legacy 794589 Convergence.
//
// A. GOLDEN PARITY — every scenario (legacy teacher route, generic route for 794589 / 899373 / 883589, both student
//    routes) is replayed over identical in-memory blobs under a fixed Date and must equal, field for field, the record
//    captured from UNPATCHED main 656fa4e69b995c2590d4c93890db0029b2595083 with the very same fixtures module:
//    status, body, route-owned audit records, system audit blobs, and the storage delta (blob names added / removed
//    / changed + their full content). Only UUIDs are normalized. Meaningful schema differences are NOT normalized.
// B. EXPLICIT INVARIANTS — the contracts the refactor must preserve are asserted directly (not only via golden
//    equality): both first-create snapshot shapes, namespace isolation, V1 preservation / upgrade, the documented
//    legacy-vs-generic differences, history truncation, conflict and NO_CHANGE behavior, student-route bodies.
// C. CONVERGENCE GUARD — the business logic now lives once (shared service + generic engine + pure legacy-shape
//    formatters); these assertions FAIL on unpatched main and pin the architecture.
const require = createRequire(import.meta.url);
const F = require("./fixtures/r33-fixtures.js");
const golden = JSON.parse(readFileSync(new URL("./fixtures/r33-golden.json", import.meta.url), "utf8"));
const API_ROOT = fileURLToPath(new URL("../", import.meta.url));
const SRC = rel => { try { return readFileSync(new URL("../" + rel, import.meta.url), "utf8"); } catch { return ""; } }; // "" when the file does not exist (pre-R33 checkouts)

let R; // results on the CURRENT code
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(F.FIXED_NOW) });
  try { R = await F.runAll(F.loadHandlers(API_ROOT)); } finally { vi.useRealTimers(); }
});

const ids = F.SCENARIOS.map(s => s.id);
const legacyIds = ids.filter(id => id.startsWith("L."));
const generic794589Ids = ids.filter(id => id.startsWith("G794589."));
const LEGACY_SNAPSHOT_KEYS = ["schemaVersion", "programCode", "classId", "templateVersion", "trackWeights", "config", "groups", "stages", "createdAt", "updatedAt"];
const GENERIC_SNAPSHOT_KEYS = ["schemaVersion", "projectCode", "classId", "templateVersion", "tracks", "trackWeights", "config", "groups", "stages", "createdAt", "updatedAt"];
const inLegacyNamespace = n => n.startsWith(F.LEGACY_CONFIG) || (n.startsWith(F.LEGACY_PROGRESS) && !/^platform\/project-progress\/(899373|883589)\//.test(n));
const inNamespace = (code, n) => n.startsWith("platform/project-trackers/" + code + "/") || n.startsWith("platform/project-progress/" + code + "/");
const touched = r => [...r.storage.added, ...r.storage.removed, ...r.storage.changed];

describe("A. golden parity with unpatched main (identical fixtures, fixed clock)", () => {
  it("the golden file covers exactly the scenario list", () => {
    expect(Object.keys(golden).sort()).toEqual([...ids].sort());
    expect(ids.length).toBeGreaterThanOrEqual(130);
  });
  for (const id of ids) {
    it(id, () => { expect(R[id]).toEqual(golden[id]); });
  }
});

describe("B. explicit invariants", () => {
  it("B1 first-create snapshot shapes are preserved EXACTLY: legacy → programCode (no tracks); generic 794589 → projectCode + tracks", () => {
    for (const id of ["L.template.c2.lazyCreate", "L.activate.c2", "L.template.cL.legacyScalar"]) {
      const doc = R[id].storage.docs[F.LEGACY_CONFIG + (id.includes("cL") ? "cL" : "c2") + ".json"];
      expect(Object.keys(doc)).toEqual(LEGACY_SNAPSHOT_KEYS);
      expect(doc.programCode).toBe("794589"); expect("projectCode" in doc).toBe(false); expect("tracks" in doc).toBe(false);
      expect(doc.templateVersion).toBe(2); expect(doc.createdAt).toBe(F.FIXED_NOW);
    }
    for (const id of ["G794589.template.c2.lazyCreate", "G794589.activate.c2", "G794589.template.cL.legacyScalar"]) {
      const doc = R[id].storage.docs[F.LEGACY_CONFIG + (id.includes("cL") ? "cL" : "c2") + ".json"];
      expect(Object.keys(doc)).toEqual(GENERIC_SNAPSHOT_KEYS);
      expect(doc.projectCode).toBe("794589"); expect("programCode" in doc).toBe(false); expect(doc.tracks.map(t => t.trackId)).toEqual(["book", "packetTracer"]);
    }
    // template.update on a missing snapshot starts from the same per-route factory.
    expect(Object.keys(R["L.templateUpdate.c2.lazyCreate"].storage.docs[F.LEGACY_CONFIG + "c2.json"])).toEqual(LEGACY_SNAPSHOT_KEYS);
    expect(Object.keys(R["G794589.templateUpdate.c2.lazyCreate"].storage.docs[F.LEGACY_CONFIG + "c2.json"])).toEqual(GENERIC_SNAPSHOT_KEYS);
    // Both create the SAME stage/group/weight content (only the identity keys differ).
    const l = R["L.template.c2.lazyCreate"].storage.docs[F.LEGACY_CONFIG + "c2.json"], g = R["G794589.template.c2.lazyCreate"].storage.docs[F.LEGACY_CONFIG + "c2.json"];
    expect(l.stages).toEqual(g.stages); expect(l.groups).toEqual(g.groups); expect(l.trackWeights).toEqual(g.trackWeights); expect(l.config).toEqual(g.config);
  });

  it("B2 storage namespace: legacy and generic-794589 only ever touch the historical un-namespaced 794589 paths; other projects only their own; student reads never write", () => {
    for (const id of [...legacyIds, ...generic794589Ids]) for (const n of touched(R[id])) expect(inLegacyNamespace(n), id + " touched " + n).toBe(true);
    for (const id of ids.filter(i => i.startsWith("G899373."))) for (const n of touched(R[id])) expect(inNamespace("899373", n), id + " touched " + n).toBe(true);
    for (const id of ids.filter(i => i.startsWith("G883589."))) for (const n of touched(R[id])) expect(inNamespace("883589", n), id + " touched " + n).toBe(true);
    for (const id of ids.filter(i => i.startsWith("SL.") || i.startsWith("SG."))) { expect(touched(R[id])).toEqual([]); expect(R[id].systemAudits).toEqual([]); }
    // The same pair of blob names for the same operation on both routes (reset, update, lazy create).
    for (const s of ["reset.c1", "update.approve", "template.c2.lazyCreate", "templateUpdate.c1"]) expect(R["L." + s].storage.added.concat(R["L." + s].storage.removed, R["L." + s].storage.changed)).toEqual(R["G794589." + s].storage.added.concat(R["G794589." + s].storage.removed, R["G794589." + s].storage.changed));
  });

  it("B3 historical snapshots: V1 WITH meaningful progress is never touched; V1 WITHOUT progress is upgraded identically on both routes (legacy shape, audited once)", () => {
    for (const p of ["L.", "G794589."]) {
      expect(touched(R[p + "template.c4.v1Progress"])).toEqual([]); expect(R[p + "template.c4.v1Progress"].systemAudits).toEqual([]);
      expect(R[p + "template.c4.v1Progress"].body.template.templateVersion).toBe(1);
      expect(touched(R[p + "template.cA.archived"])).toEqual([]);          // archived: in-memory only
      expect(R[p + "template.c3.v1NoProgress"].storage.changed).toEqual([F.LEGACY_CONFIG + "c3.json"]);
      const up = R[p + "template.c3.v1NoProgress"].storage.docs[F.LEGACY_CONFIG + "c3.json"];
      expect(up.templateVersion).toBe(2); expect(up.upgradedFromVersion).toBe(1); expect(up.programCode).toBe("794589"); expect(up.createdAt).toBe("2025-09-01T00:00:00.000Z");
      expect(R[p + "template.c3.v1NoProgress"].systemAudits.map(a => [a.action, a.targetId, a.details])).toEqual([["project.template.upgrade", "c3", { fromVersion: 1, toVersion: 2, reason: "no-meaningful-progress" }]]);
    }
    expect(R["L.template.c3.v1NoProgress"].storage.docs).toEqual(R["G794589.template.c3.v1NoProgress"].storage.docs);
  });

  it("B4 documented legacy/generic differences are preserved, not unified", () => {
    // not enrolled: legacy 403 + 794589 message, generic 400 + generic message (GET and every POST)
    for (const s of ["template.cN.notEnrolled", "update.notEnrolled", "reset.cN.notEnrolled"]) {
      expect([R["L." + s].status, R["L." + s].body.error]).toEqual([403, "الصف غير مسجَّل في مشروع 794589."]);
      expect([R["G794589." + s].status, R["G794589." + s].body.error]).toEqual([400, "الصف غير مسجَّل في هذا المشروع."]);
    }
    // KNOWN LEGACY LIMITATION (recorded for the Final Architecture Audit): resource=student for a non-member id
    // answers 200 with a blank student on the legacy route; the generic route keeps its 404 protection.
    for (const s of ["student.c1.s3.archived", "student.c1.s4.foreign", "student.c1.ghost"]) {
      expect(R["L." + s].status).toBe(200); expect(R["L." + s].body.student.displayName).toBe(""); expect(R["L." + s].body.student.code).toBe("");
      expect(R["G794589." + s].status).toBe(404);
    }
    expect(R["L.student.c1.s3.archived"].body.progress.B01.status).toBe("approved"); // the legacy route still returns that id's progress
    // audit formats: legacy targetId unprefixed and no projectCode; generic prefixed with the project code
    expect(R["L.update.approve"].audits).toEqual([{ actor: "teacher-1", action: "project.stage.approve", targetType: "project-stage", targetId: "c1/s1/B03", targetLabel: expect.any(String), details: { fromStatus: "not_started", toStatus: "approved" } }]);
    expect(R["G794589.update.approve"].audits).toEqual([{ actor: "teacher-1", action: "project.stage.approve", targetType: "project-stage", targetId: "794589/c1/s1/B03", targetLabel: expect.any(String), details: { projectCode: "794589", fromStatus: "not_started", toStatus: "approved" } }]);
    expect(R["L.update.noteOnly"].audits).toEqual([{ actor: "teacher-1", action: "project.stage.note", targetType: "project-stage", targetId: "c1/s1/B03", targetLabel: expect.any(String) }]);
    expect(R["G794589.update.noteOnly"].audits[0]).toMatchObject({ targetId: "794589/c1/s1/B03", details: { projectCode: "794589" } });
    expect(R["L.reset.c1"].audits).toEqual([{ actor: "teacher-1", action: "project.reset", targetType: "project-tracker", targetId: "c1", targetLabel: "صف c1", details: { deletedProgressCount: 2 } }]);
    expect(R["G794589.reset.c1"].audits).toEqual([{ actor: "teacher-1", action: "project.reset", targetType: "project-tracker", targetId: "794589/c1", targetLabel: "صف c1", details: { projectCode: "794589", deletedProgressCount: 2 } }]);
    expect(R["L.templateUpdate.c1"].audits).toEqual([{ actor: "teacher-1", action: "project.template.update", targetType: "project-template", targetId: "c1", targetLabel: "صف c1" }]);
    expect(R["G794589.templateUpdate.c1"].audits).toEqual([{ actor: "teacher-1", action: "project.template.update", targetType: "project-template", targetId: "794589/c1", targetLabel: "صف c1", details: { projectCode: "794589" } }]);
  });

  it("B5 legacy body shape (names) vs generic body shape — same numbers, different keys", () => {
    const l = R["L.student.c1.s1"].body, g = R["G794589.student.c1.s1"].body;
    expect(Object.keys(l).sort()).toEqual(["balance", "config", "groups", "history", "nextBookStage", "nextPacketTracerStage", "ok", "progress", "readOnly", "stages", "student", "summary", "trackWeights"]);
    expect(Object.keys(l.summary).sort()).toEqual(["bookProgress", "complete", "counts", "overallProgress", "packetTracerProgress", "readyForReviewCount", "stale", "updatedAt"]);
    // `performance` (project grade / project-specific Strength) and `evaluation` (Phase 9B: graded / ungraded stages, average
    // of graded scores) are the two additive fields of the generic body.
    expect(Object.keys(g).sort()).toEqual(["balance", "config", "evaluation", "groups", "history", "nextStages", "ok", "performance", "progress", "projectCode", "readOnly", "stages", "student", "summary", "trackWeights", "tracks"]);
    expect(l.summary.bookProgress).toBe(g.summary.trackProgress.book); expect(l.summary.packetTracerProgress).toBe(g.summary.trackProgress.packetTracer);
    expect(l.summary.overallProgress).toBe(g.summary.overallProgress); expect(l.counts).toBe(undefined);
    expect(l.nextBookStage).toEqual(g.nextStages.book); expect(l.nextPacketTracerStage).toEqual(g.nextStages.packetTracer);
    // legacy balance shape (V1 class with 60/40 weights and a 20-point threshold → book leads)
    const lb = R["L.student.c4.s7.v1"].body.balance, gb = R["G794589.student.c4.s7.v1"].body.balance;
    expect(lb).toEqual({ leadingTrack: "book", diff: gb.diff }); expect(gb.leadingTrackId).toBe("book"); expect(Object.keys(gb).sort()).toEqual(["diff", "laggingTrackId", "laggingTrackTitle", "leadingTrackId", "leadingTrackTitle"]);
    // class summary / students / analytics
    const ls = R["L.summary.c1"].body.summary, gs = R["G794589.summary.c1"].body.summary;
    expect(Object.keys(ls).sort()).toEqual(["avgBook", "avgOverall", "avgPacketTracer", "completedCount", "staleCount", "staleDays", "studentCount", "studentsReadyForReview", "totalReadyStages", "trackWeights"]);
    expect([ls.avgBook, ls.avgPacketTracer, ls.avgOverall]).toEqual([gs.trackAverages.book, gs.trackAverages.packetTracer, gs.avgOverall]);
    expect(Object.keys(R["L.students.c1"].body.students[0]).sort()).toEqual(["bookProgress", "code", "complete", "counts", "displayName", "overallProgress", "packetTracerProgress", "readyForReviewCount", "stale", "studentId", "updatedAt"]);
    expect(Object.keys(R["L.analytics.c1"].body.analytics.perStudent[0]).sort()).toEqual(["book", "name", "overall", "packetTracer", "studentId"]);
    expect(R["L.analytics.c1"].body.analytics.perStudent.map(s => [s.studentId, s.book, s.packetTracer, s.overall])).toEqual(R["G794589.analytics.c1"].body.analytics.perStudent.map(s => [s.studentId, s.trackProgress.book, s.trackProgress.packetTracer, s.overall]));
    expect(R["L.analytics.c1"].body.analytics.weeklyTrend).toEqual(R["G794589.analytics.c1"].body.analytics.weeklyTrend);
    expect("projectCode" in R["L.classes"].body).toBe(false); expect(R["L.classes"].body.classes).toEqual(R["G794589.classes"].body.classes);
  });

  it("B6 progress semantics: 25+ history → POST returns the last 20 (26 stored); note-only; approval; NO_CHANGE; invalid status; conflict", () => {
    for (const p of ["L.", "G794589."]) {
      const up = R[p + "update.approve"];
      expect(up.status).toBe(200); expect(up.body.history).toHaveLength(20); expect(up.body.stage).toMatchObject({ stageId: "B03", status: "approved", approvedAt: F.FIXED_NOW, approvedBy: "teacher-1" });
      expect(up.storage.docs[F.LEGACY_PROGRESS + "c1/s1.json"].history).toHaveLength(26);
      expect(up.storage.changed).toEqual([F.LEGACY_PROGRESS + "c1/s1.json"]);
      expect(R[p + "update.noteOnly"].body.stage).toMatchObject({ stageId: "B03", note: "n2", status: "not_started" });
      expect(R[p + "update.noChange"].body).toEqual({ ok: true, noChange: true }); expect(touched(R[p + "update.noChange"])).toEqual([]); expect(R[p + "update.noChange"].audits).toEqual([]);
      expect(R[p + "update.invalidStatus"].status).toBe(400); expect(touched(R[p + "update.invalidStatus"])).toEqual([]);
      expect(R[p + "update.conflict"].status).toBe(503); expect(R[p + "update.conflict"].body.error).toBe("حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى."); expect(touched(R[p + "update.conflict"])).toEqual([]); expect(R[p + "update.conflict"].audits).toEqual([]);
      expect(R[p + "templateUpdate.conflict"].status).toBe(503); expect(touched(R[p + "templateUpdate.conflict"])).toEqual([]);
      for (const s of ["update.foreign", "update.archivedStudent", "update.ghost"]) { expect(R[p + s].status).toBe(404); expect(touched(R[p + s])).toEqual([]); }
      expect(R[p + "update.badStage"].status).toBe(400); expect(R[p + "update.archivedClass"].status).toBe(403); expect(touched(R[p + "update.archivedClass"])).toEqual([]);
      expect(R[p + "update.status"].body.stage.status).toBe("in_progress"); expect(R[p + "update.status"].audits[0].action).toBe("project.stage.status_change");
      // disabled member can be updated; the lazily created snapshot for the empty class is written by the update
      expect(R[p + "update.lazyCreateEmptyClass"].status).toBe(200); expect(R[p + "update.lazyCreateEmptyClass"].storage.added.sort()).toEqual([F.LEGACY_PROGRESS + "c2/s5.json", F.LEGACY_CONFIG + "c2.json"].sort());
      // reset deletes exactly this class's 794589 blobs (2 progress + snapshot) and nothing else
      expect(R[p + "reset.c1"].storage.removed).toEqual([F.LEGACY_PROGRESS + "c1/s1.json", F.LEGACY_PROGRESS + "c1/s3.json", F.LEGACY_CONFIG + "c1.json"].sort()); expect(R[p + "reset.c1"].body.deletedProgressCount).toBe(2);
      expect(R[p + "reset.c2.empty"].body.deletedProgressCount).toBe(0); expect(R[p + "reset.cA.archived"].status).toBe(403); expect(touched(R[p + "reset.cA.archived"])).toEqual([]);
      expect(R[p + "activate.cA.archived"].status).toBe(403);
    }
  });

  it("B7 student routes: legacy stays flat and 794589-only; generic lists every enrolled project; identical numbers", () => {
    const l = R["SL.s1"].body, g = R["SG.s1"].body.projects[0];
    expect(Object.keys(l).sort()).toEqual(["className", "enrolled", "groups", "nextBookStage", "nextPacketTracerStage", "ok", "programCode", "progress", "stages", "summary"]);
    expect(l.programCode).toBe("794589"); expect(l.summary.bookProgress).toBe(g.summary.trackProgress.book); expect(l.summary.overallProgress).toBe(g.summary.overallProgress);
    expect(l.nextBookStage).toEqual(g.nextStages.book); expect(l.stages).toEqual(g.stages); expect(l.progress).toEqual(g.progress);
    expect(R["SL.s5"].body.stages.length).toBeGreaterThan(0); expect(touched(R["SL.s5"])).toEqual([]);   // empty project: in-memory default, never written
    expect(R["SL.s9"].body).toEqual({ ok: true, enrolled: false });                                       // 794589 removed → legacy not enrolled
    expect(R["SG.s9"].body.enrolled).toBe(true); expect(R["SG.s9"].body.projects.map(p => p.projectCode)).toEqual(["899373"]);
    expect(R["SL.s10"].body.enrolled).toBe(true); expect(R["SL.s11"].body).toEqual({ ok: true, enrolled: false }); expect(R["SG.s11"].body.projects.map(p => p.projectCode)).toEqual(["899373", "883589"]);
    expect(R["SL.nobody"].status).toBe(401); expect(R["SG.nobody"].status).toBe(401);
    expect(R["SL.s7"].body.summary.bookProgress).toBe(50); expect(R["SL.s7"].body.nextBookStage.stageId).toBe("B02"); // V1 class, historical stage ids
  });
});

describe("C. convergence guard — business logic lives once (fails on unpatched main)", () => {
  const legacy = SRC("src/functions/project-794589.js"), generic = SRC("src/functions/project-tracker.js"), student = SRC("src/functions/student-project.js");
  const service = SRC("src/lib/project-tracker/service.js"), legacyAnalytics = SRC("src/lib/project-794589-analytics.js"), shapeSrc = SRC("src/lib/project-794589-legacy-shape.js");
  it("C1 the shared service exports the extracted operations and returns domain results (no HTTP)", () => {
    const svc = require("../src/lib/project-tracker/service.js");
    for (const fn of ["listProjectClasses", "ensureClassConfig", "updateStudentProgress", "resetProject", "updateTemplate", "loadStudentProgress"]) expect(typeof svc[fn]).toBe("function");
    expect(service).not.toMatch(/status:\s*\d{3}/); expect(service).not.toContain("jsonBody");
  });
  it("C2 the legacy teacher route keeps no private copy of the orchestration and formats through the pure adapter", () => {
    for (const dup of ["async function ensureClassConfig", "async function listClassStudents", "async function loadProgressEntries", "mutateJsonWithRetry(", "deleteBlob(", "listBlobNames(", "buildUpgradedSnapshot", "classHasMeaningfulProgress"]) expect(legacy).not.toContain(dup);
    expect(legacy).toContain('require("../lib/project-tracker/service")'); expect(legacy).toContain('require("../lib/project-794589-legacy-shape")');
    expect(legacy).toContain("createSnapshot: buildClassSnapshotFromDefault");     // legacy first-create shape supplied explicitly
    for (const keep of ['withObservability("project-794589", handler)', 'logError("project.legacy794589.error"', "!classHasProject(classroom, PROGRAM_CODE)", 'route: "project-794589"']) expect(legacy).toContain(keep);
  });
  it("C3 the generic route uses the same service operations (no inline mutation / deletion)", () => {
    for (const dup of ["mutateJsonWithRetry(", "deleteBlob(", "listBlobNames("]) expect(generic).not.toContain(dup);
    for (const use of ["svc.updateStudentProgress(", "svc.resetProject(", "svc.updateTemplate(", "svc.listProjectClasses("]) expect(generic).toContain(use);
    expect(generic).not.toContain("createSnapshot");                                 // generic first-create shape = service default
  });
  it("C4 the legacy student route reads through the registry namespace and the adapter, never writes", () => {
    expect(student).toContain("getStorageNamespace(PROGRAM_CODE)"); expect(student).toContain('require("../lib/project-794589-legacy-shape")');
    expect(student).not.toContain("uploadJson"); expect(student).not.toContain("platform/project-trackers/classes/");
  });
  it("C5 legacy analytics is a formatter over the generic engine; the legacy-shape module is pure", () => {
    expect(legacyAnalytics).toContain('require("./project-tracker/analytics")'); expect(legacyAnalytics).not.toContain("function weekStart"); expect(legacyAnalytics).not.toContain("asOfProgress");
    expect(shapeSrc.length).toBeGreaterThan(0); expect(shapeSrc).not.toMatch(/require\(/);
    const shape = require("../src/lib/project-794589-legacy-shape.js");
    expect(shape.legacyBalance(null)).toBe(null); expect(shape.legacyBalance({ leadingTrackId: "packetTracer", laggingTrackId: "book", diff: 30 })).toEqual({ leadingTrack: "packetTracer", diff: 30 });
    expect(shape.legacyNextStages({ book: null, packetTracer: { stageId: "P02" } })).toEqual({ nextBookStage: null, nextPacketTracerStage: { stageId: "P02" } });
    expect(shape.legacyStudentSummary({ overallProgress: 40, trackProgress: { book: 80, packetTracer: 0 }, counts: { a: 1 }, readyForReviewCount: 1, complete: false, updatedAt: "x", stale: true })).toEqual({ overallProgress: 40, bookProgress: 80, packetTracerProgress: 0, counts: { a: 1 }, readyForReviewCount: 1, complete: false, updatedAt: "x", stale: true });
    expect(shape.legacyClassSummary({ studentCount: 2, avgOverall: 10, trackAverages: { book: 20, packetTracer: 0 }, completedCount: 0, studentsReadyForReview: 1, totalReadyStages: 1, staleCount: 0, trackWeights: undefined, staleDays: 7 }).trackWeights).toEqual({ book: 50, packetTracer: 50 });
  });
});
