const { readTeacherAccount } = require("../identity/teacher-accounts");
const { resolveTeacherAccess } = require("./resolver");
const { entitlementsEnforced } = require("./course-access");
const { ownerAccountIdOfStudent } = require("../schools");
const { isTeacherAccountId, LEGACY_TEACHER_ACCOUNT_ID } = require("../identity/teacher-token");
const { legacyDataOwner } = require("../teacher-tenancy");

// Tadris+ P7-B — what a STUDENT may use, from the access of the teacher the student belongs to (blueprint §10, acceptance test 8):
// a teacher without messages has no messaging service for their students either. The same rules as the course entitlement
// (course-access.js): the teacher is student.ownerId, else the class's owner, else LEGACY_DATA_OWNER, else the imported workspace;
// applied only while the owner's access mode is ENFORCE; an identity that predates the console (BUILDER_USERS), or a workspace not
// imported, keeps today's services; D15 — the teacher's account STATUS is not a condition (a suspended teacher's students keep
// reading what is there). An unreadable mode or revision while it matters → throws (the caller fails closed).
//
//   messages — the teacher holds messages.inbox.read (someone can read what the student sends)
//
// → { messages: boolean }

const MESSAGES_CAPABILITY = "messages.inbox.read";
const EVERYTHING = Object.freeze({ messages: true });

/** The student's teacher — the same rule as ownerAccountIdOfStudent; `classroom` (already loaded by the caller) avoids a second read. */
async function teacherOfStudent(container, student, classroom, deps, env) {
  if (classroom === undefined) return ownerAccountIdOfStudent(container, student, deps, env);
  let owner = student && typeof student.ownerId === "string" && student.ownerId ? student.ownerId : null;
  if (!owner && classroom && typeof classroom.ownerId === "string" && classroom.ownerId) owner = classroom.ownerId;
  if (!owner) owner = legacyDataOwner(env) || LEGACY_TEACHER_ACCOUNT_ID;
  return isTeacherAccountId(owner) ? owner : null;
}

async function studentServices(container, student, deps = {}, env = process.env, { classroom } = {}) {
  const owner = await teacherOfStudent(container, student, classroom, deps, env);
  if (!owner) return EVERYTHING;
  if (!(await entitlementsEnforced(container, deps))) return EVERYTHING;
  const account = await readTeacherAccount(container, owner, deps);
  if (!account) return EVERYTHING;
  const access = await resolveTeacherAccess({ am: "managed", sub: owner, accessRevisionId: account.accessRevisionId || null }, { ...deps, container });
  return { messages: access.capabilities.includes(MESSAGES_CAPABILITY) };
}

const NO_STORE = { "Cache-Control": "no-store", "Pragma": "no-cache" };
const serviceUnavailable = () => ({ status: 503, headers: { ...NO_STORE, "Retry-After": "5" }, jsonBody: { ok: false, code: "SERVICE_CHECK_UNAVAILABLE", error: "تعذر التحقق من الخدمات حاليًا. حاول مرة أخرى." } });
const serviceOff = service => ({ status: 403, headers: NO_STORE, jsonBody: { ok: false, code: "SERVICE_NOT_AVAILABLE", service, error: "هذه الخدمة غير مفعّلة لصفك." } });

/** null (go on) or the response to return: the student's teacher does not offer `service` (403), or it cannot be decided (503). */
async function requireStudentService(container, student, service, deps = {}, obs = null, options = {}) {
  let s;
  try { s = await studentServices(container, student, deps, process.env, options); } catch (e) {
    obs?.logWarn?.("student.services.unavailable", { reason: String(e && e.code || "error") });
    return serviceUnavailable();
  }
  return s[service] ? null : serviceOff(service);
}

module.exports = { studentServices, requireStudentService, MESSAGES_CAPABILITY };
