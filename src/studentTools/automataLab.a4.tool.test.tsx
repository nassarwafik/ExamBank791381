// @vitest-environment happy-dom
// AUTO-A4 (docs/enterprise-automata-lab-a4.md) — «مختبر الآلات», the contract and the tool:
//   • the contract: `automataLab` joins version 1 additively (after every earlier id), its one option `kinds` (at least one of the
//     course's four machines, canonical order, closed keys); the catalog names it and its answer risk; the 899271 book offers it first
//     with the four machines, no other book does; the exam risk notice names an automata question (and not a networks one);
//   • the starting examples: each builds and accepts exactly the language its title names (every word up to length 6);
//   • the tool: the kinds the teacher chose; a new DFA is incomplete → «أضف حالة مصيدة» completes it; many words at once; «لغة آلتي»;
//     a push-down automaton and a Turing machine built from their rows; a broken row named and nothing drawn; a result belongs to the
//     machine it ran on (an edit clears it); a word step by step with the book's own player; the dock opens it, full screen offered.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { STUDENT_TOOL_IDS, defaultStudentToolConfig, validateStudentTools, validateBookStudentTools, type AutomataLabToolV1, type StudentToolsSpecV1 } from "./studentToolsSpec";
import StudentToolsEditor from "./StudentToolsEditor";
import { studentToolCatalogEntry, studentToolHasUi } from "./studentToolsCatalog";
import { courseStudentTools, COURSE_STUDENT_TOOLS } from "./courseTools";
import { questionRiskFor } from "./studentToolsRisk";
import { checkDraft, languageUpTo, AUTOMATON_KINDS } from "./automataLab";
import { LAB_EXAMPLES } from "./automataLabExamples";
import AutomataLabTool from "./AutomataLabTool";
import StudentToolDock from "./StudentToolDock";

afterEach(cleanup);
const ALL: AutomataLabToolV1 = { id: "automataLab", kinds: ["DFA", "NFA", "PDA", "TM"] };

describe("A4 — the contract", () => {
  it("automataLab joins version 1 after every earlier id; its default offers the four machines; closed keys", () => {
    expect(STUDENT_TOOL_IDS.indexOf("automataLab")).toBe(14);
    expect(STUDENT_TOOL_IDS.at(-1)).toBe("automataLab");
    expect(defaultStudentToolConfig("automataLab")).toEqual(ALL);
    expect(validateStudentTools({ version: 1, tools: [ALL] })).toMatchObject({ ok: true, value: { version: 1, tools: [ALL] } });
    for (const bad of [{ id: "automataLab" }, { id: "automataLab", kinds: [] }, { id: "automataLab", kinds: ["DFA", "DFA"] }, { id: "automataLab", kinds: ["CFG"] },
      { id: "automataLab", kinds: "DFA" }, { id: "automataLab", kinds: ["DFA"], machine: {} }])
      expect(validateStudentTools({ version: 1, tools: [bad] }).ok, JSON.stringify(bad)).toBe(false);
    // the canonical order is the course's
    expect(validateStudentTools({ version: 1, tools: [{ id: "automataLab", kinds: ["TM", "DFA"] }] })).toMatchObject({ ok: true, value: { tools: [{ id: "automataLab", kinds: ["DFA", "TM"] }] } });
    expect(validateBookStudentTools({ version: 1, tools: [ALL] }).ok).toBe(true);
  });
  it("the catalog names it and states its answer risk; it has a UI", () => {
    const e = studentToolCatalogEntry("automataLab");
    expect([e.label, e.available, studentToolHasUi("automataLab")]).toEqual(["مختبر الآلات", true, true]);
    expect(e.answerRisk).toMatch(/هل تُقبل الكلمة/);
    expect(e.answerRisk).toMatch(/التحويل إلى حتمي، والتقاطع والاتحاد، والمتمّم، والتصغير/);   // A5: the algorithms answer those questions
  });
  it("the automata book offers it first with the four machines; no other book does", () => {
    expect(courseStudentTools("899271")!.tools[0]).toEqual(ALL);
    for (const id of Object.keys(COURSE_STUDENT_TOOLS)) if (id !== "899271") expect(courseStudentTools(id)!.tools.some(t => t.id === "automataLab"), id).toBe(false);
  });
  it("the exam risk notice names an automata question, not a networks one", () => {
    expect(questionRiskFor("automataLab", { text: "هل يقبل الأوتومات المرسوم الكلمة abba؟" })).toBe(true);
    expect(questionRiskFor("automataLab", { text: "Build a DFA for the language" })).toBe(true);
    expect(questionRiskFor("automataLab", { text: "ما عنوان الشبكة 192.168.1.0/24؟" })).toBe(false);
  });
});

const LANGUAGE: Record<(typeof AUTOMATON_KINDS)[number], (w: string) => boolean> = {
  DFA: w => [...w].filter(c => c === "a").length % 2 === 0,
  NFA: w => w.endsWith("ab"),
  PDA: w => /^a+b+$/.test(w) && w.indexOf("b") * 2 === w.length,
  TM: w => w.length % 2 === 0,
};
describe("A4 — the starting examples", () => {
  it("each builds and accepts exactly the language its title names (every word up to length 6)", () => {
    for (const k of AUTOMATON_KINDS) {
      const c = checkDraft(LAB_EXAMPLES[k].draft);
      expect(c.issues, k).toEqual([]);
      const m = c.machine!;
      const listed = languageUpTo(m, 6);
      const all: string[] = [""];
      let layer = [""];
      for (let n = 1; n <= 6; n++) { layer = layer.flatMap(w => m.alphabet.map(s => w + s)); all.push(...layer); }
      expect(listed.accepted, k + " — " + LAB_EXAMPLES[k].title).toEqual(all.filter(LANGUAGE[k]).slice(0, 200));
    }
  });
});

const ui = () => screen.getByTestId("tool-automataLab");
const section = (heading: RegExp) => screen.getByRole("heading", { name: heading }).closest("section") as HTMLElement;
const runAll = (words: string) => {
  fireEvent.change(screen.getByLabelText(/^الكلمات/), { target: { value: words } });
  fireEvent.click(screen.getByRole("button", { name: "شغّل الكل" }));
  return within(section(/كلمات كثيرة/)).getAllByRole("row").slice(1).map(r => r.textContent);
};

describe("A4 — the tool", () => {
  it("only the teacher's kinds: one kind is named, not offered as a choice", () => {
    render(<AutomataLabTool config={{ id: "automataLab", kinds: ["PDA"] }} />);
    expect(screen.queryByRole("radio", { name: "أوتومات منتهٍ حتمي" })).toBeNull();
    expect(within(ui()).getByText("أوتومات مكدّس")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^افتح مثالًا: aⁿbⁿ/ })).toBeTruthy();
  });
  it("a new deterministic automaton is incomplete; «أضف حالة مصيدة» completes it with the trap «مصيدة»", () => {
    render(<AutomataLabTool config={ALL} />);
    const checks = section(/الفحوص/);
    expect(checks.textContent).toMatch(/الأوتومات غير كامل: تنقص 2 أسهم/);
    fireEvent.click(within(checks).getByRole("button", { name: "أضف حالة مصيدة" }));
    expect(section(/الفحوص/).textContent).toMatch(/✓ الأوتومات كامل/);
    expect(within(section(/الحالات/)).getByText("qT")).toBeTruthy();
    expect(within(section(/الحالات/)).getByText("(مصيدة)")).toBeTruthy();
  });
  it("the DFA example: many words at once and «لغة آلتي»; an edit clears both results", () => {
    render(<AutomataLabTool config={ALL} />);
    fireEvent.click(screen.getByRole("button", { name: /^افتح مثالًا: عدد a زوجي/ }));
    expect(runAll("ε a aa ab c")).toEqual(["ε✓ تُقبل", "a✗ تُرفض", "aa✓ تُقبل", "ab✗ تُرفض", "cالرمز c ليس في الأبجدية"]);
    fireEvent.change(screen.getByLabelText("كل الكلمات حتى الطول"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "اعرض الكلمات التي تقبلها" }));
    const lang = section(/لغة آلتي/);
    expect(lang.textContent).toMatch(/تقبل الآلة 4 كلمات من 7 حتى الطول 2/);
    expect(within(lang).getAllByText(/^(ε|b|aa|bb)$/).map(e => e.textContent)).toEqual(["ε", "b", "aa", "bb"]);
    // an edit: q0 is no longer accepting — the results were about the other machine
    fireEvent.click(within(section(/الحالات/)).getAllByRole("checkbox", { name: "قبول" })[0]);
    expect(within(section(/كلمات كثيرة/)).queryByRole("table")).toBeNull();
    expect(section(/لغة آلتي/).textContent).not.toMatch(/تقبل الآلة/);
  });
  it("a push-down automaton from its rows (the course's notation shown); a broken row named and nothing drawn", () => {
    render(<AutomataLabTool config={ALL} />);
    fireEvent.click(screen.getByRole("radio", { name: "أوتومات مكدّس" }));
    fireEvent.click(screen.getByRole("button", { name: /^افتح مثالًا: aⁿbⁿ/ }));
    expect(within(section(/الانتقالات/)).getByText("ادفع a,⏊/S")).toBeTruthy();
    expect(runAll("ab aabb aab abb")).toEqual(["ab✓ تُقبل", "aabb✓ تُقبل", "aab✗ تُرفض", "abb✗ تُرفض"]);
    // the first row pops ⏊: refused, and the drawing waits
    fireEvent.change(screen.getByLabelText("الانتقال 1: العملية"), { target: { value: "pop" } });
    expect(section(/الفحوص/).textContent).toMatch(/الانتقال 1: لا نسحب من مكدّس فارغ/);
    expect(within(section(/الرسم والتشغيل/)).queryByRole("img")).toBeNull();
    expect((screen.getByRole("button", { name: "شغّل الكل" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("a Turing machine: «a/A,R» rows; the example's language; a machine that never halts says so", () => {
    render(<AutomataLabTool config={ALL} />);
    fireEvent.click(screen.getByRole("radio", { name: "آلة تورنغ" }));
    fireEvent.click(screen.getByRole("button", { name: /^افتح مثالًا: كلمات من a طولها زوجي/ }));
    expect(within(section(/الانتقالات/)).getAllByText(/^(a\/a,R|∆\/∆,S)$/).map(e => e.textContent)).toEqual(["a/a,R", "a/a,R", "∆/∆,S"]);
    // a Turing machine's rows add the tape at the halt (∆ for an empty tape); no $ on any tape → no answer column
    expect(runAll("ε a aa")).toEqual(["ε✓ تُقبل∆", "a✗ تُرفضa", "aa✓ تُقبلaa"]);
    expect(within(section(/كلمات كثيرة/)).getAllByRole("columnheader").map(h => h.textContent)).toEqual(["الكلمة", "النتيجة", "الشريط عند التوقف"]);
    // the blank row now moves right and stays in q0: on the blank the machine runs forever
    fireEvent.change(screen.getByLabelText("الانتقال 3: الحركة"), { target: { value: "R" } });
    fireEvent.change(screen.getByLabelText("الانتقال 3: إلى"), { target: { value: "q0" } });
    expect(runAll("aa")).toEqual(["aaلم تتوقف (1000 خطوة)—"]);
  });
  it("one word step by step with the book's own player: the verdict in words at the end", () => {
    render(<AutomataLabTool config={ALL} />);
    fireEvent.click(screen.getByRole("button", { name: /^افتح مثالًا: عدد a زوجي/ }));
    const player = section(/الرسم والتشغيل/);
    fireEvent.change(within(player).getByLabelText("الكلمة"), { target: { value: "aba" } });
    fireEvent.click(within(player).getByRole("button", { name: "شغّل" }));
    fireEvent.click(within(player).getByRole("button", { name: "النهاية" }));
    expect(within(player).getByText(/الكلمة مقبولة/)).toBeTruthy();
    expect(within(player).getByRole("img").getAttribute("aria-label")).toMatch(/^أوتومات/);
  });
  it("switching a non-deterministic draft with ε to deterministic: its ε column stays shown, so the arrow can be cleared", () => {
    render(<AutomataLabTool config={ALL} />);
    fireEvent.click(screen.getByRole("radio", { name: "أوتومات منتهٍ غير حتمي" }));
    fireEvent.click(within(screen.getByRole("group", { name: "من q0 بالرمز ε إلى" })).getByRole("button", { name: "q0" }));
    fireEvent.click(screen.getByRole("radio", { name: "أوتومات منتهٍ حتمي" }));
    expect(section(/الفحوص/).textContent).toMatch(/في الأوتومات الحتمي لا انتقالات ε \(من q0\)/);
    const eps = within(screen.getByRole("group", { name: "من q0 بالرمز ε إلى" })).getByRole("button", { name: "q0" });
    fireEvent.click(eps);
    expect(section(/الفحوص/).textContent).not.toMatch(/انتقالات ε/);
    expect(screen.queryByRole("group", { name: "من q0 بالرمز ε إلى" })).toBeNull();   // cleared: the column goes
  });
  it("an alphabet with a reserved mark is refused, said in words", () => {
    render(<AutomataLabTool config={ALL} />);
    fireEvent.change(screen.getByLabelText("الأبجدية Σ"), { target: { value: "a, ε" } });
    fireEvent.click(screen.getByRole("button", { name: "اعتمد الأبجدية" }));
    expect(screen.getByRole("alert").textContent).toBe("«ε» علامة محجوزة في المادة، لا تكون حرفًا في الأبجدية.");
  });
  it("the book's tool bar opens it (its own chunk), with «ملء الشاشة»", async () => {
    render(<StudentToolDock studentTools={courseStudentTools("899271")} />);
    fireEvent.click(screen.getByTestId("student-tools-button"));
    fireEvent.click(screen.getByRole("button", { name: "مختبر الآلات" }));
    await waitFor(() => expect(screen.getByTestId("tool-automataLab")).toBeTruthy());
    expect(within(screen.getByTestId("tool-panel-automataLab")).getByTestId("tool-fullscreen")).toBeTruthy();
  });
});

describe("A4 — the teacher's option", () => {
  it("switching the lab on offers the four machines; a machine can be taken away, never the last one", () => {
    const onChange = vi.fn<(next: StudentToolsSpecV1 | undefined) => void>();
    const r = render(<StudentToolsEditor value={undefined} sections={[]} onChange={onChange} />);
    const last = () => onChange.mock.calls.at(-1)?.[0];
    fireEvent.click(screen.getByRole("checkbox", { name: "مختبر الآلات" }));
    expect(last()).toEqual({ version: 1, tools: [ALL] });
    r.rerender(<StudentToolsEditor value={last()} sections={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "آلة تورنغ" }));
    expect(last()).toEqual({ version: 1, tools: [{ id: "automataLab", kinds: ["DFA", "NFA", "PDA"] }] });
    r.rerender(<StudentToolsEditor value={{ version: 1, tools: [{ id: "automataLab", kinds: ["NFA"] }] }} sections={[]} onChange={onChange} />);
    expect((screen.getByRole("checkbox", { name: "أوتومات منتهٍ غير حتمي" }) as HTMLInputElement).disabled).toBe(true);
  });
});
