// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { Suspense } from "react";
import { render, cleanup, fireEvent, act, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveStudentRenderer } from "./studentRegistry";
import { resolveAuthoringEditor } from "./authoringRegistry";
import StudentQuestionCard from "../StudentQuestionCard";
import type { Question } from "../StudentQuestionCard";
import { sanitizeExamForStudent } from "../../api/src/lib/student-exam-sanitize.js";
import { compositeArabicExam, compositePhysicsExam, compositeCsExam, ARABIC_PASSAGE, CS_SOURCE } from "../composite/compositeFixtures";

// Phase 20D — the composite@1 UIs: a LAZY student renderer (one shared source / workspace per context, groups, parts through the existing
// renderers, first-N excess, per-part / per-context / whole resets), a LAZY enterprise authoring editor and a LAZY teacher review tree.
// Fail-first on caac213: no renderer / editor / review exists for composite@1 (the student sees the unsupported notice).
afterEach(cleanup);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p: string) => fs.readFileSync(path.join(repo, p), "utf8");
const studentQ = (e: unknown) => (sanitizeExamForStudent(e) as { sections: { questions: unknown[] }[] }).sections[0].questions[0] as Question;
const settle = async (container: HTMLElement) => { for (let i = 0; i < 60; i++) { await act(async () => { await new Promise(r => setTimeout(r, 20)); }); if (!container.querySelector('[role="status"]')) break; } };
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;
// The renderer and the editor are LAZY (pinned below by source and by the bundle guard). The test runner transforms a lazily imported module
// graph on first use — about 1 s for the composite renderer when cold, close to the fixed settle budget above (60 × 20 ms) — so the first
// render raced the transformer and failed intermittently on a loaded worker (on the baseline too; the chart-aware rich content made the cold
// graph a little larger). Loading both modules once up front leaves the settle loop waiting for React, never for the transformer; every
// assertion and the settle budget are unchanged.
beforeAll(async () => { await Promise.all([import("./student/CompositeResponse"), import("./editors/CompositeEditor")]); });

describe("20D-UI1 registries and laziness", () => {
  it("composite@1 resolves a student renderer and an authoring editor at EXACTLY version 1", () => {
    expect(resolveStudentRenderer("composite", 1)).toBeTruthy();
    expect(resolveStudentRenderer("composite", 2)).toBeUndefined();
    expect(resolveAuthoringEditor("composite", 1)).toBeTruthy();
    expect(resolveAuthoringEditor("composite", 2)).toBeUndefined();
  });
  it("the renderer, editor and review are literal lazy imports; the bundle guard knows their signatures; the budget is unchanged", () => {
    expect(read("src/questionTypes/studentRegistry.tsx")).toContain('registerStudentRenderer("composite", 1, lazy(() => import("./student/CompositeResponse")));');
    expect(read("src/questionTypes/authoringRegistry.tsx")).toContain('registerAuthoringEditor("composite", 1, lazy(() => import("./editors/CompositeEditor")));');
    expect(read("src/AssignmentReview.tsx")).toContain('const CompositeReviewView=lazy(lazyWithRetry(() => import("./composite/CompositeReviewView"), "teacher-composite-review"));');
    const guard = read("scripts/check-bundle-budget.mjs");
    expect(guard).toMatch(/COMPOSITE_SIGNATURES/);
    for (const s of ["cmp-response", "cmp-editor", "cmp-review", "COMPOSITE_CHILD_TYPE_REFUSED"]) expect(guard).toContain('"' + s + '"');
    expect(guard).toMatch(/INITIAL_JS_GZIP_BUDGET_KB = 125;/);
  });
});

describe("20D-UI2 student CompositeResponse", () => {
  it("fixture A: the shared passage renders ONCE; groups, labels, marks and the first-N rule are visible; accessible part names carry question + group + part", async () => {
    const onAnswer = vi.fn();
    const { container } = render(<StudentQuestionCard q={studentQ(compositeArabicExam())} index={3} id="q4" answer={undefined} onAnswer={onAnswer} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onField={() => {}} />);
    await settle(container);
    expect(container.querySelector(".cmp-response")).toBeTruthy();
    expect(count(container.textContent || "", ARABIC_PASSAGE)).toBe(1);
    expect(container.querySelectorAll(".cmp-group")).toHaveLength(3);
    expect(container.querySelectorAll(".cmp-part")).toHaveLength(8);
    expect(container.textContent).toContain("مجموعة ب — التحليل");
    expect(container.textContent).toMatch(/أجب عن 2 من 3/);
    expect(screen.getByRole("group", { name: "السؤال 4 — مجموعة أ — فهم النص — البند أ" })).toBeTruthy();
    expect(container.querySelector('[dir="rtl"]')).toBeTruthy();
  });
  it("answering a legacy child emits the containing composite Answer; extra first-N answers are marked as excess (kept, not counted)", async () => {
    const onAnswer = vi.fn();
    const answer = { kind: "composite", parts: { pB1: { kind: "fields", values: { t1: "k1" } }, pB2: { kind: "fields", values: { x1: "c1" } }, pB3: { kind: "numeric", value: "70" } }, contexts: {} };
    const { container } = render(<StudentQuestionCard q={studentQ(compositeArabicExam())} index={3} id="q4" answer={answer as never} onAnswer={onAnswer} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onField={() => {}} />);
    await settle(container);
    const radios = container.querySelectorAll('.cmp-part[data-part-id="pA1"] input[type="radio"]');
    fireEvent.click(radios[0]);
    expect(onAnswer).toHaveBeenLastCalledWith({ kind: "composite", parts: { ...answer.parts, pA1: { kind: "choice", index: 0 } }, contexts: {} });
    expect(container.querySelector('.cmp-part[data-part-id="pB3"]')!.classList.contains("cmp-part-excess")).toBe(true);
    expect(container.querySelector('.cmp-part[data-part-id="pB3"]')!.textContent).toContain("إجابة إضافية");
    expect(container.querySelector('.cmp-part[data-part-id="pB1"]')!.classList.contains("cmp-part-excess")).toBe(false);
  });
  it("fixture B: ONE workspace for the shared context; linked parts render no simulator; resetting the context keeps the other answers", async () => {
    const onAnswer = vi.fn();
    const answer = { kind: "composite", parts: { n1: { kind: "numeric", value: "9.8" } }, contexts: { ctxSim: { kind: "smartSim", pluginKey: "physicsFreeFall", pluginVersion: 1, actions: [{ type: "measurement.set", measurementId: "impactTime", value: 2 }], state: null } } };
    const { container } = render(<StudentQuestionCard q={studentQ(compositePhysicsExam())} index={0} id="phys1" answer={answer as never} onAnswer={onAnswer} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onField={() => {}} />);
    await settle(container);
    expect(container.querySelectorAll('[data-testid="freefall-workspace"]')).toHaveLength(1);
    expect(container.querySelectorAll(".cmp-context")).toHaveLength(1);
    expect(container.querySelectorAll('.cmp-part[data-part-id="s1"] [data-testid="freefall-workspace"]')).toHaveLength(0);
    expect(container.querySelector('.cmp-part[data-part-id="s1"]')!.textContent).toContain("محاكاة السقوط الحر");
    fireEvent.click(screen.getByRole("button", { name: "إعادة ضبط «محاكاة السقوط الحر»" }));
    expect(onAnswer).toHaveBeenLastCalledWith({ kind: "composite", parts: { n1: { kind: "numeric", value: "9.8" } }, contexts: {} });
  });
  it("resetting one part keeps every other part and context; resetting the whole question clears everything", async () => {
    const onAnswer = vi.fn();
    const answer = { kind: "composite", parts: { t1: { kind: "choice", index: 1 }, t2: { kind: "text", value: "6" } }, contexts: {} };
    const { container } = render(<StudentQuestionCard q={studentQ(compositeCsExam())} index={1} id="cs1" answer={answer as never} onAnswer={onAnswer} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onField={() => {}} />);
    await settle(container);
    expect(count(container.textContent || "", "total += i")).toBe(1);
    expect(CS_SOURCE).toContain("total += i");
    fireEvent.click(screen.getByRole("button", { name: "مسح إجابة البند أ" }));
    expect(onAnswer).toHaveBeenLastCalledWith({ kind: "composite", parts: { t2: { kind: "text", value: "6" } }, contexts: {} });
    fireEvent.click(screen.getByRole("button", { name: "مسح إجابات السؤال كله" }));
    expect(onAnswer).toHaveBeenLastCalledWith({ kind: "composite", parts: {}, contexts: {} });
  });
  it("an unavailable (malformed) composite is shown as unavailable, never partially", async () => {
    const { container } = render(<StudentQuestionCard q={{ examQuestionId: "x", presentationType: "composite", questionTypeVersion: 1, text: "x", marks: 1, composite: { v: 1, status: "unavailable" } } as unknown as Question} index={0} id="x" answer={undefined} onAnswer={() => {}} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onField={() => {}} />);
    await settle(container);
    expect(container.querySelector('[data-testid="composite-unavailable"]')).toBeTruthy();
  });
});

describe("20D-UI2b student renderer guards (mutation hardening)", () => {
  const card = (q: Question, id: string, answer: unknown, onAnswer: (a: unknown) => void) => render(<StudentQuestionCard q={q} index={0} id={id} answer={answer as never} onAnswer={onAnswer as never} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onField={() => {}} />);
  it("a projection that fails the shape authority (marks ≠ Σ group maxima) renders the unavailable note, never a partial question", async () => {
    const q = { ...studentQ(compositeArabicExam()), marks: 99 } as Question;
    const { container } = card(q, "q4", undefined, () => {});
    await settle(container);
    expect(container.querySelector('[data-testid="composite-unavailable"]')).toBeTruthy();
    expect(container.querySelector(".cmp-part")).toBeNull();
  });
  it("an \"unavailable\" status always wins, even next to arrays", async () => {
    const base = studentQ(compositeArabicExam()) as unknown as { composite: Record<string, unknown> };
    const { container } = card({ ...base, composite: { ...base.composite, status: "unavailable" } } as unknown as Question, "q4", undefined, () => {});
    await settle(container);
    expect(container.querySelector('[data-testid="composite-unavailable"]')).toBeTruthy();
  });
  it("a child renders under its server-owned child key (the same identity coding runs, review and parametric generation use)", async () => {
    const { container } = card(studentQ(compositeArabicExam()), "q4", undefined, () => {});
    await settle(container);
    const radios = [...container.querySelectorAll('.cmp-part[data-part-id="pA1"] input[type="radio"]')];
    expect(radios.length).toBeGreaterThan(0);
    for (const r of radios) expect(r.getAttribute("name")).toBe("q4::part::pA1");
    // a child with a REGISTERED renderer (categorization) receives the child key as its id too
    const selects = [...container.querySelectorAll('.cmp-part[data-part-id="pB1"] select')];
    expect(selects.length).toBeGreaterThan(0);
    for (const s of selects) expect(s.getAttribute("name")).toMatch(/^q4::part::pB1-/);
  });
  it("answering a part keeps the shared-context answers; answering the shared context keeps the part answers", async () => {
    const onAnswer = vi.fn();
    const sim = { kind: "smartSim", pluginKey: "physicsFreeFall", pluginVersion: 1, actions: [{ type: "measurement.set", measurementId: "impactTime", value: 2 }], state: null };
    const answer = { kind: "composite", parts: { n1: { kind: "numeric", value: "9" } }, contexts: { ctxSim: sim } };
    const { container } = card(studentQ(compositePhysicsExam()), "phys1", answer, onAnswer);
    await settle(container);
    fireEvent.change(container.querySelector('.cmp-part[data-part-id="n1"] input') as HTMLInputElement, { target: { value: "9.8" } });
    expect(onAnswer).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "composite", parts: { n1: expect.objectContaining({ kind: "numeric", value: "9.8" }) }, contexts: { ctxSim: sim } }));
    fireEvent.change(screen.getByLabelText("زمن الوصول إلى الأرض (ث)"), { target: { value: "2.02" } });
    fireEvent.click(screen.getAllByRole("button", { name: "حفظ القياس" })[0]);
    const last = onAnswer.mock.calls.at(-1)![0] as { parts: unknown; contexts: Record<string, { actions: unknown[] }> };
    expect(last.parts).toEqual({ n1: { kind: "numeric", value: "9" } });
    expect(JSON.stringify(last.contexts.ctxSim.actions)).toContain("2.02");                // the emission came from the shared context
  });
  it("a legacy field child (rendered by the extracted compound control) merges a new field into its existing values", async () => {
    const onAnswer = vi.fn();
    const answer = { kind: "composite", parts: { pA2: { kind: "fields", values: { r1: "KEEP" } } }, contexts: {} };
    const { container } = card(studentQ(compositeArabicExam()), "q4", answer, onAnswer);
    await settle(container);
    const sel = container.querySelector('.cmp-part[data-part-id="pA2"] select[name="q4::part::pA2-r2"], .cmp-part[data-part-id="pA2"] select#q4\\:\\:part\\:\\:pA2-r2') as HTMLSelectElement
      ?? (container.querySelectorAll('.cmp-part[data-part-id="pA2"] select')[1] as HTMLSelectElement);
    const opt = [...sel.options].find(o => o.value !== "")!;
    fireEvent.change(sel, { target: { value: opt.value } });
    const last = onAnswer.mock.calls.at(-1)![0] as { parts: Record<string, { values: Record<string, unknown> }> };
    expect(last.parts.pA2.values.r1).toBe("KEEP");
    expect(Object.keys(last.parts.pA2.values).length).toBe(2);
  });
});

describe("20D-UI3 authoring CompositeEditor", () => {
  const Editor = () => resolveAuthoringEditor("composite", 1) as unknown as React.ComponentType<{ node: unknown; onChange: (p: unknown) => void }>;
  it("renders groups / parts / contexts with a marks summary; adding a group or a part patches the canonical root", async () => {
    const onChange = vi.fn();
    const E = Editor();
    const node = compositeArabicExam().sections[0].questions[0];
    const { container } = render(<Suspense fallback={<p role="status">…</p>}><E node={node} onChange={onChange} /></Suspense>);
    await settle(container);
    expect(container.querySelector(".cmp-editor")).toBeTruthy();
    expect(container.querySelectorAll(".cmp-editor-group")).toHaveLength(3);
    expect(container.querySelector(".cmp-marks-summary")!.textContent).toContain("20");
    fireEvent.click(screen.getByRole("button", { name: "إضافة مجموعة" }));
    const patch = onChange.mock.calls.at(-1)![0] as { composite: { groups: unknown[] } };
    expect(patch.composite.groups).toHaveLength(4);
  });
  it("shows a clear mismatch warning when the question mark differs from the official group maxima (never rewritten silently)", async () => {
    const E = Editor();
    const node = { ...compositeArabicExam().sections[0].questions[0], marks: 25 };
    const { container } = render(<Suspense fallback={<p role="status">…</p>}><E node={node} onChange={() => {}} /></Suspense>);
    await settle(container);
    expect(container.querySelector(".cmp-marks-mismatch")).toBeTruthy();
  });
});

describe("20D-UI4 teacher CompositeReviewView", () => {
  it("renders the composite as a tree: the shared context once, then groups and parts with marks, counted / ignored state and per-part override inputs", async () => {
    const mod = await import("../composite/CompositeReviewView");
    const View = mod.default as unknown as React.ComponentType<Record<string, unknown>>;
    const question = { questionId: "q4", type: "composite", marks: 20, composite: compositeArabicExam().sections[0].questions[0].composite, compositeReview: { contexts: [{ id: "ctxText", kind: "source" }], parts: [{ partId: "pA1", groupId: "gA", childKey: "q4::part::pA1", label: "أ", type: "multipleChoice", studentAnswer: { kind: "choice", index: 0 }, autoGrade: { score: 2, maxMarks: 2, countedMaxMarks: 2, manualReview: false, ignored: false }, expectedAnswer: { correctOptionIndex: 0 } }, { partId: "pB3", groupId: "gB", childKey: "q4::part::pB3", label: "ز", type: "numericResponse", studentAnswer: { kind: "numeric", value: "70" }, autoGrade: { score: 0, maxMarks: 2, countedMaxMarks: 0, manualReview: false, ignored: true }, expectedAnswer: null }] } };
    const onOverride = vi.fn();
    const { container } = render(<View question={question} overrides={{}} onOverride={onOverride} />);
    expect(container.querySelector(".cmp-review")).toBeTruthy();
    expect(container.querySelectorAll(".cmp-review-group")).toHaveLength(3);
    expect(container.querySelector('[data-child-key="q4::part::pB3"]')!.textContent).toContain("غير محتسب");
    const input = container.querySelector('[data-child-key="q4::part::pA1"] input[type="number"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "1.5" } });
    expect(onOverride).toHaveBeenLastCalledWith("q4::part::pA1", expect.objectContaining({ score: 1.5 }));
  });
});
