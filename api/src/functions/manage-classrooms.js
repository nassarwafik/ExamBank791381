
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
  mutateJsonWithRetry,
  StorageConflictError
} =
  require("../lib/platform-storage");

const {
  normalizeClassStatus,
  applyClassLifecycleAction
} =
  require("../lib/class-lifecycle");

const { recordAuditEvent } = require("../lib/audit-log");
const { isSupportedProject } = require("../lib/project-tracker/registry");
const { getClassProjectCodes, normalizeProjectCodes } = require("../lib/project-tracker/class-projects");

// A class's programCode is valid only when it is empty (no project) or a project the registry knows.
// Pure + exported so the rule is unit-tested and enforced server-side (never trusting the UI).
function programCodeAccepted(programCode) {
  const code = String(programCode || "").trim();
  return code === "" || isSupportedProject(code);
}

const CONFLICT_MESSAGE =
  "حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.";

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

      programCode:
        String(
          document.programCode ||
          ""
        ),

      projectCodes:
        getClassProjectCodes(document),

      active:
        document.active !==
        false,

      status:
        normalizeClassStatus(
          document
        ),

      archivedAt:
        document.archivedAt ||
        "",

      archivedBy:
        document.archivedBy ||
        "",

      archiveReason:
        document.archiveReason ||
        "",

      graduationYear:
        document.graduationYear ||
        "",

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

// A class's project link may be changed only while the class is active (an archived class is
// read-only for the project tracker). Pure + exported so the rule is unit-tested.
function programChangeAllowed(classroom) {
  return normalizeClassStatus(classroom) !== "archived";
}

function buildNewClassroomDocument(
  { name, grade, schoolYear, programCode },
  now
) {
  const doc = {
    schemaVersion: 1,
    classId: crypto.randomUUID(),
    name,
    grade,
    schoolYear,
    active: true,
    studentIds: [],
    createdAt: now,
    updatedAt: now
  };
  // Optional program/model code (e.g. "794589"). Omitted entirely for classes with no program, so
  // legacy classrooms and non-program classes stay byte-identical to before.
  const code = String(programCode || "").trim();
  if (code) doc.programCode = code;
  return doc;
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

            const programCode =
              String(
                body?.programCode ||
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

            if (!programCodeAccepted(programCode)) {
              return { status: 400, jsonBody: { ok: false, error: "مشروع غير مدعوم." } };
            }

            const now =
              new Date()
                .toISOString();

            const classroom =
              buildNewClassroomDocument(
                { name, grade, schoolYear, programCode },
                now
              );

            const classId =
              classroom.classId;

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
                  programCode:
                    classroom.programCode || "",
                  active: true,
                  studentCount:
                    0,
                  createdAt:
                    now
                }
              }
            };
          }

          // Modern multi-project action, and the legacy single-project setProgram kept as a thin
          // wrapper (setProgram("899373") -> ["899373"]; setProgram("") -> []). Both write the modern
          // projectCodes[] canonical field and drop the legacy programCode so no stale logic depends on it.
          if (action === "setprojects" || action === "setprogram") {
            const classId = String(body?.classId || "").trim();
            if (!classId) {
              return { status: 400, jsonBody: { ok: false, error: "classId is required." } };
            }
            let nextCodes;
            try {
              nextCodes = action === "setprogram"
                ? normalizeProjectCodes([String(body?.programCode || "").trim()].filter(Boolean))
                : normalizeProjectCodes(body?.projectCodes);
            } catch (e) {
              return { status: e.httpStatus || 400, jsonBody: { ok: false, error: e.message } };
            }

            try {
              const updated =
                await mutateJsonWithRetry(
                  container,
                  CLASS_PREFIX + classId + ".json",
                  current => {
                    if (!current) {
                      const notFound = new Error("الصف غير موجود.");
                      notFound.httpStatus = 404;
                      throw notFound;
                    }
                    if (!programChangeAllowed(current)) {
                      const blocked = new Error("الصف مؤرشف — لا يمكن تعديل مشاريعه.");
                      blocked.httpStatus = 403;
                      throw blocked;
                    }
                    current.projectCodes = nextCodes; // canonical modern field
                    delete current.programCode;       // stop relying on the legacy field once migrated
                    current.updatedAt = new Date().toISOString();
                    return current;
                  }
                );
              return {
                status: 200,
                jsonBody: { ok: true, projectCodes: getClassProjectCodes(updated) }
              };
            }
            catch (mutateError) {
              if (mutateError instanceof StorageConflictError) {
                return { status: 503, jsonBody: { ok: false, error: CONFLICT_MESSAGE } };
              }
              if (mutateError?.httpStatus) {
                return { status: mutateError.httpStatus, jsonBody: { ok: false, error: mutateError.message } };
              }
              throw mutateError;
            }
          }

          if (
            action ===
              "archive" ||
            action ===
              "unarchive" ||
            action ===
              "graduateandarchive"
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

            let updatedClassroom =
              null;

            try {
              updatedClassroom =
                await mutateJsonWithRetry(
                  container,
                  blobName,
                  current => {
                    if (!current) {
                      const notFound =
                        new Error(
                          "الصف غير موجود."
                        );

                      notFound.httpStatus = 404;

                      throw notFound;
                    }

                    return applyClassLifecycleAction(
                      current,
                      action,
                      {
                        actor: auth.user?.sub,
                        now: new Date().toISOString()
                      }
                    );
                  }
                );
            }
            catch (mutateError) {
              if (
                mutateError instanceof
                StorageConflictError
              ) {
                return {
                  status: 503,

                  jsonBody: {
                    ok: false,
                    error: CONFLICT_MESSAGE
                  }
                };
              }

              if (mutateError?.httpStatus) {
                return {
                  status: mutateError.httpStatus,

                  jsonBody: {
                    ok: false,
                    error: mutateError.message
                  }
                };
              }

              throw mutateError;
            }

            await recordAuditEvent(
              container,
              {
                actor: auth.user?.sub,
                action:
                  action === "unarchive"
                    ? "class.unarchive"
                    : action === "graduateandarchive"
                      ? "class.graduate"
                      : "class.archive",
                targetType: "class",
                targetId: classId,
                targetLabel: updatedClassroom.name || ""
              }
            );

            return {
              status: 200,

              jsonBody: {
                ok: true,
                active:
                  updatedClassroom.active,
                status:
                  normalizeClassStatus(
                    updatedClassroom
                  ),
                archivedAt:
                  updatedClassroom.archivedAt ||
                  "",
                archiveReason:
                  updatedClassroom.archiveReason ||
                  "",
                graduationYear:
                  updatedClassroom.graduationYear ||
                  ""
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

module.exports = { buildNewClassroomDocument, programChangeAllowed, programCodeAccepted };
