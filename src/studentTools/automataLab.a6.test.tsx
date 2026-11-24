// @vitest-environment happy-dom
// AUTO-A6 (docs/enterprise-automata-lab-a4.md §8) — the closure constructions, «أدوات الكلمات», «حفظ صورة» and the exam levels:
//   • the BOOK is the oracle: the lab's «الاتحاد بحالة بداية جديدة», «التسلسل» and «العكس» on unit 7's machines ARE the machines the
//     book shows under those titles (its content), and each accepts exactly the language of its construction (every word up to 6);
//   • a machine with ε: the empty word is followed through ε (the book's machines have none); two machines that share state names are
//     named apart (p0, p1, …, as the book names them);
//   • «أدوات الكلمات» by the book's definitions (unit 1's own task: w = 01102);
//   • the contract's `level` (additive within version 1): absent = everything; "noAlgorithms"; "runOnly" — closed values; the tool
//     hides what the level takes away and numbers its sections without a gap; the teacher's editor sets it;
//   • «حفظ صورة» above the lab's drawing.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import { readAutomatonConfig, type FaMachine, type Machine } from "../learning/activities/automaton";
import { concatenation, equivalence, reversal, unionByNewStart } from "./automataAlgorithms";
import { languageUpTo } from "./automataLab";
import { wordFacts } from "./automataWords";
import { validateStudentTools, type StudentToolsSpecV1 } from "./studentToolsSpec";
import AutomataLabTool from "./AutomataLabTool";
import StudentToolsEditor from "./StudentToolsEditor";
// @ts-expect-error — the book's authoring helpers (plain ES modules of the build, no types)
import { dfa } from "../../scripts/automata-course/dsl.mjs";
// @ts-expect-error — idem
import { STARTS_AB, EVEN } from "../../scripts/automata-course/u07.mjs";

afterEach(cleanup);
const MODULES = import.meta.glob("../learning/content/899271/modules/*.ts", { eager: true }) as Record<string, { default: unknown }>;
const read = (automaton: unknown): Machine => { const c = readAutomatonConfig({ automaton }); if (!c) throw new Error("not a machine"); return c.machine; };
function bookMachine(title: string): Machine {
  let found: Machine | null = null;
  const walk = (node: unknown) => {
    if (found || !node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const o = node as Record<string, unknown>;
    if (o.simulationType === "automaton-trace" && o.title === title) { const c = readAutomatonConfig(o.config); if (c) found = c.machine; }
    for (const v of Object.values(o)) if (v && typeof v === "object") walk(v);
  };
  for (const mod of Object.values(MODULES)) walk(mod.default);
  if (!found) throw new Error("the book has no machine «" + title + "»");
  return found;
}
const shape = (m: Machine) => ({ kind: m.kind, states: m.states, alphabet: m.alphabet, start: m.start, accept: [...m.accept].sort(),
  transitions: (m as FaMachine).transitions.map(t => t.from + " " + t.symbol + " " + t.to).sort() });
const ok = (r: ReturnType<typeof reversal>) => { if (!r.ok) throw new Error(r.message); return r.machine; };
// unit 7's two machines the book does not export (copied from scripts/automata-course/u07.mjs)
const ENDS_A = dfa({ states: ["q0", "q1"], alphabet: ["a", "b"], accept: ["q1"], t: ["q0 a q1", "q0 b q0", "q1 a q1", "q1 b q0"] });
const STARTS_B = dfa({ states: ["p0", "p1", "p2"], alphabet: ["a", "b"], start: "p0", accept: ["p1"], t: ["p0 b p1", "p0 a p2", "p1 a,b p1", "p2 a,b p2"] });
const upTo6 = (alphabet: string[]) => { const out = [""]; let layer = [""]; for (let n = 1; n <= 6; n++) { layer = layer.flatMap(w => alphabet.map(s => w + s)); out.push(...layer); } return out; };
const accepted = (m: Machine) => languageUpTo(m, 6).accepted;

describe("A6 — the book's closure constructions", () => {
  it("«الاتحاد بحالة بداية جديدة»: STARTS_AB ∪ EVEN IS the book's machine, and accepts L1 ∪ L2", () => {
    const m = ok(unionByNewStart(read(STARTS_AB), read(EVEN)));
    expect(shape(m)).toEqual(shape(bookMachine("أوتومات الاتحاد بحالة بداية جديدة (غير حتمي)")));
    expect(accepted(m)).toEqual(upTo6(["a", "b"]).filter(w => w.startsWith("ab") || w.length % 2 === 0).slice(0, 200));
  });
  it("«التسلسل»: ENDS_A · STARTS_B IS the book's machine, and accepts L1 · L2", () => {
    const m = ok(concatenation(read(ENDS_A), read(STARTS_B)));
    expect(shape(m)).toEqual(shape(bookMachine("أوتومات التسلسل L1 · L2 (غير حتمي)")));
    const splits = (w: string) => Array.from({ length: w.length + 1 }, (_, i) => [w.slice(0, i), w.slice(i)]).some(([x, y]) => x.endsWith("a") && y.startsWith("b"));
    expect(accepted(m)).toEqual(upTo6(["a", "b"]).filter(splits).slice(0, 200));
  });
  it("«العكس»: the book's two reversals (STARTS_AB → ends with ba; ENDS_A → starts with a)", () => {
    const r1 = ok(reversal(read(STARTS_AB))), r2 = ok(reversal(read(ENDS_A)));
    expect(shape(r1)).toEqual(shape(bookMachine("أوتومات العكس (غير حتمي): تنتهي بـ ba")));
    expect(shape(r2)).toEqual(shape(bookMachine("جرّب: أوتومات العكس")));
    expect(accepted(r1)).toEqual(upTo6(["a", "b"]).filter(w => w.endsWith("ba")).slice(0, 200));
  });
  it("ε is followed: a machine that accepts ε only through an ε arrow makes the new start accepting (union, reversal) and keeps the first's accepting states (concatenation)", () => {
    const epsAcc = read({ kind: "NFA", states: ["q0", "q1"], alphabet: ["a"], start: "q0", accept: ["q1"], transitions: [["q0", "ε", "q1"], ["q1", "a", "q1"]] });   // a*
    const aOnly = read({ kind: "DFA", states: ["s0", "s1"], alphabet: ["a"], start: "s0", accept: ["s1"], transitions: [["s0", "a", "s1"]] });                    // a
    const u = ok(unionByNewStart(aOnly, epsAcc));
    expect(u.accept).toContain("q0new");
    expect(equivalence(u, epsAcc)).toEqual({ equal: true });                       // a ∪ a* = a*
    expect(equivalence(ok(concatenation(aOnly, epsAcc)), read({ kind: "DFA", states: ["t0", "t1"], alphabet: ["a"], start: "t0", accept: ["t1"], transitions: [["t0", "a", "t1"], ["t1", "a", "t1"]] }))).toEqual({ equal: true });   // a · a* = a⁺
    expect(ok(reversal(epsAcc)).accept).toContain("q0new");
  });
  it("two machines with the same state names: the second is named apart (p0, p1 …), said in the summary; the language is still L1 ∪ L2", () => {
    const r = unionByNewStart(read(ENDS_A), read(ENDS_A));
    if (!r.ok) throw new Error(r.message);
    expect(r.machine.states).toEqual(["q0new", "q0", "q1", "p0", "p1"]);
    expect(r.summary).toMatch(/^سُمّيت حالات الآلة الثانية من جديد/);
    expect(equivalence(r.machine, read(ENDS_A))).toEqual({ equal: true });
  });
});

describe("A6 — «أدوات الكلمات» (unit 1)", () => {
  it("the book's task: w = 01102 — its length, prefixes and suffixes (ε and w included), subwords, counts, reverse", () => {
    const r = wordFacts("01102");
    if (!r.ok) throw new Error(r.message);
    expect(r.facts).toEqual({
      symbols: ["0", "1", "1", "0", "2"], length: 5, counts: [{ symbol: "0", count: 2 }, { symbol: "1", count: 2 }, { symbol: "2", count: 1 }],
      prefixes: ["", "0", "01", "011", "0110", "01102"], suffixes: ["", "2", "02", "102", "1102", "01102"],
      subwords: ["", "0", "1", "2", "01", "11", "10", "02", "011", "110", "102", "0110", "1102", "01102"], reverse: "20110",
    });
    expect(wordFacts("ab c")).toMatchObject({ ok: true, facts: { length: 3 } });            // spaces are not symbols
    expect(wordFacts("ε")).toMatchObject({ ok: true, facts: { length: 0, prefixes: [""], subwords: [""] } });
    expect(wordFacts("aεb").ok).toBe(false);
    expect(wordFacts("a".repeat(21)).ok).toBe(false);
  });
});

describe("A6 — the exam levels", () => {
  it("the contract: `level` absent, \"noAlgorithms\" or \"runOnly\" (closed); canonical without it when it does not restrict", () => {
    const tool = (level?: unknown) => ({ id: "automataLab", kinds: ["DFA"], ...(level === undefined ? {} : { level }) });
    expect(validateStudentTools({ version: 1, tools: [tool()] })).toMatchObject({ ok: true, value: { tools: [{ id: "automataLab", kinds: ["DFA"] }] } });
    for (const l of ["noAlgorithms", "runOnly"]) expect(validateStudentTools({ version: 1, tools: [tool(l)] })).toMatchObject({ ok: true, value: { tools: [tool(l)] } });
    for (const l of ["all", "", null, true]) expect(validateStudentTools({ version: 1, tools: [tool(l)] }).ok, String(l)).toBe(false);
  });
  const headings = () => screen.getAllByRole("heading", { level: 3 }).map(h => h.textContent);
  it("everything (the book): ten sections numbered in order, «حفظ صورة» above the drawing", () => {
    render(<AutomataLabTool config={{ id: "automataLab", kinds: ["DFA"] }} />);
    expect(headings()).toEqual(["١. الآلة", "٢. الحالات", "٣. الانتقالات", "٤. الفحوص", "٥. الرسم والتشغيل خطوة خطوة", "٦. كلمات كثيرة معًا", "٧. لغة آلتي", "٨. آلاتي", "٩. الخوارزميات خطوة خطوة", "١٠. أدوات الكلمات"]);
    expect(screen.getByTestId("save-drawing").textContent).toBe("حفظ صورة");
  });
  it("\"noAlgorithms\": no «آلاتي», no algorithms, no word tools; the checks and «لغة آلتي» stay", () => {
    render(<AutomataLabTool config={{ id: "automataLab", kinds: ["DFA"], level: "noAlgorithms" }} />);
    expect(headings()).toEqual(["١. الآلة", "٢. الحالات", "٣. الانتقالات", "٤. الفحوص", "٥. الرسم والتشغيل خطوة خطوة", "٦. كلمات كثيرة معًا", "٧. لغة آلتي"]);
    expect(screen.queryByRole("button", { name: "المتمّم" })).toBeNull();
  });
  it("\"runOnly\": build, draw and run; no «لغة آلتي», and the checks say only whether the machine is ready", () => {
    render(<AutomataLabTool config={{ id: "automataLab", kinds: ["DFA"], level: "runOnly" }} />);
    expect(headings()).toEqual(["١. الآلة", "٢. الحالات", "٣. الانتقالات", "٤. الفحوص", "٥. الرسم والتشغيل خطوة خطوة", "٦. كلمات كثيرة معًا"]);
    expect(screen.queryByRole("button", { name: "أضف حالة مصيدة" })).toBeNull();
    expect(screen.getByText("✓ الآلة جاهزة للتشغيل.")).toBeTruthy();
  });
  it("the teacher's editor: «ما يتاح في المختبر» sets and clears the level", () => {
    const onChange = vi.fn<(next: StudentToolsSpecV1 | undefined) => void>();
    const r = render(<StudentToolsEditor value={{ version: 1, tools: [{ id: "automataLab", kinds: ["DFA"] }] }} sections={[]} onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox", { name: "ما يتاح في المختبر" }), { target: { value: "runOnly" } });
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ version: 1, tools: [{ id: "automataLab", kinds: ["DFA"], level: "runOnly" }] });
    r.rerender(<StudentToolsEditor value={{ version: 1, tools: [{ id: "automataLab", kinds: ["DFA"], level: "runOnly" }] }} sections={[]} onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox", { name: "ما يتاح في المختبر" }), { target: { value: "all" } });
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ version: 1, tools: [{ id: "automataLab", kinds: ["DFA"] }] });
  });
});

describe("A6 — in the tool", () => {
  it("«العكس» opens as a non-deterministic automaton; «أدوات الكلمات» lists the prefixes with ε", () => {
    render(<AutomataLabTool config={{ id: "automataLab", kinds: ["DFA", "NFA", "PDA", "TM"] }} />);
    fireEvent.click(screen.getByRole("button", { name: /^افتح مثالًا: عدد a زوجي/ }));
    const algos = screen.getByRole("heading", { name: /الخوارزميات خطوة خطوة/ }).closest("section") as HTMLElement;
    fireEvent.click(within(algos).getByRole("button", { name: "العكس" }));
    fireEvent.click(within(algos).getByRole("button", { name: "افتح الناتج في المحرر" }));
    expect((screen.getByRole("radio", { name: "أوتومات منتهٍ غير حتمي" }) as HTMLInputElement).checked).toBe(true);
    const words = screen.getByRole("heading", { name: /أدوات الكلمات/ }).closest("section") as HTMLElement;
    fireEvent.change(within(words).getByLabelText(/^الكلمة w/), { target: { value: "abc" } });
    fireEvent.click(within(words).getByRole("button", { name: "حلّل الكلمة" }));
    expect(within(words).getByText("البادئات (4)")).toBeTruthy();
    expect(within(words).getAllByText("ε").length).toBeGreaterThanOrEqual(3);   // a prefix, a suffix and a subword
  });
});
