// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import {
  validateActivityDescriptor, normalizeActivityDescriptor, toActivityBlock, isAssessmentSafe, assessmentActivityRegistry,
  ASSESSMENT_SAFE_ACTIVITIES, ASSESSMENT_ACTIVITY_KINDS, isJsonData
} from "./assessmentActivity";
import { AssessmentActivityRegistryProvider, AssessmentActivityContext } from "./AssessmentActivityContext";
import { StructuredSectionQuestion } from "./StructuredExamSection";
import { productionActivityRegistry } from "./learning/activities/engine";
import { builtinActivityRegistry } from "./learning/activities/builtins";
import { assessmentDemoRegistry, statefulDescriptor, plainDescriptor, unknownDescriptor, unsupportedVersionDescriptor, throwingDescriptor } from "./assessmentActivityFixtures";

// Phase 13C-A — interactive CONTEXT foundation. An activity is a trusted, registry-resolved renderer that gives a
// question (or a shared stimulus) an interactive context. It is NOT a scored question type: it never sets, submits or
// grades an answer. Trust is owned by repo code (the assessment-safe registry); stored content cannot grant it.

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const codes = (issues: { code: string }[]) => issues.map(i => i.code);
const tick = () => new Promise(r => setTimeout(r, 0));

describe("F6 — descriptor contract and code-owned assessment-safe allowlist", () => {
  it("kinds are the interactive-context families only (no guided scaffolding); a valid descriptor has no issues", () => {
    expect([...ASSESSMENT_ACTIVITY_KINDS]).toEqual(["simulation", "animation", "interactive-diagram"]);
    expect(validateActivityDescriptor(statefulDescriptor)).toEqual([]);
  });
  it("structural issues: missing id / key, invalid kind / version, non-JSON config", () => {
    expect(codes(validateActivityDescriptor({ ...statefulDescriptor, id: "" }))).toContain("MISSING_ID");
    expect(codes(validateActivityDescriptor({ ...statefulDescriptor, key: "" }))).toContain("MISSING_KEY");
    expect(codes(validateActivityDescriptor({ ...statefulDescriptor, kind: "guided" }))).toContain("INVALID_KIND");
    expect(codes(validateActivityDescriptor({ ...statefulDescriptor, version: 1.5 }))).toContain("INVALID_VERSION");
    expect(codes(validateActivityDescriptor({ ...statefulDescriptor, config: { fn: () => 1 } }))).toContain("INVALID_CONFIG");
    expect(codes(validateActivityDescriptor(null))).toEqual(["MALFORMED"]);
  });
  it("M13 — content can never name a component / module / function / markup: such fields are issues AND are dropped by normalization", () => {
    const hostile = { ...statefulDescriptor, component: "X", module: "../../evil", load: "() => import('x')", render: "<script>", src: "http://x", srcdoc: "<iframe>", html: "<b>", script: "alert(1)" } as unknown;
    expect(codes(validateActivityDescriptor(hostile))).toContain("EXECUTABLE_FIELD");
    const clean = normalizeActivityDescriptor(hostile);
    expect(clean).toEqual(statefulDescriptor);
    expect(Object.keys(clean!)).not.toEqual(expect.arrayContaining(["component", "module", "load", "src", "srcdoc", "html", "script", "render"]));
    const block = toActivityBlock(statefulDescriptor);
    expect(block).toMatchObject({ id: "act-1", type: "simulation", simulationType: "demo-stateful", version: 1, origin: "teacher-enrichment", title: "محاكاة تجريبية" });
    expect(JSON.stringify(toActivityBlock(hostile as never))).not.toMatch(/evil|alert|iframe|<script>/);
  });
  it("M16 — student-visible config must not carry a secret answer / key / solution / hint", () => {
    for (const bad of [{ answer: "4" }, { correctOptionIndex: 1 }, { solution: [1, 2] }, { hint: "x" }, { answerKey: "k" }, { teacherNote: "n" }, { nested: { expectedAnswer: 3 } }, { correct: true }]) {
      expect(codes(validateActivityDescriptor({ ...statefulDescriptor, config: bad }))).toContain("SECRET_IN_CONFIG");
    }
    expect(validateActivityDescriptor({ ...statefulDescriptor, config: { start: 0, labels: ["أ", "ب"], speed: 2 } })).toEqual([]);
    expect(isJsonData({ a: [1, "x", { b: null }] })).toBe(true); expect(isJsonData({ a: () => 1 })).toBe(false); expect(isJsonData(new Date())).toBe(false);
  });
  it("M12 — trust is code-owned: production ships ZERO assessment-safe renderers; learning renderers and built-ins are NOT exam-safe; a stored assessmentSafe flag has no authority", () => {
    expect(ASSESSMENT_SAFE_ACTIVITIES.length).toBe(0);
    expect(assessmentActivityRegistry.list()).toEqual([]);
    const learning = productionActivityRegistry.list()[0];
    expect(learning).toBeTruthy();
    expect(isAssessmentSafe({ id: "l1", kind: learning.kind as never, key: learning.key, version: learning.versions[0] })).toBe(false);
    expect(isAssessmentSafe({ id: "g1", kind: "guided" as never, key: "reveal", version: 1 })).toBe(false);
    expect(builtinActivityRegistry.has("guided", "reveal")).toBe(true);                                  // exists for LEARNING only
    const claimed = { ...unknownDescriptor, assessmentSafe: true, trusted: true, approved: true } as unknown;
    expect(isAssessmentSafe(claimed as never)).toBe(false);
    expect(codes(validateActivityDescriptor(claimed))).toContain("TRUST_CLAIM_IGNORED");
    expect(normalizeActivityDescriptor(claimed)).toEqual(unknownDescriptor);
    expect(isAssessmentSafe(statefulDescriptor, assessmentDemoRegistry)).toBe(true);                     // an injected (test) registry can approve
  });
});

describe("assessment activity host — safe fallback, isolation, reduced motion, context-only semantics", () => {
  const renderCtx = (descriptor: unknown, registry = assessmentDemoRegistry) =>
    render(<AssessmentActivityRegistryProvider registry={registry}><AssessmentActivityContext descriptor={descriptor as never} scope="question" /></AssessmentActivityRegistryProvider>);

  it("M14 — unknown key / unsupported version / malformed descriptor / unapproved renderer → static fallback, never a crash, never a live renderer", async () => {
    for (const d of [unknownDescriptor, unsupportedVersionDescriptor, { id: "bad", kind: "simulation" }, { ...statefulDescriptor, kind: "guided" }]) {
      const { container, unmount } = renderCtx(d);
      // wait for the REAL static fallback (host resolved → ActivityFallback note, or the context's own fallback) —
      // never accept the transient Suspense status as proof
      expect(await within(container).findByText(/عرض بديل ثابت/)).toBeTruthy();
      expect(container.querySelector(".iex-activity")).toBeTruthy();
      expect(container.querySelector(".iex-activity-status")).toBeNull();
      expect(screen.queryByTestId("demo-activity")).toBeNull();
      unmount();
    }
    // the PRODUCTION registry (empty) resolves nothing: an exam-safe-looking descriptor still falls back
    const { container } = renderCtx(statefulDescriptor, assessmentActivityRegistry);
    expect(await within(container).findByText(/عرض بديل ثابت/)).toBeTruthy();
    expect(screen.queryByTestId("demo-activity")).toBeNull();
    expect(container.querySelector(".iex-activity")).toBeTruthy();
  });
  it("an approved renderer loads lazily and runs; built-in learning presenters are NOT consulted in assessment context", async () => {
    renderCtx(statefulDescriptor);
    expect(await screen.findByTestId("demo-activity")).toBeTruthy();
    cleanup();
    const { container } = renderCtx({ id: "g", kind: "guided", key: "reveal", version: 1, title: "موجّه", steps: [] });
    await tick(); await tick();
    expect(container.querySelector(".learning-activity.kind-guided")).toBeNull();
    expect(container.textContent).not.toContain("حل مع المعلم");
  });
  it("a renderer exception is isolated to the activity (boundary → fallback); reduced motion is honored", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = renderCtx(throwingDescriptor);
    await tick(); await tick(); await tick();
    expect(container.querySelector(".learning-activity-fallback")).toBeTruthy();
    expect(container.querySelector(".iex-activity")).toBeTruthy();
    spy.mockRestore();
    cleanup();
    const mm = window.matchMedia;
    (window as unknown as { matchMedia: unknown }).matchMedia = (q: string) => ({ matches: q.includes("prefers-reduced-motion"), media: q, addEventListener: () => {}, removeEventListener: () => {} });
    try {
      renderCtx(plainDescriptor);
      const live = await screen.findByTestId("demo-activity");
      expect(live.getAttribute("data-reduced-motion")).toBe("true");
    } finally { window.matchMedia = mm; }
  });
  it("M15 — interacting with the activity never sets / submits / changes the scored response; the normal question still answers", async () => {
    const q = { examQuestionId: "q1", presentationType: "multipleChoice", text: "سؤال مع سياق", marks: 5, options: [{ text: "أ" }, { text: "ب" }], activity: statefulDescriptor };
    const section = { id: "s1", title: "S", gradingPolicy: "all", stimuli: {}, questions: [q] };
    const onChoice = vi.fn(), onText = vi.fn(), onSeq = vi.fn(), onTable = vi.fn(), onField = vi.fn(), onPart = vi.fn();
    render(
      <AssessmentActivityRegistryProvider registry={assessmentDemoRegistry}>
        <StructuredSectionQuestion section={section as never} q={q as never} questionIndex={0} globalIndex={0} answers={{}} countedKeys={new Set(["q1"])} showStimulus={false} disabled={false}
          onChoice={onChoice} onSeq={onSeq} onTable={onTable} onText={onText} onField={onField} onPart={onPart} />
      </AssessmentActivityRegistryProvider>
    );
    const live = await screen.findByTestId("demo-activity");
    fireEvent.click(within(live).getByRole("button", { name: "زِد" }));
    fireEvent.click(within(live).getByRole("button", { name: "زِد" }));
    expect(within(live).getByTestId("counter").textContent).toBe("2");
    expect(onChoice).not.toHaveBeenCalled(); expect(onText).not.toHaveBeenCalled(); expect(onSeq).not.toHaveBeenCalled(); expect(onTable).not.toHaveBeenCalled(); expect(onField).not.toHaveBeenCalled(); expect(onPart).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "إعادة تعيين" }));                                  // renderer-owned reset capability
    expect(within(live).getByTestId("counter").textContent).toBe("0");
    expect(onChoice).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("أ"));                                                           // the scored response path is untouched
    expect(onChoice).toHaveBeenCalledWith("q1", 0);
  });
  it("a shared-stimulus activity renders ONCE with the stimulus (section scope) and a question-level activity renders with its question", async () => {
    const stim = { title: "المحاكاة المشتركة", text: "اعتمد على المحاكاة", activity: plainDescriptor };
    const section = { id: "s1", title: "S", gradingPolicy: "all", stimuli: { g1: stim }, questions: [] };
    const q = { examQuestionId: "q1", presentationType: "shortAnswer", text: "س", marks: 1, groupId: "g1" };
    const noop = vi.fn();
    const { container } = render(
      <AssessmentActivityRegistryProvider registry={assessmentDemoRegistry}>
        <StructuredSectionQuestion section={section as never} q={q as never} questionIndex={0} globalIndex={0} answers={{}} countedKeys={new Set(["q1"])} showStimulus={true} disabled={false}
          onChoice={noop} onSeq={noop} onTable={noop} onText={noop} onField={noop} onPart={noop} />
      </AssessmentActivityRegistryProvider>
    );
    await screen.findByTestId("demo-activity");
    expect(container.querySelectorAll('[data-activity-scope="stimulus"]')).toHaveLength(1);
    expect(container.querySelector(".iex-stimulus")).toBeTruthy();
  });
});
