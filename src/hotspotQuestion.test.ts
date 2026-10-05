import { describe, expect, it } from "vitest";
import {
  HOTSPOT_FAIL_CLOSED, HOTSPOT_LIMITS, bindHotspotAnswerToQuestion, defaultHotspotAnswerKey, defaultHotspotConfig, evaluateHotspot, isHotspotAnswerAnswered,
  normalizeHotspotAnswer, projectHotspotConfigForStudent, scoreHotspot, validateHotspotAnswerKey, validateHotspotConfig, validateHotspotQuestion
} from "./hotspotQuestion";

// Phase 19D — hotspot@1 («تحديد منطقة على صورة»). Public config under `hotspot` = { v: 1, mode, selections, alt } (the image is the
// question's canonical `image`); the PRIVATE key under `answer` = { scoring, regions: [{ id, shape }] } (target geometry never reaches a
// student). In multiple mode the public `selections` IS the exact expected target count (intentionally public: the student must know how
// many places to mark, and capping the selections at that count prevents click farming without penalty scoring). Grading = maximum
// one-to-one matching of the student's normalized points to the targets (a point satisfies at most one target, duplicates never earn
// repeated credit, overlapping targets are resolved optimally and order-independently). Malformed PUBLISHED authority ⇒ 0 + manual
// review; a malformed STUDENT response under a valid contract ⇒ an ordinary incorrect answer. Fail-first on e0ec8e2 (no module).
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const IMG = { exists: true, visible: true, assets: [{ dataUrl: "data:image/png;base64,iVBORw0KGgo=", origin: "uploaded", contentType: "image/png" }] };
const ALT = "مخطط شبكة يظهر فيه موجّه ومبدّل وحاسوبان";
const CFG1 = { v: 1, mode: "single", selections: 1, alt: ALT };
const KEY1 = { scoring: "allOrNothing", regions: [{ id: "router", shape: { kind: "rect", x: 0.1, y: 0.1, width: 0.2, height: 0.2 } }] };
const CFGM = { v: 1, mode: "multiple", selections: 3, alt: ALT };
const KEYM = { scoring: "proportional", regions: [{ id: "r1", shape: { kind: "rect", x: 0.1, y: 0.1, width: 0.2, height: 0.2 } }, { id: "c1", shape: { kind: "circle", cx: 0.6, cy: 0.3, r: 0.1 } }, { id: "p1", shape: { kind: "polygon", points: [{ x: 0.4, y: 0.6 }, { x: 0.7, y: 0.6 }, { x: 0.55, y: 0.9 }] } }] };
const IN = { r1: { x: 0.2, y: 0.2 }, c1: { x: 0.62, y: 0.31 }, p1: { x: 0.55, y: 0.7 }, none: { x: 0.95, y: 0.05 } };
const pts = (...p: { x: number; y: number }[]) => ({ kind: "hotspot", points: p });
const score = (cfg: unknown, key: unknown, response: unknown, image: unknown = IMG, maxMarks = 3) => scoreHotspot({ config: cfg, answerKey: key, image, response, maxMarks });
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r.issues ?? []).map(i => i.code));
const node = (over: Record<string, unknown> = {}) => ({ examQuestionId: "h1", presentationType: "hotspot", questionTypeVersion: 1, text: "انقر على الموجّه.", marks: 3, image: clone(IMG), hotspot: clone(CFGM), answer: clone(KEYM), ...over });

describe("19D hotspot — public config", () => {
  it("valid single / multiple configs; defaults are explicit (and block finalization until the teacher completes them)", () => {
    expect(validateHotspotConfig(CFG1)).toEqual({ ok: true, config: CFG1, issues: [] });
    expect(validateHotspotConfig(CFGM)).toEqual({ ok: true, config: CFGM, issues: [] });
    expect(validateHotspotConfig({ ...CFGM, alt: "  " + ALT + "  " })).toMatchObject({ ok: true, config: { alt: ALT } });
    expect(defaultHotspotConfig()).toEqual({ v: 1, mode: "single", selections: 1, alt: "" });
    expect(defaultHotspotAnswerKey()).toEqual({ scoring: "allOrNothing", regions: [] });
    const v = validateHotspotQuestion({ ...node(), hotspot: defaultHotspotConfig(), answer: defaultHotspotAnswerKey() }).map(i => i.code);
    expect(v).toContain("HOTSPOT_ALT_INVALID"); expect(v).toContain("HOTSPOT_REGIONS_INVALID");
  });
  it("refuses unknown / prototype keys, other versions, unknown modes, inconsistent selections and a missing or oversized description", () => {
    const c = (raw: unknown) => codes(validateHotspotConfig(raw));
    expect(c({ ...CFGM, regions: KEYM.regions })).toEqual(["HOTSPOT_CONFIG_UNKNOWN_KEY"]);
    expect(c(JSON.parse(JSON.stringify(CFGM).replace("{", '{"__proto__":{"mode":"single"},')))).toEqual(["HOTSPOT_CONFIG_UNKNOWN_KEY"]);
    expect(c({ ...CFGM, v: 2 })).toEqual(["HOTSPOT_CONFIG_VERSION"]);
    expect(c({ ...CFGM, mode: "lasso" })).toEqual(["HOTSPOT_MODE_UNKNOWN"]);
    expect(c({ ...CFG1, selections: 2 })).toEqual(["HOTSPOT_SELECTIONS_INVALID"]);
    for (const s of [1, HOTSPOT_LIMITS.selections + 1, 2.5, "3", Number.NaN]) expect(c({ ...CFGM, selections: s }), String(s)).toEqual(["HOTSPOT_SELECTIONS_INVALID"]);
    expect(c({ ...CFGM, selections: HOTSPOT_LIMITS.selections })).toEqual([]);
    for (const alt of ["", "ab", 7, "x".repeat(501)]) expect(c({ ...CFGM, alt }), String(alt).slice(0, 10)).toEqual(["HOTSPOT_ALT_INVALID"]);
    for (const bad of [null, [], "hotspot"]) expect(c(bad)).toEqual(["HOTSPOT_CONFIG_MISSING"]);
  });
});

describe("19D hotspot — private key", () => {
  it("valid keys are normalized (canonical shapes); scoring is never defaulted", () => {
    expect(validateHotspotAnswerKey(KEYM, CFGM)).toEqual({ ok: true, key: KEYM, issues: [] });
    expect(validateHotspotAnswerKey(KEY1, CFG1)).toEqual({ ok: true, key: KEY1, issues: [] });
    const k = (raw: unknown, cfg: unknown = CFGM) => codes(validateHotspotAnswerKey(raw, cfg));
    expect(k({ regions: KEYM.regions })).toEqual(["HOTSPOT_SCORING_UNKNOWN"]);
    expect(k({ ...KEYM, scoring: "bonus" })).toEqual(["HOTSPOT_SCORING_UNKNOWN"]);
    expect(k({ ...KEYM, rubric: "x" })).toEqual(["HOTSPOT_ANSWER_KEY_INVALID"]);
    expect(k(null)).toEqual(["HOTSPOT_ANSWER_KEY_INVALID"]);
    expect(k(KEYM, { ...CFGM, v: 9 })).toEqual(["HOTSPOT_KEY_CONFIG_INVALID"]);
  });
  it("refuses empty / excessive / mismatched target lists, duplicate or invalid ids, malformed regions and invalid geometry", () => {
    const k = (regions: unknown, cfg: unknown = CFGM) => codes(validateHotspotAnswerKey({ scoring: "proportional", regions }, cfg));
    expect(k([])).toEqual(["HOTSPOT_REGIONS_INVALID"]);
    expect(k("r1")).toEqual(["HOTSPOT_REGIONS_INVALID"]);
    const many = Array.from({ length: HOTSPOT_LIMITS.regions + 1 }, (_, i) => ({ id: "t" + i, shape: { kind: "rect", x: 0.01 * (i % 50), y: 0.1, width: 0.01, height: 0.1 } }));
    expect(k(many, { ...CFGM, selections: HOTSPOT_LIMITS.selections })).toEqual(["HOTSPOT_REGIONS_INVALID"]);
    expect(k(KEYM.regions.slice(0, 2))).toEqual(["HOTSPOT_TARGET_COUNT"]);
    expect(k(KEYM.regions, CFG1)).toEqual(["HOTSPOT_TARGET_COUNT"]);
    expect(k([KEYM.regions[0], { ...KEYM.regions[1], id: "r1" }, KEYM.regions[2]])).toEqual(["HOTSPOT_REGION_ID_DUPLICATE"]);
    for (const id of ["1x", "__proto__", "constructor", "", "a b", "x".repeat(33), 5]) expect(k([{ ...KEYM.regions[0], id }, KEYM.regions[1], KEYM.regions[2]]), String(id)).toEqual(["HOTSPOT_REGION_ID_INVALID"]);
    expect(k([{ ...KEYM.regions[0], weight: 2 }, KEYM.regions[1], KEYM.regions[2]])).toEqual(["HOTSPOT_REGION_INVALID"]);
    for (const shape of [{ kind: "rect", x: 120, y: 80, width: 200, height: 100 }, { kind: "rect", x: 0.9, y: 0.1, width: 0.3, height: 0.1 }, { kind: "rect", x: 0.1, y: 0.1, width: 0, height: 0.2 }, { kind: "circle", cx: 0.5, cy: 0.5, r: -0.1 }, { kind: "circle", cx: 0.5, cy: 0.5, r: 0.9 }, { kind: "polygon", points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }] }, { kind: "polygon", points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.1 }, { x: 0.1, y: 0.5 }] }, { kind: "star" }])
      expect(k([KEYM.regions[0], KEYM.regions[1], { id: "p1", shape }]), JSON.stringify(shape)).toEqual(["HOTSPOT_REGION_SHAPE_INVALID"]);
  });
});

describe("19D hotspot — question validation (finalization) and student projection", () => {
  it("a complete question is valid; the canonical image is REQUIRED, visible, and an asset identity; unsupported versions block", () => {
    expect(validateHotspotQuestion(node())).toEqual([]);
    expect(validateHotspotQuestion(node({ image: undefined })).map(i => i.code)).toEqual(["VISUAL_IMAGE_MISSING"]);
    expect(validateHotspotQuestion(node({ image: { ...IMG, visible: false } })).map(i => i.code)).toEqual(["VISUAL_IMAGE_HIDDEN"]);
    expect(validateHotspotQuestion(node({ image: { ...IMG, assets: [{ dataUrl: "blob:https://app/1" }] } })).map(i => i.code)).toEqual(["VISUAL_IMAGE_ASSET_INVALID"]);
    expect(validateHotspotQuestion(node({ questionTypeVersion: 2 })).map(i => i.code)).toContain("HOTSPOT_VERSION_UNSUPPORTED");
    expect(validateHotspotQuestion(node({ answer: { ...KEYM, scoring: "x" } })).map(i => i.code)).toEqual(["HOTSPOT_SCORING_UNKNOWN"]);
  });
  it("the student projection is the strict public config only; a config smuggling target geometry is withheld entirely", () => {
    expect(projectHotspotConfigForStudent(CFGM)).toEqual(CFGM);
    expect(projectHotspotConfigForStudent({ ...CFGM, regions: KEYM.regions })).toBeNull();
    expect(projectHotspotConfigForStudent({ ...CFGM, targets: 3 })).toBeNull();
    expect(JSON.stringify(projectHotspotConfigForStudent(CFGM))).not.toMatch(/"r1"|"c1"|"p1"|shape|0\.6\b|regions/);
  });
});

describe("19D hotspot — authoritative scoring", () => {
  it("single: a point inside the target (boundary included) earns full marks; outside is an ordinary 0", () => {
    expect(score(CFG1, KEY1, pts({ x: 0.2, y: 0.2 }))).toEqual({ score: 3, correct: true, manualReview: false, parts: { correct: 1, total: 1 } });
    expect(score(CFG1, KEY1, pts({ x: 0.1, y: 0.3 }))).toEqual({ score: 3, correct: true, manualReview: false, parts: { correct: 1, total: 1 } });
    expect(score(CFG1, KEY1, pts({ x: 0.31, y: 0.2 }))).toEqual({ score: 0, correct: false, manualReview: false, parts: { correct: 0, total: 1 } });
    expect(score(CFG1, KEY1, pts({ x: 0.2, y: 0.2 }, { x: 0.25, y: 0.25 }))).toEqual({ score: 0, correct: false, manualReview: false, parts: { correct: 0, total: 1 } });
  });
  it("multiple + proportional: 2 of 3 distinct targets ⇒ 2/3 of the marks; all three ⇒ full; order of points never matters", () => {
    expect(score(CFGM, KEYM, pts(IN.r1, IN.c1))).toEqual({ score: 2, correct: false, manualReview: false, parts: { correct: 2, total: 3 } });
    expect(score(CFGM, KEYM, pts(IN.p1, IN.r1, IN.c1))).toEqual({ score: 3, correct: true, manualReview: false, parts: { correct: 3, total: 3 } });
    expect(score(CFGM, KEYM, pts(IN.c1, IN.r1))).toEqual(score(CFGM, KEYM, pts(IN.r1, IN.c1)));
    expect(score(CFGM, KEYM, pts(IN.r1, IN.c1, IN.none))).toEqual({ score: 2, correct: false, manualReview: false, parts: { correct: 2, total: 3 } });   // a wrong selection simply matches nothing
  });
  it("duplicate clicks never earn repeated credit; one click never satisfies two targets", () => {
    expect(score(CFGM, KEYM, pts(IN.r1, IN.r1, IN.r1)).parts).toEqual({ correct: 1, total: 3 });
    expect(score(CFGM, KEYM, pts(IN.r1, IN.r1, IN.r1)).score).toBe(1);
    const O = { scoring: "proportional", regions: [{ id: "a", shape: { kind: "rect", x: 0.1, y: 0.1, width: 0.4, height: 0.4 } }, { id: "b", shape: { kind: "rect", x: 0.3, y: 0.3, width: 0.4, height: 0.4 } }] };
    const C2 = { ...CFGM, selections: 2 };
    expect(score(C2, O, pts({ x: 0.35, y: 0.35 })).parts).toEqual({ correct: 1, total: 2 });
    expect(score(C2, O, pts({ x: 0.35, y: 0.35 }, { x: 0.15, y: 0.15 })).parts).toEqual({ correct: 2, total: 2 });
    expect(score(C2, { ...O, regions: [...O.regions].reverse() }, pts({ x: 0.15, y: 0.15 }, { x: 0.35, y: 0.35 })).parts).toEqual({ correct: 2, total: 2 });
  });
  it("multiple + allOrNothing: every target must be matched", () => {
    const AON = { ...KEYM, scoring: "allOrNothing" };
    expect(score(CFGM, AON, pts(IN.r1, IN.c1)).score).toBe(0);
    expect(score(CFGM, AON, pts(IN.r1, IN.c1, IN.none)).score).toBe(0);
    expect(score(CFGM, AON, pts(IN.r1, IN.c1, IN.p1))).toEqual({ score: 3, correct: true, manualReview: false, parts: { correct: 3, total: 3 } });
  });
  it("a malformed STUDENT response under a valid contract is an ordinary 0 (no manual review): wrong kind, pixels, NaN, too many points", () => {
    for (const r of [{ kind: "choice", index: 0 }, { kind: "hotspot", points: "0.2,0.2" }, pts({ x: 431, y: 287 }), pts({ x: Number.NaN, y: 0.2 }), pts({ x: "0.2", y: 0.2 } as never), pts(IN.r1, IN.c1, IN.p1, IN.none), { kind: "hotspot" }, null, undefined])
      expect(score(CFGM, KEYM, r), JSON.stringify(r)).toEqual({ score: 0, correct: false, manualReview: false, parts: { correct: 0, total: 3 } });
  });
  it("forged score / matched target ids / regions / correct flags in the response never change the grade", () => {
    const forged = { ...pts(IN.r1), score: 3, correct: true, matched: ["r1", "c1", "p1"], targetIds: ["r1", "c1", "p1"], regions: [{ id: "x", shape: { kind: "rect", x: 0, y: 0, width: 1, height: 1 } }], parts: { correct: 3, total: 3 } };
    expect(score(CFGM, KEYM, forged)).toEqual({ score: 1, correct: false, manualReview: false, parts: { correct: 1, total: 3 } });
    expect(score(CFGM, KEYM, { kind: "hotspot", points: [{ ...IN.r1, target: "c1" }, { x: 0.95, y: 0.95, target: "p1" }] }).parts).toEqual({ correct: 1, total: 3 });
  });
  it("malformed PUBLISHED authority ⇒ 0 + manual review (never partial credit): key, config, geometry, image", () => {
    const right = pts(IN.r1, IN.c1, IN.p1);
    for (const [cfg, key, image] of [[CFGM, { ...KEYM, scoring: "bonus" }, IMG], [CFGM, { ...KEYM, regions: KEYM.regions.slice(0, 2) }, IMG], [CFGM, { ...KEYM, regions: [KEYM.regions[0], KEYM.regions[1], { id: "p1", shape: { kind: "rect", x: 120, y: 80, width: 200, height: 100 } }] }, IMG], [{ ...CFGM, regions: [] }, KEYM, IMG], [CFGM, KEYM, null], [CFGM, KEYM, { ...IMG, visible: false }], [CFGM, null, IMG], [null, KEYM, IMG]] as [unknown, unknown, unknown][]) {
      const r = score(cfg, key, right, image);
      expect(r, JSON.stringify([cfg, key, image]).slice(0, 120)).toEqual({ score: 0, correct: false, manualReview: true, parts: { correct: 0, total: 0 } });
    }
    expect(HOTSPOT_FAIL_CLOSED).toEqual({ score: 0, correct: false, manualReview: true, parts: { correct: 0, total: 0 } });
  });
});

describe("19D hotspot — ingest binding (draft / submit) and answered state", () => {
  it("bound: rebuilt to exactly { kind, points: [{ x, y }] }; foreign root / point fields stripped; prototype keys never survive", () => {
    const r = bindHotspotAnswerToQuestion({ kind: "hotspot", points: [{ x: 0.2, y: 0.2, target: "r1" }], score: 3, matched: ["r1"], correct: true }, node());
    expect(r).toEqual({ ok: true, answer: { kind: "hotspot", points: [{ x: 0.2, y: 0.2 }] } });
    const p = bindHotspotAnswerToQuestion(JSON.parse('{"kind":"hotspot","points":[{"x":0.3,"y":0.4}],"__proto__":{"score":3}}'), node());
    expect(p).toEqual({ ok: true, answer: { kind: "hotspot", points: [{ x: 0.3, y: 0.4 }] } });
    expect(Object.getPrototypeOf(p.ok && p.answer)).toBe(Object.prototype);
    expect(bindHotspotAnswerToQuestion({ kind: "hotspot", points: [] }, node())).toEqual({ ok: true, answer: { kind: "hotspot", points: [] } });
  });
  it("bound: a wrong kind, an out-of-range / pixel / non-finite point or more points than the question allows is rejected; another type is a mismatch", () => {
    for (const a of [{ kind: "fields", values: {} }, { kind: "hotspot", points: [{ x: 1.2, y: 0.2 }] }, { kind: "hotspot", points: [{ x: 431, y: 287 }] }, { kind: "hotspot", points: [{ x: Number.NaN, y: 0.2 }] }, { kind: "hotspot", points: [IN.r1, IN.c1, IN.p1, IN.none] }, { kind: "hotspot", points: {} }])
      expect(bindHotspotAnswerToQuestion(a, node()), JSON.stringify(a)).toEqual({ ok: false, code: "HOTSPOT_ANSWER_INVALID" });
    expect(bindHotspotAnswerToQuestion({ kind: "hotspot", points: [IN.r1, IN.c1] }, node({ hotspot: CFG1, answer: KEY1 }))).toEqual({ ok: false, code: "HOTSPOT_ANSWER_INVALID" });
    expect(bindHotspotAnswerToQuestion(pts(IN.r1), { presentationType: "multipleChoice", text: "x" })).toEqual({ ok: false, code: "HOTSPOT_QUESTION_MISMATCH" });
    expect(bindHotspotAnswerToQuestion(pts(IN.r1), undefined)).toEqual({ ok: false, code: "HOTSPOT_QUESTION_MISMATCH" });
  });
  it("unbound normalization is shape / bounds only (≤ the global point limit); answered ⇔ at least one point", () => {
    expect(normalizeHotspotAnswer({ kind: "hotspot", points: [IN.r1], x: 1 })).toEqual({ ok: true, answer: pts(IN.r1) });
    expect(normalizeHotspotAnswer({ kind: "hotspot", points: Array.from({ length: HOTSPOT_LIMITS.points + 1 }, () => IN.r1) })).toEqual({ ok: false, code: "HOTSPOT_ANSWER_INVALID" });
    expect(isHotspotAnswerAnswered(pts(IN.r1))).toBe(true);
    expect(isHotspotAnswerAnswered(pts())).toBe(false);
    expect(isHotspotAnswerAnswered({ kind: "hotspot" })).toBe(false);
  });
});

describe("19D hotspot — teacher review evaluation", () => {
  it("per target matched / unmatched and per point the target it satisfied (maximum matching); invalid authority is explicit", () => {
    const e = evaluateHotspot(CFGM, KEYM, IMG, pts(IN.c1, IN.none, IN.c1));
    expect(e).toEqual({ ok: true, matched: 1, total: 3, targets: [{ id: "r1", index: 1, shape: KEYM.regions[0].shape, matched: false }, { id: "c1", index: 2, shape: KEYM.regions[1].shape, matched: true }, { id: "p1", index: 3, shape: KEYM.regions[2].shape, matched: false }], points: [{ x: 0.62, y: 0.31, target: "c1" }, { x: 0.95, y: 0.05, target: null }, { x: 0.62, y: 0.31, target: null }] });
    expect(evaluateHotspot(CFGM, { ...KEYM, scoring: "x" }, IMG, pts()).ok).toBe(false);
    expect(evaluateHotspot(CFGM, KEYM, IMG, { kind: "text", value: "x" })).toMatchObject({ ok: true, matched: 0, points: [] });
  });
});
