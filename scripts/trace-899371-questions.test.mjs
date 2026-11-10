// 899371 enrichment P13 (docs/enterprise-899371-enrichment-plan.md §9) — the pure parts of the question-trace recorder:
//   • runSource: the source that runs and how many of its lines come before the page's first line — top-level code, a Main without a
//     class, a whole program, a fragment with its hidden setup, a method with its hidden Main — so a recorded line IS the page's line;
//   • keepSteps: only the page's own lines are kept (hidden setup / Main lines are not shown), each with its sentence;
//   • noteFor (scripts/lib/trace-notes.mjs): the sentence says what the recorded run did — a condition and its value, what changed, what
//     was printed, a call and its arguments, a returned value — with code in direction isolates.
import { describe, it, expect } from "vitest";
import { runSource, keepSteps, runSha } from "./trace-899371-questions.mjs";
import { noteFor, show, LRI, FSI, PDI } from "./lib/trace-notes.mjs";

const lineOf = (source, offset, k) => source.split("\n")[offset + k - 1].trim();
const v = s => ({ t: "v", s });
const step = (over = {}) => ({ line: 1, kind: "expr", frames: [{ name: "Main", vars: [] }], eval: [], heap: [], out: "", ...over });
const strip = s => s.replace(new RegExp("[" + LRI + FSI + PDI + "]", "g"), "");

describe("runSource — a recorded line is the page's line", () => {
  it.each([
    ["top-level statements", { program: "int x = 5;\nConsole.WriteLine(x);" }],
    ["a Main without a class", { program: "static void Main()\n{\n    Console.WriteLine(1);\n}" }],
    ["a whole program", { program: "class Program\n{\n    static void Main()\n    {\n        Console.WriteLine(1);\n    }\n}" }],
    ["a fragment with its hidden setup", { program: "x = x + 1;\nConsole.WriteLine(x);", setup: "int x = 4;\nint y = 0;" }],
    ["a method with its hidden Main", { program: "static int F(int a)\n{\n    return a * 2;\n}", programKind: "method", call: "int r = F(5);" }],
    ["a method with a hidden member", { program: "static int G()\n{\n    return H();\n}", programKind: "method", call: "int r = G();", extra: "static int H() { return 3; }" }],
  ])("%s", (_what, t) => {
    const { source, offset } = runSource(t);
    const lines = t.program.split("\n");
    for (let k = 1; k <= lines.length; k++) expect(lineOf(source, offset, k)).toBe(lines[k - 1].trim());
    if (t.setup) expect(source).toContain(t.setup.split("\n")[0]);
    if (t.call) expect(source).toMatch(/static void Main\(\)\n\s*\{\n\s*int r = /);
  });
  it("the sha binds the source AND the input", () => {
    expect(runSha("a", "1")).not.toBe(runSha("a", "2"));
    expect(runSha("a", undefined)).toBe(runSha("a", ""));
    expect(runSha("a", "")).not.toBe(runSha("b", ""));
  });
});

describe("keepSteps — only the page's own lines, each with its sentence", () => {
  it("drops hidden lines (≤ 0, beyond the page) and writes a sentence from the previous KEPT step", () => {
    const kept = keepSteps([
      step({ line: -1, kind: "decl", frames: [{ name: "Main", vars: [["x", v("4")]] }] }),
      step({ line: 1, kind: "expr", frames: [{ name: "Main", vars: [["x", v("5")]] }] }),
      step({ line: 9, kind: "expr", frames: [{ name: "Main", vars: [["x", v("6")]] }] }),
      step({ line: 2, kind: "expr", frames: [{ name: "Main", vars: [["x", v("5")]] }], out: "5\n" }),
    ], 2);
    expect(kept.map(s => s.line)).toEqual([1, 2]);
    expect(kept.map(s => strip(s.note))).toEqual(["متغير جديد x = 5.", "يطبع «5» ثم ينتقل إلى سطر جديد."]);
    expect(Object.keys(kept[0]).sort()).toEqual(["eval", "frames", "heap", "line", "note", "out"]);
  });
});

describe("noteFor — the sentence says what the run did", () => {
  it.each([
    ["an if, true", step({ kind: "if", eval: [["a > b", v("True")]] }), "الشرط a > b قيمته True، فيُنفَّذ ما بداخل if."],
    ["an if, false", step({ kind: "if", eval: [["a > b", v("False")]] }), "الشرط a > b قيمته False، فلا يُنفَّذ ما بداخل if."],
    ["an else if, false", step({ kind: "elseif", eval: [["m >= 75", v("False")]] }), "الشرط m >= 75 قيمته False، فننتقل إلى ما بعده."],
    ["a loop, true", step({ kind: "for", eval: [["i <= 3", v("True")]] }), "شرط الحلقة i <= 3 قيمته True: دورة جديدة."],
    ["a loop, false", step({ kind: "while", eval: [["n > 0", v("False")]] }), "شرط الحلقة n > 0 قيمته False: تنتهي الحلقة."],
    ["a do-while, true", step({ kind: "do", eval: [["k < 2", v("True")]] }), "شرط do … while k < 2 قيمته True: نعود إلى بداية الحلقة."],
    ["a switch", step({ kind: "switch", eval: [["day", v("3")]] }), "switch يختار الحالة 3."],
    ["a call", step({ kind: "enter", frames: [{ name: "Main", vars: [] }, { name: "F", vars: [["a", v("5")], ["s", { t: "str", s: "hi" }]] }] }), "استدعاء F، والمعاملات: a = 5، s = \"hi\"."],
    ["a return", step({ kind: "return", frames: [{ name: "Main", vars: [] }, { name: "F", vars: [] }], eval: [["return a * 2", v("10")]] }), "F تعيد القيمة 10."],
    ["a print without a new line", step({ out: "2 " }), "يطبع «2 »."],
    ["a print of two lines", step({ out: "a\nb\n" }), "يطبع «a ⏎ b» ثم ينتقل إلى سطر جديد."],
    ["an empty line", step({ out: "\n" }), "ينتقل إلى سطر جديد."],
    ["nothing visible", step({}), "يُنفَّذ هذا السطر."],
  ])("%s", (_what, s, sentence) => {
    expect(strip(noteFor(s, null))).toBe(sentence);
  });

  it("what changed since the step before, in the same frame; a field of an object; the loop counter on a condition step", () => {
    const prev = step({ frames: [{ name: "Main", vars: [["i", v("1")], ["s", v("0")]] }], heap: [{ id: 1, type: "P", fields: [["age", v("3")]] }], out: "x" });
    const now = step({ kind: "for", eval: [["i <= 3", v("True")]], frames: [{ name: "Main", vars: [["i", v("2")], ["s", v("0")]] }], heap: [{ id: 1, type: "P", fields: [["age", v("4")]] }], out: "x" });
    expect(strip(noteFor(now, prev))).toBe("شرط الحلقة i <= 3 قيمته True: دورة جديدة. i صار 2. age في الكائن #1 صار 4.");
    const assign = step({ frames: [{ name: "Main", vars: [["i", v("1")], ["s", v("5")]] }], out: "x" });
    expect(strip(noteFor(assign, prev))).toBe("s صار 5.");
  });

  it("code sits in a left-to-right isolate and printed text in a first-strong one", () => {
    const n = noteFor(step({ kind: "if", eval: [["x > 0", v("True")]], out: "عمرك 17\n" }), null);
    expect(n).toContain(LRI + "x > 0" + PDI);
    expect(n).toContain("«" + FSI + "عمرك 17" + PDI + "»");
    expect(show({ t: "arr", items: [v("1"), { t: "char", s: "a" }, { t: "null" }] })).toBe("{1, 'a', null}");
    expect(show({ t: "mat", rows: [["1", "2"], ["3", "4"]] })).toBe("{{1, 2}, {3, 4}}");
  });
});
