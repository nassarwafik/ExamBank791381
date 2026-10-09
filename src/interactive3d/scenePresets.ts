import type { Interactive3DSceneSpecV1, Scene3DObjectV1, Scene3DTargetV1 } from "./sceneSpec";

export const SCENE3D_PRESET_KEYS = Object.freeze(["cube", "pyramid", "heart", "torso", "water"] as const);
export type Scene3DPresetKey = (typeof SCENE3D_PRESET_KEYS)[number];
export const SCENE3D_PRESET_LABELS: Readonly<Record<Scene3DPresetKey, string>> = Object.freeze({
  cube: "مكعب هندسي",
  pyramid: "هرم رباعي",
  heart: "قلب تعليمي مبسّط",
  torso: "جذع جسم الإنسان — أعضاء رئيسية",
  water: "جزيء ماء H₂O"
});

const v = (x: number, y: number, z: number) => ({ x, y, z });
const o = (id: string, label: string, kind: Scene3DObjectV1["kind"], center: ReturnType<typeof v>, size: ReturnType<typeof v>, palette: number, rotation?: ReturnType<typeof v>): Scene3DObjectV1 =>
  ({ id, label, kind, center, size, palette, ...(rotation ? { rotation } : {}) });
const t = (id: string, kind: Scene3DTargetV1["kind"], label: string, objectId: string, element?: string, detail?: string): Scene3DTargetV1 =>
  ({ id, kind, label, objectId, ...(element ? { element } : {}), ...(detail ? { detail } : {}) });

const base = (id: string, title: string, description: string, objects: Scene3DObjectV1[], targets: Scene3DTargetV1[]): Interactive3DSceneSpecV1 => ({
  version: 1,
  id,
  title,
  description,
  camera: { yaw: -0.65, pitch: 0.45, zoom: 1 },
  interaction: { rotate: true, zoom: true, select: true },
  objects,
  targets
});

export function scene3DPreset(key: Scene3DPresetKey, id = "scene-" + key): Interactive3DSceneSpecV1 {
  if (key === "cube") {
    const object = o("cube", "المكعب", "box", v(0, 0, 0), v(3, 3, 3), 2);
    return base(id, "مكعب تفاعلي", "مكعب هندسي يمكن تدويره واختيار أوجهه أو حوافه أو رؤوسه دلاليًا.", [object], [
      t("front", "face", "الوجه الأمامي", "cube", "front"), t("back", "face", "الوجه الخلفي", "cube", "back"),
      t("left", "face", "الوجه الأيسر", "cube", "left"), t("right", "face", "الوجه الأيمن", "cube", "right"),
      t("top", "face", "الوجه العلوي", "cube", "top"), t("bottom", "face", "الوجه السفلي", "cube", "bottom"),
      ...["A","B","C","D","E","F","G","H"].map(x => t("v" + x, "vertex", "الرأس " + x, "cube", x)),
      ...["AB","BC","CD","DA","EF","FG","GH","HE","AE","BF","CG","DH"].map(x => t("e" + x, "edge", "الحافة " + x, "cube", x))
    ]);
  }
  if (key === "pyramid") {
    const object = o("pyramid", "الهرم", "pyramid", v(0, 0, 0), v(3.4, 3.2, 3.4), 4);
    return base(id, "هرم رباعي تفاعلي", "هرم رباعي منتظم تقريبًا مع أهداف دلالية للأوجه والحواف والرؤوس.", [object], [
      t("base", "face", "القاعدة", "pyramid", "base"),
      t("sideAB", "face", "الوجه الجانبي AB", "pyramid", "sideAB"),
      t("sideBC", "face", "الوجه الجانبي BC", "pyramid", "sideBC"),
      t("sideCD", "face", "الوجه الجانبي CD", "pyramid", "sideCD"),
      t("sideDA", "face", "الوجه الجانبي DA", "pyramid", "sideDA"),
      ...["A","B","C","D","E"].map(x => t("v" + x, "vertex", "الرأس " + x, "pyramid", x)),
      ...["AB","BC","CD","DA","AE","BE","CE","DE"].map(x => t("e" + x, "edge", "الحافة " + x, "pyramid", x))
    ]);
  }
  if (key === "heart") {
    const objects = [
      o("leftVentricle", "البطين الأيسر", "ellipsoid", v(-0.45, -0.55, 0), v(1.5, 2.2, 1.25), 6, v(0,0,-0.18)),
      o("rightVentricle", "البطين الأيمن", "ellipsoid", v(0.55, -0.45, 0.12), v(1.35, 1.95, 1.1), 5, v(0,0,0.16)),
      o("leftAtrium", "الأذين الأيسر", "ellipsoid", v(-0.55, 0.75, -0.08), v(1.1, 1.05, 1.0), 6),
      o("rightAtrium", "الأذين الأيمن", "ellipsoid", v(0.62, 0.78, 0.08), v(1.1, 1.05, 1.0), 5),
      o("aorta", "الشريان الأبهر", "cylinder", v(-0.1, 1.55, 0), v(0.48, 1.45, 0.48), 3, v(0,0,0.08)),
      o("pulmonary", "الشريان الرئوي", "cylinder", v(0.55, 1.35, 0.25), v(0.38, 1.25, 0.38), 2, v(0,0,-0.25))
    ];
    return base(id, "القلب — نموذج تعليمي مبسّط", "نموذج تركيبي مبسّط يوضّح الحجرات الأربع وبعض الأوعية الكبرى لاستخدامه في أسئلة تحديد الأجزاء.", objects,
      objects.map(x => t(x.id, "object", x.label, x.id)));
  }
  if (key === "torso") {
    const objects = [
      o("leftLung", "الرئة اليسرى", "ellipsoid", v(-0.75, 0.55, 0), v(1.05, 2.15, 0.8), 2, v(0,0,-0.08)),
      o("rightLung", "الرئة اليمنى", "ellipsoid", v(0.75, 0.55, 0), v(1.05, 2.15, 0.8), 2, v(0,0,0.08)),
      o("heart", "القلب", "ellipsoid", v(-0.08, 0.15, 0.52), v(0.95, 1.15, 0.7), 6, v(0,0,-0.2)),
      o("liver", "الكبد", "ellipsoid", v(0.58, -1.05, 0.1), v(1.8, 0.8, 0.75), 4, v(0,0,0.12)),
      o("stomach", "المعدة", "ellipsoid", v(-0.62, -1.0, 0.18), v(0.95, 1.0, 0.7), 3, v(0,0,-0.22))
    ];
    return base(id, "أعضاء رئيسية في جذع جسم الإنسان", "نموذج تعليمي مبسّط لتحديد أعضاء رئيسية داخل الجذع؛ ليس نموذجًا تشريحيًا سريريًا.", objects,
      objects.map(x => t(x.id, "object", x.label, x.id)));
  }
  const objects = [
    o("oxygen", "ذرة الأكسجين", "sphere", v(0, 0, 0), v(1.25, 1.25, 1.25), 6),
    o("hydrogenLeft", "ذرة هيدروجين", "sphere", v(-1.25, -0.75, 0), v(0.72, 0.72, 0.72), 1),
    o("hydrogenRight", "ذرة هيدروجين", "sphere", v(1.25, -0.75, 0), v(0.72, 0.72, 0.72), 1),
    o("bondLeft", "رابطة", "cylinder", v(-0.62, -0.38, 0), v(0.18, 1.5, 0.18), 7, v(0,0,-0.72)),
    o("bondRight", "رابطة", "cylinder", v(0.62, -0.38, 0), v(0.18, 1.5, 0.18), 7, v(0,0,0.72))
  ];
  return base(id, "جزيء ماء H₂O", "تمثيل ثلاثي الأبعاد تعليمي مبسّط لذرة أكسجين وذرتي هيدروجين.", objects, [
    t("oxygen", "object", "ذرة الأكسجين", "oxygen"),
    t("hydrogenLeft", "object", "ذرة الهيدروجين اليسرى", "hydrogenLeft"),
    t("hydrogenRight", "object", "ذرة الهيدروجين اليمنى", "hydrogenRight")
  ]);
}

export const freshScene3DId = (prefix = "scene") => prefix + "-" + Math.random().toString(36).slice(2, 8);
