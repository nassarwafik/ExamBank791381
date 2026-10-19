const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { BlobServiceClient } = require("@azure/storage-blob");
const crypto = require("crypto");
const { requireBuilderAuth } = require("../lib/builder-auth");
const {
  studentCodeHash,
  hashPassword,
  generateTemporaryPassword,
  normalizeAuthVersion
} = require("../lib/student-auth");
const {
  mutateJsonWithRetry,
  uploadJsonConditional,
  isConcurrencyConflict,
  downloadJsonWithEtagOrNull,
  deleteBlobConditional
} = require("../lib/platform-storage");
const { recordAuditEvent } = require("../lib/audit-log");
// Phase 21G.0 — teacher tenancy: a student belongs to their class's teacher (and keeps that owner when they leave a class).
const { tenantOf, canAccessDocument, accessibleClassIds, classIdAllowed } = require("../lib/teacher-tenancy");
const { purgeProfilePhotos } = require("../lib/profile-photo-store");
// Messages M.4 — a deleted student's messaging data (conversation, read markers, rate bucket, notifications, push).
const { requestStudentPurge, purgeAfterDelete, PURGE_STEP_BUDGET } = require("../lib/student-messaging-purge");
const { normalizeClassStatus } = require("../lib/class-lifecycle");
const { isReportableAssessment } = require("../lib/assignment-lifecycle");
const { deriveGradingStatus } = require("../lib/grading-status");
const { aggregateRecognition, medalTierFromPercentage } = require("../lib/achievement-feed");
const { gameResultsDocName, eligibleGamePercentages } = require("../lib/game-results-store");
const { buildStrengthSummary } = require("../lib/student-strength");
const { studyDocName, studyModulesForStrength } = require("../lib/learning-study");
const { listLearningCourses } = require("../lib/learning-materials-registry");
const { loadStudentProjects } = require("../lib/project-tracker/student-projects");
const { withCredentialLock, CredentialLockBusyError } = require("../lib/student-credential-lock");
// Roadmap #25 — classroom.studentIds is a denormalized, repairable roster INDEX (never authoritative). All
// index writes go through lib/class-roster-index (CAS + retry, idempotent, sync status instead of failure).
const { addToRosterIndex, removeFromRosterIndex, reconcileRosterIndex } = require("../lib/class-roster-index");
const { isStudentClassMember } = require("../lib/class-membership");
// Classes & Students hardening — safe ids, Arabic-Indic identity digits, cleaned names, bounded lengths; and the
// grading-safety guard that refuses a move/archive that would hide work still awaiting the teacher.
const { isSafeId, normalizeIdentityNumber, cleanText, LIMITS } = require("../lib/roster-input");
const { createPendingGradingReader, pendingGradingMessage } = require("../lib/pending-grading");
const { loadDocs, loadEntries, listEntries } = require("../lib/classes-students-read-cache");

// Thrown from inside a mutateJsonWithRetry callback to mean "nothing to do" (target document is
// missing, or already in the desired state) — caught at each call site and treated as a silent
// no-op, matching the equivalent early-returns the unprotected code used to have.
class SkipMutation extends Error {}

// Roadmap #29 — a teacher-action failure that is the caller's input or the current state, not a server fault:
// missing/invalid input (400), a missing student/auth resource (404), or a duplicate/state conflict/stale reset
// (409). Carries the EXISTING Arabic message unchanged and the optional existing `code` ("duplicate" is what the
// bulk-import loop classifies on). The top-level catch maps it to its status; bulk loops keep catching per row.
// Genuine storage/unknown failures stay plain errors → generic 500.
class StudentActionError extends Error {
  constructor(httpStatus, message, code) {
    super(message);
    this.name = "StudentActionError";
    this.httpStatus = httpStatus;
    if (code) this.code = code;
  }
}

const BANK_CONTAINER = "bank";
// Bounded server-side import size (Roadmap #18). The client limit is NOT authoritative — the server
// rejects an oversized preview/import cleanly. Conservative for the current one-blob-per-student
// architecture; generalized batching/pagination is explicitly out of scope for this package.
const MAX_IMPORT_ROWS = 250;
const USER_PREFIX = "platform/users/";
const BULK_PURGE_STEP_BUDGET = 25;
const AUTH_PREFIX = "platform/auth/";
const CLASS_PREFIX = "platform/classes/";
const ASSIGNMENT_PREFIX = "platform/assignments/";
const SUBMISSION_PREFIX = "platform/submissions/";

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function getContainer() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) throw new Error("AZURE_STORAGE_CONNECTION_STRING is not configured.");
  return BlobServiceClient.fromConnectionString(connectionString).getContainerClient(BANK_CONTAINER);
}

async function downloadJsonOrNull(container, blobName) {
  try {
    const response = await container.getBlobClient(blobName).download();
    if (!response.readableStreamBody) return null;
    return JSON.parse((await streamToBuffer(response.readableStreamBody)).toString("utf8"));
  } catch (error) {
    if (error?.statusCode === 404 || error?.code === "BlobNotFound") return null;
    throw error;
  }
}

async function uploadJson(container, blobName, document) {
  const body = JSON.stringify(document, null, 2);
  await container.getBlockBlobClient(blobName).upload(body, Buffer.byteLength(body), {
    overwrite: true,
    blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" }
  });
}

function isValidIdentityNumber(value) {
  return /^\d{9}$/.test(String(value || ""));
}

function splitLegacyName(value) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  return { firstName: parts.shift() || "", familyName: parts.join(" ") };
}

function getStudentNames(document) {
  const legacy = splitLegacyName(document?.displayName);
  return {
    firstName: String(document?.firstName || legacy.firstName || "").trim(),
    familyName: String(document?.familyName || legacy.familyName || "").trim()
  };
}

function publicStudent(document) {
  const names = getStudentNames(document);
  const identityNumber = normalizeIdentityNumber(
    document.identityNumber || (/^\d{9}$/.test(String(document.code || "")) ? document.code : "")
  );
  return {
    userId: String(document.userId || ""),
    code: String(document.code || identityNumber || ""),
    identityNumber,
    firstName: names.firstName,
    familyName: names.familyName,
    displayName: String(document.displayName || [names.firstName, names.familyName].filter(Boolean).join(" ")),
    classId: String(document.classId || ""),
    active: document.active !== false,
    archived: document.archived === true,
    // Photo METADATA only (version for cache-busting); the bytes are served by /api/student-profile-photo on demand.
    profilePhoto: document.profilePhoto && typeof document.profilePhoto === "object" && Number(document.profilePhoto.version) > 0 ? { version: Number(document.profilePhoto.version), updatedAt: String(document.profilePhoto.updatedAt || "") } : null,
    avatarId: String(document.avatarId || ""),
    createdAt: String(document.createdAt || ""),
    updatedAt: String(document.updatedAt || ""),
    lastLoginAt: String(document.lastLoginAt || "")
  };
}

async function getClassroom(container, classId) {
  if (!classId) return null;
  return downloadJsonOrNull(container, CLASS_PREFIX + classId + ".json");
}

async function listStudents(container, classId, includeArchived = false, obs = null, canSee = null) {
  const result = [];
  // Roadmap #25: this scan already yields the AUTHORITATIVE member set of the class, so the roster index is
  // reconciled here for free (zero extra list operations / downloads; at most one class write when drifted).
  const scanStartedAt = Date.now();
  const memberIds = [];
  // Roadmap #27: list names first, then download with bounded concurrency (listing order preserved). Phase S.2: through the
  // ETag-verified cache — the listing still decides who is read, only an unchanged document is not downloaded again.
  const userDocs = await loadDocs(container, USER_PREFIX);
  for (const student of userDocs) {
    if (!student || student.role !== "student") continue;
    if (classId && isStudentClassMember(student, classId)) memberIds.push(String(student.userId || ""));
    if (classId && String(student.classId || "") !== classId) continue;
    if (!includeArchived && student.archived === true) continue;
    if (canSee && !canSee(student)) continue;
    result.push(publicStudent(student));
  }
  result.sort((a, b) => {
    const family = String(a.familyName).localeCompare(String(b.familyName), "ar");
    return family || String(a.firstName).localeCompare(String(b.firstName), "ar");
  });
  if (classId) {
    // Best-effort self-healing of the denormalized count index; must never fail or slow the roster read.
    try { await reconcileRosterIndex(container, classId, memberIds, { scanStartedAt, obs, operation: "listStudents" }); }
    catch { obs?.logWarn("class.rosterIndex.reconcile_failed", { classId, operation: "listStudents", retryable: true }); }
  }

  // Table-row badge only needs a count, not full history — and it must not hide a student's
  // historical submissions from a class they no longer belong to, so this is not scoped to
  // classId. One single listing pass under SUBMISSION_PREFIX (not one per assignment), parsing
  // "platform/submissions/{assignmentId}/{studentId}.json" directly; assignment documents are
  // never downloaded here, and submission content is only fetched for students already in the
  // current roster (no per-student N+1 request).
  const idSet = new Set(result.map(s => s.userId));
  const submittedSets = new Map(); // studentId -> Set<assignmentId>
  if (idSet.size) {
    // Roadmap #27: select the roster students' submission blobs by NAME, then download them concurrently (S.2: through the
    // ETag-verified cache, with the ETag this same listing reports).
    const candidates = [];
    for (const { name, etag } of await listEntries(container, SUBMISSION_PREFIX)) {
      const rest = name.slice(SUBMISSION_PREFIX.length); // "{assignmentId}/{studentId}.json"
      const slashIndex = rest.indexOf("/");
      if (slashIndex < 0) continue;
      const assignmentId = rest.slice(0, slashIndex);
      const studentId = rest.slice(slashIndex + 1, -".json".length);
      if (!assignmentId || !studentId) continue;
      if (!idSet.has(studentId)) continue;
      candidates.push({ name, etag, assignmentId, studentId });
    }
    const submissions = await loadEntries(container, candidates);
    candidates.forEach((cand, i) => {
      const attempts = Array.isArray(submissions[i]?.attempts) ? submissions[i].attempts : [];
      if (!attempts.length) return;
      if (!submittedSets.has(cand.studentId)) submittedSets.set(cand.studentId, new Set());
      submittedSets.get(cand.studentId).add(cand.assignmentId);
    });
  }

  // likesCount = reactions RECEIVED on the student's achievement events (classmates' + the teacher's, every event
  // type, across every class — a history still counts after a class move). ONE shared aggregation (achievement-feed
  // aggregateRecognition, name-selected posts, never a full scan) also feeds the student dashboard's recognition.
  const recognition = idSet.size ? await aggregateRecognition(container, [...idSet]) : new Map();

  return result.map(student => ({
    ...student,
    submittedAssignmentsCount: submittedSets.get(student.userId)?.size || 0,
    likesCount: recognition.get(student.userId)?.receivedReactionCount || 0
  }));
}

async function findStudentByIdentity(container, identityNumber) {
  if (!isValidIdentityNumber(identityNumber)) return null;
  const auth = await downloadJsonOrNull(
    container,
    AUTH_PREFIX + studentCodeHash(identityNumber) + ".json"
  );
  if (!auth?.userId) return null;
  const student = await downloadJsonOrNull(container, USER_PREFIX + auth.userId + ".json");
  return student?.role === "student" ? student : null;
}

function namesFromInput(input) {
  const directFirst = cleanText(input?.firstName ?? input?.givenName ?? "");
  const directFamily = cleanText(input?.familyName ?? input?.lastName ?? input?.surname ?? "");
  if (directFirst || directFamily) return { firstName: directFirst, familyName: directFamily };
  return splitLegacyName(cleanText(input?.displayName ?? input?.name ?? input?.studentName ?? ""));
}

const NAME_TOO_LONG = "الاسم أو اسم العائلة أطول من " + LIMITS.personName + " حرفًا.";
const namesTooLong = (firstName, familyName) => firstName.length > LIMITS.personName || familyName.length > LIMITS.personName;
const PASSWORD_TOO_SHORT = "كلمة المرور يجب أن تحتوي على 6 محارف على الأقل.";
const PASSWORD_TOO_LONG = "كلمة المرور يجب ألا تتجاوز " + LIMITS.passwordMax + " محرفًا.";
// Credential-bearing and PII responses are never cached by a proxy or the browser.
const NO_STORE = { "Cache-Control": "no-store" };
const CONCURRENT_MOVE = "تم نقل الطالب إلى صف آخر في عملية أخرى. حدّث البيانات وأعد المحاولة.";
const DUPLICATE_RACE = "رقم الهوية مستخدم مسبقًا لطالب آخر. أعد المحاولة.";
// An auth document whose user document is missing is an ORPHAN left by an interrupted create (auth is written first).
// It blocks the identity forever (preview says "valid", create says "duplicate"). It is reclaimed only once it is older
// than this grace period, so a create that is still between its two writes is never disturbed.
const ORPHAN_AUTH_GRACE_MS = 10 * 60 * 1000;

async function reclaimOrphanAuth(container, authName, nowMs = Date.now()) {
  const { value, etag } = await downloadJsonWithEtagOrNull(container, authName);
  if (!value || !etag) return false;
  const userId = String(value.userId || "");
  if (userId && isSafeId(userId)) {
    const owner = await downloadJsonOrNull(container, USER_PREFIX + userId + ".json");
    if (owner) return false;
  }
  const createdMs = Date.parse(String(value.createdAt || value.updatedAt || ""));
  if (Number.isFinite(createdMs) && nowMs - createdMs < ORPHAN_AUTH_GRACE_MS) return false;
  try { await deleteBlobConditional(container, authName, etag); return true; }
  catch (e) { if (isConcurrencyConflict(e)) return false; throw e; }
}

function identityFromInput(input) {
  return normalizeIdentityNumber(
    input?.identityNumber ??
    input?.idNumber ??
    input?.studentId ??
    input?.identity ??
    input?.id ??
    input?.code ??
    input?.studentCode ??
    ""
  );
}

function normalizeBulkStudents(value) {
  const raw = Array.isArray(value) ? value : Array.isArray(value?.students) ? value.students : [];
  return raw.map((item, index) => {
    if (typeof item === "string") {
      const names = splitLegacyName(item);
      return { index, ...names, identityNumber: "" };
    }
    const names = namesFromInput(item);
    return {
      index,
      firstName: names.firstName,
      familyName: names.familyName,
      identityNumber: identityFromInput(item)
    };
  }).filter(item => item.firstName || item.familyName || item.identityNumber);
}

async function setAuthActive(container, student, active) {
  const code = String(student.code || student.identityNumber || "");
  if (!code) return;
  const name = AUTH_PREFIX + studentCodeHash(code) + ".json";
  try {
    await mutateJsonWithRetry(container, name, current => {
      if (!current) throw new SkipMutation();
      current.active = active;
      current.updatedAt = new Date().toISOString();
      return current;
    });
  } catch (e) {
    if (!(e instanceof SkipMutation)) throw e;
  }
}

async function createStudentRecord(container, classroom, input, options = {}) {
  const { firstName, familyName } = namesFromInput(input);
  const identityNumber = identityFromInput(input);
  const code = identityNumber;

  if (!firstName || !familyName) throw new StudentActionError(400, "يجب إدخال الاسم الشخصي واسم العائلة.");
  if (namesTooLong(firstName, familyName)) throw new StudentActionError(400, NAME_TOO_LONG);
  if (!isValidIdentityNumber(identityNumber)) throw new StudentActionError(400, "رقم الهوية يجب أن يتكوّن من 9 أرقام.");

  const existing = await findStudentByIdentity(container, identityNumber);
  if (existing) {
    // Phase 21G.0 — identity numbers are unique platform-wide, but another teacher's student is never named: only that the
    // identity is taken.
    if (options.visible && !(await options.visible(existing))) {
      const taken = new StudentActionError(409, "رقم الهوية مستخدم مسبقًا لحساب طالب آخر.");
      taken.code = "duplicate";
      throw taken;
    }
    const existingClass = await getClassroom(container, String(existing.classId || ""));
    // Roadmap #18: tag identity collisions as `duplicate` so the bulk-import loop can report an
    // accurate duplicate vs. hard-failure breakdown (aggregate audit + UI counts) without string-matching.
    const dup = new StudentActionError(409,
      "رقم الهوية مستخدم مسبقًا للطالب " +
      String(existing.displayName || identityNumber) +
      (existingClass?.name ? " في الصف " + existingClass.name : "")
    );
    dup.code = "duplicate";
    throw dup;
  }

  const password = options.forceGeneratedPassword
    ? generateTemporaryPassword()
    : String(input?.password || "") || generateTemporaryPassword();

  if (password.length < LIMITS.passwordMin) throw new StudentActionError(400, PASSWORD_TOO_SHORT);
  if (password.length > LIMITS.passwordMax) throw new StudentActionError(400, PASSWORD_TOO_LONG);

  const { salt, passwordHash } = hashPassword(password);
  const userId = crypto.randomUUID();
  const now = new Date().toISOString();
  const displayName = firstName + " " + familyName;

  const student = {
    schemaVersion: 3,
    role: "student",
    userId,
    code,
    identityNumber,
    firstName,
    familyName,
    displayName,
    classId: classroom.classId,
    // Phase 21G.0 — the student inherits the owner of the class they are created in (none for a shared pre-tenancy class).
    ...(typeof classroom.ownerId === "string" && classroom.ownerId ? { ownerId: classroom.ownerId } : {}),
    active: true,
    archived: false,
    // Server-authoritative student session version (Roadmap #8). Starts at 1 and is incremented on every
    // password reset/change so previously issued session tokens are revoked immediately.
    authVersion: 1,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: ""
  };

  const authDocument = {
    schemaVersion: 3,
    userId,
    codeHash: studentCodeHash(code),
    salt,
    passwordHash,
    active: true,
    // Roadmap #8 (PR#67 review §3): the auth document carries its own authVersion, kept consistent with the
    // student document's authVersion. Login requires the two to match, so a half-applied credential change
    // fails closed rather than issuing a session.
    authVersion: 1,
    createdAt: now,
    updatedAt: now
  };

  // Auth document is written first, with a create-only conditional write (fails if a blob already
  // exists at this path). The identityNumber uniqueness check above has a narrow TOCTOU window —
  // two concurrent creates for the same identity number could both pass it — so this conditional
  // write is the real guard: it turns a collision into an explicit error instead of one request
  // silently overwriting the other's auth record. Only once it succeeds do we create the student
  // document, so a collision here never leaves an orphaned student with no matching login.
  const authName = AUTH_PREFIX + studentCodeHash(code) + ".json";
  const duplicateRace = () => { const dup = new StudentActionError(409, DUPLICATE_RACE); dup.code = "duplicate"; return dup; };
  let authEtag = null;
  try {
    authEtag = await uploadJsonConditional(container, authName, authDocument, null);
  } catch (e) {
    // The create-only conditional write is the real uniqueness guard: a lost race (another concurrent
    // create for the same identity won the write) becomes an explicit duplicate, never a silent overwrite.
    if (!isConcurrencyConflict(e)) throw e;
    // ...unless the existing auth document is an aged ORPHAN (no user document): it is removed conditionally on the
    // ETag just read and the create-only write is attempted once more (still create-only, so a racer still wins).
    if (!(await reclaimOrphanAuth(container, authName))) throw duplicateRace();
    try { authEtag = await uploadJsonConditional(container, authName, authDocument, null); }
    catch (e2) { if (isConcurrencyConflict(e2)) throw duplicateRace(); throw e2; }
  }
  try {
    await uploadJson(container, USER_PREFIX + userId + ".json", student);
  } catch (e) {
    // Compensation: never leave the auth document just created without its student (it would block the identity).
    // Conditional on our own ETag; a failure here is reclaimable later through reclaimOrphanAuth.
    try { await deleteBlobConditional(container, authName, authEtag); } catch { /* reclaimable orphan */ }
    throw e;
  }
  // Roadmap #25: the roster index is updated by the caller AFTER this authoritative write (never here).
  return { student: publicStudent(student), temporaryPassword: password };
}

async function resetStudentPassword(container, student, requestedPassword = "") {
  const temporaryPassword = String(requestedPassword || "") || generateTemporaryPassword();
  if (temporaryPassword.length < LIMITS.passwordMin) throw new StudentActionError(400, PASSWORD_TOO_SHORT);
  if (temporaryPassword.length > LIMITS.passwordMax) throw new StudentActionError(400, PASSWORD_TOO_LONG);
  const { salt, passwordHash } = hashPassword(temporaryPassword);

  // PR#67 final: run under the per-student credential lock so a reset can never race a rename that moves the
  // auth blob path. The CURRENT student is re-read INSIDE the lock and the auth path is derived from its
  // current code (never from the possibly-stale `student` argument loaded before the lock was acquired).
  await withCredentialLock(container, student.userId, async () => {
    const current = await downloadJsonOrNull(container, USER_PREFIX + student.userId + ".json");
    if (!current || current.role !== "student") throw new StudentActionError(404, "الطالب غير موجود.");
    const code = String(current.code || current.identityNumber || "");
    const authBlobName = AUTH_PREFIX + studentCodeHash(code) + ".json";
    const now = new Date().toISOString();
    // Fail-closed ordering (§3): bump the STUDENT authVersion FIRST (revokes sessions; login stays
    // fail-closed until the auth doc catches up), then write the auth hash + matching version.
    let newVersion = 1;
    await mutateJsonWithRetry(container, USER_PREFIX + student.userId + ".json", cur => {
      if (!cur) throw new StudentActionError(404, "الطالب غير موجود.");
      newVersion = normalizeAuthVersion(cur.authVersion) + 1;
      cur.authVersion = newVersion;
      cur.updatedAt = now;
      return cur;
    });
    // Version-conditional (§B): overwrite the credential only if this op owns the newest version.
    let applied = true;
    await mutateJsonWithRetry(container, authBlobName, cur => {
      if (!cur) throw new StudentActionError(404, "ملف دخول الطالب غير موجود.");
      if (normalizeAuthVersion(cur.authVersion) > newVersion) { applied = false; return cur; } // stale
      cur.salt = salt;
      cur.passwordHash = passwordHash;
      cur.authVersion = newVersion;
      cur.updatedAt = now;
      return cur;
    });
    if (!applied) throw new StudentActionError(409, "تم تغيير كلمة المرور من عملية أحدث. أعد المحاولة.");
  });
  return temporaryPassword;
}

// Every function below keeps its original (container, student, ...) signature — callers (both the
// single-row actions and the bulk-action loop) need zero changes — but now re-reads the student
// document fresh inside mutateJsonWithRetry instead of trusting the pre-loaded `student` object, so
// a concurrent action on the same student can never be silently lost. `student.userId`/`.code`/
// `.identityNumber`/`.classId` are only used as stable lookup keys (never as the value written).

async function changeStudentActive(container, student, active) {
  await mutateJsonWithRetry(container, USER_PREFIX + student.userId + ".json", current => {
    if (!current) throw new StudentActionError(404, "الطالب غير موجود.");
    if (current.archived === true && active) throw new StudentActionError(409, "استعد الطالب من الأرشيف أولًا.");
    current.active = !!active;
    current.updatedAt = new Date().toISOString();
    return current;
  });
  await setAuthActive(container, student, !!active);
}

async function archiveStudent(container, student, obs = null) {
  try {
    await mutateJsonWithRetry(container, USER_PREFIX + student.userId + ".json", current => {
      if (!current || current.archived === true) throw new SkipMutation();
      // Phase S.1 — the pending-grading check ran against the class read before this write; a move to another class
      // in between is refused, never archived over (its work there could be hidden).
      if (String(current.classId || "") !== String(student.classId || "")) throw new StudentActionError(409, CONCURRENT_MOVE);
      const now = new Date().toISOString();
      current.archived = true;
      current.active = false;
      current.archivedAt = now;
      current.updatedAt = now;
      return current;
    });
  } catch (e) {
    if (e instanceof SkipMutation) return { synced: true };
    throw e;
  }
  await setAuthActive(container, student, false);
  // Authoritative state (user + auth) is final above; the index removal is best-effort (sync status returned).
  return removeFromRosterIndex(container, String(student.classId || ""), [student.userId], { obs, operation: "archive" });
}

async function unarchiveStudent(container, student, obs = null) {
  const classId = String(student.classId || "");
  const classroom = await getClassroom(container, classId);
  if (!classroom || normalizeClassStatus(classroom) === "archived") throw new StudentActionError(400, "فعّل الصف قبل استعادة الطالب.");

  try {
    await mutateJsonWithRetry(container, USER_PREFIX + student.userId + ".json", current => {
      if (!current || current.archived !== true) throw new SkipMutation();
      current.archived = false;
      current.active = true;
      current.archivedAt = "";
      current.updatedAt = new Date().toISOString();
      return current;
    });
  } catch (e) {
    if (e instanceof SkipMutation) return { synced: true };
    throw e;
  }
  await setAuthActive(container, student, true);
  return addToRosterIndex(container, classId, [student.userId], { obs, operation: "unarchive" });
}

async function moveStudent(container, student, targetClassId, obs = null) {
  const target = await getClassroom(container, targetClassId);
  if (!target || normalizeClassStatus(target) === "archived") throw new StudentActionError(400, "الصف الهدف غير موجود أو مؤرشف.");

  const oldClassId = String(student.classId || "");
  if (oldClassId === targetClassId) return { synced: true };

  // Roadmap #25 ordering: the AUTHORITATIVE membership (user.classId) changes first; both index updates follow
  // best-effort. (Previously the old-class index was edited before the user write, which could leave a member
  // missing from its own class index if the user write failed.)
  try {
    await mutateJsonWithRetry(container, USER_PREFIX + student.userId + ".json", current => {
      if (!current) throw new SkipMutation();
      // Phase S.1 — a concurrent move (checked or not) is never written over: the pending-grading check and the
      // old-class index removal below are only valid for the class this request read.
      if (String(current.classId || "") !== oldClassId) throw new StudentActionError(409, CONCURRENT_MOVE);
      current.classId = targetClassId;
      current.updatedAt = new Date().toISOString();
      return current;
    });
  } catch (e) {
    if (!(e instanceof SkipMutation)) throw e;
    return { synced: true };
  }

  const removed = await removeFromRosterIndex(container, oldClassId, [student.userId], { obs, operation: "move" });
  const added = student.archived !== true
    ? await addToRosterIndex(container, targetClassId, [student.userId], { obs, operation: "move" })
    : { synced: true };
  return { synced: removed.synced && added.synced };
}

async function deleteStudent(container, student, obs = null, { purgeBudget = PURGE_STEP_BUDGET } = {}) {
  // Phase S.1 — the pending-grading check ran against the class read earlier; a student moved meanwhile is refused.
  const fresh = await downloadJsonOrNull(container, USER_PREFIX + student.userId + ".json");
  if (fresh && String(fresh.classId || "") !== String(student.classId || "")) throw new StudentActionError(409, CONCURRENT_MOVE);
  // Roadmap #25 ordering: authoritative deletes first (auth, then user), index removal last and best-effort.
  // M.4 — the durable purge record goes first, so the messaging purge is finished later even if this request dies
  // after the user document is gone; a failure to write it never blocks the delete (the inline step still runs).
  try { await requestStudentPurge(container, student.userId); }
  catch (e) { obs?.logError?.("student.delete.purgeRecord", e); }
  const code = String(student.code || student.identityNumber || "");
  if (code) {
    await container.getBlobClient(AUTH_PREFIX + studentCodeHash(code) + ".json").deleteIfExists();
  }
  await container.getBlobClient(USER_PREFIX + student.userId + ".json").deleteIfExists();
  // Secondary cleanup: the CURRENT referenced photo revision first, then every other blob under the student's photo
  // namespace (older revisions / orphans). Best-effort by design — never blocks the core delete.
  try {
    await purgeProfilePhotos(container, "platform/student-profile-images/" + student.userId + "/", {}, obs);
  } catch (e) { obs?.logError("student.delete.photoCleanup", e); }
  // M.4 — one bounded messaging purge step (never fails the delete; the rest is finished from the purge record).
  const messagingPurged = await purgeAfterDelete(container, student.userId, {}, obs, purgeBudget);
  const roster = await removeFromRosterIndex(container, String(student.classId || ""), [student.userId], { obs, operation: "delete" });
  return { ...roster, messagingPurged };
}

async function buildImportPreview(container, items, visible = null) {
  const classCache = new Map();
  const seenInBatch = new Set();     // identity numbers already seen earlier in THIS upload
  const rows = [];

  for (const item of items) {
    let status = "valid";
    let error = "";
    let existingStudent = null;

    if (!item.firstName || !item.familyName) {
      status = "invalid";
      error = "الاسم واسم العائلة مطلوبان.";
    } else if (namesTooLong(item.firstName, item.familyName)) {
      status = "invalid";
      error = NAME_TOO_LONG;
    } else if (!isValidIdentityNumber(item.identityNumber)) {
      status = "invalid";
      error = "رقم الهوية يجب أن يتكوّن من 9 أرقام.";
    } else if (seenInBatch.has(item.identityNumber)) {
      // In-batch duplicate: the SAME identity appears more than once in the uploaded file. The first
      // occurrence is validated normally; every later one is flagged so the teacher sees it before import
      // (and the create-only commit would reject it anyway).
      status = "duplicate";
      error = "رقم الهوية مكرر داخل الملف.";
    } else {
      seenInBatch.add(item.identityNumber);
      const existing = await findStudentByIdentity(container, item.identityNumber);
      if (existing && visible && !(await visible(existing))) {
        status = "duplicate";
        error = "رقم الهوية مستخدم مسبقًا لحساب طالب آخر.";
      } else if (existing) {
        status = "duplicate";
        let classroom = null;
        const classId = String(existing.classId || "");
        if (classId) {
          if (!classCache.has(classId)) classCache.set(classId, await getClassroom(container, classId));
          classroom = classCache.get(classId);
        }
        existingStudent = {
          userId: String(existing.userId || ""),
          displayName: String(existing.displayName || ""),
          classId,
          className: String(classroom?.name || ""),
          active: existing.active !== false,
          archived: existing.archived === true
        };
        error = "رقم الهوية موجود مسبقًا" +
          (existing.displayName ? " للطالب " + existing.displayName : "") +
          (classroom?.name ? " في الصف " + classroom.name : "") + ".";
      }
    }

    rows.push({
      index: item.index,
      firstName: item.firstName,
      familyName: item.familyName,
      identityNumber: item.identityNumber,
      status,
      error,
      existingStudent
    });
  }

  return rows;
}

async function buildStudentProfile(container, userId) {
  const student = await downloadJsonOrNull(container, USER_PREFIX + userId + ".json");
  if (!student || student.role !== "student") return null;

  const classroom = await getClassroom(container, String(student.classId || ""));
  const currentClassId = String(student.classId || "");

  // Sorted once, newest first; the current-class "assignments" list below is a filtered view of
  // this same sorted array, so it preserves the exact ordering already relied on elsewhere.
  const allAssignments = (await loadDocs(container, ASSIGNMENT_PREFIX))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  const history = [];
  const submittedAssignments = [];
  let completed = 0;
  let percentageSum = 0;

  // Phase S.2: ONE listing of submission names selects this student's existing submissions (exact names), which are read
  // through the ETag-verified cache — instead of one download attempt per assignment of the platform, most of them a 404.
  // Aligned with allAssignments (null where the student has none), so the sequential aggregation below is unchanged.
  const ownSubmissions = new Map();
  for (const entry of await listEntries(container, SUBMISSION_PREFIX)) ownSubmissions.set(entry.name, entry);
  const wanted = allAssignments.map(assignment => {
    const assignmentId = String(assignment.assignmentId || "");
    return assignmentId ? ownSubmissions.get(SUBMISSION_PREFIX + assignmentId + "/" + student.userId + ".json") || null : null;
  });
  const loaded = await loadEntries(container, wanted.filter(Boolean));
  let next = 0;
  const submissionsByIndex = wanted.map(entry => (entry ? loaded[next++] : null));

  for (let index = 0; index < allAssignments.length; index++) {
    const assignment = allAssignments[index];
    const assignmentId = String(assignment.assignmentId || "");
    if (!assignmentId) continue;

    // One submission read per assignment, reused for both the existing (current-class-only)
    // "assignments" list and the new cross-class "submittedAssignments" history below.
    const submission = submissionsByIndex[index];
    const attempts = Array.isArray(submission?.attempts) ? submission.attempts : [];
    const latest = attempts.length ? attempts[attempts.length - 1] : null;

    // Roadmap #26: the profile's "assigned / completed / pending" record counts only REPORTABLE assessments
    // (canonical predicate): drafts and archived-from-draft drafts were never assigned to the student and must
    // not show as "لم تُحل"; archived-after-published assessments stay in the history.
    if (String(assignment.classId || "") === currentClassId && isReportableAssessment(assignment)) {
      if (latest) {
        completed += 1;
        percentageSum += Number(latest.percentage || 0);
      }
      history.push({
        assignmentId,
        title: String(assignment.title || ""),
        status: String(assignment.status || ""),
        dueAt: String(assignment.dueAt || ""),
        effectiveDueAt: String(submission?.dueAtOverride || assignment.dueAt || ""),
        totalMarks: Number(assignment.totalMarks || 0),
        attemptsUsed: attempts.length,
        latestScore: latest ? Number(latest.score || 0) : null,
        latestPercentage: latest ? Number(latest.percentage || 0) : null,
        submittedAt: latest ? String(latest.submittedAt || "") : "",
        // Canonical, read-time grading authority (never derived from score/percentage by the UI). `finalized`
        // is echoed as the historical RAW value and omitted when the stored attempt never had it — never
        // fabricated to false, which would contradict a legacy result whose gradingStatus normalizes to final.
        gradingStatus: deriveGradingStatus(latest),
        ...(latest && latest.finalized !== undefined ? { finalized: latest.finalized } : {})
      });
    }

    // Submitted-history entry: independent of the student's CURRENT class, so a class change
    // never hides a real historical submission (only a fully-deleted assignment document can —
    // see the report note on that limitation).
    if (latest) {
      const base = Math.max(1, Number(assignment.maxAttempts || 1));
      submittedAssignments.push({
        assignmentId,
        title: String(assignment.title || ""),
        submittedAt: String(latest.submittedAt || ""),
        latestAttemptNumber: Number(latest.attemptNumber || attempts.length),
        attemptsUsed: attempts.length,
        allowedAttempts: Math.max(base, Number(submission?.allowedAttempts || 0)),
        score: Number(latest.score || 0),
        totalMarks: Number(latest.totalMarks || 0),
        percentage: Number(latest.percentage || 0),
        // Same canonical grading authority; `finalized` echoed raw (omitted when the legacy attempt lacked it).
        gradingStatus: deriveGradingStatus(latest),
        ...(latest.finalized !== undefined ? { finalized: latest.finalized } : {}),
        isCurrentClassAssignment: String(assignment.classId || "") === currentClassId,
        dueAt: String(assignment.dueAt || ""),
        dueAtOverride: submission?.dueAtOverride ? String(submission.dueAtOverride) : null,
        effectiveDueAt: String(submission?.dueAtOverride || assignment.dueAt || "")
      });
    }
  }

  submittedAssignments.sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")));

  return {
    student: publicStudent(student),
    classroom: classroom ? {
      classId: String(classroom.classId || ""),
      name: String(classroom.name || ""),
      grade: String(classroom.grade || ""),
      schoolYear: String(classroom.schoolYear || "")
    } : null,
    stats: {
      assigned: history.length,
      completed,
      pending: Math.max(0, history.length - completed),
      average: completed ? Number((percentageSum / completed).toFixed(1)) : null,
      lastLoginAt: String(student.lastLoginAt || "")
    },
    assignments: history,
    submittedAssignmentsCount: submittedAssignments.length,
    submittedAssignments,
    // Concise Strength + recognition for the teacher's student profile — the SAME authorities as the student
    // dashboard (student-strength policy over finalized final percentages + practice best + study + project
    // progress; recognition aggregation). Secondary: a failure here never hides the profile.
    ...(await buildProfileStrength(container, student, classroom, history))
  };
}

async function buildProfileStrength(container, student, classroom, history) {
  try {
    const now = new Date().toISOString();
    // Exam Strength = the sum of the CURRENT final results' rounded percentages (the same authority the medal loop
    // below reads), derived from history — never a flat per-exam award. Only gradingStatus==="final" contributes.
    const finalizedPercentages = history.filter(h => h.gradingStatus === "final").map(h => Number(h.latestPercentage));
    const medals = { total: 0, gold: 0, silver: 0, bronze: 0 };
    for (const h of history) { if (h.gradingStatus !== "final" || h.latestPercentage === null) continue; const t = medalTierFromPercentage(Number(h.latestPercentage)); if (t) { medals.total++; medals[t]++; } }
    const [practiceDoc, studyDoc, projects, gameResultsDoc] = await Promise.all([
      downloadJsonOrNull(container, "platform/learning-practice/" + student.userId + ".json"),
      downloadJsonOrNull(container, studyDocName(student.userId)),
      classroom && normalizeClassStatus(classroom) !== "archived" ? loadStudentProjects(container, classroom, String(student.classId || ""), student.userId, now) : Promise.resolve([]),
      downloadJsonOrNull(container, gameResultsDocName(student.userId))
    ]);
    const study = studyModulesForStrength(studyDoc, listLearningCourses().map(x => x.courseId));
    // Phase 4E — the SAME authoritative game-Strength source as the student dashboard: gamePoints from the per-student
    // assigned-game results store (best-percentage per game, ≤20 each), so dashboard and teacher profile always agree.
    const strength = buildStrengthSummary({ finalizedPercentages, trainings: practiceDoc && practiceDoc.trainings, study, games: eligibleGamePercentages(gameResultsDoc), projects: projects.map(p => ({ projectCode: p.projectCode, overallProgress: p.summary.overallProgress })) });
    const rec = (await aggregateRecognition(container, [student.userId])).get(student.userId);
    // Phase 4D — SAME authority as the student dashboard: current exam-derived medals + persisted GAME medals
    // (medal.source === "game"). The two surfaces can never diverge because both add rec.gameMedals to the same
    // exam-derived totals; assessment medals remain correction-authoritative, Strength is untouched.
    const g = (rec && rec.gameMedals) || { total: 0, gold: 0, silver: 0, bronze: 0 };
    medals.total += g.total; medals.gold += g.gold; medals.silver += g.silver; medals.bronze += g.bronze;
    return {
      strength,
      recognition: { medals, reactionsReceived: { total: rec.receivedReactionCount, byType: rec.receivedReactionByType }, achievements: { total: rec.achievementCount, byType: rec.achievementByType } },
      projectSummaries: projects.map(p => ({ projectCode: p.projectCode, title: p.definition.title, overallProgress: p.summary.overallProgress, complete: p.summary.complete === true }))
    };
  } catch {
    return {};
  }
}

// A per-row failure in a bulk loop shows the teacher only messages written FOR the teacher (typed rejections and the
// credential-lock busy message). Any other error (storage SDK text with request ids, internal conflict names) is logged
// and replaced by a generic row message.
function rowErrorMessage(error, fallback, obs) {
  if (error instanceof StudentActionError || error instanceof CredentialLockBusyError) return error.message || fallback;
  obs?.logError("student.manage.rowError", error);
  return fallback;
}

// Refuses (409 PENDING_GRADING) a move/archive/delete of a class member whose current class still has work awaiting the
// teacher — see lib/pending-grading.js. Archived students are already outside the read population.
async function assertNoPendingGrading(reader, student, operation) {
  if (!reader || student.archived === true) return;
  const pending = await reader.count(String(student.userId || ""), String(student.classId || ""));
  if (pending > 0) throw new StudentActionError(409, pendingGradingMessage(operation, pending), "PENDING_GRADING");
}

// `deps` is an optional dependency-injection seam for unit tests (production passes nothing → real
// implementations). It does not change runtime behavior.
async function manageStudentsHandler(request, deps = {}, obs = null) {
    // Audit recording is a SECONDARY concern: a failure to record must never fail the business action.
    // The real recordAuditEvent already swallows errors; wrapping here guarantees the contract even for an
    // injected/alternate recorder that throws (Roadmap #19).
    const rawRec = deps.recordAuditEvent || recordAuditEvent;
    const rec = async (c, ev) => { try { await rawRec(c, ev); } catch { /* audit is secondary */ } };
    let action = "";                                  // Roadmap #29: visible to the catch below (safe log metadata)
    try {
      const auth = (deps.requireBuilderAuth || requireBuilderAuth)(request);
      if (!auth.ok) return auth.response;
      const container = deps.container || (deps.getContainer || getContainer)();
      // Phase 21G.0 — tenancy: the classes this teacher may act on (null = every class: single mode), read once per request;
      // a student is accessible through their own owner stamp or, without one, through their class.
      const tenant = tenantOf(auth.user);
      let allowedClasses;
      const classOk = async classId => {
        if (!tenant) return true;
        if (allowedClasses === undefined) allowedClasses = accessibleClassIds(await loadDocs(container, CLASS_PREFIX), tenant);
        return classIdAllowed(allowedClasses, classId);
      };
      const studentOk = async student => {
        if (!tenant) return true;
        if (student && typeof student.ownerId === "string" && student.ownerId) return canAccessDocument(student, tenant);
        return classOk(student?.classId);
      };

      if (request.method === "GET") {
        const url = new URL(request.url);
        const profileUserId = String(url.searchParams.get("profileUserId") || "").trim();

        if (profileUserId) {
          if (!isSafeId(profileUserId)) return { status: 404, jsonBody: { ok: false, error: "الطالب غير موجود." } };
          if (tenant) {
            const subject = await downloadJsonOrNull(container, USER_PREFIX + profileUserId + ".json");
            if (!subject || subject.role !== "student" || !(await studentOk(subject))) return { status: 404, jsonBody: { ok: false, error: "الطالب غير موجود." } };
          }
          const profile = await buildStudentProfile(container, profileUserId);
          if (!profile) return { status: 404, jsonBody: { ok: false, error: "الطالب غير موجود." } };
          return { status: 200, headers: NO_STORE, jsonBody: { ok: true, profile } };
        }

        const classId = String(url.searchParams.get("classId") || "").trim();
        const includeArchived = url.searchParams.get("includeArchived") === "1";
        if (classId && (!isSafeId(classId) || !(await classOk(classId)))) return { status: 200, jsonBody: { ok: true, students: [] } };
        if (tenant) await classOk("");                // load the allowed classes once before the synchronous filter below
        const canSee = tenant ? student => (typeof student.ownerId === "string" && student.ownerId ? canAccessDocument(student, tenant) : classIdAllowed(allowedClasses, student.classId)) : null;
        return {
          status: 200,
          headers: NO_STORE,
          jsonBody: { ok: true, students: await listStudents(container, classId, includeArchived, obs, canSee) }
        };
      }

      let body = {};
      try { body = await request.json(); } catch { body = {}; }
      action = String(body?.action || "create").trim().toLowerCase();

      if (action === "create") {
        const classId = String(body?.classId || "").trim();
        const classroom = isSafeId(classId) && await classOk(classId) ? await getClassroom(container, classId) : null;
        if (!classroom || normalizeClassStatus(classroom) === "archived") {
          return { status: 400, jsonBody: { ok: false, error: "الصف غير موجود أو مؤرشف." } };
        }

        const result = await createStudentRecord(container, classroom, body, { forceGeneratedPassword: false, visible: tenant ? studentOk : null });
        // Roadmap #25: the student now EXISTS (authoritative user + auth documents). A roster-index conflict must
        // not turn that into a 500 (which made the teacher retry and hit "duplicate identity"); it is reported
        // as rosterSynced:false and self-heals on the next roster read.
        const sync = await addToRosterIndex(container, classId, [result.student.userId], { obs, operation: "create" });
        // Roadmap #19: safe audit — never the generated plaintext password (returned in-memory only).
        await rec(container, {
          actor: auth.user?.sub,
          action: "student.create",
          targetType: "student",
          targetId: result.student.userId,
          targetLabel: result.student.displayName || result.student.code,
          details: { classId }
        });
        return { status: 200, headers: NO_STORE, jsonBody: { ok: true, ...result, rosterSynced: sync.synced } };
      }

      if (action === "previewimport") {
        const students = normalizeBulkStudents(body?.students ?? body?.data);
        if (!students.length) {
          return { status: 400, jsonBody: { ok: false, error: "ملف JSON لا يحتوي بيانات طلاب صالحة." } };
        }
        if (students.length > MAX_IMPORT_ROWS) {
          return { status: 400, jsonBody: { ok: false, error: "يمكن فحص " + MAX_IMPORT_ROWS + " طالبًا كحد أقصى في العملية الواحدة." } };
        }
        const preview = await buildImportPreview(container, students, tenant ? studentOk : null);
        return {
          status: 200,
          jsonBody: {
            ok: true,
            preview,
            valid: preview.filter(x => x.status === "valid").length,
            duplicates: preview.filter(x => x.status === "duplicate").length,
            invalid: preview.filter(x => x.status === "invalid").length
          }
        };
      }

      if (action === "bulkimport") {
        const classId = String(body?.classId || "").trim();
        const classroom = isSafeId(classId) && await classOk(classId) ? await getClassroom(container, classId) : null;
        if (!classroom || normalizeClassStatus(classroom) === "archived") {
          return { status: 400, jsonBody: { ok: false, error: "الصف غير موجود أو مؤرشف." } };
        }

        const students = normalizeBulkStudents(body?.students ?? body?.data);
        if (!students.length) {
          return { status: 400, jsonBody: { ok: false, error: "ملف JSON لا يحتوي بيانات طلاب صالحة." } };
        }
        if (students.length > MAX_IMPORT_ROWS) {
          return { status: 400, jsonBody: { ok: false, error: "يمكن استيراد " + MAX_IMPORT_ROWS + " طالبًا كحد أقصى في العملية الواحدة." } };
        }

        const credentials = [];
        const errors = [];
        const createdIds = [];
        let duplicates = 0;

        // CREATE-only, per-row. Each row is revalidated server-side by createStudentRecord (name/identity/
        // existing-identity), and the conditional auth write is the final race guard — a row that loses a
        // race, or duplicates an existing identity, fails EXPLICITLY as a duplicate and never overwrites
        // another account. A partial result is reported explicitly (created + failed), never as full success.
        // createStudentRecord already writes each new student's AUTHORITATIVE membership (user.classId) — the
        // classroom.studentIds list it also touches in-memory is a denormalized index we DO NOT persist here.
        for (const item of students) {
          try {
            const result = await createStudentRecord(container, classroom, item, { forceGeneratedPassword: true, visible: tenant ? studentOk : null });
            credentials.push({
              userId: result.student.userId,
              firstName: result.student.firstName,
              familyName: result.student.familyName,
              displayName: result.student.displayName,
              identityNumber: result.student.identityNumber,
              code: result.student.code,
              password: result.temporaryPassword
            });
            createdIds.push(result.student.userId);
          } catch (error) {
            if (error && error.code === "duplicate") duplicates += 1;
            errors.push({
              index: item.index,
              firstName: item.firstName,
              familyName: item.familyName,
              identityNumber: item.identityNumber,
              displayName: [item.firstName, item.familyName].filter(Boolean).join(" "),
              code: item.identityNumber || "",
              duplicate: !!(error && error.code === "duplicate"),
              error: rowErrorMessage(error, "تعذر إنشاء الطالب.", obs)
            });
          }
        }

        // Roadmap #21 — add the successfully-created students to the classroom roster through the ONE
        // canonical concurrency-safe roster-index writer (class-roster-index → mutateJsonWithRetry
        // + conditional ETag write), NEVER a stale whole-blob overwrite. This re-reads the classroom fresh
        // on every attempt, so concurrent legitimate additions/removals and unrelated field changes are
        // preserved; it dedups by id (idempotent — a repeat import adds nothing); and it only appends here
        // (never removes). It runs OUTSIDE the per-row loop so ordinary conflicts are resolved by one
        // retry-safe mutation rather than N racy writes.
        // Roadmap #25: one idempotent CAS append through the shared roster-index module. Exhausted retries are
        // reported as rosterSynced:false (structured warning emitted by the module) — the import itself succeeded.
        const rosterSynced = createdIds.length
          ? (await addToRosterIndex(container, classId, createdIds, { obs, operation: "bulkImport" })).synced
          : true;
        // Roadmap #19: record ONE aggregate audit event — safe counts only, NEVER student names, identity
        // numbers, or any generated plaintext credential (those exist only in the in-memory response).
        await rec(container, {
          actor: auth.user?.sub,
          action: "student.bulkImport",
          targetType: "class",
          targetId: classId,
          targetLabel: String(classroom.name || ""),
          details: { classId, createdCount: credentials.length, duplicateCount: duplicates, failedCount: errors.length }
        });
        return {
          status: 200,
          headers: NO_STORE,
          jsonBody: {
            ok: true,
            imported: credentials.length,
            failed: errors.length,
            duplicates,
            rosterSynced,
            credentials,
            errors
          }
        };
      }

      if (action === "update") {
        const userId = String(body?.userId || "").trim();
        if (!isSafeId(userId)) return { status: 404, jsonBody: { ok: false, error: "الطالب غير موجود." } };
        const studentBlobName = USER_PREFIX + userId + ".json";
        const student = await downloadJsonOrNull(container, studentBlobName);

        if (!student || student.role !== "student" || !(await studentOk(student))) {
          return { status: 404, jsonBody: { ok: false, error: "الطالب غير موجود." } };
        }

        const currentNames = getStudentNames(student);
        const firstName = cleanText(body?.firstName ?? currentNames.firstName ?? "");
        const familyName = cleanText(body?.familyName ?? currentNames.familyName ?? "");
        const identityNumber = normalizeIdentityNumber(
          body?.identityNumber ??
          body?.code ??
          student.identityNumber ??
          (/^\d{9}$/.test(String(student.code || "")) ? student.code : "")
        );
        const newCode = identityNumber;
        const newClassId = String(body?.classId ?? student.classId ?? "").trim();
        if (newClassId !== String(student.classId || "") && (!isSafeId(newClassId) || !(await classOk(newClassId)))) {
          return { status: 400, jsonBody: { ok: false, error: "الصف غير موجود أو مؤرشف." } };
        }
        const newPassword = String(body?.password || "");

        if (!firstName || !familyName) {
          return { status: 400, jsonBody: { ok: false, error: "يجب إدخال الاسم الشخصي واسم العائلة." } };
        }
        if (namesTooLong(firstName, familyName)) return { status: 400, jsonBody: { ok: false, error: NAME_TOO_LONG } };
        if (!isValidIdentityNumber(identityNumber)) {
          return { status: 400, jsonBody: { ok: false, error: "رقم الهوية يجب أن يتكوّن من 9 أرقام." } };
        }
        if (!newClassId) return { status: 400, jsonBody: { ok: false, error: "اختر الصف." } };
        if (newPassword && newPassword.length < LIMITS.passwordMin) {
          return { status: 400, jsonBody: { ok: false, error: "كلمة المرور الجديدة يجب أن تحتوي على 6 محارف على الأقل." } };
        }
        if (newPassword.length > LIMITS.passwordMax) return { status: 400, jsonBody: { ok: false, error: PASSWORD_TOO_LONG } };

        const newClassroom = await getClassroom(container, newClassId);
        if (!newClassroom || normalizeClassStatus(newClassroom) === "archived") {
          return { status: 400, jsonBody: { ok: false, error: "الصف الجديد غير موجود أو مؤرشف." } };
        }

        const oldCode = String(student.code || student.identityNumber || "");
        if (newCode !== oldCode) {
          const duplicate = await findStudentByIdentity(container, newCode);
          if (duplicate && String(duplicate.userId) !== userId) {
            return { status: 409, jsonBody: { ok: false, error: "رقم الهوية مستخدم مسبقًا." } };
          }
        }
        const oldClassId = String(student.classId || "");
        // Grading safety: moving a class member out of their class hides that class's pending work (pending-grading.js).
        if (oldClassId !== newClassId && student.archived !== true) {
          const pending = await createPendingGradingReader(container).count(userId, oldClassId);
          if (pending > 0) return { status: 409, jsonBody: { ok: false, code: "PENDING_GRADING", pendingCount: pending, error: pendingGradingMessage("move", pending) } };
        }
        const newPwHash = newPassword ? hashPassword(newPassword) : null;

        // PR#67 final: the ENTIRE update mutation (student rewrite + auth-doc write, and especially the
        // RENAME which MOVES the auth blob path) runs under the per-student credential lock so a concurrent
        // reset/rename can never delete a newer credential or resurrect an older password across the move.
        // ALL updates take the lock — not only those a pre-lock snapshot classified as credential-changing:
        // that classification (newCode vs the snapshot `oldCode`) is itself stale, so a request that looked
        // like a pure name/class edit can silently become an auth-path move after another request renames the
        // code. The auth path is derived from the CURRENT student RE-READ INSIDE the lock — never from the
        // pre-lock `student` snapshot. `credentialApplied` reports whether a password change actually became
        // authoritative (a stale op → 409 below, no success/audit).
        let updatedStudentVersion = null;
        let credentialApplied = !newPassword;
        const runCredentialMutation = async () => {
          const cur = await downloadJsonOrNull(container, studentBlobName);
          if (!cur || cur.role !== "student") return { status: 404, jsonBody: { ok: false, error: "الطالب غير موجود." } };
          const curCode = String(cur.code || cur.identityNumber || "");
          // Stale-snapshot gate: this request classified `newCode` against the code it read BEFORE acquiring
          // the lock (`oldCode`). If a concurrent op changed the authoritative code while we waited for the
          // lock, that classification is stale — refuse deterministically rather than move the auth path from
          // outdated state (which could recreate a deleted auth blob or clobber a newer rename). Login stays
          // consistent; the caller re-reads and retries.
          if (studentCodeHash(curCode) !== studentCodeHash(oldCode)) {
            return { status: 409, headers: { "Cache-Control": "no-store" }, jsonBody: { ok: false, error: "تم تعديل بيانات دخول الطالب في عملية أخرى. حدّث البيانات وأعد المحاولة." } };
          }
          // A concurrent MOVE (the bulk move takes no credential lock) changed the class this request was validated
          // against: refuse instead of silently writing the old class back over it.
          if (String(cur.classId || "") !== oldClassId) return { status: 409, jsonBody: { ok: false, error: CONCURRENT_MOVE } };
          const curAuthName = AUTH_PREFIX + studentCodeHash(curCode) + ".json";
          const curAuth = await downloadJsonOrNull(container, curAuthName);
          if (!curAuth) return { status: 404, jsonBody: { ok: false, error: "ملف دخول الطالب غير موجود." } };
          const authActive = cur.active !== false && cur.archived !== true;
          const targetAuthName = AUTH_PREFIX + studentCodeHash(newCode) + ".json";
          const rename = targetAuthName !== curAuthName;
          const expectedVersion = normalizeAuthVersion(cur.authVersion) + (newPassword ? 1 : 0);

          // RENAME ordering: the credential at the NEW path is created FIRST (create-only), so an identity that is
          // already taken is a clean 409 with nothing changed. Only then is the student document rewritten; if that
          // fails, the new credential is removed again (compensation), so the student document and its auth path can
          // never disagree. Built from the CURRENT auth (re-read inside the lock: it carries any newer reset).
          let createdAuthEtag = null;
          let newAuthVersion = 0;
          if (rename) {
            newAuthVersion = Math.max(normalizeAuthVersion(curAuth.authVersion), expectedVersion);
            const newAuthDoc = {
              ...curAuth,
              schemaVersion: 3,
              codeHash: studentCodeHash(newCode),
              active: authActive,
              authVersion: newAuthVersion,
              updatedAt: new Date().toISOString()
            };
            if (newPwHash) { newAuthDoc.salt = newPwHash.salt; newAuthDoc.passwordHash = newPwHash.passwordHash; }
            try {
              createdAuthEtag = await uploadJsonConditional(container, targetAuthName, newAuthDoc, null);
            } catch (e) {
              if (isConcurrencyConflict(e)) return { status: 409, jsonBody: { ok: false, error: "رقم الهوية مستخدم مسبقًا." } };
              throw e;
            }
          }

          try {
            await mutateJsonWithRetry(container, studentBlobName, c => {
              if (!c || c.role !== "student") throw new StudentActionError(404, "الطالب غير موجود.");
              if (String(c.classId || "") !== oldClassId) throw new StudentActionError(409, CONCURRENT_MOVE);
              c.schemaVersion = 3;
              c.firstName = firstName;
              c.familyName = familyName;
              c.displayName = firstName + " " + familyName;
              c.identityNumber = identityNumber;
              c.code = newCode;
              c.classId = newClassId;
              if (newPassword) c.authVersion = normalizeAuthVersion(c.authVersion) + 1;
              updatedStudentVersion = normalizeAuthVersion(c.authVersion);
              c.updatedAt = new Date().toISOString();
              return c;
            });
          } catch (e) {
            if (rename) { try { await deleteBlobConditional(container, targetAuthName, createdAuthEtag); } catch { /* reclaimable orphan */ } }
            throw e;
          }

          if (!rename) {
            await mutateJsonWithRetry(container, curAuthName, c => {
              if (!c) throw new StudentActionError(404, "ملف دخول الطالب غير موجود.");
              if (newPwHash) {
                if (normalizeAuthVersion(c.authVersion) <= updatedStudentVersion) {
                  c.salt = newPwHash.salt; c.passwordHash = newPwHash.passwordHash; c.authVersion = updatedStudentVersion; credentialApplied = true;
                } else { credentialApplied = false; } // a newer reset already won → stale
              }
              c.schemaVersion = 3; c.codeHash = studentCodeHash(newCode); c.active = authActive; c.updatedAt = new Date().toISOString();
              return c;
            });
          } else {
            // Login requires auth.authVersion === student.authVersion; under the lock they already agree, but a student
            // version that advanced anyway is caught up on the new credential (never down).
            if (normalizeAuthVersion(updatedStudentVersion) > newAuthVersion) {
              await mutateJsonWithRetry(container, targetAuthName, c => {
                if (!c) throw new StudentActionError(404, "ملف دخول الطالب غير موجود.");
                c.authVersion = normalizeAuthVersion(updatedStudentVersion);
                c.updatedAt = new Date().toISOString();
                return c;
              });
            }
            await container.getBlobClient(curAuthName).deleteIfExists();
            if (newPwHash) credentialApplied = true;
          }
          return null;
        };
        // Every update runs under the per-student credential lock (see the note above): a pre-lock
        // classification of "not credential-changing" is unreliable because a concurrent rename can move the
        // auth path out from under it. Teacher profile updates are infrequent, so the lock cost is negligible.
        const credResult = await withCredentialLock(container, userId, runCredentialMutation);
        if (credResult && credResult.status) return credResult;

        let rosterSynced = true;
        if (oldClassId !== newClassId) {
          // Authoritative user.classId was written above (under the credential lock); index updates are best-effort.
          const removed = await removeFromRosterIndex(container, oldClassId, [userId], { obs, operation: "update-move" });
          const added = student.archived !== true
            ? await addToRosterIndex(container, newClassId, [userId], { obs, operation: "update-move" })
            : { synced: true };
          rosterSynced = removed.synced && added.synced;
          await rec(container, { actor: auth.user?.sub, action: "student.move", targetType: "student", targetId: userId, targetLabel: (firstName + " " + familyName).trim(), details: { fromClassId: oldClassId, toClassId: newClassId, viaProfileUpdate: true } });
        }

        // §1: a stale password change (a newer reset already owns the version) must NOT report success —
        // no overwrite happened, so return a deterministic 409 with a generic retry message and emit no
        // reset-password audit and no passwordChanged:true.
        if (newPassword && !credentialApplied) {
          return { status: 409, headers: { "Cache-Control": "no-store" }, jsonBody: { ok: false, error: "تعذّر تغيير كلمة المرور بسبب تعارض مع عملية أحدث. أعد المحاولة." } };
        }
        const updatedStudent = await downloadJsonOrNull(container, studentBlobName);
        // Profile edits are audited (names / identity), never with the identity number itself.
        const changedFields = [
          ...(firstName !== currentNames.firstName ? ["firstName"] : []),
          ...(familyName !== currentNames.familyName ? ["familyName"] : []),
          ...(studentCodeHash(newCode) !== studentCodeHash(oldCode) ? ["identityNumber"] : [])
        ];
        if (changedFields.length) {
          await rec(container, { actor: auth.user?.sub, action: "student.update", targetType: "student", targetId: userId, targetLabel: (firstName + " " + familyName).trim(), details: { fields: changedFields } });
        }
        if (newPassword) {
          await rec(container, {
            actor: auth.user?.sub,
            action: "student.resetPassword",
            targetType: "student",
            targetId: userId,
            targetLabel: (updatedStudent || student).displayName || newCode,
            details: { viaProfileUpdate: true }
          });
        }
        return {
          status: 200,
          jsonBody: { ok: true, student: publicStudent(updatedStudent || student), passwordChanged: !!newPassword, rosterSynced }
        };
      }

      if (["resetpassword", "toggleactive", "archive", "unarchive", "delete"].includes(action)) {
        const userId = String(body?.userId || "").trim();
        if (!isSafeId(userId)) return { status: 404, jsonBody: { ok: false, error: "الطالب غير موجود." } };
        const student = await downloadJsonOrNull(container, USER_PREFIX + userId + ".json");
        if (!student || student.role !== "student" || !(await studentOk(student))) {
          return { status: 404, jsonBody: { ok: false, error: "الطالب غير موجود." } };
        }

        if (action === "resetpassword") {
          const temporaryPassword = await resetStudentPassword(container, student, body?.password);
          await rec(container, {
            actor: auth.user?.sub,
            action: "student.resetPassword",
            targetType: "student",
            targetId: student.userId,
            targetLabel: student.displayName || student.code
          });
          return {
            status: 200,
            headers: { "Cache-Control": "no-store" },
            jsonBody: { ok: true, temporaryPassword }
          };
        }
        if (action === "toggleactive") {
          // An explicit target state makes the call idempotent (a retry / double click never flips it back); without
          // one the established toggle of the current state is kept for older clients.
          const active = typeof body?.active === "boolean" ? body.active : !(student.active !== false);
          await changeStudentActive(container, student, active);
          await rec(container, { actor: auth.user?.sub, action: "student.setActive", targetType: "student", targetId: student.userId, targetLabel: student.displayName || student.code, details: { active } });
          return { status: 200, jsonBody: { ok: true, active } };
        }
        if (action === "archive") {
          await assertNoPendingGrading(createPendingGradingReader(container), student, "archive");
          const sync = await archiveStudent(container, student, obs);
          await rec(container, { actor: auth.user?.sub, action: "student.archive", targetType: "student", targetId: student.userId, targetLabel: student.displayName || student.code, details: { classId: String(student.classId || "") } });
          return { status: 200, jsonBody: { ok: true, archived: true, rosterSynced: sync.synced } };
        }
        if (action === "unarchive") {
          const sync = await unarchiveStudent(container, student, obs);
          await rec(container, { actor: auth.user?.sub, action: "student.unarchive", targetType: "student", targetId: student.userId, targetLabel: student.displayName || student.code, details: { classId: String(student.classId || "") } });
          return { status: 200, jsonBody: { ok: true, archived: false, active: true, rosterSynced: sync.synced } };
        }

        await assertNoPendingGrading(createPendingGradingReader(container), student, "delete");
        const deleteSync = await deleteStudent(container, student, obs);
        await rec(container, {
          actor: auth.user?.sub,
          action: "student.delete",
          targetType: "student",
          targetId: student.userId,
          targetLabel: student.displayName || student.code,
          details: { messagingPurged: deleteSync.messagingPurged }
        });
        return { status: 200, jsonBody: { ok: true, deleted: true, rosterSynced: deleteSync.synced, messagingPurged: deleteSync.messagingPurged } };
      }

      if (action === "bulkaction") {
        const operation = String(body?.operation || "").trim().toLowerCase();
        const userIds = Array.from(new Set(
          (Array.isArray(body?.userIds) ? body.userIds : [])
            .map(x => String(x || "").trim())
            .filter(Boolean)
        ));

        if (!userIds.length) {
          return { status: 400, jsonBody: { ok: false, error: "اختر طالبًا واحدًا على الأقل." } };
        }
        // Never a silent truncation (previously ids beyond the limit were dropped while the batch reported success).
        if (userIds.length > MAX_IMPORT_ROWS) {
          return { status: 400, jsonBody: { ok: false, error: "يمكن تنفيذ العملية الجماعية على " + MAX_IMPORT_ROWS + " طالبًا كحد أقصى في المرة الواحدة." } };
        }

        const supported = ["activate", "deactivate", "archive", "unarchive", "move", "resetpasswords", "delete"];
        if (!supported.includes(operation)) {
          return { status: 400, jsonBody: { ok: false, error: "العملية الجماعية غير مدعومة." } };
        }

        const targetClassId = String(body?.targetClassId || "").trim();
        if (operation === "move" && !targetClassId) {
          return { status: 400, jsonBody: { ok: false, error: "اختر الصف الهدف." } };
        }
        if (operation === "move" && (!isSafeId(targetClassId) || !(await classOk(targetClassId)))) {
          return { status: 400, jsonBody: { ok: false, error: "الصف غير موجود أو مؤرشف." } };
        }

        const results = [];
        const errors = [];
        const credentials = [];
        let rosterSynced = true;                      // Roadmap #25: aggregate index sync status of the batch
        const note = sync => { if (sync && sync.synced === false) rosterSynced = false; };
        const pendingReader = operation === "move" || operation === "archive" || operation === "delete" ? createPendingGradingReader(container) : null;

        for (const userId of userIds) {
          try {
            const student = isSafeId(userId) ? await downloadJsonOrNull(container, USER_PREFIX + userId + ".json") : null;
            if (!student || student.role !== "student" || !(await studentOk(student))) throw new StudentActionError(404, "الطالب غير موجود.");

            if (operation === "activate" || operation === "deactivate") {
              const active = operation === "activate";
              await changeStudentActive(container, student, active);
              await rec(container, { actor: auth.user?.sub, action: "student.setActive", targetType: "student", targetId: userId, targetLabel: student.displayName || student.code, details: { active, bulk: true } });
            }
            else if (operation === "archive") {
              await assertNoPendingGrading(pendingReader, student, "archive"); note(await archiveStudent(container, student, obs)); await rec(container, { actor: auth.user?.sub, action: "student.archive", targetType: "student", targetId: userId, targetLabel: student.displayName || student.code, details: { bulk: true, classId: String(student.classId || "") } }); }
            else if (operation === "unarchive") { note(await unarchiveStudent(container, student, obs)); await rec(container, { actor: auth.user?.sub, action: "student.unarchive", targetType: "student", targetId: userId, targetLabel: student.displayName || student.code, details: { bulk: true, classId: String(student.classId || "") } }); }
            else if (operation === "move") {
              if (String(student.classId || "") !== targetClassId) await assertNoPendingGrading(pendingReader, student, "move");
              note(await moveStudent(container, student, targetClassId, obs)); await rec(container, { actor: auth.user?.sub, action: "student.move", targetType: "student", targetId: userId, targetLabel: student.displayName || student.code, details: { bulk: true, fromClassId: String(student.classId || ""), toClassId: targetClassId } }); }
            else if (operation === "resetpasswords") {
              const password = await resetStudentPassword(container, student);
              const publicValue = publicStudent(student);
              credentials.push({
                userId,
                firstName: publicValue.firstName,
                familyName: publicValue.familyName,
                displayName: publicValue.displayName,
                identityNumber: publicValue.identityNumber,
                code: publicValue.code,
                password
              });
              await rec(container, {
                actor: auth.user?.sub,
                action: "student.resetPassword",
                targetType: "student",
                targetId: userId,
                targetLabel: publicValue.displayName || publicValue.code,
                details: { bulk: true }
              });
            } else if (operation === "delete") {
              // M.4 — a smaller inline purge step per student in a batch (up to 250 students); the rest is drained.
              await assertNoPendingGrading(pendingReader, student, "delete");
              const deleted = await deleteStudent(container, student, obs, { purgeBudget: BULK_PURGE_STEP_BUDGET });
              note(deleted);
              await rec(container, {
                actor: auth.user?.sub,
                action: "student.delete",
                targetType: "student",
                targetId: userId,
                targetLabel: student.displayName || student.code,
                details: { bulk: true, messagingPurged: deleted.messagingPurged }
              });
            }

            results.push(userId);
          } catch (error) {
            errors.push({
              userId,
              ...(error && error.code === "PENDING_GRADING" ? { code: "PENDING_GRADING" } : {}),
              error: rowErrorMessage(error, "تعذر تنفيذ العملية لهذا الطالب.", obs)
            });
          }
        }

        return {
          status: 200,
          headers: NO_STORE,
          jsonBody: {
            ok: true,
            processed: results.length,
            failed: errors.length,
            results,
            errors,
            credentials,
            rosterSynced
          }
        };
      }

      return {
        status: 400,
        jsonBody: { ok: false, error: "Unsupported student action." }
      };
    } catch (e) {
      // A busy per-student credential lock is a transient conflict, not a server error.
      if (e instanceof CredentialLockBusyError) {
        obs?.logWarn("student.credential.lock_contention", { retryable: true });
        return { status: 409, headers: { "Cache-Control": "no-store" }, jsonBody: { ok: false, error: "عملية أخرى على بيانات الطالب قيد التنفيذ. أعد المحاولة." } };
      }
      // Roadmap #29: the teacher's input or the current state was rejected — a 4xx with the specific Arabic
      // message, logged as a warning with SAFE metadata only (never the message: it can name a student).
      if (e instanceof StudentActionError) {
        obs?.logWarn("student.manage.rejected", { action, httpStatus: e.httpStatus, errorCode: e.code || "validation" });
        return { status: e.httpStatus, headers: { "Cache-Control": "no-store" }, jsonBody: { ok: false, error: e.message, ...(e.code === "PENDING_GRADING" ? { code: e.code } : {}) } };
      }
      obs?.logError("student.manage.error", e);
      return {
        status: 500,
        jsonBody: {
          ok: false,
          error: "تعذر تنفيذ إجراء الطالب حاليًا."
        }
      };
    }
}
app.http("manageStudents", { methods: ["GET", "POST"], authLevel: "anonymous", route: "students", handler: withObservability("students", manageStudentsHandler) });

// Roadmap #8 — exported for unit tests (authVersion on create / password reset / update). Additive.
// Roadmap #18 — pure roster-import helpers exported so normalization/validation are unit-tested directly
// (no storage), plus buildImportPreview + MAX_IMPORT_ROWS for the preview/limit tests.
module.exports = {
  createStudentRecord, resetStudentPassword, buildStudentProfile, handler: manageStudentsHandler, StudentActionError,
  normalizeBulkStudents, namesFromInput, identityFromInput, normalizeIdentityNumber, isValidIdentityNumber,
  buildImportPreview, MAX_IMPORT_ROWS
};
