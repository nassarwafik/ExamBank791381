const { downloadJsonOrNull, listJson, mapConcurrent, getReadConcurrency } = require("./platform-storage");
const { isStudentInClass } = require("./class-membership");   // Tadris+ P11-C: a shared student reads this class's course too
const { getVisibleLearningModuleIds } = require("./class-learning-materials");
const { listLearningModules } = require("./learning-materials-registry");
const { progressDocName, classProgressSummary } = require("./learning-progress");

// Phase L.4 (extracted for the owner teacher dashboard, phase 4) — how far ONE class has read ONE book: the ONE computation behind
// the teacher's GET /api/learning-class-progress and the owner's «لوحة البيانات», so both always show the same figures.
// Members come from the class's own studentIds index (re-checked against their user documents: an archived or moved student is never
// counted), else the authoritative user scan; only the units published to the class NOW are reported; per-unit counts only — never
// the exact pages a student read. Read-only. The caller has already checked the class (owner / tenancy) and that the course is
// attached to it, and passes the course's page index.
const UP = "platform/users/";
const ID = /^[A-Za-z0-9_-]{1,64}$/;

async function classReadingSummary(container, classroom, courseId, index, deps = {}) {
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  const classId = String(classroom.classId || "");
  let users;
  if (Array.isArray(classroom.studentIds)) {
    const ids = [...new Set(classroom.studentIds.map(id => String(id || "").trim()).filter(id => ID.test(id)))];
    users = await (deps.mapConcurrent || mapConcurrent)(ids, getReadConcurrency(), id => dl(container, UP + id + ".json"));
  } else {
    users = await (deps.listJson || listJson)(container, UP);
  }
  const members = users.filter(u => isStudentInClass(u, classId) && u.active !== false);
  const docs = await (deps.mapConcurrent || mapConcurrent)(members, getReadConcurrency(), u => dl(container, progressDocName(u.userId)));
  const visibleIds = new Set(getVisibleLearningModuleIds(classroom, courseId));
  const modules = listLearningModules(courseId).filter(m => visibleIds.has(m.moduleId));
  const summary = classProgressSummary(index, modules, members.map((u, i) => ({ userId: String(u.userId), displayName: String(u.displayName || ""), code: String(u.code || ""), doc: docs[i] })));
  return { summary, cost: { userDocs: users.length, progressDocs: members.length } };
}

module.exports = { classReadingSummary };
