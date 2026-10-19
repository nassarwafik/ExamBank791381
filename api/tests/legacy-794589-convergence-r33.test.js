import { describe, it, expect, beforeAll, vi } from "vitest";
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Roadmap #33 — Legacy 794589 Convergence.
//
// A. GOLDEN PARITY — every scenario (generic route for 794589 / 899373 / 883589, the generic student route) is replayed
//    over identical in-memory blobs under a fixed Date and must equal, field for field, the record captured from
//    UNPATCHED main 656fa4e69b995c2590d4c93890db0029b2595083 with the very same fixtures module: status, body,
//    route-owned audit records, system audit blobs, and the storage delta (blob names added / removed / changed + their
//    full content). Only UUIDs are normalized. Meaningful schema differences are NOT normalized.
//    Phase P-9 (reviewed golden change): the legacy routes /api/project-794589 ("L.*") and /api/student-project
//    ("SL.*") were removed with their 59 golden entries, and a teacher READ no longer writes. Exactly four GET
//    scenarios were refreshed, and only their storage delta / system audits (status, body and route audits unchanged):
//    REFRESHED_BY_P9 below.
// B. EXPLICIT INVARIANTS — the contracts the refactor must preserve are asserted directly (not only via golden
//    equality): the first-create snapshot shape, namespace isolation, V1 preservation / upgrade, history truncation,
//    conflict and NO_CHANGE behavior, student-route bodies; since P-9, a read never writes.
// C. CONVERGENCE GUARD — the business logic lives once (shared service + generic engine + pure legacy-shape
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
const generic794589Ids = ids.filter(id => id.startsWith("G794589."));
const GENERIC_SNAPSHOT_KEYS = ["schemaVersion", "projectCode", "classId", "templateVersion", "tracks", "trackWeights", "config", "groups", "stages", "createdAt", "updatedAt"];
const REFRESHED_BY_P9 = ["G794589.template.c2.lazyCreate", "G794589.template.c3.v1NoProgress", "G794589.template.cL.legacyScalar", "G899373.template.cN.enrolled"];
const inLegacyNamespace = n => n.startsWith(F.LEGACY_CONFIG) || (n.startsWith(F.LEGACY_PROGRESS) && !/^platform\/project-progress\/(899373|883589)\//.test(n));
const inNamespace = (code, n) => n.startsWith("platform/project-trackers/" + code + "/") || n.startsWith("platform/project-progress/" + code + "/");
const touched = r => [...r.storage.added, ...r.storage.removed, ...r.storage.changed];

describe("A. golden parity with unpatched main (identical fixtures, fixed clock)", () => {
  it("the golden file covers exactly the scenario list (no legacy route entry remains)", () => {
    expect(Object.keys(golden).sort()).toEqual([...ids].sort());
    expect(ids.length).toBe(79);
    expect(ids.filter(id => id.startsWith("L.") || id.startsWith("SL."))).toEqual([]);
  });
  it("P-9: the four refreshed GET scenarios now leave storage and the system audit untouched", () => {
    for (const id of REFRESHED_BY_P9) { expect(golden[id].storage, id).toEqual({ added: [], removed: [], changed: [], docs: {} }); expect(golden[id].systemAudits, id).toEqual([]); }
  });
  for (const id of ids) {
    it(id, () => { expect(R[id]).toEqual(golden[id]); });
  }
});

describe("B. explicit invariants", () => {
  it("B1 the first-create snapshot shape: projectCode + tracks; a read shows the very document the first write persists", () => {
    for (const id of ["G794589.activate.c2", "G794589.templateUpdate.c2.lazyCreate"]) {
      const doc = R[id].storage.docs[F.LEGACY_CONFIG + "c2.json"];
      expect(Object.keys(doc)).toEqual(GENERIC_SNAPSHOT_KEYS);
      expect(doc.projectCode).toBe("794589"); expect("programCode" in doc).toBe(false); expect(doc.tracks.map(t => t.trackId)).toEqual(["book", "packetTracer"]);
      expect(doc.templateVersion).toBe(3); expect(doc.createdAt).toBe(F.FIXED_NOW);   // Phase P7: the condensed V3 set
    }
    expect(R["G794589.template.c2.lazyCreate"].body.template).toEqual(R["G794589.activate.c2"].storage.docs[F.LEGACY_CONFIG + "c2.json"]);
    expect(Object.keys(R["G794589.template.cL.legacyScalar"].body.template)).toEqual(GENERIC_SNAPSHOT_KEYS);
  });

  it("B2 storage namespace: 794589 only ever touches the historical un-namespaced paths; other projects only their own; reads never write", () => {
    for (const id of generic794589Ids) for (const n of touched(R[id])) expect(inLegacyNamespace(n), id + " touched " + n).toBe(true);
    for (const id of ids.filter(i => i.startsWith("G899373."))) for (const n of touched(R[id])) expect(inNamespace("899373", n), id + " touched " + n).toBe(true);
    for (const id of ids.filter(i => i.startsWith("G883589."))) for (const n of touched(R[id])) expect(inNamespace("883589", n), id + " touched " + n).toBe(true);
    // Phase P-9 — every GET (teacher and student) leaves storage and the system audit exactly as they were.
    for (const sc of F.SCENARIOS.filter(x => x.method === "GET")) { expect(touched(R[sc.id]), sc.id).toEqual([]); expect(R[sc.id].systemAudits, sc.id).toEqual([]); }
  });

  // Phase P7b (owner decision): a V1 class WITH meaningful progress restarts from zero on the condensed V3 set — a read SHOWS
  // it reset (in memory, nothing written), the first write persists it (api/tests/project-condense-p7.test.js).
  it("B3 historical snapshots: V1 WITH meaningful progress is SHOWN restarted from zero (P7b); V1 WITHOUT progress is SHOWN upgraded by a read (legacy shape), written by the first write", () => {
    const p = "G794589.";
    expect(touched(R[p + "template.c4.v1Progress"])).toEqual([]); expect(R[p + "template.c4.v1Progress"].systemAudits).toEqual([]);
    expect(R[p + "template.c4.v1Progress"].body.template).toMatchObject({ templateVersion: 3, resetFromVersion: 1, programCode: "794589" });
    expect(touched(R[p + "template.cA.archived"])).toEqual([]);          // archived: in-memory only
    const up = R[p + "template.c3.v1NoProgress"].body.template;
    expect(up.templateVersion).toBe(3); expect(up.upgradedFromVersion).toBe(1);   // P7: straight to the condensed V3 expect(up.programCode).toBe("794589"); expect(up.createdAt).toBe("2025-09-01T00:00:00.000Z");
    expect(touched(R[p + "template.c3.v1NoProgress"])).toEqual([]); expect(R[p + "template.c3.v1NoProgress"].systemAudits).toEqual([]);
    // (the write-time upgrade and its single audit: api/tests/project-cleanup-p9.test.js)
  });

  it("B4 the generic contract: not enrolled → 400; a non-member student → 404; audits carry the project code", () => {
    for (const s of ["template.cN.notEnrolled", "update.notEnrolled", "reset.cN.notEnrolled"]) expect([R["G794589." + s].status, R["G794589." + s].body.error]).toEqual([400, "الصف غير مسجَّل في هذا المشروع."]);
    for (const s of ["student.c1.s3.archived", "student.c1.s4.foreign", "student.c1.ghost"]) expect(R["G794589." + s].status).toBe(404);
    expect(R["G794589.update.approve"].audits).toEqual([{ actor: "teacher-1", action: "project.stage.approve", targetType: "project-stage", targetId: "794589/c1/s1/BK02", targetLabel: expect.any(String), details: { projectCode: "794589", fromStatus: "not_started", toStatus: "approved" } }]);
    expect(R["G794589.update.noteOnly"].audits[0]).toMatchObject({ targetId: "794589/c1/s1/BK02", details: { projectCode: "794589" } });
    expect(R["G794589.reset.c1"].audits).toEqual([{ actor: "teacher-1", action: "project.reset", targetType: "project-tracker", targetId: "794589/c1", targetLabel: "صف c1", details: { projectCode: "794589", deletedProgressCount: 2 } }]);
    expect(R["G794589.templateUpdate.c1"].audits).toEqual([{ actor: "teacher-1", action: "project.template.update", targetType: "project-template", targetId: "794589/c1", targetLabel: "صف c1", details: { projectCode: "794589" } }]);
  });

  it("B5 generic body shape", () => {
    const g = R["G794589.student.c1.s1"].body;
    // `performance` (project grade / project-specific Strength) and `evaluation` (Phase 9B: graded / ungraded stages, average
    // of graded scores) are the two additive fields of the generic body.
    expect(Object.keys(g).sort()).toEqual(["balance", "config", "evaluation", "groups", "history", "nextStages", "ok", "performance", "progress", "projectCode", "readOnly", "stages", "student", "summary", "trackWeights", "tracks"]);
    // P7b: the only imbalanced student (c4/s7, V1) is shown restarted from zero, so it has no balance; the balance shape is
    // asserted on the engine directly.
    expect(R["G794589.student.c4.s7.v1"].body.balance).toBe(null);
    const def = require("../src/lib/project-tracker/registry.js").getProjectDefinition("794589");
    const gb = require("../src/lib/project-tracker/core.js").getBalanceInsight({ book: 100, packetTracer: 0 }, def);
    expect(gb.leadingTrackId).toBe("book"); expect(Object.keys(gb).sort()).toEqual(["diff", "laggingTrackId", "laggingTrackTitle", "leadingTrackId", "leadingTrackTitle"]);
    expect(R["G794589.classes"].body.projectCode).toBe("794589");
  });

  it("B6 progress semantics: 25+ history → POST returns the last 20 (26 stored); note-only; approval; NO_CHANGE; invalid status; conflict", () => {
    const p = "G794589.";
    const up = R[p + "update.approve"];
    // Phase P7 — c1 (V2) converts to the condensed V3 set on its FIRST write (reads never write): every write scenario on
    // c1 persists the conversion (s1, s3, the snapshot; one system `project.template.condense` audit) before its own change.
    const conversion = [F.LEGACY_PROGRESS + "c1/s1.json", F.LEGACY_PROGRESS + "c1/s3.json", F.LEGACY_CONFIG + "c1.json"];
    expect(up.status).toBe(200); expect(up.body.history).toHaveLength(20); expect(up.body.stage).toMatchObject({ stageId: "BK02", status: "approved", approvedAt: F.FIXED_NOW, approvedBy: "teacher-1" });
    expect(up.storage.docs[F.LEGACY_PROGRESS + "c1/s1.json"].history).toHaveLength(26);
    expect(up.storage.changed.sort()).toEqual(conversion.slice().sort()); expect(up.systemAudits.map(a => a.action)).toEqual(["project.template.condense"]);
    expect(R[p + "update.noteOnly"].body.stage).toMatchObject({ stageId: "BK02", note: "n2", status: "not_started" });
    expect(R[p + "update.noChange"].body).toEqual({ ok: true, noChange: true }); expect(touched(R[p + "update.noChange"]).sort()).toEqual(conversion.slice().sort()); expect(R[p + "update.noChange"].audits).toEqual([]);
    expect(R[p + "update.invalidStatus"].status).toBe(400); expect(touched(R[p + "update.invalidStatus"]).sort()).toEqual(conversion.slice().sort()); expect(R[p + "update.invalidStatus"].audits).toEqual([]);
    // every write to s1 conflicts, so the conversion cannot complete: only s3's conversion lands, the write is a 503
    expect(R[p + "update.conflict"].status).toBe(503); expect(R[p + "update.conflict"].body.error).toBe("حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى."); expect(touched(R[p + "update.conflict"])).toEqual([F.LEGACY_PROGRESS + "c1/s3.json"]); expect(R[p + "update.conflict"].audits).toEqual([]);
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
  });

  it("B7 the student route lists every enrolled project, 794589 included, and never writes", () => {
    const g = R["SG.s1"].body.projects[0];
    expect(g.projectCode).toBe("794589"); expect(g.stages.length).toBeGreaterThan(0);
    expect(R["SG.s5"].body.projects[0].stages.length).toBeGreaterThan(0); expect(touched(R["SG.s5"])).toEqual([]);   // empty project: in-memory default, never written
    expect(R["SG.s9"].body.enrolled).toBe(true); expect(R["SG.s9"].body.projects.map(p => p.projectCode)).toEqual(["899373"]); // 794589 removed → not listed
    expect(R["SG.s10"].body.projects.map(p => p.projectCode)).toEqual(["794589"]);                                        // legacy scalar class
    expect(R["SG.s11"].body.projects.map(p => p.projectCode)).toEqual(["899373", "883589"]);
    expect(R["SG.nobody"].status).toBe(401);
    // P7b: the V1 class with progress is shown restarted from zero on the condensed set (the read writes nothing)
    expect(R["SG.s7"].body.projects[0].summary.trackProgress.book).toBe(0); expect(R["SG.s7"].body.projects[0].nextStages.book.stageId).toBe("BK01"); expect(touched(R["SG.s7"])).toEqual([]);
  });
});

describe("C. convergence guard — business logic lives once (fails on unpatched main)", () => {
  const generic = SRC("src/functions/project-tracker.js");
  const service = SRC("src/lib/project-tracker/service.js"), legacyAnalytics = SRC("src/lib/project-794589-analytics.js"), shapeSrc = SRC("src/lib/project-794589-legacy-shape.js");
  it("C1 the shared service exports the extracted operations and returns domain results (no HTTP)", () => {
    const svc = require("../src/lib/project-tracker/service.js");
    for (const fn of ["listProjectClasses", "ensureClassConfig", "readClassConfig", "readClassView", "updateStudentProgress", "resetProject", "updateTemplate", "loadStudentProgress"]) expect(typeof svc[fn]).toBe("function");
    expect(service).not.toMatch(/status:\s*\d{3}/); expect(service).not.toContain("jsonBody");
  });
  it("C2 Phase P-9: the legacy routes are gone (one route per audience serves every project, 794589 included)", () => {
    expect(existsSync(new URL("../src/functions/project-794589.js", import.meta.url))).toBe(false);
    expect(existsSync(new URL("../src/functions/student-project.js", import.meta.url))).toBe(false);
  });
  it("C3 the generic route uses the same service operations (no inline mutation / deletion); its reads use the read-only twin", () => {
    for (const dup of ["mutateJsonWithRetry(", "deleteBlob(", "listBlobNames(", "uploadJson("]) expect(generic).not.toContain(dup);
    // Phase P7: the reads use readClassView (readClassConfig plus the progress view of a pending conversion), never ensureClassConfig
    for (const use of ["svc.updateStudentProgress(", "svc.resetProject(", "svc.updateTemplate(", "svc.listProjectClasses(", "svc.readClassView("]) expect(generic).toContain(use);
    expect(generic).not.toContain("createSnapshot");                                 // generic first-create shape = service default
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
