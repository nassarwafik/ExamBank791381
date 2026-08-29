const { app } = require("@azure/functions");
const { BlobServiceClient } = require("@azure/storage-blob");
const crypto = require("crypto");
const { requireBuilderAuth } = require("../lib/builder-auth");
const {
  normalizeStudentCode,
  isValidStudentCode,
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

function publicStudent(document) {
  return {
    userId: String(document.userId || ""),
    code: String(document.code || ""),
    displayName: String(document.displayName || ""),
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
  result.sort((a, b) => String(a.displayName).localeCompare(String(b.displayName), "ar"));
  return result;
}

async function codeExists(container, code, exceptUserId = "") {
  const auth = await downloadJsonOrNull(container, AUTH_PREFIX + studentCodeHash(code) + ".json");
  return !!(auth && String(auth.userId || "") !== exceptUserId);
}

async function generateUniqueStudentCode(container) {
  for (let i = 0; i < 40; i += 1) {
    const code = "S" + String(crypto.randomInt(100000, 1000000));
    if (!(await codeExists(container, code))) return code;
  }
  throw new Error("تعذر توليد كود فريد للطالب. حاول مرة أخرى.");
}

async function createStudentRecord(container, classroom, input, options = {}) {
  const displayName = String(input?.displayName ?? input?.name ?? "").trim();
  let code = normalizeStudentCode(input?.code);
  if (!code && options.generateCode) code = await generateUniqueStudentCode(container);
  if (!displayName || !isValidStudentCode(code)) {
    throw new Error("أدخل اسمًا صحيحًا وكود طالب مكوّنًا من أحرف/أرقام إنجليزية.");
  }
  if (await codeExists(container, code)) throw new Error("كود الطالب مستخدم مسبقًا: " + code);

  const password = options.forceGeneratedPassword
    ? generateTemporaryPassword()
    : String(input?.password || "") || generateTemporaryPassword();
  if (password.length < 6) throw new Error("كلمة المرور يجب أن تحتوي على 6 محارف على الأقل.");

  const { salt, passwordHash } = hashPassword(password);
  const userId = crypto.randomUUID();
  const now = new Date().toISOString();
  const student = {
    schemaVersion: 1,
    role: "student",
    userId,
    code,
    displayName,
    classId: classroom.classId,
    active: true,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: ""
  };
  const authDocument = {
    schemaVersion: 1,
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
    if (typeof item === "string") return { displayName: item };
    return {
      displayName: String(item?.displayName ?? item?.name ?? item?.studentName ?? "").trim(),
      code: String(item?.code ?? item?.studentCode ?? "").trim()
    };
  }).filter(item => item.displayName);
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
        return { status: 200, jsonBody: { ok: true, students: await listStudents(container, classId) } };
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
        const result = await createStudentRecord(container, classroom, body, { generateCode: false, forceGeneratedPassword: false });
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
          return { status: 400, jsonBody: { ok: false, error: "ملف JSON لا يحتوي أسماء طلاب صالحة." } };
        }
        if (students.length > 250) {
          return { status: 400, jsonBody: { ok: false, error: "يمكن استيراد 250 طالبًا كحد أقصى في العملية الواحدة." } };
        }

        const credentials = [];
        const errors = [];
        for (let index = 0; index < students.length; index += 1) {
          const item = students[index];
          try {
            const result = await createStudentRecord(container, classroom, item, {
              generateCode: !String(item.code || "").trim(),
              forceGeneratedPassword: true
            });
            credentials.push({
              userId: result.student.userId,
              displayName: result.student.displayName,
              code: result.student.code,
              password: result.temporaryPassword
            });
          } catch (error) {
            errors.push({
              index,
              displayName: item.displayName,
              code: item.code || "",
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

        const newName = String(body?.displayName ?? student.displayName ?? "").trim();
        const newCode = normalizeStudentCode(body?.code ?? student.code);
        const newClassId = String(body?.classId ?? student.classId ?? "").trim();
        const newPassword = String(body?.password || "");
        if (!newName || !isValidStudentCode(newCode) || !newClassId) {
          return { status: 400, jsonBody: { ok: false, error: "تأكد من الاسم، الكود والصف." } };
        }
        if (newPassword && newPassword.length < 6) {
          return { status: 400, jsonBody: { ok: false, error: "كلمة المرور الجديدة يجب أن تحتوي على 6 محارف على الأقل." } };
        }
        const newClassroom = await getClassroom(container, newClassId);
        if (!newClassroom || newClassroom.active === false) {
          return { status: 400, jsonBody: { ok: false, error: "الصف الجديد غير موجود أو مؤرشف." } };
        }
        if (newCode !== student.code && await codeExists(container, newCode, userId)) {
          return { status: 409, jsonBody: { ok: false, error: "كود الطالب مستخدم مسبقًا." } };
        }

        const oldCode = student.code;
        const oldClassId = student.classId;
        const oldAuthName = AUTH_PREFIX + studentCodeHash(oldCode) + ".json";
        const oldAuth = await downloadJsonOrNull(container, oldAuthName);
        if (!oldAuth) {
          return { status: 404, jsonBody: { ok: false, error: "ملف دخول الطالب غير موجود." } };
        }

        student.displayName = newName;
        student.code = newCode;
        student.classId = newClassId;
        student.updatedAt = new Date().toISOString();

        if (newPassword) {
          const { salt, passwordHash } = hashPassword(newPassword);
          oldAuth.salt = salt;
          oldAuth.passwordHash = passwordHash;
        }
        oldAuth.codeHash = studentCodeHash(newCode);
        oldAuth.active = student.active !== false;
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
          const ids = ensureStudentIds(newClassroom);
          if (!ids.includes(userId)) ids.push(userId);
          await saveClassroom(container, newClassroom);
        }

        return {
          status: 200,
          jsonBody: { ok: true, student: publicStudent(student), passwordChanged: !!newPassword }
        };
      }

      if (action === "resetpassword") {
        const userId = String(body?.userId || "").trim();
        const student = await downloadJsonOrNull(container, USER_PREFIX + userId + ".json");
        if (!student) return { status: 404, jsonBody: { ok: false, error: "الطالب غير موجود." } };
        const temporaryPassword = String(body?.password || "") || generateTemporaryPassword();
        if (temporaryPassword.length < 6) {
          return { status: 400, jsonBody: { ok: false, error: "كلمة المرور يجب أن تحتوي على 6 محارف على الأقل." } };
        }
        const { salt, passwordHash } = hashPassword(temporaryPassword);
        const authBlobName = AUTH_PREFIX + studentCodeHash(student.code) + ".json";
        const authDocument = await downloadJsonOrNull(container, authBlobName);
        if (!authDocument) return { status: 404, jsonBody: { ok: false, error: "ملف دخول الطالب غير موجود." } };
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
        if (!student) return { status: 404, jsonBody: { ok: false, error: "الطالب غير موجود." } };
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
        return { status: 200, jsonBody: { ok: true, active: student.active } };
      }

      return { status: 400, jsonBody: { ok: false, error: "Unsupported student action." } };
    } catch (error) {
      return {
        status: 500,
        jsonBody: { ok: false, error: error instanceof Error ? error.message : "Student action failed." }
      };
    }
  }
});
