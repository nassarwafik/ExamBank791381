
const { app } = require("@azure/functions");

const {
  BlobServiceClient
} = require("@azure/storage-blob");

const {
  requireBuilderAuth
} = require("../lib/builder-auth");

const BANK_CONTAINER =
  "bank";

const EXAMS_PREFIX =
  "exams/";

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

async function downloadJson(
  container,
  blobName
) {
  const blob =
    container.getBlobClient(
      blobName
    );

  const response =
    await blob.download();

  if (
    !response
      .readableStreamBody
  ) {
    throw new Error(
      "Unable to read saved exam."
    );
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

function isSafeExamBlob(
  blobName
) {
  const value =
    String(
      blobName || ""
    );

  return (
    value.startsWith(
      EXAMS_PREFIX
    ) &&
    value.endsWith(
      ".json"
    ) &&
    !value.includes(
      ".."
    ) &&
    !value.includes(
      "\\"
    )
  );
}

function getContainer() {
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

  const service =
    BlobServiceClient
      .fromConnectionString(
        connectionString
      );

  return service
    .getContainerClient(
      BANK_CONTAINER
    );
}

async function listSavedExams(
  container
) {
  const exams = [];

  let examined = 0;

  for await (
    const blob
    of container.listBlobsFlat({
      prefix:
        EXAMS_PREFIX
    })
  ) {
    if (
      examined >= 100
    ) {
      break;
    }

    examined += 1;

    try {
      const document =
        await downloadJson(
          container,
          blob.name
        );

      const exam =
        document?.exam;

      if (
        !exam
      ) {
        continue;
      }

      exams.push({
        blobName:
          blob.name,

        examId:
          String(
            exam.examId ||
            ""
          ),

        title:
          String(
            exam.title ||
            "امتحان بدون عنوان"
          ),

        savedAt:
          String(
            document.savedAt ||
            exam.updatedAt ||
            blob.properties
              ?.lastModified
              ?.toISOString() ||
            ""
          ),

        questionCount:
          Array.isArray(
            exam.questions
          )
            ? exam.questions.length
            : 0,

        totalMarks:
          Number(
            exam.totalMarks ||
            0
          )
      });
    }
    catch {
      /*
        Skip damaged or
        unrelated blobs.
      */
    }
  }

  exams.sort(
    (
      a,
      b
    ) =>
      String(
        b.savedAt
      ).localeCompare(
        String(
          a.savedAt
        )
      )
  );

  return exams;
}

app.http(
  "manageSavedExams",
  {
    methods: [
      "GET",
      "POST"
    ],

    authLevel:
      "anonymous",

    route:
      "saved-exams",

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

          const container =
            getContainer();

          if (
            request.method ===
            "GET"
          ) {
            const exams =
              await listSavedExams(
                container
              );

            return {
              status: 200,

              jsonBody: {
                ok: true,

                exams
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
              ""
            )
              .trim()
              .toLowerCase();

          const blobName =
            String(
              body?.blobName ||
              ""
            );

          if (
            !isSafeExamBlob(
              blobName
            )
          ) {
            return {
              status: 400,

              jsonBody: {
                ok: false,

                error:
                  "Invalid saved exam."
              }
            };
          }

          if (
            action ===
            "load"
          ) {
            const document =
              await downloadJson(
                container,
                blobName
              );

            if (
              !document?.exam
            ) {
              throw new Error(
                "Saved exam document is invalid."
              );
            }

            return {
              status: 200,

              jsonBody: {
                ok: true,

                exam:
                  document.exam,

                savedAt:
                  document.savedAt ||
                  null
              }
            };
          }

          if (
            action ===
            "delete"
          ) {
            const client =
              container
                .getBlockBlobClient(
                  blobName
                );

            const result =
              await client
                .deleteIfExists();

            return {
              status: 200,

              jsonBody: {
                ok: true,

                deleted:
                  result.succeeded ===
                  true
              }
            };
          }

          return {
            status: 400,

            jsonBody: {
              ok: false,

              error:
                "Unsupported saved exam action."
            }
          };
        }
        catch {
          return {
            status: 500,

            jsonBody: {
              ok: false,

              error: "تعذر تنفيذ إجراء الامتحانات المحفوظة حاليًا."
            }
          };
        }
      }
  }
);
