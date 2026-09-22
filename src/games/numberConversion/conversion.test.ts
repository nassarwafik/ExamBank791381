import { describe, it, expect } from "vitest";
import {
  PLACES, NIBBLE_PLACES, BIT_WIDTH, emptyBits, valueFromBits, binaryString, activePlaces, nibbleHexDigit, hexString,
  nibbleWeightAt, boardViewFor, readoutPolicy,
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

describe("assistance-level readout policy — genuinely different scaffolding (Fix 2)", () => {
  it("guided shows everything; practice hides the derived target; challenge shows boxes only until Check", () => {
    expect(readoutPolicy("guided", false)).toEqual({ showSum: true, showDerived: true, showBinaryLine: true, showNibbleHexLive: true });
    expect(readoutPolicy("practice", false)).toEqual({ showSum: true, showDerived: false, showBinaryLine: true, showNibbleHexLive: false });
    expect(readoutPolicy("challenge", false)).toEqual({ showSum: false, showDerived: false, showBinaryLine: false, showNibbleHexLive: false });
    // guided and challenge are NOT identical while working
    expect(readoutPolicy("guided", false)).not.toEqual(readoutPolicy("challenge", false));
    // after Check / reveal (locked) every level shows the full teaching readout
    for (const l of ["guided", "practice", "challenge"] as const) {
      expect(readoutPolicy(l, true)).toEqual({ showSum: true, showDerived: true, showBinaryLine: true, showNibbleHexLive: true });
    }
  });
});

describe("formatElapsed", () => {
  it("renders mm:ss", () => {
    expect(formatElapsed(0)).toBe("00:00");
    expect(formatElapsed(222000)).toBe("03:42");
    expect(formatElapsed(65000)).toBe("01:05");
  });
});
