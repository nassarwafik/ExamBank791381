import { describe, expect, it } from "vitest";
import {
  REACTION_CATALOG, REACTION_CATALOG_IDS, REACTION_FAMILIES, REACTION_ROLES, REACTION_SOURCES, catalogReaction, catalogReactionV1, catalogRoleTerms, familyStatus,
  oxidationFraction, redoxRoles, type CatalogReaction
} from "./reactionCatalog";
import { balanceReaction, conservationTable, equationText, reactionTermIds } from "./reactions";
import { parseFormula } from "./formula";

const all = (c: CatalogReaction) => [...c.reactants, ...c.products];
const v1 = (id: string) => { const c = catalogReaction(id)!; return { c, r: catalogReactionV1(c)! }; };

describe("21D-D.2 curated reaction catalog — integrity", () => {
  it("has unique ids, cited sources and a frozen structure", () => {
    expect(REACTION_CATALOG.length).toBeGreaterThanOrEqual(30);
    expect(new Set(REACTION_CATALOG_IDS).size).toBe(REACTION_CATALOG_IDS.length);
    expect(Object.isFrozen(REACTION_CATALOG)).toBe(true);
    for (const c of REACTION_CATALOG) {
      expect(Object.isFrozen(c) && Object.isFrozen(c.reactants[0]) && Object.isFrozen(c.coefficients)).toBe(true);
      expect(c.sources.length).toBeGreaterThan(0);
      for (const s of c.sources) expect(REACTION_SOURCES[s]).toMatch(/https:\/\/.+\(retrieved 2026-10-11\)$/);
      expect(c.nameAr).toMatch(/[؀-ۿ]/);
      for (const t of all(c)) expect(t.nameAr).toMatch(/[؀-ۿ]/);
    }
    expect(catalogReaction("__proto__")).toBeUndefined();
    expect(catalogReaction("WaterFormation")).toBeUndefined();
  });
  it("every equation passes the strict validator and the exact solver reproduces the source's coefficients", () => {
    for (const c of REACTION_CATALOG) {
      const r = catalogReactionV1(c);
      expect(r, c.id).toBeDefined();
      expect(c.coefficients.length).toBe(all(c).length);
      expect(balanceReaction(r!), c.id).toEqual({ ok: true, coefficients: [...c.coefficients] });
      expect(conservationTable(r!, c.coefficients).balanced, c.id).toBe(true);
      // the published coefficients are the SMALLEST: any single +1 perturbation breaks the balance
      for (let i = 0; i < c.coefficients.length; i++) expect(conservationTable(r!, c.coefficients.map((x, j) => (j === i ? x + 1 : x))).balanced).toBe(false);
    }
  });
  it("oxidation numbers cover exactly the elements of each term and sum to its charge (OpenStax rule 4)", () => {
    for (const c of REACTION_CATALOG) for (const t of all(c)) {
      const p = parseFormula(t.formula);
      if (!p.ok) throw new Error(t.formula);
      expect(Object.keys(t.oxidation).sort(), c.id + " " + t.formula).toEqual(Object.keys(p.composition).sort());
      // Σ count × (n / d) = charge, compared exactly over the common denominator
      let num = 0, den = 1;
      for (const [el, ox] of Object.entries(t.oxidation)) { const [n, d] = oxidationFraction(ox); num = num * d + p.composition[el] * n * den; den *= d; }
      expect(num, c.id + " " + t.formula).toBe(t.charge * den);
    }
  });
});

describe("21D-D.2 curated reaction catalog — classification consistency", () => {
  it("families and contested families are known and disjoint; redox is never contested", () => {
    for (const c of REACTION_CATALOG) {
      for (const f of [...c.families, ...c.contested]) expect(REACTION_FAMILIES).toContain(f);
      expect(c.families.filter(f => c.contested.includes(f))).toEqual([]);
      expect(c.contested).not.toContain("redox");
    }
  });
  it("redox membership is DERIVED from oxidation numbers, and every redox reaction has both agents", () => {
    for (const c of REACTION_CATALOG) {
      const roles = redoxRoles(c), derived = roles.oxidizingAgent.length > 0 || roles.reducingAgent.length > 0;
      expect(c.families.includes("redox"), c.id).toBe(derived);
      if (derived) { expect(roles.oxidizingAgent.length, c.id).toBeGreaterThan(0); expect(roles.reducingAgent.length, c.id).toBeGreaterThan(0); }
    }
  });
  it("matches the family definitions (LibreTexts §7.5, OpenStax §4.2)", () => {
    for (const c of REACTION_CATALOG) {
      const yes = (f: string) => familyStatus(c, f as never) === "yes";
      const isElement = (t: { charge: number; oxidation: object }) => t.charge === 0 && Object.keys(t.oxidation).length === 1;
      if (yes("synthesis")) expect(c.products.length, c.id).toBe(1);
      if (yes("decomposition")) expect(c.reactants.length, c.id).toBe(1);
      if (yes("singleDisplacement")) {
        expect(c.reactants.some(isElement) && c.products.some(isElement), c.id).toBe(true);
        expect(yes("redox"), c.id).toBe(true);
      }
      if (yes("doubleDisplacement")) expect(c.reactants.length === 2 && c.products.length === 2 && all(c).every(t => !isElement(t)), c.id).toBe(true);
      if (yes("combustion")) {
        expect(c.reactants.some(t => t.formula === "O2"), c.id).toBe(true);
        expect(catalogRoleTerms(c, "fuel").length, c.id).toBeGreaterThan(0);
        expect(yes("redox"), c.id).toBe(true);
      }
      if (yes("neutralization")) { expect(catalogRoleTerms(c, "acid").length, c.id).toBeGreaterThan(0); expect(catalogRoleTerms(c, "base").length, c.id).toBeGreaterThan(0); }
      if (yes("precipitation")) expect(catalogRoleTerms(c, "precipitate").length, c.id).toBeGreaterThan(0);
    }
  });
  it("curated roles name real terms on the right side", () => {
    for (const c of REACTION_CATALOG) {
      const ids = ["r", "p"].flatMap(s => (s === "r" ? c.reactants : c.products).map((_, i) => s + (i + 1)));
      for (const [role, terms] of Object.entries(c.roles)) for (const id of terms ?? []) {
        expect(ids, c.id + " " + role).toContain(id);
        if (role === "precipitate") { expect(id.startsWith("p")).toBe(true); expect(c.products[Number(id.slice(1)) - 1].state).toBe("s"); expect(c.families).toContain("precipitation"); }
        if (role === "fuel") { expect(id.startsWith("r")).toBe(true); expect(c.families).toContain("combustion"); }
      }
      for (const role of REACTION_ROLES) for (const id of catalogRoleTerms(c, role)) expect(ids).toContain(id);
    }
  });
});

describe("21D-D.2 curated reaction catalog — scientific reference pins", () => {
  it.each([
    ["waterFormation", "2H₂(g) + O₂(g) → 2H₂O(l)"],
    ["ammoniaSynthesis", "N₂ + 3H₂ → 2NH₃"],
    ["methaneCombustion", "CH₄(g) + 2O₂(g) → CO₂(g) + 2H₂O(g)"],
    ["ironOxidation", "4Fe(s) + 3O₂(g) → 2Fe₂O₃(s)"],
    ["calciumCarbonateDecomposition", "CaCO₃(s) → CaO(s) + CO₂(g)"],
    ["hydrochloricSodiumHydroxide", "HCl(aq) + NaOH(aq) → NaCl(aq) + H₂O(l)"],
    ["magnesiumHydroxideHydrochloric", "Mg(OH)₂(s) + 2HCl(aq) → MgCl₂(aq) + 2H₂O(l)"],
    ["calciumCarbonatePrecipitation", "CaCl₂(aq) + Na₂CO₃(aq) → CaCO₃(s) + 2NaCl(aq)"],
    ["hydroniumHydroxide", "H₃O⁺(aq) + OH⁻(aq) → 2H₂O(l)"],
    ["dichromateIron", "6Fe²⁺ + Cr₂O₇²⁻ + 14H⁺ → 6Fe³⁺ + 2Cr³⁺ + 7H₂O"],
    ["permanganateOxalicAcid", "2MnO₄⁻(aq) + 5H₂C₂O₄(aq) + 6H⁺(aq) → 10CO₂(g) + 2Mn²⁺(aq) + 8H₂O(l)"],
    ["chlorineDisproportionation", "3Cl₂(aq) + 6OH⁻(aq) → 5Cl⁻(aq) + ClO₃⁻(aq) + 3H₂O(l)"],
    ["ammoniumNitrateDecomposition", "2NH₄NO₃ → 2N₂ + O₂ + 4H₂O"]
  ])("%s is printed as the source prints it", (id, text) => {
    const { c, r } = v1(id);
    expect(equationText(r, c.coefficients, { states: true })).toBe(text);
  });
  it("conserves charge in the ionic redox equations (+24 and +4 on both sides)", () => {
    const d = v1("dichromateIron"), p = v1("permanganateOxalicAcid");
    expect(conservationTable(d.r, d.c.coefficients).charge).toMatchObject({ reactants: 24, products: 24 });
    expect(conservationTable(p.r, p.c.coefficients).charge).toMatchObject({ reactants: 4, products: 4 });
  });
  it("derives the oxidizing and reducing agents from oxidation-number changes", () => {
    expect(redoxRoles(catalogReaction("zincHydrochloricAcid")!)).toEqual({ oxidizingAgent: ["r2"], reducingAgent: ["r1"] });
    expect(redoxRoles(catalogReaction("methaneCombustion")!)).toEqual({ oxidizingAgent: ["r2"], reducingAgent: ["r1"] });
    expect(redoxRoles(catalogReaction("dichromateIron")!)).toEqual({ oxidizingAgent: ["r2"], reducingAgent: ["r1"] });
    expect(redoxRoles(catalogReaction("brineElectrolysisNetIonic")!)).toEqual({ oxidizingAgent: ["r2"], reducingAgent: ["r1"] });
    // disproportionation: the same reactant is oxidized AND reduced; OH⁻ keeps O at −2 and H at +1
    expect(redoxRoles(catalogReaction("hydrogenPeroxideDecomposition")!)).toEqual({ oxidizingAgent: ["r1"], reducingAgent: ["r1"] });
    expect(redoxRoles(catalogReaction("chlorineDisproportionation")!)).toEqual({ oxidizingAgent: ["r1"], reducingAgent: ["r1"] });
    // heptane: an AVERAGE oxidation number (−16/7) still orders exactly against +4
    expect(redoxRoles(catalogReaction("heptaneCombustion")!)).toEqual({ oxidizingAgent: ["r2"], reducingAgent: ["r1"] });
    // not redox: no oxidation number changes
    for (const id of ["calciumCarbonateDecomposition", "hydrochloricSodiumHydroxide", "calciumCarbonatePrecipitation", "calciumOxideWater", "carbonDioxideHydroxide"]) {
      expect(redoxRoles(catalogReaction(id)!), id).toEqual({ oxidizingAgent: [], reducingAgent: [] });
    }
  });
  it("derives element / compound / ion by definition and keeps curated roles", () => {
    const zn = catalogReaction("zincHydrochloricAcid")!;
    expect(catalogRoleTerms(zn, "element")).toEqual(["r1", "p2"]);
    expect(catalogRoleTerms(zn, "compound")).toEqual(["r2", "p1"]);
    expect(catalogRoleTerms(zn, "ion")).toEqual([]);
    expect(catalogRoleTerms(zn, "acid")).toEqual(["r2"]);
    const ca = catalogReaction("calciumCarbonateNetIonic")!;
    expect(catalogRoleTerms(ca, "ion")).toEqual(["r1", "r2"]);
    expect(catalogRoleTerms(ca, "precipitate")).toEqual(["p1"]);
    expect(catalogRoleTerms(catalogReaction("hydrochloricSodiumHydroxide")!, "base")).toEqual(["r2"]);
  });
  it("records contested memberships instead of guessing", () => {
    expect(familyStatus(catalogReaction("ironOxidation")!, "combustion")).toBe("contested");
    expect(familyStatus(catalogReaction("ironOxidation")!, "synthesis")).toBe("yes");
    expect(familyStatus(catalogReaction("hydrochloricSodiumHydroxide")!, "doubleDisplacement")).toBe("contested");
    expect(familyStatus(catalogReaction("calciumCarbonatePrecipitation")!, "doubleDisplacement")).toBe("yes");
    expect(familyStatus(catalogReaction("calciumCarbonateDecomposition")!, "redox")).toBe("no");
  });
  it("gives every term an id in term order", () => {
    expect(reactionTermIds(v1("permanganateOxalicAcid").r)).toEqual(["r1", "r2", "r3", "p1", "p2", "p3"]);
  });
});
