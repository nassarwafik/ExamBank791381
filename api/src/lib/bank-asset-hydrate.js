// Bank image assets — durable identity vs. transient delivery credential (Phase 13B review fix 3).
//
// A bank question image is stored ONCE in the bank's assets container; `blobName` is its durable identity. The URL a
// browser can load (`/api/question-image?blob=…&exp=…&sig=…`) is a SIGNED, short-lived credential minted with
// createSignedAssetParams and checked by verifySignedAssetParams. Such a credential must never be treated as durable
// state: a persisted exam / assignment snapshot keeps only { id, origin: "bank", blobName, contentType }
// (normalizeBankAssetsForStorage), and every payload that delivers a bank image — a teacher reopening a saved exam, a
// student receiving an assignment — mints a fresh URL at delivery time (hydrateBankAssets).
//
// Scope: canonical question media only — exam.sections[].questions[] and legacy exam.questions[], each question's
// image.assets[] and compound parts[].image.assets[]. Uploaded / AI-generated embedded rasters (origin !== "bank") and
// anything with an unsafe blobName are returned by the SAME reference, untouched. Nothing here mutates its input: every
// changed node is copied on the way down (path copy), unchanged subtrees keep their identity. Never touches storage.
const { createSignedAssetParams } = require("./builder-auth");

const BANK_ASSET_TTL_SECONDS = 8 * 60 * 60;
const SAFE_BLOB_NAME = /^[A-Za-z0-9][A-Za-z0-9._\-/]{0,255}$/;

function isSafeBlobName(name) {
  return typeof name === "string" && SAFE_BLOB_NAME.test(name) && !name.includes("..") && !name.includes("//");
}
function isBankAsset(asset) {
  return !!asset && typeof asset === "object" && !Array.isArray(asset) && asset.origin === "bank" && isSafeBlobName(asset.blobName);
}

/** The durable form of a bank asset: identity only, no credential. */
function durableBankAsset(asset) {
  const out = { id: String(asset.id || asset.blobName), origin: "bank", blobName: asset.blobName };
  if (asset.contentType) out.contentType = String(asset.contentType);
  return out;
}
function isDurableForm(asset) {
  const keys = Object.keys(asset).sort().join(",");
  return (keys === "blobName,id,origin" || keys === "blobName,contentType,id,origin") && asset.id === String(asset.id || asset.blobName);
}

/** The ONE place a signed bank-image URL is built. */
function signedBankAssetUrl(blobName, ttlSeconds = BANK_ASSET_TTL_SECONDS) {
  const { exp, sig } = createSignedAssetParams(blobName, ttlSeconds);
  return "/api/question-image?blob=" + encodeURIComponent(blobName) + "&exp=" + encodeURIComponent(String(exp)) + "&sig=" + encodeURIComponent(sig);
}
/** A freshly signed delivery copy of a bank asset (the input is not modified). */
function signedBankAsset(asset, ttlSeconds = BANK_ASSET_TTL_SECONDS) {
  return { ...durableBankAsset(asset), dataUrl: signedBankAssetUrl(asset.blobName, ttlSeconds) };
}

// ── path-copying traversal of the canonical media tree ────────────────────────────────────────────────────────────
function mapArray(list, fn) {
  if (!Array.isArray(list)) return list;
  let out = null;
  for (let i = 0; i < list.length; i++) {
    const next = fn(list[i]);
    if (next !== list[i]) { if (!out) out = list.slice(); out[i] = next; }
  }
  return out || list;
}
function mapImage(image, assetFn) {
  if (!image || typeof image !== "object" || Array.isArray(image) || !Array.isArray(image.assets)) return image;
  const assets = mapArray(image.assets, a => (isBankAsset(a) ? assetFn(a) : a));
  return assets === image.assets ? image : { ...image, assets };
}
function mapNode(node, assetFn) {
  if (!node || typeof node !== "object") return node;
  const image = mapImage(node.image, assetFn);
  const parts = mapArray(node.parts, p => mapNode(p, assetFn));
  if (image === node.image && parts === node.parts) return node;
  const out = { ...node };
  if (image !== node.image) out.image = image;
  if (parts !== node.parts) out.parts = parts;
  return out;
}
// Phase 19G — a scenario IMAGE source reuses the canonical asset model: its single `image` asset is normalized / hydrated exactly like a
// question's media assets (durable identity in storage, a freshly signed delivery URL at delivery). Other source kinds are untouched.
function mapScenarioSources(scenarios, assetFn) {
  return mapArray(scenarios, sc => {
    if (!sc || typeof sc !== "object") return sc;
    const sources = mapArray(sc.sources, src => (src && typeof src === "object" && src.kind === "image" && isBankAsset(src.image) ? { ...src, image: assetFn(src.image) } : src));
    return sources === sc.sources ? sc : { ...sc, sources };
  });
}
function mapExamAssets(exam, assetFn) {
  if (!exam || typeof exam !== "object") return exam;
  const questions = mapArray(exam.questions, q => mapNode(q, assetFn));
  const sections = mapArray(exam.sections, s => {
    if (!s || typeof s !== "object") return s;
    const qs = mapArray(s.questions, q => mapNode(q, assetFn));
    const scenarios = mapScenarioSources(s.scenarios, assetFn);
    if (qs === s.questions && scenarios === s.scenarios) return s;
    const out = { ...s };
    if (qs !== s.questions) out.questions = qs;
    if (scenarios !== s.scenarios) out.scenarios = scenarios;
    return out;
  });
  if (questions === exam.questions && sections === exam.sections) return exam;
  const out = { ...exam };
  if (questions !== exam.questions) out.questions = questions;
  if (sections !== exam.sections) out.sections = sections;
  return out;
}

/** Delivery: every bank asset gets a fresh signed URL minted NOW. Non-bank assets and unsafe blob names are untouched. */
function hydrateBankAssets(exam, options = {}) {
  const ttl = Number(options.ttlSeconds) > 0 ? Number(options.ttlSeconds) : BANK_ASSET_TTL_SECONDS;
  return mapExamAssets(exam, a => signedBankAsset(a, ttl));
}
/** Persistence: bank assets keep only their durable identity (no dataUrl / exp / sig). Same reference when nothing changes. */
function normalizeBankAssetsForStorage(exam) {
  return mapExamAssets(exam, a => (isDurableForm(a) ? a : durableBankAsset(a)));
}
/** Question-level variants for callers that hold a single question. */
function hydrateBankAssetsInQuestion(question, options = {}) {
  const ttl = Number(options.ttlSeconds) > 0 ? Number(options.ttlSeconds) : BANK_ASSET_TTL_SECONDS;
  return mapNode(question, a => signedBankAsset(a, ttl));
}
function normalizeBankAssetsInQuestion(question) {
  return mapNode(question, a => (isDurableForm(a) ? a : durableBankAsset(a)));
}

module.exports = {
  BANK_ASSET_TTL_SECONDS, isSafeBlobName, isBankAsset, durableBankAsset, signedBankAssetUrl, signedBankAsset,
  hydrateBankAssets, normalizeBankAssetsForStorage, hydrateBankAssetsInQuestion, normalizeBankAssetsInQuestion
};
