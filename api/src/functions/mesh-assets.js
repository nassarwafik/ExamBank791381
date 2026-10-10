const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { getContainer } = require("../lib/platform-storage");
const { inspectGlbAsset, MESH_ASSET_LIMITS } = require("../lib/shared-finalization/meshModels/glbAsset");
const store = require("../lib/mesh-assets/store");

// Phase 21D-B.1 — mesh asset endpoints.
//   POST /api/mesh-assets/upload          builder auth · raw GLB body · x-file-name *.glb · the server validates EVERYTHING (shared GLB authority)
//   GET  /api/mesh-assets                 builder auth · the caller's own assets (records only, never bytes of other teachers)
//   GET  /api/mesh-assets/runtime/{hash}  PUBLIC BY DESIGN: a content-addressed capability URL. The hash is an unguessable SHA-256 of
//        exactly the validated bytes; there is no listing and no owner data. The bytes are re-verified against the hash before they are
//        served, and the response can never become a document (model/gltf-binary, nosniff, attachment, CSP sandbox).
// Handlers are exported with an injectable `deps` seam for tests; the registrations below bind the real dependencies.
const HEX64 = /^[0-9a-f]{64}$/;
const DEFAULT_DEPS = { getContainer, requireBuilderAuth };
const RUNTIME_HEADERS = Object.freeze({
  "Content-Type": store.GLB_CONTENT_TYPE,
  "Cache-Control": "public, max-age=31536000, immutable",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer"
});
const ERROR_HEADERS = Object.freeze({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });

function decodeFileName(request) {
  const raw = request.headers && typeof request.headers.get === "function" ? request.headers.get("x-file-name") : "";
  if (!raw) return "";
  try { return decodeURIComponent(raw); } catch { return String(raw); }
}
const fail = (status, error, extra = {}) => ({ status, headers: ERROR_HEADERS, jsonBody: { ok: false, error, ...extra } });

async function uploadHandler(request, deps = DEFAULT_DEPS, obs) {
  const auth = deps.requireBuilderAuth(request);
  if (!auth || !auth.ok) return auth && auth.response ? auth.response : fail(401, "Unauthorized");
  const declared = Number(request.headers && typeof request.headers.get === "function" ? request.headers.get("content-length") : 0);
  if (Number.isFinite(declared) && declared > MESH_ASSET_LIMITS.maxBytes) return fail(413, "حجم النموذج يتجاوز الحد المسموح (" + Math.floor(MESH_ASSET_LIMITS.maxBytes / (1024 * 1024)) + " MB).");
  const fileName = decodeFileName(request);
  if (!fileName || !fileName.toLowerCase().endsWith(".glb")) return fail(400, "يُقبل فقط ملف نموذج بصيغة .glb (glTF 2.0 ثنائي).");
  const buffer = Buffer.from(await request.arrayBuffer());
  if (!buffer.length) return fail(400, "الملف فارغ.");
  if (buffer.length > MESH_ASSET_LIMITS.maxBytes) return fail(413, "حجم النموذج يتجاوز الحد المسموح.");
  const report = inspectGlbAsset(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.length));
  if (!report.ok) {
    obs?.logInfo("mesh-assets.upload.rejected", { codes: report.issues.map(i => i.code).slice(0, 5) });
    return { status: 400, headers: ERROR_HEADERS, jsonBody: { ok: false, status: "rejected", error: "لم يجتز النموذج فحوص السلامة.", issues: report.issues } };
  }
  const container = await deps.getContainer();
  const result = await store.persistAsset(container, { buffer, summary: report.summary, ownerHash: store.ownerHashOf(auth.user.sub), fileName });
  obs?.logInfo("mesh-assets.upload." + result.status, { triangles: report.summary.triangles, parts: report.summary.parts.length, bytes: buffer.length });
  return { status: result.status === "created" ? 201 : 200, headers: ERROR_HEADERS, jsonBody: { ok: true, status: result.status, asset: result.record } };
}

async function listHandler(request, deps = DEFAULT_DEPS) {
  const auth = deps.requireBuilderAuth(request);
  if (!auth || !auth.ok) return auth && auth.response ? auth.response : fail(401, "Unauthorized");
  const container = await deps.getContainer();
  return { status: 200, headers: ERROR_HEADERS, jsonBody: { ok: true, assets: await store.listOwnerAssets(container, store.ownerHashOf(auth.user.sub)) } };
}

async function runtimeHandler(request, deps = DEFAULT_DEPS, obs) {
  const hash = String((request.params && request.params.hash) || "");
  if (!HEX64.test(hash)) return { status: 404, headers: ERROR_HEADERS, body: "Not found" };
  const container = await deps.getContainer();
  const asset = await store.loadAssetBytes(container, hash);
  if (!asset) return { status: 404, headers: ERROR_HEADERS, body: "Not found" };
  if (asset.corrupt) { obs?.logInfo("mesh-assets.runtime.integrity", { hash: hash.slice(0, 12) }); return { status: 500, headers: ERROR_HEADERS, body: "Integrity check failed" }; }
  return { status: 200, headers: { ...RUNTIME_HEADERS, "Content-Disposition": "attachment; filename=\"model-" + hash.slice(0, 12) + ".glb\"", "Content-Length": String(asset.buffer.length) }, body: asset.buffer };
}

app.http("meshAssetUpload", { methods: ["POST"], authLevel: "anonymous", route: "mesh-assets/upload", handler: withObservability("mesh-assets/upload", async (request, _ctx, obs) => uploadHandler(request, DEFAULT_DEPS, obs)) });
app.http("meshAssetList", { methods: ["GET"], authLevel: "anonymous", route: "mesh-assets", handler: withObservability("mesh-assets", async request => listHandler(request, DEFAULT_DEPS)) });
app.http("meshAssetRuntime", { methods: ["GET"], authLevel: "anonymous", route: "mesh-assets/runtime/{hash}", handler: withObservability("mesh-assets/runtime", async (request, _ctx, obs) => runtimeHandler(request, DEFAULT_DEPS, obs)) });

module.exports = { uploadHandler, listHandler, runtimeHandler, RUNTIME_HEADERS };
