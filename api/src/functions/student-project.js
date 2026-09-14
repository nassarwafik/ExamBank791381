const { app } = require("@azure/functions");
const { requireActiveStudentSession } = require("../lib/student-auth");
const { getContainer, downloadJsonOrNull } = require("../lib/platform-storage");
const { buildClassSnapshotFromDefault, PROGRAM_CODE } = require("../lib/project-794589-template");
const { classHasProject } = require("../lib/project-tracker/class-programs");
const core = require("../lib/project-794589-core");

const CLASS_PREFIX = "platform/classes/";
const USER_PREFIX = "platform/users/";
const CONFIG_PREFIX = "platform/project-trackers/classes/";
const PROGRESS_PREFIX = "platform/project-progress/";

// Read-only project view for the logged-in student. Ownership comes ONLY from the verified token
// (auth.user.sub / auth.user.classId) - never from a query parameter - so a student can only ever
// see their own progress. No write path exists here at all.
app.http("studentProject", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "student-project",
  handler: async request => {
    try {
      // Hardened session (§7): validates active/archived/authVersion and returns the loaded student +
      // container, so ownership still comes only from the verified token and there is no duplicate read.
      const sess = await requireActiveStudentSession(request);
      if (!sess.ok) return sess.response;
      const container = sess.container;
      const now = new Date().toISOString();

      const studentId = sess.user.sub;
      const student = sess.student;
      const classId = student.classId;
      const classroom = classId ? await downloadJsonOrNull(container, CLASS_PREFIX + classId + ".json") : null;
      if (!classroom || !classHasProject(classroom, PROGRAM_CODE)) {
        // Not a 794589 student (class never had the link, or it was removed) - tell the portal
        // there's no project section to show. Membership honours modern programCodes[] and the
        // legacy programCode fallback.
        return { status: 200, jsonBody: { ok: true, enrolled: false } };
      }

      const config = (await downloadJsonOrNull(container, CONFIG_PREFIX + classId + ".json"))
        || buildClassSnapshotFromDefault(classId, now);
      const progress = await downloadJsonOrNull(container, PROGRESS_PREFIX + classId + "/" + studentId + ".json");
      const summary = core.buildStudentSummary(config, progress, now);

      return {
        status: 200,
        jsonBody: {
          ok: true,
          enrolled: true,
          programCode: PROGRAM_CODE,
          className: classroom.name,
          summary,
          stages: config.stages,
          groups: config.groups,
          progress: progress ? progress.stages : {},
          nextBookStage: core.getNextStage(config.stages, progress, "book"),
          nextPacketTracerStage: core.getNextStage(config.stages, progress, "packetTracer")
        }
      };
    } catch {
      return { status: 500, jsonBody: { ok: false, error: "تعذر تحميل مشروع الطالب حاليًا." } };
    }
  }
});
