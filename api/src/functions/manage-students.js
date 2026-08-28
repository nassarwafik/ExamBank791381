
const { app } =
  require("@azure/functions");

const {
  BlobServiceClient
} =
  require("@azure/storage-blob");

const crypto =
  require("crypto");

const {
  requireBuilderAuth
} =
  require("../lib/builder-auth");

const {
  normalizeStudentCode,
  isValidStudentCode,
  studentCodeHash,
  hashPassword,
  generateTemporaryPassword
} =
  require("../lib/student-auth");

const BANK_CONTAINER =
  "bank";

const USER_PREFIX =
  "platform/users/";

const AUTH_PREFIX =
  "platform/auth/";

const CLASS_PREFIX =
  "platform/classes/";

async function streamToBuffer(
  stream
) {
  const chunks = [];

  for await (
    const chunk
    of stream
  ) {
    chunks.push(
      Buffer.from(
        chunk
      )
    );
  }

  return Buffer.concat(
    chunks
  );
}

function getContainer() {
  const connectionString =
    process.env
      .AZURE_STORAGE_CONNECTION_STRING;

  if (!connectionString) {
    throw new Error(
      "AZURE_STORAGE_CONNECTION_STRING is not configured."
    );
  }

  return BlobServiceClient
    .fromConnectionString(
      connectionString
    )
    .getContainerClient(
      BANK_CONTAINER
    );
}

async function downloadJsonOrNull(
  container,
  blobName
) {
  try {
    const response =
      await container
        .getBlobClient(
          blobName
        )
        .download();

    if (
      !response
        .readableStreamBody
    ) {
      return null;
    }

    const buffer =
      await streamToBuffer(
        response
          .readableStreamBody
      );

    return JSON.parse(
      buffer.toString(
        "utf8"
      )
    );
  }
  catch (error) {
    if (
      error?.statusCode ===
        404 ||
      error?.code ===
        "BlobNotFound"
    ) {
      return null;
    }

    throw error;
  }
}

async function uploadJson(
  container,
  blobName,
  document
) {
  const body =
    JSON.stringify(
      document,
      null,
      2
    );

  await container
    .getBlockBlobClient(
      blobName
    )
    .upload(
      body,
      Buffer.byteLength(
        body
      ),
      {
        overwrite: true,

        blobHTTPHeaders: {
          blobContentType:
            "application/json; charset=utf-8"
        }
      }
    );
}

function publicStudent(
  document
) {
  return {
    userId:
      String(
        document.userId ||
        ""
      ),

    code:
      String(
        document.code ||
        ""
      ),

    displayName:
      String(
        document.displayName ||
        ""
      ),

    classId:
      String(
        document.classId ||
        ""
      ),

    active:
      document.active !==
      false,

    createdAt:
      String(
        document.createdAt ||
        ""
      ),

    lastLoginAt:
      String(
        document.lastLoginAt ||
        ""
      )
  };
}

async function getClassroom(
  container,
  classId
) {
  if (!classId) {
    return null;
  }

  return downloadJsonOrNull(
    container,

    CLASS_PREFIX +
      classId +
      ".json"
  );
}

async function saveClassroom(
  container,
  classroom
) {
  classroom.updatedAt =
    new Date()
      .toISOString();

  await uploadJson(
    container,

    CLASS_PREFIX +
      classroom.classId +
      ".json",

    classroom
  );
}

async function listStudents(
  container,
  classId
) {
  const result = [];

  for await (
    const blob
    of container
      .listBlobsFlat({
        prefix:
          USER_PREFIX
      })
  ) {
    if (
      !blob.name
        .endsWith(
          ".json"
        )
    ) {
      continue;
    }

    const student =
      await downloadJsonOrNull(
        container,
        blob.name
      );

    if (
      !student ||
      student.role !==
        "student"
    ) {
      continue;
    }

    if (
      classId &&
      String(
        student.classId ||
        ""
      ) !==
        classId
    ) {
      continue;
    }

    result.push(
      publicStudent(
        student
      )
    );
  }

  result.sort(
    (left, right) =>
      String(
        left.displayName
      ).localeCompare(
        String(
          right.displayName
        ),
        "ar"
      )
  );

  return result;
}

app.http(
  "manageStudents",
  {
    methods: [
      "GET",
      "POST"
    ],

    authLevel:
      "anonymous",

    route:
      "students",

    handler:
      async request => {
        try {
          const auth =
            requireBuilderAuth(
              request
            );

          if (!auth.ok) {
            return auth.response;
          }

          const container =
            getContainer();

          if (
            request.method ===
            "GET"
          ) {
            const url =
              new URL(
                request.url
              );

            const classId =
              String(
                url.searchParams
                  .get(
                    "classId"
                  ) ||
                ""
              ).trim();

            return {
              status: 200,

              jsonBody: {
                ok: true,

                students:
                  await listStudents(
                    container,
                    classId
                  )
              }
            };
          }

          let body = {};

          try {
            body =
              await request.json();
          }
          catch {
            body = {};
          }

          const action =
            String(
              body?.action ||
              "create"
            )
              .trim()
              .toLowerCase();

          if (
            action ===
            "create"
          ) {
            const classId =
              String(
                body?.classId ||
                ""
              ).trim();

            const code =
              normalizeStudentCode(
                body?.code
              );

            const displayName =
              String(
                body?.displayName ||
                ""
              ).trim();

            const suppliedPassword =
              String(
                body?.password ||
                ""
              );

            if (
              !classId ||
              !displayName ||
              !isValidStudentCode(
                code
              )
            ) {
              return {
                status: 400,

                jsonBody: {
                  ok: false,
                  error:
                    "أدخل الاسم، الصف وكود طالب مكوّن من أحرف/أرقام إنجليزية."
                }
              };
            }

            const classroom =
              await getClassroom(
                container,
                classId
              );

            if (
              !classroom ||
              classroom.active ===
                false
            ) {
              return {
                status: 400,

                jsonBody: {
                  ok: false,
                  error:
                    "الصف غير موجود أو مؤرشف."
                }
              };
            }

            const authBlobName =
              AUTH_PREFIX +
              studentCodeHash(
                code
              ) +
              ".json";

            const existingAuth =
              await downloadJsonOrNull(
                container,
                authBlobName
              );

            if (existingAuth) {
              return {
                status: 409,

                jsonBody: {
                  ok: false,
                  error:
                    "كود الطالب مستخدم مسبقًا."
                }
              };
            }

            const temporaryPassword =
              suppliedPassword ||
              generateTemporaryPassword();

            if (
              temporaryPassword.length <
              6
            ) {
              return {
                status: 400,

                jsonBody: {
                  ok: false,
                  error:
                    "كلمة المرور يجب أن تحتوي على 6 محارف على الأقل."
                }
              };
            }

            const {
              salt,
              passwordHash
            } =
              hashPassword(
                temporaryPassword
              );

            const userId =
              crypto
                .randomUUID();

            const now =
              new Date()
                .toISOString();

            const student = {
              schemaVersion: 1,
              role: "student",
              userId,
              code,
              displayName,
              classId,
              active: true,
              createdAt:
                now,
              updatedAt:
                now,
              lastLoginAt:
                ""
            };

            const authDocument = {
              schemaVersion: 1,
              userId,
              codeHash:
                studentCodeHash(
                  code
                ),
              salt,
              passwordHash,
              active: true,
              createdAt:
                now,
              updatedAt:
                now
            };

            await uploadJson(
              container,

              USER_PREFIX +
                userId +
                ".json",

              student
            );

            await uploadJson(
              container,
              authBlobName,
              authDocument
            );

            classroom.studentIds =
              Array.isArray(
                classroom.studentIds
              )
                ? classroom
                    .studentIds
                : [];

            if (
              !classroom
                .studentIds
                .includes(
                  userId
                )
            ) {
              classroom
                .studentIds
                .push(
                  userId
                );
            }

            await saveClassroom(
              container,
              classroom
            );

            return {
              status: 200,

              jsonBody: {
                ok: true,

                student:
                  publicStudent(
                    student
                  ),

                temporaryPassword
              }
            };
          }

          if (
            action ===
            "resetpassword"
          ) {
            const userId =
              String(
                body?.userId ||
                ""
              ).trim();

            const student =
              await downloadJsonOrNull(
                container,

                USER_PREFIX +
                  userId +
                  ".json"
              );

            if (!student) {
              return {
                status: 404,

                jsonBody: {
                  ok: false,
                  error:
                    "الطالب غير موجود."
                }
              };
            }

            const temporaryPassword =
              String(
                body?.password ||
                ""
              ) ||
              generateTemporaryPassword();

            const {
              salt,
              passwordHash
            } =
              hashPassword(
                temporaryPassword
              );

            const authBlobName =
              AUTH_PREFIX +
              studentCodeHash(
                student.code
              ) +
              ".json";

            const authDocument =
              await downloadJsonOrNull(
                container,
                authBlobName
              );

            if (!authDocument) {
              return {
                status: 404,

                jsonBody: {
                  ok: false,
                  error:
                    "ملف دخول الطالب غير موجود."
                }
              };
            }

            authDocument.salt =
              salt;

            authDocument.passwordHash =
              passwordHash;

            authDocument.updatedAt =
              new Date()
                .toISOString();

            await uploadJson(
              container,
              authBlobName,
              authDocument
            );

            return {
              status: 200,

              jsonBody: {
                ok: true,
                temporaryPassword
              }
            };
          }

          if (
            action ===
            "toggleactive"
          ) {
            const userId =
              String(
                body?.userId ||
                ""
              ).trim();

            const studentBlobName =
              USER_PREFIX +
              userId +
              ".json";

            const student =
              await downloadJsonOrNull(
                container,
                studentBlobName
              );

            if (!student) {
              return {
                status: 404,

                jsonBody: {
                  ok: false,
                  error:
                    "الطالب غير موجود."
                }
              };
            }

            student.active =
              !(
                student.active !==
                false
              );

            student.updatedAt =
              new Date()
                .toISOString();

            await uploadJson(
              container,
              studentBlobName,
              student
            );

            const authBlobName =
              AUTH_PREFIX +
              studentCodeHash(
                student.code
              ) +
              ".json";

            const authDocument =
              await downloadJsonOrNull(
                container,
                authBlobName
              );

            if (authDocument) {
              authDocument.active =
                student.active;

              authDocument.updatedAt =
                new Date()
                  .toISOString();

              await uploadJson(
                container,
                authBlobName,
                authDocument
              );
            }

            return {
              status: 200,

              jsonBody: {
                ok: true,
                active:
                  student.active
              }
            };
          }

          return {
            status: 400,

            jsonBody: {
              ok: false,
              error:
                "Unsupported student action."
            }
          };
        }
        catch (error) {
          return {
            status: 500,

            jsonBody: {
              ok: false,

              error:
                error
                instanceof Error
                  ? error.message
                  : "Student action failed."
            }
          };
        }
      }
  }
);
