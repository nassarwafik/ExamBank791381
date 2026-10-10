import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  MESH_PART_SELECTION_FAIL_CLOSED, MESH_PART_SELECTION_LIMITS, bindMeshPartSelectionAnswerToQuestion, evaluateMeshPartSelection,
  isMeshPartSelectionAnswerAnswered, meshNeutralPartLabel, normalizeMeshPartSelectionAnswer, projectMeshPartSelectionConfigForStudent,
  scoreMeshPartSelection, validateMeshPartSelectionAnswerKey, validateMeshPartSelectionConfig, validateMeshPartSelectionQuestion
} from "./meshPartSelectionQuestion";
import { MESH_LIBRARY } from "./meshModels/meshAssetCatalog";
import { draftFromLibrary } from "./meshModels/meshModelDraft";
import { QUESTION_TYPE_CATALOG } from "./questionTypeCatalog";
import { validateQuestionTypeNode } from "./questionTypeValidation";
import { answered } from "./answerState";

// Phase 21D-B.3 — meshPartSelection@1 domain authority: one shared module (compiled verbatim to the API) validates the config and the
// private key, binds a student's answer to the published model, projects the student view and scores. These tests pin each decision.
const heart = MESH_LIBRARY.find(a => a.id === "human-heart-bp3d")!;
const LABELLED = ["rightAtrium", "leftAtrium", "rightVentricle", "leftVentricle"];
function model(ids: string[] = LABELLED, id = "heartQ1") {
  const m = draftFromLibrary(heart, id);
  return { ...m, parts: m.parts.filter(p => ids.includes(p.id)).map(p => ({ ...p, description: "وصف " + p.label })) };
}
const cfg = (over: Record<string, unknown> = {}) => ({ v: 1, model: model(), mode: "multiple", maxSelections: 2, ...over });
const single = (over: Record<string, unknown> = {}) => cfg({ mode: "single", maxSelections: 1, ...over });
const ans = (parts: string[], modelId = "heartQ1") => ({ kind: "meshPartSelection", modelId, parts });
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r.issues ?? []).map(i => i.code));

describe("21D-B.3 meshPartSelection@1 — catalog identity", () => {
  it("is an additive production type: auto-graded, interactive, partial credit, never a compound/composite part", () => {
    const d = QUESTION_TYPE_CATALOG.find(x => x.key === "meshPartSelection")!;
    expect(d).toMatchObject({ version: 1, category: "interactive", gradingMode: "auto", legacy: false, responseKinds: ["meshPartSelection"] });
    expect(d.capabilities).toMatchObject({ autoGrading: true, partialCredit: true, interactive: true, compoundPart: false, manualGrading: false, requiresImage: false });
    const keys = QUESTION_TYPE_CATALOG.map(x => x.key);
    expect(keys.indexOf("meshPartSelection")).toBe(keys.indexOf("scene3DSelection") + 1);
  });
});

describe("21D-B.3 config validation", () => {
  it("accepts a library model with labelled parts and returns the canonical config", () => {
    const r = validateMeshPartSelectionConfig(cfg({ label: "  اختر حجرتي القلب السفليتين.  ", hideLabels: true }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config).toMatchObject({ v: 1, mode: "multiple", maxSelections: 2, label: "اختر حجرتي القلب السفليتين.", hideLabels: true });
    expect(r.parts.map(p => p.id)).toEqual(LABELLED);
  });
  it.each([
    ["missing", undefined, "MESH_SELECTION_CONFIG_MISSING"],
    ["array", [], "MESH_SELECTION_CONFIG_MISSING"],
    ["unknown key", cfg({ correct: ["leftVentricle"] }), "MESH_SELECTION_UNKNOWN_KEY"],
    ["version", cfg({ v: 2 }), "MESH_SELECTION_VERSION"],
    ["mode", cfg({ mode: "any" }), "MESH_SELECTION_MODE_INVALID"],
    ["label html", cfg({ label: "<img src=x onerror=alert(1)>" }), "MESH_SELECTION_LABEL_INVALID"],
    ["label bidi", cfg({ label: "اختر‮الجزء" }), "MESH_SELECTION_LABEL_INVALID"],
    ["label blank", cfg({ label: "   " }), "MESH_SELECTION_LABEL_INVALID"],
    ["label too long", cfg({ label: "أ".repeat(MESH_PART_SELECTION_LIMITS.labelChars + 1) }), "MESH_SELECTION_LABEL_INVALID"],
    ["hideLabels false", cfg({ hideLabels: false }), "MESH_SELECTION_HIDE_LABELS_INVALID"],
    ["one part", cfg({ model: model(["leftVentricle"]), maxSelections: 1 }), "MESH_SELECTION_PARTS_TOO_FEW"],
    ["max above parts", cfg({ maxSelections: 5 }), "MESH_SELECTION_MAX_INVALID"],
    ["max zero", cfg({ maxSelections: 0 }), "MESH_SELECTION_MAX_INVALID"],
    ["max fractional", cfg({ maxSelections: 1.5 }), "MESH_SELECTION_MAX_INVALID"],
    ["single with max 2", single({ maxSelections: 2 }), "MESH_SELECTION_MAX_INVALID"],
    ["model with a forged library hash", cfg({ model: { ...model(), asset: { ...model().asset, sha256: "0".repeat(64) } } }), "MESH_SELECTION_MODEL_INVALID"],
    ["model with an unlabelled source part", cfg({ model: { ...model(), parts: [...model().parts, { id: "notAPart", label: "x" }] } }), "MESH_SELECTION_MODEL_INVALID"],
    ["model with an external URL", cfg({ model: { ...model(), asset: { source: "url", url: "https://evil.example/m.glb" } } }), "MESH_SELECTION_MODEL_INVALID"]
  ])("rejects %s", (_n, raw, code) => {
    expect(codes(validateMeshPartSelectionConfig(raw))).toContain(code);
  });
  it("is total on hostile input (prototype keys, getters that throw are never reached)", () => {
    const proto = JSON.parse('{"v":1,"__proto__":{"x":1},"mode":"single","maxSelections":1}');
    expect(validateMeshPartSelectionConfig(proto).ok).toBe(false);
    expect(validateMeshPartSelectionConfig(Object.create({ v: 1 })).ok).toBe(false);
  });
});

describe("21D-B.3 private answer key", () => {
  it("accepts a key over labelled parts and canonicalises it to the model's part order", () => {
    const r = validateMeshPartSelectionAnswerKey({ scoring: "partial", correct: ["leftVentricle", "rightVentricle"] }, cfg());
    expect(r).toMatchObject({ ok: true, key: { scoring: "partial", correct: ["rightVentricle", "leftVentricle"] } });
  });
  it.each([
    ["missing", undefined, cfg(), "MESH_SELECTION_KEY_INVALID"],
    ["extra field", { scoring: "allOrNothing", correct: ["leftVentricle"], tolerance: 1 }, cfg(), "MESH_SELECTION_KEY_INVALID"],
    ["scoring", { scoring: "best", correct: ["leftVentricle"] }, cfg(), "MESH_SELECTION_SCORING_UNKNOWN"],
    ["partial on single", { scoring: "partial", correct: ["leftVentricle"] }, single(), "MESH_SELECTION_SCORING_UNKNOWN"],
    ["empty", { scoring: "allOrNothing", correct: [] }, cfg(), "MESH_SELECTION_KEY_EMPTY"],
    ["duplicate", { scoring: "allOrNothing", correct: ["leftVentricle", "leftVentricle"] }, cfg(), "MESH_SELECTION_KEY_DUPLICATE"],
    ["unlabelled part", { scoring: "allOrNothing", correct: ["aorta"] }, cfg(), "MESH_SELECTION_KEY_UNKNOWN_PART"],
    ["two answers on single", { scoring: "allOrNothing", correct: ["leftVentricle", "rightVentricle"] }, single(), "MESH_SELECTION_KEY_SINGLE"],
    ["unreachable", { scoring: "allOrNothing", correct: ["rightAtrium", "leftAtrium", "leftVentricle"] }, cfg(), "MESH_SELECTION_KEY_UNREACHABLE"],
    ["non-string ids", { scoring: "allOrNothing", correct: [1] }, cfg(), "MESH_SELECTION_KEY_INVALID"],
    ["invalid config", { scoring: "allOrNothing", correct: ["leftVentricle"] }, cfg({ v: 9 }), "MESH_SELECTION_KEY_CONFIG_INVALID"]
  ])("rejects %s", (_n, key, config, code) => {
    expect(codes(validateMeshPartSelectionAnswerKey(key, config))).toContain(code);
  });
  it("the question validator reports config, key and version issues together; the registry routes meshPartSelection@1 to it", () => {
    const node = { presentationType: "meshPartSelection", meshPartSelection: cfg(), answer: { scoring: "allOrNothing", correct: ["leftVentricle"] } };
    expect(validateMeshPartSelectionQuestion(node)).toEqual([]);
    expect(validateMeshPartSelectionQuestion({ ...node, questionTypeVersion: 2 }).map(i => i.code)).toContain("MESH_SELECTION_VERSION_UNSUPPORTED");
    expect(validateMeshPartSelectionQuestion({ ...node, answer: { scoring: "allOrNothing", correct: [] } }).map(i => i.code)).toEqual(["MESH_SELECTION_KEY_EMPTY"]);
    expect(validateQuestionTypeNode({ ...node, answer: { scoring: "allOrNothing", correct: ["aorta"] } }, "meshPartSelection", 1).map(i => i.code)).toContain("MESH_SELECTION_KEY_UNKNOWN_PART");
    expect(validateQuestionTypeNode(node, "meshPartSelection", 1)).toEqual([]);
    expect(validateQuestionTypeNode(node, "meshPartSelection", 2).map(i => i.code)).toEqual(["UNSUPPORTED_QUESTION_TYPE_VERSION"]);
    expect(validateQuestionTypeNode(node, "meshPartSelection", 1, { part: true }).map(i => i.code)).toContain("TYPE_NOT_COMPOUND_CAPABLE");
  });
});

describe("21D-B.3 student projection", () => {
  it("projects the canonical config unchanged when labels are shown — never the key", () => {
    const raw = cfg();
    const p = projectMeshPartSelectionConfigForStudent(raw)!;
    expect(p.model.parts.map(x => x.label)).toEqual(raw.model.parts.map(x => x.label));
    expect(JSON.stringify(p)).not.toMatch(/correct|scoring|answer/);
  });
  it("hideLabels replaces every label with a neutral ordinal and drops part descriptions (ids stay: they are the answer vocabulary)", () => {
    const raw = cfg({ hideLabels: true });
    const p = projectMeshPartSelectionConfigForStudent(raw)!;
    expect(p.model.parts).toEqual(LABELLED.map((id, i) => ({ id, label: meshNeutralPartLabel(i) })));
    expect(meshNeutralPartLabel(0)).toBe("الجزء ١");
    expect(meshNeutralPartLabel(11)).toBe("الجزء ١٢");
    const json = JSON.stringify(p);
    for (const part of raw.model.parts) { expect(json).not.toContain(part.label); expect(json).not.toContain(part.description); }
  });
  it("an invalid config projects to null (the question is withheld, never sent half-validated)", () => {
    expect(projectMeshPartSelectionConfigForStudent(cfg({ mode: "x" }))).toBeNull();
    expect(projectMeshPartSelectionConfigForStudent({ ...cfg(), secret: 1 })).toBeNull();
  });
});

describe("21D-B.3 answer shape and binding", () => {
  it("normalizes the exact shape and rejects anything else", () => {
    expect(normalizeMeshPartSelectionAnswer(ans(["leftVentricle"]))).toEqual({ ok: true, answer: ans(["leftVentricle"]) });
    expect(normalizeMeshPartSelectionAnswer({ ...ans(["leftVentricle"]), score: 1 })).toMatchObject({ ok: false, code: "MESH_SELECTION_ANSWER_INVALID" });
    expect(normalizeMeshPartSelectionAnswer({ ...ans([]), kind: "scene3DSelection" })).toMatchObject({ ok: false });
    expect(normalizeMeshPartSelectionAnswer(ans(["leftVentricle"], "bad id!"))).toMatchObject({ ok: false, code: "MESH_SELECTION_ANSWER_INVALID" });
    expect(normalizeMeshPartSelectionAnswer(ans(["__proto__"]))).toMatchObject({ ok: false, code: "MESH_SELECTION_ANSWER_INVALID" });
    expect(normalizeMeshPartSelectionAnswer(ans(["1x"]))).toMatchObject({ ok: false, code: "MESH_SELECTION_ANSWER_INVALID" });
    expect(normalizeMeshPartSelectionAnswer(ans(["a", "a"]))).toMatchObject({ ok: false, code: "MESH_SELECTION_DUPLICATE" });
    expect(normalizeMeshPartSelectionAnswer(ans(Array.from({ length: 65 }, (_, i) => "p" + i)))).toMatchObject({ ok: false, code: "MESH_SELECTION_TOO_MANY" });
  });
  it("binds to the published model: own parts only, within the limit, same model, canonical order", () => {
    const q = { presentationType: "meshPartSelection", meshPartSelection: cfg() };
    expect(bindMeshPartSelectionAnswerToQuestion(ans(["leftVentricle", "rightAtrium"]), q)).toEqual({ ok: true, answer: ans(["rightAtrium", "leftVentricle"]) });
    expect(bindMeshPartSelectionAnswerToQuestion(ans(["aorta"]), q)).toMatchObject({ ok: false, code: "MESH_SELECTION_PART_UNKNOWN" });
    expect(bindMeshPartSelectionAnswerToQuestion(ans(["rightAtrium", "leftAtrium", "leftVentricle"]), q)).toMatchObject({ ok: false, code: "MESH_SELECTION_TOO_MANY" });
    expect(bindMeshPartSelectionAnswerToQuestion(ans(["leftVentricle"], "otherModel"), q)).toMatchObject({ ok: false, code: "MESH_SELECTION_MODEL_MISMATCH" });
    expect(bindMeshPartSelectionAnswerToQuestion(ans([]), q)).toEqual({ ok: true, answer: ans([]) });
  });
  it("answered() counts a non-empty selection only (shared helper and the student answer state agree)", () => {
    expect(isMeshPartSelectionAnswerAnswered(ans([]))).toBe(false);
    expect(isMeshPartSelectionAnswerAnswered(ans(["leftVentricle"]))).toBe(true);
    expect(answered(ans([]) as never)).toBe(false);
    expect(answered(ans(["leftVentricle"]) as never)).toBe(true);
  });
});

describe("21D-B.3 server-authoritative scoring", () => {
  const score = (config: unknown, key: unknown, parts: string[] | unknown, maxMarks = 4) =>
    scoreMeshPartSelection({ config, answerKey: key, response: Array.isArray(parts) ? ans(parts as string[]) : parts, maxMarks });
  const AON = { scoring: "allOrNothing", correct: ["rightVentricle", "leftVentricle"] };
  const PART = { scoring: "partial", correct: ["rightVentricle", "leftVentricle"] };
  it("all-or-nothing: exact set → full marks, any miss or extra → 0", () => {
    expect(score(cfg(), AON, ["leftVentricle", "rightVentricle"])).toEqual({ score: 4, correct: true, manualReview: false, parts: { correct: 2, total: 2 } });
    expect(score(cfg(), AON, ["leftVentricle"])).toMatchObject({ score: 0, correct: false, manualReview: false, parts: { correct: 1, total: 2 } });
    expect(score(cfg(), AON, ["leftVentricle", "leftAtrium"])).toMatchObject({ score: 0, correct: false });
  });
  it("partial: max × hits / |selected ∪ correct| — guessing everything never pays", () => {
    expect(score(cfg(), PART, ["leftVentricle"]).score).toBeCloseTo(2);
    expect(score(cfg(), PART, ["leftVentricle", "leftAtrium"]).score).toBeCloseTo(4 / 3);
    expect(score(cfg({ maxSelections: 4 }), PART, LABELLED).score).toBeCloseTo(2);
    expect(score(cfg(), PART, ["rightAtrium", "leftAtrium"]).score).toBe(0);
  });
  it("single choice: the one correct part", () => {
    const key = { scoring: "allOrNothing", correct: ["leftVentricle"] };
    expect(score(single(), key, ["leftVentricle"]).score).toBe(4);
    expect(score(single(), key, ["rightVentricle"]).score).toBe(0);
  });
  it("a blank answer scores 0 without review; a forged answer (other model, unknown part, over the limit) scores 0 without review", () => {
    expect(score(cfg(), AON, [])).toMatchObject({ score: 0, manualReview: false });
    expect(score(cfg(), AON, ans(["leftVentricle"], "otherModel"))).toMatchObject({ score: 0, manualReview: false });
    expect(score(cfg(), AON, ["aorta"])).toMatchObject({ score: 0, manualReview: false });
    expect(score(cfg(), AON, LABELLED)).toMatchObject({ score: 0, manualReview: false });
    expect(score(cfg(), AON, { kind: "meshPartSelection", modelId: "heartQ1", parts: "leftVentricle" })).toMatchObject({ score: 0, manualReview: false });
  });
  it("FAIL CLOSED: an unclassifiable config or key is never auto-scored — 0 with manual review, even for a 'perfect' answer", () => {
    for (const [c, k] of [[cfg({ v: 2 }), AON], [undefined, AON], [cfg(), { scoring: "x", correct: ["leftVentricle"] }], [cfg(), { scoring: "allOrNothing", correct: ["aorta"] }], [cfg(), undefined]] as const) {
      const r = score(c, k, ["leftVentricle", "rightVentricle"]);
      expect(r).toEqual({ ...MESH_PART_SELECTION_FAIL_CLOSED, parts: { correct: 0, total: 0 } });
      expect(r.manualReview).toBe(true);
    }
  });
  it("bounded marks: NaN / negative maxMarks never produce a negative or NaN score; scoring is pure (repeatable)", () => {
    expect(score(cfg(), AON, ["leftVentricle", "rightVentricle"], Number.NaN).score).toBe(0);
    expect(score(cfg(), AON, ["leftVentricle", "rightVentricle"], -3).score).toBe(0);
    const a = score(cfg(), PART, ["leftVentricle"]), b = score(cfg(), PART, ["leftVentricle"]);
    expect(a).toEqual(b);
  });
  it("teacher evaluation marks every labelled part with the real label", () => {
    const ev = evaluateMeshPartSelection(cfg({ hideLabels: true }), PART, ans(["leftVentricle", "leftAtrium"]));
    expect(ev.ok).toBe(true);
    if (!ev.ok) return;
    expect(ev).toMatchObject({ correct: 1, total: 2, exact: false });
    expect(ev.results.map(r => [r.id, r.mark])).toEqual([["rightAtrium", null], ["leftAtrium", "incorrect"], ["rightVentricle", "missed"], ["leftVentricle", "correct"]]);
    expect(ev.results.find(r => r.id === "leftVentricle")!.label).toBe("البطين الأيسر");
    expect(evaluateMeshPartSelection(cfg(), { scoring: "allOrNothing", correct: [] }, ans([]))).toMatchObject({ ok: false });
  });
});

describe("21D-B.3 the API runs the same authority (generated shared build)", () => {
  it("the CJS build scores, binds and projects identically", () => {
    const req = createRequire(import.meta.url);
    const api = req("../api/src/lib/shared-finalization/meshPartSelectionQuestion.js");
    const PART = { scoring: "partial", correct: ["rightVentricle", "leftVentricle"] };
    for (const parts of [[], ["leftVentricle"], ["leftVentricle", "leftAtrium"], ["aorta"]]) {
      const input = { config: cfg(), answerKey: PART, response: ans(parts), maxMarks: 3 };
      expect(api.scoreMeshPartSelection(input)).toEqual(scoreMeshPartSelection(input));
    }
    const q = { meshPartSelection: cfg() };
    expect(api.bindMeshPartSelectionAnswerToQuestion(ans(["leftVentricle", "rightAtrium"]), q)).toEqual(bindMeshPartSelectionAnswerToQuestion(ans(["leftVentricle", "rightAtrium"]), q));
    expect(api.projectMeshPartSelectionConfigForStudent(cfg({ hideLabels: true }))).toEqual(projectMeshPartSelectionConfigForStudent(cfg({ hideLabels: true })));
  });
});
