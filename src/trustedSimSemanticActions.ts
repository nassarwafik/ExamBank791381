// Phase 20A.1 — SEMANTIC ACTIONS and the universal composition helpers (pure; compiled into the shared server build).
//
// The academic record of a SmartSim answer is a list of SEMANTIC actions ("select the liver", "place the extremum at (2, 3)", "set the
// H₂O coefficient to 2", "router.command …"), replayed by the server from the published initial state. Gestures and presentation —
// camera rotation / zoom / pan, pointer and wheel events, hover, UI tabs, render frames, screen coordinates — are NEVER academic: the core
// refuses their action types outright (isPresentationActionType), so a camera angle can never change a grade.
//
// This module also offers OPTIONAL, domain-neutral building blocks a future plugin may compose (networkTopology@1 does not use them):
//   • a universal config {v: 1, scene, requiredCapabilities?} validated against the plugin's code-owned descriptor (JSON can only REQUIRE
//     capabilities the plugin declared — never grant one), with trusted assets limited to the kinds the plugin declared;
//   • the universal semantic action kinds (object.select / object.deselect / point.place / value.set / sequence.push / sequence.clear),
//     strictly normalized against the scene's semantic ids, and the neutral replay state they produce;
//   • the neutral RULE VIEW the generic trusted rules read.
// Domain science (gravity, valence, reachability …) is never here: a plugin keeps it in its own code.
import { isPlainObject, isSemanticId, isSmartSimCapability, isPresentationActionType } from "./trustedSimVocabulary";
import { validateSmartSimScene, type SmartSimSceneV1 } from "./trustedSimScene";
import { resolveSmartSimAsset } from "./trustedSimAssets";
import type { SmartSimPluginDescriptorV1 } from "./trustedSimDescriptor";
import type { SmartSimRuleView } from "./trustedSimRules";

export { SMART_SIM_PRESENTATION_ACTION_PREFIXES, isPresentationActionType, SMART_SIM_ACTION_TYPE_PATTERN } from "./trustedSimVocabulary";
export const UNIVERSAL_ACTION_KINDS: readonly string[] = Object.freeze(["object.select", "object.deselect", "point.place", "value.set", "sequence.push", "sequence.clear"]);
export const UNIVERSAL_LIMITS = Object.freeze({ magnitude: 1e9, sequence: 500 });

export type UniversalSimConfigV1 = { v: 1; scene: SmartSimSceneV1; requiredCapabilities?: string[] };
export type UniversalAction =
  | { type: "object.select" | "object.deselect" | "sequence.push"; objectId: string }
  | { type: "point.place"; pointId: string; position: { x: number; y: number; z?: number } }
  | { type: "value.set"; valueId: string; value: number }
  | { type: "sequence.clear" };
export type UniversalSimState = { v: 1; selected: string[]; points: Record<string, { x: number; y: number; z?: number }>; values: Record<string, number>; sequence: string[] };
type Issue = { code: string; message: string; path?: string };

/** Validates the universal config against the plugin's DESCRIPTOR (the code-owned authority of what the plugin supports). */
export function validateUniversalSimConfig(raw: unknown, descriptor: SmartSimPluginDescriptorV1): { ok: true; config: UniversalSimConfigV1 } | { ok: false; issues: Issue[] } {
  const issues: Issue[] = [];
  if (!isPlainObject(raw)) return { ok: false, issues: [{ code: "SMARTSIM_CONFIG_INVALID", message: "إعداد المحاكاة يجب أن يكون كائن JSON." }] };
  for (const k of Object.keys(raw)) if (k !== "v" && k !== "scene" && k !== "requiredCapabilities") issues.push({ code: "SMARTSIM_CONFIG_UNKNOWN_KEY", message: "حقل غير مسموح في إعداد المحاكاة: " + k, path: "config." + k });
  if (raw.v !== 1) issues.push({ code: "SMARTSIM_CONFIG_VERSION_UNSUPPORTED", message: "إصدار إعداد المحاكاة غير مدعوم (المدعوم: 1).", path: "config.v" });
  const s = validateSmartSimScene(raw.scene);
  if (!s.ok) issues.push(...s.issues.map(i => ({ ...i, path: "config." + (i.path ?? "scene") })));
  else {
    if (!descriptor.sceneKinds.includes(s.scene.space)) issues.push({ code: "SMARTSIM_CONFIG_SCENE_KIND_UNSUPPORTED", message: "هذه المحاكاة لا تدعم مشهدًا " + s.scene.space + ".", path: "config.scene.space" });
    for (const o of s.scene.objects) {
      if (!o.asset) continue;
      // the trusted registry already resolved the asset exactly; the plugin must have DECLARED its kind
      const kind = assetKindOf(o.asset.assetKey, o.asset.assetVersion);
      if (!kind || !descriptor.assetKinds.includes(kind)) issues.push({ code: "SMARTSIM_ASSET_KIND_UNDECLARED", message: "نوع المورد للعنصر " + o.id + " غير مُعلن في هذه المحاكاة.", path: "config.scene.objects." + o.id + ".asset" });
    }
  }
  let required: string[] | undefined;
  if (raw.requiredCapabilities !== undefined) {
    if (!Array.isArray(raw.requiredCapabilities) || raw.requiredCapabilities.length > 64) issues.push({ code: "SMARTSIM_CAPABILITY_UNKNOWN", message: "القدرات المطلوبة يجب أن تكون قائمة محدودة.", path: "config.requiredCapabilities" });
    else {
      const seen = new Set<string>();
      for (const c of raw.requiredCapabilities) {
        if (!isSmartSimCapability(c)) { issues.push({ code: "SMARTSIM_CAPABILITY_UNKNOWN", message: "قدرة غير معروفة: " + String(c), path: "config.requiredCapabilities" }); continue; }
        if (seen.has(c)) { issues.push({ code: "SMARTSIM_CAPABILITY_DUPLICATE", message: "قدرة مكررة: " + c, path: "config.requiredCapabilities" }); continue; }
        seen.add(c);
        if (!descriptor.capabilities.includes(c)) issues.push({ code: "SMARTSIM_CAPABILITY_UNDECLARED", message: "هذه المحاكاة لا تدعم القدرة " + c + ".", path: "config.requiredCapabilities" });
      }
      required = [...seen];
    }
  }
  if (issues.length || !s.ok) return { ok: false, issues };
  const config: UniversalSimConfigV1 = { v: 1, scene: s.scene };
  if (required) config.requiredCapabilities = required;
  return { ok: true, config };
}
const assetKindOf = (key: string, version: number) => resolveSmartSimAsset(key, version)?.kind;

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= UNIVERSAL_LIMITS.magnitude;
const POINT_PRIMITIVES = new Set(["point", "marker"]);
/** Strict normalization of a universal semantic action against the config's scene and the plugin's DECLARED action kinds. */
export function normalizeUniversalAction(raw: unknown, config: unknown, descriptor: SmartSimPluginDescriptorV1): { ok: true; action: UniversalAction } | { ok: false; code: string } {
  const bad = { ok: false as const, code: "SMARTSIM_ACTION_INVALID" };
  if (!isPlainObject(raw) || typeof raw.type !== "string") return bad;
  if (isPresentationActionType(raw.type)) return { ok: false, code: "SMARTSIM_ACTION_PRESENTATION_ONLY" };
  if (!UNIVERSAL_ACTION_KINDS.includes(raw.type) || !descriptor.actionKinds.includes(raw.type)) return bad;
  const scene = isPlainObject(config) && isPlainObject(config.scene) ? (config.scene as unknown as SmartSimSceneV1) : undefined;
  if (!scene || !Array.isArray(scene.objects)) return bad;
  const object = (id: unknown) => (isSemanticId(id) ? scene.objects.find(o => o.id === id) : undefined);
  const keys = Object.keys(raw).sort().join(",");
  switch (raw.type) {
    case "object.select": case "object.deselect": case "sequence.push":
      return keys === "objectId,type" && object(raw.objectId) ? { ok: true, action: { type: raw.type, objectId: raw.objectId as string } } : bad;
    case "sequence.clear":
      return keys === "type" ? { ok: true, action: { type: "sequence.clear" } } : bad;
    case "value.set":
      return keys === "type,value,valueId" && object(raw.valueId) && finite(raw.value) ? { ok: true, action: { type: "value.set", valueId: raw.valueId as string, value: raw.value } } : bad;
    case "point.place": {
      const target = object(raw.pointId);
      if (keys !== "pointId,position,type" || !target || !POINT_PRIMITIVES.has(target.primitive) || !isPlainObject(raw.position)) return bad;
      const p = raw.position, pk = Object.keys(p).sort().join(",");
      const dims3 = scene.space === "3d";
      if (pk !== (dims3 ? "x,y,z" : "x,y") || !finite(p.x) || !finite(p.y) || (dims3 && !finite(p.z))) return bad;
      return { ok: true, action: { type: "point.place", pointId: target.id, position: dims3 ? { x: p.x as number, y: p.y as number, z: p.z as number } : { x: p.x as number, y: p.y as number } } };
    }
  }
  return bad;
}
export const initialUniversalState = (): UniversalSimState => ({ v: 1, selected: [], points: {}, values: {}, sequence: [] });
const sorted = (a: string[]) => [...a].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
const sortedRecord = <T>(r: Record<string, T>) => { const out: Record<string, T> = {}; for (const k of sorted(Object.keys(r))) out[k] = r[k]; return out; };
/** Pure: returns a NEW state; never mutates its inputs. */
export function applyUniversalAction(state: unknown, action: unknown): UniversalSimState {
  const s = state as UniversalSimState, a = action as UniversalAction;
  const next: UniversalSimState = { v: 1, selected: [...s.selected], points: { ...s.points }, values: { ...s.values }, sequence: [...s.sequence] };
  switch (a.type) {
    case "object.select": if (!next.selected.includes(a.objectId)) next.selected.push(a.objectId); break;
    case "object.deselect": next.selected = next.selected.filter(id => id !== a.objectId); break;
    case "point.place": next.points[a.pointId] = { ...a.position }; break;
    case "value.set": next.values[a.valueId] = a.value; break;
    case "sequence.push": if (next.sequence.length < UNIVERSAL_LIMITS.sequence) next.sequence.push(a.objectId); break;
    case "sequence.clear": next.sequence = []; break;
  }
  return next;
}
/** The canonical graded state: sorted selection, keyed points / values in sorted key order, the sequence in order. */
export function canonicalUniversalState(state: unknown): UniversalSimState {
  const s = state as UniversalSimState;
  const points: Record<string, { x: number; y: number; z?: number }> = {};
  for (const [k, p] of Object.entries(sortedRecord(s.points))) points[k] = p.z === undefined ? { x: p.x, y: p.y } : { x: p.x, y: p.y, z: p.z };
  return { v: 1, selected: sorted(s.selected), points, values: sortedRecord(s.values), sequence: [...s.sequence] };
}
/** The neutral rule view of a universal state (ids from the scene; relations from the scene). */
export function universalRuleView(state: unknown, config: unknown): SmartSimRuleView {
  const s = canonicalUniversalState(state), c = config as UniversalSimConfigV1;
  return {
    ids: sorted(c.scene.objects.map(o => o.id)),
    selected: s.selected, points: s.points, values: s.values, sequence: s.sequence,
    relations: (c.scene.relations ?? []).map(r => ({ kind: r.kind, from: r.from, to: r.to }))
  };
}
