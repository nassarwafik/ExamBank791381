
const { app } =
  require("@azure/functions");

const {
  BlobServiceClient
} =
  require("@azure/storage-blob");

const {
  requireStudentAuth
} =
  require("../lib/student-auth");

const BANK_CONTAINER =
  "bank";

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

app.http(
  "studentDashboard",
  {
    methods: [
      "GET"
    ],

    authLevel:
      "anonymous",

    route:
      "student-dashboard",

    handler:
      async request => {
        try {
          const auth =
            requireStudentAuth(
              request
            );

          if (!auth.ok) {
            return auth.response;
          }

          const container =
            getContainer();

          const student =
            await downloadJsonOrNull(
              container,

              "platform/users/" +
                auth.user.sub +
                ".json"
            );

          if (
            !student ||
            student.active ===
              false
          ) {
            return {
              status: 401,

              jsonBody: {
                ok: false,
                error:
                  "الحساب غير فعّال."
              }
            };
          }

          const classroom =
            student.classId
              ? await downloadJsonOrNull(
                  container,

                  "platform/classes/" +
                    student.classId +
                    ".json"
                )
              : null;

          return {
            status: 200,

            jsonBody: {
              ok: true,

              student: {
                userId:
                  student.userId,
                code:
                  student.code,
                displayName:
                  student
                    .displayName,
                classId:
                  student.classId
              },

              classroom:
                classroom
                  ? {
                      classId:
                        classroom
                          .classId,
                      name:
                        classroom
                          .name,
                      grade:
                        classroom
                          .grade,
                      schoolYear:
                        classroom
                          .schoolYear
                    }
                  : null,

              assignments: [],

              stats: {
                assigned: 0,
                completed: 0,
                average: null
              },

              phase:
                "2.0A"
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
                  : "Student dashboard failed."
            }
          };
        }
      }
  }
);
