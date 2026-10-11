// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useState } from "react";
import { render, cleanup, act, fireEvent, screen, within } from "@testing-library/react";
import StudentQuestionCard, { type Question } from "../StudentQuestionCard";
import type { Answer } from "../answerState";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";
import { glucosePreset, hydratePreset, periodicChlorinePreset, sodiumIonPreset, waterPreset, type ChemPreset } from "./chemTemplates";
import { resolveSmartSimUi } from "../trustedSim/smartSimUiRegistry";
import { smartSimStarterConfig } from "../trustedSim/smartSimStarters";
import { validateChemConfig } from "../chemistryStructureModel";
import { chemMolecule } from "../chemistry/molecules";
import { lonePairDirections, projectMolecule } from "./chemView";
import ChemEditor from "./ChemEditor";
import ChemReview from "./ChemReview";
import ChemWorkspace from "./ChemWorkspace";

// Phase 21D-D.1 — chemistryStructure@1 UI through the REAL student host (StudentQuestionCard → SmartSimResponse → lazy registry → workspace)
// on the server-sanitized question: building an atom / ion, distributing electrons, the periodic table (keyboard + selection), the 3D
// molecule (camera, probe, selection), formulas with live parsing; only explicit saves become semantic actions; nothing private reaches
// the DOM; the editor shows derived expected values; the review renders the server state.
const sanitizeExamForStudent = (sanitizer as unknown as { sanitizeExamForStudent: (e: unknown) => { sections: { questions: Question[] }[] } }).sanitizeExamForStudent;
beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0) as unknown as number);
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as never;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const studentQ = (p: ChemPreset) => sanitizeExamForStudent({ examId: "E", title: "t", schemaVersion: 2, sections: [{ id: "s", title: "S", gradingPolicy: "all", stimuli: {}, questions: [
  { examQuestionId: "c1", presentationType: "smartSim", questionTypeVersion: 1, text: "سؤال كيمياء", marks: 8, smartSim: { schemaVersion: 1, pluginKey: "chemistryStructure", pluginVersion: 1, config: p.config }, answer: { scoring: "proportional", checks: p.checks } }] }] }).sections[0].questions[0];
const answers: (Answer | undefined)[] = [];
function Harness({ q }: { q: Question }) {
  const [a, setA] = useState<Answer | undefined>();
  return <div dir="rtl"><StudentQuestionCard q={q} index={0} id="c1" answer={a} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onAnswer={next => { answers.push(next); setA(next); }} /></div>;
}
const mount = async (p: ChemPreset) => { answers.length = 0; render(<Harness q={studentQ(p)} />); return screen.findByTestId("chem-workspace", {}, { timeout: 5000 }); };
const lastActions = () => { const a = answers[answers.length - 1] as { actions?: unknown[] } | undefined; return a?.actions ?? []; };
const setCounter = (w: HTMLElement, id: string, n: number) => fireEvent.change(within(within(w).getByTestId(id)).getByRole("spinbutton"), { target: { value: String(n) } });

describe("21D-D.1 UI — atoms and ions in the real student host", () => {
  it("the sanitized question carries the public config only; the workspace shows the given ion, the educational-model note and no private data", async () => {
    const q = studentQ(sodiumIonPreset());
    expect(JSON.stringify(q)).not.toMatch(/chem\.particles|tolerance|outerShellElectrons|"checks"/);
    const w = await mount(sodiumIonPreset());
    expect(w.getAttribute("data-activity")).toBe("atom");
    expect(within(w).getByTestId("chem-nuclide").textContent).toBe("2311Na+");
    expect(within(w).getByTestId("chem-atom-model").textContent).toMatch(/ليست مدارات أو مسارات/);
    expect(within(w).queryByTestId("chem-identity")).toBeNull();                           // identity is not allowed by this teacher
    expect(w.textContent).not.toMatch(/الفئة s.*صحيح|2، 8/);
  });
  it("building and distributing are DRAFTS until saved; each save is one semantic action; presentation produces none", async () => {
    const w = await mount(sodiumIonPreset());
    setCounter(w, "chem-protons", 11); setCounter(w, "chem-neutrons", 12); setCounter(w, "chem-electrons", 10);
    expect(answers).toHaveLength(0);
    fireEvent.click(within(w).getByTestId("chem-save-particles"));
    expect(lastActions()).toEqual([{ type: "particles.set", protons: 11, neutrons: 12, electrons: 10 }]);
    setCounter(w, "chem-shell-0", 2); setCounter(w, "chem-shell-1", 8);
    expect(within(w).getByTestId("chem-atom-model").getAttribute("data-shells")).toBe("2,8");      // the drawing follows the draft
    fireEvent.click(within(w).getByTestId("chem-save-shells"));
    fireEvent.click(within(within(w).getAllByTestId("chem-classification")[0]).getByLabelText("أيون موجب"));
    const value = within(w).getByTestId("chem-value");
    fireEvent.change(within(value).getByRole("textbox"), { target: { value: "8" } });
    fireEvent.click(within(value).getByText("حفظ القيمة"));
    expect(lastActions()).toEqual([
      { type: "particles.set", protons: 11, neutrons: 12, electrons: 10 }, { type: "shells.set", shells: [2, 8, 0, 0] },
      { type: "classification.set", taskId: "ionKind", option: "cation" }, { type: "value.set", valueId: "outer", value: 8 }]);
    // re-saving replaces (never accumulates) the same target
    setCounter(w, "chem-electrons", 11);
    fireEvent.click(within(w).getByTestId("chem-save-particles"));
    expect(lastActions().filter(a => (a as { type: string }).type === "particles.set")).toEqual([{ type: "particles.set", protons: 11, neutrons: 12, electrons: 11 }]);
  });
  it("the live identity (when the teacher allows it) names the built species and flags uncatalogued isotopes and unusual charges", async () => {
    const p = sodiumIonPreset();
    const w = await mount({ ...p, config: { ...p.config, view: { ...p.config.view, identity: true } } });
    setCounter(w, "chem-protons", 17); setCounter(w, "chem-neutrons", 18); setCounter(w, "chem-electrons", 18);
    expect(within(w).getByTestId("chem-identity").textContent).toMatch(/35.*17.*Cl.*−.*كلور/);
    setCounter(w, "chem-neutrons", 30);
    expect(within(w).getByTestId("chem-identity").textContent).toMatch(/عدد كتلي غير مدرج/);
    expect(answers).toHaveLength(0);
  });
});

describe("21D-D.1 UI — periodic table", () => {
  it("36 cells in IUPAC positions; arrows move one tab stop; choosing is the only answer (single choice replaces)", async () => {
    const w = await mount(periodicChlorinePreset());
    const table = within(w).getByTestId("chem-ptable"), cells = table.querySelectorAll("button[data-symbol]");
    expect(cells).toHaveLength(36);
    const cl = table.querySelector("[data-symbol='Cl']") as HTMLElement;
    expect([cl.style.gridColumn, cl.style.gridRow]).toEqual(["17", "3"]);
    expect([...cells].filter(c => c.getAttribute("tabindex") === "0").map(c => c.getAttribute("data-symbol"))).toEqual(["H"]);
    const h = table.querySelector("[data-symbol='H']") as HTMLElement;
    act(() => h.focus());
    fireEvent.keyDown(h, { key: "ArrowRight" });
    expect(document.activeElement?.getAttribute("data-symbol")).toBe("He");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement?.getAttribute("data-symbol")).toBe("Ne");
    expect(within(table).getByTestId("chem-ptable-info").textContent).toMatch(/Ne — نيون، العدد الذري 10، الكتلة الذرية 20.180، المجموعة 18، الدورة 2/);
    expect(answers).toHaveLength(0);                                                       // browsing is never recorded
    fireEvent.click(table.querySelector("[data-symbol='S']")!);
    fireEvent.click(table.querySelector("[data-symbol='Cl']")!);
    expect(lastActions()).toEqual([{ type: "object.select", objectId: "Cl" }]);
    expect(table.querySelector("[data-symbol='Cl']")!.getAttribute("aria-pressed")).toBe("true");
  });
});

describe("21D-D.1 UI — 3D molecule", () => {
  it("ball-and-stick water: 3 atoms, 2 single bonds; camera / labels / probe are presentation; the central atom is chosen from the keyboard list", async () => {
    const w = await mount(waterPreset());
    const mol = within(w).getByTestId("chem-molecule"), svg = mol.querySelector("svg.chem-mol-scene")!;
    expect([mol.querySelectorAll("[data-chem-atom]").length, mol.querySelectorAll("[data-chem-bond]").length]).toEqual([3, 2]);
    expect([...mol.querySelectorAll("[data-chem-bond]")].map(b => b.getAttribute("data-order"))).toEqual(["1", "1"]);
    const yaw = svg.getAttribute("data-yaw");
    fireEvent.click(within(mol).getByLabelText("تدوير لليمين"));
    expect(svg.getAttribute("data-yaw")).not.toBe(yaw);
    fireEvent.click(within(mol).getByTestId("chem-mol-reset"));
    expect(svg.getAttribute("data-yaw")).toBe(yaw);
    fireEvent.click(within(mol).getByTestId("chem-mol-measure"));
    for (const id of ["H1", "O1", "H2"]) fireEvent.click(mol.querySelector("[data-chem-atom='" + id + "']")!);
    expect(within(mol).getByTestId("chem-probe").textContent).toBe("الزاوية H1–O1–H2 = 104.5°");
    expect(answers).toHaveLength(0);
    fireEvent.click(within(mol).getByText("اختيار"));
    fireEvent.click(mol.querySelector("[data-chem-pick='H1']")!);
    fireEvent.click(mol.querySelector("[data-chem-pick='O1']")!);                          // max 1: replaces
    expect(lastActions()).toEqual([{ type: "object.select", objectId: "O1" }]);
    expect(within(w).queryByTestId("chem-details")).toBeNull();                            // shape / polarity are not revealed
  });
  it("projection geometry: an orthographic sphere is a circle; framing does not depend on the orientation; lone pairs follow VSEPR", () => {
    const m = chemMolecule("methane")!;
    const a = projectMolecule(m, { yaw: 0, pitch: 0, zoom: 1 }, 360, 280, false), b = projectMolecule(m, { yaw: 1.2, pitch: 0.7, zoom: 1 }, 360, 280, false);
    expect(a.scale).toBeCloseTo(b.scale, 9);
    const w = chemMolecule("water")!, lp = lonePairDirections(w, "O1");
    expect(lp).toHaveLength(2);
    const angle = Math.acos(lp[0].x * lp[1].x + lp[0].y * lp[1].y + lp[0].z * lp[1].z) * 180 / Math.PI;
    expect(angle).toBeCloseTo(109.47, 1);                                                   // idealised tetrahedral domains
    expect(lonePairDirections(chemMolecule("ammonia")!, "N1")).toHaveLength(1);
    expect(lonePairDirections(chemMolecule("hydrogenChloride")!, "Cl1")).toHaveLength(3);
    expect(lonePairDirections(chemMolecule("methane")!, "C1")).toEqual([]);
  });
});

describe("21D-D.1 UI — several simulations on ONE exam page", () => {
  // found by the real-Chromium exam certification: two questions with the same classification task id ("shape" on water and on CO₂) shared
  // one radio group name, so choosing in one question silently unchecked the other question's choice.
  it("classification radios of two workspaces are independent groups (choosing in one never unchecks the other)", () => {
    const water = waterPreset().config, co2 = { ...water, subject: { molecule: "carbonDioxide" } };
    function Two() {
      const [a, setA] = useState<unknown[]>([]), [b, setB] = useState<unknown[]>([]);
      return <><div data-testid="w1"><ChemWorkspace config={water} actions={a} onChange={n => setA(n)} label="1" /></div><div data-testid="w2"><ChemWorkspace config={co2} actions={b} onChange={n => setB(n)} label="2" /></div></>;
    }
    render(<Two />);
    const radio = (w: string, label: string) => within(within(screen.getByTestId(w)).getAllByTestId("chem-classification")[0]).getByLabelText(label) as HTMLInputElement;
    fireEvent.click(radio("w1", "منحنٍ (زاوي)"));
    fireEvent.click(radio("w2", "خطي"));
    expect([radio("w1", "منحنٍ (زاوي)").checked, radio("w2", "خطي").checked]).toEqual([true, true]);
    expect(radio("w1", "منحنٍ (زاوي)").name).not.toBe(radio("w2", "خطي").name);
  });
});

describe("21D-D.1 UI — formulas", () => {
  it("live parsing: an invalid formula cannot be saved; a valid one is saved in canonical text; the composition table is hidden unless allowed", async () => {
    const w = await mount(glucosePreset());
    expect(within(w).getByTestId("chem-subject-formula").textContent).toBe("C₆H₁₂O₆");
    expect(within(w).queryByTestId("chem-composition")).toBeNull();
    const task = within(w).getByTestId("chem-formula-task"), input = within(task).getByRole("textbox"), save = within(task).getByText("حفظ الصيغة");
    fireEvent.change(input, { target: { value: "ch2o" } });
    expect(within(task).getByRole("alert").textContent).toMatch(/حرف كبير/);
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: "CH₂O" } });
    fireEvent.click(save);
    expect(lastActions()).toEqual([{ type: "formula.set", formulaId: "empirical", text: "CH2O" }]);
  });
  it("with details allowed, the composition table lists counts and CIAAW weights and the exact molar mass", async () => {
    const p = hydratePreset();
    const w = await mount({ ...p, config: { ...p.config, view: { ...p.config.view, details: true } } });
    const t = within(w).getByTestId("chem-composition");
    expect(t.querySelector("tfoot")!.textContent).toMatch(/249.677 g\/mol/);
    expect([...t.querySelectorAll("tbody tr")].map(r => r.children[1].textContent)).toEqual(["1", "10", "9", "1"]);   // Cu H O S (Hill order without C)
  });
});

describe("21D-D.1 UI — registry, starter, editor and review", () => {
  it("the UI registry and the starter know EXACTLY chemistryStructure@1; the starter is a valid config", () => {
    expect(resolveSmartSimUi("chemistryStructure", 1)).toBeTruthy();
    expect(resolveSmartSimUi("chemistryStructure", 2)).toBeUndefined();
    expect(validateChemConfig(smartSimStarterConfig("chemistryStructure", 1)).ok).toBe(true);
  });
  it("the editor shows the DERIVED expected value of every chem check (teacher only) and the private species", () => {
    const p = periodicChlorinePreset(), onChange = vi.fn();
    render(<ChemEditor config={p.config} checks={p.checks} scoring="proportional" onChange={onChange} />);
    const expected = screen.getAllByTestId("chem-check-expected").map(e => e.textContent);
    expect(expected).toEqual(["المتوقع (محسوب من البيانات الموثوقة): البروتونات = 17، النيوترونات = 18، الإلكترونات = 17", "المتوقع (محسوب من البيانات الموثوقة): 2، 8، 7", "المتوقع (محسوب من البيانات الموثوقة): 7 ± 0"]);
    expect(screen.getAllByTestId("chem-check-species")).toHaveLength(3);
    fireEvent.change(screen.getByTestId("chem-activity"), { target: { value: "formula" } });
    expect(onChange.mock.calls[0][0].config).toMatchObject({ activity: "formula", subject: { formula: "C6H12O6" } });
  });
  it("the editor's formula input stores canonical text when it parses and the raw text otherwise (the validator blocks it)", () => {
    const p = glucosePreset(), onChange = vi.fn();
    render(<ChemEditor config={p.config} checks={p.checks} scoring="proportional" onChange={onChange} />);
    fireEvent.change(screen.getByTestId("chem-formula-input"), { target: { value: "Ca(OH)₂" } });
    expect(onChange.mock.calls.at(-1)![0].config.subject).toEqual({ formula: "Ca(OH)2" });
    fireEvent.change(screen.getByTestId("chem-formula-input"), { target: { value: "Ca(OH" } });
    expect(onChange.mock.calls.at(-1)![0].config.subject).toEqual({ formula: "Ca(OH" });
    expect(validateChemConfig(onChange.mock.calls.at(-1)![0].config).ok).toBe(false);
  });
  it("the review renders the server-derived state as text", () => {
    render(<ChemReview config={sodiumIonPreset().config} state={{ v: 1, particles: { protons: 11, neutrons: 12, electrons: 10 }, shells: [2, 8], values: { outer: 8 }, formulas: {}, classifications: { ionKind: "cation" }, selected: [] }} details={{}} />);
    const r = screen.getByTestId("chem-review");
    expect(r.textContent).toMatch(/p = 11, n = 12, e = 10/);
    expect(r.textContent).toMatch(/2, 8/);
    expect(r.textContent).toMatch(/أيون موجب/);
  });
});
