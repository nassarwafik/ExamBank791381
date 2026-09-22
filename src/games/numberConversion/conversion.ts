// Number Conversion Challenge — PURE client-side rendering helpers + Arabic metadata (Phase 2). Presentation only:
// the server is the authority for generation and grading. These helpers turn the student's 8-bit board into the
// derived readouts (binary / decimal / hex) and label the six directions, paths and assistance levels. No gameplay
// state, no evaluation of correctness (that is server-side).

export type ConversionDirection = "dec2bin" | "bin2dec" | "bin2hex" | "hex2bin" | "dec2hex" | "hex2dec";
export type ChallengePath = "dec-bin" | "bin-hex" | "dec-hex" | "mixed";
export type AssistanceLevel = "guided" | "practice" | "challenge";
export type Bit = 0 | 1;

/** The 8-bit octet place values, MSB→LSB (index 0 is the 128-box) — the global decimal/binary view. */
export const PLACES: readonly number[] = [128, 64, 32, 16, 8, 4, 2, 1];
/** The per-nibble weights (each 4-bit group independently) — the hexadecimal teaching view. */
export const NIBBLE_PLACES: readonly number[] = [8, 4, 2, 1];
export const BIT_WIDTH = 8;
export const emptyBits = (): Bit[] => [0, 0, 0, 0, 0, 0, 0, 0];
/** The weight of box `i` (0..7) within its own 4-bit nibble: always one of 8|4|2|1. */
export const nibbleWeightAt = (i: number): number => NIBBLE_PLACES[i % 4];

export function valueFromBits(bits: readonly Bit[]): number {
  return PLACES.reduce((sum, p, i) => sum + (bits[i] === 1 ? p : 0), 0);
}
export function binaryString(bits: readonly Bit[]): string {
  return bits.map(b => (b === 1 ? "1" : "0")).join("");
}
/** The active place values of the board (e.g. [32, 8, 4, 1]) — the pedagogical sum. */
export function activePlaces(bits: readonly Bit[]): number[] {
  return PLACES.filter((_, i) => bits[i] === 1);
}
const HEX = "0123456789ABCDEF";
/** The hex digit of one nibble half of the board (half 0 = high nibble, bits 0..3; half 1 = low nibble, bits 4..7). */
export function nibbleHexDigit(bits: readonly Bit[], half: 0 | 1): string {
  const start = half === 0 ? 0 : 4;
  const v = (bits[start] === 1 ? 8 : 0) + (bits[start + 1] === 1 ? 4 : 0) + (bits[start + 2] === 1 ? 2 : 0) + (bits[start + 3] === 1 ? 1 : 0);
  return HEX[v];
}
export function hexString(bits: readonly Bit[]): string {
  return nibbleHexDigit(bits, 0) + nibbleHexDigit(bits, 1);
}
/** The derived answer readout in the task's target base, computed live from the board. */
export function targetReadout(bits: readonly Bit[], targetBase: number): string {
  if (targetBase === 2) return binaryString(bits);
  if (targetBase === 16) return hexString(bits);
  return String(valueFromBits(bits));
}

export const DIRECTION_META: Record<ConversionDirection, { sourceBase: number; targetBase: number; titleAr: string; sourceLabelAr: string; targetLabelAr: string }> = {
  dec2bin: { sourceBase: 10, targetBase: 2, titleAr: "من العشري إلى الثنائي", sourceLabelAr: "عشري", targetLabelAr: "ثنائي" },
  bin2dec: { sourceBase: 2, targetBase: 10, titleAr: "من الثنائي إلى العشري", sourceLabelAr: "ثنائي", targetLabelAr: "عشري" },
  bin2hex: { sourceBase: 2, targetBase: 16, titleAr: "من الثنائي إلى السادس عشر", sourceLabelAr: "ثنائي", targetLabelAr: "سادس عشر" },
  hex2bin: { sourceBase: 16, targetBase: 2, titleAr: "من السادس عشر إلى الثنائي", sourceLabelAr: "سادس عشر", targetLabelAr: "ثنائي" },
  dec2hex: { sourceBase: 10, targetBase: 16, titleAr: "من العشري إلى السادس عشر", sourceLabelAr: "عشري", targetLabelAr: "سادس عشر" },
  hex2dec: { sourceBase: 16, targetBase: 10, titleAr: "من السادس عشر إلى العشري", sourceLabelAr: "سادس عشر", targetLabelAr: "عشري" },
};

/** Whether this direction's target is hexadecimal (so the board highlights its two nibble groups + hex digits). */
export function targetIsHex(direction: ConversionDirection): boolean {
  return DIRECTION_META[direction]?.targetBase === 16;
}

/**
 * Which pedagogical WEIGHTS a direction's board teaches. Decimal/binary use the global octet (128…1); any
 * hexadecimal direction teaches each nibble's own 8|4|2|1 weights (and per-nibble hex digits); decimal↔hex shows
 * BOTH (the octet AND the nibble split) so the binary-bridge is visible. There is always ONE source of truth for the
 * eight selected bits — only the visible labels differ.
 */
export interface BoardView { showGlobalPlaces: boolean; showNibbleWeights: boolean; showNibbleHex: boolean }
export function boardViewFor(direction: ConversionDirection): BoardView {
  const { sourceBase, targetBase } = DIRECTION_META[direction];
  const involvesHex = sourceBase === 16 || targetBase === 16;
  const involvesDecimal = sourceBase === 10 || targetBase === 10;
  if (!involvesHex) return { showGlobalPlaces: true, showNibbleWeights: false, showNibbleHex: false };
  return { showGlobalPlaces: involvesDecimal, showNibbleWeights: true, showNibbleHex: true };
}

/**
 * How much LIVE scaffolding the board shows at a given assistance level while the student is still working. Boxes and
 * their weight labels are ALWAYS present (the method is the game); these flags govern the derived readouts that would
 * otherwise form the answer in front of the student. `locked` (after Check / reveal) always shows everything — that is
 * the teaching moment. Guided → full; Practice → sum + binary only; Challenge → boxes only until Check.
 */
export interface ReadoutPolicy { showSum: boolean; showDerived: boolean; showBinaryLine: boolean; showNibbleHexLive: boolean }
export function readoutPolicy(level: AssistanceLevel, locked: boolean): ReadoutPolicy {
  if (locked) return { showSum: true, showDerived: true, showBinaryLine: true, showNibbleHexLive: true };
  if (level === "practice") return { showSum: true, showDerived: false, showBinaryLine: true, showNibbleHexLive: false };
  if (level === "challenge") return { showSum: false, showDerived: false, showBinaryLine: false, showNibbleHexLive: false };
  return { showSum: true, showDerived: true, showBinaryLine: true, showNibbleHexLive: true };   // guided
}

export const PATH_META: { id: ChallengePath; letter: string; titleAr: string; subtitleAr: string }[] = [
  { id: "dec-bin", letter: "أ", titleAr: "عشري ↔ ثنائي", subtitleAr: "Decimal ↔ Binary" },
  { id: "bin-hex", letter: "ب", titleAr: "ثنائي ↔ سادس عشر", subtitleAr: "Binary ↔ Hexadecimal" },
  { id: "dec-hex", letter: "ج", titleAr: "عشري ↔ سادس عشر", subtitleAr: "Decimal ↔ Hexadecimal" },
  { id: "mixed", letter: "د", titleAr: "تحدٍّ مختلط", subtitleAr: "Mixed Challenge" },
];

export const LEVEL_META: { id: AssistanceLevel; labelAr: string; descAr: string }[] = [
  { id: "guided", labelAr: "موجّه", descAr: "الصناديق والقيم والمجموع والنتيجة المباشرة — إرشاد خطوة بخطوة، الأنسب للبداية." },
  { id: "practice", labelAr: "تدريب", descAr: "الصناديق والقيم والمجموع، مع إخفاء نتيجة الهدف وإرشاد أقل." },
  { id: "challenge", labelAr: "تحدٍّ", descAr: "الصناديق فقط أثناء الحل — لا تظهر النتائج المشتقّة إلا بعد التحقّق." },
];

/** mm:ss for an elapsed-milliseconds value (display only). */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const m = Math.floor(total / 60), s = total % 60;
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}
