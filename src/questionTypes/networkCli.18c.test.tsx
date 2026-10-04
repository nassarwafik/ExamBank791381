// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import StructuredExamBuilder from "../StructuredExamBuilder";
import StudentQuestionCard from "../StudentQuestionCard";
import QuestionBodyEditor from "../QuestionBodyEditor";
import ExamPreview from "../ExamPreview";
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
import { QUESTION_TYPE_CATALOG, questionTypeDefinition, supportsQuestionTypeVersion } from "../questionTypeCatalog";
import { validateQuestionTypeNode } from "../questionTypeValidation";
import { evaluateExamFinalization } from "../examFinalization";
import { parseStructuredExamJson } from "../structuredExamImport";
import { toSafePreviewExam } from "../examPreviewModel";
import { replayCommands } from "../networkCliEngine";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";
import type { Question } from "../studentQuestionTypes";
const sanitizeExamForStudent = (sanitizer as unknown as { sanitizeExamForStudent: (exam: unknown) => { sections: { questions: Question[] }[] } }).sanitizeExamForStudent;

// Phase 18C — the network CLI simulator UI: palette card + catalog identity, the lazy student renderer (LTR terminal inside the
// RTL page, Enter executes without submitting, Up / Down history, read-only state, restore by replay, bounded history, secrecy),
// the teacher authoring editor inside the REAL Builder (structured tables, inline canonical validation, try-out terminal,
// undo / duplicate / clone / JSON import round-trips), preview parity, the teacher review projection, unsupported-version
// fail-closed and the lazy-import guard. New-function tests (fail-first on 86f334b8: the type is unknown to the registries).
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CFG = { device: "switch", initialState: { v: 1, device: "switch", hostname: "LAB-SW", vlans: { "10": { name: "STAFF" } }, interfaces: { "f0/1": { mode: "access", accessVlan: 10 } } } };
const KEY = { targetState: { hostname: "BR1-SW1", vlans: { "20": { name: "SALES-SECRET" } }, interfaces: { "f0/5": { mode: "access", accessVlan: 20 }, "vlan20": { ipAddress: "192.168.20.2", subnetMask: "255.255.255.0" } } }, scoring: "proportional" };
const CANARIES = /BR1-SW1|SALES-SECRET|192\.168\.20\.2|targetState|scoring/;
const teacherQ = (over: Record<string, unknown> = {}) => ({ ...newQuestion("networkCli" as never, { examQuestionId: "n1", text: "اضبط المبدّل حسب المطلوب.", marks: 10 }), networkCli: CFG, answer: KEY, ...over } as unknown as BuilderQuestion);
const baseExam = (questions: BuilderQuestion[]): StructuredExam => ({ examId: "EXAM-18C", title: "امتحان الشبكات", status: "draft", schemaVersion: 2, sections: [{ id: "sec-1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, questions }] });
const studentQ = (over: Record<string, unknown> = {}) => sanitizeExamForStudent(baseExam([teacherQ(over)])).sections[0].questions[0];
const tick = (ms = 10) => act(async () => { await new Promise(r => setTimeout(r, ms)); });

type Hist = ReturnType<typeof useStructuredExamHistory>;
function Host({ initial, onHistory }: { initial: StructuredExam; onHistory: (h: Hist) => void }) {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(initial, "saved"); } }, [hist, initial]);
  useEffect(() => { onHistory(hist); });
  const [saving] = useState(false);
  if (!hist.present) return null;
  return <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => {}} saving={saving} onUndo={hist.undo} onRedo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, saving)} backupStorage={null} onRecover={hist.recover} autosaveDelayMs={5} />;
}
async function mountBuilder(initial: StructuredExam) { let hist!: Hist; render(<Host initial={initial} onHistory={h => { hist = h; }} />); await tick(30); return { hist: () => hist }; }
const firstQ = (h: Hist) => h.present!.sections[0].questions[0] as unknown as { networkCli: typeof CFG; answer: typeof KEY; questionTypeVersion?: number } & Record<string, unknown>;

function StudentHarness({ q, initial, wrap, disabled }: { q: Question; initial?: Answer; wrap?: (n: ReactNode) => ReactNode; disabled?: boolean }) {
  const [a, setA] = useState<Answer | undefined>(initial);
  const card = <StudentQuestionCard q={q} index={0} id="n1" answer={a} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onAnswer={setA} disabled={disabled} />;
  return <>{wrap ? wrap(card) : card}<output data-testid="answer">{JSON.stringify(a ?? null)}</output></>;
}
const answerOut = () => JSON.parse(screen.getByTestId("answer").textContent || "null");
const terminalInput = async () => (await screen.findByRole("textbox", { name: /سطر الأوامر/ }, { timeout: 3000 })) as HTMLInputElement;
const type = (el: HTMLInputElement, line: string) => { fireEvent.change(el, { target: { value: line } }); return fireEvent.keyDown(el, { key: "Enter" }); };
const prompt = () => screen.getByTestId("ncli-prompt").textContent;

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("identity — networkCli@1 is a real production type", () => {
  it("catalog row: interactive, auto-graded, partial credit, interactive, offline, NOT compound; responseKinds ['networkCli']; version 1 only; palette presentation", () => {
    const d = questionTypeDefinition("networkCli")!;
    expect(d).toMatchObject({ key: "networkCli", version: 1, label: "محاكي أوامر الشبكة (CLI)", category: "interactive", gradingMode: "auto", legacy: false });
    expect(d.capabilities).toMatchObject({ autoGrading: true, partialCredit: true, interactive: true, offline: true, compoundPart: false, manualGrading: false, requiresImage: false });
    expect(d.responseKinds).toEqual(["networkCli"]);
    expect(QUESTION_TYPE_CATALOG.length).toBe(18); expect(QUESTION_TYPE_CATALOG.at(-1)!.key).toBe("networkCli");
    expect(supportsQuestionTypeVersion("networkCli", 1)).toBe(true); expect(supportsQuestionTypeVersion("networkCli", 2)).toBe(false);
    expect(typeDescription(d)).toMatch(/VLAN/); expect(typeIcon(d)).toBe(">#"); expect(chipsFor(d)).toEqual(["تصحيح تلقائي", "علامة جزئية", "تفاعلي"]);
    expect(resolveAuthoringEditor("networkCli", 1)).toBeTruthy(); expect(resolveStudentRenderer("networkCli", 1)?.key).toBe("networkCli");
    expect(resolveAuthoringEditor("networkCli", 2)).toBeUndefined(); expect(resolveStudentRenderer("networkCli", 2)).toBeUndefined();
  });
  it("newQuestion seeds the default switch and an EMPTY private target at version 1; finalization blocks until a target check exists", () => {
    const q = newQuestion("networkCli" as never) as unknown as Record<string, unknown>;
    expect(q.questionTypeVersion).toBe(1);
    expect(q.networkCli).toEqual({ device: "switch", initialState: { v: 1, device: "switch", hostname: "Switch", vlans: {}, interfaces: {} } });
    expect(q.answer).toEqual({ targetState: {}, scoring: "proportional" });
    expect(validateQuestionTypeNode(q, "networkCli", 1).map(i => i.code)).toEqual(["NETCLI_TARGET_EMPTY"]);
    expect(validateQuestionTypeNode(teacherQ() as unknown as Record<string, unknown>, "networkCli", 1)).toEqual([]);
    expect(validateQuestionTypeNode(teacherQ() as unknown as Record<string, unknown>, "networkCli", 1, { part: true }).map(i => i.code)).toEqual(["TYPE_NOT_COMPOUND_CAPABLE"]);
    const blocked = evaluateExamFinalization(baseExam([teacherQ({ answer: { targetState: {} } })]) as never);
    expect(blocked.canFinalize).toBe(false); expect(JSON.stringify(blocked.blockers)).toContain("NETCLI_TARGET_EMPTY");
    const fine = evaluateExamFinalization(baseExam([teacherQ()]) as never);
    expect(JSON.stringify(fine.blockers)).not.toMatch(/NETCLI/); expect(fine.structuralErrors).toEqual([]);
  });
});

describe("student terminal — accessible, LTR inside RTL, deterministic", () => {
  it("initial prompt from the question's initial state; Enter executes (never submits a form), the transcript and the canonical Answer follow; hostname changes the prompt immediately", async () => {
    const onSubmit = vi.fn(e => e.preventDefault());
    render(<form onSubmit={onSubmit}><StudentHarness q={studentQ()} /></form>);
    const input = await terminalInput();
    expect(prompt()).toBe("LAB-SW>");
    expect(type(input, "enable")).toBe(false);                                                        // Enter is consumed by the terminal
    expect(prompt()).toBe("LAB-SW#");
    expect(onSubmit).not.toHaveBeenCalled();
    type(input, "configure terminal"); type(input, "hostname BR1-SW1");
    expect(prompt()).toBe("BR1-SW1(config)#");
    const a = answerOut();
    expect(a.kind).toBe("networkCli"); expect(a.commands).toEqual(["enable", "configure terminal", "hostname BR1-SW1"]);
    expect(a.state).toEqual({ v: 1, device: "switch", hostname: "BR1-SW1", vlans: { "10": { name: "STAFF" } }, interfaces: { "f0/1": { mode: "access", accessVlan: 10 } } });
    expect(answered(a)).toBe(true);
    const log = screen.getByTestId("ncli-screen");
    expect(log.getAttribute("role")).toBe("log"); expect(log.getAttribute("aria-live")).toBe("polite");
    expect(within(log).getAllByText("LAB-SW>").length).toBeGreaterThan(0);
    expect(input.value).toBe("");
  });
  it("educational feedback: unknown / wrong-mode / malformed input shows a device-style line and an Arabic hint; the state and the stored history stay deterministic", async () => {
    render(<StudentHarness q={studentQ()} />);
    const input = await terminalInput();
    type(input, "configure terminal");
    const log = screen.getByTestId("ncli-screen");
    expect(log.textContent).toMatch(/% This command is not available in user EXEC mode\./); expect(log.textContent).toMatch(/enable/);
    type(input, "enable"); type(input, "conf t"); type(input, "interface vlan 10"); type(input, "ip address 192.168.10.300 255.255.255.0");
    expect(log.textContent).toMatch(/% Invalid IPv4 address: 192\.168\.10\.300\./);
    type(input, "foo; rm -rf /");
    expect(log.textContent).toMatch(/% Invalid input detected\./);
    const a = answerOut();
    expect(a.commands).toEqual(["configure terminal", "enable", "conf t", "interface vlan 10", "ip address 192.168.10.300 255.255.255.0", "foo; rm -rf /"]);
    expect(a.state.interfaces).toEqual({ "f0/1": { mode: "access", accessVlan: 10 }, vlan10: {} });
    const hints = log.querySelectorAll(".ncli-hint");
    expect(hints.length).toBeGreaterThan(0); for (const h of hints) expect(h.getAttribute("dir")).toBe("rtl");
  });
  it("ArrowUp / ArrowDown recall the command history; a recalled line can be edited and re-run", async () => {
    render(<StudentHarness q={studentQ()} />);
    const input = await terminalInput();
    type(input, "enable"); type(input, "show vlan brief");
    fireEvent.keyDown(input, { key: "ArrowUp" }); expect(input.value).toBe("show vlan brief");
    fireEvent.keyDown(input, { key: "ArrowUp" }); expect(input.value).toBe("enable");
    fireEvent.keyDown(input, { key: "ArrowUp" }); expect(input.value).toBe("enable");                   // clamped at the oldest entry
    fireEvent.keyDown(input, { key: "ArrowDown" }); expect(input.value).toBe("show vlan brief");
    fireEvent.keyDown(input, { key: "ArrowDown" }); expect(input.value).toBe("");                       // past the newest entry → empty draft
    fireEvent.keyDown(input, { key: "ArrowUp" }); fireEvent.change(input, { target: { value: input.value.replace("brief", "") } }); fireEvent.keyDown(input, { key: "Enter" });
    expect(answerOut().commands).toEqual(["enable", "show vlan brief", "show vlan "]);
  });
  it("LTR terminal inside an RTL page: the island, the log, the live prompt and the input are dir=ltr; the stylesheet isolates bidi; Arabic hints are the only RTL text", async () => {
    render(<StudentHarness q={studentQ()} wrap={n => <main dir="rtl"><section dir="rtl">{n}</section></main>} />);
    const input = await terminalInput();
    const island = input.closest(".ncli-terminal")!;
    expect(island.getAttribute("dir")).toBe("ltr"); expect(input.getAttribute("dir")).toBe("ltr"); expect(screen.getByTestId("ncli-screen").getAttribute("dir")).toBe("ltr");
    expect(input.closest("[dir=rtl]")).toBeTruthy();                                                   // the page around it IS RTL
    expect(input.closest("[dir]")!.getAttribute("dir")).toBe("ltr");                                   // but the nearest direction is the island's
    type(input, "enable"); type(input, "configure terminal"); type(input, "interface vlan 10"); type(input, "ip address 192.168.10.2 255.255.255.0"); type(input, "show ip interface brief");
    const log = screen.getByTestId("ncli-screen");
    expect(log.textContent).toContain("192.168.10.2    YES manual up");                                 // source order preserved — nothing reversed
    const css = fs.readFileSync(path.join(repo, "src/networkCli/networkCli.css"), "utf8");
    expect(css).toMatch(/\.ncli-terminal \{[^}]*direction: ltr;[^}]*unicode-bidi: isolate;/);
    expect(css).toMatch(/\.ncli-input \{[^}]*direction: ltr;/);
    expect(css).toMatch(/\.ncli-hint \{[^}]*direction: rtl;/);
    for (const ltr of ["ncli-prompt", "ncli-typed", "ncli-output"]) expect(input.closest(".ncli-terminal")!.querySelector("." + ltr)!.closest("[dir]")!.getAttribute("dir")).toBe("ltr");
    const hint = log.querySelector(".ncli-hint"); if (hint) expect(hint.getAttribute("dir")).toBe("rtl");
  });
  it("disabled / review state: input and button disabled, explicit read-only note, no Answer emitted; the stored transcript stays visible", async () => {
    const initial: Answer = { kind: "networkCli", commands: ["enable", "configure terminal", "hostname DONE"], state: replayCommands(CFG.initialState as never, ["enable", "configure terminal", "hostname DONE"]).session.state };
    render(<StudentHarness q={studentQ()} initial={initial} disabled />);
    const input = await terminalInput();
    expect(input.disabled).toBe(true); expect(screen.getByRole("button", { name: "تنفيذ" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByTestId("ncli-readonly").textContent).toMatch(/للعرض فقط/);
    expect(prompt()).toBe("DONE(config)#"); expect(screen.getByTestId("ncli-screen").textContent).toContain("hostname DONE");
    const before = JSON.stringify(answerOut());
    fireEvent.change(input, { target: { value: "hostname X" } }); fireEvent.keyDown(input, { key: "Enter" });
    expect(JSON.stringify(answerOut())).toBe(before);
    expect(input.closest(".ncli-terminal")!.getAttribute("data-disabled")).toBe("true");
  });
  it("restore / resume: a stored history is replayed from the question's initial state (prompt, mode, transcript, canonical state) — the session is never persisted", async () => {
    const commands = ["enable", "configure terminal", "vlan 20", "name SALES", "exit", "interface fa0/5", "switchport mode access", "switchport access vlan 20"];
    const initial: Answer = { kind: "networkCli", commands, state: replayCommands(CFG.initialState as never, commands).session.state };
    render(<StudentHarness q={studentQ()} initial={initial} />);
    const input = await terminalInput();
    expect(prompt()).toBe("LAB-SW(config-if)#");
    expect(screen.getByTestId("ncli-screen").textContent).toContain("name SALES");
    type(input, "shutdown");
    const a = answerOut();
    expect(a.commands).toEqual([...commands, "shutdown"]);
    expect(a.state.interfaces["f0/5"]).toEqual({ mode: "access", accessVlan: 20, shutdown: true });
  });
  it("bounds: an over-long line is refused with a notice and NOT recorded; a full history locks the input with an explicit message", async () => {
    render(<StudentHarness q={studentQ()} />);
    const input = await terminalInput();
    type(input, "enable");
    await act(async () => { fireEvent.change(input, { target: { value: "x".repeat(150) + " " + "y".repeat(100) } }); });
    expect(input.maxLength).toBe(200);                                                                  // the browser truncates pasted text
    fireEvent.keyDown(input, { key: "Enter" });
    expect(answerOut().commands.length).toBeLessThanOrEqual(2);
    cleanup();
    const commands = Array.from({ length: 300 }, (_, i) => (i === 0 ? "enable" : "show vlan brief"));
    const initial: Answer = { kind: "networkCli", commands, state: CFG.initialState as never };
    render(<StudentHarness q={studentQ()} initial={initial} />);
    const locked = await terminalInput();
    expect(locked.disabled).toBe(true); expect(screen.getByText(/اكتمل الحد الأقصى لعدد الأوامر/)).toBeTruthy();
    expect(screen.getByText(/الأوامر المتبقية: 0/)).toBeTruthy();
  });
});

describe("secrecy — the target state never reaches a student surface", () => {
  it("the sanitized student question carries ONLY the public projection; the rendered DOM and the emitted Answer carry no target value", async () => {
    const q = studentQ() as unknown as Record<string, unknown>;
    expect(q.networkCli).toEqual(CFG); expect(q.answer).toEqual({});
    expect(JSON.stringify(q)).not.toMatch(CANARIES);
    const smuggled = studentQ({ networkCli: { ...CFG, targetState: KEY.targetState, initialState: { ...CFG.initialState, expectedHostname: "BR1-SW1" } } }) as unknown as Record<string, unknown>;
    expect(JSON.stringify(smuggled)).not.toMatch(CANARIES); expect(smuggled.networkCli).toEqual(CFG);
    render(<StudentHarness q={teacherQ() as unknown as Question} />);                                  // even a TEACHER-side node handed to the renderer
    const input = await terminalInput();
    type(input, "enable"); type(input, "show running-config");
    expect(document.body.innerHTML).not.toMatch(CANARIES);
    expect(JSON.stringify(answerOut())).not.toMatch(CANARIES);
  });
  it("the teacher preview model scrubs the key and the renderer in ExamPreview is the SAME component (preview notice, no leak)", async () => {
    const safe = toSafePreviewExam(baseExam([teacherQ()]) as never) as unknown as { sections: { questions: Record<string, unknown>[] }[] };
    expect(JSON.stringify(safe)).not.toMatch(CANARIES); expect(safe.sections[0].questions[0].networkCli).toEqual(CFG);
    render(<ExamPreview exam={baseExam([teacherQ()]) as never} onClose={() => {}} />);
    const input = await terminalInput();
    expect(screen.getByTestId("ncli-preview-note")).toBeTruthy();
    type(input, "enable");
    expect(prompt()).toBe("LAB-SW#");
    expect(document.body.innerHTML).not.toMatch(CANARIES);
  });
});

describe("authoring — inside the real Builder", () => {
  it("adding «محاكي أوامر الشبكة» from the palette creates networkCli@1 with defaults, mounts the lazy editor with the canonical validator's blocker, and the inspector shows the identity", async () => {
    const { hist } = await mountBuilder(baseExam([newQuestion("multipleChoice", { examQuestionId: "q1", text: "س" })]));
    fireEvent.click(screen.getByRole("button", { name: "+ إضافة سؤال" }));
    const d = await screen.findByRole("dialog", { name: "إضافة سؤال" }); await tick(30);
    expect(within(d).getAllByTestId("qt-card").length).toBe(18);
    fireEvent.click(within(d).getByRole("tab", { name: "تفاعلي" })); await tick();
    const card = within(d).getAllByTestId("qt-card").find(c => c.getAttribute("data-type-key") === "networkCli")!;
    expect(card.textContent).toContain("محاكي أوامر الشبكة"); expect(card.textContent).toContain("تصحيح تلقائي"); expect(card.textContent).toContain("علامة جزئية");
    fireEvent.click(card); await tick(50);
    const q = hist().present!.sections[0].questions[1] as unknown as Record<string, unknown>;
    expect(q.presentationType).toBe("networkCli"); expect(q.questionTypeVersion).toBe(1);
    expect(q.networkCli).toEqual({ device: "switch", initialState: { v: 1, device: "switch", hostname: "Switch", vlans: {}, interfaces: {} } });
    const editor = await screen.findByTestId("qt-editor-networkCli", {}, { timeout: 3000 });
    expect(within(editor).getByTestId("ncli-issues").textContent).toMatch(/حدّد عنصرًا واحدًا على الأقل/);
    expect(screen.getAllByTestId("qt-meta").some(m => m.textContent!.includes("محاكي أوامر الشبكة") && m.textContent!.includes("الإصدار 1"))).toBe(true);
  });
  it("structured tables edit the initial state and the private target; the check count and the inline validation follow; the try-out terminal uses the initial state", async () => {
    const { hist } = await mountBuilder(baseExam([teacherQ({ answer: { targetState: {}, scoring: "proportional" } })]));
    const editor = await screen.findByTestId("qt-editor-networkCli", {}, { timeout: 3000 });
    expect(within(editor).getByTestId("ncli-check-count").textContent).toMatch(/: 0 — مفتاح التصحيح غير صالح/);   // RF1: an empty target is an invalid contract
    fireEvent.change(within(editor).getByLabelText("اسم الجهاز المطلوب"), { target: { value: "BR1-SW1" } }); await tick();
    expect(firstQ(hist()).answer).toEqual({ targetState: { hostname: "BR1-SW1" }, scoring: "proportional" });
    expect(within(editor).getByTestId("ncli-check-count").textContent).toMatch(/: 1$/);
    expect(within(editor).getByTestId("ncli-valid")).toBeTruthy();
    fireEvent.change(within(editor).getByLabelText("رقم VLAN جديدة مطلوبة"), { target: { value: "20" } });
    fireEvent.click(within(editor).getAllByRole("button", { name: "+ إضافة VLAN" })[1]); await tick();
    fireEvent.change(within(editor).getByLabelText("اسم VLAN 20"), { target: { value: "SALES" } }); await tick();
    expect(firstQ(hist()).answer.targetState).toEqual({ hostname: "BR1-SW1", vlans: { "20": { name: "SALES" } } });
    expect(within(editor).getByTestId("ncli-check-count").textContent).toMatch(/: 3$/);
    fireEvent.change(within(editor).getByLabelText("إضافة واجهة مطلوبة"), { target: { value: "f0/5" } });
    fireEvent.click(within(editor).getByTestId("ncli-target-add-if")); await tick();
    fireEvent.change(within(editor).getByLabelText("f0/5 — الوضع"), { target: { value: "access" } }); await tick();
    fireEvent.change(within(editor).getByLabelText("f0/5 — Access VLAN"), { target: { value: "20" } }); await tick();
    expect(firstQ(hist()).answer.targetState.interfaces).toEqual({ "f0/5": { mode: "access", accessVlan: 20 } });
    expect(within(editor).getByTestId("ncli-check-count").textContent).toMatch(/: 5$/);
    fireEvent.change(within(editor).getByLabelText("f0/5 — Access VLAN"), { target: { value: "abc" } }); await tick();
    expect(within(editor).getByTestId("ncli-issues").textContent).toMatch(/قيمة غير صالحة/);               // never silently normalized
    fireEvent.change(within(editor).getByLabelText("f0/5 — Access VLAN"), { target: { value: "20" } }); await tick();
    fireEvent.change(within(editor).getByLabelText("طريقة احتساب العلامة"), { target: { value: "allOrNothing" } }); await tick();
    expect(firstQ(hist()).answer.scoring).toBe("allOrNothing");
    // initial state
    fireEvent.change(within(editor).getByLabelText("اسم الجهاز الابتدائي"), { target: { value: "LAB" } }); await tick();
    expect(firstQ(hist()).networkCli.initialState.hostname).toBe("LAB");
    fireEvent.click(within(editor).getByRole("button", { name: "جرّب الحالة الابتدائية في الطرفية" })); await tick(30);
    const tryout = within(editor).getByTestId("ncli-tryout");
    expect(within(tryout).getByTestId("ncli-prompt").textContent).toBe("LAB>");
    const input = within(tryout).getByRole("textbox", { name: /سطر الأوامر/ }) as HTMLInputElement;
    type(input, "enable"); expect(within(tryout).getByTestId("ncli-prompt").textContent).toBe("LAB#");
    expect(firstQ(hist()).networkCli.initialState.hostname).toBe("LAB");                                // trying never writes the node
    expect(typeSpecificContentPresent(firstQ(hist()))).toBe(true);
    expect(typeSpecificContentPresent(newQuestion("networkCli" as never) as unknown as Record<string, unknown>)).toBe(false);
  });
  it("undo / redo, duplicate, move, clone and the JSON import / export round-trip preserve the configuration and the private key byte-for-byte", async () => {
    const q = teacherQ();
    const sections = [...baseExam([q]).sections, newSection({ id: "sec-2" })];
    const dup = duplicateQuestion(sections, "sec-1", "n1")[0].questions;
    expect(dup.length).toBe(2); expect(dup[1].networkCli).toEqual(CFG); expect((dup[1] as unknown as { answer: unknown }).answer).toEqual(KEY); expect(dup[1].questionTypeVersion).toBe(1);
    expect(moveQuestionToSection(sections, "sec-1", "n1", "sec-2")[1].questions[0].networkCli).toEqual(CFG);
    expect(cloneQuestionWithNewIds(q).networkCli).toEqual(CFG);
    const exported = JSON.stringify(baseExam([q]));
    const imported = parseStructuredExamJson(exported, "exam.json");
    expect(imported.canOpen).toBe(true);
    const iq = imported.exam!.sections[0].questions[0] as unknown as Record<string, unknown>;
    expect(iq.presentationType).toBe("networkCli"); expect(iq.questionTypeVersion).toBe(1); expect(iq.networkCli).toEqual(CFG); expect(iq.answer).toEqual(KEY);
    expect(JSON.stringify(evaluateExamFinalization(imported.exam as never).blockers)).not.toMatch(/NETCLI/);
    const { hist } = await mountBuilder(baseExam([q]));
    const editor = await screen.findByTestId("qt-editor-networkCli", {}, { timeout: 3000 });
    fireEvent.change(within(editor).getByLabelText("اسم الجهاز المطلوب"), { target: { value: "OTHER" } }); await tick();
    expect(firstQ(hist()).answer.targetState.hostname).toBe("OTHER");
    await act(async () => { hist().undo(); }); await tick();
    expect(firstQ(hist()).answer).toEqual(KEY);
    await act(async () => { hist().redo(); }); await tick();
    expect(firstQ(hist()).answer.targetState.hostname).toBe("OTHER");
  });
});

describe("teacher review — canonical state, per-check comparison, transcript as text", () => {
  const commands = ["enable", "configure terminal", "hostname BR1-SW1", "vlan 20", "name SALES-SECRET", "exit", "interface fa0/5", "switchport mode access", "switchport access vlan 20", "<img src=x onerror=alert(1)>"];
  const studentAnswer = { kind: "networkCli", commands, state: replayCommands(CFG.initialState as never, commands).session.state };
  const reviewBody = () => ({ ok: true, assignment: { assignmentId: "a1", title: "واجب الشبكات", totalMarks: 10 }, student: { studentId: "s1", studentName: "سارة", studentCode: "S1" }, attempt: { attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 7, totalMarks: 10, percentage: 70, manualReviewMarks: 0, finalized: true, gradingStatus: "final", teacherFeedback: "" }, attempts: [{ attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 7, totalMarks: 10, percentage: 70, manualReviewMarks: 0, finalized: true, gradingStatus: "final" }], questions: [{ questionId: "n1", questionNumber: 1, text: "اضبط المبدّل", marks: 10, type: "networkCli", studentAnswer, expectedAnswer: KEY, autoGrade: { score: 7, manualReview: false }, manualScore: null, teacherComment: "" }] });
  it("renders the state tables, the ✓ / ✗ checks against the private target and the transcript as text (no HTML execution)", async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ status: 200, ok: true, json: async () => reviewBody() } as Response)) as unknown as typeof fetch;
    render(<AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => {}} onSaved={() => {}} />);
    const view = await screen.findByTestId("ncli-answer-view", {}, { timeout: 3000 });
    expect(within(view).getByTestId("ncli-state-view").textContent).toContain("BR1-SW1");
    const checks = within(view).getAllByRole("listitem").filter(li => li.classList.contains("ncli-check"));
    expect(checks.map(c => c.getAttribute("data-ok"))).toEqual(["true", "true", "true", "true", "true", "false", "false"]);   // hostname, vlan 20, name, f0/5 mode, access vlan, SVI ip, SVI mask
    expect(view.querySelector("img")).toBeNull(); expect(view.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(screen.getByTestId("ncli-key-summary").textContent).toContain("hostname BR1-SW1");
    expect(screen.getByLabelText(/علامة المعلم/)).toBeTruthy();
  });
});

describe("RF1 — teacher review never presents an invalid private key as authoritative", () => {
  const commands = ["enable", "configure terminal", "hostname LAB-SW"];
  const studentAnswer = { kind: "networkCli", commands, state: replayCommands(CFG.initialState as never, commands).session.state };
  const body = (expectedAnswer: unknown) => ({ ok: true, assignment: { assignmentId: "a1", title: "واجب", totalMarks: 10 }, student: { studentId: "s1", studentName: "سارة", studentCode: "S1" }, attempt: { attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 0, totalMarks: 10, percentage: 0, manualReviewMarks: 10, finalized: false, gradingStatus: "pendingReview", teacherFeedback: "" }, attempts: [{ attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 0, totalMarks: 10, percentage: 0, manualReviewMarks: 10, finalized: false, gradingStatus: "pendingReview" }], questions: [{ questionId: "n1", questionNumber: 1, text: "اضبط", marks: 10, type: "networkCli", studentAnswer, expectedAnswer, autoGrade: { score: 0, manualReview: true }, manualScore: null, teacherComment: "" }] });
  it("an unknown scoring policy / VLAN 1 target shows an explicit 'grading configuration invalid — manual review' state: no ✓ / ✗ checklist, never summarised as proportional", async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ status: 200, ok: true, json: async () => body({ targetState: { hostname: "LAB-SW" }, scoring: "bonus" }) } as Response)) as unknown as typeof fetch;
    render(<AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => {}} onSaved={() => {}} />);
    const view = await screen.findByTestId("ncli-answer-view", {}, { timeout: 3000 });
    expect(within(view).getByTestId("ncli-key-invalid").textContent).toMatch(/غير صالح/);
    expect(view.querySelectorAll(".ncli-check").length).toBe(0);
    expect(within(view).getByTestId("ncli-state-view").textContent).toContain("LAB-SW");                       // the student's state is still shown
    const summary = screen.getByTestId("ncli-key-summary");
    expect(summary.textContent).toMatch(/غير صالح/); expect(summary.textContent).not.toMatch(/نسبية|كل شيء/);
    cleanup();
    globalThis.fetch = vi.fn(() => Promise.resolve({ status: 200, ok: true, json: async () => body({ targetState: { vlans: { "1": {} } } }) } as Response)) as unknown as typeof fetch;
    render(<AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => {}} onSaved={() => {}} />);
    const view2 = await screen.findByTestId("ncli-answer-view", {}, { timeout: 3000 });
    expect(within(view2).getByTestId("ncli-key-invalid")).toBeTruthy(); expect(view2.querySelectorAll(".ncli-check").length).toBe(0);
  });
});

describe("RF2 — teacher review never presents checks computed from a repaired PUBLIC config", () => {
  const commands = ["enable", "configure terminal", "hostname LAB-SW"];
  const studentAnswer = { kind: "networkCli", commands, state: replayCommands(CFG.initialState as never, commands).session.state };
  const body = (networkCli: unknown) => ({ ok: true, assignment: { assignmentId: "a1", title: "واجب", totalMarks: 10 }, student: { studentId: "s1", studentName: "سارة", studentCode: "S1" }, attempt: { attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 0, totalMarks: 10, percentage: 0, manualReviewMarks: 10, finalized: false, gradingStatus: "pendingReview", teacherFeedback: "" }, attempts: [{ attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 0, totalMarks: 10, percentage: 0, manualReviewMarks: 10, finalized: false, gradingStatus: "pendingReview" }], questions: [{ questionId: "n1", questionNumber: 1, text: "اضبط", marks: 10, type: "networkCli", networkCli, studentAnswer, expectedAnswer: { targetState: { hostname: "LAB-SW" } }, autoGrade: { score: 0, manualReview: true }, manualScore: null, teacherComment: "" }] });
  it("an unknown field in the published config shows the explicit invalid-configuration / manual-review state and no ✓ / ✗ checklist; a valid config shows the checklist", async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ status: 200, ok: true, json: async () => body({ ...CFG, unexpectedField: true }) } as Response)) as unknown as typeof fetch;
    render(<AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => {}} onSaved={() => {}} />);
    const view = await screen.findByTestId("ncli-answer-view", {}, { timeout: 3000 });
    expect(within(view).getByTestId("ncli-key-invalid").textContent).toMatch(/غير صالح/);
    expect(view.querySelectorAll(".ncli-check").length).toBe(0);
    cleanup();
    globalThis.fetch = vi.fn(() => Promise.resolve({ status: 200, ok: true, json: async () => body(CFG) } as Response)) as unknown as typeof fetch;
    render(<AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => {}} onSaved={() => {}} />);
    const view2 = await screen.findByTestId("ncli-answer-view", {}, { timeout: 3000 });
    expect(within(view2).queryByTestId("ncli-key-invalid")).toBeNull(); expect(view2.querySelectorAll(".ncli-check").length).toBe(1);
  });
});

describe("fail closed and lazy", () => {
  it("networkCli@2 is refused everywhere: validator, student card (safe notice), authoring host (unsupported-version state)", async () => {
    expect(validateQuestionTypeNode(teacherQ({ questionTypeVersion: 2 }) as unknown as Record<string, unknown>, "networkCli", 2).map(i => i.code)).toEqual(["UNSUPPORTED_QUESTION_TYPE_VERSION"]);
    expect(studentUnsupported("networkCli", 2)).toBe(true);
    render(<StudentHarness q={studentQ({ questionTypeVersion: 2 })} />);
    await tick(30);
    expect(screen.queryByRole("textbox", { name: /سطر الأوامر/ })).toBeNull();
    expect(document.querySelector(".iex-unsupported, [data-testid=qt-student-unsupported]")).toBeTruthy();
    cleanup();
    render(<QuestionBodyEditor node={teacherQ({ questionTypeVersion: 2 }) as never} type="networkCli" onChange={() => {}} />);
    expect(screen.getByTestId("qt-unsupported").textContent).toMatch(/إصدار غير مدعوم/);
  });
  it("the terminal, the renderer and the editor are reached ONLY through the registries' import() edges; no iframe / innerHTML / eval / external URL in the new modules", () => {
    const srcFiles: string[] = [];
    const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!/node_modules|dist/.test(p)) walk(p); } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) srcFiles.push(p); } };
    walk(path.join(repo, "src"));
    const staticImporters = (name: string) => srcFiles.filter(f => new RegExp("^import[^;]*from\\s*\"[^\"]*" + name + "\"", "m").test(fs.readFileSync(f, "utf8"))).map(f => path.relative(repo, f));
    expect(staticImporters("editors/NetworkCliEditor")).toEqual([]); expect(staticImporters("student/NetworkCliResponse")).toEqual([]);
    expect(staticImporters("networkCli/NetworkCliTerminal").sort()).toEqual(["src/questionTypes/editors/NetworkCliEditor.tsx", "src/questionTypes/student/NetworkCliResponse.tsx"]);
    expect(staticImporters("networkCli/NetworkCliReviewView")).toEqual(["src/AssignmentReview.tsx"]);           // the teacher review lives in the lazy teacher platform chunk
    const strip = (t: string) => t.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const f of ["src/networkCliEngine.ts", "src/networkCliQuestion.ts", "src/networkCli/NetworkCliTerminal.tsx", "src/networkCli/NetworkCliReviewView.tsx", "src/questionTypes/student/NetworkCliResponse.tsx", "src/questionTypes/editors/NetworkCliEditor.tsx"]) {
      const s = strip(fs.readFileSync(path.join(repo, f), "utf8"));
      expect(s, f).not.toMatch(/<iframe|srcdoc|dangerouslySetInnerHTML|innerHTML|\beval\s*\(|new Function|Function\(|child_process|\.spawn\(|execSync|execFile|require\(|fetch\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|window\.open|location\.href|https?:\/\//);
    }
    for (const f of ["src/networkCliEngine.ts", "src/networkCliQuestion.ts"]) expect(strip(fs.readFileSync(path.join(repo, f), "utf8")), f).not.toMatch(/from "react|document\.|window\.|import\(/);
    expect(fs.readFileSync(path.join(repo, "src/questionTypes/studentRegistry.tsx"), "utf8")).toMatch(/registerStudentRenderer\("networkCli", 1, lazy\(\(\) => import\("\.\/student\/NetworkCliResponse"\)\)\)/);
    expect(fs.readFileSync(path.join(repo, "src/questionTypes/authoringRegistry.tsx"), "utf8")).toMatch(/registerAuthoringEditor\("networkCli", 1, lazy\(\(\) => import\("\.\/editors\/NetworkCliEditor"\)\)\)/);
  });
});
