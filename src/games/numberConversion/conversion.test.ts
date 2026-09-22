import { describe, it, expect } from "vitest";
import {
  PLACES, NIBBLE_PLACES, BIT_WIDTH, emptyBits, valueFromBits, binaryString, activePlaces, nibbleHexDigit, hexString,
  nibbleWeightAt, boardViewFor, readoutPolicy, guidanceFor, answerInputFor, sourceValueOf,
  targetReadout, targetIsHex, DIRECTION_META, PATH_META, LEVEL_META, formatElapsed, type Bit,
} from "./conversion";

// Pure client rendering helpers (presentation only — grading is server-side).
const bits45: Bit[] = [0, 0, 1, 0, 1, 1, 0, 1];   // 45 = 32+8+4+1
const bits182: Bit[] = [1, 0, 1, 1, 0, 1, 1, 0];  // 182 = 0xB6

describe("board readouts", () => {
  it("places are the octet; empty board is eight zeros", () => {
    expect(PLACES).toEqual([128, 64, 32, 16, 8, 4, 2, 1]);
    expect(BIT_WIDTH).toBe(8);
    expect(emptyBits()).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });
  it("derives value, binary, active places and hex from the board", () => {
    expect(valueFromBits(bits45)).toBe(45);
    expect(binaryString(bits45)).toBe("00101101");
    expect(activePlaces(bits45)).toEqual([32, 8, 4, 1]);
    expect(hexString(bits45)).toBe("2D");
    expect(hexString(bits182)).toBe("B6");
    expect(nibbleHexDigit(bits182, 0)).toBe("B");
    expect(nibbleHexDigit(bits182, 1)).toBe("6");
    expect(hexString([0, 0, 1, 1, 1, 0, 1, 0])).toBe("3A");   // 58
  });
  it("targetReadout renders in the target base", () => {
    expect(targetReadout(bits45, 2)).toBe("00101101");
    expect(targetReadout(bits45, 10)).toBe("45");
    expect(targetReadout(bits45, 16)).toBe("2D");
  });
});

describe("direction / path / level metadata", () => {
  it("maps the six directions to source/target bases and only 2/10/16 (no octal)", () => {
    const dirs = Object.keys(DIRECTION_META);
    expect(dirs.sort()).toEqual(["bin2dec", "bin2hex", "dec2bin", "dec2hex", "hex2bin", "hex2dec"]);
    for (const d of dirs) {
      const m = DIRECTION_META[d as keyof typeof DIRECTION_META];
      expect([2, 10, 16]).toContain(m.sourceBase);
      expect([2, 10, 16]).toContain(m.targetBase);
    }
    expect(targetIsHex("bin2hex")).toBe(true);
    expect(targetIsHex("dec2hex")).toBe(true);
    expect(targetIsHex("dec2bin")).toBe(false);
  });
  it("offers the four challenge paths and three assistance levels", () => {
    expect(PATH_META.map(p => p.id)).toEqual(["dec-bin", "bin-hex", "dec-hex", "mixed"]);
    expect(LEVEL_META.map(l => l.id)).toEqual(["guided", "practice", "challenge"]);
  });
});

describe("board views — global octet vs hex nibble weights (Fix 1)", () => {
  it("exposes the per-nibble 8|4|2|1 weights, repeating for each 4-bit group", () => {
    expect(NIBBLE_PLACES).toEqual([8, 4, 2, 1]);
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(nibbleWeightAt)).toEqual([8, 4, 2, 1, 8, 4, 2, 1]);
  });
  it("decimal/binary directions use the GLOBAL octet only; hex directions teach the NIBBLE weights", () => {
    // dec↔bin: global place values, no nibble weights/hex
    expect(boardViewFor("dec2bin")).toEqual({ showGlobalPlaces: true, showNibbleWeights: false, showNibbleHex: false });
    expect(boardViewFor("bin2dec")).toEqual({ showGlobalPlaces: true, showNibbleWeights: false, showNibbleHex: false });
    // bin↔hex: nibble weights + hex digits, NOT the global octet
    expect(boardViewFor("bin2hex")).toEqual({ showGlobalPlaces: false, showNibbleWeights: true, showNibbleHex: true });
    expect(boardViewFor("hex2bin")).toEqual({ showGlobalPlaces: false, showNibbleWeights: true, showNibbleHex: true });
    // dec↔hex: BOTH views (the binary bridge)
    expect(boardViewFor("dec2hex")).toEqual({ showGlobalPlaces: true, showNibbleWeights: true, showNibbleHex: true });
    expect(boardViewFor("hex2dec")).toEqual({ showGlobalPlaces: true, showNibbleWeights: true, showNibbleHex: true });
  });
});

describe("readout policy — NO level leaks a derived answer before resolution", () => {
  it("unresolved: every level prints nothing derived; resolved (locked): every level shows the full teaching readout", () => {
    const none = { showSum: false, showDerived: false, showBinaryLine: false, showNibbleHexLive: false };
    const all = { showSum: true, showDerived: true, showBinaryLine: true, showNibbleHexLive: true };
    for (const l of ["guided", "practice", "challenge"] as const) {
      expect(readoutPolicy(l, false)).toEqual(none);
      expect(readoutPolicy(l, true)).toEqual(all);
    }
  });
});

describe("assistance levels differ in GUIDANCE, never in answer leakage", () => {
  const DIRS = ["dec2bin", "bin2dec", "bin2hex", "hex2bin", "dec2hex", "hex2dec"] as const;
  it("guided = direction-specific method; practice = short; challenge = none", () => {
    for (const d of DIRS) {
      const g = guidanceFor(d, "guided");
      const p = guidanceFor(d, "practice");
      expect(g).toBeTruthy();
      expect(p).toBeTruthy();
      expect(g).not.toBe(p);
      expect(guidanceFor(d, "challenge")).toBeNull();
    }
    expect(new Set(DIRS.map(d => guidanceFor(d, "guided"))).size).toBe(6);      // each direction has its own method
  });
  it("guidance is method-only: it never contains digits beyond the positional weights", () => {
    for (const d of DIRS) for (const l of ["guided", "practice"] as const) {
      const digits = (guidanceFor(d, l) || "").match(/\d+/g) || [];
      for (const n of digits) expect([1, 2, 4, 8, 16, 32, 64, 128]).toContain(Number(n));
    }
  });
});

describe("final-answer input per target base", () => {
  it("binary / decimal use a numeric keypad; hex uses text; placeholders are examples, lengths fit the octet", () => {
    expect(answerInputFor(2)).toEqual({ inputMode: "numeric", placeholder: "مثال: 00101101", maxLength: 8, subscript: "₂" });
    expect(answerInputFor(10)).toEqual({ inputMode: "numeric", placeholder: "مثال: 45", maxLength: 3, subscript: "₁₀" });
    expect(answerInputFor(16)).toEqual({ inputMode: "text", placeholder: "مثال: 3A", maxLength: 2, subscript: "₁₆" });
  });
  it("the placeholder example can NEVER be the task's own answer", () => {
    expect(answerInputFor(2, 45).placeholder).toBe("مثال: 00011010");   // a 45 task must not show 00101101
    expect(answerInputFor(10, 45).placeholder).toBe("مثال: 26");
    expect(answerInputFor(16, 58).placeholder).toBe("مثال: 1F");        // a 58 (3A) task must not show 3A
    expect(answerInputFor(2, 10).placeholder).toBe("مثال: 00101101");   // otherwise the primary example
    // exhaustive: for every value 0–255 and each target base, the placeholder differs from that value's canonical form
    const canon = (v: number, b: number) => b === 2 ? v.toString(2).padStart(8, "0") : b === 16 ? v.toString(16).toUpperCase().padStart(2, "0") : String(v);
    for (let v = 0; v <= 255; v++) for (const b of [2, 10, 16]) expect(answerInputFor(b, v).placeholder).not.toBe("مثال: " + canon(v, b));
  });
  it("sourceValueOf parses the displayed source in its base", () => {
    expect(sourceValueOf("45", 10)).toBe(45);
    expect(sourceValueOf("00101101", 2)).toBe(45);
    expect(sourceValueOf("3A", 16)).toBe(58);
    expect(sourceValueOf("", 10)).toBeUndefined();
  });
});

describe("formatElapsed", () => {
  it("renders mm:ss", () => {
    expect(formatElapsed(0)).toBe("00:00");
    expect(formatElapsed(222000)).toBe("03:42");
    expect(formatElapsed(65000)).toBe("01:05");
  });
});
