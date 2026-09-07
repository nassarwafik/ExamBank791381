// Generic teacher-side Project Tracker API. Serves ANY project in the registry (currently 794589,
// 899373, 883589) via ?projectCode=. Mirrors the capabilities of the 794589 route but data-driven:
// summary / students / student / analytics / template (GET) and program.activate / progress.update /
// project.reset / template.update (POST). Storage is namespaced per project (794589 => legacy paths),
// so a write to one project can never touch another. The dedicated project-794589 route stays as-is.
const { app } = require("@azure/functions");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { getContainer, downloadJsonOrNull, uploadJson, listJson, listBlobNames, deleteBlob, mutateJsonWithRetry, StorageConflictError } = require("../lib/platform-storage");
const { recordAuditEvent } = require("../lib/audit-log");
const { normalizeClassStatus } = require("../lib/class-lifecycle");
const { isSupportedProject, getProjectDefinition, getStorageNamespace, getProjectMeta, getSupportedProjects } = require("../lib/project-tracker/registry");
const svc = require("../lib/project-tracker/service");
const core = require("../lib/project-tracker/core");
const analytics = require("../lib/project-tracker/analytics");

const CLASS_PREFIX = "platform/classes/";
const CONFLICT_MESSAGE = "حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.";

function studentDetailBody(projectCode, workDef, config, readOnly, student, progress, now) {
  const summary = core.buildStudentSummary(workDef, progress, now);
  return {
    ok: true, readOnly, projectCode,
    student,
    tracks: workDef.tracks,
    summary,
    stages: config.stages,
    groups: config.groups,
    trackWeights: config.trackWeights,
    config: config.config,
    progress: progress ? progress.stages : {},
    history: progress ? (progress.history || []) : [],
    nextStages: core.getNextStages(workDef, progress),
    balance: core.getBalanceInsight(summary.trackProgress, workDef)
  };
}

app.http("projectTracker", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  route: "project-tracker",
  handler: async request => {
    try {
      const auth = requireBuilderAuth(request);
      if (!auth.ok) return auth.response;
      const container = getContainer();
      const now = new Date().toISOString();

      // ---- resolve projectCode (from query for GET, body for POST) ----
      let projectCode = "";
      let body = {};
      if (request.method === "POST") {
        try { body = await request.json(); } catch { body = {}; }
        projectCode = String(body.projectCode || "").trim();
      } else {
        projectCode = String(new URL(request.url).searchParams.get("projectCode") || "").trim();
      }

      // The catalogue of all supported projects (no projectCode needed) — used by the projects hub.
      if (request.method === "GET" && String(new URL(request.url).searchParams.get("resource") || "") === "projects") {
        return { status: 200, jsonBody: { ok: true, projects: getSupportedProjects().map(getProjectMeta) } };
      }

      // Global teacher "ready for review" queue across ALL projects, ACTIVE classes only. Aggregated
      // fully server-side in a single request (the frontend never fans out project×class×student).
      // Counts ready_for_review stages straight from progress blobs (no config load, no summary math).
      if (request.method === "GET" && String(new URL(request.url).searchParams.get("resource") || "") === "projects-summary") {
        const classrooms = (await listJson(container, CLASS_PREFIX)).filter(Boolean);
        const byProject = {};
        let total = 0;
        for (const code of getSupportedProjects()) {
          byProject[code] = 0;
          const ns = getStorageNamespace(code);
          const active = classrooms.filter(c => String(c.programCode || "") === code && normalizeClassStatus(c) === "active");
          for (const c of active) {
            const docs = await listJson(container, ns.progressPrefix(c.classId));
            for (const doc of docs) {
              const stages = (doc && doc.stages) || {};
              for (const k of Object.keys(stages)) if (stages[k] && stages[k].status === "ready_for_review") { byProject[code] += 1; total += 1; }
            }
          }
        }
        return { status: 200, jsonBody: { ok: true, totalReadyForReview: total, byProject } };
      }

      if (!projectCode) return { status: 400, jsonBody: { ok: false, error: "projectCode مطلوب." } };
      if (!isSupportedProject(projectCode)) return { status: 400, jsonBody: { ok: false, error: "مشروع غير مدعوم." } };
      const definition = getProjectDefinition(projectCode);

      if (request.method === "GET") {
        const url = new URL(request.url);
        const resource = String(url.searchParams.get("resource") || "").trim();
        const classId = String(url.searchParams.get("classId") || "").trim();

        // Classes enrolled in THIS project (for the class selector). No classId needed.
        if (resource === "classes") {
          const classes = (await listJson(container, CLASS_PREFIX))
            .filter(c => c && String(c.programCode || "") === projectCode)
            .map(c => ({
              classId: c.classId, name: c.name, grade: c.grade, schoolYear: c.schoolYear,
              status: normalizeClassStatus(c), archivedAt: c.archivedAt || "", studentCount: Array.isArray(c.studentIds) ? c.studentIds.length : 0
            }))
            .sort((a, b) => String(b.schoolYear).localeCompare(String(a.schoolYear)));
          return { status: 200, jsonBody: { ok: true, projectCode, title: definition.title, tracks: definition.tracks, classes } };
        }

        if (!classId) return { status: 400, jsonBody: { ok: false, error: "classId مطلوب." } };
        const classroom = await svc.loadClassroom(container, classId);
        if (!classroom) return { status: 404, jsonBody: { ok: false, error: "الصف غير موجود." } };
        if (String(classroom.programCode || "") !== projectCode) return { status: 400, jsonBody: { ok: false, error: "الصف غير مسجَّل في هذا المشروع." } };
        const readOnly = normalizeClassStatus(classroom) === "archived";
        const config = await svc.ensureClassConfig(container, projectCode, classroom);
        const workDef = svc.workingDefinition(projectCode, config);

        if (resource === "template") {
          return { status: 200, jsonBody: { ok: true, projectCode, template: config, tracks: definition.tracks, readOnly } };
        }

        // Single student: load just that user blob (no full-user scan).
        if (resource === "student") {
          const studentId = String(url.searchParams.get("studentId") || "").trim();
          if (!studentId) return { status: 400, jsonBody: { ok: false, error: "studentId مطلوب." } };
          // Membership check BEFORE reading any progress — no cross-class reads.
          const membership = await svc.requireStudentInClass(container, studentId, classId);
          if (!membership.ok) return { status: 404, jsonBody: { ok: false, error: "الطالب غير موجود في هذا الصف." } };
          const ns = getStorageNamespace(projectCode);
          const progress = await downloadJsonOrNull(container, ns.progressName(classId, studentId));
          return { status: 200, jsonBody: studentDetailBody(projectCode, workDef, config, readOnly, membership.student, progress, now) };
        }

        const students = await svc.listClassStudents(container, classId);

        if (resource === "summary") {
          const entries = await svc.loadProgressEntries(container, projectCode, classId, students);
          const summary = analytics.buildClassSummary(workDef, entries, now);
          return { status: 200, jsonBody: { ok: true, projectCode, summary, tracks: definition.tracks, readOnly, className: classroom.name, schoolYear: classroom.schoolYear } };
        }
        if (resource === "students") {
          const entries = await svc.loadProgressEntries(container, projectCode, classId, students);
          const cards = entries.map(e => ({ studentId: e.studentId, displayName: e.displayName, code: e.code, ...core.buildStudentSummary(workDef, e.progress, now) }));
          return { status: 200, jsonBody: { ok: true, projectCode, students: cards, tracks: definition.tracks, config: config.config, readOnly } };
        }
        if (resource === "analytics") {
          const entries = await svc.loadProgressEntries(container, projectCode, classId, students);
          return { status: 200, jsonBody: { ok: true, projectCode, analytics: analytics.buildAnalytics(workDef, entries, now), tracks: definition.tracks, groups: config.groups, readOnly } };
        }
        return { status: 400, jsonBody: { ok: false, error: "resource غير معروف." } };
      }

      // ---- POST ----
      const action = String(body.action || "").trim().toLowerCase();
      const classId = String(body.classId || "").trim();
      if (!classId) return { status: 400, jsonBody: { ok: false, error: "classId مطلوب." } };
      const classroom = await svc.loadClassroom(container, classId);
      if (!classroom) return { status: 404, jsonBody: { ok: false, error: "الصف غير موجود." } };
      if (String(classroom.programCode || "") !== projectCode) return { status: 400, jsonBody: { ok: false, error: "الصف غير مسجَّل في هذا المشروع." } };

      // Every write is blocked on an archived class (read-only history preserved).
      if (normalizeClassStatus(classroom) === "archived") {
        return { status: 403, jsonBody: { ok: false, error: "الصف مؤرشف — المتابعة للقراءة فقط." } };
      }

      const ns = getStorageNamespace(projectCode);

      if (action === "program.activate") {
        const config = await svc.ensureClassConfig(container, projectCode, classroom);
        return { status: 200, jsonBody: { ok: true, projectCode, template: config } };
      }

      if (action === "project.reset") {
        // Wipes ONLY this project's data for this class (snapshot + all student progress under this
        // project's namespace). Class, students, assignments, exams and OTHER projects are untouched.
        const progressBlobs = await listBlobNames(container, ns.progressPrefix(classId));
        for (const name of progressBlobs) await deleteBlob(container, name);
        await deleteBlob(container, ns.configName(classId));
        await recordAuditEvent(container, {
          actor: auth.user?.sub, action: "project.reset",
          targetType: "project-tracker", targetId: projectCode + "/" + classId, targetLabel: classroom.name || "",
          details: { projectCode, deletedProgressCount: progressBlobs.length }
        });
        return { status: 200, jsonBody: { ok: true, projectCode, deletedProgressCount: progressBlobs.length } };
      }

      if (action === "progress.update") {
        const studentId = String(body.studentId || "").trim();
        const stageId = String(body.stageId || "").trim();
        if (!studentId || !stageId) return { status: 400, jsonBody: { ok: false, error: "studentId وstageId مطلوبان." } };
        // Membership check BEFORE any mutate — an arbitrary/foreign studentId can never create a
        // ghost progress blob.
        const membership = await svc.requireStudentInClass(container, studentId, classId);
        if (!membership.ok) return { status: 404, jsonBody: { ok: false, error: "الطالب غير موجود في هذا الصف." } };
        const config = await svc.ensureClassConfig(container, projectCode, classroom);
        const workDef = svc.workingDefinition(projectCode, config);
        const stage = (config.stages || []).find(s => s.stageId === stageId && s.active === true);
        if (!stage) return { status: 400, jsonBody: { ok: false, error: "المرحلة غير موجودة أو غير مفعّلة." } };

        let outcome = null;
        try {
          const written = await mutateJsonWithRetry(container, ns.progressName(classId, studentId), current =>
            (outcome = core.applyProgressUpdate(current, {
              stageId, status: body.status, note: body.note, actor: auth.user?.sub, now,
              programCode: projectCode, classId, studentId
            })).doc
          );
          const summary = core.buildStudentSummary(workDef, written, now);
          if (outcome.statusChanged) {
            await recordAuditEvent(container, {
              actor: auth.user?.sub,
              action: outcome.toStatus === "approved" ? "project.stage.approve" : "project.stage.status_change",
              targetType: "project-stage", targetId: projectCode + "/" + classId + "/" + studentId + "/" + stageId,
              targetLabel: stage.title, details: { projectCode, fromStatus: outcome.fromStatus, toStatus: outcome.toStatus }
            });
          }
          if (outcome.noteChanged) {
            await recordAuditEvent(container, {
              actor: auth.user?.sub, action: "project.stage.note",
              targetType: "project-stage", targetId: projectCode + "/" + classId + "/" + studentId + "/" + stageId, targetLabel: stage.title, details: { projectCode }
            });
          }
          return {
            status: 200,
            jsonBody: {
              ok: true, projectCode,
              summary,
              stage: { stageId, ...written.stages[stageId] },
              nextStages: core.getNextStages(workDef, written),
              balance: core.getBalanceInsight(summary.trackProgress, workDef),
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
          const written = await mutateJsonWithRetry(container, ns.configName(classId), current => {
            const config = current || svc.buildClassSnapshot(getProjectDefinition(projectCode), classId, now);
            if (Array.isArray(patch.stages)) config.stages = patch.stages;
            if (Array.isArray(patch.groups)) config.groups = patch.groups;
            if (patch.trackWeights && typeof patch.trackWeights === "object") config.trackWeights = patch.trackWeights;
            if (patch.config && typeof patch.config === "object") config.config = { ...config.config, ...patch.config };
            config.updatedAt = now;
            return config;
          });
          await recordAuditEvent(container, {
            actor: auth.user?.sub, action: "project.template.update",
            targetType: "project-template", targetId: projectCode + "/" + classId, targetLabel: classroom.name || "", details: { projectCode }
          });
          return { status: 200, jsonBody: { ok: true, projectCode, template: written } };
        } catch (e) {
          if (e instanceof StorageConflictError) return { status: 503, jsonBody: { ok: false, error: CONFLICT_MESSAGE } };
          throw e;
        }
      }

      return { status: 400, jsonBody: { ok: false, error: "إجراء غير معروف." } };
    } catch {
      return { status: 500, jsonBody: { ok: false, error: "تعذر تنفيذ عملية متابعة المشروع حاليًا." } };
    }
  }
});
