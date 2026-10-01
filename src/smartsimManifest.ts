// Phase 16B-A — SmartSim manifest V1 + the exact simulation PACKAGE REFERENCE a question persists. Pure (no React, no DOM,
// no I/O): compiled into the shared server build so the Builder, finalization and the server validate the SAME contract.
//
// Two identities are deliberately distinct and never confused:
//   • runtime identity  — the question TYPE `simulation@1` (catalog key + questionTypeVersion; owned by the platform code);
//   • package identity  — `packageId@packageVersion` + `packageHash` (owned by the teacher's uploaded package).
// A question persists the EXACT package reference {packageId, packageVersion, packageHash, runtimeVersion}; "latest" is never
// a valid value anywhere, so review → approve → publish can never substitute a different package.

export const SMARTSIM_MANIFEST_SCHEMA_VERSION = 1;
/** The runtime protocol / host contract version a package targets (SmartSimBridgeV1). */
export const SIMULATION_RUNTIME_VERSION = 1;
export const SMARTSIM_SUPPORTED_RUNTIME_VERSIONS: readonly number[] = Object.freeze([1]);
export const SMARTSIM_SUPPORTED_RESPONSE_SCHEMA_VERSIONS: readonly number[] = Object.freeze([1]);
export const SMARTSIM_PACKAGE_ID_PATTERN = /^[a-z][a-z0-9-]{1,63}$/;
export const SMARTSIM_PACKAGE_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
export const SMARTSIM_TITLE_MAX = 120;
export const SMARTSIM_DESCRIPTION_MAX = 1000;
export const SMARTSIM_PATH_MAX = 255;
export const SMARTSIM_DIST_PREFIX = "dist/";

export type SmartSimCapabilities = { autosave?: boolean; restore?: boolean; reset?: boolean; partialCredit?: boolean; offline?: boolean };
export type SmartSimManifestV1 = {
  schemaVersion: 1;
  packageId: string;
  packageVersion: number;
  title: string;
  description?: string;
  /** Entry document, relative to the archive root and ALWAYS inside dist/ (only dist/ executes). */
  entry: string;
  runtime: "web";
  runtimeVersion: number;
  responseSchemaVersion: number;
  capabilities: SmartSimCapabilities;
};
export type SmartSimIssue = { code: string; message: string; severity: "error" | "warning"; path?: string };
export type SmartSimManifestResult = { ok: true; manifest: SmartSimManifestV1; issues: SmartSimIssue[] } | { ok: false; manifest?: undefined; issues: SmartSimIssue[] };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const issue = (code: string, message: string, path?: string): SmartSimIssue => ({ code, message, severity: "error", path });
const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const DRIVE = /^[a-zA-Z]:/;
/** True when the string carries an ASCII control character (NUL, tab, newline, DEL …) — a char-code loop, so the generated
 *  server copy carries no control-character regex. */
function hasControlChar(s: string): boolean { for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c < 0x20 || c === 0x7f) return true; } return false; }

/** A SAFE relative package path: no scheme, no absolute / drive / UNC form, no backslash, no `.` / `..` segment, no control
 *  characters, no empty segment, bounded length. Used for manifest entries, archive member names and runtime asset paths. */
export function isSafePackagePath(p: unknown): p is string {
  if (typeof p !== "string" || p.length === 0 || p.length > SMARTSIM_PATH_MAX) return false;
  if (hasControlChar(p) || p.includes("\\") || p.startsWith("/") || p.startsWith("//") || DRIVE.test(p) || SCHEME.test(p)) return false;
  const segments = p.split("/");
  for (const s of segments) if (s === "" || s === "." || s === "..") return false;
  return true;
}
/** True when the safe path lives inside dist/ (and is not dist/ itself). */
export const isInsideDist = (p: string): boolean => p.startsWith(SMARTSIM_DIST_PREFIX) && p.length > SMARTSIM_DIST_PREFIX.length;
export const isHtmlPath = (p: string): boolean => /\.html?$/i.test(p);

export function validateSmartSimManifest(raw: unknown): SmartSimManifestResult {
  const issues: SmartSimIssue[] = [];
  if (!isObj(raw)) return { ok: false, issues: [issue("MANIFEST_INVALID", "manifest.json يجب أن يكون كائن JSON.")] };
  if (raw.schemaVersion !== SMARTSIM_MANIFEST_SCHEMA_VERSION) issues.push(issue("MANIFEST_SCHEMA_VERSION", "schemaVersion غير مدعوم: " + String(raw.schemaVersion) + " (المدعوم: 1).", "schemaVersion"));
  if (typeof raw.packageId !== "string" || !SMARTSIM_PACKAGE_ID_PATTERN.test(raw.packageId)) issues.push(issue("MANIFEST_PACKAGE_ID", "packageId يجب أن يكون معرّفًا ثابتًا بأحرف لاتينية صغيرة وأرقام وشرطات (2–64 حرفًا، يبدأ بحرف).", "packageId"));
  if (!Number.isInteger(raw.packageVersion) || (raw.packageVersion as number) < 1) issues.push(issue("MANIFEST_PACKAGE_VERSION", "packageVersion يجب أن يكون عددًا صحيحًا موجبًا (1، 2، 3…).", "packageVersion"));
  if (typeof raw.title !== "string" || !raw.title.trim() || raw.title.length > SMARTSIM_TITLE_MAX) issues.push(issue("MANIFEST_TITLE", "title مطلوب (حتى " + SMARTSIM_TITLE_MAX + " حرفًا).", "title"));
  if (raw.description !== undefined && (typeof raw.description !== "string" || raw.description.length > SMARTSIM_DESCRIPTION_MAX)) issues.push(issue("MANIFEST_DESCRIPTION", "description يجب أن يكون نصًا (حتى " + SMARTSIM_DESCRIPTION_MAX + " حرف).", "description"));
  if (!isSafePackagePath(raw.entry) || !isInsideDist(raw.entry)) issues.push(issue("ENTRY_UNSAFE", "entry يجب أن يكون مسارًا نسبيًا آمنًا داخل dist/ (مثل dist/index.html).", "entry"));
  if (raw.runtime !== "web") issues.push(issue("MANIFEST_RUNTIME", "runtime يجب أن يكون \"web\".", "runtime"));
  if (!Number.isInteger(raw.runtimeVersion) || !SMARTSIM_SUPPORTED_RUNTIME_VERSIONS.includes(raw.runtimeVersion as number)) issues.push(issue("RUNTIME_UNSUPPORTED", "runtimeVersion غير مدعوم: " + String(raw.runtimeVersion) + " (المدعوم: " + SMARTSIM_SUPPORTED_RUNTIME_VERSIONS.join(", ") + ").", "runtimeVersion"));
  if (!Number.isInteger(raw.responseSchemaVersion) || !SMARTSIM_SUPPORTED_RESPONSE_SCHEMA_VERSIONS.includes(raw.responseSchemaVersion as number)) issues.push(issue("RESPONSE_SCHEMA_UNSUPPORTED", "responseSchemaVersion غير مدعوم: " + String(raw.responseSchemaVersion) + ".", "responseSchemaVersion"));
  if (!isObj(raw.capabilities)) issues.push(issue("MANIFEST_CAPABILITIES", "capabilities يجب أن يكون كائنًا (autosave / restore / reset / partialCredit / offline).", "capabilities"));
  else for (const [k, v] of Object.entries(raw.capabilities)) if (typeof v !== "boolean") issues.push(issue("MANIFEST_CAPABILITIES", "capabilities." + k + " يجب أن يكون true/false.", "capabilities." + k));
  if (issues.length) return { ok: false, issues };
  const caps = raw.capabilities as Record<string, boolean>;
  const manifest: SmartSimManifestV1 = {
    schemaVersion: 1, packageId: raw.packageId as string, packageVersion: raw.packageVersion as number, title: (raw.title as string).trim(),
    entry: raw.entry as string, runtime: "web", runtimeVersion: raw.runtimeVersion as number, responseSchemaVersion: raw.responseSchemaVersion as number,
    capabilities: { autosave: caps.autosave === true, restore: caps.restore === true, reset: caps.reset === true, partialCredit: caps.partialCredit === true, offline: caps.offline === true }
  };
  if (typeof raw.description === "string" && raw.description.trim()) manifest.description = raw.description.trim();
  return { ok: true, manifest, issues };
}

// ── The persisted question reference ─────────────────────────────────────────────────────────────────────────────────
/** What a `simulation` question persists. `entry` is relative to dist/ (as served); `title` is a display copy of the
 *  manifest title at selection time; `scenario` / `publicConfig` are STUDENT-VISIBLE JSON objects handed to the simulator
 *  (secrets never belong here — the sanitizer additionally strips secret-named keys). */
export type SimulationQuestionConfig = {
  packageId: string;
  packageVersion: number;
  packageHash: string;
  runtimeVersion: number;
  entry?: string;
  title?: string;
  scenario?: Record<string, unknown>;
  publicConfig?: Record<string, unknown>;
};

/** Validates the exact reference. Every problem is BLOCKING for finalization; nothing here resolves "latest". */
export function validateSimulationReference(cfg: unknown): SmartSimIssue[] {
  if (!isObj(cfg)) return [issue("SIM_PACKAGE_MISSING", "لم يتم اختيار حزمة محاكاة لهذا السؤال. اختر محاكيًا من المكتبة أو ارفع حزمة .smartsim.", "simulation")];
  const out: SmartSimIssue[] = [];
  if (typeof cfg.packageId !== "string" || !SMARTSIM_PACKAGE_ID_PATTERN.test(cfg.packageId)) out.push(issue("SIM_PACKAGE_ID_INVALID", "معرّف حزمة المحاكاة غير صالح.", "simulation.packageId"));
  if (!Number.isInteger(cfg.packageVersion) || (cfg.packageVersion as number) < 1) out.push(issue("SIM_PACKAGE_VERSION_INVALID", "إصدار حزمة المحاكاة يجب أن يكون رقمًا صحيحًا محددًا (لا \"latest\").", "simulation.packageVersion"));
  if (typeof cfg.packageHash !== "string" || !SMARTSIM_PACKAGE_HASH_PATTERN.test(cfg.packageHash)) out.push(issue("SIM_PACKAGE_HASH_INVALID", "بصمة حزمة المحاكاة (sha256) مفقودة أو غير صالحة؛ يجب تثبيت الحزمة بالضبط.", "simulation.packageHash"));
  if (!Number.isInteger(cfg.runtimeVersion) || !SMARTSIM_SUPPORTED_RUNTIME_VERSIONS.includes(cfg.runtimeVersion as number)) out.push(issue("SIM_RUNTIME_UNSUPPORTED", "إصدار بيئة تشغيل المحاكاة غير مدعوم.", "simulation.runtimeVersion"));
  if (cfg.entry !== undefined && (!isSafePackagePath(cfg.entry) || !isHtmlPath(cfg.entry))) out.push(issue("SIM_ENTRY_UNSAFE", "مسار ملف الدخول للمحاكاة غير آمن.", "simulation.entry"));
  if (cfg.title !== undefined && (typeof cfg.title !== "string" || cfg.title.length > SMARTSIM_TITLE_MAX)) out.push(issue("SIM_TITLE_INVALID", "عنوان المحاكاة غير صالح.", "simulation.title"));
  if (cfg.scenario !== undefined && !isObj(cfg.scenario)) out.push(issue("SIM_SCENARIO_INVALID", "سيناريو المحاكاة يجب أن يكون كائن JSON.", "simulation.scenario"));
  if (cfg.publicConfig !== undefined && !isObj(cfg.publicConfig)) out.push(issue("SIM_PUBLIC_CONFIG_INVALID", "الإعدادات العامة للمحاكاة يجب أن تكون كائن JSON.", "simulation.publicConfig"));
  return out;
}
/** The exact, minimal reference (identity fields only + entry/title) built from a validated package record. */
export function simulationReferenceOf(pkg: { packageId: string; packageVersion: number; packageHash: string; runtimeVersion: number; entry?: string; title?: string }): SimulationQuestionConfig {
  const ref: SimulationQuestionConfig = { packageId: pkg.packageId, packageVersion: pkg.packageVersion, packageHash: pkg.packageHash, runtimeVersion: pkg.runtimeVersion };
  if (typeof pkg.entry === "string" && pkg.entry) ref.entry = pkg.entry;
  if (typeof pkg.title === "string" && pkg.title) ref.title = pkg.title;
  return ref;
}
