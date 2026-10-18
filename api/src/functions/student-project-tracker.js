// Generic read-only Project Tracker view for the logged-in student, for ALL of the student's class's
// projects. The class and student are derived ONLY from the verified token (auth.user.sub -> the
// student's own user blob -> its classId -> the class's programCodes). Nothing is read from query
// params, so a student can only ever see their own class's projects and can never point this at
// another project/class/student. Returns projects:[] (one entry per supported project of the class).
const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireActiveStudentSession } = require("../lib/student-auth");
const { getContainer, downloadJsonOrNull } = require("../lib/platform-storage");
const { getSupportedClassProgramCodes } = require("../lib/project-tracker/class-programs");
// Shared with the student dashboard's Strength calculation: the ONE loader that turns class programCodes into
// per-project authoritative summaries (core.buildStudentSummary). Project math is never duplicated here.
const { loadStudentProjects } = require("../lib/project-tracker/student-projects");
const core = require("../lib/project-tracker/core");
const performance = require("../lib/project-tracker/performance");
const { buildProjectEvaluation } = require("../lib/project-tracker/evaluation");
const { normalizeClassStatus } = require("../lib/class-lifecycle");
const { StorageConflictError } = require("../lib/platform-storage");
const { selfReportStages } = require("../lib/project-tracker/service");
const { recordAuditEvent } = require("../lib/audit-log");
const { recordProjectMilestones } = require("../lib/achievement-milestones");
const { getProjectDefinition } = require("../lib/project-tracker/registry");

// Phase P2 — the student marks the stages they completed (owner decision: counts immediately, no attachment; the
// teacher confirms or cancels). Body { projectCode, stageIds: [...], mark: true | false }. The student and the class come
// ONLY from the verified session (a body studentId / classId is ignored); the project must be one the class runs; an
// archived class is read-only (403). At most SELF_REPORT_MAX stages per request, one CAS write for all of them.
const SELF_REPORT_MAX = 60;
function selfReportInput(body, codes) {
  const projectCode = String(body.projectCode || "").trim();
  if (!projectCode || !codes.includes(projectCode)) return { status: 400, error: "المشروع غير متاح لصفك." };
  if (typeof body.mark !== "boolean") return { status: 400, error: "طلب غير صحيح." };
  if (!Array.isArray(body.stageIds) || !body.stageIds.length) return { status: 400, error: "اختر مرحلة واحدة على الأقل." };
  if (body.stageIds.length > SELF_REPORT_MAX) return { status: 400, error: "عدد المراحل أكبر من الحد المسموح (" + SELF_REPORT_MAX + ")." };
  const stageIds = [...new Set(body.stageIds.map(id => String(id || "").trim()))];
  if (stageIds.some(id => !id)) return { status: 400, error: "طلب غير صحيح." };
  return { projectCode, stageIds, mark: body.mark };
}

const CLASS_PREFIX = "platform/classes/";
const USER_PREFIX = "platform/users/";

// `deps` is an optional dependency-injection seam for unit tests (production passes nothing, so the real
// implementations are used). It does not change runtime behavior.
async function handler(request, deps = {}, obs = null) {
    try {
      // Hardened session (§7): active/archived/authVersion validated; loaded student reused (no extra read).
      const sess = await (deps.requireActiveStudentSession || requireActiveStudentSession)(request, deps);
      if (!sess.ok) return sess.response;
      const container = sess.container;
      const now = new Date().toISOString();

      const studentId = sess.user.sub;
      const student = sess.student;
      const classId = student.classId;
      const classroom = classId ? await downloadJsonOrNull(container, CLASS_PREFIX + classId + ".json") : null;
      const codes = classroom ? getSupportedClassProgramCodes(classroom) : [];
      if (!classroom || !codes.length) {
        if (request.method === "POST") return { status: 400, jsonBody: { ok: false, error: "المشروع غير متاح لصفك." } };
        // Not enrolled in any tracked project — portal shows no project section.
        return { status: 200, jsonBody: { ok: true, enrolled: false, projects: [] } };
      }

      if (request.method === "POST") {
        let body = {};
        try { body = await request.json(); } catch { body = {}; }
        const input = selfReportInput(body || {}, codes);
        if (input.error) return { status: input.status, jsonBody: { ok: false, error: input.error } };
        if (normalizeClassStatus(classroom) !== "active") return { status: 403, jsonBody: { ok: false, error: "الصف مؤرشف — لا يمكن تعديل المشروع." } };
        const rec = deps.recordAuditEvent || recordAuditEvent;
        try {
          const r = await selfReportStages(container, input.projectCode, classroom, { studentId, stageIds: input.stageIds, mark: input.mark, now });
          if (!r.ok) return { status: 403, jsonBody: { ok: false, error: "لا يمكنك تعديل هذا المشروع." } };
          if (r.changed) {
            const definition = getProjectDefinition(input.projectCode);
            await (deps.recordProjectMilestones || recordProjectMilestones)(container, { classId, student: { ...r.student, shareAchievements: r.shareAchievements }, projectCode: input.projectCode, projectTitle: definition.title, workDef: r.workDef, before: r.previous, after: r.written, now });
            await rec(container, {
              actor: studentId, action: input.mark ? "project.stage.self_report" : "project.stage.self_report_undo",
              targetType: "project-student", targetId: input.projectCode + "/" + classId + "/" + studentId, targetLabel: r.student.displayName || "",
              details: { projectCode: input.projectCode, classId, stageIds: r.results.filter(x => x.changed).map(x => x.stageId) }
            });
          }
          return { status: 200, jsonBody: { ok: true, projectCode: input.projectCode, mark: input.mark, results: r.results, changed: r.changed } };
        } catch (e) {
          if (e && e.code === "NO_CHANGE") return { status: 200, jsonBody: { ok: true, projectCode: input.projectCode, mark: input.mark, results: e.results || [], changed: 0 } };
          if (e instanceof StorageConflictError) return { status: 503, jsonBody: { ok: false, error: "حدث تعارض مؤقت أثناء الحفظ. حاول مرة أخرى." } };
          throw e;
        }
      }

      const loaded = await loadStudentProjects(container, classroom, classId, studentId, now, deps);
      const projects = loaded.map(({ projectCode, definition, snapshot, workDef, progress, summary }) => ({
        projectCode,
        title: definition.title,
        tracks: definition.tracks,
        summary,
        // Project performance (grade / project-specific Strength + rank / per-stage value) — the ONE calculator's output.
        performance: performance.buildProjectPerformanceSummary(workDef, progress, now, summary),
        // Phase 9B — the student's OWN evaluation (graded / ungraded stages, average of graded scores), read-only.
        evaluation: buildProjectEvaluation(workDef, progress),
        stages: snapshot.stages,
        groups: snapshot.groups,
        progress: progress ? progress.stages : {},
        nextStages: core.getNextStages(workDef, progress),
        balance: core.getBalanceInsight(summary.trackProgress, workDef)
      }));

      return { status: 200, jsonBody: { ok: true, enrolled: true, className: classroom.name, projects } };
    } catch (e) {
      obs?.logError("student.projectTracker.error", e);
      return { status: 500, jsonBody: { ok: false, error: "تعذر تحميل مشروع الطالب حاليًا." } };
    }
}

app.http("studentProjectTracker", { methods: ["GET", "POST"], authLevel: "anonymous", route: "student-project-tracker", handler: withObservability("student-project-tracker", handler) });
module.exports = { handler };
