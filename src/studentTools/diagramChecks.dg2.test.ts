// DG2 — «افحص المخطط» (docs/enterprise-diagram-editor-design.md §14): every rule is shown twice — a diagram that breaks it gets the
// finding, the same diagram corrected does not — and every worked example passes with no finding. Findings point only at components and
// arrows that exist, errors come before warnings, and an empty diagram has nothing to say.
import { describe, it, expect } from "vitest";
import { DIAGRAM_KINDS, nodeSpec, type DiagramKind } from "./diagramCatalog";
import type { DEdge, DiagramDoc, DNode } from "./diagramDoc";
import { exampleDoc } from "./diagramExamples";
import { checkDiagram, tableFields } from "./diagramChecks";

/** [type, text, x, y, w?, h?] */
type N = [string, Record<string, string>?, number?, number?, number?, number?];
/** [from (1-based), to, type, label?, fromLabel?, toLabel?] */
type E = [number, number, string, string?, string?, string?];
function mk(kind: DiagramKind, ns: N[], es: E[] = []): DiagramDoc {
  const nodes: DNode[] = ns.map(([type, text, x, y, w, h], i) => {
    const spec = nodeSpec(kind, type)!;
    expect(spec, type).toBeTruthy();
    return { id: "n" + (i + 1), type, x: x ?? 100 + i * 200, y: y ?? 100, w: w ?? spec.minW, h: h ?? spec.minH, text: { ...spec.defaults, ...text }, color: "none" };
  });
  const edges: DEdge[] = es.map(([a, b, type, label = "", fromLabel = "", toLabel = ""], i) => ({ id: "e" + (i + 1), type, from: "n" + a, to: "n" + b, label, fromLabel, toLabel, y: 140 + i * 46 }));
  return { kind, nodes, edges };
}
const rules = (d: DiagramDoc) => checkDiagram(d).map(f => f.rule);
/** The diagram breaks `rule`; the corrected one does not. */
function pair(rule: string, broken: DiagramDoc, fixed: DiagramDoc) {
  expect(rules(broken), "broken").toContain(rule);
  expect(rules(fixed), "fixed").not.toContain(rule);
}

describe("the worked examples and the basics", () => {
  it.each([...DIAGRAM_KINDS])("%s: the example has no finding", kind => { expect(checkDiagram(exampleDoc(kind))).toEqual([]); });
  it("an empty diagram (or notes only) has nothing to say", () => {
    expect(checkDiagram({ kind: "dfd", nodes: [], edges: [] })).toEqual([]);
    expect(checkDiagram(mk("dfd", [["note"]]))).toEqual([]);
  });
  it("findings name only what exists, errors first", () => {
    const d = mk("dfd", [["external", { name: "" }], ["external", { name: "B" }], ["store", { name: "S" }]], [[1, 2, "flow"], [2, 3, "flow", "x"]]);
    const f = checkDiagram(d);
    const ids = new Set([...d.nodes.map(n => n.id), ...d.edges.map(e => e.id)]);
    for (const x of f) for (const id of [...x.nodes, ...x.edges]) expect(ids.has(id)).toBe(true);
    const levels = f.map(x => x.level);
    expect(levels.indexOf("warning")).toBeGreaterThan(levels.lastIndexOf("error"));
    for (const x of f) expect(x.message).toMatch(/[؀-ۿ]/);
  });
});

describe("every kind: names and loose ends", () => {
  it("a component without its name", () => pair("name.missing", mk("class", [["class", { name: "" }]]), mk("class", [["class", { name: "Student" }]])));
  it("two components with one name", () => pair("name.duplicate", mk("dsd", [["table", { name: "Students" }], ["table", { name: "students" }]]), mk("dsd", [["table", { name: "Students" }], ["table", { name: "Classes" }]])));
  it("a component joined to nothing", () => pair("node.isolated",
    mk("erd", [["entity", { name: "A" }], ["keyAttribute", { name: "k" }], ["attribute", { name: "x" }]], [[2, 1, "line"]]),
    mk("erd", [["entity", { name: "A" }], ["keyAttribute", { name: "k" }], ["attribute", { name: "x" }]], [[2, 1, "line"], [3, 1, "line"]])));
});

describe("use case", () => {
  const sys = (inner: N[]): N[] => [["system", {}, 300, 50, 500, 500], ...inner];
  it("an association joins an actor and a use case", () => pair("uc.assoc",
    mk("useCase", [["actor", { name: "A" }, 50], ["actor", { name: "B" }, 900]], [[1, 2, "assoc"]]), mk("useCase", [["actor", { name: "A" }, 50], ["actor", { name: "B" }, 900]], [[1, 2, "generalize"]])));
  it("«include» joins two use cases", () => pair("uc.include",
    mk("useCase", sys([["actor", { name: "A" }, 50], ["usecase", { name: "U" }, 400, 100]]), [[1 + 1, 2 + 1, "include"]]),
    mk("useCase", sys([["actor", { name: "A" }, 50], ["usecase", { name: "U" }, 400, 100], ["usecase", { name: "V" }, 400, 300]]), [[2, 3, "assoc"], [3, 4, "include"]])));
  it("a generalisation joins like with like", () => pair("uc.generalize",
    mk("useCase", sys([["actor", { name: "A" }, 50], ["usecase", { name: "U" }, 400, 100]]), [[2, 3, "generalize"]]),
    mk("useCase", sys([["actor", { name: "A" }, 50], ["usecase", { name: "U" }, 400, 100]]), [[2, 3, "assoc"]])));
  it("a use case no actor reaches (directly or through include / extend)", () => pair("uc.unreached",
    mk("useCase", sys([["actor", { name: "A" }, 50], ["usecase", { name: "U" }, 400, 100], ["usecase", { name: "V" }, 400, 300], ["usecase", { name: "W" }, 400, 420]]), [[2, 3, "assoc"], [4, 5, "include"]]),
    mk("useCase", sys([["actor", { name: "A" }, 50], ["usecase", { name: "U" }, 400, 100], ["usecase", { name: "V" }, 400, 300], ["usecase", { name: "W" }, 400, 420]]), [[2, 3, "assoc"], [3, 4, "include"], [5, 4, "extend"]])));
  it("an actor stands outside the system; use cases inside it", () => {
    pair("uc.actorInside", mk("useCase", sys([["actor", { name: "A" }, 350, 100], ["usecase", { name: "U" }, 500, 100]]), [[2, 3, "assoc"]]),
      mk("useCase", sys([["actor", { name: "A" }, 50, 100], ["usecase", { name: "U" }, 500, 100]]), [[2, 3, "assoc"]]));
    pair("uc.outside", mk("useCase", sys([["actor", { name: "A" }, 50, 100], ["usecase", { name: "U" }, 900, 100]]), [[2, 3, "assoc"]]),
      mk("useCase", sys([["actor", { name: "A" }, 50, 100], ["usecase", { name: "U" }, 500, 100]]), [[2, 3, "assoc"]]));
  });
});

describe("class", () => {
  const cls = (name: string, attrs = "- id : int", ops = "+ Get() : int"): N => ["class", { name, attrs, ops }];
  it("a class implements an interface (it does not inherit it)", () => pair("cls.inheritInterface",
    mk("class", [cls("A"), ["interface", { name: "I" }]], [[1, 2, "inherit"]]), mk("class", [cls("A"), ["interface", { name: "I" }]], [[1, 2, "realize"]])));
  it("«تنفيذ واجهة» ends at an interface", () => pair("cls.realize",
    mk("class", [cls("A"), cls("B")], [[1, 2, "realize"]]), mk("class", [cls("A"), cls("B")], [[1, 2, "inherit"]])));
  it("an enum neither inherits nor is inherited", () => pair("cls.inheritEnum",
    mk("class", [cls("A"), ["enum", { name: "E" }]], [[1, 2, "inherit"]]), mk("class", [cls("A"), ["enum", { name: "E" }]], [[1, 2, "dependency"]])));
  it("C#: one parent class only", () => pair("cls.multipleInheritance",
    mk("class", [cls("A"), cls("B"), cls("C")], [[1, 2, "inherit"], [1, 3, "inherit"]]),
    mk("class", [cls("A"), cls("B"), ["interface", { name: "I" }]], [[1, 2, "inherit"], [1, 3, "realize"]])));
  it("no inheritance cycle", () => pair("cls.cycle",
    mk("class", [cls("A"), cls("B"), cls("C")], [[1, 2, "inherit"], [2, 3, "inherit"], [3, 1, "inherit"]]),
    mk("class", [cls("A"), cls("B"), cls("C")], [[1, 2, "inherit"], [2, 3, "inherit"]])));
  it("an association carries its multiplicities", () => pair("cls.multiplicity",
    mk("class", [cls("A"), cls("B")], [[1, 2, "assoc", "", "", ""]]), mk("class", [cls("A"), cls("B")], [[1, 2, "assoc", "", "1", "*"]])));
  it("members start with their visibility; operations have brackets", () => {
    pair("cls.visibility", mk("class", [cls("A", "id : int")]), mk("class", [cls("A", "- id : int")]));
    pair("cls.opParens", mk("class", [cls("A", "- id : int", "+ Get : int")]), mk("class", [cls("A", "- id : int", "+ Get() : int")]));
    // an interface's one compartment holds its properties too
    expect(rules(mk("class", [["interface", { name: "IPrintable", ops: "+ Title : string\n+ Print() : void" }]]))).not.toContain("cls.opParens");
  });
});

describe("sequence", () => {
  const two: N[] = [["lifeline", { name: ":A" }], ["lifeline", { name: ":B" }]];
  it("a message has a name", () => pair("seq.unnamed", mk("sequence", two, [[1, 2, "sync", ""]]), mk("sequence", two, [[1, 2, "sync", "go()"]])));
  it("a return answers a message sent before it", () => pair("seq.return",
    mk("sequence", two, [[2, 1, "return", "ok"]]), mk("sequence", two, [[1, 2, "sync", "go()"], [2, 1, "return", "ok"]])));
  it("a frame is alt / opt / loop with a condition", () => {
    pair("seq.fragmentOp", mk("sequence", [...two, ["fragment", { name: "if" }]], [[1, 2, "sync", "x"]]), mk("sequence", [...two, ["fragment", { name: "alt" }]], [[1, 2, "sync", "x"]]));
    pair("seq.guard", mk("sequence", [...two, ["fragment", { name: "loop", guard: "" }]], [[1, 2, "sync", "x"]]), mk("sequence", [...two, ["fragment", { name: "loop", guard: "[i < 3]" }]], [[1, 2, "sync", "x"]]));
  });
});

describe("activity", () => {
  const good = (): [N[], E[]] => [[["start"], ["action", { name: "A" }], ["decision"], ["action", { name: "B" }], ["end"]], [[1, 2, "flow"], [2, 3, "flow"], [3, 4, "flow", "[نعم]"], [3, 5, "flow", "[لا]"], [4, 5, "flow"]]];
  it("the corrected flow is clean", () => { const [n, e] = good(); expect(checkDiagram(mk("activity", n, e))).toEqual([]); });
  it("a start and an end", () => {
    pair("flow.noStart", mk("activity", [["action", { name: "A" }], ["end"]], [[1, 2, "flow"]]), mk("activity", ...good()));
    pair("flow.noEnd", mk("activity", [["start"], ["action", { name: "A" }]], [[1, 2, "flow"]]), mk("activity", ...good()));
  });
  it("nothing enters the start; nothing leaves the end", () => {
    pair("flow.intoStart", mk("activity", [["start"], ["action", { name: "A" }], ["end"]], [[1, 2, "flow"], [2, 1, "flow"], [2, 3, "flow"]]), mk("activity", ...good()));
    pair("flow.fromEnd", mk("activity", [["start"], ["action", { name: "A" }], ["end"]], [[1, 2, "flow"], [2, 3, "flow"], [3, 2, "flow"]]), mk("activity", ...good()));
  });
  it("every step is reached from the start and leads on", () => {
    pair("flow.unreached", mk("activity", [["start"], ["action", { name: "A" }], ["action", { name: "B" }], ["end"]], [[1, 2, "flow"], [2, 4, "flow"], [3, 4, "flow"]]), mk("activity", ...good()));
    pair("flow.deadEnd", mk("activity", [["start"], ["action", { name: "A" }], ["action", { name: "B" }], ["end"]], [[1, 2, "flow"], [2, 3, "flow"], [2, 4, "flow", ""]]), mk("activity", ...good()));
  });
  it("a decision: two ways out, each with its condition", () => {
    pair("act.guard", mk("activity", [["start"], ["decision"], ["action", { name: "A" }], ["end"]], [[1, 2, "flow"], [2, 3, "flow"], [2, 4, "flow"], [3, 4, "flow"]]), mk("activity", ...good()));
    pair("act.decision", mk("activity", [["start"], ["decision"], ["end"]], [[1, 2, "flow"], [2, 3, "flow"]]), mk("activity", ...good()));
  });
  it("a fork bar: one in and many out (or the reverse)", () => pair("act.fork",
    mk("activity", [["start"], ["fork"], ["end"]], [[1, 2, "flow"], [2, 3, "flow"]]),
    mk("activity", [["start"], ["fork"], ["action", { name: "A" }], ["action", { name: "B" }], ["fork"], ["end"]], [[1, 2, "flow"], [2, 3, "flow"], [2, 4, "flow"], [3, 5, "flow"], [4, 5, "flow"], [5, 6, "flow"]])));
});

describe("state", () => {
  it("an initial state; several transitions out of a state each name their event; a choice has two ways", () => {
    pair("flow.noStart", mk("state", [["state", { name: "A" }], ["final"]], [[1, 2, "transition", ""]]), mk("state", [["initial"], ["state", { name: "A" }], ["final"]], [[1, 2, "transition", ""], [2, 3, "transition", ""]]));
    pair("st.event", mk("state", [["initial"], ["state", { name: "A" }], ["state", { name: "B" }], ["final"]], [[1, 2, "transition", ""], [2, 3, "transition", ""], [2, 4, "transition", "إلغاء"], [3, 4, "transition", ""]]),
      mk("state", [["initial"], ["state", { name: "A" }], ["state", { name: "B" }], ["final"]], [[1, 2, "transition", ""], [2, 3, "transition", "دفع"], [2, 4, "transition", "إلغاء"], [3, 4, "transition", ""]]));
    pair("st.choice", mk("state", [["initial"], ["choice"], ["final"]], [[1, 2, "transition", ""], [2, 3, "transition", "[x]"]]),
      mk("state", [["initial"], ["choice"], ["state", { name: "A" }], ["final"]], [[1, 2, "transition", ""], [2, 3, "transition", "[x]"], [2, 4, "transition", "[y]"], [3, 4, "transition", ""]]));
  });
});

describe("object and deployment", () => {
  it("an object is named «name : Class»", () => pair("obj.name", mk("object", [["object", { name: "s1" }]]), mk("object", [["object", { name: "s1 : Student" }]])));
  it("a component sits inside the node it runs on", () => pair("dep.outside",
    mk("deployment", [["node", {}, 100, 100, 300, 200], ["component", { name: "Web" }, 600, 150]]),
    mk("deployment", [["node", {}, 100, 100, 300, 200], ["component", { name: "Web" }, 150, 180]])));
});

describe("ERD", () => {
  const base: N[] = [["entity", { name: "طالب" }, 100], ["relationship", { name: "يسجّل" }, 300], ["entity", { name: "مادة" }, 500], ["keyAttribute", { name: "رقم" }, 100, 300], ["keyAttribute", { name: "رمز" }, 500, 300]];
  const ok: E[] = [[1, 2, "line", "", "M", ""], [2, 3, "line", "", "", "N"], [4, 1, "line"], [5, 3, "line"]];
  it("the corrected ERD is clean", () => { expect(checkDiagram(mk("erd", base, ok))).toEqual([]); });
  it("entities meet through a relationship", () => pair("erd.direct", mk("erd", base, [[1, 3, "line"], [4, 1, "line"], [5, 3, "line"], [2, 1, "line", "", "", "1"]]), mk("erd", base, ok)));
  it("every entity has a key attribute", () => pair("erd.noKey", mk("erd", base, [[1, 2, "line", "", "M"], [2, 3, "line", "", "", "N"], [5, 3, "line"], [4, 2, "line"]]), mk("erd", base, ok)));
  it("a relationship joins two entities", () => pair("erd.relEnds", mk("erd", base, [[1, 2, "line", "", "M"], [4, 1, "line"], [5, 3, "line"], [3, 1, "line"]]), mk("erd", base, ok)));
  it("a relationship line carries its cardinality", () => pair("erd.cardinality", mk("erd", base, [[1, 2, "line"], [2, 3, "line", "", "", "N"], [4, 1, "line"], [5, 3, "line"]]), mk("erd", base, ok)));
  it("a weak entity hangs on an identifying relationship", () => pair("erd.weak",
    mk("erd", [["entity", { name: "A" }], ["relationship", { name: "R" }], ["weakEntity", { name: "W" }], ["keyAttribute", { name: "k" }]], [[1, 2, "line", "", "1"], [2, 3, "line", "", "", "N"], [4, 1, "line"]]),
    mk("erd", [["entity", { name: "A" }], ["identifyingRel", { name: "R" }], ["weakEntity", { name: "W" }], ["keyAttribute", { name: "k" }]], [[1, 2, "line", "", "1"], [2, 3, "line", "", "", "N"], [4, 1, "line"]])));
  it("an attribute belongs to one entity", () => pair("erd.attrOwners", mk("erd", base, [...ok, [4, 3, "line"]]), mk("erd", base, ok)));
});

describe("DSD", () => {
  const cls = (fields: string): N => ["table", { name: "Classes", fields }];
  const stu = (fields: string): N => ["table", { name: "Students", fields }];
  const PK = "PK ClassID : INT\nName : VARCHAR(30)", FK = "PK StudentID : INT\nFK ClassID : INT";
  it("fields are read with their keys and types", () => {
    expect(tableFields({ id: "n1", type: "table", x: 0, y: 0, w: 1, h: 1, color: "none", text: { fields: "PK StudentID : INT\n Name : varchar(50) \nfk ClassID:INT" } }))
      .toEqual([{ key: "PK", name: "StudentID", type: "INT" }, { key: "", name: "Name", type: "VARCHAR(50)" }, { key: "FK", name: "ClassID", type: "INT" }]);
  });
  it("the corrected pair is clean", () => { expect(checkDiagram(mk("dsd", [cls(PK), stu(FK)], [[1, 2, "oneMany"]]))).toEqual([]); });
  it("every table has a primary key", () => pair("dsd.noPk", mk("dsd", [cls("ClassID : INT")]), mk("dsd", [cls(PK)])));
  it("a field name does not repeat", () => pair("dsd.dupField", mk("dsd", [cls(PK + "\nname : TEXT")]), mk("dsd", [cls(PK)])));
  it("the «many» table has the foreign key named after the «one» table's key", () => pair("dsd.noFk",
    mk("dsd", [cls(PK), stu("PK StudentID : INT\nFK Class : INT")], [[1, 2, "oneMany"]]), mk("dsd", [cls(PK), stu(FK)], [[1, 2, "oneMany"]])));
  it("a junction table's key may be primary and foreign at once (PK StudentID), so it is not reported as missing", () => {
    const junction = mk("dsd", [stu("PK StudentID : INT"), ["table", { name: "Marks", fields: "PK StudentID : INT\nPK CourseID : INT" }]], [[1, 2, "oneMany"]]);
    expect(rules(junction)).not.toContain("dsd.noFk");
    expect(rules(mk("dsd", [stu("PK StudentID : INT"), ["table", { name: "Marks", fields: "PK MarkID : INT" }]], [[1, 2, "oneMany"]]))).toContain("dsd.noFk");
  });
  it("a relationship drawn backwards is named so", () => pair("dsd.direction", mk("dsd", [cls(PK), stu(FK)], [[2, 1, "oneMany"]]), mk("dsd", [cls(PK), stu(FK)], [[1, 2, "oneMany"]])));
  it("both ends have one type", () => pair("dsd.type", mk("dsd", [cls(PK), stu("PK StudentID : INT\nFK ClassID : VARCHAR(5)")], [[1, 2, "oneMany"]]), mk("dsd", [cls(PK), stu(FK)], [[1, 2, "oneMany"]])));
  it("a foreign key is reached by a relationship", () => pair("dsd.fkUnlinked", mk("dsd", [cls(PK), stu(FK)]), mk("dsd", [cls(PK), stu(FK)], [[1, 2, "oneMany"]])));
});

describe("DFD", () => {
  const base: N[] = [["external", { name: "طالب" }], ["process", { number: "1.0", name: "تسجيل" }], ["store", { number: "D1", name: "الطلاب" }]];
  const ok: E[] = [[1, 2, "flow", "بيانات"], [2, 3, "flow", "سجل"], [3, 2, "flow", "تحقّق"]];
  it("the corrected DFD is clean", () => { expect(checkDiagram(mk("dfd", base, ok))).toEqual([]); });
  it("every flow passes through a process", () => pair("dfd.noProcess", mk("dfd", base, [...ok, [1, 3, "flow", "مباشر"]]), mk("dfd", base, ok)));
  it("a process takes data in and gives data out", () => pair("dfd.processIO", mk("dfd", base, [[1, 2, "flow", "بيانات"], [3, 1, "flow", "x"]]), mk("dfd", base, ok)));
  it("a flow is named", () => pair("dfd.unnamed", mk("dfd", base, [[1, 2, "flow", ""], [2, 3, "flow", "سجل"], [3, 2, "flow", "x"]]), mk("dfd", base, ok)));
  it("a process is numbered; numbers do not repeat", () => {
    pair("dfd.number", mk("dfd", [base[0], ["process", { number: "", name: "تسجيل" }], base[2]], ok), mk("dfd", base, ok));
    pair("dfd.dupNumber", mk("dfd", [...base, ["process", { number: "1.0", name: "طباعة" }]], [...ok, [3, 4, "flow", "x"], [4, 1, "flow", "y"]]),
      mk("dfd", [...base, ["process", { number: "2.0", name: "طباعة" }]], [...ok, [3, 4, "flow", "x"], [4, 1, "flow", "y"]]));
  });
  it("a store is written and read", () => pair("dfd.storeOut", mk("dfd", base, [[1, 2, "flow", "بيانات"], [2, 3, "flow", "سجل"], [2, 1, "flow", "رد"]]), mk("dfd", base, ok)));
});

describe("topology", () => {
  const net = (pc2: string, cable: string, p1 = "Fa0/1", p2 = "Fa0/2"): DiagramDoc => mk("topology",
    [["zone", { name: "LAN 192.168.1.0/24" }, 50, 250, 700, 300], ["switch", { name: "SW1" }, 300, 300], ["pc", { name: "PC1", details: "192.168.1.10" }, 150, 450], ["pc", { name: "PC2", details: pc2 }, 450, 450]],
    [[2, 3, cable, "", p1, ""], [2, 4, "copper", "", p2, ""]]);
  it("the corrected network is clean", () => { expect(checkDiagram(net("192.168.1.11", "copper"))).toEqual([]); });
  it("an address is used once", () => pair("top.dupIp", net("192.168.1.10", "copper"), net("192.168.1.11", "copper")));
  it("an address is valid", () => pair("top.badIp", net("192.168.1.300", "copper"), net("192.168.1.30", "copper")));
  it("a device in a named network has an address of it", () => pair("top.subnet", net("192.168.2.11", "copper"), net("192.168.1.11", "copper")));
  it("a port carries one cable", () => pair("top.port", net("192.168.1.11", "copper", "Fa0/1", "fa0/1"), net("192.168.1.11", "copper")));
  it("straight-through between unlike devices, crossover between like ones", () => {
    pair("top.cable", net("192.168.1.11", "cross"), net("192.168.1.11", "copper"));
    pair("top.cable", mk("topology", [["pc", { name: "A" }], ["pc", { name: "B" }]], [[1, 2, "copper"]]), mk("topology", [["pc", { name: "A" }], ["pc", { name: "B" }]], [[1, 2, "cross"]]));
  });
});
