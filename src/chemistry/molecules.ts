// Phase 21D-D.1 — the trusted MOLECULE CATALOG (pure data + deterministic geometry; compiled into the shared server build).
// Twelve small molecules whose structure is standard school chemistry. For each one:
//   geometry — bond lengths (Å) and angles (°) exactly as listed by NIST CCCBDB (Computational Chemistry Comparison and Benchmark
//              DataBase, experimental geometry pages https://cccbdb.nist.gov/expgeom2x.asp?casno=…, retrieved 2026-10-10), with the
//              primary reference CCCBDB cites. The 3D coordinates are REBUILT from those values by the builders below (tested to
//              reproduce them); the picture is a static equilibrium structure (no vibration).
//   bonding  — the Lewis structure (bond orders, lone pairs), the VSEPR shape and the molecular polarity: standard textbook facts,
//              cross-checked by code (valence-electron count, octet / duet, VSEPR re-derivation — see the tests).
// Stated model limits: O₂ is drawn with a double bond although O₂ is paramagnetic (a triplet), which the Lewis model cannot explain;
// boron in BF₃ has an incomplete octet (6 electrons).
export type Vec3 = { x: number; y: number; z: number };
export const MOLECULE_SHAPES = Object.freeze(["linear", "bent", "trigonalPlanar", "trigonalPyramidal", "tetrahedral"] as const);
export type MoleculeShape = (typeof MOLECULE_SHAPES)[number];
export type MoleculePolarity = "polar" | "nonpolar";
export type MolAtom = { readonly id: string; readonly element: string; readonly position: Vec3; readonly lonePairs: number };
export type MolBond = { readonly id: string; readonly a: string; readonly b: string; readonly order: 1 | 2 | 3 };
/** A tabulated geometric parameter: a bond length (pm) between two atoms or an angle (°) at the middle of three. */
export type MolParam = { readonly id: string; readonly kind: "length" | "angle"; readonly atoms: readonly string[]; readonly value: number };
export type Molecule = {
  readonly id: string; readonly nameAr: string; readonly nameEn: string; readonly formula: string; readonly casNumber: string;
  readonly atoms: readonly MolAtom[]; readonly bonds: readonly MolBond[]; readonly central: readonly string[];
  readonly shape: MoleculeShape; readonly polarity: MoleculePolarity; readonly params: readonly MolParam[];
  readonly reference: string; readonly octetExceptions: readonly string[]; readonly notes: readonly string[];
};
export const MOLECULE_SHAPE_LABEL: Readonly<Record<MoleculeShape, string>> = Object.freeze({
  linear: "خطي", bent: "منحنٍ (زاوي)", trigonalPlanar: "مثلث مستوٍ", trigonalPyramidal: "هرم ثلاثي", tetrahedral: "رباعي الأوجه"
});
export const MOLECULE_POLARITY_LABEL: Readonly<Record<MoleculePolarity, string>> = Object.freeze({ polar: "قطبي", nonpolar: "غير قطبي" });
const CCCBDB = (cas: string) => "NIST CCCBDB experimental geometry, https://cccbdb.nist.gov/expgeom2x.asp?casno=" + cas + " (retrieved 2026-10-10)";
const DEG = Math.PI / 180;
const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
type Spec = Omit<Molecule, "atoms" | "params" | "bonds"> & {
  atoms: [string, string, Vec3, number][]; bonds: [string, string, 1 | 2 | 3][]; params: [string, "length" | "angle", string[], number][];
};
/** Pyramidal terminal directions: three unit vectors at the given mutual angle around −y (the C₃ axis is y). */
function pyramid(angleDeg: number): Vec3[] {
  const s2 = (2 / 3) * (1 - Math.cos(angleDeg * DEG)), s = Math.sqrt(s2), c = Math.sqrt(1 - s2);
  return [90, 210, 330].map(p => v(s * Math.cos(p * DEG), -c, s * Math.sin(p * DEG)));
}
const scale = (d: Vec3, r: number, o: Vec3 = v(0, 0, 0)): Vec3 => v(o.x + d.x * r, o.y + d.y * r, o.z + d.z * r);
const TETRA = Math.acos(-1 / 3) / DEG;

const SPECS: Spec[] = [
  { id: "hydrogen", nameAr: "جزيء الهيدروجين", nameEn: "Hydrogen", formula: "H2", casNumber: "1333-74-0", central: [], shape: "linear", polarity: "nonpolar",
    atoms: [["H1", "H", v(-0.3705, 0, 0), 0], ["H2", "H", v(0.3705, 0, 0), 0]], bonds: [["H1", "H2", 1]], params: [["rHH", "length", ["H1", "H2"], 74.1]],
    reference: "Huber & Herzberg 1979 (re) — " + CCCBDB("1333740"), octetExceptions: [], notes: [] },
  { id: "oxygen", nameAr: "جزيء الأكسجين", nameEn: "Oxygen", formula: "O2", casNumber: "7782-44-7", central: [], shape: "linear", polarity: "nonpolar",
    atoms: [["O1", "O", v(-0.604, 0, 0), 2], ["O2", "O", v(0.604, 0, 0), 2]], bonds: [["O1", "O2", 2]], params: [["rOO", "length", ["O1", "O2"], 120.8]],
    reference: "Huber & Herzberg 1979 (re) — " + CCCBDB("7782447"), octetExceptions: [],
    notes: ["نموذج لويس يرسم O₂ برابطة ثنائية، لكن جزيء الأكسجين مغناطيسي (بارامغناطيسي) وهذا لا يفسّره نموذج لويس."] },
  { id: "nitrogen", nameAr: "جزيء النيتروجين", nameEn: "Nitrogen", formula: "N2", casNumber: "7727-37-9", central: [], shape: "linear", polarity: "nonpolar",
    atoms: [["N1", "N", v(-0.549, 0, 0), 1], ["N2", "N", v(0.549, 0, 0), 1]], bonds: [["N1", "N2", 3]], params: [["rNN", "length", ["N1", "N2"], 109.8]],
    reference: "Huber & Herzberg 1979 (re) — " + CCCBDB("7727379"), octetExceptions: [], notes: [] },
  { id: "hydrogenChloride", nameAr: "كلوريد الهيدروجين", nameEn: "Hydrogen chloride", formula: "HCl", casNumber: "7647-01-0", central: [], shape: "linear", polarity: "polar",
    atoms: [["H1", "H", v(-0.6375, 0, 0), 0], ["Cl1", "Cl", v(0.6375, 0, 0), 3]], bonds: [["H1", "Cl1", 1]], params: [["rHCl", "length", ["H1", "Cl1"], 127.5]],
    reference: "NIST Diatomic Spectral Database (re, ¹H³⁵Cl) — " + CCCBDB("7647010"), octetExceptions: [], notes: [] },
  { id: "water", nameAr: "الماء", nameEn: "Water", formula: "H2O", casNumber: "7732-18-5", central: ["O1"], shape: "bent", polarity: "polar",
    atoms: [["O1", "O", v(0, 0, 0), 2], ["H1", "H", scale(v(-Math.sin(104.4776 / 2 * DEG), -Math.cos(104.4776 / 2 * DEG), 0), 0.958), 0], ["H2", "H", scale(v(Math.sin(104.4776 / 2 * DEG), -Math.cos(104.4776 / 2 * DEG), 0), 0.958), 0]],
    bonds: [["O1", "H1", 1], ["O1", "H2", 1]], params: [["rOH", "length", ["O1", "H1"], 95.8], ["aHOH", "angle", ["H1", "O1", "H2"], 104.4776]],
    reference: "Hoy & Bunker 1979 (equilibrium) — " + CCCBDB("7732185"), octetExceptions: [], notes: [] },
  { id: "ammonia", nameAr: "الأمونيا", nameEn: "Ammonia", formula: "NH3", casNumber: "7664-41-7", central: ["N1"], shape: "trigonalPyramidal", polarity: "polar",
    atoms: [["N1", "N", v(0, 0, 0), 1], ...pyramid(106.67).map((d, i): [string, string, Vec3, number] => ["H" + (i + 1), "H", scale(d, 1.012), 0])],
    bonds: [["N1", "H1", 1], ["N1", "H2", 1], ["N1", "H3", 1]], params: [["rNH", "length", ["N1", "H1"], 101.2], ["aHNH", "angle", ["H1", "N1", "H2"], 106.67]],
    reference: "Herzberg 1966 — " + CCCBDB("7664417"), octetExceptions: [], notes: [] },
  { id: "methane", nameAr: "الميثان", nameEn: "Methane", formula: "CH4", casNumber: "74-82-8", central: ["C1"], shape: "tetrahedral", polarity: "nonpolar",
    atoms: [["C1", "C", v(0, 0, 0), 0], ...pyramid(TETRA).map((d, i): [string, string, Vec3, number] => ["H" + (i + 1), "H", scale(d, 1.087), 0]), ["H4", "H", v(0, 1.087, 0), 0]],
    bonds: [["C1", "H1", 1], ["C1", "H2", 1], ["C1", "H3", 1], ["C1", "H4", 1]], params: [["rCH", "length", ["C1", "H1"], 108.7], ["aHCH", "angle", ["H1", "C1", "H2"], 109.471]],
    reference: "Hirota 1979 (re); angle Sverdlov, Kovner & Krainov 1974 — " + CCCBDB("74828"), octetExceptions: [], notes: [] },
  { id: "carbonDioxide", nameAr: "ثاني أكسيد الكربون", nameEn: "Carbon dioxide", formula: "CO2", casNumber: "124-38-9", central: ["C1"], shape: "linear", polarity: "nonpolar",
    atoms: [["C1", "C", v(0, 0, 0), 0], ["O1", "O", v(-1.162, 0, 0), 2], ["O2", "O", v(1.162, 0, 0), 2]],
    bonds: [["C1", "O1", 2], ["C1", "O2", 2]], params: [["rCO", "length", ["C1", "O1"], 116.2], ["aOCO", "angle", ["O1", "C1", "O2"], 180]],
    reference: "Herzberg 1966 — " + CCCBDB("124389"), octetExceptions: [], notes: [] },
  { id: "boronTrifluoride", nameAr: "ثلاثي فلوريد البورون", nameEn: "Boron trifluoride", formula: "BF3", casNumber: "7637-07-2", central: ["B1"], shape: "trigonalPlanar", polarity: "nonpolar",
    atoms: [["B1", "B", v(0, 0, 0), 0], ...[90, 210, 330].map((p, i): [string, string, Vec3, number] => ["F" + (i + 1), "F", v(1.307 * Math.cos(p * DEG), 1.307 * Math.sin(p * DEG), 0), 3])],
    bonds: [["B1", "F1", 1], ["B1", "F2", 1], ["B1", "F3", 1]], params: [["rBF", "length", ["B1", "F1"], 130.7], ["aFBF", "angle", ["F1", "B1", "F2"], 120]],
    reference: "Kuchitsu 1998 (re) — " + CCCBDB("7637072"), octetExceptions: ["B1"], notes: ["ذرة البورون في BF₃ محاطة بستة إلكترونات فقط (ثُمانية غير مكتملة)."] },
  { id: "ethene", nameAr: "الإيثين (الإيثيلين)", nameEn: "Ethene (ethylene)", formula: "C2H4", casNumber: "74-85-1", central: ["C1", "C2"], shape: "trigonalPlanar", polarity: "nonpolar",
    atoms: [
      ["C1", "C", v(-0.6695, 0, 0), 0], ["C2", "C", v(0.6695, 0, 0), 0],
      ["H1", "H", v(-0.6695 - 1.086 * Math.cos(58.8 * DEG), 1.086 * Math.sin(58.8 * DEG), 0), 0], ["H2", "H", v(-0.6695 - 1.086 * Math.cos(58.8 * DEG), -1.086 * Math.sin(58.8 * DEG), 0), 0],
      ["H3", "H", v(0.6695 + 1.086 * Math.cos(58.8 * DEG), 1.086 * Math.sin(58.8 * DEG), 0), 0], ["H4", "H", v(0.6695 + 1.086 * Math.cos(58.8 * DEG), -1.086 * Math.sin(58.8 * DEG), 0), 0]
    ],
    bonds: [["C1", "C2", 2], ["C1", "H1", 1], ["C1", "H2", 1], ["C2", "H3", 1], ["C2", "H4", 1]],
    params: [["rCC", "length", ["C1", "C2"], 133.9], ["rCH", "length", ["C1", "H1"], 108.6], ["aHCH", "angle", ["H1", "C1", "H2"], 117.6]],
    reference: "Herzberg 1966 — " + CCCBDB("74851"), octetExceptions: [], notes: [] },
  { id: "ethyne", nameAr: "الإيثاين (الأسيتيلين)", nameEn: "Ethyne (acetylene)", formula: "C2H2", casNumber: "74-86-2", central: ["C1", "C2"], shape: "linear", polarity: "nonpolar",
    atoms: [["H1", "H", v(-0.6015 - 1.063, 0, 0), 0], ["C1", "C", v(-0.6015, 0, 0), 0], ["C2", "C", v(0.6015, 0, 0), 0], ["H2", "H", v(0.6015 + 1.063, 0, 0), 0]],
    bonds: [["H1", "C1", 1], ["C1", "C2", 3], ["C2", "H2", 1]], params: [["rCC", "length", ["C1", "C2"], 120.3], ["rCH", "length", ["H1", "C1"], 106.3], ["aHCC", "angle", ["H1", "C1", "C2"], 180]],
    reference: "Kuchitsu 1998 (rm) — " + CCCBDB("74862"), octetExceptions: [], notes: [] },
  { id: "hydrogenCyanide", nameAr: "سيانيد الهيدروجين", nameEn: "Hydrogen cyanide", formula: "HCN", casNumber: "74-90-8", central: ["C1"], shape: "linear", polarity: "polar",
    atoms: [["H1", "H", v(-1.064, 0, 0), 0], ["C1", "C", v(0, 0, 0), 0], ["N1", "N", v(1.156, 0, 0), 1]],
    bonds: [["H1", "C1", 1], ["C1", "N1", 3]], params: [["rCH", "length", ["H1", "C1"], 106.4], ["rCN", "length", ["C1", "N1"], 115.6], ["aHCN", "angle", ["H1", "C1", "N1"], 180]],
    reference: "Herzberg 1966 — " + CCCBDB("74908"), octetExceptions: [], notes: [] }
];
const deepFreeze = <T,>(o: T): T => { if (o && typeof o === "object") { for (const x of Object.values(o)) deepFreeze(x); Object.freeze(o); } return o; };
export const MOLECULES: readonly Molecule[] = deepFreeze(SPECS.map(s => ({
  ...s,
  atoms: s.atoms.map(([id, element, position, lonePairs]) => ({ id, element, position, lonePairs })),
  bonds: s.bonds.map(([a, b, order], i) => ({ id: "b" + (i + 1), a, b, order })),
  params: s.params.map(([id, kind, atoms, value]) => ({ id, kind, atoms, value }))
})));
const BY_ID: ReadonlyMap<string, Molecule> = new Map(MOLECULES.map(m => [m.id, m]));
export const MOLECULE_IDS: readonly string[] = Object.freeze(MOLECULES.map(m => m.id));
export const chemMolecule = (id: unknown): Molecule | undefined => (typeof id === "string" ? BY_ID.get(id) : undefined);
/** Element → count of a molecule (from its atoms). */
export function moleculeComposition(m: Molecule): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of [...m.atoms].sort((x, y) => (x.element < y.element ? -1 : x.element > y.element ? 1 : 0))) out[a.element] = (out[a.element] ?? 0) + 1;
  return out;
}
export const bondOrderSum = (m: Molecule, atomId: string) => m.bonds.reduce((n, b) => n + (b.a === atomId || b.b === atomId ? b.order : 0), 0);
export const neighbours = (m: Molecule, atomId: string) => m.bonds.filter(b => b.a === atomId || b.b === atomId).map(b => (b.a === atomId ? b.b : b.a));
/** The VSEPR shape of a central atom from its bonded neighbours (σ domains) and lone pairs. */
export function vseprShape(neighbourCount: number, lonePairs: number): MoleculeShape | null {
  const k = neighbourCount + ":" + lonePairs;
  return ({ "2:0": "linear", "3:0": "trigonalPlanar", "4:0": "tetrahedral", "3:1": "trigonalPyramidal", "2:2": "bent", "2:1": "bent" } as Record<string, MoleculeShape>)[k] ?? null;
}
export const sigmaBonds = (m: Molecule) => m.bonds.length;
export const piBonds = (m: Molecule) => m.bonds.reduce((n, b) => n + b.order - 1, 0);
export const lonePairTotal = (m: Molecule) => m.atoms.reduce((n, a) => n + a.lonePairs, 0);
export const distance = (p: Vec3, q: Vec3) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
export function angleAt(a: Vec3, centre: Vec3, b: Vec3): number {
  const u = v(a.x - centre.x, a.y - centre.y, a.z - centre.z), w = v(b.x - centre.x, b.y - centre.y, b.z - centre.z);
  const c = (u.x * w.x + u.y * w.y + u.z * w.z) / (Math.hypot(u.x, u.y, u.z) * Math.hypot(w.x, w.y, w.z));
  return Math.acos(Math.max(-1, Math.min(1, c))) / DEG;
}
