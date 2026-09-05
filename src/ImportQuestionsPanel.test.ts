import { describe, it, expect } from "vitest";
import { applySectionOverride, distributeMarks, convertTableRowsToWordBankFields, parseWordBankInput, toExamQuestion } from "./ImportQuestionsPanel";
import type { ImportedQuestion } from "./ImportQuestionsPanel";

function question(overrides: Partial<ImportedQuestion> = {}): ImportedQuestion {
  return {
    importedQuestionId: "q1",
    importJobId: "imp-1",
    sourceFileName: "exam.docx",
    pageNumbers: [1],
    questionNumberGuess: "1",
    topic: "OSPF",
    difficulty: 2,
    presentationType: "open",
    confidence: 0.9,
    text: "text",
    options: [],
    hasVisibleAnswer: false,
    answerText: "",
    requiresManualReview: false,
    images: [],
    section: "INFRASTRUCTURE",
    sectionConfidence: 1,
    wordBankInput: "",
    ...overrides
  };
}

describe("applySectionOverride - the teacher can always change the auto-resolved section", () => {
  it("overrides a section that was auto-resolved with full (1.0) confidence", () => {
    const pool = [question({ section: "INFRASTRUCTURE", sectionConfidence: 1 })];
    const updated = applySectionOverride(pool, "q1", "BASIC");
    expect(updated[0].section).toBe("BASIC");
  });

  it("overrides a section that was left null (low-confidence/unknown topic)", () => {
    const pool = [question({ section: null, sectionConfidence: 0 })];
    const updated = applySectionOverride(pool, "q1", "INFRASTRUCTURE");
    expect(updated[0].section).toBe("INFRASTRUCTURE");
  });

  it("does not touch sectionConfidence or any other field when overriding", () => {
    const pool = [question({ section: "BASIC", sectionConfidence: 0.972, topic: "IP_ADDRESSING" })];
    const updated = applySectionOverride(pool, "q1", "INFRASTRUCTURE");
    expect(updated[0].sectionConfidence).toBe(0.972);
    expect(updated[0].topic).toBe("IP_ADDRESSING");
  });

  it("only updates the targeted question, leaving others in the pool untouched", () => {
    const pool = [question({ importedQuestionId: "q1", section: "BASIC" }), question({ importedQuestionId: "q2", section: "INFRASTRUCTURE" })];
    const updated = applySectionOverride(pool, "q1", "INFRASTRUCTURE");
    expect(updated[0].section).toBe("INFRASTRUCTURE");
    expect(updated[1].section).toBe("INFRASTRUCTURE"); // q2's own original value, unrelated to the override
  });
});

describe("distributeMarks - spreads 100 marks evenly across an imported selection (same algorithm as generate-exam.js)", () => {
  it("splits evenly when the count divides 100 exactly", () => {
    expect(distributeMarks(100, 4)).toEqual([25, 25, 25, 25]);
    expect(distributeMarks(100, 5)).toEqual([20, 20, 20, 20, 20]);
  });

  it("hands the remainder to the first questions, one mark each, so the total is always exact", () => {
    const marks = distributeMarks(100, 3);
    expect(marks).toEqual([34, 33, 33]);
    expect(marks.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("gives all 100 marks to a single selected question", () => {
    expect(distributeMarks(100, 1)).toEqual([100]);
  });

  it("always sums to exactly the requested total regardless of question count", () => {
    for (const count of [1, 2, 3, 6, 7, 9, 13, 40]) {
      const marks = distributeMarks(100, count);
      expect(marks).toHaveLength(count);
      expect(marks.reduce((a, b) => a + b, 0)).toBe(100);
    }
  });

  it("falls back to a count of 1 for zero/negative input instead of dividing by zero", () => {
    expect(distributeMarks(100, 0)).toEqual([100]);
    expect(distributeMarks(100, -3)).toEqual([100]);
  });
});

describe("convertTableRowsToWordBankFields - manually converting an imported table question to wordBank", () => {
  it("builds one field per row using the non-blank cell as the label (blank-first layout, matching the screenshot)", () => {
    const text =
      "جزء الشبكة وجزء الحاسوب أكمل الجدول التالي للعنوان 192.168.10.55/24:\n" +
      "| الإجابة | المعطى |\n" +
      "| --- | --- |\n" +
      "| ___ | Network Address |\n" +
      "| ____ | Host Part |\n" +
      "| _ | Subnet Mask |";

    const converted = convertTableRowsToWordBankFields(text);
    expect(converted).not.toBeNull();
    expect(converted!.prose).toBe("جزء الشبكة وجزء الحاسوب أكمل الجدول التالي للعنوان 192.168.10.55/24:");
    expect(converted!.fields.map(f => f.label)).toEqual(["Network Address", "Host Part", "Subnet Mask"]);
    expect(converted!.fields.map(f => f.kind)).toEqual(["select", "select", "select"]);
  });

  it("builds fields the same way when the blank column comes second instead of first", () => {
    const text = "اكتب لكل عنوان الفئة التي ينتمي إليها:\n| العنوان | الفئة |\n| --- | --- |\n| 223.100.220.100 | -- |\n| 92.168.100.29 | -- |";
    const converted = convertTableRowsToWordBankFields(text);
    expect(converted!.fields.map(f => f.label)).toEqual(["223.100.220.100", "92.168.100.29"]);
  });

  it("returns null when the question has no table to convert", () => {
    expect(convertTableRowsToWordBankFields("سؤال عادي بلا جدول إطلاقًا.")).toBeNull();
  });

  it("assigns sequential order matching row order", () => {
    const text = "س:\n| أ | ب |\n| --- | --- |\n| _ | one |\n| _ | two |\n| _ | three |";
    const converted = convertTableRowsToWordBankFields(text);
    expect(converted!.fields.map(f => f.order)).toEqual([0, 1, 2]);
  });
});

describe("toExamQuestion - manually authoring a matching question (طابق)", () => {
  const text = "طابق كل بروتوكول بالطبقة الصحيحة:\n| البروتوكول | الطبقة |\n| --- | --- |\n| HTTP | -- |\n| IP | -- |";

  it("builds one field per row, each carrying the SAME shared options pool (a real matching dropdown, not per-row-different)", () => {
    const q = question({ presentationType: "matching", text, wordBankInput: "طبقة التطبيقات, طبقة الشبكة" });
    const exam = toExamQuestion(q, 0, 10);
    expect(exam.fields.map(f => f.label)).toEqual(["HTTP", "IP"]);
    expect(exam.fields[0].options?.map(o => o.value)).toEqual(["طبقة التطبيقات", "طبقة الشبكة"]);
    expect(exam.fields[1].options?.map(o => o.value)).toEqual(["طبقة التطبيقات", "طبقة الشبكة"]);
  });

  it("leaves wordBank undefined for matching - resolveTableRowOptions reads field.options first, never q.wordBank for matching", () => {
    const q = question({ presentationType: "matching", text, wordBankInput: "طبقة التطبيقات, طبقة الشبكة" });
    const exam = toExamQuestion(q, 0, 10);
    expect(exam.wordBank).toBeUndefined();
  });

  it("does not invent an answer - answer stays empty, left for Auto-Fix to fill in later", () => {
    const q = question({ presentationType: "matching", text, wordBankInput: "طبقة التطبيقات, طبقة الشبكة" });
    const exam = toExamQuestion(q, 0, 10);
    expect(exam.answer).toEqual({});
  });
});

describe("toExamQuestion - manually authoring an ordering question (رتّب)", () => {
  const text = "رتّب خطوات عملية DHCP التالية:\n| الخطوة | - |\n| --- | --- |\n| DHCP Discover | -- |\n| DHCP Offer | -- |\n| DHCP Request | -- |\n| DHCP Ack | -- |";

  it("builds one field per item and a deterministic 1..N word bank - never teacher-typed or invented", () => {
    const q = question({ presentationType: "ordering", text });
    const exam = toExamQuestion(q, 0, 10);
    expect(exam.fields.map(f => f.label)).toEqual(["DHCP Discover", "DHCP Offer", "DHCP Request", "DHCP Ack"]);
    expect(exam.wordBank).toEqual(["1", "2", "3", "4"]);
  });

  it("ignores wordBankInput entirely for ordering (no manual pool needed)", () => {
    const q = question({ presentationType: "ordering", text, wordBankInput: "should be ignored" });
    const exam = toExamQuestion(q, 0, 10);
    expect(exam.wordBank).toEqual(["1", "2", "3", "4"]);
  });

  it("does not invent an answer - the correct order stays empty, left for Auto-Fix", () => {
    const q = question({ presentationType: "ordering", text });
    const exam = toExamQuestion(q, 0, 10);
    expect(exam.answer).toEqual({});
  });
});

describe("parseWordBankInput - the teacher's typed answer pool", () => {
  it("splits on commas and trims whitespace", () => {
    expect(parseWordBankInput("192.168.10.0, 0.0.0.55 , 255.255.255.0")).toEqual(["192.168.10.0", "0.0.0.55", "255.255.255.0"]);
  });

  it("also splits on newlines", () => {
    expect(parseWordBankInput("Class A\nClass B\nClass C")).toEqual(["Class A", "Class B", "Class C"]);
  });

  it("drops empty entries and duplicates", () => {
    expect(parseWordBankInput("a, , a, b,")).toEqual(["a", "b"]);
  });

  it("returns an empty array for empty/whitespace-only input", () => {
    expect(parseWordBankInput("")).toEqual([]);
    expect(parseWordBankInput("   ")).toEqual([]);
  });
});
