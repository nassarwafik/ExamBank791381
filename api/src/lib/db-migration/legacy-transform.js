// Phase 15A — pure transforms from the legacy blob documents to database rows
// (docs/database-architecture-15.md §5 and §7). No I/O here: the reader supplies documents, the loader writes rows.
//
// Scope of 15A: the domains of phases 15B–15D — school, the existing teacher, students and credentials,
// classes (+ teachers, programs, learning courses), enrollments, assignments, submissions and attempts.
//
// Rules:
// - Ids are kept verbatim.
// - LOSSLESS: every field of a legacy document without a column of its own goes to extra_json, and so does the RAW
//   value of every field that is stored normalized (trimmed, de-duplicated, derived) when normalizing changed it.
// - Nothing is silently dropped or guessed. Each problem becomes an anomaly:
//     blocking  the load would fail, or login / ownership behaviour would change. --apply refuses to run.
//     skipped   a document whose parent no longer exists (e.g. a submission of a deleted student). It is not
//               loaded — the app cannot reach it today either — and is listed.
//     warning   loaded, but worth a look (e.g. roster-index drift, a student without a class).
// - Anomalies are SHAREABLE: they carry user / class / assignment ids (UUIDs) and blob names only. Credential blobs
//   are named sha256(student code), and codes are 9-digit identity numbers, so such a name could be reversed by brute
//   force: credential anomalies therefore never print the blob name — only an ordinal ("auth#3") and the user id.

const { normalizeStudentCode, studentCodeHash, normalizeAuthVersion } = require("../student-auth");
const { normalizeClassStatus } = require("../class-lifecycle");
const { normalizeAssignmentStatus } = require("../assignment-lifecycle");
const { getClassProgramCodes } = require("../project-tracker/class-programs");
const { getClassLearningMaterials } = require("../class-learning-materials");
const { teacherKey } = require("../teacher-profile");

const PREFIX = {
  users: "platform/users/",
  auth: "platform/auth/",
  classes: "platform/classes/",
  assignments: "platform/assignments/",
  submissions: "platform/submissions/",
  teacherProfiles: "platform/teacher-profiles/"
};

/** Tables filled by this transform, in foreign-key (load) order. */
const TABLES = [
  "schools", "users", "user_credentials", "school_memberships",
  "classes", "class_teachers", "class_programs", "class_learning_courses", "enrollments",
  "assignments", "submissions", "attempts"
];

const SEEDED_COURSES = new Set(["791381", "794589", "883589", "899373"]);

// ---------- small helpers ----------

function str(value) { return value === undefined || value === null ? "" : String(value); }
function nonEmpty(value) { const s = str(value).trim(); return s === "" ? null : s; }
function isPlainObject(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
function sameJson(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

/** ISO timestamp → normalized ISO string (UTC, ms); "" / missing → null; unparseable → undefined (caller reports). */
function timestamp(value) {
  if (value === undefined || value === null || value === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function finiteOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function intOrNull(value) {
  const n = finiteOrNull(value);
  if (n === null || n === undefined) return n;
  return Number.isInteger(n) ? n : undefined;
}

function boolOrNull(value) { return value === undefined || value === null ? null : value === true; }

/** Same rule as manage-students normalizeIdentityNumber: digits only, left-padded to 9. */
function normalizeIdentityNumber(value) {
  const digits = str(value).replace(/\D/g, "");
  if (!digits) return "";
  return digits.length <= 9 ? digits.padStart(9, "0") : digits;
}

/**
 * extra_json builder. Starts with every field that has no column; keep(key, raw, stored) adds the raw value of a
 * mapped field whenever what is stored differs from it (a trimmed name, a normalized status, a de-duplicated list).
 */
function extraBuilder(doc, mappedKeys) {
  const extra = {};
  for (const [k, v] of Object.entries(doc || {})) if (!mappedKeys.includes(k) && v !== undefined) extra[k] = v;
  return {
    extra,
    keep(key, raw, stored) { if (raw !== undefined && !sameJson(raw, stored)) extra[key] = raw; },
    set(key, value) { extra[key] = value; },
    json() { return Object.keys(extra).length ? JSON.stringify(extra) : null; }
  };
}

function idFromBlobName(name, prefix) {
  const tail = str(name).slice(prefix.length);
  return tail.endsWith(".json") ? tail.slice(0, -5) : tail;
}

function createCollector() {
  const anomalies = [];
  return {
    anomalies,
    add(severity, code, blob, detail) { anomalies.push({ severity, code, blob: blob || "", ...(detail ? { detail } : {}) }); }
  };
}

/**
 * A JSON column value. Objects and arrays are stored as JSON text. null / undefined become `fallback` (JSON text, or
 * null for a nullable column). A scalar cannot be stored (ISJSON accepts objects and arrays only): onScalar receives
 * it so the caller keeps it in extra_json.
 */
function jsonValue(value, fallback, onScalar) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "object") return JSON.stringify(value);
  onScalar(value);
  return fallback;
}

function photoFields(photo, onInvalid) {
  const p = isPlainObject(photo) ? photo : {};
  const version = intOrNull(p.version);
  const updated = timestamp(p.updatedAt);
  if (version === undefined) onInvalid("profilePhoto.version");
  if (updated === undefined) onInvalid("profilePhoto.updatedAt");
  return {
    photo_blob_key: nonEmpty(p.blobKey), photo_version: version ?? null, photo_updated_at: updated || null,
    // Sub-fields other than the three mapped ones would be lost: the caller keeps the whole object then.
    hasOtherFields: Object.keys(p).some(k => !["blobKey", "version", "updatedAt"].includes(k)) || (p.blobKey !== undefined && typeof p.blobKey !== "string")
  };
}

// ---------- the transform ----------

/**
 * @param legacy  { users, auth, classes, assignments, submissions, teacherProfiles }: arrays of { name, doc }
 * @param options { school: { schoolId, name, ministryCode? }, teacher: { userId, loginCode, displayName? }, now }
 * @returns { tables: { [table]: rows[] }, anomalies, stats }
 */
function transformLegacy(legacy, options) {
  const L = { users: [], auth: [], classes: [], assignments: [], submissions: [], teacherProfiles: [], ...(legacy || {}) };
  const o = options || {};
  const now = timestamp(o.now) || new Date().toISOString();
  const out = Object.fromEntries(TABLES.map(t => [t, []]));
  const c = createCollector();
  const stats = { documents: {}, skipped: {} };
  for (const k of Object.keys(PREFIX)) stats.documents[k] = (L[k] || []).length;
  const skip = (kind) => { stats.skipped[kind] = (stats.skipped[kind] || 0) + 1; };

  const schoolId = nonEmpty(o.school && o.school.schoolId);
  const schoolName = nonEmpty(o.school && o.school.name);
  const teacherId = nonEmpty(o.teacher && o.teacher.userId);
  // The builder login is an exact (trimmed) match of BUILDER_USER_CODE: store it unchanged. Collisions with student
  // codes are checked on the normalized form, which is how student codes are compared.
  const teacherCode = nonEmpty(o.teacher && o.teacher.loginCode);
  if (!schoolId || !schoolName) c.add("blocking", "school-options-missing", "", "school id and name are required");
  if (!teacherId || !teacherCode) c.add("blocking", "teacher-options-missing", "", "teacher user id and login code (BUILDER_USER_CODE) are required");

  // ----- school -----
  out.schools.push({
    school_id: schoolId, name: schoolName, ministry_code: nonEmpty(o.school && o.school.ministryCode),
    status: "active", settings_json: null, created_at: now, updated_at: now
  });

  // ----- the existing teacher (the single BUILDER identity) -----
  // Legacy teacher profile documents are keyed by the token subject (= the builder user code).
  const profileBlob = PREFIX.teacherProfiles + teacherKey(teacherCode) + ".json";
  const profile = (L.teacherProfiles || []).find(p => p.name === profileBlob)
    || (L.teacherProfiles.length === 1 ? L.teacherProfiles[0] : null);
  if (L.teacherProfiles.length > 1 && !profile) c.add("warning", "teacher-profile-ambiguous", "", L.teacherProfiles.length + " teacher profiles, none matches the login code");
  const pdoc = (profile && isPlainObject(profile.doc) && profile.doc) || {};
  const tExtra = extraBuilder(pdoc, ["displayName", "avatarId", "profilePhoto", "updatedAt"]);
  const tPhoto = photoFields(pdoc.profilePhoto, what => c.add("blocking", "invalid-value", profile && profile.name, "teacher." + what));
  if (tPhoto.hasOtherFields) tExtra.set("profilePhoto", pdoc.profilePhoto);
  const tName = nonEmpty(pdoc.displayName) || nonEmpty(o.teacher && o.teacher.displayName) || "المعلم";
  tExtra.keep("displayName", pdoc.displayName, tName);
  const tUpdated = timestamp(pdoc.updatedAt);
  if (tUpdated === undefined) c.add("blocking", "invalid-timestamp", profile && profile.name, "teacher.updatedAt");
  out.users.push({
    user_id: teacherId, kind: "staff", login_code: teacherCode, identity_number: null,
    first_name: "", family_name: "", display_name: tName,
    email: null, is_platform_admin: true, is_active: true, is_archived: false, auth_version: 1,
    avatar_id: nonEmpty(pdoc.avatarId), photo_blob_key: tPhoto.photo_blob_key, photo_version: tPhoto.photo_version,
    photo_updated_at: tPhoto.photo_updated_at, share_achievements: null, last_login_at: null,
    extra_json: tExtra.json(),
    created_at: tUpdated || now, updated_at: tUpdated || now
  });
  out.school_memberships.push(
    { school_id: schoolId, user_id: teacherId, role: "school_admin", status: "active", created_at: now, updated_at: now },
    { school_id: schoolId, user_id: teacherId, role: "teacher", status: "active", created_at: now, updated_at: now }
  );

  // ----- students -----
  const USER_KEYS = ["userId", "role", "code", "identityNumber", "firstName", "familyName", "displayName", "active", "archived",
    "authVersion", "avatarId", "profilePhoto", "shareAchievements", "lastLoginAt", "createdAt", "updatedAt", "classId"];
  const students = new Map();            // userId -> { doc, blob, row, extra }
  const loginCodes = new Map([[normalizeStudentCode(teacherCode), "(teacher)"]]);
  const identityNumbers = new Map();
  for (const { name, doc } of L.users) {
    if (!isPlainObject(doc)) { c.add("blocking", "user-unreadable", name); continue; }
    const blobId = idFromBlobName(name, PREFIX.users);
    const userId = nonEmpty(doc.userId) || blobId;
    if (userId !== blobId) c.add("blocking", "user-id-mismatch", name, "document userId differs from the blob name");
    if (doc.role !== undefined && doc.role !== "student") { c.add("blocking", "user-unexpected-role", name, "role=" + str(doc.role)); continue; }
    if (students.has(userId)) { c.add("blocking", "user-duplicate-id", name); continue; }
    // Exactly the app's identity rules (manage-students publicStudent): the identity number falls back to a 9-digit
    // code, and the login code falls back to the identity number.
    const identity = normalizeIdentityNumber(doc.identityNumber || (/^\d{9}$/.test(str(doc.code)) ? doc.code : "")) || null;
    const code = normalizeStudentCode(doc.code || identity || "");
    if (!code) { c.add("blocking", "user-missing-code", name); continue; }
    if (loginCodes.has(code)) c.add("blocking", loginCodes.get(code) === "(teacher)" ? "login-code-collides-with-teacher" : "login-code-duplicate", name, "also used by " + loginCodes.get(code));
    else loginCodes.set(code, name);
    if (identity) {
      if (identityNumbers.has(identity)) c.add("blocking", "identity-number-duplicate", name, "also used by " + identityNumbers.get(identity));
      else identityNumbers.set(identity, name);
    }
    const x = extraBuilder(doc, USER_KEYS);
    const photo = photoFields(doc.profilePhoto, what => c.add("blocking", "invalid-value", name, "user." + what));
    if (photo.hasOtherFields) x.set("profilePhoto", doc.profilePhoto);
    const times = { lastLoginAt: timestamp(doc.lastLoginAt), createdAt: timestamp(doc.createdAt), updatedAt: timestamp(doc.updatedAt) };
    for (const [k, v] of Object.entries(times)) if (v === undefined) c.add("blocking", "invalid-timestamp", name, "user." + k);
    const first = str(doc.firstName).trim(), family = str(doc.familyName).trim();
    const display = str(doc.displayName).trim() || (first + " " + family).trim() || code;
    const authVersion = normalizeAuthVersion(doc.authVersion);
    x.keep("code", doc.code, code);
    x.keep("identityNumber", doc.identityNumber, identity || undefined);
    x.keep("firstName", doc.firstName, first);
    x.keep("familyName", doc.familyName, family);
    x.keep("displayName", doc.displayName, display);
    x.keep("authVersion", doc.authVersion, authVersion);
    x.keep("active", doc.active, doc.active !== false);
    x.keep("archived", doc.archived, doc.archived === true);
    x.keep("shareAchievements", doc.shareAchievements, doc.shareAchievements !== false);
    x.keep("avatarId", doc.avatarId, nonEmpty(doc.avatarId) ?? undefined);
    const row = {
      user_id: userId, kind: "student", login_code: code, identity_number: identity,
      first_name: first, family_name: family, display_name: display,
      email: null, is_platform_admin: false, is_active: doc.active !== false, is_archived: doc.archived === true,
      auth_version: authVersion,
      avatar_id: nonEmpty(doc.avatarId), photo_blob_key: photo.photo_blob_key, photo_version: photo.photo_version,
      photo_updated_at: photo.photo_updated_at,
      share_achievements: doc.shareAchievements === undefined ? null : doc.shareAchievements !== false,
      last_login_at: times.lastLoginAt || null,
      extra_json: null, // finalized after enrollment (classId is kept when no enrollment row carries it)
      created_at: times.createdAt || times.updatedAt || now,
      updated_at: times.updatedAt || times.createdAt || now
    };
    out.users.push(row);
    out.school_memberships.push({ school_id: schoolId, user_id: userId, role: "student", status: "active", created_at: row.created_at, updated_at: row.updated_at });
    students.set(userId, { doc, blob: name, row, extra: x });
  }

  // ----- credentials (anomalies never print the auth blob name: see the header) -----
  const AUTH_KEYS = ["userId", "codeHash", "salt", "passwordHash", "active", "authVersion", "createdAt", "updatedAt"];
  const credentialsByUser = new Map();
  L.auth.forEach(({ name, doc }, index) => {
    const label = "auth#" + (index + 1);
    if (!isPlainObject(doc)) { c.add("blocking", "credential-unreadable", label); return; }
    const userId = nonEmpty(doc.userId);
    const student = userId && students.get(userId);
    if (!student) { c.add("skipped", "credential-unknown-user", label, userId ? "user " + userId : "no userId"); skip("auth"); return; }
    if (credentialsByUser.has(userId)) { c.add("blocking", "credential-duplicate", label, "user " + userId + ", also " + credentialsByUser.get(userId)); return; }
    // Login today = sha256(normalized code) → this blob → userId. The new login looks users.login_code up directly,
    // so the two must agree or the student would lose access.
    const hashFromName = idFromBlobName(name, PREFIX.auth);
    if (hashFromName !== studentCodeHash(student.row.login_code)) { c.add("blocking", "credential-code-mismatch", label, "user " + userId); return; }
    if (!nonEmpty(doc.salt) || !nonEmpty(doc.passwordHash)) { c.add("blocking", "credential-incomplete", label, "user " + userId); return; }
    const authVersion = normalizeAuthVersion(doc.authVersion);
    if (authVersion !== student.row.auth_version) c.add("warning", "credential-auth-version-differs", label, "user " + userId + " (login fails closed today; preserved as is)");
    const created = timestamp(doc.createdAt), updated = timestamp(doc.updatedAt);
    if (created === undefined || updated === undefined) c.add("blocking", "invalid-timestamp", label, "credential of user " + userId);
    const x = extraBuilder(doc, AUTH_KEYS);
    x.keep("authVersion", doc.authVersion, authVersion);
    x.keep("active", doc.active, doc.active !== false);
    if (doc.codeHash !== undefined && doc.codeHash !== hashFromName) x.set("codeHash", doc.codeHash);
    out.user_credentials.push({
      user_id: userId, hash_scheme: "scrypt-b64-v1", password_salt: str(doc.salt), password_hash: str(doc.passwordHash),
      auth_version: authVersion, is_active: doc.active !== false, must_change_password: false, extra_json: x.json(),
      created_at: created || now, updated_at: updated || created || now
    });
    credentialsByUser.set(userId, label);
  });
  for (const [userId, s] of students) if (!credentialsByUser.has(userId)) c.add("warning", "student-without-credential", s.blob, "cannot log in today either");

  // ----- classes -----
  const CLASS_KEYS = ["classId", "name", "grade", "schoolYear", "active", "status", "archivedAt", "archivedBy", "archiveReason",
    "graduationYear", "createdAt", "updatedAt", "studentIds", "programCode", "programCodes", "learningMaterials"];
  const classes = new Map();
  for (const { name, doc } of L.classes) {
    if (!isPlainObject(doc)) { c.add("blocking", "class-unreadable", name); continue; }
    const blobId = idFromBlobName(name, PREFIX.classes);
    const classId = nonEmpty(doc.classId) || blobId;
    if (classId !== blobId) c.add("blocking", "class-id-mismatch", name);
    if (classes.has(classId)) { c.add("blocking", "class-duplicate-id", name); continue; }
    const times = { archivedAt: timestamp(doc.archivedAt), createdAt: timestamp(doc.createdAt), updatedAt: timestamp(doc.updatedAt) };
    for (const [k, v] of Object.entries(times)) if (v === undefined) c.add("blocking", "invalid-timestamp", name, "class." + k);
    const x = extraBuilder(doc, CLASS_KEYS);
    const status = normalizeClassStatus(doc);
    // Raw lifecycle flags are kept unless they are exactly the canonical shape of the stored status.
    if (doc.status !== undefined && doc.status !== status) x.set("status", doc.status);
    if (doc.active !== undefined && doc.active !== (status === "active")) x.set("active", doc.active);
    // Programs: stored normalized and de-duplicated (a historical document can repeat a code). Any raw shape that
    // differs from the stored list — a legacy scalar, duplicates — is kept as it was.
    const programs = [...new Set(getClassProgramCodes(doc))];
    if (doc.programCode !== undefined) x.set("programCode", doc.programCode);
    x.keep("programCodes", doc.programCodes, programs);
    const learning = getClassLearningMaterials(doc);
    x.keep("learningMaterials", doc.learningMaterials, learning);
    const className = str(doc.name).trim() || classId;
    x.keep("name", doc.name, className);
    const row = {
      class_id: classId, school_id: schoolId, name: className, grade: str(doc.grade), school_year: str(doc.schoolYear),
      status, archived_at: times.archivedAt || null, archived_by: nonEmpty(doc.archivedBy),
      archive_reason: nonEmpty(doc.archiveReason), graduation_year: nonEmpty(doc.graduationYear),
      extra_json: x.json(),
      created_at: times.createdAt || times.updatedAt || now, updated_at: times.updatedAt || times.createdAt || now
    };
    out.classes.push(row);
    out.class_teachers.push({ class_id: classId, teacher_user_id: teacherId, role: "owner", added_at: row.created_at });
    for (const code of programs) {
      if (!SEEDED_COURSES.has(code)) c.add("blocking", "unknown-program-code", name, "program " + code);
      out.class_programs.push({ class_id: classId, course_code: code });
    }
    for (const entry of learning) {
      out.class_learning_courses.push({ class_id: classId, course_id: entry.courseId, visible_module_ids_json: JSON.stringify(entry.visibleModuleIds || []), updated_at: row.updated_at });
    }
    classes.set(classId, { doc, blob: name, row });
  }

  // ----- enrollments: user.classId is the authority; classroom.studentIds is only a repairable index -----
  for (const [userId, s] of students) {
    const rawClassId = s.doc.classId;
    const classId = nonEmpty(rawClassId);
    if (!classId) c.add("warning", "student-without-class", s.blob);
    else if (!classes.has(classId)) { c.add("skipped", "enrollment-unknown-class", s.blob, "class " + classId); skip("enrollments"); }
    else out.enrollments.push({ class_id: classId, student_user_id: userId, status: "active", enrolled_at: s.row.created_at, ended_at: null });
    // The enrollment row carries a valid classId; any other value (empty, dangling, untrimmed) is kept as it was.
    if (rawClassId !== undefined && !(classId && classes.has(classId) && rawClassId === classId)) s.extra.set("classId", rawClassId);
    s.row.extra_json = s.extra.json();
  }
  for (const [, k] of classes) {
    const ids = Array.isArray(k.doc.studentIds) ? k.doc.studentIds.map(str) : [];
    const drift = ids.filter(id => !students.has(id) || nonEmpty(students.get(id).doc.classId) !== k.row.class_id);
    if (drift.length) c.add("warning", "roster-index-drift", k.blob, drift.length + " id(s) in studentIds are not members (index ignored; user.classId is the authority)");
  }

  // ----- assignments -----
  const ASSIGNMENT_KEYS = ["assignmentId", "classId", "title", "instructions", "status", "schemaVersion", "attemptModelVersion", "attemptPolicy",
    "openAt", "dueAt", "maxAttempts", "durationMinutes", "sourceExamId", "sourceExamTitle", "className", "questionCount", "totalMarks",
    "examSnapshot", "createdBy", "createdAt", "updatedAt"];
  const assignments = new Map();
  for (const { name, doc } of L.assignments) {
    if (!isPlainObject(doc)) { c.add("blocking", "assignment-unreadable", name); continue; }
    const blobId = idFromBlobName(name, PREFIX.assignments);
    const assignmentId = nonEmpty(doc.assignmentId) || blobId;
    if (assignmentId !== blobId) c.add("blocking", "assignment-id-mismatch", name);
    if (assignments.has(assignmentId)) { c.add("blocking", "assignment-duplicate-id", name); continue; }
    const classId = nonEmpty(doc.classId);
    if (!classId || !classes.has(classId)) { c.add("skipped", "assignment-unknown-class", name, "class " + str(classId)); skip("assignments"); continue; }
    const x = extraBuilder(doc, ASSIGNMENT_KEYS);
    const times = { openAt: timestamp(doc.openAt), dueAt: timestamp(doc.dueAt), createdAt: timestamp(doc.createdAt), updatedAt: timestamp(doc.updatedAt) };
    for (const [k, v] of Object.entries(times)) if (v === undefined) c.add("blocking", "invalid-timestamp", name, "assignment." + k);
    const numbers = { maxAttempts: intOrNull(doc.maxAttempts), durationMinutes: intOrNull(doc.durationMinutes), questionCount: intOrNull(doc.questionCount),
      totalMarks: finiteOrNull(doc.totalMarks), schemaVersion: intOrNull(doc.schemaVersion), attemptModelVersion: intOrNull(doc.attemptModelVersion) };
    for (const [k, v] of Object.entries(numbers)) if (v === undefined) c.add("blocking", "invalid-number", name, "assignment." + k);
    if (!isPlainObject(doc.examSnapshot) && !Array.isArray(doc.examSnapshot)) c.add("warning", "assignment-without-snapshot", name, "stored as {}");
    const snapshot = jsonValue(doc.examSnapshot, "{}", v => x.set("examSnapshot", v));
    const status = normalizeAssignmentStatus(doc);
    const title = str(doc.title).trim() || assignmentId;
    x.keep("status", doc.status, status);
    x.keep("title", doc.title, title);
    x.keep("classId", doc.classId, classId);
    for (const k of ["maxAttempts", "durationMinutes", "questionCount", "totalMarks", "schemaVersion", "attemptModelVersion"]) {
      if (doc[k] !== undefined && typeof doc[k] !== "number") x.set(k, doc[k]); // e.g. a numeric string
    }
    const createdBy = nonEmpty(doc.createdBy);
    out.assignments.push({
      assignment_id: assignmentId, school_id: schoolId, class_id: classId, title,
      instructions: str(doc.instructions), status,
      schema_version: numbers.schemaVersion ?? 2, attempt_model_version: numbers.attemptModelVersion ?? 0,
      attempt_policy: nonEmpty(doc.attemptPolicy), open_at: times.openAt || null, due_at: times.dueAt || null,
      max_attempts: numbers.maxAttempts ?? 1, duration_minutes: numbers.durationMinutes ?? null,
      source_exam_id: nonEmpty(doc.sourceExamId), source_exam_title: nonEmpty(doc.sourceExamTitle),
      class_name_at_creation: nonEmpty(doc.className), question_count: numbers.questionCount ?? null, total_marks: numbers.totalMarks ?? null,
      exam_snapshot_json: snapshot, created_by: createdBy,
      created_by_user_id: createdBy && teacherCode && createdBy === teacherCode ? teacherId : null,
      extra_json: x.json(),
      created_at: times.createdAt || times.updatedAt || now, updated_at: times.updatedAt || times.createdAt || now
    });
    assignments.set(assignmentId, { doc, blob: name });
  }

  // ----- submissions and attempts -----
  const SUBMISSION_KEYS = ["assignmentId", "studentId", "classId", "studentCode", "studentName", "allowedAttempts", "draftAnswers",
    "activeAttempt", "attempts", "createdAt", "updatedAt"];
  const ATTEMPT_KEYS = ["attemptNumber", "startedAt", "endsAt", "submittedAt", "endedAt", "endReason", "timedOut", "score", "totalMarks",
    "percentage", "manualReviewMarks", "finalized", "reviewedAt", "teacherFeedback", "answers", "questionGrades", "sections", "manualOverrides"];
  const seenSubmissions = new Set();
  for (const { name, doc } of L.submissions) {
    if (!isPlainObject(doc)) { c.add("blocking", "submission-unreadable", name); continue; }
    const parts = str(name).slice(PREFIX.submissions.length).replace(/\.json$/, "").split("/");
    if (parts.length !== 2) { c.add("blocking", "submission-unexpected-path", name); continue; }
    const [assignmentId, studentId] = parts;
    if ((doc.assignmentId !== undefined && str(doc.assignmentId) !== assignmentId) || (doc.studentId !== undefined && str(doc.studentId) !== studentId)) {
      c.add("blocking", "submission-id-mismatch", name); continue;
    }
    if (!assignments.has(assignmentId)) { c.add("skipped", "submission-unknown-assignment", name); skip("submissions"); continue; }
    if (!students.has(studentId)) { c.add("skipped", "submission-unknown-student", name); skip("submissions"); continue; }
    const key = assignmentId + "/" + studentId;
    if (seenSubmissions.has(key)) { c.add("blocking", "submission-duplicate", name); continue; }
    seenSubmissions.add(key);
    const x = extraBuilder(doc, SUBMISSION_KEYS);
    const created = timestamp(doc.createdAt), updated = timestamp(doc.updatedAt);
    if (created === undefined || updated === undefined) c.add("blocking", "invalid-timestamp", name, "submission");
    const allowed = intOrNull(doc.allowedAttempts);
    if (allowed === undefined) c.add("blocking", "invalid-number", name, "submission.allowedAttempts");
    if (doc.attempts !== undefined && !Array.isArray(doc.attempts)) c.add("blocking", "submission-attempts-not-array", name);
    x.keep("classId", doc.classId, nonEmpty(doc.classId) ?? undefined);
    x.keep("studentCode", doc.studentCode, nonEmpty(doc.studentCode) ?? undefined);
    x.keep("studentName", doc.studentName, nonEmpty(doc.studentName) ?? undefined);
    if (doc.allowedAttempts !== undefined && doc.allowedAttempts !== null && typeof doc.allowedAttempts !== "number") x.set("allowedAttempts", doc.allowedAttempts);
    const draft = jsonValue(doc.draftAnswers, "{}", v => x.set("draftAnswers", v));
    const active = jsonValue(doc.activeAttempt, null, v => x.set("activeAttempt", v));
    out.submissions.push({
      assignment_id: assignmentId, student_user_id: studentId, class_id: nonEmpty(doc.classId),
      student_code_at_start: nonEmpty(doc.studentCode), student_name_at_start: nonEmpty(doc.studentName),
      allowed_attempts: allowed ?? null, draft_answers_json: draft, active_attempt_json: active,
      extra_json: x.json(),
      created_at: created || updated || now, updated_at: updated || created || now
    });

    const numbers = new Set();
    for (const [index, attempt] of (Array.isArray(doc.attempts) ? doc.attempts : []).entries()) {
      const where = "attempts[" + index + "]";
      if (!isPlainObject(attempt)) { c.add("blocking", "attempt-unreadable", name, where); continue; }
      const n = intOrNull(attempt.attemptNumber);
      if (n === null || n === undefined || n < 1) { c.add("blocking", "attempt-invalid-number", name, where); continue; }
      if (numbers.has(n)) { c.add("blocking", "attempt-duplicate-number", name, where + " attemptNumber=" + n); continue; }
      numbers.add(n);
      const ax = extraBuilder(attempt, ATTEMPT_KEYS);
      const t = { startedAt: timestamp(attempt.startedAt), endsAt: timestamp(attempt.endsAt), submittedAt: timestamp(attempt.submittedAt),
        endedAt: timestamp(attempt.endedAt), reviewedAt: timestamp(attempt.reviewedAt) };
      for (const [k, v] of Object.entries(t)) if (v === undefined) c.add("blocking", "invalid-timestamp", name, where + "." + k);
      const m = { score: finiteOrNull(attempt.score), totalMarks: finiteOrNull(attempt.totalMarks), percentage: finiteOrNull(attempt.percentage),
        manualReviewMarks: finiteOrNull(attempt.manualReviewMarks) };
      for (const [k, v] of Object.entries(m)) if (v === undefined) c.add("blocking", "invalid-number", name, where + "." + k);
      for (const k of ["attemptNumber", "score", "totalMarks", "percentage", "manualReviewMarks"]) {
        if (attempt[k] !== undefined && attempt[k] !== null && typeof attempt[k] !== "number") ax.set(k, attempt[k]);
      }
      // Non-boolean flags and a non-string feedback are kept exactly as they were (the columns hold normalized values).
      if (attempt.timedOut !== undefined && typeof attempt.timedOut !== "boolean") ax.set("timedOut", attempt.timedOut);
      if (attempt.finalized !== undefined && attempt.finalized !== null && typeof attempt.finalized !== "boolean") ax.set("finalized", attempt.finalized);
      if (attempt.teacherFeedback !== undefined && typeof attempt.teacherFeedback !== "string") ax.set("teacherFeedback", attempt.teacherFeedback);
      ax.keep("endReason", attempt.endReason, nonEmpty(attempt.endReason) ?? undefined);
      const row = {
        assignment_id: assignmentId, student_user_id: studentId, attempt_number: n,
        started_at: t.startedAt || null, ends_at: t.endsAt || null, submitted_at: t.submittedAt || null, ended_at: t.endedAt || null,
        end_reason: nonEmpty(attempt.endReason), timed_out: attempt.timedOut === true,
        score: m.score ?? null, total_marks: m.totalMarks ?? null, percentage: m.percentage ?? null, manual_review_marks: m.manualReviewMarks ?? null,
        finalized: boolOrNull(attempt.finalized), reviewed_at: t.reviewedAt || null, teacher_feedback: str(attempt.teacherFeedback),
        answers_json: jsonValue(attempt.answers, "{}", v => ax.set("answers", v)),
        question_grades_json: jsonValue(attempt.questionGrades, null, v => ax.set("questionGrades", v)),
        sections_json: jsonValue(attempt.sections, null, v => ax.set("sections", v)),
        manual_overrides_json: jsonValue(attempt.manualOverrides, null, v => ax.set("manualOverrides", v)),
        extra_json: null
      };
      row.extra_json = ax.json();
      out.attempts.push(row);
    }
  }

  return { tables: out, anomalies: c.anomalies, stats };
}

// ---------- validation against the schema ----------

/** SQL Server's default collation compares keys case-insensitively and ignores trailing spaces. */
function collationKey(value) {
  if (value === null || value === undefined) return value;
  return typeof value === "string" ? value.replace(/ +$/, "").toLowerCase() : value;
}

function isLatin1(text) { return /^[\u0000-ÿ]*$/.test(text); }

/**
 * Checks every row against the column catalog before anything is written, so the dry run catches what would make
 * the load fail: unknown columns, NULL in NOT NULL columns, over-long strings, non-Latin-1 text in varchar columns
 * (silently turned into "?"), and duplicates on every primary key and unique index (compared the way the default
 * collation compares them). Returns blocking anomalies.
 */
function validateRowsAgainstCatalog(tables, catalog) {
  const anomalies = [];
  const block = (code, detail) => anomalies.push({ severity: "blocking", code, blob: "", detail });
  for (const [table, rows] of Object.entries(tables)) {
    const spec = catalog.tables[table];
    if (!spec) { block("unknown-table", table); continue; }
    rows.forEach((row, i) => {
      for (const [column, value] of Object.entries(row)) {
        const col = spec.columns[column];
        if (!col) { block("unknown-column", table + "." + column); continue; }
        if ((value === null || value === undefined) && !col.nullable && !col.hasDefault) block("null-in-not-null-column", table + "." + column + " row " + i);
        if (typeof value === "string" && ["nvarchar", "varchar", "char"].includes(col.type)) {
          if (typeof col.length === "number" && value.length > col.length) block("value-too-long", table + "." + column + " row " + i + " (" + value.length + " > " + col.length + ")");
          if (col.type !== "nvarchar" && !isLatin1(value)) block("non-latin1-in-varchar", table + "." + column + " row " + i);
        }
        if (value !== null && value !== undefined) {
          const expected = { int: "number", bigint: "number", float: "number", bit: "boolean" }[col.type];
          if (expected && typeof value !== expected) block("wrong-value-type", table + "." + column + " row " + i + " (" + typeof value + ")");
          if ((col.type === "int" || col.type === "bigint") && typeof value === "number" && !Number.isInteger(value)) block("wrong-value-type", table + "." + column + " row " + i + " (not an integer)");
        }
      }
      for (const column of spec.order) {
        const col = spec.columns[column];
        if (!(column in row) && !col.nullable && !col.hasDefault && !col.identity && col.type !== "rowversion") block("missing-required-column", table + "." + column + " row " + i);
      }
    });
    const keys = [{ name: "primary key", columns: spec.primaryKey, where: null }, ...(spec.uniqueIndexes || [])];
    for (const key of keys) {
      if (!key.columns.length) continue;
      const seen = new Map();
      rows.forEach((row, i) => {
        if (key.where && !key.where(row)) return;
        const values = key.columns.map(k => collationKey(row[k]));
        if (key.where === null && values.some(v => v === null || v === undefined)) return;
        const id = JSON.stringify(values);
        if (seen.has(id)) block("duplicate-key", table + " " + key.name + " (" + key.columns.join(", ") + ") rows " + seen.get(id) + " and " + i);
        else seen.set(id, i);
      });
    }
  }
  return anomalies;
}

/** A shareable summary: row counts per table and anomaly counts per severity and code. */
function summarize(result) {
  const counts = Object.fromEntries(Object.entries(result.tables).map(([t, rows]) => [t, rows.length]));
  const bySeverity = {}, byCode = {};
  for (const a of result.anomalies) {
    bySeverity[a.severity] = (bySeverity[a.severity] || 0) + 1;
    byCode[a.code] = (byCode[a.code] || 0) + 1;
  }
  return { rows: counts, documents: result.stats.documents, skipped: result.stats.skipped, anomalies: { bySeverity, byCode }, blocking: bySeverity.blocking || 0 };
}

module.exports = { PREFIX, TABLES, transformLegacy, validateRowsAgainstCatalog, summarize, timestamp, normalizeIdentityNumber };
