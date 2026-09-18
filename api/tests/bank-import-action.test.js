import { describe, it, expect } from "vitest";
import { partitionQuestionsBySectionValidity } from "../src/functions/bank-import-action.js";

function q(overrides = {}) {
  return { importedQuestionId: "imp-1-1", section: "BASIC", ...overrides };
}

describe("partitionQuestionsBySectionValidity (bank-commit section gate)", () => {
  it("accepts a question with section BASIC", () => {
    const { accepted, skipped } = partitionQuestionsBySectionValidity([q({ section: "BASIC" })]);
    expect(accepted).toHaveLength(1);
    expect(skipped).toHaveLength(0);
  });

  it("accepts a question with section INFRASTRUCTURE", () => {
    const { accepted, skipped } = partitionQuestionsBySectionValidity([q({ section: "INFRASTRUCTURE" })]);
    expect(accepted).toHaveLength(1);
    expect(skipped).toHaveLength(0);
  });

  it("rejects a question with section LEGACY", () => {
    const { accepted, skipped } = partitionQuestionsBySectionValidity([q({ section: "LEGACY" })]);
    expect(accepted).toHaveLength(0);
    expect(skipped).toEqual([{ importedQuestionId: "imp-1-1", reason: "invalid-section", section: "LEGACY" }]);
  });

  it("rejects a question with section null", () => {
    const { accepted, skipped } = partitionQuestionsBySectionValidity([q({ section: null })]);
    expect(accepted).toHaveLength(0);
    expect(skipped[0].reason).toBe("invalid-section");
  });

  it("rejects a question with section undefined (field omitted)", () => {
    const question = { importedQuestionId: "imp-1-1" };
    const { accepted, skipped } = partitionQuestionsBySectionValidity([question]);
    expect(accepted).toHaveLength(0);
    expect(skipped[0].section).toBeNull();
  });

  it("rejects an arbitrary/random section value", () => {
    const { accepted, skipped } = partitionQuestionsBySectionValidity([q({ section: "SOMETHING_RANDOM" })]);
    expect(accepted).toHaveLength(0);
    expect(skipped[0].section).toBe("SOMETHING_RANDOM");
  });

  it("partitions a mixed batch correctly, keeping only the valid ones", () => {
    const questions = [
      q({ importedQuestionId: "a", section: "BASIC" }),
      q({ importedQuestionId: "b", section: "LEGACY" }),
      q({ importedQuestionId: "c", section: "INFRASTRUCTURE" }),
      q({ importedQuestionId: "d", section: undefined })
    ];
    const { accepted, skipped } = partitionQuestionsBySectionValidity(questions);
    expect(accepted.map(x => x.importedQuestionId)).toEqual(["a", "c"]);
    expect(skipped.map(x => x.importedQuestionId)).toEqual(["b", "d"]);
  });
});

// Imported fillBlank / wordBank questions used to be committed with `fields: []`, which the Exam Bank editor
// rejects until a teacher rebuilds the blanks by hand (the gap PR #102 left out of scope). The commit path now
// derives the canonical multiField structure from SOURCE-PRESENT data only — the visible answer — through the
// editor's own normalizeInput, and never invents an answer.
import { countExplicitBlanks, deriveImportedBlankStructure, toBankQuestion } from "../src/functions/bank-import-action.js";
import { validateQuestionInput } from "../src/functions/bank-questions.js";

const imported = (overrides = {}) => ({
  importedQuestionId: "imp-1-1", questionNumberGuess: "1", section: "BASIC", topic: "الشبكات", difficulty: 2,
  presentationType: "fillBlank", text: "بروتوكول النقل الموثوق هو ____", options: [], hasVisibleAnswer: true, answerText: "TCP",
  requiresManualReview: false, imageAssets: [], hasImage: false, ...overrides
});

describe("deriveImportedBlankStructure (source-present blanks only)", () => {
  it("fillBlank with a visible answer → ONE text blank whose expected value is the answer, exactSequence answer", () => {
    const d = deriveImportedBlankStructure(imported());
    expect(d.fields).toEqual([{ id: "f1", label: "", labelHtml: "", order: 1, kind: "text", correct: "TCP" }]);
    expect(d.wordBank).toEqual([]);
    expect(d.answer).toEqual({ mode: "exactSequence", values: ["TCP"] });
  });

  it("wordBank with the answer among the detected options → a select blank over the (de-duplicated) word bank", () => {
    const d = deriveImportedBlankStructure(imported({ presentationType: "wordBank", text: "بروتوكول التوجيه ____", options: [{ text: "OSPF" }, { text: "RIP" }, { text: "OSPF" }, { text: " BGP " }], answerText: "RIP" }));
    expect(d.wordBank).toEqual(["OSPF", "RIP", "BGP"]);
    expect(d.fields).toHaveLength(1);
    expect(d.fields[0]).toMatchObject({ id: "f1", kind: "select", correct: "RIP", order: 1 });
    expect(d.fields[0].options.map(o => o.text)).toEqual(["OSPF", "RIP", "BGP"]);
    expect(d.answer).toEqual({ mode: "exactSequence", values: ["RIP"] });
  });

  it("trims the visible answer and reads option text via text/label/value", () => {
    expect(deriveImportedBlankStructure(imported({ answerText: "  UDP " })).fields[0].correct).toBe("UDP");
    const d = deriveImportedBlankStructure(imported({ presentationType: "wordBank", text: "اختر ____", options: [{ label: "A" }, { value: "B" }], answerText: "B" }));
    expect(d.wordBank).toEqual(["A", "B"]);
  });

  it("NEVER invents: no visible answer / empty answer / hasVisibleAnswer false → null", () => {
    expect(deriveImportedBlankStructure(imported({ hasVisibleAnswer: false, answerText: "TCP" }))).toBeNull();
    expect(deriveImportedBlankStructure(imported({ answerText: "" }))).toBeNull();
    expect(deriveImportedBlankStructure(imported({ answerText: "   " }))).toBeNull();
    expect(deriveImportedBlankStructure(imported({ answerText: undefined }))).toBeNull();
  });

  it("wordBank: answer not among the detected words, or fewer than two distinct words → null (the canonical validator refuses it)", () => {
    expect(deriveImportedBlankStructure(imported({ presentationType: "wordBank", options: [{ text: "OSPF" }, { text: "RIP" }], answerText: "BGP" }))).toBeNull();
    expect(deriveImportedBlankStructure(imported({ presentationType: "wordBank", options: [{ text: "RIP" }], answerText: "RIP" }))).toBeNull();
    expect(deriveImportedBlankStructure(imported({ presentationType: "wordBank", options: [], answerText: "RIP" }))).toBeNull();
  });

  it("only applies to fillBlank / wordBank", () => {
    expect(deriveImportedBlankStructure(imported({ presentationType: "multipleChoice", options: [{ text: "a" }, { text: "b" }] }))).toBeNull();
    expect(deriveImportedBlankStructure(imported({ presentationType: "open" }))).toBeNull();
    expect(deriveImportedBlankStructure(imported({ presentationType: null }))).toBeNull();
    expect(deriveImportedBlankStructure(null)).toBeNull();
  });

  it("the derived structure is exactly what the editor's validator accepts (round-trip through validateQuestionInput)", () => {
    for (const q of [imported(), imported({ presentationType: "wordBank", text: "بروتوكول التوجيه ____", options: [{ text: "OSPF" }, { text: "RIP" }], answerText: "RIP" })]) {
      const d = deriveImportedBlankStructure(q);
      const check = validateQuestionInput({ section: q.section, topic: q.topic, difficulty: q.difficulty, presentationType: q.presentationType, text: q.text, options: [], fields: d.fields, wordBank: d.wordBank, answer: d.answer });
      expect(check.errors, q.presentationType).toEqual([]);
    }
  });
});

describe("toBankQuestion — imported blank questions are stored usable, everything else unchanged", () => {
  it("a fillBlank with a visible answer is committed as multiField WITH its blank (no longer fields: [])", async () => {
    const bq = await toBankQuestion(imported(), "import-x", 1, null);
    expect(bq.type).toBe("multiField");
    expect(bq.fields).toEqual([{ id: "f1", label: "", labelHtml: "", order: 1, kind: "text", correct: "TCP" }]);
    expect(bq.wordBank).toEqual([]);
    expect(bq.answer).toEqual({ mode: "exactSequence", values: ["TCP"] });
    expect(bq.options).toEqual([]);
    expect(bq.flags).toEqual({ hasImage: false, hasOptions: false, isChild: false, requiresManualReview: false });
    expect(bq.id).toBe("import-x-1");
  });

  it("a wordBank keeps its detected words as the word bank and a select blank; options are not duplicated", async () => {
    const bq = await toBankQuestion(imported({ presentationType: "wordBank", text: "بروتوكول التوجيه ____", options: [{ value: "a", text: "OSPF" }, { value: "b", text: "RIP" }], answerText: "OSPF" }), "import-x", 2, null);
    expect(bq.type).toBe("multiField");
    expect(bq.wordBank).toEqual(["OSPF", "RIP"]);
    expect(bq.fields[0]).toMatchObject({ kind: "select", correct: "OSPF" });
    expect(bq.options).toEqual([]);
    expect(bq.flags.hasOptions).toBe(false);
    expect(bq.flags.requiresManualReview).toBe(false);
  });

  it("a blank question WITHOUT a derivable structure is stored exactly as before but flagged for teacher review", async () => {
    const bq = await toBankQuestion(imported({ hasVisibleAnswer: false, answerText: "" }), "import-x", 3, null);
    expect(bq.fields).toEqual([]);
    expect(bq).not.toHaveProperty("wordBank");
    expect(bq.answer).toEqual({ mode: "manual", values: [] });
    expect(bq.flags.requiresManualReview).toBe(true);
    const wb = await toBankQuestion(imported({ presentationType: "wordBank", options: [{ text: "OSPF" }, { text: "RIP" }], answerText: "BGP" }), "import-x", 4, null);
    expect(wb.fields).toEqual([]);
    expect(wb.options.map(o => o.text)).toEqual(["OSPF", "RIP"]);   // raw options kept as before
    expect(wb.answer).toEqual({ mode: "anyAccepted", values: ["BGP"] });
    expect(wb.flags.requiresManualReview).toBe(true);
  });

  it("multipleChoice and open questions are byte-for-byte unchanged by this change", async () => {
    const mc = await toBankQuestion(imported({ presentationType: "multipleChoice", options: [{ value: "a", text: "TCP" }, { value: "b", text: "UDP" }], answerText: "TCP" }), "import-x", 5, null);
    expect(mc.type).toBe("multipleChoice");
    expect(mc.options.map(o => o.text)).toEqual(["TCP", "UDP"]);
    expect(mc.fields).toEqual([]);
    expect(mc).not.toHaveProperty("wordBank");
    expect(mc.answer).toEqual({ mode: "anyAccepted", values: ["TCP"] });
    expect(mc.flags).toEqual({ hasImage: false, hasOptions: true, isChild: false, requiresManualReview: false });
    const open = await toBankQuestion(imported({ presentationType: "open", hasVisibleAnswer: false, answerText: "" }), "import-x", 6, null);
    expect(open.type).toBe("shortAnswer");
    expect(open.answer).toEqual({ mode: "manual", values: [] });
    expect(open.flags.requiresManualReview).toBe(false);   // an open question with no key was never flagged by this rule
  });

  it("an explicit requiresManualReview from the reviewer is still honoured for a derivable blank question", async () => {
    const bq = await toBankQuestion(imported({ requiresManualReview: true }), "import-x", 7, null);
    expect(bq.fields).toHaveLength(1);
    expect(bq.flags.requiresManualReview).toBe(true);
  });
});

// ---- Review follow-up: ONE blank must be proven by the SOURCE TEXT, and the canonical validator gates ---------
// The same multi-row table fixtures the frontend's convertTableRowsToWordBankFields tests use (one field PER row)
// are the regression cases here: they must NEVER be collapsed into a single field on the import path.
const TABLE_3_ROWS =
  "جزء الشبكة وجزء الحاسوب أكمل الجدول التالي للعنوان 192.168.10.55/24:\n" +
  "| الإجابة | المعطى |\n" +
  "| --- | --- |\n" +
  "| ___ | Network Address |\n" +
  "| ____ | Host Part |\n" +
  "| _ | Subnet Mask |";
const TABLE_2_ROWS_BLANK_SECOND = "اكتب لكل عنوان الفئة التي ينتمي إليها:\n| العنوان | الفئة |\n| --- | --- |\n| 223.100.220.100 | -- |\n| 92.168.100.29 | -- |";
const TABLE_1_BLANK = "أكمل الجدول:\n| الإجابة | المعطى |\n| --- | --- |\n| ___ | Network Address |\n| 192.168.10.0 | Network |";

describe("countExplicitBlanks — the single-blank detection rule (source text only)", () => {
  it("counts a prose underscore / tatweel run as one blank", () => {
    expect(countExplicitBlanks("بروتوكول النقل الموثوق هو ____")).toBe(1);
    expect(countExplicitBlanks("بروتوكول النقل الموثوق هو ــــ")).toBe(1);
    expect(countExplicitBlanks("___ هو بروتوكول النقل الموثوق")).toBe(1);
  });
  it("two and three prose blanks count as two and three", () => {
    expect(countExplicitBlanks("البروتوكول الأول ____ والثاني ____")).toBe(2);
    expect(countExplicitBlanks("____ و ____ و ____")).toBe(3);
  });
  it("a markdown table with exactly one real blank cell counts one; a separator row is never a blank", () => {
    expect(countExplicitBlanks(TABLE_1_BLANK)).toBe(1);
    expect(countExplicitBlanks("س\n| أ | ب |\n| --- | --- |\n| x | y |")).toBe(0);
    expect(countExplicitBlanks("س\n| أ | ب |\n|:---|---:|\n| x | y |")).toBe(0);
  });
  it("multi-row tables (the frontend's one-field-per-row fixtures) count every blank row", () => {
    expect(countExplicitBlanks(TABLE_3_ROWS)).toBe(3);
    expect(countExplicitBlanks(TABLE_2_ROWS_BLANK_SECOND)).toBe(2);   // "--" cells, blank column second
    expect(countExplicitBlanks("س:\n| أ | ب |\n| --- | --- |\n| _ | one |\n| _ | two |\n| _ | three |")).toBe(3);
  });
  it("zero explicit blanks → 0; a lone underscore inside an identifier is not a blank", () => {
    expect(countExplicitBlanks("ما هو بروتوكول النقل الموثوق؟")).toBe(0);
    expect(countExplicitBlanks("الملف snake_case.txt")).toBe(0);
    expect(countExplicitBlanks("")).toBe(0);
    expect(countExplicitBlanks(null)).toBe(0);
  });
  it("a table row carrying more than one blank cell is ambiguous → null", () => {
    expect(countExplicitBlanks("س\n| أ | ب | ج |\n| --- | --- | --- |\n| ___ | x | ___ |")).toBeNull();
  });
  it("prose blanks and a table blank add up (still refused later because the total is not one)", () => {
    expect(countExplicitBlanks("أكمل ____ ثم الجدول:\n| أ | ب |\n| --- | --- |\n| ___ | x |")).toBe(2);
  });
});

describe("deriveImportedBlankStructure — derives ONLY for an unambiguous single blank", () => {
  it("1. one prose blank derives (fillBlank)", () => {
    const d = deriveImportedBlankStructure(imported({ text: "بروتوكول النقل الموثوق هو ____", answerText: "TCP" }));
    expect(d.fields).toEqual([{ id: "f1", label: "", labelHtml: "", order: 1, kind: "text", correct: "TCP" }]);
    expect(d.answer).toEqual({ mode: "exactSequence", values: ["TCP"] });
  });
  it("2./3. two and three prose blanks do NOT derive — never collapsed into one field", () => {
    expect(deriveImportedBlankStructure(imported({ text: "البروتوكول الأول ____ والثاني ____", answerText: "TCP" }))).toBeNull();
    expect(deriveImportedBlankStructure(imported({ text: "____ و ____ و ____", answerText: "TCP" }))).toBeNull();
  });
  it("4. a markdown table with exactly one real blank cell derives", () => {
    const d = deriveImportedBlankStructure(imported({ text: TABLE_1_BLANK, answerText: "192.168.10.0" }));
    expect(d).not.toBeNull();
    expect(d.fields).toHaveLength(1);
    expect(d.answer.values).toEqual(["192.168.10.0"]);
  });
  it("5. multi-row tables (2+ blank rows) do NOT derive — for fillBlank and for wordBank alike", () => {
    expect(deriveImportedBlankStructure(imported({ text: TABLE_3_ROWS, answerText: "192.168.10.0" }))).toBeNull();
    expect(deriveImportedBlankStructure(imported({ presentationType: "wordBank", text: TABLE_3_ROWS, options: [{ text: "192.168.10.0" }, { text: "55" }, { text: "255.255.255.0" }], answerText: "192.168.10.0" }))).toBeNull();
    expect(deriveImportedBlankStructure(imported({ text: TABLE_2_ROWS_BLANK_SECOND, answerText: "C" }))).toBeNull();
  });
  it("6. a separator row '| --- | --- |' is not a blank: a table without blank cells derives nothing", () => {
    expect(deriveImportedBlankStructure(imported({ text: "س\n| أ | ب |\n| --- | --- |\n| x | y |", answerText: "TCP" }))).toBeNull();
  });
  it("7. zero explicit blanks does NOT derive, even with a visible answer", () => {
    expect(deriveImportedBlankStructure(imported({ text: "ما هو بروتوكول النقل الموثوق؟", answerText: "TCP" }))).toBeNull();
  });
  it("8. an overlong expected value is refused by the canonical validator (no limit re-implemented here)", () => {
    const long = "x".repeat(501);
    expect(validateQuestionInput({ section: "BASIC", topic: "t", difficulty: 3, presentationType: "fillBlank", text: "أكمل ____", options: [], fields: [{ id: "f1", label: "", correct: long }], wordBank: [], answer: {} }).ok).toBe(false);
    expect(deriveImportedBlankStructure(imported({ answerText: long }))).toBeNull();
    expect(deriveImportedBlankStructure(imported({ answerText: "x".repeat(500) }))).not.toBeNull();   // exactly at the canonical limit still passes
  });
  it("9. a word bank over the canonical maximum size is refused", () => {
    const options = Array.from({ length: 41 }, (_, i) => ({ text: "w" + i }));
    expect(deriveImportedBlankStructure(imported({ presentationType: "wordBank", text: "اختر ____", options, answerText: "w0" }))).toBeNull();
    expect(deriveImportedBlankStructure(imported({ presentationType: "wordBank", text: "اختر ____", options: options.slice(0, 40), answerText: "w0" }))).not.toBeNull();
  });
  it("the canonical validator also refuses an overlong source text and an invalid section", () => {
    expect(deriveImportedBlankStructure(imported({ text: "أكمل ____ " + "ن".repeat(5000) }))).toBeNull();
    expect(deriveImportedBlankStructure(imported({ section: "LEGACY" }))).toBeNull();
  });
  it("10. every derived structure passes validateQuestionInput", () => {
    const cases = [
      imported(),
      imported({ text: TABLE_1_BLANK, answerText: "192.168.10.0" }),
      imported({ presentationType: "wordBank", text: "بروتوكول التوجيه ____", options: [{ text: "OSPF" }, { text: "RIP" }, { text: "BGP" }], answerText: "RIP" }),
      imported({ presentationType: "wordBank", text: "اختر ____", options: [{ label: "A" }, { value: "B" }], answerText: "B" })
    ];
    for (const q of cases) {
      const d = deriveImportedBlankStructure(q);
      expect(d, q.text).not.toBeNull();
      const check = validateQuestionInput({ section: q.section, topic: q.topic, difficulty: q.difficulty, presentationType: q.presentationType, text: q.text, options: [], fields: d.fields, wordBank: d.wordBank, answer: d.answer });
      expect(check.errors, q.text).toEqual([]);
    }
  });
  it("14. the existing valid single wordBank still derives correctly", () => {
    const d = deriveImportedBlankStructure(imported({ presentationType: "wordBank", text: "بروتوكول التوجيه ____", options: [{ text: "OSPF" }, { text: "RIP" }, { text: "BGP" }], answerText: "RIP" }));
    expect(d.wordBank).toEqual(["OSPF", "RIP", "BGP"]);
    expect(d.fields[0]).toMatchObject({ id: "f1", kind: "select", correct: "RIP", order: 1 });
    expect(d.fields[0].options.map(o => o.text)).toEqual(["OSPF", "RIP", "BGP"]);
    expect(d.answer).toEqual({ mode: "exactSequence", values: ["RIP"] });
  });
});

describe("toBankQuestion — multi-blank / ambiguous sources fall back unchanged and flagged; classification never carries the transient values", () => {
  it("11. multi-blank fillBlank and the 3-row wordBank table are stored exactly as before + requiresManualReview=true", async () => {
    const fb = await toBankQuestion(imported({ text: "البروتوكول الأول ____ والثاني ____", answerText: "TCP" }), "import-x", 1, null);
    expect(fb.fields).toEqual([]);
    expect(fb).not.toHaveProperty("wordBank");
    expect(fb.answer).toEqual({ mode: "anyAccepted", values: ["TCP"] });
    expect(fb.flags.requiresManualReview).toBe(true);
    const wb = await toBankQuestion(imported({ presentationType: "wordBank", text: TABLE_3_ROWS, options: [{ value: "a", text: "192.168.10.0" }, { value: "b", text: "55" }, { value: "c", text: "255.255.255.0" }], answerText: "192.168.10.0" }), "import-x", 2, null);
    expect(wb.type).toBe("multiField");
    expect(wb.fields).toEqual([]);
    expect(wb.options.map(o => o.text)).toEqual(["192.168.10.0", "55", "255.255.255.0"]);   // raw options preserved
    expect(wb.answer).toEqual({ mode: "anyAccepted", values: ["192.168.10.0"] });
    expect(wb.flags.requiresManualReview).toBe(true);
  });
  it("the stored classification is the imported one — the transient validation topic/difficulty are never persisted", async () => {
    const bq = await toBankQuestion(imported({ topic: "الشبكات", difficulty: 2 }), "import-x", 3, null);
    expect(bq.fields).toHaveLength(1);                     // derived
    expect(bq.classification.topic).toBe("الشبكات");
    expect(bq.classification.difficulty).toBe(2);
    const none = await toBankQuestion(imported({ topic: null, difficulty: null }), "import-x", 4, null);
    expect(none.fields).toHaveLength(1);                   // derivation does not depend on real classification
    expect(none.classification.topic).toBeNull();
    expect(none.classification.difficulty).toBeNull();
    expect(JSON.stringify(none)).not.toContain('"import"');
  });
  it("12./13. MCQ and open questions are unchanged (single-blank text or not)", async () => {
    const mc = await toBankQuestion(imported({ presentationType: "multipleChoice", text: "أكمل ____", options: [{ value: "a", text: "TCP" }, { value: "b", text: "UDP" }], answerText: "TCP" }), "import-x", 5, null);
    expect(mc.type).toBe("multipleChoice");
    expect(mc.fields).toEqual([]);
    expect(mc.options.map(o => o.text)).toEqual(["TCP", "UDP"]);
    expect(mc.flags.requiresManualReview).toBe(false);
    const open = await toBankQuestion(imported({ presentationType: "open", text: "اشرح ____", hasVisibleAnswer: true, answerText: "TCP" }), "import-x", 6, null);
    expect(open.type).toBe("shortAnswer");
    expect(open.fields).toEqual([]);
    expect(open.answer).toEqual({ mode: "anyAccepted", values: ["TCP"] });
    expect(open.flags.requiresManualReview).toBe(false);
  });
});
