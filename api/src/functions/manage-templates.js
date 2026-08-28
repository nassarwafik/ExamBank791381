
const { app } = require("@azure/functions");

const {
  BlobServiceClient
} = require("@azure/storage-blob");

const {
  requireBuilderAuth
} = require("../lib/builder-auth");

const BANK_CONTAINER = "bank";
const TEMPLATE_PREFIX = "templates/";

async function streamToBuffer(stream) {
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(
      Buffer.from(chunk)
    );
  }

  return Buffer.concat(chunks);
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

function isSafeTemplateBlob(blobName) {
  const value =
    String(blobName || "");

  return (
    value.startsWith(
      TEMPLATE_PREFIX
    ) &&
    value.endsWith(".json") &&
    !value.includes("..") &&
    !value.includes("\\")
  );
}

async function downloadJson(
  container,
  blobName
) {
  const client =
    container.getBlobClient(
      blobName
    );

  const response =
    await client.download();

  if (!response.readableStreamBody) {
    throw new Error(
      "Unable to read template."
    );
  }

  const buffer =
    await streamToBuffer(
      response.readableStreamBody
    );

  return JSON.parse(
    buffer.toString("utf8")
  );
}

async function listTemplates(
  container
) {
  const items = [];
  let count = 0;

  for await (
    const blob of
    container.listBlobsFlat({
      prefix: TEMPLATE_PREFIX
    })
  ) {
    if (count >= 150) {
      break;
    }

    count += 1;

    try {
      const document =
        await downloadJson(
          container,
          blob.name
        );

      if (
        document?.kind !==
        "exam-template"
      ) {
        continue;
      }

      items.push({
        blobName:
          blob.name,

        templateId:
          String(
            document.templateId ||
            ""
          ),

        title:
          String(
            document.title ||
            "قالب بدون عنوان"
          ),

        savedAt:
          String(
            document.savedAt ||
            blob.properties
              ?.lastModified
              ?.toISOString() ||
            ""
          ),

        totalMarks:
          Number(
            document.totalMarks ||
            document.plan
              ?.totalMarks ||
            0
          ),

        totalQuestions:
          Number(
            document.plan
              ?.totalQuestions ||
            0
          )
      });
    }
    catch {
      // Skip damaged templates.
    }
  }

  items.sort(
    (a, b) =>
      String(b.savedAt)
        .localeCompare(
          String(a.savedAt)
        )
  );

  return items;
}

app.http(
  "manageTemplates",
  {
    methods: [
      "GET",
      "POST"
    ],

    authLevel:
      "anonymous",

    route:
      "templates",

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

                templates:
                  await listTemplates(
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
              body?.action || ""
            )
              .trim()
              .toLowerCase();

          const blobName =
            String(
              body?.blobName || ""
            );

          if (
            !isSafeTemplateBlob(
              blobName
            )
          ) {
            return {
              status: 400,

              jsonBody: {
                ok: false,
                error:
                  "Invalid template."
              }
            };
          }

          if (
            action === "load"
          ) {
            const template =
              await downloadJson(
                container,
                blobName
              );

            return {
              status: 200,

              jsonBody: {
                ok: true,
                template
              }
            };
          }

          if (
            action === "delete"
          ) {
            const result =
              await container
                .getBlockBlobClient(
                  blobName
                )
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
                "Unsupported template action."
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
                  : "Template action failed."
            }
          };
        }
      }
  }
);
