// DG4 — «اكتب المخطط نصًّا» (docs/enterprise-diagram-editor-design.md §16): the script reader and writer.
//   • the owner's example (PlantUML style) as written; classes, use cases, sequences, activities and states with the everyday syntax;
//   • what cannot be read is named with its line; comments, directives and notes; the kind from clear signs only;
//   • every diagram read is a valid diagram@1 that «افحص المخطط» finds no error in, on the page;
//   • the diagram written back as text reads back to the same components and arrows; positions the learner set are kept.
import { describe, it, expect } from "vitest";
import { readDiagramScript, detectScriptKind, keepPositions, SCRIPT_MAX_CHARS, type ScriptKind } from "./diagramScript";
import { diagramToScript } from "./diagramToScript";
import { DIAGRAM_LIMITS, parseDiagram, serializeDiagram, type DiagramDoc } from "./diagramDoc";
import { exampleDoc } from "./diagramExamples";
import { checkDiagram } from "./diagramChecks";

const valid = (d: DiagramDoc) => {
  const r = parseDiagram(serializeDiagram(d));
  expect(r.ok, JSON.stringify(r)).toBe(true);
  for (const n of d.nodes) { expect(n.x).toBeGreaterThanOrEqual(0); expect(n.x + n.w).toBeLessThanOrEqual(DIAGRAM_LIMITS.canvasW); }
  expect(checkDiagram(d).filter(f => f.level === "error").map(f => f.message)).toEqual([]);
};
const read = (s: string, k: ScriptKind = "class") => { const r = readDiagramScript(s, k); valid(r.doc); return r; };
const names = (d: DiagramDoc) => d.nodes.map(n => n.type + ":" + (n.text.name ?? ""));
const arrows = (d: DiagramDoc) => d.edges.map(e => [e.type, d.nodes.find(n => n.id === e.from)!.text.name ?? d.nodes.find(n => n.id === e.from)!.type, d.nodes.find(n => n.id === e.to)!.text.name ?? d.nodes.find(n => n.id === e.to)!.type, e.label, e.fromLabel, e.toLabel]);

describe("the owner's example", () => {
  it("reads as written: four classes, an association, a composition, the reading direction of each label", () => {
    const r = read("@startuml\nclass Car\n\nDriver - Car : drives >\nCar *- Wheel : have 4 >\nCar -- Person : < owns\n\n@enduml", "useCase");
    expect(r.kind).toBe("class");
    expect(r.problems).toEqual([]);
    expect(names(r.doc)).toEqual(["class:Car", "class:Driver", "class:Wheel", "class:Person"]);
    expect(arrows(r.doc)).toEqual([
      ["assoc", "Driver", "Car", "drives ▸", "", ""],
      ["composition", "Car", "Wheel", "have 4 ▸", "", ""],
      ["assoc", "Car", "Person", "◂ owns", "", ""],
    ]);
  });
});

describe("class", () => {
  it("bodies, kinds, every arrow, multiplicities, extends / implements, a member line", () => {
    const r = read(`' a comment
skinparam classAttributeIconSize 0
abstract class Person {
  # name : string
  + {abstract} Describe() : string
}
interface IPrintable {
  + Print() : void
}
enum Grade {
  Excellent
  Good
}
class Student extends Person implements IPrintable
Student : - grade : Grade
Student "1" o-- "*" Course : takes >
Course --> Teacher
Teacher ..> Grade
Report ..|> IPrintable
Person <|-- Teacher
School *-- "1..*" Class
`);
    expect(r.problems).toEqual([]);
    const node = (n: string) => r.doc.nodes.find(x => x.text.name === n)!;
    expect(node("Person")).toMatchObject({ type: "abstract", text: { attrs: "# name : string", ops: "+ Describe() : string" } });
    expect(node("IPrintable")).toMatchObject({ type: "interface", text: { ops: "+ Print() : void" } });
    expect(node("Grade")).toMatchObject({ type: "enum", text: { values: "Excellent\nGood" } });
    expect(node("Student").text.attrs).toBe("- grade : Grade");
    expect(arrows(r.doc)).toEqual([
      ["inherit", "Student", "Person", "", "", ""], ["realize", "Student", "IPrintable", "", "", ""],
      ["aggregation", "Student", "Course", "takes ▸", "1", "*"], ["directed", "Course", "Teacher", "", "", ""], ["dependency", "Teacher", "Grade", "", "", ""],
      ["realize", "Report", "IPrintable", "", "", ""], ["inherit", "Teacher", "Person", "", "", ""], ["composition", "School", "Class", "", "", "1..*"],
    ]);
    expect(node("Person").y).toBeLessThan(node("Student").y);   // parents above
  });
  it("the diamond on the right («--*», «--o») puts the whole on the right", () => {
    const r = read("Room --* House\nPlayer --o Team : plays in >");
    expect(arrows(r.doc)).toEqual([["composition", "House", "Room", "", "", ""], ["aggregation", "Team", "Player", "plays in ▸", "", ""]]);
  });
  it("names what it cannot read: an unknown line, an unclosed body", () => {
    const r = readDiagramScript("class A {\n  + x : int\nclass B\nthis is not a diagram line", "class");
    expect(r.problems.map(p => [p.line, p.message])).toEqual([[1, "الصنف «A» لم يُغلق: ينقصه «}»."]]);
    const u = readDiagramScript("class A\nA ~~~ B\nفقرة عادية", "class");
    expect(u.problems.map(p => p.line)).toEqual([2, 3]);
    expect(u.problems[0].message).toMatch(/^لم أفهم السطر: «A ~~~ B»/);
  });
});

describe("use case", () => {
  it("actors on both sides, use cases inside the system, include / extend / generalisation, aliases", () => {
    const r = read(`left to right direction
actor الطالب
actor :أمين المكتبة: as Lib
rectangle "نظام المكتبة" {
  usecase "استعارة كتاب" as UC1
  (تسجيل الدخول)
  (دفع غرامة)
}
الطالب --> UC1
Lib -- (استعارة كتاب)
UC1 ..> (تسجيل الدخول) : <<include>>
(دفع غرامة) .> UC1 : <<extend>>
:زائر: <|-- الطالب
`, "class");
    expect(r.kind).toBe("useCase");
    expect(r.problems).toEqual([]);
    expect(names(r.doc).sort()).toEqual(["actor:أمين المكتبة", "actor:الطالب", "actor:زائر", "system:نظام المكتبة", "usecase:استعارة كتاب", "usecase:تسجيل الدخول", "usecase:دفع غرامة"].sort());
    expect(arrows(r.doc).map(a => a.slice(0, 4))).toEqual([
      ["assoc", "الطالب", "استعارة كتاب", ""], ["assoc", "أمين المكتبة", "استعارة كتاب", ""],
      ["include", "استعارة كتاب", "تسجيل الدخول", "«include»"], ["extend", "دفع غرامة", "استعارة كتاب", "«extend»"], ["generalize", "الطالب", "زائر", ""],
    ]);
    expect(r.doc.nodes[0].type).toBe("system");   // drawn under everything
    expect(checkDiagram(r.doc).filter(f => /uc\.(actorInside|outside)/.test(f.rule))).toEqual([]);
  });
});

describe("sequence", () => {
  it("participants, actors, every message, an alt frame with its else around its messages", () => {
    const r = read(`actor المستخدم as U
participant ":LoginPage" as P
participant Server
U -> P : login(user, pass)
P ->> Server : check
alt البيانات صحيحة
  Server --> P : true
else خطأ
  Server --> P : false
end
P <-- Server : done
P -> P : log()
`);
    expect(r.kind).toBe("sequence");
    expect(r.problems).toEqual([]);
    expect(names(r.doc)).toEqual(["actorLifeline:المستخدم", "lifeline::LoginPage", "lifeline:Server", "fragment:alt"]);
    expect(arrows(r.doc).map(a => a.slice(0, 4))).toEqual([
      ["sync", "المستخدم", ":LoginPage", "login(user, pass)"], ["async", ":LoginPage", "Server", "check"], ["return", "Server", ":LoginPage", "true"],
      ["return", "Server", ":LoginPage", "false"], ["return", "Server", ":LoginPage", "done"], ["sync", ":LoginPage", ":LoginPage", "log()"],
    ]);
    const frame = r.doc.nodes.find(n => n.type === "fragment")!;
    expect(frame.text.guard).toBe("[البيانات صحيحة] / else [خطأ]");
    const [m3, m4, m5] = [r.doc.edges[2].y, r.doc.edges[3].y, r.doc.edges[4].y];
    expect(frame.y).toBeLessThan(m3);
    expect(frame.y + frame.h).toBeGreaterThan(m4);
    expect(frame.y + frame.h).toBeLessThan(m5);
  });
  it("an unclosed frame and an «end» without one are named", () => {
    expect(readDiagramScript("participant A\nloop 3 مرات\nA -> A : x", "sequence").problems.map(p => p.message)).toEqual(["الإطار «loop» لم يُغلق: ينقصه «end»."]);
    expect(readDiagramScript("participant A\nA -> A : x\nend", "sequence").problems.map(p => p.message)).toEqual(["«end» بلا إطار مفتوح (alt / opt / loop) قبله."]);
  });
});

describe("activity", () => {
  it("start, actions, if / else, while, fork, stop: a flow from top to bottom with its conditions", () => {
    const r = read(`start
:إدخال البيانات;
if (البيانات صحيحة؟) then (نعم)
  :حفظ البيانات;
else (لا)
  :عرض رسالة خطأ;
endif
while (طلبات أخرى؟) is (نعم)
  :معالجة الطلب;
endwhile (لا)
fork
  :إرسال بريد;
fork again
  :طباعة إيصال;
end fork
stop
`);
    expect(r.kind).toBe("activity");
    expect(r.problems).toEqual([]);
    const types = r.doc.nodes.map(n => n.type);
    expect(types.filter(t => t === "start")).toHaveLength(1);
    expect(types.filter(t => t === "end")).toHaveLength(1);
    expect(types.filter(t => t === "action")).toHaveLength(6);
    expect(types.filter(t => t === "fork")).toHaveLength(2);
    expect(r.doc.edges.filter(e => e.label).map(e => e.label).sort()).toEqual(["[لا]", "[لا]", "[نعم]", "[نعم]"]);
    const y = (name: string) => r.doc.nodes.find(n => n.text.name === name)!.y;
    expect(y("إدخال البيانات")).toBeLessThan(y("حفظ البيانات"));
    expect(y("حفظ البيانات")).toBe(y("عرض رسالة خطأ"));   // the two branches side by side
    expect(checkDiagram(r.doc).filter(f => f.level === "error")).toEqual([]);
  });
  it("an «if» without «endif» is named", () => {
    expect(readDiagramScript("start\nif (x) then (y)\n:a;\nstop", "activity").problems.map(p => p.message)).toEqual(["«if» لم يُغلق: ينقصه «endif»."]);
  });
});

describe("state", () => {
  it("[*] at the start and the end, transitions with events, a composite state, a choice, aliases and body lines", () => {
    const r = read(`[*] --> جديد
state "قيد المعالجة" as P
P : entry / فتح الطلب
جديد --> P : دفع
state شحن {
  [*] --> تغليف
  تغليف --> توصيل
}
P --> شحن
شحن --> c1
state c1 <<choice>>
c1 --> مكتمل : [وصل]
c1 --> ملغى : [رُفض]
مكتمل --> [*]
ملغى --> [*]
`);
    expect(r.kind).toBe("state");
    expect(r.problems).toEqual([]);
    const n = (name: string) => r.doc.nodes.find(x => x.text.name === name)!;
    expect(n("قيد المعالجة").text.body).toBe("entry / فتح الطلب");
    expect(n("شحن").type).toBe("composite");
    expect(r.doc.nodes.filter(x => x.type === "initial")).toHaveLength(2);   // the top's and the composite's
    expect(r.doc.nodes.filter(x => x.type === "final")).toHaveLength(1);
    expect(r.doc.nodes.find(x => x.type === "choice")).toBeTruthy();
    const box = n("شحن");
    for (const inner of ["تغليف", "توصيل"]) { const t = n(inner); expect(t.x).toBeGreaterThan(box.x); expect(t.x + t.w).toBeLessThan(box.x + box.w); }
    expect(r.doc.nodes[0].type).toBe("composite");
  });
});

describe("the kind, the bounds, the notes", () => {
  it("is told by clear signs only; plain arrows keep the editor's kind", () => {
    expect(detectScriptKind("start\n:x;\nstop")).toBe("activity");
    expect(detectScriptKind("[*] --> A")).toBe("state");
    expect(detectScriptKind("participant A\nA -> B : x")).toBe("sequence");
    expect(detectScriptKind("actor A\nA --> (Login)")).toBe("useCase");
    expect(detectScriptKind("class A")).toBe("class");
    expect(detectScriptKind("A --> B : x")).toBeNull();
    expect(readDiagramScript("A --> B : x", "state").kind).toBe("state");
    expect(readDiagramScript("A --> B : x", "class").kind).toBe("class");
  });
  it("notes become notes; comments and styling are skipped; a long text is refused", () => {
    const r = read("/' block\ncomment '/\nclass A\nnote \"ملاحظة\" as N1\nnote right of A\nسطر 1\nسطر 2\nend note\nhide empty members");
    expect(r.problems).toEqual([]);
    expect(r.doc.nodes.filter(n => n.type === "note").map(n => n.text.name)).toEqual(["ملاحظة", "سطر 1\nسطر 2"]);
    expect(readDiagramScript("x".repeat(SCRIPT_MAX_CHARS + 1), "class").problems[0].message).toMatch(/أطول من الحد/);
  });
});

describe("written back as text", () => {
  it.each(["class", "useCase", "sequence", "state"] as const)("%s: the example → text → the same components and arrows; the text is stable", kind => {
    const doc = exampleDoc(kind);
    const text = diagramToScript(doc)!;
    expect(text.startsWith("@startuml")).toBe(true);
    const back = readDiagramScript(text, kind);
    expect(back.problems).toEqual([]);
    expect(back.kind).toBe(kind);
    valid(back.doc);
    expect(names(back.doc).sort()).toEqual(names(doc).sort());
    const key = (d: DiagramDoc) => arrows(d).map(a => a.slice(0, 3).join(" | ")).sort();
    expect(key(back.doc)).toEqual(key(doc));
    expect(diagramToScript(back.doc)).toBe(diagramToScript(readDiagramScript(diagramToScript(back.doc)!, kind).doc));
  });
  it("activity is not written back (a free-form flow has no if / endif form)", () => {
    expect(diagramToScript(exampleDoc("activity"))).toBeNull();
    expect(diagramToScript(exampleDoc("dsd"))).toBeNull();
  });
});

describe("positions the learner set", () => {
  it("a component the old diagram had (same kind and name) stays where it was; a new one follows the layout", () => {
    const first = readDiagramScript("class A\nclass B\nA --> B", "class").doc;
    first.nodes[0] = { ...first.nodes[0], x: 900, y: 700 };
    const next = keepPositions(readDiagramScript("class A\nclass B\nclass C\nA --> B\nB --> C", "class").doc, first);
    expect(next.nodes.find(n => n.text.name === "A")).toMatchObject({ x: 900, y: 700 });
    expect(next.nodes.find(n => n.text.name === "C")!.x).toBeLessThan(900);
  });
});
