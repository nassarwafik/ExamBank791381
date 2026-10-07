// Phase 20G — certification exam E: MIXED SHOWCASE (100 marks) — as many production families as is sensible in one exam: choice,
// multipleSelect, trueFalse, multiTrueFalse, inlineCloze, fillBlank, wordBank, matching, ordering, tableFill, matrix, categorization (in a
// capScore section), numericResponse, parametricNumeric, hotspot + labelDiagram (on teacher images — never AI-invented geometry), an image
// question whose asset request had to be RESOLVED before finalization, networkCli, the frozen networkTopology@1 lab, coding@2, a legacy compound,
// and an advanced composite with a shared RICH source, a shared SmartSim context, mixed automatic / manual children, a firstNAnswered group and a
// rubric. A rich stem (RichContent table) appears on a standalone question too.
import { routerTwoSwitchesFourPcsTemplate, twoLanDemoChecks } from "../../../../src/networkTopology/networkTopologyTemplates.ts";
import * as K from "../kit.js";

const { A } = K;
// a teacher-uploaded raster (the smallest valid PNG header the image authority accepts) — public geometry is the TEACHER's, never generated
export const IMG = () => ({ exists: true, visible: true, assets: [{ dataUrl: "data:image/png;base64,iVBORw0KGgo=", origin: "uploaded", contentType: "image/png" }] });
const lunar = () => ({ v: 1, model: { initialHeight: 50, initialVelocity: -5, gravity: 1.62 }, view: { maxTime: 10, showVelocityGraph: true }, tasks: { measurements: [{ id: "impactTime", label: "زمن الوصول إلى سطح القمر", unit: "s" }], points: [] } });
const RICH_TABLE = { schemaVersion: 1, blocks: [{ type: "heading", level: 3, runs: [{ text: "جدول البروتوكولات" }] }, { type: "table", caption: "المنافذ المعروفة", columnHeaders: ["البروتوكول", "المنفذ"], rowHeaders: true, responsive: "scroll", rows: [["HTTP", "80"], ["HTTPS", "443"], ["DNS", "53"]] }, { type: "paragraph", runs: [{ text: "استخدم الجدول للإجابة." }] }] };

export function examE({ resolved = true } = {}) {
  const assetQ = K.mcq("e5-3", "أي جهاز يظهر في الصورة؟", 4, ["راوتر", "سويتش", "نقطة وصول"], 0, resolved ? { image: IMG() } : { assetRequest: { v: 1, description: "صورة لجهاز راوتر من الأمام تُظهر المنافذ." } });
  return K.exam("CERT20G-E-SHOW", "شهادة 20G — امتحان العرض الشامل", [
    K.section("e-s1", "القسم الأول: الاختيار", [
      K.mcq("e1-1", "أي بروتوكول يعمل على المنفذ 443؟", 3, ["HTTP", "HTTPS", "DNS"], 1, { richContent: RICH_TABLE }),
      K.multipleSelect("e1-2", "اختر بروتوكولات طبقة النقل:", 4, [["t1", "TCP"], ["t2", "UDP"], ["t3", "IP"], ["t4", "HTTP"]], ["t1", "t2"], "allOrNothing"),
      K.trueFalse("e1-3", "بروتوكول UDP موجّه بالاتصال.", 2, false),
      K.multiTrueFalse("e1-4", "صح أم خطأ:", 3, [["r1", "DNS يحوّل الأسماء إلى عناوين.", true], ["r2", "ARP يعمل في الطبقة السابعة.", false], ["r3", "ICMP يستخدمه ping.", true]])
    ]),
    K.section("e-s2", "القسم الثاني: الإكمال", [
      K.inlineCloze("e2-1", "أكمل الفقرة", 6, [{ type: "text", text: "يستخدم الأمر " }, { type: "blank", id: "b1", control: "text" }, { type: "text", text: " لاختبار الاتصال، ويعمل بروتوكول " },
        { type: "blank", id: "b2", control: "dropdown", options: [{ id: "o1", label: "ICMP" }, { id: "o2", label: "SMTP" }] }, { type: "text", text: " في طبقة " }, { type: "blank", id: "b3", control: "text" }],
        { b1: { accepted: ["ping"], caseSensitive: false }, b2: { correctOptionId: "o1" }, b3: { accepted: ["الشبكة", "network"], caseSensitive: false } }),
      K.fillBlank("e2-2", "أكمل: عدد طبقات نموذج OSI ____ وعدد طبقات TCP/IP ____ .", 4, [["f1", "OSI", "7"], ["f2", "TCP/IP", "4"]]),
      K.wordBank("e2-3", "اختر من البنك: البروتوكول الموثوق ____ والأسرع ____ .", 4, ["TCP", "UDP", "IP"], [["w1", "الموثوق", "TCP"], ["w2", "الأسرع", "UDP"]])
    ]),
    K.section("e-s3", "القسم الثالث: الأسئلة المنظّمة (تُحتسب حتى 15 علامة)", [
      K.matching("e3-1", "صِل البروتوكول بمنفذه:", 4, [["m1", "HTTP", "80"], ["m2", "DNS", "53"]], ["80", "53", "25"]),
      K.ordering("e3-2", "رتّب طبقات TCP/IP من الأعلى إلى الأسفل:", 4, ["التطبيقات", "النقل", "الإنترنت", "الوصول للشبكة"]),
      K.tableFill("e3-3", "أكمل الجدول:", 4, ["البروتوكول", "الطبقة"], [["TCP", ""], ["IP", ""]], [["l1", 0, 1, "النقل"], ["l2", 1, 1, "الإنترنت"]]),
      K.matrix("e3-4", "حدّد نوع كل بروتوكول:", 4, [["x1", "TCP"], ["x2", "UDP"]], [["co", "موجّه بالاتصال"], ["cl", "غير موجّه بالاتصال"]], { x1: "co", x2: "cl" }),
      K.categorization("e3-5", "صنّف الأجهزة:", 4, [["l2", "طبقة 2"], ["l3", "طبقة 3"]], [["d1", "سويتش"], ["d2", "راوتر"]], { d1: "l2", d2: "l3" })
    ], { gradingPolicy: "capScore", maxMarks: 15 }),
    K.section("e-s4", "القسم الرابع: العددي", [
      K.numeric("e4-1", "كم عنوانًا في شبكة /30 قابلًا للاستخدام؟", 4, 2, 0),
      K.parametric("e4-2", "إذا كان معدل النقل {{r}} Mbps، فكم ميغابت تُنقل في {{t}} ثانية؟", 6, { v: 2, generatorVersion: 2, variables: [{ id: "r", kind: "integer", min: 10, max: 100, step: 10 }, { id: "t", kind: "integer", min: 2, max: 9, step: 1 }], derivedVariables: [], constraints: [], response: { unit: "label", label: "Mb" } }, { expression: "r*t", mode: "tolerance", tolerance: 0 })
    ]),
    K.section("e-s5", "القسم الخامس: الصور", [
      { examQuestionId: "e5-1", presentationType: "hotspot", questionTypeVersion: 1, text: "حدّد الراوتر والسويتش على المخطط.", marks: 4, image: IMG(),
        hotspot: { v: 1, mode: "multiple", selections: 2, alt: "مخطط شبكة فيه راوتر وسويتش" }, answer: { scoring: "proportional", regions: [{ id: "rgn-router", shape: { kind: "rect", x: 0.137, y: 0.113, width: 0.181, height: 0.173 } }, { id: "rgn-switch", shape: { kind: "circle", cx: 0.617, cy: 0.311, r: 0.093 } }] } },
      { examQuestionId: "e5-2", presentationType: "labelDiagram", questionTypeVersion: 1, text: "سمِّ طبقات النموذج على الرسم.", marks: 4, image: IMG(),
        labelDiagram: { v: 1, alt: "مخطط طبقات", allowReuse: false, zones: [{ id: "z1", shape: { kind: "rect", x: 0.1, y: 0.1, width: 0.2, height: 0.1 } }, { id: "z2", shape: { kind: "rect", x: 0.1, y: 0.3, width: 0.2, height: 0.1 } }], labels: [{ id: "l-app", text: "Application" }, { id: "l-net", text: "Network" }, { id: "l-phy", text: "Physical" }] },
        answer: { scoring: "proportional", correctLabelByZone: { z1: "l-app", z2: "l-net" } } },
      assetQ
    ]),
    K.section("e-s6", "القسم السادس: التفاعلي والبرمجة", [
      K.networkCli("e6-1", "اضبط المبدّل: الاسم EDGE-1 و VLAN 30 باسم LAB.", 5, { hostname: "EDGE-1", vlans: { "30": { name: "LAB" } } }),
      K.smartSim("e6-2", "اضبط عناوين الشبكتين وفعّل واجهات الراوتر (المختبر الأصلي — الإصدار الأول).", 6, "networkTopology", 1, routerTwoSwitchesFourPcsTemplate(), twoLanDemoChecks()),
      K.coding("e6-3", "اكتب برنامج Python يطبع عدد الأحرف في السطر المُدخل.", 6, 2, { allowedLanguages: ["python"], defaultLanguage: "python", starterCode: {}, taskMode: "program", inputMode: "stdin", outputMode: "stdout", limits: { sourceBytes: 65536, outputBytes: 65536, timeMs: 2000, memoryMb: 128 }, publicTests: [] },
        { gradingMode: "hiddenTests", comparator: "trimTrailingWhitespace", compileErrorPolicy: "manualReview", hiddenTests: [{ id: "len-1", input: "abcde\n", expectedOutput: "5\n", weight: 1 }], referenceSolutions: {} })
    ]),
    K.section("e-s7", "القسم السابع: الأسئلة المركّبة", [
      K.compound("e7-1", "أجب عن البندين:", 5, [
        { id: "p1", label: "أ", type: "multipleChoice", text: "أي طبقة تضيف عناوين IP؟", marks: 2, options: [{ text: "الشبكة" }, { text: "النقل" }], answer: { correctOptionIndex: 0 } },
        { id: "p2", label: "ب", type: "shortAnswer", text: "ما اختصار بروتوكول التحكم بالنقل؟", marks: 3, answer: { text: "TCP" } }]),
      K.composite("e7-2", "استخدم المصدرين المشتركين للإجابة.", 15,
        [K.sourceContext("ctxRich", "ملخص", [{ id: "rich1", version: 1, kind: "rich", title: "جدول المنافذ", richContent: RICH_TABLE }]),
          K.simContext("ctxMoon", "محاكاة السقوط على القمر", "physicsFreeFall", 1, lunar())],
        [K.group("gA", "مرتبط بالمصادر", [
          K.part("a1", "أ", K.mcq("x", "ما منفذ DNS بحسب الجدول؟", 3, ["53", "80", "443"], 0), { contextId: "ctxRich" }),
          K.linkedSim("a2", "ب", "سجّل زمن الوصول إلى سطح القمر.", 4, "ctxMoon", [{ id: "impact-time", label: "زمن الوصول", weight: 1, kind: "physics.impactTime", measurementId: "impactTime", tolerance: 0.05 }])
        ]), K.group("gB", "أجب عن بندين فقط", [
          K.part("b1", "ج", K.numeric("x", "كم بتًا في البايت؟", 2, 8, 0)),
          K.part("b2", "د", K.trueFalse("x", "HTTPS يشفّر الاتصال.", 2, true)),
          K.part("b3", "هـ", K.shortAnswer("x", "ما البروتوكول الذي يعطي العناوين تلقائيًا؟", 2, "DHCP"))
        ], K.firstN(2, 4)), K.group("gC", "التعليل", [
          K.part("c1", "و", K.openResponse("x", "لماذا يُفضَّل HTTPS على HTTP؟", 4, "E72", [["security", "الأمان", 4, [["full", 4], ["half", 2], ["none", 0]]]]), { contextId: "ctxRich" })
        ])])
    ])
  ], { coverPage: K.cover("اختبار شامل — تكنولوجيا المعلومات", "يتضمن هذا الامتحان أنواع أسئلة متعددة."), presentation: { schemaVersion: 1, preset: "cards" } });
}

// ── answers ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const v1 = actions => A.sim("networkTopology", 1, actions);
const pcs = (id, address, gw) => [{ type: "pc.setAddress", deviceId: id, value: address }, { type: "pc.setMask", deviceId: id, value: "255.255.255.0" }, { type: "pc.setGateway", deviceId: id, value: gw }];
const cmd = (type, deviceId, ...c) => c.map(command => ({ type, deviceId, command }));
export const TWO_LAN = [...pcs("pc1", "192.168.10.10", "192.168.10.254"), ...pcs("pc2", "192.168.10.20", "192.168.10.254"), ...pcs("pc3", "192.168.20.10", "192.168.20.254"), ...pcs("pc4", "192.168.20.20", "192.168.20.254"),
  ...cmd("switch.command", "sw1", "enable", "configure terminal", "hostname BR1-SW1", "end"), ...cmd("switch.command", "sw2", "enable", "configure terminal", "hostname BR1-SW2", "end"),
  ...cmd("router.command", "r1", "enable", "configure terminal", "interface g0/0", "ip address 192.168.10.254 255.255.255.0", "no shutdown", "interface g0/1", "ip address 192.168.20.254 255.255.255.0", "no shutdown", "end")];
const val = (d, id) => Number(d.sections.flatMap(s => s.questions).find(q => q.examQuestionId === "e4-2").parametric.values[id]);
export const LEN_OK = "print(len(input()))\n";
const perfect = d => ({
  "e1-1": A.choice(1), "e1-2": A.multi(["t1", "t2"]), "e1-3": A.choice(1), "e1-4": A.fields({ r1: true, r2: false, r3: true }),
  "e2-1": A.fields({ b1: "PING", b2: "o1", b3: "الشبكة" }), "e2-2": A.fields({ f1: "7", f2: "4" }), "e2-3": A.fields({ w1: "TCP", w2: "UDP" }),
  "e3-1": A.fields({ m1: "80", m2: "53" }), "e3-2": A.seq(["التطبيقات", "النقل", "الإنترنت", "الوصول للشبكة"]), "e3-3": A.fields({ l1: "النقل", l2: "الإنترنت" }), "e3-4": A.fields({ x1: "co", x2: "cl" }), "e3-5": A.fields({ d1: "l2", d2: "l3" }),
  "e4-1": A.numeric(2), "e4-2": A.numeric(val(d, "r") * val(d, "t")),
  "e5-1": { kind: "hotspot", points: [{ x: 0.2, y: 0.2 }, { x: 0.62, y: 0.31 }] }, "e5-2": A.fields({ z1: "l-app", z2: "l-net" }), "e5-3": A.choice(0),
  "e6-1": A.cli(["enable", "configure terminal", "hostname EDGE-1", "vlan 30", "name LAB", "end"]), "e6-2": v1(TWO_LAN), "e6-3": A.code(LEN_OK),
  "e7-1": A.compound({ p1: A.choice(0), p2: A.text("TCP") }),
  "e7-2": A.composite({ a1: A.choice(0), b1: A.numeric(8), b2: A.choice(0), c1: A.text("لأنه يشفّر البيانات ويتحقق من هوية الخادم.") }, { ctxMoon: A.sim("physicsFreeFall", 1, [{ type: "measurement.set", measurementId: "impactTime", value: 5.35 }]) })
});
// capScore: the five structured questions sum to 20 raw marks; the section counts at most 15.
const PERFECT_AUTO = { "e1-1": [3, 0], "e1-2": [4, 0], "e1-3": [2, 0], "e1-4": [3, 0], "e2-1": [6, 0], "e2-2": [4, 0], "e2-3": [4, 0], "e3-1": [4, 0], "e3-2": [4, 0], "e3-3": [4, 0], "e3-4": [4, 0], "e3-5": [4, 0],
  "e4-1": [4, 0], "e4-2": [6, 0], "e5-1": [4, 0], "e5-2": [4, 0], "e5-3": [4, 0], "e6-1": [5, 0], "e6-2": [6, 0], "e6-3": [0, 6], "e7-1": [5, 0], "e7-2": [11, 4] };
export const PERSONAS = {
  PERFECT: {
    answers: perfect, auto: PERFECT_AUTO,
    parts: { "e7-2": { a1: [3, 0], a2: [4, 0], b1: [2, 0], b2: [2, 0], b3: [0, 0], c1: [0, 4] } },
    callbacks: { "e6-3": ["5\n"] },
    review: { "e7-2::part::c1": { rubricAwards: { security: { levelId: "full" } } } },
    // automatic after the coding callback: Σ auto (with the capped section counted 15, coding 6) = 100 − 4 (rubric) ⇒ final 100
    final: 100
  },
  MIXED: {
    // wrong choices, partial blanks, a structured section still above its cap, half the hotspot, the excess composite answer (b3 answered
    // after b1 and b2 ⇒ ignored), an off-by-one parametric, the v1 lab without router interfaces, a coding program that fails its case.
    answers: d => ({ ...perfect(d), "e1-2": A.multi(["t1"]), "e1-4": A.fields({ r1: true, r2: true, r3: true }), "e2-1": A.fields({ b1: "ping", b2: "o2", b3: "النقل" }),
      "e3-1": A.fields({ m1: "80", m2: "25" }), "e4-2": A.numeric(val(d, "r") * val(d, "t") + 1), "e5-1": { kind: "hotspot", points: [{ x: 0.2, y: 0.2 }, { x: 0.95, y: 0.95 }] },
      "e6-2": v1(TWO_LAN.filter(a => a.deviceId !== "r1")), "e6-3": A.code("print(input())\n"),
      "e7-1": A.compound({ p1: A.choice(1), p2: A.text("TCP") }),
      "e7-2": A.composite({ a1: A.choice(1), b1: A.numeric(8), b2: A.choice(0), b3: A.text("DHCP"), c1: A.text("أسرع.") }, { ctxMoon: A.sim("physicsFreeFall", 1, [{ type: "measurement.set", measurementId: "impactTime", value: 4.1 }]) }) }),
    // e1-2 allOrNothing ⇒ 0 · e1-4 2 of 3 ⇒ 2 · e2-1 1 of 3 ⇒ 2 · e3: raw 18 (matching 1 of 2 ⇒ 2) capped at 15 ⇒ section 15 · e4-2 0 ·
    // e5-1 1 of 2 ⇒ 2 · e6-2 without the router: PC addresses / masks / gateways (pc1 ip+mask+gw 3, pc2–4 ip+gw 6) + hostnames 2 = 11 of 23
    // ⇒ 6·11/23 = 2.87 · e6-3 case fails ⇒ 0 · e7-1 p1 wrong ⇒ 3 · e7-2: a1 0, a2 0, b1 2, b2 2, b3 ignored, c1 pending 4.
    auto: { ...PERFECT_AUTO, "e1-2": [0, 0], "e1-4": [2, 0], "e2-1": [2, 0], "e3-1": [2, 0], "e4-2": [0, 0], "e5-1": [2, 0], "e6-2": [2.87, 0], "e7-1": [3, 0], "e7-2": [4, 4] },
    parts: { "e7-2": { a1: [0, 0], a2: [0, 0], b1: [2, 0], b2: [2, 0], b3: [0, 0], c1: [0, 4] } },
    callbacks: { "e6-3": ["abcde\n"] },
    review: { "e7-2::part::c1": { rubricAwards: { security: { levelId: "half" } } } },
    // sections: 7 + 10 + 15 (capped) + 4 + 10 + (5 + 2.87 + 0) + (3 + 4 + rubric 2) ⇒ final 62.87
    final: 62.87
  }
};
