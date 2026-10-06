// Phase 20A.1 — TRUSTED ASSETS for SmartSim plugins (pure; compiled into the shared server build).
//
// Future simulators need large, reviewed resources (an anatomy mesh, a terrain, a periodic-table dataset, textures, maps). They are
// NEVER loaded from a URL, a path or markup named by exam JSON. Instead the repository registers asset METADATA here, in code, under an
// EXACT identity (key + version, plus the content hash): exam JSON can only reference {assetKey, assetVersion[, kind][, sha256]}, and
// resolution is exact (human-body@1 ≠ human-body@2, no "latest", no substitution). The record's `source` is a LOGICAL, repository-relative
// name (letters, digits, dashes, single slashes, one safe extension) that a future trusted asset service maps to bytes; it is never a URL,
// never absolute, never traverses, and no active-content type (SVG, HTML, script, shader) exists. This phase ships NO asset (the
// production registry is empty); tests register tiny metadata fixtures.
import { isForbiddenName, isPlainObject, isSmartSimAssetKind, isSmartSimCapability } from "./trustedSimVocabulary";

export const SMART_SIM_ASSET_LIMITS = Object.freeze({ byteSize: 64 * 1024 * 1024, capabilities: 16, sourceChars: 160 });
export type SmartSimAssetRecord = Readonly<{ key: string; version: number; kind: string; mime: string; byteSize: number; sha256: string; source: string; capabilities: readonly string[] }>;
export type SmartSimAssetRef = { assetKey: string; assetVersion: number; kind?: string; sha256?: string };
export type SmartSimAssetIssue = { code: string; message: string; path?: string };

const ASSET_KEY = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const SHA256 = /^[0-9a-f]{64}$/;
const SOURCE = /^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*\.(png|jpg|webp|glb|json|bin)$/;
/** Allowed MIME types per kind (raster images, glTF binary meshes, JSON / binary data) — no markup, no script. */
const MIME: Readonly<Record<string, readonly string[]>> = Object.freeze({
  image: ["image/png", "image/jpeg", "image/webp"], texture: ["image/png", "image/jpeg", "image/webp"], map: ["image/png", "image/jpeg", "image/webp", "application/json"],
  mesh3d: ["model/gltf-binary"], anatomy: ["model/gltf-binary", "application/json"], molecule: ["application/json"],
  terrain: ["application/json", "application/octet-stream"], dataset: ["application/json"]
});
const RECORD_KEYS = ["byteSize", "capabilities", "key", "kind", "mime", "sha256", "source", "version"].join(",");
const isAssetKey = (v: unknown): v is string => typeof v === "string" && v.length >= 2 && v.length <= 64 && ASSET_KEY.test(v) && !isForbiddenName(v);
const isVersion = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 9999;
const id = (key: string, version: number) => key + "@" + version;
const assets = new Map<string, SmartSimAssetRecord>();

/** Registers a CODE-OWNED asset record (tests and future repository asset manifests only). Strict; refuses duplicates. Returns the unregister function. */
export function registerSmartSimAsset(raw: unknown): () => void {
  if (!isPlainObject(raw) || Object.keys(raw).sort().join(",") !== RECORD_KEYS) throw new Error("smartSim asset record: exact keys required");
  const { key, version, kind, mime, byteSize, sha256, source, capabilities } = raw;
  if (!isAssetKey(key)) throw new Error("smartSim asset: invalid key " + String(key));
  if (!isVersion(version)) throw new Error("smartSim asset " + key + ": invalid version");
  if (!isSmartSimAssetKind(kind)) throw new Error("smartSim asset " + key + ": unsupported kind " + String(kind));
  if (typeof mime !== "string" || !MIME[kind].includes(mime)) throw new Error("smartSim asset " + key + ": mime " + String(mime) + " not allowed for " + kind);
  if (typeof byteSize !== "number" || !Number.isInteger(byteSize) || byteSize < 1 || byteSize > SMART_SIM_ASSET_LIMITS.byteSize) throw new Error("smartSim asset " + key + ": invalid byteSize");
  if (typeof sha256 !== "string" || !SHA256.test(sha256)) throw new Error("smartSim asset " + key + ": sha256 (64 lowercase hex) required");
  if (typeof source !== "string" || source.length > SMART_SIM_ASSET_LIMITS.sourceChars || !SOURCE.test(source)) throw new Error("smartSim asset " + key + ": unsafe logical source");
  if (!Array.isArray(capabilities) || capabilities.length > SMART_SIM_ASSET_LIMITS.capabilities || !capabilities.every(isSmartSimCapability) || new Set(capabilities).size !== capabilities.length) throw new Error("smartSim asset " + key + ": invalid capabilities");
  const aid = id(key, version);
  if (assets.has(aid)) throw new Error("smartSim asset already registered: " + aid);
  const record: SmartSimAssetRecord = Object.freeze({ key, version, kind, mime, byteSize, sha256, source, capabilities: Object.freeze([...capabilities]) });
  assets.set(aid, record);
  return () => { if (assets.get(aid) === record) assets.delete(aid); };
}
/** The record registered for EXACTLY (key, version); undefined for anything else. */
export function resolveSmartSimAsset(key: unknown, version: unknown): SmartSimAssetRecord | undefined {
  if (!isAssetKey(key) || !isVersion(version)) return undefined;
  return assets.get(id(key, version));
}
/** Data-only listing (sorted by identity). */
export const listSmartSimAssets = (): { key: string; version: number; kind: string; mime: string; byteSize: number; sha256: string; source: string; capabilities: string[] }[] =>
  [...assets.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, r]) => ({ ...r, capabilities: [...r.capabilities] }));

/**
 * Validates an asset REFERENCE from exam JSON: exact keys {assetKey, assetVersion[, kind][, sha256]}, resolved exactly in the trusted
 * registry, optionally constrained by the caller to allowed kinds and required capabilities. Unknown ⇒ fail closed (never another version).
 */
export function validateSmartSimAssetRef(raw: unknown, opts: { kinds?: readonly string[]; capabilities?: readonly string[] } = {}): { ok: true; ref: SmartSimAssetRef } | { ok: false; issues: SmartSimAssetIssue[] } {
  const fail = (code: string, message: string) => ({ ok: false as const, issues: [{ code, message }] });
  if (!isPlainObject(raw)) return fail("SMARTSIM_ASSET_REF_INVALID", "مرجع المورد يجب أن يكون {assetKey, assetVersion}.");
  const keys = Object.keys(raw);
  if (keys.some(k => k !== "assetKey" && k !== "assetVersion" && k !== "kind" && k !== "sha256") || !isAssetKey(raw.assetKey) || !isVersion(raw.assetVersion)
    || (raw.kind !== undefined && !isSmartSimAssetKind(raw.kind)) || (raw.sha256 !== undefined && (typeof raw.sha256 !== "string" || !SHA256.test(raw.sha256))))
    return fail("SMARTSIM_ASSET_REF_INVALID", "مرجع المورد غير صالح: يُسمح فقط بمعرّف مورد موثوق وإصداره (لا روابط ولا مسارات).");
  const record = resolveSmartSimAsset(raw.assetKey, raw.assetVersion);
  if (!record) return fail("SMARTSIM_ASSET_UNKNOWN", "المورد " + raw.assetKey + "@" + raw.assetVersion + " غير مسجّل في مكتبة الموارد الموثوقة (لا يُستبدل بإصدار آخر).");
  if (raw.sha256 !== undefined && raw.sha256 !== record.sha256) return fail("SMARTSIM_ASSET_HASH_MISMATCH", "بصمة المورد لا تطابق المورد المسجّل.");
  if ((raw.kind !== undefined && raw.kind !== record.kind) || (opts.kinds && !opts.kinds.includes(record.kind))) return fail("SMARTSIM_ASSET_KIND_MISMATCH", "نوع المورد " + record.kind + " غير مناسب هنا.");
  if (opts.capabilities && opts.capabilities.some(c => !record.capabilities.includes(c))) return fail("SMARTSIM_ASSET_CAPABILITY_MISSING", "المورد لا يدعم القدرات المطلوبة.");
  const ref: SmartSimAssetRef = { assetKey: raw.assetKey, assetVersion: raw.assetVersion };
  if (raw.kind !== undefined) ref.kind = raw.kind;
  if (raw.sha256 !== undefined) ref.sha256 = raw.sha256 as string;
  return { ok: true, ref };
}
