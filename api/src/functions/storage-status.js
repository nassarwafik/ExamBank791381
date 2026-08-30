const { app } = require("@azure/functions");
const { BlobServiceClient } = require("@azure/storage-blob");
const { requireBuilderAuth } = require("../lib/builder-auth");

app.http("storageStatus", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "storage-status",

  handler: async request => {
    try {
      const auth = requireBuilderAuth(request);
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