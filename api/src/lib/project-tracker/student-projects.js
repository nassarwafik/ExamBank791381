// ONE shared loader for "the logged-in student's projects": class programCodes → registry definition → the class's
// project snapshot (or a fresh default) → the student's progress → `core.buildStudentSummary`. Used by BOTH the
// student project tracker endpoint and the student Strength calculation in the dashboard, so the two can never
// diverge on what a project's authoritative `overallProgress` is. No scans: one config read + one progress read per
// supported project of the class, with bounded concurrency. `deps` is the test seam (dl / mapConcurrent).
const { downloadJsonOrNull, mapConcurrent, getReadConcurrency } = require("../platform-storage");
const { getProjectDefinition, getStorageNamespace } = require("./registry");
const { workingDefinition, buildClassSnapshot, condensedView } = require("./service");
const { getSupportedClassProgramCodes } = require("./class-programs");
const core = require("./core");

/**
 * Returns [{ projectCode, definition, snapshot, workDef, progress, summary }] for every supported project the class
 * runs (registry order as stored, each code at most once). [] when the classroom is missing or runs no project.
 */
async function loadStudentProjects(container, classroom, classId, studentId, now, deps = {}) {
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  const mc = deps.mapConcurrent || mapConcurrent;
  const limit = (deps.getReadConcurrency || getReadConcurrency)();
  const codes = classroom ? getSupportedClassProgramCodes(classroom) : [];
  if (!codes.length) return [];
  return mc(codes, limit, async projectCode => {
    const definition = getProjectDefinition(projectCode);
    const ns = getStorageNamespace(projectCode);
    const [storedSnapshot, storedProgress] = await Promise.all([dl(container, ns.configName(classId)), dl(container, ns.progressName(classId, studentId))]);
    // Phase P7 — a class still on the stage set the condensed one replaces is SHOWN converted (the same pure rules, in
    // memory; a student read never writes), so the student never sees, or marks, stages that are about to disappear.
    // The stored conversion happens on the next write or teacher read (service.ensureClassConfig).
    const view = condensedView(projectCode, storedSnapshot, storedProgress, classroom, now);
    const progress = view.progress;
    const snapshot = view.snapshot || buildClassSnapshot(definition, classId, now);
    const workDef = workingDefinition(projectCode, snapshot);
    const summary = core.buildStudentSummary(workDef, progress, now);
    return { projectCode, definition, snapshot, workDef, progress, summary };
  });
}

module.exports = { loadStudentProjects };
