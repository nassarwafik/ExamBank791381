// Shared storage/orchestration helpers for the generic Project Tracker backend. Keeps the Azure
// function thin and gives one place for snapshot creation, student listing and progress loading — all
// parameterized by projectCode via the registry's storage namespace (so 794589 hits its legacy paths
// and every other project hits its own isolated namespace).
const { downloadJsonOrNull, uploadJson, listJson } = require("../platform-storage");
const { getProjectDefinition, getStorageNamespace } = require("./registry");
const { normalizeClassStatus } = require("../class-lifecycle");

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

// Returns the class snapshot, lazily creating+persisting it on first access for an ACTIVE class. For an
// archived class with no snapshot yet, returns an in-memory default (never writes to an archived class).
async function ensureClassConfig(container, projectCode, classroom) {
  const ns = getStorageNamespace(projectCode);
  const classId = classroom.classId;
  const existing = await downloadJsonOrNull(container, ns.configName(classId));
  if (existing) return existing;
  const now = new Date().toISOString();
  const snapshot = buildClassSnapshot(getProjectDefinition(projectCode), classId, now);
  if (normalizeClassStatus(classroom) === "active") {
    await uploadJson(container, ns.configName(classId), snapshot);
  }
  return snapshot;
}

async function listClassStudents(container, classId) {
  const all = await listJson(container, USER_PREFIX);
  return all
    .filter(u => u && u.role === "student" && String(u.classId || "") === String(classId) && u.archived !== true)
    .map(u => ({ studentId: u.userId, displayName: u.displayName || ((u.firstName || "") + " " + (u.familyName || "")).trim(), code: u.code }))
    .sort((a, b) => String(a.displayName).localeCompare(String(b.displayName), "ar"));
}

async function loadStudentUser(container, studentId) {
  return downloadJsonOrNull(container, USER_PREFIX + studentId + ".json");
}

async function loadProgressEntries(container, projectCode, classId, students) {
  const ns = getStorageNamespace(projectCode);
  const blobs = await listJson(container, ns.progressPrefix(classId));
  const byId = new Map(blobs.filter(Boolean).map(p => [String(p.studentId), p]));
  return students.map(s => ({ studentId: s.studentId, displayName: s.displayName, code: s.code, progress: byId.get(String(s.studentId)) || null }));
}

module.exports = {
  CLASS_PREFIX, USER_PREFIX,
  buildClassSnapshot, workingDefinition, loadClassroom, ensureClassConfig,
  listClassStudents, loadStudentUser, loadProgressEntries
};
