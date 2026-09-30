const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { getContainer } = require("../lib/platform-storage");
const { validateSmartSimPackage, publicReport, SMARTSIM_LIMITS } = require("../lib/smartsim/package-validator");
const store = require("../lib/smartsim/package-store");
const { buildRuntimeHeaders, originOf } = require("../lib/smartsim/runtime-headers");
const { SMARTSIM_PACKAGE_ID_PATTERN, isSafePackagePath } = require("../lib/shared-finalization/smartsimManifest");

// Phase 16B-A — simulator package endpoints.
//   POST /api/simulators/upload                                       builder auth · raw binary body · x-file-name · server validates EVERYTHING
//   GET  /api/simulators                                              builder auth · the caller's own packages
//   GET  /api/simulators/{packageId}                                  builder auth · the caller's versions of one package
//   GET  /api/simulators/runtime/{packageId}/{packageVersion}/{hash}/{*assetPath}
//        PUBLIC BY DESIGN: content-addressed capability URL. The hash is an unguessable SHA-256 of the exact package; there is
//        no listing, no metadata, no archive download, no owner data and no auth token in the sandboxed frame. A published
//        exam pins (id, version, hash), so a student's frame loads exactly what was reviewed — never "latest".
// Handlers are exported with an injectable `deps` seam for tests; the registrations below bind the real dependencies.
const HEX64 = /^[0-9a-f]{64}$/;
const DEFAULT_DEPS = { getContainer, requireBuilderAuth };
const ALLOWED_UPLOAD_EXTENSIONS = [".smartsim", ".zip"];

function decodeFileName(request) {
  const raw = request.headers && typeof request.headers.get === "function" ? request.headers.get("x-file-name") : "";
  if (!raw) return "";
  try { return decodeURIComponent(raw); } catch { return String(raw); }
}
const fail = (status, error, extra = {}) => ({ status, jsonBody: { ok: false, error, ...extra } });

async function uploadHandler(request, deps = DEFAULT_DEPS, obs) {
  const auth = deps.requireBuilderAuth(request);
  if (!auth || !auth.ok) return auth && auth.response ? auth.response : fail(401, "Unauthorized");
  const declared = Number(request.headers && typeof request.headers.get === "function" ? request.headers.get("content-length") : 0);
  if (Number.isFinite(declared) && declared > SMARTSIM_LIMITS.maxArchiveBytes) return fail(413, "حجم الحزمة يتجاوز الحد المسموح (" + Math.floor(SMARTSIM_LIMITS.maxArchiveBytes / (1024 * 1024)) + " MB).");
  const fileName = decodeFileName(request);
  const lower = fileName.toLowerCase();
  if (!fileName || !ALLOWED_UPLOAD_EXTENSIONS.some(ext => lower.endsWith(ext))) return fail(400, "يُقبل فقط ملف .smartsim أو .zip.");
  const buffer = Buffer.from(await request.arrayBuffer());
  if (!buffer.length) return fail(400, "الملف فارغ.");
  if (buffer.length > SMARTSIM_LIMITS.maxArchiveBytes) return fail(413, "حجم الحزمة يتجاوز الحد المسموح.");
  const report = validateSmartSimPackage(buffer);
  if (!report.ok) {
    obs?.logInfo("simulators.upload.rejected", { codes: report.issues.filter(i => i.severity === "error").map(i => i.code).slice(0, 10) });
    return { status: 400, jsonBody: { ok: false, status: "rejected", error: "لم تجتز الحزمة فحوص السلامة.", report: publicReport(report) } };
  }
  const container = await deps.getContainer();
  const result = await store.persistPackage(container, { buffer, report, ownerHash: store.ownerHashOf(auth.user.sub) });
  const pub = publicReport(report);
  if (result.status === "conflict") {
    obs?.logInfo("simulators.upload.conflict", { packageId: report.manifest.packageId, packageVersion: report.manifest.packageVersion });
    const issue = { code: "VERSION_HASH_CONFLICT", severity: "error", message: "هذه النسخة موجودة بمحتوى مختلف. أنشئ إصدارًا جديدًا للمحاكي، مثل v" + (report.manifest.packageVersion + 1) + "." };
    return { status: 409, jsonBody: { ok: false, status: "conflict", error: issue.message, report: { ...pub, ok: false, issues: [...pub.issues, issue] }, existing: result.existing } };
  }
  obs?.logInfo("simulators.upload." + result.status, { packageId: report.manifest.packageId, packageVersion: report.manifest.packageVersion, fileCount: report.fileCount });
  return { status: result.status === "created" ? 201 : 200, jsonBody: { ok: true, status: result.status, package: result.record, report: pub } };
}

async function listHandler(request, deps = DEFAULT_DEPS) {
  const auth = deps.requireBuilderAuth(request);
  if (!auth || !auth.ok) return auth && auth.response ? auth.response : fail(401, "Unauthorized");
  const container = await deps.getContainer();
  const packages = await store.listOwnerPackages(container, store.ownerHashOf(auth.user.sub));
  return { status: 200, jsonBody: { ok: true, packages } };
}

async function versionsHandler(request, deps = DEFAULT_DEPS) {
  const auth = deps.requireBuilderAuth(request);
  if (!auth || !auth.ok) return auth && auth.response ? auth.response : fail(401, "Unauthorized");
  const packageId = String((request.params && request.params.packageId) || "");
  if (!SMARTSIM_PACKAGE_ID_PATTERN.test(packageId)) return fail(404, "المحاكي غير موجود.");
  const container = await deps.getContainer();
  const versions = await store.listOwnerPackageVersions(container, store.ownerHashOf(auth.user.sub), packageId);
  if (!versions.length) return fail(404, "المحاكي غير موجود.");
  return { status: 200, jsonBody: { ok: true, packageId, versions } };
}

const NOT_FOUND = Object.freeze({ status: 404, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }, jsonBody: { ok: false, error: "Not found" } });
function safeDecode(v) { try { return decodeURIComponent(String(v)); } catch { return null; } }

async function runtimeHandler(request, deps = DEFAULT_DEPS, obs) {
  const p = request.params || {};
  const packageId = String(p.packageId || ""), versionRaw = String(p.packageVersion || ""), hash = String(p.hash || "").toLowerCase();
  const assetPath = safeDecode(p.assetPath || p["*assetPath"] || "");
  // identity validation BEFORE any storage access: exact id pattern, positive integer version (never "latest"), 64-hex hash, safe file path
  if (!SMARTSIM_PACKAGE_ID_PATTERN.test(packageId) || !/^[1-9][0-9]{0,8}$/.test(versionRaw) || !HEX64.test(hash)) return NOT_FOUND;
  if (assetPath === null || !isSafePackagePath(assetPath) || assetPath.endsWith("/")) return NOT_FOUND;
  const container = await deps.getContainer();
  const record = await store.loadPackageRecordByHash(container, hash);
  if (!record || record.packageId !== packageId || record.packageVersion !== Number(versionRaw) || record.status !== "ready") return NOT_FOUND;
  const asset = await store.loadPackageAsset(container, hash, assetPath);
  if (!asset) { obs?.logInfo("simulators.runtime.missingAsset", { packageId, packageVersion: record.packageVersion }); return NOT_FOUND; }
  const headers = buildRuntimeHeaders({ contentType: asset.contentType, origin: originOf(request.url), packagePrefix: "/api/simulators/runtime/" + packageId + "/" + record.packageVersion + "/" + hash + "/", singleFile: true });
  return { status: 200, headers, body: asset.buffer };
}

app.http("simulatorUpload", { methods: ["POST"], authLevel: "anonymous", route: "simulators/upload", handler: withObservability("simulators/upload", async (request, _ctx, obs) => uploadHandler(request, DEFAULT_DEPS, obs)) });
app.http("simulatorList", { methods: ["GET"], authLevel: "anonymous", route: "simulators", handler: withObservability("simulators", async request => listHandler(request, DEFAULT_DEPS)) });
app.http("simulatorVersions", { methods: ["GET"], authLevel: "anonymous", route: "simulators/{packageId}", handler: withObservability("simulators/{packageId}", async request => versionsHandler(request, DEFAULT_DEPS)) });
app.http("simulatorRuntime", { methods: ["GET"], authLevel: "anonymous", route: "simulators/runtime/{packageId}/{packageVersion}/{hash}/{*assetPath}", handler: withObservability("simulators/runtime", async (request, _ctx, obs) => runtimeHandler(request, DEFAULT_DEPS, obs)) });

module.exports = { uploadHandler, listHandler, versionsHandler, runtimeHandler };
