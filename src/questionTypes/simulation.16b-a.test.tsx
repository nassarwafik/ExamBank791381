// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import StructuredExamBuilder from "../StructuredExamBuilder";
import StudentQuestionCard from "../StudentQuestionCard";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import { examSaveState } from "../examHistory";
import type { StructuredExam, BuilderQuestion } from "../examTypes";
import { newQuestion, duplicateQuestion, moveQuestion, moveQuestionToSection, cloneQuestionWithNewIds, newSection } from "../examBuilderState";
import { QUESTION_TYPE_CATALOG, questionTypeDefinition } from "../questionTypeCatalog";
import { typeDescription, typeIcon } from "./typePresentation";
import { validateQuestionTypeNode } from "../questionTypeValidation";
import { validateStructuredExam } from "../examQuality";
import { evaluateExamFinalization } from "../examFinalization";
import { answered, type Answer } from "../answerState";
import { resolveAuthoringEditor } from "./authoringRegistry";
import { resolveStudentRenderer } from "./studentRegistry";
import { SIMULATION_RUNTIME_VERSION, validateSimulationReference, type SimulationQuestionConfig } from "../smartsimManifest";
import type { SimulationService, SimulationPackageRecord } from "../smartsim/simulationService";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";
import type { Question } from "../studentQuestionTypes";
const sanitizeExamForStudent = (sanitizer as unknown as { sanitizeExamForStudent: (exam: unknown) => { sections: { questions: Question[] }[] } }).sanitizeExamForStudent;

// Phase 16B-A — the ONE new production type `simulation` («محاكاة تفاعلية», simulation@1): catalog identity, exact package
// identity persisted on the question (never "latest"), finalization refuses missing / malformed references, duplicate / move /
// clone / undo / redo preserve the identity byte-for-byte, the lazy editor (library / upload / conflict / preview / copy spec)
// inside the REAL Builder with an injected App-owned service, and the student card resolving the registered renderer.
// Fail-first on 6bb3b97 (type absent).

const HASH = "sha256:" + "cd".repeat(32);
const REF: SimulationQuestionConfig = { packageId: "counter-sim", packageVersion: 1, packageHash: HASH, runtimeVersion: 1, entry: "index.html", title: "Counter" };
const record = (over: Partial<SimulationPackageRecord> = {}): SimulationPackageRecord => ({ packageId: "counter-sim", packageVersion: 1, packageHash: HASH, runtimeVersion: 1, entry: "index.html", title: "Counter", description: "يعدّ النقرات", sizeBytes: 2048, fileCount: 2, uploadedAt: "2026-09-01T00:00:00.000Z", status: "ready", ...over });
const simQuestion = (over: Partial<BuilderQuestion> = {}): BuilderQuestion => ({ ...newQuestion("simulation", { examQuestionId: "sim1", text: "جرّب المحاكاة", marks: 5 }), simulation: REF, ...over });
const baseExam = (questions: BuilderQuestion[]): StructuredExam => ({ examId: "EXAM-16B", title: "امتحان", status: "draft", schemaVersion: 2, sections: [{ id: "sec-1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, questions }] });
type Hist = ReturnType<typeof useStructuredExamHistory>;
function Host({ initial, onHistory, simulations }: { initial: StructuredExam; onHistory: (h: Hist) => void; simulations?: SimulationService }) {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(initial, "saved"); } }, [hist, initial]);
  useEffect(() => { onHistory(hist); });
  const [saving] = useState(false);
  if (!hist.present) return null;
  return <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => {}} saving={saving} onUndo={hist.undo} onRedo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, saving)} backupStorage={null} onRecover={hist.recover} autosaveDelayMs={5} simulations={simulations} />;
}
const tick = (ms = 10) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
async function mount(initial: StructuredExam, simulations?: SimulationService) { let hist!: Hist; render(<Host initial={initial} onHistory={h => { hist = h; }} simulations={simulations} />); await tick(30); return { hist: () => hist }; }
const firstQuestion = (h: Hist) => h.present!.sections[0].questions[0];
function fakeService(over: Partial<SimulationService> = {}): SimulationService & { calls: string[] } {
  const calls: string[] = [];
  return { calls, list: vi.fn(async () => { calls.push("list"); return [record(), record({ packageVersion: 2, packageHash: "sha256:" + "ef".repeat(32), title: "Counter v2" })]; }), versions: vi.fn(async (id: string) => { calls.push("versions:" + id); return [record()]; }), upload: vi.fn(async () => { calls.push("upload"); return { status: "created" as const, package: record({ packageId: "uploaded-sim", packageHash: "sha256:" + "11".repeat(32) }), report: { ok: true, issues: [], fileCount: 2, compressedBytes: 900, uncompressedBytes: 2048, selfContained: true, externalResources: [] } }; }), ...over };
}

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("S1 — the simulation type exists in the production catalog", () => {
  it("simulation@1: label «محاكاة تفاعلية», category interactive, manual grading, interactive, NOT compound-capable, responseKinds ['simulation'], non-legacy; the catalog now has 16 production types", () => {
    const d = questionTypeDefinition("simulation")!;
    expect(d).toBeTruthy();
    expect(d.version).toBe(1); expect(d.label).toBe("محاكاة تفاعلية"); expect(d.category).toBe("interactive"); expect(d.gradingMode).toBe("manual"); expect(d.legacy).toBe(false);
    expect(d.capabilities).toMatchObject({ autoGrading: false, manualGrading: true, interactive: true, compoundPart: false, requiresImage: false });
    expect(d.responseKinds).toEqual(["simulation"]);
    expect(QUESTION_TYPE_CATALOG.length).toBe(22);                                                   // Phase 17A adds coding · 18C adds networkCli · 19A adds inlineCloze · 19B adds parametricNumeric · 19D adds hotspot / labelDiagram
    expect(typeDescription(d)).toMatch(/محاكاة/); expect(typeIcon(d)).not.toBe("▫");
    expect(SIMULATION_RUNTIME_VERSION).toBe(1);
  });
  it("editor and renderer are registered for simulation@1 only (no V2); a compound part of type simulation is refused by the validator", () => {
    expect(resolveAuthoringEditor("simulation", 1)).toBeTruthy(); expect(resolveAuthoringEditor("simulation", 2)).toBeUndefined();
    expect(resolveStudentRenderer("simulation", 1)?.label).toBe("محاكاة تفاعلية"); expect(resolveStudentRenderer("simulation", 2)).toBeUndefined();
    expect(validateQuestionTypeNode({ simulation: REF }, "simulation", 1, { part: true }).map(i => i.code)).toContain("TYPE_NOT_COMPOUND_CAPABLE");
  });
  it("Answer kind 'simulation': answered ⇔ a non-null state object with at least one key; unknown / empty states fail closed", () => {
    expect(answered({ kind: "simulation", state: { count: 3 } } as Answer)).toBe(true);
    expect(answered({ kind: "simulation", state: { count: 0 } } as Answer)).toBe(true);
    expect(answered({ kind: "simulation", state: null } as unknown as Answer)).toBe(false);
    expect(answered({ kind: "simulation", state: {} } as unknown as Answer)).toBe(false);
    expect(answered({ kind: "simulation" } as unknown as Answer)).toBe(false);
  });
});

describe("S22 / S33 — exact identity persisted; finalization refuses missing / malformed / unpinned references", () => {
  it("a new simulation question is stamped questionTypeVersion 1 with NO package yet; validation reports SIM_PACKAGE_MISSING as a BLOCKING error", () => {
    const q = newQuestion("simulation", { examQuestionId: "s" });
    expect(q.questionTypeVersion).toBe(1); expect(q.simulation).toBeUndefined();
    expect(validateQuestionTypeNode(q as unknown as Record<string, unknown>, "simulation", 1).map(i => i.code)).toEqual(["SIM_PACKAGE_MISSING"]);
    const decision = evaluateExamFinalization(baseExam([{ ...q, text: "نص", marks: 3 }]));
    expect(decision.canFinalize).toBe(false);
    expect(decision.blockers.map(b => b.structural?.code)).toContain("SIM_PACKAGE_MISSING");
  });
  it("validateSimulationReference refuses 'latest', non-integer versions, malformed hashes, unsupported runtime versions and unsafe entries; the exact reference passes", () => {
    expect(validateSimulationReference(REF)).toEqual([]);
    expect(validateSimulationReference({ ...REF, packageHash: "latest" }).map(i => i.code)).toEqual(["SIM_PACKAGE_HASH_INVALID"]);
    expect(validateSimulationReference({ ...REF, packageVersion: "latest" as unknown as number }).map(i => i.code)).toEqual(["SIM_PACKAGE_VERSION_INVALID"]);
    expect(validateSimulationReference({ ...REF, packageVersion: 1.5 }).map(i => i.code)).toEqual(["SIM_PACKAGE_VERSION_INVALID"]);
    expect(validateSimulationReference({ ...REF, packageId: "../x" }).map(i => i.code)).toEqual(["SIM_PACKAGE_ID_INVALID"]);
    expect(validateSimulationReference({ ...REF, packageId: "https://evil.example/a" }).map(i => i.code)).toEqual(["SIM_PACKAGE_ID_INVALID"]);
    expect(validateSimulationReference({ ...REF, runtimeVersion: 2 }).map(i => i.code)).toEqual(["SIM_RUNTIME_UNSUPPORTED"]);
    expect(validateSimulationReference({ ...REF, entry: "../metadata.json" }).map(i => i.code)).toEqual(["SIM_ENTRY_UNSAFE"]);
    expect(validateSimulationReference({ ...REF, scenario: "not-an-object" as unknown as Record<string, unknown> }).map(i => i.code)).toEqual(["SIM_SCENARIO_INVALID"]);
    expect(validateSimulationReference({ ...REF, publicConfig: [1] as unknown as Record<string, unknown> }).map(i => i.code)).toEqual(["SIM_PUBLIC_CONFIG_INVALID"]);
    expect(validateSimulationReference(null).map(i => i.code)).toEqual(["SIM_PACKAGE_MISSING"]);
  });
  it("structural validation of an exam surfaces the same codes as blocking errors (client == shared server build); a fully pinned question has no simulation issue", () => {
    const bad = validateStructuredExam(baseExam([simQuestion({ simulation: { ...REF, packageHash: "sha256:zz" } })]));
    expect(bad.some(i => i.code === "SIM_PACKAGE_HASH_INVALID" && i.severity === "error")).toBe(true);
    const good = validateStructuredExam(baseExam([simQuestion()]));
    expect(good.filter(i => i.code.startsWith("SIM_"))).toEqual([]);
    expect(evaluateExamFinalization(baseExam([simQuestion()])).canFinalize).toBe(true);
  });
  it("S34 — duplicate / move / move-to-section / clone / JSON round-trip preserve the exact identity (id, version, hash, runtimeVersion, scenario, publicConfig)", () => {
    const q = simQuestion({ simulation: { ...REF, scenario: { level: 2 }, publicConfig: { theme: "dark" } } });
    const sections = [...baseExam([q]).sections, newSection({ id: "sec-2" })];
    const dup = duplicateQuestion(sections, "sec-1", "sim1")[0].questions;
    expect(dup.length).toBe(2); expect(dup[1].examQuestionId).not.toBe("sim1"); expect(dup[1].simulation).toEqual(q.simulation);
    expect(moveQuestion(dup.length ? duplicateQuestion(sections, "sec-1", "sim1") : sections, "sec-1", "sim1", 1)[0].questions[1].simulation).toEqual(q.simulation);
    const moved = moveQuestionToSection(sections, "sec-1", "sim1", "sec-2");
    expect(moved[1].questions[0].simulation).toEqual(q.simulation); expect(moved[1].questions[0].questionTypeVersion).toBe(1);
    expect(cloneQuestionWithNewIds(q).simulation).toEqual(q.simulation);
    expect(JSON.parse(JSON.stringify(q)).simulation).toEqual(q.simulation);
  });
});

describe("Editor — inside the real Builder with an injected App-owned service", () => {
  it("adding «محاكاة تفاعلية» from the palette (16 cards, «تفاعلي» tab) creates a simulation@1 question and mounts the lazy editor; without a service the editor explains that upload / library are unavailable", async () => {
    const { hist } = await mount(baseExam([newQuestion("multipleChoice", { examQuestionId: "q1", text: "س" })]));
    fireEvent.click(screen.getByRole("button", { name: "+ إضافة سؤال" }));
    const d = await screen.findByRole("dialog", { name: "إضافة سؤال" }); await tick(30);
    expect(within(d).getAllByTestId("qt-card").length).toBe(22);                                    // Phase 17A adds coding · 18C adds networkCli · 19A adds inlineCloze · 19B adds parametricNumeric · 19D adds hotspot / labelDiagram
    fireEvent.click(within(d).getByRole("tab", { name: "تفاعلي" })); await tick();
    const card = within(d).getAllByTestId("qt-card").find(c => c.getAttribute("data-type-key") === "simulation")!;
    expect(card.textContent).toContain("محاكاة تفاعلية"); expect(card.textContent).toMatch(/يدوي/);
    fireEvent.click(card); await tick(40);
    const q = hist().present!.sections[0].questions[1];
    expect(q.presentationType).toBe("simulation"); expect(q.questionTypeVersion).toBe(1); expect(q.simulation).toBeUndefined();
    const editor = await screen.findByTestId("qt-editor-simulation", {}, { timeout: 3000 });
    expect(editor.textContent).toMatch(/غير متاحة|لم تُفعَّل/);
    expect(screen.queryByRole("button", { name: "من المكتبة" })).toBeNull();
    expect(editor.textContent).toMatch(/dist/);                                                                   // TS / React must be prebuilt
  });
  it("«من المكتبة» lists the owner's packages (title, packageId@version, hash prefix, size, date) and choosing one writes EXACTLY {packageId, packageVersion, packageHash, runtimeVersion, entry, title} — never 'latest'", async () => {
    const svc = fakeService();
    const { hist } = await mount(baseExam([newQuestion("simulation", { examQuestionId: "sim1", text: "س" })]), svc);
    await screen.findByTestId("qt-editor-simulation", {}, { timeout: 3000 });
    fireEvent.click(screen.getByRole("button", { name: "من المكتبة" })); await tick(30);
    const items = await screen.findAllByTestId("smartsim-lib-item");
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain("Counter"); expect(items[0].textContent).toContain("counter-sim@1"); expect(items[0].textContent).toContain(HASH.slice(7, 19));
    expect(items[0].textContent).not.toContain(HASH.slice(7));                                                     // prefix only, not the full hash wall
    fireEvent.click(within(items[1]).getByRole("button", { name: /اختيار/ })); await tick(30);
    const q = firstQuestion(hist());
    expect(q.simulation).toEqual({ packageId: "counter-sim", packageVersion: 2, packageHash: "sha256:" + "ef".repeat(32), runtimeVersion: 1, entry: "index.html", title: "Counter v2" });
    expect(JSON.stringify(q)).not.toMatch(/latest/);
    expect(screen.getByTestId("smartsim-selected").textContent).toContain("counter-sim@2");
    expect(svc.calls).toContain("list");
  });
  it("«رفع محاكاة»: a chosen .smartsim file goes through service.upload (progress → report «اجتازت فحوص الحزمة») and the created package is pinned on the question", async () => {
    const svc = fakeService();
    const { hist } = await mount(baseExam([newQuestion("simulation", { examQuestionId: "sim1", text: "س" })]), svc);
    await screen.findByTestId("qt-editor-simulation", {}, { timeout: 3000 });
    fireEvent.click(screen.getByRole("button", { name: "رفع محاكاة" })); await tick();
    const input = screen.getByTestId("smartsim-file-input") as HTMLInputElement;
    expect(input.getAttribute("accept")).toContain(".smartsim"); expect(input.getAttribute("accept")).toContain(".zip");
    const file = new File([new Uint8Array([0x50, 0x4b, 3, 4])], "counter.smartsim", { type: "application/zip" });
    fireEvent.change(input, { target: { files: [file] } }); await tick(40);
    expect(svc.upload).toHaveBeenCalledTimes(1);
    expect((svc.upload as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0]).toBe(file);
    const report = await screen.findByTestId("smartsim-report");
    expect(report.textContent).toContain("اجتازت فحوص الحزمة");
    expect(report.textContent).not.toMatch(/آمنة تمامًا|100%/);
    expect(firstQuestion(hist()).simulation).toMatchObject({ packageId: "uploaded-sim", packageVersion: 1, packageHash: "sha256:" + "11".repeat(32), runtimeVersion: 1 });
  });
  it("an upload rejected by the server shows blockers (codes + Arabic messages) and does NOT change the question; a hash conflict shows the exact conflict message with no overwrite option; retry re-runs the upload", async () => {
    let n = 0;
    const svc = fakeService({ upload: vi.fn(async () => { n++; if (n === 1) return { status: "rejected" as const, report: { ok: false, issues: [{ code: "PATH_TRAVERSAL", severity: "error" as const, path: "../x", message: "مسار غير آمن" }, { code: "SOURCE_IGNORED", severity: "warning" as const, message: "تم تجاهل source/" }] } }; if (n === 2) return { status: "conflict" as const, existing: { packageHash: HASH } }; return { status: "created" as const, package: record() }; }) });
    const { hist } = await mount(baseExam([simQuestion()]), svc);
    await screen.findByTestId("qt-editor-simulation", {}, { timeout: 3000 });
    fireEvent.click(screen.getByRole("button", { name: "رفع محاكاة" })); await tick();
    const input = screen.getByTestId("smartsim-file-input") as HTMLInputElement;
    const file = new File([new Uint8Array([0x50, 0x4b, 3, 4])], "counter.zip", { type: "application/zip" });
    fireEvent.change(input, { target: { files: [file] } }); await tick(40);
    const report = await screen.findByTestId("smartsim-report");
    expect(report.textContent).toContain("PATH_TRAVERSAL"); expect(report.textContent).toContain("مسار غير آمن");
    expect(within(report).getAllByTestId("smartsim-issue-blocker").length).toBe(1); expect(within(report).getAllByTestId("smartsim-issue-warning").length).toBe(1);
    expect(firstQuestion(hist()).simulation).toEqual(REF);
    fireEvent.click(screen.getByRole("button", { name: /إعادة المحاولة/ })); await tick(40);
    expect(svc.upload).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("smartsim-conflict").textContent).toContain("هذه النسخة موجودة بمحتوى مختلف. أنشئ إصدارًا جديدًا للمحاكي، مثل v2.");
    expect(screen.queryByRole("button", { name: /استبدال|الكتابة فوق/ })).toBeNull();
    expect(firstQuestion(hist()).simulation).toEqual(REF);
  });
  it("«معاينة المحاكاة» opens the SAME sandbox host as students (sandbox=allow-scripts, content-addressed src) with the debug inspector; «نسخ مواصفات بناء محاكي» copies the protocol spec", async () => {
    const svc = fakeService();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    await mount(baseExam([simQuestion()]), svc);
    await screen.findByTestId("qt-editor-simulation", {}, { timeout: 3000 });
    fireEvent.click(screen.getByRole("button", { name: "معاينة المحاكاة" })); await tick(40);
    const f = (await screen.findByTestId("smartsim-frame")) as HTMLIFrameElement;
    expect(f.getAttribute("sandbox")).toBe("allow-scripts");
    expect(f.getAttribute("src")).toBe("/api/simulators/runtime/counter-sim/1/" + "cd".repeat(32) + "/index.html");
    expect(screen.getByTestId("smartsim-debug-state")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "نسخ مواصفات بناء محاكي" })); await tick();
    expect(writeText).toHaveBeenCalledTimes(1);
    const spec = String((writeText as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0]);
    expect(spec).toContain("SMARTSIM_INIT"); expect(spec).toContain("SMARTSIM_STATE_CHANGED"); expect(spec).toContain("manifest.json"); expect(spec).toContain("dist/index.html");
    expect(spec).not.toMatch(/sha256:[0-9a-f]{64}|Authorization|token/);
  });
  it("undo / redo restore the exact identity (history is snapshot-based)", async () => {
    const svc = fakeService();
    const { hist } = await mount(baseExam([newQuestion("simulation", { examQuestionId: "sim1", text: "س" })]), svc);
    await screen.findByTestId("qt-editor-simulation", {}, { timeout: 3000 });
    fireEvent.click(screen.getByRole("button", { name: "من المكتبة" })); await tick(30);
    const items = await screen.findAllByTestId("smartsim-lib-item");
    fireEvent.click(within(items[0]).getByRole("button", { name: /اختيار/ })); await tick(30);
    expect(firstQuestion(hist()).simulation?.packageHash).toBe(HASH);
    act(() => hist().undo()); await tick();
    expect(firstQuestion(hist()).simulation).toBeUndefined();
    act(() => hist().redo()); await tick();
    expect(firstQuestion(hist()).simulation).toEqual({ packageId: "counter-sim", packageVersion: 1, packageHash: HASH, runtimeVersion: 1, entry: "index.html", title: "Counter" });
  });
});

describe("Student card — registered renderer + sanitizer contract", () => {
  it("the sanitized question keeps the exact package identity + scenario / publicConfig and loses `answer`; the card resolves the simulation renderer (label «محاكاة تفاعلية», iframe src from the identity)", async () => {
    const teacher = baseExam([simQuestion({ simulation: { ...REF, scenario: { level: 2 }, publicConfig: { theme: "dark" } }, answer: { assertions: [{ path: "count", equals: 3 }], teacherNote: "سري" } })]);
    const [sq] = sanitizeExamForStudent(teacher).sections[0].questions;
    expect((sq as { simulation?: unknown }).simulation).toEqual({ ...REF, scenario: { level: 2 }, publicConfig: { theme: "dark" } });
    expect(JSON.stringify(sq)).not.toMatch(/assertions|سري/);                                             // teacherNote is blanked to ""
    function Harness() { const [a, setA] = useState<Answer | undefined>(); return <><StudentQuestionCard q={sq} index={0} id="sim1" answer={a} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onAnswer={setA} /><output data-testid="a">{JSON.stringify(a ?? null)}</output></>; }
    render(<Harness />);
    const f = (await screen.findByTestId("smartsim-frame", {}, { timeout: 3000 })) as HTMLIFrameElement;
    expect(f.getAttribute("src")).toBe("/api/simulators/runtime/counter-sim/1/" + "cd".repeat(32) + "/index.html");
    expect(f.getAttribute("sandbox")).toBe("allow-scripts");
    expect(screen.getByText("محاكاة تفاعلية")).toBeTruthy();
    expect(screen.queryByTestId("smartsim-debug-state")).toBeNull();
  });
  it("a student question whose package reference is malformed renders the safe Arabic error panel (no iframe, no crash)", async () => {
    const q = { examQuestionId: "sim9", presentationType: "simulation", questionTypeVersion: 1, text: "س", marks: 1, simulation: { packageId: "counter-sim", packageVersion: 1, packageHash: "latest", runtimeVersion: 1 } } as unknown as Question;
    render(<StudentQuestionCard q={q} index={0} id="sim9" answer={undefined} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onAnswer={() => {}} />);
    const panel = await screen.findByTestId("smartsim-error", {}, { timeout: 3000 });
    expect(panel.getAttribute("data-error-code")).toBe("PACKAGE_REFERENCE_INVALID");
    expect(screen.queryByTestId("smartsim-frame")).toBeNull();
  });
});
