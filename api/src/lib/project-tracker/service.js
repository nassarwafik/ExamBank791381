// Shared storage/orchestration helpers for the Project Tracker backend. Keeps the Azure functions thin and gives
// ONE place for snapshot creation, student listing, progress loading and — since Roadmap #33 — the write
// operations (progress update, project reset, template update) and the class catalogue, all parameterized by
// projectCode via the registry's storage namespace (so 794589 hits its legacy paths and every other project hits
// its own isolated namespace).
//
// Roadmap #33 — Legacy 794589 Convergence contract: every function here returns DOMAIN results (documents,
// outcomes, counts) or throws the storage/engine errors the callers already map; it never builds an HTTP response,
// never chooses a status code or Arabic message, never records a route-owned audit event and never decides a body
// shape. The generic route (project-tracker) and the legacy route (project-794589) both call these functions and
// keep their own, unchanged contracts on top.
const { downloadJsonOrNull, uploadJson, listJson, listBlobNames, deleteBlob, mutateJsonWithRetry } = require("../platform-storage");
const { getProjectDefinition, getStorageNamespace, getSnapshotUpgradePolicy } = require("./registry");
const { classHasProject } = require("./class-programs");
const { normalizeClassStatus } = require("../class-lifecycle");
const { classHasMeaningfulProgress } = require("../project-794589-migration");
const { applyProgressUpdate } = require("../project-794589-progress");
const { recordAuditEvent } = require("../audit-log");
const { isStudentClassMember } = require("../class-membership");

// Pure decision: should an existing snapshot be auto-upgraded? Only an ACTIVE class on an older
// template version with NO meaningful student progress. Exported for unit tests.
function shouldUpgradeSnapshot(existing, isActive, currentVersion, hasMeaningfulProgress) {
  if (!existing || !isActive) return false;
  if (Number(existing.templateVersion || 1) >= currentVersion) return false;
  return !hasMeaningfulProgress;
}

const CLASS_PREFIX = "platform/classes/";
const USER_PREFIX = "platform/users/";

// A class snapshot is a self-contained, teacher-editable copy of the project definition (frozen at
// creation), carrying its own tracks/weights/config/groups/stages so later default-template edits
// never change a class that already started.
function buildClassSnapshot(definition, classId, now) {
  const clone = JSON.parse(JSON.stringify({
    trackWeights: definition.trackWeights,
    config: definition.config,
    groups: definition.groups,
    stages: definition.stages
  }));
  return {
    schemaVersion: 1,
    projectCode: definition.projectCode,
    classId,
    templateVersion: definition.templateVersion,
    tracks: definition.tracks,
    trackWeights: clone.trackWeights,
    config: clone.config,
    groups: clone.groups,
    stages: clone.stages,
    createdAt: now,
    updatedAt: now
  };
}

// Roadmap #33: the snapshot factory used ONLY when a class has no snapshot yet. The generic route keeps
// buildClassSnapshot (projectCode + tracks shape); the legacy 794589 route supplies its own factory
// (project-794589-template.buildClassSnapshotFromDefault → the historical programCode shape). Existing snapshots,
// including the version-aware upgrade path, are never affected by this option.
function snapshotFactory(projectCode, options) {
  if (options && typeof options.createSnapshot === "function") return options.createSnapshot;
  return (classId, now) => buildClassSnapshot(getProjectDefinition(projectCode), classId, now);
}

// The object the engine operates on: track metadata is authoritative from the registry (titles/icons),
// while weights/config/groups/stages come from the (teacher-editable) class snapshot.
function workingDefinition(projectCode, snapshot) {
  const def = getProjectDefinition(projectCode);
  return {
    projectCode,
    title: def.title,
    tracks: def.tracks,
    templateVersion: snapshot.templateVersion,
    trackWeights: snapshot.trackWeights,
    config: snapshot.config,
    groups: snapshot.groups,
    stages: snapshot.stages
  };
}

async function loadClassroom(container, classId) {
  return downloadJsonOrNull(container, CLASS_PREFIX + classId + ".json");
}

// Classes enrolled in a project (for the class selector), newest school year first. The enrollment gate is the
// ONE canonical predicate (class-programs.classHasProject: modern programCodes[] or the legacy programCode).
async function listProjectClasses(container, projectCode) {
  return (await listJson(container, CLASS_PREFIX))
    .filter(c => c && classHasProject(c, projectCode))
    .map(c => ({
      classId: c.classId, name: c.name, grade: c.grade, schoolYear: c.schoolYear,
      status: normalizeClassStatus(c), archivedAt: c.archivedAt || "", studentCount: Array.isArray(c.studentIds) ? c.studentIds.length : 0
    }))
    .sort((a, b) => String(b.schoolYear).localeCompare(String(a.schoolYear)));
}

// Returns the class snapshot, lazily creating+persisting it on first access for an ACTIVE class. For an
// archived class with no snapshot yet, returns an in-memory default (never writes to an archived class).
// `options.createSnapshot(classId, now)` overrides ONLY the first-create document (see snapshotFactory).
async function ensureClassConfig(container, projectCode, classroom, options = {}) {
  const ns = getStorageNamespace(projectCode);
  const classId = classroom.classId;
  const now = new Date().toISOString();
  const existing = await downloadJsonOrNull(container, ns.configName(classId));
  const isActive = normalizeClassStatus(classroom) === "active";

  if (!existing) {
    const snapshot = snapshotFactory(projectCode, options)(classId, now);
    if (isActive) await uploadJson(container, ns.configName(classId), snapshot);
    return snapshot;
  }

  // Version-aware upgrade — only for a project that declares a policy (794589). NON-DESTRUCTIVE: an
  // active class with no meaningful progress is upgraded to the current template version and audited;
  // a class with real progress (or archived) is returned exactly as-is. Storage paths never change.
  const policy = getSnapshotUpgradePolicy(projectCode);
  if (policy && isActive && Number(existing.templateVersion || 1) < policy.currentVersion) {
    const progressDocs = await listJson(container, ns.progressPrefix(classId));
    if (shouldUpgradeSnapshot(existing, isActive, policy.currentVersion, classHasMeaningfulProgress(progressDocs))) {
      const upgraded = policy.buildUpgraded(existing, classId, now);
      await uploadJson(container, ns.configName(classId), upgraded);
      await recordAuditEvent(container, {
        actor: "system", action: "project.template.upgrade",
        targetType: "project-template", targetId: classId, targetLabel: classroom.name || "",
        details: { fromVersion: Number(existing.templateVersion || 1), toVersion: policy.currentVersion, reason: "no-meaningful-progress" }
      });
      return upgraded;
    }
  }
  return existing;
}

async function listClassStudents(container, classId) {
  const all = await listJson(container, USER_PREFIX);
  return all
    .filter(u => studentBelongsToClass(u, classId)) // single source of the class-membership policy
    .map(u => ({ studentId: u.userId, displayName: u.displayName || ((u.firstName || "") + " " + (u.familyName || "")).trim(), code: u.code }))
    .sort((a, b) => String(a.displayName).localeCompare(String(b.displayName), "ar"));
}

async function loadStudentUser(container, studentId) {
  return downloadJsonOrNull(container, USER_PREFIX + studentId + ".json");
}

// Pure CLASS-MEMBERSHIP rule for the TEACHER's project tracker (exported for unit tests). A user is a
// member of the class if it exists, is a student, is NOT archived, and belongs to that exact class.
// NOTE: active===false (a login-disabled account) is still a class member — a disabled student appears
// in the class roster and the teacher can view/approve their project. This is deliberately independent
// of student LOGIN eligibility (which the student-auth path enforces separately with active===false).
// Roadmap #24: delegates to the ONE canonical read-side membership predicate (lib/class-membership) so the
// project tracker, reports, the gradebook, item analysis and teacher analytics all share exactly one rule.
function studentBelongsToClass(user, classId) {
  return isStudentClassMember(user, classId);
}

// Verifies a studentId is a real student MEMBER of the given class BEFORE any read/write of that
// student's project progress. Prevents cross-class access and "ghost" progress blobs for arbitrary
// ids. Returns { ok:false } when membership fails; otherwise { ok:true, student }.
async function requireStudentInClass(container, studentId, classId) {
  const u = await loadStudentUser(container, studentId);
  if (!studentBelongsToClass(u, classId)) return { ok: false };
  return { ok: true, student: { studentId: u.userId, displayName: u.displayName || ((u.firstName || "") + " " + (u.familyName || "")).trim(), code: u.code } };
}

async function loadProgressEntries(container, projectCode, classId, students) {
  const ns = getStorageNamespace(projectCode);
  const blobs = await listJson(container, ns.progressPrefix(classId));
  const byId = new Map(blobs.filter(Boolean).map(p => [String(p.studentId), p]));
  return students.map(s => ({ studentId: s.studentId, displayName: s.displayName, code: s.code, progress: byId.get(String(s.studentId)) || null }));
}

async function loadStudentProgress(container, projectCode, classId, studentId) {
  return downloadJsonOrNull(container, getStorageNamespace(projectCode).progressName(classId, studentId));
}

// Roadmap #33 — ONE progress-update pipeline for every route, in the exact order both routes always used:
//   1. canonical membership (foreign / archived / unknown id → { ok:false, reason:"not_member" }, nothing read
//      or written under the class),
//   2. snapshot load (lazy create / version-aware upgrade via ensureClassConfig — `options` as there),
//   3. the stage must exist AND be active in the class snapshot (→ { ok:false, reason:"stage_inactive" }),
//   4. CAS mutation of the student's progress blob through applyProgressUpdate.
// Engine/storage errors propagate unchanged so each handler keeps its own mapping: NO_CHANGE (e.code),
// invalid status (e.httpStatus 400) and StorageConflictError (retry budget exhausted). Returns everything a
// handler needs for its response AND its own audit records (outcome.statusChanged / noteChanged / from / to,
// the stage title) — audit formatting is deliberately NOT centralized here.
async function updateStudentProgress(container, projectCode, classroom, update, options = {}) {
  const classId = classroom.classId;
  const { studentId, stageId, status, note, score, actor, now } = update;
  const membership = await requireStudentInClass(container, studentId, classId);
  if (!membership.ok) return { ok: false, reason: "not_member" };
  const config = await ensureClassConfig(container, projectCode, classroom, options);
  const stage = (config.stages || []).find(s => s.stageId === stageId && s.active === true);
  if (!stage) return { ok: false, reason: "stage_inactive", config };
  const ns = getStorageNamespace(projectCode);
  let outcome = null;
  const written = await mutateJsonWithRetry(container, ns.progressName(classId, studentId), current =>
    (outcome = applyProgressUpdate(current, { stageId, status, note, score, actor, now, programCode: projectCode, classId, studentId })).doc
  );
  return { ok: true, config, workDef: workingDefinition(projectCode, config), stage, student: membership.student, written, outcome };
}

// Roadmap #33 — wipes ONLY this project's data for this class (every student progress blob under the project's
// namespace, then the class snapshot). The classroom, the student accounts, assignments, exams and OTHER projects
// are never touched (namespace isolation). Returns the count the handlers report and audit.
async function resetProject(container, projectCode, classId) {
  const ns = getStorageNamespace(projectCode);
  const progressBlobs = await listBlobNames(container, ns.progressPrefix(classId));
  for (const name of progressBlobs) await deleteBlob(container, name);
  await deleteBlob(container, ns.configName(classId));
  return { deletedProgressCount: progressBlobs.length };
}

// Roadmap #33 — CAS patch of the class snapshot (stages / groups / trackWeights / config merge). A missing snapshot
// starts from the route's first-create factory (see snapshotFactory). StorageConflictError propagates.
async function updateTemplate(container, projectCode, classId, patch, now, options = {}) {
  const ns = getStorageNamespace(projectCode);
  const create = snapshotFactory(projectCode, options);
  return mutateJsonWithRetry(container, ns.configName(classId), current => {
    const config = current || create(classId, now);
    if (Array.isArray(patch.stages)) config.stages = patch.stages;
    if (Array.isArray(patch.groups)) config.groups = patch.groups;
    if (patch.trackWeights && typeof patch.trackWeights === "object") config.trackWeights = patch.trackWeights;
    if (patch.config && typeof patch.config === "object") config.config = { ...config.config, ...patch.config };
    config.updatedAt = now;
    return config;
  });
}

module.exports = {
  CLASS_PREFIX, USER_PREFIX,
  buildClassSnapshot, workingDefinition, loadClassroom, ensureClassConfig,
  listClassStudents, loadStudentUser, studentBelongsToClass, requireStudentInClass, loadProgressEntries, loadStudentProgress,
  listProjectClasses, updateStudentProgress, resetProject, updateTemplate,
  shouldUpgradeSnapshot
};
