import { describe, it, expect } from "vitest";
import {
  PLACES, BIT_WIDTH, DIRECTION_IDS, PATHS,
  renderInBase, bitsFromValue, valueFromBits, activePlaces, nibblesOf,
  buildTask, publicTask, generateRound, evaluateBits, solutionBits, hintForTask, explanationForTask, normalizeValue,
} from "../src/lib/number-conversion.js";

// The pure conversion engine — deterministic generation + server-authoritative grading over the 8-bit octet model,
// bases 2/10/16 ONLY (no octal), values 0–255.

describe("base rendering + bit round-trips", () => {
  it("places are the 8-bit octet 128…1", () => {
    expect(PLACES).toEqual([128, 64, 32, 16, 8, 4, 2, 1]);
    expect(BIT_WIDTH).toBe(8);
  });
  it("renders decimal unpadded, binary 8-bit, hex 2-digit uppercase — the curriculum examples", () => {
    expect(renderInBase(45, 10)).toBe("45");
    expect(renderInBase(45, 2)).toBe("00101101");
    expect(renderInBase(182, 2)).toBe("10110110");
    expect(renderInBase(182, 16)).toBe("B6");
    expect(renderInBase(58, 2)).toBe("00111010");
    expect(renderInBase(58, 16)).toBe("3A");
    expect(renderInBase(0, 2)).toBe("00000000");
    expect(renderInBase(255, 16)).toBe("FF");
    expect(renderInBase(255, 2)).toBe("11111111");
  });
  it("bits ↔ value round-trip for 0, 1, powers of two, 255", () => {
    for (const v of [0, 1, 2, 4, 8, 16, 32, 64, 128, 45, 182, 58, 255]) {
      expect(valueFromBits(bitsFromValue(v))).toBe(v);
    }
    expect(bitsFromValue(45)).toEqual([0, 0, 1, 0, 1, 1, 0, 1]);
    expect(activePlaces(45)).toEqual([32, 8, 4, 1]);
    expect(nibblesOf(58)).toEqual([3, 10]);      // 0x3A
  });
  it("valueFromBits rejects malformed bit arrays (safe invalid handling)", () => {
    expect(valueFromBits([1, 0, 1])).toBeNull();
    expect(valueFromBits([0, 0, 0, 0, 0, 0, 0, 2])).toBeNull();
    expect(valueFromBits("x")).toBeNull();
    expect(valueFromBits(null)).toBeNull();
    expect(normalizeValue(256)).toBeNull();
    expect(normalizeValue(-1)).toBeNull();
  });
});

describe("generator — deterministic, 0–255, only bases 2/10/16, all six directions, no octal", () => {
  it("is deterministic for the same seed/spec and differs for a different seed", () => {
    const a = generateRound("seed-1", { path: "mixed", count: 10 });
    const b = generateRound("seed-1", { path: "mixed", count: 10 });
    const c = generateRound("seed-2", { path: "mixed", count: 10 });
    expect(a).toEqual(b);
    expect(a.map(t => t.taskId)).toEqual(Array.from({ length: 10 }, (_, i) => "t" + (i + 1)));
    expect(a).not.toEqual(c);                                   // different seed → different round (extremely likely)
  });
  it("every task is a supported direction, value 0–255, 8-bit, bases in {2,10,16}", () => {
    const round = generateRound("x", { path: "mixed", count: 40 });
    for (const t of round) {
      expect(DIRECTION_IDS).toContain(t.direction);
      expect(t.value).toBeGreaterThanOrEqual(0);
      expect(t.value).toBeLessThanOrEqual(255);
      expect(Number.isInteger(t.value)).toBe(true);
      expect(t.bitWidth).toBe(8);
      expect([2, 10, 16]).toContain(t.sourceBase);
      expect([2, 10, 16]).toContain(t.targetBase);
      expect(t.sourceBase).not.toBe(8);                         // never octal
      expect(t.targetBase).not.toBe(8);
    }
  });
  it("respects the chosen path's directions; mixed reaches all six", () => {
    const decBin = new Set(generateRound("p", { path: "dec-bin", count: 30 }).map(t => t.direction));
    expect([...decBin].every(d => ["dec2bin", "bin2dec"].includes(d))).toBe(true);
    const binHex = new Set(generateRound("p", { path: "bin-hex", count: 30 }).map(t => t.direction));
    expect([...binHex].every(d => ["bin2hex", "hex2bin"].includes(d))).toBe(true);
    const mixed = new Set(generateRound("varied-seed", { path: "mixed", count: 120 }).map(t => t.direction));
    for (const d of PATHS.mixed) expect(mixed.has(d)).toBe(true);
  });
  it("no two CONSECUTIVE tasks are identical (direction + value)", () => {
    const round = generateRound("dup-check", { path: "mixed", count: 40 });
    for (let i = 1; i < round.length; i++) {
      expect(round[i].direction + ":" + round[i].value).not.toBe(round[i - 1].direction + ":" + round[i - 1].value);
    }
  });
  it("publicTask omits the value / any answer key (no leak)", () => {
    const t = buildTask("t1", "dec2bin", 45);
    const pub = publicTask(t);
    expect(pub).toEqual({ taskId: "t1", direction: "dec2bin", sourceBase: 10, targetBase: 2, sourceDisplay: "45", bitWidth: 8 });
    expect(pub).not.toHaveProperty("value");
    expect(JSON.stringify(pub)).not.toContain("00101101");     // the answer never appears in the public projection
  });
});

describe("evaluator — every direction, boundaries, case-insensitive hex via the shared value", () => {
  const bitsFor = v => bitsFromValue(v);
  it("grades the board value against the task value for all six directions", () => {
    for (const dir of DIRECTION_IDS) {
      for (const v of [0, 1, 128, 255, 45, 182, 58]) {
        const t = buildTask("t", dir, v);
        expect(evaluateBits(t, bitsFor(v)).correct, dir + " " + v).toBe(true);
        expect(evaluateBits(t, bitsFor((v + 1) % 256)).correct, dir + " wrong " + v).toBe(false);
      }
    }
  });
  it("a malformed submission is graded incorrect, never throwing", () => {
    const t = buildTask("t", "dec2bin", 45);
    expect(evaluateBits(t, [1, 0, 1]).correct).toBe(false);
    expect(evaluateBits(t, null).correct).toBe(false);
  });
  it("solutionBits returns the correct eight bits (revealed only by policy)", () => {
    expect(solutionBits(buildTask("t", "dec2bin", 45))).toEqual([0, 0, 1, 0, 1, 1, 0, 1]);
    expect(solutionBits(buildTask("t", "hex2bin", 58))).toEqual([0, 0, 1, 1, 1, 0, 1, 0]);   // 3A → 00111010
  });
});

describe("hints (guide, never reveal) + explanations", () => {
  it("dec→bin hint names the remaining amount and never contains the full answer", () => {
    const t = buildTask("t", "dec2bin", 45);
    const hint = hintForTask(t, bitsFromValue(32));   // 32 placed, 13 remaining
    expect(hint).toContain("13");
    expect(hint).not.toContain("00101101");
  });
  it("hints are direction-appropriate (nibbles for hex, place-values for bin→dec)", () => {
    expect(hintForTask(buildTask("t", "bin2hex", 182), bitsFromValue(0))).toContain("4 بتات");
    expect(hintForTask(buildTask("t", "hex2bin", 58), bitsFromValue(0))).toContain("A");
    expect(hintForTask(buildTask("t", "bin2dec", 45), bitsFromValue(0))).toContain("اجمع");
  });
  it("explanation shows the transformation for the target base", () => {
    expect(explanationForTask(buildTask("t", "dec2bin", 45))).toBe("45 = 32 + 8 + 4 + 1 → 00101101₂");
    expect(explanationForTask(buildTask("t", "bin2dec", 45))).toBe("00101101₂ = 32 + 8 + 4 + 1 = 45");
    expect(explanationForTask(buildTask("t", "dec2hex", 58))).toContain("3A₁₆");
  });
});
