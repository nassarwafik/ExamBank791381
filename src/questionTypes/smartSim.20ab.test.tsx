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
import { newQuestion, newSection, duplicateQuestion, cloneQuestionWithNewIds, moveQuestionToSection } from "../examBuilderState";
import type { Answer } from "../answerState";
import { answered } from "../answerState";
import { resolveAuthoringEditor } from "./authoringRegistry";
import { resolveStudentRenderer, studentUnsupported } from "./studentRegistry";
import { typeSpecificContentPresent } from "./typeContent";
import { chipsFor, typeDescription, typeIcon } from "./typePresentation";
import { QUESTION_TYPE_CATALOG, questionTypeDefinition } from "../questionTypeCatalog";
import { validateQuestionTypeNode } from "../questionTypeValidation";
import { evaluateExamFinalization } from "../examFinalization";
import { parseStructuredExamJson } from "../structuredExamImport";
import { routerTwoSwitchesFourPcsTemplate, twoLanDemoChecks } from "../networkTopology/networkTopologyTemplates";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";
import type { Question } from "../studentQuestionTypes";
const sanitizeExamForStudent = (sanitizer as unknown as { sanitizeExamForStudent: (exam: unknown) => { sections: { questions: Question[] }[] } }).sanitizeExamForStudent;

// Phase 20A+20B — the smartSim@1 UI: catalog / palette identity (24 types), the lazy student workspace for networkTopology@1 (SVG topology
// + keyboard-accessible device list, PC network form, per-device switch / router terminals, simulated ping on the shared connectivity
// engine, reset, restore by replay, secrecy), the lazy teacher editor (one-click template, devices / links / checks, inline canonical
// validation), builder round-trips, the teacher review of SERVER-computed checks and the lazy-import guards.
// New-function tests (fail-first on a13252803: the type is unknown to every registry).
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ENV = () => ({ schemaVersion: 1, pluginKey: "networkTopology", pluginVersion: 1, config: routerTwoSwitchesFourPcsTemplate() });
const KEY = () => ({ scoring: "proportional", checks: twoLanDemoChecks() });
const CANARIES = /BR1-SW1|BR1-SW2|192\.168\.|reach-pc|"checks"|"weight"|"scoring"/;
const teacherQ = (over: Record<string, unknown> = {}) => ({ ...newQuestion("smartSim" as never, { examQuestionId: "t1", text: "اضبط الشبكة بحيث تتصل الشبكتان.", marks: 23 }), smartSim: ENV(), answer: KEY(), ...over } as unknown as BuilderQuestion);
const baseExam = (questions: BuilderQuestion[]): StructuredExam => ({ examId: "EXAM-20AB", title: "امتحان الشبكات", status: "draft", schemaVersion: 2, sections: [{ id: "sec-1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, questions }] });
const studentQ = (over: Record<string, unknown> = {}) => sanitizeExamForStudent(baseExam([teacherQ(over)])).sections[0].questions[0];
const tick = (ms = 10) => act(async () => { await new Promise(r => setTimeout(r, ms)); });

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
const firstQ = (h: Hist) => h.present!.sections[0].questions[0] as unknown as Record<string, unknown> & { smartSim: ReturnType<typeof ENV>; answer: ReturnType<typeof KEY> };

function StudentHarness({ q, initial, disabled }: { q: Question; initial?: Answer; disabled?: boolean }) {
  const [a, setA] = useState<Answer | undefined>(initial);
  return <><StudentQuestionCard q={q} index={0} id="t1" answer={a} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onAnswer={setA} disabled={disabled} /><output data-testid="answer">{JSON.stringify(a ?? null)}</output></>;
}
const answerOut = () => JSON.parse(screen.getByTestId("answer").textContent || "null");
const deviceList = async () => (await screen.findByTestId("nettopo-device-list", {}, { timeout: 3000 }));
const pick = async (label: string) => { fireEvent.click(within(await deviceList()).getByRole("button", { name: new RegExp("^" + label + "\\b") })); await tick(); };
const terminalInput = () => screen.getByRole("textbox", { name: /سطر الأوامر/ }) as HTMLInputElement;
const typeLine = (line: string) => { const el = terminalInput(); fireEvent.change(el, { target: { value: line } }); fireEvent.keyDown(el, { key: "Enter" }); };
const prompt = () => screen.getByTestId("ncli-prompt").textContent;
// the smartSim host loads first, then the plugin editor (a second lazy chunk resolved through the UI plugin registry)
const openEditor = async () => { const host = await screen.findByTestId("qt-editor-smartSim", {}, { timeout: 3000 }); await within(host).findByTestId("nettopo-editor", {}, { timeout: 3000 }); return host; };
const setField = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("identity — smartSim@1 is the 24th production type, distinct from simulation@1", () => {
  it("catalog row: interactive, auto-graded, partial credit, offline, NOT a compound part; responseKinds ['smartSim']; simulation@1 unchanged (manual, opaque)", () => {
    expect(QUESTION_TYPE_CATALOG.length).toBe(26);   /* 20D adds composite (after compound) · 21A.1 adds chartSelection (after composite) */ expect(QUESTION_TYPE_CATALOG.at(-1)!.key).toBe("smartSim");
    const d = questionTypeDefinition("smartSim")!;
    expect(d).toMatchObject({ version: 1, category: "interactive", gradingMode: "auto", legacy: false, responseKinds: ["smartSim"] });
    expect(d.capabilities).toMatchObject({ autoGrading: true, partialCredit: true, interactive: true, offline: true, compoundPart: false, manualGrading: false, requiresImage: false });
    expect(questionTypeDefinition("simulation")).toMatchObject({ gradingMode: "manual", responseKinds: ["simulation"] });
    expect(questionTypeDefinition("simulation")!.capabilities.autoGrading).toBe(false);
    expect(typeDescription(d)).toMatch(/موثوق/); expect(typeIcon(d)).not.toBe("▫");
    expect(chipsFor(d)).toEqual(expect.arrayContaining(["تصحيح تلقائي", "علامة جزئية", "تفاعلي"]));
    expect(resolveStudentRenderer("smartSim", 1)).toBeTruthy(); expect(resolveAuthoringEditor("smartSim", 1)).toBeTruthy();
    expect(resolveStudentRenderer("smartSim", 2)).toBeUndefined(); expect(studentUnsupported("smartSim", 2)).toBe(true);
  });
  it("newQuestion seeds an EMPTY networkTopology@1 envelope and an empty private key at version 1; finalization blocks until devices and checks exist", () => {
    const q = newQuestion("smartSim" as never, { examQuestionId: "t1", text: "x", marks: 5 }) as unknown as Record<string, unknown>;
    expect(q.questionTypeVersion).toBe(1);
    expect(q.smartSim).toEqual({ schemaVersion: 1, pluginKey: "networkTopology", pluginVersion: 1, config: { v: 1, devices: [], links: [] } });
    expect(q.answer).toEqual({ scoring: "proportional", checks: [] });
    const codes = validateQuestionTypeNode(q, "smartSim", 1).map(i => i.code);
    expect(codes).toEqual(expect.arrayContaining(["NETTOPO_NO_DEVICES", "SMARTSIM_CHECKS_EMPTY"]));
    expect(typeSpecificContentPresent(q)).toBe(false);
    expect(typeSpecificContentPresent(teacherQ() as unknown as Record<string, unknown>)).toBe(true);
    expect(validateQuestionTypeNode(teacherQ() as unknown as Record<string, unknown>, "smartSim", 1)).toEqual([]);
  });
});

describe("student workspace — topology, device panels, per-device CLI, ping, reset, restore, secrecy", () => {
  it("shows the topology (SVG + an accessible device list), PC panel → canonical actions; switch / router terminals keep independent sessions while switching devices", async () => {
    render(<StudentHarness q={studentQ()} />);
    const list = await deviceList();
    expect(within(list).getAllByRole("button").map(b => b.textContent)).toEqual(expect.arrayContaining([expect.stringMatching(/^R1/), expect.stringMatching(/^SW1/), expect.stringMatching(/^PC4/)]));
    expect(screen.getByRole("img", { name: /مخطط الشبكة/ })).toBeTruthy();
    expect(document.querySelectorAll("[data-testid=nettopo-link]").length).toBe(6);
    await pick("PC1");
    expect(screen.getByTestId("nettopo-selected").textContent).toMatch(/PC1/);
    setField("عنوان IPv4", "192.168.10.10"); setField("قناع الشبكة الفرعية", "255.255.255.0"); setField("البوابة الافتراضية", "192.168.10.254");
    fireEvent.click(screen.getByRole("button", { name: "تطبيق الإعدادات" })); await tick();
    expect(answerOut().actions).toEqual([{ type: "pc.setAddress", deviceId: "pc1", value: "192.168.10.10" }, { type: "pc.setMask", deviceId: "pc1", value: "255.255.255.0" }, { type: "pc.setGateway", deviceId: "pc1", value: "192.168.10.254" }]);
    expect(answerOut()).toMatchObject({ kind: "smartSim", pluginKey: "networkTopology", pluginVersion: 1 });
    setField("عنوان IPv4", "192.168.10.300");
    fireEvent.click(screen.getByRole("button", { name: "تطبيق الإعدادات" })); await tick();
    expect(screen.getByRole("alert").textContent).toMatch(/عنوان IPv4 غير صالح/); expect(answerOut().actions).toHaveLength(3);
    await pick("SW1");
    expect(prompt()).toBe("Switch>"); typeLine("enable"); await tick(); expect(prompt()).toBe("Switch#");
    await pick("R1");
    expect(prompt()).toBe("Router>"); typeLine("enable"); typeLine("conf t"); await tick(); expect(prompt()).toBe("Router(config)#");
    await pick("SW2");
    expect(prompt()).toBe("Switch>");
    await pick("SW1");
    expect(prompt()).toBe("Switch#");
    await pick("PC1");
    expect((screen.getByLabelText("عنوان IPv4") as HTMLInputElement).value).toBe("192.168.10.10");
    expect(answerOut().actions.slice(3)).toEqual([{ type: "switch.command", deviceId: "sw1", command: "enable" }, { type: "router.command", deviceId: "r1", command: "enable" }, { type: "router.command", deviceId: "r1", command: "conf t" }]);
    expect(answered(answerOut())).toBe(true);
  });
  it("simulated ping uses the shared connectivity engine (feedback only, never stored as an action); reset needs explicit confirmation and returns to the initial state", async () => {
    const acts = [
      { type: "pc.setAddress", deviceId: "pc1", value: "192.168.10.10" }, { type: "pc.setMask", deviceId: "pc1", value: "255.255.255.0" },
      { type: "pc.setAddress", deviceId: "pc2", value: "192.168.10.20" }, { type: "pc.setMask", deviceId: "pc2", value: "255.255.255.0" }];
    render(<StudentHarness q={studentQ()} initial={{ kind: "smartSim", pluginKey: "networkTopology", pluginVersion: 1, actions: acts, state: {} } as never} />);
    await pick("PC1");
    fireEvent.change(screen.getByLabelText("الجهاز الوجهة"), { target: { value: "pc2" } });
    fireEvent.click(screen.getByRole("button", { name: /اختبار الاتصال/ })); await tick();
    expect(screen.getByTestId("nettopo-ping-result").textContent).toMatch(/نجح/);
    fireEvent.change(screen.getByLabelText("الجهاز الوجهة"), { target: { value: "pc3" } });
    fireEvent.click(screen.getByRole("button", { name: /اختبار الاتصال/ })); await tick();
    expect(screen.getByTestId("nettopo-ping-result").textContent).toMatch(/فشل/);
    expect(answerOut().actions).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "إعادة ضبط المحاكاة" })); await tick();
    expect(answerOut().actions).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "تأكيد إعادة ضبط المحاكاة" })); await tick();
    expect(answerOut().actions).toEqual([]); expect(answered(answerOut())).toBe(false);
  });
  it("restore / resume replays stored actions (PC fields, terminal transcript and mode); a disabled card is read-only", async () => {
    const acts = [{ type: "pc.setAddress", deviceId: "pc3", value: "192.168.20.10" }, { type: "switch.command", deviceId: "sw2", command: "enable" }, { type: "switch.command", deviceId: "sw2", command: "configure terminal" }, { type: "switch.command", deviceId: "sw2", command: "hostname BR1-SW2" }];
    render(<StudentHarness q={studentQ()} initial={{ kind: "smartSim", pluginKey: "networkTopology", pluginVersion: 1, actions: acts, state: {} } as never} disabled />);
    await pick("PC3");
    expect((screen.getByLabelText("عنوان IPv4") as HTMLInputElement).value).toBe("192.168.20.10");
    expect((screen.getByLabelText("عنوان IPv4") as HTMLInputElement).disabled).toBe(true);
    await pick("SW2");
    expect(prompt()).toBe("BR1-SW2(config)#"); expect(screen.getByTestId("ncli-screen").textContent).toContain("hostname BR1-SW2");
    expect(terminalInput().disabled).toBe(true);
  });
  it("secrecy: the sanitized student question carries only the public envelope; the rendered DOM never shows a check, expected value or weight", async () => {
    const sq = studentQ() as unknown as Record<string, unknown>;
    expect(JSON.stringify(sq)).not.toMatch(CANARIES);
    expect(sq.answer).toEqual({});
    render(<StudentHarness q={teacherQ() as unknown as Question} />);
    await deviceList();
    expect(document.body.innerHTML).not.toMatch(/BR1-SW1|reach-pc|192\.168\.10\.254/);
  });
  it("an unknown plugin / version renders an explicit unavailable state, never another plugin", async () => {
    render(<StudentHarness q={studentQ({ smartSim: { ...ENV(), pluginVersion: 3 } })} />);   // Phase 20C: @2 is registered now; @3 is the future version
    expect(await screen.findByTestId("smartsim-unavailable", {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.queryByTestId("nettopo-device-list")).toBeNull();
  });
  it("defense in depth: the renderer reads ONLY the strict projection (an unsanitized teacher-side envelope with a smuggled / unknown field or another version is unavailable) and the UI registry resolves EXACT identities only", async () => {
    const raw = (smartSim: unknown) => teacherQ({ smartSim }) as unknown as Question;
    for (const smartSim of [{ ...ENV(), target: { pcs: { pc1: { address: "192.168.10.10" } } } }, { ...ENV(), config: { ...ENV().config, devices: ENV().config.devices.map((d, i) => (i === 0 ? { ...d, expectedIp: "192.168.10.254" } : d)) } }, { ...ENV(), pluginVersion: 2 }]) {
      render(<StudentHarness q={raw(smartSim)} />);
      expect(await screen.findByTestId("smartsim-unavailable", {}, { timeout: 3000 })).toBeTruthy();
      expect(screen.queryByTestId("nettopo-workspace")).toBeNull(); expect(screen.queryByTestId("nettopo-unavailable")).toBeNull();
      cleanup();
    }
    const { resolveSmartSimUi } = await import("../trustedSim/smartSimUiRegistry");
    expect(resolveSmartSimUi("networkTopology", 1)).toBeDefined();
    for (const [k, v] of [["networkTopology", 3], ["networkTopology", 0],   // Phase 20C: @2 is registered now; @3 is unknown
    ["networkTopology", 1.5], ["networkTopology", "1"], ["networktopology", 1], ["networkTopologyPro", 1], ["__proto__", 1], [undefined, 1]] as const)
      expect(resolveSmartSimUi(k, v), String(k) + "@" + String(v)).toBeUndefined();
  });
});

describe("teacher authoring — lazy editor, one-click template, checks, inline canonical validation, round-trips", () => {
  it("palette adds smartSim@1; the template builds R1 + 2 switches + 4 PCs; the demo preset adds the 17 private checks; validation clears; finalization passes", async () => {
    const { hist } = await mountBuilder(baseExam([newQuestion("multipleChoice", { examQuestionId: "q1", text: "س" })]));
    fireEvent.click(screen.getByRole("button", { name: "+ إضافة سؤال" }));
    const d = await screen.findByRole("dialog", { name: "إضافة سؤال" }); await tick(30);
    expect(within(d).getAllByTestId("qt-card").length).toBe(26);   /* 20D adds composite · 21A.1 adds chartSelection */
    fireEvent.click(within(d).getByRole("tab", { name: "تفاعلي" })); await tick();
    const card = within(d).getAllByTestId("qt-card").find(c => c.getAttribute("data-type-key") === "smartSim")!;
    fireEvent.click(card); await tick(50);
    const editor = await openEditor();
    expect(within(editor).getByTestId("smartsim-issues").textContent).toMatch(/جهاز/);
    fireEvent.click(within(editor).getByRole("button", { name: /قالب: راوتر \+ سويتشان \+ 4 حواسيب/ })); await tick();
    const q = () => hist().present!.sections[0].questions[1] as unknown as { smartSim: ReturnType<typeof ENV>; answer: ReturnType<typeof KEY> };
    expect(q().smartSim.config).toEqual(routerTwoSwitchesFourPcsTemplate());
    fireEvent.click(within(editor).getByRole("button", { name: /فحوص تمرين الشبكتين/ })); await tick();
    expect(q().answer.checks).toEqual(twoLanDemoChecks());
    expect(within(editor).queryByTestId("smartsim-issues")).toBeNull();
    expect(JSON.stringify(evaluateExamFinalization(hist().present as never).blockers)).not.toMatch(/SMARTSIM|NETTOPO/);
  });
  it("devices / links / checks are edited structurally (no raw JSON); invalid edits surface inline; a device used by a check cannot be deleted silently", async () => {
    const { hist } = await mountBuilder(baseExam([teacherQ()]));
    const editor = await openEditor();
    fireEvent.click(within(editor).getByRole("button", { name: "+ حاسوب" })); await tick();
    expect(firstQ(hist()).smartSim.config.devices.map(x => x.id)).toContain("pc5");
    fireEvent.change(within(editor).getByLabelText("وزن الفحص pc1-ip"), { target: { value: "0" } }); await tick();
    expect(within(editor).getByTestId("smartsim-issues").textContent).toMatch(/الوزن/);
    fireEvent.change(within(editor).getByLabelText("وزن الفحص pc1-ip"), { target: { value: "2" } }); await tick();
    expect(firstQ(hist()).answer.checks.find(c => c.id === "pc1-ip")!.weight).toBe(2);
    fireEvent.click(within(editor).getByRole("button", { name: "حذف الجهاز PC1" })); await tick();
    expect(firstQ(hist()).smartSim.config.devices.map(x => x.id)).toContain("pc1");
    expect(within(editor).getByRole("status").textContent).toMatch(/فحوص/);
    expect(editor.querySelector("textarea[data-json]")).toBeNull();
  });
  it("undo / duplicate / move / clone / JSON import preserve the envelope and the private key byte-for-byte; a future plugin version never opens as v1", async () => {
    const q = teacherQ();
    const sections = [...baseExam([q]).sections, newSection({ id: "sec-2" })];
    const dup = duplicateQuestion(sections, "sec-1", "t1")[0].questions as unknown as Record<string, unknown>[];
    expect(dup[1].smartSim).toEqual(ENV()); expect(dup[1].answer).toEqual(KEY());
    expect((moveQuestionToSection(sections, "sec-1", "t1", "sec-2")[1].questions[0] as unknown as Record<string, unknown>).smartSim).toEqual(ENV());
    expect((cloneQuestionWithNewIds(q) as unknown as Record<string, unknown>).smartSim).toEqual(ENV());
    const imported = parseStructuredExamJson(JSON.stringify(baseExam([q])), "exam.json");
    expect(imported.canOpen).toBe(true);
    const iq = imported.exam!.sections[0].questions[0] as unknown as Record<string, unknown>;
    expect(iq.smartSim).toEqual(ENV()); expect(iq.answer).toEqual(KEY());
    const future = parseStructuredExamJson(JSON.stringify(baseExam([teacherQ({ smartSim: { ...ENV(), pluginVersion: 3 } })])), "exam.json");   // Phase 20C: @2 is registered now; @3 is the future version
    expect(JSON.stringify(evaluateExamFinalization(future.exam as never).blockers)).toMatch(/SMARTSIM_PLUGIN_UNKNOWN/);
    const { hist } = await mountBuilder(baseExam([q]));
    const editor = await openEditor();
    fireEvent.change(within(editor).getByLabelText("وزن الفحص pc1-ip"), { target: { value: "5" } }); await tick();
    await act(async () => { hist().undo(); }); await tick();
    expect(firstQ(hist()).answer).toEqual(KEY());
  });
});

describe("teacher review — server-computed checks, device states and per-device histories", () => {
  const review = () => ({
    ok: true, valid: true, score: 15, maxMarks: 23, totalWeight: 23, passedWeight: 15,
    checks: [{ id: "pc1-ip", label: "PC1 — عنوان IP", kind: "pc.address", expected: "192.168.10.10", actual: "192.168.10.10", passed: true, weight: 1, points: 1, maxPoints: 1 },
      { id: "reach-pc1-pc3", label: "PC1 ← → PC3", kind: "reachability", expected: "reachable", actual: "unreachable", passed: false, weight: 3, points: 0, maxPoints: 3, evidence: ["NO_ROUTE_TO_DESTINATION", "pc1 → sw1 → r1"] }],
    state: { v: 1, pcs: { pc1: { address: "192.168.10.10", mask: "255.255.255.0" } }, switches: {}, routers: {} },
    transcripts: { r1: [{ input: "<img src=x onerror=alert(1)>", prompt: "Router>", status: "unknown" }] }
  });
  const body = () => ({ ok: true, assignment: { assignmentId: "a1", title: "واجب الشبكات", totalMarks: 23 }, student: { studentId: "s1", studentName: "سارة", studentCode: "S1" }, attempt: { attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 15, totalMarks: 23, percentage: 65, manualReviewMarks: 0, finalized: true, gradingStatus: "final", teacherFeedback: "" }, attempts: [{ attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 15, totalMarks: 23, percentage: 65, manualReviewMarks: 0, finalized: true, gradingStatus: "final" }], questions: [{ questionId: "t1", questionNumber: 1, text: "اضبط الشبكة", marks: 23, type: "smartSim", smartSim: ENV(), smartSimReview: review(), studentAnswer: { kind: "smartSim", pluginKey: "networkTopology", pluginVersion: 1, actions: [], state: {} }, expectedAnswer: KEY(), autoGrade: { score: 15, manualReview: false }, manualScore: null, teacherComment: "" }] });
  it("renders ✓ / ✗ per check with derived points, reachability evidence, device configurations and the command history as TEXT", async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ status: 200, ok: true, json: async () => body() } as Response)) as unknown as typeof fetch;
    render(<AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => {}} onSaved={() => {}} />);
    const view = await screen.findByTestId("smartsim-review", {}, { timeout: 3000 });
    const rows = within(view).getAllByTestId("smartsim-check");
    expect(rows.map(r => r.getAttribute("data-passed"))).toEqual(["true", "false"]);
    expect(rows[0].textContent).toContain("1 / 1"); expect(rows[1].textContent).toContain("0 / 3"); expect(rows[1].textContent).toContain("NO_ROUTE_TO_DESTINATION");
    expect(within(view).getByTestId("smartsim-review-total").textContent).toMatch(/15/);
    expect(view.textContent).toContain("192.168.10.10");
    expect(view.querySelector("img")).toBeNull(); expect(view.textContent).toContain("<img src=x onerror=alert(1)>");
  });
});

describe("architecture guards — lazy edges only, no dynamic module names, no unsafe sinks", () => {
  it("the workspace / editor / review are reached only through literal import() edges; the stored data never selects a module", () => {
    const srcFiles: string[] = [];
    const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!/node_modules|dist/.test(p)) walk(p); } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) srcFiles.push(p); } };
    walk(path.join(repo, "src"));
    const staticImporters = (name: string) => srcFiles.filter(f => new RegExp("^import[^;]*from\\s*\"[^\"]*" + name + "\"", "m").test(fs.readFileSync(f, "utf8"))).map(f => path.relative(repo, f));
    expect(staticImporters("student/SmartSimResponse")).toEqual([]); expect(staticImporters("editors/SmartSimEditor")).toEqual([]);
    expect(staticImporters("networkTopology/NetworkTopologyWorkspace")).toEqual([]); expect(staticImporters("networkTopology/NetworkTopologyEditor")).toEqual([]);
    expect(staticImporters("trustedSim/SmartSimReviewView")).toEqual([]);
    expect(fs.readFileSync(path.join(repo, "src/questionTypes/studentRegistry.tsx"), "utf8")).toMatch(/registerStudentRenderer\("smartSim", 1, lazy\(\(\) => import\("\.\/student\/SmartSimResponse"\)\)\)/);
    expect(fs.readFileSync(path.join(repo, "src/questionTypes/authoringRegistry.tsx"), "utf8")).toMatch(/registerAuthoringEditor\("smartSim", 1, lazy\(\(\) => import\("\.\/editors\/SmartSimEditor"\)\)\)/);
    const ui = fs.readFileSync(path.join(repo, "src/trustedSim/smartSimUiRegistry.ts"), "utf8");
    expect(ui).not.toMatch(/import\(\s*[^"'\s]/);
    const strip = (t: string) => t.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const dir = path.join(repo, "src/networkTopology");
    for (const f of [...fs.readdirSync(dir).filter(n => /\.(ts|tsx)$/.test(n) && !/\.test\./.test(n)).map(n => path.join(dir, n)), path.join(repo, "src/questionTypes/student/SmartSimResponse.tsx"), path.join(repo, "src/questionTypes/editors/SmartSimEditor.tsx"), path.join(repo, "src/trustedSim/SmartSimReviewView.tsx")]) {
      const s = strip(fs.readFileSync(f, "utf8"));
      expect(s, f).not.toMatch(/<iframe|srcdoc|dangerouslySetInnerHTML|innerHTML|\beval\s*\(|new Function|child_process|fetch\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|window\.open|location\.href|https?:\/\//);
    }
  });
});
