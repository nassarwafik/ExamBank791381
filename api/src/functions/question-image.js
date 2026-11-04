const { app } = require("@azure/functions");
const {
  BlobServiceClient
} = require("@azure/storage-blob");
const {
  verifySignedAssetParams
} = require("../lib/builder-auth");

const { allowedImageType, IMAGE_SAFETY_HEADERS } = require("../lib/image-content-type");   // Tadris+ P9-B3

const ASSETS_CONTAINER = "assets";

async function streamToBuffer(stream) {
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

// Production asset read: the signed blob from the assets container ({ buffer, contentType } or null when missing).
async function downloadAsset(blobName) {
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
    return null;
  }

  return {
    buffer: await streamToBuffer(response.readableStreamBody),
    contentType: response.contentType || "application/octet-stream"
  };
}

// The signature (blob + exp + sig, see builder-auth.createSignedAssetParams) is verified BEFORE any storage access. Bank
// image URLs are minted fresh whenever an exam is served (bank-asset-hydrate), so an expired one is always a stale
// credential — never accepted. `deps` is an optional dependency-injection seam for unit tests.
async function handler(request, deps = {}) {
  const download = deps.downloadAsset || downloadAsset;
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

    const asset = await download(blobName);

    if (!asset) {
      return {
        status: 404,
        body: "Image not found"
      };
    }

    // Tadris+ P9-B3 — only an allow-listed image type is rendered (with nosniff and a sandbox policy); any other stored type is
    // an opaque download, so a blob stored with a browser-declared `text/html` can never run as the app.
    const imageType = allowedImageType(asset.contentType);
    return {
      status: 200,
      body: asset.buffer,
      headers: {
        "content-type": imageType || "application/octet-stream",
        ...(imageType ? {} : { "content-disposition": "attachment" }),
        "cache-control": "private, max-age=600",
        ...IMAGE_SAFETY_HEADERS
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

app.http("questionImage", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "question-image",
  handler: request => handler(request)
});

module.exports = { handler };
