
const { app } = require("@azure/functions");

const {
  BlobServiceClient
} = require("@azure/storage-blob");

const {
  requireBuilderAuth
} = require("../lib/builder-auth");

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
  return {
    ...question,

    history: [],

    redoStack: []
  };
}

function cleanExam(
  exam
) {
  return {
    ...exam,

    updatedAt:
      new Date()
        .toISOString(),

    questions:
      Array.isArray(
        exam.questions
      )
        ? exam.questions.map(
            cleanQuestion
          )
        : []
  };
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
      async request => {
        try {
          const auth =
            requireBuilderAuth(
              request
            );

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

          const blobService =
            BlobServiceClient
              .fromConnectionString(
                connectionString
              );

          const container =
            blobService
              .getContainerClient(
                BANK_CONTAINER
              );

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
            document = {
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

              savedAt
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
              safeSegment(
                exam.title ||
                "template"
              ) +
              ".json";
          }
          else {
            document = {
              kind:
                "saved-exam",

              savedAt,

              exam:
                cleanExam(
                  exam
                )
            };

            blobName =
              "exams/" +
              safeSegment(
                exam.examId
              ) +
              ".json";
          }

          const blockBlob =
            container
              .getBlockBlobClient(
                blobName
              );

          const json =
            JSON.stringify(
              document,
              null,
              2
            );

          await blockBlob.uploadData(
            Buffer.from(
              json,
              "utf8"
            ),
            {
              overwrite: true,

              blobHTTPHeaders: {
                blobContentType:
                  "application/json; charset=utf-8"
              }
            }
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
        catch (error) {
          return {
            status: 500,

            jsonBody: {
              ok: false,

              error:
                error
                instanceof Error
                  ? error.message
                  : "Saving failed."
            }
          };
        }
      }
  }
);
