const { app } = require("@azure/functions");
const { BlobServiceClient } = require("@azure/storage-blob");
const crypto = require("crypto");
const { requireBuilderAuth } = require("../lib/builder-auth");
const {
  studentCodeHash,
  hashPassword,
  generateTemporaryPassword
} = require("../lib/student-auth");

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
  return result;
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
  const auth = await downloadJsonOrNull(container, name);
  if (!auth) return;
  auth.active = active;
  auth.updatedAt = new Date().toISOString();
  await uploadJson(container, name, auth);
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
    createdAt: now,
    updatedAt: now
  };

  await uploadJson(container, USER_PREFIX + userId + ".json", student);
  await uploadJson(container, AUTH_PREFIX + studentCodeHash(code) + ".json", authDocument);
  const ids = ensureStudentIds(classroom);
  if (!ids.includes(userId)) ids.push(userId);

  return { student: publicStudent(student), temporaryPassword: password };
}

async function resetStudentPassword(container, student, requestedPassword = "") {
  const temporaryPassword = String(requestedPassword || "") || generateTemporaryPassword();
  if (temporaryPassword.length < 6) throw new Error("كلمة المرور يجب أن تحتوي على 6 محارف على الأقل.");

  const code = String(student.code || student.identityNumber || "");
  const authBlobName = AUTH_PREFIX + studentCodeHash(code) + ".json";
  const authDocument = await downloadJsonOrNull(container, authBlobName);
  if (!authDocument) throw new Error("ملف دخول الطالب غير موجود.");

  const { salt, passwordHash } = hashPassword(temporaryPassword);
  authDocument.salt = salt;
  authDocument.passwordHash = passwordHash;
  authDocument.updatedAt = new Date().toISOString();
  await uploadJson(container, authBlobName, authDocument);
  return temporaryPassword;
}

async function changeStudentActive(container, student, active) {
  if (student.archived === true && active) throw new Error("استعد الطالب من الأرشيف أولًا.");
  student.active = !!active;
  student.updatedAt = new Date().toISOString();
  await uploadJson(container, USER_PREFIX + student.userId + ".json", student);
  await setAuthActive(container, student, !!active);
}

async function archiveStudent(container, student) {
  if (student.archived === true) return;
  student.archived = true;
  student.active = false;
  student.archivedAt = new Date().toISOString();
  student.updatedAt = student.archivedAt;
  await uploadJson(container, USER_PREFIX + student.userId + ".json", student);
  await setAuthActive(container, student, false);

  const classroom = await getClassroom(container, String(student.classId || ""));
  if (classroom) {
    classroom.studentIds = ensureStudentIds(classroom).filter(id => id !== student.userId);
    await saveClassroom(container, classroom);
  }
}

async function unarchiveStudent(container, student) {
  if (student.archived !== true) return;
  const classroom = await getClassroom(container, String(student.classId || ""));
  if (!classroom || classroom.active === false) throw new Error("فعّل الصف قبل استعادة الطالب.");

  student.archived = false;
  student.active = true;
  student.archivedAt = "";
  student.updatedAt = new Date().toISOString();
  await uploadJson(container, USER_PREFIX + student.userId + ".json", student);
  await setAuthActive(container, student, true);

  const ids = ensureStudentIds(classroom);
  if (!ids.includes(student.userId)) ids.push(student.userId);
  await saveClassroom(container, classroom);
}

async function moveStudent(container, student, targetClassId) {
  const target = await getClassroom(container, targetClassId);
  if (!target || target.active === false) throw new Error("الصف الهدف غير موجود أو مؤرشف.");

  const oldClassId = String(student.classId || "");
  if (oldClassId === targetClassId) return;

  const oldClass = await getClassroom(container, oldClassId);
  if (oldClass) {
    oldClass.studentIds = ensureStudentIds(oldClass).filter(id => id !== student.userId);
    await saveClassroom(container, oldClass);
  }

  student.classId = targetClassId;
  student.updatedAt = new Date().toISOString();
  await uploadJson(container, USER_PREFIX + student.userId + ".json", student);

  if (student.archived !== true) {
    const ids = ensureStudentIds(target);
    if (!ids.includes(student.userId)) ids.push(student.userId);
    await saveClassroom(container, target);
  }
}

async function deleteStudent(container, student) {
  const classroom = await getClassroom(container, String(student.classId || ""));
  if (classroom) {
    classroom.studentIds = ensureStudentIds(classroom).filter(id => id !== student.userId);
    await saveClassroom(container, classroom);
  }

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
  const assignments = (await listJson(container, ASSIGNMENT_PREFIX))
    .filter(a => String(a.classId || "") === String(student.classId || ""))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  const history = [];
  let completed = 0;
  let percentageSum = 0;

  for (const assignment of assignments) {
    const submission = await downloadJsonOrNull(
      container,
      SUBMISSION_PREFIX + assignment.assignmentId + "/" + student.userId + ".json"
    );
    const attempts = Array.isArray(submission?.attempts) ? submission.attempts : [];
    const latest = attempts.length ? attempts[attempts.length - 1] : null;

    if (latest) {
      completed += 1;
      percentageSum += Number(latest.percentage || 0);
    }

    history.push({
      assignmentId: String(assignment.assignmentId || ""),
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

  return {
    student: publicStudent(student),
    classroom: classroom ? {
      classId: String(classroom.classId || ""),
      name: String(classroom.name || ""),
      grade: String(classroom.grade || ""),
      schoolYear: String(classroom.schoolYear || "")
    } : null,
    stats: {
      assigned: assignments.length,
      completed,
      pending: Math.max(0, assignments.length - completed),
      average: completed ? Number((percentageSum / completed).toFixed(1)) : null,
      lastLoginAt: String(student.lastLoginAt || "")
    },
    assignments: history
  };
}

app.http("manageStudents", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  route: "students",
  handler: async request => {
    try {
      const auth = requireBuilderAuth(request);
      if (!auth.ok) return auth.response;
      const container = getContainer();

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
        await saveClassroom(container, classroom);
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
        const oldAuthName = AUTH_PREFIX + studentCodeHash(oldCode) + ".json";
        const oldAuth = await downloadJsonOrNull(container, oldAuthName);
        if (!oldAuth) {
          return { status: 404, jsonBody: { ok: false, error: "ملف دخول الطالب غير موجود." } };
        }

        student.schemaVersion = 3;
        student.firstName = firstName;
        student.familyName = familyName;
        student.displayName = firstName + " " + familyName;
        student.identityNumber = identityNumber;
        student.code = newCode;
        student.classId = newClassId;
        student.updatedAt = new Date().toISOString();

        if (newPassword) {
          const { salt, passwordHash } = hashPassword(newPassword);
          oldAuth.salt = salt;
          oldAuth.passwordHash = passwordHash;
        }

        oldAuth.schemaVersion = 3;
        oldAuth.codeHash = studentCodeHash(newCode);
        oldAuth.active = student.active !== false && student.archived !== true;
        oldAuth.updatedAt = new Date().toISOString();

        await uploadJson(container, studentBlobName, student);
        const newAuthName = AUTH_PREFIX + studentCodeHash(newCode) + ".json";
        await uploadJson(container, newAuthName, oldAuth);
        if (newAuthName !== oldAuthName) await container.getBlobClient(oldAuthName).deleteIfExists();

        if (oldClassId !== newClassId) {
          const oldClassroom = await getClassroom(container, oldClassId);
          if (oldClassroom) {
            oldClassroom.studentIds = ensureStudentIds(oldClassroom).filter(id => id !== userId);
            await saveClassroom(container, oldClassroom);
          }
          if (student.archived !== true) {
            const ids = ensureStudentIds(newClassroom);
            if (!ids.includes(userId)) ids.push(userId);
            await saveClassroom(container, newClassroom);
          }
        }

        return {
          status: 200,
          jsonBody: { ok: true, student: publicStudent(student), passwordChanged: !!newPassword }
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
          return { status: 200, jsonBody: { ok: true, temporaryPassword } };
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
            } else if (operation === "delete") await deleteStudent(container, student);

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
    } catch (error) {
      return {
        status: 500,
        jsonBody: {
          ok: false,
          error: error instanceof Error ? error.message : "Student action failed."
        }
      };
    }
  }
});
