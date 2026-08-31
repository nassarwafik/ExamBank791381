const { app } = require("@azure/functions");
const {
  BlobServiceClient
} = require("@azure/storage-blob");
const {
  verifySignedAssetParams
} = require("../lib/builder-auth");

const ASSETS_CONTAINER = "assets";

async function streamToBuffer(stream) {
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

app.http("questionImage", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "question-image",

  handler: async request => {
    try {
      const url = new URL(request.url);
      const blobName = String(
        url.searchParams.get("blob") || ""
      );
      const exp = String(
        url.searchParams.get("exp") || ""
      );
      const sig = String(
        url.searchParams.get("sig") || ""
      );

      if (!verifySignedAssetParams(blobName, exp, sig)) {
        return {
          status: 401,
          body: "Unauthorized"
        };
      }

      const connectionString =
        process.env.AZURE_STORAGE_CONNECTION_STRING;

      if (!connectionString) {
        throw new Error(
          "AZURE_STORAGE_CONNECTION_STRING is not configured"
        );
      }

      const blobServiceClient =
        BlobServiceClient.fromConnectionString(
          connectionString
        );

      const assetsContainer =
        blobServiceClient.getContainerClient(
          ASSETS_CONTAINER
        );

      const blobClient = assetsContainer.getBlobClient(blobName);
      const response = await blobClient.download();

      if (!response.readableStreamBody) {
        return {
          status: 404,
          body: "Image not found"
        };
      }

      const buffer = await streamToBuffer(
        response.readableStreamBody
      );

      return {
        status: 200,
        body: buffer,
        headers: {
          "content-type":
            response.contentType || "application/octet-stream",
          "cache-control": "private, max-age=600"
        }
      };
    }
    catch {
      return {
        status: 500,
        body: "تعذر تحميل الصورة حاليًا."
      };
    }
  }
});
