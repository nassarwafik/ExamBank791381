// UX-R19b — the visual regression gate's pure parts (docs/enterprise-ux-r0-redesign-foundation.md R19b): a PNG decoder and encoder
// (Node's zlib only, no image dependency), the pixel comparison every UX-R phase uses (a capture changed when any channel of any
// pixel moves by more than 12 levels, or its size changes), the manifest a pull request declares its intended changes in, and the
// verdict. scripts/ux-visual-gate.mjs drives the captures; this module never touches the network, a browser or the file system.
import zlib from "node:zlib";

export const THRESHOLD = 12;
export const VIEWPORTS = ["desktop", "tablet", "phone"];
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Decodes an 8-bit, non-interlaced RGB or RGBA PNG (what Chromium's screenshots are) into RGBA. Anything else throws. */
export function decodePng(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 8 || !buf.subarray(0, 8).equals(SIGNATURE)) throw new Error("not a PNG");
  let width = 0, height = 0, colorType = -1; const idat = [];
  for (let p = 8; p + 8 <= buf.length;) {
    const len = buf.readUInt32BE(p), type = buf.toString("latin1", p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4); colorType = data[9];
      if (data[8] !== 8 || (colorType !== 2 && colorType !== 6) || data[12] !== 0) throw new Error("unsupported PNG (8-bit RGB / RGBA, not interlaced, only)");
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    p += 12 + len;
  }
  if (!width || !height || !idat.length) throw new Error("PNG without IHDR or IDAT");
  const bpp = colorType === 6 ? 4 : 3, stride = width * bpp, raw = zlib.inflateSync(Buffer.concat(idat));
  if (raw.length < height * (stride + 1)) throw new Error("truncated PNG data");
  const rgba = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      if (filter === 1) line[i] = (line[i] + a) & 255;
      else if (filter === 2) line[i] = (line[i] + b) & 255;
      else if (filter === 3) line[i] = (line[i] + ((a + b) >> 1)) & 255;
      else if (filter === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); line[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; }
      else if (filter !== 0) throw new Error("bad PNG filter " + filter);
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4, s = x * bpp;
      rgba[o] = line[s]; rgba[o + 1] = line[s + 1]; rgba[o + 2] = line[s + 2]; rgba[o + 3] = bpp === 4 ? line[s + 3] : 255;
    }
    prev = line;
  }
  return { width, height, rgba };
}

/** Encodes RGBA pixels as a PNG (filter 0 on every row). */
export function encodePng({ width, height, rgba }) {
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  const chunk = (type, data) => {
    const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, "latin1");
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/**
 * Compares two decoded images. `changed` is true when the sizes differ or any channel of any pixel moves by more than `threshold`.
 * The diff image covers both: unchanged pixels are the "after" image faded, changed ones red, pixels only one image has magenta.
 */
export function compareImages(before, after, threshold = THRESHOLD) {
  const width = Math.max(before.width, after.width), height = Math.max(before.height, after.height);
  const diff = Buffer.alloc(width * height * 4);
  let changedPixels = 0, maxDelta = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const o = (y * width + x) * 4, inA = x < before.width && y < before.height, inB = x < after.width && y < after.height;
    if (!inA || !inB) { changedPixels++; diff[o] = 255; diff[o + 1] = 0; diff[o + 2] = 255; diff[o + 3] = 255; continue; }
    const a = (y * before.width + x) * 4, b = (y * after.width + x) * 4;
    let d = 0;
    for (let k = 0; k < 4; k++) d = Math.max(d, Math.abs(before.rgba[a + k] - after.rgba[b + k]));
    if (d > maxDelta) maxDelta = d;
    if (d > threshold) { changedPixels++; diff[o] = 220; diff[o + 1] = 0; diff[o + 2] = 0; diff[o + 3] = 255; }
    else { const g = Math.round((after.rgba[b] + after.rgba[b + 1] + after.rgba[b + 2]) / 3); const v = 255 - Math.round((255 - g) * 0.25); diff[o] = v; diff[o + 1] = v; diff[o + 2] = v; diff[o + 3] = 255; }
  }
  const sameSize = before.width === after.width && before.height === after.height;
  return { changed: !sameSize || changedPixels > 0, sameSize, changedPixels, maxDelta, before: [before.width, before.height], after: [after.width, after.height], diff: { width, height, rgba: diff } };
}

const keyOf = e => [e.page, e.viewport, e.reason].join("\u0000");

/**
 * Validates a manifest ({ version: 1, changes: [{ page, viewport, reason }] }). `viewport` is desktop, tablet, phone or "all";
 * `reason` says why the change is intended. With `knownPages`, a page the harness does not capture is an error, so a typo cannot
 * silently declare nothing.
 */
export function validateManifest(manifest, knownPages) {
  const errors = [];
  if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.changes)) return { entries: [], errors: ["the manifest must be { \"version\": 1, \"changes\": [...] }"] };
  const entries = [];
  manifest.changes.forEach((e, i) => {
    const at = "changes[" + i + "]";
    if (!e || typeof e !== "object") { errors.push(at + " is not an object"); return; }
    if (typeof e.page !== "string" || !e.page) errors.push(at + ".page is missing");
    else if (knownPages && !knownPages.has(e.page)) errors.push(at + ".page \"" + e.page + "\" is not a captured page or scene");
    if (!VIEWPORTS.includes(e.viewport) && e.viewport !== "all") errors.push(at + ".viewport must be desktop, tablet, phone or all");
    if (typeof e.reason !== "string" || e.reason.trim().length < 10) errors.push(at + ".reason must say why the change is intended (10 characters or more)");
    entries.push(e);
  });
  return { entries, errors };
}

/** The entries this pull request declares: those its manifest has and its base's manifest does not. Earlier PRs' entries stay as history. */
export function declaredByPr(baseManifest, headManifest) {
  const old = new Set((baseManifest?.changes || []).map(keyOf));
  return (headManifest?.changes || []).filter(e => !old.has(keyOf(e)));
}

export const isDeclared = (declared, page, viewport) => declared.some(e => e.page === page && (e.viewport === viewport || e.viewport === "all"));

/**
 * The verdict. `results`: [{ page, viewport, changed, confirmed }] where `confirmed` is the re-capture's verdict for a change the PR
 * did not declare (undefined when no re-capture ran). `checks`: { base, head } maps "viewport/page" to the harness's CHECK result.
 */
export function evaluate({ results, declared, manifestErrors = [], checks = { base: {}, head: {} } }) {
  const failures = manifestErrors.map(e => ({ kind: "manifest", detail: e })), notes = [], declaredChanges = [];
  for (const r of results) {
    if (r.missing) { failures.push({ kind: "missing", page: r.page, viewport: r.viewport, detail: r.missing }); continue; }
    if (!r.changed) continue;
    if (isDeclared(declared, r.page, r.viewport)) declaredChanges.push(r);
    else if (r.confirmed === false) notes.push({ kind: "flake", page: r.page, viewport: r.viewport, detail: "changed once, identical on the re-capture" });
    else failures.push({ kind: "undeclared", page: r.page, viewport: r.viewport, detail: r.sameSize ? r.changedPixels + " pixels moved by more than " + THRESHOLD + " levels" : "size " + r.before.join("×") + " → " + r.after.join("×") });
  }
  for (const [id, head] of Object.entries(checks.head || {})) {
    if (head.ok) continue;
    const base = checks.base?.[id];
    if (base && !base.ok) notes.push({ kind: "check", id, detail: "fails on the base too: " + head.detail });
    else failures.push({ kind: "check", id, detail: "fails on the head only: " + head.detail });
  }
  for (const e of declared) if (!results.some(r => r.changed && r.page === e.page && (e.viewport === "all" || r.viewport === e.viewport))) notes.push({ kind: "unused", page: e.page, viewport: e.viewport, detail: "declared, but nothing changed" });
  return { ok: failures.length === 0, failures, notes, declaredChanges };
}
