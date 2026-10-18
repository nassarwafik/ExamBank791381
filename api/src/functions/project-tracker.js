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
// Phase 21G.0 — teacher tenancy: project tracking covers only the teacher's own classes.
const { tenantOf, canAccessDocument, accessibleClassIds, classIdAllowed } = require("../lib/teacher-tenancy");
const { getContainer, downloadJsonOrNull, listJson, StorageConflictError } = require("../lib/platform-storage");
const { recordAuditEvent } = require("../lib/audit-log");
const { normalizeClassStatus } = require("../lib/class-lifecycle");
const { isSupportedProject, getProjectDefinition, getStorageNamespace, getProjectMeta, getSupportedProjects } = require("../lib/project-tracker/registry");
const svc = require("../lib/project-tracker/service");
const core = require("../lib/project-tracker/core");
const performance = require("../lib/project-tracker/performance");
const { buildProjectEvaluation } = require("../lib/project-tracker/evaluation");
const { SCORE_ERROR, normalizeScore } = require("../lib/project-tracker/score");
const { mapConcurrent, getReadConcurrency } = require("../lib/platform-storage");
const { listUsersForReadViews } = require("../lib/project-tracker/user-directory-cache");
const { isSelfReported } = require("../lib/project-tracker/self-report");
const analytics = require("../lib/project-tracker/analytics");
const { countReadyStages } = require("../lib/project-tracker/ready-count");
const { classHasProject } = require("../lib/project-tracker/class-programs");

const CLASS_PREFIX = "platform/classes/";
const STUDENT_HISTORY_LIMIT = 50;
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
    // Phase P-2 — the newest STUDENT_HISTORY_LIMIT events only (the profile shows 20; the full log stays in storage and
    // every derived value — evaluation, performance — is computed server-side from the whole document).
    history: progress ? (progress.history || []).slice(-STUDENT_HISTORY_LIMIT) : [],
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

// Phase P1 — bulk review. ONE decision (a status and/or a score) applied to many (student, stage) pairs of ONE class in
// one request, so the teacher approves a whole stage for the class — or every stage waiting for review — at once instead
// of student by student. Every pair runs through the SAME canonical pipeline as progress.update (membership → snapshot →
// active stage → CAS merge of one stage entry); a pair that fails never blocks the others and is reported per item.
const BULK_MAX_ITEMS = 300;
function bulkInput(body) {
  if (!Array.isArray(body.items) || !body.items.length) return { error: "حدّد طالبًا ومرحلة واحدة على الأقل." };
  if (body.items.length > BULK_MAX_ITEMS) return { error: "عدد العناصر أكبر من الحد المسموح (" + BULK_MAX_ITEMS + ")." };
  if (body.note !== undefined) return { error: "الإجراء الجماعي لا يقبل الملاحظات." };
  const status = body.status === undefined || body.status === null || body.status === "" ? undefined : String(body.status);
  if (status !== undefined && !core.STATUSES.includes(status)) return { error: "حالة المرحلة غير صحيحة." };
  let score;
  if (body.score === null) score = null;
  else if (body.score !== undefined && body.score !== "") {
    if (normalizeScore(body.score) === null) return { error: SCORE_ERROR };
    score = normalizeScore(body.score);
  }
  if (status === undefined && score === undefined) return { error: "حدّد الحالة أو العلامة." };
  const seen = new Set(), items = [];
  for (const raw of body.items) {
    const studentId = String((raw && raw.studentId) || "").trim(), stageId = String((raw && raw.stageId) || "").trim();
    if (!studentId || !stageId) return { error: "studentId وstageId مطلوبان لكل عنصر." };
    const key = studentId + "\u0000" + stageId;
    if (!seen.has(key)) { seen.add(key); items.push({ studentId, stageId }); }
  }
  return { items, status, score };
}

// Phase P1 — the class board: every member × every ACTIVE stage of the class snapshot, carrying only the non-default cells
// ({status, score[, selfReported]}) so the payload stays small. `selfReported`: the student marked it done (Phase P2)
// and the teacher has not confirmed it yet. Read-only projection of the same documents the other resources read.
function boardBody(projectCode, config, readOnly, entries) {
  const stages = (config.stages || []).filter(s => s && s.active === true)
    .map(s => ({ stageId: s.stageId, track: s.track, groupId: s.groupId, title: s.title || "", order: Number(s.order) || 0, required: s.required !== false }));
  const students = entries.map(e => {
    const cells = {};
    for (const s of stages) {
      const status = core.stageStatus(e.progress, s.stageId);
      const entry = e.progress && e.progress.stages ? e.progress.stages[s.stageId] : null;
      const score = normalizeScore(entry && entry.score);
      if (status !== "not_started" || score !== null) cells[s.stageId] = isSelfReported(entry) ? { status, score, selfReported: true } : { status, score };
    }
    return { studentId: e.studentId, displayName: e.displayName, code: e.code, cells };
  });
  return { ok: true, projectCode, readOnly, stages, groups: config.groups || [], students };
}

// `deps` is an optional dependency-injection seam for unit tests (production passes nothing, so the real
// implementations are used). It does not change runtime behavior.
async function handler(request, deps = {}, obs = null) {
    const rec = deps.recordAuditEvent || recordAuditEvent;
    try {
      const auth = (deps.requireBuilderAuth || requireBuilderAuth)(request);
      if (!auth.ok) return auth.response;
      const container = deps.container || (deps.getContainer || getContainer)();
      const tenant = tenantOf(auth.user);
      const ownClassroom = classroom => !!classroom && canAccessDocument(classroom, tenant);
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
        // Phase P-2 — the class list and the (cached, read-only) user directory are read together, and the active
        // class × project pairs are counted with bounded concurrency instead of one after another. Same counting rule.
        const [classroomDocs, allUsers] = await Promise.all([listJson(container, CLASS_PREFIX), listUsersForReadViews(container)]);
        const classrooms = classroomDocs.filter(ownClassroom);
        const usersById = new Map(allUsers.filter(u => u && u.role === "student").map(u => [String(u.userId), u]));
        const pairs = [];
        for (const code of getSupportedProjects()) {
          for (const c of classrooms) if (classHasProject(c, code) && normalizeClassStatus(c) === "active") pairs.push({ code, c });
        }
        const counts = await mapConcurrent(pairs, getReadConcurrency(), async ({ code, c }) => {
          const ns = getStorageNamespace(code);
          const [stored, docs] = await Promise.all([downloadJsonOrNull(container, ns.configName(c.classId)), listJson(container, ns.progressPrefix(c.classId))]);
          const snapshot = stored || svc.buildClassSnapshot(getProjectDefinition(code), c.classId, now);
          const activeStageIds = new Set((snapshot.stages || []).filter(s => s.active === true).map(s => s.stageId));
          return countReadyStages(docs, activeStageIds, sid => svc.studentBelongsToClass(usersById.get(String(sid)), c.classId));
        });
        const byProject = {};
        let total = 0;
        for (const code of getSupportedProjects()) byProject[code] = 0;
        pairs.forEach(({ code }, i) => { byProject[code] += counts[i]; total += counts[i]; });
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
          const allowed = tenant ? accessibleClassIds(await listJson(container, CLASS_PREFIX), tenant) : null;
          const classes = (await svc.listProjectClasses(container, projectCode)).filter(c => classIdAllowed(allowed, c && c.classId));
          return { status: 200, jsonBody: { ok: true, projectCode, title: definition.title, tracks: definition.tracks, classes } };
        }

        if (!classId) return { status: 400, jsonBody: { ok: false, error: "classId مطلوب." } };
        const classroom = await svc.loadClassroom(container, classId);
        if (!ownClassroom(classroom)) return { status: 404, jsonBody: { ok: false, error: "الصف غير موجود." } };
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

        const students = await svc.listClassStudentsForReadViews(container, classId);       // Phase P-2: shared ≤ 20 s scan

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
        if (resource === "board") {
          const entries = await svc.loadProgressEntries(container, projectCode, classId, students);
          return { status: 200, jsonBody: boardBody(projectCode, config, readOnly, entries) };
        }
        return { status: 400, jsonBody: { ok: false, error: "resource غير معروف." } };
      }

      // ---- POST ----
      const action = String(body.action || "").trim().toLowerCase();
      const classId = String(body.classId || "").trim();
      if (!classId) return { status: 400, jsonBody: { ok: false, error: "classId مطلوب." } };
      const classroom = await svc.loadClassroom(container, classId);
      if (!ownClassroom(classroom)) return { status: 404, jsonBody: { ok: false, error: "الصف غير موجود." } };
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
          if (outcome.statusChanged || outcome.verified) {
            await rec(container, {
              actor: auth.user?.sub,
              action: outcome.toStatus === "approved" ? "project.stage.approve" : "project.stage.status_change",
              targetType: "project-stage", targetId: projectCode + "/" + classId + "/" + studentId + "/" + stageId,
              targetLabel: stage.title, details: { projectCode, fromStatus: outcome.fromStatus, toStatus: outcome.toStatus, ...(outcome.verified ? { verifiedSelfReport: true } : {}) }
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

      if (action === "progress.bulk") {
        const input = bulkInput(body);
        if (input.error) return { status: 400, jsonBody: { ok: false, error: input.error } };
        // Pairs of the SAME student share one progress blob: they run in order (one CAS writer per blob); different
        // students run with bounded concurrency. Results keep the request order.
        const byStudent = new Map();
        input.items.forEach((item, index) => { if (!byStudent.has(item.studentId)) byStudent.set(item.studentId, []); byStudent.get(item.studentId).push({ ...item, index }); });
        const results = new Array(input.items.length);
        let readyChanged = false;
        await mapConcurrent([...byStudent.values()], 4, async group => {
          for (const { studentId, stageId, index } of group) {
            const base = { studentId, stageId };
            try {
              const result = await svc.updateStudentProgress(container, projectCode, classroom, { studentId, stageId, status: input.status, score: input.score, actor: auth.user?.sub, now });
              if (!result.ok) { results[index] = { ...base, ok: false, error: result.reason === "not_member" ? "not_member" : "stage_inactive" }; continue; }
              const { workDef, stage, written, previous, outcome } = result;
              await (deps.recordProjectMilestones || recordProjectMilestones)(container, { classId, student: { ...result.student, shareAchievements: result.shareAchievements }, projectCode, projectTitle: definition.title, workDef, before: previous, after: written, now });
              const targetId = projectCode + "/" + classId + "/" + studentId + "/" + stageId;
              if (outcome.statusChanged) readyChanged = true;
              if (outcome.statusChanged || outcome.verified) {
                await rec(container, { actor: auth.user?.sub, action: outcome.toStatus === "approved" ? "project.stage.approve" : "project.stage.status_change", targetType: "project-stage", targetId, targetLabel: stage.title, details: { projectCode, fromStatus: outcome.fromStatus, toStatus: outcome.toStatus, via: "progress.bulk", ...(outcome.verified ? { verifiedSelfReport: true } : {}) } });
              }
              if (outcome.scoreChanged) {
                await rec(container, { actor: auth.user?.sub, action: "project.stage.score", targetType: "project-stage", targetId, targetLabel: stage.title, details: { projectCode, classId, studentId, stageId, oldScore: outcome.fromScore, newScore: outcome.toScore, via: "progress.bulk" } });
              }
              const entry = written.stages[stageId] || {};
              results[index] = { ...base, ok: true, changed: true, status: entry.status, score: normalizeScore(entry.score) };
            } catch (e) {
              if (e && e.code === "NO_CHANGE") { results[index] = { ...base, ok: true, changed: false }; continue; }
              if (e instanceof StorageConflictError) { results[index] = { ...base, ok: false, error: "conflict" }; continue; }
              if (e && e.httpStatus) { results[index] = { ...base, ok: false, error: "invalid" }; continue; }
              obs?.logError("project.tracker.bulk.item", e);
              results[index] = { ...base, ok: false, error: "failed" };
            }
          }
        });
        const changed = results.filter(r => r.ok && r.changed).length, failed = results.filter(r => !r.ok).length;
        return { status: 200, jsonBody: { ok: true, projectCode, readyChanged, results, totals: { requested: results.length, changed, unchanged: results.length - changed - failed, failed } } };
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
