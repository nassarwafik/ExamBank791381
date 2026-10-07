// Phase 20G — certification exam A: NETWORKING (100 marks). Only CURRENT capabilities: IPv4, VLANs, trunks, native VLAN, Router-on-a-Stick,
// DHCP, VTP, Port Security, passwords, WPA2 wireless, DNS / HTTP, reachability and show commands — networkCli@1 (switch CLI) and
// networkTopology@2 labs. No OSPF / RIP / EIGRP / ACL / NAT (unsupported by the simulators — never fabricated). Topologies are immutable for
// the student (no structural action exists in the plugin contract; a smuggled one is refused at ingest — pinned by the failure matrix).
import { net2TemplateById } from "../../../../src/networkTopology2/net2Templates.ts";
import * as K from "../kit.js";

const { A } = K;
const roas = net2TemplateById("roas"), dhcp = net2TemplateById("dhcp"), portsec = net2TemplateById("portsec"), wireless = net2TemplateById("wireless"), capstone = net2TemplateById("capstone");
const pick = (checks, kind, i = 0) => ({ ...checks.filter(c => c.kind === kind)[i] });
const weight = checks => checks.reduce((n, c) => n + c.weight, 0);

export function examA() {
  const rc = roas.checks();
  return K.exam("CERT20G-A-NET", "شهادة 20G — امتحان الشبكات المتكامل", [
    K.section("a-s1", "القسم الأول: العنونة و IPv4", [
      K.mcq("a1-1", "كم عدد بتات عنوان IPv4؟", 2, ["32", "64", "128"], 0),
      K.multipleSelect("a1-2", "اختر العناوين الخاصة (RFC 1918):", 4, [["p1", "10.0.0.5"], ["p2", "172.16.4.1"], ["p3", "192.168.1.20"], ["p4", "8.8.8.8"]], ["p1", "p2", "p3"], "partialNoPenalty"),
      K.numeric("a1-3", "كم عدد العناوين القابلة للاستخدام في شبكة /26؟", 3, 62, 0),
      K.inlineCloze("a1-4", "أكمل الفقرة", 4, [{ type: "text", text: "قناع الشبكة /24 هو " }, { type: "blank", id: "b1", control: "text" }, { type: "text", text: " وعنوان البث للشبكة 192.168.1.0/24 هو " },
        { type: "blank", id: "b2", control: "dropdown", options: [{ id: "o1", label: "192.168.1.0" }, { id: "o2", label: "192.168.1.255" }] }], { b1: { accepted: ["255.255.255.0"], caseSensitive: false }, b2: { correctOptionId: "o2" } }),
      K.trueFalse("a1-5", "العنوان 10.0.0.1 عنوان خاص.", 2, true),
      K.tableFill("a1-6", "أكمل جدول العنونة:", 6, ["الجهاز", "عنوان IP", "القناع", "البوابة"], [["PC1", "192.168.10.11", "", "192.168.10.1"], ["PC3", "192.168.20.11", "255.255.255.0", ""], ["R1 G0/0.20", "", "255.255.255.0", "—"]],
        [["c1", 0, 2, "255.255.255.0"], ["c2", 1, 3, "192.168.20.1"], ["c3", 2, 1, "192.168.20.1"]])
    ]),
    K.section("a-s2", "القسم الثاني: VLAN والتبديل (أجب عن سؤالين فقط)", [
      K.openResponse("a2-1", "اشرح الفرق بين منفذ Access ومنفذ Trunk.", 6, "A21", [["concept", "المفهوم", 4, [["full", 4], ["half", 2], ["none", 0]]], ["example", "المثال", 2, [["full", 2], ["none", 0]]]]),
      K.mcq("a2-2", "ماذا يفعل وضع المخالفة shutdown في Port Security؟", 6, ["يعطّل المنفذ (err-disabled)", "يسقط الإطارات فقط", "يرسل تنبيهًا فقط"], 0),
      K.openResponse("a2-3", "ما دور Native VLAN على منفذ Trunk؟ ولماذا يجب أن تتطابق على الطرفين؟", 6, "A23", [["role", "الدور", 4, [["full", 4], ["half", 2], ["none", 0]]], ["match", "التطابق", 2, [["full", 2], ["none", 0]]]])
    ], { gradingPolicy: "firstNAnswered", answerUnit: "question", requiredAnswers: 2, maxMarks: 12 }),
    K.section("a-s3", "القسم الثالث: سطر الأوامر والمختبرات القصيرة", [
      K.cliFill("a3-1", "أكمل أوامر الواجهة الفرعية:", 4, "R1(config)# interface g0/0.20\nR1(config-subif)# encapsulation dot1Q [[vlan]]\nR1(config-subif)# ip address [[ip]] 255.255.255.0", [["vlan", "رقم VLAN", "20"], ["ip", "عنوان الواجهة", "192.168.20.1"]]),
      K.networkCli("a3-2", "اضبط المبدّل: الاسم SW-LAB، VLAN 10 باسم STAFF، المنفذ Fa0/1 access في VLAN 10، والمنفذ Gi0/1 trunk بـ Native VLAN 99.", 7,
        { hostname: "SW-LAB", vlans: { "10": { name: "STAFF" } }, interfaces: { "f0/1": { mode: "access", accessVlan: 10 }, "g0/1": { mode: "trunk", nativeVlan: 99 } } }),
      K.smartSim("a3-3", "فعّل Port Security على المنفذ Fa0/1 (عنوان واحد، Sticky، وضع shutdown).", 5, "networkTopology", 2, portsec.config(), portsec.checks()),
      K.smartSim("a3-4", "اضبط نقطة الوصول على WPA2 بعبارة المرور Exam2026! ووصّل LAP1 لاسلكيًا.", 6, "networkTopology", 2, wireless.config(), wireless.checks())
    ]),
    K.section("a-s4", "القسم الرابع: المختبر المتكامل", [
      K.composite("a4-1", "استخدم المحاكي المشترك وسيناريو المدرسة للإجابة عن البنود.", 20,
        [K.simContext("ctxNet", "شبكة المدرسة — Router-on-a-Stick", "networkTopology", 2, roas.config()),
          K.sourceContext("ctxBrief", "سيناريو المدرسة", [{ id: "brief", version: 1, kind: "text", title: "المطلوب", text: "تريد المدرسة فصل أجهزة المعلمين (VLAN 10) عن أجهزة الطلاب (VLAN 20) مع السماح بالتواصل بينهما عبر الراوتر R1." }])],
        [K.group("gCfg", "الإعداد", [
          K.linkedSim("k1", "أ", "أنشئ VLAN 10 و VLAN 20 على SW1.", 3, "ctxNet", [pick(rc, "switch.vlanExists", 0), pick(rc, "switch.vlanExists", 1)]),
          K.linkedSim("k2", "ب", "اجعل Gi0/1 منفذ Trunk.", 2, "ctxNet", [pick(rc, "switch.portMode", 1)]),
          K.linkedSim("k3", "ج", "أنشئ الواجهات الفرعية dot1Q على R1.", 3, "ctxNet", [pick(rc, "router.subinterfaceVlan", 0), pick(rc, "router.subinterfaceVlan", 1)]),
          K.linkedSim("k4", "د", "تحقّق من الاتصال بين PC1 و PC3.", 2, "ctxNet", [pick(rc, "reachability", 0)])
        ]), K.group("gWhy", "الفهم", [
          K.part("m1", "هـ", K.mcq("x", "لماذا نحتاج منفذ Trunk بين SW1 و R1؟", 4, ["لنقل أكثر من VLAN عبر وصلة واحدة", "لزيادة السرعة فقط"], 0), { contextId: "ctxBrief" }),
          K.part("o1", "و", K.openResponse("x", "اشرح كيف يوجّه R1 الحزم بين VLAN 10 و VLAN 20.", 6, "A41", [["routing", "التوجيه بين الشبكات", 6, [["full", 6], ["half", 3], ["none", 0]]]]), { contextId: "ctxBrief" })
        ])]),
      K.smartSim("a4-2", "اضبط خدمة DHCP على الراوتر حتى يحصل PC1 و PC2 على عناوين.", 10, "networkTopology", 2, dhcp.config(), dhcp.checks()),
      K.smartSim("a4-3", "مشروع التخرج: شبكة المدرسة الكاملة (VLAN، Trunk، RoaS، DHCP، VTP، Port Security، كلمات المرور، WPA2، DNS، HTTP).", 15, "networkTopology", 2, capstone.config(), capstone.checks())
    ])
  ], {
    coverPage: K.cover("الصف الحادي عشر — تكنولوجيا الشبكات", "اقرأ التعليمات بعناية. القسم الثاني: أجب عن سؤالين فقط."),
    presentation: { schemaVersion: 1, preset: "networkLab", components: { table: { variant: "striped" } } }
  });
}

// ── solutions (what a student actually types / clicks) ─────────────────────────────────────────────────────────────────────────────────
const CONF = ["enable", "configure terminal"];
const sw = (id, ...c) => c.map(command => ({ type: "switch.command", deviceId: id, command }));
const rt = (id, ...c) => c.map(command => ({ type: "router.command", deviceId: id, command }));
const net = actions => A.sim("networkTopology", 2, actions);
export const SOL = {
  roas: [...sw("sw1", ...CONF, "vlan 10", "vlan 20", "interface f0/1", "switchport mode access", "switchport access vlan 10", "interface f0/2", "switchport mode access", "switchport access vlan 10",
    "interface f0/11", "switchport mode access", "switchport access vlan 20", "interface f0/12", "switchport mode access", "switchport access vlan 20", "interface g0/1", "switchport mode trunk", "end", "show vlan brief", "show interfaces trunk"),
  ...rt("r1", ...CONF, "interface g0/0", "no shutdown", "interface g0/0.10", "encapsulation dot1Q 10", "ip address 192.168.10.1 255.255.255.0", "interface g0/0.20", "encapsulation dot1Q 20", "ip address 192.168.20.1 255.255.255.0", "end", "show ip interface brief")],
  dhcp: rt("r1", ...CONF, "ip dhcp excluded-address 192.168.1.1 192.168.1.10", "ip dhcp pool LAN", "network 192.168.1.0 255.255.255.0", "default-router 192.168.1.1", "dns-server 192.168.1.1", "end", "show ip dhcp binding"),
  portsec: sw("sw1", ...CONF, "interface f0/1", "switchport mode access", "switchport port-security", "switchport port-security maximum 1", "switchport port-security mac-address sticky", "switchport port-security violation shutdown", "end", "show port-security"),
  wireless: [{ type: "ap.set", deviceId: "ap1", field: "security", value: "wpa2" }, { type: "ap.set", deviceId: "ap1", field: "passphrase", value: "Exam2026!" }, { type: "host.wifiConnect", deviceId: "lap1", ssid: "SCHOOL-WIFI", passphrase: "Exam2026!" }],
  capstone: [
    ...sw("sw1", ...CONF, "hostname SW1", "vtp domain SCHOOL", "vtp mode server", "vlan 10", "name STAFF", "vlan 20", "name STUDENTS", "vlan 50", "name SERVERS", "vlan 99", "name NATIVE",
      "interface f0/1", "switchport mode access", "switchport access vlan 10", "switchport port-security", "interface f0/2", "switchport mode access", "switchport access vlan 20",
      "interface g0/1", "switchport mode trunk", "switchport trunk native vlan 99", "switchport trunk allowed vlan 10,20,50,99", "interface g0/2", "switchport mode trunk", "switchport trunk native vlan 99",
      "exit", "enable secret Class2026", "end"),
    ...sw("sw2", ...CONF, "vtp domain SCHOOL", "vtp mode client", "interface g0/1", "switchport mode trunk", "switchport trunk native vlan 99", "interface f0/1", "switchport mode access", "switchport access vlan 20",
      "interface f0/5", "switchport mode access", "switchport access vlan 50", "end"),
    ...rt("r1", ...CONF, "interface g0/0", "no shutdown", "interface g0/0.10", "encapsulation dot1Q 10", "ip address 192.168.10.1 255.255.255.0", "interface g0/0.20", "encapsulation dot1Q 20", "ip address 192.168.20.1 255.255.255.0",
      "interface g0/0.50", "encapsulation dot1Q 50", "ip address 192.168.50.1 255.255.255.0", "interface g0/0.99", "encapsulation dot1Q 99 native", "exit",
      "ip dhcp excluded-address 192.168.10.1 192.168.10.10", "ip dhcp excluded-address 192.168.20.1 192.168.20.10",
      "ip dhcp pool STAFF", "network 192.168.10.0 255.255.255.0", "default-router 192.168.10.1", "dns-server 192.168.50.10", "exit",
      "ip dhcp pool STUDENTS", "network 192.168.20.0 255.255.255.0", "default-router 192.168.20.1", "dns-server 192.168.50.10", "end"),
    { type: "ap.set", deviceId: "ap1", field: "security", value: "wpa2" }, { type: "ap.set", deviceId: "ap1", field: "passphrase", value: "School2026!" },
    { type: "host.wifiConnect", deviceId: "lap1", ssid: "SCHOOL-WIFI", passphrase: "School2026!" },
    { type: "host.browse", deviceId: "lap1", url: "http://server.school.local" }
  ]
};
const CLI_FULL = ["enable", "configure terminal", "hostname SW-LAB", "vlan 10", "name STAFF", "exit", "interface f0/1", "switchport mode access", "switchport access vlan 10", "interface g0/1", "switchport mode trunk", "switchport trunk native vlan 99", "end", "show vlan brief"];
const RUB = (awards) => ({ rubricAwards: awards });

/** Personas: answers + the INDEPENDENTLY derived expected ledger (per question: [automatic score, marks pending manual review]) and the
 *  teacher review (overrides) with the expected FINAL ledger. Values derived by hand from the key, the weights and the marks — never by
 *  calling the grader. Composite ledgers list per-part [score, pending]. */
export const PERSONAS = {
  FULL: {
    answers: {
      "a1-1": A.choice(0), "a1-2": A.multi(["p1", "p2", "p3"]), "a1-3": A.numeric(62), "a1-4": A.fields({ b1: "255.255.255.0", b2: "o2" }), "a1-5": A.choice(0), "a1-6": A.fields({ c1: "255.255.255.0", c2: "192.168.20.1", c3: "192.168.20.1" }),
      "a2-1": A.text("منفذ Access ينقل VLAN واحدة لجهاز طرفي، أما Trunk فينقل عدة VLAN بين المبدّلات مع وسم 802.1Q."), "a2-2": A.choice(0),
      "a3-1": A.fields({ vlan: "20", ip: "192.168.20.1" }), "a3-2": A.cli(CLI_FULL), "a3-3": net(SOL.portsec), "a3-4": net(SOL.wireless),
      "a4-1": A.composite({ m1: A.choice(0), o1: A.text("ينشئ R1 واجهة فرعية لكل VLAN بعنوان بوابة، ويوجّه بينها لأنها شبكات متصلة مباشرة.") }, { ctxNet: net(SOL.roas) }),
      "a4-2": net(SOL.dhcp), "a4-3": net(SOL.capstone)
    },
    auto: { "a1-1": [2, 0], "a1-2": [4, 0], "a1-3": [3, 0], "a1-4": [4, 0], "a1-5": [2, 0], "a1-6": [6, 0], "a2-1": [0, 6], "a2-2": [6, 0], "a2-3": [0, 0], "a3-1": [4, 0], "a3-2": [7, 0], "a3-3": [5, 0], "a3-4": [6, 0], "a4-1": [14, 6], "a4-2": [10, 0], "a4-3": [15, 0] },
    parts: { "a4-1": { k1: [3, 0], k2: [2, 0], k3: [3, 0], k4: [2, 0], m1: [4, 0], o1: [0, 6] } },
    review: { "a2-1": RUB({ concept: { levelId: "full" }, example: { levelId: "full" } }), "a4-1::part::o1": RUB({ routing: { levelId: "full" } }) },
    final: 100
  },
  PARTIAL: {
    answers: {
      "a1-1": A.choice(1), "a1-2": A.multi(["p1", "p3"]), "a1-3": A.numeric(64), "a1-4": A.fields({ b1: "255.255.255.0", b2: "o1" }), "a1-5": A.choice(0), "a1-6": A.fields({ c1: "255.255.255.0", c2: "192.168.20.254", c3: "192.168.20.1" }),
      "a2-2": A.choice(1), "a2-3": A.text("Native VLAN تنقل الإطارات غير الموسومة."),
      "a3-1": A.fields({ vlan: "20", ip: "192.168.10.1" }), "a3-2": A.cli(["enable", "configure terminal", "hostname SW-LAB", "vlan 10", "name STAFF", "end"]), "a3-3": net(SOL.portsec.slice(0, 5)), "a3-4": net(SOL.wireless.slice(0, 2)),
      "a4-1": A.composite({ m1: A.choice(1), o1: A.text("عبر الراوتر.") }, { ctxNet: net(SOL.roas.filter(a => a.deviceId === "sw1")) }),
      "a4-2": net(SOL.dhcp.slice(0, 5))
    },
    // a1-2: 2 of 3 correct ids, no penalty ⇒ 4·2/3 = 2.67 · a1-4: 1 of 2 blanks ⇒ 2 · a1-6: 2 of 3 cells ⇒ 4 · firstN: a2-2 (wrong, 0) and a2-3 (pending 6) are the
    // first two answered · a3-1: 1 of 2 ⇒ 2 · a3-2: hostname + vlan10 exists + vlan10 name = 3 of 7 ⇒ 3 · a3-3: f0/1 access + port-security on = 2 of 5 checks
    // ⇒ … plus the IOS DEFAULTS once port-security is on (maximum 1, violation shutdown) ⇒ 4 of 5; only sticky is missing ⇒ 4 · a3-4: wpa2 + passphrase
    // = 2 of 6 weight ⇒ 2 · a4-1: switch only ⇒ k1 3, k2 2, k3 0, k4 0 (no router) · a4-2: excluded + pool + network ⇒ the pool hands out leases even
    // without default-router / dns-server: pool, network, excluded, PC1 lease, PC1 = .11, PC2 lease, PC1 ⇄ R1 (2) = 8 of 10 weight ⇒ 8.
    auto: { "a1-1": [0, 0], "a1-2": [2.67, 0], "a1-3": [0, 0], "a1-4": [2, 0], "a1-5": [2, 0], "a1-6": [4, 0], "a2-1": [0, 0], "a2-2": [0, 0], "a2-3": [0, 6], "a3-1": [2, 0], "a3-2": [3, 0], "a3-3": [4, 0], "a3-4": [2, 0], "a4-1": [5, 6], "a4-2": [8, 0], "a4-3": [0, 0] },
    parts: { "a4-1": { k1: [3, 0], k2: [2, 0], k3: [0, 0], k4: [0, 0], m1: [0, 0], o1: [0, 6] } },
    review: { "a2-3": RUB({ role: { levelId: "half" }, match: { levelId: "none" } }), "a4-1::part::o1": RUB({ routing: { levelId: "half" } }) },
    final: 39.67   // automatic 34.67 + a2-3 rubric 2/6 → 2 + o1 rubric 3/6 → 3
  },
  MISCONFIG: {
    // FULL except the trunk: Gi0/1 left as access ⇒ k2 (trunk) and k4 (PC1 ⇄ PC3) fail; nothing else changes.
    answers: null,
    auto: null,
    parts: { "a4-1": { k1: [3, 0], k2: [0, 0], k3: [3, 0], k4: [0, 0], m1: [4, 0], o1: [0, 6] } },
    review: null,
    final: 96
  },
  INCOMPLETE: {
    answers: { "a1-1": A.choice(0), "a1-5": A.choice(0), "a3-1": A.fields({ vlan: "20" }) },
    // An UNANSWERED legacy tableFill (no `fields` response) keeps its historical route to teacher review (pending 6, never a manufactured 0), and
    // the composite's unanswered open-response part is pending too (a rubric part is never auto-scored, answered or not).
    auto: { "a1-1": [2, 0], "a1-2": [0, 0], "a1-3": [0, 0], "a1-4": [0, 0], "a1-5": [2, 0], "a1-6": [0, 6], "a2-1": [0, 0], "a2-2": [0, 0], "a2-3": [0, 0], "a3-1": [2, 0], "a3-2": [0, 0], "a3-3": [0, 0], "a3-4": [0, 0], "a4-1": [0, 6], "a4-2": [0, 0], "a4-3": [0, 0] },
    parts: { "a4-1": { k1: [0, 0], k2: [0, 0], k3: [0, 0], k4: [0, 0], m1: [0, 0], o1: [0, 6] } },
    review: { "a1-6": { score: 0, comment: "لم يُجب." }, "a4-1::part::o1": RUB({ routing: { levelId: "none" } }) },
    final: 6
  }
};
// MISCONFIG = FULL with the trunk command removed (the switch keeps g0/1 in its default mode).
PERSONAS.MISCONFIG.answers = { ...PERSONAS.FULL.answers, "a4-1": A.composite(PERSONAS.FULL.answers["a4-1"].parts, { ctxNet: net(SOL.roas.filter(a => a.command !== "switchport mode trunk")) }) };
PERSONAS.MISCONFIG.auto = { ...PERSONAS.FULL.auto, "a4-1": [10, 6] };
PERSONAS.MISCONFIG.review = PERSONAS.FULL.review;
export const CHECK_WEIGHTS = { portsec: weight(portsec.checks()), wireless: weight(wireless.checks()), dhcp: weight(dhcp.checks()), capstone: weight(capstone.checks()) };
