// @vitest-environment happy-dom
// Learning Practice — the SAME shared runner renders the F-series (final exams for training) question shapes: MCQ,
// matching (the item's printed table with a select per row) and open text. It collects every answer kind through
// the student exam's own question primitive, enables submission only when all are answered, sends ONLY the answers
// (kinds choice / table / text), and renders the server's review: the learner's own non-choice answer, the revealed
// key text of a matching question, and a neutral «لا يُصحَّح تلقائيًا» row for an open question. No second runner.
// STRENGTH: an F item is a full 40-point Strength bucket exactly like a T item — the server advertises
// strengthEligible: true / maxPoints 40 and the runner shows the SAME ceiling, best percentage, earned points and gain
// (no «بلا نقاط» wording anywhere); it still says that open questions are not part of the automatic score.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import LearningTrainingRunner from "./LearningTrainingRunner";
import type { TrainingClient, TrainingLoadResponse, TrainingSubmitResponse } from "./types";
import type { Question } from "../../StudentQuestionCard";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const PAIRS = ["تعيين عنوان IP تلقائية", "تحويل أسماء النطاق", "نقل الملفات", "تصفح المواقع"];
const questions: Question[] = [
  { examQuestionId: "LIB-F01-Q01", presentationType: "multipleChoice", marks: 3, text: "ما البروتوكول الآمن للتصفّح؟", options: [{ value: "0", text: "HTTP" }, { value: "1", text: "HTTPS" }], answer: {}, hint: "" },
  {
    examQuestionId: "LIB-F01-Q05", presentationType: "matching", marks: 4, text: "اربط كل بروتوكول بوظيفته:\n\n| البند | الإجابة |\n| --- | --- |\n| DNS | |\n| DHCP | |",
    fields: [{ id: "q5_dns", label: "DNS", kind: "select", options: PAIRS.map(v => ({ value: v })) }, { id: "q5_dhcp", label: "DHCP", kind: "select", options: PAIRS.map(v => ({ value: v })) }],
    options: [], answer: {}, hint: "",
  },
  { examQuestionId: "LIB-F01-Q11", presentationType: "open", marks: 2, text: "أكمل الناقص في الجملة:", fields: [], options: [], answer: {}, hint: "" },
] as unknown as Question[];
const LOADED: TrainingLoadResponse = {
  ok: true, actor: "student",
  training: { trainingId: "F01", order: 31, label: "الامتحان الأول", requiredModuleId: "791381-m06", courseId: "791381", available: true, strengthEligible: true, title: "نموذج A — 2025", questionCount: 3, totalMarks: 9, maxPoints: 40 },
  exam: { examId: "LIB-F01", title: "نموذج A — 2025", questions, totalMarks: 9 },
};
// 33% of 40 = 13.2 → 13 points (the SERVER's numbers; the runner never computes them)
const GRADED: TrainingSubmitResponse = {
  ok: true, actor: "student", persisted: true,
  result: {
    correctCount: 1, questionCount: 3, score: 3, totalMarks: 9, percentage: 33,
    review: [
      { questionId: "LIB-F01-Q01", questionNumber: 1, correct: true, chosenIndex: 1, correctOptionIndex: 1, hint: "" },
      { questionId: "LIB-F01-Q05", questionNumber: 2, correct: false, chosenIndex: null, correctOptionIndex: null, correctText: "DNS=تحويل أسماء النطاق؛ DHCP=تعيين عنوان IP تلقائية", hint: "" },
      { questionId: "LIB-F01-Q11", questionNumber: 3, correct: false, manualReview: true, chosenIndex: null, correctOptionIndex: null, correctText: "", hint: "" },
    ],
  },
  practice: { bestPercentage: 33, bestPoints: 13, maxPoints: 40, attempts: 1, lastCompletedAt: null, improved: true, pointsGained: 13, earnedPoints: 13 },
};
function client(loaded: TrainingLoadResponse = LOADED, graded: TrainingSubmitResponse = GRADED) {
  const submit = vi.fn(async () => graded);
  return { list: vi.fn(async () => ({ ok: true as const, actor: "student" as const, trainings: [] })), load: vi.fn(async () => loaded), submit } as TrainingClient & { submit: ReturnType<typeof vi.fn>; load: ReturnType<typeof vi.fn> };
}
const submitBtn = () => screen.getByRole("button", { name: /أرسل الإجابات|جارٍ التصحيح/ }) as HTMLButtonElement;
function answerAllThree() {
  fireEvent.click(screen.getAllByRole("radio")[1]);
  const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
  fireEvent.change(selects[0], { target: { value: PAIRS[1] } }); fireEvent.change(selects[1], { target: { value: PAIRS[0] } });
  fireEvent.change(screen.getByPlaceholderText("اكتب إجابتك هنا..."), { target: { value: "إجابة الطالب" } });
}

describe("LearningTrainingRunner — F-series shapes (MCQ + matching + open) through the one shared runner", () => {
  it("renders the three shapes, collects choice / table / text answers, gates submission on all three, sends ONLY the answers, and reviews non-choice rows honestly", async () => {
    const c = client();
    render(<LearningTrainingRunner trainingId="F01" actor="student" client={c} onExit={vi.fn()} />);
    expect(await screen.findByRole("heading", { level: 2, name: "نموذج A — 2025" })).toBeTruthy();
    expect(screen.getByText("الامتحان الأول")).toBeTruthy();
    // the SAME Strength promise as a T item: the 40-point ceiling; no «بلا نقاط» wording anywhere
    expect(screen.getByText("حتى 40 نقطة قوة")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/بلا نقاط|لا يمنح نقاط|تقوية|\/ 25|حتى 25/);
    expect(document.querySelectorAll(".iex-q").length).toBe(3);
    expect(screen.getByText("طابق")).toBeTruthy();                       // the matching card kind
    expect(screen.getByText(/أسئلة مُجابة/).textContent).toBe("0 / 3 أسئلة مُجابة");
    expect(submitBtn().disabled).toBe(true);
    // 1. MCQ
    fireEvent.click(screen.getAllByRole("radio")[1]);
    expect(screen.getByText(/أسئلة مُجابة/).textContent).toBe("1 / 3 أسئلة مُجابة");
    // 2. matching: one select per printed row (DNS, DHCP)
    const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
    expect(selects.length).toBe(2);
    expect(selects[0].getAttribute("aria-label")).toBe("DNS — الإجابة");
    fireEvent.change(selects[0], { target: { value: PAIRS[1] } });
    expect(screen.getByText(/أسئلة مُجابة/).textContent).toBe("2 / 3 أسئلة مُجابة");   // one row answered counts the question as started
    fireEvent.change(selects[1], { target: { value: PAIRS[0] } });
    expect(submitBtn().disabled).toBe(true);                             // the open question is still empty
    // 3. open text
    fireEvent.change(screen.getByPlaceholderText("اكتب إجابتك هنا..."), { target: { value: "إجابة الطالب" } });
    expect(screen.getByText(/أسئلة مُجابة/).textContent).toBe("3 / 3 أسئلة مُجابة");
    expect(submitBtn().disabled).toBe(false);
    // no key vocabulary before submit
    expect(document.body.innerHTML).not.toMatch(/الإجابة الصحيحة|DNS=|correct/);
    fireEvent.click(submitBtn());
    await screen.findByText("مراجعة الإجابات");
    expect(c.submit).toHaveBeenCalledTimes(1);
    expect(c.submit.mock.calls[0]).toEqual(["F01", {
      "LIB-F01-Q01": { kind: "choice", index: 1 },
      "LIB-F01-Q05": { kind: "table", values: [PAIRS[1], PAIRS[0]] },
      "LIB-F01-Q11": { kind: "text", value: "إجابة الطالب" },
    }]);
    // the server's numbers, verbatim: result, best percentage, earned points out of 40, the gain of THIS submission
    expect(screen.getByText(/إجابات صحيحة$/).textContent).toBe("1 / 3 إجابات صحيحة");
    expect(screen.getAllByText("33%").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("أفضل نسبة")).toBeTruthy();
    expect(screen.getByText("13 / 40").closest("dd")!.textContent).toBe("13 / 40 نقاط قوة");
    expect(screen.getByText("+13").closest("dd")!.textContent).toBe("+13 نقاط قوة");
    expect(screen.getByText("تحسّنت أفضل نتيجتك: +13 نقاط قوة.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/بلا نقاط|لا يمنح نقاط|تقوية|\/ 25|\/ 0 /);
    expect(screen.getByText("النسبة المعروضة تلقائية: سؤال مقالي واحد لا يُصحَّح تلقائيًا، وعلاماته غير مُحتسبة في النتيجة التلقائية.")).toBeTruthy();
    const items = document.querySelectorAll(".learning-training-review-item");
    const line = (el: Element, tag: string) => Array.from(el.querySelectorAll("p.learning-training-review-line")).find(p => p.textContent?.startsWith(tag))?.textContent ?? "";
    expect(items.length).toBe(3);
    expect(items[0].classList.contains("is-right")).toBe(true);
    expect(line(items[0], "إجابتك")).toContain("HTTPS");
    // matching: the learner's own rows + the revealed key text (post-submit only)
    expect(items[1].classList.contains("is-wrong")).toBe(true);
    expect(line(items[1], "إجابتك")).toContain(PAIRS[1] + " · " + PAIRS[0]);
    expect(line(items[1], "الإجابة الصحيحة")).toContain("DNS=تحويل أسماء النطاق");
    // open: neutral manual-review row, never «غير صحيح», with the learner's own text
    expect(items[2].classList.contains("is-manual")).toBe(true);
    expect(items[2].classList.contains("is-wrong")).toBe(false);
    expect(within(items[2] as HTMLElement).getByText("لا يُصحَّح تلقائيًا")).toBeTruthy();
    expect(line(items[2], "إجابتك")).toContain("إجابة الطالب");
    expect(within(items[2] as HTMLElement).getByText("سؤال مقالي لا يُصحَّح تلقائيًا؛ علامته غير مُحتسبة في النتيجة التلقائية لهذا التدريب.")).toBeTruthy();
    expect(document.body.innerHTML).not.toMatch(/يُراجعه المعلّم/);      // no teacher-grading workflow is promised
    expect(line(items[2], "الإجابة الصحيحة")).toBe("");
    // «أعد التدريب» restarts with empty answers, without re-fetching
    fireEvent.click(screen.getByRole("button", { name: "أعد التدريب" }));
    await waitFor(() => expect(screen.getByText(/أسئلة مُجابة/).textContent).toBe("0 / 3 أسئلة مُجابة"));
    expect(c.load).toHaveBeenCalledTimes(1);
  });

  it("a retry that does NOT improve: «لم تزد نقاط القوة» with the kept best (33%, 13 / 40) and a +0 gain row", async () => {
    const G: TrainingSubmitResponse = { ...GRADED, practice: { ...GRADED.practice!, attempts: 2, improved: false, pointsGained: 0 } };
    render(<LearningTrainingRunner trainingId="F01" actor="student" client={client(LOADED, G)} onExit={vi.fn()} />);
    await screen.findByRole("heading", { level: 2, name: "نموذج A — 2025" });
    answerAllThree(); fireEvent.click(submitBtn());
    await screen.findByText("مراجعة الإجابات");
    expect(screen.getByText("13 / 40").closest("dd")!.textContent).toBe("13 / 40 نقاط قوة");
    expect(screen.getByText("+0").closest("dd")!.textContent).toBe("+0 نقاط قوة");
    expect(screen.getByText(/لم تزد نقاط القوة: أفضل نتيجتك المحفوظة ما زالت 33% \(13 \/ 40 نقاط قوة\)/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\+13/);
  });

  it("the SAME runner shows the identical Strength messaging for a T item: maxPoints 40 → «حتى 40 نقطة قوة», «13 / 40 نقاط قوة», «+13 نقاط قوة», and a listed best with its points", async () => {
    const T: TrainingLoadResponse = { ...LOADED, training: { ...LOADED.training, trainingId: "T05", label: "تدريب 5", title: "Class وSubnet وCIDR", strengthEligible: true, maxPoints: 40 }, best: { bestPercentage: 20, bestPoints: 8, maxPoints: 40, attempts: 1, lastCompletedAt: null } };
    const G: TrainingSubmitResponse = { ...GRADED, practice: { bestPercentage: 33, bestPoints: 13, maxPoints: 40, attempts: 2, lastCompletedAt: null, improved: true, pointsGained: 5, earnedPoints: 13 } };
    render(<LearningTrainingRunner trainingId="T05" actor="student" client={client(T, G)} onExit={vi.fn()} />);
    await screen.findByRole("heading", { level: 2, name: "Class وSubnet وCIDR" });
    expect(screen.getByText("حتى 40 نقطة قوة")).toBeTruthy();
    expect(screen.getByText(/أفضل نتيجة:/).textContent).toBe("أفضل نتيجة: 20% · 8 / 40 نقاط قوة");
    expect(screen.getByText(/تدريب حرّ: أعده كما تشاء/)).toBeTruthy();
    answerAllThree(); fireEvent.click(submitBtn());
    await screen.findByText("مراجعة الإجابات");
    expect(screen.getByText("13 / 40").closest("dd")!.textContent).toBe("13 / 40 نقاط قوة");
    expect(screen.getByText("+5").closest("dd")!.textContent).toBe("+5 نقاط قوة");
    expect(screen.getByText("تحسّنت أفضل نتيجتك: +5 نقاط قوة.")).toBeTruthy();
  });
});
