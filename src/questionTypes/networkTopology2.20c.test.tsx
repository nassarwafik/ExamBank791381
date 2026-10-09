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
import { resolveSmartSimUi } from "../trustedSim/smartSimUiRegistry";
import { net2TemplateById } from "../networkTopology2/net2Templates";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";
import type { Question } from "../studentQuestionTypes";
const sanitizeExamForStudent = (sanitizer as unknown as { sanitizeExamForStudent: (exam: unknown) => { sections: { questions: Question[] }[] } }).sanitizeExamForStudent;

// Phase 20C — the networkTopology@2 UIs (lazy): the immutable student topology with device-oriented surfaces (PC / Laptop Desktop with IP
// Configuration, Command Prompt, Wireless, Network Status and Browser; switch / router CLI; Access Point configuration), restore by replay,
// reset to the teacher's initial state, the authoring editor (6 device kinds, links, curriculum templates, initial-state sandbox on the
// real engines, private checks, preview), the teacher review, exact-version UI resolution and lazy edges. New-function tests
// (fail-first on 686afbc).
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const env = (id: string) => ({ schemaVersion: 1, pluginKey: "networkTopology", pluginVersion: 2, config: net2TemplateById(id)!.config() });
const teacherQ = (id: string) => ({ ...newQuestion("smartSim" as never, { examQuestionId: "t1", text: "مختبر شبكات", marks: 10 }), smartSim: env(id), answer: { scoring: "proportional", checks: net2TemplateById(id)!.checks() } } as unknown as BuilderQuestion);
const baseExam = (questions: BuilderQuestion[]): StructuredExam => ({ examId: "EXAM-20C", title: "امتحان الشبكات", status: "draft", schemaVersion: 2, sections: [{ id: "sec-1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, questions }] });
const studentQ = (id: string) => sanitizeExamForStudent(baseExam([teacherQ(id)])).sections[0].questions[0];
const tick = (ms = 10) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
function StudentHarness({ q, initial, disabled }: { q: Question; initial?: Answer; disabled?: boolean }) {
  const [a, setA] = useState<Answer | undefined>(initial);
  return <div dir="rtl"><StudentQuestionCard q={q} index={0} id="t1" answer={a} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onAnswer={setA} disabled={disabled} /><output data-testid="answer">{JSON.stringify(a ?? null)}</output></div>;
}
const answerOut = () => JSON.parse(screen.getByTestId("answer").textContent || "null") as { actions: Record<string, unknown>[]; state: { devices: Record<string, unknown>; ops: Record<string, Record<string, Record<string, unknown>>> } } | null;
const ws = () => screen.findByTestId("net2-workspace", {}, { timeout: 4000 });
const open = async (w: HTMLElement, label: RegExp) => { fireEvent.click(within(within(w).getByTestId("net2-device-list")).getByRole("button", { name: label })); await tick(); return within(w).findByTestId("net2-device-panel", {}, { timeout: 4000 }); };
const runCli = async (cli: HTMLElement, line: string) => { fireEvent.change(within(cli).getByRole("textbox"), { target: { value: line } }); fireEvent.click(within(cli).getByRole("button", { name: "تنفيذ" })); await tick(); };
type Hist = ReturnType<typeof useStructuredExamHistory>;
function Host({ initial, onHistory }: { initial: StructuredExam; onHistory: (h: Hist) => void }) {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(initial, "saved"); } }, [hist, initial]);
  useEffect(() => { onHistory(hist); });
  if (!hist.present) return null;
  return <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => {}} saving={false} onUndo={hist.undo} onRedo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, false)} backupStorage={null} onRecover={hist.recover} autosaveDelayMs={5} />;
}

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("networkTopology@2 — student workspace (immutable topology, device surfaces)", () => {
  it("the student sees the teacher's topology and a keyboard device list, but no way to add / delete / move / cable anything", async () => {
    render(<StudentHarness q={studentQ("wireless")} />);
    const w = await ws();
    expect(within(w).getByTestId("net2-diagram")).toBeTruthy();
    const list = within(w).getByTestId("net2-device-list");
    for (const name of [/^R1/, /^SW1/, /^AP1/, /^PC1/, /^LAP1/]) expect(within(list).getByRole("button", { name })).toBeTruthy();
    expect(within(w).queryAllByRole("button", { name: /إضافة|حذف|وصلة|نقل|\+ /, hidden: true })).toEqual([]);
    expect(w.querySelectorAll("[draggable='true']").length).toBe(0);
  });
  it("PC Desktop: IP Configuration (static) feeds Command Prompt (ipconfig) and Network Status — one canonical state", async () => {
    render(<StudentHarness q={studentQ("roas")} />);
    const w = await ws();
    const panel = await open(w, /^PC1/);
    const desk = within(panel).getByTestId("net2-desktop");
    for (const app of [/IP Configuration/, /Command Prompt/, /Network Status/]) expect(within(desk).getByRole("button", { name: app })).toBeTruthy();
    expect(within(desk).queryByRole("button", { name: /Wireless/ })).toBeNull();                                // Ethernet-only PC
    fireEvent.click(within(desk).getByRole("button", { name: /IP Configuration/ })); await tick();
    const ipc = within(panel).getByTestId("net2-ipconfig");
    fireEvent.change(within(ipc).getByLabelText("IP Address"), { target: { value: "192.168.10.77" } });
    fireEvent.click(within(ipc).getByRole("button", { name: /حفظ/ })); await tick();
    expect(answerOut()!.actions.at(-1)).toMatchObject({ type: "host.setStatic", deviceId: "pc1", adapter: "eth0", address: "192.168.10.77", mask: "255.255.255.0", gateway: "192.168.10.1" });
    fireEvent.change(within(ipc).getByLabelText("Subnet Mask"), { target: { value: "255.0.255.0" } });
    fireEvent.click(within(ipc).getByRole("button", { name: /حفظ/ })); await tick();
    expect(within(ipc).getByRole("alert")).toBeTruthy();
    expect(answerOut()!.actions.length).toBe(1);
    fireEvent.click(within(desk).getByRole("button", { name: /Command Prompt/ })); await tick();
    const cmd = within(panel).getByTestId("net2-cmd");
    await runCli(cmd, "ipconfig");
    expect(within(cmd).getByTestId("ncli-screen").textContent).toMatch(/192\.168\.10\.77/);
    fireEvent.click(within(desk).getByRole("button", { name: /Network Status/ })); await tick();
    expect(within(panel).getByTestId("net2-netstatus").textContent).toMatch(/192\.168\.10\.77/);
  });
  it("Laptop Desktop: Wireless lists existing SSIDs; a wrong WPA2 passphrase fails, the right one associates and DHCP fills IP Configuration", async () => {
    render(<StudentHarness q={studentQ("capstone")} />);
    const w = await ws();
    const ap = await open(w, /^AP1/);
    const apCfg = within(ap).getByTestId("net2-ap-config");
    fireEvent.change(within(apCfg).getByLabelText(/Security/), { target: { value: "wpa2" } });
    fireEvent.change(within(apCfg).getByLabelText(/Passphrase/), { target: { value: "Exam2026!" } });
    fireEvent.click(within(apCfg).getByRole("button", { name: /حفظ/ })); await tick();
    expect(answerOut()!.actions.filter(a => a.type === "ap.set").map(a => a.field).sort()).toEqual(["passphrase", "security"]);
    const lap = await open(w, /^LAP1/);
    fireEvent.click(within(within(lap).getByTestId("net2-desktop")).getByRole("button", { name: /Wireless/ })); await tick();
    const wl = within(lap).getByTestId("net2-wireless");
    fireEvent.click(within(wl).getByRole("radio", { name: /SCHOOL-WIFI/ }));
    fireEvent.change(within(wl).getByLabelText(/Passphrase/), { target: { value: "wrong-pass" } });
    fireEvent.click(within(wl).getByRole("button", { name: /Connect/ })); await tick();
    expect(within(wl).getByTestId("net2-wifi-status").textContent).toMatch(/فشل|failed/i);
    fireEvent.change(within(wl).getByLabelText(/Passphrase/), { target: { value: "Exam2026!" } });
    fireEvent.click(within(wl).getByRole("button", { name: /Connect/ })); await tick();
    expect(within(wl).getByTestId("net2-wifi-status").textContent).toMatch(/SCHOOL-WIFI/);
    expect(answerOut()!.state.ops.wifi.lap1).toMatchObject({ status: "associated" });
    fireEvent.click(within(within(lap).getByTestId("net2-desktop")).getByRole("button", { name: /IP Configuration/ })); await tick();
    const ipc = within(lap).getByTestId("net2-ipconfig");
    expect((within(ipc).getByRole("radio", { name: /DHCP/ }) as HTMLInputElement).checked).toBe(true);
    expect((within(ipc).getByLabelText("IP Address") as HTMLInputElement).readOnly).toBe(true);
  });
  it("Switch and Router: the CLI surface runs commands through the v2 engines; show output is device output (LTR)", async () => {
    render(<StudentHarness q={studentQ("roas")} />);
    const w = await ws();
    const s = await open(w, /^SW1/);
    const cli = within(s).getByTestId("net2-cli");
    for (const line of ["enable", "configure terminal", "vlan 10", "interface g0/1", "switchport mode trunk", "switchport trunk allowed vlan 10,20", "end", "show interfaces trunk"]) await runCli(cli, line);
    expect(within(cli).getByTestId("ncli-screen").getAttribute("dir")).toBe("ltr");
    expect(within(cli).getByTestId("ncli-screen").textContent).toMatch(/10,20/);
    expect(answerOut()!.actions.filter(a => a.type === "switch.command").length).toBe(8);
  });
  it("restore replays the stored actions (DHCP result, association, CLI history); reset returns to the teacher's initial state; a submitted card is read-only", async () => {
    const stored = { kind: "smartSim", pluginKey: "networkTopology", pluginVersion: 2, state: { forged: true },
      actions: [{ type: "ap.set", deviceId: "ap1", field: "security", value: "wpa2" }, { type: "ap.set", deviceId: "ap1", field: "passphrase", value: "Exam2026!" }, { type: "host.wifiConnect", deviceId: "lap1", ssid: "SCHOOL-WIFI", passphrase: "Exam2026!" }] } as unknown as Answer;
    render(<StudentHarness q={studentQ("wireless")} initial={stored} />);
    const w = await ws();
    const lap = await open(w, /^LAP1/);
    fireEvent.click(within(within(lap).getByTestId("net2-desktop")).getByRole("button", { name: /Network Status/ })); await tick();
    expect(within(lap).getByTestId("net2-netstatus").textContent).toMatch(/192\.168\.1\.1\d/);
    fireEvent.click(within(w).getByRole("button", { name: /إعادة ضبط الإجابة/ })); await tick();
    fireEvent.click(within(w).getByRole("button", { name: /تأكيد/ })); await tick();
    expect(answerOut()!.actions).toEqual([]);
    expect(answerOut()!.state.ops.wifi.lap1).toMatchObject({ status: "disconnected" });
    cleanup();
    render(<StudentHarness q={studentQ("wireless")} initial={stored} disabled />);
    const w2 = await ws();
    const lap2 = await open(w2, /^LAP1/);
    expect(within(lap2).queryAllByRole("button", { name: /حفظ|Connect/ }).length).toBe(0);
    fireEvent.click(within(within(lap2).getByTestId("net2-desktop")).getByRole("button", { name: /Wireless/ })); await tick();   // strengthened after mutation round 1
    expect(within(lap2).getByTestId("net2-wireless")).toBeTruthy();
    expect(within(lap2).queryAllByRole("button", { name: /Connect|Disconnect/ }).length).toBe(0);
  });
});

describe("networkTopology@2 — authoring (teacher is the only topology authority)", () => {
  const addSmartSimV2 = async () => {
    let hist!: Hist;
    render(<Host initial={baseExam([newQuestion("multipleChoice", { examQuestionId: "q1", text: "س" })])} onHistory={h => { hist = h; }} />); await tick(30);
    fireEvent.click(screen.getByRole("button", { name: "+ إضافة سؤال" }));
    const d = await screen.findByRole("dialog", { name: "إضافة سؤال" }); await tick(30);
    expect(within(d).getAllByTestId("qt-card").length).toBe(28);   /* 20D adds composite · 21A.1 adds chartSelection · 21A.2 adds functionGraphSelection */
    fireEvent.click(within(d).getByRole("tab", { name: "تفاعلي" })); await tick();
    fireEvent.click(within(d).getAllByTestId("qt-card").find(c => c.getAttribute("data-type-key") === "smartSim")!); await tick(50);
    const host = await screen.findByTestId("qt-editor-smartSim", {}, { timeout: 3000 });
    const select = within(host).getByTestId("smartsim-plugin-select") as HTMLSelectElement;
    expect([...select.options].map(o => o.value)).toEqual(["networkTopology@1", "physicsFreeFall@1", "functionStudy2d@1", "networkTopology@2"]);
    fireEvent.change(select, { target: { value: "networkTopology@2" } }); await tick(50);
    const ed = await within(host).findByTestId("net2-editor", {}, { timeout: 4000 });
    const q = () => hist.present!.sections[0].questions[1] as unknown as { smartSim: { pluginKey: string; pluginVersion: number; config: { devices: { id: string; kind: string; initial?: Record<string, unknown> }[]; links: unknown[] } }; answer: { checks: unknown[] } };
    return { host, ed, q };
  };
  it("adds every device kind and a cable through structured controls; applies a curriculum template (config + private checks)", async () => {
    const { host, ed, q } = await addSmartSimV2();
    expect(q().smartSim.pluginVersion).toBe(2);
    for (const k of ["+ راوتر", "+ سويتش", "+ حاسوب", "+ لابتوب", "+ نقطة وصول", "+ خادم"]) { fireEvent.click(within(ed).getByRole("button", { name: k })); await tick(); }
    expect(q().smartSim.config.devices.map(d => d.kind).sort()).toEqual(["ap", "laptop", "pc", "router", "server", "switch"].sort());
    const linkForm = within(ed).getByTestId("net2-link-form");
    fireEvent.change(within(linkForm).getByLabelText("الجهاز أ"), { target: { value: q().smartSim.config.devices.find(d => d.kind === "switch")!.id } });
    fireEvent.change(within(linkForm).getByLabelText("منفذ أ"), { target: { value: "f0/1" } });
    fireEvent.change(within(linkForm).getByLabelText("الجهاز ب"), { target: { value: q().smartSim.config.devices.find(d => d.kind === "pc")!.id } });
    fireEvent.change(within(linkForm).getByLabelText("منفذ ب"), { target: { value: "eth0" } });
    fireEvent.click(within(linkForm).getByRole("button", { name: "+ وصلة" })); await tick();
    expect(q().smartSim.config.links.length).toBe(1);
    fireEvent.click(within(ed).getByRole("button", { name: /Router-on-a-Stick/ })); await tick();
    expect(q().smartSim.config).toEqual(net2TemplateById("roas")!.config());
    expect(q().answer.checks).toEqual(net2TemplateById("roas")!.checks());
    expect(within(host).queryByTestId("smartsim-issues")).toBeNull();
    expect(within(ed).getByTestId("net2-preview")).toBeTruthy();
  });
  it("initial-state sandbox: the teacher configures a device with the REAL CLI; committing stores the canonical result as its initial state", async () => {
    const { ed, q } = await addSmartSimV2();
    fireEvent.click(within(ed).getByRole("button", { name: /Router-on-a-Stick/ })); await tick();
    const row = within(ed).getAllByTestId("net2-editor-device").find(r => r.getAttribute("data-id") === "r1")!;
    fireEvent.click(within(row).getByRole("button", { name: /إعداد الحالة الابتدائية/ })); await tick();
    const box = within(ed).getByTestId("net2-sandbox");
    const cli = within(box).getByTestId("net2-cli");
    for (const line of ["enable", "configure terminal", "hostname BRANCH-R1", "interface g0/0", "no shutdown", "end"]) await runCli(cli, line);
    fireEvent.click(within(box).getByRole("button", { name: /اعتماد الحالة الابتدائية/ })); await tick();
    const r1 = q().smartSim.config.devices.find(d => d.id === "r1")!;
    expect(r1.initial).toMatchObject({ hostname: "BRANCH-R1", interfaces: { "g0/0": { shutdown: false } } });
  });
});

describe("networkTopology@2 — teacher review, exact UI resolution, lazy edges", () => {
  it("the review renders server-derived device states, DHCP bindings and per-device histories as text", async () => {
    const body = { ok: true, assignment: { assignmentId: "a1", title: "واجب", totalMarks: 10 }, student: { studentId: "s1", studentName: "سارة", studentCode: "S1" },
      attempt: { attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 5, totalMarks: 10, percentage: 50, manualReviewMarks: 0, finalized: true, gradingStatus: "final", teacherFeedback: "" },
      attempts: [{ attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 5, totalMarks: 10, percentage: 50, manualReviewMarks: 0, finalized: true, gradingStatus: "final" }],
      questions: [{ questionId: "t1", questionNumber: 1, text: "سؤال", marks: 10, type: "smartSim", smartSim: env("dhcp"), studentAnswer: { kind: "smartSim", actions: [], state: {} }, expectedAnswer: {}, autoGrade: { score: 5, manualReview: false }, manualScore: null, teacherComment: "",
        smartSimReview: { valid: true, score: 5, maxMarks: 10, totalWeight: 10, passedWeight: 5, checks: [], transcripts: { r1: [{ input: "show ip dhcp binding", prompt: "Router#", status: "ok", output: ["IP address       Client-ID/"] }] },
          state: { v: 2, devices: { r1: { v: 2, device: "router", hostname: "R1", interfaces: {}, subinterfaces: {}, dhcp: { excluded: [], pools: { LAN: { network: "192.168.1.0", mask: "255.255.255.0" } } }, security: {} } }, ops: { adapters: { "pc1/eth0": { status: "dhcp", address: "192.168.1.11", mask: "255.255.255.0" } }, wifi: {}, dhcpBindings: { r1: [{ address: "192.168.1.11", mac: "0200.1111.2222", client: "pc1/eth0", pool: "LAN" }] }, vtp: {}, portSecurity: {}, arp: {}, macTables: {} } } } }] };
    globalThis.fetch = vi.fn(() => Promise.resolve({ status: 200, ok: true, json: async () => body } as Response)) as unknown as typeof fetch;
    render(<AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => {}} onSaved={() => {}} />);
    const view = await screen.findByTestId("smartsim-review", {}, { timeout: 3000 });
    const r = await within(view).findByTestId("net2-review", {}, { timeout: 4000 });
    expect(r.textContent).toContain("192.168.1.11"); expect(r.textContent).toContain("0200.1111.2222"); expect(r.textContent).toContain("show ip dhcp binding");
  });
  it("the UI registry resolves networkTopology@1 and @2 separately (v1 entry unchanged); @3 / '2' / wrong case are unavailable", () => {
    expect(resolveSmartSimUi("networkTopology", 2)).toBeDefined();
    expect(resolveSmartSimUi("networkTopology", 2)).not.toBe(resolveSmartSimUi("networkTopology", 1));
    for (const [k, v] of [["networkTopology", 3], ["networkTopology", "2"], ["NetworkTopology", 2]] as const) expect(resolveSmartSimUi(k, v as never), String(k) + v).toBeUndefined();
    const ui = fs.readFileSync(path.join(repo, "src/trustedSim/smartSimUiRegistry.ts"), "utf8");
    expect(ui).toContain('import("../networkTopology/NetworkTopologyWorkspace")');
    for (const i of [...ui.matchAll(/import\(([^)]*)\)/g)].map(m => m[1])) expect(i).toMatch(/^"\.\.\/[A-Za-z0-9/]+"$/);
  });
  it("no application module imports a v2 surface statically; the bundle guard knows the v2 signatures with the budget unchanged", () => {
    const files: string[] = [];
    const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) files.push(p); } };
    walk(path.join(repo, "src"));
    for (const name of ["networkTopology2/Net2Workspace", "networkTopology2/Net2Editor", "networkTopology2/Net2Review"])
      expect(files.filter(f => !f.includes("networkTopology2" + path.sep) && new RegExp("^import[^;]*from\\s*\"[^\"]*" + name + "\"", "m").test(fs.readFileSync(f, "utf8"))).map(f => path.relative(repo, f)), name).toEqual([]);
    const guard = fs.readFileSync(path.join(repo, "scripts/check-bundle-budget.mjs"), "utf8");
    for (const s of ["net2-workspace", "net2-editor", "net2-desktop", "net2-ap-config", "net2-review"]) expect(guard).toContain(s);
    expect(guard).toMatch(/INITIAL_JS_GZIP_BUDGET_KB = 125;/);
  });
});
