import { describe, expect, it } from "vitest";
import {
  LABEL_DIAGRAM_FAIL_CLOSED, LABEL_DIAGRAM_LIMITS, bindLabelDiagramAnswerToQuestion, defaultLabelDiagramAnswerKey, defaultLabelDiagramConfig, evaluateLabelDiagram,
  projectLabelDiagramConfigForStudent, scoreLabelDiagram, validateLabelDiagramAnswerKey, validateLabelDiagramConfig, validateLabelDiagramQuestion
} from "./labelDiagramQuestion";

// Phase 19D — labelDiagram@1 («تسمية أجزاء الرسم»). Public config under `labelDiagram` = { v: 1, alt, zones: [{ id, shape, name? }],
// labels: [{ id, text }], allowReuse } — the drop ZONES are public (the student must see where labels go); the correct mapping lives ONLY
// under `answer` = { scoring, correctLabelByZone }. The student answer is the existing `fields` Answer (zone id → label id), like matrix /
// categorization / inlineCloze. Malformed PUBLISHED authority ⇒ 0 + manual review; malformed STUDENT input ⇒ ordinary incorrect.
// Fail-first on e0ec8e2 (no module).
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const IMG = { exists: true, visible: true, assets: [{ id: "b1", origin: "bank", blobName: "bank/osi.png", contentType: "image/png" }] };
const CFG = {
  v: 1, alt: "مخطط طبقات نموذج OSI مع ثلاث مناطق فارغة", allowReuse: false,
  zones: [{ id: "z1", shape: { kind: "rect", x: 0.1, y: 0.1, width: 0.2, height: 0.1 }, name: "الطبقة العليا" }, { id: "z2", shape: { kind: "rect", x: 0.1, y: 0.3, width: 0.2, height: 0.1 } }, { id: "z3", shape: { kind: "circle", cx: 0.7, cy: 0.5, r: 0.1 } }],
  labels: [{ id: "l-app", text: "Application" }, { id: "l-net", text: "Network" }, { id: "l-phy", text: "Physical" }, { id: "l-ses", text: "Session" }]
};
const KEY = { scoring: "proportional", correctLabelByZone: { z1: "l-app", z2: "l-net", z3: "l-phy" } };
const fields = (values: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ kind: "fields", values, ...extra });
const score = (cfg: unknown, key: unknown, response: unknown, image: unknown = IMG, maxMarks = 3) => scoreLabelDiagram({ config: cfg, answerKey: key, image, response, maxMarks });
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r.issues ?? []).map(i => i.code));
const node = (over: Record<string, unknown> = {}) => ({ examQuestionId: "d1", presentationType: "labelDiagram", questionTypeVersion: 1, text: "سمِّ الطبقات.", marks: 3, image: clone(IMG), labelDiagram: clone(CFG), answer: clone(KEY), ...over });

describe("19D labelDiagram — public config", () => {
  it("valid config is returned canonically; defaults are explicit and block finalization", () => {
    expect(validateLabelDiagramConfig(CFG)).toEqual({ ok: true, config: CFG, issues: [] });
    expect(defaultLabelDiagramConfig()).toEqual({ v: 1, alt: "", allowReuse: false, zones: [], labels: [] });
    expect(defaultLabelDiagramAnswerKey()).toEqual({ scoring: "proportional", correctLabelByZone: {} });
    const v = validateLabelDiagramQuestion({ ...node(), labelDiagram: defaultLabelDiagramConfig(), answer: defaultLabelDiagramAnswerKey() }).map(i => i.code);
    expect(v).toContain("LABEL_ALT_INVALID"); expect(v).toContain("LABEL_ZONES_INVALID"); expect(v).toContain("LABEL_LABELS_INVALID");
  });
  it("refuses unknown / prototype keys, versions, malformed zones / labels, duplicates and invalid geometry", () => {
    const c = (over: Record<string, unknown>) => codes(validateLabelDiagramConfig({ ...clone(CFG), ...over }));
    expect(c({ correctLabelByZone: KEY.correctLabelByZone })).toEqual(["LABEL_CONFIG_UNKNOWN_KEY"]);
    expect(codes(validateLabelDiagramConfig(JSON.parse(JSON.stringify(CFG).replace("{", '{"__proto__":{"allowReuse":true},'))))).toEqual(["LABEL_CONFIG_UNKNOWN_KEY"]);
    expect(c({ v: 2 })).toEqual(["LABEL_CONFIG_VERSION"]);
    expect(c({ allowReuse: "yes" })).toEqual(["LABEL_REUSE_INVALID"]);
    expect(c({ alt: "" })).toEqual(["LABEL_ALT_INVALID"]);
    expect(c({ zones: [] })).toEqual(["LABEL_ZONES_INVALID"]);
    expect(c({ zones: Array.from({ length: LABEL_DIAGRAM_LIMITS.zones + 1 }, (_, i) => ({ id: "z" + i, shape: { kind: "circle", cx: 0.5, cy: 0.5, r: 0.05 } })) })).toEqual(["LABEL_ZONES_INVALID"]);
    expect(c({ zones: [CFG.zones[0], { ...CFG.zones[1], id: "z1" }] })).toEqual(["LABEL_ZONE_ID_DUPLICATE"]);
    for (const id of ["9z", "__proto__", "prototype", ""]) expect(c({ zones: [{ ...CFG.zones[0], id }] }), id).toEqual(["LABEL_ZONE_ID_INVALID"]);
    expect(c({ zones: [{ ...CFG.zones[0], correct: "l-app" }] })).toEqual(["LABEL_ZONE_INVALID"]);
    expect(c({ zones: [{ ...CFG.zones[0], name: "x".repeat(LABEL_DIAGRAM_LIMITS.nameChars + 1) }] })).toEqual(["LABEL_ZONE_INVALID"]);
    expect(c({ zones: [{ ...CFG.zones[0], shape: { kind: "rect", x: 0.9, y: 0.1, width: 0.3, height: 0.1 } }] })).toEqual(["LABEL_ZONE_SHAPE_INVALID"]);
    expect(c({ zones: [{ ...CFG.zones[0], shape: { kind: "circle", cx: 0.5, cy: 0.5, r: -1 } }] })).toEqual(["LABEL_ZONE_SHAPE_INVALID"]);
    expect(c({ labels: [] })).toEqual(["LABEL_LABELS_INVALID"]);
    expect(c({ labels: [...CFG.labels, { id: "l-app", text: "Transport" }] })).toEqual(["LABEL_LABEL_ID_DUPLICATE"]);
    expect(c({ labels: [...CFG.labels, { id: "l-x", text: " application " }] })).toEqual(["LABEL_TEXT_DUPLICATE"]);
    expect(c({ labels: [...CFG.labels, { id: "l-x", text: "  " }] })).toEqual(["LABEL_LABEL_INVALID"]);
    expect(c({ labels: [...CFG.labels, { id: "l-x", text: "x".repeat(LABEL_DIAGRAM_LIMITS.labelChars + 1) }] })).toEqual(["LABEL_LABEL_INVALID"]);
    expect(c({ labels: [...CFG.labels, { id: "l-x", text: "Transport", correct: true }] })).toEqual(["LABEL_LABEL_INVALID"]);
    expect(c({ labels: [...CFG.labels, { id: "constructor", text: "Transport" }] })).toEqual(["LABEL_LABEL_ID_INVALID"]);
  });
});

describe("19D labelDiagram — private key", () => {
  it("valid key; every zone exactly one known label; unknown zones / labels, prototype keys and reuse (when disabled) are refused", () => {
    expect(validateLabelDiagramAnswerKey(KEY, CFG)).toEqual({ ok: true, key: KEY, issues: [] });
    const k = (raw: unknown, cfg: unknown = CFG) => codes(validateLabelDiagramAnswerKey(raw, cfg));
    expect(k({ ...KEY, scoring: "bonus" })).toEqual(["LABEL_SCORING_UNKNOWN"]);
    expect(k({ correctLabelByZone: KEY.correctLabelByZone })).toEqual(["LABEL_SCORING_UNKNOWN"]);
    expect(k({ ...KEY, rubric: 1 })).toEqual(["LABEL_ANSWER_KEY_INVALID"]);
    expect(k({ ...KEY, correctLabelByZone: { z1: "l-app", z2: "l-net" } })).toEqual(["LABEL_KEY_MISSING_ZONE"]);
    expect(k({ ...KEY, correctLabelByZone: { ...KEY.correctLabelByZone, z9: "l-app" } })).toEqual(["LABEL_KEY_UNKNOWN_ZONE"]);
    expect(k({ ...KEY, correctLabelByZone: { ...KEY.correctLabelByZone, z3: "l-transport" } })).toEqual(["LABEL_KEY_UNKNOWN_LABEL"]);
    expect(k({ ...KEY, correctLabelByZone: { ...KEY.correctLabelByZone, z3: "l-app" } })).toEqual(["LABEL_KEY_REUSE"]);
    expect(k({ ...KEY, correctLabelByZone: { ...KEY.correctLabelByZone, z3: "l-app" } }, { ...CFG, allowReuse: true })).toEqual([]);
    expect(k({ ...KEY, correctLabelByZone: JSON.parse('{"z1":"l-app","z2":"l-net","z3":"l-phy","__proto__":"l-app"}') })).toEqual(["LABEL_ANSWER_KEY_INVALID"]);
    expect(k(KEY, { ...CFG, v: 3 })).toEqual(["LABEL_KEY_CONFIG_INVALID"]);
  });
});

describe("19D labelDiagram — question validation and student projection", () => {
  it("image required / visible / identity; version", () => {
    expect(validateLabelDiagramQuestion(node())).toEqual([]);
    expect(validateLabelDiagramQuestion(node({ image: undefined })).map(i => i.code)).toEqual(["VISUAL_IMAGE_MISSING"]);
    expect(validateLabelDiagramQuestion(node({ image: { exists: true, visible: true, assets: [{ origin: "bank", blobName: "../../etc" }] } })).map(i => i.code)).toEqual(["VISUAL_IMAGE_ASSET_INVALID"]);
    expect(validateLabelDiagramQuestion(node({ questionTypeVersion: 2 })).map(i => i.code)).toContain("LABEL_VERSION_UNSUPPORTED");
  });
  it("projection: zones and labels are public; the correct mapping is never part of it; a smuggling config is withheld", () => {
    expect(projectLabelDiagramConfigForStudent(CFG)).toEqual(CFG);
    expect(projectLabelDiagramConfigForStudent({ ...CFG, correctLabelByZone: KEY.correctLabelByZone })).toBeNull();
    expect(projectLabelDiagramConfigForStudent({ ...CFG, zones: [{ ...CFG.zones[0], label: "l-app" }] })).toBeNull();
  });
});

describe("19D labelDiagram — authoritative scoring", () => {
  it("proportional: correct zones / total zones; allOrNothing: all or zero", () => {
    expect(score(CFG, KEY, fields({ z1: "l-app", z2: "l-net", z3: "l-phy" }))).toEqual({ score: 3, correct: true, manualReview: false, parts: { correct: 3, total: 3 } });
    expect(score(CFG, KEY, fields({ z1: "l-app", z2: "l-ses", z3: "l-phy" }))).toEqual({ score: 2, correct: false, manualReview: false, parts: { correct: 2, total: 3 } });
    expect(score(CFG, KEY, fields({ z1: "l-app" }))).toEqual({ score: 1, correct: false, manualReview: false, parts: { correct: 1, total: 3 } });
    expect(score(CFG, { ...KEY, scoring: "allOrNothing" }, fields({ z1: "l-app", z2: "l-net" })).score).toBe(0);
    expect(score(CFG, { ...KEY, scoring: "allOrNothing" }, fields({ z1: "l-app", z2: "l-net", z3: "l-phy" })).score).toBe(3);
  });
  it("malformed STUDENT input ⇒ ordinary 0: unknown labels, reuse when disabled, non-string values, wrong kinds", () => {
    for (const r of [fields({ z1: "l-transport" }), fields({ z1: "l-app", z2: "l-app", z3: "l-app" }), fields({ z1: 7 }), fields({ z1: ["l-app"] }), { kind: "hotspot", points: [] }, { kind: "fields", values: "z1=l-app" }, null])
      expect(score(CFG, KEY, r), JSON.stringify(r)).toEqual({ score: 0, correct: false, manualReview: false, parts: { correct: 0, total: 3 } });
    expect(score({ ...CFG, allowReuse: true }, KEY, fields({ z1: "l-app", z2: "l-app", z3: "l-app" })).parts).toEqual({ correct: 1, total: 3 });
  });
  it("unknown (forged) zone ids are ignored; forged mapping / score fields never change the grade", () => {
    expect(score(CFG, KEY, fields({ z1: "l-app", ghost: "l-net" })).parts).toEqual({ correct: 1, total: 3 });
    expect(score(CFG, KEY, fields({ z1: "l-app" }, { score: 3, correct: true, correctLabelByZone: { z1: "l-app" }, parts: { correct: 3, total: 3 } })).score).toBe(1);
  });
  it("malformed PUBLISHED authority ⇒ 0 + manual review", () => {
    for (const [cfg, key, image] of [[CFG, { ...KEY, scoring: "x" }, IMG], [CFG, { ...KEY, correctLabelByZone: { ...KEY.correctLabelByZone, z3: "l-app" } }, IMG], [{ ...CFG, secret: 1 }, KEY, IMG], [CFG, KEY, null], [CFG, { ...KEY, correctLabelByZone: { z1: "l-app" } }, IMG]] as [unknown, unknown, unknown][])
      expect(score(cfg, key, fields({ z1: "l-app", z2: "l-net", z3: "l-phy" }), image)).toEqual({ score: 0, correct: false, manualReview: true, parts: { correct: 0, total: 0 } });
    expect(LABEL_DIAGRAM_FAIL_CLOSED).toEqual({ score: 0, correct: false, manualReview: true, parts: { correct: 0, total: 0 } });
  });
});

describe("19D labelDiagram — ingest binding", () => {
  it("unknown zones stripped, extra root fields dropped; unknown labels, reuse abuse, prototype keys and oversized maps rejected", () => {
    expect(bindLabelDiagramAnswerToQuestion(fields({ z1: "l-app", z2: "l-net", ghost: "l-phy", z3: "" }, { score: 3 }), node())).toEqual({ ok: true, answer: { kind: "fields", values: { z1: "l-app", z2: "l-net" } } });
    for (const a of [fields({ z1: "l-transport" }), fields({ z1: "l-app", z2: "l-app" }), fields(JSON.parse('{"z1":"l-app","__proto__":"l-net"}')), fields({ z1: 5 }), fields(Object.fromEntries(Array.from({ length: LABEL_DIAGRAM_LIMITS.responseKeys + 1 }, (_, i) => ["k" + i, "l-app"]))), { kind: "text", value: "x" }])
      expect(bindLabelDiagramAnswerToQuestion(a, node()).ok, JSON.stringify(a).slice(0, 60)).toBe(false);
    expect(bindLabelDiagramAnswerToQuestion(fields({ z1: "l-app", z2: "l-app" }), node())).toEqual({ ok: false, code: "LABEL_REUSE_NOT_ALLOWED" });
    expect(bindLabelDiagramAnswerToQuestion(fields({ z1: "l-transport" }), node())).toEqual({ ok: false, code: "LABEL_ANSWER_INVALID" });
    expect(bindLabelDiagramAnswerToQuestion(fields({ z1: "l-app", z2: "l-app" }), node({ labelDiagram: { ...clone(CFG), allowReuse: true } }))).toEqual({ ok: true, answer: fields({ z1: "l-app", z2: "l-app" }) });
  });
});

describe("19D labelDiagram — teacher review evaluation", () => {
  it("per zone: the student's label text, the correct label text and ✓ / ✗", () => {
    expect(evaluateLabelDiagram(CFG, KEY, IMG, { z1: "l-app", z2: "l-phy", ghost: "l-net" })).toEqual({
      ok: true, correct: 1, total: 3,
      results: [{ zoneId: "z1", index: 1, name: "الطبقة العليا", given: "Application", expected: "Application", ok: true }, { zoneId: "z2", index: 2, name: "", given: "Physical", expected: "Network", ok: false }, { zoneId: "z3", index: 3, name: "", given: "", expected: "Physical", ok: false }]
    });
    expect(evaluateLabelDiagram(CFG, { ...KEY, scoring: "x" }, IMG, {}).ok).toBe(false);
  });
});
