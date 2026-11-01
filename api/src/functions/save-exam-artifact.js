
const { app } = require("@azure/functions");
const crypto = require("crypto");

const {
  BlobServiceClient
} = require("@azure/storage-blob");

const { requireTeacherSession } = require("../lib/teacher-session");
const { normalizeBankAssetsInQuestion } = require("../lib/bank-asset-hydrate");
// Phase 14A — the ONE canonical exam content form (shared with the immutable governance revisions).
const { canonicalizeExamContent } = require("../lib/exam-canonical");
const { uploadJson } = require("../lib/platform-storage");
// Phase 21F.0 — saved-exam ownership + conditional saves (never a silent overwrite of a newer version).
const { examOwnerOf, writeSavedExam, SaveRefusal } = require("../lib/saved-exam-access");
const { tenantOf, ownerStamp } = require("../lib/teacher-tenancy");

const BANK_CONTAINER =
  "bank";

function safeSegment(
  value
) {
  return String(
    value || "item"
  )
    .trim()
    .replace(
      /[^a-zA-Z0-9._-]+/g,
      "-"
    )
    .replace(
      /-+/g,
      "-"
    )
    .replace(
      /^-|-$/g,
      ""
    )
    .slice(
      0,
      100
    ) || "item";
}

function cleanQuestion(
  question
) {
  // Bank image assets are stored by durable identity only (origin/blobName/id/contentType): the signed URL minted while
  // the teacher was authoring is a transient credential and is re-signed on every read (bank-asset-hydrate).
  return {
    ...normalizeBankAssetsInQuestion(question),

    history: [],

    redoStack: []
  };
}

function cleanExam(
  exam
) {
  // Phase 14A — canonical content (sections[].questions[] as the ONLY question tree — no stale / empty top-level
  // questions[] on a structured exam; per-question history / redo cleared; bank image assets by durable identity only;
  // governance-looking root fields stripped so a body can never smuggle authority) comes from the shared canonicalizer —
  // the same form an immutable governance revision stores — plus the server save timestamp. Legacy flat exams keep their
  // questions[] exactly as before.
  return {
    ...canonicalizeExamContent(exam),

    updatedAt:
      new Date()
        .toISOString()
  };
}

function buildTemplateDocument(
  exam,
  savedAt
) {
  return {
    schemaVersion: 1,

    kind:
      "exam-template",

    templateId:
      "TPL-" +
      Date.now(),

    title:
      exam.title ||
      exam.plan
        ?.title ||
      "Exam Template",

    originalRequest:
      exam.originalRequest ||
      exam.plan
        ?.originalRequest ||
      "",

    plan:
      exam.plan,

    totalMarks:
      exam.totalMarks,

    metadata:
      exam.metadata ||
      {},

    presentationTheme:
      exam.presentationTheme,

    savedAt
  };
}

// `deps` is an optional dependency-injection seam for unit tests (production passes nothing). The endpoint is a GENERIC
// artifact persistence endpoint: it saves the teacher's working copy / templates and holds NO governance authority — the
// exam publishing lifecycle lives in /api/exam-governance (Phase 14A) and is never touched here.
async function handler(request, deps = {}) {
        try {
          const auth =
            (await requireTeacherSession(request, deps));

          if (
            !auth.ok
          ) {
            return auth.response;
          }

          let body = {};

          try {
            body =
              await request.json();
          }
          catch {
            body = {};
          }

          const kind =
            body?.kind ===
            "template"
              ? "template"
              : "exam";

          const exam =
            body?.exam;

          if (
            !exam ||
            !exam.examId
          ) {
            return {
              status: 400,

              jsonBody: {
                ok: false,

                error:
                  "Exam is required."
              }
            };
          }

          const container =
            (deps.getContainer || defaultContainer)();

          const now =
            new Date();

          const savedAt =
            now.toISOString();

          let document;
          let blobName;

          if (
            kind ===
            "template"
          ) {
            // Phase 21G.0 — a template belongs to the teacher who saved it (multi-user mode).
            document = {
              ...buildTemplateDocument(
                exam,
                savedAt
              ),
              ...ownerStamp(tenantOf(auth.user))
            };

            const day =
              savedAt.slice(
                0,
                10
              );

            blobName =
              "templates/" +
              day +
              "/" +
              Date.now() +
              "-" +
              // 21G.0 — never two templates on one name (same millisecond, a title the slug reduces to the same text).
              crypto.randomBytes(4).toString("hex") +
              "-" +
              safeSegment(
                exam.title ||
                "template"
              ) +
              ".json";
          }
          else {
            blobName =
              "exams/" +
              safeSegment(
                exam.examId
              ) +
              ".json";

            // Phase 21F.0 — `conditional: true` + `baseEtag` (the ETag last read, or null to create) refuses to overwrite a
            // newer version with 409 EXAM_CONFLICT; in multi-user mode an exam owned by another teacher is refused (403).
            const cleaned =
              cleanExam(
                exam
              );

            try {
              const written =
                await writeSavedExam(
                  container,
                  blobName,
                  {
                    build: () => ({
                      kind:
                        "saved-exam",

                      savedAt,

                      exam:
                        cleaned
                    }),

                    owner:
                      examOwnerOf(
                        auth.user
                      ),

                    conditional:
                      body?.conditional === true,

                    baseEtag:
                      body?.baseEtag
                  },
                  deps
                );

              return {
                status: 200,

                jsonBody: {
                  ok: true,

                  kind,

                  blobName,

                  savedAt,

                  etag:
                    written.etag || null
                }
              };
            }
            catch (refusal) {
              if (
                !(refusal instanceof SaveRefusal)
              ) {
                throw refusal;
              }

              return {
                status:
                  refusal.status,

                jsonBody: {
                  ok: false,

                  code:
                    refusal.code,

                  error:
                    refusal.status === 409
                      ? "تم حفظ نسخة أحدث من هذا الامتحان من مكان آخر."
                      : "لا تملك صلاحية تعديل هذا الامتحان.",

                  ...refusal.extra
                }
              };
            }
          }

          await uploadJson(
            container,
            blobName,
            document
          );

          return {
            status: 200,

            jsonBody: {
              ok: true,

              kind,

              blobName,

              savedAt
            }
          };
        }
        catch {
          return {
            status: 500,

            jsonBody: {
              ok: false,

              error: "تعذر حفظ الامتحان حاليًا."
            }
          };
        }
}

function defaultContainer() {
  const connectionString =
    process.env
      .AZURE_STORAGE_CONNECTION_STRING;

  if (
    !connectionString
  ) {
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

app.http(
  "saveExamArtifact",
  {
    methods: [
      "POST"
    ],

    authLevel:
      "anonymous",

    route:
      "save-exam-artifact",

    handler:
      request => handler(request)
  }
);

module.exports = {
  handler,
  cleanExam,
  cleanQuestion,
  buildTemplateDocument
};