import { describe, expect, it } from "vitest";
import { parseDecimal, toFixed, toNumber, type Q } from "./exact";
import {
  ACID_BASE_SPECIES, INDICATORS, KW, acidBaseSpecies, excessRoot, formatPh, indicatorAppearance, indicatorById, phClassOf, solutionPh, weakRoot, type Indicator
} from "./acidBase";
import { parseFormula } from "../formula";
import {
  BURETTE, ENDPOINT_TOLERANCE_ML, indicatorEndpoint, indicatorSuitability, isBuretteStep, titrationCurve, titrationPh, titrationSetup, volumeAtPh,
  type TitrationSetup
} from "./titration";
import {
  activationEnergyFrom, concentrationAt, halfLife, initialRate, rateConstant, timeToFraction, type RateModel
} from "./kinetics";

const D = (s: string) => parseDecimal(s) as Q;
const ph2 = (s: string, c: string) => { const r = solutionPh(acidBaseSpecies(s)!, D(c)); if (!r.ok) throw new Error("unsupported"); return r; };
const setupOf = (analyte: string, ca: string, va: string, titrant: string, cb: string): TitrationSetup => {
  const r = titrationSetup({ analyte: { species: analyte, concentration: D(ca), volumeML: D(va) }, titrant: { species: titrant, concentration: D(cb) } });
  if (!r.ok) throw new Error(r.code);
  return r.setup;
};

describe("21D-D.3 LAB B — pH of one solute at 25 °C (charge balance with Kw = 1.0 × 10⁻¹⁴)", () => {
  it("every species and indicator in the catalogs is usable by the D.1 formula engine (H–Kr; barium is outside it)", () => {
    for (const sp of ACID_BASE_SPECIES) expect(parseFormula(sp.formula).ok, sp.formula).toBe(true);
    expect(parseFormula("Ba(OH)2").ok).toBe(false); // why Ca(OH)₂ — not Ba(OH)₂ — is the catalog's diprotic strong base
  });
  it("strong acids and bases: 1.0 M HCl → 0.00, 0.010 M HCl → 2.00, 0.010 M NaOH → 12.00, 0.0050 M Ca(OH)₂ → 12.00 (two OH⁻)", () => {
    expect(ph2("HCl", "1.0").pH).toBeLessThan(0); // −4 × 10⁻¹⁵: water adds a tiny amount of H₃O⁺
    expect(formatPh(ph2("HCl", "1.0").pH)).toBe("0.00"); // never "-0.00"
    expect(formatPh(-0.004)).toBe("0.00");
    expect(formatPh(-0.006)).toBe("-0.01");
    expect(ph2("HCl", "0.010").pH.toFixed(2)).toBe("2.00");
    expect(ph2("HNO3", "0.0010").pH.toFixed(2)).toBe("3.00");
    expect(ph2("NaOH", "0.010").pH.toFixed(2)).toBe("12.00");
    expect(ph2("KOH", "0.10").pOH.toFixed(2)).toBe("1.00");
    expect(ph2("CaOH2", "0.0050").pH.toFixed(2)).toBe("12.00");
  });
  it("very dilute strong acid includes water: 1.0 × 10⁻⁸ M HCl has pH 6.98 — never the naive 8.00 (a basic answer for an acid)", () => {
    const r = ph2("HCl", "0.00000001");
    expect(r.pH.toFixed(2)).toBe("6.98");
    expect(r.pH).toBeLessThan(7);
    expect(r.h3o * r.oh).toBeCloseTo(KW, 25);
  });
  it("pure water and a neutral salt are neutral (pH 7.00); [H₃O⁺][OH⁻] = Kw everywhere", () => {
    expect(ph2("H2O", "0").pH.toFixed(2)).toBe("7.00");
    expect(ph2("NaCl", "0.10").pH.toFixed(2)).toBe("7.00");
    for (const s of ACID_BASE_SPECIES) {
      const c = s.id === "H2O" ? "0" : "0.010", r = ph2(s.id, c);
      expect(Math.abs(r.h3o * r.oh - KW) / KW, s.id).toBeLessThan(1e-12);
      expect(r.pH + r.pOH).toBeCloseTo(14, 12);
    }
  });
  it("weak acid / base: the exact charge balance matches an INDEPENDENT cubic solution (Newton on h³ + Ka·h² − (Ka·c + Kw)·h − Ka·Kw = 0)", () => {
    const cubic = (c: number, K: number) => { let h = Math.sqrt(K * c + KW) * 2 + 1e-7; for (let i = 0; i < 200; i++) { const f = h ** 3 + K * h ** 2 - (K * c + KW) * h - K * KW, fp = 3 * h ** 2 + 2 * K * h - (K * c + KW); h -= f / fp; } return h; };
    for (const c of [1.0, 0.10, 0.010, 0.0010, 1e-4, 1e-5, 1e-6]) {
      expect(Math.abs(weakRoot(c, 1.8e-5) - cubic(c, 1.8e-5)) / cubic(c, 1.8e-5), String(c)).toBeLessThan(1e-9);
    }
    expect(ph2("CH3COOH", "0.10").pH.toFixed(3)).toBe("2.875"); // the x ≪ c shortcut would give 2.872
    expect(ph2("CH3COOH", "0.010").pH.toFixed(2)).toBe("3.38");
    expect(ph2("NH3", "0.10").pH.toFixed(2)).toBe("11.12");
    // a weak acid is less acidic than a strong acid of the same concentration
    expect(ph2("CH3COOH", "0.10").pH).toBeGreaterThan(ph2("HCl", "0.10").pH);
  });
  it("monotonic where theory says so: diluting an acid raises its pH, diluting a base lowers it (approaching 7, never crossing)", () => {
    const cs = ["1.0", "0.1", "0.01", "0.001", "0.0001", "0.00001", "0.000001", "0.0000001"];
    for (const [acid, base] of [["HCl", "NaOH"], ["CH3COOH", "NH3"]]) {
      const a = cs.filter(c => solutionPh(acidBaseSpecies(acid)!, D(c)).ok).map(c => ph2(acid, c).pH), b = cs.filter(c => solutionPh(acidBaseSpecies(base)!, D(c)).ok).map(c => ph2(base, c).pH);
      for (let i = 1; i < a.length; i++) { expect(a[i]).toBeGreaterThan(a[i - 1]); expect(a[i]).toBeLessThan(7); }
      for (let i = 1; i < b.length; i++) { expect(b[i]).toBeLessThan(b[i - 1]); expect(b[i]).toBeGreaterThan(7); }
    }
  });
  it("outside the supported range the model says UNSUPPORTED instead of inventing a value", () => {
    expect(solutionPh(acidBaseSpecies("HCl")!, D("2.0"))).toEqual({ ok: false, code: "LAB_PH_UNSUPPORTED" });
    expect(solutionPh(acidBaseSpecies("CaOH2")!, D("0.020"))).toEqual({ ok: false, code: "LAB_PH_UNSUPPORTED" }); // above its bound
    expect(solutionPh(acidBaseSpecies("CH3COOH")!, D("0.0000001"))).toEqual({ ok: false, code: "LAB_PH_UNSUPPORTED" });
    expect(acidBaseSpecies("H2SO4")).toBeUndefined(); // diprotic acid with an incomplete second step: not offered
  });
  it("acidic / neutral / basic is decided by the solute kind, exactly", () => {
    expect(["HCl", "CH3COOH", "NaCl", "H2O", "NaOH", "NH3"].map(id => phClassOf(acidBaseSpecies(id)!))).toEqual(["acidic", "acidic", "neutral", "neutral", "basic", "basic"]);
  });
  it("indicators show their acid colour below, base colour above and a transition inside the cited range", () => {
    const pp = indicatorById("phenolphthalein")!, mo = indicatorById("methylOrange")!;
    expect(indicatorAppearance(pp, 7).state).toBe("acid");
    expect(indicatorAppearance(pp, 9.1)).toMatchObject({ state: "transition", fraction: expect.closeTo(0.5, 12) });
    expect(indicatorAppearance(pp, 12).label).toBe("وردي");
    expect(indicatorAppearance(mo, 2).label).toBe("أحمر");
    expect(INDICATORS.map(i => [i.id, i.low, i.high])).toEqual([["methylOrange", 3.2, 4.4], ["methylRed", 4.8, 6.0], ["bromothymolBlue", 6.0, 7.6], ["phenolphthalein", 8.2, 10.0]]);
  });
  it("excessRoot has no cancellation for a large negative excess (a strong base)", () => {
    expect(Math.abs(excessRoot(-0.1) * 0.1 - KW) / KW).toBeLessThan(1e-11); // [H₃O⁺] = Kw / [OH⁻] with [OH⁻] = 0.1
    expect(excessRoot(0)).toBeCloseTo(1e-7, 20);
  });
});

describe("21D-D.3 LAB C — strong acid / strong base titration reproduces OpenStax Chemistry 2e Table 14.2 and Example 14.21", () => {
  const s = setupOf("HCl", "0.100", "25.00", "NaOH", "0.100");
  it("the equation is balanced by the D.2 engine and the equivalence volume is exact (25.00 mL)", () => {
    expect(s.equation).toBe("HCl + NaOH → NaCl + H2O");
    expect(toFixed(s.equivalenceML, 2)).toBe("25.00");
    expect(toFixed(s.analyteMoles, 5)).toBe("0.00250");
  });
  it("all 19 rows of Table 14.2 (pH to two decimals): 18 exactly, one within the source's last digit because the source rounds [H₃O⁺] first", () => {
    const table: [string, string][] = [["0.0", "1.00"], ["5.0", "1.18"], ["10.0", "1.37"], ["15.0", "1.60"], ["20.0", "1.95"], ["22.0", "2.20"], ["24.0", "2.69"], ["24.5", "3.00"], ["24.9", "3.70"],
      ["25.0", "7.00"], ["25.1", "10.30"], ["25.5", "11.00"], ["26.0", "11.29"], ["28.0", "11.75"], ["30.0", "11.96"], ["35.0", "12.22"], ["40.0", "12.36"], ["45.0", "12.46"], ["50.0", "12.52"]];
    const differs: string[] = [];
    for (const [v, pH] of table) {
      const model = titrationPh(s, D(v));
      expect(Math.abs(model - Number(pH)), v + " mL").toBeLessThanOrEqual(0.0100001);
      if (model.toFixed(2) !== pH) differs.push(v);
    }
    // 22.0 mL: excess 0.300 mmol / 47.0 mL = 6.383 × 10⁻³ M → pH 2.19498 → 2.19; the source rounds to 6.38 × 10⁻³ M → 2.1952 → 2.20
    expect(differs).toEqual(["22.0"]);
    expect(titrationPh(s, D("22.0"))).toBeCloseTo(2.19498, 5);
  });
  it("Example 14.21: [H₃O⁺] = 0.0333 M after 12.50 mL; pH 12.30 after 37.50 mL; pH 7.00 at equivalence", () => {
    expect((10 ** -titrationPh(s, D("12.50"))).toPrecision(3)).toBe("0.0333");
    expect(titrationPh(s, D("37.50")).toFixed(2)).toBe("12.30");
    expect(titrationPh(s, s.equivalenceML).toFixed(2)).toBe("7.00");
  });
  it("2:1 stoichiometry comes from the balanced equation: 25.00 mL of 0.0100 M HCl needs 25.00 mL of 0.00500 M Ca(OH)₂", () => {
    const b = setupOf("HCl", "0.0100", "25.00", "CaOH2", "0.00500");
    expect(b.equation).toBe("2HCl + Ca(OH)2 → CaCl2 + 2H2O");
    expect(b.coefficients).toEqual([2, 1]);
    expect(toFixed(b.equivalenceML, 2)).toBe("25.00");
    expect(titrationPh(b, b.equivalenceML).toFixed(2)).toBe("7.00");
  });
  it("a base analyte titrated with acid: the pH falls and the equivalence volume is exact", () => {
    const b = setupOf("NaOH", "0.0800", "20.00", "HNO3", "0.100");
    expect(b.equation).toBe("HNO3 + NaOH → NaNO3 + H2O");
    expect(toFixed(b.equivalenceML, 2)).toBe("16.00");
    expect(titrationPh(b, D("0"))).toBeGreaterThan(12);
    expect(titrationPh(b, D("20"))).toBeLessThan(2);
  });
  it("the curve is monotonic and every point is computed (never interpolated)", () => {
    const c = titrationCurve(s, 50);
    for (let i = 1; i < c.length; i++) expect(c[i].pH).toBeGreaterThanOrEqual(c[i - 1].pH);
    expect(c.some(p => Math.abs(p.v - 25) < 1e-9)).toBe(true);
  });
  it("refuses what the model does not cover: weak / buffered systems, two acids, out-of-range concentrations and equivalence volumes", () => {
    const bad = (a: string, ca: string, va: string, t: string, cb: string) => titrationSetup({ analyte: { species: a, concentration: D(ca), volumeML: D(va) }, titrant: { species: t, concentration: D(cb) } });
    expect(bad("CH3COOH", "0.100", "25.00", "NaOH", "0.100")).toEqual({ ok: false, code: "LAB_TITRATION_UNSUPPORTED" });
    expect(bad("NH3", "0.100", "25.00", "HCl", "0.100")).toEqual({ ok: false, code: "LAB_TITRATION_UNSUPPORTED" });
    expect(bad("HCl", "0.100", "25.00", "HNO3", "0.100")).toEqual({ ok: false, code: "LAB_TITRATION_PAIR_INVALID" });
    expect(bad("HCl", "0.900", "25.00", "NaOH", "0.100")).toEqual({ ok: false, code: "LAB_TITRATION_CONCENTRATION_RANGE" });
    expect(bad("HCl", "0.100", "25.00", "NaOH", "0.0500")).toEqual({ ok: false, code: "LAB_TITRATION_EQUIVALENCE_RANGE" }); // 50 mL > 45 mL
    expect(bad("HCl", "0.100", "2.00", "NaOH", "0.100")).toEqual({ ok: false, code: "LAB_TITRATION_VOLUME_RANGE" });
    expect(bad("H2SO4", "0.100", "25.00", "NaOH", "0.100")).toEqual({ ok: false, code: "LAB_TITRATION_SPECIES_UNKNOWN" });
  });
  it("end point ≠ equivalence point: the indicator error is computed, and suitability follows the stated ±0.10 mL rule", () => {
    const pp = indicatorById("phenolphthalein")!, mo = indicatorById("methylOrange")!, btb = indicatorById("bromothymolBlue")!;
    const e = indicatorEndpoint(s, pp);
    expect(e.errorML).toBeGreaterThan(0); // pink appears AFTER the equivalence point
    expect(e.errorML).toBeLessThan(0.01);
    expect(indicatorEndpoint(s, mo).errorML).toBeCloseTo(-0.0791, 3); // methyl orange changes before it
    expect(Math.abs(indicatorEndpoint(s, btb).errorML)).toBeLessThan(0.001);
    expect([pp, mo, btb].map(i => indicatorSuitability(s, i))).toEqual(["suitable", "suitable", "suitable"]);
    // ten times more dilute: the vertical jump shrinks and methyl orange is no longer suitable (−0.79 mL), phenolphthalein still is
    const dilute = setupOf("HCl", "0.0100", "25.00", "NaOH", "0.0100");
    expect(indicatorEndpoint(dilute, mo).errorML).toBeCloseTo(-0.780, 3); // (0.25 − 25·10^−3.8) / (0.01 + 10^−3.8) − 25
    expect([pp, mo, btb].map(i => indicatorSuitability(dilute, i))).toEqual(["suitable", "unsuitable", "suitable"]);
  });
  it("an end point near the ±0.10 mL limit is AMBIGUOUS (never offered for grading)", () => {
    const at = (vML: string): Indicator => { const p = titrationPh(s, D(vML)); return { id: "x", nameAr: "x", low: p, high: p, acidColour: "#000", baseColour: "#fff", acidName: "", baseName: "" }; };
    expect(indicatorSuitability(s, at("24.90"))).toBe("ambiguous");
    expect(indicatorSuitability(s, at("24.95"))).toBe("suitable");
    expect(indicatorSuitability(s, at("24.85"))).toBe("unsuitable");
    expect(volumeAtPh(s, titrationPh(s, D("24.90")))).toBeCloseTo(24.9, 9); // the inverse is exact algebra
    expect(ENDPOINT_TOLERANCE_ML).toBe(0.1);
  });
  it("the burette takes whole drops (multiples of 0.05 mL) up to its capacity", () => {
    expect(isBuretteStep(D("0.05"))).toBe(true);
    expect(isBuretteStep(D("1.00"))).toBe(true);
    expect(isBuretteStep(D("0.07"))).toBe(false);
    expect(isBuretteStep(D("0"))).toBe(false);
    expect(isBuretteStep(D("50.05"))).toBe(false);
    expect(toNumber(BURETTE.readingUncertaintyML)).toBe(0.05);
  });
});

describe("21D-D.3 LAB D — reaction rate reproduces OpenStax Chemistry 2e §12.4–12.5", () => {
  it("Example 12.8 (second order): k = 5.76 × 10⁻² L/(mol·min), [A]₀ = 0.200 M, t = 10.0 min → [A] = 0.179 M; Example 12.12: t½ = 86.8 min", () => {
    const k = 5.76e-2 / 60; // per second
    expect(concentrationAt(2, k, 0.2, 600).toPrecision(3)).toBe("0.179");
    expect((halfLife(2, k, 0.2) / 60).toPrecision(3)).toBe("86.8");
  });
  it("Example 12.6 (first order): k = 9.2 × 10⁻³ s⁻¹; 80.0 % decomposition takes 1.7 × 10² s. Example 12.11: t½ = 2.16 × 10⁴ s → k = 3.21 × 10⁻⁵ s⁻¹", () => {
    expect(timeToFraction(1, 9.2e-3, 1, 0.2).toPrecision(2)).toBe("1.7e+2");
    expect((Math.LN2 / 2.16e4).toPrecision(3)).toBe("0.0000321");
    expect(halfLife(1, 3.21e-5, 1).toPrecision(3)).toBe("2.16e+4");
  });
  it("Example 12.13 (Arrhenius, HI): 3.52 × 10⁻⁷ at 555 K and 3.95 × 10⁻² at 781 K → 1.85 × 10⁵ J/mol exactly (source: 1.8 × 10⁵ after rounding its slope to −2.2 × 10⁴ K); N₂O₅ → 1.1 × 10⁵", () => {
    const ea = activationEnergyFrom(3.52e-7, 555, 3.95e-2, 781);
    expect(ea.toPrecision(3)).toBe("1.85e+5");
    expect((-ea / 8.314).toPrecision(2)).toBe("-2.2e+4"); // the source's two-figure slope
    expect(Math.abs(ea - 1.8e5) / 1.8e5).toBeLessThan(0.05); // agrees within the source's two significant figures
    expect(activationEnergyFrom(1.66, 650, 7.39, 700).toPrecision(2)).toBe("1.1e+5");
  });
  it("the model is Arrhenius-consistent: k(25 °C) = k₂₅, the two-point Ea is recovered, higher T and a catalyst both raise k", () => {
    const m: RateModel = { order: 1, k25: 2.0e-3, eaKJ: 75, catalystDropKJ: 20 };
    expect(rateConstant(m, 25, false)).toBeCloseTo(2.0e-3, 15);
    const k35 = rateConstant(m, 35, false);
    expect(activationEnergyFrom(2.0e-3, 298.15, k35, 308.15)).toBeCloseTo(75000, 6);
    expect(k35).toBeGreaterThan(2.0e-3);
    expect(rateConstant(m, 25, true) / rateConstant(m, 25, false)).toBeCloseTo(Math.exp(20000 / (8.314 * 298.15)), 9);
    expect(activationEnergyFrom(rateConstant(m, 25, true), 298.15, rateConstant(m, 35, true), 308.15)).toBeCloseTo(55000, 6); // the catalysed Ea
  });
  it("zero order stops at zero; the initial rate is k[A]₀ⁿ; concentration never increases with time", () => {
    expect(concentrationAt(0, 1e-3, 0.1, 1000)).toBe(0);
    expect(concentrationAt(0, 1e-3, 0.1, 50)).toBeCloseTo(0.05, 15);
    expect(initialRate(2, 0.5, 0.2)).toBeCloseTo(0.02, 15);
    expect(initialRate(0, 0.5, 0.2)).toBe(0.5); // independent of concentration
    for (const order of [0, 1, 2] as const) {
      let prev = Infinity;
      for (let t = 0; t <= 1000; t += 50) { const c = concentrationAt(order, 1e-3, 0.5, t); expect(c).toBeLessThanOrEqual(prev); prev = c; }
    }
  });
});
