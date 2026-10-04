import { describe, it, expect } from "vitest";
import {
  INLINE_CLOZE_FAIL_CLOSED, INLINE_CLOZE_LIMITS, INLINE_CLOZE_SCORING_MODES, bindInlineClozeAnswerToQuestion, defaultInlineClozeAnswerKey, defaultInlineClozeConfig,
  evaluateInlineCloze, inlineClozeBlanks, normalizeClozeText, projectInlineClozeConfigForStudent, scoreInlineCloze, validateInlineClozeAnswerKey,
  validateInlineClozeConfig, validateInlineClozeQuestion
} from "./inlineClozeQuestion";

// Phase 19A — inlineCloze@1: the canonical, versioned contract of an inline completion passage (text + text blanks + dropdowns in
// arbitrary order). ONE strict validator owns validity (config AND private key); the scorer re-validates both before grading and
// fails closed (score 0, manual review) on a malformed contract; a malformed STUDENT response under a valid contract is an
// ordinary incorrect answer. New-function suite (fail-first on 91b1f3d8: the module does not exist).
const CFG = () => ({
  v: 1,
  segments: [
    { type: "text", text: "يعمل البروتوكول " },
    { type: "blank", id: "b1", control: "text" },
    { type: "text", text: " في الطبقة الثالثة، بينما عنوان MAC يعمل في " },
    { type: "blank", id: "b2", control: "dropdown", options: [{ id: "o1", label: "Physical" }, { id: "o2", label: "Data Link" }, { id: "o3", label: "Network" }] },
    { type: "text", text: "، والأمر المستخدم لعرض VLANs هو " },
    { type: "blank", id: "b3", control: "text" },
    { type: "text", text: "." }
  ]
});
const KEY = () => ({
  scoring: "proportional",
  blanks: { b1: { accepted: ["IP", "Internet Protocol"], caseSensitive: false }, b2: { correctOptionId: "o2" }, b3: { accepted: ["show vlan brief"], caseSensitive: true } }
});
const fields = (values: Record<string, unknown>) => ({ kind: "fields", values });
const score = (values: Record<string, unknown>, over: { config?: unknown; answerKey?: unknown; maxMarks?: number } = {}) =>
  scoreInlineCloze({ config: over.config ?? CFG(), answerKey: over.answerKey ?? KEY(), response: fields(values), maxMarks: over.maxMarks ?? 6 });
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r.issues ?? []).map(i => i.code));

describe("19A inlineCloze@1 — public contract (validateInlineClozeConfig)", () => {
  it("a mixed text / dropdown / text passage is valid and canonical (deep copy, deterministic order, stable ids)", () => {
    const raw = CFG();
    const r = validateInlineClozeConfig(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config).toEqual(CFG());
    expect(r.config).not.toBe(raw);
    expect(inlineClozeBlanks(r.config).map(b => [b.id, b.control, b.index])).toEqual([["b1", "text", 1], ["b2", "dropdown", 2], ["b3", "text", 3]]);
  });
  it("duplicate blank ids are rejected", () => {
    const c = CFG(); (c.segments[5] as { id: string }).id = "b1";
    expect(codes(validateInlineClozeConfig(c))).toContain("CLOZE_BLANK_ID_DUPLICATE");
  });
  it("unknown control type, unknown segment type and unknown fields are rejected (never silently dropped)", () => {
    const c1 = CFG(); (c1.segments[1] as { control: string }).control = "slider";
    expect(codes(validateInlineClozeConfig(c1))).toContain("CLOZE_CONTROL_UNKNOWN");
    const c2 = CFG(); (c2.segments as unknown[]).push({ type: "image", src: "x" });
    expect(codes(validateInlineClozeConfig(c2))).toContain("CLOZE_SEGMENT_INVALID");
    const c3 = CFG(); (c3.segments[1] as Record<string, unknown>).accepted = ["IP"];
    expect(codes(validateInlineClozeConfig(c3))).toContain("CLOZE_SEGMENT_INVALID");
    const c4 = { ...CFG(), answerKey: { b1: "IP" } };
    expect(codes(validateInlineClozeConfig(c4))).toContain("CLOZE_CONFIG_UNKNOWN_KEY");
    const c5 = CFG(); ((c5.segments[3] as { options: Record<string, unknown>[] }).options[0]).correct = true;
    expect(codes(validateInlineClozeConfig(c5))).toContain("CLOZE_OPTION_INVALID");
  });
  it("an empty dropdown, a one-option dropdown, duplicate option ids, an empty option label and duplicate labels are rejected", () => {
    const withOptions = (options: unknown[]) => { const c = CFG(); (c.segments[3] as { options: unknown[] }).options = options; return codes(validateInlineClozeConfig(c)); };
    expect(withOptions([])).toContain("CLOZE_DROPDOWN_OPTIONS_INVALID");
    expect(withOptions([{ id: "o1", label: "A" }])).toContain("CLOZE_DROPDOWN_OPTIONS_INVALID");
    expect(withOptions([{ id: "o1", label: "A" }, { id: "o1", label: "B" }])).toContain("CLOZE_OPTION_ID_DUPLICATE");
    expect(withOptions([{ id: "o1", label: "A" }, { id: "o2", label: "  " }])).toContain("CLOZE_OPTION_INVALID");
    expect(withOptions([{ id: "o1", label: "Data Link" }, { id: "o2", label: " data link " }])).toContain("CLOZE_OPTION_LABEL_DUPLICATE");
    expect(withOptions(Array.from({ length: INLINE_CLOZE_LIMITS.options + 1 }, (_, i) => ({ id: "o" + i, label: "L" + i })))).toContain("CLOZE_DROPDOWN_OPTIONS_INVALID");
  });
  it("structural refusals: missing / non-object / wrong version / no segments / no blanks / empty text segment / bad blank id", () => {
    expect(codes(validateInlineClozeConfig(undefined))).toContain("CLOZE_CONFIG_MISSING");
    expect(codes(validateInlineClozeConfig([]))).toContain("CLOZE_CONFIG_MISSING");
    expect(codes(validateInlineClozeConfig({ ...CFG(), v: 2 }))).toContain("CLOZE_CONFIG_VERSION");
    expect(codes(validateInlineClozeConfig({ v: 1, segments: [] }))).toContain("CLOZE_SEGMENTS_INVALID");
    expect(codes(validateInlineClozeConfig({ v: 1, segments: [{ type: "text", text: "لا فراغات" }] }))).toContain("CLOZE_NO_BLANKS");
    expect(codes(validateInlineClozeConfig({ v: 1, segments: [{ type: "text", text: "" }, { type: "blank", id: "b1", control: "text" }] }))).toContain("CLOZE_SEGMENT_INVALID");
    for (const id of ["", "1abc", "a b", "x".repeat(40), "constructor", "prototype", "__proto__", 7])
      expect(codes(validateInlineClozeConfig({ v: 1, segments: [{ type: "blank", id, control: "text" }] }))).toContain("CLOZE_BLANK_ID_INVALID");
    const many = { v: 1, segments: Array.from({ length: INLINE_CLOZE_LIMITS.blanks + 1 }, (_, i) => ({ type: "blank", id: "b" + i, control: "text" })) };
    expect(codes(validateInlineClozeConfig(many))).toContain("CLOZE_TOO_MANY_BLANKS");
    expect(codes(validateInlineClozeConfig({ v: 1, segments: [{ type: "text", text: "x".repeat(INLINE_CLOZE_LIMITS.textChars + 1) }, { type: "blank", id: "b1", control: "text" }] }))).toContain("CLOZE_SEGMENT_INVALID");
  });
  it("prototype-sensitive keys are refused at every level and Object.prototype is never touched", () => {
    const proto = JSON.parse('{"v":1,"segments":[{"type":"blank","id":"b1","control":"text"}],"__proto__":{"polluted":true}}');
    expect(codes(validateInlineClozeConfig(proto))).toContain("CLOZE_CONFIG_UNKNOWN_KEY");
    const seg = JSON.parse('{"v":1,"segments":[{"type":"blank","id":"b1","control":"text","__proto__":{"x":1}}]}');
    expect(codes(validateInlineClozeConfig(seg))).toContain("CLOZE_SEGMENT_INVALID");
    const opt = JSON.parse('{"v":1,"segments":[{"type":"blank","id":"b1","control":"dropdown","options":[{"id":"o1","label":"a","constructor":1},{"id":"o2","label":"b"}]}]}');
    expect(codes(validateInlineClozeConfig(opt))).toContain("CLOZE_OPTION_INVALID");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("19A inlineCloze@1 — private grading contract (validateInlineClozeAnswerKey)", () => {
  it("a valid key normalizes accepted answers (trim, collapse whitespace, NFC, dedupe) and counts one part per blank", () => {
    const k = KEY(); k.blanks.b1.accepted = ["  IP ", "Internet   Protocol", "IP"];
    const r = validateInlineClozeAnswerKey(k, CFG());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.key.scoring).toBe("proportional");
    expect(r.key.parts).toBe(3);
    expect(r.key.blanks.b1).toEqual({ control: "text", accepted: ["IP", "Internet Protocol"], caseSensitive: false });
    expect(r.key.blanks.b2).toEqual({ control: "dropdown", correctOptionId: "o2" });
  });
  it("exactly one correct dropdown answer that is one of the offered options", () => {
    const k1 = KEY(); (k1.blanks as Record<string, unknown>).b2 = { correctOptionId: "o9" };
    expect(codes(validateInlineClozeAnswerKey(k1, CFG()))).toContain("CLOZE_DROPDOWN_KEY_INVALID");
    const k2 = KEY(); (k2.blanks as Record<string, unknown>).b2 = { correctOptionId: ["o1", "o2"] };
    expect(codes(validateInlineClozeAnswerKey(k2, CFG()))).toContain("CLOZE_DROPDOWN_KEY_INVALID");
    const k3 = KEY(); (k3.blanks as Record<string, unknown>).b2 = { correctOptionIds: ["o2"] };
    expect(codes(validateInlineClozeAnswerKey(k3, CFG()))).toContain("CLOZE_DROPDOWN_KEY_INVALID");
    const k4 = KEY(); (k4.blanks as Record<string, unknown>).b2 = { accepted: ["Data Link"] };
    expect(codes(validateInlineClozeAnswerKey(k4, CFG()))).toContain("CLOZE_DROPDOWN_KEY_INVALID");
  });
  it("a text blank needs at least one non-empty accepted answer; unknown fields and wrong types fail closed", () => {
    const k1 = KEY(); k1.blanks.b1.accepted = [];
    expect(codes(validateInlineClozeAnswerKey(k1, CFG()))).toContain("CLOZE_TEXT_ACCEPTED_EMPTY");
    const k2 = KEY(); k2.blanks.b1.accepted = ["   "];
    expect(codes(validateInlineClozeAnswerKey(k2, CFG()))).toContain("CLOZE_TEXT_ACCEPTED_EMPTY");
    const k3 = KEY(); (k3.blanks.b1 as Record<string, unknown>).fuzzy = true;
    expect(codes(validateInlineClozeAnswerKey(k3, CFG()))).toContain("CLOZE_TEXT_KEY_INVALID");
    const k4 = KEY(); (k4.blanks.b1 as Record<string, unknown>).caseSensitive = "no";
    expect(codes(validateInlineClozeAnswerKey(k4, CFG()))).toContain("CLOZE_TEXT_KEY_INVALID");
    const k5 = KEY(); (k5.blanks.b1 as Record<string, unknown>).accepted = ["IP", 7];
    expect(codes(validateInlineClozeAnswerKey(k5, CFG()))).toContain("CLOZE_TEXT_KEY_INVALID");
  });
  it("every blank has exactly one key; keys for unknown blanks, unknown root fields and unknown scoring are rejected (never defaulted)", () => {
    const k1 = KEY(); delete (k1.blanks as Record<string, unknown>).b3;
    expect(codes(validateInlineClozeAnswerKey(k1, CFG()))).toContain("CLOZE_KEY_MISSING_BLANK");
    const k2 = KEY(); (k2.blanks as Record<string, unknown>).b9 = { accepted: ["x"] };
    expect(codes(validateInlineClozeAnswerKey(k2, CFG()))).toContain("CLOZE_KEY_UNKNOWN_BLANK");
    expect(codes(validateInlineClozeAnswerKey({ ...KEY(), rubric: "x" }, CFG()))).toContain("CLOZE_ANSWER_KEY_INVALID");
    expect(codes(validateInlineClozeAnswerKey({ ...KEY(), scoring: "partialWithPenalty" }, CFG()))).toContain("CLOZE_SCORING_UNKNOWN");
    const noScoring: Record<string, unknown> = KEY(); delete noScoring.scoring;
    expect(codes(validateInlineClozeAnswerKey(noScoring, CFG()))).toContain("CLOZE_SCORING_UNKNOWN");
    expect(codes(validateInlineClozeAnswerKey(null, CFG()))).toContain("CLOZE_ANSWER_KEY_INVALID");
    expect(codes(validateInlineClozeAnswerKey(JSON.parse('{"scoring":"proportional","blanks":{"__proto__":{"accepted":["x"]}}}'), CFG()))).toContain("CLOZE_ANSWER_KEY_INVALID");
    expect(codes(validateInlineClozeAnswerKey(KEY(), { v: 1, segments: [] }))).toContain("CLOZE_KEY_CONFIG_INVALID");
    expect(INLINE_CLOZE_SCORING_MODES).toEqual(["proportional", "allOrNothing"]);
  });
});

describe("19A inlineCloze@1 — deterministic server-owned normalization", () => {
  it("whitespace is trimmed and collapsed; case folding only when case-insensitive; multi-word answers keep their words", () => {
    expect(normalizeClozeText("  show   vlan\tbrief \n", true)).toBe("show vlan brief");
    expect(normalizeClozeText("Show VLAN Brief", false)).toBe("show vlan brief");
    expect(normalizeClozeText("Show VLAN Brief", true)).toBe("Show VLAN Brief");
    expect(normalizeClozeText("é", true)).toBe("é");                              // NFC
    expect(normalizeClozeText("", false)).toBe("");
  });
});

describe("19A inlineCloze@1 — scoring", () => {
  it("full correct (proportional): every blank right → full marks, correct, parts 3/3", () => {
    const r = score({ b1: "internet  protocol", b2: "o2", b3: "show vlan brief" });
    expect(r).toEqual({ score: 6, correct: true, manualReview: false, parts: { correct: 3, total: 3 } });
  });
  it("partial (proportional): correctParts / totalParts × marks; decimals are left to the platform's 2-decimal rounding", () => {
    expect(score({ b1: "ip", b2: "o1", b3: "x" })).toEqual({ score: 2, correct: false, manualReview: false, parts: { correct: 1, total: 3 } });
    const r = score({ b1: "ip", b2: "o2", b3: "nope" }, { maxMarks: 1 });
    expect(r.score).toBeCloseTo(2 / 3, 10); expect(r.parts).toEqual({ correct: 2, total: 3 });
  });
  it("zero correct and all-or-nothing", () => {
    expect(score({}).score).toBe(0);
    const aon = { ...KEY(), scoring: "allOrNothing" };
    expect(score({ b1: "ip", b2: "o2", b3: "nope" }, { answerKey: aon })).toEqual({ score: 0, correct: false, manualReview: false, parts: { correct: 2, total: 3 } });
    expect(score({ b1: "ip", b2: "o2", b3: "show vlan brief" }, { answerKey: aon }).score).toBe(6);
  });
  it("case sensitivity is per blank: b3 is case-sensitive, b1 is not", () => {
    expect(score({ b1: "iP", b2: "o2", b3: "SHOW VLAN BRIEF" }).parts).toEqual({ correct: 2, total: 3 });
  });
  it("a malformed STUDENT response under a valid contract is an ordinary incorrect answer (manualReview false)", () => {
    for (const response of [undefined, null, "IP", { kind: "text", value: "IP" }, { kind: "fields" }, { kind: "fields", values: ["IP"] }, { kind: "fields", values: { b1: 7, b2: { id: "o2" }, b3: ["show vlan brief"] } }, { kind: "fields", values: { b1: "IP".padEnd(INLINE_CLOZE_LIMITS.responseChars + 5, " x") } }]) {
      const r = scoreInlineCloze({ config: CFG(), answerKey: KEY(), response, maxMarks: 6 });
      expect(r.manualReview).toBe(false); expect(r.correct).toBe(false); expect(r.parts.total).toBe(3); expect(r.parts.correct).toBe(0); expect(r.score).toBe(0);
    }
    expect(score({ b2: "Data Link" }).parts.correct).toBe(0);                           // a dropdown is graded by OPTION ID, never by label
    expect(score(JSON.parse('{"__proto__":{"b1":"IP"}}')).parts.correct).toBe(0);
  });
  it("a malformed PRIVATE authority (or public config) fails closed: score 0, correct false, manualReview true — never a partial grade of a valid-looking subset", () => {
    const bad = [
      { answerKey: { ...KEY(), scoring: "bonus" } },
      { answerKey: { scoring: "proportional", blanks: { b1: { accepted: ["IP"] }, b2: { correctOptionId: "o2" } } } },
      { answerKey: { ...KEY(), blanks: { ...KEY().blanks, b9: { accepted: ["x"] } } } },
      { answerKey: undefined },
      { config: { ...CFG(), extra: true } },
      { config: { v: 1, segments: [{ type: "blank", id: "b1", control: "text" }, { type: "blank", id: "b1", control: "text" }] } }
    ];
    for (const over of bad) {
      const r = scoreInlineCloze({ config: "config" in over ? over.config : CFG(), answerKey: "answerKey" in over ? over.answerKey : KEY(), response: fields({ b1: "IP", b2: "o2", b3: "show vlan brief" }), maxMarks: 6 });
      expect(r).toEqual(INLINE_CLOZE_FAIL_CLOSED);
    }
    expect(INLINE_CLOZE_FAIL_CLOSED).toEqual({ score: 0, correct: false, manualReview: true, parts: { correct: 0, total: 0 } });
  });
});

describe("19A inlineCloze@1 — student projection, review evaluation, ingest binding, finalization validator", () => {
  it("projection is the strict canonical config (public fields only) or null — a malformed control never becomes valid by projection", () => {
    const smuggled = CFG() as unknown as { segments: Record<string, unknown>[] };
    expect(projectInlineClozeConfigForStudent(CFG())).toEqual(CFG());
    smuggled.segments[3].correctOptionId = "o2";
    expect(projectInlineClozeConfigForStudent(smuggled)).toBeNull();
    expect(projectInlineClozeConfigForStudent({ ...CFG(), answer: KEY() })).toBeNull();
    expect(JSON.stringify(projectInlineClozeConfigForStudent(CFG()))).not.toMatch(/accepted|correctOptionId|Internet Protocol|show vlan brief/);
  });
  it("evaluateInlineCloze returns per-blank correctness with the teacher-side expected values (review only)", () => {
    const r = evaluateInlineCloze(CFG(), KEY(), { b1: "ip", b2: "o1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.results.map(x => [x.id, x.ok, x.given])).toEqual([["b1", true, "ip"], ["b2", false, "Physical"], ["b3", false, ""]]);
    expect(r.results[1].expected).toEqual(["Data Link"]);
    expect(evaluateInlineCloze(CFG(), { ...KEY(), scoring: "x" }, {}).ok).toBe(false);
  });
  it("ingest binding keeps only string values for the question's blank ids (bounded); a non-fields kind is refused", () => {
    const q = { examQuestionId: "c1", presentationType: "inlineCloze", questionTypeVersion: 1, inlineCloze: CFG(), answer: KEY() };
    const r = bindInlineClozeAnswerToQuestion({ kind: "fields", values: { b1: "IP", b2: "o2", ghost: "x", b3: 9 }, score: 6 }, q);
    expect(r).toEqual({ ok: true, answer: { kind: "fields", values: { b1: "IP", b2: "o2" } } });
    const long = bindInlineClozeAnswerToQuestion({ kind: "fields", values: { b1: "x".repeat(INLINE_CLOZE_LIMITS.responseChars + 10) } }, q);
    expect(long.ok && (long.answer.values.b1 as string).length).toBe(INLINE_CLOZE_LIMITS.responseChars);
    expect(bindInlineClozeAnswerToQuestion({ kind: "text", value: "IP" }, q)).toEqual({ ok: false, code: "CLOZE_ANSWER_INVALID" });
    expect(bindInlineClozeAnswerToQuestion(JSON.parse('{"kind":"fields","values":{"__proto__":{"b1":"IP"},"b1":"IP"}}'), q)).toEqual({ ok: true, answer: { kind: "fields", values: { b1: "IP" } } });
  });
  it("validateInlineClozeQuestion reports config AND key issues as blocking errors; the defaults block finalization until the teacher sets an answer", () => {
    expect(validateInlineClozeQuestion({ inlineCloze: CFG(), answer: KEY() })).toEqual([]);
    const issues = validateInlineClozeQuestion({ inlineCloze: CFG(), answer: { ...KEY(), scoring: "?" } });
    expect(issues.map(i => i.code)).toContain("CLOZE_SCORING_UNKNOWN");
    expect(issues.every(i => i.severity === "error")).toBe(true);
    expect(validateInlineClozeQuestion({ inlineCloze: defaultInlineClozeConfig(), answer: defaultInlineClozeAnswerKey() }).map(i => i.code)).toContain("CLOZE_TEXT_ACCEPTED_EMPTY");
    expect(validateInlineClozeQuestion({ answer: KEY() }).map(i => i.code)).toContain("CLOZE_CONFIG_MISSING");
  });
});
