// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useState } from "react";
import { render, cleanup, act, fireEvent, screen, within } from "@testing-library/react";
import StudentQuestionCard, { type Question } from "../StudentQuestionCard";
import type { Answer } from "../answerState";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";
import { LAB_PRESETS, labStarterConfig } from "./labTemplates";
import { LAB_KINDS, fmtLab, labEndTime, labFrame, labQuantities, type LabKind } from "../physics/labCore";
import { validateLabConfig } from "../physicsLabModel";
import { resolveSmartSimUi } from "../trustedSim/smartSimUiRegistry";
import { smartSimStarterConfig } from "../trustedSim/smartSimStarters";
import { labReadout } from "./labView";
import LabEditor from "./LabEditor";
import LabReview from "./LabReview";

// Phase 21D-A.2 — physicsLab@1 UI through the REAL student host (StudentQuestionCard → SmartSimResponse → lazy registry → workspace) on the
// server-sanitized question: the four experiments render scene, synchronized graphs, energy bars / meters and a live readout; one
// deterministic clock; saved tasks become semantic actions; teacher-permitted exploration (sliders, a topology select, dragging the
// pendulum by keyboard, choosing which resistor a meter reads) never produces an action; energy is never claimed conserved when it is not;
// nothing graded is printed before the experiment runs; the editor, preview and review work.
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

const studentQ = (kind: LabKind) => {
  const p = LAB_PRESETS[kind]();
  return sanitizeExamForStudent({ examId: "E", title: "t", schemaVersion: 2, sections: [{ id: "s", title: "S", gradingPolicy: "all", stimuli: {}, questions: [{ examQuestionId: "l1", presentationType: "smartSim", questionTypeVersion: 1, text: "تجربة مختبر", marks: 6, smartSim: { schemaVersion: 1, pluginKey: "physicsLab", pluginVersion: 1, config: p.config }, answer: { scoring: "proportional", checks: p.checks } }] }] }).sections[0].questions[0];
};
const answers: (Answer | undefined)[] = [];
function Harness({ q }: { q: Question }) {
  const [a, setA] = useState<Answer | undefined>();
  return <div dir="rtl"><StudentQuestionCard q={q} index={0} id="l1" answer={a} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onAnswer={next => { answers.push(next); setA(next); }} /></div>;
}
const mount = async (kind: LabKind) => { answers.length = 0; render(<Harness q={studentQ(kind)} />); return screen.findByTestId("lab-workspace", {}, { timeout: 4000 }); };
const readout = (w: HTMLElement, id: string) => within(w).getByTestId("lab-readout").querySelector('[data-id="' + id + '"] dd')!.textContent!;
const slider = (w: HTMLElement) => within(w).getByRole("slider", { name: /زمن المحاكاة/ }) as HTMLInputElement;
const lastActions = () => { const a = answers[answers.length - 1] as { actions?: unknown[] } | undefined; return a?.actions ?? []; };

describe("21D-A.2 UI — the four simulations in the real student host", () => {
  it.each([
    ["pendulum", ["primary", "angularVelocity", "energy"], 3, 0],
    ["spring", ["primary", "force", "velocity", "energy"], 3, 1],
    ["energy", ["primary", "height", "velocity"], 3, 0],
    ["circuit", ["primary", "power"], 4, 1]
  ] as const)("%s renders scene, synchronized graphs, readout and tasks; nothing private reaches the DOM", async (kind, graphs, nMeasure, nPoints) => {
    const w = await mount(kind);
    expect(w.getAttribute("data-experiment")).toBe(kind);
    expect(within(w).getByTestId("lab-scene").getAttribute("data-kind")).toBe(kind);
    for (const g of graphs) expect(within(w).getByTestId("lab-graph-" + g)).toBeTruthy();
    expect(within(w).getAllByTestId("lab-measurement")).toHaveLength(nMeasure);
    expect(within(w).queryAllByTestId("lab-point")).toHaveLength(nPoints);
    expect(within(w).getByTestId("lab-explore")).toBeTruthy();
    if (kind === "circuit") { expect(within(w).getByTestId("lab-circuit")).toBeTruthy(); expect(within(w).getByTestId("lab-ammeter").textContent).toContain("3 A"); }
    else expect(within(w).getByTestId("lab-energy-bars")).toBeTruthy();
    expect(document.body.innerHTML).not.toMatch(/tolerance|referenceValue|pointNear|"weight"/);
  });

  it("before running, the graphs and the scene print no graded value other than the live instrument reading at t = 0", async () => {
    for (const kind of LAB_KINDS) {
      const { config, checks } = LAB_PRESETS[kind](), m = { kind, params: config.params }, end = labEndTime(m, config.view.maxTime), q = labQuantities(m, config.view.maxTime);
      const instrument = labReadout(m, labFrame(m, 0, end)).map(r => Math.abs(Number(r.value)));
      const graded = (checks as Record<string, unknown>[]).flatMap(c => c.kind === "lab.referenceValue" ? [{ label: String(c.quantity), value: q[c.quantity as string] as number, tol: c.tolerance as number }]
        : c.kind === "pointNear@1" ? [{ label: c.id + ".x", value: (c.expected as { x: number }).x, tol: c.tolerance as number }, { label: c.id + ".y", value: (c.expected as { y: number }).y, tol: c.tolerance as number }] : []);
      const leakable = graded.filter(g => Math.abs(g.value) >= 0.1 && !instrument.some(v => Math.abs(v - Math.abs(g.value)) <= g.tol));
      const w = await mount(kind);
      const text = [...w.querySelectorAll("[data-testid^=lab-graph-], [data-testid=lab-scene]")].map(e => e.textContent + " " + [...e.querySelectorAll("*")].map(x => x.getAttribute("aria-label") ?? "").join(" ")).join(" ");
      const nums = (text.match(/\d+(?:\.\d+)?/g) ?? []).filter(t => t.replace(".", "").replace(/^0+/, "").length >= 3).map(Number);
      expect(leakable.filter(g => nums.some(v => Math.abs(v - Math.abs(g.value)) <= g.tol)).map(g => kind + ":" + g.label)).toEqual([]);
      cleanup();
    }
  });

  it("one deterministic clock: play / pause → resume / reset / step; the readout equals the core at the displayed t; no action is produced", async () => {
    const w = await mount("pendulum"), p = LAB_PRESETS.pendulum().config, m = { kind: "pendulum" as const, params: p.params }, end = labEndTime(m, 10);
    fireEvent.click(within(w).getByTestId("lab-play"));
    await act(async () => { runFrame(1000); }); await act(async () => { runFrame(1100); }); await act(async () => { runFrame(1200); });
    fireEvent.click(within(w).getByTestId("lab-pause"));
    expect(within(w).getByTestId("lab-play").textContent).toBe("استئناف");
    const t = Number(slider(w).value), f = labFrame(m, t, end);
    expect(t).toBeGreaterThan(0);
    expect(readout(w, "theta")).toBe(fmtLab(f.q) + " °"); expect(readout(w, "omega")).toBe(fmtLab(f.rate) + " rad/s");
    fireEvent.click(within(w).getByTestId("lab-reset")); expect(Number(slider(w).value)).toBe(0);
    fireEvent.click(within(w).getByTestId("lab-step")); expect(Number(slider(w).value)).toBeCloseTo(0.1, 12);
    expect(readout(w, "theta")).toBe(fmtLab(labFrame(m, 0.1, end).q) + " °");
    expect(answers).toHaveLength(0);
  });

  it("tasks emit SEMANTIC actions only (spring measurement + graph point on x(t))", async () => {
    const w = await mount("spring");
    const per = within(w).getAllByTestId("lab-measurement").find(e => e.getAttribute("data-id") === "period")!;
    fireEvent.change(within(per).getByRole("textbox"), { target: { value: "0.99" } }); fireEvent.click(within(per).getByText("حفظ القياس"));
    const pt = within(w).getByTestId("lab-point"), [x, y] = within(pt).getAllByRole("textbox");
    fireEvent.change(x, { target: { value: "0.25" } }); fireEvent.change(y, { target: { value: "0" } }); fireEvent.click(within(pt).getByText("حفظ النقطة"));
    expect(lastActions()).toEqual([{ type: "measurement.set", measurementId: "period", value: 0.99 }, { type: "graphPoint.set", pointId: "firstEquilibrium", x: 0.25, y: 0 }]);
  });

  it("circuit: switching topology (exploration) updates the solution, choosing a resistor attaches the voltmeter; neither is an action", async () => {
    const w = await mount("circuit");
    expect(readout(w, "Req")).toBe("4 Ω");
    fireEvent.click(within(w).getByTestId("lab-resistor-r2"));
    expect(within(w).getByTestId("lab-voltmeter").textContent).toContain("6 V");
    expect(within(w).getByTestId("lab-meter").textContent).toMatch(/R2[\s\S]*6 V[\s\S]*1 A/);
    const topo = within(w).getAllByTestId("lab-control").find(e => e.getAttribute("data-param") === "topology")!;
    fireEvent.change(within(topo).getByRole("combobox"), { target: { value: "1" } });                         // series: 2 + 6 + 3 = 11 Ω
    expect(readout(w, "Req")).toBe("11 Ω"); expect(within(w).getByTestId("lab-circuit").getAttribute("data-topology")).toBe("1");
    expect(within(w).getByTestId("lab-explore-banner")).toBeTruthy();
    fireEvent.click(within(w).getByText("استعادة قيم التجربة الأصلية")); expect(readout(w, "Req")).toBe("4 Ω");
    const r1 = within(w).getAllByTestId("lab-control").find(e => e.getAttribute("data-param") === "r1")!;
    fireEvent.change(within(r1).getByRole("spinbutton"), { target: { value: "50" } });                          // outside the teacher's 1 … 20
    expect(within(w).getByTestId("lab-explore-error").textContent).toContain("بين 1 و20");
    expect(answers).toHaveLength(0);
  });

  it("pendulum: at t = 0 the bob is a keyboard slider (permitted start angle); after playing it is not; energy stays honestly labelled", async () => {
    const w = await mount("pendulum");
    const bob = within(w).getByTestId("lab-body");                                                            // the scene's bob (the panel also has a range input)
    expect(bob.getAttribute("role")).toBe("slider"); expect(bob.getAttribute("aria-label")).toMatch(/اسحب أو استخدم الأسهم/);
    fireEvent.keyDown(bob, { key: "ArrowRight" });
    expect(readout(w, "theta")).toBe("11 °");
    expect(within(w).getByTestId("lab-explore-banner")).toBeTruthy();
    expect(within(w).getByTestId("lab-energy-note").textContent).toContain("محفوظة");
    const damping = within(w).getAllByTestId("lab-control").find(e => e.getAttribute("data-param") === "damping")!;
    fireEvent.change(within(damping).getByRole("spinbutton"), { target: { value: "0.3" } });
    expect(within(w).getByTestId("lab-energy-note").textContent).toContain("تتناقص");
    expect(within(w).getByTestId("lab-energy-bars").textContent).toContain("مبددة");
    fireEvent.click(within(w).getByTestId("lab-step"));
    expect(within(w).getByTestId("lab-body").getAttribute("role")).toBeNull();                                // dragging only at t = 0, paused
    expect(answers).toHaveLength(0);
  });

  it("prefers-reduced-motion: no play control; stepping keeps every value reachable", async () => {
    reduce(true);
    const w = await mount("energy");
    expect(within(w).queryByTestId("lab-play")).toBeNull(); expect(within(w).getByTestId("lab-reduced-motion")).toBeTruthy();
    fireEvent.click(within(w).getByTestId("lab-step")); expect(Number(slider(w).value)).toBeCloseTo(0.1, 12);
  });
});

describe("21D-A.2 UI — teacher editor, preview, review, registry", () => {
  it("the editor shows reference values, switches experiment by preset, offers the topology select, permits an option control in whole steps, previews the real workspace", async () => {
    const p = LAB_PRESETS.pendulum(), changes: Record<string, unknown>[] = [];
    function Host() {
      const [s, setS] = useState<{ config: unknown; checks: unknown[]; scoring: unknown }>({ config: p.config, checks: p.checks, scoring: "proportional" });
      return <LabEditor config={s.config} checks={s.checks} scoring={s.scoring} onChange={n => { changes.push(n); setS(o => ({ ...o, ...n })); }} />;
    }
    render(<Host />);
    const ed = screen.getByTestId("lab-editor");
    expect(within(ed).getByTestId("lab-reference").querySelector('[data-id="finiteAnglePeriod"] dd')!.textContent).toBe("2.01092 s");
    expect(within(ed).getByTestId("lab-reference").querySelector('[data-id="smallAnglePeriod"] dd')!.textContent).toBe("2.00709 s");
    fireEvent.change(within(ed).getByTestId("lab-experiment"), { target: { value: "circuit" } });
    expect(changes[changes.length - 1]).toEqual({ config: LAB_PRESETS.circuit().config, checks: LAB_PRESETS.circuit().checks, scoring: "proportional" });
    expect((within(ed).getByTestId("lab-option") as HTMLSelectElement).value).toBe("3");
    expect(within(ed).getByTestId("lab-reference").querySelector('[data-id="equivalentResistance"] dd')!.textContent).toBe("4 Ω");
    const topo = within(ed).getAllByTestId("lab-param").find(e => e.getAttribute("data-param") === "topology")!;
    fireEvent.click(within(topo).getByTestId("lab-allow")); fireEvent.click(within(topo).getByTestId("lab-allow"));   // off, then on again with defaults
    const c = changes[changes.length - 1].config as { controls: { param: string; step: number; min: number; max: number }[] };
    expect(c.controls.find(k => k.param === "topology")).toEqual({ param: "topology", min: 1, max: 4, step: 1 });
    expect(validateLabConfig(c).ok).toBe(true);
    const details = within(ed).getByTestId("lab-preview") as HTMLDetailsElement;
    details.open = true; fireEvent(details, new Event("toggle"));
    expect(await within(ed).findByTestId("lab-workspace", {}, { timeout: 4000 })).toBeTruthy();
  });

  it("the review shows the authored experiment (option labels) and the server-derived values; registry and starter resolve exactly physicsLab@1", () => {
    render(<LabReview config={LAB_PRESETS.circuit().config} state={{ v: 1, measurements: { equivalentResistance: 4 }, points: { iv6: { x: 6, y: 1.5 } } }} details={{}} />);
    const r = screen.getByTestId("lab-review");
    expect(r.textContent).toContain("4 Ω"); expect(r.textContent).toContain("(V = 6 V, I = 1.5 A)"); expect(r.textContent).toContain("مختلط: R1 ثم (R2 ∥ R3)");
    expect(resolveSmartSimUi("physicsLab", 1)).toBeTruthy(); expect(resolveSmartSimUi("physicsLab", 2)).toBeUndefined();
    expect(smartSimStarterConfig("physicsLab", 1)).toEqual(labStarterConfig()); expect(validateLabConfig(smartSimStarterConfig("physicsLab", 1)).ok).toBe(true);
  });
});
