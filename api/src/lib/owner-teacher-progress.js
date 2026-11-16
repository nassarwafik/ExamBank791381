const { listJson, mapConcurrent, getReadConcurrency } = require("./platform-storage");
const { canAccessDocument } = require("./teacher-tenancy");
const { normalizeClassStatus } = require("./class-lifecycle");
const { getClassLearningMaterials } = require("./class-learning-materials");
const { findLearningCourse } = require("./learning-materials-registry");
const { loadPageIndex } = require("./learning-progress");
const { classReadingSummary } = require("./learning-class-reading");
const { getClassProgramCodes } = require("./project-tracker/class-programs");
const { isSupportedProject, getProjectMeta } = require("./project-tracker/registry");
const svc = require("./project-tracker/service");
const analytics = require("./project-tracker/analytics");

// Owner teacher dashboard, phase 4 — how far ONE teacher's students have got in the LEARNING MATERIALS and the PROJECTS, per class.
// Scope: the teacher's own classes (canAccessDocument with the teacher's tenant — the same rule as every teacher route), ACTIVE ones
// (an archived class is history; a class chosen explicitly is answered whatever its state). Figures come from the SAME computations
// as the teacher's own screens, never a second set:
//   learning — lib/learning-class-reading.js (the teacher's GET /api/learning-class-progress): per course attached to the class, the
//              units published to it NOW, its current members, pages read per unit — never which pages;
//   projects — project-tracker readClassView + loadProgressEntries + analytics.buildClassSummary (the teacher's
//              GET /api/project-tracker?resource=summary), read only (a pending conversion is applied in memory, never written).
// Read only. Any storage failure throws (the route answers 503 — never partial figures).
const CLASS_PREFIX = "platform/classes/";

async function computeTeacherProgress(container, { tenant, classId = "" }, deps = {}) {
  if (!tenant) throw new Error("A teacher scope is required.");
  const classes = (await (deps.listJson || listJson)(container, CLASS_PREFIX))
    .filter(c => c && c.classId && canAccessDocument(c, tenant))
    .filter(c => (classId ? String(c.classId) === classId : normalizeClassStatus(c) === "active"))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ar"));
  const now = new Date(typeof deps.nowMs === "number" ? deps.nowMs : Date.now()).toISOString();

  const learningPairs = [], projectPairs = [];
  for (const c of classes) {
    for (const m of getClassLearningMaterials(c)) if (loadPageIndex(m.courseId)) learningPairs.push({ c, courseId: m.courseId });
    for (const code of getClassProgramCodes(c)) if (isSupportedProject(code)) projectPairs.push({ c, code });
  }

  const learning = await mapConcurrent(learningPairs, getReadConcurrency(), async ({ c, courseId }) => {
    const { summary } = await classReadingSummary(container, c, courseId, loadPageIndex(courseId), deps);
    const students = summary.students.length;
    const read = summary.students.reduce((n, s) => n + s.readPages, 0);
    return {
      classId: String(c.classId), className: String(c.name || ""), courseId, courseTitle: (findLearningCourse(courseId) || {}).title || courseId,
      students, totalPages: summary.totalPages,
      averageRead: students && summary.totalPages ? Math.round(read / (students * summary.totalPages) * 100) : 0,
      startedStudents: summary.students.filter(s => s.readPages > 0).length,
      completedStudents: summary.totalPages ? summary.students.filter(s => s.readPages >= summary.totalPages).length : 0,
      modules: summary.modules
    };
  });

  const projects = await mapConcurrent(projectPairs, getReadConcurrency(), async ({ c, code }) => {
    const { config, view } = await svc.readClassView(container, code, c);
    const workDef = svc.workingDefinition(code, config);
    const students = await svc.listClassStudentsForReadViews(container, String(c.classId));
    const entries = await svc.loadProgressEntries(container, code, String(c.classId), students, view);
    const s = analytics.buildClassSummary(workDef, entries, now);
    return {
      classId: String(c.classId), className: String(c.name || ""), projectCode: code, title: getProjectMeta(code).title,
      studentCount: s.studentCount, avgOverall: s.avgOverall, completedCount: s.completedCount, studentsReadyForReview: s.studentsReadyForReview,
      totalReadyStages: s.totalReadyStages, staleCount: s.staleCount
    };
  });

  return { learning, projects };
}

module.exports = { computeTeacherProgress };
