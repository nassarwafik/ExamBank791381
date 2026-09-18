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
import { deriveImportedBlankStructure, toBankQuestion } from "../src/functions/bank-import-action.js";
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
    const d = deriveImportedBlankStructure(imported({ presentationType: "wordBank", options: [{ text: "OSPF" }, { text: "RIP" }, { text: "OSPF" }, { text: " BGP " }], answerText: "RIP" }));
    expect(d.wordBank).toEqual(["OSPF", "RIP", "BGP"]);
    expect(d.fields).toHaveLength(1);
    expect(d.fields[0]).toMatchObject({ id: "f1", kind: "select", correct: "RIP", order: 1 });
    expect(d.fields[0].options.map(o => o.text)).toEqual(["OSPF", "RIP", "BGP"]);
    expect(d.answer).toEqual({ mode: "exactSequence", values: ["RIP"] });
  });

  it("trims the visible answer and reads option text via text/label/value", () => {
    expect(deriveImportedBlankStructure(imported({ answerText: "  UDP " })).fields[0].correct).toBe("UDP");
    const d = deriveImportedBlankStructure(imported({ presentationType: "wordBank", options: [{ label: "A" }, { value: "B" }], answerText: "B" }));
    expect(d.wordBank).toEqual(["A", "B"]);
  });

  it("NEVER invents: no visible answer / empty answer / hasVisibleAnswer false → null", () => {
    expect(deriveImportedBlankStructure(imported({ hasVisibleAnswer: false, answerText: "TCP" }))).toBeNull();
    expect(deriveImportedBlankStructure(imported({ answerText: "" }))).toBeNull();
    expect(deriveImportedBlankStructure(imported({ answerText: "   " }))).toBeNull();
    expect(deriveImportedBlankStructure(imported({ answerText: undefined }))).toBeNull();
  });

  it("wordBank: answer not among the detected words, or fewer than two distinct words → null (the editor would refuse it)", () => {
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
    for (const q of [imported(), imported({ presentationType: "wordBank", options: [{ text: "OSPF" }, { text: "RIP" }], answerText: "RIP" })]) {
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
    const bq = await toBankQuestion(imported({ presentationType: "wordBank", options: [{ value: "a", text: "OSPF" }, { value: "b", text: "RIP" }], answerText: "OSPF" }), "import-x", 2, null);
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
