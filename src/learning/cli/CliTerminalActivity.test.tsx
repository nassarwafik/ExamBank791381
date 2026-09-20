// @vitest-environment happy-dom
// Batch 8 — simulation/cli-terminal/v1: the terminal component inside the activity host — exact identity + lazy
// load, LTR terminal inside an RTL page, typing + Enter, feedback wording, hint ladder, shell reset, goal
// checklist, answer secrecy, inert hostile input, no network.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import LearningActivityHost from "../activities/LearningActivityHost";
import { productionActivityRegistry } from "../activities/engine";
import CliTerminalActivity from "./CliTerminalActivity";
import { cliBlock, trunkTask, trunkChallenge, guidedModes } from "./cliFixtures";
import { CLI_FEEDBACK } from "./exercise";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const mountHost = async (block = cliBlock(trunkTask)) => {
  const r = render(<div dir="rtl"><LearningActivityHost block={block} courseId="791381" /></div>);
  await waitFor(() => { if (!r.container.querySelector(".learning-cli")) throw new Error("not yet"); });
  return r;
};
const input = () => screen.getByRole("textbox") as HTMLInputElement;
const type = (line: string) => { fireEvent.change(input(), { target: { value: line } }); fireEvent.keyDown(input(), { key: "Enter" }); };
const feedbacks = () => [...document.querySelectorAll(".learning-cli-feedback")].map(p => p.textContent);
const lastFeedback = () => feedbacks().at(-1);

describe("registry identity + lazy load", () => {
  it("resolves simulation/cli-terminal/v1 only; other versions/keys fall back", () => {
    expect(productionActivityRegistry.resolve(cliBlock(trunkTask))?.key).toBe("cli-terminal");
    expect(productionActivityRegistry.resolve({ ...cliBlock(trunkTask), version: 2 })).toBeUndefined();
    expect(productionActivityRegistry.resolve({ ...cliBlock(trunkTask), simulationType: "cli" })).toBeUndefined();
  });
  it("renders through the host with the shell's reset + fullscreen controls (renderer-declared capabilities)", async () => {
    await mountHost();
    expect(screen.getByRole("button", { name: /إعادة تعيين/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /توسيع/ })).toBeTruthy();
  });
});

describe("RTL page, LTR terminal", () => {
  it("the terminal box and its input are dir=ltr while the instruction panel inherits the RTL page; feedback lines are dir=rtl", async () => {
    const { container } = await mountHost();
    const term = container.querySelector(".learning-cli-terminal")!;
    expect(term.getAttribute("dir")).toBe("ltr");
    expect(input().getAttribute("dir")).toBe("ltr");
    expect(container.querySelector(".learning-cli-panel")!.getAttribute("dir")).toBeNull();
    expect(container.querySelector("[dir=rtl] .learning-cli")).toBeTruthy();
    type("enable");
    expect(container.querySelector(".learning-cli-feedback")!.getAttribute("dir")).toBe("rtl");
  });
  it("the CSS keeps the terminal LTR, contained (max-width 100%, screen scrolls inside) with a ≥44px input row", () => {
    const css = readFileSync("src/learning/cli/cli.css", "utf8").replace(/\s+/g, "");
    const rule = (sel: string) => { const i = css.indexOf(sel); expect(i, sel).toBeGreaterThanOrEqual(0); return css.slice(i, css.indexOf("}", i)); };
    expect(rule(".learning-cli-terminal{")).toContain("direction:ltr");
    expect(rule(".learning-cli-terminal{")).toContain("max-width:100%");
    expect(rule(".learning-cli-terminal{")).toContain("overflow:hidden");
    expect(rule(".learning-cli-screen{")).toContain("overflow:auto");
    expect(rule(".learning-cli-input{")).toContain("min-height:44px");
    expect(rule(".learning-cli-input{")).toContain("min-width:0");
    expect(rule(".learning-cli-output{")).toContain("overflow-x:auto");
    expect(rule(".learning-cli-feedback{")).toContain("direction:rtl");
    expect(rule(".learning-cli{")).toContain("max-width:100%");
  });
});

describe("interaction", () => {
  it("typing + Enter executes; the prompt follows the mode; feedback strings match the engine's wording", async () => {
    const { container } = await mountHost();
    expect(container.querySelector(".learning-cli-liveprompt")!.textContent).toBe("Switch>");
    type("configure terminal");
    expect(lastFeedback()).toContain("✗ الأمر صحيح لكنك في الوضع غير المناسب");
    type("enable");
    expect(container.querySelector(".learning-cli-liveprompt")!.textContent).toBe("Switch#");
    type("conf t");
    expect(container.querySelector(".learning-cli-liveprompt")!.textContent).toBe("Switch(config)#");
    type("switchport mode trunk");
    expect(lastFeedback()).toBe(CLI_FEEDBACK.interfaceFirst);
    type("interface fa0/1");
    expect(container.querySelector(".learning-cli-liveprompt")!.textContent).toBe("Switch(config-if)#");
    expect(input().value).toBe("");
    expect(container.querySelector(".learning-cli-status")!.textContent).toContain("وضع إعداد الواجهة");
  });
  it("the «تنفيذ» button runs the draft too, and is disabled on an empty draft", async () => {
    await mountHost();
    const btn = screen.getByRole("button", { name: "تنفيذ" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.change(input(), { target: { value: "enable" } });
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(document.querySelector(".learning-cli-liveprompt")!.textContent).toBe("Switch#");
  });
  it("a task shows the goal checklist, marks goals as the state satisfies them and shows the completion banner only at the required final state", async () => {
    const { container } = await mountHost();
    const goals = () => [...container.querySelectorAll(".learning-cli-goal")].map(li => li.getAttribute("data-met"));
    expect(goals()).toEqual(["false", "false"]);
    type("enable"); type("configure terminal"); type("interface f0/1"); type("switchport mode trunk");
    expect(goals()).toEqual(["true", "false"]);
    expect(container.querySelector(".learning-cli-done")).toBeNull();
    type("switchport trunk allowed vlan 10,20");
    expect(container.querySelector(".learning-cli-done")).toBeNull();
    type("switchport trunk allowed vlan 10,20,30");
    expect(goals()).toEqual(["true", "true"]);
    expect(container.querySelector(".learning-cli-done")!.textContent).toBe(CLI_FEEDBACK.taskCompleted);
  });
  it("hints reveal one at a time, the button counts up then disables; a challenge never prints its expected command before it is typed", async () => {
    const { container } = await mountHost(cliBlock(trunkChallenge, "c1"));
    expect(container.textContent).not.toContain("switchport mode trunk");
    expect(container.innerHTML).not.toContain("switchport-mode");
    const hintBtn = () => screen.getByRole("button", { name: /تلميح|لا تلميحات/ }) as HTMLButtonElement;
    expect(hintBtn().textContent).toBe("تلميح 1");
    fireEvent.click(hintBtn());
    expect([...container.querySelectorAll(".learning-cli-hint")].map(li => li.textContent)).toEqual(["فكر في الوضع الذي يجب أن تكون فيه قبل تعديل إعدادات المنفذ."]);
    expect(hintBtn().textContent).toBe("تلميح 2");
    fireEvent.click(hintBtn());
    expect(container.querySelectorAll(".learning-cli-hint")).toHaveLength(2);
    expect(hintBtn().disabled).toBe(true);
    type("switchport mode trunk");
    expect(lastFeedback()).toBe(CLI_FEEDBACK.correct);
    expect(container.querySelector(".learning-cli-done")).toBeTruthy();
  });
  it("guided steps are listed with the current one marked; a challenge hides upcoming questions", async () => {
    const { container } = await mountHost(cliBlock(guidedModes, "g1"));
    const states = () => [...container.querySelectorAll(".learning-cli-step")].map(li => li.getAttribute("data-state"));
    expect(states()).toEqual(["current", "todo", "todo"]);
    type("enable");
    expect(states()).toEqual(["done", "current", "todo"]);
    expect(lastFeedback()).toBe("✓ أحسنت، انتقلت إلى وضع الأوامر المتقدّم");
    cleanup();
    const two = cliBlock({ ...trunkChallenge, steps: [trunkChallenge.steps![0], { id: "c2", instruction: "السؤال الثاني السرّي", expect: { command: "exit" } }] }, "c2");
    const r = await mountHost(two);
    expect(r.container.textContent).not.toContain("السؤال الثاني السرّي");
    type("switchport mode trunk");
    expect(r.container.textContent).toContain("السؤال الثاني السرّي");
  });
  it("shell reset restores the initial state: transcript cleared, prompt back to Switch>, goals unmet", async () => {
    const { container } = await mountHost();
    type("enable"); type("conf t"); type("interface f0/1"); type("switchport mode trunk");
    expect(container.querySelectorAll(".learning-cli-entry")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: /إعادة تعيين/ }));
    expect(container.querySelectorAll(".learning-cli-entry")).toHaveLength(0);
    expect(container.querySelector(".learning-cli-liveprompt")!.textContent).toBe("Switch>");
    expect([...container.querySelectorAll(".learning-cli-goal")].map(li => li.getAttribute("data-met"))).toEqual(["false", "false"]);
    type("enable");
    expect(container.querySelector(".learning-cli-liveprompt")!.textContent).toBe("Switch#");
  });
  it("ArrowUp recalls the previous command into the draft", async () => {
    await mountHost();
    type("enable"); type("conf t");
    fireEvent.keyDown(input(), { key: "ArrowUp" });
    expect(input().value).toBe("conf t");
    fireEvent.keyDown(input(), { key: "ArrowUp" });
    expect(input().value).toBe("enable");
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(input().value).toBe("conf t");
  });
});

describe("isolation", () => {
  it("hostile input is rendered as inert text (no script element, no HTML), never executed, and no network call is made", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => { throw new Error("no network allowed"); });
    const { container } = await mountHost();
    for (const h of ["<script>alert(1)</script>", "<img src=x onerror=alert(1)>", "$(rm -rf /)", "fetch('/api')", "process.exit()"]) type(h);
    expect(container.querySelectorAll("script, img")).toHaveLength(0);
    expect(container.querySelector(".learning-cli-screen")!.textContent).toContain("<script>alert(1)</script>");
    expect(feedbacks().every(f => f === CLI_FEEDBACK.unknown)).toBe(true);
    expect(container.querySelector(".learning-cli-liveprompt")!.textContent).toBe("Switch>");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("a malformed config renders the not-available note instead of a terminal", () => {
    const { container } = render(<CliTerminalActivity block={{ ...cliBlock(trunkTask), config: { kind: "task", device: "toaster" } }} courseId="791381" reducedMotion={false} fullscreen={false} commands={{ reset: 0, replay: 0 }} emit={() => {}} />);
    expect(container.querySelector(".learning-cli-terminal")).toBeNull();
    expect(container.textContent).toContain("غير متوفر حاليًا");
  });
  it("emits only status/completed in interaction events (never the typed text)", () => {
    const emit = vi.fn();
    render(<CliTerminalActivity block={cliBlock(trunkTask)} courseId="791381" reducedMotion={false} fullscreen={false} commands={{ reset: 0, replay: 0 }} emit={emit} />);
    type("enable secret hunter2");   // «enable secret» is a global-config command → wrong mode from user EXEC, never executed
    expect(emit).toHaveBeenCalledWith({ type: "interaction", activityId: "cli-demo", name: "cli-command", detail: { status: "wrong-mode", completed: false } });
    expect(JSON.stringify(emit.mock.calls)).not.toContain("hunter2");
  });
});
