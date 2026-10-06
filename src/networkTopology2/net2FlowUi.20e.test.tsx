// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useState } from "react";
import { render, cleanup, act, fireEvent, screen, within } from "@testing-library/react";
import StudentQuestionCard, { type Question } from "../StudentQuestionCard";
import type { Answer } from "../answerState";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";
import { net2TemplateById } from "./net2Templates";

// Phase 20E — networkTopology@2 transient flow overlay in the student workspace: a ping / tracert draws the ENGINE's path on the diagram
// (success along the full path, failure up to the last reached device), animated by the presentation clock (static under reduced motion),
// announced once, never stored in the answer, never restored, cleared on unmount. Fail-first on 78445fd (no overlay).
const sanitizeExamForStudent = (sanitizer as unknown as { sanitizeExamForStudent: (e: unknown) => { sections: { questions: Question[] }[] } }).sanitizeExamForStudent;
type Frame = { id: number; cb: FrameRequestCallback };
let frames: Frame[] = [], nextId = 1, cancelled: number[] = [];
const runFrame = (ts: number) => { const due = frames; frames = []; for (const f of due) f.cb(ts); };
const reduce = (on: boolean) => { window.matchMedia = vi.fn().mockImplementation((q: string) => ({ matches: on && /prefers-reduced-motion:\s*reduce/.test(q), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as never; };
beforeEach(() => {
  frames = []; nextId = 1; cancelled = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { const id = nextId++; frames.push({ id, cb }); return id; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => { cancelled.push(id); frames = frames.filter(f => f.id !== id); });
  vi.spyOn(console, "error").mockImplementation(() => {});
  reduce(false);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const q = () => sanitizeExamForStudent({ examId: "E", title: "t", schemaVersion: 2, sections: [{ id: "s", title: "S", gradingPolicy: "all", stimuli: {}, questions: [{ examQuestionId: "t1", presentationType: "smartSim", questionTypeVersion: 1, text: "شبكات", marks: 10,
  smartSim: { schemaVersion: 1, pluginKey: "networkTopology", pluginVersion: 2, config: net2TemplateById("roas")!.config() }, answer: { scoring: "proportional", checks: net2TemplateById("roas")!.checks() } }] }] }).sections[0].questions[0];
const answers: Answer[] = [];
function Harness({ initial }: { initial?: Answer }) {
  const [a, setA] = useState<Answer | undefined>(initial);
  return <StudentQuestionCard q={q()} index={0} id="t1" answer={a} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onAnswer={next => { answers.push(next); setA(next); }} />;
}
const tick = (ms = 10) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
async function cmdOf(initial?: Answer) {
  answers.length = 0;
  render(<Harness initial={initial} />);
  const w = await screen.findByTestId("net2-workspace", {}, { timeout: 4000 });
  fireEvent.click(within(within(w).getByTestId("net2-device-list")).getByRole("button", { name: /^PC1/ })); await tick();
  const panel = await within(w).findByTestId("net2-device-panel", {}, { timeout: 4000 });
  fireEvent.click(within(within(panel).getByTestId("net2-desktop")).getByRole("button", { name: /Command Prompt/ })); await tick();
  return { w, cmd: within(panel).getByTestId("net2-cmd") };
}
const run = async (cmd: HTMLElement, line: string) => { fireEvent.change(within(cmd).getByRole("textbox"), { target: { value: line } }); fireEvent.click(within(cmd).getByRole("button", { name: "تنفيذ" })); await tick(); };

describe("20E-W2 transient flow overlay", () => {
  it("a successful ping draws the engine path (PC1 → SW1 → PC2) with data-ok=true and animates ONE moving dot", async () => {
    const { w, cmd } = await cmdOf();
    await run(cmd, "ping 192.168.10.12");
    const flow = within(w).getByTestId("net2-flow");
    expect(flow.getAttribute("data-ok")).toBe("true");
    expect(flow.getAttribute("data-hops")).toBe("pc1 sw1 pc2");
    expect(frames.length).toBe(1);
    act(() => runFrame(0));
    const p0 = within(flow).getByTestId("net2-flow-dot").getAttribute("cx");
    act(() => runFrame(100));
    expect(within(w).getByTestId("net2-flow-dot").getAttribute("cx")).not.toBe(p0);
    expect(within(w).getByTestId("net2-flow-status").textContent).toMatch(/نجح|وصل/);
  });
  it("a failed ping is never shown as success (data-ok=false), with a failure marker at the last reached device", async () => {
    const { w, cmd } = await cmdOf();
    await run(cmd, "ping 192.168.20.11");
    const flow = within(w).getByTestId("net2-flow");
    expect(flow.getAttribute("data-ok")).toBe("false");
    expect(flow.getAttribute("data-hops")!.split(" ")[0]).toBe("pc1");
    expect(within(flow).getByTestId("net2-flow-fail")).toBeTruthy();
    expect(within(w).getByTestId("net2-flow-status").textContent).toMatch(/فشل|لم يصل/);
  });
  it("the overlay never enters the answer; the answer holds only the semantic host.command", async () => {
    const { cmd } = await cmdOf();
    await run(cmd, "ping 192.168.10.12");
    expect(answers.length).toBe(1);
    const a = answers[0] as unknown as { actions: unknown[]; state: unknown };
    expect(a.actions).toEqual([{ type: "host.command", deviceId: "pc1", command: "ping 192.168.10.12" }]);
    expect(JSON.stringify(a)).not.toMatch(/flow|hops|dot/i);
    for (let i = 0; i < 20; i++) act(() => runFrame(i * 100));
    expect(answers.length).toBe(1);
  });
  it("restoring a stored answer containing a ping does not restore any flow; unmount cancels a running flow animation", async () => {
    const stored = { kind: "smartSim", pluginKey: "networkTopology", pluginVersion: 2, actions: [{ type: "host.command", deviceId: "pc1", command: "ping 192.168.10.12" }], state: {} } as unknown as Answer;
    const { w, cmd } = await cmdOf(stored);
    expect(within(w).queryByTestId("net2-flow")).toBeNull();
    await run(cmd, "ping 192.168.10.12");
    expect(frames.length).toBe(1);
    cleanup();
    expect(frames.length).toBe(0);
    expect(cancelled.length).toBeGreaterThanOrEqual(1);
  });
  it("non-flow commands draw nothing; reduced motion shows the static path without a frame loop", async () => {
    const { w, cmd } = await cmdOf();
    await run(cmd, "ipconfig");
    expect(within(w).queryByTestId("net2-flow")).toBeNull();
    cleanup(); reduce(true);
    const b = await cmdOf();
    await run(b.cmd, "ping 192.168.10.12");
    expect(within(b.w).getByTestId("net2-flow").getAttribute("data-ok")).toBe("true");
    expect(frames.length).toBe(0);
  });
});
