import { describe, it, expect } from "vitest";
import {
  PLACES, BIT_WIDTH, emptyBits, valueFromBits, binaryString, activePlaces, nibbleHexDigit, hexString,
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

describe("formatElapsed", () => {
  it("renders mm:ss", () => {
    expect(formatElapsed(0)).toBe("00:00");
    expect(formatElapsed(222000)).toBe("03:42");
    expect(formatElapsed(65000)).toBe("01:05");
  });
});
