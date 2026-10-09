// Phase 21C — ExamBank-owned, renderer-neutral Interactive3DSceneSpecV1.
// Data only: no SVG/HTML, no callbacks, no renderer options, no executable code and no external URLs.
import { CONTROL, RAW_HTML } from "../richContent/proseGuard";

export const INTERACTIVE_3D_SCENE_VERSION = 1 as const;
export const SCENE3D_OBJECT_KINDS = Object.freeze(["box", "sphere", "ellipsoid", "cylinder", "cone", "pyramid"] as const);
export type Scene3DObjectKind = (typeof SCENE3D_OBJECT_KINDS)[number];
export const SCENE3D_TARGET_KINDS = Object.freeze(["object", "face", "edge", "vertex"] as const);
export type Scene3DTargetKind = (typeof SCENE3D_TARGET_KINDS)[number];
export const SCENE3D_TARGET_KIND_LABELS: Readonly<Record<Scene3DTargetKind, string>> = Object.freeze({
  object: "مجسم / جزء",
  face: "وجه",
  edge: "حافة",
  vertex: "رأس"
});
export const SCENE3D_LIMITS = Object.freeze({
  textChars: 160,
  descriptionChars: 800,
  objects: 64,
  targets: 128,
  coordAbs: 100,
  sizeMin: 0.05,
  sizeMax: 40,
  rotationAbs: Math.PI * 2,
  zoomMin: 0.55,
  zoomMax: 2.2,
  meshVertices: 12000,
  meshFaces: 20000
});

export type Scene3DVec3 = { x: number; y: number; z: number };
export type Scene3DCamera = { yaw: number; pitch: number; zoom: number };
export type Scene3DInteraction = { rotate: boolean; zoom: boolean; select: boolean };
export type Scene3DObjectV1 = {
  id: string;
  label: string;
  kind: Scene3DObjectKind;
  center: Scene3DVec3;
  size: Scene3DVec3;
  rotation?: Scene3DVec3;
  palette: number;
  opacity?: number;
};
export type Scene3DTargetV1 = {
  id: string;
  kind: Scene3DTargetKind;
  label: string;
  detail?: string;
  objectId: string;
  element?: string;
};
export type Interactive3DSceneSpecV1 = {
  version: 1;
  id: string;
  title: string;
  description: string;
  camera: Scene3DCamera;
  interaction: Scene3DInteraction;
  objects: Scene3DObjectV1[];
  targets: Scene3DTargetV1[];
};
export type Scene3DIssue = { code: string; path: string; message: string; severity: "error" };
export type Scene3DResult =
  | { ok: true; value: Interactive3DSceneSpecV1; issues: [] }
  | { ok: false; issues: Scene3DIssue[] };

const ID = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
const ELEMENT = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
const BIDI = /[\u202A-\u202E\u2066-\u2069]/;
const INVISIBLE = /[\u00AD\u034F\u061C\u180E\u200B\u200E\u200F\u2060\uFEFF]/;
const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);
const own = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};
const exactKeys = (o: Record<string, unknown>, allowed: readonly string[]) => Object.keys(o).every(k => allowed.includes(k) && !FORBIDDEN.has(k));
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export const scene3DTargetKey = (t: Pick<Scene3DTargetV1, "kind" | "id">): string => t.kind + ":" + t.id;
export const scene3DTargets = (scene: Interactive3DSceneSpecV1, kind?: Scene3DTargetKind): Scene3DTargetV1[] =>
  kind ? scene.targets.filter(t => t.kind === kind) : [...scene.targets];

const boxFaces = new Set(["front", "back", "left", "right", "top", "bottom"]);
const boxVertices = new Set(["A", "B", "C", "D", "E", "F", "G", "H"]);
const boxEdges = new Set(["AB", "BC", "CD", "DA", "EF", "FG", "GH", "HE", "AE", "BF", "CG", "DH"]);
const pyramidFaces = new Set(["base", "sideAB", "sideBC", "sideCD", "sideDA"]);
const pyramidVertices = new Set(["A", "B", "C", "D", "E"]);
const pyramidEdges = new Set(["AB", "BC", "CD", "DA", "AE", "BE", "CE", "DE"]);

function validElement(kind: Scene3DTargetKind, object: Scene3DObjectV1, element: string | undefined): boolean {
  if (kind === "object") return element === undefined;
  if (!element || !ELEMENT.test(element)) return false;
  if (object.kind === "box") return kind === "face" ? boxFaces.has(element) : kind === "edge" ? boxEdges.has(element) : kind === "vertex" ? boxVertices.has(element) : false;
  if (object.kind === "pyramid") return kind === "face" ? pyramidFaces.has(element) : kind === "edge" ? pyramidEdges.has(element) : kind === "vertex" ? pyramidVertices.has(element) : false;
  return false;
}

export function validateInteractive3DSceneSpec(raw: unknown, path = "interactive3D"): Scene3DResult {
  try {
    const issues: Scene3DIssue[] = [];
    const add = (code: string, at: string, message: string) => { if (issues.length < 80) issues.push({ code, path: at, message, severity: "error" }); };
    const object = (v: unknown, at: string, keys: readonly string[]): Record<string, unknown> | null => {
      if (!isPlain(v)) { add("SCENE3D_OBJECT_INVALID", at, "مطلوب كائن بيانات عادي."); return null; }
      if (!exactKeys(v, keys)) add("SCENE3D_UNKNOWN_KEY", at, "حقول غير معروفة أو محجوزة في مشهد 3D.");
      return v;
    };
    const id = (v: unknown, at: string): string | null => {
      if (typeof v !== "string" || !ID.test(v) || FORBIDDEN.has(v)) { add("SCENE3D_ID_INVALID", at, "المعرّف غير صالح."); return null; }
      return v;
    };
    const text = (v: unknown, at: string, max: number): string | null => {
      if (typeof v !== "string" || !v.trim() || v.length > max || CONTROL.test(v) || RAW_HTML.test(v) || BIDI.test(v) || INVISIBLE.test(v)) {
        add("SCENE3D_TEXT_INVALID", at, "النص غير صالح أو يتضمن محارف/وسوم غير مسموحة.");
        return null;
      }
      return v.trim();
    };
    const num = (v: unknown, at: string, lo: number, hi: number): number | null => {
      if (!finite(v) || v < lo || v > hi) { add("SCENE3D_NUMBER_INVALID", at, "قيمة عددية خارج الحدود المسموحة."); return null; }
      return Object.is(v, -0) ? 0 : v;
    };
    const vec = (v: unknown, at: string, lo: number, hi: number): Scene3DVec3 | null => {
      const o = object(v, at, ["x", "y", "z"]);
      if (!o) return null;
      const x = num(o.x, at + ".x", lo, hi), y = num(o.y, at + ".y", lo, hi), z = num(o.z, at + ".z", lo, hi);
      return x === null || y === null || z === null ? null : { x, y, z };
    };

    const top = object(raw, path, ["version", "id", "title", "description", "camera", "interaction", "objects", "targets"]);
    if (!top) return { ok: false, issues };
    if (top.version !== 1) add("SCENE3D_VERSION_INVALID", path + ".version", "إصدار مشهد 3D غير مدعوم.");
    const sceneId = id(top.id, path + ".id");
    const title = text(top.title, path + ".title", SCENE3D_LIMITS.textChars);
    const description = text(top.description, path + ".description", SCENE3D_LIMITS.descriptionChars);

    const cameraRaw = object(top.camera, path + ".camera", ["yaw", "pitch", "zoom"]);
    let camera: Scene3DCamera | null = null;
    if (cameraRaw) {
      const yaw = num(cameraRaw.yaw, path + ".camera.yaw", -Math.PI, Math.PI);
      const pitch = num(cameraRaw.pitch, path + ".camera.pitch", -1.35, 1.35);
      const zoom = num(cameraRaw.zoom, path + ".camera.zoom", SCENE3D_LIMITS.zoomMin, SCENE3D_LIMITS.zoomMax);
      if (yaw !== null && pitch !== null && zoom !== null) camera = { yaw, pitch, zoom };
    }

    const interactionRaw = object(top.interaction, path + ".interaction", ["rotate", "zoom", "select"]);
    let interaction: Scene3DInteraction | null = null;
    if (interactionRaw) {
      if (typeof interactionRaw.rotate !== "boolean" || typeof interactionRaw.zoom !== "boolean" || typeof interactionRaw.select !== "boolean") add("SCENE3D_INTERACTION_INVALID", path + ".interaction", "خيارات التفاعل يجب أن تكون قيمًا منطقية.");
      else interaction = { rotate: interactionRaw.rotate, zoom: interactionRaw.zoom, select: interactionRaw.select };
    }

    const objects: Scene3DObjectV1[] = [];
    const objectIds = new Set<string>();
    if (!Array.isArray(top.objects) || top.objects.length < 1 || top.objects.length > SCENE3D_LIMITS.objects) add("SCENE3D_OBJECTS_INVALID", path + ".objects", "المشهد يحتاج من 1 حتى " + SCENE3D_LIMITS.objects + " مجسمًا.");
    else top.objects.forEach((entry, i) => {
      const at = path + ".objects[" + i + "]";
      const o = object(entry, at, ["id", "label", "kind", "center", "size", "rotation", "palette", "opacity"]);
      if (!o) return;
      const objectId = id(o.id, at + ".id"), label = text(o.label, at + ".label", SCENE3D_LIMITS.textChars);
      const kind = typeof o.kind === "string" && (SCENE3D_OBJECT_KINDS as readonly string[]).includes(o.kind) ? o.kind as Scene3DObjectKind : null;
      if (!kind) add("SCENE3D_KIND_INVALID", at + ".kind", "نوع المجسم غير مدعوم.");
      const center = vec(o.center, at + ".center", -SCENE3D_LIMITS.coordAbs, SCENE3D_LIMITS.coordAbs);
      const size = vec(o.size, at + ".size", SCENE3D_LIMITS.sizeMin, SCENE3D_LIMITS.sizeMax);
      const rotation = own(o, "rotation") ? vec(o.rotation, at + ".rotation", -SCENE3D_LIMITS.rotationAbs, SCENE3D_LIMITS.rotationAbs) : undefined;
      const palette = num(o.palette, at + ".palette", 1, 8);
      if (palette !== null && !Number.isInteger(palette)) add("SCENE3D_PALETTE_INVALID", at + ".palette", "لون المجسم يجب أن يكون رقمًا صحيحًا من 1 إلى 8.");
      let opacity: number | undefined;
      if (own(o, "opacity")) {
        const n = num(o.opacity, at + ".opacity", 0.2, 1);
        if (n !== null) opacity = n;
      }
      if (objectId && objectIds.has(objectId)) add("SCENE3D_DUPLICATE_OBJECT_ID", at + ".id", "معرّف مجسم مكرر: " + objectId);
      if (objectId) objectIds.add(objectId);
      if (objectId && label && kind && center && size && palette !== null && Number.isInteger(palette) && (rotation !== null)) {
        objects.push({ id: objectId, label, kind, center, size, palette, ...(rotation ? { rotation } : {}), ...(opacity !== undefined ? { opacity } : {}) });
      }
    });

    const byId = new Map(objects.map(o => [o.id, o]));
    const targets: Scene3DTargetV1[] = [];
    const targetIds = new Set<string>(), targetKeys = new Set<string>();
    if (!Array.isArray(top.targets) || top.targets.length > SCENE3D_LIMITS.targets) add("SCENE3D_TARGETS_INVALID", path + ".targets", "قائمة أهداف 3D غير صالحة أو أكبر من الحد المسموح.");
    else top.targets.forEach((entry, i) => {
      const at = path + ".targets[" + i + "]";
      const t = object(entry, at, ["id", "kind", "label", "detail", "objectId", "element"]);
      if (!t) return;
      const targetId = id(t.id, at + ".id"), label = text(t.label, at + ".label", SCENE3D_LIMITS.textChars);
      const kind = typeof t.kind === "string" && (SCENE3D_TARGET_KINDS as readonly string[]).includes(t.kind) ? t.kind as Scene3DTargetKind : null;
      if (!kind) add("SCENE3D_TARGET_KIND_INVALID", at + ".kind", "نوع هدف 3D غير مدعوم.");
      const objectId = id(t.objectId, at + ".objectId");
      const objectRef = objectId ? byId.get(objectId) : undefined;
      if (objectId && !objectRef) add("SCENE3D_TARGET_OBJECT_UNKNOWN", at + ".objectId", "هدف 3D يشير إلى مجسم غير موجود.");
      let detail: string | undefined;
      if (own(t, "detail")) {
        const d = text(t.detail, at + ".detail", SCENE3D_LIMITS.descriptionChars);
        if (d) detail = d;
      }
      let element: string | undefined;
      if (own(t, "element")) {
        if (typeof t.element !== "string" || !ELEMENT.test(t.element) || FORBIDDEN.has(t.element)) add("SCENE3D_TARGET_ELEMENT_INVALID", at + ".element", "عنصر هدف 3D غير صالح.");
        else element = t.element;
      }
      if (targetId && targetIds.has(targetId)) add("SCENE3D_DUPLICATE_TARGET_ID", at + ".id", "معرّف هدف 3D مكرر: " + targetId);
      if (targetId) targetIds.add(targetId);
      if (kind && objectRef && !validElement(kind, objectRef, element)) add("SCENE3D_TARGET_ELEMENT_INVALID", at + ".element", "العنصر لا يطابق نوع الهدف أو المجسم.");
      if (targetId && kind) {
        const key = kind + ":" + targetId;
        if (targetKeys.has(key)) add("SCENE3D_DUPLICATE_TARGET_KEY", at, "مفتاح هدف 3D مكرر.");
        targetKeys.add(key);
      }
      if (targetId && label && kind && objectId && objectRef && validElement(kind, objectRef, element)) {
        targets.push({ id: targetId, kind, label, objectId, ...(detail ? { detail } : {}), ...(element ? { element } : {}) });
      }
    });

    if (issues.length || !sceneId || !title || !description || !camera || !interaction || objects.length === 0) return { ok: false, issues };
    return { ok: true, value: { version: 1, id: sceneId, title, description, camera, interaction, objects, targets }, issues: [] };
  } catch {
    return { ok: false, issues: [{ code: "SCENE3D_INVALID", path, message: "تعذر التحقق من مشهد 3D.", severity: "error" }] };
  }
}

export function projectInteractive3DSceneForStudent(raw: unknown): Interactive3DSceneSpecV1 | null {
  const r = validateInteractive3DSceneSpec(raw);
  return r.ok ? r.value : null;
}
