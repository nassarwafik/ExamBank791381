import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { qualityWarnings, QUALITY_LIMITS } from "./composerQuality";
import { composerVerdict } from "./composerExam";
import { buildPlanPrompt } from "./composerPrompts";
import { normalizeComposerIntent, type AiExamIntentV1 } from "./composerIntent";
import type { StructuredExam } from "../examTypes";

// Phase 21Q — code-computed quality warnings in the composer verdict (never blocking): answer position bias, longest-option give-away,
// answer leaks, true/false balance, near-duplicate stems, marks concentration and difficulty drift. Each check fires on the defect it names
// and stays silent on a balanced exam.
type Json = Record<string, unknown>;
const mcq = (id: string, text: string, options: string[], correct: number, marks = 1): Json => ({ examQuestionId: id, presentationType: "multipleChoice", text, marks, options: options.map(t => ({ text: t })), answer: { correctOptionIndex: correct } });
const tf = (id: string, text: string, correct: boolean): Json => ({ examQuestionId: id, presentationType: "trueFalse", text, marks: 1, answer: { correct } });
const exam = (questions: Json[], meta?: Json): StructuredExam => ({ examId: "E21Q", title: "t", sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions }], ...(meta ? { metadata: { aiComposer: meta } } : {}) } as unknown as StructuredExam);
const codes = (e: StructuredExam, intent?: AiExamIntentV1, diff?: (id: string) => string | undefined) => qualityWarnings(e, intent, diff).map(w => w.code);
const intentOf = (over: Json) => { const r = normalizeComposerIntent({ v: 1, subject: "s", totalMarks: 10, ...over }); if (!r.ok) throw new Error("intent"); return r.intent; };
const OPTS = ["الشبكة", "النقل", "التطبيقات", "الربط"];
// a balanced set: four MCQs, correct at four different positions, options of similar length, distinct stems
const BALANCED = [mcq("q1", "ما طبقة بروتوكول IP؟", OPTS, 0), mcq("q2", "ما طبقة بروتوكول TCP؟", OPTS, 1), mcq("q3", "في أي طبقة يعمل HTTP؟", OPTS, 2), mcq("q4", "أين يعمل Ethernet في النموذج؟", OPTS, 3)];

describe("21Q-MCQ position, longest option, leak", () => {
  it("a balanced exam raises nothing", () => { expect(codes(exam(BALANCED))).toEqual([]); });
  it("the same correct position in ≥ 80 % of ≥ 4 MCQs is flagged; 3 MCQs are not judged", () => {
    const same = BALANCED.map(q => ({ ...q, answer: { correctOptionIndex: 0 } }));
    expect(codes(exam(same))).toEqual(["COMPOSER_ANSWER_POSITION_BIAS"]);
    expect(codes(exam(same.slice(0, 3)))).toEqual([]);
    const mostly = [...same.slice(0, 4), { ...BALANCED[1], examQuestionId: "q5" }];   // 4 of 5 = 80 %
    expect(codes(exam(mostly))).toContain("COMPOSER_ANSWER_POSITION_BIAS");
  });
  it("the correct option being strictly the longest in ≥ 75 % of MCQs is flagged", () => {
    const long = BALANCED.map((q, i) => { const o = [...OPTS]; o[i] = o[i] + " وهي الطبقة المسؤولة عن هذا العمل"; return { ...q, options: o.map(t => ({ text: t })) }; });
    expect(codes(exam(long))).toEqual(["COMPOSER_LONGEST_OPTION"]);
  });
  it("a stem that contains the answer is flagged (MCQ correct option, short-answer model answer, fill-blank word); a stem quoting every option is not", () => {
    expect(codes(exam([mcq("q1", "طبقة الشبكة هي التي يعمل فيها IP، فما طبقته؟", OPTS, 0)]))).toEqual(["COMPOSER_ANSWER_LEAK"]);
    expect(codes(exam([mcq("q1", "أي من الشبكة والنقل والتطبيقات والربط طبقة IP؟", OPTS, 0)]))).toEqual([]);
    expect(codes(exam([{ examQuestionId: "q1", presentationType: "shortAnswer", text: "يسمى البروتوكول الموزّع للعناوين DHCP، فما اسمه؟", marks: 1, answer: { text: "DHCP" } }]))).toEqual(["COMPOSER_ANSWER_LEAK"]);
    expect(codes(exam([{ examQuestionId: "q1", presentationType: "fillBlank", text: "يعمل المنفذ 80 مع بروتوكول HTTP: أكمل رقم منفذ HTTP ___", marks: 1, fields: [{ id: "f1", correct: "80" }] }]))).toEqual([]);   // shorter than the leak bound
    expect(codes(exam([{ examQuestionId: "q1", presentationType: "fillBlank", text: "بروتوكول Telnet غير آمن، والبديل الآمن لـ ___ هو SSH", marks: 1, fields: [{ id: "f1", correct: "Telnet" }] }]))).toEqual(["COMPOSER_ANSWER_LEAK"]);
  });
  it("composite child parts are judged like questions", () => {
    const part = (id: string, correct: number) => ({ id, label: id, type: "multipleChoice", text: "سؤال فرعي " + id, marks: 1, options: OPTS.map(t => ({ text: t })), answer: { correctOptionIndex: correct } });
    const comp = { examQuestionId: "c1", presentationType: "composite", text: "مركّب", marks: 4, composite: { v: 1, contexts: [], groups: [{ id: "g1", parts: ["a", "b", "c", "d"].map(x => part(x, 0)) }] } };
    expect(codes(exam([comp]))).toEqual(["COMPOSER_ANSWER_POSITION_BIAS"]);
  });
});

describe("21Q-TF / duplicates / marks / difficulty", () => {
  it("every true/false answer the same (≥ 4) is flagged; a mix is not", () => {
    const four = ["أ", "ب", "ج", "د"].map((x, i) => tf("t" + i, "عبارة رقم " + x + " عن الشبكات", true));
    expect(codes(exam(four))).toEqual(["COMPOSER_TF_BALANCE"]);
    expect(codes(exam([...four.slice(0, 3), tf("t9", "عبارة أخرى عن الشبكات", false)]))).toEqual([]);
  });
  it("near-duplicate stems are flagged; exact duplicates are left to the existing check", () => {
    const a = mcq("q1", "ما الطبقة التي يعمل فيها بروتوكول IP في نموذج OSI", OPTS, 0);
    const b = mcq("q2", "ما الطبقة التي يعمل فيها بروتوكول IP في النموذج OSI", OPTS, 1);
    expect(codes(exam([a, b]))).toEqual(["COMPOSER_NEAR_DUPLICATE_STEM"]);
    expect(codes(exam([a, { ...a, examQuestionId: "q3", answer: { correctOptionIndex: 2 } }]))).toEqual([]);
    expect(codes(exam([a, mcq("q2", "اذكر وظيفة طبقة النقل في نموذج OSI باختصار", OPTS, 0)]))).toEqual([]);
  });
  it("one question with more than 40 % of the marks (exam of ≥ 4 questions) is flagged", () => {
    expect(codes(exam([{ ...BALANCED[0], marks: 7 }, ...BALANCED.slice(1)]))).toEqual(["COMPOSER_MARKS_CONCENTRATION"]);
    expect(codes(exam([{ ...BALANCED[0], marks: 2 }, ...BALANCED.slice(1)]))).toEqual([]);
  });
  it("difficulty drift: a single requested level under 50 % of the marks, or a profile off by > 20 points", () => {
    const d = (m: Record<string, string>) => (id: string) => m[id];
    expect(codes(exam(BALANCED), intentOf({ difficulty: "hard" }), d({ q1: "hard", q2: "easy", q3: "easy", q4: "medium" }))).toEqual(["COMPOSER_DIFFICULTY_DRIFT"]);
    expect(codes(exam(BALANCED), intentOf({ difficulty: "hard" }), d({ q1: "hard", q2: "hard", q3: "easy", q4: "medium" }))).toEqual([]);
    expect(codes(exam(BALANCED), intentOf({ difficultyProfile: { easy: 50, medium: 25, hard: 25 } }), d({ q1: "hard", q2: "hard", q3: "hard", q4: "easy" }))).toEqual(["COMPOSER_DIFFICULTY_DRIFT", "COMPOSER_DIFFICULTY_DRIFT", "COMPOSER_DIFFICULTY_DRIFT"]);   // easy 25 vs 50, medium 0 vs 25, hard 75 vs 25
    expect(codes(exam(BALANCED), intentOf({ difficulty: "mixed" }), d({ q1: "hard", q2: "hard", q3: "hard", q4: "hard" }))).toEqual([]);
  });
});

describe("21Q-VERDICT the checks reach the teacher as warnings, never as blocking", () => {
  it("composerVerdict carries them (with the question id) and stays ok", () => {
    const e = exam(BALANCED.map(q => ({ ...q, answer: { correctOptionIndex: 0 } })), { v: 1, catalog: "x", coverage: [], history: [] });
    const v = composerVerdict(e);
    expect(v.ok).toBe(true);
    expect(v.blocking.map(i => i.code)).not.toContain("COMPOSER_ANSWER_POSITION_BIAS");
    expect(v.warnings.find(w => w.code === "COMPOSER_ANSWER_POSITION_BIAS")).toMatchObject({ questionId: "q1" });
    expect(v.summary.warnings).toBe(v.warnings.length);
  });
  it("the verdict reads difficulty from the composer coverage metadata", () => {
    const meta = { v: 1, catalog: "x", coverage: BALANCED.map(q => ({ questionId: q.examQuestionId, topic: "t", difficulty: "easy" })), history: [] };
    expect(composerVerdict(exam(BALANCED, meta), { intent: intentOf({ totalMarks: 4, difficulty: "hard" }) }).warnings.map(w => w.code)).toContain("COMPOSER_DIFFICULTY_DRIFT");
  });
  it("on the five reference exams (20F fixtures) only a real defect is reported: fixture A's six MCQs all keep the answer at position 1", () => {
    const dir = path.resolve(__dirname, "../../docs/fixtures/ai-composer-20f");
    const got = Object.fromEntries(["A-network", "B-physics", "C-computer-science", "D-mathematics", "E-showcase"].map(n => { const j = JSON.parse(fs.readFileSync(path.join(dir, n + ".json"), "utf8")); return [n, codes((j.exam ?? j) as StructuredExam)]; }));
    expect(got).toEqual({ "A-network": ["COMPOSER_ANSWER_POSITION_BIAS"], "B-physics": [], "C-computer-science": [], "D-mathematics": [], "E-showcase": [] });
    expect(QUALITY_LIMITS.positionShare).toBe(0.8);
  });
});

describe("21Q-PROMPT the model is asked to avoid the same defects", () => {
  it("the rules ask for varied answer positions, similar option lengths, mixed true/false and no repeated questions", () => {
    expect(buildPlanPrompt(intentOf({}))).toContain("- Vary the position of the correct option across multiple-choice questions, keep options of similar length, mix true and false answers, and never ask two questions that say the same thing.");
  });
});
