// Number Conversion Challenge — the PURE conversion engine (Phase 2 solo game). No IO, no HTTP, deterministic.
//
// The teaching model is the 8-BIT networking octet (0–255) with positional boxes 128|64|32|16|8|4|2|1, grouped into
// two 4-bit nibbles for the hexadecimal bridge. The student's ONE interaction across every direction is the 8-bit
// board: they set the eight bits so the board represents the task's number. Correctness is therefore uniform and
// server-graded — the board value must equal the task value — while the SOURCE and the DERIVED target are rendered
// per direction (decimal / 8-bit binary / two-digit hex). Only bases 2, 10 and 16 are supported (no octal).
//
// This module is shared by the game API (generation + grading + hints + reveal). The browser never receives a
// correct-answer key: it gets the source display + direction and submits its eight bits; the server grades here.

const BASES = Object.freeze({ DECIMAL: 10, BINARY: 2, HEX: 16 });
const PLACES = Object.freeze([128, 64, 32, 16, 8, 4, 2, 1]);   // MSB → LSB, index 0 is the 128-box (global octet view)
const NIBBLE_PLACES = Object.freeze([8, 4, 2, 1]);             // the per-nibble weights — the hexadecimal teaching view
const BIT_WIDTH = 8;
const MIN_VALUE = 0;
const MAX_VALUE = 255;

// The six supported conversion directions and their source/target bases.
const DIRECTIONS = Object.freeze({
  dec2bin: { sourceBase: 10, targetBase: 2 },
  bin2dec: { sourceBase: 2, targetBase: 10 },
  bin2hex: { sourceBase: 2, targetBase: 16 },
  hex2bin: { sourceBase: 16, targetBase: 2 },
  dec2hex: { sourceBase: 10, targetBase: 16 },
  hex2dec: { sourceBase: 16, targetBase: 10 },
});
const DIRECTION_IDS = Object.freeze(Object.keys(DIRECTIONS));

// Challenge paths chosen on the start screen → the directions each one draws from.
const PATHS = Object.freeze({
  "dec-bin": ["dec2bin", "bin2dec"],
  "bin-hex": ["bin2hex", "hex2bin"],
  "dec-hex": ["dec2hex", "hex2dec"],
  mixed: ["dec2bin", "bin2dec", "bin2hex", "hex2bin", "dec2hex", "hex2dec"],
});
const PATH_IDS = Object.freeze(Object.keys(PATHS));
const ASSISTANCE_LEVELS = Object.freeze(["guided", "practice", "challenge"]);
const DEFAULT_ROUND_SIZE = 10;

// ── base rendering / bit helpers ──────────────────────────────────────────────────────────────────────────────
/** A value 0..255 as an integer, or null when out of range / malformed. */
function normalizeValue(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < MIN_VALUE || n > MAX_VALUE) return null;
  return n;
}
/** Render a 0..255 value in a base for DISPLAY: decimal unpadded, binary 8-bit, hex 2-digit uppercase. */
function renderInBase(value, base) {
  const n = normalizeValue(value);
  if (n === null) return "";
  if (base === 10) return String(n);
  if (base === 2) return n.toString(2).padStart(BIT_WIDTH, "0");
  if (base === 16) return n.toString(16).toUpperCase().padStart(2, "0");
  return "";
}
/** The eight bits (MSB→LSB) of a 0..255 value. */
function bitsFromValue(value) {
  const n = normalizeValue(value) ?? 0;
  return PLACES.map(p => ((n & p) ? 1 : 0));
}
/** Strict submission contract: an array of EXACTLY eight elements, each the number 0 or 1 (no booleans, no coercion). */
function isValidBits(bits) {
  return Array.isArray(bits) && bits.length === BIT_WIDTH && bits.every(b => b === 0 || b === 1);
}
/** The value of an eight-bit board, or null when the bits array is malformed (not length 8 of 0/1). */
function valueFromBits(bits) {
  if (!isValidBits(bits)) return null;
  let total = 0;
  for (let i = 0; i < BIT_WIDTH; i++) {
    if (bits[i] === 1) total += PLACES[i];
  }
  return total;
}
/** The active place values of a value (e.g. 45 → [32, 8, 4, 1]) — the pedagogical sum. */
function activePlaces(value) {
  const bits = bitsFromValue(value);
  return PLACES.filter((_, i) => bits[i] === 1);
}
/** The two nibbles (high, low) of a value, each 0..15. */
function nibblesOf(value) {
  const n = normalizeValue(value) ?? 0;
  return [(n >> 4) & 0xf, n & 0xf];
}
const HEX_DIGITS = "0123456789ABCDEF";
const hexDigit = nibble => HEX_DIGITS[nibble & 0xf];
/** One nibble's teaching breakdown from its 8|4|2|1 weights, e.g. 11 → "8+2+1 = 11 = B", 6 → "4+2 = 6". */
function nibbleBreakdown(nib) {
  const n = nib & 0xf;
  const weights = NIBBLE_PLACES.filter(w => (n & w));
  const sum = weights.length ? weights.join("+") : "0";
  return n >= 10 ? sum + " = " + n + " = " + hexDigit(n) : sum + " = " + n;
}

// ── deterministic PRNG (seeded, pure) ─────────────────────────────────────────────────────────────────────────
/** cyrb53 string → 32-bit seed. */
function hashSeed(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  return (h1 >>> 0);
}
/** mulberry32 PRNG factory — deterministic sequence in [0,1). */
function makeRng(seedNumber) {
  let a = seedNumber >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── task shape ────────────────────────────────────────────────────────────────────────────────────────────────
/** Build ONE task record. The `value` is the underlying number (server-side authority); the public task omits it. */
function buildTask(taskId, direction, value) {
  const spec = DIRECTIONS[direction];
  return {
    taskId: String(taskId),
    direction,
    sourceBase: spec.sourceBase,
    targetBase: spec.targetBase,
    value,
    sourceDisplay: renderInBase(value, spec.sourceBase),
    bitWidth: BIT_WIDTH,
  };
}
/** The client-safe projection of a task — NO `value` / answer key; only what the board needs to render the source. */
function publicTask(task) {
  if (!task || typeof task !== "object") return null;
  return {
    taskId: String(task.taskId || ""),
    direction: task.direction,
    sourceBase: task.sourceBase,
    targetBase: task.targetBase,
    sourceDisplay: String(task.sourceDisplay || ""),
    bitWidth: BIT_WIDTH,
  };
}

/**
 * Deterministically generate a round of tasks. Same (seed, path, count) → identical tasks (so a refresh/reconnect
 * never regenerates a different round). Values are 0..255, bases only 2/10/16, all six directions reachable via the
 * paths, and no two CONSECUTIVE tasks are identical (same direction + value).
 */
function generateRound(seed, { path = "mixed", count = DEFAULT_ROUND_SIZE } = {}) {
  const dirs = PATHS[path] || PATHS.mixed;
  const n = Math.max(1, Math.min(50, Math.floor(Number(count) || DEFAULT_ROUND_SIZE)));
  const rng = makeRng(hashSeed(seed + "|" + path + "|" + n));
  const tasks = [];
  let prevKey = "";
  for (let i = 0; i < n; i++) {
    let direction, value, key, guard = 0;
    do {
      direction = dirs[Math.floor(rng() * dirs.length) % dirs.length];
      value = Math.floor(rng() * (MAX_VALUE + 1));   // 0..255
      key = direction + ":" + value;
      guard++;
    } while (key === prevKey && guard < 12);
    prevKey = key;
    tasks.push(buildTask("t" + (i + 1), direction, value));
  }
  return tasks;
}

// ── grading / hints / reveal ──────────────────────────────────────────────────────────────────────────────────
/** Grade an eight-bit submission against a task: { correct, submittedValue|null }. Pure, server-authoritative. */
function evaluateBits(task, bits) {
  const submitted = valueFromBits(bits);
  if (submitted === null) return { correct: false, submittedValue: null };
  return { correct: submitted === task.value, submittedValue: submitted };
}
/** The correct eight bits for a task (revealed ONLY by the API after attempts are exhausted). */
function solutionBits(task) {
  return bitsFromValue(task.value);
}

/**
 * A contextual, thinking-guiding hint (never the answer). Depends on the direction, the remaining amount where the
 * student is building from the boxes, AND the assistance level: `guided` is the most explicit (names the remaining
 * amount and the nibble method), `practice` is a lighter nudge, and `challenge` is a minimal, direction-agnostic
 * prompt — so the same wrong answer produces genuinely different scaffolding per level.
 */
function hintForTask(task, bits, level = "guided") {
  if (level === "challenge") return "غير صحيح. راجع قيم الخانات المختارة وحاول مرة أخرى.";
  const detailed = level !== "practice";   // guided = most explicit; practice = lighter
  const submitted = valueFromBits(bits) || 0;
  const remaining = task.value - submitted;
  switch (task.direction) {
    case "dec2bin":
    case "dec2hex": {
      if (remaining > 0) return detailed
        ? "بقي لديك " + remaining + ". أي قيمة من الصناديق يمكن استخدامها الآن؟"
        : "المجموع أقل من العدد المطلوب — أضِف قيمة مناسبة.";
      if (remaining < 0) return "المجموع أكبر من العدد المطلوب — أزِل إحدى القيم المختارة.";
      return task.direction === "dec2hex" ? "المجموع صحيح — اقرأ كل مجموعة من 4 بتات كرقم سادس عشر." : "المجموع صحيح — تحقّق من ترتيب الخانات.";
    }
    case "bin2dec":
      return "اجمع القيم الموجودة أسفل الخانات التي تحوي 1.";
    case "bin2hex":
      return detailed
        ? "قسّم العدد الثنائي إلى مجموعتين من 4 بتات، واحسب قيمة كل مجموعة."
        : "فكّر في كل مجموعة من 4 بتات على حدة.";
    case "hex2bin":
      return detailed
        ? "تذكّر: كل رقم سادس عشر يساوي 4 بتات؛ مثلاً A تساوي 10 = 1010."
        : "كل رقم سادس عشر يساوي 4 بتات.";
    case "hex2dec":
      return detailed
        ? "حوّل كل رقم سادس عشر إلى 4 بتات، ثم اجمع القيم لتحصل على العدد العشري."
        : "حوّل كل رقم سادس عشر إلى 4 بتات ثم اجمع القيم.";
    default:
      return "استخدم قيم الخانات للوصول إلى العدد المطلوب.";
  }
}

/**
 * A short transformation explanation shown after a correct answer or a reveal — following the CONVERSION DIRECTION
 * (not merely the target base). Decimal↔hex is taught via the binary bridge (octet → nibbles → hex), never
 * division-by-16; binary↔hex shows each nibble's 8|4|2|1 breakdown. No shaming; motivational, teaching tone.
 */
function explanationForTask(task) {
  const value = task.value;
  const bin = renderInBase(value, 2);
  const hi4 = bin.slice(0, 4), lo4 = bin.slice(4);
  const [hi, lo] = nibblesOf(value);
  const hex = renderInBase(value, 16);
  const sum = activePlaces(value);
  const sumText = sum.length ? sum.join(" + ") : "0";
  switch (task.direction) {
    case "dec2bin":
      return value + "₁₀ → " + sumText + " → " + bin + "₂";
    case "bin2dec":
      return bin + "₂ → " + sumText + " → " + value + "₁₀";
    case "bin2hex":
      return bin + "₂ → " + hi4 + " | " + lo4 + " → (" + nibbleBreakdown(hi) + ") | (" + nibbleBreakdown(lo) + ") → " + hex + "₁₆";
    case "hex2bin":
      return hex + "₁₆ → " + hexDigit(hi) + " | " + hexDigit(lo) + " → " + hi4 + " | " + lo4 + " → " + bin + "₂";
    case "dec2hex":
      return value + "₁₀ → " + bin + "₂ → " + hi4 + " | " + lo4 + " → " + hexDigit(hi) + " | " + hexDigit(lo) + " → " + hex + "₁₆";
    case "hex2dec":
      return hex + "₁₆ → " + bin + "₂ → " + sumText + " → " + value + "₁₀";
    default:
      return sumText + " = " + value;
  }
}

module.exports = {
  BASES, PLACES, NIBBLE_PLACES, BIT_WIDTH, MIN_VALUE, MAX_VALUE,
  DIRECTIONS, DIRECTION_IDS, PATHS, PATH_IDS, ASSISTANCE_LEVELS, DEFAULT_ROUND_SIZE,
  normalizeValue, renderInBase, bitsFromValue, isValidBits, valueFromBits, activePlaces, nibblesOf, hexDigit, nibbleBreakdown,
  hashSeed, makeRng, buildTask, publicTask, generateRound,
  evaluateBits, solutionBits, hintForTask, explanationForTask,
};
