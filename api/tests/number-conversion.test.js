import { describe, it, expect } from "vitest";
import {
  PLACES, NIBBLE_PLACES, BIT_WIDTH, DIRECTION_IDS, PATHS,
  renderInBase, bitsFromValue, valueFromBits, isValidBits, activePlaces, nibblesOf, nibbleBreakdown,
  buildTask, publicTask, generateRound, parseAnswer, evaluateAnswer, canonicalAnswerForTask, solutionBits, hintForTask, explanationForTask, normalizeValue,
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
  it("isValidBits enforces the STRICT 8×(0|1) contract (no coercion of booleans/strings/other numbers)", () => {
    expect(isValidBits([0, 1, 0, 1, 0, 1, 0, 1])).toBe(true);
    expect(isValidBits([0, 0, 0, 0, 0, 0, 0, 0])).toBe(true);
    expect(isValidBits([1, 0, 1])).toBe(false);                                  // too short
    expect(isValidBits([0, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(false);                // too long
    expect(isValidBits([0, 0, 0, 0, 0, 0, 0, 2])).toBe(false);                   // value 2
    expect(isValidBits([0, 0, 0, 0, 0, 0, 0, true])).toBe(false);                // boolean, not the number 1
    expect(isValidBits(["0", "1", "0", "1", "0", "1", "0", "1"])).toBe(false);   // strings
    expect(isValidBits(null)).toBe(false);
    expect(isValidBits("11110000")).toBe(false);
  });
  it("nibbleBreakdown teaches the 8|4|2|1 weights per nibble", () => {
    expect(NIBBLE_PLACES).toEqual([8, 4, 2, 1]);
    expect(nibbleBreakdown(11)).toBe("8+2+1 = 11 = B");     // B
    expect(nibbleBreakdown(6)).toBe("4+2 = 6");             // 6 (decimal == hex digit)
    expect(nibbleBreakdown(10)).toBe("8+2 = 10 = A");       // A
    expect(nibbleBreakdown(3)).toBe("2+1 = 3");
    expect(nibbleBreakdown(0)).toBe("0 = 0");
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
  it("the default round is exactly 10 tasks with NO duplicate (direction, value) pair anywhere", () => {
    for (const path of Object.keys(PATHS)) {
      for (const seed of ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"]) {
        const round = generateRound(seed, { path });
        expect(round.length).toBe(10);
        const keys = round.map(t => t.direction + ":" + t.value);
        expect(new Set(keys).size, path + " " + seed).toBe(keys.length);
      }
    }
    // also holds for a large round, where collisions would otherwise be likely
    const big = generateRound("big", { path: "dec-bin", count: 50 });
    expect(new Set(big.map(t => t.direction + ":" + t.value)).size).toBe(50);
  });
  it("two-direction paths always cover BOTH directions; the default mixed round covers ALL SIX", () => {
    for (const seed of ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]) {
      for (const path of ["dec-bin", "bin-hex", "dec-hex"]) {
        const dirs = new Set(generateRound(seed, { path }).map(t => t.direction));
        expect([...dirs].sort(), path + " " + seed).toEqual([...PATHS[path]].sort());
      }
      const mixed = new Set(generateRound(seed, { path: "mixed" }).map(t => t.direction));
      expect(mixed.size, "mixed " + seed).toBe(6);
    }
  });
  it("small explicit counts stay valid + deterministic without impossible coverage", () => {
    const a = generateRound("tiny", { path: "mixed", count: 3 });
    expect(a).toEqual(generateRound("tiny", { path: "mixed", count: 3 }));
    expect(a.length).toBe(3);
    for (const t of a) { expect(PATHS.mixed).toContain(t.direction); expect(t.value).toBeGreaterThanOrEqual(0); expect(t.value).toBeLessThanOrEqual(255); }
    expect(new Set(a.map(t => t.direction + ":" + t.value)).size).toBe(3);
    const one = generateRound("tiny", { path: "dec-bin", count: 1 });
    expect(one.length).toBe(1);
    expect(PATHS["dec-bin"]).toContain(one[0].direction);
  });
  it("representative different server seeds produce different rounds", () => {
    const seeds = ["0f1c", "9a7e", "b3d2", "c4e5", "d6f7"];
    const sigs = new Set(seeds.map(seed => generateRound(seed, { path: "mixed" }).map(t => t.direction + ":" + t.value).join(",")));
    expect(sigs.size).toBe(seeds.length);
  });
  it("publicTask omits the value / any answer key (no leak)", () => {
    const t = buildTask("t1", "dec2bin", 45);
    const pub = publicTask(t);
    expect(pub).toEqual({ taskId: "t1", direction: "dec2bin", sourceBase: 10, targetBase: 2, sourceDisplay: "45", bitWidth: 8 });
    expect(pub).not.toHaveProperty("value");
    expect(JSON.stringify(pub)).not.toContain("00101101");     // the answer never appears in the public projection
  });
});

describe("final-answer evaluator — the TEXT answer is graded, per target base", () => {
  it("canonical answers for the pinned curriculum examples (hex = two uppercase digits)", () => {
    expect(canonicalAnswerForTask(buildTask("t", "dec2bin", 45))).toBe("00101101");
    expect(canonicalAnswerForTask(buildTask("t", "bin2dec", 45))).toBe("45");
    expect(canonicalAnswerForTask(buildTask("t", "bin2hex", 182))).toBe("B6");
    expect(canonicalAnswerForTask(buildTask("t", "hex2bin", 58))).toBe("00111010");
    expect(canonicalAnswerForTask(buildTask("t", "dec2hex", 58))).toBe("3A");
    expect(canonicalAnswerForTask(buildTask("t", "hex2dec", 58))).toBe("58");
    expect(canonicalAnswerForTask(buildTask("t", "dec2hex", 10))).toBe("0A");   // full-octet, two digits
    expect(canonicalAnswerForTask(buildTask("t", "bin2hex", 0))).toBe("00");
    expect(canonicalAnswerForTask(buildTask("t", "hex2dec", 255))).toBe("255");
  });
  it("every direction: the canonical answer grades correct, a different valid value grades incorrect", () => {
    for (const dir of DIRECTION_IDS) {
      for (const v of [0, 1, 10, 128, 255, 45, 182, 58]) {
        const t = buildTask("t", dir, v);
        expect(evaluateAnswer(t, canonicalAnswerForTask(t)), dir + " " + v).toEqual({ status: "correct", value: v });
        const other = buildTask("t", dir, (v + 1) % 256);
        expect(evaluateAnswer(t, canonicalAnswerForTask(other)).status, dir + " wrong " + v).toBe("incorrect");
      }
    }
  });
  it("binary targets accept leading-zero equivalents (max 8 bits)", () => {
    const t = buildTask("t", "dec2bin", 45);
    expect(evaluateAnswer(t, "101101").status).toBe("correct");
    expect(evaluateAnswer(t, "00101101").status).toBe("correct");
    expect(evaluateAnswer(t, "0101101").status).toBe("correct");
    expect(evaluateAnswer(t, " 00101101 ").status).toBe("correct");      // surrounding whitespace ignored
  });
  it("hex targets are case-insensitive and accept one digit when numerically valid", () => {
    expect(evaluateAnswer(buildTask("t", "dec2hex", 58), "3A").status).toBe("correct");
    expect(evaluateAnswer(buildTask("t", "dec2hex", 58), "3a").status).toBe("correct");
    expect(evaluateAnswer(buildTask("t", "bin2hex", 10), "A").status).toBe("correct");
    expect(evaluateAnswer(buildTask("t", "bin2hex", 10), "a").status).toBe("correct");
    expect(evaluateAnswer(buildTask("t", "bin2hex", 10), "0a").status).toBe("correct");
  });
  it("decimal targets accept Arabic-Indic / Persian digits typed on an Arabic keypad", () => {
    expect(evaluateAnswer(buildTask("t", "bin2dec", 45), "٤٥").status).toBe("correct");
    expect(evaluateAnswer(buildTask("t", "hex2dec", 58), "۵۸").status).toBe("correct");
  });
  it("MALFORMED answers are format errors (distinct from incorrect) for each target base", () => {
    const bin = buildTask("t", "dec2bin", 45), dec = buildTask("t", "bin2dec", 45), hex = buildTask("t", "dec2hex", 58);
    for (const a of ["102010", "", "   ", "0010 1101", "101010101", "1b", "-1"]) expect(evaluateAnswer(bin, a).status, "bin " + a).toBe("malformed");
    for (const a of ["4x", "256", "999", "-1", "1.5", "", "1e2", "0x2D", "4 5"]) expect(evaluateAnswer(dec, a).status, "dec " + a).toBe("malformed");
    for (const a of ["G7", "3A5", "0x3A", "", "#3A", "3 A"]) expect(evaluateAnswer(hex, a).status, "hex " + a).toBe("malformed");
    expect(evaluateAnswer(dec, 45).status).toBe("malformed");                // non-string → malformed, never throws
    expect(evaluateAnswer(dec, null).status).toBe("malformed");
    expect(parseAnswer("11", 8)).toEqual({ ok: false });                    // no octal target base
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
  it("hint DETAIL is level-dependent: guided > practice > challenge (boxes-only nudge)", () => {
    const t = buildTask("t", "dec2bin", 45);
    const partial = bitsFromValue(32);   // 13 remaining
    const guided = hintForTask(t, partial, "guided");
    const practice = hintForTask(t, partial, "practice");
    const challenge = hintForTask(t, partial, "challenge");
    expect(guided).toContain("13");                       // guided names the exact remaining amount
    expect(practice).not.toContain("13");                 // practice is lighter — no exact number
    expect(practice).not.toBe(guided);
    expect(challenge).not.toContain("13");                // challenge is a minimal, direction-agnostic nudge
    expect(challenge).not.toBe(guided);
    expect(challenge).not.toBe(practice);
    // a challenge hint carries no nibble/place-value method detail
    const hexChallenge = hintForTask(buildTask("t", "bin2hex", 182), bitsFromValue(0), "challenge");
    expect(hexChallenge).not.toContain("4 بتات");
    expect(hexChallenge).toBe(challenge);                 // same generic nudge regardless of direction
  });
  it("hints use the working board: a correct board with a wrong typed answer gets a read-out hint (no answer leaked)", () => {
    for (const [dir, v] of [["dec2bin", 45], ["bin2dec", 45], ["bin2hex", 182], ["hex2bin", 58], ["dec2hex", 58], ["hex2dec", 58]]) {
      const t = buildTask("t", dir, v);
      const h = hintForTask(t, bitsFromValue(v), "guided", null);
      expect(h, dir).toContain("صناديقك صحيحة");
      expect(h, dir).not.toContain(canonicalAnswerForTask(t));
    }
  });
  it("decimal-target hints use the typed value to say too big / too small (guided only)", () => {
    const t = buildTask("t", "bin2dec", 45);
    expect(hintForTask(t, bitsFromValue(0), "guided", 60)).toContain("أكبر");
    expect(hintForTask(t, bitsFromValue(0), "guided", 30)).toContain("أصغر");
    expect(hintForTask(t, bitsFromValue(0), "practice", 60)).not.toContain("أكبر");
    expect(hintForTask(t, bitsFromValue(0), "guided", 60)).not.toContain("45");
  });
  it("explanation follows the CONVERSION DIRECTION (pinned curriculum examples; binary-bridge, never ÷16)", () => {
    expect(explanationForTask(buildTask("t", "dec2bin", 45))).toBe("45₁₀ → 32 + 8 + 4 + 1 → 00101101₂");
    expect(explanationForTask(buildTask("t", "bin2dec", 45))).toBe("00101101₂ → 32 + 8 + 4 + 1 → 45₁₀");
    expect(explanationForTask(buildTask("t", "bin2hex", 182))).toBe("10110110₂ → 1011 | 0110 → (8+2+1 = 11 = B) | (4+2 = 6) → B6₁₆");
    expect(explanationForTask(buildTask("t", "hex2bin", 58))).toBe("3A₁₆ → 3 | A → 0011 | 1010 → 00111010₂");
    expect(explanationForTask(buildTask("t", "dec2hex", 58))).toBe("58₁₀ → 00111010₂ → 0011 | 1010 → 3 | A → 3A₁₆");
    expect(explanationForTask(buildTask("t", "hex2dec", 58))).toBe("3A₁₆ → 00111010₂ → 32 + 16 + 8 + 2 → 58₁₀");
    // decimal↔hex must teach via the binary bridge, not division-by-16
    for (const v of [0, 58, 182, 255]) {
      expect(explanationForTask(buildTask("t", "dec2hex", v))).not.toContain("16");
      expect(explanationForTask(buildTask("t", "hex2dec", v))).toContain("₂");   // shows the 8-bit binary bridge
    }
  });
});
