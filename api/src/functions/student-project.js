// LEGACY read-only Project-794589 view for the logged-in student (/api/student-project). Kept for compatibility:
// GET only, same session check, 794589-only enrollment gate (enrolled:false otherwise), the same FLAT legacy body
// (programCode, className, summary with bookProgress / packetTracerProgress, stages, groups, progress, nextBookStage,
// nextPacketTracerStage), the same 500 message and the same observability event.
//
// Roadmap #33 — Legacy 794589 Convergence: reads go through the generic registry namespace (the historical 794589
// blob paths) and the generic engine; the legacy shape comes from lib/project-794589-legacy-shape.js. A student read
// NEVER writes: when the class has no snapshot yet, the legacy in-memory default (buildClassSnapshotFromDefault) is
// used exactly as before and nothing is persisted.
const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireActiveStudentSession } = require("../lib/student-auth");
const { downloadJsonOrNull } = require("../lib/platform-storage");
const { buildClassSnapshotFromDefault, PROGRAM_CODE } = require("../lib/project-794589-template");
const { classHasProject } = require("../lib/project-tracker/class-programs");
const { getStorageNamespace } = require("../lib/project-tracker/registry");
const { workingDefinition } = require("../lib/project-tracker/service");
const core = require("../lib/project-tracker/core");
const shape = require("../lib/project-794589-legacy-shape");

const CLASS_PREFIX = "platform/classes/";

// Ownership comes ONLY from the verified token (auth.user.sub / the student's own classId) - never from a query
// parameter - so a student can only ever see their own progress. No write path exists here at all.
// `deps` is an optional dependency-injection seam for unit tests (production passes nothing, so the real
// implementations are used); `obs` is the request context withObservability passes as the third argument.
// Neither changes runtime behavior.
async function handler(request, deps = {}, obs = null) {
    try {
      // Hardened session (§7): validates active/archived/authVersion and returns the loaded student +
      // container, so ownership still comes only from the verified token and there is no duplicate read.
      const sess = await (deps.requireActiveStudentSession || requireActiveStudentSession)(request, deps);
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

      const ns = getStorageNamespace(PROGRAM_CODE);
      const config = (await downloadJsonOrNull(container, ns.configName(classId)))
        || buildClassSnapshotFromDefault(classId, now);
      const workDef = workingDefinition(PROGRAM_CODE, config);
      const progress = await downloadJsonOrNull(container, ns.progressName(classId, studentId));
      const summary = core.buildStudentSummary(workDef, progress, now);

      return {
        status: 200,
        jsonBody: {
          ok: true,
          enrolled: true,
          programCode: PROGRAM_CODE,
          className: classroom.name,
          summary: shape.legacyStudentSummary(summary),
          stages: config.stages,
          groups: config.groups,
          progress: progress ? progress.stages : {},
          ...shape.legacyNextStages(core.getNextStages(workDef, progress))
        }
      };
    } catch (e) {
      obs?.logError("student.project.error", e);
      return { status: 500, jsonBody: { ok: false, error: "تعذر تحميل مشروع الطالب حاليًا." } };
    }
}

app.http("studentProject", { methods: ["GET"], authLevel: "anonymous", route: "student-project", handler: withObservability("student-project", handler) });
module.exports = { handler };
