// Phase 21D-D.2 — pure PRESENTATION helpers of the reactions workspace (lazy; never part of grading): which catalog molecule (D.1) may
// draw a term, the particle picture of a term (real ball-and-stick geometry for catalog molecules, an element-dot tile for everything else),
// and the bounded number of copies drawn for a coefficient. Nothing here is graded: the plugin (src/chemistryReactionsPlugin.ts) is the only
// authority, and the conservation counts the UI shows come from the same exact engine function the grader uses.
import { MOLECULES, type Molecule } from "../chemistry/molecules";
import { hillOrder, type FormulaComposition } from "../chemistry/formula";
import type { ReactionTerm } from "../chemistry/reactions";
import type { CatalogTerm, ReactionTermKind } from "../chemistry/reactionCatalog";
import { projectMolecule, type MoleculeProjection } from "../chemistryStructure/chemView";

/** The most copies of one term drawn in the particle picture; larger coefficients show "+N" (the count itself is always exact). */
export const PARTICLE_COPIES_MAX = 10;
/** A formula unit drawn as element dots only up to this many atoms; a larger unit is drawn as one labelled tile. */
export const PARTICLE_DOTS_MAX = 12;
const BY_FORMULA = new Map(MOLECULES.map(m => [m.formula, m]));
/**
 * The D.1 catalog molecule that may draw a term with its REAL geometry: same formula, neutral, and not written as an aqueous solute
 * (HCl(aq) is ionised in water: drawing an HCl molecule for it would misrepresent the species). Anything else is drawn as a tile.
 */
export function termMolecule(t: Pick<ReactionTerm, "formula" | "charge" | "state">): Molecule | undefined {
  return t.charge === 0 && t.state !== "aq" ? BY_FORMULA.get(t.formula) : undefined;
}
/** What one particle of the term IS, as a short Arabic caption (catalog kind when known; otherwise a neutral "formula unit"). */
export function particleCaption(t: Pick<ReactionTerm, "charge">, kind?: ReactionTermKind): string {
  if (t.charge !== 0 || kind === "ion") return "أيون";
  if (kind === "molecule") return "جزيء";
  if (kind === "ionic") return "وحدة صيغة (مركب أيوني)";
  if (kind === "metal") return "ذرة فلز";
  if (kind === "element") return "ذرة";
  return "وحدة صيغة";
}
/** The element dots of one formula unit in Hill order, or null when the unit is too large to draw atom by atom. */
export function unitDots(c: FormulaComposition): string[] | null {
  const total = Object.values(c).reduce((a, b) => a + b, 0);
  if (total > PARTICLE_DOTS_MAX) return null;
  return hillOrder(c).flatMap(el => Array.from({ length: c[el] }, () => el));
}
/** How many copies to draw for a coefficient (null = not set yet: one faded copy) and how many are summarised as "+N". */
export function copiesFor(coefficient: number | null): { drawn: number; more: number; unset: boolean } {
  if (coefficient === null) return { drawn: 1, more: 0, unset: true };
  const drawn = Math.min(coefficient, PARTICLE_COPIES_MAX);
  return { drawn, more: coefficient - drawn, unset: false };
}
const MINI_CAMERA = Object.freeze({ yaw: 0.55, pitch: 0.35, zoom: 1 });
const MINI = new Map<string, MoleculeProjection>();
/** The fixed-orientation 2D projection of a catalog molecule for a particle tile (cached; real CCCBDB geometry). */
export function miniProjection(m: Molecule, size: number): MoleculeProjection {
  const k = m.id + ":" + size;
  let p = MINI.get(k);
  if (!p) { p = projectMolecule(m, MINI_CAMERA, size, size, false); MINI.set(k, p); }
  return p;
}
/** The catalog term of a reaction term at an index (when the question uses a catalog reaction). */
export const catalogTermAt = (terms: readonly CatalogTerm[] | undefined, i: number): CatalogTerm | undefined => terms?.[i];
