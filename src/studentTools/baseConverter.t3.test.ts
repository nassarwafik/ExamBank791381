import { describe, it, expect } from "vitest";
import { parseInBase, formatInBase, groupDigits, conversionSteps, MAX_VALUE, MAX_INPUT_LENGTH } from "./baseConverter";

const val = (t: string, b: 2 | 8 | 10 | 16) => { const r = parseInBase(t, b); if (!r.ok) throw new Error(r.message); return r.value; };

describe("T3 — parsing in a base", () => {
  it.each([
    ["1011", 2, 11n], ["0b1011", 2, 11n], ["1111 0000", 2, 240n], ["1111_0000", 2, 240n], ["17", 8, 15n], ["0o17", 8, 15n],
    ["255", 10, 255n], ["ff", 16, 255n], ["0xFF", 16, 255n], ["2f", 16, 47n], ["0b11", 16, 2833n], ["0", 2, 0n], ["  42 ", 10, 42n]
  ] as const)("%s in base %i = %s", (t, b, v) => expect(val(t, b)).toBe(v));

  it.each([
    ["102", 2, "INVALID_DIGIT"], ["8", 8, "INVALID_DIGIT"], ["1A", 10, "INVALID_DIGIT"], ["G", 16, "INVALID_DIGIT"], ["-5", 10, "INVALID_DIGIT"],
    ["1.5", 10, "INVALID_DIGIT"], ["", 10, "EMPTY"], ["0x", 16, "EMPTY"], ["0xFF", 10, "PREFIX_MISMATCH"], ["0o7", 2, "PREFIX_MISMATCH"],
    ["18446744073709551616", 10, "TOO_LARGE"], ["1".repeat(MAX_INPUT_LENGTH + 1), 2, "TOO_LONG"]
  ] as const)("%j in base %i is refused (%s) with an Arabic message", (t, b, code) => {
    const r = parseInBase(t, b);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.code).toBe(code); expect(r.message).toMatch(/[؀-ۿ]/); }
  });

  it("names the offending digit and the allowed digits", () => {
    const r = parseInBase("1021", 2);
    expect(!r.ok && r.message).toMatch(/«2».*الثنائي.*0 و1/);
  });

  it("accepts the largest value and round-trips exactly in every base", () => {
    expect(val("FFFFFFFFFFFFFFFF", 16)).toBe(MAX_VALUE);
    for (const v of [0n, 1n, 9n, 10n, 255n, 4096n, 123456789n, MAX_VALUE]) for (const b of [2, 8, 10, 16] as const) expect(val(formatInBase(v, b), b)).toBe(v);
  });
});

describe("T3 — formatting and grouping", () => {
  it("prints upper-case hex and groups digits for reading", () => {
    expect(formatInBase(47n, 16)).toBe("2F");
    expect(groupDigits("101101", 2)).toBe("0010 1101");
    expect(groupDigits("11110000", 2)).toBe("1111 0000");
    expect(groupDigits("1234567", 10)).toBe("1,234,567");
    expect(groupDigits("1777", 8)).toBe("1 777");
    expect(groupDigits("ABCDE", 16)).toBe("A BC DE");
    expect(groupDigits("0", 2)).toBe("0000");
  });
});

describe("T3 — conversion steps", () => {
  it("decimal → binary by repeated division", () => {
    const s = conversionSteps(13n, 10, 2);
    expect(s.kind).toBe("fromDecimal");
    if (s.kind !== "fromDecimal") return;
    expect(s.divisions).toEqual([
      { dividend: "13", quotient: "6", remainder: "1" }, { dividend: "6", quotient: "3", remainder: "0" },
      { dividend: "3", quotient: "1", remainder: "1" }, { dividend: "1", quotient: "0", remainder: "1" }
    ]);
    expect(s.result).toBe("1101");
  });
  it("decimal → hex keeps letter remainders", () => {
    const s = conversionSteps(255n, 10, 16);
    expect(s.kind === "fromDecimal" && s.divisions.map(d => d.remainder)).toEqual(["F", "F"]);
  });
  it("zero divides once", () => {
    const s = conversionSteps(0n, 10, 2);
    expect(s.kind === "fromDecimal" && s.divisions).toEqual([{ dividend: "0", quotient: "0", remainder: "0" }]);
  });
  it("hex → decimal by positional expansion", () => {
    const s = conversionSteps(47n, 16, 10);
    expect(s).toEqual({ kind: "toDecimal", total: "47", terms: [{ digit: "2", base: 16, power: 1, value: "32" }, { digit: "F", base: 16, power: 0, value: "15" }] });
  });
  it("binary ↔ hex / octal by grouping bits", () => {
    expect(conversionSteps(45n, 2, 16)).toEqual({ kind: "grouping", bitsPerDigit: 4, result: "2D", groups: [{ from: "0010", to: "2" }, { from: "1101", to: "D" }] });
    expect(conversionSteps(45n, 2, 8)).toEqual({ kind: "grouping", bitsPerDigit: 3, result: "55", groups: [{ from: "101", to: "5" }, { from: "101", to: "5" }] });
    expect(conversionSteps(45n, 16, 2)).toEqual({ kind: "grouping", bitsPerDigit: 4, result: "101101", groups: [{ from: "2", to: "0010" }, { from: "D", to: "1101" }] });
  });
  it("octal ↔ hex goes through decimal", () => {
    const s = conversionSteps(63n, 8, 16);
    expect(s.kind).toBe("viaDecimal");
    if (s.kind !== "viaDecimal") return;
    expect(s.toDecimal.total).toBe("63");
    expect(s.fromDecimal.result).toBe("3F");
  });
  it("the same base needs no steps; the largest value stays within the row bound", () => {
    expect(conversionSteps(5n, 10, 10)).toEqual({ kind: "same" });
    const s = conversionSteps(MAX_VALUE, 10, 2);
    expect(s.kind === "fromDecimal" && s.divisions.length).toBe(64);
    expect(s.kind === "fromDecimal" && s.result).toBe("1".repeat(64));
  });
});
