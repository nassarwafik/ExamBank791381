import { describe, expect, it } from "vitest";
import { add, cmp, div, floorLog10, fromNumber, mul, parseDecimal, q, roundHalfAway, toFixed, toNumber, toSignificant, type Q } from "./exact";
import { LAB_UNITS, fromCanonical, labUnit, toCanonical } from "./units";
import { answerTolerance, formatAtPrecision, lastPlaceUnit, validatePrecision, withinTolerance } from "./precision";
import {
  BALANCE_RESOLUTION, LAB_SOLUTES, balanceMax, concentrationAtVolume, dilute, illustrativeIntensity, isBalanceMass, labSolute, prepareFromSolid,
  requiredAliquot, requiredMass
} from "./solutions";

const D = (s: string) => parseDecimal(s) as Q;
const text = (v: Q, places: number) => toFixed(v, places);

describe("21D-D.3 exact arithmetic — decisions never depend on floating point", () => {
  it("parses bounded decimals and e-notation; refuses everything else", () => {
    expect(text(D("0.100"), 3)).toBe("0.100");
    expect(text(D("1.0e-5"), 6)).toBe("0.000010");
    expect(text(D("-3"), 0)).toBe("-3");
    expect(cmp(add(D("0.1"), D("0.2")), D("0.3"))).toBe(0); // exactly, unlike doubles
    for (const bad of ["", " 1", "1 ", "+1", "1,5", "0x10", "Infinity", "NaN", "1e999", "1e31", "01", ".5", "5.", "1..2", "١٫٥", "1e", "--1", "1".repeat(40), "1234567890123", "0.1234567890123"]) {
      expect(parseDecimal(bad), bad).toBeNull();
    }
    expect(parseDecimal(12 as unknown)).toBeNull();
    // the bounds are exactly 12 integer and 12 fraction digits
    expect(text(D("123456789012"), 0)).toBe("123456789012");
    expect(text(D("0.123456789012"), 12)).toBe("0.123456789012");
  });
  it("rounds half AWAY from zero exactly at a boundary (2.675 → 2.68, where binary floating point gives 2.67)", () => {
    expect((2.675).toFixed(2)).toBe("2.67"); // the defect avoided
    expect(toFixed(D("2.675"), 2)).toBe("2.68");
    expect(toFixed(D("-2.675"), 2)).toBe("-2.68");
    expect(toFixed(D("2.6749999"), 2)).toBe("2.67");
    expect(text(roundHalfAway(D("1250"), -2), 0)).toBe("1300");
  });
  it("converts a double to its EXACT rational value and finds ⌊log₁₀⌋ exactly", () => {
    expect(fromNumber(0.1)).toEqual(q(3602879701896397n, 36028797018963968n));
    expect(fromNumber(NaN)).toBeNull();
    expect(fromNumber(Infinity)).toBeNull();
    expect(fromNumber(-0.5)).toEqual(q(-1n, 2n));
    expect(floorLog10(D("1000"))).toBe(3);
    expect(floorLog10(D("999.999"))).toBe(2);
    expect(floorLog10(D("0.001"))).toBe(-3);
    expect(toNumber(div(D("1"), D("3")))).toBeCloseTo(1 / 3, 15);
  });
  it("formats significant figures with exact carry (9.995 → 10.0 at 3 s.f.) and e-notation for extreme magnitudes", () => {
    expect(toSignificant(D("0.0012345"), 3)).toBe("0.00123");
    expect(toSignificant(D("9.995"), 3)).toBe("10.0");
    expect(toSignificant(D("123456"), 2)).toBe("120000");
    expect(toSignificant(D("1.0e-9"), 2)).toBe("1.0e-9");
    expect(toSignificant(D("0"), 3)).toBe("0.00");
  });
});

describe("21D-D.3 units — exact conversion inside one dimension", () => {
  it("mL ↔ L, mmol ↔ mol, mg ↔ g, min ↔ s and °C ↔ K are exact", () => {
    const mL = labUnit("volume", "mL")!, L = labUnit("volume", "L")!;
    expect(cmp(toCanonical(D("25.0"), mL), D("0.0250"))).toBe(0);
    expect(cmp(fromCanonical(D("0.0250"), mL), D("25"))).toBe(0);
    expect(cmp(toCanonical(D("0.0250"), L), D("0.025"))).toBe(0);
    expect(cmp(toCanonical(D("25"), labUnit("temperature", "°C")!), D("298.15"))).toBe(0);
    expect(cmp(toCanonical(D("2"), labUnit("time", "min")!), D("120"))).toBe(0);
    expect(cmp(toCanonical(D("1"), labUnit("rateConstant1", "1/min")!), div(D("1"), D("60")))).toBe(0);
  });
  it("refuses a unit from another dimension", () => {
    expect(labUnit("volume", "g")).toBeUndefined();
    expect(labUnit("concentration", "M")).toBeUndefined(); // only the declared ids
    expect(LAB_UNITS.volume[0].id).toBe("L"); // canonical first
  });
});

describe("21D-D.3 answer-precision policy — explicit, tied to the reporting precision, no free tolerance", () => {
  it("validates the policy strictly", () => {
    expect(validatePrecision({ decimals: 3 })).toEqual({ decimals: 3 });
    expect(validatePrecision({ significant: 3 })).toEqual({ significant: 3 });
    for (const bad of [null, {}, { decimals: 7 }, { decimals: -1 }, { decimals: 1.5 }, { significant: 0 }, { significant: 7 }, { decimals: 2, significant: 2 }, { tolerance: 0.1 }, [2]]) {
      expect(validatePrecision(bad), JSON.stringify(bad)).toBeNull();
    }
  });
  it("accepts exactly the answers that agree with the trusted value to the reported precision (inclusive half unit)", () => {
    const p = { decimals: 3 }, trusted = D("0.1004"), tol = answerTolerance(p, trusted);
    expect(text(tol, 4)).toBe("0.0005");
    expect(withinTolerance(D("0.100"), trusted, tol)).toBe(true);
    expect(withinTolerance(D("0.1009"), trusted, tol)).toBe(true);
    expect(withinTolerance(D("0.101"), trusted, tol)).toBe(false);
    expect(withinTolerance(D("0.0999"), trusted, tol)).toBe(true);
    expect(withinTolerance(D("0.0998"), trusted, tol)).toBe(false);
    // a trusted value exactly on a rounding boundary accepts both neighbours
    const edge = D("2.875"), t2 = answerTolerance({ decimals: 2 }, edge);
    expect(withinTolerance(D("2.87"), edge, t2)).toBe(true);
    expect(withinTolerance(D("2.88"), edge, t2)).toBe(true);
    expect(withinTolerance(D("2.89"), edge, t2)).toBe(false);
  });
  it("uses the magnitude of the trusted value for significant figures, and an instrument floor when it is larger", () => {
    expect(text(lastPlaceUnit({ significant: 3 }, D("0.0123")), 4)).toBe("0.0001");
    expect(text(lastPlaceUnit({ significant: 2 }, D("150")), 0)).toBe("10");
    expect(text(answerTolerance({ decimals: 2 }, D("25.00"), D("0.05")), 2)).toBe("0.05"); // burette ±0.05 mL dominates ±0.005
    expect(formatAtPrecision({ significant: 3 }, D("0.83919")), "0.839");
    expect(formatAtPrecision({ decimals: 2 }, D("2.675"))).toBe("2.68");
  });
});

describe("21D-D.3 LAB A — solutions and dilution reproduce the OpenStax Chemistry 2e §3.3 worked examples", () => {
  const NaCl = labSolute("NaCl")!, CaCl2 = labSolute("CaCl2")!, CuSO4 = labSolute("CuSO4")!;
  it("molar masses come from the D.1 CIAAW-2024 weights, exactly", () => {
    expect(toFixed(NaCl.molarMass, 3)).toBe("58.440");
    expect(toFixed(CaCl2.molarMass, 3)).toBe("110.978");
    expect(toFixed(CuSO4.molarMass, 3)).toBe("249.677"); // the pentahydrate is weighed: 63.546 + 32.06 + 9 × 15.999 + 10 × 1.008
    expect(LAB_SOLUTES.map(s => s.id)).toEqual(["NaCl", "KCl", "CaCl2", "glucose", "CuSO4"]);
  });
  it("Example 3.14: 0.133 mol in 355 mL is 0.375 M (c = n / V)", () => {
    expect(toSignificant(div(D("0.133"), D("0.355")), 3)).toBe("0.375");
  });
  it("Example 3.17 check: 250.0 mL of 0.200 M CaCl₂ needs 5.55 g (m = c·V·M); the balance weighs 5.55 g", () => {
    const m = requiredMass(CaCl2, D("0.200"), 250);
    expect(toFixed(m.exact, 4)).toBe("5.5489");
    expect(toFixed(m.weighable, 2)).toBe("5.55");
    const made = prepareFromSolid(CaCl2, m.weighable, 250);
    expect(made.ok && toSignificant(made.concentration, 3)).toBe("0.200");
  });
  it("Example 3.17: 0.250 L of 5.30 M NaCl needs 77.4 g (exact computation; that solution is above the lab's supported range)", () => {
    expect(toSignificant(requiredMass(NaCl, D("5.30"), 250).exact, 3)).toBe("77.4");
    expect(prepareFromSolid(NaCl, D("77.43"), 250)).toMatchObject({ ok: false, code: "LAB_SOLUTION_ABOVE_MODEL" });
  });
  it("Example 3.19 check: 25.0 mL of 2.04 M diluted to 500.0 mL is 0.102 M; the amount of solute is conserved", () => {
    const r = dilute(D("2.04"), 25, 500);
    expect(r.ok && toFixed(r.concentration, 3)).toBe("0.102");
    expect(r.ok && toFixed(r.moles, 4)).toBe("0.0510");
    expect(r.ok && cmp(mul(r.concentration, r.volumeL), mul(D("2.04"), D("0.025")))).toBe(0); // c₁V₁ = c₂V₂ exactly
  });
  it("Example 3.21: 5.00 L of 0.100 M KOH from a 1.59 M stock needs 0.314 L (V₁ = c₂V₂ / c₁)", () => {
    expect(toSignificant(div(requiredAliquot(D("1.59"), D("0.100"), 5000), D("1000")), 3)).toBe("0.314");
  });
  it("refuses invalid preparations: non-catalog glassware, zero mass, an aliquot not smaller than the flask", () => {
    expect(prepareFromSolid(NaCl, D("1.00"), 200)).toMatchObject({ ok: false, code: "LAB_SOLUTION_INVALID" });
    expect(prepareFromSolid(NaCl, D("0"), 250)).toMatchObject({ ok: false, code: "LAB_SOLUTION_INVALID" });
    expect(dilute(D("1.00"), 50, 50)).toMatchObject({ ok: false, code: "LAB_SOLUTION_INVALID" });
    expect(dilute(D("1.00"), 3, 100)).toMatchObject({ ok: false, code: "LAB_SOLUTION_INVALID" });
    expect(dilute(D("0"), 10, 100)).toMatchObject({ ok: false, code: "LAB_SOLUTION_INVALID" });
  });
  it("the balance offers multiples of 0.01 g up to the supported concentration in the largest flask (rounded DOWN)", () => {
    const max = balanceMax(NaCl, [100, 250]);
    expect(toFixed(max, 2)).toBe("14.61"); // 1.00 M × 0.250 L × 58.44 g/mol = 14.61 g
    expect(isBalanceMass(D("14.61"), max)).toBe(true);
    expect(isBalanceMass(D("14.62"), max)).toBe(false);
    expect(isBalanceMass(D("1.005"), max)).toBe(false);
    expect(isBalanceMass(D("0"), max)).toBe(false);
    expect(toFixed(BALANCE_RESOLUTION, 2)).toBe("0.01");
    const cu = balanceMax(CuSO4, [250]); // 0.50 M × 0.250 L × 249.677 = 31.209625 → 31.20 (down, never above the bound)
    expect(toFixed(cu, 2)).toBe("31.20");
    expect(prepareFromSolid(CuSO4, cu, 250).ok).toBe(true);
  });
  it("at constant n, c is inversely proportional to V (the c-versus-V relation), and halving V doubles c exactly", () => {
    const n = D("0.0100");
    expect(cmp(concentrationAtVolume(n, 100), mul(concentrationAtVolume(n, 200 as number), q(2n)))).toBe(0);
    expect(toFixed(concentrationAtVolume(n, 250), 3)).toBe("0.040");
  });
  it("the solution colour is illustrative: 0 for colourless solutes, proportional to c / c_max for CuSO₄", () => {
    expect(illustrativeIntensity(NaCl, D("1.00"))).toBe(0);
    expect(illustrativeIntensity(CuSO4, D("0.25"))).toBeCloseTo(0.5, 12);
    expect(illustrativeIntensity(CuSO4, D("0.50"))).toBe(1);
  });
});
