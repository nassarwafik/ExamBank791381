const { app } = require("@azure/functions");
const { BlobServiceClient } = require("@azure/storage-blob");
// Tadris+ P1-B — operator tool: owner-only once an owner exists (requireOperator; owner decision D9).
const { requireOperator } = require("../lib/identity/operator-gate");

app.http("storageStatus", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "storage-status",

  handler: async request => {
    try {
      const auth = await requireOperator(request);
      if (!auth.ok) return auth.response;

      const connectionString =
        process.env.AZURE_STORAGE_CONNECTION_STRING;

      if (!connectionString) {
        return {
          status: 500,
          jsonBody: {
            ok: false,
            error: "تعذر فحص حالة التخزين حاليًا."
          }
        };
      }

      const blobServiceClient =
        BlobServiceClient.fromConnectionString(
          connectionString
        );

      const containerClient =
        blobServiceClient.getContainerClient("raw");

      const files = [];

      for await (const blob of containerClient.listBlobsFlat()) {
        files.push({
          name: blob.name,
          size: blob.properties.contentLength ?? 0,
          lastModified:
            blob.properties.lastModified?.toISOString() ?? null
        });
      }

      return {
        status: 200,
        jsonBody: {
          ok: true,
          storage: "exambank791381storage",
          container: "raw",
          fileCount: files.length,
          files
        }
      };
    } catch {
      return {
        status: 500,
        jsonBody: {
          ok: false,
          error: "تعذر فحص حالة التخزين حاليًا."
        }
      };
    }
  }
});