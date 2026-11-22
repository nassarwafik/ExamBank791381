// Class gradebook — the sources a class's scheme may pick: its reportable assignments / exams and, for a session that may see projects,
// its projects. ONE rule shared by `GET /api/class-gradebook?resource=sources` (the builder's lists) and GB10's AI proposal
// (`/api/gradebook-scheme-ai`, the only sources the model is shown), so the two can never offer different sets.
const { loadDocs } = require("../classes-students-read-cache");
const { isReportableAssessment } = require("../assignment-lifecycle");
const { isSafeId } = require("../roster-input");
const { getSupportedClassProgramCodes } = require("../project-tracker/class-programs");
const { getProjectMeta } = require("../project-tracker/registry");

const ASSIGN_PREFIX = "platform/assignments/";

/**
 * → { assignments: [{ assignmentId, title, status, totalMarks, publishedAt }] newest first, projects: [{ projectCode, title }],
 *     documents: Map(assignmentId → the listed assignment's document), projectCodes: [the listed projects' codes] }.
 * `projectsAllowed` false → no project is listed (and none is read).
 */
async function listClassSources(c, classroom, projectsAllowed, deps = {}) {
  const docs = (await (deps.loadDocs || loadDocs)(c, ASSIGN_PREFIX))
    .filter(a => a && String(a.classId || "") === classroom.classId && isReportableAssessment(a) && isSafeId(String(a.assignmentId || "")));
  const assignments = docs
    .map(a => ({ assignmentId: String(a.assignmentId), title: String(a.title || ""), status: String(a.status || ""), totalMarks: Number(a.totalMarks) || 0, publishedAt: String(a.publishedAt || a.createdAt || "") }))
    .sort((x, y) => String(y.publishedAt).localeCompare(String(x.publishedAt)));
  const projects = projectsAllowed
    ? getSupportedClassProgramCodes(classroom).map(code => ({ projectCode: code, title: getProjectMeta(code).title }))
    : [];
  return { assignments, projects, documents: new Map(docs.map(a => [String(a.assignmentId), a])), projectCodes: projects.map(x => x.projectCode) };
}

module.exports = { listClassSources };
