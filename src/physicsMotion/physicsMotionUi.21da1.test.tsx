// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useState } from "react";
import { render, cleanup, act, fireEvent, screen, within } from "@testing-library/react";
import StudentQuestionCard, { type Question } from "../StudentQuestionCard";
import type { Answer } from "../answerState";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";
import { MOTION_PRESETS, motionStarterConfig } from "./motionTemplates";
import { fmtMotion, motionEndTime, motionFrame, type MotionKind } from "../physics/motionCore";
import { validateMotionConfig } from "../physicsMotionModel";
import { resolveSmartSimUi } from "../trustedSim/smartSimUiRegistry";
import { smartSimStarterConfig } from "../trustedSim/smartSimStarters";
import MotionEditor from "./MotionEditor";
import MotionReview from "./MotionReview";

// Phase 21D-A.1 — physicsMotion@1 UI through the REAL student host (StudentQuestionCard → SmartSimResponse → lazy registry → workspace) on
// the server-sanitized question: the four experiments render a scene, synchronized graphs and a live readout; play / pause / resume /
// reset / single-step drive one deterministic clock; saved tasks become semantic actions; teacher-permitted exploration changes the
// presentation only (never an action) and refuses invalid combinations; the teacher editor, preview and review work.
const sanitizeExamForStudent = (sanitizer as unknown as { sanitizeExamForStudent: (e: unknown) => { sections: { questions: Question[] }[] } }).sanitizeExamForStudent;
type Frame = { id: number; cb: FrameRequestCallback };
let frames: Frame[] = [], nextId = 1;
const runFrame = (ts: number) => { const due = frames; frames = []; for (const f of due) f.cb(ts); };
const reduce = (on: boolean) => { window.matchMedia = vi.fn().mockImplementation((q: string) => ({ matches: on && /prefers-reduced-motion:\s*reduce/.test(q), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as never; };
beforeEach(() => {
  frames = []; nextId = 1;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { const id = nextId++; frames.push({ id, cb }); return id; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => { frames = frames.filter(f => f.id !== id); });
  vi.spyOn(console, "error").mockImplementation(() => {});
  reduce(false);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const studentQ = (kind: MotionKind) => {
  const p = MOTION_PRESETS[kind]();
  return sanitizeExamForStudent({ examId: "E", title: "t", schemaVersion: 2, sections: [{ id: "s", title: "S", gradingPolicy: "all", stimuli: {}, questions: [{ examQuestionId: "m1", presentationType: "smartSim", questionTypeVersion: 1, text: "تجربة حركة", marks: 6, smartSim: { schemaVersion: 1, pluginKey: "physicsMotion", pluginVersion: 1, config: p.config }, answer: { scoring: "proportional", checks: p.checks } }] }] }).sections[0].questions[0];
};
const answers: (Answer | undefined)[] = [];
function Harness({ q }: { q: Question }) {
  const [a, setA] = useState<Answer | undefined>();
  return <div dir="rtl"><StudentQuestionCard q={q} index={0} id="m1" answer={a} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onAnswer={next => { answers.push(next); setA(next); }} /></div>;
}
const mount = async (kind: MotionKind) => { answers.length = 0; render(<Harness q={studentQ(kind)} />); return screen.findByTestId("motion-workspace", {}, { timeout: 4000 }); };
const readout = (w: HTMLElement, id: string) => within(w).getByTestId("motion-readout").querySelector('[data-id="' + id + '"] dd')!.textContent!;
const slider = (w: HTMLElement) => within(w).getByRole("slider", { name: /زمن المحاكاة/ }) as HTMLInputElement;
const lastActions = () => { const a = answers[answers.length - 1] as { actions?: unknown[] } | undefined; return a?.actions ?? []; };

describe("21D-A.1 UI — the four simulations in the real student host", () => {
  it.each([
    ["freeFall", ["primary", "velocity", "acceleration"], 2, 1],
    ["projectile", ["primary", "height", "velocity"], 3, 1],
    ["newton2", ["primary", "velocity", "acceleration"], 3, 1],
    ["incline", ["primary", "velocity", "acceleration"], 4, 0]
  ] as const)("%s renders scene, synchronized graphs, live readout and tasks; nothing private reaches the DOM", async (kind, graphs, nMeasure, nPoints) => {
    const w = await mount(kind);
    expect(w.getAttribute("data-experiment")).toBe(kind);
    expect(within(w).getByTestId("motion-scene").getAttribute("data-kind")).toBe(kind);
    for (const g of graphs) expect(within(w).getByTestId("motion-graph-" + g)).toBeTruthy();
    expect(within(w).getAllByTestId("motion-measurement")).toHaveLength(nMeasure);
    expect(within(w).queryAllByTestId("motion-point")).toHaveLength(nPoints);
    expect(readout(w, "t")).toContain("0 s");
    expect(within(w).getByTestId("motion-explore")).toBeTruthy();
    expect(within(w).getByTestId("motion-vector-v")).toBeTruthy();
    expect(document.body.innerHTML).not.toMatch(/tolerance|referenceValue|pointNear|40\.8163/);
  });

  it("play advances ONE clock; pause → resume label; single-step and reset; every readout equals the model at the displayed t (deterministic)", async () => {
    const w = await mount("projectile");
    const m = { kind: "projectile" as const, params: MOTION_PRESETS.projectile().config.params }, end = motionEndTime(m, 10);
    fireEvent.click(within(w).getByTestId("motion-play"));
    await act(async () => { runFrame(1000); });
    await act(async () => { runFrame(1500); });
    await act(async () => { runFrame(1600); });                                   // frame deltas are capped at 0.1 s per frame by the clock
    const t = Number(slider(w).value);
    expect(t).toBeGreaterThan(0);
    fireEvent.click(within(w).getByTestId("motion-pause"));
    expect(within(w).getByTestId("motion-play").textContent).toBe("استئناف");
    expect(within(w).getByTestId("motion-announce").textContent).toContain("إيقاف");
    const f = motionFrame(m, Number(slider(w).value), end);
    expect(readout(w, "x")).toBe(fmtMotion(f.position.x) + " m");
    expect(readout(w, "y")).toBe(fmtMotion(f.position.y) + " m");
    expect(readout(w, "vy")).toBe(fmtMotion(f.velocity.y) + " m/s");
    fireEvent.click(within(w).getByTestId("motion-reset"));
    expect(Number(slider(w).value)).toBe(0);
    expect(within(w).getByTestId("motion-play").textContent).toBe("تشغيل");
    fireEvent.click(within(w).getByTestId("motion-step"));
    expect(Number(slider(w).value)).toBeCloseTo(0.1, 12);
    expect(readout(w, "x")).toBe(fmtMotion(motionFrame(m, 0.1, end).position.x) + " m");
    fireEvent.change(slider(w), { target: { value: String(end) } });
    expect(within(w).getByTestId("motion-readout").getAttribute("data-status")).toBe("landed");
    expect(answers).toHaveLength(0);                                               // presentation never produces an answer
  });

  it("saving / clearing tasks emits SEMANTIC actions only (measurement.set, graphPoint.set with x/y, clear)", async () => {
    const w = await mount("newton2");
    const acc = within(w).getAllByTestId("motion-measurement").find(e => e.getAttribute("data-id") === "acceleration")!;
    fireEvent.change(within(acc).getByRole("textbox"), { target: { value: "3.04" } });
    fireEvent.click(within(acc).getByText("حفظ القياس"));
    expect(lastActions()).toEqual([{ type: "measurement.set", measurementId: "acceleration", value: 3.04 }]);
    const pt = within(w).getByTestId("motion-point");
    const [xIn, yIn] = within(pt).getAllByRole("textbox");
    fireEvent.change(xIn, { target: { value: "2" } }); fireEvent.change(yIn, { target: { value: "6.08" } });
    fireEvent.click(within(pt).getByText("حفظ النقطة"));
    expect(lastActions()).toEqual([{ type: "measurement.set", measurementId: "acceleration", value: 3.04 }, { type: "graphPoint.set", pointId: "pointAt2s", x: 2, y: 6.08 }]);
    fireEvent.change(xIn, { target: { value: "99" } }); fireEvent.click(within(pt).getByText("حفظ النقطة"));
    expect(within(pt).getByRole("alert").textContent).toContain("بين 0");                       // outside [0, maxTime]: refused locally
    fireEvent.click(within(acc).getByText("مسح"));
    expect(lastActions()).toEqual([{ type: "graphPoint.set", pointId: "pointAt2s", x: 2, y: 6.08 }, { type: "measurement.clear", measurementId: "acceleration" }]);
    expect(within(w).getByTestId("motion-graph-point").textContent).toContain("6.08");
  });

  it("exploration: a permitted control changes the experiment shown (never an action), shows the banner, restores; invalid combinations are refused", async () => {
    const w = await mount("projectile");
    const speed = within(w).getAllByTestId("motion-control").find(e => e.getAttribute("data-param") === "initialSpeed")!;
    fireEvent.change(within(speed).getByRole("spinbutton"), { target: { value: "10" } });
    expect(within(w).getByTestId("motion-explore-banner")).toBeTruthy();
    const explored = { kind: "projectile" as const, params: { ...MOTION_PRESETS.projectile().config.params, initialSpeed: 10 } }, end = motionEndTime(explored, 10);
    fireEvent.change(slider(w), { target: { value: String(end) } });
    expect(readout(w, "x")).toBe(fmtMotion(motionFrame(explored, end, end).position.x) + " m");    // R = 10²·sin90°/9.8 = 10.2041 m
    expect(readout(w, "x")).toBe("10.2041 m");
    expect(answers).toHaveLength(0);
    fireEvent.click(within(w).getByText("استعادة قيم التجربة الأصلية"));
    expect(within(w).queryByTestId("motion-explore-banner")).toBeNull();
    fireEvent.change(within(speed).getByRole("spinbutton"), { target: { value: "500" } });       // outside the teacher's limits [5, 40]
    expect(within(w).getByTestId("motion-explore-error").textContent).toContain("بين 5 و40");
    expect(within(w).queryByTestId("motion-explore-banner")).toBeNull();
    cleanup();
    const n = await mount("newton2");
    const muS = within(n).getAllByTestId("motion-control").find(e => e.getAttribute("data-param") === "muStatic")!;
    fireEvent.change(within(muS).getByRole("spinbutton"), { target: { value: "0.1" } });        // μs < μk = 0.2 is not physical
    expect(within(n).getByTestId("motion-explore-error")).toBeTruthy();
    expect(within(n).queryByTestId("motion-explore-banner")).toBeNull();
  });

  it("prefers-reduced-motion: no play control, stepping and the slider keep every value reachable", async () => {
    reduce(true);
    const w = await mount("incline");
    expect(within(w).queryByTestId("motion-play")).toBeNull();
    expect(within(w).getByTestId("motion-reduced-motion")).toBeTruthy();
    fireEvent.click(within(w).getByTestId("motion-step"));
    expect(Number(slider(w).value)).toBeCloseTo(0.1, 12);
  });
});

describe("21D-A.1 UI — teacher editor, preview, review, registry", () => {
  it("the editor shows reference values, switches experiment by preset, toggles a student control, and previews the real workspace", async () => {
    const p = MOTION_PRESETS.projectile(), changes: Record<string, unknown>[] = [];
    function Host() {
      const [s, setS] = useState<{ config: unknown; checks: unknown[]; scoring: unknown }>({ config: p.config, checks: p.checks, scoring: "proportional" });
      return <MotionEditor config={s.config} checks={s.checks} scoring={s.scoring} onChange={n => { changes.push(n); setS(o => ({ ...o, ...n })); }} />;
    }
    render(<Host />);
    const ed = screen.getByTestId("motion-editor");
    expect(within(ed).getByTestId("motion-reference").querySelector('[data-id="range"] dd')!.textContent).toBe("40.8163 m");
    expect(within(ed).getAllByTestId("motion-check-expected")[0].textContent).toContain("40.8163");
    const g = within(ed).getAllByTestId("motion-param").find(e => e.getAttribute("data-param") === "gravity")!;
    fireEvent.click(within(g).getByTestId("motion-allow"));
    const c1 = changes[changes.length - 1].config as { controls: { param: string; min: number; max: number; step: number }[] };
    expect(c1.controls.map(k => k.param)).toEqual(["initialSpeed", "launchAngle", "launchHeight", "gravity"]);
    expect(c1.controls[3]).toEqual({ param: "gravity", min: 0.1, max: 100, step: 0.1 });
    expect(validateMotionConfig(c1).ok).toBe(true);
    fireEvent.change(within(ed).getByTestId("motion-experiment"), { target: { value: "incline" } });
    const last = changes[changes.length - 1];
    expect(last).toEqual({ config: MOTION_PRESETS.incline().config, checks: MOTION_PRESETS.incline().checks, scoring: "proportional" });
    expect(within(ed).getByTestId("motion-reference").querySelector('[data-id="timeToBottom"] dd')!.textContent).toBe("2.49899 s");
    const details = within(ed).getByTestId("motion-preview") as HTMLDetailsElement;
    details.open = true; fireEvent(details, new Event("toggle"));
    expect(await within(ed).findByTestId("motion-workspace", {}, { timeout: 4000 })).toBeTruthy();
  });

  it("the review shows the authored experiment and the server-derived saved values; registry and starter resolve exactly physicsMotion@1", () => {
    const p = MOTION_PRESETS.newton2();
    render(<MotionReview config={p.config} state={{ v: 1, measurements: { acceleration: 3.04 }, points: { pointAt2s: { x: 2, y: 6.08 } } }} details={{}} />);
    const r = screen.getByTestId("motion-review");
    expect(r.textContent).toContain("3.04 m/s²");
    expect(r.textContent).toContain("(t = 2 s, x = 6.08 m)");
    expect(resolveSmartSimUi("physicsMotion", 1)).toBeTruthy();
    expect(resolveSmartSimUi("physicsMotion", 2)).toBeUndefined();
    expect(smartSimStarterConfig("physicsMotion", 1)).toEqual(motionStarterConfig());
    expect(validateMotionConfig(smartSimStarterConfig("physicsMotion", 1)).ok).toBe(true);
  });
});
