const { app } = require("@azure/functions");
const crypto = require("crypto");
const { BlobServiceClient } = require("@azure/storage-blob");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { looksLikeText } = require("../lib/file-sniff");
const { safeFetch, UnsafeUrlError } = require("../lib/url-fetch");

const RAW_CONTAINER = "raw";
const MAX_FETCH_BYTES = 10 * 1024 * 1024;

// A "gform" import is only ever allowed to point at Google's own form domains - unlike the "html"
// kind (any public page), this is a second, independent layer of restriction specific to this
// kind, on top of url-fetch.js's general private-IP/DNS-rebinding protections.
const GOOGLE_FORM_HOSTS = ["docs.google.com", "forms.gle"];

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

// Pure and exported for testing. Derives a human-readable "file name" for the import-file list
// from the fetched HTML's <title>, falling back to the URL itself when no title is present.
function deriveFileName(html, url) {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = match ? match[1].replace(/\s+/g, " ").trim() : "";
  return title || url;
}

app.http("importFetchUrl", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "import-fetch-url",
  handler: async request => {
    try {
      const auth = requireBuilderAuth(request);
      if (!auth.ok) {
        return auth.response;
      }

      let body = {};
      try {
        body = await request.json();
      }
      catch {
        body = {};
      }

      const url = String(body?.url || "").trim();
      const kind = body?.kind === "gform" ? "gform" : "html";

      if (!url) {
        return { status: 400, jsonBody: { ok: false, error: "url is required." } };
      }

      let fetched;
      try {
        fetched = await safeFetch(url, {
          maxBytes: MAX_FETCH_BYTES,
          allowedHosts: kind === "gform" ? GOOGLE_FORM_HOSTS : null
        });
      }
      catch (error) {
        const message = error instanceof UnsafeUrlError ? error.message : "تعذر جلب هذا الرابط.";
        return { status: 400, jsonBody: { ok: false, error: message } };
      }

      const buffer = fetched.buffer;

      if (buffer.length === 0) {
        return { status: 400, jsonBody: { ok: false, error: "الرابط لا يحتوي على أي محتوى." } };
      }

      // gform pages are JS-hydrated (see google-form-extract.js) so their body is legitimately not
      // "text-like" prose in the html-extract.js sense - only apply the text heuristic to the
      // plain "html" kind, matching what import-upload.js already does for uploaded .html files.
      if (kind === "html" && !looksLikeText(buffer)) {
        return { status: 400, jsonBody: { ok: false, error: "محتوى هذا الرابط لا يبدو نصًا صالحًا." } };
      }

      const fileName = deriveFileName(buffer.toString("utf8"), url);
      const importJobId = "imp-" + Date.now() + "-" + crypto.randomBytes(4).toString("hex");
      const detectedKind = kind; // "html" | "gform" - both stored as original.html, see import-analyze.js's extractorForKind

      const container = getRawContainer();
      const blobPrefix = `imports/${importJobId}/`;

      await uploadBuffer(container, blobPrefix + "original.html", buffer, "text/html");

      const manifest = {
        importJobId,
        fileName,
        sourceUrl: url,
        declaredContentType: fetched.contentType || "",
        detectedKind,
        sizeBytes: buffer.length,
        sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
        uploadedAt: new Date().toISOString(),
        status: "uploaded"
      };

      await uploadJson(container, blobPrefix + "manifest.json", manifest);

      return {
        status: 200,
        jsonBody: { ok: true, importJobId, fileName, sizeBytes: buffer.length, detectedKind }
      };
    }
    catch {
      return { status: 500, jsonBody: { ok: false, error: "تعذر استيراد هذا الرابط حاليًا." } };
    }
  }
});

module.exports = { deriveFileName, GOOGLE_FORM_HOSTS };
