// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import StructuredExamBuilder from "../StructuredExamBuilder";
import StudentQuestionCard from "../StudentQuestionCard";
import AssignmentReview from "../AssignmentReview";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import { examSaveState } from "../examHistory";
import type { StructuredExam, BuilderQuestion } from "../examTypes";
import { newQuestion } from "../examBuilderState";
import type { Answer } from "../answerState";
import { evaluateExamFinalization } from "../examFinalization";
import { resolveSmartSimUi } from "../trustedSim/smartSimUiRegistry";
import { freeFallClassroomConfig, freeFallClassroomChecks } from "../physicsFreeFall/freeFallTemplates";
import { rationalCertificationConfig, rationalCertificationChecks } from "../functionStudy/functionStudyTemplates";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";
import type { Question } from "../studentQuestionTypes";
const sanitizeExamForStudent = (sanitizer as unknown as { sanitizeExamForStudent: (exam: unknown) => { sections: { questions: Question[] }[] } }).sanitizeExamForStudent;

// Phase 20A.2 — the pilot UIs (lazy): the free-fall workspace (animation / scrubbing are PRESENTATION; explicit measurement and graph-point
// submissions are the only academic actions; keyboard and reduced-motion paths), the function-study workspace (public function graph with
// broken paths at singularities, NO automatic answer labels, structured analysis forms as the accessible path, LTR math inside the RTL
// page), restore by replay, reset, the authoring host's code-owned plugin picker and both plugin editors with their certification presets,
// the teacher review of SERVER-computed state, exact-version UI resolution and lazy-edge guards.
// New-function tests (fail-first on the post-#265 baseline 44d0f21).
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FF_ENV = () => ({ schemaVersion: 1, pluginKey: "physicsFreeFall", pluginVersion: 1, config: freeFallClassroomConfig() });
const FN_ENV = () => ({ schemaVersion: 1, pluginKey: "functionStudy2d", pluginVersion: 1, config: rationalCertificationConfig() });
const teacherQ = (env: unknown, checks: unknown[], marks: number) => ({ ...newQuestion("smartSim" as never, { examQuestionId: "t1", text: "سؤال محاكاة", marks }), smartSim: env, answer: { scoring: "proportional", checks } } as unknown as BuilderQuestion);
const baseExam = (questions: BuilderQuestion[]): StructuredExam => ({ examId: "EXAM-20A2", title: "امتحان المحاكاة", status: "draft", schemaVersion: 2, sections: [{ id: "sec-1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, questions }] });
const studentQ = (env: unknown, checks: unknown[], marks: number) => sanitizeExamForStudent(baseExam([teacherQ(env, checks, marks)])).sections[0].questions[0];
const ffQ = () => studentQ(FF_ENV(), freeFallClassroomChecks(), 12);
const fnQ = () => studentQ(FN_ENV(), rationalCertificationChecks(), 13);
const tick = (ms = 10) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
function StudentHarness({ q, initial, disabled }: { q: Question; initial?: Answer; disabled?: boolean }) {
  const [a, setA] = useState<Answer | undefined>(initial);
  return <div dir="rtl"><StudentQuestionCard q={q} index={0} id="t1" answer={a} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onAnswer={setA} disabled={disabled} /><output data-testid="answer">{JSON.stringify(a ?? null)}</output></div>;
}
const answerOut = () => JSON.parse(screen.getByTestId("answer").textContent || "null") as { actions: { type: string }[]; state: Record<string, unknown> } | null;
const mockReducedMotion = (reduce: boolean) => { window.matchMedia = vi.fn().mockImplementation((q: string) => ({ matches: reduce && /prefers-reduced-motion:\s*reduce/.test(q), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as never; };
type Hist = ReturnType<typeof useStructuredExamHistory>;
function Host({ initial, onHistory }: { initial: StructuredExam; onHistory: (h: Hist) => void }) {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(initial, "saved"); } }, [hist, initial]);
  useEffect(() => { onHistory(hist); });
  if (!hist.present) return null;
  return <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => {}} saving={false} onUndo={hist.undo} onRedo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, false)} backupStorage={null} onRecover={hist.recover} autosaveDelayMs={5} />;
}
async function mountBuilder(initial: StructuredExam) { let hist!: Hist; render(<Host initial={initial} onHistory={h => { hist = h; }} />); await tick(30); return { hist: () => hist }; }

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); mockReducedMotion(false); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("physicsFreeFall@1 — student workspace", () => {
  const ws = async () => screen.findByTestId("freefall-workspace", {}, { timeout: 3000 });
  it("animation, play / pause / restart and the timeline are PRESENTATION: no academic action is ever emitted by them", async () => {
    render(<StudentHarness q={ffQ()} />);
    const w = await ws();
    expect(within(w).getByTestId("freefall-body")).toBeTruthy(); expect(within(w).getByTestId("freefall-graph")).toBeTruthy();
    for (let i = 0; i < 25; i++) { fireEvent.click(within(w).getByRole("button", { name: "تشغيل" })); fireEvent.click(within(w).getByRole("button", { name: "إيقاف مؤقت" })); }
    fireEvent.click(within(w).getByRole("button", { name: "إعادة العرض" }));
    fireEvent.change(within(w).getByRole("slider", { name: /زمن المحاكاة/ }), { target: { value: "1.5" } });
    fireEvent.change(within(w).getByLabelText("الزمن (ث)"), { target: { value: "1" } });
    await tick(50);
    expect(answerOut()).toBeNull();
    // the keyboard time input drives the readouts (t = 1 s → y = 15.1 m, v = −9.8 m/s)
    const readout = within(w).getByTestId("freefall-readout");
    expect(readout.textContent).toMatch(/15\.1/); expect(readout.textContent).toMatch(/-9\.8|−9\.8/);
    expect(readout.getAttribute("aria-live")).toBe("polite");
  });
  it("measurements and graph points are EXPLICIT semantic submissions (save / clear); values are shown back; restore replays them", async () => {
    render(<StudentHarness q={ffQ()} />);
    const w = await ws();
    const m = within(w).getAllByTestId("freefall-measurement").find(f => f.getAttribute("data-id") === "impactTime")!;
    fireEvent.change(within(m).getByRole("textbox"), { target: { value: "2.02" } });
    fireEvent.click(within(m).getByRole("button", { name: /حفظ/ })); await tick();
    expect(answerOut()!.actions).toEqual([{ type: "measurement.set", measurementId: "impactTime", value: 2.02 }]);
    expect(answerOut()!.state).toEqual({ v: 1, measurements: { impactTime: 2.02 }, points: {} });
    const p = within(w).getAllByTestId("freefall-point").find(f => f.getAttribute("data-id") === "impactPoint")!;
    fireEvent.change(within(p).getByLabelText(/الزمن t/), { target: { value: "2.02" } });
    fireEvent.change(within(p).getByLabelText(/الارتفاع y/), { target: { value: "0" } });
    fireEvent.click(within(p).getByRole("button", { name: /حفظ النقطة/ })); await tick();
    expect(answerOut()!.actions.at(-1)).toEqual({ type: "graphPoint.set", pointId: "impactPoint", t: 2.02, y: 0 });
    expect(within(w).getAllByTestId("freefall-graph-point").length).toBe(1);
    fireEvent.change(within(m).getByRole("textbox"), { target: { value: "abc" } });
    fireEvent.click(within(m).getByRole("button", { name: /حفظ/ })); await tick();
    expect(within(m).getByRole("alert").textContent).toMatch(/رقم/);
    expect(answerOut()!.actions.length).toBe(2);
    fireEvent.click(within(m).getByRole("button", { name: /مسح/ })); await tick();
    expect(answerOut()!.state).toEqual({ v: 1, measurements: {}, points: { impactPoint: { t: 2.02, y: 0 } } });
    cleanup();
    const stored = { kind: "smartSim", pluginKey: "physicsFreeFall", pluginVersion: 1, actions: [{ type: "measurement.set", measurementId: "impactSpeed", value: 19.8 }], state: {} } as unknown as Answer;
    render(<StudentHarness q={ffQ()} initial={stored} />);
    const w2 = await ws();
    expect(within(w2).getAllByTestId("freefall-measurement").find(f => f.getAttribute("data-id") === "impactSpeed")!.textContent).toMatch(/19\.8/);
  });
  it("prefers-reduced-motion: no autoplay animation; the simulation stays fully usable with manual time controls", async () => {
    mockReducedMotion(true);
    render(<StudentHarness q={ffQ()} />);
    const w = await ws();
    expect(within(w).getByTestId("freefall-reduced-motion")).toBeTruthy();
    expect(within(w).queryByRole("button", { name: "تشغيل" })).toBeNull();
    fireEvent.change(within(w).getByLabelText("الزمن (ث)"), { target: { value: "2" } });
    expect(within(w).getByTestId("freefall-readout").textContent).toMatch(/0\.4/);              // y(2) = 20 − 19.6 = 0.4 m
  });
});

describe("functionStudy2d@1 — student workspace", () => {
  const ws = async () => screen.findByTestId("fnstudy-workspace", {}, { timeout: 3000 });
  it("shows the public function (LTR inside the RTL page) and its graph with broken paths; it never labels an answer by itself", async () => {
    render(<StudentHarness q={fnQ()} />);
    const w = await ws();
    expect(w.closest("[dir]")!.getAttribute("dir")).toBe("rtl");
    expect(w.getAttribute("dir")).not.toBe("ltr");
    expect(within(w).getByTestId("fnstudy-expression").getAttribute("dir")).toBe("ltr");
    expect(within(w).getByTestId("fnstudy-expression").textContent).toContain("(2*x-4)/((x-1)*(x+2))");
    expect(within(w).getByTestId("fnstudy-graph").getAttribute("dir")).toBe("ltr");
    expect(within(w).getAllByTestId("fnstudy-curve").length).toBeGreaterThanOrEqual(3);                    // three branches
    for (const id of ["fnstudy-vline", "fnstudy-hline", "fnstudy-marker", "fnstudy-exclusion"]) expect(within(w).queryAllByTestId(id).length, id).toBe(0);
    expect(w.textContent).not.toMatch(/x\s*=\s*-?2\b|x\s*=\s*1\b|\(0,\s*2\)|0\.222|مقارب.*=\s*-?\d/);
  });
  it("every graded analysis is reachable through labelled forms (keyboard path); invalid input never becomes an action", async () => {
    render(<StudentHarness q={fnQ()} />);
    const w = await ws();
    const task = (t: string) => within(w).getAllByTestId("fnstudy-task").find(f => f.getAttribute("data-task") === t)!;
    fireEvent.change(within(task("domainExclusions")).getByLabelText(/استثناءات المجال/), { target: { value: "1, -2" } });
    fireEvent.click(within(task("domainExclusions")).getByRole("button", { name: /حفظ/ })); await tick();
    fireEvent.change(within(task("verticalAsymptotes")).getByLabelText(/خطوط التقارب الرأسية/), { target: { value: "-2, 1" } });
    fireEvent.click(within(task("verticalAsymptotes")).getByRole("button", { name: /حفظ/ })); await tick();
    fireEvent.change(within(task("horizontalAsymptotes")).getByLabelText(/خطوط التقارب الأفقية/), { target: { value: "0" } });
    fireEvent.click(within(task("horizontalAsymptotes")).getByRole("button", { name: /حفظ/ })); await tick();
    fireEvent.change(within(task("yIntercept")).getByLabelText(/المقطع الصادي/), { target: { value: "2" } });
    fireEvent.click(within(task("yIntercept")).getByRole("button", { name: /حفظ/ })); await tick();
    fireEvent.click(within(task("xIntercepts")).getByRole("button", { name: /\+ نقطة/ }));
    fireEvent.change(within(task("xIntercepts")).getByLabelText("x للنقطة 1"), { target: { value: "2" } });
    fireEvent.change(within(task("xIntercepts")).getByLabelText("y للنقطة 1"), { target: { value: "0" } });
    fireEvent.click(within(task("xIntercepts")).getByRole("button", { name: /حفظ/ })); await tick();
    fireEvent.click(within(task("extrema")).getByRole("button", { name: /\+ قيمة قصوى/ }));
    fireEvent.change(within(task("extrema")).getByLabelText("نوع القيمة 1"), { target: { value: "min" } });
    fireEvent.change(within(task("extrema")).getByLabelText("x للقيمة 1"), { target: { value: "0" } });
    fireEvent.change(within(task("extrema")).getByLabelText("y للقيمة 1"), { target: { value: "2" } });
    fireEvent.click(within(task("extrema")).getByRole("button", { name: /حفظ/ })); await tick();
    fireEvent.click(within(task("monotonicIntervals")).getByRole("button", { name: /\+ فترة/ }));
    fireEvent.change(within(task("monotonicIntervals")).getByLabelText("نوع الفترة 1"), { target: { value: "decreasing" } });
    fireEvent.change(within(task("monotonicIntervals")).getByLabelText("بداية الفترة 1"), { target: { value: "-inf" } });
    fireEvent.change(within(task("monotonicIntervals")).getByLabelText("نهاية الفترة 1"), { target: { value: "-2" } });
    fireEvent.click(within(task("monotonicIntervals")).getByRole("button", { name: /حفظ/ })); await tick();
    expect(answerOut()!.state).toEqual({ v: 1, domainExclusions: [-2, 1], xIntercepts: [{ x: 2, y: 0 }], yIntercept: { x: 0, y: 2 }, verticalAsymptotes: [-2, 1], horizontalAsymptotes: [0], extrema: [{ kind: "min", x: 0, y: 2 }], monotonicIntervals: [{ kind: "decreasing", from: "-inf", to: -2 }] });
    expect(answerOut()!.actions.map(a => a.type)).toEqual(["domain.setExclusions", "asymptotes.setVertical", "asymptotes.setHorizontal", "intercept.setY", "intercepts.setX", "extrema.set", "intervals.set"]);
    // the student's OWN annotations are drawn
    expect(within(w).getAllByTestId("fnstudy-vline").length).toBe(2); expect(within(w).getAllByTestId("fnstudy-hline").length).toBe(1);
    expect(within(w).getAllByTestId("fnstudy-marker").length).toBeGreaterThanOrEqual(3);
    const n = answerOut()!.actions.length;
    fireEvent.change(within(task("verticalAsymptotes")).getByLabelText(/خطوط التقارب الرأسية/), { target: { value: "1, x" } });
    fireEvent.click(within(task("verticalAsymptotes")).getByRole("button", { name: /حفظ/ })); await tick();
    expect(within(task("verticalAsymptotes")).getByRole("alert")).toBeTruthy();
    expect(answerOut()!.actions.length).toBe(n);
  });
  it("restore replays the stored analysis; a disabled (submitted) card is read-only", async () => {
    const stored = { kind: "smartSim", pluginKey: "functionStudy2d", pluginVersion: 1, actions: [{ type: "asymptotes.setVertical", values: [1, -2] }], state: { forged: true } } as unknown as Answer;
    render(<StudentHarness q={fnQ()} initial={stored} disabled />);
    const w = await ws();
    expect(within(w).getAllByTestId("fnstudy-vline").length).toBe(2);
    expect(within(w).queryAllByRole("button", { name: /حفظ/ }).length).toBe(0);
  });
});

describe("authoring — the code-owned plugin picker, the plugin editors and their certification presets", () => {
  const addSmartSim = async () => {
    const { hist } = await mountBuilder(baseExam([newQuestion("multipleChoice", { examQuestionId: "q1", text: "س" })]));
    fireEvent.click(screen.getByRole("button", { name: "+ إضافة سؤال" }));
    const d = await screen.findByRole("dialog", { name: "إضافة سؤال" }); await tick(30);
    expect(within(d).getAllByTestId("qt-card").length).toBe(24);
    fireEvent.click(within(d).getByRole("tab", { name: "تفاعلي" })); await tick();
    fireEvent.click(within(d).getAllByTestId("qt-card").find(c => c.getAttribute("data-type-key") === "smartSim")!); await tick(50);
    const host = await screen.findByTestId("qt-editor-smartSim", {}, { timeout: 3000 });
    return { hist, host, q: () => hist().present!.sections[0].questions[1] as unknown as { smartSim: { pluginKey: string; config: unknown }; answer: { checks: unknown[]; scoring: string } } };
  };
  it("free fall: pick the plugin, apply the 20 m classroom preset (config + weighted checks), edit a value inline; invalid physics blocks finalization", async () => {
    const { hist, host, q } = await addSmartSim();
    const select = within(host).getByTestId("smartsim-plugin-select") as HTMLSelectElement;
    expect([...select.options].map(o => o.value)).toEqual(["networkTopology@1", "physicsFreeFall@1", "functionStudy2d@1", "networkTopology@2"]);   // Phase 20C added networkTopology@2 (a NEW exact identity; v1 unchanged)
    fireEvent.change(select, { target: { value: "physicsFreeFall@1" } }); await tick(50);
    const ed = await within(host).findByTestId("freefall-editor", {}, { timeout: 3000 });
    expect(q().smartSim.pluginKey).toBe("physicsFreeFall");
    fireEvent.click(within(ed).getByRole("button", { name: /القالب الصفي/ })); await tick();
    expect(q().smartSim.config).toEqual(freeFallClassroomConfig()); expect(q().answer.checks).toEqual(freeFallClassroomChecks());
    expect(within(host).queryByTestId("smartsim-issues")).toBeNull();
    expect(JSON.stringify(evaluateExamFinalization(hist().present as never).blockers)).not.toMatch(/SMARTSIM|FREEFALL/);
    fireEvent.change(within(ed).getByLabelText(/الجاذبية/), { target: { value: "-9.8" } }); await tick();
    expect(within(host).getByTestId("smartsim-issues").textContent).toMatch(/الجاذبية|gravity/i);
    expect(JSON.stringify(evaluateExamFinalization(hist().present as never).blockers)).toMatch(/FREEFALL/);
    expect(within(ed).getByTestId("freefall-preview")).toBeTruthy();
  });
  it("function study: pick the plugin, live expression validation through the safe parser, apply the rational certification preset", async () => {
    const { hist, host, q } = await addSmartSim();
    fireEvent.change(within(host).getByTestId("smartsim-plugin-select"), { target: { value: "functionStudy2d@1" } }); await tick(50);
    const ed = await within(host).findByTestId("fnstudy-editor", {}, { timeout: 3000 });
    fireEvent.click(within(ed).getByRole("button", { name: /قالب: الدالة النسبية/ })); await tick();
    expect(q().smartSim.config).toEqual(rationalCertificationConfig()); expect(q().answer.checks).toEqual(rationalCertificationChecks());
    expect(within(host).queryByTestId("smartsim-issues")).toBeNull();
    fireEvent.change(within(ed).getByLabelText(/الدالة f\(x\)/), { target: { value: "x.constructor" } }); await tick();
    expect(within(ed).getByTestId("fnstudy-expression-status").textContent).toMatch(/غير صالح/);
    expect(JSON.stringify(evaluateExamFinalization(hist().present as never).blockers)).toMatch(/FUNCSTUDY/);
    fireEvent.change(within(ed).getByLabelText(/الدالة f\(x\)/), { target: { value: "x^2-4" } }); await tick();
    expect(within(ed).getByTestId("fnstudy-expression-status").textContent).toMatch(/صالح/);
  });
  it("switching plugin restarts the private key EMPTY (checks are plugin-specific and never carried over) with the plugin's starter config", async () => {
    const { host, q } = await addSmartSim();
    fireEvent.change(within(host).getByTestId("smartsim-plugin-select"), { target: { value: "physicsFreeFall@1" } }); await tick(50);
    fireEvent.click(within(await within(host).findByTestId("freefall-editor", {}, { timeout: 3000 })).getByRole("button", { name: /القالب الصفي/ })); await tick();
    expect(q().answer.checks.length).toBe(6);
    fireEvent.change(within(host).getByTestId("smartsim-plugin-select"), { target: { value: "functionStudy2d@1" } }); await tick(50);
    await within(host).findByTestId("fnstudy-editor", {}, { timeout: 3000 });
    expect(q().smartSim.pluginKey).toBe("functionStudy2d");
    expect(q().answer).toEqual({ scoring: "proportional", checks: [] });
  });
});

describe("teacher review — server-computed state as text", () => {
  const body = (env: unknown, review: unknown) => ({ ok: true, assignment: { assignmentId: "a1", title: "واجب", totalMarks: 12 }, student: { studentId: "s1", studentName: "سارة", studentCode: "S1" }, attempt: { attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 6, totalMarks: 12, percentage: 50, manualReviewMarks: 0, finalized: true, gradingStatus: "final", teacherFeedback: "" }, attempts: [{ attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 6, totalMarks: 12, percentage: 50, manualReviewMarks: 0, finalized: true, gradingStatus: "final" }], questions: [{ questionId: "t1", questionNumber: 1, text: "سؤال", marks: 12, type: "smartSim", smartSim: env, smartSimReview: review, studentAnswer: { kind: "smartSim", actions: [], state: {} }, expectedAnswer: {}, autoGrade: { score: 6, manualReview: false }, manualScore: null, teacherComment: "" }] });
  const mount = async (env: unknown, review: unknown) => { globalThis.fetch = vi.fn(() => Promise.resolve({ status: 200, ok: true, json: async () => body(env, review) } as Response)) as unknown as typeof fetch; render(<AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => {}} onSaved={() => {}} />); return screen.findByTestId("smartsim-review", {}, { timeout: 3000 }); };
  it("free fall: recorded measurements and placed points (no animation state)", async () => {
    const view = await mount(FF_ENV(), { valid: true, score: 6, maxMarks: 12, totalWeight: 12, passedWeight: 6, checks: [], state: { v: 1, measurements: { impactTime: 2.02, impactSpeed: 19.8 }, points: { impactPoint: { t: 2.02, y: 0 } } } });
    const r = await within(view).findByTestId("freefall-review", {}, { timeout: 3000 });
    expect(r.textContent).toContain("2.02"); expect(r.textContent).toContain("19.8"); expect(r.textContent).toContain("زمن الوصول إلى الأرض");
  });
  it("function study: exclusions, intercepts, asymptotes, extrema and intervals", async () => {
    const view = await mount(FN_ENV(), { valid: true, score: 13, maxMarks: 13, totalWeight: 13, passedWeight: 13, checks: [], state: { v: 1, domainExclusions: [-2, 1], xIntercepts: [{ x: 2, y: 0 }], yIntercept: { x: 0, y: 2 }, verticalAsymptotes: [-2, 1], horizontalAsymptotes: [0], extrema: [{ kind: "max", x: 4, y: 0.2222222222222222 }], monotonicIntervals: [{ kind: "decreasing", from: "-inf", to: -2 }] } });
    const r = await within(view).findByTestId("fnstudy-review", {}, { timeout: 3000 });
    expect(r.textContent).toMatch(/-2/); expect(r.textContent).toMatch(/−∞|-∞|-inf/); expect(r.textContent).toMatch(/عظمى|max/);
  });
});

describe("exact UI resolution and lazy edges", () => {
  it("the UI registry resolves exactly the three plugin identities through literal imports; v2 is unavailable", () => {
    for (const id of [["networkTopology", 1], ["physicsFreeFall", 1], ["functionStudy2d", 1]] as const) expect(resolveSmartSimUi(id[0], id[1]), id[0]).toBeDefined();
    for (const id of [["physicsFreeFall", 2], ["functionStudy2d", 2], ["physicsFreeFall", "1"], ["functionstudy2d", 1]] as const) expect(resolveSmartSimUi(id[0], id[1] as never), String(id)).toBeUndefined();
    const ui = fs.readFileSync(path.join(repo, "src/trustedSim/smartSimUiRegistry.ts"), "utf8");
    for (const i of [...ui.matchAll(/import\(([^)]*)\)/g)].map(m => m[1])) expect(i).toMatch(/^"\.\.\/[A-Za-z0-9/]+"$/);
  });
  it("no application module imports a pilot workspace / editor / review statically; the bundle guard knows the pilot signatures", () => {
    const files: string[] = [];
    const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) files.push(p); } };
    walk(path.join(repo, "src"));
    for (const name of ["physicsFreeFall/FreeFallWorkspace", "physicsFreeFall/FreeFallEditor", "physicsFreeFall/FreeFallReview", "functionStudy/FunctionStudyWorkspace", "functionStudy/FunctionStudyEditor", "functionStudy/FunctionStudyReview"])
      expect(files.filter(f => new RegExp("^import[^;]*from\\s*\"[^\"]*" + name + "\"", "m").test(fs.readFileSync(f, "utf8"))).map(f => path.relative(repo, f)), name).toEqual([]);
    const guard = fs.readFileSync(path.join(repo, "scripts/check-bundle-budget.mjs"), "utf8");
    expect(guard).toMatch(/freefall-workspace/); expect(guard).toMatch(/fnstudy-workspace/);
    expect(guard).toMatch(/BUDGET_KB\s*=\s*125\b|125 \* 1024|125\s*KB/);
  });
});
