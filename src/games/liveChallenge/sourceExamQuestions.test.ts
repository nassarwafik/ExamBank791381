import { describe, it, expect } from "vitest";
import { questionsFromSourceExam, questionPreviewText, parseExamJsonForChallenge, JSON_IMPORT_MESSAGES } from "./sourceExamQuestions";
import { MAX_IMPORT_BYTES, parseStructuredExamJson } from "../../structuredExamImport";
import type { BuilderQuestion } from "../../examTypes";

// The ONE authoritative exam → importable-questions boundary for the Live Challenge (saved exams + local JSON).
const mcq = (id: string, text: string, extra: Record<string, unknown> = {}) =>
  ({ examQuestionId: id, presentationType: "multipleChoice", text, marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 1 }, ...extra });
const deepFreeze = <T,>(o: T): T => { if (o && typeof o === "object") { Object.values(o as object).forEach(deepFreeze); Object.freeze(o); } return o; };

const RICH = {
  examQuestionId: "rich", presentationType: "compound", text: "سؤال مركّب", marks: 6, displayNumber: "٣",
  image: { exists: true, visible: true, assets: [{ dataUrl: "data:image/png;base64,AAAA" }] },
  parts: [
    { id: "p1", type: "cliFill", text: "أكمل", cli: "Router(config)# ___", fields: [{ id: "f1", correct: "hostname" }] },
    { id: "p2", type: "tableFill", tableHeaders: ["أ", "ب"], tableRows: [["1", ""]], fields: [{ id: "c", row: 0, column: 1, correct: "2" }] },
  ],
};

describe("questionsFromSourceExam — structured sections[].questions[]", () => {
  it("returns every question across sections, in source order, with content preserved", () => {
    const exam = { examId: "E1", sections: [{ id: "s1", questions: [mcq("a", "أول"), RICH] }, { id: "s2", questions: [mcq("b", "ثالث")] }] };
    const r = questionsFromSourceExam(exam);
    expect(r).toMatchObject({ status: "ok", shape: "structured", skipped: 0 });
    expect(r.questions.map(q => q.examQuestionId)).toEqual(["a", "rich", "b"]);
    expect(r.questions[1]).toEqual(RICH);                                   // compound / CLI / table / image / marks intact
  });
});

describe("questionsFromSourceExam — legacy questions[] (THE saved-exam bug)", () => {
  it("returns the legacy flat questions (previously 0 → «لا توجد أسئلة قابلة للاستيراد…» although the list said N)", () => {
    const legacy = { examId: "L1", title: "قديم", questions: [mcq("EQ-001", "س1"), mcq("EQ-002", "س2"), mcq("EQ-003", "س3")] };
    const r = questionsFromSourceExam(legacy);
    expect(r).toMatchObject({ status: "ok", shape: "legacy", skipped: 0 });
    expect(r.questions.map(q => q.text)).toEqual(["س1", "س2", "س3"]);
    expect(r.questions[0].answer).toEqual({ correctOptionIndex: 1 });
  });
  it("resolves real legacy type values through the canonical alias table: generated «open» → shortAnswer; old `type`-only entries", () => {
    const legacy = { questions: [
      { examQuestionId: "EQ-1", presentationType: "open", text: "اشرح", marks: 3 },
      { examQuestionId: "EQ-2", presentationType: "fillBlank", text: "أكمل", marks: 2, fields: [{ id: "f" }] },
      { examQuestionId: "EQ-3", type: "mcq", text: "اختر", marks: 1, options: [{ text: "x" }] },
    ] };
    const r = questionsFromSourceExam(legacy);
    expect(r.questions.map(q => q.presentationType)).toEqual(["shortAnswer", "fillBlank", "multipleChoice"]);
  });
});

describe("questionsFromSourceExam — contracts", () => {
  it("never mutates the source exam (deep-frozen input; returned objects are copies)", () => {
    const exam = deepFreeze({ sections: [{ questions: [mcq("a", "x", { presentationType: "mcq" })] }] });
    const before = JSON.stringify(exam);
    const r = questionsFromSourceExam(exam);
    expect(JSON.stringify(exam)).toBe(before);
    expect(r.questions[0].presentationType).toBe("multipleChoice");
    (r.questions[0].options as { text: string }[])[0].text = "changed";                 // the copy is independent
    expect(exam.sections[0].questions[0].options[0].text).toBe("أ");
    const legacy = deepFreeze({ questions: [mcq("l", "y")] });
    expect(() => questionsFromSourceExam(legacy)).not.toThrow();
    expect(JSON.stringify(legacy)).toBe(JSON.stringify({ questions: [mcq("l", "y")] }));
  });
  it("returns only canonical supported questions; unsupported entries are counted as skipped", () => {
    const r = questionsFromSourceExam({ sections: [{ questions: [mcq("a", "ok"), { examQuestionId: "z", presentationType: "hologram", text: "?" }, "junk", null] }] });
    expect(r.status).toBe("ok");
    expect(r.questions.map(q => q.examQuestionId)).toEqual(["a"]);
    expect(r.skipped).toBe(3);
  });
  it("genuinely empty exams are «empty»; unrecognizable data is «unrecognized» — never confused", () => {
    expect(questionsFromSourceExam({ sections: [{ questions: [] }, { questions: [] }] }).status).toBe("empty");
    expect(questionsFromSourceExam({ questions: [] }).status).toBe("empty");
    expect(questionsFromSourceExam({ title: "بلا أسئلة" }).status).toBe("unrecognized");
    expect(questionsFromSourceExam(null).status).toBe("unrecognized");
    expect(questionsFromSourceExam({ questions: [{ presentationType: "hologram" }, 5] })).toMatchObject({ status: "unrecognized", skipped: 2 });
  });
  it("fills the minimum canonical fields (id, text, marks) without altering the rest", () => {
    const r = questionsFromSourceExam({ questions: [{ presentationType: "trueFalse", points: 4 }] });
    const q = r.questions[0] as BuilderQuestion;
    expect(q.examQuestionId).toMatch(/\S/);
    expect(q.text).toBe("");
    expect(q.marks).toBe(4);
  });
  it("questionPreviewText: one readable line, truncated; compound falls back to its first part", () => {
    expect(questionPreviewText({ ...mcq("a", "  سطر\n  ثانٍ  ") } as unknown as BuilderQuestion)).toBe("سطر ثانٍ");
    expect(questionPreviewText({ ...mcq("a", "x".repeat(300)) } as unknown as BuilderQuestion, 20)).toHaveLength(20);
    expect(questionPreviewText({ ...RICH, text: "" } as unknown as BuilderQuestion)).toBe("أكمل");
  });
});

describe("parseExamJsonForChallenge — the JSON import boundary (reuses parseStructuredExamJson)", () => {
  const structured = { examId: "S-9", title: "امتحان JSON", sections: [{ id: "s", title: "", gradingPolicy: "all", questions: [mcq("a", "أ"), mcq("b", "ب")] }] };
  it("canonical Structured Exam JSON", () => {
    const r = parseExamJsonForChallenge(JSON.stringify(structured), "exam.json");
    expect(r).toMatchObject({ ok: true, title: "امتحان JSON", sourceId: "json:S-9", shape: "structured" });
    if (r.ok) expect(r.questions.map(q => q.text)).toEqual(["أ", "ب"]);
  });
  it("legacy flat JSON", () => {
    const r = parseExamJsonForChallenge(JSON.stringify({ examId: "L", title: "قديم", questions: [mcq("x", "س")] }), "old.json");
    expect(r).toMatchObject({ ok: true, title: "قديم", shape: "legacy" });
  });
  it("the saved-exam wrapper { exam: … } (structured and legacy)", () => {
    expect(parseExamJsonForChallenge(JSON.stringify({ exam: structured, savedAt: "x" }), "w.json")).toMatchObject({ ok: true, shape: "structured", title: "امتحان JSON" });
    expect(parseExamJsonForChallenge(JSON.stringify({ exam: { title: "ل", questions: [mcq("x", "س")] } }), "w.json")).toMatchObject({ ok: true, shape: "legacy" });
  });
  it("malformed JSON → the exact Arabic message", () => {
    expect(parseExamJsonForChallenge("{ not json", "bad.json")).toEqual({ ok: false, error: JSON_IMPORT_MESSAGES.malformed });
  });
  it("oversized content → rejected before parsing", () => {
    const big = JSON.stringify({ title: "x".repeat(MAX_IMPORT_BYTES) });
    expect(parseExamJsonForChallenge(big, "big.json")).toEqual({ ok: false, error: JSON_IMPORT_MESSAGES.tooLarge });
  });
  it("valid exam with zero questions → «no importable questions» (not a generic empty state)", () => {
    expect(parseExamJsonForChallenge(JSON.stringify({ title: "ف", sections: [{ questions: [] }] }), "e.json")).toEqual({ ok: false, error: JSON_IMPORT_MESSAGES.noQuestions });
    expect(parseExamJsonForChallenge(JSON.stringify({ title: "ف", questions: [] }), "e.json")).toEqual({ ok: false, error: JSON_IMPORT_MESSAGES.noQuestions });
  });
  it("no recognizable exam → «no valid exam in the file»", () => {
    for (const v of [[1, 2], "text", 42, { hello: "world" }, { exam: { hello: 1 } }]) {
      expect(parseExamJsonForChallenge(JSON.stringify(v), "x.json")).toEqual({ ok: false, error: JSON_IMPORT_MESSAGES.noExam });
    }
  });
  it("unsupported question type → the existing parser's concise reason, for structured AND legacy alike", () => {
    const bad = { title: "خطأ", sections: [{ questions: [{ examQuestionId: "q", presentationType: "hologram", text: "?", marks: 1 }] }] };
    for (const json of [JSON.stringify(bad), JSON.stringify({ questions: [{ presentationType: "hologram" }] })]) {
      const r = parseExamJsonForChallenge(json, "bad.json");
      expect(r.ok).toBe(false);
      if (!r.ok) { expect(r.error).toContain("تعذّر استيراد الامتحان من الملف"); expect(r.error).toContain("hologram"); }
    }
  });
  it("is data-only: HTML/script/URL strings stay inert text in the question", () => {
    const evil = { title: "<script>alert(1)</script>", questions: [mcq("x", "<img src=x onerror=alert(1)> https://evil.example")] };
    const r = parseExamJsonForChallenge(JSON.stringify(evil), "e.json");
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.questions[0].text).toBe("<img src=x onerror=alert(1)> https://evil.example"); expect(r.title).toBe("<script>alert(1)</script>"); }
  });
});

// Review fix: a LEGACY local file must cross the SAME structured-import security boundary as a structured one — the
// existing parseStructuredExamJson (and its image sanitizer) — never a second sanitizer in the Live Challenge.
describe("parseExamJsonForChallenge — legacy local JSON passes the existing parser/security boundary", () => {
  const PNG = "data:image/png;base64,iVBORw0KGgo=";
  const EXTERNAL = "https://example.invalid/image.png";
  const SVG = "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+";
  const HTML = "data:text/html,<script>alert(1)</script>";
  const assets = () => [{ dataUrl: EXTERNAL }, { dataUrl: SVG }, { dataUrl: HTML }, { dataUrl: PNG }];
  const imgQuestion = () => ({
    examQuestionId: "img", presentationType: "multipleChoice", text: "صورة", marks: 1, options: [{ text: "أ" }, { text: "ب" }],
    answer: { correctOptionIndex: 0 }, image: { exists: true, visible: true, assets: assets() }, images: assets(),
  });
  const imgCompound = () => ({
    examQuestionId: "cmp", presentationType: "compound", text: "مركّب", marks: 2,
    parts: [{ id: "p1", type: "shortAnswer", text: "جزء", marks: 2, image: { exists: true, visible: true, assets: assets() } }],
  });
  const renderable = (v: unknown) => JSON.stringify(v);
  const importOk = (json: string) => {
    const r = parseExamJsonForChallenge(json, "exam.json");
    expect(r.ok).toBe(true);
    return r.ok ? r.questions : [];
  };

  it("legacy: external https, SVG and data:text/html image sources are stripped; the safe raster data:image/png stays", () => {
    const qs = importOk(JSON.stringify({ title: "قديم", questions: [imgQuestion(), imgCompound()] }));
    const out = renderable(qs);
    expect(out).not.toContain("example.invalid");                     // external URL is not renderable (not kept at all)
    expect(out).not.toContain("svg");
    expect(out).not.toContain("text/html");
    const q = qs[0] as unknown as { image: { assets: Record<string, unknown>[] }; images: Record<string, unknown>[] };
    expect(q.image.assets.map(a => a.dataUrl ?? null)).toEqual([null, null, null, PNG]);   // image.assets[].dataUrl
    expect(q.images.map(a => a.dataUrl ?? null)).toEqual([null, null, null, PNG]);         // images[].dataUrl
    const part = (qs[1].parts as unknown as { image: { assets: Record<string, unknown>[] } }[])[0];
    expect(part.image.assets.map(a => a.dataUrl ?? null)).toEqual([null, null, null, PNG]); // compound parts too
  });

  it("src / url fields are stripped the same way (not just dataUrl)", () => {
    const qs = importOk(JSON.stringify({ questions: [{ ...imgQuestion(), image: { exists: true, visible: true, assets: [{ src: EXTERNAL }, { url: SVG }] }, images: [] }] }));
    expect(renderable(qs)).not.toMatch(/example\.invalid|svg/);
  });

  it("legacy behaves EXACTLY like the same exam imported as structured JSON (same parser output)", () => {
    const questions = [imgQuestion(), imgCompound()];
    const legacy = importOk(JSON.stringify({ title: "ت", questions }));
    const structured = importOk(JSON.stringify({ title: "ت", sections: [{ id: "s", title: "", gradingPolicy: "all", questions }] }));
    expect(legacy).toEqual(structured);
  });

  it("the legacy result IS the existing parser's output for the canonical legacyToStructured conversion", () => {
    const legacyExam = { title: "ق", questions: [imgQuestion()] };
    const qs = importOk(JSON.stringify(legacyExam));
    const direct = parseStructuredExamJson(JSON.stringify({ title: "ق", sections: [{ questions: [imgQuestion()] }] }), "x.json");
    expect(direct.canOpen).toBe(true);
    expect((qs[0] as unknown as { images: unknown }).images).toEqual((direct.exam!.sections[0].questions[0] as unknown as { images: unknown }).images);
  });

  it("preserves legacy semantics through the boundary: aliases, generated ids, points, compound/table/CLI/fields/answers, safe images", () => {
    const legacy = { examId: "OLD-1", title: "امتحان قديم", questions: [
      { presentationType: "open", text: "اشرح", points: 3 },                                    // alias + missing id + points
      { type: "mcq", text: "اختر", marks: 2, options: [{ text: "x" }, { text: "y" }], answer: { correctOptionIndex: 1 } },
      { examQuestionId: "EQ-3", presentationType: "fillBlank", text: "أكمل ___", marks: 1, fields: [{ id: "f1", correct: "كلمة" }] },
      RICH,
    ] };
    const r = parseExamJsonForChallenge(JSON.stringify(legacy), "old.json");
    expect(r).toMatchObject({ ok: true, title: "امتحان قديم", sourceId: "json:OLD-1", shape: "legacy", skipped: 0 });
    if (!r.ok) return;
    const [open, choice, fill, rich] = r.questions;
    expect(open.presentationType).toBe("shortAnswer");
    expect(open.examQuestionId).toMatch(/\S/);
    expect(open.marks).toBe(3);
    expect(choice.presentationType).toBe("multipleChoice");
    expect(choice.marks).toBe(2);
    expect(choice.answer).toEqual({ correctOptionIndex: 1 });
    expect(choice.options?.map(o => o.text)).toEqual(["x", "y"]);
    expect(fill.examQuestionId).toBe("EQ-3");
    expect(fill.fields).toEqual([expect.objectContaining({ id: "f1", correct: "كلمة" })]);
    expect(rich).toMatchObject({ examQuestionId: "rich", presentationType: "compound", marks: 6, displayNumber: "٣" });
    expect((rich.image as unknown as { assets: { dataUrl: string }[] }).assets[0].dataUrl).toBe("data:image/png;base64,AAAA");
    const [cli, table] = rich.parts as unknown as Record<string, unknown>[];
    expect(cli).toMatchObject({ id: "p1", type: "cliFill", cli: "Router(config)# ___" });
    expect(cli.fields).toEqual([expect.objectContaining({ id: "f1", correct: "hostname" })]);
    expect(table).toMatchObject({ id: "p2", type: "tableFill", tableHeaders: ["أ", "ب"], tableRows: [["1", ""]] });
    expect(table.fields).toEqual([expect.objectContaining({ id: "c", row: 0, column: 1, correct: "2" })]);
  });
});
