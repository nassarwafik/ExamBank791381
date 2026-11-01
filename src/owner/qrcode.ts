// Tadris+ P1-A2 — a small, dependency-free QR Code encoder (ISO/IEC 18004), used only to show the owner's TOTP enrolment
// link (otpauth://…) as a scannable code. Byte mode, error-correction level M, versions 1–20 (up to 666 bytes; an otpauth
// link is ~110–200). The algorithm follows the public-domain reference design by Project Nayuki. Output is verified
// module-for-module against the `qrcode` npm package (fixtures in qrcode.p1a2.test.ts) and every mask is a valid code.
//
// It runs in the owner's browser only, on a value the server just returned; nothing is sent anywhere.

const MAX_VERSION = 20;
// Level M tables, index = version (index 0 unused).
const ECC_CODEWORDS_PER_BLOCK_M = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26];
const NUM_ERROR_CORRECTION_BLOCKS_M = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16];
const FORMAT_BITS_M = 0; // L=1, M=0, Q=3, H=2

export type QrMatrix = { size: number; version: number; mask: number; modules: boolean[][] };

function numRawDataModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

function numDataCodewords(ver: number): number {
  return Math.floor(numRawDataModules(ver) / 8) - ECC_CODEWORDS_PER_BLOCK_M[ver] * NUM_ERROR_CORRECTION_BLOCKS_M[ver];
}

// ── GF(256) Reed–Solomon (primitive polynomial 0x11D) ─────────────────────────
function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree: number): number[] {
  const result: number[] = new Array(degree - 1).fill(0);
  result.push(1);
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

function rsRemainder(data: number[], divisor: number[]): number[] {
  const result: number[] = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coef, i) => { result[i] ^= gfMultiply(coef, factor); });
  }
  return result;
}

// ── Data codewords ───────────────────────────────────────────────────────────
function utf8Bytes(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

function chooseVersion(byteLength: number): number {
  for (let ver = 1; ver <= MAX_VERSION; ver++) {
    const countBits = ver < 10 ? 8 : 16;
    if (4 + countBits + byteLength * 8 <= numDataCodewords(ver) * 8) return ver;
  }
  throw new RangeError("Text is too long for a QR code.");
}

function dataCodewords(bytes: number[], ver: number): number[] {
  const bits: number[] = [];
  const append = (value: number, length: number) => { for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
  append(0b0100, 4);
  append(bytes.length, ver < 10 ? 8 : 16);
  for (const b of bytes) append(b, 8);
  const capacity = numDataCodewords(ver) * 8;
  append(0, Math.min(4, capacity - bits.length));
  append(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) append(pad, 8);
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    out.push(byte);
  }
  return out;
}

function interleaveWithEcc(data: number[], ver: number): number[] {
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS_M[ver];
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK_M[ver];
  const rawCodewords = Math.floor(numRawDataModules(ver) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);
  const divisor = rsDivisor(blockEccLen);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, divisor);
    if (i < numShortBlocks) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const result: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(block[i]);
    });
  }
  return result;
}

// ── Matrix ───────────────────────────────────────────────────────────────────
function alignmentPositions(ver: number, size: number): number[] {
  if (ver === 1) return [];
  const numAlign = Math.floor(ver / 7) + 2;
  const step = Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

function buildMatrix(codewords: number[], ver: number, mask: number): QrMatrix {
  const size = ver * 4 + 17;
  const modules: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const isFunction: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const setFunction = (x: number, y: number, dark: boolean) => { modules[y][x] = dark; isFunction[y][x] = true; };

  for (let i = 0; i < size; i++) { setFunction(6, i, i % 2 === 0); setFunction(i, 6, i % 2 === 0); }
  const finder = (x: number, y: number) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy)), xx = x + dx, yy = y + dy;
      if (xx >= 0 && xx < size && yy >= 0 && yy < size) setFunction(xx, yy, dist !== 2 && dist !== 4);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const align = alignmentPositions(ver, size);
  align.forEach((ay, i) => align.forEach((ax, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setFunction(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  const drawFormat = (m: number) => {
    const data = (FORMAT_BITS_M << 3) | m;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = (i: number) => ((bits >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) setFunction(8, i, bit(i));
    setFunction(8, 7, bit(6)); setFunction(8, 8, bit(7)); setFunction(7, 8, bit(8));
    for (let i = 9; i < 15; i++) setFunction(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) setFunction(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) setFunction(8, size - 15 + i, bit(i));
    setFunction(8, size - 8, true);
  };
  drawFormat(0);
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) !== 0, a = size - 11 + (i % 3), b = Math.floor(i / 3);
      setFunction(a, b, dark); setFunction(b, a, dark);
    }
  }

  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - vert : vert;
      if (!isFunction[y][x] && i < codewords.length * 8) {
        modules[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
        i++;
      }
    }
  }

  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (isFunction[y][x]) continue;
    let invert: boolean;
    switch (mask) {
      case 0: invert = (x + y) % 2 === 0; break;
      case 1: invert = y % 2 === 0; break;
      case 2: invert = x % 3 === 0; break;
      case 3: invert = (x + y) % 3 === 0; break;
      case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
      case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
      case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
      default: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
    }
    if (invert) modules[y][x] = !modules[y][x];
  }
  drawFormat(mask);
  return { size, version: ver, mask, modules };
}

// ── Mask penalty (ISO/IEC 18004 §7.8.3) ──────────────────────────────────────
function penalty(m: boolean[][]): number {
  const size = m.length;
  let result = 0;
  const lineScore = (get: (i: number) => boolean) => {
    let score = 0, run = 1;
    for (let i = 1; i < size; i++) {
      if (get(i) === get(i - 1)) { run++; if (i === size - 1 && run >= 5) score += run - 2; }
      else { if (run >= 5) score += run - 2; run = 1; }
    }
    return score;
  };
  for (let y = 0; y < size; y++) result += lineScore(x => m[y][x]);
  for (let x = 0; x < size; x++) result += lineScore(y => m[y][x]);
  for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
    const c = m[y][x];
    if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) result += 3;
  }
  const pattern = [true, false, true, true, true, false, true];
  const finderLike = (get: (i: number) => boolean, start: number) => {
    for (let k = 0; k < 7; k++) if (get(start + k) !== pattern[k]) return false;
    const light = (from: number) => { for (let k = 0; k < 4; k++) { const p = from + k; if (p >= 0 && p < size && get(p)) return false; } return true; };
    return light(start - 4) || light(start + 7);
  };
  for (let y = 0; y < size; y++) for (let x = 0; x + 7 <= size; x++) if (finderLike(i => m[y][i], x)) result += 40;
  for (let x = 0; x < size; x++) for (let y = 0; y + 7 <= size; y++) if (finderLike(i => m[i][x], y)) result += 40;
  let dark = 0;
  for (const row of m) for (const c of row) if (c) dark++;
  const total = size * size;
  result += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;
  return result;
}

/** Encode `text` (UTF-8, byte mode, level M). `mask` forces a mask pattern (tests); otherwise the lowest penalty wins. */
export function encodeQr(text: string, options: { mask?: number } = {}): QrMatrix {
  const bytes = utf8Bytes(text);
  const ver = chooseVersion(bytes.length);
  const codewords = interleaveWithEcc(dataCodewords(bytes, ver), ver);
  if (options.mask !== undefined) {
    if (!Number.isInteger(options.mask) || options.mask < 0 || options.mask > 7) throw new RangeError("Mask must be 0–7.");
    return buildMatrix(codewords, ver, options.mask);
  }
  let best: QrMatrix | null = null, bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const candidate = buildMatrix(codewords, ver, mask);
    const score = penalty(candidate.modules);
    if (score < bestScore) { best = candidate; bestScore = score; }
  }
  return best as QrMatrix;
}

/** SVG path data for the dark modules, with a quiet zone of `border` modules (one unit = one module). */
export function qrPath(matrix: QrMatrix, border = 4): string {
  const parts: string[] = [];
  matrix.modules.forEach((row, y) => row.forEach((dark, x) => { if (dark) parts.push(`M${x + border},${y + border}h1v1h-1z`); }));
  return parts.join("");
}
