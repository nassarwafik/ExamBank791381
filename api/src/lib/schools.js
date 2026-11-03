const crypto = require("crypto");
const storage = require("./platform-storage");
const { createOnly } = require("./identity/owner-store");
const { readTeacherAccount } = require("./identity/teacher-accounts");
const { isTeacherAccountId, LEGACY_TEACHER_ACCOUNT_ID } = require("./identity/teacher-token");
const { legacyDataOwner } = require("./teacher-tenancy");
const { photoMeta, photoRecord } = require("./profile-photo-store");

// Tadris+ P4-C — the school identity (blueprint §19.2 / §19.8, owner decisions): a school is a NAME and an optional LOGO that
// the owner creates and links teachers to. It is PRESENTATION ONLY — it grants nothing, it is never an authority, and a teacher
// or student without a school sees exactly what they saw before.
//
//   platform/schools/<sch_16hex>.json
//   { schemaVersion: 1, schoolId, name, profilePhoto: { version, updatedAt, blobKey } | null, profilePhotoSeq, createdAt,
//     createdBy, updatedAt }
//   The logo is stored by the SAME immutable-blob publication authority as profile photos (profile-photo-store.js), whose
//   persisted field is `profilePhoto`; for a school document that field IS the logo. Blobs: platform/school-logos/<schoolId>/.
//   A teacher account carries `schoolId` (null / absent = no school). Only the owner changes either.
//
// Whose school is shown:
//   a managed teacher                 → its account's school;
//   any other teacher session         → none (identities that predate the Owner Console);
//   a student                         → the school of the teacher who owns the student (student.ownerId, else its class's
//                                       ownerId, else LEGACY_DATA_OWNER); unowned (pre-tenancy) data belongs to the imported
//                                       shared-password workspace (t_legacy), so its school is shown when that account exists.
// A read problem never blocks anything: the identity is simply not shown (and logged by the caller).

const SCHOOL_PREFIX = "platform/schools/";
const LOGO_PREFIX = "platform/school-logos/";
const SCHOOL_ID_RE = /^sch_[a-f0-9]{16}$/;
const MAX_NAME = 120;

const isSchoolId = id => SCHOOL_ID_RE.test(String(id || ""));
const schoolDocName = id => {
  if (!isSchoolId(id)) throw new Error("Invalid school id.");
  return SCHOOL_PREFIX + id + ".json";
};
const logoPrefix = id => {
  if (!isSchoolId(id)) throw new Error("Invalid school id.");
  return LOGO_PREFIX + id + "/";
};
const newSchoolId = () => "sch_" + crypto.randomBytes(8).toString("hex");
/** The display name the owner typed: trimmed, inner whitespace collapsed, bounded. "" when empty. */
const normalizeSchoolName = v => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_NAME);

const validSchool = (doc, id) => Boolean(doc && typeof doc === "object" && doc.schemaVersion === 1 && doc.schoolId === id && typeof doc.name === "string" && doc.name);

async function readSchool(container, id, deps = {}) {
  if (!isSchoolId(id)) return null;
  const doc = await (deps.downloadJsonOrNull || storage.downloadJsonOrNull)(container, schoolDocName(id));
  return validSchool(doc, id) ? doc : null;
}

async function listSchools(container) {
  const docs = await storage.listJson(container, SCHOOL_PREFIX);
  return docs.filter(d => d && isSchoolId(d.schoolId) && validSchool(d, d.schoolId));
}

/** Create-only (a random id never collides in practice; a collision is refused, never overwritten). */
async function createSchool(container, { name, createdBy, nowMs = Date.now() }) {
  const iso = new Date(nowMs).toISOString();
  const doc = { schemaVersion: 1, schoolId: newSchoolId(), name, profilePhoto: null, createdAt: iso, createdBy: String(createdBy || ""), updatedAt: iso };
  const created = await createOnly(container, schoolDocName(doc.schoolId), doc);
  return created ? doc : null;
}

function mutateSchool(container, id, mutate) {
  return storage.mutateJsonWithRetry(container, schoolDocName(id), current => {
    if (!validSchool(current, id)) { const e = new Error("SCHOOL_NOT_FOUND"); e.code = "SCHOOL_NOT_FOUND"; throw e; }
    return mutate(current);
  });
}

/** What teachers and students see (and the owner list): never a blob key. */
function publicSchool(doc) {
  return { schoolId: doc.schoolId, name: doc.name, logo: photoMeta(doc) };
}

/** The school of a teacher ACCOUNT (null: none, or a link to a school that no longer validates). */
async function schoolOfAccount(container, account, deps = {}) {
  if (!account || !isSchoolId(account.schoolId)) return null;
  return readSchool(container, account.schoolId, deps);
}

/** The school of a verified teacher session `user` (requireTeacherSession's user, or the sign-in's account). */
async function schoolForTeacher(container, user, deps = {}) {
  if (!user || user.am !== "managed" || !isTeacherAccountId(user.sub)) return null;
  if (Object.prototype.hasOwnProperty.call(user, "schoolId")) return isSchoolId(user.schoolId) ? readSchool(container, user.schoolId, deps) : null;
  return schoolOfAccount(container, await readTeacherAccount(container, user.sub, deps), deps);
}

/** The teacher account that owns a student (see above), or null. */
async function ownerAccountIdOfStudent(container, student, deps = {}, env = process.env) {
  if (!student || typeof student !== "object") return null;
  let owner = typeof student.ownerId === "string" && student.ownerId ? student.ownerId : null;
  if (!owner && student.classId) {
    const cls = await (deps.downloadJsonOrNull || storage.downloadJsonOrNull)(container, "platform/classes/" + String(student.classId) + ".json");
    if (cls && typeof cls.ownerId === "string" && cls.ownerId) owner = cls.ownerId;
  }
  if (!owner) owner = legacyDataOwner(env) || LEGACY_TEACHER_ACCOUNT_ID;      // unowned data = the imported workspace's
  return isTeacherAccountId(owner) ? owner : null;
}

/** The school a student sees: their teacher's school. */
async function schoolForStudent(container, student, deps = {}, env = process.env) {
  const owner = await ownerAccountIdOfStudent(container, student, deps, env);
  if (!owner) return null;
  return schoolOfAccount(container, await readTeacherAccount(container, owner, deps), deps);
}

/**
 * The `school` field for a sign-in / session answer: `{ school }` when there is one, `{}` otherwise — so an answer without a
 * school is exactly what it was before. Never throws (presentation only): a failure is logged and nothing is shown.
 */
async function schoolField(load, obs) {
  try {
    const doc = await load();
    return doc ? { school: publicSchool(doc) } : {};
  } catch (e) {
    obs?.logWarn?.("school.identity_unavailable", { reason: String(e && e.code || "error") });
    return {};
  }
}

module.exports = {
  SCHOOL_PREFIX, LOGO_PREFIX, SCHOOL_ID_RE, MAX_NAME, isSchoolId, schoolDocName, logoPrefix, newSchoolId, normalizeSchoolName,
  readSchool, listSchools, createSchool, mutateSchool, publicSchool, schoolOfAccount, schoolForTeacher, ownerAccountIdOfStudent,
  schoolForStudent, schoolField, photoRecord
};
