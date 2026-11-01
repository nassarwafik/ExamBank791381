
const { app } = require("@azure/functions");

const {
  BlobServiceClient
} = require("@azure/storage-blob");

const { requireTeacherSession } = require("../lib/teacher-session");
const { tenantOf, canAccessDocument } = require("../lib/teacher-tenancy");

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

// Phase 21G.0 — a template saved in multi-user mode carries `ownerId` and belongs to that teacher: another teacher never lists it,
// and loading / deleting it answers exactly like a missing template. Pre-tenancy templates follow the platform rule
// (shared until LEGACY_DATA_OWNER names their owner). The list page (150) counts only templates this teacher may see.
const MAX_LISTED = 150;
const MAX_EXAMINED = 2000;

async function readTemplateOrNull(container, blobName, read) {
  try {
    return await read(container, blobName);
  } catch (error) {
    if (error?.statusCode === 404 || error?.code === "BlobNotFound") return null;
    throw error;
  }
}

async function listTemplates(container, tenant = null, read = downloadJson) {
  const items = [];
  let examined = 0;
  for await (const blob of container.listBlobsFlat({ prefix: TEMPLATE_PREFIX })) {
    if (items.length >= MAX_LISTED || examined >= MAX_EXAMINED) break;
    examined += 1;
    try {
      const document = await read(container, blob.name);
      if (document?.kind !== "exam-template" || !canAccessDocument(document, tenant)) continue;
      items.push({
        blobName: blob.name,
        templateId: String(document.templateId || ""),
        title: String(document.title || "قالب بدون عنوان"),
        savedAt: String(document.savedAt || blob.properties?.lastModified?.toISOString() || ""),
        totalMarks: Number(document.totalMarks || document.plan?.totalMarks || 0),
        totalQuestions: Number(document.plan?.totalQuestions || 0)
      });
    } catch {
      // Skip damaged templates.
    }
  }
  items.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
  return items;
}

// `deps` is the dependency-injection seam for tests (production passes nothing).
async function handler(request, deps = {}) {
  try {
    const auth = (await requireTeacherSession(request, deps));
    if (!auth.ok) return auth.response;
    const container = (deps.getContainer || getContainer)();
    const read = deps.downloadJson || downloadJson;
    const tenant = tenantOf(auth.user);
    if (request.method === "GET") {
      return { status: 200, jsonBody: { ok: true, templates: await listTemplates(container, tenant, read) } };
    }
    let body = {};
    try { body = await request.json(); } catch { body = {}; }
    const action = String(body?.action || "").trim().toLowerCase();
    const blobName = String(body?.blobName || "");
    if (!isSafeTemplateBlob(blobName)) return { status: 400, jsonBody: { ok: false, error: "Invalid template." } };
    if (action === "load") {
      const template = await readTemplateOrNull(container, blobName, read);
      if (!template || !canAccessDocument(template, tenant)) return { status: 404, jsonBody: { ok: false, error: "القالب غير موجود." } };
      return { status: 200, jsonBody: { ok: true, template } };
    }
    if (action === "delete") {
      if (tenant) {
        const stored = await readTemplateOrNull(container, blobName, read);
        if (!stored || !canAccessDocument(stored, tenant)) return { status: 200, jsonBody: { ok: true, deleted: false } };
      }
      const result = await container.getBlobClient(blobName).deleteIfExists();
      return { status: 200, jsonBody: { ok: true, deleted: result.succeeded === true } };
    }
    return { status: 400, jsonBody: { ok: false, error: "Unsupported template action." } };
  } catch {
    return { status: 500, jsonBody: { ok: false, error: "تعذر تنفيذ إجراء القالب حاليًا." } };
  }
}

app.http("manageTemplates", { methods: ["GET", "POST"], authLevel: "anonymous", route: "templates", handler: request => handler(request) });
module.exports = { handler, listTemplates };
