
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

const BANK_CONTAINER =
  "bank";

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

async function listClasses(
  container
) {
  const classes = [];

  for await (
    const blob
    of container
      .listBlobsFlat({
        prefix:
          CLASS_PREFIX
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

    const document =
      await downloadJsonOrNull(
        container,
        blob.name
      );

    if (!document) {
      continue;
    }

    classes.push({
      classId:
        String(
          document.classId ||
          ""
        ),

      name:
        String(
          document.name ||
          ""
        ),

      grade:
        String(
          document.grade ||
          ""
        ),

      schoolYear:
        String(
          document.schoolYear ||
          ""
        ),

      active:
        document.active !==
        false,

      studentCount:
        Array.isArray(
          document.studentIds
        )
          ? document
              .studentIds
              .length
          : 0,

      createdAt:
        String(
          document.createdAt ||
          ""
        )
    });
  }

  classes.sort(
    (left, right) =>
      String(
        right.createdAt
      ).localeCompare(
        String(
          left.createdAt
        )
      )
  );

  return classes;
}

app.http(
  "manageClassrooms",
  {
    methods: [
      "GET",
      "POST"
    ],

    authLevel:
      "anonymous",

    route:
      "classrooms",

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
            return {
              status: 200,

              jsonBody: {
                ok: true,

                classes:
                  await listClasses(
                    container
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
            const name =
              String(
                body?.name ||
                ""
              ).trim();

            const grade =
              String(
                body?.grade ||
                ""
              ).trim();

            const schoolYear =
              String(
                body?.schoolYear ||
                ""
              ).trim();

            if (!name) {
              return {
                status: 400,

                jsonBody: {
                  ok: false,
                  error:
                    "اسم الصف مطلوب."
                }
              };
            }

            const now =
              new Date()
                .toISOString();

            const classId =
              crypto
                .randomUUID();

            const classroom = {
              schemaVersion: 1,
              classId,
              name,
              grade,
              schoolYear,
              active: true,
              studentIds: [],
              createdAt:
                now,
              updatedAt:
                now
            };

            await uploadJson(
              container,
              CLASS_PREFIX +
                classId +
                ".json",
              classroom
            );

            return {
              status: 200,

              jsonBody: {
                ok: true,

                classroom: {
                  classId,
                  name,
                  grade,
                  schoolYear,
                  active: true,
                  studentCount:
                    0,
                  createdAt:
                    now
                }
              }
            };
          }

          if (
            action ===
              "archive" ||
            action ===
              "unarchive"
          ) {
            const classId =
              String(
                body?.classId ||
                ""
              ).trim();

            if (!classId) {
              return {
                status: 400,

                jsonBody: {
                  ok: false,
                  error:
                    "classId is required."
                }
              };
            }

            const blobName =
              CLASS_PREFIX +
              classId +
              ".json";

            const classroom =
              await downloadJsonOrNull(
                container,
                blobName
              );

            if (!classroom) {
              return {
                status: 404,

                jsonBody: {
                  ok: false,
                  error:
                    "الصف غير موجود."
                }
              };
            }

            classroom.active =
              action ===
              "unarchive";

            classroom.updatedAt =
              new Date()
                .toISOString();

            await uploadJson(
              container,
              blobName,
              classroom
            );

            return {
              status: 200,

              jsonBody: {
                ok: true,
                active:
                  classroom.active
              }
            };
          }

          return {
            status: 400,

            jsonBody: {
              ok: false,
              error:
                "Unsupported classroom action."
            }
          };
        }
        catch {
          return {
            status: 500,

            jsonBody: {
              ok: false,

              error: "تعذر تنفيذ إجراء الصف حاليًا."
            }
          };
        }
      }
  }
);
