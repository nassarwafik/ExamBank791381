const { app } = require("@azure/functions");
const { BlobServiceClient } = require("@azure/storage-blob");

app.http("storageStatus", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "storage-status",

  handler: async () => {
    try {
      const connectionString =
        process.env.AZURE_STORAGE_CONNECTION_STRING;

      if (!connectionString) {
        return {
          status: 500,
          jsonBody: {
            ok: false,
            error: "AZURE_STORAGE_CONNECTION_STRING is not configured"
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
    } catch (error) {
      return {
        status: 500,
        jsonBody: {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Unknown storage error"
        }
      };
    }
  }
});