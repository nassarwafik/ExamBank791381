const { app } = require("@azure/functions");
const crypto = require("crypto");
const { BlobServiceClient } = require("@azure/storage-blob");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { detectAndValidateKind } = require("../lib/file-sniff");

const RAW_CONTAINER = "raw";
const MAX_FILE_BYTES = 15 * 1024 * 1024;

function getRawContainer() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING is not configured.");
  }
  return BlobServiceClient.fromConnectionString(connectionString).getContainerClient(RAW_CONTAINER);
}

async function uploadBuffer(container, blobName, buffer, contentType) {
  await container.getBlockBlobClient(blobName).upload(buffer, buffer.length, {
    overwrite: true,
    blobHTTPHeaders: { blobContentType: contentType }
  });
}

async function uploadJson(container, blobName, value) {
  const body = JSON.stringify(value, null, 2);
  await container.getBlockBlobClient(blobName).upload(body, Buffer.byteLength(body), {
    overwrite: true,
    blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" }
  });
}

// HTTP header values must be ASCII/Latin-1; the frontend encodeURIComponent()s the (often Arabic)
// file name before sending it as x-file-name, so it must be decoded back on this side.
function decodeFileNameHeader(rawHeaderValue) {
  const trimmed = String(rawHeaderValue || "").trim();
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

app.http("importUpload", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "import-upload",
  handler: async request => {
    try {
      const auth = requireBuilderAuth(request);
      if (!auth.ok) {
        return auth.response;
      }

      const fileName = decodeFileNameHeader(request.headers.get("x-file-name"));
      const declaredType = String(request.headers.get("x-file-type") || "").trim();

      if (!fileName) {
        return { status: 400, jsonBody: { ok: false, error: "x-file-name header is required." } };
      }

      const contentLengthHeader = request.headers.get("content-length");
      if (contentLengthHeader && Number(contentLengthHeader) > MAX_FILE_BYTES) {
        return { status: 413, jsonBody: { ok: false, error: "File exceeds the 15MB size limit." } };
      }

      const arrayBuffer = await request.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length === 0) {
        return { status: 400, jsonBody: { ok: false, error: "Uploaded file is empty." } };
      }

      if (buffer.length > MAX_FILE_BYTES) {
        return { status: 413, jsonBody: { ok: false, error: "File exceeds the 15MB size limit." } };
      }

      const validation = detectAndValidateKind(fileName, declaredType, buffer);
      if (!validation.ok) {
        return { status: 400, jsonBody: { ok: false, error: "Invalid file: " + validation.reason } };
      }

      const importJobId = "imp-" + Date.now() + "-" + crypto.randomBytes(4).toString("hex");
      const extension = validation.kind === "docx" ? ".docx" : validation.kind === "pdf" ? ".pdf" : ".html";
      const contentType = validation.kind === "pdf"
        ? "application/pdf"
        : validation.kind === "docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "text/html";

      const container = getRawContainer();
      const blobPrefix = `imports/${importJobId}/`;

      await uploadBuffer(container, blobPrefix + "original" + extension, buffer, contentType);

      const manifest = {
        importJobId,
        fileName,
        declaredContentType: declaredType,
        detectedKind: validation.kind,
        sizeBytes: buffer.length,
        sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
        uploadedAt: new Date().toISOString(),
        status: "uploaded"
      };

      await uploadJson(container, blobPrefix + "manifest.json", manifest);

      return {
        status: 200,
        jsonBody: { ok: true, importJobId, fileName, sizeBytes: buffer.length, detectedKind: validation.kind }
      };
    } catch {
      return { status: 500, jsonBody: { ok: false, error: "تعذر رفع الملف حاليًا." } };
    }
  }
});

// Exported only for unit testing the header decode helper (app.http's own route registration
// above is unaffected).
module.exports = { decodeFileNameHeader };
