// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useState } from "react";
import { render, cleanup, fireEvent, screen, within } from "@testing-library/react";
import StudentQuestionCard, { type Question } from "../StudentQuestionCard";
import type { Answer } from "../answerState";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";
import { resolveSmartSimUi } from "../trustedSim/smartSimUiRegistry";
import { smartSimStarterConfig } from "../trustedSim/smartSimStarters";
import { validateRxnConfig } from "../chemistryReactionsModel";
import { calciumCarbonateTemplate, customAluminiumTemplate, dichromateTemplate, ironTemplate, methaneTemplate, precipitationTemplate, waterTemplate, type RxnTemplate } from "./rxnTemplates";
import { copiesFor, particleCaption, termMolecule, unitDots } from "./rxnView";
import RxnEditor from "./RxnEditor";
import RxnReview from "./RxnReview";
import RxnWorkspace from "./RxnWorkspace";

// Phase 21D-D.2 — chemistryReactions@1 UI through the REAL student host (StudentQuestionCard → SmartSimResponse → lazy registry → workspace)
// on the server-sanitized question: typing / stepping coefficients (each a semantic action), the live conservation table, the particle picture
// that follows the coefficients, classifications and selections; nothing private reaches the DOM; the editor derives expected answers and
// refuses what cannot be graded; the review renders the server state.
const sanitizeExamForStudent = (sanitizer as unknown as { sanitizeExamForStudent: (e: unknown) => { sections: { questions: Question[] }[] } }).sanitizeExamForStudent;
beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0) as unknown as number);
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as never;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const studentQ = (t: RxnTemplate) => sanitizeExamForStudent({ examId: "E", title: "t", schemaVersion: 2, sections: [{ id: "s", title: "S", gradingPolicy: "all", stimuli: {}, questions: [
  { examQuestionId: "r1q", presentationType: "smartSim", questionTypeVersion: 1, text: "سؤال تفاعلات", marks: 8, smartSim: { schemaVersion: 1, pluginKey: "chemistryReactions", pluginVersion: 1, config: t.config }, answer: { scoring: "proportional", checks: t.checks } }] }] }).sections[0].questions[0];
const answers: (Answer | undefined)[] = [];
function Harness({ q }: { q: Question }) {
  const [a, setA] = useState<Answer | undefined>();
  return <div dir="rtl"><StudentQuestionCard q={q} index={0} id="r1q" answer={a} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onAnswer={next => { answers.push(next); setA(next); }} /></div>;
}
const mount = async (t: RxnTemplate) => { answers.length = 0; render(<Harness q={studentQ(t)} />); return screen.findByTestId("rxn-workspace", {}, { timeout: 5000 }); };
const lastActions = () => { const a = answers[answers.length - 1] as { actions?: unknown[] } | undefined; return a?.actions ?? []; };
const coefInput = (w: HTMLElement, id: string) => within(within(w).getByTestId("rxn-coef-" + id)).getByRole("textbox") as HTMLInputElement;
const type = (w: HTMLElement, id: string, v: string) => fireEvent.change(coefInput(w, id), { target: { value: v } });

describe("21D-D.2 UI — balancing in the real student host", () => {
  it("the sanitized question carries the public config only; the equation is an LTR island with subscripts and empty coefficients", async () => {
    const q = studentQ(methaneTemplate());
    expect(JSON.stringify(q)).not.toMatch(/rxn\.|"checks"|lowest|weight/);
    const w = await mount(methaneTemplate());
    const eq = within(w).getByTestId("rxn-equation");
    expect(eq.getAttribute("dir")).toBe("ltr");
    expect(eq.textContent).toMatch(/CH₄\(g\).*O₂\(g\).*→.*CO₂\(g\).*H₂O\(g\)/);
    expect(["r1", "r2", "p1", "p2"].map(id => coefInput(w, id).value)).toEqual(["", "", "", ""]);
    expect(w.getAttribute("dir")).toBe("rtl");
    expect(within(w).getByTestId("rxn-status").textContent).toMatch(/أكمل كل المعاملات/);
    expect(w.textContent).toMatch(/لا يثبت أن التفاعل يحدث فعلًا/);
  });
  it("each coefficient is ONE semantic action per term; the conservation table follows; balanced status is announced", async () => {
    const w = await mount(methaneTemplate());
    const panel = within(w).getByTestId("rxn-conservation");
    const cell = (el: string) => panel.querySelector('tr[data-element="' + el + '"] td:last-child')!.textContent;
    // with only CH₄ and CO₂ set, C is decided; H and O still wait for O₂ / H₂O — never shown as "conserved" (0 = 0 of unset terms)
    type(w, "r1", "1"); type(w, "p1", "1");
    expect(["C", "H", "O"].map(cell)).toEqual(["✓ محفوظ", "… أكمل معاملاته", "… أكمل معاملاته"]);
    type(w, "r2", "1"); type(w, "p2", "1");
    expect(lastActions()).toEqual([{ type: "coefficient.set", termId: "r1", value: 1 }, { type: "coefficient.set", termId: "p1", value: 1 }, { type: "coefficient.set", termId: "r2", value: 1 }, { type: "coefficient.set", termId: "p2", value: 1 }]);
    expect([...panel.querySelectorAll('tr[data-element="O"] td')].map(td => td.textContent)).toEqual(["2", "3", "−1", "✗ غير محفوظ"]);
    expect(within(w).getByTestId("rxn-status").textContent).toBe("المعادلة غير موزونة: H، O غير محفوظ.");
    type(w, "r2", "2"); type(w, "p2", "2");
    expect(lastActions()).toEqual([{ type: "coefficient.set", termId: "r1", value: 1 }, { type: "coefficient.set", termId: "p1", value: 1 }, { type: "coefficient.set", termId: "r2", value: 2 }, { type: "coefficient.set", termId: "p2", value: 2 }]);
    expect(panel.getAttribute("data-balanced")).toBe("true");
    expect(within(w).getByTestId("rxn-status").textContent).toBe("المعادلة موزونة: كل عنصر محفوظ.");
    expect(within(w).getByTestId("rxn-status").getAttribute("aria-live")).toBe("polite");
  });
  it("keyboard arrows and the step buttons change a coefficient; invalid text is refused with an alert and never sent", async () => {
    const w = await mount(waterTemplate());
    fireEvent.keyDown(coefInput(w, "r1"), { key: "ArrowUp" });
    fireEvent.keyDown(coefInput(w, "r1"), { key: "ArrowUp" });
    expect(coefInput(w, "r1").value).toBe("2");
    fireEvent.keyDown(coefInput(w, "r1"), { key: "ArrowDown" });
    expect(lastActions()).toEqual([{ type: "coefficient.set", termId: "r1", value: 1 }]);
    fireEvent.click(within(within(w).getByTestId("rxn-coef-p1")).getByLabelText("زيادة معامل H₂O"));
    expect(lastActions()).toContainEqual({ type: "coefficient.set", termId: "p1", value: 1 });
    const n = answers.length;
    for (const bad of ["0", "1000", "2.5", "x", "-1"]) {
      type(w, "r2", bad);
      expect(within(within(w).getByTestId("rxn-coef-r2")).getByRole("alert").textContent).toMatch(/من 1 إلى 999/);
    }
    expect(answers.length).toBe(n);
    type(w, "r2", "");                                    // clearing the box clears the coefficient (one action, not a zero)
    expect(lastActions().some(a => (a as { termId?: string }).termId === "r2")).toBe(false);
  });
  it("the particle picture draws coefficient × particles (never merging coefficients with subscripts) and real molecules for catalog species", async () => {
    const w = await mount(waterTemplate());
    const groups = () => within(w).getAllByTestId("rxn-particles-term");
    expect(groups().map(g => g.getAttribute("data-count"))).toEqual(["0", "0", "0"]);
    type(w, "r1", "2"); type(w, "r2", "1"); type(w, "p1", "2");
    expect(groups().map(g => g.getAttribute("data-count"))).toEqual(["2", "1", "2"]);
    expect(groups()[0].querySelectorAll(".rxn-particle")).toHaveLength(2);
    expect(groups()[0].getAttribute("aria-label")).toBe("2 × جزيء H₂ — 4 هيدروجين");
    expect(groups()[2].querySelectorAll(".rxn-particle svg circle")).toHaveLength(6);           // 2 water molecules × 3 atoms (real geometry)
    expect(within(w).getByTestId("rxn-particles").textContent).toMatch(/المعامل هو عدد الجسيمات/);
  });
  it("ionic compounds are formula units, ions carry their charge, and a locked coefficient is shown and cannot be edited", async () => {
    const w = await mount(ironTemplate());
    expect(within(w).getByTestId("rxn-coef-p1").textContent).toMatch(/^2/);
    expect(within(within(w).getByTestId("rxn-coef-p1")).queryByRole("textbox")).toBeNull();
    type(w, "r1", "4");
    const fe2o3 = within(w).getAllByTestId("rxn-particles-term")[2];
    expect(fe2o3.textContent).toMatch(/وحدة صيغة \(مركب أيوني\)/);
    expect(fe2o3.querySelectorAll(".rxn-dot")).toHaveLength(2 * 5);
    expect(particleCaption({ charge: 2 })).toBe("أيون");
    expect(unitDots({ C: 6, H: 12, O: 6 })).toBeNull();
    expect(copiesFor(25)).toEqual({ drawn: 10, more: 15, unset: false });
    expect(termMolecule({ formula: "HCl", charge: 0, state: "aq" })).toBeUndefined();          // HCl(aq) is ionised: not drawn as a molecule
    expect(termMolecule({ formula: "HCl", charge: 0, state: "g" })?.id).toBe("hydrogenChloride");
  });
  it("hides the live conservation table when the teacher disables it (exam mode)", async () => {
    const w = await mount(calciumCarbonateTemplate());
    expect(within(w).queryByTestId("rxn-conservation")).toBeNull();
    expect(within(w).queryByTestId("rxn-particles")).not.toBeNull();
  });
});

describe("21D-D.2 UI — classifications, selections and the 3D molecule", () => {
  it("single choice is a radio group, multiple choice a checkbox group; each decision is one action", async () => {
    const w = await mount(precipitationTemplate());
    const task = within(w).getByTestId("rxn-classification");
    expect(within(task).getByRole("group")).toBeTruthy();
    fireEvent.click(within(task).getByLabelText("ترسيب"));
    fireEvent.click(within(task).getByLabelText("إحلال مزدوج"));
    expect(lastActions()).toEqual([{ type: "reaction.classify", taskId: "families", families: ["doubleDisplacement", "precipitation"] }]);
    const sel = within(w).getByTestId("rxn-selection");
    fireEvent.click(within(sel).getByText("CaCO₃"));
    expect(lastActions()).toContainEqual({ type: "species.select", taskId: "solid", termId: "p1" });
    expect(within(sel).getByText("CaCO₃").closest("button")!.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(sel).getByText("CaCO₃"));
    expect(lastActions().some(a => (a as { type: string }).type === "species.select")).toBe(false);
  });
  it("offers the D.1 3D viewer for catalog molecules only", async () => {
    const w = await mount(methaneTemplate());
    const bar = within(w).getByTestId("rxn-3d");
    expect([...bar.querySelectorAll("button")].map(b => b.getAttribute("data-testid"))).toEqual(["rxn-3d-methane", "rxn-3d-oxygen", "rxn-3d-carbonDioxide", "rxn-3d-water"]);
    fireEvent.click(within(bar).getByTestId("rxn-3d-methane"));
    expect(within(w).getByTestId("chem-molecule").getAttribute("data-molecule")).toBe("methane");
    const n = answers.length;
    fireEvent.click(within(w).getByTestId("chem-mol-reset"));
    expect(answers.length).toBe(n);                       // presentation only
  });
  it("two workspaces on one page keep independent radio groups", () => {
    const water = waterTemplate().config, methane = methaneTemplate().config;
    function Two() {
      const [a, setA] = useState<unknown[]>([]), [b, setB] = useState<unknown[]>([]);
      return <><div data-testid="w1"><RxnWorkspace config={water} actions={a} onChange={n => setA(n)} label="1" /></div><div data-testid="w2"><RxnWorkspace config={methane} actions={b} onChange={n => setB(n)} label="2" /></div></>;
    }
    render(<Two />);
    const radio = (w: string, label: string) => within(within(screen.getByTestId(w)).getByTestId("rxn-classification")).getByLabelText(label) as HTMLInputElement;
    fireEvent.click(radio("w1", "اتحاد (تكوين)"));
    fireEvent.click(radio("w2", "احتراق"));
    expect([radio("w1", "اتحاد (تكوين)").checked, radio("w2", "احتراق").checked]).toEqual([true, true]);
    expect(radio("w1", "اتحاد (تكوين)").name).not.toBe(radio("w2", "احتراق").name);
  });
  it("a disabled (submitted) workspace shows the answers without controls", () => {
    render(<RxnWorkspace config={waterTemplate().config} actions={[{ type: "coefficient.set", termId: "r1", value: 2 }]} onChange={() => {}} label="x" disabled />);
    const w = screen.getByTestId("rxn-workspace");
    expect((within(within(w).getByTestId("rxn-coef-r1")).getByRole("textbox") as HTMLInputElement).disabled).toBe(true);
    expect(within(w).queryByTestId("rxn-reset-coefficients")).toBeNull();
  });
  it("an invalid config shows an explicit unavailable state", () => {
    render(<RxnWorkspace config={{ v: 1, reaction: { catalog: "nope" } }} actions={[]} onChange={() => {}} label="x" />);
    expect(screen.getByTestId("rxn-unavailable")).toBeTruthy();
  });
});

describe("21D-D.2 UI — registry, starter, editor and review", () => {
  it("the UI registry and the starter know EXACTLY chemistryReactions@1; the starter is a valid config", () => {
    expect(resolveSmartSimUi("chemistryReactions", 1)).toBeTruthy();
    expect(resolveSmartSimUi("chemistryReactions", 2)).toBeUndefined();
    expect(validateRxnConfig(smartSimStarterConfig("chemistryReactions", 1)).ok).toBe(true);
  });
  it("the editor shows the solver's balanced equation and every derived expected answer (teacher only)", () => {
    const t = dichromateTemplate();
    render(<RxnEditor config={t.config} checks={t.checks} scoring="proportional" onChange={vi.fn()} />);
    expect(screen.getByTestId("rxn-teacher-balanced").textContent).toBe("6Fe²⁺ + Cr₂O₇²⁻ + 14H⁺ → 6Fe³⁺ + 2Cr³⁺ + 7H₂O");
    expect(screen.getAllByTestId("rxn-check-expected").map(e => e.textContent!.replace(/^.*: /, ""))).toEqual([
      "6Fe²⁺ + Cr₂O₇²⁻ + 14H⁺ → 6Fe³⁺ + 2Cr³⁺ + 7H₂O (أو أي مضاعف لها)", "الشحنة الكلية نفسها في الجهتين", "6Fe²⁺ + 1Cr₂O₇²⁻ + 14H⁺ → 6Fe³⁺ + 2Cr³⁺ + 7H₂O", "Cr₂O₇²⁻", "Fe²⁺"]);
    expect(screen.getByTestId("rxn-reaction-info").textContent).toMatch(/OpenStax/);
  });
  it("the editor marks contested families, refuses an ambiguous single choice and explains it", () => {
    const t = ironTemplate();
    render(<RxnEditor config={{ ...t.config, tasks: { ...t.config.tasks, classifications: [{ id: "family", label: "صنّف", mode: "single", options: ["synthesis", "combustion"] }] } }} checks={t.checks} scoring="proportional" onChange={vi.fn()} />);
    expect(screen.getByTestId("rxn-editor-classification").textContent).toMatch(/مختلف عليه — لا يُعرض/);
    expect(screen.getByTestId("rxn-issues").textContent).toMatch(/مختلف عليه لهذا التفاعل/);
  });
  it("a teacher's own equation: canonical formula text when it parses, the solver's verdict, and roles limited to definitions", () => {
    const t = customAluminiumTemplate(), onChange = vi.fn();
    render(<RxnEditor config={t.config} checks={t.checks} scoring="proportional" onChange={onChange} />);
    expect(screen.getByTestId("rxn-teacher-balanced").textContent).toBe("4Al(s) + 3O₂(g) → 2Al₂O₃(s)");
    const formula = within(screen.getAllByTestId("rxn-custom-products")[0]).getAllByRole("textbox")[0];
    fireEvent.change(formula, { target: { value: "Al₂O₃" } });
    expect(onChange.mock.calls.at(-1)![0].config.reaction.custom.products[0].formula).toBe("Al2O3");
    fireEvent.change(formula, { target: { value: "Al2O3)" } });
    expect(onChange.mock.calls.at(-1)![0].config.reaction.custom.products[0].formula).toBe("Al2O3)");                    // raw text: the validator blocks it
    expect(validateRxnConfig(onChange.mock.calls.at(-1)![0].config).ok).toBe(false);
    expect(screen.queryByTestId("rxn-add-classification")).toBeNull();                            // no family guessed for a typed equation
    const roles = [...within(screen.getByTestId("rxn-editor-selection")).getByRole("combobox").querySelectorAll("option")].map(o => o.value);
    expect(roles).toEqual(["element", "compound", "ion"]);
  });
  it("switching the equation drops term-specific checks and resets given coefficients; suggested checks cover every task", () => {
    const t = ironTemplate(), onChange = vi.fn();
    render(<RxnEditor config={t.config} checks={t.checks} scoring="proportional" onChange={onChange} />);
    fireEvent.change(screen.getByTestId("rxn-catalog"), { target: { value: "methaneCombustion" } });
    const next = onChange.mock.calls.at(-1)![0];
    expect(next.config.tasks.balance).toEqual({ locked: [] });
    expect(next.checks.map((k: { id: string }) => k.id)).toEqual(["balanced", "iron", "oxygen", "family", "reducer"]);   // r1 / r2 exist in methane too
    fireEvent.click(screen.getByTestId("rxn-suggest-checks"));
    expect(onChange.mock.calls.at(-1)![0].checks.map((k: { kind: string }) => k.kind)).toEqual(["rxn.balanced", "rxn.lowest", "rxn.classification", "rxn.selection"]);
  });
  it("the review renders the server-derived equation, its conservation table and the saved answers", () => {
    render(<RxnReview config={ironTemplate().config} state={{ v: 1, coefficients: { r1: 4, r2: 3 }, classifications: { family: ["synthesis"] }, selections: { reducer: ["r1"] } }} details={{}} />);
    const r = screen.getByTestId("rxn-review");
    expect(within(r).getByTestId("rxn-review-equation").textContent).toBe("4Fe + 3O₂ → 2Fe₂O₃");
    expect(within(r).getByTestId("rxn-conservation").getAttribute("data-balanced")).toBe("true");
    expect(r.textContent).toMatch(/اتحاد \(تكوين\)/);
    expect(r.textContent).toMatch(/Fe/);
  });
});
