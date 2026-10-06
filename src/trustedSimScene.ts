// Phase 20A.1 — SmartSimSceneV1, the OPTIONAL universal scene a future SmartSim plugin may embed in its config (pure; shared server build).
//
// A scene is the AUTHORED, PUBLIC description of a world — DATA ONLY: objects with stable semantic ids, a small primitive vocabulary, bounded
// 2D / 3D transforms, data-only relations, trusted asset references and a presentation-only camera. It is NOT the canonical state (what the
// student did, derived by replay) and it never carries behaviour: every level is a strict ALLOW-LIST (an unknown key — script, html, srcdoc,
// module, component, handler, onClick, url, shaderSource … — is refused, never stripped), every number is finite and bounded, every string
// bounded, and labels are rendered as TEXT. The core never interprets domain names ("router", "atom", "liver"): plugins map their domain
// objects to primitives. networkTopology@1 does NOT use this scene (its config is unchanged); new plugins may.
import { isPlainObject, isSemanticId, isSmartSimPrimitive, isSmartSimRelationKind, hasControlCharacter } from "./trustedSimVocabulary";
import { validateSmartSimAssetRef, type SmartSimAssetRef } from "./trustedSimAssets";

export const SMART_SIM_SCENE_VERSION = 1;
export const SMART_SIM_SCENE_LIMITS = Object.freeze({ objects: 500, relations: 1000, idChars: 64, labelChars: 120, semanticLabelChars: 200, tags: 16, coordinate: 1e6, rotation: 360, scaleMax: 1000, zoomMin: 0.01, zoomMax: 100, fovMin: 10, fovMax: 120 });
export type SceneVector2 = { x: number; y: number };
export type SceneVector3 = { x: number; y: number; z: number };
export type SceneTransform2D = { x: number; y: number; rotation?: number; scale?: number };
export type SceneTransform3D = { x: number; y: number; z: number; rotation?: SceneVector3; scale?: number | SceneVector3 };
export type SmartSimSceneObject = { id: string; primitive: string; label?: string; semanticLabel?: string; transform?: SceneTransform2D | SceneTransform3D; asset?: SmartSimAssetRef; parent?: string; tags?: string[] };
export type SmartSimSceneRelation = { id: string; kind: string; from: string; to: string };
export type SmartSimCamera2D = { center: SceneVector2; zoom: number };
export type SmartSimCamera3D = { position: SceneVector3; target: SceneVector3; fov?: number; zoom?: number };
export type SmartSimSceneV1 = { v: 1; space: "2d" | "3d"; objects: SmartSimSceneObject[]; relations?: SmartSimSceneRelation[]; camera?: SmartSimCamera2D | SmartSimCamera3D };
export type SmartSimSceneIssue = { code: string; message: string; path?: string };

const SCENE_KEYS = new Set(["v", "space", "objects", "relations", "camera"]);
const OBJECT_KEYS = new Set(["id", "primitive", "label", "semanticLabel", "transform", "asset", "parent", "tags"]);
const RELATION_KEYS = "from,id,kind,to";
/** Asset-bearing primitives and the asset kinds they accept. */
const ASSET_KINDS_FOR: Readonly<Record<string, readonly string[]>> = Object.freeze({ mesh: ["mesh3d", "anatomy", "terrain", "molecule"], image: ["image", "texture", "map"] });
/** Primitives that may contain other objects (`parent`). */
const CONTAINERS = new Set(["group", "mesh", "body", "region"]);
const L = SMART_SIM_SCENE_LIMITS;

const num = (v: unknown, max: number): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= max;
const exactKeys = (o: Record<string, unknown>, required: string[], optional: string[] = []) => {
  const keys = Object.keys(o);
  return required.every(k => Object.prototype.hasOwnProperty.call(o, k)) && keys.every(k => required.includes(k) || optional.includes(k));
};
function vec(v: unknown, dims: 2 | 3, max: number = L.coordinate): SceneVector2 | SceneVector3 | undefined {
  if (!isPlainObject(v) || !exactKeys(v, dims === 2 ? ["x", "y"] : ["x", "y", "z"]) || !num(v.x, max) || !num(v.y, max) || (dims === 3 && !num(v.z, max))) return undefined;
  return dims === 2 ? { x: v.x as number, y: v.y as number } : { x: v.x as number, y: v.y as number, z: v.z as number };
}
const scaleOk = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0 && v <= L.scaleMax;
function transform(raw: unknown, space: "2d" | "3d"): SceneTransform2D | SceneTransform3D | undefined {
  if (!isPlainObject(raw)) return undefined;
  if (space === "2d") {
    if (!exactKeys(raw, ["x", "y"], ["rotation", "scale"]) || !num(raw.x, L.coordinate) || !num(raw.y, L.coordinate)) return undefined;
    if (raw.rotation !== undefined && !num(raw.rotation, L.rotation)) return undefined;
    if (raw.scale !== undefined && !scaleOk(raw.scale)) return undefined;
    const t: SceneTransform2D = { x: raw.x as number, y: raw.y as number };
    if (raw.rotation !== undefined) t.rotation = raw.rotation as number;
    if (raw.scale !== undefined) t.scale = raw.scale as number;
    return t;
  }
  if (!exactKeys(raw, ["x", "y", "z"], ["rotation", "scale"]) || !num(raw.x, L.coordinate) || !num(raw.y, L.coordinate) || !num(raw.z, L.coordinate)) return undefined;
  const t: SceneTransform3D = { x: raw.x as number, y: raw.y as number, z: raw.z as number };
  if (raw.rotation !== undefined) { const r = vec(raw.rotation, 3, L.rotation); if (!r) return undefined; t.rotation = r as SceneVector3; }
  if (raw.scale !== undefined) {
    if (scaleOk(raw.scale)) t.scale = raw.scale;
    else { const s = isPlainObject(raw.scale) && exactKeys(raw.scale, ["x", "y", "z"]) && [raw.scale.x, raw.scale.y, raw.scale.z].every(scaleOk) ? { x: raw.scale.x as number, y: raw.scale.y as number, z: raw.scale.z as number } : undefined; if (!s) return undefined; t.scale = s; }
  }
  return t;
}
function camera(raw: unknown, space: "2d" | "3d"): SmartSimCamera2D | SmartSimCamera3D | undefined {
  if (!isPlainObject(raw)) return undefined;
  const zoomOk = (z: unknown) => typeof z === "number" && Number.isFinite(z) && z >= L.zoomMin && z <= L.zoomMax;
  if (space === "2d") {
    if (!exactKeys(raw, ["center", "zoom"]) || !zoomOk(raw.zoom)) return undefined;
    const c = vec(raw.center, 2); if (!c) return undefined;
    return { center: c as SceneVector2, zoom: raw.zoom as number };
  }
  if (!exactKeys(raw, ["position", "target"], ["fov", "zoom"])) return undefined;
  const p = vec(raw.position, 3), t = vec(raw.target, 3);
  if (!p || !t) return undefined;
  if (raw.fov !== undefined && !(typeof raw.fov === "number" && Number.isFinite(raw.fov) && raw.fov >= L.fovMin && raw.fov <= L.fovMax)) return undefined;
  if (raw.zoom !== undefined && !zoomOk(raw.zoom)) return undefined;
  const c: SmartSimCamera3D = { position: p as SceneVector3, target: t as SceneVector3 };
  if (raw.fov !== undefined) c.fov = raw.fov as number;
  if (raw.zoom !== undefined) c.zoom = raw.zoom as number;
  return c;
}
const labelOk = (v: unknown, max: number) => typeof v === "string" && v.trim() !== "" && v.length <= max && !hasControlCharacter(v);

/** Validates and canonicalizes a SmartSimSceneV1 (strict; never repaired). Object order is kept (it is draw / list order); relations are sorted by id. */
export function validateSmartSimScene(raw: unknown): { ok: true; scene: SmartSimSceneV1 } | { ok: false; issues: SmartSimSceneIssue[] } {
  const issues: SmartSimSceneIssue[] = [];
  const err = (code: string, message: string, path?: string) => { issues.push(path ? { code, message, path } : { code, message }); };
  if (!isPlainObject(raw)) return { ok: false, issues: [{ code: "SMARTSIM_SCENE_INVALID", message: "المشهد يجب أن يكون كائن JSON." }] };
  for (const k of Object.keys(raw)) if (!SCENE_KEYS.has(k)) err("SMARTSIM_SCENE_UNKNOWN_KEY", "حقل غير مسموح في المشهد: " + k, "scene." + k);
  if (raw.v !== SMART_SIM_SCENE_VERSION) err("SMARTSIM_SCENE_VERSION_UNSUPPORTED", "إصدار المشهد غير مدعوم (المدعوم: 1).", "scene.v");
  const space = raw.space === "2d" || raw.space === "3d" ? raw.space : undefined;
  if (!space) err("SMARTSIM_SCENE_SPACE_INVALID", "فضاء المشهد يجب أن يكون 2d أو 3d.", "scene.space");
  if (!Array.isArray(raw.objects)) { err("SMARTSIM_SCENE_OBJECTS_INVALID", "قائمة عناصر المشهد مطلوبة.", "scene.objects"); return { ok: false, issues }; }
  if (raw.objects.length > L.objects) { err("SMARTSIM_SCENE_TOO_MANY_OBJECTS", "عدد عناصر المشهد يتجاوز " + L.objects + ".", "scene.objects"); return { ok: false, issues }; }
  if (!space) return { ok: false, issues };
  const objects: SmartSimSceneObject[] = [];
  const ids = new Set<string>();
  const primitiveOf = new Map<string, string>();
  raw.objects.forEach((o, i) => {
    const where = "scene.objects[" + i + "]";
    if (!isPlainObject(o)) { err("SMARTSIM_SCENE_OBJECT_INVALID", "عنصر غير صالح.", where); return; }
    for (const k of Object.keys(o)) if (!OBJECT_KEYS.has(k)) err("SMARTSIM_SCENE_UNKNOWN_KEY", "حقل غير مسموح في عنصر المشهد: " + k, where + "." + k);
    if (!isSemanticId(o.id)) { err("SMARTSIM_SCENE_OBJECT_ID_INVALID", "معرّف العنصر رقم " + (i + 1) + " غير صالح (حرف لاتيني ثم حروف / أرقام / - / _ حتى " + L.idChars + ").", where + ".id"); return; }
    if (ids.has(o.id)) { err("SMARTSIM_SCENE_OBJECT_ID_DUPLICATE", "معرّف عنصر مكرر: " + o.id, where + ".id"); return; }
    ids.add(o.id);
    if (!isSmartSimPrimitive(o.primitive)) { err("SMARTSIM_SCENE_PRIMITIVE_UNKNOWN", "نوع عنصر غير مدعوم: " + String(o.primitive), where + ".primitive"); return; }
    primitiveOf.set(o.id, o.primitive);
    const out: SmartSimSceneObject = { id: o.id, primitive: o.primitive };
    if (o.label !== undefined) { if (labelOk(o.label, L.labelChars)) out.label = (o.label as string).trim(); else err("SMARTSIM_SCENE_LABEL_INVALID", "تسمية العنصر " + o.id + " غير صالحة (نص حتى " + L.labelChars + " حرفًا).", where + ".label"); }
    if (o.semanticLabel !== undefined) { if (labelOk(o.semanticLabel, L.semanticLabelChars)) out.semanticLabel = (o.semanticLabel as string).trim(); else err("SMARTSIM_SCENE_LABEL_INVALID", "الوصف الدلالي للعنصر " + o.id + " غير صالح.", where + ".semanticLabel"); }
    if (o.transform !== undefined) { const t = transform(o.transform, space); if (t) out.transform = t; else err("SMARTSIM_SCENE_TRANSFORM_INVALID", "موضع العنصر " + o.id + " غير صالح لفضاء " + space + " (أعداد محدودة فقط).", where + ".transform"); }
    const assetKinds = ASSET_KINDS_FOR[o.primitive];
    if (o.asset !== undefined) {
      if (!assetKinds) err("SMARTSIM_SCENE_ASSET_UNEXPECTED", "العنصر " + o.id + " من النوع " + o.primitive + " لا يقبل موردًا.", where + ".asset");
      else { const a = validateSmartSimAssetRef(o.asset, { kinds: assetKinds }); if (a.ok) out.asset = a.ref; else for (const x of a.issues) err(x.code, x.message, where + ".asset"); }
    } else if (assetKinds) err("SMARTSIM_SCENE_ASSET_REQUIRED", "العنصر " + o.id + " من النوع " + o.primitive + " يحتاج إلى مورد موثوق.", where + ".asset");
    if (o.parent !== undefined) { if (isSemanticId(o.parent)) out.parent = o.parent; else err("SMARTSIM_SCENE_PARENT_INVALID", "العنصر الأب للعنصر " + o.id + " غير صالح.", where + ".parent"); }
    if (o.tags !== undefined) {
      if (Array.isArray(o.tags) && o.tags.length <= L.tags && o.tags.every(isSemanticId) && new Set(o.tags).size === o.tags.length) out.tags = [...(o.tags as string[])];
      else err("SMARTSIM_SCENE_TAGS_INVALID", "وسوم العنصر " + o.id + " غير صالحة.", where + ".tags");
    }
    objects.push(out);
  });
  // parents: existing, not self, a container primitive, acyclic
  for (const o of objects) {
    if (o.parent === undefined) continue;
    if (o.parent === o.id || !primitiveOf.has(o.parent) || !CONTAINERS.has(primitiveOf.get(o.parent)!)) { err("SMARTSIM_SCENE_PARENT_INVALID", "العنصر الأب للعنصر " + o.id + " غير موجود أو لا يحتوي عناصر.", "scene.objects." + o.id + ".parent"); continue; }
    const seen = new Set([o.id]);
    for (let p: string | undefined = o.parent; p !== undefined; p = objects.find(x => x.id === p)?.parent) {
      if (seen.has(p)) { err("SMARTSIM_SCENE_PARENT_INVALID", "تسلسل العناصر الأب للعنصر " + o.id + " دائري.", "scene.objects." + o.id + ".parent"); break; }
      seen.add(p);
    }
  }
  const scene: SmartSimSceneV1 = { v: 1, space, objects };
  if (raw.relations !== undefined) {
    if (!Array.isArray(raw.relations)) err("SMARTSIM_SCENE_RELATION_INVALID", "العلاقات يجب أن تكون قائمة.", "scene.relations");
    else if (raw.relations.length > L.relations) err("SMARTSIM_SCENE_TOO_MANY_RELATIONS", "عدد العلاقات يتجاوز " + L.relations + ".", "scene.relations");
    else {
      const rel: SmartSimSceneRelation[] = [];
      const rids = new Set<string>();
      raw.relations.forEach((r, i) => {
        const where = "scene.relations[" + i + "]";
        if (!isPlainObject(r) || Object.keys(r).sort().join(",") !== RELATION_KEYS || !isSemanticId(r.id) || !isSemanticId(r.from) || !isSemanticId(r.to)) { err("SMARTSIM_SCENE_RELATION_INVALID", "علاقة غير صالحة (id, kind, from, to فقط).", where); return; }
        if (!isSmartSimRelationKind(r.kind)) { err("SMARTSIM_SCENE_RELATION_KIND_UNKNOWN", "نوع علاقة غير مدعوم: " + String(r.kind), where + ".kind"); return; }
        if (r.from === r.to || !ids.has(r.from) || !ids.has(r.to)) { err("SMARTSIM_SCENE_RELATION_INVALID", "العلاقة " + r.id + " تشير إلى عناصر غير موجودة أو إلى العنصر نفسه.", where); return; }
        if (rids.has(r.id)) { err("SMARTSIM_SCENE_RELATION_ID_DUPLICATE", "معرّف علاقة مكرر: " + r.id, where + ".id"); return; }
        rids.add(r.id);
        rel.push({ id: r.id, kind: r.kind, from: r.from, to: r.to });
      });
      scene.relations = rel.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    }
  }
  if (raw.camera !== undefined) { const c = camera(raw.camera, space); if (c) scene.camera = c; else err("SMARTSIM_SCENE_CAMERA_INVALID", "إعداد الكاميرا غير صالح لفضاء " + space + ".", "scene.camera"); }
  return issues.length ? { ok: false, issues } : { ok: true, scene };
}
/** Semantic ids of the scene objects, in authored order. */
export const sceneObjectIds = (scene: SmartSimSceneV1): string[] => scene.objects.map(o => o.id);
/** The scene WITHOUT presentation (the camera): two scenes that differ only in camera are semantically identical. */
export function semanticScene(scene: SmartSimSceneV1): Omit<SmartSimSceneV1, "camera"> {
  const { camera: _camera, ...rest } = scene;
  void _camera;
  return JSON.parse(JSON.stringify(rest));
}
