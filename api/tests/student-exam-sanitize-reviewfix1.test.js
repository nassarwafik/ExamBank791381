import { describe, it, expect } from "vitest";
import { sanitizeExamForStudent } from "../src/lib/student-exam-sanitize.js";

// Phase 13C-A — Independent Review Fix 1 / R3: the student copy of an activity config must not leak a secret through key
// spelling (case, separators, semantic variants), at any nesting depth, in objects or arrays. Safe keys stay intact.
const variants = { correct_answer: "LEAK-1", CorrectAnswer: "LEAK-2", teacherAnswer: "LEAK-3", answer_key: "LEAK-4", ExpectedAnswer: "LEAK-5", "Is_Correct": true, "model answer": "LEAK-6", teacher_note: "LEAK-7", "Solution Steps": ["LEAK-8"], hint_text: "LEAK-9", grading_key: "LEAK-10", ScoringRubric: "LEAK-11", secretSeed: "LEAK-12", api_key: "LEAK-13", Expected: "LEAK-14", rationale_text: "LEAK-15" };
const safe = { start: 0, labels: ["أ", "ب"], speed: 2, angle: 45, initialState: { x: 1 }, steps: [{ title: "1" }], mode: "free", seed: 7, range: { min: 0, max: 10 }, unit: "m/s", showGrid: true, keyframes: [0, 1] };
const activity = { id: "act-1", kind: "simulation", key: "projectile", version: 1, title: "محاكاة", config: { ...safe, ...variants, nested: { ok: 1, deeper: { ...variants } }, list: [{ ok: 2, ...variants }, "plain", 3] } };
const exam = () => ({ examId: "e1", title: "t", schemaVersion: 2, sections: [{ id: "s1", title: "S", gradingPolicy: "all", stimuli: { g1: { title: "مشترك", activity } },
  questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", text: "س1", marks: 1, groupId: "g1", answer: { text: "SECRET-Q" }, activity,
    parts: undefined }, { examQuestionId: "q2", presentationType: "compound", text: "م", marks: 2, parts: [{ id: "p1", type: "shortAnswer", text: "أ", marks: 2, answer: { text: "SECRET-P" }, activity }] }] }] });

describe("R3 — sanitizer strips the whole class of secret-looking config keys (question, part and stimulus scope)", () => {
  it("no variant key or value survives at any depth; safe keys and structure are intact", () => {
    const s = sanitizeExamForStudent(exam());
    const text = JSON.stringify(s);
    for (let i = 1; i <= 15; i++) expect(text).not.toContain("LEAK-" + i);
    for (const k of Object.keys(variants)) expect(text).not.toContain(JSON.stringify(k) + ":");
    const cfg = s.sections[0].questions[0].activity.config;
    expect(cfg).toEqual({ ...safe, nested: { ok: 1, deeper: {} }, list: [{ ok: 2 }, "plain", 3] });
    expect(s.sections[0].stimuli.g1.activity.config).toEqual(cfg);
    expect(s.sections[0].questions[1].parts[0].activity.config).toEqual(cfg);
    expect(text).not.toContain("SECRET-Q"); expect(text).not.toContain("SECRET-P");                       // existing answer secrecy untouched
  });
});
