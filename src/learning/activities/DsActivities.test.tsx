// @vitest-environment happy-dom
// DS-A1 — the three data-structure activities through the real activity host: exact registry identity and lazy load;
//   • simulation/ds-trace/v1 — stepping, the marked line, the note with its code runs, the drawn structure, the call stack, the
//     output, the closing step of a hidden driver, the shell's reset, an unreadable config;
//   • simulation/ds-lab/v1 — a stack, a queue, a chain of cells and a binary search tree worked with the class's operations: the
//     drawing, the C# statement of every operation, and an operation the class forbids refused with its reason;
//   • interactive-diagram/ds-figure/v1 — panels drawn from data, a tree's facts.
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import LearningActivityHost from "./LearningActivityHost";
import { productionActivityRegistry } from "./engine";
import type { InteractiveDiagramBlock, SimulationBlock } from "../content/types";

afterEach(() => { cleanup(); });

const ref = (id: number) => ({ t: "ref", id });
const TRACE = {
  code: "public static int Size(Stack<int> s)\n{\n    if (s.IsEmpty())\n        return 0;\n    s.Pop();\n    return 1 + Size(s);\n}",
  given: "الراصّة `s = [7]`.",
  out: "1\n",
  steps: [
    { l: 1, n: "تبدأ العملية `Size` مع `s` = الراصّة `[7]`.", o: 0, f: [{ name: "Main", vars: [["s", ref(1)]] }, { name: "Size", vars: [["s", ref(1)]] }], h: [{ id: 1, k: "stack", items: ["7"] }] },
    { l: 3, n: "الشرط `s.IsEmpty()` خطأ: نتخطّى ما بعد `if`.", o: 0 },
    { l: 5, n: "نخرج `7` من رأس الراصّة `s`.", o: 0, h: [{ id: 1, k: "stack", items: [] }] },
    { l: 1, n: "تبدأ العملية `Size` مع `s` = الراصّة `[]`.", o: 0, f: [{ name: "Main", vars: [["s", ref(1)]] }, { name: "Size", vars: [["s", ref(1)]] }, { name: "Size", vars: [["s", ref(1)]] }] },
    { l: 4, n: "العملية `Size` تُعيد `0`.", o: 0 },
    { l: 6, n: "العملية `Size` تُعيد `1`.", o: 0, f: [{ name: "Main", vars: [["s", ref(1)]] }, { name: "Size", vars: [["s", ref(1)]] }] },
    { l: 0, n: "نطبع: `1`. انتهى التنفيذ.", o: 2, f: [{ name: "Main", vars: [["s", ref(1)], ["n", { t: "v", s: "1" }]] }] },
  ],
};
const sim = (key: string, config: Record<string, unknown>): SimulationBlock => ({
  id: "ds", type: "simulation", origin: "teacher-enrichment", simulationType: key, version: 1, title: "نشاط",
  capabilities: { fullscreen: true, reset: true, interactive: true }, config,
});
const fig = (config: Record<string, unknown>): InteractiveDiagramBlock => ({
  id: "fg", type: "interactive-diagram", origin: "teacher-enrichment", interactionType: "ds-figure", version: 1, title: "رسم", capabilities: { fullscreen: true }, config,
});
const mount = async (b: SimulationBlock | InteractiveDiagramBlock) => {
  const r = render(<LearningActivityHost block={b} courseId="DS" />);
  await waitFor(() => { if (!r.container.querySelector(".learning-ds, .learning-trace-empty")) throw new Error("not yet"); });
  return r;
};
const btn = (name: string | RegExp) => screen.getByRole("button", { name });
const note = (c: HTMLElement) => c.querySelector(".learning-trace-note")!.textContent!.replace(/\s+/g, " ").trim();
const drawings = (c: HTMLElement) => [...c.querySelectorAll(".learning-ds-svg")].map(s => s.getAttribute("aria-label"));
const log = (c: HTMLElement) => [...c.querySelectorAll(".learning-ds-log .learning-trace-linecode")].map(l => l.textContent);
const type = (c: HTMLElement, text: string) => fireEvent.change(c.querySelector(".learning-ds-field input")!, { target: { value: text } });

describe("registry identity", () => {
  it("resolves the three activities by exact family, key and version", () => {
    for (const key of ["ds-trace", "ds-lab"]) {
      const b = sim(key, {});
      expect(productionActivityRegistry.resolve(b)?.key).toBe(key);
      expect(productionActivityRegistry.resolve({ ...b, version: 2 })).toBeUndefined();
    }
    expect(productionActivityRegistry.resolve(fig({}))?.key).toBe("ds-figure");
    expect(productionActivityRegistry.resolve(sim("ds-figure", {}))).toBeUndefined();      // the figure is an interactive-diagram, not a simulation
  });
});

describe("simulation/ds-trace/v1", () => {
  it("starts at the first step: the line marked, the note with its code runs left-to-right, the structure drawn, the given shown", async () => {
    const { container } = await mount(sim("ds-trace", TRACE));
    expect(container.querySelectorAll(".learning-trace-line")).toHaveLength(7);
    expect(container.querySelector(".learning-trace-line.is-current .learning-trace-lineno")!.textContent).toBe("1");
    expect(container.querySelector('.learning-trace-line[aria-current="step"]')).toBeTruthy();
    expect(note(container)).toBe("السطر 1: تبدأ العملية Size مع s = الراصّة [7].");
    expect([...container.querySelectorAll(".learning-trace-note code")].map(c => [c.textContent, c.getAttribute("dir")])).toEqual([["Size", "ltr"], ["s", "ltr"], ["[7]", "ltr"]]);
    expect(drawings(container)).toEqual(["الراصّة s: من الرأس إلى القاع: 7"]);
    expect(container.querySelector(".learning-ds-given")!.textContent).toContain("المعطى:");
    expect((btn("الخطوة السابقة") as HTMLButtonElement).disabled).toBe(true);
  });
  it("steps forward: the stack empties, the call stack grows with the running method on top, the changed name is marked", async () => {
    const { container } = await mount(sim("ds-trace", TRACE));
    fireEvent.click(btn("الخطوة التالية")); fireEvent.click(btn("الخطوة التالية"));
    expect(note(container)).toBe("السطر 5: نخرج 7 من رأس الراصّة s.");
    expect(drawings(container)).toEqual(["الراصّة s: فارغة"]);
    expect(container.querySelector(".learning-ds-box.is-changed")).toBeTruthy();
    fireEvent.click(btn("الخطوة التالية"));
    const frames = [...container.querySelectorAll(".learning-trace-frame")];
    expect(frames.map(f => f.querySelector(".learning-trace-framename")!.textContent)).toEqual(["Size — تعمل الآن", "Size", "Main"]);
    expect(frames[0].classList.contains("is-top")).toBe(true);
    expect(container.querySelector(".learning-trace-memory h4")!.textContent).toBe("مكدّس الاستدعاءات والمتغيّرات");
    expect(frames[0].querySelector(".learning-trace-box")!.textContent).toBe("→ راصّة []");
  });
  it("ends on the hidden driver's closing step: no line marked, the output printed, «التالية» disabled; «السابقة» goes back", async () => {
    const { container } = await mount(sim("ds-trace", TRACE));
    for (let i = 0; i < 6; i++) fireEvent.click(btn("الخطوة التالية"));
    expect(container.querySelector(".learning-trace-line.is-current")).toBeNull();
    expect(note(container)).toBe("نطبع: 1. انتهى التنفيذ.");
    expect(container.querySelector(".learning-trace-out")!.textContent).toBe("1\n");
    expect(container.querySelector(".learning-trace-var.is-changed .learning-trace-name")!.textContent).toBe("n");
    expect((btn("الخطوة التالية") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(btn("الخطوة السابقة"));
    expect(note(container)).toBe("السطر 6: العملية Size تُعيد 1.");
    expect(container.querySelector(".learning-trace-counter")!.textContent!.replace(/\s+/g, " ")).toBe("الخطوة 6 / 7");
  });
  it("the shell's reset returns to the first step", async () => {
    const { container } = await mount(sim("ds-trace", TRACE));
    fireEvent.click(btn("الخطوة التالية")); fireEvent.click(btn("الخطوة التالية"));
    fireEvent.click(btn("إعادة تعيين"));
    expect(note(container)).toContain("السطر 1:");
  });
  it("draws a chain with the names pointing at its cells, and a tree", async () => {
    const steps = [{ l: 1, n: "x", o: 0, f: [{ name: "Main", vars: [["chain", ref(1)], ["pos", ref(2)], ["bt", ref(5)]] }],
      h: [{ id: 1, k: "node", v: "13", next: 2 }, { id: 2, k: "node", v: "15", next: null }, { id: 3, k: "bin", v: "3", l: null, r: null }, { id: 5, k: "bin", v: "5", l: 3, r: null }] }];
    const { container } = await mount(sim("ds-trace", { code: "x;", out: "", steps }));
    expect(drawings(container)).toEqual(["سلسلة خلايا: 13 (يشير إليها chain) ثم 15 (يشير إليها pos) ثم null", "شجرة ثنائية جذرها 5. الخلية 5: ابنها الأيسر 3"]);
  });
  it("a run-time error step is said in words, in the error style", async () => {
    const { container } = await mount(sim("ds-trace", { ...TRACE, steps: [TRACE.steps[0], { l: 5, n: "خطأ في التشغيل: Pop من راصّة فارغة. البرنامج يتوقف هنا.", o: 0, e: true }] }));
    fireEvent.click(btn("الخطوة التالية"));
    expect(container.querySelector(".learning-trace-note.learning-ds-error")!.textContent).toContain("خطأ في التشغيل");
  });
  it("an unreadable config shows a short note instead of guessing", async () => {
    const { container } = await mount(sim("ds-trace", { code: "x;", out: "", steps: [{ l: 9, n: "x", o: 0, f: [], h: [] }] }));
    expect(container.querySelector(".learning-trace-empty")!.textContent).toBe("هذا النشاط التفاعلي غير متوفر حاليًا.");
  });
});

describe("simulation/ds-lab/v1 — a stack", () => {
  it("Push / Pop / Top / IsEmpty change the drawing and write the C# statement; the last in is the first out", async () => {
    const { container } = await mount(sim("ds-lab", { structure: "stack", values: [1, 2, 3], name: "s" }));
    expect(drawings(container)).toEqual(["الراصّة s: من الرأس إلى القاع: 3، 2، 1"]);
    type(container, "9"); fireEvent.click(btn(/^Push/));
    expect(drawings(container)).toEqual(["الراصّة s: من الرأس إلى القاع: 9، 3، 2، 1"]);
    fireEvent.click(btn(/^Top/)); fireEvent.click(btn(/^Pop/)); fireEvent.click(btn("IsEmpty"));
    expect(log(container)).toEqual(["s.Push(9);", "s.Top();   // 9", "s.Pop();   // 9", "s.IsEmpty();   // false"]);
    expect(container.querySelector(".learning-ds-info")!.textContent).toBe("s.ToString() ← [3,2,1]");
    expect((container.querySelector(".learning-ds-field input") as HTMLInputElement).value).toBe("");
  });
  it("Pop on an empty stack is refused with the reason and changes nothing; so is Push without a value", async () => {
    const { container } = await mount(sim("ds-lab", { structure: "stack" }));
    fireEvent.click(btn(/^Pop/));
    expect(note(container)).toContain("الراصّة فارغة: لا يجوز استدعاء Pop");
    expect(container.querySelector(".learning-trace-note.learning-ds-error")).toBeTruthy();
    fireEvent.click(btn(/^Push/));
    expect(note(container)).toContain("اكتب قيمة أولًا");
    type(container, "abc"); fireEvent.click(btn(/^Push/));
    expect(note(container)).toContain("اكتب قيمة أولًا");
    expect(log(container)).toEqual([]);
    expect(drawings(container)).toEqual(["الراصّة s: فارغة"]);
  });
  it("holds at most eight values, and the shell's reset restores the block's stack", async () => {
    const { container } = await mount(sim("ds-lab", { structure: "stack", values: [1, 2, 3, 4, 5, 6, 7, 8] }));
    type(container, "9"); fireEvent.click(btn(/^Push/));
    expect(note(container)).toContain("المختبر يتّسع لـ 8 قيم");
    fireEvent.click(btn(/^Pop/)); fireEvent.click(btn(/^Pop/));
    fireEvent.click(btn("إعادة تعيين"));
    expect(drawings(container)).toEqual(["الراصّة s: من الرأس إلى القاع: 8، 7، 6، 5، 4، 3، 2، 1"]);
    expect(log(container)).toEqual([]);
  });
});

describe("simulation/ds-lab/v1 — a queue, a chain, a search tree", () => {
  it("a queue: the first in is the first out; chars are written as C# chars", async () => {
    const { container } = await mount(sim("ds-lab", { structure: "queue", valueType: "char", values: ["a", "b"], name: "q" }));
    type(container, "c"); fireEvent.click(btn(/^Insert/));
    fireEvent.click(btn(/^Remove/)); fireEvent.click(btn(/^Head/));
    expect(drawings(container)).toEqual(["الدور q: من الرأس إلى الذيل: b، c"]);
    expect(log(container)).toEqual(["q.Insert('c');", "q.Remove();   // a", "q.Head();   // b"]);
  });
  it("a chain: add at the start, move p, insert after p, delete the cell after p, delete the first", async () => {
    const { container } = await mount(sim("ds-lab", { structure: "chain", values: [13, 15, 17], name: "chain" }));
    fireEvent.click(btn("أدخِل بعد p"));
    expect(note(container)).toContain("p لا يشير إلى خلية");
    type(container, "9"); fireEvent.click(btn("أضف في البداية"));
    fireEvent.click(btn("p = chain")); fireEvent.click(btn("p = p.GetNext()"));
    type(container, "14"); fireEvent.click(btn("أدخِل بعد p"));
    expect(drawings(container)).toEqual(["سلسلة خلايا: 9 (يشير إليها chain) ثم 13 (يشير إليها p) ثم 14 ثم 15 ثم 17 ثم null"]);
    fireEvent.click(btn("احذف التي بعد p")); fireEvent.click(btn("احذف الأولى"));
    expect(drawings(container)).toEqual(["سلسلة خلايا: 13 (يشير إليها chain, p) ثم 15 ثم 17 ثم null"]);
    expect(log(container)).toEqual(["chain = new Node<int>(9, chain);", "p = chain;", "p = p.GetNext();", "p.SetNext(new Node<int>(14, p.GetNext()));", "p.SetNext(p.GetNext().GetNext());", "chain = chain.GetNext();"]);
  });
  it("a chain: p walks off the end to null, and GetNext on null is refused", async () => {
    const { container } = await mount(sim("ds-lab", { structure: "chain", values: [5] }));
    fireEvent.click(btn("p = chain")); fireEvent.click(btn("p = p.GetNext()"));
    expect(note(container)).toContain("فصارت null");
    fireEvent.click(btn("p = p.GetNext()"));
    expect(note(container)).toContain("خطأ في التشغيل");
  });
  it("a binary search tree: insert follows the comparisons, search reports the path, delete names its case, a traversal numbers the visits", async () => {
    const { container } = await mount(sim("ds-lab", { structure: "bst", tree: [50, [30, 10, 40], [70, 60, 80]], name: "bt" }));
    expect(container.querySelector(".learning-ds-info")!.textContent).toBe("عدد الخلايا: 7 · الارتفاع: 2 · الأوراق: 10 40 60 80");
    type(container, "65"); fireEvent.click(btn("أدخِل قيمة"));
    expect(note(container)).toBe("نبدأ من الجذر: 65 > 50 يمينًا، 65 < 70 يسارًا، 65 > 60 يمينًا. وصلنا إلى مكان فارغ: 65 صارت الابن الأيمن للخلية 60.");
    type(container, "65"); fireEvent.click(btn("أدخِل قيمة"));
    expect(note(container)).toContain("لا نُدخلها مرتين");
    type(container, "40"); fireEvent.click(btn("ابحث عن قيمة"));
    expect(note(container)).toContain("وجدنا 40 بعد 3 مقارنات");
    type(container, "50"); fireEvent.click(btn("احذف قيمة"));
    expect(note(container)).toContain("ابنان: نضع مكانها أصغر قيمة في شجرتها الفرعية اليمنى (60)");
    fireEvent.click(btn("تمشيط داخلي"));
    expect(note(container)).toContain("10 30 40 60 65 70 80");
    expect([...container.querySelectorAll(".learning-ds-order")].map(o => o.textContent).sort()).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    expect(log(container)).toEqual(["InsertIntoBST(bt, 65);", "ExistsInBST(bt, 40);   // true", "bt = DeleteFromBST(bt, 50);", "InOrder(bt);   // 10 30 40 60 65 70 80"]);
  });
  it("a plain binary tree: choose a cell, add a child, delete a leaf", async () => {
    const { container } = await mount(sim("ds-lab", { structure: "tree", tree: [5, 3, null], name: "bt" }));
    fireEvent.click(btn("أضف ابنًا أيمن"));
    expect(note(container)).toContain("اختر خلية أولًا");
    fireEvent.change(screen.getByRole("combobox", { name: "الخلية المختارة" }), { target: { value: "1" } });
    type(container, "7"); fireEvent.click(btn("أضف ابنًا أيمن"));
    expect(drawings(container)[0]).toBe("شجرة ثنائية جذرها 5. الخلية 5: ابنها الأيسر 3، ابنها الأيمن 7");
    type(container, "8"); fireEvent.click(btn("أضف ابنًا أيسر"));
    expect(note(container)).toContain("ابن أيسر من قبل");
    fireEvent.click(btn("احذف الورقة المختارة"));
    expect(note(container)).toContain("ليست ورقة");
  });
  it("an unreadable lab says so", async () => {
    const { container } = await mount(sim("ds-lab", { structure: "bst", tree: [5, 7, 3] }));
    expect(container.querySelector(".learning-trace-empty")).toBeTruthy();
  });
});

describe("interactive-diagram/ds-figure/v1", () => {
  it("draws each panel from data with its caption; a tree lists its facts", async () => {
    const { container } = await mount(fig({ panels: [
      { kind: "stack", items: [4, 3, 2, 1], label: "قبل" },
      { kind: "queue", items: [2, 4] },
      { kind: "chain", items: [13, 15], pointers: [["chain", 0]] },
      { kind: "tree", tree: [5, 3, 7], facts: true },
    ] }));
    expect(drawings(container)).toEqual([
      "راصّة: من الرأس إلى القاع: 4، 3، 2، 1", "دور: من الرأس إلى الذيل: 2، 4",
      "سلسلة خلايا: 13 (يشير إليها chain) ثم 15 ثم null", "شجرة ثنائية جذرها 5. الخلية 5: ابنها الأيسر 3، ابنها الأيمن 7",
    ]);
    expect(container.querySelector(".learning-ds-caption")!.textContent).toBe("قبل");
    expect([...container.querySelectorAll(".learning-ds-facts li")].map(l => l.textContent)).toEqual(["الجذر: 5", "الأوراق: 3 ، 7", "الارتفاع: 1", "عدد الخلايا: 3"]);
  });
  it("an unreadable figure says so", async () => {
    const { container } = await mount(fig({ panels: [] }));
    expect(container.querySelector(".learning-trace-empty")!.textContent).toBe("هذا الرسم غير متوفر حاليًا.");
  });
});
