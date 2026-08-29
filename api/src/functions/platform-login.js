const { app } = require("@azure/functions");
const { BlobServiceClient } = require("@azure/storage-blob");
const {
  TOKEN_TTL_SECONDS,
  createBuilderToken,
  validateBuilderCredentials
} = require("../lib/builder-auth");
const {
  STUDENT_TOKEN_TTL_SECONDS,
  normalizeStudentCode,
  studentCodeHash,
  verifyPassword,
  createStudentToken
} = require("../lib/student-auth");

const BANK_CONTAINER = "bank";

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

app.http("platformLogin", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "platform-login",
  handler: async request => {
    try {
      let body = {};
      try { body = await request.json(); } catch { body = {}; }

      const userCode = String(body?.userCode || "").trim();
      const password = String(body?.password || "");
      if (!userCode || !password) {
        return {
          status: 400,
          jsonBody: { ok: false, error: "كود المستخدم / رقم الهوية وكلمة المرور مطلوبان." }
        };
      }

      let isTeacher = false;
      try { isTeacher = validateBuilderCredentials(userCode, password); } catch { isTeacher = false; }

      if (isTeacher) {
        const token = createBuilderToken(userCode);
        return {
          status: 200,
          jsonBody: {
            ok: true,
            role: "teacher",
            token,
            userCode,
            displayName: "المعلم",
            expiresInSeconds: TOKEN_TTL_SECONDS
          }
        };
      }

      const normalizedCode = normalizeStudentCode(userCode);
      const container = getContainer();
      const authDocument = await downloadJsonOrNull(
        container,
        "platform/auth/" + studentCodeHash(normalizedCode) + ".json"
      );

      if (
        !authDocument ||
        authDocument.active === false ||
        !verifyPassword(password, authDocument.salt, authDocument.passwordHash)
      ) {
        return { status: 401, jsonBody: { ok: false, error: "بيانات الدخول غير صحيحة." } };
      }

      const studentBlobName = "platform/users/" + authDocument.userId + ".json";
      const student = await downloadJsonOrNull(container, studentBlobName);
      if (!student || student.active === false || student.archived === true) {
        return { status: 401, jsonBody: { ok: false, error: "الحساب غير فعّال." } };
      }

      const now = new Date().toISOString();
      student.lastLoginAt = now;
      student.updatedAt = now;
      await uploadJson(container, studentBlobName, student);

      const token = createStudentToken(student);
      return {
        status: 200,
        jsonBody: {
          ok: true,
          role: "student",
          token,
          userCode: student.code,
          displayName: student.displayName,
          expiresInSeconds: STUDENT_TOKEN_TTL_SECONDS
        }
      };
    } catch (error) {
      return {
        status: 500,
        jsonBody: {
          ok: false,
          error: error instanceof Error ? error.message : "Platform login failed."
        }
      };
    }
  }
});
