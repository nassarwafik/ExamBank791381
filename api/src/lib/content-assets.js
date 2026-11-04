// Tadris+ P5-C — risk S7, owner decision D10: the course drawings and the exam library's question images are PROTECTED content.
//
// They used to be public static files (/learning-assets/…, /exam-library/assets/…). They now ship with the API, under
// api/src/data/content-assets/ (never in the static site; scripts/check-protected-assets.mjs fails the build if one comes back),
// and a browser loads one only through GET /api/content-asset with a short-lived SIGNED URL — minted by the server inside a
// payload whose own gate already passed (a course module, a library item, an exam / assignment snapshot).
//
// Durable identity vs. delivery credential (the same model as bank images, bank-asset-hydrate.js):
//   • the STORED form never changes: the old path ("/exam-library/assets/F01/<sha16>.png", "/learning-assets/<course>/<sha16>.png")
//     stays the identity inside course bodies (the book lock), library items, saved exams, governance revisions and every
//     published assignment — nothing stored is migrated;
//   • DELIVERY replaces that path with a signed URL (signContentAssets); a signed URL a browser sends back is stored as the path
//     again (normalizeContentAssets), so no expiring credential is ever persisted.
// Signing is WINDOWED: inside one window every URL is identical (the browser's image cache and the module ETag stay stable) and
// is valid for at least one more full window. Keys: an HMAC key derived from the server's signing secret for this context only,
// so no other signed value (bank-image URLs, tokens) verifies here and vice versa. Without a signing secret nothing is signed and
// the stored path is delivered unchanged (the image is then unavailable — the payload itself is never refused for it).
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { getSigningSecret } = require("./builder-auth");

const ROOT = path.join(__dirname, "../data/content-assets");
const WINDOW_SECONDS = 4 * 60 * 60;
const ROUTE = "/api/content-asset";
// the two stored spellings ↔ the protected tree
const KINDS = Object.freeze([
  { kind: "exam-library", durable: "/exam-library/assets/" },
  { kind: "learning", durable: "/learning-assets/" }
]);
const REL = /^(exam-library|learning)\/[A-Za-z0-9_-]{1,64}\/[a-f0-9]{16}\.(png|jpg|gif|webp)$/;
const CONTENT_TYPES = Object.freeze({ png: "image/png", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp" });

const isSafeRel = rel => typeof rel === "string" && REL.test(rel);

/** The protected path ("exam-library/F01/<sha16>.png") of a stored path or of a signed URL; null for anything else. */
function contentAssetPathOf(value) {
  if (typeof value !== "string" || value.length > 512) return null;
  for (const k of KINDS) {
    if (value.startsWith(k.durable)) { const rel = k.kind + "/" + value.slice(k.durable.length); return isSafeRel(rel) ? rel : null; }
  }
  if (value.startsWith(ROUTE + "?")) {
    let p;
    try { p = new URLSearchParams(value.slice(ROUTE.length + 1)).get("p"); } catch { return null; }
    return isSafeRel(p) ? p : null;
  }
  return null;
}
/** The stored (durable) spelling of a protected path. */
function durablePathOf(rel) {
  const k = KINDS.find(x => rel.startsWith(x.kind + "/"));
  return k.durable + rel.slice(k.kind.length + 1);
}

function signingKey() {
  const secret = getSigningSecret();
  return secret ? crypto.createHmac("sha256", secret).update("tadris-content-asset-v1").digest() : null;
}
const nowSeconds = nowMs => Math.floor((Number.isFinite(nowMs) ? nowMs : Date.now()) / 1000);
/** The signing window a moment falls in (also folded into ETags of payloads that carry signed URLs). */
function windowOf(nowMs) { return Math.floor(nowSeconds(nowMs) / WINDOW_SECONDS); }
const signatureOf = (key, rel, exp) => crypto.createHmac("sha256", key).update("content-asset\n" + exp + "\n" + rel).digest("base64url");

/** A signed delivery URL for a protected path (null when the server has no signing secret). */
function signedContentAssetUrl(rel, nowMs) {
  const key = signingKey();
  if (!key || !isSafeRel(rel)) return null;
  const exp = (windowOf(nowMs) + 2) * WINDOW_SECONDS;
  return ROUTE + "?p=" + encodeURIComponent(rel) + "&exp=" + exp + "&sig=" + signatureOf(key, rel, exp);
}
/** Checks a delivery URL's parameters BEFORE anything is read: safe path, not expired, not too far ahead, exact signature. */
function verifyContentAssetSignature(rel, exp, sig, nowMs) {
  const key = signingKey();
  const expiry = Number(exp);
  const now = nowSeconds(nowMs);
  if (!key || !isSafeRel(rel) || !/^\d{1,12}$/.test(String(exp)) || expiry <= now || expiry > now + 3 * WINDOW_SECONDS) return false;
  const expected = Buffer.from(signatureOf(key, rel, expiry));
  const supplied = Buffer.from(String(sig || ""));
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

// path-copying deep rewrite: every string that IS a protected-asset reference is replaced; same reference when nothing changes
function rewrite(value, fn) {
  if (typeof value === "string") { const rel = contentAssetPathOf(value); if (!rel) return value; const next = fn(rel); return next == null ? value : next; }
  if (Array.isArray(value)) {
    let out = null;
    for (let i = 0; i < value.length; i++) { const n = rewrite(value[i], fn); if (n !== value[i]) { if (!out) out = value.slice(); out[i] = n; } }
    return out || value;
  }
  if (value && typeof value === "object") {
    let out = null;
    for (const k of Object.keys(value)) { const n = rewrite(value[k], fn); if (n !== value[k]) { if (!out) out = { ...value }; out[k] = n; } }
    return out || value;
  }
  return value;
}
/** Delivery: every protected-asset reference becomes this window's signed URL. */
function signContentAssets(value, nowMs) {
  if (!signingKey()) return value;
  return rewrite(value, rel => signedContentAssetUrl(rel, nowMs));
}
/** Persistence: every protected-asset reference (a signed URL included) is stored as its durable path. */
function normalizeContentAssets(value) {
  return rewrite(value, rel => durablePathOf(rel));
}
/** Whether a payload carries any protected-asset reference. */
function hasContentAssets(value) {
  let found = false;
  rewrite(value, () => { found = true; return null; });
  return found;
}

/**
 * A payload's delivery copy for one window, memoized by (its stored ETag, window): `{ value, etag }`. A payload without any
 * protected-asset reference (or a server without a signing secret) is returned exactly as stored, with its stored ETag. Otherwise
 * the ETag is folded with the window (same 22-character strong form), so a 304 is only ever answered inside the window whose
 * signed URLs the browser holds — a body kept from an earlier window is replaced, never served with expired URLs.
 */
const deliveryMemo = new Map();
const MEMO_MAX = 128;
// Tadris+ P9-B1 (acceptance test #5) — the memoized copy is shared by every request of the window, like the frozen value it was
// made from: it is deep-frozen too (the path-copy's new nodes; the untouched branches are the original frozen ones), so no caller
// can change what the next request receives.
function deepFreeze(v) {
  if (v && typeof v === "object" && !Object.isFrozen(v)) { Object.freeze(v); for (const x of Object.values(v)) deepFreeze(x); }
  return v;
}
function deliveryCopy(value, etag, nowMs) {
  if (!signingKey()) return { value, etag };
  const w = windowOf(nowMs);
  const key = String(etag) + "|" + w;
  const hit = deliveryMemo.get(key);
  if (hit) return hit;
  const signed = signContentAssets(value, nowMs);
  const out = Object.freeze(signed === value ? { value, etag } : { value: deepFreeze(signed), etag: "\"" + crypto.createHash("sha256").update(key).digest("base64url").slice(0, 22) + "\"" });
  if (deliveryMemo.size >= MEMO_MAX) deliveryMemo.delete(deliveryMemo.keys().next().value);
  deliveryMemo.set(key, out);
  return out;
}
function resetContentAssetMemo() { deliveryMemo.clear(); }

/** Reads one protected file ({ buffer, contentType } or null). The path is validated again; nothing outside ROOT is reachable. */
function readContentAsset(rel, deps = {}) {
  if (!isSafeRel(rel)) return null;
  const file = path.join(deps.root || ROOT, ...rel.split("/"));
  if (!file.startsWith((deps.root || ROOT) + path.sep)) return null;
  let buffer;
  try { buffer = (deps.readFileSync || fs.readFileSync)(file); } catch (e) { if (e && e.code === "ENOENT") return null; throw e; }
  return { buffer, contentType: CONTENT_TYPES[rel.slice(rel.lastIndexOf(".") + 1)] };
}

module.exports = {
  ROOT, WINDOW_SECONDS, KINDS, contentAssetPathOf, durablePathOf, windowOf, signedContentAssetUrl, verifyContentAssetSignature,
  signContentAssets, normalizeContentAssets, hasContentAssets, deliveryCopy, resetContentAssetMemo, readContentAsset
};
