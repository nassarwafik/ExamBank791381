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
        // Not enrolled in any tracked project — portal shows no project section.
        return { status: 200, jsonBody: { ok: true, enrolled: false, projects: [] } };
      }

      const loaded = await loadStudentProjects(container, classroom, classId, studentId, now, deps);
      const projects = loaded.map(({ projectCode, definition, snapshot, workDef, progress, summary }) => ({
        projectCode,
        title: definition.title,
        tracks: definition.tracks,
        summary,
        // Project performance (grade / project-specific Strength + rank / per-stage value) — the ONE calculator's output.
        performance: performance.buildProjectPerformanceSummary(workDef, progress, now, summary),
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

app.http("studentProjectTracker", { methods: ["GET"], authLevel: "anonymous", route: "student-project-tracker", handler: withObservability("student-project-tracker", handler) });
module.exports = { handler };
