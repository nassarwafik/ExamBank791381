// Generic teacher-side Project Tracker API. Serves ANY project in the registry (currently 794589,
// 899373, 883589) via ?projectCode=. Mirrors the capabilities of the 794589 route but data-driven:
// summary / students / student / analytics / template (GET) and program.activate / progress.update /
// project.reset / template.update (POST). Storage is namespaced per project (794589 => legacy paths),
// so a write to one project can never touch another. The dedicated project-794589 route stays as-is.
// Roadmap #33: the write operations and the class catalogue are shared with the legacy route through
// lib/project-tracker/service.js (domain results only); this handler owns every status code, message, body
// shape and audit record, all unchanged.
const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { recordProjectMilestones } = require("../lib/achievement-milestones");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { getContainer, downloadJsonOrNull, listJson, StorageConflictError } = require("../lib/platform-storage");
const { recordAuditEvent } = require("../lib/audit-log");
const { normalizeClassStatus } = require("../lib/class-lifecycle");
const { isSupportedProject, getProjectDefinition, getStorageNamespace, getProjectMeta, getSupportedProjects } = require("../lib/project-tracker/registry");
const svc = require("../lib/project-tracker/service");
const core = require("../lib/project-tracker/core");
const performance = require("../lib/project-tracker/performance");
const { buildProjectEvaluation } = require("../lib/project-tracker/evaluation");
const { SCORE_ERROR } = require("../lib/project-tracker/score");
const analytics = require("../lib/project-tracker/analytics");
const { countReadyStages } = require("../lib/project-tracker/ready-count");
const { classHasProject } = require("../lib/project-tracker/class-programs");

const CLASS_PREFIX = "platform/classes/";
const CONFLICT_MESSAGE = "حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.";

function studentDetailBody(projectCode, workDef, config, readOnly, student, progress, now) {
  const summary = core.buildStudentSummary(workDef, progress, now);
  return {
    ok: true, readOnly, projectCode,
    student,
    tracks: workDef.tracks,
    summary,
    // Project performance (grade / project Strength / per-stage value) from the ONE calculator — display-only downstream.
    performance: performance.buildProjectPerformanceSummary(workDef, progress, now, summary),
    // Phase 9B — the EVALUATION axis (graded / ungraded active stages, average of graded scores): derived from the
    // same document, additive to the response, never fed into progress / grade / Strength.
    evaluation: buildProjectEvaluation(workDef, progress),
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

// Phase 9B — narrow score mutations: `score.set` / `score.clear` carry ONLY (studentId, stageId[, score]) and run
// through the SAME canonical pipeline as progress.update (membership → snapshot → active stage → CAS merge of ONE
// stage entry via applyProgressUpdate — the document is never replaced as a whole). A body that also tries to change
// the status or the note is refused (400): a score action never changes the workflow.
const SCORE_ACTIONS = { "score.set": "set", "score.clear": "clear" };
function scoreActionInput(action, body) {
  const studentId = String(body.studentId || "").trim();
  const stageId = String(body.stageId || "").trim();
  if (!studentId || !stageId) return { error: "studentId وstageId مطلوبان." };
  if (body.status !== undefined || body.note !== undefined) return { error: "هذا الإجراء يقبل العلامة فقط." };
  if (SCORE_ACTIONS[action] === "clear") return { studentId, stageId, score: null };
  if (body.score === undefined || body.score === null || body.score === "") return { error: SCORE_ERROR };
  return { studentId, stageId, score: body.score };
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
      // Uses the SAME exactness as the ready report: only current class members (non-archived) and
      // only stages that exist & are active in the class snapshot are counted.
      if (request.method === "GET" && String(new URL(request.url).searchParams.get("resource") || "") === "projects-summary") {
        const classrooms = (await listJson(container, CLASS_PREFIX)).filter(Boolean);
        const allUsers = await listJson(container, svc.USER_PREFIX);
        const usersById = new Map(allUsers.filter(u => u && u.role === "student").map(u => [String(u.userId), u]));
        const byProject = {};
        let total = 0;
        for (const code of getSupportedProjects()) {
          byProject[code] = 0;
          const ns = getStorageNamespace(code);
          const active = classrooms.filter(c => classHasProject(c, code) && normalizeClassStatus(c) === "active");
          for (const c of active) {
            const snapshot = (await downloadJsonOrNull(container, ns.configName(c.classId))) || svc.buildClassSnapshot(getProjectDefinition(code), c.classId, now);
            const activeStageIds = new Set((snapshot.stages || []).filter(s => s.active === true).map(s => s.stageId));
            const docs = await listJson(container, ns.progressPrefix(c.classId));
            const n = countReadyStages(docs, activeStageIds, sid => svc.studentBelongsToClass(usersById.get(String(sid)), c.classId));
            byProject[code] += n;
            total += n;
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
          const classes = await svc.listProjectClasses(container, projectCode);
          return { status: 200, jsonBody: { ok: true, projectCode, title: definition.title, tracks: definition.tracks, classes } };
        }

        if (!classId) return { status: 400, jsonBody: { ok: false, error: "classId مطلوب." } };
        const classroom = await svc.loadClassroom(container, classId);
        if (!classroom) return { status: 404, jsonBody: { ok: false, error: "الصف غير موجود." } };
        if (!classHasProject(classroom, projectCode)) return { status: 400, jsonBody: { ok: false, error: "الصف غير مسجَّل في هذا المشروع." } };
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
          const progress = await svc.loadStudentProgress(container, projectCode, classId, studentId);
          return { status: 200, jsonBody: studentDetailBody(projectCode, workDef, config, readOnly, membership.student, progress, now) };
        }
        // Phase 9B — the evaluation of ONE student in ONE project (narrow read; same membership gate as `student`).
        if (resource === "evaluation") {
          const studentId = String(url.searchParams.get("studentId") || "").trim();
          if (!studentId) return { status: 400, jsonBody: { ok: false, error: "studentId مطلوب." } };
          const membership = await svc.requireStudentInClass(container, studentId, classId);
          if (!membership.ok) return { status: 404, jsonBody: { ok: false, error: "الطالب غير موجود في هذا الصف." } };
          const progress = await svc.loadStudentProgress(container, projectCode, classId, studentId);
          return { status: 200, jsonBody: { ok: true, projectCode, classId, readOnly, student: membership.student, evaluation: buildProjectEvaluation(workDef, progress) } };
        }

        const students = await svc.listClassStudents(container, classId);

        if (resource === "summary") {
          const entries = await svc.loadProgressEntries(container, projectCode, classId, students);
          const summary = analytics.buildClassSummary(workDef, entries, now);
          return { status: 200, jsonBody: { ok: true, projectCode, summary, tracks: definition.tracks, readOnly, className: classroom.name, schoolYear: classroom.schoolYear } };
        }
        if (resource === "students") {
          const entries = await svc.loadProgressEntries(container, projectCode, classId, students);
          const cards = entries.map(e => {
            const summary = core.buildStudentSummary(workDef, e.progress, now);
            const perf = performance.buildProjectPerformanceSummary(workDef, e.progress, now, summary);
            return { studentId: e.studentId, displayName: e.displayName, code: e.code, ...summary, grade: perf.grade, projectStrength: perf.projectStrength, projectTier: perf.tier };
          });
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
      if (!classHasProject(classroom, projectCode)) return { status: 400, jsonBody: { ok: false, error: "الصف غير مسجَّل في هذا المشروع." } };

      // Every write is blocked on an archived class (read-only history preserved).
      if (normalizeClassStatus(classroom) === "archived") {
        return { status: 403, jsonBody: { ok: false, error: "الصف مؤرشف — المتابعة للقراءة فقط." } };
      }

      if (action === "program.activate") {
        const config = await svc.ensureClassConfig(container, projectCode, classroom);
        return { status: 200, jsonBody: { ok: true, projectCode, template: config } };
      }

      if (action === "project.reset") {
        // Wipes ONLY this project's data for this class (snapshot + all student progress under this
        // project's namespace). Class, students, assignments, exams and OTHER projects are untouched.
        const { deletedProgressCount } = await svc.resetProject(container, projectCode, classId);
        await rec(container, {
          actor: auth.user?.sub, action: "project.reset",
          targetType: "project-tracker", targetId: projectCode + "/" + classId, targetLabel: classroom.name || "",
          details: { projectCode, deletedProgressCount }
        });
        return { status: 200, jsonBody: { ok: true, projectCode, deletedProgressCount } };
      }

      if (action === "progress.update") {
        const studentId = String(body.studentId || "").trim();
        const stageId = String(body.stageId || "").trim();
        if (!studentId || !stageId) return { status: 400, jsonBody: { ok: false, error: "studentId وstageId مطلوبان." } };
        try {
          // Membership check BEFORE any mutate — an arbitrary/foreign studentId can never create a
          // ghost progress blob (shared pipeline: membership → snapshot → active stage → CAS mutation).
          const result = await svc.updateStudentProgress(container, projectCode, classroom, {
            studentId, stageId, status: body.status, note: body.note, score: body.score, actor: auth.user?.sub, now
          });
          if (!result.ok && result.reason === "not_member") return { status: 404, jsonBody: { ok: false, error: "الطالب غير موجود في هذا الصف." } };
          if (!result.ok) return { status: 400, jsonBody: { ok: false, error: "المرحلة غير موجودة أو غير مفعّلة." } };
          const { workDef, stage, written, previous, outcome } = result;
          const summary = core.buildStudentSummary(workDef, written, now);
          // Project milestones (project rank-up / completion) from the SAME before/after docs of this write — best-effort.
          await (deps.recordProjectMilestones || recordProjectMilestones)(container, { classId, student: { ...result.student, shareAchievements: result.shareAchievements }, projectCode: projectCode, projectTitle: definition.title, workDef, before: previous, after: written, now });
          if (outcome.statusChanged) {
            await rec(container, {
              actor: auth.user?.sub,
              action: outcome.toStatus === "approved" ? "project.stage.approve" : "project.stage.status_change",
              targetType: "project-stage", targetId: projectCode + "/" + classId + "/" + studentId + "/" + stageId,
              targetLabel: stage.title, details: { projectCode, fromStatus: outcome.fromStatus, toStatus: outcome.toStatus }
            });
          }
          if (outcome.noteChanged) {
            await rec(container, {
              actor: auth.user?.sub, action: "project.stage.note",
              targetType: "project-stage", targetId: projectCode + "/" + classId + "/" + studentId + "/" + stageId, targetLabel: stage.title, details: { projectCode }
            });
          }
          if (outcome.scoreChanged) {
            await rec(container, {
              actor: auth.user?.sub, action: "project.stage.score",
              targetType: "project-stage", targetId: projectCode + "/" + classId + "/" + studentId + "/" + stageId, targetLabel: stage.title,
              details: { projectCode, classId, studentId, stageId, oldScore: outcome.fromScore, newScore: outcome.toScore }
            });
          }
          return {
            status: 200,
            jsonBody: {
              ok: true, projectCode,
              summary,
              performance: performance.buildProjectPerformanceSummary(workDef, written, now, summary),
              evaluation: buildProjectEvaluation(workDef, written),
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

      if (SCORE_ACTIONS[action]) {
        const input = scoreActionInput(action, body);
        if (input.error) return { status: 400, jsonBody: { ok: false, error: input.error } };
        try {
          const result = await svc.updateStudentProgress(container, projectCode, classroom, { studentId: input.studentId, stageId: input.stageId, score: input.score, actor: auth.user?.sub, now });
          if (!result.ok && result.reason === "not_member") return { status: 404, jsonBody: { ok: false, error: "الطالب غير موجود في هذا الصف." } };
          if (!result.ok) return { status: 400, jsonBody: { ok: false, error: "المرحلة غير موجودة أو غير مفعّلة." } };
          const { workDef, stage, written, previous, outcome } = result;
          const summary = core.buildStudentSummary(workDef, written, now);
          // The SAME best-effort project-milestone hook progress.update already runs for a score change (a score
          // moves the existing project Strength); no new achievement event type is introduced here.
          await (deps.recordProjectMilestones || recordProjectMilestones)(container, { classId, student: { ...result.student, shareAchievements: result.shareAchievements }, projectCode, projectTitle: definition.title, workDef, before: previous, after: written, now });
          await rec(container, {
            actor: auth.user?.sub, action: "project.stage.score",
            targetType: "project-stage", targetId: projectCode + "/" + classId + "/" + input.studentId + "/" + input.stageId, targetLabel: stage.title,
            details: { projectCode, classId, studentId: input.studentId, stageId: input.stageId, oldScore: outcome.fromScore, newScore: outcome.toScore, via: action }
          });
          return {
            status: 200,
            jsonBody: {
              ok: true, projectCode, action,
              stage: { stageId: input.stageId, ...written.stages[input.stageId] },
              evaluation: buildProjectEvaluation(workDef, written),
              summary,
              performance: performance.buildProjectPerformanceSummary(workDef, written, now, summary),
              history: (written.history || []).slice(-20)
            }
          };
        } catch (e) {
          if (e && e.code === "NO_CHANGE") return { status: 200, jsonBody: { ok: true, noChange: true, action } };
          if (e instanceof StorageConflictError) return { status: 503, jsonBody: { ok: false, error: CONFLICT_MESSAGE } };
          if (e && e.httpStatus) return { status: e.httpStatus, jsonBody: { ok: false, error: e.message } };
          throw e;
        }
      }

      if (action === "template.update") {
        const patch = body.template && typeof body.template === "object" ? body.template : {};
        try {
          const written = await svc.updateTemplate(container, projectCode, classId, patch, now);
          await rec(container, {
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
    } catch (e) {
      obs?.logError("project.tracker.error", e);
      return { status: 500, jsonBody: { ok: false, error: "تعذر تنفيذ عملية متابعة المشروع حاليًا." } };
    }
}

app.http("projectTracker", { methods: ["GET", "POST"], authLevel: "anonymous", route: "project-tracker", handler: withObservability("project-tracker", handler) });
module.exports = { handler };
