// HW-A1 (docs/enterprise-791283-course.md) — the strict reader of `interactive-diagram / hw-part-3d / v1`: a computer part as a 3D
// model to explore. Pure: anything unexpected → null (the activity then says it is unavailable, never guesses).
//
// config = { scene: Interactive3DSceneSpecV1, hint?: string }
//   • the scene passes the platform's own fail-closed validator (validateInteractive3DSceneSpec);
//   • every target is an OBJECT target (a piece of the model) — the explorer chooses pieces, never faces / edges / vertices;
//   • the scene is explore-only: it rotates and zooms, and choosing a piece is allowed (select) — the choice is never an answer.
import { validateInteractive3DSceneSpec, type Interactive3DSceneSpecV1 } from "../../interactive3d/sceneSpec";

export type HwPart3D = { scene: Interactive3DSceneSpecV1; hint?: string };

const isPlain = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

export function readHwPart3D(raw: unknown): HwPart3D | null {
  if (!isPlain(raw)) return null;
  if (Object.keys(raw).some(k => k !== "scene" && k !== "hint")) return null;
  if (raw.hint !== undefined && (typeof raw.hint !== "string" || !raw.hint.trim() || raw.hint.length > 200)) return null;
  const checked = validateInteractive3DSceneSpec(raw.scene, "hwPart3d.scene");
  if (!checked.ok) return null;
  const scene = checked.value;
  if (!scene.targets.length || scene.targets.some(t => t.kind !== "object")) return null;
  if (!scene.interaction.rotate || !scene.interaction.zoom || !scene.interaction.select) return null;
  return { scene, ...(typeof raw.hint === "string" ? { hint: raw.hint } : {}) };
}
