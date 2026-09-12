// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { gradeExam } from "../api/src/lib/assignment-grading.js";
import { sanitizeExamForStudent } from "../api/src/lib/student-exam-sanitize.js";
import { parseStructuredExamHtml, importStructuredExam } from "./structuredExamHtmlParser";
import { parseStructuredExamJson } from "./structuredExamImport";
import { toSavedStructuredExam } from "./examBuilderState";
import type { StructuredExam, BuilderQuestion } from "./examTypes";

const findQ = (exam: StructuredExam, id: string): BuilderQuestion | undefined => {
  for (const s of exam.sections) for (const q of s.questions) if (q.examQuestionId === id) return q;
  return undefined;
};

const EMBEDDED_EXAM = {
  title: "امتحان مضمّن",
  sections: [{ id: "core", gradingPolicy: "capScore", maxMarks: 60, questions: [{ examQuestionId: "q1", presentationType: "multipleChoice", text: "س", marks: 3, options: [{ text: "A" }, { text: "B" }], answer: { correctOptionIndex: 1 } }] }]
};

describe("HTML embedded JSON (Mode A)", () => {
  it("HTML-JSON 1: imports the exam from an embedded application/json script and ignores a normal <script>", () => {
    const html = `<!doctype html><html><body>
      <script>window.__pwned = true; alert('x');</script>
      <h1>امتحان</h1>
      <script type="application/json" id="exambank-structured-exam">${JSON.stringify(EMBEDDED_EXAM)}</script>
    </body></html>`;
    const r = parseStructuredExamHtml(html);
    expect(r.canOpen).toBe(true);
    expect(r.sourceKind).toBe("html-embedded-json");
    expect(r.format).toBe("html");
    expect(findQ(r.exam!, "q1")!.text).toBe("س");
    // DOMParser never executes scripts:
    expect((globalThis as { __pwned?: boolean }).__pwned).toBeUndefined();
  });

  it("HTML-JSON 2: embedded JSON matches the equivalent JSON-file import (same exam)", () => {
    const html = `<html><body><script type="application/json" id="exambank-structured-exam">${JSON.stringify(EMBEDDED_EXAM)}</script></body></html>`;
    const fromHtml = parseStructuredExamHtml(html).exam!;
    const fromJson = parseStructuredExamJson(JSON.stringify(EMBEDDED_EXAM)).exam!;
    // compare canonical content (ignore volatile examId/metadata.import)
    expect(JSON.stringify(fromHtml.sections)).toBe(JSON.stringify(fromJson.sections));
  });

  it("HTML-JSON 3: malformed embedded JSON gives a clean import error", () => {
    const html = `<html><body><script type="application/json" id="exambank-structured-exam">{ broken </script></body></html>`;
    const r = parseStructuredExamHtml(html);
    expect(r.exam).toBe(null);
    expect(r.canOpen).toBe(false);
    expect(r.parseErrors.some(e => e.code === "INVALID_EMBEDDED_JSON")).toBe(true);
  });
});

// A full annotated document exercising every supported type + stimulus.
const ANNOTATED = `<!doctype html><html><body>
<article data-exambank="structured-exam" data-title="امتحان منظّم">
  <section data-section data-section-id="core" data-title="القسم الأول" data-grading-policy="capScore" data-max-marks="60" data-answer-unit="question">
    <p data-section-instructions>أجب عن الأسئلة</p>

    <div data-stimulus data-group-id="topo" data-title="المخطط">
      <p data-stimulus-text>اعتمد على المخطط</p>
      <img data-stimulus-image src="data:image/png;base64,AAA">
    </div>

    <article data-question data-id="mcq1" data-display-number="1" data-type="multipleChoice" data-marks="3" data-group-id="topo">
      <p data-question-text>أي بروتوكول Link-State؟</p>
      <ul data-options>
        <li data-option>RIP</li>
        <li data-option data-correct="true">OSPF</li>
        <li data-option>FTP</li>
      </ul>
    </article>

    <article data-question data-id="tf1" data-type="trueFalse" data-marks="3" data-correct="true" data-group-id="topo">
      <p data-question-text>APIPA يبدأ بـ 169.254</p>
    </article>

    <article data-question data-id="mtf1" data-type="multiTrueFalse" data-marks="2">
      <p data-question-text>حدد الصحيح</p>
      <div data-fields>
        <div data-field data-id="s1" data-kind="boolean" data-correct="true">DNS يحوّل الاسم إلى IP</div>
        <div data-field data-id="s2" data-kind="boolean" data-correct="false">FTP يستخدم المنفذ 53</div>
      </div>
    </article>

    <article data-question data-id="fb1" data-type="fillBlank" data-marks="2">
      <p data-question-text>أكمل</p>
      <div data-word-bank><span data-word>169.254</span><span data-word>10.0</span></div>
      <div data-fields>
        <div data-field data-id="b1" data-label="بداية APIPA" data-kind="select" data-correct="169.254"></div>
      </div>
    </article>

    <article data-question data-id="mt1" data-type="matching" data-marks="4">
      <p data-question-text>طابق</p>
      <div data-matching>
        <div data-pair data-left="DNS" data-right="تحويل أسماء"></div>
        <div data-pair data-left="HTTP" data-right="خدمة ويب"></div>
      </div>
    </article>

    <article data-question data-id="tbl1" data-type="tableFill" data-marks="2">
      <p data-question-text>أكمل الجدول</p>
      <table data-table-fill>
        <thead><tr><th>VLAN</th><th>Network</th><th>Gateway</th></tr></thead>
        <tbody>
          <tr>
            <td>20</td>
            <td data-answer-cell data-field-id="network" data-kind="text" data-correct="192.168.20.0"></td>
            <td data-answer-cell data-field-id="gateway" data-kind="text" data-correct="192.168.20.1"></td>
          </tr>
        </tbody>
      </table>
    </article>

    <article data-question data-id="cli1" data-type="cliFill" data-marks="4">
      <p data-question-text>أكمل الأوامر</p>
      <pre data-cli>R1(config-subif)# encapsulation dot1Q [[vlan]]
R1(config-subif)# ip address [[ip]] 255.255.255.0</pre>
      <div data-cli-fields>
        <span data-field data-id="vlan" data-correct="20"></span>
        <span data-field data-id="ip" data-correct="192.168.20.1"></span>
      </div>
    </article>
  </section>

  <section data-section data-section-id="infra" data-title="القسم الثاني" data-grading-policy="firstNAnswered" data-max-marks="40" data-required-answers="8" data-answer-unit="part">
    <article data-question data-id="q25" data-display-number="25" data-type="compound" data-marks="40">
      <p data-question-text>أجب عن البنود</p>
      <section data-part data-id="p1" data-label="أ" data-type="multipleChoice" data-marks="5">
        <p data-part-text>اختر</p>
        <ul data-options><li data-option>RIP</li><li data-option data-correct="true">OSPF</li></ul>
      </section>
      <section data-part data-id="p2" data-label="ب" data-type="cliFill" data-marks="5">
        <pre data-cli>encapsulation dot1Q [[v]]</pre>
        <div data-cli-fields><span data-field data-id="v" data-correct="30"></span></div>
      </section>
    </article>
  </section>
</article>
</body></html>`;

describe("HTML annotated DOM (Mode B)", () => {
  const r = parseStructuredExamHtml(ANNOTATED);
  const exam = r.exam!;

  it("HTML 1/2: two sections + grading policies parse", () => {
    expect(r.sourceKind).toBe("html-annotated");
    expect(exam.sections).toHaveLength(2);
    expect(exam.sections[0]).toMatchObject({ gradingPolicy: "capScore", maxMarks: 60, answerUnit: "question" });
    expect(exam.sections[1]).toMatchObject({ gradingPolicy: "firstNAnswered", maxMarks: 40, requiredAnswers: 8, answerUnit: "part" });
    expect(exam.sections[0].instructions).toBe("أجب عن الأسئلة");
  });

  it("HTML 3: MCQ correct option index", () => {
    expect((findQ(exam, "mcq1")!.answer as { correctOptionIndex: number }).correctOptionIndex).toBe(1);
    expect(findQ(exam, "mcq1")!.displayNumber).toBe("1");
  });

  it("HTML 4: trueFalse boolean", () => {
    expect((findQ(exam, "tf1")!.answer as { correct: boolean }).correct).toBe(true);
  });

  it("HTML 5: multiTrueFalse fields", () => {
    const f = findQ(exam, "mtf1")!.fields!;
    expect(f).toHaveLength(2);
    expect(f[0]).toMatchObject({ statement: "DNS يحوّل الاسم إلى IP", kind: "boolean", correct: true });
    expect(f[1].correct).toBe(false);
  });

  it("HTML 6: fillBlank + wordBank", () => {
    const q = findQ(exam, "fb1")!;
    expect(q.wordBank).toEqual(["169.254", "10.0"]);
    expect(q.fields![0]).toMatchObject({ label: "بداية APIPA", kind: "select", correct: "169.254" });
    expect((q.answer as { values: string[] }).values).toEqual(["169.254"]);
  });

  it("HTML 7: matching pairs → options + answer.text", () => {
    const q = findQ(exam, "mt1")!;
    expect(q.fields!.every(f => f.kind === "select" && (f.options || []).length === 2)).toBe(true);
    expect(String((q.answer as { text: string }).text)).toContain("DNS=تحويل أسماء");
  });

  it("HTML 8: tableFill with TWO answer cells in one row grades per-cell", () => {
    const q = findQ(exam, "tbl1")!;
    const cells = q.fields!.filter(f => f.row === 0);
    expect(cells).toHaveLength(2);
    expect(cells.map(c => c.column)).toEqual([1, 2]);
    const g = gradeExam(exam, { tbl1: { kind: "fields", values: { network: "192.168.20.0", gateway: "WRONG" } } });
    expect(g.questions.find(x => x.questionId === "tbl1")!.score).toBe(1);
  });

  it("HTML 9: CLI preserves template + fields", () => {
    const q = findQ(exam, "cli1")!;
    expect(q.cli).toContain("[[vlan]]");
    expect(q.cli).toContain("[[ip]]");
    expect(q.fields!.map(f => f.id)).toEqual(["vlan", "ip"]);
    expect(q.fields![0].correct).toBe("20");
  });

  it("HTML 10: compound with mixed parts (MCQ + CLI)", () => {
    const q = findQ(exam, "q25")!;
    expect(q.parts).toHaveLength(2);
    expect(q.parts![0]).toMatchObject({ label: "أ", type: "multipleChoice", marks: 5 });
    expect(q.parts![1]).toMatchObject({ label: "ب", type: "cliFill", marks: 5 });
    expect(q.parts![1].cli).toContain("[[v]]");
  });

  it("HTML 11: shared stimulus stored once, referenced by two questions", () => {
    expect(Object.keys(exam.sections[0].stimuli!)).toEqual(["topo"]);
    expect(exam.sections[0].questions.filter(q => q.groupId === "topo").length).toBeGreaterThanOrEqual(2);
  });

  it("HTML 12: base64 stimulus image preserved", () => {
    expect(exam.sections[0].stimuli!.topo.image!.dataUrl).toBe("data:image/png;base64,AAA");
  });

  it("HTML 13: missing ids get generated", () => {
    const r2 = parseStructuredExamHtml(`<article data-exambank="structured-exam"><section data-section data-grading-policy="all"><article data-question data-type="shortAnswer" data-marks="1"><p data-question-text>س</p></article></section></article>`);
    expect(r2.exam!.sections[0].id).toBeTruthy();
    expect(r2.exam!.sections[0].questions[0].examQuestionId).toBeTruthy();
    expect(r2.generatedIds).toBeGreaterThanOrEqual(2);
  });

  it("HTML 14: an unsupported type is a FATAL parse error (blocks opening)", () => {
    const r2 = parseStructuredExamHtml(`<article data-exambank="structured-exam"><section data-section data-grading-policy="all"><article data-question data-id="x" data-type="mystery" data-marks="1"><p data-question-text>س</p></article></section></article>`);
    expect(r2.parseErrors.some(e => e.code === "UNSUPPORTED_QUESTION_TYPE")).toBe(true);
    expect(r2.canOpen).toBe(false);
  });

  it("grades and sanitizes cleanly end-to-end", () => {
    const g = gradeExam(exam, { mcq1: { kind: "choice", index: 1 }, q25: { kind: "compound", parts: { p1: { kind: "choice", index: 1 }, p2: { kind: "fields", values: { v: "30" } } } } });
    expect(g.totalMarks).toBe(100);
    expect(g.score).toBeGreaterThan(0);
    expect(JSON.stringify(sanitizeExamForStudent(toSavedStructuredExam(exam)))).not.toContain("correctOptionIndex");
  });
});

// #4 — annotated-HTML type aliases must be canonicalized BEFORE the body is parsed, so the body content
// (options/answer, CLI/fields, table, model answer) survives instead of being lost to an empty body.
describe("HTML annotated type aliases preserve body content (#4)", () => {
  const wrap = (inner: string) => `<article data-exambank="structured-exam"><section data-section data-grading-policy="all">${inner}</section></article>`;

  it("E: alias mcq → multipleChoice with options + correctOptionIndex preserved", () => {
    const r = parseStructuredExamHtml(wrap(`<article data-question data-id="a" data-type="mcq" data-marks="2"><p data-question-text>س</p><ul data-options><li data-option>RIP</li><li data-option data-correct="true">OSPF</li></ul></article>`));
    const q = findQ(r.exam!, "a")!;
    expect(q.presentationType).toBe("multipleChoice");
    expect(q.options).toHaveLength(2);
    expect((q.answer as { correctOptionIndex: number }).correctOptionIndex).toBe(1);
    expect(r.parseWarnings.filter(w => w.code === "TYPE_ALIAS_NORMALIZED")).toHaveLength(1); // warned exactly once
  });

  it("F: alias cli → cliFill with CLI template + fields preserved", () => {
    const r = parseStructuredExamHtml(wrap(`<article data-question data-id="c" data-type="cli" data-marks="3"><p data-question-text>س</p><pre data-cli>vlan [[vid]]</pre><div data-cli-fields><span data-field data-id="vid" data-correct="30"></span></div></article>`));
    const q = findQ(r.exam!, "c")!;
    expect(q.presentationType).toBe("cliFill");
    expect(q.cli).toContain("[[vid]]");
    expect(q.fields!.map(f => f.id)).toEqual(["vid"]);
    expect(q.fields![0].correct).toBe("30");
  });

  it("alias table → tableFill with headers/rows/fields preserved", () => {
    const r = parseStructuredExamHtml(wrap(`<article data-question data-id="t" data-type="table" data-marks="2"><p data-question-text>س</p><table data-table-fill><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>x</td><td data-answer-cell data-field-id="b" data-kind="text" data-correct="y"></td></tr></tbody></table></article>`));
    const q = findQ(r.exam!, "t")!;
    expect(q.presentationType).toBe("tableFill");
    expect(q.tableHeaders).toEqual(["A", "B"]);
    expect(q.fields!.filter(f => f.row === 0)).toHaveLength(1);
    expect(q.fields![0].correct).toBe("y");
  });

  it("alias open → shortAnswer with the model answer preserved", () => {
    const r = parseStructuredExamHtml(wrap(`<article data-question data-id="o" data-type="open" data-marks="2"><p data-question-text>عرّف ARP</p><p data-model-answer>تحويل IP إلى MAC</p></article>`));
    const q = findQ(r.exam!, "o")!;
    expect(q.presentationType).toBe("shortAnswer");
    expect((q.answer as { text?: string }).text).toBe("تحويل IP إلى MAC");
  });
});

// #2 — an MCQ with zero / multiple data-correct is READABLE structure, not a parse failure: warn, leave
// the answer unset, and let validateStructuredExam raise the normal (blocking) MISSING_ANSWER. canOpen true.
describe("HTML MCQ without a single correct option is repairable, not fatal (#2)", () => {
  const wrap = (inner: string) => `<article data-exambank="structured-exam"><section data-section data-grading-policy="all">${inner}</section></article>`;

  it("C: zero correct → parse warning + validation MISSING_ANSWER, canOpen true, answer unset", () => {
    const r = parseStructuredExamHtml(wrap(`<article data-question data-id="z" data-type="multipleChoice" data-marks="2"><p data-question-text>س</p><ul data-options><li data-option>A</li><li data-option>B</li></ul></article>`));
    expect(r.parseWarnings.some(w => w.code === "MCQ_NO_CORRECT")).toBe(true);
    expect(r.parseErrors).toEqual([]);
    expect(findQ(r.exam!, "z")!.answer).toBeUndefined();
    expect(r.validationErrors.some(i => i.code === "MISSING_ANSWER")).toBe(true);
    expect(r.canOpen).toBe(true);
  });

  it("D: multiple correct → parse warning + validation MISSING_ANSWER, canOpen true, answer unset (no guess)", () => {
    const r = parseStructuredExamHtml(wrap(`<article data-question data-id="m" data-type="multipleChoice" data-marks="2"><p data-question-text>س</p><ul data-options><li data-option data-correct="true">A</li><li data-option data-correct="true">B</li></ul></article>`));
    expect(r.parseWarnings.some(w => w.code === "MCQ_MULTIPLE_CORRECT")).toBe(true);
    expect(findQ(r.exam!, "m")!.answer).toBeUndefined();
    expect(r.validationErrors.some(i => i.code === "MISSING_ANSWER")).toBe(true);
    expect(r.canOpen).toBe(true);
  });
});

// #3 — an external stimulus image URL in annotated HTML must never survive as a renderable dataUrl.
describe("HTML external stimulus image is not renderable (#3)", () => {
  it("G(HTML): external src is stripped to externalUrl with a warning; base64 survives", () => {
    const ext = parseStructuredExamHtml(`<article data-exambank="structured-exam"><section data-section data-grading-policy="all"><div data-stimulus data-group-id="g"><img data-stimulus-image src="https://example.com/a.png"></div><article data-question data-id="q" data-type="shortAnswer" data-marks="1" data-group-id="g"><p data-question-text>س</p></article></section></article>`);
    const img = ext.exam!.sections[0].stimuli!.g.image as { dataUrl?: string; externalUrl?: string };
    expect(img.dataUrl).toBeUndefined();
    expect(img.externalUrl).toBe("https://example.com/a.png");
    expect(ext.parseWarnings.some(w => w.code === "EXTERNAL_IMAGE_NOT_EMBEDDED")).toBe(true);

    const safe = parseStructuredExamHtml(`<article data-exambank="structured-exam"><section data-section data-grading-policy="all"><div data-stimulus data-group-id="g"><img data-stimulus-image src="data:image/png;base64,AAA"></div><article data-question data-id="q" data-type="shortAnswer" data-marks="1" data-group-id="g"><p data-question-text>س</p></article></section></article>`);
    expect((safe.exam!.sections[0].stimuli!.g.image as { dataUrl?: string }).dataUrl).toBe("data:image/png;base64,AAA");
  });
});

describe("importStructuredExam dispatcher + size guard", () => {
  it("dispatches by extension and enforces the size limit", () => {
    expect(importStructuredExam("x.json", JSON.stringify(EMBEDDED_EXAM)).sourceKind).toBe("json");
    expect(importStructuredExam("x.html", ANNOTATED).sourceKind).toBe("html-annotated");
    const big = importStructuredExam("x.json", "{".padEnd(11 * 1024 * 1024, " "));
    expect(big.parseErrors.some(e => e.code === "FILE_TOO_LARGE")).toBe(true);
  });

  it("#6: the size guard counts UTF-8 BYTES, not UTF-16 code units (multi-byte Arabic)", () => {
    // Each Arabic letter is 2 UTF-16 units but 2 UTF-8 bytes here; build a string whose byte length
    // exceeds the limit while confirming the check is byte-based (a JSON payload, so it routes to JSON).
    const arabicBlock = "ا".repeat(6 * 1024 * 1024); // ~12 MB in UTF-8
    const r = importStructuredExam("x.json", arabicBlock);
    expect(new TextEncoder().encode(arabicBlock).byteLength).toBeGreaterThan(10 * 1024 * 1024);
    expect(r.parseErrors.some(e => e.code === "FILE_TOO_LARGE")).toBe(true);
  });
});

// END-TO-END equivalence: JSON and its equivalent embedded-HTML produce semantically equal exams.
describe("JSON ≡ HTML embedded equivalence", () => {
  it("the canonical JSON exam and the same exam embedded in HTML grade identically", () => {
    const jsonR = parseStructuredExamJson(JSON.stringify(EMBEDDED_EXAM));
    const htmlR = parseStructuredExamHtml(`<html><body><script type="application/json" id="exambank-structured-exam">${JSON.stringify(EMBEDDED_EXAM)}</script></body></html>`);
    const ans = { q1: { kind: "choice" as const, index: 1 } };
    expect(gradeExam(jsonR.exam, ans).score).toBe(gradeExam(htmlR.exam, ans).score);
  });
});

// The shipped templates must import with NO parse errors and NO blocking validation errors — they are
// the documented conversion target, so a broken template would mislead every teacher. Loaded as raw
// strings via Vite so the test needs no Node fs/type deps.
import jsonTemplate from "../public/templates/structured-exam-template.json?raw";
import htmlTemplate from "../public/templates/structured-exam-template.html?raw";

describe("shipped import templates are valid", () => {
  it("structured-exam-template.json imports with no errors", () => {
    const r = parseStructuredExamJson(jsonTemplate, "structured-exam-template.json");
    expect(r.parseErrors).toEqual([]);
    expect(r.validationErrors).toEqual([]);
    expect(r.canOpen).toBe(true);
    expect(r.stats).toMatchObject({ sections: 2 });
  });
  it("structured-exam-template.html imports with no errors", () => {
    const r = parseStructuredExamHtml(htmlTemplate, "structured-exam-template.html");
    expect(r.parseErrors).toEqual([]);
    expect(r.validationErrors).toEqual([]);
    expect(r.canOpen).toBe(true);
    expect(r.sourceKind).toBe("html-annotated");
    expect(r.stats).toMatchObject({ sections: 2 });
  });
});
