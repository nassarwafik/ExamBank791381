// Phase 21D-D.1 — pure PRESENTATION helpers of the chemistry workspace (lazy; never part of grading): species notation, the live identity
// of a built atom, colours / display radii of the ball-and-stick model, the orthographic projection of a catalog molecule for a camera
// and the illustrative lone-pair directions. Nothing here is graded: the plugin (src/chemistryStructurePlugin.ts) is the only authority.
import { CHEM_CATEGORY_LABEL, chemElementByZ, chemMassNumbers, type ChemElement } from "../chemistry/elements";
import { blockOf } from "../chemistry/electrons";
import type { Molecule, Vec3 } from "../chemistry/molecules";
import type { OrbitCamera } from "../interactive3d/orbitCamera";

/** "+", "2+", "−", "3−", "" (typographic minus). */
export const chargeText = (q: number): string => (q === 0 ? "" : (Math.abs(q) === 1 ? "" : String(Math.abs(q))) + (q > 0 ? "+" : "−"));
export type BuiltSpecies = { element?: ChemElement; massNumber: number; charge: number; catalogued: boolean; commonIon: boolean };
/** What a set of particles IS (presentation only): the element from the proton count, A = p + n, charge = p − e. */
export function builtSpecies(p: number, n: number, e: number): BuiltSpecies {
  const element = chemElementByZ(p), massNumber = p + n, charge = p - e;
  return { element, massNumber, charge, catalogued: !!element && chemMassNumbers(element).includes(massNumber), commonIon: !!element && (charge === 0 || element.ions.includes(charge)) };
}

/** Conventional CPK-style colours (dark grey carbon for contrast on a light page) and NOT-TO-SCALE display radii (Å). */
const COLOR: Readonly<Record<string, string>> = Object.freeze({ H: "#f4f6f8", C: "#4a5260", N: "#2f5bd9", O: "#d93025", F: "#7cb342", Cl: "#2e9d3a", B: "#e59a8f", S: "#e2b714", P: "#ef8a1c" });
const RADIUS: Readonly<Record<string, number>> = Object.freeze({ H: 0.26, C: 0.38, N: 0.37, O: 0.36, F: 0.34, Cl: 0.46, B: 0.4, S: 0.46, P: 0.45 });
export const atomColor = (el: string) => COLOR[el] ?? "#9aa7b8";
export const atomRadius = (el: string) => RADIUS[el] ?? 0.4;
/** Text colour readable on the atom colour. */
export const atomInk = (el: string) => (el === "H" || el === "S" || el === "F" || el === "B" ? "#1b2533" : "#ffffff");

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const mul = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const len = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
const unit = (a: Vec3): Vec3 => { const l = len(a) || 1; return mul(a, 1 / l); };
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
/** Rotate a around the unit axis k by angle t (Rodrigues). */
const rotateAbout = (a: Vec3, k: Vec3, t: number): Vec3 => add(add(mul(a, Math.cos(t)), mul(cross(k, a), Math.sin(t))), mul(k, dot(k, a) * (1 - Math.cos(t))));

/** Illustrative lone-pair directions of an atom (VSEPR electron-domain directions; NOT electron density). */
export function lonePairDirections(m: Molecule, atomId: string): Vec3[] {
  const atom = m.atoms.find(a => a.id === atomId);
  if (!atom || atom.lonePairs === 0) return [];
  const bonds = m.bonds.filter(b => b.a === atomId || b.b === atomId).map(b => unit(sub(m.atoms.find(a => a.id === (b.a === atomId ? b.b : b.a))!.position, atom.position)));
  const k = atom.lonePairs, steric = bonds.length + k;
  const sum = bonds.reduce(add, { x: 0, y: 0, z: 0 });
  const axis = len(sum) > 1e-6 ? unit(mul(sum, -1)) : { x: 0, y: 1, z: 0 };
  let ref = bonds.length >= 2 ? cross(bonds[0], bonds[1]) : { x: 0, y: 0, z: 0 };
  if (len(ref) < 1e-6) ref = cross(axis, Math.abs(axis.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 });
  const perp = unit(ref);
  if (k === 1) return [axis];
  if (k === 2) {
    const half = steric === 3 ? Math.PI / 3 : Math.acos(-1 / 3) / 2, n = unit(cross(axis, perp));
    return [rotateAbout(axis, n, half), rotateAbout(axis, n, -half)];
  }
  const tilt = Math.PI - Math.acos(-1 / 3), n = unit(cross(axis, perp)), first = rotateAbout(axis, n, tilt);
  return [0, 1, 2].map(i => rotateAbout(first, axis, (2 * Math.PI * i) / 3)).slice(0, k);
}

export type ProjectedAtom = { id: string; element: string; x: number; y: number; depth: number; r: number };
export type ProjectedBond = { id: string; a: string; b: string; order: number; x1: number; y1: number; x2: number; y2: number; depth: number; nx: number; ny: number };
export type ProjectedPair = { atom: string; x: number; y: number; depth: number; dx: number; dy: number };
export type MoleculeProjection = { width: number; height: number; scale: number; atoms: ProjectedAtom[]; bonds: ProjectedBond[]; pairs: ProjectedPair[] };
/** World → camera: yaw about y, then pitch about x; orthographic (an orthographic sphere is exactly a circle). */
function toCamera(p: Vec3, c: OrbitCamera): Vec3 {
  const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
  const x = p.x * cy + p.z * sy, z1 = -p.x * sy + p.z * cy;
  return { x, y: p.y * cp - z1 * sp, z: p.y * sp + z1 * cp };
}
/** The bounding sphere of a molecule (centroid + farthest atom surface), for a framing that does not depend on the orientation. */
export function moleculeBounds(m: Molecule): { center: Vec3; radius: number } {
  const n = m.atoms.length, center = mul(m.atoms.reduce((s, a) => add(s, a.position), { x: 0, y: 0, z: 0 }), 1 / n);
  const radius = Math.max(...m.atoms.map(a => len(sub(a.position, center)) + atomRadius(a.element)));
  return { center, radius };
}
export function projectMolecule(m: Molecule, camera: OrbitCamera, width: number, height: number, withPairs: boolean): MoleculeProjection {
  const { center, radius } = moleculeBounds(m);
  const scale = (camera.zoom * Math.min(width, height) * 0.44) / Math.max(radius + 0.35, 0.8);
  const screen = (p: Vec3) => { const c = toCamera(sub(p, center), camera); return { x: width / 2 + c.x * scale, y: height / 2 - c.y * scale, depth: c.z }; };
  const at = new Map(m.atoms.map(a => [a.id, { ...screen(a.position), atom: a }]));
  const atoms: ProjectedAtom[] = m.atoms.map(a => { const s = at.get(a.id)!; return { id: a.id, element: a.element, x: s.x, y: s.y, depth: s.depth, r: atomRadius(a.element) * scale }; });
  // a bond runs between the atom SURFACES (trimmed to 0.9 r so it visibly meets the sphere), never across an atom disk: the painter's
  // order alone cannot keep a nearer bond off a farther atom; a bond whose projected centres are closer than the two radii points at the
  // viewer and is hidden behind its atoms — it is not drawn.
  const bonds: ProjectedBond[] = [];
  for (const b of m.bonds) {
    const p = at.get(b.a)!, q = at.get(b.b)!, dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy);
    const ra = atomRadius(p.atom.element) * scale * 0.9, rb = atomRadius(q.atom.element) * scale * 0.9;
    if (l <= ra + rb) continue;
    const ux = dx / l, uy = dy / l;
    bonds.push({ id: b.id, a: b.a, b: b.b, order: b.order, x1: p.x + ux * ra, y1: p.y + uy * ra, x2: q.x - ux * rb, y2: q.y - uy * rb, depth: (p.depth + q.depth) / 2, nx: -uy, ny: ux });
  }
  const pairs: ProjectedPair[] = [];
  if (withPairs) for (const a of m.atoms) for (const d of lonePairDirections(m, a.id)) {
    const s = screen(add(a.position, mul(d, atomRadius(a.element) + 0.2))), c = toCamera(d, camera), l = Math.hypot(c.x, c.y) || 1;
    pairs.push({ atom: a.id, x: s.x, y: s.y, depth: s.depth, dx: -c.y / l, dy: -c.x / l });
  }
  return { width, height, scale, atoms, bonds, pairs };
}

/** The periodic-table information line of an element (basic: symbol, name, Z; detailed: + weight, group, period, category, block). */
export function elementInfo(e: ChemElement, mode: "basic" | "detailed"): string {
  const base = e.symbol + " — " + e.nameAr + "، العدد الذري " + e.z;
  return mode === "basic" ? base : base + "، الكتلة الذرية " + e.weightText + "، المجموعة " + e.group + "، الدورة " + e.period + "، " + CHEM_CATEGORY_LABEL[e.category] + "، الفئة " + blockOf(e);
}
