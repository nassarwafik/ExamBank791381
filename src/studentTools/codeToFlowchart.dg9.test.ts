// DG9 — «ولّد من الكود» for flowcharts (docs/enterprise-diagram-editor-design.md §21): one function of C# or Python drawn as its flowchart.
//   • the readers: C# (comments and strings cannot confuse the braces; if / else if, while, do-while, for, foreach, switch, try) and
//     Python (indentation, elif chains, range(…) in its three forms, loop-else, match, one-line suites, joined lines);
//   • which function: Main / main, else the program's own statements, else the first; the others are named, not drawn;
//   • the steps: inputs (with their prompt left out), outputs in «», declarations without their type, own functions as predefined
//     processes, consecutive steps joined into one box, returns into «انتهِ»;
//   • the arrows: «نعم» / «لا» out of every question, a loop's way back, break / continue to where they go, nothing after a return;
//   • every drawing: a valid diagram@1, on the page, no two shapes overlapping, no arrow through a shape, no «افحص المخطط» finding —
//     a long function too, continued in a second column through a pair of connectors;
//   • the routes a flowchart needs (diagramLayout): back up round the left (out of the bottom when the left is taken), «لا» of a loop
//     round the right, branches joining over a question's top corner.
import { describe, it, expect } from "vitest";
import { codeToFlowchart, detectLanguage, FLOW_LIMITS, isolate, readFunctions, type Stmt } from "./codeToFlowchart";
import { checkDiagram } from "./diagramChecks";
import { DIAGRAM_LIMITS, parseDiagram, serializeDiagram, type DEdge, type DiagramDoc, type DNode } from "./diagramDoc";
import { edgePath, layoutNode, type EdgePath, type NodeBox } from "./diagramLayout";

const boxesOf = (doc: DiagramDoc) => { const m = new Map<string, NodeBox>(); for (const n of doc.nodes) { const b = layoutNode(doc, n); if (b) m.set(n.id, b); } return m; };
const pathsOf = (doc: DiagramDoc) => { const b = boxesOf(doc), m = new Map<string, EdgePath>(); for (const e of doc.edges) { const p = edgePath(doc, e, b); if (p) m.set(e.id, p); } return m; };
const plain = (s: string) => s.replace(/[\u2066\u2069]/g, "");
const draw = (code: string) => { const r = codeToFlowchart(code); if (!r.doc) throw new Error(JSON.stringify(r.problems)); return { ...r, doc: r.doc }; };
const texts = (d: DiagramDoc) => d.nodes.map(n => n.type + ":" + plain(n.text.name ?? ""));
const nameOf = (d: DiagramDoc, id: string) => plain(d.nodes.find(n => n.id === id)!.text.name ?? "");
const arrows = (d: DiagramDoc) => d.edges.map(e => nameOf(d, e.from) + (e.label ? " -" + e.label + "-> " : " -> ") + nameOf(d, e.to));
/** Every rule a generated flowchart keeps. */
function sound(d: DiagramDoc, what: string) {
  expect(parseDiagram(serializeDiagram(d)).ok, what).toBe(true);
  expect(checkDiagram(d), what).toEqual([]);
  const boxes = boxesOf(d);
  const all = [...boxes.values()];
  for (const b of all) {
    expect(b.x, what).toBeGreaterThanOrEqual(0); expect(b.y, what).toBeGreaterThanOrEqual(0);
    expect(b.x + b.w, what).toBeLessThanOrEqual(DIAGRAM_LIMITS.canvasW); expect(b.y + b.h, what).toBeLessThanOrEqual(DIAGRAM_LIMITS.canvasH);
  }
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j];
    expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h, what + ": " + a.node.id + " over " + b.node.id).toBe(false);
  }
  const paths = pathsOf(d);
  for (const e of d.edges) {
    expect(e.route, what).toBe("ortho");
    const pts = paths.get(e.id)!.pts;
    for (const o of all) {
      if (o.node.id === e.from || o.node.id === e.to) continue;
      const through = pts.some((q, k) => k > 0 && Math.max(q[0], pts[k - 1][0]) > o.x && Math.min(q[0], pts[k - 1][0]) < o.x + o.w &&
        Math.max(q[1], pts[k - 1][1]) > o.y && Math.min(q[1], pts[k - 1][1]) < o.y + o.h);
      expect(through, what + ": " + e.id + " through " + o.node.id).toBe(false);
    }
  }
}

const SUM_CS = `using System;
class Program
{
    // { a brace in a comment } and one in a string must not confuse the reader
    static void Main(string[] args)
    {
        Console.Write("How many? {");
        int n = int.Parse(Console.ReadLine());
        int sum = 0, evens = 0;
        for (int i = 1; i <= n; i++)
        {
            if (i % 2 == 0)
            {
                sum += i;
                evens++;
            }
        }
        Console.WriteLine($"Sum = {sum}, evens = {evens}");
    }
}`;
const MAX_PY = `nums = [3, 9, 2, 7]
m = nums[0]
for x in nums:
    if x > m:
        m = x
print("max:", m)
`;
const GUESS_PY = `import random

def main():
    secret = random.randint(1, 10)
    tries = 0
    while True:
        g = int(input("guess: "))
        tries += 1
        if g == secret:
            print("صحيح")
            break
        elif g < secret:
            print("أكبر")
        else:
            print("أصغر")
    print("المحاولات:", tries)

if __name__ == "__main__":
    main()
`;
const MENU_CS = `class Program
{
    static void Main()
    {
        int choice;
        do
        {
            Console.WriteLine("1) Add  2) Show  0) Exit");
            choice = int.Parse(Console.ReadLine());
            switch (choice)
            {
                case 1: AddStudent(); break;
                case 2: ShowAll(); break;
                case 0: Console.WriteLine("Bye"); break;
                default: Console.WriteLine("Wrong choice"); break;
            }
        } while (choice != 0);
    }
    static void AddStudent() { }
    static void ShowAll() { }
}`;
const GRADE_CS = `static string Grade(int mark)
{
    if (mark >= 90) return "A";
    else if (mark >= 80) return "B";
    else if (mark >= 70) return "C";
    return "F";
}`;
const LONG_PY = `def main():
    a = int(input())
    b = int(input())
    c = int(input())
    if a > b:
        print("a > b")
    if b > c:
        print("b > c")
    total = a + b + c
    print(total)
    i = 0
    while i < 3:
        print(i)
        i += 1
    for k in range(10, 0, -2):
        if k % 4 == 0:
            print(k, "÷4")
        else:
            print(k)
    if total > 100:
        print("big")
    elif total > 50:
        print("medium")
    else:
        print("small")
    n = 5
    f = 1
    while n > 1:
        f = f * n
        n -= 1
    print("5! =", f)
    for ch in "abc":
        print(ch)
    if a == b == c:
        print("equal")
    print("end")
`;
const SAMPLES: Record<string, string> = { SUM_CS, MAX_PY, GUESS_PY, MENU_CS, GRADE_CS, LONG_PY };

describe("the readers", () => {
  it("which language: C# by its braces and Console, Python by its def / print / colons", () => {
    expect([SUM_CS, MENU_CS, GRADE_CS, "int x = 1;\nx++;"].map(detectLanguage)).toEqual(["csharp", "csharp", "csharp", "csharp"]);
    expect([MAX_PY, GUESS_PY, LONG_PY, "x = 1\nif x > 0:\n    x = 2"].map(detectLanguage)).toEqual(["python", "python", "python", "python"]);
  });
  it("C#: the statements of Main, with comments gone and strings unable to confuse the braces", () => {
    const r = readFunctions(SUM_CS);
    expect(r.lang).toBe("csharp");
    expect(r.functions.map(f => f.name + "(" + f.params + ")")).toEqual(["Main(string[] args)"]);
    const body = r.functions[0].body;
    expect(body.map(s => s.k)).toEqual(["stmt", "stmt", "stmt", "for", "stmt"]);
    const loop = body[3] as Extract<Stmt, { k: "for" }>;
    expect([loop.init, loop.cond, loop.update]).toEqual([["i = 1"], "i <= n", ["i++"]]);
    expect(loop.body).toMatchObject([{ k: "if", cond: "i % 2 == 0", then: [{ text: "sum += i" }, { text: "evens++" }], else: null }]);
  });
  it("C#: else if, while, do-while, foreach, switch with stacked cases and default, try (catch named, finally kept)", () => {
    const r = readFunctions(`void F() {
      if (a) x = 1; else if (b) x = 2; else { x = 3; }
      while (i < n) i++;
      do { k--; } while (k > 0);
      foreach (var (name, mark) in marks) Show(name);
      switch (d) { case 1: case 2: y = 1; break; case > 5: y = 2; break; default: y = 0; break; }
      try { Risky(); } catch (Exception e) { Console.WriteLine(e); } finally { Done(); }
    }`);
    const b = r.functions[0].body;
    expect(b.map(s => s.k)).toEqual(["if", "while", "doWhile", "each", "switch", "stmt", "stmt"]);
    expect(b[0]).toMatchObject({ cond: "a", else: [{ k: "if", cond: "b", else: [{ text: "x = 3" }] }] });
    expect(b[3]).toMatchObject({ item: "(name, mark)", coll: "marks" });
    expect(b[4]).toMatchObject({ subject: "d", cases: [{ conds: ["d == 1", "d == 2"] }, { conds: ["d > 5"] }], dflt: [{ text: "y = 0" }, { k: "break" }] });
    expect(r.problems.map(p => p.line + ":" + p.message)).toEqual(["7:رُسم ما في «try» فقط: معالجة الأخطاء («catch») لا تظهر في مخطط التدفّق."]);
  });
  it("C#: top-level statements (no Main) are the program; an expression-bodied method returns its value", () => {
    const top = readFunctions(`using System;\nConsole.WriteLine("hi");\nint Sq(int x) => x * x;\nclass A { int F() => 1; }`);
    expect(top.top).toMatchObject([{ k: "stmt", text: "Console.WriteLine(\"hi\")" }]);
    expect(top.functions.map(f => f.name)).toEqual(["Sq", "F"]);
    expect(top.functions[0].body).toEqual([{ k: "return", line: 3, value: "x * x" }]);
  });
  it("Python: elif chains, range in its three forms, loop-else, match with | and _, one-line suites, joined lines", () => {
    const r = readFunctions(`def f(n):
    if n > 0: print("+")
    elif n < 0:
        print("-")
    else:
        print(0)
    for i in range(5): s += i
    for i in range(2, n):
        pass
    for i in range(n, 0, -1):
        pass
    while x:
        x -= 1
    else:
        done = (1 +
                2)
    match cmd:
        case "a" | "b":
            go()
        case _:
            stop()
`);
    const b = r.functions[0].body;
    expect(b.map(s => s.k)).toEqual(["if", "for", "for", "for", "while", "switch"]);
    expect(b[0]).toMatchObject({ cond: "n > 0", then: [{ text: 'print("+")' }], else: [{ k: "if", cond: "n < 0", else: [{ text: "print(0)" }] }] });
    expect(b.slice(1, 4).map(s => { const f = s as Extract<Stmt, { k: "for" }>; return [f.init[0], f.cond, f.update[0]].join(" | "); }))
      .toEqual(["i = 0 | i < 5 | i = i + 1", "i = 2 | i < n | i = i + 1", "i = n | i > 0 | i = i - 1"]);
    expect(b[4]).toMatchObject({ orElse: [{ text: "done = (1 + 2)" }] });
    expect(b[5]).toMatchObject({ subject: "cmd", cases: [{ conds: ['cmd == "a"', 'cmd == "b"'] }], dflt: [{ text: "stop()" }] });
    expect(r.problems).toEqual([]);
  });
  it("Python: comments and strings with # or : inside; a triple-quoted string over lines; a nested def named, not drawn", () => {
    const r = readFunctions(`def g():
    s = "a # not a comment: really"  # a comment
    t = """two
lines"""
    def inner():
        return 1
    return s
`);
    expect(r.functions[0].body).toMatchObject([{ text: 's = "a # not a comment: really"' }, { text: 't = """two lines"""' }, { k: "return", value: "s" }]);
    expect(r.problems.map(p => p.message)).toEqual(["الدالة الداخلية «inner» لم يُرسم: الصقه وحده لرسمه."]);
  });
});

describe("the flowchart", () => {
  it("C#: a for loop with an if inside — the steps, the questions, the way back, the «لا» out", () => {
    const r = draw(SUM_CS);
    expect(r.summary).toBe("رُسم مخطط التدفّق للدالة «Main» (C#): الأشكال 10، والقرارات 2.");
    expect(r.problems).toEqual([]);
    expect(texts(r.doc)).toEqual(["start:ابدأ", "io:أدخل n", "process:sum = 0, evens = 0", "process:i = 1", "decision:i <= n ؟", "decision:i % 2 == 0 ؟",
      "process:sum += i; evens++", "process:i++", "io:اطبع «Sum = {sum}, evens = {evens}»", "end:انتهِ"]);
    expect(arrows(r.doc)).toEqual(["ابدأ -> أدخل n", "أدخل n -> sum = 0, evens = 0", "sum = 0, evens = 0 -> i = 1", "i = 1 -> i <= n ؟", "i <= n ؟ -نعم-> i % 2 == 0 ؟",
      "i % 2 == 0 ؟ -نعم-> sum += i; evens++", "sum += i; evens++ -> i++", "i % 2 == 0 ؟ -لا-> i++", "i++ -> i <= n ؟", "i <= n ؟ -لا-> اطبع «Sum = {sum}, evens = {evens}»",
      "اطبع «Sum = {sum}, evens = {evens}» -> انتهِ"]);
    sound(r.doc, "SUM_CS");
  });
  it("Python: a script with no function is the program; foreach with an if; the output's strings in «»", () => {
    const r = draw(MAX_PY);
    expect(r.summary).toBe("رُسم مخطط التدفّق للبرنامج (Python): الأشكال 7، والقرارات 2.");
    expect(texts(r.doc)).toEqual(["start:ابدأ", "process:nums = [3, 9, 2, 7]; m = nums[0]", "decision:بقي x في nums ؟", "decision:x > m ؟", "process:m = x", "io:اطبع «max:», m", "end:انتهِ"]);
    expect(arrows(r.doc)).toContain("x > m ؟ -لا-> بقي x في nums ؟");
    expect(arrows(r.doc)).toContain("m = x -> بقي x في nums ؟");
    sound(r.doc, "MAX_PY");
  });
  it("break leaves the loop, elif is a question after a question, and «if __name__» runs main (which is the one drawn)", () => {
    const r = draw(GUESS_PY);
    expect(r.problems).toEqual([]);
    const a = arrows(r.doc);
    expect(a).toContain("اطبع «صحيح» -> اطبع «المحاولات:», tries");
    expect(a).toContain("g == secret ؟ -لا-> g < secret ؟");
    expect(a).toContain("اطبع «أكبر» -> True ؟");
    expect(a).toContain("True ؟ -لا-> اطبع «المحاولات:», tries");
    expect(texts(r.doc)).toContain("io:أدخل g");   // its prompt is in the input box
    sound(r.doc, "GUESS_PY");
  });
  it("do-while and switch: the menu's own functions are predefined processes; «نعم» goes back to the top of the loop; the others are named", () => {
    const r = draw(MENU_CS);
    expect(texts(r.doc).filter(t => t.startsWith("subroutine"))).toEqual(["subroutine:AddStudent()", "subroutine:ShowAll()"]);
    expect(arrows(r.doc)).toContain("choice != 0 ؟ -نعم-> أدخل choice");
    expect(arrows(r.doc)).toContain("choice == 0 ؟ -لا-> اطبع «Wrong choice»");
    expect(r.problems.map(p => p.message)).toEqual(["رُسمت الدالة «Main» فقط. في الكود دوال أخرى: AddStudent، ShowAll. لرسم واحدة منها الصقها وحدها."]);
    sound(r.doc, "MENU_CS");
  });
  it("a function with no Main: its name and parameters in «ابدأ»; every return goes into «انتهِ»", () => {
    const r = draw(GRADE_CS);
    expect(nameOf(r.doc, "n1")).toBe("ابدأ Grade(int mark)");
    expect(arrows(r.doc).filter(a => a.endsWith("انتهِ"))).toEqual(['أرجع "A" -> انتهِ', 'أرجع "B" -> انتهِ', 'أرجع "C" -> انتهِ', 'أرجع "F" -> انتهِ']);
    expect(r.doc.nodes.filter(n => n.type === "end")).toHaveLength(1);
    sound(r.doc, "GRADE_CS");
  });
  it("a long function continues in a second column through a pair of connectors «1»; «افحص المخطط» follows the jump", () => {
    const r = draw(LONG_PY);
    const cons = r.doc.nodes.filter(n => n.type === "connector");
    expect(cons.map(n => n.text.name)).toEqual(["1", "1"]);
    expect(r.doc.edges.filter(e => e.to === cons[0].id)).toHaveLength(1);
    expect(r.doc.edges.filter(e => e.from === cons[1].id)).toHaveLength(1);
    expect(cons[1].x).toBeGreaterThan(cons[0].x + 200);   // the next column, on its right
    expect(r.summary).toMatch(/في 2 أعمدة يصل بينها الموصل\.$/);
    sound(r.doc, "LONG_PY");
  });
  it("every sample: valid, on the page, nothing overlapping, no arrow through a shape, no «افحص المخطط» finding", () => {
    for (const [k, code] of Object.entries(SAMPLES)) sound(draw(code).doc, k);
  });
});

describe("the steps", () => {
  const steps = (code: string) => texts(draw(code).doc).slice(1, -1);
  it("C# inputs in their many forms (and their prompts left out); outputs; declarations without their type; a waiting ReadKey left out", () => {
    expect(steps(`static void Main() {
      Console.Write("Name: ");
      string name = Console.ReadLine();
      int.TryParse(Console.ReadLine(), out int age);
      double h = Convert.ToDouble(Console.ReadLine());
      var list = new List<int>();
      int a, b;
      const int Max = 10;
      Console.WriteLine("Hi " + name);
      Console.WriteLine();
      Console.ReadKey();
    }`)).toEqual(["io:أدخل name, age, h", "process:list = new List<int>(); Max = 10", "io:اطبع «Hi » + name"]);
  });
  it("Python: input targets (a tuple too), print's end= left out, an annotated name, own functions as predefined processes", () => {
    expect(steps(`def area(r): return 3.14 * r * r
def main():
    a, b = map(int, input().split())
    x: int = 5
    y: float
    print("a =", a, end="")
    print()
    area(a)
main()`)).toEqual(["io:أدخل a, b", "process:x = 5", "io:اطبع «a =», a", "subroutine:area(a)"]);
  });
  it("up to three steps share a box; an input after a step starts its own", () => {
    expect(steps("a = 1\nb = 2\nc = 3\nd = 4\nx = input()\ne = 5")).toEqual(["process:a = 1; b = 2; c = 3", "process:d = 4", "io:أدخل x", "process:e = 5"]);
  });
  it("continue goes back to the question; code after return is named, not drawn; break outside a loop is named", () => {
    const r = draw(`def f(xs):
    for x in xs:
        if x < 0:
            continue
        print(x)
    return 0
    print("never")
`);
    expect(arrows(r.doc)).toContain("x < 0 ؟ -نعم-> بقي x في xs ؟");
    expect(r.problems).toEqual([{ line: 7, message: "لا يصل التنفيذ إلى هذا السطر (بعد return أو break أو continue)، فلم يُرسم." }]);
    expect(codeToFlowchart("x = 1\nbreak").problems.map(p => p.message)).toContain("«break» خارج أي حلقة.");
  });
  it("Python's break inside match leaves the loop (C#'s break leaves the switch)", () => {
    const py = draw("while True:\n    match c:\n        case 1:\n            break\n        case _:\n            c = 1\nprint(c)");
    expect(arrows(py.doc)).toContain("c == 1 ؟ -نعم-> اطبع c");
    const cs = draw("while (true) { switch (c) { case 1: break; default: c = 1; break; } }\nConsole.WriteLine(c);");
    expect(arrows(cs.doc)).toContain("c == 1 ؟ -نعم-> true ؟");
  });
  it("code beside an Arabic word reads in its own direction; Arabic text is left as it is", () => {
    expect(isolate("«5! =», f")).toBe("\u2066«5! =», f\u2069");
    expect(isolate("«صحيح»")).toBe("«صحيح»");
    expect(draw("print('5! =', f)").doc.nodes[1].text.name).toBe("اطبع \u2066«5! =», f\u2069");
  });
});

describe("refusals", () => {
  it("nothing to draw, code too long, a function too long for one diagram: nothing drawn, the learner told why", () => {
    expect(codeToFlowchart("class A { int x; }")).toMatchObject({ doc: null, problems: [{ message: expect.stringMatching(/^لم أجد دالة ولا خطوات أرسمها/) }] });
    expect(codeToFlowchart("x = 1\n".repeat(FLOW_LIMITS.chars))).toMatchObject({ doc: null, problems: [{ message: expect.stringMatching(/^الكود أطول من/) }] });
    const many = "def f():\n" + Array.from({ length: 80 }, (_, i) => `    if x == ${i}:\n        print(${i})`).join("\n");
    expect(codeToFlowchart(many)).toMatchObject({ doc: null, problems: [{ message: expect.stringMatching(/أطول من أن تُرسم في مخطط واحد/) }] });
  });
  it("a loop too tall for one column is refused rather than drawn off the page", () => {
    const tall = "def f():\n    while x:\n" + Array.from({ length: 30 }, (_, i) => `        if y == ${i}:\n            z = ${i}`).join("\n");
    const r = codeToFlowchart(tall);
    expect(r.doc).toBeNull();
    expect(r.problems.at(-1)!.message).toMatch(/جزء واحد \(حلقة أو شرط\) أطول من صفحة المخطط/);
  });
});

describe("routes a flowchart needs", () => {
  const node = (id: string, type: string, x: number, y: number, name: string, w = 140, h = 46): DNode => ({ id, type, x, y, w, h, text: { name }, color: "none" });
  const flow = (id: string, from: string, to: string, label = ""): DEdge => ({ id, type: "flow", from, to, label, fromLabel: "", toLabel: "", y: 0, route: "ortho" });
  it("an if as a loop's last step: its «لا» goes back up out of its bottom (its left is «نعم»), round the left, into the loop's left corner", () => {
    const d: DiagramDoc = { kind: "flowchart", nodes: [node("n1", "decision", 300, 100, "بقي x ؟", 140, 70), node("n2", "decision", 300, 210, "x > m ؟", 140, 70),
      node("n3", "process", 120, 320, "m = x")], edges: [flow("e1", "n1", "n2", "نعم"), flow("e2", "n2", "n3", "نعم"), flow("e3", "n3", "n1"), flow("e4", "n2", "n1", "لا")] };
    const p = pathsOf(d);
    const no = p.get("e4")!.pts;
    expect(no[0]).toEqual([370, 280]);   // the bottom corner
    expect(no).toHaveLength(5);
    expect(no.at(-1)).toEqual([300, 135]);   // the loop's left corner
    expect(p.get("e3")!.pts.at(-1)).toEqual([300, 135]);
    expect(no[1][1]).toBeGreaterThan(280);   // down first, then left of the loop's question, and up
    expect(no[2][0]).toBeLessThan(300);
    expect(p.get("e4")!.mid.y).toBeGreaterThan(280);   // «لا» beside the decision it leaves
  });
  it("a loop's «لا» goes round the right of its body into the next step's side; branches join over a question's top corner", () => {
    const d: DiagramDoc = { kind: "flowchart", nodes: [node("n1", "decision", 300, 100, "i < n ؟", 140, 70), node("n2", "process", 300, 210, "i++"),
      node("n3", "io", 300, 300, "اطبع i"), node("n4", "process", 120, 400, "a = 1"), node("n5", "process", 480, 400, "b = 2"), node("n6", "decision", 300, 520, "a > b ؟", 140, 70)],
    edges: [flow("e1", "n1", "n2", "نعم"), flow("e2", "n2", "n1"), flow("e3", "n1", "n3", "لا"), flow("e4", "n4", "n6"), flow("e5", "n5", "n6")] };
    const p = pathsOf(d);
    const no = p.get("e3")!.pts;
    expect(no[0]).toEqual([440, 135]);
    expect(Math.max(...no.map(q => q[0]))).toBeGreaterThan(440);
    expect(no.at(-1)![0]).toBe(440 - 8);   // into «اطبع i»'s right side (halfway down its slant)
    for (const id of ["e4", "e5"]) {
      const pts = p.get(id)!.pts;
      expect(pts.at(-1), id).toEqual([370, 520]);   // the top corner
      expect(pts.at(-2)![1], id).toBe(502);   // the same bar just over it
    }
  });
});

describe("«افحص المخطط»: a pair of connectors is a jump", () => {
  const node = (id: string, type: string, x: number, y: number, name: string, w = 140, h = 46): DNode => ({ id, type, x, y, w, h, text: { name }, color: "none" });
  const flow = (id: string, from: string, to: string): DEdge => ({ id, type: "flow", from, to, label: "", fromLabel: "", toLabel: "", y: 0, route: "ortho" });
  /** ابدأ → x = 1 → (1)   (1) → اطبع x → انتهِ: two columns joined by connector «1» */
  const jump = (mark2 = "1"): DiagramDoc => ({ kind: "flowchart",
    nodes: [node("n1", "start", 100, 40, "ابدأ", 100, 44), node("n2", "process", 80, 120, "x = 1"), node("n3", "connector", 130, 200, "1", 40, 40),
      node("n4", "connector", 400, 40, mark2, 40, 40), node("n5", "io", 350, 120, "اطبع x"), node("n6", "end", 370, 200, "انتهِ", 100, 44)],
    edges: [flow("e1", "n1", "n2"), flow("e2", "n2", "n3"), flow("e3", "n4", "n5"), flow("e4", "n5", "n6")] });
  it("the flow goes on at the connector with the same mark: nothing is unreached, the first connector is no dead end", () => {
    expect(checkDiagram(jump())).toEqual([]);
  });
  it("connectors that do not match are still named", () => {
    const rules = checkDiagram(jump("2")).map(f => f.rule + ":" + f.nodes.join(","));
    expect(rules).toContain("flow.deadEnd:n3");
    expect(rules).toContain("flow.unreached:n4");
  });
});
