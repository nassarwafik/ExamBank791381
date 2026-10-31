// @vitest-environment happy-dom
// 791381s Phase 8B-2 — the NETWORK LAB in the Reader, on the REAL m19 pilot (served body) and the real simulator workspace:
//   • the served pilot carries the topology and the task only; the lab shows the task, the goals and the workspace;
//   • commands run on the devices through the workspace; «تحقّق من الإعداد» sends ONLY { kind: "network-lab", actions } through
//     the host's `check` seam and shows the server's verdict per goal (✓ / ✕ with words), the hints after a wrong check and the
//     explanation after a right one; a new action clears the verdict; a failed check says «تعذّر التحقق» (never a wrong answer);
//   • without a seam the lab is explore-only; the shell's reset empties the actions;
//   • the page renderer passes the seam only for a SERVED lab inside a study host, and routes it through study.report.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, act } from "@testing-library/react";
import { readFileSync } from "fs";
import { resolve } from "path";
import NetworkLabActivity from "./NetworkLabActivity";
import LearningPageRenderer, { type ReaderPageHeader } from "../reader/LearningPageRenderer";
import type { ActivityCheck, ActivityCheckResult } from "../activities/engine";
import type { ContentModule, SimulationBlock } from "../content/types";
import type { StudyAttemptResponse, StudyHost } from "../study/types";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const served = JSON.parse(readFileSync(resolve(process.cwd(), "api/src/data/learning-content/791381s/791381s-m19.json"), "utf8")) as ContentModule;
const page = served.lessons.flatMap(l => l.pages).find(p => p.id === "791381s-m19-l02-p01")!;
const lab = page.blocks.find(b => b.id === "m19-l02-p01-lab-roas") as SimulationBlock;
const tick = (ms = 10) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const ws = () => screen.findByTestId("net2-workspace", {}, { timeout: 4000 });
const open = async (w: HTMLElement, label: RegExp) => { fireEvent.click(within(within(w).getByTestId("net2-device-list")).getByRole("button", { name: label })); await tick(); return within(w).findByTestId("net2-device-panel", {}, { timeout: 4000 }); };
const runCli = async (cli: HTMLElement, line: string) => { fireEvent.change(within(cli).getByRole("textbox"), { target: { value: line } }); fireEvent.click(within(cli).getByRole("button", { name: "تنفيذ" })); await tick(); };
const props = (check?: ActivityCheck, reset = 0) => ({ block: lab, courseId: "791381s", reducedMotion: true, fullscreen: false, commands: { reset, replay: 0 }, emit: () => {}, check });
const checkBtn = () => screen.getByRole("button", { name: "تحقّق من الإعداد" }) as HTMLButtonElement;

describe("the served m19 pilot", () => {
  it("is a served lab: topology + task only, serverCheck, opted out of Study Strength", () => {
    expect(lab).toMatchObject({ type: "simulation", simulationType: "network-lab", version: 1, serverCheck: true, studyEligible: false });
    expect(Object.keys(lab.config!).sort()).toEqual(["task", "topology"]);
    expect(JSON.stringify(lab)).not.toMatch(/router\.subinterfaceVlan|reachability|"solution"|"checks"|"feedback"/);
  });
});

describe("NetworkLabActivity", () => {
  it("shows the task, the seven goals and the workspace; «تحقّق» waits for a first action", async () => {
    render(<NetworkLabActivity {...props(vi.fn())} />);
    expect(screen.getByText(/السويتش SW1 جاهز/)).toBeTruthy();
    expect(screen.getAllByRole("listitem").filter(li => li.className.includes("learning-lab-goal"))).toHaveLength(7);
    await ws();
    expect(checkBtn().disabled).toBe(true);
  });

  it("sends ONLY the action list; a wrong verdict marks each goal and shows the hints; a new action clears it; a right one shows the explanation", async () => {
    let reply: ActivityCheckResult = { correct: false, parts: { trunk: true, "g0-up": false, "s10-vlan": false, "s10-ip": false, "s20-vlan": false, "s20-ip": false, ping: false }, feedback: { message: "لم تتحقق كل الأهداف بعد.", hints: ["على SW1: interface g0/1 ثم switchport mode trunk."] }, study: false };
    const check = vi.fn<ActivityCheck>(async () => reply);
    const { container } = render(<NetworkLabActivity {...props(check)} />);
    const w = await ws();
    const cli = within(await open(w, /^SW1/)).getByTestId("net2-cli");
    for (const line of ["enable", "configure terminal", "interface g0/1", "switchport mode trunk", "end"]) await runCli(cli, line);
    fireEvent.click(checkBtn());
    await screen.findByText(/تحقّق 1 من 7 أهداف/);
    expect(check).toHaveBeenCalledTimes(1);
    const sent = check.mock.calls[0][0];
    expect(Object.keys(sent).sort()).toEqual(["actions", "kind"]);
    expect(sent.kind).toBe("network-lab");
    expect(sent.actions).toEqual(["enable", "configure terminal", "interface g0/1", "switchport mode trunk", "end"].map(command => ({ type: "switch.command", deviceId: "sw1", command })));
    const goals = [...container.querySelectorAll(".learning-lab-goal")];
    expect(goals[0].className).toContain("is-right");
    expect(goals[0].textContent).toContain("تحقّق");
    expect(goals[1].className).toContain("is-wrong");
    expect(goals[1].textContent).toContain("لم يتحقّق بعد");
    expect(screen.getByText("على SW1: interface g0/1 ثم switchport mode trunk.")).toBeTruthy();
    expect(screen.getByText("مختبر للتدريب: لا يُحسب في نقاط القوة.")).toBeTruthy();
    await runCli(cli, "show vlan brief");                                          // a new action → the verdict is gone
    expect(screen.queryByText(/تحقّق 1 من 7/)).toBeNull();
    expect(container.querySelector(".learning-lab-goal.is-wrong")).toBeNull();
    reply = { correct: true, parts: {}, feedback: { message: "أحسنت!", explanation: "Router on a Stick: منفذ واحد…" } };
    fireEvent.click(checkBtn());
    await screen.findByText(/أحسنت — تحققت كل الأهداف/);
    expect(screen.getByText("Router on a Stick: منفذ واحد…")).toBeTruthy();
    expect(container.querySelectorAll(".learning-lab-goal.is-right")).toHaveLength(7);
  }, 30000);

  it("a failed check (transport or a retryable server error) says «تعذّر التحقق» — never a wrong verdict", async () => {
    render(<NetworkLabActivity {...props(vi.fn(async () => { throw new Error("503"); }))} />);
    const cli = within(await open(await ws(), /^R1/)).getByTestId("net2-cli");
    await runCli(cli, "enable");
    fireEvent.click(checkBtn());
    await screen.findByText(/تعذّر التحقق من الإعداد الآن/);
    expect(document.querySelector(".learning-lab-goal.is-wrong")).toBeNull();
  }, 30000);

  it("without a seam the lab is explore-only (no check button); the shell's reset empties the actions", async () => {
    const { rerender } = render(<NetworkLabActivity {...props(undefined)} />);
    await ws();
    expect(screen.queryByRole("button", { name: "تحقّق من الإعداد" })).toBeNull();
    expect(screen.getByText(/التحقق من الإعداد متاح داخل المنصة/)).toBeTruthy();
    const check = vi.fn(async () => ({ correct: false }));
    rerender(<NetworkLabActivity {...props(check)} />);
    const cli = within(await open(await ws(), /^SW1/)).getByTestId("net2-cli");
    await runCli(cli, "enable");
    expect(checkBtn().disabled).toBe(false);
    rerender(<NetworkLabActivity {...props(check, 1)} />);                          // «إعادة تعيين»
    await ws();
    expect(checkBtn().disabled).toBe(true);
  }, 30000);
});

describe("the page renderer wires the seam to the study host", () => {
  const header: ReaderPageHeader = { courseId: "791381s", pageTitle: page.title, moduleTitle: served.title, lessonTitle: "تدريبات الوحدة", position: { index: 1, total: 1 }, source: page.source };
  const reply = (over: Partial<StudyAttemptResponse>): StudyAttemptResponse => ({ ok: true, actor: "student", correct: false, persisted: false, alreadyCompleted: false, gained: 0, study: false, page: { pageId: page.id, moduleId: "791381s-m19", completed: [], eligible: 0 }, module: { completed: 0, eligible: 0, points: 0, max: 20 }, totalPoints: 0, ...over });

  it("a served lab in a study host: «تحقّق» → study.report(pageId, the lab id, { kind, actions }) and the verdict comes back", async () => {
    const report = vi.fn(async () => reply({ correct: true, parts: { trunk: true }, feedback: { explanation: "شرح الخادم" } }));
    const study = { pageStatus: () => ({ kind: "ready", completed: new Set<string>(), eligible: 0, module: null }), report } as StudyHost;
    render(<LearningPageRenderer header={header} body={{ kind: "ready", page }} study={study} />);
    const cli = within(await open(await ws(), /^SW1/)).getByTestId("net2-cli");
    await runCli(cli, "enable");
    fireEvent.click(checkBtn());
    await screen.findByText("شرح الخادم");
    expect(report).toHaveBeenCalledWith(page.id, "m19-l02-p01-lab-roas", { kind: "network-lab", actions: [{ type: "switch.command", deviceId: "sw1", command: "enable" }] });
  }, 30000);

  it("an AUTHORED lab (not a served body: no serverCheck) never gets a seam, even inside a study host", async () => {
    const report = vi.fn();
    const study = { pageStatus: () => ({ kind: "ready", completed: new Set<string>(), eligible: 0, module: null }), report } as unknown as StudyHost;
    const authored = { ...page, blocks: page.blocks.map(b => (b.id === lab.id ? { ...lab, serverCheck: undefined } : b)) };
    render(<LearningPageRenderer header={header} body={{ kind: "ready", page: authored }} study={study} />);
    await ws();
    expect(screen.queryByRole("button", { name: "تحقّق من الإعداد" })).toBeNull();
    expect(report).not.toHaveBeenCalled();
  }, 30000);

  it("no study host → no seam (explore-only)", async () => {
    render(<LearningPageRenderer header={header} body={{ kind: "ready", page }} />);
    await ws();
    expect(screen.queryByRole("button", { name: "تحقّق من الإعداد" })).toBeNull();
  }, 30000);
});
