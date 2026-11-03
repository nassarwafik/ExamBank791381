const storage = require("../platform-storage");
const { findLearningCourse, listLearningCourses } = require("../learning-materials-registry");
const { readAccessMode } = require("./access-mode");
const { resolveTeacherAccess } = require("./resolver");
const { readTeacherAccount } = require("../identity/teacher-accounts");
const { isTeacherAccountId, LEGACY_TEACHER_ACCOUNT_ID } = require("../identity/teacher-token");
const { legacyDataOwner } = require("../teacher-tenancy");

// Tadris+ P5-A — course access (blueprint §10, owner decisions §19.13). ONE place answers «may this teacher / this class use course
// X now?»; every learning route asks it. Two independent conditions:
//
//   1. the catalog: the owner can ARCHIVE a course (platform/catalog/courses/<courseId>.json { status }). No document = published
//      (today's behaviour). Archived = closed to every teacher and every student, in every mode. A catalog document that exists but
//      cannot be understood counts as archived (fail closed).
//   2. the teacher's entitlement: `resources.courses` of the teacher's access revision. Absent = every published course (owner
//      decision: an entitlement only narrows). Applied with the rest of the teacher's access, i.e. only while the owner's access
//      mode is ENFORCE (legacy / observe: no narrowing yet — exactly like the capabilities); an unreadable mode or revision while
//      it matters → unavailable (fail closed).
//
// For a student, the entitlement is that of the teacher who OWNS the class (class.ownerId, else LEGACY_DATA_OWNER, else — for
// pre-tenancy data — the imported workspace t_legacy). Owner decision D15: a suspended teacher's students keep reading what was
// released (the teacher's account status is NOT a condition here); a withdrawn entitlement or an archived course refuses new
// reads at once, and nothing stored (progress, notes, results, the class's released modules) is ever deleted or changed.
//
// → { ok: true } | { ok: false, code: "COURSE_UNKNOWN" | "COURSE_ARCHIVED" | "COURSE_NOT_ENTITLED" } ; an AccessError / storage
//   failure propagates as { ok: false, code: "COURSE_ACCESS_UNAVAILABLE" } from the *Decision helpers.

const CATALOG_PREFIX = "platform/catalog/courses/";
const STATUSES = ["published", "archived"];

const knownCourse = id => {
  const c = findLearningCourse(id);
  return c && c.courseId === String(id) ? c : null;
};
function catalogDocName(courseId) {
  if (!knownCourse(courseId)) throw new Error("Unknown course id.");
  return CATALOG_PREFIX + courseId + ".json";
}

/** "published" | "archived" for a known course (no document = published; a document that cannot be understood = archived). */
async function readCourseStatus(container, courseId, deps = {}) {
  const doc = await (deps.downloadJsonOrNull || storage.downloadJsonOrNull)(container, catalogDocName(courseId));
  if (!doc) return "published";
  return doc.schemaVersion === 1 && doc.courseId === courseId && STATUSES.includes(doc.status) ? doc.status : "archived";
}

/** The owner's view of the catalog: every course of the registry with its status. */
async function listCatalog(container, deps = {}) {
  const out = [];
  for (const c of listLearningCourses()) {
    const doc = await (deps.downloadJsonOrNull || storage.downloadJsonOrNull)(container, catalogDocName(c.courseId));
    const valid = doc && doc.schemaVersion === 1 && doc.courseId === c.courseId && STATUSES.includes(doc.status);
    out.push({ courseId: c.courseId, title: c.title, subject: c.subject || "", modules: c.modules.length, status: !doc ? "published" : valid ? doc.status : "archived", updatedAt: valid ? String(doc.updatedAt || "") : "", updatedBy: valid ? String(doc.updatedBy || "") : "" });
  }
  return out;
}

/** Compare-and-set of one course's status. → { previous, status } */
async function writeCourseStatus(container, courseId, status, actor, nowMs = Date.now()) {
  if (!STATUSES.includes(status)) { const e = new Error("COURSE_STATUS_INVALID"); e.code = "COURSE_STATUS_INVALID"; throw e; }
  let previous = "published";
  await storage.mutateJsonWithRetry(container, catalogDocName(courseId), current => {
    previous = !current ? "published" : current.schemaVersion === 1 && STATUSES.includes(current.status) ? current.status : "archived";
    return { schemaVersion: 1, courseId, status, updatedAt: new Date(nowMs).toISOString(), updatedBy: String(actor || "") };
  });
  return { previous, status };
}

/** Whether the per-teacher narrowing applies now (only in ENFORCE; an unreadable mode = enforce: fail closed). */
async function entitlementsEnforced(container, deps = {}) {
  try { return (await readAccessMode(container, deps)).mode === "enforce"; } catch { return true; }
}

/** The courses a verified teacher session may use: null = every published course; an array = only those. Throws on failure. */
async function teacherEntitledCourses(container, user, deps = {}) {
  if (!user || user.am !== "managed") return null;                      // identities that predate the console: legacy-full
  if (!(await entitlementsEnforced(container, deps))) return null;
  return (await resolveTeacherAccess(user, { ...deps, container })).courses;
}

/** The courses the teacher who owns `classroom` may use (see above). null = every published course. Throws on failure. */
async function classOwnerEntitledCourses(container, classroom, deps = {}, env = process.env) {
  let owner = classroom && typeof classroom.ownerId === "string" && classroom.ownerId ? classroom.ownerId : null;
  if (!owner) owner = legacyDataOwner(env) || LEGACY_TEACHER_ACCOUNT_ID;
  if (!isTeacherAccountId(owner)) return null;                          // a BUILDER_USERS identity: legacy-full
  if (!(await entitlementsEnforced(container, deps))) return null;
  const account = await readTeacherAccount(container, owner, deps);
  if (!account) return null;                                            // the shared-password workspace not imported: today's access
  // D15: the account's status is deliberately not checked — a suspended teacher's students keep what was released.
  return (await resolveTeacherAccess({ am: "managed", sub: owner, accessRevisionId: account.accessRevisionId || null }, { ...deps, container })).courses;
}

async function decide(container, courseId, entitled, deps) {
  if (!knownCourse(courseId)) return { ok: false, code: "COURSE_UNKNOWN" };
  if ((await readCourseStatus(container, courseId, deps)) !== "published") return { ok: false, code: "COURSE_ARCHIVED" };
  const list = await entitled();
  if (list !== null && !list.includes(courseId)) return { ok: false, code: "COURSE_NOT_ENTITLED" };
  return { ok: true };
}
const safely = async fn => { try { return await fn(); } catch { return { ok: false, code: "COURSE_ACCESS_UNAVAILABLE" }; } };

/** May this verified TEACHER session use `courseId` now? */
function teacherCourseDecision(container, user, courseId, deps = {}) {
  return safely(() => decide(container, courseId, () => teacherEntitledCourses(container, user, deps), deps));
}
/** May the students of `classroom` use `courseId` now (as far as the catalog and their teacher's entitlement go)? */
function classCourseDecision(container, classroom, courseId, deps = {}, env = process.env) {
  return safely(() => decide(container, courseId, () => classOwnerEntitledCourses(container, classroom, deps, env), deps));
}

/** Of several courses, those the decision allows (one entitlement read for all). → string[] in the given order */
async function filterCourses(container, courseIds, entitled, deps = {}) {
  if (!courseIds.length) return [];                                     // nothing to decide → nothing read
  let list;
  try { list = await entitled(); } catch { return []; }
  const out = [];
  for (const id of courseIds) {
    if (!knownCourse(id)) continue;
    let status;
    try { status = await readCourseStatus(container, id, deps); } catch { continue; }
    if (status === "published" && (list === null || list.includes(id))) out.push(id);
  }
  return out;
}
const teacherAllowedCourses = (container, user, ids, deps = {}) => filterCourses(container, ids, () => teacherEntitledCourses(container, user, deps), deps);
const classAllowedCourses = (container, classroom, ids, deps = {}, env = process.env) => filterCourses(container, ids, () => classOwnerEntitledCourses(container, classroom, deps, env), deps);

/** The refusal every learning route returns for a course decision that is not ok. */
function courseRefusal(decision, { teacher = false } = {}) {
  if (decision.code === "COURSE_ACCESS_UNAVAILABLE") return { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "5" }, jsonBody: { ok: false, code: "ACCESS_UNAVAILABLE", error: "تعذر التحقق من الصلاحيات حاليًا. حاول مرة أخرى." } };
  if (decision.code === "COURSE_UNKNOWN") return { status: 404, headers: { "Cache-Control": "no-store" }, jsonBody: { ok: false, code: "COURSE_UNKNOWN", error: "المادة غير موجودة." } };
  return { status: 403, headers: { "Cache-Control": "no-store" }, jsonBody: { ok: false, code: "COURSE_NOT_AVAILABLE", error: teacher ? "هذا المقرر غير متاح لحسابك حاليًا. تواصل مع إدارة المنصة." : "هذه المادة غير متاحة حاليًا." } };
}

module.exports = {
  CATALOG_PREFIX, STATUSES, catalogDocName, readCourseStatus, listCatalog, writeCourseStatus, entitlementsEnforced,
  teacherEntitledCourses, classOwnerEntitledCourses, teacherCourseDecision, classCourseDecision, teacherAllowedCourses,
  classAllowedCourses, courseRefusal
};
