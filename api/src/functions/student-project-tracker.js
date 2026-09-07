// Generic read-only Project Tracker view for the logged-in student, for ANY supported project. The
// project, class and student are ALL derived from the verified token (auth.user.sub -> the student's
// own user blob -> its classId -> the class programCode). Nothing is read from query params, so a
// student can only ever see their own project and can never point this at another project/class/student.
const { app } = require("@azure/functions");
const { requireStudentAuth } = require("../lib/student-auth");
const { getContainer, downloadJsonOrNull } = require("../lib/platform-storage");
const { isSupportedProject, getProjectDefinition, getStorageNamespace } = require("../lib/project-tracker/registry");
const { workingDefinition, buildClassSnapshot } = require("../lib/project-tracker/service");
const core = require("../lib/project-tracker/core");

const CLASS_PREFIX = "platform/classes/";
const USER_PREFIX = "platform/users/";

app.http("studentProjectTracker", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "student-project-tracker",
  handler: async request => {
    try {
      const auth = requireStudentAuth(request);
      if (!auth.ok) return auth.response;
      const container = getContainer();
      const now = new Date().toISOString();

      const studentId = auth.user.sub;
      const student = await downloadJsonOrNull(container, USER_PREFIX + studentId + ".json");
      if (!student || student.active === false) {
        return { status: 401, jsonBody: { ok: false, error: "الحساب غير فعّال." } };
      }
      const classId = student.classId;
      const classroom = classId ? await downloadJsonOrNull(container, CLASS_PREFIX + classId + ".json") : null;
      const projectCode = classroom ? String(classroom.programCode || "") : "";
      if (!classroom || !isSupportedProject(projectCode)) {
        // Not enrolled in any tracked project — portal shows no project section.
        return { status: 200, jsonBody: { ok: true, enrolled: false } };
      }

      const definition = getProjectDefinition(projectCode);
      const ns = getStorageNamespace(projectCode);
      const snapshot = (await downloadJsonOrNull(container, ns.configName(classId)))
        || buildClassSnapshot(definition, classId, now);
      const workDef = workingDefinition(projectCode, snapshot);
      const progress = await downloadJsonOrNull(container, ns.progressName(classId, studentId));
      const summary = core.buildStudentSummary(workDef, progress, now);

      return {
        status: 200,
        jsonBody: {
          ok: true,
          enrolled: true,
          projectCode,
          title: definition.title,
          className: classroom.name,
          tracks: definition.tracks,
          summary,
          stages: snapshot.stages,
          groups: snapshot.groups,
          progress: progress ? progress.stages : {},
          nextStages: core.getNextStages(workDef, progress),
          balance: core.getBalanceInsight(summary.trackProgress, workDef)
        }
      };
    } catch {
      return { status: 500, jsonBody: { ok: false, error: "تعذر تحميل مشروع الطالب حاليًا." } };
    }
  }
});
