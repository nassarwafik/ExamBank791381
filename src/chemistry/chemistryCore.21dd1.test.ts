import { describe, expect, it } from "vitest";
import { CHEM_ELEMENTS, CHEM_SYMBOLS, chemElement, chemMassNumbers, chemMetalClass, scaledWeight } from "./elements";
import { blockOf, formatConfiguration, neutralConfiguration, outerShellElectrons, shellsOf, speciesConfiguration, valenceElectrons } from "./electrons";
import { displayFormula, empiricalComposition, hillFormula, massPercent, molarMass, molarMassScaled, parseFormula, sameComposition } from "./formula";
import { MOLECULES, angleAt, bondOrderSum, chemMolecule, distance, lonePairTotal, moleculeComposition, neighbours, piBonds, sigmaBonds, vseprShape } from "./molecules";

// Phase 21D-D.1 — SCIENCE REFERENCE TESTS of the chemistry core. Every expected value below is transcribed independently from the primary
// source (CIAAW 2024 abridged atomic weights, CIAAW isotopic compositions, NIST ASD ground configurations, NIST CCCBDB geometries) or
// computed BY HAND from them (molar masses, mass percentages) — never produced by the implementation under test.

// CIAAW "Abridged Standard Atomic Weights 2024" (https://www.ciaaw.org/abridged-atomic-weights.htm, retrieved 2026-10-10), Z = 1 … 36.
const CIAAW_2024 = `H 1.0080, He 4.0026, Li 6.94, Be 9.0122, B 10.81, C 12.011, N 14.007, O 15.999, F 18.998, Ne 20.180, Na 22.990, Mg 24.305,
Al 26.982, Si 28.085, P 30.974, S 32.06, Cl 35.45, Ar 39.95, K 39.098, Ca 40.078, Sc 44.956, Ti 47.867, V 50.942, Cr 51.996, Mn 54.938,
Fe 55.845, Co 58.933, Ni 58.693, Cu 63.546, Zn 65.38, Ga 69.723, Ge 72.630, As 74.922, Se 78.971, Br 79.904, Kr 83.798`;
// CIAAW isotopic compositions (https://www.ciaaw.org/isotopic-abundances.htm, retrieved 2026-10-10): naturally occurring mass numbers.
const CIAAW_ISOTOPES = `H 1 2; He 3 4; Li 6 7; Be 9; B 10 11; C 12 13; N 14 15; O 16 17 18; F 19; Ne 20 21 22; Na 23; Mg 24 25 26; Al 27; Si 28 29 30;
P 31; S 32 33 34 36; Cl 35 37; Ar 36 38 40; K 39 40 41; Ca 40 42 43 44 46 48; Sc 45; Ti 46 47 48 49 50; V 50 51; Cr 50 52 53 54; Mn 55;
Fe 54 56 57 58; Co 59; Ni 58 60 61 62 64; Cu 63 65; Zn 64 66 67 68 70; Ga 69 71; Ge 70 72 73 74 76; As 75; Se 74 76 77 78 80 82; Br 79 81;
Kr 78 80 82 83 84 86`;
// NIST ASD ground shells of the neutral atoms Z = 19 … 36 (retrieved 2026-10-10); [Ar] = 1s2 2s2 2p6 3s2 3p6.
const NIST_19_36 = ["[Ar]4s1", "[Ar]4s2", "[Ar]3d1 4s2", "[Ar]3d2 4s2", "[Ar]3d3 4s2", "[Ar]3d5 4s1", "[Ar]3d5 4s2", "[Ar]3d6 4s2", "[Ar]3d7 4s2",
  "[Ar]3d8 4s2", "[Ar]3d10 4s1", "[Ar]3d10 4s2", "[Ar]3d10 4s2 4p1", "[Ar]3d10 4s2 4p2", "[Ar]3d10 4s2 4p3", "[Ar]3d10 4s2 4p4", "[Ar]3d10 4s2 4p5", "[Ar]3d10 4s2 4p6"];
const expand = (s: string) => s.replace("[Ar]", "1s2 2s2 2p6 3s2 3p6 ").trim().split(/\s+/).map(t => { const m = /^(\d)([spd])(\d+)$/.exec(t)!; return { n: +m[1], l: "spd".indexOf(m[2]), e: +m[3] }; })
  .sort((a, b) => a.n - b.n || a.l - b.l);

describe("21D-D.1 element catalog — verified against the primary sources", () => {
  it("36 elements Z = 1 … 36 in order; every abridged atomic weight equals CIAAW 2024 exactly", () => {
    const table = CIAAW_2024.split(",").map(s => s.trim().split(" "));
    expect(CHEM_ELEMENTS.map(e => e.z)).toEqual(Array.from({ length: 36 }, (_, i) => i + 1));
    expect(CHEM_ELEMENTS.map(e => [e.symbol, e.weightText])).toEqual(table);
    expect(CHEM_ELEMENTS.map(e => e.weightScaled)).toEqual(table.map(([, w]) => Math.round(Number(w) * 10000)));
    expect(scaledWeight("12.011")).toBe(120110); expect(scaledWeight("1.0080")).toBe(10080); expect(() => scaledWeight("1.00805")).toThrow();
  });
  it("naturally occurring isotopes equal the CIAAW table; ³H and ¹⁴C are the only (flagged) classroom radioisotopes", () => {
    const table = Object.fromEntries(CIAAW_ISOTOPES.split(";").map(s => s.trim().split(/\s+/)).map(([sym, ...ns]) => [sym, ns.map(Number)]));
    expect(Object.fromEntries(CHEM_ELEMENTS.map(e => [e.symbol, [...e.isotopes]]))).toEqual(table);
    expect(CHEM_ELEMENTS.filter(e => e.radioisotopes.length).map(e => e.symbol + ":" + e.radioisotopes.join())).toEqual(["H:3", "C:14"]);
    expect(chemMassNumbers(chemElement("C")!)).toEqual([12, 13, 14]);
  });
  it("symbols are case-sensitive and exact (no case folding, no lookup by name)", () => {
    expect(chemElement("Co")?.z).toBe(27); expect(chemElement("CO")).toBeUndefined(); expect(chemElement("co")).toBeUndefined();
    expect(chemElement("Rb")).toBeUndefined(); expect(chemElement("Sodium")).toBeUndefined(); expect(chemElement(11)).toBeUndefined();
    expect(CHEM_SYMBOLS).toHaveLength(36);
  });
  it("group and period re-derived from the ground configuration agree with the catalog for all 36 elements (He is placed in group 18 by convention)", () => {
    for (const e of CHEM_ELEMENTS) {
      const c = neutralConfiguration(e.z), period = Math.max(...c.map(s => s.n)), block = blockOf(e);
      const outer = (n: number, l: number) => c.find(s => s.n === n && s.l === l)?.e ?? 0;
      const group = e.symbol === "He" ? 18 : block === "s" ? outer(period, 0) : block === "p" ? 10 + outer(period, 0) + outer(period, 1) : outer(period - 1, 2) + outer(period, 0);
      expect([e.symbol, e.period, e.group]).toEqual([e.symbol, period, group]);
    }
  });
  it("metal classes follow the category (B, Si, Ge, As metalloids; halogens and noble gases non-metals)", () => {
    expect(["B", "Si", "Ge", "As"].map(s => chemMetalClass(chemElement(s)!.category))).toEqual(["metalloid", "metalloid", "metalloid", "metalloid"]);
    expect(["Na", "Fe", "Al", "Ga", "Zn"].map(s => chemMetalClass(chemElement(s)!.category))).toEqual(["metal", "metal", "metal", "metal", "metal"]);
    expect(["H", "O", "Cl", "Kr", "Se"].map(s => chemMetalClass(chemElement(s)!.category))).toEqual(["nonmetal", "nonmetal", "nonmetal", "nonmetal", "nonmetal"]);
  });
});

describe("21D-D.1 electron configurations — NIST ground states and the stated ion rule", () => {
  it("Z = 19 … 36 equal the NIST ASD ground shells, including the Cr and Cu exceptions", () => {
    for (let z = 19; z <= 36; z++) expect(neutralConfiguration(z), "Z=" + z).toEqual(expand(NIST_19_36[z - 19]));
  });
  it("light atoms and the display notation", () => {
    expect(formatConfiguration(neutralConfiguration(11))).toBe("1s² 2s² 2p⁶ 3s¹");
    expect(formatConfiguration(neutralConfiguration(26))).toBe("1s² 2s² 2p⁶ 3s² 3p⁶ 3d⁶ 4s²");
    expect(formatConfiguration(neutralConfiguration(1))).toBe("1s¹");
    expect(formatConfiguration(speciesConfiguration(1, 1))).toBe("—");
  });
  it("shells (K, L, M, N) of neutral atoms and common ions", () => {
    const S = (sym: string, q = 0) => shellsOf(speciesConfiguration(chemElement(sym)!.z, q));
    expect([S("H"), S("He"), S("C"), S("Na"), S("Cl"), S("Ar"), S("K"), S("Ca"), S("Sc"), S("Cr"), S("Fe"), S("Cu"), S("Kr")]).toEqual([
      [1], [2], [2, 4], [2, 8, 1], [2, 8, 7], [2, 8, 8], [2, 8, 8, 1], [2, 8, 8, 2], [2, 8, 9, 2], [2, 8, 13, 1], [2, 8, 14, 2], [2, 8, 18, 1], [2, 8, 18, 8]]);
    expect([S("Na", 1), S("Mg", 2), S("Al", 3), S("O", -2), S("N", -3), S("F", -1), S("Cl", -1), S("K", 1), S("Ca", 2), S("H", 1), S("H", -1)]).toEqual([
      [2, 8], [2, 8], [2, 8], [2, 8], [2, 8], [2, 8], [2, 8, 8], [2, 8, 8], [2, 8, 8], [], [2]]);
    // d-block cations lose the 4s electrons first: Fe²⁺ [Ar]3d⁶, Fe³⁺ [Ar]3d⁵, Cu⁺ [Ar]3d¹⁰, Cu²⁺ [Ar]3d⁹, Zn²⁺ [Ar]3d¹⁰, Cr³⁺ [Ar]3d³, Ga³⁺ [Ar]3d¹⁰
    expect([S("Fe", 2), S("Fe", 3), S("Cu", 1), S("Cu", 2), S("Zn", 2), S("Cr", 3), S("Mn", 2), S("Ga", 3), S("Se", -2), S("Br", -1)]).toEqual([
      [2, 8, 14], [2, 8, 13], [2, 8, 18], [2, 8, 17], [2, 8, 18], [2, 8, 11], [2, 8, 13], [2, 8, 18], [2, 8, 18, 8], [2, 8, 18, 8]]);
    expect(formatConfiguration(speciesConfiguration(26, 3))).toBe("1s² 2s² 2p⁶ 3s² 3p⁶ 3d⁵");
    expect(formatConfiguration(speciesConfiguration(29, 2))).toBe("1s² 2s² 2p⁶ 3s² 3p⁶ 3d⁹");
  });
  it("valence electrons (s / p block only), outer-shell electrons and blocks", () => {
    const V = (s: string) => valenceElectrons(chemElement(s)!);
    expect(["H", "He", "Li", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Ga", "Br", "Kr"].map(V)).toEqual([1, 2, 1, 4, 5, 6, 7, 8, 1, 2, 3, 3, 7, 8]);
    expect(["Sc", "Fe", "Cu", "Zn"].map(V)).toEqual([null, null, null, null]);
    expect(["H", "He", "B", "Ne", "K", "Sc", "Zn", "Ga", "Kr"].map(s => blockOf(chemElement(s)!))).toEqual(["s", "s", "p", "p", "s", "d", "d", "p", "p"]);
    expect([outerShellElectrons(11, 1), outerShellElectrons(17, -1), outerShellElectrons(1, 1), outerShellElectrons(26, 2)]).toEqual([8, 8, 0, 14]);
  });
  it("refuses Z or electron counts outside the model", () => {
    expect(() => neutralConfiguration(0)).toThrow(); expect(() => neutralConfiguration(37)).toThrow(); expect(() => neutralConfiguration(2.5)).toThrow();
    expect(() => speciesConfiguration(1, 2)).toThrow(); expect(() => speciesConfiguration(36, -5)).toThrow();
  });
});

describe("21D-D.1 formula engine — exact molar masses (hand-computed from CIAAW 2024)", () => {
  const M = (f: string) => { const p = parseFormula(f); if (!p.ok) throw new Error(f + ": " + p.code); return p; };
  it("molar masses are EXACT sums (integer units of 1/10 000 g/mol)", () => {
    // H2O = 2(1.0080) + 15.999 = 18.0150; CO2 = 12.011 + 2(15.999) = 44.009; NaCl = 22.990 + 35.45 = 58.440;
    // C6H12O6 = 72.066 + 12.096 + 95.994 = 180.156; Ca(OH)2 = 40.078 + 2(17.007) = 74.092; Al2(SO4)3 = 53.964 + 3(96.056) = 342.132;
    // CuSO4·5H2O = 159.602 + 5(18.015) = 249.677; (NH4)3PO4 = 3(18.039) + 94.970 = 149.087; Mg3(PO4)2 = 72.915 + 2(94.970) = 262.855
    const cases: [string, number][] = [["H2O", 180150], ["CO2", 440090], ["NaCl", 584400], ["C6H12O6", 1801560], ["Ca(OH)2", 740920], ["Al2(SO4)3", 3421320],
      ["CuSO4·5H2O", 2496770], ["(NH4)3PO4", 1490870], ["Mg3(PO4)2", 2628550], ["Fe2(SO4)3", 3998580]];
    for (const [f, scaled] of cases) expect([f, molarMassScaled(M(f).composition)]).toEqual([f, scaled]);
    expect(molarMass(M("C6H12O6").composition)).toBe(180.156);
  });
  it("mass percentages (hand: O in H2O = 15.999 / 18.015 = 88.8093 %; C in CO2 = 12.011 / 44.009 = 27.2921 %)", () => {
    expect(massPercent(M("H2O").composition, "O")).toBeCloseTo(88.8093, 3);
    expect(massPercent(M("CO2").composition, "C")).toBeCloseTo(27.2921, 3);
    expect(massPercent(M("CuSO4·5H2O").composition, "Cu")).toBeCloseTo(25.4513, 3);    // 63.546 / 249.677
    expect(massPercent(M("H2O").composition, "Na")).toBe(0);
  });
  it("composition, Hill and empirical formulas; composition comparison is order-independent", () => {
    expect(M("CuSO4·5H2O").composition).toEqual({ Cu: 1, H: 10, O: 9, S: 1 });
    expect(M("CH3COOH").composition).toEqual({ C: 2, H: 4, O: 2 });
    expect(["C6H12O6", "C2H5OH", "H2SO4", "NaCl", "CH3COOH", "NH3", "CHCl3", "CBr4"].map(f => hillFormula(M(f).composition))).toEqual(["C6H12O6", "C2H6O", "H2O4S", "ClNa", "C2H4O2", "H3N", "CHCl3", "CBr4"]);
    expect(["C6H12O6", "C2H4O2", "H2O2", "Na2O", "C2H6"].map(f => hillFormula(empiricalComposition(M(f).composition)))).toEqual(["CH2O", "CH2O", "HO", "Na2O", "CH3"]);
    expect(sameComposition(M("HOH").composition, M("H2O").composition)).toBe(true);
    expect(sameComposition(M("H2O2").composition, M("H2O").composition)).toBe(false);
    expect(sameComposition(M("H2O").composition, M("H2OS").composition)).toBe(false);                     // a subset is not the same composition
    expect(sameComposition(M("H2OS").composition, M("H2O").composition)).toBe(false);
    expect(M("H₂O").text).toBe("H2O"); expect(M("CuSO4.5H2O").text).toBe("CuSO4·5H2O"); expect(M("CuSO4*5H2O").text).toBe("CuSO4·5H2O");
    expect(displayFormula("CuSO4·5H2O")).toBe("CuSO₄·5H₂O"); expect(displayFormula("Al2(SO4)3")).toBe("Al₂(SO₄)₃");
  });
  it("REFUSES malformed or unsupported formulas with a precise code (never guesses)", () => {
    const code = (f: unknown) => { const p = parseFormula(f); return p.ok ? "OK" : p.code; };
    expect([code(""), code("   "), code("h2o"), code("2H2O"), code("H2O)"), code("(H2O"), code("()"), code("Xx2"), code("Hf"), code("Rb")]).toEqual([
      "FORMULA_EMPTY", "FORMULA_EMPTY", "FORMULA_CASE", "FORMULA_COUNT_MISPLACED", "FORMULA_PAREN_UNOPENED", "FORMULA_PAREN_UNCLOSED", "FORMULA_PAREN_EMPTY",
      "FORMULA_ELEMENT_UNKNOWN", "FORMULA_ELEMENT_UNKNOWN", "FORMULA_ELEMENT_UNKNOWN"]);
    expect([code("H0"), code("H1000"), code("H01"), code("Na+"), code("SO4^2-"), code("H 2O"), code("K4[Fe(CN)6]"), code("((((H))))"), code("CuSO4··H2O"), code("CuSO4·"), code("CuSO4·0H2O"), code("CuSO4·100H2O")]).toEqual([
      "FORMULA_COUNT_INVALID", "FORMULA_COUNT_INVALID", "FORMULA_COUNT_INVALID", "FORMULA_NOTATION_UNSUPPORTED", "FORMULA_NOTATION_UNSUPPORTED", "FORMULA_NOTATION_UNSUPPORTED",
      "FORMULA_NOTATION_UNSUPPORTED", "FORMULA_TOO_DEEP", "FORMULA_EMPTY_PART", "FORMULA_EMPTY_PART", "FORMULA_COUNT_INVALID", "FORMULA_COUNT_INVALID"]);
    expect([code("(((H999)99)99)"), code("H".repeat(65)), code("A·B·C·D"), code("H2O·H2O·H2O·H2O"), code(42), code(null), code("H2O<script>")]).toEqual([
      "FORMULA_TOO_LARGE", "FORMULA_TOO_LONG", "FORMULA_ELEMENT_UNKNOWN", "FORMULA_TOO_MANY_DOTS", "FORMULA_INVALID", "FORMULA_INVALID", "FORMULA_CHARACTER"]);
    expect(code("CO")).toBe("OK"); expect(M("CO").composition).toEqual({ C: 1, O: 1 }); expect(M("Co").composition).toEqual({ Co: 1 });
  });
});

describe("21D-D.1 molecule catalog — geometry rebuilt from NIST CCCBDB and Lewis / VSEPR cross-checks", () => {
  // independently transcribed CCCBDB values (Å, °) and textbook facts
  const CCCBDB: Record<string, [number, number?]> = { hydrogen: [0.741], oxygen: [1.208], nitrogen: [1.098], hydrogenChloride: [1.275], water: [0.958, 104.4776], ammonia: [1.012, 106.67],
    methane: [1.087, 109.471], carbonDioxide: [1.162, 180], boronTrifluoride: [1.307, 120], ethene: [1.339, 117.6], ethyne: [1.203, 180], hydrogenCyanide: [1.064, 180] };
  const FACTS: Record<string, [string, string]> = { hydrogen: ["linear", "nonpolar"], oxygen: ["linear", "nonpolar"], nitrogen: ["linear", "nonpolar"], hydrogenChloride: ["linear", "polar"],
    water: ["bent", "polar"], ammonia: ["trigonalPyramidal", "polar"], methane: ["tetrahedral", "nonpolar"], carbonDioxide: ["linear", "nonpolar"],
    boronTrifluoride: ["trigonalPlanar", "nonpolar"], ethene: ["trigonalPlanar", "nonpolar"], ethyne: ["linear", "nonpolar"], hydrogenCyanide: ["linear", "polar"] };
  it("twelve molecules; the first tabulated length / angle equals the CCCBDB value; shapes and polarities are the textbook facts", () => {
    expect(MOLECULES.map(m => m.id)).toEqual(Object.keys(CCCBDB));
    for (const m of MOLECULES) {
      const [r, a] = CCCBDB[m.id], len = m.params.find(p => p.kind === "length")!, ang = m.params.find(p => p.kind === "angle");
      expect([m.id, len.value]).toEqual([m.id, Math.round(r * 1000) / 10]);
      if (a !== undefined) expect([m.id, ang?.value]).toEqual([m.id, a]); else expect(ang).toBeUndefined();
      expect([m.id, m.shape, m.polarity]).toEqual([m.id, ...FACTS[m.id]]);
      expect(m.reference).toMatch(/cccbdb\.nist\.gov/);
    }
  });
  it("the rebuilt coordinates reproduce EVERY tabulated length (± 0.01 pm) and angle (± 0.001°)", () => {
    for (const m of MOLECULES) {
      const at = (id: string) => m.atoms.find(a => a.id === id)!.position;
      for (const p of m.params) {
        const got = p.kind === "length" ? distance(at(p.atoms[0]), at(p.atoms[1])) * 100 : angleAt(at(p.atoms[0]), at(p.atoms[1]), at(p.atoms[2]));
        expect(Math.abs(got - p.value), m.id + "." + p.id + " " + got).toBeLessThan(p.kind === "length" ? 0.01 : 0.001);
      }
      // symmetric bonds of the same kind have the same length (e.g. all four C–H of methane)
      const kindOf = (x: { a: string; b: string; order: number }) => [m.atoms.find(a => a.id === x.a)!.element, m.atoms.find(a => a.id === x.b)!.element].sort().join() + x.order;
      for (const b of m.bonds) for (const x of m.bonds.filter(y => kindOf(y) === kindOf(b))) expect(Math.abs(distance(at(x.a), at(x.b)) - distance(at(b.a), at(b.b)))).toBeLessThan(1e-9);
    }
  });
  it("Lewis structures: valence electrons = 2 × Σ bond orders + 2 × lone pairs; every atom has an octet (H a duet) except the declared BF₃ boron", () => {
    for (const m of MOLECULES) {
      const valence = m.atoms.reduce((n, a) => n + (valenceElectrons(chemElement(a.element)!) as number), 0);
      expect([m.id, valence]).toEqual([m.id, 2 * m.bonds.reduce((n, b) => n + b.order, 0) + 2 * lonePairTotal(m)]);
      for (const a of m.atoms) {
        const around = 2 * bondOrderSum(m, a.id) + 2 * a.lonePairs, target = a.element === "H" ? 2 : m.octetExceptions.includes(a.id) ? 6 : 8;
        expect([m.id, a.id, around]).toEqual([m.id, a.id, target]);
      }
      expect(sameComposition(moleculeComposition(m), (parseFormula(m.formula) as { composition: Record<string, number> }).composition)).toBe(true);
    }
    expect(MOLECULES.filter(m => m.octetExceptions.length).map(m => m.id)).toEqual(["boronTrifluoride"]);
  });
  it("the catalog shape is RE-DERIVED by VSEPR from every central atom's neighbours and lone pairs (diatomics are linear)", () => {
    for (const m of MOLECULES) {
      const derived = m.central.length ? [...new Set(m.central.map(id => vseprShape(neighbours(m, id).length, m.atoms.find(a => a.id === id)!.lonePairs)))] : ["linear"];
      expect([m.id, derived]).toEqual([m.id, [m.shape]]);
    }
    expect([sigmaBonds(chemMolecule("ethene")!), piBonds(chemMolecule("ethene")!), piBonds(chemMolecule("nitrogen")!), lonePairTotal(chemMolecule("water")!)]).toEqual([5, 1, 2, 2]);
    expect(vseprShape(5, 0)).toBeNull(); expect(chemMolecule("benzene")).toBeUndefined(); expect(chemMolecule({})).toBeUndefined();
  });
  it("the catalog is deep-frozen (a consumer can never alter trusted data)", () => {
    const w = chemMolecule("water")!;
    expect(Object.isFrozen(w) && Object.isFrozen(w.atoms[0].position) && Object.isFrozen(w.params[1])).toBe(true);
    expect(Object.isFrozen(CHEM_ELEMENTS[0]) && Object.isFrozen(CHEM_ELEMENTS[0].isotopes)).toBe(true);
  });
});
