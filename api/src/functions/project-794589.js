// LEGACY teacher route for Project 794589 (/api/project-794589). Kept for compatibility: its URL, status codes,
// Arabic messages, response field names (bookProgress / packetTracerProgress / nextBookStage / nextPacketTracerStage /
// legacy balance), audit targetIds/details and observability event are the pre-Roadmap-#33 contract, unchanged.
//
// Roadmap #33 — Legacy 794589 Convergence: the BUSINESS LOGIC (snapshot lazy-create + version-aware upgrade,
// class catalogue, student listing, progress loading, progress mutation, reset, template patch) lives ONCE in
// lib/project-tracker/service.js and the generic engine (lib/project-tracker/core + analytics), parameterized by
// projectCode "794589" whose registry namespace is the historical, un-namespaced blob paths. The legacy shapes are
// produced by the pure formatters in lib/project-794589-legacy-shape.js. Two legacy-only semantics stay in THIS
// handler on purpose: (1) an un-enrolled class is refused with 403 + the 794589 message, (2) resource=student for a
// non-member id (foreign/archived/unknown) answers 200 with a blank student — a known legacy limitation recorded for
// the Final Architecture Audit, deliberately not "fixed" here (the generic route keeps its 404).
const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { getContainer, StorageConflictError } = require("../lib/platform-storage");
const { recordAuditEvent } = require("../lib/audit-log");
const { normalizeClassStatus } = require("../lib/class-lifecycle");
const { isStudentClassMember } = require("../lib/class-membership");
const { PROGRAM_CODE, buildClassSnapshotFromDefault } = require("../lib/project-794589-template");
const { classHasProject } = require("../lib/project-tracker/class-programs");
const svc = require("../lib/project-tracker/service");
const core = require("../lib/project-tracker/core");
const analytics = require("../lib/project-tracker/analytics");
const shape = require("../lib/project-794589-legacy-shape");

const CONFLICT_MESSAGE = "حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.";
// First-create snapshots on this route keep the HISTORICAL legacy document shape (programCode, no tracks).
const LEGACY_SNAPSHOT = { createSnapshot: buildClassSnapshotFromDefault };

function legacyStudentDetail(workDef, config, readOnly, student, progress, now) {
  const summary = core.buildStudentSummary(workDef, progress, now);
  return {
    ok: true, readOnly,
    student,
    summary: shape.legacyStudentSummary(summary),
    stages: config.stages,
    groups: config.groups,
    trackWeights: config.trackWeights,
    config: config.config,
    progress: progress ? progress.stages : {},
    history: progress ? (progress.history || []) : [],
    ...shape.legacyNextStages(core.getNextStages(workDef, progress)),
    balance: shape.legacyBalance(core.getBalanceInsight(summary.trackProgress, workDef))
  };
}

// `deps` is an optional dependency-injection seam for unit tests (production passes nothing, so the real
// implementations are used). It does not change runtime behavior.
async function handler(request, deps = {}, obs = null) {
    const rec = deps.recordAuditEvent || recordAuditEvent;
    try {
      const auth = (deps.requireBuilderAuth || requireBuilderAuth)(request);
      if (!auth.ok) return auth.response;
      const container = deps.container || (deps.getContainer || getContainer)();
      const now = new Date().toISOString();

      if (request.method === "GET") {
        const url = new URL(request.url);
        const resource = String(url.searchParams.get("resource") || "").trim();
        const classId = String(url.searchParams.get("classId") || "").trim();

        // Catalog of 794589 classes for the class selector (no classId needed). The shared catalogue applies the
        // canonical enrollment predicate (modern programCodes[] or the legacy programCode) — never raw equality.
        if (resource === "classes") {
          const classes = await svc.listProjectClasses(container, PROGRAM_CODE);
          return { status: 200, jsonBody: { ok: true, classes } };
        }

        if (!classId) return { status: 400, jsonBody: { ok: false, error: "classId مطلوب." } };
        const classroom = await svc.loadClassroom(container, classId);
        if (!classroom) return { status: 404, jsonBody: { ok: false, error: "الصف غير موجود." } };
        // Multi-project enrollment gate: this legacy route only serves a class enrolled in 794589
        // (via modern programCodes[] or the legacy programCode). A class whose 794589 link was
        // removed (or that never had it) has no project section here.
        if (!classHasProject(classroom, PROGRAM_CODE)) {
          return { status: 403, jsonBody: { ok: false, error: "الصف غير مسجَّل في مشروع 794589." } };
        }
        const readOnly = normalizeClassStatus(classroom) === "archived";
        const config = await svc.ensureClassConfig(container, PROGRAM_CODE, classroom, LEGACY_SNAPSHOT);
        const workDef = svc.workingDefinition(PROGRAM_CODE, config);

        if (resource === "template") {
          return { status: 200, jsonBody: { ok: true, template: config, readOnly } };
        }

        // A single student's file: load just that one user blob directly (addressed by id) instead
        // of scanning every platform user — the old full scan made opening a student file slow.
        if (resource === "student") {
          const studentId = String(url.searchParams.get("studentId") || "").trim();
          if (!studentId) return { status: 400, jsonBody: { ok: false, error: "studentId مطلوب." } };
          const u = await svc.loadStudentUser(container, studentId);
          // Canonical read-side membership (Roadmap #24): role student, NOT archived, in this class.
          // A login-disabled student is still a member; an archived one is not (parity with project-tracker).
          // LEGACY LIMITATION (kept, see header): a non-member id still answers 200 with a blank student.
          const belongs = isStudentClassMember(u, classId);
          const student = belongs
            ? { studentId: u.userId, displayName: u.displayName || (u.firstName + " " + u.familyName).trim(), code: u.code }
            : { studentId, displayName: "", code: "" };
          const progress = await svc.loadStudentProgress(container, PROGRAM_CODE, classId, studentId);
          return { status: 200, jsonBody: legacyStudentDetail(workDef, config, readOnly, student, progress, now) };
        }

        const students = await svc.listClassStudents(container, classId);

        if (resource === "summary") {
          const entries = await svc.loadProgressEntries(container, PROGRAM_CODE, classId, students);
          const summary = shape.legacyClassSummary(analytics.buildClassSummary(workDef, entries, now));
          return { status: 200, jsonBody: { ok: true, summary, readOnly, className: classroom.name, schoolYear: classroom.schoolYear } };
        }

        if (resource === "students") {
          const entries = await svc.loadProgressEntries(container, PROGRAM_CODE, classId, students);
          const cards = entries.map(e => ({
            studentId: e.studentId, displayName: e.displayName, code: e.code,
            ...shape.legacyStudentSummary(core.buildStudentSummary(workDef, e.progress, now))
          }));
          return { status: 200, jsonBody: { ok: true, students: cards, readOnly } };
        }

        if (resource === "analytics") {
          const entries = await svc.loadProgressEntries(container, PROGRAM_CODE, classId, students);
          return { status: 200, jsonBody: { ok: true, analytics: shape.legacyAnalytics(analytics.buildAnalytics(workDef, entries, now)), readOnly } };
        }

        return { status: 400, jsonBody: { ok: false, error: "resource غير معروف." } };
      }

      // ---- POST ----
      let body = {};
      try { body = await request.json(); } catch { body = {}; }
      const action = String(body.action || "").trim().toLowerCase();
      const classId = String(body.classId || "").trim();
      if (!classId) return { status: 400, jsonBody: { ok: false, error: "classId مطلوب." } };
      const classroom = await svc.loadClassroom(container, classId);
      if (!classroom) return { status: 404, jsonBody: { ok: false, error: "الصف غير موجود." } };

      // Multi-project enrollment gate: every write here (project.reset included) requires the class
      // to be enrolled in 794589. Removing the 794589 link blocks these routes without touching the
      // class's stored 794589 snapshot/progress.
      if (!classHasProject(classroom, PROGRAM_CODE)) {
        return { status: 403, jsonBody: { ok: false, error: "الصف غير مسجَّل في مشروع 794589." } };
      }

      // Every write is blocked on an archived class (read-only history).
      if (normalizeClassStatus(classroom) === "archived") {
        return { status: 403, jsonBody: { ok: false, error: "الصف مؤرشف — المتابعة للقراءة فقط." } };
      }

      if (action === "project.reset") {
        // Wipes ONLY this class's Project-794589 data: its snapshot + every student progress blob.
        // The classroom and the student accounts are NOT touched. Next open re-seeds a fresh V2
        // snapshot with all stages not_started. Blocked on archived classes by the check above.
        const { deletedProgressCount } = await svc.resetProject(container, PROGRAM_CODE, classId);
        await rec(container, {
          actor: auth.user?.sub, action: "project.reset",
          targetType: "project-tracker", targetId: classId, targetLabel: classroom.name || "",
          details: { deletedProgressCount }
        });
        return { status: 200, jsonBody: { ok: true, deletedProgressCount } };
      }

      if (action === "program.activate") {
        const config = await svc.ensureClassConfig(container, PROGRAM_CODE, classroom, LEGACY_SNAPSHOT);
        return { status: 200, jsonBody: { ok: true, template: config } };
      }

      if (action === "progress.update") {
        const studentId = String(body.studentId || "").trim();
        const stageId = String(body.stageId || "").trim();
        if (!studentId || !stageId) return { status: 400, jsonBody: { ok: false, error: "studentId وstageId مطلوبان." } };
        try {
          // Membership check BEFORE any mutate (parity with the generic project-tracker route): an
          // arbitrary/foreign/archived studentId can never create a ghost progress blob under this class.
          const result = await svc.updateStudentProgress(container, PROGRAM_CODE, classroom, {
            studentId, stageId, status: body.status, note: body.note, score: body.score, actor: auth.user?.sub, now
          }, LEGACY_SNAPSHOT);
          if (!result.ok && result.reason === "not_member") return { status: 404, jsonBody: { ok: false, error: "الطالب غير موجود في هذا الصف." } };
          if (!result.ok) return { status: 400, jsonBody: { ok: false, error: "المرحلة غير موجودة أو غير مفعّلة." } };
          const { workDef, stage, written, outcome } = result;
          const summary = core.buildStudentSummary(workDef, written, now);
          if (outcome.statusChanged) {
            await rec(container, {
              actor: auth.user?.sub,
              action: outcome.toStatus === "approved" ? "project.stage.approve" : "project.stage.status_change",
              targetType: "project-stage", targetId: classId + "/" + studentId + "/" + stageId,
              targetLabel: stage.title, details: { fromStatus: outcome.fromStatus, toStatus: outcome.toStatus }
            });
          }
          if (outcome.noteChanged) {
            await rec(container, {
              actor: auth.user?.sub, action: "project.stage.note",
              targetType: "project-stage", targetId: classId + "/" + studentId + "/" + stageId, targetLabel: stage.title
            });
          }
          if (outcome.scoreChanged) {
            await rec(container, {
              actor: auth.user?.sub, action: "project.stage.score",
              targetType: "project-stage", targetId: classId + "/" + studentId + "/" + stageId, targetLabel: stage.title,
              details: { projectCode: PROGRAM_CODE, classId, studentId, stageId, oldScore: outcome.fromScore, newScore: outcome.toScore }
            });
          }
          // Return the full set of derived fields the detail view shows, so the client can update
          // in place WITHOUT a second (expensive) resource=student round-trip.
          return {
            status: 200,
            jsonBody: {
              ok: true,
              summary: shape.legacyStudentSummary(summary),
              stage: { stageId, ...written.stages[stageId] },
              ...shape.legacyNextStages(core.getNextStages(workDef, written)),
              balance: shape.legacyBalance(core.getBalanceInsight(summary.trackProgress, workDef)),
              history: (written.history || []).slice(-20)
            }
          };
        } catch (e) {
          if (e && e.code === "NO_CHANGE") return { status: 200, jsonBody: { ok: true, noChange: true } };
          if (e instanceof StorageConflictError) return { status: 503, jsonBody: { ok: false, error: CONFLICT_MESSAGE } };
          if (e && e.httpStatus) return { status: e.httpStatus, jsonBody: { ok: false, error: e.message } };
          throw e;
        }
      }

      if (action === "template.update") {
        const patch = body.template && typeof body.template === "object" ? body.template : {};
        try {
          const written = await svc.updateTemplate(container, PROGRAM_CODE, classId, patch, now, LEGACY_SNAPSHOT);
          await rec(container, {
            actor: auth.user?.sub, action: "project.template.update",
            targetType: "project-template", targetId: classId, targetLabel: classroom.name || ""
          });
          return { status: 200, jsonBody: { ok: true, template: written } };
        } catch (e) {
          if (e instanceof StorageConflictError) return { status: 503, jsonBody: { ok: false, error: CONFLICT_MESSAGE } };
          throw e;
        }
      }

      return { status: 400, jsonBody: { ok: false, error: "إجراء غير معروف." } };
    } catch (e) {
      obs?.logError("project.legacy794589.error", e);
      return { status: 500, jsonBody: { ok: false, error: "تعذر تنفيذ عملية متابعة المشروع حاليًا." } };
    }
}

app.http("project794589", { methods: ["GET", "POST"], authLevel: "anonymous", route: "project-794589", handler: withObservability("project-794589", handler) });
module.exports = { handler };
