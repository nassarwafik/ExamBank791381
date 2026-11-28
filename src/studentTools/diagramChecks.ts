// DG2 «افحص المخطط» (docs/enterprise-diagram-editor-design.md §6, §14) — the checks of a diagram against its notation's rules. Pure: no
// React, no DOM, no I/O. A finding is a note for the learner, in plain Arabic, pointing at the components / arrows it is about: never a
// mark, never sent anywhere, never a reason the editor refuses anything.
//
// Two levels: «خطأ» — the diagram breaks a rule of its notation (a flow between two external entities, a table without a primary key);
// «تنبيه» — something is most likely missing or unclear (an arrow without its name, a use case no actor reaches). Every rule is tested
// with a diagram that breaks it and one that keeps it, and every worked example passes with no finding at all.

import { nodeSpec, type DiagramKind } from "./diagramCatalog";
import type { DEdge, DiagramDoc, DNode } from "./diagramDoc";

export type FindingLevel = "error" | "warning";
export type Finding = { level: FindingLevel; rule: string; message: string; nodes: string[]; edges: string[] };

const name = (n: DNode) => (n.text.name ?? "").split("\n")[0].trim();
/** «صنف «Student»» — how a finding names a component. */
function label(doc: DiagramDoc, n: DNode): string {
  const spec = nodeSpec(doc.kind, n.type);
  const t = name(n) || (n.text.number ?? "").trim();
  return (spec?.label ?? "مكوّن") + (t ? " «" + t + "»" : "");
}

type Ctx = {
  doc: DiagramDoc;
  out: Finding[];
  byId: Map<string, DNode>;
  edgesOf: (id: string) => DEdge[];
  outOf: (id: string, types?: readonly string[]) => DEdge[];
  inOf: (id: string, types?: readonly string[]) => DEdge[];
  is: (id: string, ...types: string[]) => boolean;
  add: (level: FindingLevel, rule: string, message: string, nodes?: string[], edges?: string[]) => void;
};

function context(doc: DiagramDoc): Ctx {
  const byId = new Map(doc.nodes.map(n => [n.id, n]));
  const out: Finding[] = [];
  const match = (e: DEdge, types?: readonly string[]) => !types || types.includes(e.type);
  return {
    doc, out, byId,
    edgesOf: id => doc.edges.filter(e => e.from === id || e.to === id),
    outOf: (id, types) => doc.edges.filter(e => e.from === id && match(e, types)),
    inOf: (id, types) => doc.edges.filter(e => e.to === id && match(e, types)),
    is: (id, ...types) => types.includes(byId.get(id)?.type ?? ""),
    add: (level, rule, message, nodes = [], edges = []) => { out.push({ level, rule, message, nodes, edges }); },
  };
}

/** A note — and DG10 an icon or a free text: not one of the diagram's own symbols, so its rules leave it be (an icon beside a class, a step…). */
const isNote = (doc: DiagramDoc, n: DNode) => { const f = nodeSpec(doc.kind, n.type)?.form; return f === "note" || f === "icon" || f === "text"; };
const isContainer = (doc: DiagramDoc, n: DNode) => !!nodeSpec(doc.kind, n.type)?.resizable;
/** The component's centre lies inside the container. */
const inside = (n: DNode, c: DNode) => {
  const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
  return cx > c.x && cx < c.x + c.w && cy > c.y && cy < c.y + c.h;
};
/** The other end of an arrow. */
const other = (e: DEdge, id: string) => (e.from === id ? e.to : e.from);

/** Components that must carry a name, by kind (shapes with no text — start, end, bars — and notes never do). */
const NAMED: Readonly<Partial<Record<DiagramKind, readonly string[]>>> = {
  useCase: ["actor", "usecase", "system"], class: ["class", "abstract", "interface", "enum"], sequence: ["actorLifeline", "lifeline"],
  activity: ["action", "lane"], state: ["state", "composite"], object: ["object"], deployment: ["node", "component", "artifact", "database"],
  erd: ["entity", "weakEntity", "attribute", "keyAttribute", "multiAttribute", "derivedAttribute", "relationship", "identifyingRel"],
  dsd: ["table"], dfd: ["process", "processGS", "external", "store"],
  topology: ["router", "switch", "hub", "pc", "laptop", "server", "ap", "printer", "phone", "firewall", "cloud"],
  flowchart: ["io", "process", "decision", "subroutine", "connector"],
};
/** Components whose names must not repeat (two classes «Student», two tables «Students»). */
const UNIQUE: Readonly<Partial<Record<DiagramKind, readonly string[]>>> = {
  useCase: ["actor", "usecase"], class: ["class", "abstract", "interface", "enum"], sequence: ["actorLifeline", "lifeline"],
  state: ["state"], object: ["object"], erd: ["entity", "weakEntity", "relationship", "identifyingRel"], dsd: ["table"],
  topology: ["router", "switch", "hub", "pc", "laptop", "server", "ap", "printer", "phone", "firewall"],
};
/** Components that are expected to be joined to something (a lone one is most likely unfinished). */
const CONNECTED: Readonly<Partial<Record<DiagramKind, readonly string[]>>> = {
  useCase: ["actor", "usecase"], sequence: ["actorLifeline", "lifeline"], activity: ["action", "decision", "fork"],
  state: ["state", "choice"], erd: ["entity", "weakEntity", "attribute", "keyAttribute", "multiAttribute", "derivedAttribute", "relationship", "identifyingRel"],
  dfd: ["process", "processGS", "external", "store"], topology: ["router", "switch", "hub", "pc", "laptop", "server", "ap", "printer", "phone", "firewall", "cloud"],
  flowchart: ["io", "process", "decision", "subroutine", "connector"],
};

function common(c: Ctx) {
  const { doc } = c;
  for (const n of doc.nodes) {
    if (NAMED[doc.kind]?.includes(n.type) && !name(n)) c.add("warning", "name.missing", nodeSpec(doc.kind, n.type)!.label + " بلا اسم: اكتب اسمه في «الخصائص».", [n.id]);
  }
  const groups = new Map<string, DNode[]>();
  for (const n of doc.nodes) {
    if (!UNIQUE[doc.kind]?.includes(n.type) || !name(n)) continue;
    const k = name(n).toLowerCase();
    groups.set(k, [...(groups.get(k) ?? []), n]);
  }
  for (const [, list] of groups) if (list.length > 1) c.add("error", "name.duplicate", "الاسم «" + name(list[0]) + "» مكرّر " + list.length + " مرات: لكل مكوّن اسم لا يتكرّر.", list.map(n => n.id));
  const wanted = CONNECTED[doc.kind];
  const many = doc.nodes.filter(n => wanted?.includes(n.type)).length > 1;
  if (wanted && many) for (const n of doc.nodes) {
    if (wanted.includes(n.type) && !c.edgesOf(n.id).length) c.add("warning", "node.isolated", label(doc, n) + " غير موصول بأي سهم.", [n.id]);
  }
}

// ── UML: use case ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function useCase(c: Ctx) {
  const { doc } = c;
  for (const e of doc.edges) {
    const a = c.byId.get(e.from)!, b = c.byId.get(e.to)!;
    if (isNote(doc, a) || isNote(doc, b)) continue;
    const kinds = [a.type, b.type].sort().join("+");
    if (e.type === "assoc" && kinds !== "actor+usecase") c.add("error", "uc.assoc", "الارتباط يصل فاعلًا بحالة استخدام، لا " + (kinds === "actor+actor" ? "فاعلين" : "حالتي استخدام") + " (بين حالتين استعمل «include» أو «extend»).", [a.id, b.id], [e.id]);
    if ((e.type === "include" || e.type === "extend") && kinds !== "usecase+usecase") c.add("error", "uc.include", "«" + e.type + "» تصل حالتي استخدام فقط.", [a.id, b.id], [e.id]);
    if (e.type === "generalize" && a.type !== b.type) c.add("error", "uc.generalize", "التعميم يكون بين فاعلين أو بين حالتي استخدام، لا بين فاعل وحالة.", [a.id, b.id], [e.id]);
  }
  // a use case is reached by an actor directly, or through include / extend / generalisation from one that is
  const reached = new Set(doc.nodes.filter(n => n.type === "usecase" && c.edgesOf(n.id).some(e => e.type === "assoc" && c.is(other(e, n.id), "actor"))).map(n => n.id));
  for (let grew = true; grew;) {
    grew = false;
    for (const e of doc.edges) {
      if (!["include", "extend", "generalize"].includes(e.type) || !c.is(e.from, "usecase") || !c.is(e.to, "usecase")) continue;
      for (const [x, y] of [[e.from, e.to], [e.to, e.from]]) if (reached.has(x) && !reached.has(y)) { reached.add(y); grew = true; }
    }
  }
  for (const n of doc.nodes) {
    if (n.type === "usecase" && c.edgesOf(n.id).length && !reached.has(n.id)) c.add("warning", "uc.unreached", "لا يصل أي فاعل إلى " + label(doc, n) + ": اربطه بفاعل أو بحالة يصلها فاعل.", [n.id]);
  }
  const systems = doc.nodes.filter(n => n.type === "system");
  for (const s of systems) for (const n of doc.nodes) {
    if (n.type === "actor" && inside(n, s)) c.add("warning", "uc.actorInside", label(doc, n) + " داخل حدود النظام: الفاعل يكون خارج النظام دائمًا.", [n.id, s.id]);
  }
  if (systems.length) for (const n of doc.nodes) {
    if (n.type === "usecase" && !systems.some(s => inside(n, s))) c.add("warning", "uc.outside", label(doc, n) + " خارج حدود النظام: حالات الاستخدام تكون داخله.", [n.id]);
  }
}

// ── UML: class ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const CLASSES = ["class", "abstract"];
function classes(c: Ctx) {
  const { doc } = c;
  for (const e of doc.edges) {
    const a = c.byId.get(e.from)!, b = c.byId.get(e.to)!;
    if (isNote(doc, a) || isNote(doc, b)) continue;
    if (e.type === "inherit") {
      if (b.type === "enum" || a.type === "enum") c.add("error", "cls.inheritEnum", "التعداد (enum) لا يرث ولا يُورَث.", [a.id, b.id], [e.id]);
      else if (b.type === "interface" && a.type !== "interface") c.add("error", "cls.inheritInterface", label(doc, a) + " ينفّذ الواجهة " + label(doc, b) + " ولا يرثها: استعمل «تنفيذ واجهة».", [a.id, b.id], [e.id]);
      else if (a.type === "interface" && b.type !== "interface") c.add("error", "cls.interfaceFromClass", "الواجهة ترث من واجهة فقط.", [a.id, b.id], [e.id]);
    }
    if (e.type === "realize" && b.type !== "interface") c.add("error", "cls.realize", "«تنفيذ واجهة» ينتهي عند واجهة، و" + label(doc, b) + " ليس واجهة.", [a.id, b.id], [e.id]);
    if (["assoc", "aggregation", "composition"].includes(e.type) && !e.fromLabel.trim() && !e.toLabel.trim()) c.add("warning", "cls.multiplicity", "اكتب التعدّدية على طرفي العلاقة بين " + label(doc, a) + " و" + label(doc, b) + " (مثل 1 و *).", [a.id, b.id], [e.id]);
  }
  for (const n of doc.nodes) {
    if (!CLASSES.includes(n.type)) continue;
    const parents = c.outOf(n.id, ["inherit"]).filter(e => CLASSES.includes(c.byId.get(e.to)!.type));
    if (parents.length > 1) c.add("error", "cls.multipleInheritance", label(doc, n) + " يرث من " + parents.length + " أصناف، و C# لا يسمح إلا بصنف أب واحد (للباقي استعمل الواجهات).", [n.id, ...parents.map(e => e.to)], parents.map(e => e.id));
  }
  // a cycle of inheritance (A → B → … → A)
  const seen = new Set<string>();
  for (const n of doc.nodes) {
    const path: string[] = [];
    let cur: string | undefined = n.id;
    while (cur && !path.includes(cur)) { path.push(cur); cur = c.outOf(cur, ["inherit"])[0]?.to; }
    if (cur && path.includes(cur)) {
      const cycle = path.slice(path.indexOf(cur));
      const key = [...cycle].sort().join(",");
      if (!seen.has(key)) { seen.add(key); c.add("error", "cls.cycle", "وراثة دائرية: " + cycle.map(id => "«" + name(c.byId.get(id)!) + "»").join(" ← ") + " — لا يرث صنف من نفسه.", cycle); }
    }
  }
  for (const n of doc.nodes) {
    if (!["class", "abstract", "interface"].includes(n.type)) continue;
    const lines = (["attrs", "ops"] as const).flatMap(k => (n.text[k] ?? "").split("\n").map(l => l.trim()).filter(Boolean).map(l => [k, l] as const));
    const noVis = lines.filter(([, l]) => !/^[+\-#~]/.test(l)).length;
    if (noVis) c.add("warning", "cls.visibility", label(doc, n) + ": " + noVis + " سطر بلا رمز الرؤية في أوّله (+ عام، - خاص، # محمي).", [n.id]);
    // an interface has one compartment for its properties and its methods: only a class's operations must all carry brackets
    const badOps = n.type === "interface" ? 0 : lines.filter(([k, l]) => k === "ops" && !/\(.*\)/.test(l)).length;
    if (badOps) c.add("warning", "cls.opParens", label(doc, n) + ": اكتب الدالة بقوسين، مثل: + GetName() : string", [n.id]);
  }
}

// ── UML: sequence ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function sequence(c: Ctx) {
  const { doc } = c;
  const sorted = [...doc.edges].sort((a, b) => a.y - b.y);
  sorted.forEach((e, i) => {
    if (!e.label.trim()) c.add("warning", "seq.unnamed", "رسالة بلا اسم بين " + label(doc, c.byId.get(e.from)!) + " و" + label(doc, c.byId.get(e.to)!) + ".", [], [e.id]);
    if (e.type === "return" && !sorted.slice(0, i).some(m => m.type !== "return" && m.from === e.to && m.to === e.from)) {
      c.add("warning", "seq.return", "رسالة الرجوع «" + e.label + "» لا تسبقها رسالة من " + label(doc, c.byId.get(e.to)!) + " إلى " + label(doc, c.byId.get(e.from)!) + ".", [], [e.id]);
    }
  });
  for (const n of doc.nodes) {
    if (n.type !== "fragment") continue;
    const op = (n.text.name ?? "").trim().toLowerCase();
    if (!["alt", "opt", "loop", "par", "break"].includes(op)) c.add("warning", "seq.fragmentOp", "نوع الإطار يكون alt أو opt أو loop (أو par أو break).", [n.id]);
    if (["alt", "opt", "loop", "break"].includes(op) && !(n.text.guard ?? "").trim()) c.add("warning", "seq.guard", "إطار «" + op + "» بلا شرط: اكتب الشرط بين قوسين، مثل [البيانات صحيحة].", [n.id]);
  }
}

// ── UML: activity and state ─────────────────────────────────────────────────────────────────────────────────────────────────────────
function flowGraph(c: Ctx, start: string, end: string, kindWord: { start: string; end: string; startHow?: string; endHow?: string },
  jumps: readonly { from: string; to: string }[] = []) {
  const { doc } = c;
  // DG10: an arrow to or from a note, an icon or a text is not a step of the flow; DG9: a jump (a flowchart's connector to its twin)
  // carries the flow on as an arrow would
  const aside = (e: DEdge) => isNote(doc, c.byId.get(e.from)!) || isNote(doc, c.byId.get(e.to)!);
  const ins = (id: string) => c.inOf(id).filter(e => !aside(e)), outs = (id: string) => c.outOf(id).filter(e => !aside(e));
  const ways = [...doc.edges.filter(e => !aside(e)), ...jumps];
  const starts = doc.nodes.filter(n => n.type === start), ends = doc.nodes.filter(n => n.type === end);
  const working = doc.nodes.filter(n => !isNote(doc, n) && !isContainer(doc, n));
  if (!working.length) return;
  if (!starts.length) c.add("error", "flow.noStart", "لا " + kindWord.start + ": " + (kindWord.startHow ?? "يبدأ المخطط بدائرة ممتلئة."));
  if (starts.length > 1) c.add("warning", "flow.manyStarts", "في المخطط " + starts.length + " " + kindWord.start + ": المعتاد واحدة.", starts.map(n => n.id));
  if (!ends.length) c.add("error", "flow.noEnd", "لا " + kindWord.end + ": " + (kindWord.endHow ?? "ينتهي المخطط بالدائرة المزدوجة."));
  for (const s of starts) if (ins(s.id).length) c.add("error", "flow.intoStart", "لا يدخل سهم إلى " + kindWord.start + ".", [s.id], ins(s.id).map(e => e.id));
  for (const s of starts) if (outs(s.id).length > 1) c.add("warning", "flow.startMany", "يخرج من " + kindWord.start + " سهم واحد.", [s.id], outs(s.id).map(e => e.id));
  for (const s of ends) if (outs(s.id).length) c.add("error", "flow.fromEnd", "لا يخرج سهم من " + kindWord.end + ".", [s.id], outs(s.id).map(e => e.id));
  // reachable from a start
  const reached = new Set(starts.map(s => s.id));
  for (let grew = true; grew;) {
    grew = false;
    for (const e of ways) if (reached.has(e.from) && !reached.has(e.to)) { reached.add(e.to); grew = true; }
  }
  if (starts.length) for (const n of working) {
    if (n.type !== start && !reached.has(n.id) && (ins(n.id).length || outs(n.id).length)) c.add("warning", "flow.unreached", "لا يُوصَل إلى " + label(doc, n) + " من " + kindWord.start + ".", [n.id]);
  }
  for (const n of working) {
    if (n.type === end || n.type === start || isContainer(doc, n)) continue;
    if (ins(n.id).length && !outs(n.id).length && !jumps.some(j => j.from === n.id)) c.add("warning", "flow.deadEnd", "لا يخرج أي سهم من " + label(doc, n) + ": إلى أين يذهب بعده؟", [n.id]);
  }
}

function activity(c: Ctx) {
  const { doc } = c;
  flowGraph(c, "start", "end", { start: "البداية", end: "النهاية" });
  for (const n of doc.nodes) {
    if (n.type === "decision") {
      const outs = c.outOf(n.id), ins = c.inOf(n.id);
      if (outs.length >= 2) {
        const bare = outs.filter(e => !e.label.trim());
        if (bare.length) c.add("warning", "act.guard", "اكتب الشرط على كل سهم يخرج من القرار، مثل [نعم] و[لا].", [n.id], bare.map(e => e.id));
      } else if (ins.length < 2) c.add("warning", "act.decision", "القرار يخرج منه سهمان على الأقل (أو يدخله سهمان إن كان دمجًا).", [n.id]);
    }
    if (n.type === "fork") {
      const ins = c.inOf(n.id).length, outs = c.outOf(n.id).length;
      if (!((ins === 1 && outs >= 2) || (ins >= 2 && outs === 1))) c.add("warning", "act.fork", "شريط التفرّع: سهم يدخل وأكثر يخرج؛ وشريط التجميع: أكثر يدخل وسهم يخرج.", [n.id]);
    }
  }
}

function state(c: Ctx) {
  const { doc } = c;
  flowGraph(c, "initial", "final", { start: "الحالة الابتدائية", end: "الحالة النهائية" });
  for (const n of doc.nodes) {
    if (n.type === "state") {
      const outs = c.outOf(n.id);
      const bare = outs.filter(e => !e.label.trim() && !c.is(e.to, "final"));
      if (outs.length >= 2 && bare.length) c.add("warning", "st.event", "يخرج من " + label(doc, n) + " أكثر من انتقال: اكتب على كل انتقال الحدث الذي يسبّبه.", [n.id], bare.map(e => e.id));
    }
    if (n.type === "choice" && c.outOf(n.id).length < 2) c.add("warning", "st.choice", "الاختيار يخرج منه انتقالان على الأقل، بشرط على كل منهما.", [n.id]);
  }
}

// ── DG6: flowchart ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function flowchart(c: Ctx) {
  const { doc } = c;
  // DG9: a connector an arrow goes into (and none out of) continues at the connector with the same mark an arrow leaves (and none
  // comes into): the flowchart's jump to another column or page
  const connectors = doc.nodes.filter(n => n.type === "connector" && name(n));
  const jumps = connectors.filter(a => c.inOf(a.id).length && !c.outOf(a.id).length)
    .flatMap(a => connectors.filter(b => b !== a && name(b) === name(a) && c.outOf(b.id).length && !c.inOf(b.id).length).map(b => ({ from: a.id, to: b.id })));
  flowGraph(c, "start", "end", { start: "البداية", end: "النهاية", startHow: "يبدأ المخطط بالشكل البيضاوي «ابدأ».", endHow: "ينتهي المخطط بالشكل البيضاوي «انتهِ»." }, jumps);
  for (const n of doc.nodes) {
    const outs = c.outOf(n.id);
    if (n.type === "decision") {
      if (outs.length < 2) c.add("error", "fc.decision", "يخرج من " + label(doc, n) + " سهمان: «نعم» و«لا».", [n.id], outs.map(e => e.id));
      else {
        if (outs.length > 2) c.add("warning", "fc.decisionMany", "للقرار مخرجان فقط، «نعم» و«لا». لأكثر من حالتين استعمل قرارًا بعد قرار.", [n.id], outs.map(e => e.id));
        const bare = outs.filter(e => !e.label.trim());
        if (bare.length) c.add("warning", "fc.answer", "اكتب «نعم» أو «لا» على كل سهم يخرج من " + label(doc, n) + ".", [n.id], bare.map(e => e.id));
      }
    }
    // one way on: a branch is a decision's job
    if ((n.type === "process" || n.type === "io" || n.type === "subroutine") && outs.length > 1) {
      c.add("error", "fc.oneOut", "يخرج من " + label(doc, n) + " سهم واحد فقط. التفرّع يكون بشكل «قرار».", [n.id], outs.map(e => e.id));
    }
  }
}

// ── UML: object, deployment ─────────────────────────────────────────────────────────────────────────────────────────────────────────
function objects(c: Ctx) {
  for (const n of c.doc.nodes) {
    if (n.type === "object" && name(n) && !/:/.test(name(n))) c.add("warning", "obj.name", "اكتب اسم الكائن ثم نقطتين ثم صنفه، مثل: s1 : Student", [n.id]);
  }
  const objs = c.doc.nodes.filter(n => n.type === "object");
  if (objs.length > 1) for (const n of objs) if (!c.edgesOf(n.id).length) c.add("warning", "node.isolated", label(c.doc, n) + " غير موصول بأي رابط.", [n.id]);
}

function deployment(c: Ctx) {
  const nodes = c.doc.nodes.filter(n => n.type === "node");
  if (!nodes.length) return;
  for (const n of c.doc.nodes) {
    if ((n.type === "component" || n.type === "artifact") && !nodes.some(d => inside(n, d))) c.add("warning", "dep.outside", label(c.doc, n) + " ليس داخل أي عقدة: ضعه داخل الجهاز أو الخادم الذي يعمل عليه.", [n.id]);
  }
}

// ── ERD ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const ENTITIES = ["entity", "weakEntity"], RELS = ["relationship", "identifyingRel"], ATTRS = ["attribute", "keyAttribute", "multiAttribute", "derivedAttribute"];
function erd(c: Ctx) {
  const { doc } = c;
  for (const e of doc.edges) {
    const a = c.byId.get(e.from)!, b = c.byId.get(e.to)!;
    if (ENTITIES.includes(a.type) && ENTITIES.includes(b.type)) c.add("error", "erd.direct", "يتصل " + label(doc, a) + " و" + label(doc, b) + " عبر علاقة (معيّن) تسمّيها، لا بخط مباشر.", [a.id, b.id], [e.id]);
    if (RELS.includes(a.type) && RELS.includes(b.type)) c.add("error", "erd.relRel", "العلاقة تصل كيانات، لا علاقة أخرى.", [a.id, b.id], [e.id]);
    const rel = RELS.includes(a.type) ? a : RELS.includes(b.type) ? b : null, ent = ENTITIES.includes(a.type) ? a : ENTITIES.includes(b.type) ? b : null;
    if (rel && ent && !e.fromLabel.trim() && !e.toLabel.trim()) c.add("warning", "erd.cardinality", "اكتب التعدّدية (1 أو N أو M) على الخط بين " + label(doc, ent) + " و" + label(doc, rel) + ".", [ent.id, rel.id], [e.id]);
  }
  for (const n of doc.nodes) {
    if (ENTITIES.includes(n.type)) {
      const attrs = c.edgesOf(n.id).map(e => c.byId.get(other(e, n.id))!).filter(x => ATTRS.includes(x.type));
      if (n.type === "entity" && !attrs.some(x => x.type === "keyAttribute")) c.add("error", "erd.noKey", label(doc, n) + " بلا صفة مفتاح: أضف «صفة مفتاح» (يُكتب اسمها وتحته خط).", [n.id]);
      if (n.type === "weakEntity" && !c.edgesOf(n.id).some(e => c.is(other(e, n.id), "identifyingRel"))) c.add("warning", "erd.weak", label(doc, n) + " يتصل بالكيان المالك عبر «علاقة معرِّفة» (المعيّن المزدوج).", [n.id]);
    }
    if (RELS.includes(n.type)) {
      const ends = c.edgesOf(n.id).filter(e => ENTITIES.includes(c.byId.get(other(e, n.id))!.type));
      if (ends.length < 2) c.add("error", "erd.relEnds", label(doc, n) + " تصل كيانين (أو الكيان نفسه مرتين في العلاقة الذاتية)، وفيها الآن " + ends.length + ".", [n.id]);
    }
    if (ATTRS.includes(n.type)) {
      const owners = c.edgesOf(n.id).map(e => c.byId.get(other(e, n.id))!).filter(x => ENTITIES.includes(x.type) || RELS.includes(x.type));
      if (owners.length > 1) c.add("warning", "erd.attrOwners", label(doc, n) + " موصولة بأكثر من كيان: الصفة لكيان واحد.", [n.id, ...owners.map(o => o.id)]);
    }
  }
}

// ── DSD ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
type Field = { key: "PK" | "FK" | ""; name: string; type: string };
export function tableFields(n: DNode): Field[] {
  return (n.text.fields ?? "").split("\n").map(l => l.trim()).filter(Boolean).map(l => {
    const m = /^(PK|FK)\s+(.*)$/i.exec(l);
    const key = (m ? m[1].toUpperCase() : "") as Field["key"];
    const rest = m ? m[2] : l;
    const [fname, ...type] = rest.split(":");
    return { key, name: fname.trim(), type: type.join(":").trim().toUpperCase() };
  });
}
function dsd(c: Ctx) {
  const { doc } = c;
  const tables = doc.nodes.filter(n => n.type === "table");
  for (const t of tables) {
    const fields = tableFields(t);
    if (!fields.some(f => f.key === "PK")) c.add("error", "dsd.noPk", label(doc, t) + " بلا مفتاح أساسي: اكتب PK في أوّل سطر الحقل الذي يميّز كل صف.", [t.id]);
    const dup = fields.map(f => f.name.toLowerCase()).filter((x, i, all) => x && all.indexOf(x) !== i);
    if (dup.length) c.add("error", "dsd.dupField", label(doc, t) + ": الحقل «" + fields.find(f => f.name.toLowerCase() === dup[0])!.name + "» مكرّر.", [t.id]);
  }
  const linked = new Map<string, Set<string>>();   // table → the FK names some relationship explains
  for (const e of doc.edges) {
    const a = c.byId.get(e.from)!, b = c.byId.get(e.to)!;
    if (a.type !== "table" || b.type !== "table" || a.id === b.id) continue;
    // the «one» side holds the primary key; the «many» side the foreign key (1 — ∞ from PK to FK; crow's foot at the many side)
    const one = a, many = b;
    // a junction table's key is primary and foreign at once (PK StudentID in Marks): a PK of the «many» side may be the foreign key
    const pks = tableFields(one).filter(f => f.key === "PK"), fks = tableFields(many).filter(f => f.key === "FK" || f.key === "PK");
    if (!pks.length) continue;   // reported above
    const match = fks.filter(f => pks.some(p => p.name.toLowerCase() === f.name.toLowerCase()));
    if (!match.length) {
      const back = tableFields(one).filter(f => f.key === "FK").some(f => tableFields(many).some(p => p.key === "PK" && p.name.toLowerCase() === f.name.toLowerCase()));
      c.add("warning", back ? "dsd.direction" : "dsd.noFk", back
        ? "العلاقة بين " + label(doc, one) + " و" + label(doc, many) + " مرسومة بالاتجاه المعاكس: تبدأ من الجدول صاحب المفتاح الأساسي (طرف 1). استعمل «اعكس الاتجاه»."
        : label(doc, many) + " بلا مفتاح أجنبي باسم المفتاح الأساسي لـ" + label(doc, one) + " (" + pks.map(p => p.name).join("، ") + "): العلاقة تربط الحقلين نفسيهما.", [one.id, many.id], [e.id]);
      continue;
    }
    const set = linked.get(many.id) ?? new Set<string>();
    for (const f of match) {
      set.add(f.name.toLowerCase());
      const pk = pks.find(p => p.name.toLowerCase() === f.name.toLowerCase())!;
      if (pk.type && f.type && pk.type.replace(/\s+/g, "") !== f.type.replace(/\s+/g, "")) c.add("warning", "dsd.type", "النوع مختلف على طرفي العلاقة: " + one.text.name + "." + pk.name + " (" + pk.type + ") و" + many.text.name + "." + f.name + " (" + f.type + ").", [one.id, many.id], [e.id]);
    }
    linked.set(many.id, set);
  }
  for (const t of tables) for (const f of tableFields(t)) {
    if (f.key === "FK" && !linked.get(t.id)?.has(f.name.toLowerCase())) c.add("warning", "dsd.fkUnlinked", "المفتاح الأجنبي " + t.text.name + "." + f.name + " لا تصله علاقة من الجدول الذي يشير إليه.", [t.id]);
  }
}

// ── DFD ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const PROCESSES = ["process", "processGS"];
function dfd(c: Ctx) {
  const { doc } = c;
  for (const e of doc.edges) {
    const a = c.byId.get(e.from)!, b = c.byId.get(e.to)!;
    if (isNote(doc, a) || isNote(doc, b)) continue;
    if (!PROCESSES.includes(a.type) && !PROCESSES.includes(b.type)) {
      const what = a.type === "store" && b.type === "store" ? "من مخزن إلى مخزن" : a.type === "external" && b.type === "external" ? "من كيان خارجي إلى كيان خارجي" : "بين كيان خارجي ومخزن";
      c.add("error", "dfd.noProcess", "كل تدفّق يمرّ بعملية: لا تنتقل البيانات " + what + " مباشرة.", [a.id, b.id], [e.id]);
    }
    if (!e.label.trim()) c.add("warning", "dfd.unnamed", "تدفّق بلا اسم من " + label(doc, a) + " إلى " + label(doc, b) + ": اكتب البيانات التي تنتقل.", [], [e.id]);
  }
  const numbers = new Map<string, DNode[]>();
  for (const n of doc.nodes) {
    if (PROCESSES.includes(n.type)) {
      const ins = c.inOf(n.id).length, outs = c.outOf(n.id).length;
      if (ins + outs > 0 && (!ins || !outs)) c.add("error", "dfd.processIO", label(doc, n) + (ins ? " لا يخرج منها شيء" : " لا يدخلها شيء") + ": كل عملية تأخذ بيانات وتُخرج بيانات.", [n.id]);
      if (!(n.text.number ?? "").trim()) c.add("warning", "dfd.number", label(doc, n) + " بلا رقم (1.0، 2.0 …).", [n.id]);
    }
    if (n.type === "store") {
      const ins = c.inOf(n.id).length, outs = c.outOf(n.id).length;
      if (ins + outs > 0 && !outs) c.add("warning", "dfd.storeOut", label(doc, n) + " تدخله بيانات ولا يقرأ منه أحد.", [n.id]);
      if (ins + outs > 0 && !ins) c.add("warning", "dfd.storeIn", label(doc, n) + " يُقرأ منه ولا تُكتب فيه بيانات.", [n.id]);
    }
    if ((PROCESSES.includes(n.type) || n.type === "store") && (n.text.number ?? "").trim()) {
      const k = (n.text.number ?? "").trim().toLowerCase();
      numbers.set(k, [...(numbers.get(k) ?? []), n]);
    }
  }
  for (const [num, list] of numbers) if (list.length > 1) c.add("error", "dfd.dupNumber", "الرقم " + num.toUpperCase() + " مكرّر: لكل عملية ومخزن رقم لا يتكرّر.", list.map(n => n.id));
}

// ── topology ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const IPV4 = /(?<![\d.])(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?(?![\d.])/g;
const SWITCHING = ["switch", "hub"], HOSTLIKE = ["pc", "laptop", "server", "printer", "router"];
const toInt = (o: number[]) => ((o[0] << 24) >>> 0) + (o[1] << 16) + (o[2] << 8) + o[3];
function topology(c: Ctx) {
  const { doc } = c;
  const seen = new Map<string, DNode[]>();
  const addrs = new Map<string, number[]>();   // device → its addresses (as numbers)
  for (const n of doc.nodes) {
    for (const m of `${n.text.details ?? ""}`.matchAll(IPV4)) {
      const o = m.slice(1, 5).map(Number);
      if (o.some(x => x > 255) || (m[5] !== undefined && Number(m[5]) > 32)) { c.add("error", "top.badIp", label(doc, n) + ": العنوان " + m[0] + " غير صالح (كل جزء من 0 إلى 255، والقناع حتى 32).", [n.id]); continue; }
      if (n.type === "zone") continue;
      const ip = o.join(".");
      seen.set(ip, [...(seen.get(ip) ?? []), n]);
      addrs.set(n.id, [...(addrs.get(n.id) ?? []), toInt(o)]);
    }
  }
  for (const [ip, list] of seen) {
    const devices = [...new Set(list)];
    if (devices.length > 1) c.add("error", "top.dupIp", "العنوان " + ip + " مكرّر في " + devices.map(d => "«" + name(d) + "»").join(" و") + ": لكل جهاز عنوان مختلف.", devices.map(d => d.id));
  }
  // a zone named with a network (LAN 192.168.1.0/24): the devices inside it have addresses of that network
  for (const z of doc.nodes.filter(n => n.type === "zone")) {
    const m = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})/.exec(z.text.name ?? "");
    if (!m) continue;
    const o = m.slice(1, 5).map(Number), bits = Number(m[5]);
    if (o.some(x => x > 255) || bits > 32) continue;
    const mask = bits ? (~0 << (32 - bits)) >>> 0 : 0, net = (toInt(o) & mask) >>> 0;
    for (const n of doc.nodes) {
      if (n.id === z.id || !inside(n, z)) continue;
      for (const a of addrs.get(n.id) ?? []) if (((a & mask) >>> 0) !== net) {
        c.add("warning", "top.subnet", label(doc, n) + " داخل " + name(z) + " وعنوانه ليس من هذه الشبكة.", [n.id, z.id]);
        break;
      }
    }
  }
  // a port used by two cables on the same device
  const ports = new Map<string, DEdge[]>();
  for (const e of doc.edges) for (const [id, port] of [[e.from, e.fromLabel], [e.to, e.toLabel]] as const) {
    const p = port.trim().toLowerCase().replace(/\s+/g, "");
    if (!p) continue;
    const k = id + "|" + p;
    ports.set(k, [...(ports.get(k) ?? []), e]);
  }
  for (const [k, list] of ports) if (list.length > 1) {
    const [id] = k.split("|");
    const port = list[0].from === id ? list[0].fromLabel : list[0].toLabel;
    c.add("error", "top.port", "المنفذ " + port.trim() + " في " + label(doc, c.byId.get(id)!) + " مستعمل لأكثر من كابل.", [id], list.map(e => e.id));
  }
  // the classic cable rule: straight-through between unlike devices, crossover between like ones
  for (const e of doc.edges) {
    if (e.type !== "copper" && e.type !== "cross") continue;
    const a = c.byId.get(e.from)!.type, b = c.byId.get(e.to)!.type;
    const ga = SWITCHING.includes(a) ? "s" : HOSTLIKE.includes(a) ? "h" : "", gb = SWITCHING.includes(b) ? "s" : HOSTLIKE.includes(b) ? "h" : "";
    if (!ga || !gb) continue;
    const like = ga === gb;
    if (like && e.type === "copper") c.add("warning", "top.cable", "بين جهازين من النوع نفسه (" + name(c.byId.get(e.from)!) + " و" + name(c.byId.get(e.to)!) + ") يُستعمل الكابل المتقاطع.", [e.from, e.to], [e.id]);
    if (!like && e.type === "cross") c.add("warning", "top.cable", "بين جهازين مختلفين (" + name(c.byId.get(e.from)!) + " و" + name(c.byId.get(e.to)!) + ") يُستعمل الكابل المستقيم (النحاسي).", [e.from, e.to], [e.id]);
  }
}

const BY_KIND: Readonly<Record<DiagramKind, (c: Ctx) => void>> = {
  useCase, class: classes, sequence, activity, state, object: objects, deployment, erd, dsd, dfd, topology, flowchart,
};

/** Every finding of the diagram: errors first, then warnings, each in the diagram's order. */
export function checkDiagram(doc: DiagramDoc): Finding[] {
  const c = context(doc);
  if (!doc.nodes.some(n => !isNote(doc, n))) return [];
  common(c);
  BY_KIND[doc.kind](c);
  return [...c.out.filter(f => f.level === "error"), ...c.out.filter(f => f.level === "warning")];
}
