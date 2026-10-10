// Phase 21D-D.1 — the ELECTRON-CONFIGURATION model (pure; compiled into the shared server build).
//   Neutral atoms (Z ≤ 36): subshells fill in the Madelung (n + l, then n) order, except the two ground states the NIST Atomic Spectra
//   Database lists differently in this range — Cr [Ar]3d⁵4s¹ and Cu [Ar]3d¹⁰4s¹ — which are encoded explicitly (verified fact).
//   Ions (modelling rule, stated): a cation loses electrons from the highest n first (highest l within the same n) — Fe²⁺ = [Ar]3d⁶;
//   an anion gains electrons in Madelung order — O²⁻ = 1s² 2s² 2p⁶.
//   Shells: electrons per principal quantum number n (K, L, M, N). The shell DIAGRAM drawn from them is an educational model: the circles
//   group electrons by n — they are not orbits or trajectories.
import { CHEM_Z_MAX, chemElementByZ, type ChemElement } from "./elements";

export type Subshell = { n: number; l: number; e: number };
const L_LETTER = ["s", "p", "d", "f"] as const;
const capacity = (l: number) => 2 * (2 * l + 1);
/** Madelung order of every subshell a species with at most 40 electrons can use. */
const MADELUNG: readonly { n: number; l: number }[] = Object.freeze([
  { n: 1, l: 0 }, { n: 2, l: 0 }, { n: 2, l: 1 }, { n: 3, l: 0 }, { n: 3, l: 1 }, { n: 4, l: 0 }, { n: 3, l: 2 }, { n: 4, l: 1 }, { n: 5, l: 0 }
]);
export const CHEM_ELECTRONS_MAX = 40;
export const SHELL_LETTERS: readonly string[] = Object.freeze(["K", "L", "M", "N", "O"]);
/** NIST ground configurations that differ from the Madelung filling (Z ≤ 36). */
const EXCEPTIONS: Readonly<Record<number, Readonly<Record<string, number>>>> = Object.freeze({
  24: Object.freeze({ "4s": 1, "3d": 5 }),
  29: Object.freeze({ "4s": 1, "3d": 10 })
});
const key = (s: { n: number; l: number }) => s.n + L_LETTER[s.l];
const sortNl = (a: Subshell, b: Subshell) => a.n - b.n || a.l - b.l;

function madelungFill(count: number, from?: Map<string, number>): Map<string, number> {
  const occ = new Map(from ?? []);
  let left = count;
  for (const s of MADELUNG) {
    if (left <= 0) break;
    const have = occ.get(key(s)) ?? 0, put = Math.min(capacity(s.l) - have, left);
    if (put > 0) { occ.set(key(s), have + put); left -= put; }
  }
  if (left > 0) throw new Error("too many electrons for the model");
  return occ;
}
const toList = (occ: Map<string, number>): Subshell[] =>
  MADELUNG.filter(s => (occ.get(key(s)) ?? 0) > 0).map(s => ({ n: s.n, l: s.l, e: occ.get(key(s)) as number })).sort(sortNl);

/** The ground configuration of the NEUTRAL atom (n-then-l order, as NIST writes it). */
export function neutralConfiguration(z: number): Subshell[] {
  if (!Number.isInteger(z) || z < 1 || z > CHEM_Z_MAX) throw new Error("Z outside the catalog");
  const occ = madelungFill(z);
  const ex = EXCEPTIONS[z];
  if (ex) for (const [k, v] of Object.entries(ex)) occ.set(k, v);
  return toList(occ);
}
/** The configuration of a species with atomic number z and charge (cations: highest n, then highest l first; anions: Madelung order). */
export function speciesConfiguration(z: number, charge: number): Subshell[] {
  const electrons = z - charge;
  if (!Number.isInteger(charge) || electrons < 0 || electrons > CHEM_ELECTRONS_MAX) throw new Error("electron count outside the model");
  const base = neutralConfiguration(z);
  if (charge === 0) return base;
  const occ = new Map(base.map(s => [key(s), s.e]));
  if (charge < 0) return toList(madelungFill(-charge, occ));
  let remove = charge;
  const order = [...base].sort((a, b) => b.n - a.n || b.l - a.l);
  for (const s of order) {
    if (remove <= 0) break;
    const take = Math.min(s.e, remove);
    occ.set(key(s), s.e - take); remove -= take;
  }
  return toList(occ);
}
/** Electrons per principal shell n = 1 … (trailing empty shells omitted; [] for a bare nucleus). */
export function shellsOf(config: readonly Subshell[]): number[] {
  const out: number[] = [];
  for (const s of config) { while (out.length < s.n) out.push(0); out[s.n - 1] += s.e; }
  while (out.length && out[out.length - 1] === 0) out.pop();
  return out;
}
/** "1s² 2s² 2p⁶ 3s¹" (n-then-l order); "—" for no electrons. */
const SUP: Readonly<Record<string, string>> = Object.freeze({ "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" });
export const superscriptDigits = (n: number) => String(n).split("").map(d => SUP[d] ?? d).join("");
export const formatConfiguration = (config: readonly Subshell[]): string => (config.length ? config.map(s => s.n + L_LETTER[s.l] + superscriptDigits(s.e)).join(" ") : "—");
/** The block of an element: the l of the LAST subshell occupied in Madelung order of the neutral atom. */
export function blockOf(e: ChemElement): "s" | "p" | "d" {
  const occ = new Map(neutralConfiguration(e.z).map(s => [key(s), s.e]));
  const last = [...MADELUNG].reverse().find(s => (occ.get(key(s)) ?? 0) > 0)!;
  return L_LETTER[last.l] as "s" | "p" | "d";
}
/** Valence electrons of a NEUTRAL main-group (s / p block) atom: the electrons of its outermost shell; undefined for the d block. */
export function valenceElectrons(e: ChemElement): number | null {
  if (blockOf(e) === "d") return null;
  const sh = shellsOf(neutralConfiguration(e.z));
  return sh[sh.length - 1];
}
/** Electrons in the outermost OCCUPIED shell of a species (0 for a bare nucleus such as H⁺). */
export function outerShellElectrons(z: number, charge: number): number {
  const sh = shellsOf(speciesConfiguration(z, charge));
  return sh.length ? sh[sh.length - 1] : 0;
}
export const chemShellLetter = (i: number) => SHELL_LETTERS[i] ?? "n" + (i + 1);
export const elementOfZ = chemElementByZ;
