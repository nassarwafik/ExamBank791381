// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useState } from "react";
import { render, cleanup, act, fireEvent, screen, within } from "@testing-library/react";
import StudentQuestionCard, { type Question } from "../StudentQuestionCard";
import type { Answer } from "../answerState";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";
import { rationalCertificationConfig, rationalCertificationChecks } from "./functionStudyTemplates";

// Phase 20E — functionStudy2d@1 dynamic exploration: a PRESENTATION probe / trace over x showing (x, f(x)) from the shared safe engine,
// "undefined" where f is not defined, never a false segment across a discontinuity, and never an academic action. The workspace still
// draws none of the graded features (asymptotes, intercepts, extrema). Fail-first on 78445fd (no probe / trace).
const sanitizeExamForStudent = (sanitizer as unknown as { sanitizeExamForStudent: (e: unknown) => { sections: { questions: Question[] }[] } }).sanitizeExamForStudent;
type Frame = { id: number; cb: FrameRequestCallback };
let frames: Frame[] = [];
let nextId = 1;
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

const q = () => sanitizeExamForStudent({ examId: "E", title: "t", schemaVersion: 2, sections: [{ id: "s", title: "S", gradingPolicy: "all", stimuli: {}, questions: [{ examQuestionId: "t1", presentationType: "smartSim", questionTypeVersion: 1, text: "دراسة دالة", marks: 13,
  smartSim: { schemaVersion: 1, pluginKey: "functionStudy2d", pluginVersion: 1, config: rationalCertificationConfig() }, answer: { scoring: "proportional", checks: rationalCertificationChecks() } }] }] }).sections[0].questions[0];
const answers: Answer[] = [];
function Harness() {
  const [a, setA] = useState<Answer | undefined>(undefined);
  return <StudentQuestionCard q={q()} index={0} id="t1" answer={a} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onAnswer={next => { answers.push(next); setA(next); }} />;
}
const mount = async () => { answers.length = 0; render(<Harness />); return screen.findByTestId("fnstudy-workspace", {}, { timeout: 3000 }); };
const probe = (w: HTMLElement) => within(w).getByRole("slider", { name: /موضع المسبار/ }) as HTMLInputElement;
const readout = (w: HTMLElement) => within(w).getByTestId("fnstudy-probe-readout").textContent!;

describe("20E-N1 probe: (x, f(x)) from the shared safe engine", () => {
  it("a probe slider over the window shows x and f(x); the probe point sits on the curve; nothing is answered", async () => {
    const w = await mount();
    const s = probe(w);
    expect(Number(s.min)).toBe(-6); expect(Number(s.max)).toBe(8);
    fireEvent.change(s, { target: { value: "0" } });
    expect(readout(w)).toMatch(/x\s*=\s*0\b/); expect(readout(w)).toMatch(/f\(x\)\s*=\s*2\b/);           // f(0) = (−4)/(−2) = 2
    expect(within(w).getByTestId("fnstudy-probe-point")).toBeTruthy();
    expect(within(w).getByTestId("fnstudy-probe-line")).toBeTruthy();
    fireEvent.change(s, { target: { value: "3" } });
    expect(readout(w)).toMatch(/f\(x\)\s*=\s*0\.2/);                                                    // f(3) = 2/10 = 0.2
    expect(answers).toEqual([]);
  });
  it("at an excluded x the readout says f is undefined and no probe point is drawn (no fake value)", async () => {
    const w = await mount();
    for (const x of ["1", "-2"]) {
      fireEvent.change(probe(w), { target: { value: x } });
      expect(readout(w)).toMatch(/غير معرّفة/);
      expect(within(w).queryByTestId("fnstudy-probe-point")).toBeNull();
    }
  });
  it("the graded features are still never drawn by the workspace; probing adds no answer state", async () => {
    const w = await mount();
    for (const x of ["-5", "-1", "0.5", "4"]) fireEvent.change(probe(w), { target: { value: x } });
    for (const id of ["fnstudy-vline", "fnstudy-hline", "fnstudy-marker", "fnstudy-exclusion"]) expect(within(w).queryAllByTestId(id).length, id).toBe(0);
    expect(answers).toEqual([]);
  });
});

describe("20E-N2 trace mode (presentation clock) and reduced motion", () => {
  it("trace sweeps the probe from xMin to xMax through ONE frame loop; stop freezes it; no answer", async () => {
    const w = await mount();
    fireEvent.click(within(w).getByRole("button", { name: "تتبّع المنحنى" }));
    expect(frames.length).toBe(1);
    act(() => runFrame(0));
    const x0 = Number(probe(w).value);
    act(() => runFrame(100));
    const x1 = Number(probe(w).value);
    expect(x0).toBeCloseTo(-6, 6);
    expect(x1).toBeGreaterThan(x0);
    fireEvent.click(within(w).getByRole("button", { name: "إيقاف التتبّع" }));
    expect(frames.length).toBe(0);
    act(() => runFrame(5000));
    expect(Number(probe(w).value)).toBe(x1);
    expect(answers).toEqual([]);
  });
  it("reduced motion: no trace animation; the probe slider still gives every value", async () => {
    reduce(true);
    const w = await mount();
    expect(within(w).queryByRole("button", { name: "تتبّع المنحنى" })).toBeNull();
    fireEvent.change(probe(w), { target: { value: "0" } });
    expect(readout(w)).toMatch(/f\(x\)\s*=\s*2\b/);
  });
});

describe("20E-N3 discontinuities (pin): no drawn segment ever crosses x = −2 or x = 1", () => {
  it("every curve polyline stays on one side of each vertical asymptote", async () => {
    const w = await mount();
    const curves = within(w).getAllByTestId("fnstudy-curve");
    expect(curves.length).toBeGreaterThanOrEqual(3);
    const svg = within(w).getByTestId("fnstudy-graph").querySelector("svg")!;
    const W = Number(svg.getAttribute("viewBox")!.split(" ")[2]), PAD = 28;
    const toX = (px: number) => -6 + ((px - PAD) / (W - 2 * PAD)) * 14;
    for (const c of curves) {
      const xs = (c.getAttribute("points") ?? "").trim().split(/\s+/).map(p => toX(Number(p.split(",")[0])));
      for (const pole of [-2, 1]) expect(xs.every(x => x < pole) || xs.every(x => x > pole)).toBe(true);
    }
  });
});
