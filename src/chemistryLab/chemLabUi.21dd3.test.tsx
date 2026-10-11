// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useState } from "react";
import { render, cleanup, fireEvent, screen, within } from "@testing-library/react";
import StudentQuestionCard, { type Question } from "../StudentQuestionCard";
import type { Answer } from "../answerState";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";
import { resolveSmartSimUi } from "../trustedSim/smartSimUiRegistry";
import { smartSimStarterConfig } from "../trustedSim/smartSimStarters";
import { validateChemLabConfig } from "../chemistryLabModel";
import {
  dilutionTemplate, indicatorTemplate, phCompareTemplate, rateTemplate, solidPrepareTemplate, titrationTemplate, unknownTitrationTemplate, type ChemLabTemplate
} from "./labTemplates";
import { isolateQuantities, studentDecimal } from "./labView";
import ChemLabEditor from "./ChemLabEditor";
import ChemLabReview from "./ChemLabReview";
import ChemLabWorkspace from "./ChemLabWorkspace";

// Phase 21D-D.3 — chemistryLab@1 UI through the REAL student host (StudentQuestionCard → SmartSimResponse → lazy registry → workspace) on the
// server-sanitized question: every bench operation and every saved answer is ONE semantic action; readings appear only where the teacher
// enabled them; observations, measurements and answers stay apart; nothing private reaches the DOM and nothing says "correct"; the editor
// derives expected answers and refuses what cannot be graded; the review renders the server state.
const sanitizeExamForStudent = (sanitizer as unknown as { sanitizeExamForStudent: (e: unknown) => { sections: { questions: Question[] }[] } }).sanitizeExamForStudent;
beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0) as unknown as number);
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as never;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const studentQ = (t: ChemLabTemplate) => sanitizeExamForStudent({ examId: "E", title: "t", schemaVersion: 2, sections: [{ id: "s", title: "S", gradingPolicy: "all", stimuli: {}, questions: [
  { examQuestionId: "lab1", presentationType: "smartSim", questionTypeVersion: 1, text: "سؤال مختبر", marks: 10, smartSim: { schemaVersion: 1, pluginKey: "chemistryLab", pluginVersion: 1, config: t.config }, answer: { scoring: "proportional", checks: t.checks } }] }] }).sections[0].questions[0];
const answers: (Answer | undefined)[] = [];
function Harness({ q }: { q: Question }) {
  const [a, setA] = useState<Answer | undefined>();
  return <div dir="rtl"><StudentQuestionCard q={q} index={0} id="lab1" answer={a} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onAnswer={next => { answers.push(next); setA(next); }} /></div>;
}
const mount = async (t: ChemLabTemplate) => { answers.length = 0; render(<Harness q={studentQ(t)} />); return screen.findByTestId("clab-workspace", {}, { timeout: 5000 }); };
const lastActions = () => { const a = answers[answers.length - 1] as { actions?: unknown[] } | undefined; return a?.actions ?? []; };
const lastState = () => (answers[answers.length - 1] as { state?: { lab?: Record<string, unknown>; observations?: unknown[]; answers?: Record<string, unknown> } } | undefined)?.state;
const click = (el: HTMLElement) => fireEvent.click(el);
const button = (w: HTMLElement, name: RegExp) => within(w).getByRole("button", { name });
const NO_VERDICT = /صحيح|خطأ في الإجابة|أحسنت|إجابة صحيحة|correct/i;
/** Text without the invisible LTR isolates that keep "24.50 mL" from being reordered into "mL 24.50" inside Arabic text. */
const plain = (s: string | null | undefined) => (s ?? "").replace(/[\u2066\u2069]/g, "");

describe("21D-D.3 UI — the student host, Lab A (solutions)", () => {
  it("weigh, make up and record are semantic actions; the bench shows no computed concentration unless the teacher enables it", async () => {
    const w = await mount(solidPrepareTemplate());
    expect(w.getAttribute("dir")).toBe("rtl");
    expect(w.textContent).toMatch(/محاكاة افتراضية للتعلّم/);
    click(button(w, /^250 mL$/));
    expect(lastActions()).toEqual([{ type: "solution.flask", volume: 250 }]);
    const mass = within(w).getByTestId("clab-mass") as HTMLInputElement;
    fireEvent.change(mass, { target: { value: "١٫٤٦" } }); // Arabic-Indic digits and decimal separator
    click(button(w, /ضع على الميزان/));
    expect(lastActions()).toEqual([{ type: "solution.flask", volume: 250 }, { type: "solution.mass", mass: "1.46" }]);
    fireEvent.change(mass, { target: { value: "abc" } });
    click(button(w, /ضع على الميزان/));
    expect(within(w).getByRole("alert").textContent).toMatch(/أدخل كتلة موجبة/);
    expect(lastActions()).toHaveLength(2);
    click(within(w).getByTestId("clab-makeup"));
    click(within(w).getByTestId("clab-record"));
    expect(lastActions().slice(2)).toEqual([{ type: "solution.makeUp" }, { type: "lab.record" }]);
    expect(lastState()?.lab).toEqual({ kind: "solutions", flask: 250, mass: "1.46", pipette: null, madeUp: true });
    expect(plain(within(w).getAllByTestId("clab-record-row")[0].textContent)).toMatch(/دورق 250 mL.*كتلة 1\.46 g/);
    expect(within(w).getAllByTestId("clab-record-row")[0].textContent).toContain("\u2066250 mL\u2069"); // an isolated LTR quantity
    expect(within(w).queryByTestId("clab-label-readout")).toBeNull(); // readouts off in this template
    expect(plain(within(w).getByTestId("clab-prepare").textContent)).toMatch(/1\.46 g مكمّل إلى 250 mL/);
    expect(w.textContent).not.toMatch(NO_VERDICT);
  });
  it("a repeated setter replaces the previous one; readouts and the c–V graph appear only when enabled", async () => {
    const w = await mount(dilutionTemplate());
    click(button(w, /ماصّة 20 mL/)); click(button(w, /ماصّة 10 mL/));
    expect(lastActions()).toEqual([{ type: "solution.pipette", volume: 10 }]);
    click(button(w, /^100 mL$/)); click(within(w).getByTestId("clab-makeup"));
    expect(within(w).getByTestId("clab-label-readout").textContent).toMatch(/c = 0\.0500 mol\/L/);
    expect(within(w).getByTestId("clab-plot-dilution")).toBeTruthy();
    expect(within(w).getByText(/اللون تمثيل توضيحي/)).toBeTruthy();
  });
  it("an impossible bench operation changes nothing and records nothing", async () => {
    const w = await mount(dilutionTemplate());
    expect((within(w).getByTestId("clab-makeup") as HTMLButtonElement).disabled).toBe(true); // nothing in the flask yet
    expect((within(w).getByTestId("clab-record") as HTMLButtonElement).disabled).toBe(true);
    click(button(w, /إفراغ الأدوات/));
    expect(answers).toHaveLength(0);
    expect(within(w).getByTestId("clab-status").textContent).toMatch(/لم يتغير شيء/);
  });
});

describe("21D-D.3 UI — Lab B (pH and indicators)", () => {
  it("the meter reading appears only after measuring; indicator colours are categorical; lowest pH is a single choice", async () => {
    const w = await mount(phCompareTemplate());
    const a = within(w).getAllByTestId("clab-solution").find(x => x.getAttribute("data-id") === "A")!;
    expect(within(a).queryByTestId("clab-meter-reading")).toBeNull();
    click(within(a).getByRole("button", { name: /قِس pH/ }));
    expect(lastActions()).toEqual([{ type: "ph.measure", solutionId: "A" }]);
    expect(within(a).getByTestId("clab-meter-reading").textContent).toMatch(/pH = 2\.00/);
    click(within(a).getByRole("button", { name: /أضف أزرق البروموثيمول/ }));
    expect(within(a).getByTestId("clab-indicator-result").textContent).toMatch(/أزرق البروموثيمول: أصفر/);
    expect((within(a).getByRole("button", { name: /أضف أزرق البروموثيمول/ }) as HTMLButtonElement).disabled).toBe(true);
    const lowest = within(w).getAllByTestId("clab-choice").find(x => x.getAttribute("data-id") === "lowest")!;
    click(within(lowest).getByLabelText(/المحلول B/));
    expect(lastActions().at(-1)).toEqual({ type: "answer.choose", taskId: "lowest", options: ["B"] });
    expect(within(w).getByTestId("clab-observe").textContent).toMatch(/قِست 1 من 4 محاليل/);
    expect(w.querySelector(".clab-scale")).toBeTruthy();
    expect(w.textContent).not.toMatch(NO_VERDICT);
  });
  it("without readouts there is no pH meter: the student works from colours only", async () => {
    const w = await mount(indicatorTemplate());
    expect(within(w).queryAllByRole("button", { name: /قِس pH/ })).toHaveLength(0);
    expect(w.textContent).toMatch(/لا يتوفر جهاز قياس pH/);
    expect(w.querySelector(".clab-scale")).toBeNull(); // graph off
  });
});

describe("21D-D.3 UI — Lab C (titration)", () => {
  it("burette additions in whole drops, the indicator colour, the pH meter, recorded readings and the curve built from them", async () => {
    const w = await mount(titrationTemplate());
    expect(within(w).getByTestId("clab-equation").textContent).toBe("HCl + NaOH → NaCl + H2O");
    click(within(w).getByLabelText(/الفينولفثالين/));
    click(button(w, /\+ 5\.00 mL/)); click(button(w, /\+ 5\.00 mL/)); click(button(w, /\+ 5\.00 mL/)); click(button(w, /\+ 5\.00 mL/)); click(button(w, /\+ 1\.00 mL/));
    expect(within(w).getByTestId("clab-burette-reading").textContent).toBe("21.00 mL");
    expect(within(w).getByTestId("clab-flask-colour").textContent).toBe("عديم اللون");
    expect(within(w).getByTestId("clab-flask-ph").textContent).toMatch(/pH = 2\.06/); // (2.50 − 2.10) mmol / 46.00 mL
    click(within(w).getByTestId("clab-record"));
    const input = within(w).getByTestId("clab-add-volume") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "0.33" } }); click(button(w, /^أضف$/));
    expect(within(w).getByRole("alert").textContent).toMatch(/مضاعفات القطرة/);
    fireEvent.change(input, { target: { value: "4.50" } }); click(button(w, /^أضف$/));
    expect(within(w).getByTestId("clab-burette-reading").textContent).toBe("25.50 mL");
    expect(within(w).getByTestId("clab-flask-colour").textContent).toBe("وردي");
    click(within(w).getByTestId("clab-record"));
    expect(within(w).getAllByTestId("clab-record-row").map(r => plain(r.textContent))).toEqual([expect.stringMatching(/21\.00 mL.*عديم اللون.*pH = 2\.06/), expect.stringMatching(/25\.50 mL.*وردي/)]);
    expect(within(w).getByTestId("clab-plot-titration").querySelectorAll(".xp-dyn-event")).toHaveLength(2);
    click(button(w, /دورق جديد/));
    expect(within(w).getByTestId("clab-burette-reading").textContent).toBe("0.00 mL");
    expect(within(w).getAllByTestId("clab-record-row")).toHaveLength(2); // the record is kept
    expect(w.textContent).toMatch(/نقطة التكافؤ/);
    expect(w.textContent).toMatch(/نقطة النهاية/);
  });
  it("an unknown analyte shows no concentration and no pH meter; additions beyond the burette are disabled", async () => {
    const w = await mount(unknownTitrationTemplate());
    expect(w.textContent).toMatch(/تركيزه مجهول/);
    expect(w.textContent).not.toMatch(/0\.0093/);
    expect(within(w).queryByTestId("clab-flask-ph")).toBeNull();
    for (let i = 0; i < 10; i++) click(button(w, /\+ 5\.00 mL/));
    expect(within(w).getByTestId("clab-burette-reading").textContent).toBe("50.00 mL");
    expect((button(w, /قطرة واحدة/) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("21D-D.3 UI — quantities inside Arabic text stay LTR islands", () => {
  // Without a bidi isolate an RTL paragraph shows "250 mL" as "mL 250" (found on the PR preview by measuring glyph positions): every
  // number + unit the student reads — status messages, teacher-authored labels and task texts, fixed strings — is isolated at render time.
  const iso = (s: string) => "\u2066" + s + "\u2069";
  it("status messages, solution and trial labels, task texts and fixed strings isolate every number + unit", async () => {
    let w = await mount(titrationTemplate());
    click(button(w, /\+ 1\.00 mL/));
    expect(within(w).getByTestId("clab-status").textContent).toBe("أُضيف " + iso("1.00 mL") + " من السحاحة.");
    expect(button(w, /قطرة واحدة/).textContent).toContain(iso("0.05 mL"));
    expect(w.querySelector(".clab-disclaimer")!.textContent).toContain(iso("25 °C"));
    cleanup();
    w = await mount(phCompareTemplate());
    expect(within(w).getAllByTestId("clab-solution")[0].querySelector("h4")!.textContent).toContain(iso("0.010 mol/L"));
    expect(w.textContent).toContain("كل المحاليل عند " + iso("25 °C"));
    cleanup();
    w = await mount(solidPrepareTemplate());
    const prep = within(w).getByTestId("clab-prepare").textContent!;
    expect(prep).toContain(iso("250 mL"));
    expect(prep).toContain(iso("0.100 mol/L"));
    expect(w.textContent).toContain(iso("0.01 g"));
    cleanup();
    w = await mount(rateTemplate());
    expect(within(w).getAllByTestId("clab-trial")[0].textContent).toContain(iso("25 °C"));
  });
  it("isolateQuantities wraps each number + unit once and leaves everything else alone", () => {
    expect(isolateQuantities("حضّر 250 mL من محلول تركيزه 0.100 mol/L.")).toBe("حضّر " + iso("250 mL") + " من محلول تركيزه " + iso("0.100 mol/L") + ".");
    expect(isolateQuantities("وُضع " + iso("1.46 g") + " على الميزان")).toBe("وُضع " + iso("1.46 g") + " على الميزان"); // never twice
    expect(isolateQuantities("التجربة 1: \u200f25 °C دون حافز")).toBe("التجربة 1: \u200f" + iso("25 °C") + " دون حافز");
    expect(isolateQuantities("التجربة 3 (8.2–10)")).toBe("التجربة 3 (8.2–10)"); // numbers without a unit are not quantities
    expect(isolateQuantities("k = 0.05 L/(mol·s)")).toBe("k = 0.05 L/(mol·s)"); // a compound unit is not split
    expect(isolateQuantities("10 grams, 5 sec")).toBe("10 grams, 5 sec");
  });
});
describe("21D-D.3 UI — Lab D (reaction rate) and answers", () => {
  it("running a trial is an action; the time cursor is presentation only; answers accept units and Arabic digits", async () => {
    const w = await mount(rateTemplate());
    const t1 = within(w).getAllByTestId("clab-trial").find(x => x.getAttribute("data-id") === "t1")!;
    click(within(t1).getByRole("button", { name: /شغّل/ }));
    expect(lastActions()).toEqual([{ type: "rate.run", trialId: "t1" }]);
    expect(within(t1).getByTestId("clab-trial-readout").textContent).toBe("0.100 mol/L");
    const n = answers.length;
    expect(within(w).getByTestId("clab-time").getAttribute("dir")).toBe("ltr"); // runs like the graph's time axis, not mirrored by the RTL page
    fireEvent.change(within(w).getByTestId("clab-time"), { target: { value: "347" } });
    expect(answers).toHaveLength(n); // never recorded
    expect(within(t1).getByTestId("clab-trial-readout").textContent).toBe("0.0500 mol/L");
    expect(within(w).getByTestId("clab-plot-rate").querySelectorAll("path[data-series]")).toHaveLength(1);
    const half = within(w).getAllByTestId("clab-number").find(x => x.getAttribute("data-id") === "half")!;
    fireEvent.change(within(half).getByRole("textbox"), { target: { value: "٥٫٧٨" } });
    fireEvent.change(within(half).getByRole("combobox"), { target: { value: "min" } });
    click(within(half).getByRole("button", { name: /حفظ الإجابة/ }));
    expect(lastActions().at(-1)).toEqual({ type: "answer.number", taskId: "half", value: "5.78", unit: "min" });
    fireEvent.change(within(half).getByRole("textbox"), { target: { value: "5.80" } });
    click(within(half).getByRole("button", { name: /حفظ الإجابة/ }));
    expect(lastActions().filter(a => (a as { taskId?: string }).taskId === "half")).toEqual([{ type: "answer.number", taskId: "half", value: "5.80", unit: "min" }]); // one answer per task
    click(within(half).getByRole("button", { name: /مسح/ }));
    expect(lastActions().filter(a => (a as { taskId?: string }).taskId === "half")).toEqual([]);
    expect(lastState()?.answers).toEqual({});
  });
  it("studentDecimal normalizes typing and refuses non-numbers", () => {
    expect(["٠٫٠٩٣", ".5", "+2", "9.30E-3", " 1,5 ", "−0.20", "007.5"].map(studentDecimal)).toEqual(["0.093", "0.5", "2", "9.30e-3", "1.5", "-0.20", "7.5"]);
    expect(["", ".", "-", "abc", "1e", "NaN", "Infinity", "1/2", "2+3", "1e999"].map(studentDecimal)).toEqual(Array(10).fill(null));
  });
  it("a submitted (disabled) workspace shows the bench and answers without controls; starting over needs a confirmation", () => {
    const t = titrationTemplate(), acts = [{ type: "titration.add", volume: "5.00" }, { type: "answer.number", taskId: "veq", value: "25.00", unit: "mL" }];
    render(<ChemLabWorkspace config={t.config} actions={acts} onChange={() => {}} label="x" disabled />);
    const w = screen.getByTestId("clab-workspace");
    expect(within(w).getAllByRole("button").every(b => (b as HTMLButtonElement).disabled)).toBe(true);
    expect(within(w).queryAllByRole("button", { name: /إفراغ|دورق جديد|البدء من جديد|حفظ الإجابة|مسح/ })).toHaveLength(0);
    expect(within(w).getByTestId("clab-burette-reading").textContent).toBe("5.00 mL");
    expect(within(w).getAllByTestId("clab-number")[0].textContent).toMatch(/المحفوظ: 25\.00 mL/);
    cleanup();
    const onChange = vi.fn();
    render(<ChemLabWorkspace config={t.config} actions={acts} onChange={onChange} label="x" />);
    click(screen.getByTestId("clab-reset-all"));
    expect(onChange).not.toHaveBeenCalled();
    click(screen.getByTestId("clab-reset-all-confirm"));
    expect(onChange).toHaveBeenCalledWith([], expect.objectContaining({ observations: [], answers: {} }));
  });
  it("an invalid config renders an explicit unavailable state; corrupt saved actions restart honestly", () => {
    render(<ChemLabWorkspace config={{ v: 1, experiment: { kind: "ph" } }} actions={[]} onChange={() => {}} label="x" />);
    expect(screen.getByTestId("clab-unavailable")).toBeTruthy();
    cleanup();
    render(<ChemLabWorkspace config={titrationTemplate().config} actions={[{ type: "titration.add", volume: "0.03" }]} onChange={() => {}} label="x" />);
    expect(screen.getByRole("alert").textContent).toMatch(/تعذّر استعادة العمليات السابقة/);
    expect(screen.getByTestId("clab-burette-reading").textContent).toBe("0.00 mL");
  });
});

describe("21D-D.3 UI — registry, editor and review", () => {
  it("the lazy UI is registered for the exact identity and the starter is a valid config", () => {
    expect(resolveSmartSimUi("chemistryLab", 1)).toBeTruthy();
    expect(resolveSmartSimUi("chemistryLab", 2)).toBeUndefined();
    expect(validateChemLabConfig(smartSimStarterConfig("chemistryLab", 1)).ok).toBe(true);
  });
  it("the editor shows teacher-only derived data and expected answers, applies templates and adds tasks", () => {
    const t = titrationTemplate(), onChange = vi.fn();
    render(<ChemLabEditor config={t.config} checks={t.checks} scoring="proportional" onChange={onChange} />);
    const ed = screen.getByTestId("clab-editor");
    expect(within(ed).getByTestId("clab-derived").textContent).toMatch(/حجم التكافؤ 25\.00 mL/);
    expect(within(ed).getByTestId("clab-derived").textContent).toMatch(/الميثيل البرتقالي: نقطة النهاية 24\.92 mL \(خطأ -0\.079 mL\) — مناسب/);
    expect(within(ed).getByTestId("clab-derived").textContent).toMatch(/أزرق البروموثيمول: نقطة النهاية 25\.00 mL \(خطأ 0\.000 mL\)/); // never "-0.000"
    expect(within(ed).getAllByTestId("clab-task-expected")[0].textContent).toMatch(/25\.00 mL \(السماحية ± 0\.1\)/);
    expect(within(ed).getAllByTestId("clab-check-expected").map(x => x.textContent)).toHaveLength(4);
    fireEvent.change(within(ed).getByTestId("clab-template"), { target: { value: "rate" } });
    expect(onChange).toHaveBeenLastCalledWith({ config: rateTemplate().config, checks: rateTemplate().checks, scoring: "proportional" });
    click(within(ed).getByTestId("clab-add-number"));
    const added = (onChange.mock.lastCall![0] as { config: { tasks: { kind: string; quantity: string; unit: string }[] } }).config.tasks.at(-1)!;
    expect(added).toMatchObject({ kind: "number", quantity: "equivalenceVolume", unit: "L" });
    expect(within(ed).queryByTestId("clab-add-prepare")).toBeNull(); // titration has no preparation task
  });
  it("the editor lists the canonical validator's refusals and offers no preview while invalid", () => {
    const t = titrationTemplate();
    const bad = { ...t.config, experiment: { ...t.config.experiment, analyte: { species: "CH3COOH", volume: "25.00", concentration: "0.100", equivalence: null } } };
    render(<ChemLabEditor config={bad} checks={t.checks} scoring="proportional" onChange={vi.fn()} />);
    expect(screen.getByTestId("clab-issues").textContent).toMatch(/حمض قوي بقاعدة قوية فقط/);
    expect(screen.getByTestId("clab-derived").getAttribute("role")).toBe("alert");
  });
  it("the review renders the server-replayed bench, the record and the answers with Arabic names", () => {
    const t = unknownTitrationTemplate();
    render(<ChemLabReview config={t.config} details={{}} state={{ v: 1, lab: { kind: "titration", indicator: "phenolphthalein", added: "18.60" }, observations: [{ kind: "reading", added: "18.60", indicator: "phenolphthalein" }], answers: { suitable: { kind: "choice", options: ["phenolphthalein"] }, conc: { kind: "number", value: "0.00930", unit: "mol/L" } } }} />);
    const r = screen.getByTestId("clab-review");
    expect(plain(within(r).getByTestId("clab-review-bench").textContent)).toMatch(/18\.60 mL · الكاشف: الفينولفثالين/);
    expect(plain(r.textContent)).toMatch(/18\.60 mL.*الفينولفثالين: عديم اللون/); // pH 7.00 at equivalence: below phenolphthalein's range
    expect(within(r).getAllByTestId("clab-review-answer").map(x => plain(x.textContent))).toEqual(["اكتب قراءة السحاحة النهائية (الحجم المضاف).—", "احسب تركيز الحمض.0.00930 mol/L", expect.stringMatching(/الفينولفثالين$/)]);
    expect(within(r).getAllByTestId("clab-review-answer")[1].textContent).toContain("\u20660.00930 mol/L\u2069"); // the answer is an LTR island
    cleanup();
    expect(render(<ChemLabReview config={t.config} details={{}} state={{ junk: true }} />).container.textContent).toBe("");
  });
});
