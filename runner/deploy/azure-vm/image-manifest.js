"use strict";
// Phase 17F-A1.1 (M2) — the ONE structural contract of the worker image manifest, shared by its writer (record-images.js) and
// its reader (preflight.js --image-manifest):
//
//   { "schemaVersion": 1, "recordedAt": "<ISO-8601>" (optional), "images": { "<registry image>": "sha256:<64 lowercase hex>" } }
//
// Exactly the registry's image names (passed in by the caller from registry.js — never invented here), one immutable image id
// each, no two images sharing an id, no unknown keys, no duplicated JSON keys. Nothing is normalized or repaired: a manifest
// is either exactly this or it is refused with a reason that names the defect (never the manifest itself). Pure, no I/O.
const IMAGE_ID = /^sha256:[0-9a-f]{64}$/;
const MAX_TEXT_BYTES = 64 * 1024;
const TOP_KEYS = ["schemaVersion", "recordedAt", "images"];
const isPlainObject = v => v !== null && typeof v === "object" && !Array.isArray(v);

/** value (already parsed) → { ok: true, manifest } | { ok: false, reason }. `images` = the registry's image names. */
function validateImageManifest(value, { images } = {}) {
  const no = reason => ({ ok: false, reason });
  const expected = Array.isArray(images) ? images.filter(i => typeof i === "string" && i) : [];
  if (!expected.length) return no("no expected image set (registry)");
  if (!isPlainObject(value)) return no("root must be a JSON object");
  for (const k of Object.keys(value)) if (!TOP_KEYS.includes(k)) return no("unknown top-level key: " + k);
  if (value.schemaVersion !== 1) return no("schemaVersion must be 1" + (value.schemaVersion === undefined ? " (missing)" : ""));
  if ("recordedAt" in value && !(typeof value.recordedAt === "string" && Number.isFinite(Date.parse(value.recordedAt)))) return no("recordedAt must be an ISO-8601 timestamp string");
  if (!isPlainObject(value.images)) return no("images must be an object mapping each registry image to its sha256 id" + (value.images === undefined ? " (missing)" : ""));
  const keys = Object.keys(value.images);
  if (!keys.length) return no("images is empty");
  for (const k of keys) if (!expected.includes(k)) return no("unexpected image: " + k);
  for (const img of expected) if (!keys.includes(img)) return no("missing image: " + img);
  const seen = new Map();
  for (const img of expected) {
    const id = value.images[img];
    if (id === "") return no("empty image id for " + img);
    if (typeof id !== "string" || !IMAGE_ID.test(id)) return no("image id for " + img + " must be sha256:<64 lowercase hex>");
    if (seen.has(id)) return no("duplicate image id shared by " + seen.get(id) + " and " + img);
    seen.set(id, img);
  }
  return { ok: true, manifest: value };
}

const countRawKeys = text => { let n = 0; for (const _ of text.matchAll(/"(?:[^"\\]|\\.)*"\s*:/g)) n++; return n; };
const countKeys = v => (isPlainObject(v) ? Object.keys(v).length + Object.values(v).reduce((a, x) => a + countKeys(x), 0) : Array.isArray(v) ? v.reduce((a, x) => a + countKeys(x), 0) : 0);

/** manifest TEXT → the same result as validateImageManifest, after bounded, strict JSON parsing (duplicate keys refused). */
function parseImageManifest(text, opts) {
  const no = reason => ({ ok: false, reason });
  if (typeof text !== "string") return no("manifest text missing");
  if (!text.trim()) return no("manifest is empty (not JSON)");
  if (Buffer.byteLength(text, "utf8") > MAX_TEXT_BYTES) return no("manifest too large (> 64 KB)");
  let value;
  try { value = JSON.parse(text); } catch { return no("manifest is not valid JSON"); }
  if (countRawKeys(text) > countKeys(value)) return no("duplicate JSON key (a duplicated image identity is never normalized)");
  return validateImageManifest(value, opts);
}

module.exports = { IMAGE_ID, MAX_TEXT_BYTES, validateImageManifest, parseImageManifest };
