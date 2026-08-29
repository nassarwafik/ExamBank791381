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
  return {
    firstName: parts.shift() || "",
    familyName: parts.join(" ")
  };
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
    createdAt: String(document.createdAt || ""),
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

async function listStudents(container, classId) {
  const result = [];
  for await (const blob of container.listBlobsFlat({ prefix: USER_PREFIX })) {
    if (!blob.name.endsWith(".json")) continue;
    const student = await downloadJsonOrNull(container, blob.name);
    if (!student || student.role !== "student") continue;
    if (classId && String(student.classId || "") !== classId) continue;
    result.push(publicStudent(student));
  }
  result.sort((a, b) => {
    const family = String(a.familyName).localeCompare(String(b.familyName), "ar");
    return family || String(a.firstName).localeCompare(String(b.firstName), "ar");
  });
  return result;
}

async function codeExists(container, code, exceptUserId = "") {
  const auth = await downloadJsonOrNull(container, AUTH_PREFIX + studentCodeHash(code) + ".json");
  return !!(auth && String(auth.userId || "") !== exceptUserId);
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

async function createStudentRecord(container, classroom, input, options = {}) {
  const { firstName, familyName } = namesFromInput(input);
  const identityNumber = identityFromInput(input);
  const code = identityNumber;

  if (!firstName || !familyName) {
    throw new Error("يجب إدخال الاسم الشخصي واسم العائلة.");
  }
  if (!isValidIdentityNumber(identityNumber)) {
    throw new Error("رقم الهوية يجب أن يتكوّن من 9 أرقام.");
  }
  if (await codeExists(container, code)) {
    throw new Error("رقم الهوية مستخدم مسبقًا: " + identityNumber);
  }

  const password = options.forceGeneratedPassword
    ? generateTemporaryPassword()
    : String(input?.password || "") || generateTemporaryPassword();

  if (password.length < 6) {
    throw new Error("كلمة المرور يجب أن تحتوي على 6 محارف على الأقل.");
  }

  const { salt, passwordHash } = hashPassword(password);
  const userId = crypto.randomUUID();
  const now = new Date().toISOString();
  const displayName = firstName + " " + familyName;

  const student = {
    schemaVersion: 2,
    role: "student",
    userId,
    code,
    identityNumber,
    firstName,
    familyName,
    displayName,
    classId: classroom.classId,
    active: true,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: ""
  };

  const authDocument = {
    schemaVersion: 2,
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

function normalizeBulkStudents(value) {
  const raw = Array.isArray(value) ? value : Array.isArray(value?.students) ? value.students : [];
  return raw.map(item => {
    if (typeof item === "string") {
      const names = splitLegacyName(item);
      return { ...names, identityNumber: "" };
    }
    const names = namesFromInput(item);
    return {
      firstName: names.firstName,
      familyName: names.familyName,
      identityNumber: identityFromInput(item)
    };
  }).filter(item => item.firstName || item.familyName || item.identityNumber);
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
        const classId = String(url.searchParams.get("classId") || "").trim();
        return {
          status: 200,
          jsonBody: { ok: true, students: await listStudents(container, classId) }
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

        const result = await createStudentRecord(container, classroom, body, {
          forceGeneratedPassword: false
        });

        await saveClassroom(container, classroom);
        return { status: 200, jsonBody: { ok: true, ...result } };
      }

      if (action === "bulkimport") {
        const classId = String(body?.classId || "").trim();
        const classroom = await getClassroom(container, classId);
        if (!classroom || classroom.active === false) {
          return { status: 400, jsonBody: { ok: false, error: "الصف غير موجود أو مؤرشف." } };
        }

        const students = normalizeBulkStudents(body?.students ?? body?.data);
        if (!students.length) {
          return {
            status: 400,
            jsonBody: { ok: false, error: "ملف JSON لا يحتوي بيانات طلاب صالحة." }
          };
        }
        if (students.length > 250) {
          return {
            status: 400,
            jsonBody: { ok: false, error: "يمكن استيراد 250 طالبًا كحد أقصى في العملية الواحدة." }
          };
        }

        const credentials = [];
        const errors = [];

        for (let index = 0; index < students.length; index += 1) {
          const item = students[index];
          try {
            const result = await createStudentRecord(container, classroom, item, {
              forceGeneratedPassword: true
            });
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
              index,
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
          return {
            status: 400,
            jsonBody: { ok: false, error: "يجب إدخال الاسم الشخصي واسم العائلة." }
          };
        }
        if (!isValidIdentityNumber(identityNumber)) {
          return {
            status: 400,
            jsonBody: { ok: false, error: "رقم الهوية يجب أن يتكوّن من 9 أرقام." }
          };
        }
        if (!newClassId) {
          return { status: 400, jsonBody: { ok: false, error: "اختر الصف." } };
        }
        if (newPassword && newPassword.length < 6) {
          return {
            status: 400,
            jsonBody: { ok: false, error: "كلمة المرور الجديدة يجب أن تحتوي على 6 محارف على الأقل." }
          };
        }

        const newClassroom = await getClassroom(container, newClassId);
        if (!newClassroom || newClassroom.active === false) {
          return {
            status: 400,
            jsonBody: { ok: false, error: "الصف الجديد غير موجود أو مؤرشف." }
          };
        }

        const oldCode = String(student.code || "");
        if (newCode !== oldCode && await codeExists(container, newCode, userId)) {
          return {
            status: 409,
            jsonBody: { ok: false, error: "رقم الهوية مستخدم مسبقًا." }
          };
        }

        const oldClassId = String(student.classId || "");
        const oldAuthName = AUTH_PREFIX + studentCodeHash(oldCode) + ".json";
        const oldAuth = await downloadJsonOrNull(container, oldAuthName);

        if (!oldAuth) {
          return {
            status: 404,
            jsonBody: { ok: false, error: "ملف دخول الطالب غير موجود." }
          };
        }

        student.schemaVersion = 2;
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

        oldAuth.schemaVersion = 2;
        oldAuth.codeHash = studentCodeHash(newCode);
        oldAuth.active = student.active !== false;
        oldAuth.updatedAt = new Date().toISOString();

        await uploadJson(container, studentBlobName, student);

        const newAuthName = AUTH_PREFIX + studentCodeHash(newCode) + ".json";
        await uploadJson(container, newAuthName, oldAuth);
        if (newAuthName !== oldAuthName) {
          await container.getBlobClient(oldAuthName).deleteIfExists();
        }

        if (oldClassId !== newClassId) {
          const oldClassroom = await getClassroom(container, oldClassId);
          if (oldClassroom) {
            oldClassroom.studentIds = ensureStudentIds(oldClassroom).filter(id => id !== userId);
            await saveClassroom(container, oldClassroom);
          }
          const ids = ensureStudentIds(newClassroom);
          if (!ids.includes(userId)) ids.push(userId);
          await saveClassroom(container, newClassroom);
        }

        return {
          status: 200,
          jsonBody: {
            ok: true,
            student: publicStudent(student),
            passwordChanged: !!newPassword
          }
        };
      }

      if (action === "resetpassword") {
        const userId = String(body?.userId || "").trim();
        const student = await downloadJsonOrNull(container, USER_PREFIX + userId + ".json");

        if (!student) {
          return { status: 404, jsonBody: { ok: false, error: "الطالب غير موجود." } };
        }

        const temporaryPassword = String(body?.password || "") || generateTemporaryPassword();
        if (temporaryPassword.length < 6) {
          return {
            status: 400,
            jsonBody: { ok: false, error: "كلمة المرور يجب أن تحتوي على 6 محارف على الأقل." }
          };
        }

        const { salt, passwordHash } = hashPassword(temporaryPassword);
        const authBlobName = AUTH_PREFIX + studentCodeHash(student.code) + ".json";
        const authDocument = await downloadJsonOrNull(container, authBlobName);

        if (!authDocument) {
          return {
            status: 404,
            jsonBody: { ok: false, error: "ملف دخول الطالب غير موجود." }
          };
        }

        authDocument.salt = salt;
        authDocument.passwordHash = passwordHash;
        authDocument.updatedAt = new Date().toISOString();

        await uploadJson(container, authBlobName, authDocument);
        return { status: 200, jsonBody: { ok: true, temporaryPassword } };
      }

      if (action === "toggleactive") {
        const userId = String(body?.userId || "").trim();
        const studentBlobName = USER_PREFIX + userId + ".json";
        const student = await downloadJsonOrNull(container, studentBlobName);

        if (!student) {
          return { status: 404, jsonBody: { ok: false, error: "الطالب غير موجود." } };
        }

        student.active = !(student.active !== false);
        student.updatedAt = new Date().toISOString();
        await uploadJson(container, studentBlobName, student);

        const authBlobName = AUTH_PREFIX + studentCodeHash(student.code) + ".json";
        const authDocument = await downloadJsonOrNull(container, authBlobName);

        if (authDocument) {
          authDocument.active = student.active;
          authDocument.updatedAt = new Date().toISOString();
          await uploadJson(container, authBlobName, authDocument);
        }

        return {
          status: 200,
          jsonBody: { ok: true, active: student.active }
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
