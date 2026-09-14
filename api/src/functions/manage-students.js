const { app } = require("@azure/functions");
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
  isConcurrencyConflict
} = require("../lib/platform-storage");
const { recordAuditEvent } = require("../lib/audit-log");
const { FEED_PREFIX, REACTIONS } = require("../lib/achievement-feed");
const { withCredentialLock, CredentialLockBusyError } = require("../lib/student-credential-lock");

// Thrown from inside a mutateJsonWithRetry callback to mean "nothing to do" (target document is
// missing, or already in the desired state) — caught at each call site and treated as a silent
// no-op, matching the equivalent early-returns the unprotected code used to have.
class SkipMutation extends Error {}

const BANK_CONTAINER = "bank";
const USER_PREFIX = "platform/users/";
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

async function listJson(container, prefix) {
  const result = [];
  for await (const blob of container.listBlobsFlat({ prefix })) {
    if (!blob.name.endsWith(".json")) continue;
    const value = await downloadJsonOrNull(container, blob.name);
    if (value) result.push(value);
  }
  return result;
}

function normalizeIdentityNumber(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length <= 9 ? digits.padStart(9, "0") : digits;
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
    createdAt: String(document.createdAt || ""),
    updatedAt: String(document.updatedAt || ""),
    lastLoginAt: String(document.lastLoginAt || "")
  };
}

async function getClassroom(container, classId) {
  if (!classId) return null;
  return downloadJsonOrNull(container, CLASS_PREFIX + classId + ".json");
}

async function saveClassroom(container, classroom) {
  classroom.updatedAt = new Date().toISOString();
  await uploadJson(container, CLASS_PREFIX + classroom.classId + ".json", classroom);
}

function ensureStudentIds(classroom) {
  classroom.studentIds = Array.isArray(classroom.studentIds) ? classroom.studentIds : [];
  return classroom.studentIds;
}

// Re-reads the classroom fresh on every attempt (via mutateJsonWithRetry) instead of trusting a
// possibly-stale in-memory copy, so concurrent roster changes (archive/unarchive/move/delete/create
// racing each other) never silently drop one another's studentIds update. Silently does nothing if
// the classroom no longer exists, matching the previous `if (classroom) {...}` call sites.
async function mutateClassroomStudentIds(container, classId, applyMutation) {
  if (!classId) return;
  try {
    await mutateJsonWithRetry(container, CLASS_PREFIX + classId + ".json", current => {
      if (!current) throw new SkipMutation();
      applyMutation(current);
      current.updatedAt = new Date().toISOString();
      return current;
    });
  } catch (e) {
    if (!(e instanceof SkipMutation)) throw e;
  }
}

async function listStudents(container, classId, includeArchived = false) {
  const result = [];
  for await (const blob of container.listBlobsFlat({ prefix: USER_PREFIX })) {
    if (!blob.name.endsWith(".json")) continue;
    const student = await downloadJsonOrNull(container, blob.name);
    if (!student || student.role !== "student") continue;
    if (classId && String(student.classId || "") !== classId) continue;
    if (!includeArchived && student.archived === true) continue;
    result.push(publicStudent(student));
  }
  result.sort((a, b) => {
    const family = String(a.familyName).localeCompare(String(b.familyName), "ar");
    return family || String(a.firstName).localeCompare(String(b.firstName), "ar");
  });

  // Table-row badge only needs a count, not full history — and it must not hide a student's
  // historical submissions from a class they no longer belong to, so this is not scoped to
  // classId. One single listing pass under SUBMISSION_PREFIX (not one per assignment), parsing
  // "platform/submissions/{assignmentId}/{studentId}.json" directly; assignment documents are
  // never downloaded here, and submission content is only fetched for students already in the
  // current roster (no per-student N+1 request).
  const idSet = new Set(result.map(s => s.userId));
  const submittedSets = new Map(); // studentId -> Set<assignmentId>
  if (idSet.size) {
    for await (const blob of container.listBlobsFlat({ prefix: SUBMISSION_PREFIX })) {
      if (!blob.name.endsWith(".json")) continue;
      const rest = blob.name.slice(SUBMISSION_PREFIX.length); // "{assignmentId}/{studentId}.json"
      const slashIndex = rest.indexOf("/");
      if (slashIndex < 0) continue;
      const assignmentId = rest.slice(0, slashIndex);
      const studentId = rest.slice(slashIndex + 1, -".json".length);
      if (!assignmentId || !studentId) continue;
      if (!idSet.has(studentId)) continue;
      const submission = await downloadJsonOrNull(container, blob.name);
      const attempts = Array.isArray(submission?.attempts) ? submission.attempts : [];
      if (!attempts.length) continue;
      if (!submittedSets.has(studentId)) submittedSets.set(studentId, new Set());
      submittedSets.get(studentId).add(assignmentId);
    }
  }

  // Same single-pass pattern as the submissions count above: one listing pass under FEED_PREFIX
  // (not scoped to classId, since a student's achievement history should still count after they
  // move classes), summing every reaction — classmates' plus the teacher's — across every post
  // that belongs to this student.
  const likesByStudent = new Map(); // studentId -> total like count
  if (idSet.size) {
    for await (const blob of container.listBlobsFlat({ prefix: FEED_PREFIX })) {
      if (!blob.name.endsWith(".json")) continue;
      const post = await downloadJsonOrNull(container, blob.name);
      if (!post) continue;
      const studentId = String(post.studentId || "");
      if (!idSet.has(studentId)) continue;
      let total = 0;
      for (const key of REACTIONS) {
        if (Array.isArray(post.reactions?.[key])) total += post.reactions[key].length;
      }
      if (post.teacherReaction) total += 1;
      likesByStudent.set(studentId, (likesByStudent.get(studentId) || 0) + total);
    }
  }

  return result.map(student => ({
    ...student,
    submittedAssignmentsCount: submittedSets.get(student.userId)?.size || 0,
    likesCount: likesByStudent.get(student.userId) || 0
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
  const directFirst = String(input?.firstName ?? input?.givenName ?? "").trim();
  const directFamily = String(input?.familyName ?? input?.lastName ?? input?.surname ?? "").trim();
  if (directFirst || directFamily) return { firstName: directFirst, familyName: directFamily };
  return splitLegacyName(input?.displayName ?? input?.name ?? input?.studentName ?? "");
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

  if (!firstName || !familyName) throw new Error("يجب إدخال الاسم الشخصي واسم العائلة.");
  if (!isValidIdentityNumber(identityNumber)) throw new Error("رقم الهوية يجب أن يتكوّن من 9 أرقام.");

  const existing = await findStudentByIdentity(container, identityNumber);
  if (existing) {
    const existingClass = await getClassroom(container, String(existing.classId || ""));
    throw new Error(
      "رقم الهوية مستخدم مسبقًا للطالب " +
      String(existing.displayName || identityNumber) +
      (existingClass?.name ? " في الصف " + existingClass.name : "")
    );
  }

  const password = options.forceGeneratedPassword
    ? generateTemporaryPassword()
    : String(input?.password || "") || generateTemporaryPassword();

  if (password.length < 6) throw new Error("كلمة المرور يجب أن تحتوي على 6 محارف على الأقل.");

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
  try {
    await uploadJsonConditional(container, AUTH_PREFIX + studentCodeHash(code) + ".json", authDocument, null);
  } catch (e) {
    if (isConcurrencyConflict(e)) throw new Error("رقم الهوية مستخدم مسبقًا لطالب آخر. أعد المحاولة.");
    throw e;
  }
  await uploadJson(container, USER_PREFIX + userId + ".json", student);
  const ids = ensureStudentIds(classroom);
  if (!ids.includes(userId)) ids.push(userId);

  return { student: publicStudent(student), temporaryPassword: password };
}

async function resetStudentPassword(container, student, requestedPassword = "") {
  const temporaryPassword = String(requestedPassword || "") || generateTemporaryPassword();
  if (temporaryPassword.length < 6) throw new Error("كلمة المرور يجب أن تحتوي على 6 محارف على الأقل.");
  const { salt, passwordHash } = hashPassword(temporaryPassword);

  // PR#67 final: run under the per-student credential lock so a reset can never race a rename that moves the
  // auth blob path. The CURRENT student is re-read INSIDE the lock and the auth path is derived from its
  // current code (never from the possibly-stale `student` argument loaded before the lock was acquired).
  await withCredentialLock(container, student.userId, async () => {
    const current = await downloadJsonOrNull(container, USER_PREFIX + student.userId + ".json");
    if (!current || current.role !== "student") throw new Error("الطالب غير موجود.");
    const code = String(current.code || current.identityNumber || "");
    const authBlobName = AUTH_PREFIX + studentCodeHash(code) + ".json";
    const now = new Date().toISOString();
    // Fail-closed ordering (§3): bump the STUDENT authVersion FIRST (revokes sessions; login stays
    // fail-closed until the auth doc catches up), then write the auth hash + matching version.
    let newVersion = 1;
    await mutateJsonWithRetry(container, USER_PREFIX + student.userId + ".json", cur => {
      if (!cur) throw new Error("الطالب غير موجود.");
      newVersion = normalizeAuthVersion(cur.authVersion) + 1;
      cur.authVersion = newVersion;
      cur.updatedAt = now;
      return cur;
    });
    // Version-conditional (§B): overwrite the credential only if this op owns the newest version.
    let applied = true;
    await mutateJsonWithRetry(container, authBlobName, cur => {
      if (!cur) throw new Error("ملف دخول الطالب غير موجود.");
      if (normalizeAuthVersion(cur.authVersion) > newVersion) { applied = false; return cur; } // stale
      cur.salt = salt;
      cur.passwordHash = passwordHash;
      cur.authVersion = newVersion;
      cur.updatedAt = now;
      return cur;
    });
    if (!applied) throw new Error("تم تغيير كلمة المرور من عملية أحدث. أعد المحاولة.");
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
    if (!current) throw new Error("الطالب غير موجود.");
    if (current.archived === true && active) throw new Error("استعد الطالب من الأرشيف أولًا.");
    current.active = !!active;
    current.updatedAt = new Date().toISOString();
    return current;
  });
  await setAuthActive(container, student, !!active);
}

async function archiveStudent(container, student) {
  try {
    await mutateJsonWithRetry(container, USER_PREFIX + student.userId + ".json", current => {
      if (!current || current.archived === true) throw new SkipMutation();
      const now = new Date().toISOString();
      current.archived = true;
      current.active = false;
      current.archivedAt = now;
      current.updatedAt = now;
      return current;
    });
  } catch (e) {
    if (e instanceof SkipMutation) return;
    throw e;
  }
  await setAuthActive(container, student, false);
  await mutateClassroomStudentIds(container, String(student.classId || ""), classroom => {
    classroom.studentIds = ensureStudentIds(classroom).filter(id => id !== student.userId);
  });
}

async function unarchiveStudent(container, student) {
  const classId = String(student.classId || "");
  const classroom = await getClassroom(container, classId);
  if (!classroom || classroom.active === false) throw new Error("فعّل الصف قبل استعادة الطالب.");

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
    if (e instanceof SkipMutation) return;
    throw e;
  }
  await setAuthActive(container, student, true);
  await mutateClassroomStudentIds(container, classId, freshClassroom => {
    const ids = ensureStudentIds(freshClassroom);
    if (!ids.includes(student.userId)) ids.push(student.userId);
  });
}

async function moveStudent(container, student, targetClassId) {
  const target = await getClassroom(container, targetClassId);
  if (!target || target.active === false) throw new Error("الصف الهدف غير موجود أو مؤرشف.");

  const oldClassId = String(student.classId || "");
  if (oldClassId === targetClassId) return;

  await mutateClassroomStudentIds(container, oldClassId, classroom => {
    classroom.studentIds = ensureStudentIds(classroom).filter(id => id !== student.userId);
  });

  try {
    await mutateJsonWithRetry(container, USER_PREFIX + student.userId + ".json", current => {
      if (!current) throw new SkipMutation();
      current.classId = targetClassId;
      current.updatedAt = new Date().toISOString();
      return current;
    });
  } catch (e) {
    if (!(e instanceof SkipMutation)) throw e;
  }

  if (student.archived !== true) {
    await mutateClassroomStudentIds(container, targetClassId, classroom => {
      const ids = ensureStudentIds(classroom);
      if (!ids.includes(student.userId)) ids.push(student.userId);
    });
  }
}

async function deleteStudent(container, student) {
  await mutateClassroomStudentIds(container, String(student.classId || ""), classroom => {
    classroom.studentIds = ensureStudentIds(classroom).filter(id => id !== student.userId);
  });

  const code = String(student.code || student.identityNumber || "");
  if (code) {
    await container.getBlobClient(AUTH_PREFIX + studentCodeHash(code) + ".json").deleteIfExists();
  }
  await container.getBlobClient(USER_PREFIX + student.userId + ".json").deleteIfExists();
}

async function buildImportPreview(container, items) {
  const classCache = new Map();
  const rows = [];

  for (const item of items) {
    let status = "valid";
    let error = "";
    let existingStudent = null;

    if (!item.firstName || !item.familyName) {
      status = "invalid";
      error = "الاسم واسم العائلة مطلوبان.";
    } else if (!isValidIdentityNumber(item.identityNumber)) {
      status = "invalid";
      error = "رقم الهوية يجب أن يتكوّن من 9 أرقام.";
    } else {
      const existing = await findStudentByIdentity(container, item.identityNumber);
      if (existing) {
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
  const allAssignments = (await listJson(container, ASSIGNMENT_PREFIX))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  const history = [];
  const submittedAssignments = [];
  let completed = 0;
  let percentageSum = 0;

  for (const assignment of allAssignments) {
    const assignmentId = String(assignment.assignmentId || "");
    if (!assignmentId) continue;

    // One submission read per assignment, reused for both the existing (current-class-only)
    // "assignments" list and the new cross-class "submittedAssignments" history below.
    const submission = await downloadJsonOrNull(
      container,
      SUBMISSION_PREFIX + assignmentId + "/" + student.userId + ".json"
    );
    const attempts = Array.isArray(submission?.attempts) ? submission.attempts : [];
    const latest = attempts.length ? attempts[attempts.length - 1] : null;

    if (String(assignment.classId || "") === currentClassId) {
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
        finalized: latest ? latest.finalized === true : false
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
        finalized: latest.finalized === true,
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
    submittedAssignments
  };
}

// `deps` is an optional dependency-injection seam for unit tests (production passes nothing → real
// implementations). It does not change runtime behavior.
async function manageStudentsHandler(request, deps = {}) {
    const rec = deps.recordAuditEvent || recordAuditEvent;
    try {
      const auth = (deps.requireBuilderAuth || requireBuilderAuth)(request);
      if (!auth.ok) return auth.response;
      const container = deps.container || (deps.getContainer || getContainer)();

      if (request.method === "GET") {
        const url = new URL(request.url);
        const profileUserId = String(url.searchParams.get("profileUserId") || "").trim();

        if (profileUserId) {
          const profile = await buildStudentProfile(container, profileUserId);
          if (!profile) return { status: 404, jsonBody: { ok: false, error: "الطالب غير موجود." } };
          return { status: 200, jsonBody: { ok: true, profile } };
        }

        const classId = String(url.searchParams.get("classId") || "").trim();
        const includeArchived = url.searchParams.get("includeArchived") === "1";
        return {
          status: 200,
          jsonBody: { ok: true, students: await listStudents(container, classId, includeArchived) }
        };
      }

      let body = {};
      try { body = await request.json(); } catch { body = {}; }
      const action = String(body?.action || "create").trim().toLowerCase();

      if (action === "create") {
        const classId = String(body?.classId || "").trim();
        const classroom = await getClassroom(container, classId);
        if (!classroom || classroom.active === false) {
          return { status: 400, jsonBody: { ok: false, error: "الصف غير موجود أو مؤرشف." } };
        }

        const result = await createStudentRecord(container, classroom, body, { forceGeneratedPassword: false });
        await mutateClassroomStudentIds(container, classId, freshClassroom => {
          const ids = ensureStudentIds(freshClassroom);
          if (!ids.includes(result.student.userId)) ids.push(result.student.userId);
        });
        return { status: 200, jsonBody: { ok: true, ...result } };
      }

      if (action === "previewimport") {
        const students = normalizeBulkStudents(body?.students ?? body?.data);
        if (!students.length) {
          return { status: 400, jsonBody: { ok: false, error: "ملف JSON لا يحتوي بيانات طلاب صالحة." } };
        }
        if (students.length > 250) {
          return { status: 400, jsonBody: { ok: false, error: "يمكن فحص 250 طالبًا كحد أقصى في العملية الواحدة." } };
        }
        const preview = await buildImportPreview(container, students);
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
        const classroom = await getClassroom(container, classId);
        if (!classroom || classroom.active === false) {
          return { status: 400, jsonBody: { ok: false, error: "الصف غير موجود أو مؤرشف." } };
        }

        const students = normalizeBulkStudents(body?.students ?? body?.data);
        if (!students.length) {
          return { status: 400, jsonBody: { ok: false, error: "ملف JSON لا يحتوي بيانات طلاب صالحة." } };
        }
        if (students.length > 250) {
          return { status: 400, jsonBody: { ok: false, error: "يمكن استيراد 250 طالبًا كحد أقصى في العملية الواحدة." } };
        }

        const credentials = [];
        const errors = [];

        for (const item of students) {
          try {
            const result = await createStudentRecord(container, classroom, item, { forceGeneratedPassword: true });
            credentials.push({
              userId: result.student.userId,
              firstName: result.student.firstName,
              familyName: result.student.familyName,
              displayName: result.student.displayName,
              identityNumber: result.student.identityNumber,
              code: result.student.code,
              password: result.temporaryPassword
            });
          } catch (error) {
            errors.push({
              index: item.index,
              firstName: item.firstName,
              familyName: item.familyName,
              identityNumber: item.identityNumber,
              displayName: [item.firstName, item.familyName].filter(Boolean).join(" "),
              code: item.identityNumber || "",
              error: error instanceof Error ? error.message : "تعذر إنشاء الطالب."
            });
          }
        }

        await saveClassroom(container, classroom);
        return {
          status: 200,
          jsonBody: {
            ok: true,
            imported: credentials.length,
            failed: errors.length,
            credentials,
            errors
          }
        };
      }

      if (action === "update") {
        const userId = String(body?.userId || "").trim();
        const studentBlobName = USER_PREFIX + userId + ".json";
        const student = await downloadJsonOrNull(container, studentBlobName);

        if (!student || student.role !== "student") {
          return { status: 404, jsonBody: { ok: false, error: "الطالب غير موجود." } };
        }

        const currentNames = getStudentNames(student);
        const firstName = String(body?.firstName ?? currentNames.firstName ?? "").trim();
        const familyName = String(body?.familyName ?? currentNames.familyName ?? "").trim();
        const identityNumber = normalizeIdentityNumber(
          body?.identityNumber ??
          body?.code ??
          student.identityNumber ??
          (/^\d{9}$/.test(String(student.code || "")) ? student.code : "")
        );
        const newCode = identityNumber;
        const newClassId = String(body?.classId ?? student.classId ?? "").trim();
        const newPassword = String(body?.password || "");

        if (!firstName || !familyName) {
          return { status: 400, jsonBody: { ok: false, error: "يجب إدخال الاسم الشخصي واسم العائلة." } };
        }
        if (!isValidIdentityNumber(identityNumber)) {
          return { status: 400, jsonBody: { ok: false, error: "رقم الهوية يجب أن يتكوّن من 9 أرقام." } };
        }
        if (!newClassId) return { status: 400, jsonBody: { ok: false, error: "اختر الصف." } };
        if (newPassword && newPassword.length < 6) {
          return { status: 400, jsonBody: { ok: false, error: "كلمة المرور الجديدة يجب أن تحتوي على 6 محارف على الأقل." } };
        }

        const newClassroom = await getClassroom(container, newClassId);
        if (!newClassroom || newClassroom.active === false) {
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
          const curAuthName = AUTH_PREFIX + studentCodeHash(curCode) + ".json";
          const curAuth = await downloadJsonOrNull(container, curAuthName);
          if (!curAuth) return { status: 404, jsonBody: { ok: false, error: "ملف دخول الطالب غير موجود." } };
          const authActive = cur.active !== false && cur.archived !== true;
          const targetAuthName = AUTH_PREFIX + studentCodeHash(newCode) + ".json";

          await mutateJsonWithRetry(container, studentBlobName, c => {
            if (!c || c.role !== "student") throw new Error("الطالب غير موجود.");
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

          if (targetAuthName === curAuthName) {
            await mutateJsonWithRetry(container, curAuthName, c => {
              if (!c) throw new Error("ملف دخول الطالب غير موجود.");
              if (newPwHash) {
                if (normalizeAuthVersion(c.authVersion) <= updatedStudentVersion) {
                  c.salt = newPwHash.salt; c.passwordHash = newPwHash.passwordHash; c.authVersion = updatedStudentVersion; credentialApplied = true;
                } else { credentialApplied = false; } // a newer reset already won → stale
              }
              c.schemaVersion = 3; c.codeHash = studentCodeHash(newCode); c.active = authActive; c.updatedAt = new Date().toISOString();
              return c;
            });
          } else {
            // RENAME: build the new auth doc from the CURRENT auth (re-read inside the lock, so it carries
            // any newer reset's hash/version), create-only at the new path, then delete the old path.
            const newAuthDoc = {
              ...curAuth,
              schemaVersion: 3,
              codeHash: studentCodeHash(newCode),
              active: authActive,
              authVersion: Math.max(normalizeAuthVersion(curAuth.authVersion), normalizeAuthVersion(updatedStudentVersion)),
              updatedAt: new Date().toISOString()
            };
            if (newPwHash) { newAuthDoc.salt = newPwHash.salt; newAuthDoc.passwordHash = newPwHash.passwordHash; }
            try {
              await uploadJsonConditional(container, targetAuthName, newAuthDoc, null);
            } catch (e) {
              if (isConcurrencyConflict(e)) return { status: 409, jsonBody: { ok: false, error: "رقم الهوية مستخدم مسبقًا." } };
              throw e;
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

        if (oldClassId !== newClassId) {
          await mutateClassroomStudentIds(container, oldClassId, classroom => {
            classroom.studentIds = ensureStudentIds(classroom).filter(id => id !== userId);
          });
          if (student.archived !== true) {
            await mutateClassroomStudentIds(container, newClassId, classroom => {
              const ids = ensureStudentIds(classroom);
              if (!ids.includes(userId)) ids.push(userId);
            });
          }
        }

        // §1: a stale password change (a newer reset already owns the version) must NOT report success —
        // no overwrite happened, so return a deterministic 409 with a generic retry message and emit no
        // reset-password audit and no passwordChanged:true.
        if (newPassword && !credentialApplied) {
          return { status: 409, headers: { "Cache-Control": "no-store" }, jsonBody: { ok: false, error: "تعذّر تغيير كلمة المرور بسبب تعارض مع عملية أحدث. أعد المحاولة." } };
        }
        const updatedStudent = await downloadJsonOrNull(container, studentBlobName);
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
          jsonBody: { ok: true, student: publicStudent(updatedStudent || student), passwordChanged: !!newPassword }
        };
      }

      if (["resetpassword", "toggleactive", "archive", "unarchive", "delete"].includes(action)) {
        const userId = String(body?.userId || "").trim();
        const student = await downloadJsonOrNull(container, USER_PREFIX + userId + ".json");
        if (!student || student.role !== "student") {
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
          const active = !(student.active !== false);
          await changeStudentActive(container, student, active);
          return { status: 200, jsonBody: { ok: true, active } };
        }
        if (action === "archive") {
          await archiveStudent(container, student);
          return { status: 200, jsonBody: { ok: true, archived: true } };
        }
        if (action === "unarchive") {
          await unarchiveStudent(container, student);
          return { status: 200, jsonBody: { ok: true, archived: false, active: true } };
        }

        await deleteStudent(container, student);
        await rec(container, {
          actor: auth.user?.sub,
          action: "student.delete",
          targetType: "student",
          targetId: student.userId,
          targetLabel: student.displayName || student.code
        });
        return { status: 200, jsonBody: { ok: true, deleted: true } };
      }

      if (action === "bulkaction") {
        const operation = String(body?.operation || "").trim().toLowerCase();
        const userIds = Array.from(new Set(
          (Array.isArray(body?.userIds) ? body.userIds : [])
            .map(x => String(x || "").trim())
            .filter(Boolean)
        )).slice(0, 250);

        if (!userIds.length) {
          return { status: 400, jsonBody: { ok: false, error: "اختر طالبًا واحدًا على الأقل." } };
        }

        const supported = ["activate", "deactivate", "archive", "unarchive", "move", "resetpasswords", "delete"];
        if (!supported.includes(operation)) {
          return { status: 400, jsonBody: { ok: false, error: "العملية الجماعية غير مدعومة." } };
        }

        const targetClassId = String(body?.targetClassId || "").trim();
        if (operation === "move" && !targetClassId) {
          return { status: 400, jsonBody: { ok: false, error: "اختر الصف الهدف." } };
        }

        const results = [];
        const errors = [];
        const credentials = [];

        for (const userId of userIds) {
          try {
            const student = await downloadJsonOrNull(container, USER_PREFIX + userId + ".json");
            if (!student || student.role !== "student") throw new Error("الطالب غير موجود.");

            if (operation === "activate") await changeStudentActive(container, student, true);
            else if (operation === "deactivate") await changeStudentActive(container, student, false);
            else if (operation === "archive") await archiveStudent(container, student);
            else if (operation === "unarchive") await unarchiveStudent(container, student);
            else if (operation === "move") await moveStudent(container, student, targetClassId);
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
              await deleteStudent(container, student);
              await rec(container, {
                actor: auth.user?.sub,
                action: "student.delete",
                targetType: "student",
                targetId: userId,
                targetLabel: student.displayName || student.code,
                details: { bulk: true }
              });
            }

            results.push(userId);
          } catch (error) {
            errors.push({
              userId,
              error: error instanceof Error ? error.message : "تعذر تنفيذ العملية."
            });
          }
        }

        return {
          status: 200,
          jsonBody: {
            ok: true,
            processed: results.length,
            failed: errors.length,
            results,
            errors,
            credentials
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
        return { status: 409, headers: { "Cache-Control": "no-store" }, jsonBody: { ok: false, error: "عملية أخرى على بيانات الطالب قيد التنفيذ. أعد المحاولة." } };
      }
      return {
        status: 500,
        jsonBody: {
          ok: false,
          error: "تعذر تنفيذ إجراء الطالب حاليًا."
        }
      };
    }
}
app.http("manageStudents", { methods: ["GET", "POST"], authLevel: "anonymous", route: "students", handler: manageStudentsHandler });

// Roadmap #8 — exported for unit tests (authVersion on create / password reset / update). Additive.
module.exports = { createStudentRecord, resetStudentPassword, handler: manageStudentsHandler };
