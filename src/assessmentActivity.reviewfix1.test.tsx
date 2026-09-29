// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { validateActivityDescriptor } from "./assessmentActivity";
import { AssessmentActivityRegistryProvider } from "./AssessmentActivityContext";
import { StructuredSectionQuestion } from "./StructuredExamSection";
import { assessmentDemoRegistry, statefulDescriptor, plainDescriptor } from "./assessmentActivityFixtures";

// Phase 13C-A — Independent Review Fix 1: R3 secret-key class (spelling variants) and F2 placement semantics.
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const codes = (issues: { code: string }[]) => issues.map(i => i.code);

describe("R3 — student-visible config: the secret-key predicate covers spelling / case / separator variants and nesting", () => {
  const variants = ["correct_answer", "CorrectAnswer", "teacherAnswer", "answer_key", "ExpectedAnswer", "Answer", "ANSWERS", "correct-option-index", "Is_Correct", "model answer", "teacher_note", "Solution Steps", "hint_text", "Hints", "grading_key", "ScoringRubric", "secretSeed", "api_key", "Expected", "rationale_text", "AI Instruction"];
  it("each variant at top level, nested in an object and inside an array is reported as SECRET_IN_CONFIG", () => {
    for (const k of variants) {
      expect(codes(validateActivityDescriptor({ ...statefulDescriptor, config: { [k]: 1 } })), k).toContain("SECRET_IN_CONFIG");
      expect(codes(validateActivityDescriptor({ ...statefulDescriptor, config: { nested: { deeper: { [k]: "v" } } } })), "nested " + k).toContain("SECRET_IN_CONFIG");
      expect(codes(validateActivityDescriptor({ ...statefulDescriptor, config: { items: [{ ok: 1 }, { [k]: "v" }] } })), "array " + k).toContain("SECRET_IN_CONFIG");
    }
  });
  it("ordinary safe config keys stay valid", () => {
    const safe = { start: 0, labels: ["أ", "ب"], speed: 2, angle: 45, initialState: { x: 1 }, steps: [{ title: "1" }], mode: "free", seed: 7, range: { min: 0, max: 10 }, unit: "m/s", color: "#333", width: 320, items: [1, 2], nodes: [{ id: "n1", label: "A" }], showGrid: true, keyframes: [0, 1] };
    expect(validateActivityDescriptor({ ...statefulDescriptor, config: safe })).toEqual([]);
  });
});

describe("F2 — placement is honored: 'after' renders the activity after the question body / stimulus text, default before", () => {
  const noop = vi.fn();
  const renderQ = (activity: unknown, stim?: unknown) => {
    const section = { id: "s1", title: "S", gradingPolicy: "all", stimuli: stim ? { g1: stim } : {}, questions: [] };
    const q = { examQuestionId: "q1", presentationType: "shortAnswer", text: "نص السؤال المميز", marks: 1, ...(stim ? { groupId: "g1" } : {}), ...(activity ? { activity } : {}) };
    return render(
      <AssessmentActivityRegistryProvider registry={assessmentDemoRegistry}>
        <StructuredSectionQuestion section={section as never} q={q as never} questionIndex={0} globalIndex={0} answers={{}} countedKeys={new Set(["q1"])} showStimulus={!!stim} disabled={false}
          onChoice={noop} onSeq={noop} onTable={noop} onText={noop} onField={noop} onPart={noop} />
      </AssessmentActivityRegistryProvider>
    );
  };
  const precedes = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  it("question scope: default / 'before' → activity precedes the question text; 'after' → activity follows it", async () => {
    let { container } = renderQ(plainDescriptor);
    let act = container.querySelector('[data-activity-scope="question"]')!; let body = screen.getByText("نص السؤال المميز");
    expect(act.getAttribute("data-activity-placement")).toBe("before"); expect(precedes(act, body)).toBe(true);
    cleanup();
    ({ container } = renderQ({ ...plainDescriptor, placement: "after" }));
    act = container.querySelector('[data-activity-scope="question"]')!; body = screen.getByText("نص السؤال المميز");
    expect(act.getAttribute("data-activity-placement")).toBe("after"); expect(precedes(body, act)).toBe(true);
    await screen.findByTestId("demo-activity");
  });
  it("stimulus scope: 'after' renders after the stimulus text, default before", () => {
    let { container } = renderQ(undefined, { title: "مادة", text: "نص المادة المشتركة", activity: plainDescriptor });
    let act = container.querySelector('[data-activity-scope="stimulus"]')!; let text = screen.getByText("نص المادة المشتركة");
    expect(precedes(act, text)).toBe(true);
    cleanup();
    ({ container } = renderQ(undefined, { title: "مادة", text: "نص المادة المشتركة", activity: { ...plainDescriptor, placement: "after" } }));
    act = container.querySelector('[data-activity-scope="stimulus"]')!; text = screen.getByText("نص المادة المشتركة");
    expect(precedes(text, act)).toBe(true);
  });
});
