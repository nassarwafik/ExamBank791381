import { describe, it, expect } from "vitest";
import * as S from "./scenarioSource";
import { validateStructuredExam } from "./examQuality";
import { evaluateExamFinalization } from "./examFinalization";
import { toSafePreviewExam } from "./examPreviewModel";

// Phase 19G — the Scenario & Source Assessment Engine DOMAIN contract (pure): ScenarioV1 (one or more shared sources + several
// ordinary canonical questions of the SAME section, referenced by examQuestionId), the strict SourceStimulusV1 contract (text /
// image / table / code), the section-level membership rules (exists, same section, at most one scenario, contiguous), the strict
// student projection and the finalization gate. Fail-first on 2aa40da: ./scenarioSource does not exist (the whole file fails to load);
// validateStructuredExam ignores `section.scenarios`. PINS (behaviour that already held on the baseline, kept as the regression gate):
// D22 (the legacy groupId warning) and D23 (the generic preview scrub).
type R = Record<string, unknown>;
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r.issues ?? []).map(i => i.code));
const TEXT = (over: R = {}): R => ({ id: "src-text", version: 1, kind: "text", title: "النص", text: "اقرأ النص التالي ثم أجب.", ...over });
const IMAGE = (over: R = {}): R => ({ id: "src-img", version: 1, kind: "image", alt: "مخطط الشبكة", image: { dataUrl: "data:image/png;base64,AAAA", origin: "uploaded", contentType: "image/png" }, ...over });
const TABLE = (over: R = {}): R => ({ id: "src-tbl", version: 1, kind: "table", title: "القياسات", columnHeaders: ["الزمن", "السرعة"], rowHeaders: ["أ", "ب"], rows: [["0", "1"], ["1", "3"]], ...over });
const CODE = (over: R = {}): R => ({ id: "src-code", version: 1, kind: "code", title: "البرنامج", language: "python", source: "print(1)\n", ...over });
const q = (id: string, over: R = {}): R => ({ examQuestionId: id, presentationType: "multipleChoice", text: "س " + id, marks: 1, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 }, ...over });
const scn = (over: R = {}): R => ({ id: "scn-1", version: 1, title: "سيناريو", instructions: "أجب اعتمادًا على المصادر.", sources: [TEXT()], questionIds: ["q1", "q2"], ...over });
const section = (over: R = {}): R => ({ id: "s1", title: "القسم", instructions: "", maxMarks: null, gradingPolicy: "all", requiredAnswers: null, answerUnit: "question", stimuli: {}, questions: [q("q1"), q("q2"), q("q3")], scenarios: [scn()], ...over });
const exam = (sections: unknown[]) => ({ examId: "e", title: "t", metadata: {}, presentationTheme: "classic", sections }) as never;
const errorCodes = (sections: unknown[]) => validateStructuredExam(exam(sections)).filter(i => i.severity === "error").map(i => i.code);

describe("19G-D1 — SourceStimulusV1 is strict and never repairs", () => {
  it("D1 every V1 kind validates to a canonical COPY with exactly its own keys", () => {
    for (const raw of [TEXT(), IMAGE(), TABLE(), CODE()]) {
      const r = S.validateSourceStimulus(raw);
      expect(r.ok, JSON.stringify(raw)).toBe(true);
      if (r.ok) { expect(r.source).toEqual(raw); expect(r.source).not.toBe(raw); }
    }
    expect(S.SCENARIO_SOURCE_KINDS).toEqual(["text", "image", "table", "code"]);
    expect(S.SCENARIO_LIMITS.sources).toBe(8); expect(S.SCENARIO_LIMITS.questions).toBe(30);
  });
  const bad: [string, unknown, string][] = [
    ["not an object", "x", "SOURCE_INVALID"],
    ["array", [TEXT()], "SOURCE_INVALID"],
    ["unknown key", TEXT({ answer: "ب" }), "SOURCE_INVALID"],
    ["smuggled modelAnswer", TEXT({ modelAnswer: "x" }), "SOURCE_INVALID"],
    ["smuggled hiddenTests", CODE({ hiddenTests: [] }), "SOURCE_INVALID"],
    ["smuggled geometry on an image", IMAGE({ geometry: { x: 1 } }), "SOURCE_INVALID"],
    ["missing id", { version: 1, kind: "text", text: "x" }, "SOURCE_ID_INVALID"],
    ["prototype id", TEXT({ id: "__proto__" }), "SOURCE_ID_INVALID"],
    ["id with spaces", TEXT({ id: "a b" }), "SOURCE_ID_INVALID"],
    ["version 2 is NOT read as 1", TEXT({ version: 2 }), "SOURCE_VERSION_UNSUPPORTED"],
    ["version '1' (string)", TEXT({ version: "1" }), "SOURCE_VERSION_UNSUPPORTED"],
    ["missing version", { id: "s", kind: "text", text: "x" }, "SOURCE_VERSION_UNSUPPORTED"],
    ["unknown kind pdf", { id: "s", version: 1, kind: "pdf", url: "x" }, "SOURCE_KIND_UNSUPPORTED"],
    ["unknown kind video", { id: "s", version: 1, kind: "video", text: "x" }, "SOURCE_KIND_UNSUPPORTED"],
    ["unknown kind html", { id: "s", version: 1, kind: "html", text: "<b>" }, "SOURCE_KIND_UNSUPPORTED"],
    ["title not a string", TEXT({ title: 1 }), "SOURCE_TITLE_INVALID"],
    ["title too long", TEXT({ title: "x".repeat(201) }), "SOURCE_TITLE_INVALID"],
    ["text empty", TEXT({ text: "   " }), "SOURCE_TEXT_INVALID"],
    ["text too long", TEXT({ text: "x".repeat(20001) }), "SOURCE_TEXT_INVALID"],
    ["text kind with a code field", TEXT({ source: "x" }), "SOURCE_INVALID"],
    ["image without alt", { id: "i", version: 1, kind: "image", image: { dataUrl: "data:image/png;base64,AA" } }, "SOURCE_ALT_REQUIRED"],
    ["image with blank alt", IMAGE({ alt: "  " }), "SOURCE_ALT_REQUIRED"],
    ["image alt too long", IMAGE({ alt: "x".repeat(301) }), "SOURCE_ALT_REQUIRED"],
    ["image external URL", IMAGE({ image: { dataUrl: "https://example.com/a.png" } }), "SOURCE_IMAGE_INVALID"],
    ["image javascript URL", IMAGE({ image: { dataUrl: "javascript:alert(1)" } }), "SOURCE_IMAGE_INVALID"],
    ["image text/html data URL", IMAGE({ image: { dataUrl: "data:text/html,<b>" } }), "SOURCE_IMAGE_INVALID"],
    ["image asset unknown key", IMAGE({ image: { dataUrl: "data:image/png;base64,AA", prompt: "x" } }), "SOURCE_IMAGE_INVALID"],
    ["image asset missing", { id: "i", version: 1, kind: "image", alt: "a" }, "SOURCE_IMAGE_INVALID"],
    ["bank asset with unsafe blobName", IMAGE({ image: { origin: "bank", blobName: "../x", id: "x" } }), "SOURCE_IMAGE_INVALID"],
    ["bank asset with a traversal inside a valid-looking name", IMAGE({ image: { origin: "bank", blobName: "bank/../x.png", id: "x" } }), "SOURCE_IMAGE_INVALID"],
    ["bank asset with a double slash", IMAGE({ image: { origin: "bank", blobName: "bank//x.png", id: "x" } }), "SOURCE_IMAGE_INVALID"],
    ["bank asset delivery URL too long", IMAGE({ image: { origin: "bank", blobName: "bank/x.png", id: "x", dataUrl: "/api/question-image?blob=" + "x".repeat(2100) } }), "SOURCE_IMAGE_INVALID"],
    ["inline image over the byte bound", IMAGE({ image: { dataUrl: "data:image/png;base64," + "A".repeat(4200001) } }), "SOURCE_IMAGE_INVALID"],
    ["text within the char bound but over the UTF-8 byte bound", TEXT({ text: "\u{1F600}".repeat(17000) }), "SOURCE_TEXT_INVALID"],
    ["own __proto__ key (parsed JSON)", JSON.parse('{"id":"t","version":1,"kind":"text","text":"x","__proto__":{"a":1}}'), "SOURCE_INVALID"],
    ["table without columns", TABLE({ columnHeaders: [] }), "SOURCE_TABLE_INVALID"],
    ["table 13 columns", TABLE({ columnHeaders: Array.from({ length: 13 }, (_, i) => "c" + i), rows: [Array.from({ length: 13 }, () => "x")], rowHeaders: ["r"] }), "SOURCE_TABLE_INVALID"],
    ["table ragged row", TABLE({ rows: [["0", "1"], ["1"]] }), "SOURCE_TABLE_INVALID"],
    ["table 51 rows", TABLE({ rows: Array.from({ length: 51 }, () => ["0", "1"]), rowHeaders: undefined }), "SOURCE_TABLE_INVALID"],
    ["table rowHeaders length mismatch", TABLE({ rowHeaders: ["أ"] }), "SOURCE_TABLE_INVALID"],
    ["table non-string cell", TABLE({ rows: [["0", 1], ["1", "3"]] }), "SOURCE_TABLE_INVALID"],
    ["table cell too long", TABLE({ rows: [["0", "x".repeat(501)], ["1", "3"]] }), "SOURCE_TABLE_INVALID"],
    ["table with no rows", TABLE({ rows: [], rowHeaders: [] }), "SOURCE_TABLE_INVALID"],
    ["code unsupported language", CODE({ language: "javascript" }), "CODE_STIMULUS_LANGUAGE_INVALID"],
    ["code empty source", CODE({ source: "  " }), "CODE_STIMULUS_SOURCE_EMPTY"],
    ["code too large", CODE({ source: "x".repeat(16385) }), "CODE_STIMULUS_TOO_LARGE"],
    ["code with expectedOutput", CODE({ expectedOutput: "1" }), "SOURCE_INVALID"],
    ["code with a `code` field name", { id: "c", version: 1, kind: "code", language: "python", code: "x" }, "SOURCE_INVALID"]
  ];
  for (const [name, raw, code] of bad) it("D2 " + name + " → " + code, () => { expect(codes(S.validateSourceStimulus(raw))).toContain(code); });
  it("D3 a text source with an empty title drops the title key (canonical form has no empty optional)", () => {
    const r = S.validateSourceStimulus(TEXT({ title: "" }));
    expect(r.ok).toBe(true); if (r.ok) expect("title" in r.source).toBe(false);
  });
  it("D4 a bank image asset is accepted in its durable form and projected with ONLY id / origin / blobName / contentType / dataUrl (delivery URL)", () => {
    const r = S.validateSourceStimulus(IMAGE({ image: { id: "b1", origin: "bank", blobName: "bank/images/b1.png", contentType: "image/png" } }));
    expect(r.ok).toBe(true);
    const hydrated = S.validateSourceStimulus(IMAGE({ image: { id: "b1", origin: "bank", blobName: "bank/images/b1.png", contentType: "image/png", dataUrl: "/api/question-image?blob=bank%2Fimages%2Fb1.png&exp=1&sig=abc" } }));
    expect(hydrated.ok).toBe(true);
    expect(codes(S.validateSourceStimulus(IMAGE({ image: { id: "b1", origin: "bank", blobName: "bank/images/b1.png", dataUrl: "https://evil/x.png" } })))).toContain("SOURCE_IMAGE_INVALID");
  });
});

describe("19G-D5 — ScenarioV1 structure is strict", () => {
  it("D5 a valid scenario validates to a canonical copy; version is literally 1", () => {
    const r = S.validateScenario(scn());
    expect(r.ok).toBe(true); if (r.ok) { expect(r.scenario).toEqual(scn()); expect(r.scenario).not.toBe(scn()); }
  });
  const bad: [string, unknown, string][] = [
    ["not an object", 1, "SCENARIO_INVALID"],
    ["unknown key", scn({ answer: "x" }), "SCENARIO_INVALID"],
    ["smuggled rubric", scn({ rubric: {} }), "SCENARIO_INVALID"],
    ["smuggled marks", scn({ marks: 5 }), "SCENARIO_INVALID"],
    ["nested questions (full canonical objects)", scn({ questions: [q("q9")] }), "SCENARIO_INVALID"],
    ["missing id", { version: 1, sources: [TEXT()], questionIds: ["q1"] }, "SCENARIO_ID_INVALID"],
    ["prototype id", scn({ id: "constructor" }), "SCENARIO_ID_INVALID"],
    ["version 2 never read as 1", scn({ version: 2 }), "SCENARIO_VERSION_UNSUPPORTED"],
    ["version 0", scn({ version: 0 }), "SCENARIO_VERSION_UNSUPPORTED"],
    ["title too long", scn({ title: "x".repeat(201) }), "SCENARIO_TITLE_INVALID"],
    ["instructions too long", scn({ instructions: "x".repeat(4001) }), "SCENARIO_INSTRUCTIONS_INVALID"],
    ["no sources", scn({ sources: [] }), "SCENARIO_SOURCES_COUNT"],
    ["9 sources", scn({ sources: Array.from({ length: 9 }, (_, i) => TEXT({ id: "t" + i })) }), "SCENARIO_SOURCES_COUNT"],
    ["sources not an array", scn({ sources: {} }), "SCENARIO_SOURCES_COUNT"],
    ["duplicate source id", scn({ sources: [TEXT(), TEXT()] }), "SCENARIO_SOURCE_ID_DUPLICATE"],
    ["a malformed source fails the scenario", scn({ sources: [TEXT({ answer: "x" })] }), "SOURCE_INVALID"],
    ["no questions", scn({ questionIds: [] }), "SCENARIO_QUESTIONS_COUNT"],
    ["31 questions", scn({ questionIds: Array.from({ length: 31 }, (_, i) => "q" + i) }), "SCENARIO_QUESTIONS_COUNT"],
    ["duplicate question ref", scn({ questionIds: ["q1", "q1"] }), "SCENARIO_QUESTION_DUPLICATE"],
    ["non-string question ref", scn({ questionIds: ["q1", 2] }), "SCENARIO_QUESTION_REF_INVALID"],
    ["cyclic structure", (() => { const o: R = scn(); (o as { self?: unknown }).self = o; return o; })(), "SCENARIO_INVALID"]
  ];
  for (const [name, raw, code] of bad) it("D6 " + name + " → " + code, () => { expect(codes(S.validateScenario(raw))).toContain(code); });
  it("D7 the total text payload of a scenario is bounded (titles + instructions + text + cells + code)", () => {
    const big = scn({ sources: Array.from({ length: 8 }, (_, i) => TEXT({ id: "t" + i, text: "x".repeat(20000) })) });
    expect(codes(S.validateScenario(big))).toContain("SCENARIO_PAYLOAD_TOO_LARGE");
  });
});

describe("19G-D8 — section membership: exists, same section, at most one scenario, contiguous; order = section order", () => {
  it("D8 a valid section yields canonical scenarios with questionIds in SECTION order", () => {
    const r = S.validateSectionScenarios(section({ scenarios: [scn({ questionIds: ["q2", "q1"] })] }));
    expect(r.ok).toBe(true);
    expect(r.scenarios[0].questionIds).toEqual(["q1", "q2"]);
  });
  it("D9 a section without the key (or undefined) is valid with no scenarios and no issues", () => {
    const s = section(); delete s.scenarios;
    expect(S.validateSectionScenarios(s)).toEqual({ ok: true, scenarios: [], issues: [] });
    expect(S.scenarioSectionIssues(s)).toEqual([]);
    expect(S.scenarioSectionIssues(section({ scenarios: undefined }))).toEqual([]);
  });
  const bad: [string, R, string][] = [
    ["scenarios not an array", section({ scenarios: { a: 1 } }), "SCENARIOS_INVALID"],
    ["duplicate scenario id", section({ scenarios: [scn({ questionIds: ["q1"] }), scn({ questionIds: ["q2"] })] }), "SCENARIO_ID_DUPLICATE"],
    ["missing question", section({ scenarios: [scn({ questionIds: ["q1", "q-missing"] })] }), "SCENARIO_QUESTION_MISSING"],
    ["cross-section question", section({ scenarios: [scn({ questionIds: ["q1", "other-q"] })] }), "SCENARIO_QUESTION_CROSS_SECTION"],
    ["question in two scenarios", section({ scenarios: [scn({ id: "a", questionIds: ["q1", "q2"] }), scn({ id: "b", questionIds: ["q2", "q3"] })] }), "SCENARIO_QUESTION_SHARED"],
    ["members not contiguous", section({ scenarios: [scn({ questionIds: ["q1", "q3"] })] }), "SCENARIO_NOT_CONTIGUOUS"],
    ["a structurally invalid scenario is reported with its path", section({ scenarios: [scn({ version: 2 })] }), "SCENARIO_VERSION_UNSUPPORTED"]
  ];
  for (const [name, sec, code] of bad) it("D10 " + name + " → " + code, () => {
    const r = S.validateSectionScenarios(sec, { knownQuestionIds: new Set(["q1", "q2", "q3", "other-q"]) });
    expect(r.ok).toBe(false); expect(codes(r)).toContain(code);
  });
  it("D11 cross-section vs missing: without the exam-wide id set an unknown id is simply MISSING", () => {
    expect(codes(S.validateSectionScenarios(section({ scenarios: [scn({ questionIds: ["q1", "other-q"] })] })))).toContain("SCENARIO_QUESTION_MISSING");
  });
  it("D12 scenarioForQuestion resolves membership from the canonical list only", () => {
    const r = S.validateSectionScenarios(section());
    expect(S.scenarioForQuestion(r.scenarios, "q2")?.id).toBe("scn-1");
    expect(S.scenarioForQuestion(r.scenarios, "q3")).toBeUndefined();
    expect(S.scenarioForQuestion(undefined, "q1")).toBeUndefined();
  });
});

describe("19G-D13 — the ONLY student projection is the strict canonical copy; anything wrong withholds the whole scenario", () => {
  it("D13 a valid section projects canonical copies (never the stored objects)", () => {
    const sec = section();
    const p = S.projectSectionScenariosForStudent(sec);
    expect(p).toEqual([scn()]);
    expect(p![0]).not.toBe((sec.scenarios as unknown[])[0]);
    expect(p![0].sources[0]).not.toBe(((sec.scenarios as R[])[0].sources as unknown[])[0]);
  });
  it("D14 a section without scenarios projects undefined (no key invented)", () => {
    const s = section(); delete s.scenarios;
    expect(S.projectSectionScenariosForStudent(s)).toBeUndefined();
  });
  const SMUGGLED = ["answer", "answers", "correctAnswer", "modelAnswer", "solution", "referenceSolution", "expected", "expectedOutput", "expectedOutputs", "hiddenTests", "tests", "grading", "gradingMode", "score", "marks", "rubric", "rubricInternal", "teacherNotes", "privateNotes", "evidence", "geometry", "mapping", "runnerPayload", "callbackKey", "secret", "token", "headers"];
  for (const key of SMUGGLED) it("D15 a source smuggling `" + key + "` withholds the scenario; the value never appears", () => {
    const sec = section({ scenarios: [scn({ sources: [TEXT({ [key]: "LEAK-" + key })] })] });
    const p = S.projectSectionScenariosForStudent(sec);
    expect(p).toEqual([]);
    expect(JSON.stringify(p)).not.toContain("LEAK-");
  });
  for (const key of SMUGGLED) it("D16 a scenario smuggling `" + key + "` at scenario level is withheld", () => {
    const sec = section({ scenarios: [scn({ [key]: "LEAK-" + key })] });
    expect(JSON.stringify(S.projectSectionScenariosForStudent(sec))).not.toContain("LEAK-");
  });
  it("D17 only the invalid scenario is withheld; valid siblings survive; a shared question withholds BOTH involved scenarios", () => {
    const sec = section({ questions: [q("q1"), q("q2"), q("q3"), q("q4")], scenarios: [scn({ id: "a", questionIds: ["q1", "q2"] }), scn({ id: "b", version: 2, questionIds: ["q3"] }), scn({ id: "c", questionIds: ["q4"], sources: [CODE({ id: "c1" })] })] });
    expect(S.projectSectionScenariosForStudent(sec)!.map(s => s.id)).toEqual(["a", "c"]);
    const shared = section({ scenarios: [scn({ id: "a", questionIds: ["q1", "q2"] }), scn({ id: "b", questionIds: ["q2", "q3"] })] });
    expect(S.projectSectionScenariosForStudent(shared)).toEqual([]);
  });
  it("D18 a future source kind fails CLOSED (withheld), never passed through", () => {
    const sec = section({ scenarios: [scn({ sources: [{ id: "v", version: 1, kind: "video", url: "https://x/y.mp4" }] })] });
    expect(S.projectSectionScenariosForStudent(sec)).toEqual([]);
  });
});

describe("19G-D19 — finalization: every scenario rule is a BLOCKING structural error", () => {
  it("D19 a valid scenario section has no scenario issue and finalizes", () => {
    const issues = validateStructuredExam(exam([section()]));
    expect(issues.filter(i => i.code.startsWith("SCENARIO") || i.code.startsWith("SOURCE"))).toEqual([]);
    expect(evaluateExamFinalization(exam([section()])).canFinalize).toBe(true);
  });
  const blocking: [string, unknown[], string][] = [
    ["missing alt", [section({ scenarios: [scn({ sources: [IMAGE({ alt: "" })] })] })], "SOURCE_ALT_REQUIRED"],
    ["future scenario version", [section({ scenarios: [scn({ version: 2 })] })], "SCENARIO_VERSION_UNSUPPORTED"],
    ["unknown source kind", [section({ scenarios: [scn({ sources: [{ id: "a", version: 1, kind: "audio", text: "x" }] })] })], "SOURCE_KIND_UNSUPPORTED"],
    ["missing question", [section({ scenarios: [scn({ questionIds: ["q1", "nope"] })] })], "SCENARIO_QUESTION_MISSING"],
    ["cross-section reference", [section({ scenarios: [scn({ questionIds: ["q1", "z1"] })] }), section({ id: "s2", questions: [q("z1")], scenarios: undefined })], "SCENARIO_QUESTION_CROSS_SECTION"],
    ["shared question", [section({ scenarios: [scn({ id: "a", questionIds: ["q1", "q2"] }), scn({ id: "b", questionIds: ["q2", "q3"] })] })], "SCENARIO_QUESTION_SHARED"],
    ["duplicate scenario id", [section({ scenarios: [scn({ questionIds: ["q1"] }), scn({ questionIds: ["q2"] })] })], "SCENARIO_ID_DUPLICATE"],
    ["not contiguous", [section({ scenarios: [scn({ questionIds: ["q1", "q3"] })] })], "SCENARIO_NOT_CONTIGUOUS"],
    ["empty scenario", [section({ scenarios: [scn({ questionIds: [] })] })], "SCENARIO_QUESTIONS_COUNT"],
    ["smuggled answer", [section({ scenarios: [scn({ sources: [TEXT({ answer: "x" })] })] })], "SOURCE_INVALID"]
  ];
  for (const [name, sections, code] of blocking) it("D20 " + name + " → blocking " + code, () => {
    expect(errorCodes(sections)).toContain(code);
    expect(evaluateExamFinalization(exam(sections)).canFinalize).toBe(false);
  });
  it("D21 the issue carries the section id (and the question id when a question is involved)", () => {
    const issues = validateStructuredExam(exam([section({ scenarios: [scn({ questionIds: ["q1", "nope"] })] })]));
    const i = issues.find(x => x.code === "SCENARIO_QUESTION_MISSING")!;
    expect(i.sectionId).toBe("s1"); expect(i.severity).toBe("error"); expect(i.message).toContain("nope");
  });
  it("D22 the legacy stimulus / groupId model is untouched: a dangling groupId stays a WARNING and nothing is auto-upgraded", () => {
    const issues = validateStructuredExam(exam([section({ scenarios: undefined, questions: [q("q1", { groupId: "grp-x" })] })]));
    expect(issues.find(i => i.code === "STIMULUS_MISSING")?.severity).toBe("warning");
    expect(issues.some(i => i.code.startsWith("SCENARIO"))).toBe(false);
  });
});

describe("19G-D23 — teacher preview scrub keeps the scenario (presentation data) but still scrubs secrets", () => {
  type SafePreview = { sections: { scenarios: R[] }[] };
  it("D23 a scenario survives toSafePreviewExam while a smuggled `answer` key inside a source is scrubbed", () => {
    const input = exam([section({ scenarios: [scn({ sources: [TEXT(), { ...TEXT({ id: "t2" }), answer: "SECRET" }] })] })]);
    const safe = toSafePreviewExam(input) as unknown as SafePreview;
    expect(JSON.stringify(safe)).not.toContain("SECRET");
    expect(safe.sections[0].scenarios[0].id).toBe("scn-1");
  });
});
