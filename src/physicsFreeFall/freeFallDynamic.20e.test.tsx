// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useState } from "react";
import { render, cleanup, act, fireEvent, screen, within } from "@testing-library/react";
import StudentQuestionCard, { type Question } from "../StudentQuestionCard";
import type { Answer } from "../answerState";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";
import { freeFallFrame, freeFallEvents, freeFallSamples } from "./freeFallDynamics";
import { heightAt, velocityAt, impactTime, impactSpeed } from "../physicsFreeFallModel";
import { freeFallClassroomConfig, freeFallClassroomChecks } from "./freeFallTemplates";

// Phase 20E — physicsFreeFall@1 dynamic experience. ONE presentation clock drives the body, the progressive height and velocity graphs,
// their synchronized markers, the readout, the vectors and the events; impact is a physical endpoint (v(t_impact⁻) ≠ 0, playback stops,
// the scrubber ends at impact); an upward throw shows its apex; presentation controls never touch the academic answer.
// Fail-first on 78445fd (freeFallDynamics absent; workspace has no progressive paths / markers / rates / vectors / events).
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

const UPWARD = { v: 1, model: { initialHeight: 30, initialVelocity: 10, gravity: 10 }, view: { maxTime: 5, showVelocityGraph: true }, tasks: { measurements: [{ id: "impactTime", label: "زمن الوصول", unit: "s" }], points: [] } };
const envOf = (config: unknown) => ({ schemaVersion: 1, pluginKey: "physicsFreeFall", pluginVersion: 1, config });
const studentQ = (config: unknown, checks: unknown[]) => sanitizeExamForStudent({ examId: "E", title: "t", schemaVersion: 2, sections: [{ id: "s", title: "S", gradingPolicy: "all", stimuli: {}, questions: [{ examQuestionId: "t1", presentationType: "smartSim", questionTypeVersion: 1, text: "سقوط حر", marks: 12, smartSim: envOf(config), answer: { scoring: "proportional", checks } }] }] }).sections[0].questions[0];
const answers: (Answer | undefined)[] = [];
function Harness({ q, initial }: { q: Question; initial?: Answer }) {
  const [a, setA] = useState<Answer | undefined>(initial);
  return <div dir="rtl"><StudentQuestionCard q={q} index={0} id="t1" answer={a} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onAnswer={next => { answers.push(next); setA(next); }} /></div>;
}
const tick = (ms = 10) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const mount = async (config: unknown = freeFallClassroomConfig(), checks: unknown[] = freeFallClassroomChecks()) => {
  answers.length = 0;
  render(<Harness q={studentQ(config, checks)} />);
  return screen.findByTestId("freefall-workspace", {}, { timeout: 3000 });
};
const slider = (w: HTMLElement) => within(w).getByRole("slider", { name: /زمن المحاكاة/ }) as HTMLInputElement;
const markerOf = (w: HTMLElement, plot: string) => within(within(w).getByTestId(plot)).getByTestId("dyn-marker");
const pathOf = (w: HTMLElement, plot: string) => within(w).getByTestId(plot).querySelector("path[data-series]")!.getAttribute("d")!;
const nodes = (d: string) => (d.match(/[ML]/g) || []).length;

describe("20E-F1 pure presentation adapter (analytic model at simulation time)", () => {
  const drop = { initialHeight: 20, initialVelocity: 0, gravity: 9.8 }, up = UPWARD.model;
  it("frame = modelAt(t): y, v and a from the analytic formulas; t clamped to [0, impact]; impact keeps v(t_impact⁻), never 0", () => {
    for (const t of [0, 0.5, 1, 1.7]) expect(freeFallFrame(drop, t)).toEqual({ t, y: heightAt(drop, t), v: velocityAt(drop, t), a: -9.8, landed: false });
    const ti = impactTime(drop);
    const end = freeFallFrame(drop, ti + 5);
    expect(end.t).toBe(ti); expect(end.y).toBe(0); expect(end.landed).toBe(true);
    expect(end.v).toBeCloseTo(-impactSpeed(drop), 9);
    expect(freeFallFrame(drop, -2)).toMatchObject({ t: 0, y: 20, v: 0, landed: false });
    expect(freeFallFrame(drop, NaN)).toMatchObject({ t: 0, y: 20 });
  });
  it("events: an upward throw has an apex (v = 0) before impact; a drop has only the impact", () => {
    const ev = freeFallEvents(up);
    expect(ev.map(e => e.kind)).toEqual(["apex", "impact"]);
    expect(ev[0]).toMatchObject({ kind: "apex", t: 1, y: 35, v: 0, label: "أعلى نقطة" });
    expect(ev[1].t).toBeCloseTo(impactTime(up), 12); expect(ev[1].y).toBe(0); expect(ev[1].v).toBeCloseTo(-impactSpeed(up), 9);
    expect(freeFallEvents(drop).map(e => e.kind)).toEqual(["impact"]);
    expect(freeFallEvents({ initialHeight: 50, initialVelocity: -3, gravity: 9.8 }).map(e => e.kind)).toEqual(["impact"]);
  });
  it("samples are deterministic, bounded, time-ordered and end exactly at impact", () => {
    const s = freeFallSamples(up, 240);
    expect(s.length).toBe(240); expect(s[0]).toMatchObject({ t: 0, y: 30, v: 10 });
    expect(s.at(-1)!.t).toBeCloseTo(impactTime(up), 12);
    for (let i = 1; i < s.length; i++) expect(s[i].t).toBeGreaterThan(s[i - 1].t);
    expect(freeFallSamples(up, 1e9).length).toBeLessThanOrEqual(2001);
    expect(freeFallSamples(up, -5).length).toBeGreaterThanOrEqual(2);
    expect(freeFallSamples(up, 240)).toEqual(freeFallSamples(up, 240));
  });
});

describe("20E-F2 workspace: one clock drives scene, graphs, markers and readout", () => {
  it("scrubbing synchronously moves the body, both markers and the readout; both progressive paths grow with t", async () => {
    const w = await mount();
    const ti = impactTime({ initialHeight: 20, initialVelocity: 0, gravity: 9.8 });
    expect(Number(slider(w).max)).toBeCloseTo(ti, 2);                          // the scrubber ends at impact
    fireEvent.change(slider(w), { target: { value: "0.5" } });
    const body05 = within(w).getByTestId("freefall-body").getAttribute("cy");
    const h05 = nodes(pathOf(w, "freefall-height-plot")), v05 = nodes(pathOf(w, "freefall-velocity-graph"));
    expect(markerOf(w, "freefall-height-plot").getAttribute("data-x")).toBe("0.5000");
    expect(Number(markerOf(w, "freefall-height-plot").getAttribute("data-y"))).toBeCloseTo(heightAt({ initialHeight: 20, initialVelocity: 0, gravity: 9.8 }, 0.5), 3);
    expect(markerOf(w, "freefall-velocity-graph").getAttribute("data-x")).toBe("0.5000");
    expect(Number(markerOf(w, "freefall-velocity-graph").getAttribute("data-y"))).toBeCloseTo(-4.9, 3);
    fireEvent.change(slider(w), { target: { value: "1.5" } });
    expect(within(w).getByTestId("freefall-body").getAttribute("cy")).not.toBe(body05);
    expect(nodes(pathOf(w, "freefall-height-plot"))).toBeGreaterThan(h05);
    expect(nodes(pathOf(w, "freefall-velocity-graph"))).toBeGreaterThan(v05);
    expect(markerOf(w, "freefall-height-plot").getAttribute("data-x")).toBe("1.5000");
    expect(markerOf(w, "freefall-velocity-graph").getAttribute("data-x")).toBe("1.5000");
    expect(within(w).getByTestId("freefall-readout").textContent).toMatch(/8\.975/);   // y(1.5) = 20 − 11.025 = 8.975 m
    expect(within(w).getByTestId("freefall-readout").textContent).toMatch(/-14\.7|−14\.7/);
    expect(within(w).getByTestId("freefall-readout").textContent).toMatch(/9\.8/);      // a = −9.8 m/s²
  });
  it("play advances by elapsed frame time through ONE loop; pause freezes everything; restart returns to t = 0", async () => {
    const w = await mount();
    fireEvent.click(within(w).getByRole("button", { name: "تشغيل" }));
    expect(frames.length).toBe(1);
    act(() => runFrame(1000)); act(() => runFrame(1500));
    expect(markerOf(w, "freefall-height-plot").getAttribute("data-x")).toBe("0.1000");      // clamp 0.1 s per frame at 1×
    act(() => runFrame(1516));
    expect(Number(markerOf(w, "freefall-height-plot").getAttribute("data-x"))).toBeCloseTo(0.116, 3);
    expect(frames.length).toBe(1);
    expect(within(w).getByTestId("freefall-readout").getAttribute("aria-live")).toBe("off");   // no live-region spam while playing
    fireEvent.click(within(w).getByRole("button", { name: "إيقاف مؤقت" }));
    expect(frames.length).toBe(0);
    expect(within(w).getByTestId("freefall-readout").getAttribute("aria-live")).toBe("polite");
    const frozen = markerOf(w, "freefall-height-plot").getAttribute("data-x");
    act(() => runFrame(9000));
    expect(markerOf(w, "freefall-height-plot").getAttribute("data-x")).toBe(frozen);
    fireEvent.click(within(w).getByRole("button", { name: "إعادة العرض" }));
    expect(markerOf(w, "freefall-height-plot").getAttribute("data-x")).toBe("0.0000");
    expect(answers).toEqual([]);
  });
  it("playback rate 0.25× / 0.5× / 1× / 2× scales simulated time (aria-pressed buttons)", async () => {
    const w = await mount();
    fireEvent.click(within(w).getByRole("button", { name: "0.25×" }));
    expect(within(w).getByRole("button", { name: "0.25×" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(w).getByRole("button", { name: "تشغيل" }));
    act(() => runFrame(0)); act(() => runFrame(80));
    expect(markerOf(w, "freefall-height-plot").getAttribute("data-x")).toBe("0.0200");
    fireEvent.click(within(w).getByRole("button", { name: "2×" }));
    act(() => runFrame(160));
    expect(markerOf(w, "freefall-height-plot").getAttribute("data-x")).toBe("0.1800");
    for (const r of ["0.5×", "1×"]) expect(within(w).getByRole("button", { name: r })).toBeTruthy();
  });
  it("impact: playback stops AT impact; the readout keeps the physical impact velocity and states the landing; an impact event is marked", async () => {
    const w = await mount();
    fireEvent.click(within(w).getByRole("button", { name: "تشغيل" }));
    for (let i = 0; i < 40; i++) act(() => runFrame(i * 100));
    expect(frames.length).toBe(0);
    const ti = impactTime({ initialHeight: 20, initialVelocity: 0, gravity: 9.8 });
    expect(Number(markerOf(w, "freefall-height-plot").getAttribute("data-x"))).toBeCloseTo(ti, 3);
    expect(markerOf(w, "freefall-height-plot").getAttribute("data-y")).toBe("0.0000");
    expect(within(w).getByTestId("freefall-readout").textContent).toMatch(/-19\.79|−19\.79|-19\.8|−19\.8/);
    expect(within(w).getByTestId("freefall-readout").textContent).toMatch(/الأرض/);
    expect(within(w).getByTestId("freefall-height-plot").querySelector("g.xp-dyn-event[data-kind=impact]")).toBeTruthy();
    expect(within(w).getByTestId("freefall-announce").textContent).toMatch(/الأرض|الارتطام/);
  });
  it("upward throw: the body rises then falls, the velocity marker crosses v = 0 at the apex event", async () => {
    const w = await mount(UPWARD, [{ id: "c1", label: "زمن", weight: 1, kind: "physics.impactTime", measurementId: "impactTime", tolerance: 0.05 }]);
    const cyAt = (t: string) => { fireEvent.change(slider(w), { target: { value: t } }); return Number(within(w).getByTestId("freefall-body").getAttribute("cy")); };
    const c0 = cyAt("0"), c1 = cyAt("1"), c2 = cyAt("2.5");
    expect(c1).toBeLessThan(c0);            // SVG y grows downward: higher body ⇒ smaller cy
    expect(c2).toBeGreaterThan(c1);
    fireEvent.change(slider(w), { target: { value: "0.5" } });
    expect(Number(markerOf(w, "freefall-velocity-graph").getAttribute("data-y"))).toBeGreaterThan(0);
    fireEvent.change(slider(w), { target: { value: "1.5" } });
    expect(Number(markerOf(w, "freefall-velocity-graph").getAttribute("data-y"))).toBeLessThan(0);
    const apex = within(w).getByTestId("freefall-velocity-graph").querySelector("g.xp-dyn-event[data-kind=apex]")!;
    expect(apex.querySelector("title")!.textContent).toBe("أعلى نقطة");
    expect(within(w).getByTestId("freefall-velocity-graph").querySelector("line.xp-dyn-zero")).toBeTruthy();
  });
  it("velocity / acceleration vectors are presentation toggles with the correct direction", async () => {
    const w = await mount(UPWARD, [{ id: "c1", label: "زمن", weight: 1, kind: "physics.impactTime", measurementId: "impactTime", tolerance: 0.05 }]);
    expect(within(w).queryByTestId("freefall-vector-v")).toBeNull();
    fireEvent.click(within(w).getByRole("button", { name: /متجه السرعة/ }));
    fireEvent.click(within(w).getByRole("button", { name: /متجه التسارع/ }));
    expect(within(w).getByRole("button", { name: /متجه السرعة/ }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.change(slider(w), { target: { value: "0.5" } });
    expect(within(w).getByTestId("freefall-vector-v").getAttribute("data-direction")).toBe("up");
    fireEvent.change(slider(w), { target: { value: "2" } });
    expect(within(w).getByTestId("freefall-vector-v").getAttribute("data-direction")).toBe("down");
    expect(within(w).getByTestId("freefall-vector-a").getAttribute("data-direction")).toBe("down");
    expect(answers).toEqual([]);
  });
});

describe("20E-F3 presentation controls never touch the academic answer; academic actions still do", () => {
  it("play, pause, seek, step, restart, rate, vectors ⇒ zero answer updates; a measurement save ⇒ exactly one semantic action", async () => {
    const w = await mount();
    fireEvent.click(within(w).getByRole("button", { name: "تشغيل" }));
    act(() => runFrame(0)); act(() => runFrame(50));
    fireEvent.click(within(w).getByRole("button", { name: "إيقاف مؤقت" }));
    fireEvent.change(slider(w), { target: { value: "1.2" } });
    fireEvent.click(within(w).getByRole("button", { name: /خطوة للأمام/ }));
    fireEvent.click(within(w).getByRole("button", { name: /خطوة للخلف/ }));
    for (const r of ["0.25×", "0.5×", "1×", "2×"]) fireEvent.click(within(w).getByRole("button", { name: r }));
    fireEvent.click(within(w).getByRole("button", { name: /متجه السرعة/ }));
    fireEvent.click(within(w).getByRole("button", { name: /متجه التسارع/ }));
    fireEvent.click(within(w).getByRole("button", { name: "إعادة العرض" }));
    await tick(30);
    expect(answers).toEqual([]);
    const m = within(w).getAllByTestId("freefall-measurement").find(f => f.getAttribute("data-id") === "impactTime")!;
    fireEvent.change(within(m).getByRole("textbox"), { target: { value: "2.02" } });
    fireEvent.click(within(m).getByRole("button", { name: /حفظ/ })); await tick();
    expect(answers.length).toBe(1);
    expect((answers[0] as unknown as { actions: unknown[] }).actions).toEqual([{ type: "measurement.set", measurementId: "impactTime", value: 2.02 }]);
  });
  it("the event live region announces meaningful changes only (pause / restart / apex / impact), never every scrub step", async () => {
    const w = await mount();
    const live = within(w).getByTestId("freefall-announce");
    expect(live.getAttribute("role")).toBe("status");
    fireEvent.click(within(w).getByRole("button", { name: "تشغيل" }));
    act(() => runFrame(0)); act(() => runFrame(50));
    fireEvent.click(within(w).getByRole("button", { name: "إيقاف مؤقت" }));
    const afterPause = live.textContent;
    expect(afterPause).toMatch(/إيقاف|متوقفة/);
    for (const t of ["0.3", "0.6", "0.9", "1.2"]) fireEvent.change(slider(w), { target: { value: t } });
    expect(live.textContent).toBe(afterPause);
  });
  it("unmount during playback cancels the frame loop", async () => {
    const w = await mount();
    fireEvent.click(within(w).getByRole("button", { name: "تشغيل" }));
    expect(frames.length).toBe(1);
    cleanup();
    expect(frames.length).toBe(0);
    expect(cancelled.length).toBeGreaterThanOrEqual(1);
    void w;
  });
});

describe("20E-F4 reduced motion", () => {
  it("no play control and no autoplay; manual stepping and the slider keep every value available", async () => {
    reduce(true);
    const w = await mount();
    expect(within(w).queryByRole("button", { name: "تشغيل" })).toBeNull();
    expect(frames.length).toBe(0);
    fireEvent.click(within(w).getByRole("button", { name: /خطوة للأمام/ }));
    expect(markerOf(w, "freefall-height-plot").getAttribute("data-x")).toBe("0.1000");
    fireEvent.change(slider(w), { target: { value: "2" } });
    expect(within(w).getByTestId("freefall-readout").textContent).toMatch(/0\.4/);
    expect(frames.length).toBe(0);
    expect(answers).toEqual([]);
  });
});
