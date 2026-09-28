// Phase 11C — deterministic, dependency-free derivatives of the student rank / stage artwork.
//
// The owner artwork (src/assets/student-ranks/*.png 1254², src/assets/student-stages/*.png 512²) stays in the repo
// as the untouched MASTER copy; the app ships only the small square derivatives written here, one per size in
// SIZES, next to each master under `sized/`. Nothing is redrawn, cropped or recoloured: every derivative is a plain
// area-average (box-filter) downscale of its master, computed in premultiplied alpha so transparent edges keep no
// colour fringe, then written as a lossless 8-bit RGBA PNG (adaptive row filters, zlib level 9, no metadata).
//
// Node built-ins only (zlib) — no image library, so the output is byte-for-byte reproducible on any machine:
//   node scripts/generate-student-visual-derivatives.mjs          (re)write every derivative
//   node scripts/generate-student-visual-derivatives.mjs --check  exit 1 if any committed derivative's PIXELS differ
//                                                                 from a fresh downscale of its master (pixels, not
//                                                                 bytes, so another zlib build can never fail it)
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync, deflateSync, crc32 } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
/** Square edge lengths (px). Keep in sync with VISUAL_SIZES in src/studentVisualSizes.ts. */
export const SIZES = [48, 96, 144, 256];
export const SETS = [
  { dir: "src/assets/student-ranks", pattern: /^rank-[a-z]+\.png$/ },
  { dir: "src/assets/student-stages", pattern: /^stage-\d\d\.png$/ },
];

// ── PNG decode (8-bit RGBA, non-interlaced: the only form the owner artwork uses; anything else is rejected) ──
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let off = 8, width = 0, height = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString("latin1", off + 4, off + 8), data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      const [depth, colour, , , interlace] = data.subarray(8, 13);
      if (depth !== 8 || colour !== 6 || interlace !== 0) throw new Error(`unsupported PNG (depth ${depth}, colour ${colour}, interlace ${interlace})`);
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), stride = width * 4, px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? px[dst + x - 4] : 0, b = y ? px[dst - stride + x] : 0, c = x >= 4 && y ? px[dst - stride + x - 4] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      else if (f !== 0) throw new Error("bad filter " + f);
      px[dst + x] = v & 255;
    }
  }
  return { width, height, px };
}

// ── PNG encode (lossless RGBA8; per-row filter = the one with the smallest sum of absolute bytes) ──
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length), t = Buffer.from(type, "latin1");
  out.writeUInt32BE(data.length, 0); t.copy(out, 4); data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0, 8 + data.length);
  return out;
}
export function encodePng({ width, height, px }) {
  const stride = width * 4, raw = Buffer.alloc((stride + 1) * height), row = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    let best = null, bestScore = Infinity, bestF = 0;
    for (let f = 0; f <= 4; f++) {
      let score = 0;
      for (let x = 0; x < stride; x++) {
        const i = y * stride + x, v = px[i], a = x >= 4 ? px[i - 4] : 0, b = y ? px[i - stride] : 0, c = x >= 4 && y ? px[i - stride - 4] : 0;
        let p = 0;
        if (f === 1) p = a; else if (f === 2) p = b; else if (f === 3) p = (a + b) >> 1;
        else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
        const r = (v - p) & 255; row[x] = r; score += r < 128 ? r : 256 - r;
      }
      if (score < bestScore) { bestScore = score; bestF = f; best = Buffer.from(row); }
    }
    raw[y * (stride + 1)] = bestF; best.copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// ── Area-average downscale in premultiplied alpha (exact fractional pixel coverage, separable) ──
function weights(srcLen, dstLen) {
  const scale = srcLen / dstLen, out = [];
  for (let d = 0; d < dstLen; d++) {
    const s0 = d * scale, s1 = s0 + scale, taps = [];
    for (let s = Math.floor(s0); s < Math.min(srcLen, Math.ceil(s1)); s++) taps.push([s, (Math.min(s1, s + 1) - Math.max(s0, s)) / scale]);
    out.push(taps);
  }
  return out;
}
export function downscale({ width, height, px }, size) {
  if (size > width || size > height) throw new Error(`refusing to upscale ${width}x${height} to ${size}`);
  const wx = weights(width, size), wy = weights(height, size), pre = new Float64Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const a = px[i * 4 + 3] / 255;
    pre[i * 4] = px[i * 4] * a; pre[i * 4 + 1] = px[i * 4 + 1] * a; pre[i * 4 + 2] = px[i * 4 + 2] * a; pre[i * 4 + 3] = px[i * 4 + 3];
  }
  const tmp = new Float64Array(size * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < size; x++) for (const [s, w] of wx[x]) for (let k = 0; k < 4; k++) tmp[(y * size + x) * 4 + k] += pre[(y * width + s) * 4 + k] * w;
  const acc = new Float64Array(size * size * 4);
  for (let y = 0; y < size; y++) for (const [s, w] of wy[y]) for (let x = 0; x < size; x++) for (let k = 0; k < 4; k++) acc[(y * size + x) * 4 + k] += tmp[(s * size + x) * 4 + k] * w;
  const out = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const A = acc[i * 4 + 3], a = Math.round(A);
    out[i * 4 + 3] = a;
    if (a === 0) continue;                                                     // fully transparent: RGB 0 (no hidden colour)
    for (let k = 0; k < 3; k++) out[i * 4 + k] = Math.max(0, Math.min(255, Math.round(acc[i * 4 + k] / (A / 255))));
  }
  return { width: size, height: size, px: out };
}

/** Every master + its derivative paths (relative to `root`, the repo root by default). */
export function derivativePlan(root = ROOT, sets = SETS, sizes = SIZES) {
  const plan = [];
  for (const set of sets) for (const file of readdirSync(join(root, set.dir)).filter(f => set.pattern.test(f)).sort()) {
    const stem = basename(file, ".png");
    plan.push({ master: join(set.dir, file), outputs: sizes.map(size => ({ size, path: join(set.dir, "sized", `${stem}-${size}.png`) })) });
  }
  return plan;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes("--check");
  let stale = 0, written = 0;
  for (const { master, outputs } of derivativePlan()) {
    const img = decodePng(readFileSync(join(ROOT, master)));
    for (const { size, path } of outputs) {
      const expected = downscale(img, size), abs = join(ROOT, path);
      if (check) { if (!existsSync(abs) || !decodePng(readFileSync(abs)).px.equals(expected.px)) { stale++; console.error("stale or missing: " + path); } continue; }
      mkdirSync(dirname(abs), { recursive: true }); writeFileSync(abs, encodePng(expected)); written++;
    }
  }
  if (check) { if (stale) { console.error(stale + " derivative(s) differ from their masters — run without --check"); process.exit(1); } console.log("all derivatives match their masters"); }
  else console.log("wrote " + written + " derivatives");
}
