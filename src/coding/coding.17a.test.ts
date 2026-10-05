import { describe, it, expect } from "vitest";
import { QUESTION_TYPE_CATALOG, questionTypeDefinition, listQuestionTypes } from "../questionTypeCatalog";
import { answered, type Answer } from "../answerState";
import { newQuestion, newSection, duplicateQuestion, moveQuestion, moveQuestionToSection, cloneQuestionWithNewIds, changeQuestionType } from "../examBuilderState";
import { validateQuestionTypeNode } from "../questionTypeValidation";
import { validateStructuredExam } from "../examQuality";
import { evaluateExamFinalization } from "../examFinalization";
import type { BuilderQuestion, StructuredExam } from "../examTypes";

// Phase 17A — Enterprise Coding Assessment Engine Core: the ONE generic production type `coding` (coding@1), the
// Coding Language Registry (language = data, never a type), the public / private configuration split, the bounded
// first-class `code` Answer, the pure output-comparison contract and the finalization rules. Written fail-first on
// 7af619a4 (type and modules absent): the new modules are loaded at RUNTIME so every case fails on its own assertion.
const load = <T,>(p: string): Promise<T> => import(/* @vite-ignore */ p);
type CQ = typeof import("../codingQuestion");
type CC = typeof import("../codingContract");
type CT = typeof import("./codingTests");
const cq = () => load<CQ>("../codingQuestion");
const cc = () => load<CC>("../codingContract");
const ct = () => load<CT>("./codingTests");

const LANGS = ["python", "java", "csharp"];                                              // Coding Assessment V1: exactly these three
const UNSUPPORTED = ["javascript", "typescript", "cpp", "sql"];                          // not registered in V1 → fail closed
type Cfg = Record<string, unknown>;
const cfg = (over: Cfg = {}): Cfg => ({
  allowedLanguages: ["python", "csharp"], defaultLanguage: "python",
  starterCode: { python: "a, b = map(int, input().split())\n" },
  taskMode: "program", inputMode: "stdin", outputMode: "stdout",
  limits: { sourceBytes: 65536, outputBytes: 65536, timeMs: 2000, memoryMb: 256 },
  publicTests: [{ id: "pub-1", title: "مثال", input: "2 3\n", sampleOutput: "5\n" }],
  ...over
});
const key = (over: Cfg = {}): Cfg => ({
  hiddenTests: [{ id: "hid-1", title: "حالة سالبة", input: "-2 -3\n", expectedOutput: "-5\n", weight: 2 }, { id: "hid-2", input: "1000000 1\n", expectedOutput: "1000001\n", weight: 3 }],
  comparator: "trimTrailingWhitespace", referenceSolutions: { python: "a, b = map(int, input().split())\nprint(a + b)\n" },
  ...over
});
const codingQ = (over: Partial<BuilderQuestion> = {}): BuilderQuestion => ({ ...newQuestion("coding" as never, { examQuestionId: "c1", text: "اقرأ عددين صحيحين واطبع مجموعهما.", marks: 10 }), questionTypeVersion: 1, coding: cfg(), answer: key(), ...over } as unknown as BuilderQuestion);
const exam = (questions: BuilderQuestion[]): StructuredExam => ({ examId: "EXAM-17A", title: "امتحان", status: "draft", schemaVersion: 2, sections: [{ id: "sec-1", title: "القسم", gradingPolicy: "all", stimuli: {}, questions }] });
const codes = (node: Cfg) => validateQuestionTypeNode(node, "coding", 1).map(i => i.code);

describe("C1 — coding@1 is a real production question type", () => {
  it("catalog: key 'coding', version 1, «برمجة / كتابة كود», interactive, hybrid (manual today), partial credit, NOT compound, interactive, offline editing, responseKinds ['code'], non-legacy; 17 production types", () => {
    const d = questionTypeDefinition("coding");
    expect(d, "coding is registered").toBeTruthy();
    expect(d!.version).toBe(2); expect(d!.label).toBe("برمجة / كتابة كود");   // 17F-C2 RF1: current version 2 (coding@1 historical, coding@2 compile-error policy) expect(d!.category).toBe("interactive"); expect(d!.gradingMode).toBe("hybrid"); expect(d!.legacy).toBe(false);
    expect(d!.capabilities).toMatchObject({ autoGrading: false, manualGrading: true, partialCredit: true, compoundPart: false, interactive: true, offline: true, requiresImage: false });
    expect(d!.responseKinds).toEqual(["code"]);
    expect(QUESTION_TYPE_CATALOG.length).toBe(22);                                                   // 18C adds networkCli · 19A adds inlineCloze · 19B adds parametricNumeric · 19D adds hotspot / labelDiagram
    expect(QUESTION_TYPE_CATALOG.at(-6)!.key).toBe("coding"); expect(QUESTION_TYPE_CATALOG.at(-5)!.key).toBe("networkCli"); expect(QUESTION_TYPE_CATALOG.at(-4)!.key).toBe("inlineCloze"); expect(QUESTION_TYPE_CATALOG.at(-3)!.key).toBe("parametricNumeric");   // 18C appends networkCli after coding · 19A appends inlineCloze · 19B appends parametricNumeric · 19D appends hotspot / labelDiagram
  });
  it("ONE generic type: no per-language question types exist (language is configuration)", () => {
    const keys = listQuestionTypes().map(d => d.key.toLowerCase());
    for (const bad of ["pythonquestion", "javascriptquestion", "javaquestion", "csharpquestion", "sqlquestion", "python", "java", "cpp"]) expect(keys).not.toContain(bad);
  });
});

describe("C2 — Coding Language Registry (pure, domain-neutral, versioned)", () => {
  it("exactly the three V1 languages (python, java, csharp), each with key, contract version 1, Arabic/Latin label, extension, editor language and a contract-level capability descriptor", async () => {
    const m = await cq();
    expect(m.CODING_LANGUAGES.map(l => l.key)).toEqual(LANGS);
    expect(Object.isFrozen(m.CODING_LANGUAGES)).toBe(true);
    for (const l of m.CODING_LANGUAGES) {
      expect(Object.isFrozen(l)).toBe(true);
      expect(l.version).toBe(1);
      expect(l.label.length).toBeGreaterThan(1); expect(l.extension).toMatch(/^\.[a-z]+$/); expect(typeof l.editorLanguage).toBe("string");
      expect(Object.keys(l.capabilities).sort()).toEqual(["compile", "run", "stdin", "tests"]);
    }
    expect(m.codingLanguage("python")?.extension).toBe(".py"); expect(m.codingLanguage("csharp")?.extension).toBe(".cs");
    expect(m.codingLanguage("cobol")).toBeUndefined(); expect(m.isCodingLanguage("Python")).toBe(false); expect(m.isCodingLanguage("__proto__")).toBe(false);
  });
  it("JavaScript, TypeScript, C++ and SQL are NOT registered in V1 (no manual-review exception); every supported language keeps run / stdin / tests", async () => {
    const m = await cq();
    for (const key of UNSUPPORTED) { expect(m.codingLanguage(key)).toBeUndefined(); expect(m.isCodingLanguage(key)).toBe(false); }
    for (const k of LANGS) expect(m.codingLanguage(k)!.capabilities).toMatchObject({ run: true, stdin: true, tests: true });
    expect(m.codingLanguage("java")!.capabilities.compile).toBe(true); expect(m.codingLanguage("csharp")!.capabilities.compile).toBe(true);
    for (const k of LANGS) expect(m.codingLanguage(k)!.indentUnit).toBe("    ");
  });
  it("NO runtime / toolchain versions are promised in 17A (no 'Python 3.x', 'Java 2x' …): those belong to the execution provider's capability response", async () => {
    const m = await cq();
    expect(JSON.stringify(m.CODING_LANGUAGES)).not.toMatch(/\d+\.\d+|toolchain|runtimeVersion/i);
  });
});

describe("C3 — first-class `code` Answer", () => {
  it("answered ⇔ a string source with non-whitespace content; unknown / malformed fail closed", () => {
    expect(answered({ kind: "code", language: "python", languageVersion: 1, source: "print(1)\n" } as unknown as Answer)).toBe(true);
    expect(answered({ kind: "code", language: "python", languageVersion: 1, source: "  \n\t" } as unknown as Answer)).toBe(false);
    expect(answered({ kind: "code", language: "python", languageVersion: 1 } as unknown as Answer)).toBe(false);
    expect(answered({ kind: "code", language: "python", languageVersion: 1, source: 42 } as unknown as Answer)).toBe(false);
  });
  it("normalizeCodeAnswer keeps EXACTLY {kind, language, languageVersion, source}: client-supplied score / passed / testsPassed / stdout never survive", async () => {
    const m = await cq();
    const r = m.normalizeCodeAnswer({ kind: "code", language: "python", languageVersion: 1, source: "print(1)", score: 10, passed: true, testsPassed: 5, stdout: "1" });
    expect(r).toEqual({ ok: true, answer: { kind: "code", language: "python", languageVersion: 1, source: "print(1)" } });
  });
});

describe("C4 — coding question defaults", () => {
  it("newQuestion('coding') is stamped coding@2 (17F-C2 RF1) with a valid default public config and the default private key under answer", async () => {
    const q = newQuestion("coding" as never, { examQuestionId: "c" }) as unknown as Record<string, unknown>;
    expect(q.questionTypeVersion).toBe(2);
    const c = q.coding as Cfg;
    expect(c).toMatchObject({ allowedLanguages: ["python"], defaultLanguage: "python", taskMode: "program", inputMode: "stdin", outputMode: "stdout", publicTests: [], starterCode: {} });
    const m = await cq();
    expect(c.limits).toEqual(m.DEFAULT_CODING_LIMITS);
    expect(q.answer).toEqual({ hiddenTests: [], comparator: "trimTrailingWhitespace", referenceSolutions: {}, compileErrorPolicy: "manualReview" });   // 17F-C2: new authoring defaults to teacher review
    expect(codes(q)).toEqual([]);                                                                  // a fresh question is finalizable as manual-only
  });
  it("the initial-graph default literal equals the shared authority (parity) and the source limit is 64 KB", async () => {
    const m = await cq();
    expect(m.DEFAULT_CODING_LIMITS).toEqual({ sourceBytes: 65536, outputBytes: 65536, timeMs: 2000, memoryMb: 256 });
    expect(m.defaultCodingConfig()).toEqual((newQuestion("coding" as never) as unknown as Record<string, unknown>).coding);
    expect(m.CODE_SOURCE_MAX_BYTES).toBe(65536);
  });
});

describe("C8 / C9 — source is TEXT: preserved byte-for-byte, and bounded", () => {
  const tricky = "# تعليق عربي — Unicode ✓ 😀\r\ndef f(x):\r\n\tif x:\n        return  x   \n\n\n";
  it("normalizeCodeAnswer never trims, never re-indents, never rewrites line endings, keeps Unicode / emoji / Arabic comments", async () => {
    const m = await cq();
    const r = m.normalizeCodeAnswer({ kind: "code", language: "python", languageVersion: 1, source: tricky });
    expect(r.ok).toBe(true);
    expect((r as { answer: { source: string } }).answer.source).toBe(tricky);
    expect(JSON.parse(JSON.stringify(r)).answer.source).toBe(tricky);
  });
  it("utf8ByteLength counts UTF-8 bytes (Arabic 2, BMP symbols 3, astral 4)", async () => {
    const m = await cq();
    expect(m.utf8ByteLength("abc")).toBe(3); expect(m.utf8ByteLength("عربي")).toBe(8); expect(m.utf8ByteLength("✓")).toBe(3); expect(m.utf8ByteLength("😀")).toBe(4);
    expect(m.utf8ByteLength("a😀ب")).toBe(new TextEncoder().encode("a😀ب").length);
  });
  it("a source above 64 KB (UTF-8 bytes, not characters) is REFUSED; exactly 64 KB is accepted", async () => {
    const m = await cq();
    expect(m.normalizeCodeAnswer({ kind: "code", language: "python", languageVersion: 1, source: "x".repeat(65536) }).ok).toBe(true);
    expect(m.normalizeCodeAnswer({ kind: "code", language: "python", languageVersion: 1, source: "x".repeat(65537) })).toEqual({ ok: false, code: "CODE_SOURCE_TOO_LARGE" });
    expect(m.normalizeCodeAnswer({ kind: "code", language: "python", languageVersion: 1, source: "ب".repeat(32769) })).toEqual({ ok: false, code: "CODE_SOURCE_TOO_LARGE" });   // 65538 bytes
  });
  it("malformed code answers are refused (non-string source, bad language identifier, bad version)", async () => {
    const m = await cq();
    expect(m.normalizeCodeAnswer({ kind: "code", language: "python", languageVersion: 1, source: ["x"] }).ok).toBe(false);
    expect(m.normalizeCodeAnswer({ kind: "code", language: "../x", languageVersion: 1, source: "x" }).ok).toBe(false);
    expect(m.normalizeCodeAnswer({ kind: "code", language: "python", languageVersion: 0, source: "x" }).ok).toBe(false);
    expect(m.normalizeCodeAnswer({ kind: "code", language: "python", languageVersion: 1.5, source: "x" }).ok).toBe(false);
    expect(m.normalizeCodeAnswer(null).ok).toBe(false);
  });
  it("server normalization is bound to the REGISTRY: only python@1 / java@1 / csharp@1 are valid; any other regex-valid key or version fails", async () => {
    const m = await cq();
    for (const language of LANGS) expect(m.normalizeCodeAnswer({ kind: "code", language, languageVersion: 1, source: "x" }).ok, language).toBe(true);
    for (const language of [...UNSUPPORTED, "ruby"]) expect(m.normalizeCodeAnswer({ kind: "code", language, languageVersion: 1, source: "x" }), language).toEqual({ ok: false, code: "CODE_ANSWER_INVALID" });
    for (const language of LANGS) expect(m.normalizeCodeAnswer({ kind: "code", language, languageVersion: 2, source: "x" }), language + "@2").toEqual({ ok: false, code: "CODE_ANSWER_INVALID" });
  });
});

describe("C10 / C11 / C24 / C43 — finalization blocks every malformed coding configuration", () => {
  it("a complete configuration has no issue; the exam can be finalized", () => {
    expect(codes({ coding: cfg(), answer: key() })).toEqual([]);
    expect(evaluateExamFinalization(exam([codingQ()])).canFinalize).toBe(true);
  });
  it("C10 unknown language → CODING_LANGUAGE_UNKNOWN (never silently converted to another language); duplicates refused", () => {
    expect(codes({ coding: cfg({ allowedLanguages: ["python", "cobol"] }), answer: key() })).toContain("CODING_LANGUAGE_UNKNOWN");
    expect(codes({ coding: cfg({ allowedLanguages: ["python", "python"] }), answer: key() })).toContain("CODING_LANGUAGE_DUPLICATE");
    expect(codes({ coding: cfg({ allowedLanguages: [], defaultLanguage: "" }), answer: key() })).toContain("CODING_NO_LANGUAGES");
  });
  it("C11 default language must be one of the allowed languages", () => {
    expect(codes({ coding: cfg({ defaultLanguage: "java" }), answer: key() })).toEqual(["CODING_DEFAULT_LANGUAGE_INVALID"]);
    expect(codes({ coding: cfg({ defaultLanguage: undefined }), answer: key() })).toEqual(["CODING_DEFAULT_LANGUAGE_INVALID"]);
  });
  it("C24 missing / malformed config fails closed; unknown keys inside the PUBLIC config block (nothing can be smuggled to students)", () => {
    expect(codes({ answer: key() })).toEqual(["CODING_CONFIG_MISSING"]);
    expect(codes({ coding: "python", answer: key() })).toEqual(["CODING_CONFIG_MISSING"]);
    expect(codes({ coding: cfg({ hiddenTests: [] }), answer: key() })).toContain("CODING_CONFIG_UNKNOWN_KEY");
    expect(codes({ coding: cfg({ taskMode: "function" }), answer: key() })).toContain("CODING_TASK_MODE_UNSUPPORTED");
    expect(codes({ coding: cfg({ inputMode: "file" }), answer: key() })).toContain("CODING_TASK_MODE_UNSUPPORTED");
  });
  it("limits must be bounded integers (source 1–64 KB, output ≤ 256 KB, time 250–10000 ms, memory 16–512 MB)", () => {
    const lim = (l: Cfg) => codes({ coding: cfg({ limits: { sourceBytes: 65536, outputBytes: 65536, timeMs: 2000, memoryMb: 256, ...l } }), answer: key() });
    expect(lim({ sourceBytes: 70000 })).toEqual(["CODING_LIMIT_INVALID"]); expect(lim({ sourceBytes: 0 })).toEqual(["CODING_LIMIT_INVALID"]);
    expect(lim({ outputBytes: 300000 })).toEqual(["CODING_LIMIT_INVALID"]); expect(lim({ timeMs: 100 })).toEqual(["CODING_LIMIT_INVALID"]);
    expect(lim({ timeMs: 20000 })).toEqual(["CODING_LIMIT_INVALID"]); expect(lim({ memoryMb: 1024 })).toEqual(["CODING_LIMIT_INVALID"]);
    expect(lim({ memoryMb: 8 })).toEqual(["CODING_LIMIT_INVALID"]); expect(lim({ timeMs: 1.5 })).toEqual(["CODING_LIMIT_INVALID"]);
    expect(lim({ timeMs: Number.POSITIVE_INFINITY })).toEqual(["CODING_LIMIT_INVALID"]);
    expect(codes({ coding: cfg({ limits: undefined }), answer: key() })).toEqual(["CODING_LIMIT_INVALID"]);
  });
  it("starter code only for allowed languages and within the source limit", () => {
    expect(codes({ coding: cfg({ starterCode: { java: "class Main {}" } }), answer: key() })).toEqual(["CODING_STARTER_LANGUAGE_NOT_ALLOWED"]);
    expect(codes({ coding: cfg({ starterCode: { python: "x".repeat(2000) }, limits: { sourceBytes: 1024, outputBytes: 65536, timeMs: 2000, memoryMb: 256 } }), answer: key() })).toEqual(["CODING_STARTER_TOO_LARGE"]);
    expect(codes({ coding: cfg({ starterCode: { python: 5 } }), answer: key() })).toEqual(["CODING_STARTER_INVALID"]);
  });
  it("C16 duplicate test ids (across public AND hidden) block; malformed ids block", () => {
    expect(codes({ coding: cfg(), answer: key({ hiddenTests: [{ id: "pub-1", input: "", expectedOutput: "", weight: 1 }] }) })).toContain("CODING_TEST_ID_DUPLICATE");
    expect(codes({ coding: cfg(), answer: key({ hiddenTests: [{ id: "h", input: "", expectedOutput: "", weight: 1 }, { id: "h", input: "", expectedOutput: "", weight: 1 }] }) })).toContain("CODING_TEST_ID_DUPLICATE");
    expect(codes({ coding: cfg({ publicTests: [{ id: "bad id!", input: "" }] }), answer: key() })).toContain("CODING_TEST_ID_INVALID");
    expect(codes({ coding: cfg({ publicTests: [{ input: "" }] }), answer: key() })).toContain("CODING_TEST_ID_INVALID");
  });
  it("C17 weights must be finite and non-negative, and hidden tests need a positive total weight", () => {
    const w = (weight: unknown) => codes({ coding: cfg(), answer: key({ hiddenTests: [{ id: "h1", input: "", expectedOutput: "", weight }] }) });
    expect(w(-1)).toContain("CODING_WEIGHT_INVALID"); expect(w(Number.NaN)).toContain("CODING_WEIGHT_INVALID"); expect(w(Number.POSITIVE_INFINITY)).toContain("CODING_WEIGHT_INVALID");
    expect(w("2")).toContain("CODING_WEIGHT_INVALID"); expect(w(0)).toContain("CODING_WEIGHT_TOTAL_ZERO"); expect(w(0.5)).toEqual([]);
  });
  it("too many / oversized tests block (public ≤ 10, hidden ≤ 50, input / output ≤ 16 KB each, total test data ≤ 256 KB)", () => {
    const pubs = Array.from({ length: 11 }, (_, i) => ({ id: "p" + i, input: "" }));
    expect(codes({ coding: cfg({ publicTests: pubs }), answer: key() })).toContain("CODING_TOO_MANY_PUBLIC_TESTS");
    const hids = Array.from({ length: 51 }, (_, i) => ({ id: "h" + i, input: "", expectedOutput: "", weight: 1 }));
    expect(codes({ coding: cfg(), answer: key({ hiddenTests: hids }) })).toContain("CODING_TOO_MANY_HIDDEN_TESTS");
    expect(codes({ coding: cfg({ publicTests: [{ id: "p", input: "x".repeat(16385) }] }), answer: key() })).toContain("CODING_TEST_TOO_LARGE");
    expect(codes({ coding: cfg(), answer: key({ hiddenTests: [{ id: "h", input: "", expectedOutput: "y".repeat(16385), weight: 1 }] }) })).toContain("CODING_TEST_TOO_LARGE");
    const big = Array.from({ length: 20 }, (_, i) => ({ id: "h" + i, input: "x".repeat(16000), expectedOutput: "", weight: 1 }));
    expect(codes({ coding: cfg(), answer: key({ hiddenTests: big }) })).toContain("CODING_TEST_DATA_TOO_LARGE");
  });
  it("malformed hidden tests and unknown comparators block; reference solutions only for allowed languages", () => {
    expect(codes({ coding: cfg(), answer: key({ hiddenTests: [{ id: "h", input: 5, expectedOutput: "", weight: 1 }] }) })).toContain("CODING_TEST_MALFORMED");
    expect(codes({ coding: cfg(), answer: key({ hiddenTests: "all" }) })).toContain("CODING_TEST_MALFORMED");
    expect(codes({ coding: cfg(), answer: key({ comparator: "fuzzy" }) })).toEqual(["CODING_COMPARATOR_UNKNOWN"]);
    expect(codes({ coding: cfg(), answer: key({ referenceSolutions: { java: "class A{}" } }) })).toEqual(["CODING_REFERENCE_LANGUAGE_NOT_ALLOWED"]);
  });
  it("hidden tests are NOT required (manual-only grading in 17A) — an empty private key is valid", () => {
    expect(codes({ coding: cfg({ publicTests: [] }), answer: { hiddenTests: [], comparator: "trimTrailingWhitespace", referenceSolutions: {} } })).toEqual([]);
    expect(codes({ coding: cfg({ publicTests: [] }), answer: {} })).toEqual([]);
  });
  it("V1 fail-closed: JavaScript / TypeScript / C++ / SQL are rejected by finalization with CODING_LANGUAGE_UNKNOWN — no silent migration, no fallback to Python", () => {
    const manualOnly = { hiddenTests: [], comparator: "trimTrailingWhitespace", referenceSolutions: {} };
    for (const l of UNSUPPORTED) {
      const issues = codes({ coding: cfg({ allowedLanguages: [l], defaultLanguage: l, starterCode: {}, publicTests: [] }), answer: manualOnly });
      expect(issues, l).toContain("CODING_LANGUAGE_UNKNOWN");
      expect(evaluateExamFinalization(exam([codingQ({ coding: cfg({ allowedLanguages: [l], defaultLanguage: l, starterCode: {}, publicTests: [] }), answer: manualOnly } as never)])).canFinalize, l).toBe(false);
    }
    expect(codes({ coding: cfg({ allowedLanguages: ["python", "sql"] }), answer: key() })).toContain("CODING_LANGUAGE_UNKNOWN");
  });
  it("the same codes surface through structural validation as BLOCKING errors and stop finalization (client == shared server build)", () => {
    const bad = validateStructuredExam(exam([codingQ({ coding: cfg({ defaultLanguage: "cobol" }) } as never)]));
    expect(bad.some(i => i.code === "CODING_DEFAULT_LANGUAGE_INVALID" && i.severity === "error")).toBe(true);
    const decision = evaluateExamFinalization(exam([codingQ({ coding: cfg({ allowedLanguages: ["cobol"], defaultLanguage: "cobol" }) } as never)]));
    expect(decision.canFinalize).toBe(false);
  });
  it("a compound part of type coding is refused (V1: not compound-capable)", () => {
    expect(validateQuestionTypeNode({ coding: cfg(), answer: key() }, "coding", 1, { part: true }).map(i => i.code)).toContain("TYPE_NOT_COMPOUND_CAPABLE");
  });
});

describe("C12 / C13 / C14 — student projection of the public config (pure, shared with the server sanitizer)", () => {
  it("keeps allowed languages, default, starter code, public tests (id / title / input / sampleOutput) and limits; drops anything else", async () => {
    const m = await cq();
    const p = m.projectCodingConfigForStudent({ ...cfg(), hiddenTests: [{ id: "x", expectedOutput: "SECRET" }], referenceSolution: "SECRET", teacherNotes: "SECRET", grading: { weights: [1] }, publicTests: [{ id: "pub-1", title: "مثال", input: "2 3\n", sampleOutput: "5\n", weight: 3, expectedOutput: "SECRET" }] });
    expect(p).toEqual({ allowedLanguages: ["python", "csharp"], defaultLanguage: "python", starterCode: { python: "a, b = map(int, input().split())\n" }, taskMode: "program", inputMode: "stdin", outputMode: "stdout", limits: { sourceBytes: 65536, outputBytes: 65536, timeMs: 2000, memoryMb: 256 }, publicTests: [{ id: "pub-1", title: "مثال", input: "2 3\n", sampleOutput: "5\n" }] });
    expect(JSON.stringify(p)).not.toContain("SECRET");
    expect(m.projectCodingConfigForStudent("nope")).toBeUndefined();
  });
  it("the projection keeps ONLY registered languages: stale javascript / cpp / sql entries and their starter code never reach a student", async () => {
    const m = await cq();
    const p = m.projectCodingConfigForStudent({ ...cfg(), allowedLanguages: ["python", "javascript", "cpp", "sql", "csharp", 7], starterCode: { python: "p\n", javascript: "STALE-JS", cpp: "STALE-CPP", sql: "STALE-SQL", csharp: "using System;\n" } })!;
    expect(p.allowedLanguages).toEqual(["python", "csharp"]);
    expect(p.starterCode).toEqual({ python: "p\n", csharp: "using System;\n" });
    expect(JSON.stringify(p)).not.toMatch(/STALE/);
  });
});

describe("C15 — stable test ids survive reorder / duplicate / edit (never the array index)", () => {
  it("moveCodingTest / duplicateCodingTest / updateCodingTest / removeCodingTest keep every surviving id byte-for-byte", async () => {
    const m = await ct();
    const list = [{ id: "t-a", input: "1" }, { id: "t-b", input: "2" }, { id: "t-c", input: "3" }];
    const moved = m.moveCodingTest(list, "t-c", -2);
    expect(moved.map(t => t.id)).toEqual(["t-c", "t-a", "t-b"]);
    expect(moved.map(t => t.input)).toEqual(["3", "1", "2"]);
    const dup = m.duplicateCodingTest(moved, "t-a", () => "t-new");
    expect(dup.map(t => t.id)).toEqual(["t-c", "t-a", "t-new", "t-b"]); expect(dup[2].input).toBe("1");
    expect(m.updateCodingTest(dup, "t-b", { input: "9" }).map(t => [t.id, t.input])).toEqual([["t-c", "3"], ["t-a", "1"], ["t-new", "1"], ["t-b", "9"]]);
    expect(m.removeCodingTest(dup, "t-a").map(t => t.id)).toEqual(["t-c", "t-new", "t-b"]);
    expect(m.moveCodingTest(list, "t-a", -1)).toBe(list);                                          // out of range → unchanged
  });
});

describe("C18 / C19 / C20 — the pure output-comparison contract", () => {
  it("C18 exact: byte-for-byte (a trailing newline or CRLF difference fails)", async () => {
    const m = await cc();
    expect(m.compareOutput("5\n", "5\n", "exact")).toBe(true);
    expect(m.compareOutput("5", "5\n", "exact")).toBe(false);
    expect(m.compareOutput("5\r\n", "5\n", "exact")).toBe(false);
    expect(m.compareOutput("a  b", "a b", "exact")).toBe(false);
  });
  it("C19 trimTrailingWhitespace: CRLF/CR → LF, trailing spaces/tabs per line removed, final trailing newlines removed; INTERNAL spaces and leading indentation preserved", async () => {
    const m = await cc();
    expect(m.normalizeOutput("a  b \t\r\n  c\r\n\r\n\n", "trimTrailingWhitespace")).toBe("a  b\n  c");
    expect(m.compareOutput("5   \r\n", "5", "trimTrailingWhitespace")).toBe(true);
    expect(m.compareOutput("a  b\n", "a b\n", "trimTrailingWhitespace")).toBe(false);          // never collapses internal spaces
    expect(m.compareOutput("  x\n", "x\n", "trimTrailingWhitespace")).toBe(false);             // leading indentation is significant
    expect(m.compareOutput("1\n\n2\n", "1\n2\n", "trimTrailingWhitespace")).toBe(false);       // internal blank lines are significant
    expect(m.compareOutput("x\r", "x", "trimTrailingWhitespace")).toBe(true);
  });
  it("C20 normalizeWhitespace (explicit opt-in): every whitespace run → one space, then trimmed", async () => {
    const m = await cc();
    expect(m.normalizeOutput("  1   2\t3\r\n4 \n", "normalizeWhitespace")).toBe("1 2 3 4");
    expect(m.compareOutput("1\n2\n", "1 2", "normalizeWhitespace")).toBe(true);
    expect(m.compareOutput("12", "1 2", "normalizeWhitespace")).toBe(false);
  });
  it("the default is trimTrailingWhitespace; an unknown mode never matches (no fuzzy / AI comparison)", async () => {
    const m = await cc(), q = await cq();
    expect(q.DEFAULT_CODING_COMPARATOR).toBe("trimTrailingWhitespace");
    expect(q.CODING_COMPARATORS).toEqual(["exact", "trimTrailingWhitespace", "normalizeWhitespace"]);
    expect(m.compareOutput("5", "5", "fuzzy" as never)).toBe(false);
  });
  it("weightedPassFraction (17B building block, NOT wired to official marks): passedWeight / totalWeight over the hidden tests, by id", async () => {
    const m = await cc();
    const tests = [{ id: "a", weight: 2 }, { id: "b", weight: 3 }, { id: "c", weight: 5 }];
    expect(m.weightedPassFraction(tests, [{ testId: "a", passed: true }, { testId: "b", passed: false }, { testId: "c", passed: true }])).toBeCloseTo(0.7);
    expect(m.weightedPassFraction(tests, [{ testId: "zzz", passed: true }])).toBe(0);
    expect(m.weightedPassFraction([], [])).toBe(0);
  });
});

describe("C25 — type change removes every coding secret", () => {
  it("coding → multipleChoice keeps identity, prompt, marks, assessmentMeta, media; drops coding + hidden tests + reference solutions", () => {
    const q = codingQ({ assessmentMeta: { difficulty: "hard" } as never, image: { exists: true, visible: true, assets: [{ dataUrl: "data:image/png;base64,AA" }] } as never });
    const next = changeQuestionType(q, "multipleChoice") as unknown as Record<string, unknown>;
    expect(next.examQuestionId).toBe("c1"); expect(next.text).toBe(q.text); expect(next.marks).toBe(10);
    expect(next.assessmentMeta).toEqual({ difficulty: "hard" }); expect(next.image).toEqual(q.image);
    expect(next.coding).toBeUndefined(); expect(next.questionTypeVersion).toBeUndefined();
    expect(JSON.stringify(next)).not.toMatch(/hiddenTests|referenceSolutions|hid-1|print\(a \+ b\)/);
  });
  it("multipleChoice → coding gets the fresh coding defaults and no previous answer key", () => {
    const mc = newQuestion("multipleChoice", { examQuestionId: "m1", text: "س", marks: 2 });
    const next = changeQuestionType({ ...mc, answer: { correctOptionIndex: 1 } } as BuilderQuestion, "coding" as never) as unknown as Record<string, unknown>;
    expect(next.questionTypeVersion).toBe(2);   // 17F-C2 RF1: a NEW coding question is coding@2
    expect(next.answer).toEqual({ hiddenTests: [], comparator: "trimTrailingWhitespace", referenceSolutions: {}, compileErrorPolicy: "manualReview" });
    expect(next.options).toBeUndefined();
  });
});

describe("C26 — duplicate / move / clone / JSON round-trip preserve the exact coding config (hidden test ids stable)", () => {
  it("every builder operation keeps coding + answer byte-for-byte", () => {
    const q = codingQ();
    const sections = [...exam([q]).sections, newSection({ id: "sec-2" })];
    const dup = duplicateQuestion(sections, "sec-1", "c1")[0].questions;
    expect(dup.length).toBe(2); expect(dup[1].examQuestionId).not.toBe("c1");
    expect((dup[1] as unknown as Cfg).coding).toEqual(cfg()); expect(dup[1].answer).toEqual(key());
    const moved = moveQuestion(duplicateQuestion(sections, "sec-1", "c1"), "sec-1", "c1", 1)[0].questions[1] as unknown as Cfg;
    expect(moved.coding).toEqual(cfg());
    const across = moveQuestionToSection(sections, "sec-1", "c1", "sec-2")[1].questions[0] as unknown as Cfg;
    expect(across.coding).toEqual(cfg()); expect(across.answer).toEqual(key()); expect(across.questionTypeVersion).toBe(1);
    expect((cloneQuestionWithNewIds(q) as unknown as Cfg).answer).toEqual(key());
    expect(JSON.parse(JSON.stringify(q))).toEqual(q);
  });
});

describe("C35 — catalog-driven integration: Blueprint ref / five domains", () => {
  it("coding is a valid questionType ref for the existing Blueprint dimension (no second coding-specific blueprint system)", async () => {
    const at = await load<{ isKnownQuestionType?: unknown }>("../questionTypeCatalog");
    expect((at as { isKnownQuestionType: (k: string) => boolean }).isKnownQuestionType("coding")).toBe(true);
  });
  it("five domain examples (algorithms, networking automation, mathematics, physics, data analysis) are all valid with the SAME type and rules — nothing branches on a subject", () => {
    const tasks: [string, Cfg, Cfg][] = [
      ["خوارزميات: رتّب الأعداد تصاعديًا", { allowedLanguages: ["java", "csharp"], defaultLanguage: "java", publicTests: [{ id: "a1", input: "3\n3 1 2\n", sampleOutput: "1 2 3\n" }] }, { hiddenTests: [{ id: "a2", input: "1\n5\n", expectedOutput: "5\n", weight: 1 }] }],
      ["أتمتة الشبكات: احسب عنوان الشبكة من IP/CIDR", { allowedLanguages: ["python"], defaultLanguage: "python", publicTests: [{ id: "n1", input: "192.168.1.77/24\n", sampleOutput: "192.168.1.0\n" }] }, { hiddenTests: [{ id: "n2", input: "10.0.5.9/16\n", expectedOutput: "10.0.0.0\n", weight: 2 }] }],
      ["رياضيات: القاسم المشترك الأكبر", { allowedLanguages: ["python", "csharp"], defaultLanguage: "python", publicTests: [{ id: "m1", input: "12 18\n", sampleOutput: "6\n" }] }, { hiddenTests: [] }],
      ["فيزياء: السرعة النهائية v = u + a·t", { allowedLanguages: ["csharp"], defaultLanguage: "csharp", publicTests: [{ id: "p1", input: "0 9.8 2\n", sampleOutput: "19.6\n" }] }, { hiddenTests: [{ id: "p2", input: "5 2 3\n", expectedOutput: "11\n", weight: 1 }], comparator: "normalizeWhitespace" }],
      ["تحليل بيانات: المتوسط والوسيط", { allowedLanguages: ["python", "java"], defaultLanguage: "python", publicTests: [{ id: "d1", input: "5\n1 2 3 4 10\n", sampleOutput: "4.0 3\n" }] }, { hiddenTests: [{ id: "d2", input: "1\n7\n", expectedOutput: "7.0 7\n", weight: 4 }], comparator: "exact" }]
    ];
    for (const [text, c, k] of tasks) {
      const node = { text, coding: cfg({ starterCode: {}, ...c }), answer: { comparator: "trimTrailingWhitespace", referenceSolutions: {}, ...k } };
      expect(codes(node), text).toEqual([]);
    }
  });
});
