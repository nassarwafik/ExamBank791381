// Phase 20G — the STRESS fixture: a large but BOUNDED exam generated deterministically (no randomness: ids, marks and content are functions of
// the position), every production family at least once per section in rotation, and a «kitchen-sink» composite per section that sits AT the
// composite@1 limits that matter (3 SmartSim contexts — the cap — plus 2 static sources, one child of EVERY supported child identity except the
// uploaded-package simulation, 4 coding children — the cap — and a firstNAnswered group). Every question carries its own known-correct answer
// and the expected [auto, pending] outcome by family rule (derived from the contract, not from the grader).
// Size is a parameter; the certification run uses the size chosen by measurement (see the stress test and the design record §stress).
import { freeFallClassroomConfig } from "../../../../src/physicsFreeFall/freeFallTemplates.ts";
import { rationalCertificationConfig } from "../../../../src/functionStudy/functionStudyTemplates.ts";
import { net2TemplateById } from "../../../../src/networkTopology2/net2Templates.ts";
import { routerTwoSwitchesFourPcsTemplate } from "../../../../src/networkTopology/networkTopologyTemplates.ts";
import * as K from "../kit.js";
import { IMG } from "./E-showcase.js";

const { A } = K;
const CODE_CFG = lang => ({ allowedLanguages: [lang], defaultLanguage: lang, starterCode: {}, taskMode: "program", inputMode: "stdin", outputMode: "stdout", limits: { sourceBytes: 65536, outputBytes: 65536, timeMs: 2000, memoryMb: 128 }, publicTests: [] });
const HT = [{ id: "h1", input: "1\n", expectedOutput: "1\n", weight: 1 }];
const TPL = { language: "python", segments: [{ kind: "locked", text: "def f(x):\n" }, { kind: "editable", id: "g", starter: "    return x\n" }, { kind: "locked", text: "\nprint(f(input()))\n" }] };
const roas = net2TemplateById("roas");
const RUB = tag => [["c", "المعيار", 2, [["full", 2], ["none", 0]]]];

/** One question of `family` with id `id`: [node, correctAnswer, expected [auto, pending] when answered correctly]. Marks are 2 everywhere. */
export function familyQuestion(family, id) {
  const t = "سؤال " + id;
  switch (family) {
    case "multipleChoice": return [K.mcq(id, t, 2, ["أ", "ب", "ج"], 1), A.choice(1), [2, 0]];
    case "trueFalse": return [K.trueFalse(id, t, 2, true), A.choice(0), [2, 0]];
    case "multiTrueFalse": return [K.multiTrueFalse(id, t, 2, [["r1", "أ", true], ["r2", "ب", false]]), A.fields({ r1: true, r2: false }), [2, 0]];
    case "shortAnswer": return [K.shortAnswer(id, t, 2, "شبكة"), A.text("شبكة"), [2, 0]];
    case "fillBlank": return [K.fillBlank(id, t, 2, [["f1", "أ", "7"]]), A.fields({ f1: "7" }), [2, 0]];
    case "wordBank": return [K.wordBank(id, t, 2, ["TCP", "UDP"], [["w1", "أ", "UDP"]]), A.fields({ w1: "UDP" }), [2, 0]];
    case "matching": return [K.matching(id, t, 2, [["m1", "HTTP", "80"]], ["80", "53"]), A.fields({ m1: "80" }), [2, 0]];
    case "ordering": return [K.ordering(id, t, 2, ["أ", "ب", "ج"]), A.seq(["أ", "ب", "ج"]), [2, 0]];
    case "tableFill": return [K.tableFill(id, t, 2, ["س", "ص"], [["1", ""]], [["c1", 0, 1, "2"]]), A.fields({ c1: "2" }), [2, 0]];
    case "cliFill": return [K.cliFill(id, t, 2, "Switch(config)# vlan [[v]]", [["v", "VLAN", "10"]]), A.fields({ v: "10" }), [2, 0]];
    case "multipleSelect": return [K.multipleSelect(id, t, 2, [["a", "أ"], ["b", "ب"], ["c", "ج"]], ["a", "c"]), A.multi(["a", "c"]), [2, 0]];
    case "numericResponse": return [K.numeric(id, t, 2, 42, 0), A.numeric(42), [2, 0]];
    case "matrix": return [K.matrix(id, t, 2, [["r1", "أ"]], [["k1", "1"], ["k2", "2"]], { r1: "k2" }), A.fields({ r1: "k2" }), [2, 0]];
    case "categorization": return [K.categorization(id, t, 2, [["k1", "1"], ["k2", "2"]], [["i1", "أ"]], { i1: "k1" }), A.fields({ i1: "k1" }), [2, 0]];
    case "inlineCloze": return [K.inlineCloze(id, t, 2, [{ type: "text", text: "x = " }, { type: "blank", id: "b1", control: "text" }], { b1: { accepted: ["5"], caseSensitive: false } }), A.fields({ b1: "5" }), [2, 0]];
    case "networkCli": return [K.networkCli(id, t, 2, { hostname: "S-" + id.replace(/[^A-Za-z0-9]/g, "").slice(-8) }), A.cli(["enable", "configure terminal", "hostname S-" + id.replace(/[^A-Za-z0-9]/g, "").slice(-8), "end"]), [2, 0]];
    case "hotspot": return [{ examQuestionId: id, presentationType: "hotspot", questionTypeVersion: 1, text: t, marks: 2, image: IMG(), hotspot: { v: 1, mode: "single", selections: 1, alt: "مخطط" }, answer: { scoring: "allOrNothing", regions: [{ id: "r", shape: { kind: "rect", x: 0.1, y: 0.1, width: 0.2, height: 0.2 } }] } }, { kind: "hotspot", points: [{ x: 0.2, y: 0.2 }] }, [2, 0]];
    case "labelDiagram": return [{ examQuestionId: id, presentationType: "labelDiagram", questionTypeVersion: 1, text: t, marks: 2, image: IMG(), labelDiagram: { v: 1, alt: "مخطط", allowReuse: false, zones: [{ id: "z1", shape: { kind: "rect", x: 0.1, y: 0.1, width: 0.2, height: 0.1 } }], labels: [{ id: "l1", text: "أ" }, { id: "l2", text: "ب" }] }, answer: { scoring: "proportional", correctLabelByZone: { z1: "l2" } } }, A.fields({ z1: "l2" }), [2, 0]];
    case "openResponse": return [K.openResponse(id, t, 2, id, RUB(id)), A.text("إجابة"), [0, 2]];
    case "parametricNumeric": return [K.parametric(id, t + " احسب {{a}} + 1", 2, { v: 2, generatorVersion: 2, variables: [{ id: "a", kind: "integer", min: 1, max: 9, step: 1 }], derivedVariables: [], constraints: [], response: { unit: "none" } }, { expression: "a+1", mode: "tolerance", tolerance: 0 }), null, null];
    case "coding@1": return [K.coding(id, t, 2, 1, CODE_CFG("python"), { gradingMode: "hiddenTests", comparator: "exact", hiddenTests: HT, referenceSolutions: {} }), A.code("print(input())\n"), [0, 2]];
    case "coding@2": return [K.coding(id, t, 2, 2, CODE_CFG("java"), { gradingMode: "hiddenTests", comparator: "exact", compileErrorPolicy: "manualReview", hiddenTests: HT, referenceSolutions: {} }), A.code("public class Main { public static void main(String[] a) { } }\n", "java"), [0, 2]];
    case "coding@3": return [K.coding(id, t, 2, 3, { ...CODE_CFG("python"), template: TPL }, { gradingMode: "hiddenTests", comparator: "exact", compileErrorPolicy: "zero", hiddenTests: HT, referenceSolutions: {} }), A.template({ g: "    return x\n" }), [0, 2]];
    case "smartSim:networkTopology@1": return [K.smartSim(id, t, 2, "networkTopology", 1, routerTwoSwitchesFourPcsTemplate(), [{ id: "h", label: "اسم SW1", weight: 1, kind: "switch.hostname", deviceId: "sw1", value: "X1" }]), A.sim("networkTopology", 1, [{ type: "switch.command", deviceId: "sw1", command: "enable" }, { type: "switch.command", deviceId: "sw1", command: "configure terminal" }, { type: "switch.command", deviceId: "sw1", command: "hostname X1" }]), [2, 0]];
    case "smartSim:networkTopology@2": return [K.smartSim(id, t, 2, "networkTopology", 2, roas.config(), [roas.checks()[0]]), A.sim("networkTopology", 2, [{ type: "switch.command", deviceId: "sw1", command: "enable" }, { type: "switch.command", deviceId: "sw1", command: "configure terminal" }, { type: "switch.command", deviceId: "sw1", command: "vlan 10" }]), [2, 0]];
    case "smartSim:physicsFreeFall@1": return [K.smartSim(id, t, 2, "physicsFreeFall", 1, freeFallClassroomConfig(), [{ id: "it", label: "زمن", weight: 1, kind: "physics.impactTime", measurementId: "impactTime", tolerance: 0.05 }]), A.sim("physicsFreeFall", 1, [{ type: "measurement.set", measurementId: "impactTime", value: 2.02 }]), [2, 0]];
    case "smartSim:functionStudy2d@1": return [K.smartSim(id, t, 2, "functionStudy2d", 1, rationalCertificationConfig(), [{ id: "d", label: "المجال", weight: 1, kind: "domain.exclusions", expected: [-2, 1], tolerance: 0.01 }]), A.sim("functionStudy2d", 1, [{ type: "domain.setExclusions", values: [-2, 1] }]), [2, 0]];
    default: throw new Error("unknown family " + family);
  }
}
export const STANDALONE_FAMILIES = ["multipleChoice", "trueFalse", "multiTrueFalse", "shortAnswer", "fillBlank", "wordBank", "matching", "ordering", "tableFill", "cliFill", "multipleSelect", "numericResponse", "matrix", "categorization",
  "inlineCloze", "networkCli", "hotspot", "labelDiagram", "openResponse", "parametricNumeric", "coding@1", "coding@2", "coding@3", "smartSim:networkTopology@1", "smartSim:networkTopology@2", "smartSim:physicsFreeFall@1", "smartSim:functionStudy2d@1"];
// children of the kitchen-sink composite: every supported child identity except simulation@1 (an uploaded package is required; manual only)
export const CHILD_FAMILIES = STANDALONE_FAMILIES.filter(f => !f.startsWith("smartSim:")).concat(["smartSim:physicsFreeFall@1"]);

function kitchenSink(id) {
  const parts = [], answers = {}, expect = {};
  CHILD_FAMILIES.forEach((f, i) => {
    const [node, ans, ex] = familyQuestion(f, "x");
    const pid = "p" + String(i + 1).padStart(2, "0");
    parts.push(K.part(pid, String(i + 1), node));
    if (ans) { answers[pid] = ans; expect[pid] = ex; }
  });
  // the standalone-envelope SmartSim child above + three LINKED parts on the three shared SmartSim contexts (the cap)
  const linked = [
    K.linkedSim("lf", "ف", "زمن الوصول", 2, "ctxFall", [{ id: "it", label: "زمن", weight: 1, kind: "physics.impactTime", measurementId: "impactTime", tolerance: 0.05 }]),
    K.linkedSim("ln", "ش", "VLAN 10", 2, "ctxNet", [roas.checks()[0]]),
    K.linkedSim("ld", "د", "المجال", 2, "ctxFn", [{ id: "d", label: "المجال", weight: 1, kind: "domain.exclusions", expected: [-2, 1], tolerance: 0.01 }])
  ];
  const fn = [K.part("q1", "ق1", K.numeric("x", "١", 2, 1, 0)), K.part("q2", "ق2", K.numeric("x", "٢", 2, 2, 0)), K.part("q3", "ق3", K.numeric("x", "٣", 2, 3, 0))];
  const groups = [
    K.group("gAll", "كل الأنواع", parts.slice(0, 20)), K.group("gAll2", "تابع", parts.slice(20)), K.group("gLinked", "المحاكاة المشتركة", linked),
    K.group("gFirst", "أجب عن بندين", fn, K.firstN(2, 4))
  ];
  const marks = parts.length * 2 + 6 + 4;
  const node = K.composite(id, "سؤال مركّب شامل", marks, [
    K.sourceContext("ctxText", "نص", [{ id: "t1", version: 1, kind: "text", text: "نص مشترك للقراءة." }]),
    K.sourceContext("ctxTable", "جدول", [{ id: "tb", version: 1, kind: "table", columnHeaders: ["أ", "ب"], rows: [["1", "2"]] }]),
    K.simContext("ctxFall", "سقوط حر", "physicsFreeFall", 1, freeFallClassroomConfig()), K.simContext("ctxNet", "شبكة", "networkTopology", 2, roas.config()), K.simContext("ctxFn", "دالة", "functionStudy2d", 1, rationalCertificationConfig())
  ], groups);
  answers.q1 = A.numeric(1); answers.q2 = A.numeric(2); answers.q3 = A.numeric(3);                     // q3 is the ignored excess answer
  return { node, answer: A.composite(answers, { ctxFall: A.sim("physicsFreeFall", 1, [{ type: "measurement.set", measurementId: "impactTime", value: 2.02 }]), ctxNet: A.sim("networkTopology", 2, [{ type: "switch.command", deviceId: "sw1", command: "enable" }, { type: "switch.command", deviceId: "sw1", command: "configure terminal" }, { type: "switch.command", deviceId: "sw1", command: "vlan 10" }]), ctxFn: A.sim("functionStudy2d", 1, [{ type: "domain.setExclusions", values: [-2, 1] }]) }), marks, partExpect: { ...expect, lf: [2, 0], ln: [2, 0], ld: [2, 0], q1: [2, 0], q2: [2, 0], q3: [0, 0] } };
}

/** The legacy compound@1 with one part of EVERY compound-capable family (frozen semantics; answers under kind "compound"). */
export const COMPOUND_FAMILIES = ["multipleChoice", "trueFalse", "multiTrueFalse", "shortAnswer", "fillBlank", "wordBank", "matching", "ordering", "tableFill", "cliFill", "multipleSelect", "numericResponse", "matrix", "categorization"];
function kitchenCompound(id) {
  const parts = [], answers = {};
  COMPOUND_FAMILIES.forEach((f, i) => {
    const [node, ans] = familyQuestion(f, "x");
    const { examQuestionId: _q, presentationType, teacherNote: _n, ...rest } = node;
    const pid = "c" + String(i + 1).padStart(2, "0");
    parts.push({ id: pid, label: String(i + 1), type: presentationType, ...rest });
    answers[pid] = ans;
  });
  return { node: K.compound(id, "سؤال مركّب تقليدي شامل", parts.length * 2, parts), answer: A.compound(answers), expected: [parts.length * 2, 0] };
}
/** The stress exam: `sections` sections × `perSection` rotating-family questions + one kitchen-sink composite + one kitchen-sink legacy compound per section. */
export function stressExam({ sections = 6, perSection = 30 } = {}) {
  const answers = {}, expected = {}, out = [];
  let n = 0;
  for (let s = 0; s < sections; s++) {
    const qs = [];
    for (let i = 0; i < perSection; i++) {
      const family = STANDALONE_FAMILIES[(n++) % STANDALONE_FAMILIES.length];
      const id = "st" + s + "-" + String(i).padStart(3, "0");
      const [node, ans, ex] = familyQuestion(family, id);
      qs.push(node);
      if (ans) { answers[id] = ans; expected[id] = ex; }
    }
    const ks = kitchenSink("st" + s + "-ks");
    qs.push(ks.node); answers[ks.node.examQuestionId] = ks.answer; expected[ks.node.examQuestionId] = { parts: ks.partExpect };
    const kc = kitchenCompound("st" + s + "-kc");
    qs.push(kc.node); answers[kc.node.examQuestionId] = kc.answer; expected[kc.node.examQuestionId] = kc.expected;
    out.push(K.section("st-s" + s, "قسم الضغط " + (s + 1), qs));
  }
  return { exam: K.exam("CERT20G-STRESS", "شهادة 20G — امتحان الضغط", out), answers, expected };
}
