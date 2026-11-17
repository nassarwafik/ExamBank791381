import { describe, it, expect } from "vitest";
import { evaluateCalculator, formatCalculatorNumber, CALCULATOR_LIMITS, type CalculatorOptions } from "./calculatorEngine";

const SCI: CalculatorOptions = { variant: "scientific", angleUnit: "deg" };
const RAD: CalculatorOptions = { variant: "scientific", angleUnit: "rad" };
const BASIC: CalculatorOptions = { variant: "basic", angleUnit: "deg" };
const show = (src: string, o: CalculatorOptions = SCI) => { const r = evaluateCalculator(src, o); return r.ok ? r.display : "ERR:" + r.code; };

describe("T2 — calculator arithmetic and precedence", () => {
  it.each([
    ["1+2*3", "7"], ["(1+2)*3", "9"], ["10/4", "2.5"], ["2-3-4", "-5"], ["8/4/2", "1"], ["-2^2", "-4"], ["(-2)^2", "4"],
    ["2^3^2", "512"], ["2^-1", "0.5"], ["--3", "3"], ["+5", "5"], ["0.1+0.2", "0.3"], [".5*4", "2"], ["1e3+1", "1001"],
    ["2×3÷4", "1.5"], ["7−2", "5"], ["  3 * ( 4 + 1 ) ", "15"]
  ])("%s = %s", (src, out) => expect(show(src)).toBe(out));

  it.each([["2π", "6.28318530718"], ["2(3+1)", "8"], ["(1+1)(2+1)", "6"], ["2sin(30)", "1"], ["3√4", "6"], ["2e", "5.43656365692"]])(
    "implicit multiplication %s = %s", (src, out) => expect(show(src)).toBe(out));

  it("refuses an ambiguous number after a value", () => {
    expect(show("2 3")).toBe("ERR:SYNTAX");
    expect(show("(2)3")).toBe("ERR:SYNTAX");
  });
});

describe("T2 — scientific functions", () => {
  it.each([
    ["sin(30)", "0.5"], ["cos(60)", "0.5"], ["tan(45)", "1"], ["sin(180)", "0"], ["cos(90)", "0"], ["sin(-390)", "-0.5"],
    ["asin(1)", "90"], ["acos(0.5)", "60"], ["atan(1)", "45"], ["sqrt(16)", "4"], ["√2", "1.41421356237"], ["√(9)+1", "4"],
    ["cbrt(-27)", "-3"], ["ln(e)", "1"], ["log(1000)", "3"], ["exp(0)", "1"], ["abs(-4.5)", "4.5"], ["5!", "120"], ["0!", "1"],
    ["3!!", "720"], ["π", "3.14159265359"], ["pi*2", "6.28318530718"]
  ])("degrees: %s = %s", (src, out) => expect(show(src)).toBe(out));

  it("uses radians when the teacher chose radians", () => {
    expect(show("sin(pi/2)", RAD)).toBe("1");
    expect(show("cos(pi)", RAD)).toBe("-1");
    expect(show("atan(1)", RAD)).toBe("0.785398163397");
    expect(show("sin(30)", RAD)).toBe("-0.988031624093");
  });

  it.each([
    ["sqrt(-1)", "DOMAIN"], ["√-4", "DOMAIN"], ["ln(0)", "DOMAIN"], ["log(-1)", "DOMAIN"], ["asin(2)", "DOMAIN"], ["acos(-1.5)", "DOMAIN"],
    ["tan(90)", "DOMAIN"], ["tan(270)", "DOMAIN"], ["(-3)!", "DOMAIN"], ["2.5!", "DOMAIN"], ["(-8)^(1/3)", "DOMAIN"],
    ["1/0", "DIVIDE_BY_ZERO"], ["0^-1", "DIVIDE_BY_ZERO"], ["1/(2-2)", "DIVIDE_BY_ZERO"],
    ["171!", "OVERFLOW"], ["10^400", "OVERFLOW"], ["1e400", "OVERFLOW"], ["exp(1000)", "OVERFLOW"]
  ])("%s is a %s error", (src, code) => expect(show(src)).toBe("ERR:" + code));

  it("tan(90) in radians is a finite value, tan(pi/2) is refused", () => {
    expect(show("tan(pi/2)", RAD)).toBe("ERR:DOMAIN");
    expect(show("tan(90)", RAD)).toMatch(/^-1\.99520/);
  });
});

describe("T2 — Ans", () => {
  it("uses the previous result", () => {
    expect(show("Ans*2", { ...SCI, ans: 21 })).toBe("42");
    expect(show("ans+1", { ...BASIC, ans: 1 })).toBe("2");
  });
  it("refuses Ans before any result", () => {
    expect(show("Ans+1")).toBe("ERR:NO_ANS");
  });
});

describe("T2 — basic variant", () => {
  it("computes the four operations and brackets", () => {
    expect(show("(12+3)*2/5-1", BASIC)).toBe("5");
  });
  it.each(["2^3", "5!", "√4", "sin(30)", "pi", "e", "sqrt(4)"])("refuses %s", src => {
    expect(show(src, BASIC)).toBe("ERR:NOT_IN_BASIC");
  });
});

describe("T2 — input bounds and syntax", () => {
  it.each(["", "   ", "1+", "*2", "(1+2", "1+2)", "()", "1..2", "1.2.3", "sin", "sin 30", "2#3", "alert(1)", "constructor", "__proto__", "x+1", "1,5"])(
    "refuses %j", src => expect(show(src)).toMatch(/^ERR:(EMPTY|SYNTAX|UNKNOWN_NAME)$/));

  it("bounds the length and the nesting depth", () => {
    expect(show("1+".repeat(100) + "1")).toBe("ERR:TOO_LONG");
    expect(show("(".repeat(CALCULATOR_LIMITS.maxDepth + 1) + "1" + ")".repeat(CALCULATOR_LIMITS.maxDepth + 1))).toBe("ERR:TOO_DEEP");
    expect(show("-".repeat(CALCULATOR_LIMITS.maxDepth + 1) + "1")).toBe("ERR:TOO_DEEP");
    expect(show("(".repeat(10) + "1" + ")".repeat(10))).toBe("1");
  });

  it("every error carries an Arabic message", () => {
    const r = evaluateCalculator("1/0", SCI);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/[؀-ۿ]/);
  });

  it("never evaluates JavaScript", () => {
    expect(show("globalThis")).toBe("ERR:UNKNOWN_NAME");
    expect(show("1;2")).toBe("ERR:SYNTAX");
    expect(show("`1`")).toBe("ERR:SYNTAX");
  });
});

describe("T2 — number formatting", () => {
  it.each([
    [0, "0"], [-0, "0"], [0.30000000000000004, "0.3"], [1 / 3, "0.333333333333"], [123456789012, "123456789012"],
    [1234567890123, "1.23456789012e+12"], [1.5e-10, "1.5e-10"], [-2.5e20, "-2.5e+20"], [Infinity, "—"], [NaN, "—"]
  ])("%s → %s", (v, out) => expect(formatCalculatorNumber(v)).toBe(out));
});
