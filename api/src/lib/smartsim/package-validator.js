// Phase 16B-A — the SERVER-AUTHORITATIVE SmartSim package validator. Uploaded archives are attacker-controlled: the file name,
// declared MIME, ZIP metadata, member names and manifest are never trusted. The validator (1) checks the raw bytes and limits,
// (2) parses the central directory defensively, (3) refuses traversal / absolute / UNC / NUL / symlink / duplicate paths and
// nested archives, (4) inflates each runtime member through the bounded reader, (5) enforces the static file-type
// allow-list for everything under dist/, (6) validates manifest.json (shared contract) and the entry document, (7) scans
// HTML / JS / CSS / SVG for external resources (defense in depth ahead of the sandbox + CSP) and (8) computes the package hash
// as the SHA-256 of the EXACT uploaded bytes. It NEVER executes, builds or transpiles anything (no npm / tsc / vite / eval).
const crypto = require("node:crypto");
const { hasZipMagic, listEntries, readEntry, ZipError } = require("./zip-reader");
const { contentTypeFor, isArchivePath, isScannedPath, isHtmlPath } = require("./mime-map");
const { validateSmartSimManifest, isSafePackagePath, isInsideDist, SMARTSIM_DIST_PREFIX } = require("../shared-finalization/smartsimManifest");

const SMARTSIM_LIMITS = Object.freeze({
  maxArchiveBytes: 15 * 1024 * 1024,        // the uploaded .smartsim / .zip itself
  maxUncompressedBytes: 30 * 1024 * 1024,   // every runtime member inflated
  maxFileBytes: 10 * 1024 * 1024,           // one member
  maxFileCount: 500,
  maxCompressionRatio: 100,                 // per member and overall, once a member exceeds RATIO_FLOOR_BYTES
  maxManifestBytes: 64 * 1024
});
const RATIO_FLOOR_BYTES = 8 * 1024;
const MANIFEST_NAME = "manifest.json";

const err = (code, message, path) => ({ code, message, severity: "error", ...(path ? { path } : {}) });
const warn = (code, message, path) => ({ code, message, severity: "warning", ...(path ? { path } : {}) });
const sha256 = buf => "sha256:" + crypto.createHash("sha256").update(buf).digest("hex");

/** Normalizes a member name for identity: strips leading "./" segments only (nothing else is rewritten). */
function normalizeName(raw) { let n = String(raw); while (n.startsWith("./")) n = n.slice(2); return n; }

// ── external resource scan ────────────────────────────────────────────────────────────────────────────────────────────
const EXTERNAL_URL = /^(?:https?:)?\/\/|^(?:ftp|ws|wss):/i;
const ATTR_URL = /<(script|link|img|iframe|frame|base|video|audio|source|track|object|embed|form|a|use|image)\b[^>]*?\s(?:src|href|action|data|xlink:href|poster|srcset)\s*=\s*(["']?)\s*([^"'\s>]+)/gi;
const CSS_URL = /url\(\s*(["']?)([^"')]+)\1\s*\)|@import\s+(?:url\()?\s*["']?([^"')\s;]+)/gi;
const JS_NETWORK = /\bfetch\s*\(|\bXMLHttpRequest\b|\bnew\s+WebSocket\s*\(|\bnew\s+EventSource\s*\(|\bnavigator\s*\.\s*sendBeacon\s*\(|\bimportScripts\s*\(|\bnavigator\s*\.\s*serviceWorker\b|\bimport\s*\(\s*["'`](?:https?:)?\/\//;
function scanExternalResources(path, text) {
  const found = [];
  const html = isHtmlPath(path) || /\.svg$/i.test(path);
  if (html) {
    for (const m of text.matchAll(ATTR_URL)) if (EXTERNAL_URL.test(m[3])) found.push({ path, kind: m[1].toLowerCase(), url: m[3].slice(0, 200) });
    for (const m of text.matchAll(/<base\b[^>]*>/gi)) if (!/href\s*=/i.test(m[0]) ? false : true) { /* handled by ATTR_URL when external */ }
  }
  if (/\.css$/i.test(path) || html) for (const m of text.matchAll(CSS_URL)) { const u = m[2] || m[3]; if (u && EXTERNAL_URL.test(u)) found.push({ path, kind: "css", url: u.slice(0, 200) }); }
  if (/\.(m?js)$/i.test(path) || html) {
    const scripts = html ? [...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).join("\n") + " " + [...text.matchAll(/\son[a-z]+\s*=\s*(["'])([\s\S]*?)\1/gi)].map(m => m[2]).join("\n") : text;
    const m = JS_NETWORK.exec(scripts);
    if (m) found.push({ path, kind: "network-api", url: m[0].trim().slice(0, 60) });
  }
  return found;
}

/**
 * validateSmartSimPackage(buffer, { limits }) → report
 * report: { ok, manifest, packageHash, fileCount, compressedBytes, uncompressedBytes, files:[{path, bytes, contentType, data}],
 *           externalResources, selfContained, ignoredPaths, issues:[{code, severity, path?, message}] }
 * `files[].data` holds the inflated bytes of the RUNTIME set (manifest.json + dist/**) so the store persists exactly what
 * was validated; callers that only report strip it.
 */
function validateSmartSimPackage(buffer, options = {}) {
  const limits = { ...SMARTSIM_LIMITS, ...(options.limits || {}) };
  const issues = [], files = [], ignoredPaths = [], externalResources = [];
  const report = { ok: false, manifest: null, packageHash: null, fileCount: 0, compressedBytes: 0, uncompressedBytes: 0, files, externalResources, selfContained: true, ignoredPaths, issues };
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  report.compressedBytes = buf.length;
  if (buf.length > limits.maxArchiveBytes) { issues.push(err("ARCHIVE_TOO_LARGE", "حجم الحزمة يتجاوز الحد المسموح (" + Math.floor(limits.maxArchiveBytes / (1024 * 1024)) + " MB).")); return report; }
  if (!hasZipMagic(buf)) { issues.push(err("INVALID_ZIP", "الملف ليس أرشيف ZIP / .smartsim صالحًا.")); return report; }
  report.packageHash = sha256(buf);
  let entries;
  try { entries = listEntries(buf, { maxEntries: Math.max(limits.maxFileCount * 4, 1000) }); }
  catch (e) { issues.push(err(e instanceof ZipError ? e.code : "INVALID_ZIP", e.message)); return report; }

  // ── structure pass: names, kinds, duplicates, declared sizes (nothing inflated yet) ────────────────────────────────
  const seen = new Map();                                   // lower-cased normalized name → original
  const runtime = [];                                       // entries that will be inflated + persisted
  let declaredTotal = 0, fileEntries = 0;
  for (const e of entries) {
    if (e.isDirectory) continue;
    fileEntries++;
    const name = normalizeName(e.name);
    if (e.isSymlink) { issues.push(err("SYMLINK_NOT_ALLOWED", "الروابط الرمزية غير مسموحة داخل الحزمة.", e.name)); continue; }
    if (!isSafePackagePath(name)) { issues.push(err("PATH_TRAVERSAL", "مسار غير آمن داخل الأرشيف.", e.name)); continue; }
    const key = name.toLowerCase();
    if (seen.has(key)) { issues.push(err("DUPLICATE_PATH", "مسار مكرر (أو متطابق باختلاف حالة الأحرف): " + name, e.name)); continue; }
    seen.set(key, name);
    if (isArchivePath(name)) { issues.push(err("NESTED_ARCHIVE", "الأرشيفات المتداخلة غير مسموحة.", name)); continue; }
    declaredTotal += e.uncompressedSize;
    const isManifest = name === MANIFEST_NAME, inDist = isInsideDist(name);
    if (!isManifest && !inDist) { ignoredPaths.push(name); continue; }
    if (inDist && contentTypeFor(name) === null) { issues.push(err("UNSUPPORTED_FILE_TYPE", "نوع ملف غير مسموح داخل dist/: " + name, name)); continue; }
    if (e.uncompressedSize > (isManifest ? limits.maxManifestBytes : limits.maxFileBytes)) { issues.push(err("FILE_TOO_LARGE", "حجم الملف يتجاوز الحد المسموح: " + name, name)); continue; }
    if (e.compressedSize > 0 && e.uncompressedSize > RATIO_FLOOR_BYTES && e.uncompressedSize / e.compressedSize > limits.maxCompressionRatio) { issues.push(err("ZIP_BOMB", "نسبة ضغط مريبة للملف: " + name, name)); continue; }
    runtime.push({ entry: e, name, isManifest });
  }
  if (fileEntries > limits.maxFileCount) issues.push(err("TOO_MANY_FILES", "عدد الملفات (" + fileEntries + ") يتجاوز الحد المسموح (" + limits.maxFileCount + ")."));
  if (declaredTotal > limits.maxUncompressedBytes) issues.push(err("PACKAGE_TOO_LARGE", "الحجم الكلي للحزمة بعد فك الضغط يتجاوز الحد المسموح."));
  if (ignoredPaths.length) issues.push(warn("SOURCE_IGNORED", "تم تجاهل " + ignoredPaths.length + " ملفًا خارج dist/ (مثل source/ و README) — لا تُخزَّن ولا تُنفَّذ."));
  if (issues.some(i => i.severity === "error")) return report;

  // ── content pass: bounded inflate of the runtime set ──────────────────────────────────────────────────────────────
  let total = 0, manifestRaw = null;
  for (const r of runtime) {
    let data;
    try { data = readEntry(buf, r.entry, { maxBytes: r.isManifest ? limits.maxManifestBytes : limits.maxFileBytes }); }
    catch (e) { issues.push(err(e instanceof ZipError ? e.code : "INVALID_ZIP", e.message, r.name)); continue; }
    total += data.length;
    if (total > limits.maxUncompressedBytes) { issues.push(err("PACKAGE_TOO_LARGE", "الحجم الكلي للحزمة بعد فك الضغط يتجاوز الحد المسموح.")); break; }
    if (r.isManifest) manifestRaw = data;
    files.push({ path: r.name, bytes: data.length, contentType: r.isManifest ? "application/json; charset=utf-8" : contentTypeFor(r.name), data });
  }
  report.uncompressedBytes = total; report.fileCount = files.length;
  if (buf.length > 0 && total > RATIO_FLOOR_BYTES && total / buf.length > limits.maxCompressionRatio) issues.push(err("ZIP_BOMB", "نسبة الضغط الكلية للحزمة مريبة."));
  if (issues.some(i => i.severity === "error")) return report;

  // ── manifest + entry ──────────────────────────────────────────────────────────────────────────────────────────────
  if (!manifestRaw) { issues.push(err("MANIFEST_MISSING", "manifest.json مفقود في جذر الحزمة.")); return report; }
  let parsed;
  try { parsed = JSON.parse(manifestRaw.toString("utf8")); } catch { issues.push(err("MANIFEST_INVALID", "manifest.json ليس JSON صالحًا.", MANIFEST_NAME)); return report; }
  const mv = validateSmartSimManifest(parsed);
  if (!mv.ok) { issues.push(err("MANIFEST_INVALID", "manifest.json غير صالح.", MANIFEST_NAME), ...mv.issues.map(i => ({ ...i, path: MANIFEST_NAME + (i.path ? "#" + i.path : "") }))); return report; }
  report.manifest = mv.manifest;
  const entryPath = mv.manifest.entry;
  if (!isInsideDist(entryPath)) { issues.push(err("ENTRY_OUTSIDE_DIST", "ملف الدخول يجب أن يكون داخل dist/.", entryPath)); return report; }
  const entryFile = files.find(f => f.path === entryPath);
  if (!entryFile) { issues.push(err("ENTRY_MISSING", "ملف الدخول المذكور في manifest غير موجود داخل dist/: " + entryPath + ". يجب رفع نسخة مبنية (dist/) وليس المصدر فقط.", entryPath)); return report; }
  if (!isHtmlPath(entryPath)) { issues.push(err("ENTRY_NOT_HTML", "ملف الدخول يجب أن يكون HTML.", entryPath)); return report; }

  // ── external resources (defense in depth; the sandbox + CSP block them anyway) ───────────────────────────────────
  for (const f of files) {
    if (f.path === MANIFEST_NAME || !isScannedPath(f.path)) continue;
    const found = scanExternalResources(f.path, f.data.toString("utf8"));
    for (const x of found) { externalResources.push(x); }
    if (found.length) issues.push(err("EXTERNAL_RESOURCE", "الحزمة تشير إلى مورد خارجي أو تستخدم الشبكة (" + found[0].kind + ": " + found[0].url + "). يجب أن تكون المحاكاة ذاتية الاحتواء.", f.path));
  }
  report.selfContained = externalResources.length === 0;
  report.ok = !issues.some(i => i.severity === "error");
  return report;
}

/** The report without member bytes (what handlers return to the client). */
function publicReport(report) {
  return { ok: report.ok, packageHash: report.packageHash, fileCount: report.fileCount, compressedBytes: report.compressedBytes, uncompressedBytes: report.uncompressedBytes, selfContained: report.selfContained, externalResources: report.externalResources, ignoredPaths: report.ignoredPaths, files: report.files.map(f => ({ path: f.path, bytes: f.bytes, contentType: f.contentType })), issues: report.issues };
}

module.exports = { validateSmartSimPackage, publicReport, SMARTSIM_LIMITS, SMARTSIM_DIST_PREFIX, scanExternalResources };
