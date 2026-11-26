// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), module 37 «ابنِ الشبكة»: a PRACTICE module — not a section of the printed
// booklet (owner decision 2026-11-26). NEW stable id m37, reading `order` 37: after the booklet's last section (m36).
//
// Seven BUILD-THE-NETWORK exercises (`simulation` / `network-build` v1, docs/enterprise-network-build-exercises.md), each on the topic of
// one booklet section and a step deeper than book 791381's m29: two switches with a Trunk, Native VLAN, VTP, Port Security, passwords,
// a DHCP server, and a DMZ web server. The learner starts from an EMPTY network in the network lab, adds the devices, connects the cables
// and configures them; the SERVER judges the network built, goal by goal. Checks, feedback and solutions never reach the browser.
//
// Every block is origin:"teacher-enrichment" — the book lock (bookLock.test.ts) holds no page of this module; `source` points at the
// booklet page of the topic (sourceNote: an exercise, not a booklet page). Device ids are the builder's (PC1 → pc1, SW2 → sw2…).
// STUDY STRENGTH (owner decision 2026-11-26): one more study module, 20 points, like 791381's m29. Each solution is proven by
// src/learning/lab/networkBuild.contract.test.ts (the empty network earns no goal; the solution reaches every goal).

import type { ContentBlock, ContentModule, ContentSource } from "../../types";
import { buildExercise as build, cable, cli, dev, ip, linkCheck, net, reach, T } from "../../networkBuildAuthoring";

const CID = "791381s";
const NOTE = "تمرين «ابنِ الشبكة» على موضوع هذه الصفحة من الكتاب (ليس صفحة من الكتاب).";
const src = (pdf: number): ContentSource => ({ kind: "book", sourceId: CID, pdfPageStart: pdf, sourceNote: NOTE });
const enter = ["enable", "configure terminal"];
// The booklet's own rule for added blocks (course791381s.test.ts): enrichment is an activity or a «توضيح» callout (kind clarification).
const note = (id: string, title: string, text: string): ContentBlock => ({ id, type: "callout", origin: "teacher-enrichment", kind: "clarification", title, spans: [T(text)] } as ContentBlock);
const howTo = (id: string, steps: string[]): ContentBlock => note(id, "كيف أعمل في المختبر؟", steps.join(" "));
const access = (port: string, vlan: number) => ["interface " + port, "switchport mode access", "switchport access vlan " + vlan, "exit"];

// ── 1. VLAN on two switches with a Trunk (booklet: Trunk, PDF 54) ─────────────────────────────────────────────────────────────────
const TRUNK = build({
  id: "m37-l01-p01-build-trunk", title: "ابنِ الشبكة: VLAN على سويتشين بـ Trunk",
  description: "ابنِ سويتشين بينهما Trunk يحمل VLAN 10 وVLAN 20، ثم اضغط «تحقّق من شبكتي».",
  fallback: "SW1 g0/1 ↔ SW2 g0/1 بوضع trunk على الطرفين؛ vlan 10 وvlan 20 على السويتشين؛ PC1 (SW1 f0/1) وPC2 (SW2 f0/1) في VLAN 10، PC3 (SW1 f0/2) في VLAN 20؛ العناوين 192.168.10.1 و.2 و.3.",
  intro: "ابنِ سويتشين SW1 وSW2، وصِل المنفذ g0/1 في SW1 بالمنفذ g0/1 في SW2. صِل PC1 بـ SW1 (f0/1) وPC3 بـ SW1 (f0/2) وPC2 بـ SW2 (f0/1). العناوين: PC1 = 192.168.10.1 وPC2 = 192.168.10.2 وPC3 = 192.168.10.3 (القناع 255.255.255.0). على السويتشين: أنشئ VLAN 10 وVLAN 20، واجعل g0/1 منفذ Trunk. ضع PC1 وPC2 في VLAN 10 وPC3 في VLAN 20.",
  kinds: ["switch", "pc"],
  checks: [
    linkCheck("link", "SW1 موصول بـ SW2", "sw1", "sw2"),
    { id: "t1", label: "SW1: المنفذ g0/1 في وضع Trunk", weight: 1, kind: "switch.portMode", deviceId: "sw1", interface: "g0/1", value: "trunk" },
    { id: "t2", label: "SW2: المنفذ g0/1 في وضع Trunk", weight: 1, kind: "switch.portMode", deviceId: "sw2", interface: "g0/1", value: "trunk" },
    { id: "a1", label: "SW1: المنفذ f0/1 في VLAN 10", weight: 1, kind: "switch.accessVlan", deviceId: "sw1", interface: "f0/1", value: 10 },
    { id: "a2", label: "SW2: المنفذ f0/1 في VLAN 10", weight: 1, kind: "switch.accessVlan", deviceId: "sw2", interface: "f0/1", value: 10 },
    { id: "a3", label: "SW1: المنفذ f0/2 في VLAN 20", weight: 1, kind: "switch.accessVlan", deviceId: "sw1", interface: "f0/2", value: 20 },
    reach("same", "PC1 يصل إلى PC2 عبر الـ Trunk (نفس VLAN)", "pc1", "pc2"),
    reach("apart", "PC1 لا يصل إلى PC3 (VLAN مختلفة)", "pc1", "pc3", false),
  ],
  hints: [
    "الـ VLAN يجب أن تكون موجودة على السويتشين: vlan 10 ثم exit ثم vlan 20 ثم exit — على SW1 وعلى SW2.",
    "على كل سويتش: interface g0/1 ثم switchport mode trunk.",
    "منافذ الحواسيب: interface f0/1 ثم switchport mode access ثم switchport access vlan 10.",
  ],
  explanation: "الـ Trunk يحمل أكثر من VLAN على كابل واحد بين سويتشين، ويضع على كل إطار علامة (Tag) برقم الـ VLAN. لذلك يصل PC1 إلى PC2 وهما على سويتشين مختلفين، ولا يصل إلى PC3 الموجود معه على السويتش نفسه.",
  solution: {
    config: net([dev("sw1", "switch", 0.25, 0.42), dev("sw2", "switch", 0.75, 0.42), dev("pc1", "pc", 0.1, 0.88), dev("pc2", "pc", 0.75, 0.88), dev("pc3", "pc", 0.4, 0.88)],
      [cable(1, "sw1", "g0/1", "sw2", "g0/1"), cable(2, "sw1", "f0/1", "pc1", "eth0"), cable(3, "sw2", "f0/1", "pc2", "eth0"), cable(4, "sw1", "f0/2", "pc3", "eth0")]),
    actions: [
      ip("pc1", "192.168.10.1"), ip("pc2", "192.168.10.2"), ip("pc3", "192.168.10.3"),
      ...cli("switch.command", "sw1", [...enter, "vlan 10", "exit", "vlan 20", "exit", ...access("f0/1", 10), ...access("f0/2", 20), "interface g0/1", "switchport mode trunk", "end"]),
      ...cli("switch.command", "sw2", [...enter, "vlan 10", "exit", "vlan 20", "exit", ...access("f0/1", 10), "interface g0/1", "switchport mode trunk", "end"]),
    ],
  },
});

// ── 2. Native VLAN and the allowed list on the Trunk (booklet: Native / Tagged / Untagged, PDF 48) ──────────────────────────────────
const NATIVE = build({
  id: "m37-l01-p02-build-native", title: "ابنِ الشبكة: Native VLAN على الـ Trunk",
  description: "ابنِ Trunk بين سويتشين واجعل الـ Native VLAN رقم 99 على الطرفين، ثم اضغط «تحقّق من شبكتي».",
  fallback: "SW1 g0/1 ↔ SW2 g0/1 trunk؛ vlan 10 وvlan 99 على السويتشين؛ switchport trunk native vlan 99 على الطرفين؛ switchport trunk allowed vlan 10,99؛ PC1 (SW1 f0/1) وPC2 (SW2 f0/1) في VLAN 10.",
  intro: "ابنِ سويتشين SW1 وSW2 وصِلهما من g0/1 إلى g0/1، ثم حاسوبًا على كل سويتش: PC1 على SW1 (f0/1) = 192.168.10.1، وPC2 على SW2 (f0/1) = 192.168.10.2 (القناع 255.255.255.0). على السويتشين: أنشئ VLAN 10 وVLAN 99، وضع f0/1 في VLAN 10، واجعل g0/1 منفذ Trunk بالـ Native VLAN رقم 99، واسمح عليه فقط بالـ VLANs 10 و99.",
  kinds: ["switch", "pc"],
  checks: [
    linkCheck("link", "SW1 موصول بـ SW2", "sw1", "sw2"),
    { id: "n1", label: "SW1: الـ Native VLAN على g0/1 هي 99", weight: 1, kind: "switch.nativeVlan", deviceId: "sw1", interface: "g0/1", value: 99 },
    { id: "n2", label: "SW2: الـ Native VLAN على g0/1 هي 99", weight: 1, kind: "switch.nativeVlan", deviceId: "sw2", interface: "g0/1", value: 99 },
    { id: "al1", label: "SW1: الـ Trunk يسمح بـ VLAN 10 و99 فقط", weight: 1, kind: "switch.allowedVlans", deviceId: "sw1", interface: "g0/1", value: "10,99" },
    { id: "al2", label: "SW2: الـ Trunk يسمح بـ VLAN 10 و99 فقط", weight: 1, kind: "switch.allowedVlans", deviceId: "sw2", interface: "g0/1", value: "10,99" },
    reach("ping", "PC1 يصل إلى PC2", "pc1", "pc2"),
  ],
  hints: [
    "على كل سويتش: interface g0/1 ثم switchport mode trunk ثم switchport trunk native vlan 99.",
    "ثم على المنفذ نفسه: switchport trunk allowed vlan 10,99.",
    "الـ Native VLAN يجب أن تكون نفسها على طرفي الـ Trunk، وإلا يحدث عدم تطابق (Native VLAN mismatch).",
  ],
  explanation: "إطارات الـ Native VLAN تمرّ على الـ Trunk بلا علامة (Untagged)، وكل الـ VLANs الأخرى تمرّ بعلامة (Tagged). نغيّرها من VLAN 1 إلى رقم آخر لأسباب أمنية، ويجب أن تكون نفسها على الطرفين. قائمة allowed تحدّد أي VLANs تمرّ على الـ Trunk.",
  solution: {
    config: net([dev("sw1", "switch", 0.25, 0.42), dev("sw2", "switch", 0.75, 0.42), dev("pc1", "pc", 0.25, 0.88), dev("pc2", "pc", 0.75, 0.88)],
      [cable(1, "sw1", "g0/1", "sw2", "g0/1"), cable(2, "sw1", "f0/1", "pc1", "eth0"), cable(3, "sw2", "f0/1", "pc2", "eth0")]),
    actions: [
      ip("pc1", "192.168.10.1"), ip("pc2", "192.168.10.2"),
      ...["sw1", "sw2"].flatMap(sw => cli("switch.command", sw, [...enter, "vlan 10", "exit", "vlan 99", "exit", ...access("f0/1", 10),
        "interface g0/1", "switchport mode trunk", "switchport trunk native vlan 99", "switchport trunk allowed vlan 10,99", "end"])),
    ],
  },
});

// ── 3. VTP: one server, one client (booklet: VTP, PDF 51) ───────────────────────────────────────────────────────────────────────
const VTP = build({
  id: "m37-l01-p03-build-vtp", title: "ابنِ الشبكة: VTP — Server وClient",
  description: "ابنِ سويتشين بـ VTP: تُنشئ الـ VLAN على الـ Server فتظهر وحدها على الـ Client، ثم اضغط «تحقّق من شبكتي».",
  fallback: "SW1: vtp mode server، vtp domain SCHOOL، vlan 30؛ SW2: vtp mode client، vtp domain SCHOOL؛ g0/1 ↔ g0/1 trunk؛ PC1 (SW1 f0/1) وPC2 (SW2 f0/1) في VLAN 30.",
  intro: "ابنِ سويتشين SW1 وSW2 وصِلهما من g0/1 إلى g0/1 واجعل المنفذين Trunk. اجعل SW1 في وضع VTP Server وSW2 في وضع VTP Client، والنطاق (domain) على الاثنين SCHOOL. أنشئ VLAN 30 على SW1 فقط — ستصل إلى SW2 وحدها. صِل PC1 بـ SW1 (f0/1) وPC2 بـ SW2 (f0/1) وضع المنفذين في VLAN 30. العناوين: PC1 = 192.168.30.1 وPC2 = 192.168.30.2 (القناع 255.255.255.0).",
  kinds: ["switch", "pc"],
  checks: [
    { id: "m1", label: "SW1 في وضع VTP Server", weight: 1, kind: "switch.vtpMode", deviceId: "sw1", value: "server" },
    { id: "m2", label: "SW2 في وضع VTP Client", weight: 1, kind: "switch.vtpMode", deviceId: "sw2", value: "client" },
    { id: "d1", label: "نطاق VTP على SW1 هو SCHOOL", weight: 1, kind: "switch.vtpDomain", deviceId: "sw1", value: "SCHOOL" },
    { id: "d2", label: "نطاق VTP على SW2 هو SCHOOL", weight: 1, kind: "switch.vtpDomain", deviceId: "sw2", value: "SCHOOL" },
    { id: "learned", label: "VLAN 30 موجودة على SW2 (وصلت من الـ Server)", weight: 1, kind: "switch.vlanExists", deviceId: "sw2", vlan: 30 },
    { id: "a2", label: "SW2: المنفذ f0/1 في VLAN 30", weight: 1, kind: "switch.accessVlan", deviceId: "sw2", interface: "f0/1", value: 30 },
    reach("ping", "PC1 يصل إلى PC2 في VLAN 30", "pc1", "pc2"),
  ],
  hints: [
    "على SW1: vtp domain SCHOOL ثم vtp mode server ثم vlan 30 ثم exit.",
    "على SW2: vtp domain SCHOOL ثم vtp mode client — لا تُنشئ VLAN على الـ Client (لا يسمح بذلك).",
    "الـ VTP يعمل فقط عبر Trunk: interface g0/1 ثم switchport mode trunk على السويتشين.",
  ],
  explanation: "VTP يوزّع قاعدة الـ VLANs من سويتش Server إلى كل سويتشات Client في النطاق نفسه عبر الـ Trunk. هكذا ننشئ الـ VLAN مرة واحدة على الـ Server، ويتعلّمها الباقون وحدهم.",
  solution: {
    config: net([dev("sw1", "switch", 0.25, 0.42), dev("sw2", "switch", 0.75, 0.42), dev("pc1", "pc", 0.25, 0.88), dev("pc2", "pc", 0.75, 0.88)],
      [cable(1, "sw1", "g0/1", "sw2", "g0/1"), cable(2, "sw1", "f0/1", "pc1", "eth0"), cable(3, "sw2", "f0/1", "pc2", "eth0")]),
    actions: [
      ip("pc1", "192.168.30.1"), ip("pc2", "192.168.30.2"),
      ...cli("switch.command", "sw1", [...enter, "vtp domain SCHOOL", "vtp mode server", "vlan 30", "exit", ...access("f0/1", 30), "interface g0/1", "switchport mode trunk", "end"]),
      ...cli("switch.command", "sw2", [...enter, "vtp domain SCHOOL", "vtp mode client", "interface g0/1", "switchport mode trunk", "exit", ...access("f0/1", 30), "end"]),
    ],
  },
});

// ── 4. Port Security (booklet: Port Security, PDF 70) ──────────────────────────────────────────────────────────────────────────
const PORTSEC = build({
  id: "m37-l02-p01-build-portsec", title: "ابنِ الشبكة: حماية المنافذ Port Security",
  description: "ابنِ شبكة واحمِ منافذ الحواسيب بـ Port Security، ثم اضغط «تحقّق من شبكتي».",
  fallback: "SW1 وPC1 (f0/1) وPC2 (f0/2)؛ على f0/1 وf0/2: switchport mode access، switchport port-security، maximum 1، mac-address sticky، violation restrict؛ PC1 = 192.168.1.1، PC2 = 192.168.1.2.",
  intro: "ابنِ سويتشًا SW1 وحاسوبين: PC1 على f0/1 وPC2 على f0/2. العناوين: PC1 = 192.168.1.1 وPC2 = 192.168.1.2 (القناع 255.255.255.0). احمِ المنفذين f0/1 وf0/2: شغّل Port Security، وجهاز واحد فقط لكل منفذ (maximum 1)، وتعلّم العنوان تلقائيًا (sticky)، وعند المخالفة: restrict.",
  kinds: ["switch", "pc"],
  checks: [
    { id: "ps1", label: "SW1: Port Security مفعّل على f0/1", weight: 1, kind: "switch.portSecurity", deviceId: "sw1", interface: "f0/1", value: true },
    { id: "ps2", label: "SW1: Port Security مفعّل على f0/2", weight: 1, kind: "switch.portSecurity", deviceId: "sw1", interface: "f0/2", value: true },
    { id: "max", label: "SW1: جهاز واحد فقط على f0/1 (maximum 1)", weight: 1, kind: "switch.portSecurityMaximum", deviceId: "sw1", interface: "f0/1", value: 1 },
    { id: "sticky", label: "SW1: Sticky MAC على f0/1", weight: 1, kind: "switch.portSecuritySticky", deviceId: "sw1", interface: "f0/1", value: true },
    { id: "viol", label: "SW1: المخالفة على f0/1 = restrict", weight: 1, kind: "switch.portSecurityViolation", deviceId: "sw1", interface: "f0/1", value: "restrict" },
    reach("ping", "PC1 ما زال يصل إلى PC2", "pc1", "pc2"),
  ],
  hints: [
    "Port Security يعمل على منفذ access فقط: interface f0/1 ثم switchport mode access أولًا.",
    "ثم: switchport port-security ثم switchport port-security maximum 1 ثم switchport port-security mac-address sticky ثم switchport port-security violation restrict.",
    "كرّر الأوامر على f0/2 (يكفي أن تشغّل switchport port-security هناك).",
  ],
  explanation: "Port Security يحدّد عدد الأجهزة (عناوين MAC) المسموح بها على المنفذ. sticky يحفظ عنوان الجهاز الأول، وrestrict يمنع أي جهاز غريب ويسجّل المخالفة بدون أن يغلق المنفذ (shutdown يغلقه).",
  solution: {
    config: net([dev("sw1", "switch", 0.5, 0.42), dev("pc1", "pc", 0.25, 0.88), dev("pc2", "pc", 0.75, 0.88)],
      [cable(1, "sw1", "f0/1", "pc1", "eth0"), cable(2, "sw1", "f0/2", "pc2", "eth0")]),
    actions: [
      ip("pc1", "192.168.1.1"), ip("pc2", "192.168.1.2"),
      ...cli("switch.command", "sw1", [...enter,
        "interface f0/1", "switchport mode access", "switchport port-security", "switchport port-security maximum 1", "switchport port-security mac-address sticky", "switchport port-security violation restrict", "exit",
        "interface f0/2", "switchport mode access", "switchport port-security", "end"]),
    ],
  },
});

// ── 5. Passwords on the router (booklet: protecting Cisco devices, PDF 73) ────────────────────────────────────────────────────────
const PASSWORDS = build({
  id: "m37-l02-p02-build-passwords", title: "ابنِ الشبكة: احمِ الراوتر بكلمات المرور",
  description: "ابنِ شبكة صغيرة واحمِ الراوتر بكلمات المرور، ثم اضغط «تحقّق من شبكتي».",
  fallback: "R1 g0/0 = 192.168.1.1 إلى SW1، وPC1 = 192.168.1.10 بوابته 192.168.1.1؛ enable secret Class123؛ line console 0: password Cisco123 وlogin؛ line vty 0 4: password Cisco123 وlogin؛ service password-encryption.",
  intro: "ابنِ راوترًا R1 وسويتشًا SW1 وحاسوبًا PC1. صِل g0/0 في R1 بالسويتش، وPC1 بالسويتش. أعطِ g0/0 العنوان 192.168.1.1 وشغّله، وPC1 العنوان 192.168.1.10 والبوابة 192.168.1.1 (القناع 255.255.255.0). ثم احمِ R1: كلمة مرور مشفّرة للوضع المميّز enable secret = Class123، وكلمة المرور Cisco123 مع login على خط Console وعلى خطوط VTY، وشفّر كل كلمات المرور في الإعدادات.",
  kinds: ["router", "switch", "pc"],
  checks: [
    { id: "secret", label: "R1: enable secret مضبوطة", weight: 1, kind: "router.enableSecret", deviceId: "r1", value: "Class123" },
    { id: "con", label: "R1: كلمة مرور خط Console مضبوطة", weight: 1, kind: "router.consolePassword", deviceId: "r1", value: "Cisco123" },
    { id: "conlogin", label: "R1: login على خط Console", weight: 1, kind: "router.consoleLogin", deviceId: "r1", value: true },
    { id: "vty", label: "R1: كلمة مرور خطوط VTY مضبوطة", weight: 1, kind: "router.vtyPassword", deviceId: "r1", value: "Cisco123" },
    { id: "vtylogin", label: "R1: login على خطوط VTY", weight: 1, kind: "router.vtyLogin", deviceId: "r1", value: true },
    { id: "enc", label: "R1: service password-encryption مفعّل", weight: 1, kind: "router.passwordEncryption", deviceId: "r1", value: true },
    reach("ping", "PC1 يصل إلى R1", "pc1", "r1"),
  ],
  hints: [
    "في وضع configure terminal: enable secret Class123.",
    "line console 0 ثم password Cisco123 ثم login ثم exit. وكذلك: line vty 0 4 ثم password Cisco123 ثم login ثم exit.",
    "في النهاية: service password-encryption — تشفّر كلمات المرور المكتوبة في الإعدادات.",
  ],
  explanation: "enable secret تحمي الدخول إلى الوضع المميّز وتُحفظ مشفّرة. كلمة مرور Console تحمي الدخول بالكابل المباشر، وكلمة مرور VTY تحمي الدخول عن بُعد (Telnet / SSH). service password-encryption يمنع قراءة كلمات المرور من ملف الإعدادات.",
  solution: {
    config: net([dev("r1", "router", 0.5, 0.1), dev("sw1", "switch", 0.5, 0.42), dev("pc1", "pc", 0.5, 0.88)],
      [cable(1, "r1", "g0/0", "sw1", "g0/1"), cable(2, "sw1", "f0/1", "pc1", "eth0")]),
    actions: [
      ...cli("router.command", "r1", [...enter, "interface g0/0", "ip address 192.168.1.1 255.255.255.0", "no shutdown", "exit",
        "enable secret Class123", "line console 0", "password Cisco123", "login", "exit", "line vty 0 4", "password Cisco123", "login", "exit", "service password-encryption", "end"]),
      ip("pc1", "192.168.1.10", "192.168.1.1"),
    ],
  },
});

// ── 6. A DHCP server device (booklet: DHCP, PDF 66) ────────────────────────────────────────────────────────────────────────────
const DHCP_SERVER = build({
  id: "m37-l03-p01-build-dhcp-server", title: "ابنِ الشبكة: خادم DHCP في الشبكة",
  description: "ابنِ شبكة فيها خادم Server يوزّع العناوين على الحواسيب، ثم اضغط «تحقّق من شبكتي».",
  fallback: "SW1 وSRV1 = 192.168.1.2 (static) وPC1 وPC2؛ SRV1 ← Services ← DHCP: On، Default Gateway 192.168.1.1، DNS 192.168.1.2، Start IP 192.168.1.100، القناع 255.255.255.0، العدد 50؛ PC1 وPC2 في وضع DHCP.",
  intro: "ابنِ سويتشًا SW1 وخادمًا SRV1 وحاسوبين PC1 وPC2، وصِل الجميع بالسويتش. أعطِ الخادم عنوانًا ثابتًا 192.168.1.2 (القناع 255.255.255.0). شغّل على الخادم خدمة DHCP: البوابة 192.168.1.1، وخادم DNS هو 192.168.1.2، وأول عنوان يوزّعه 192.168.1.100، والقناع 255.255.255.0، وعدد العناوين 50. ثم اجعل PC1 وPC2 يأخذان عنوانيهما بـ DHCP.",
  kinds: ["switch", "pc", "server"],
  checks: [
    { id: "srv", label: "في الشبكة خادم SRV1", kind: "build.device", deviceId: "srv1", deviceKind: "server" },
    linkCheck("link", "SRV1 موصول بالسويتش SW1", "srv1", "sw1"),
    { id: "l1", label: "PC1 أخذ عنوانه من DHCP", weight: 1, kind: "host.dhcpLease", deviceId: "pc1", adapter: "eth0", value: true },
    { id: "l2", label: "PC2 أخذ عنوانه من DHCP", weight: 1, kind: "host.dhcpLease", deviceId: "pc2", adapter: "eth0", value: true },
    { id: "from", label: "الذي أعطى PC1 عنوانه هو SRV1 (192.168.1.2)", weight: 1, kind: "host.dhcpServer", deviceId: "pc1", adapter: "eth0", value: "192.168.1.2" },
    { id: "dns", label: "خادم DNS الذي وصل إلى PC1 هو 192.168.1.2", weight: 1, kind: "host.dns", deviceId: "pc1", adapter: "eth0", value: "192.168.1.2" },
    reach("ping", "PC1 يصل إلى PC2", "pc1", "pc2"),
  ],
  hints: [
    "اختر SRV1 ← IP Configuration: 192.168.1.2 والقناع 255.255.255.0.",
    "في خدمات SRV1 ← DHCP: شغّل الخدمة واكتب Default Gateway وDNS Server وStart IP والقناع والعدد، ثم احفظ.",
    "في كل حاسوب: IP Configuration ← DHCP.",
  ],
  explanation: "خادم DHCP يوزّع على كل جهاز عنوانًا من المجال، ومعه القناع والبوابة وخادم DNS. الطالب يرى ذلك في ipconfig /all: العنوان الذي أخذه، ومن أي خادم DHCP أخذه.",
  solution: {
    config: net([dev("sw1", "switch", 0.5, 0.42), dev("srv1", "server", 0.2, 0.78), dev("pc1", "pc", 0.5, 0.88), dev("pc2", "pc", 0.8, 0.88)],
      [cable(1, "sw1", "f0/1", "srv1", "eth0"), cable(2, "sw1", "f0/2", "pc1", "eth0"), cable(3, "sw1", "f0/3", "pc2", "eth0")]),
    actions: [
      ip("srv1", "192.168.1.2"),
      { type: "server.setDhcp", deviceId: "srv1", enabled: true, pool: { defaultRouter: "192.168.1.1", dns: "192.168.1.2", start: "192.168.1.100", mask: "255.255.255.0", max: 50 } },
      ...["pc1", "pc2"].map(deviceId => ({ type: "host.setMode", deviceId, adapter: "eth0", mode: "dhcp" })),
    ],
  },
});

// ── 7. A DMZ web server behind the router (booklet: DMZ, PDF 59) ───────────────────────────────────────────────────────────────
const DMZ = build({
  id: "m37-l03-p02-build-dmz", title: "ابنِ الشبكة: خادم ويب في المنطقة العازلة DMZ",
  description: "ابنِ شبكة داخلية ومنطقة عازلة فيها خادم ويب، وافتح الموقع من الشبكة الداخلية، ثم اضغط «تحقّق من شبكتي».",
  fallback: "R1: g0/0 = 192.168.1.1 إلى SW1 (الشبكة الداخلية، PC1 = 192.168.1.10 بوابته 192.168.1.1)، g0/1 = 172.16.1.1 إلى SRV1 (DMZ، 172.16.1.10 بوابته 172.16.1.1، HTTP On)؛ المتصفح في PC1: http://172.16.1.10.",
  intro: "الخوادم التي يصل إليها الجميع نضعها في منطقة عازلة DMZ منفصلة عن الشبكة الداخلية. ابنِ راوترًا R1 وسويتشًا SW1 وحاسوبًا PC1 وخادمًا SRV1. الشبكة الداخلية: g0/0 في R1 إلى SW1، وPC1 على SW1؛ المنفذ g0/0 = 192.168.1.1، وPC1 = 192.168.1.10 وبوابته 192.168.1.1. المنطقة العازلة: g0/1 في R1 إلى SRV1 مباشرة؛ المنفذ g0/1 = 172.16.1.1، وSRV1 = 172.16.1.10 وبوابته 172.16.1.1. القناع 255.255.255.0 للجميع. شغّل خدمة HTTP على SRV1، وافتح من متصفح PC1 العنوان http://172.16.1.10.",
  kinds: ["router", "switch", "pc", "server"],
  checks: [
    linkCheck("dmz", "SRV1 موصول بالراوتر R1 مباشرة (منطقة منفصلة)", "r1", "srv1"),
    linkCheck("lan", "R1 موصول بالسويتش SW1 (الشبكة الداخلية)", "r1", "sw1"),
    { id: "ip1", label: "R1: المنفذ g0/1 بالعنوان 172.16.1.1", weight: 1, kind: "router.ipAddress", deviceId: "r1", interface: "g0/1", value: "172.16.1.1" },
    { id: "gw", label: "بوابة SRV1 هي 172.16.1.1", weight: 1, kind: "host.gateway", deviceId: "srv1", adapter: "eth0", value: "172.16.1.1" },
    reach("ping", "PC1 يصل إلى SRV1 عبر الراوتر", "pc1", "srv1"),
    { id: "web", label: "المتصفح في PC1 يفتح http://172.16.1.10", weight: 1, kind: "browse", source: "pc1", url: "http://172.16.1.10", value: true },
  ],
  hints: [
    "على R1: interface g0/0 ثم ip address 192.168.1.1 255.255.255.0 ثم no shutdown، وكذلك g0/1 بالعنوان 172.16.1.1.",
    "الخادم في شبكة أخرى، فيحتاج بوابة: 172.16.1.1 (عنوان g0/1).",
    "في خدمات SRV1: HTTP ← On.",
  ],
  explanation: "الـ DMZ شبكة منفصلة للخوادم التي يزورها الآخرون. الراوتر (وعادة جدار حماية) يفصلها عن الشبكة الداخلية، فإن اختُرق الخادم بقيت الشبكة الداخلية محمية. الحاسوب يصل إلى الخادم عبر الراوتر لأنهما في شبكتين مختلفتين.",
  solution: {
    config: net([dev("r1", "router", 0.5, 0.1), dev("sw1", "switch", 0.25, 0.42), dev("pc1", "pc", 0.25, 0.88), dev("srv1", "server", 0.75, 0.78)],
      [cable(1, "r1", "g0/0", "sw1", "g0/1"), cable(2, "sw1", "f0/1", "pc1", "eth0"), cable(3, "r1", "g0/1", "srv1", "eth0")]),
    actions: [
      ...cli("router.command", "r1", [...enter, "interface g0/0", "ip address 192.168.1.1 255.255.255.0", "no shutdown", "exit",
        "interface g0/1", "ip address 172.16.1.1 255.255.255.0", "no shutdown", "end"]),
      ip("pc1", "192.168.1.10", "192.168.1.1"), ip("srv1", "172.16.1.10", "172.16.1.1"),
      { type: "server.setHttp", deviceId: "srv1", enabled: true, title: "DMZ", body: "Public web server" },
    ],
  },
});

const page = (id: string, title: string, order: number, pdf: number, _keywords: string[], blocks: ContentBlock[]) => ({ id, title, order, source: src(pdf), blocks });

const m37: ContentModule = {
  id: "791381s-m37",
  title: "ابنِ الشبكة",
  order: 37,
  lessons: [
    {
      id: "791381s-m37-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        page("791381s-m37-l00-p01", "ابنِ الشبكة بنفسك", 1, 44, ["ابنِ الشبكة", "مختبر الشبكات", "تمارين"], [
          note("m37-l00-p01-about", "ابنِ الشبكة", "سبعة تحديات من الكتاب الملخّص. في كل تمرين تبدأ بشبكة فارغة: تضيف الأجهزة، وتصلها بالكوابل، وتبرمجها كما في Packet Tracer. عندما تنتهي، اضغط «تحقّق من شبكتي»: الخادم يفحص شبكتك ويعلّم كل هدف بـ ✓ أو ✕."),
          note("m37-l00-p01-steps", "كيف أعمل في المختبر؟", "1. أضف الأجهزة بالأزرار (+ راوتر، + سويتش، + حاسوب…). 2. صِل كابلًا في «توصيل كابل»: اختر الجهاز والمنفذ من الجهتين ثم «صِل». 3. اختر جهازًا لبرمجته: سطر الأوامر للراوتر والسويتش، وIP Configuration والخدمات للحاسوب والخادم. 4. جرّب بنفسك ping وshow vlan brief، ثم اضغط «تحقّق من شبكتي»."),
          note("m37-l00-p01-note", "تذكّر", "أسماء الأجهزة في الأهداف (PC1، SW1، R1…) هي الأسماء التي يعطيها المختبر بالترتيب. إذا حذفت جهازًا وأضفته من جديد قد يأخذ رقمًا آخر — عندها اضغط «ابدأ من جديد». شبكتك تُحفظ تلقائيًا في هذا المتصفح."),
        ]),
      ],
    },
    {
      id: "791381s-m37-l01",
      title: "السويتشات و VLAN",
      order: 1,
      pages: [
        page("791381s-m37-l01-p01", "VLAN على سويتشين بـ Trunk", 1, 54, ["Trunk", "VLAN", "switchport mode trunk"], [
          howTo("m37-l01-p01-how", ["الـ VLAN تُنشأ على كل سويتش تمرّ به.", "الكابل بين السويتشين يكون Trunk."]),
          TRUNK,
        ]),
        page("791381s-m37-l01-p02", "Native VLAN على الـ Trunk", 2, 48, ["Native VLAN", "Tagged", "Untagged", "allowed vlan"], [
          howTo("m37-l01-p02-how", ["الـ Native VLAN تمرّ بلا علامة.", "يجب أن تكون نفسها على طرفي الـ Trunk."]),
          NATIVE,
        ]),
        page("791381s-m37-l01-p03", "VTP — Server وClient", 3, 51, ["VTP", "vtp mode server", "vtp domain"], [
          howTo("m37-l01-p03-how", ["أنشئ الـ VLAN على الـ Server فقط.", "الـ Client يتعلّمها عبر الـ Trunk إذا كان النطاق نفسه."]),
          VTP,
        ]),
      ],
    },
    {
      id: "791381s-m37-l02",
      title: "الحماية",
      order: 2,
      pages: [
        page("791381s-m37-l02-p01", "حماية المنافذ Port Security", 1, 70, ["Port Security", "sticky", "violation"], [
          howTo("m37-l02-p01-how", ["Port Security على منفذ access فقط.", "جرّب show port-security interface f0/1."]),
          PORTSEC,
        ]),
        page("791381s-m37-l02-p02", "احمِ الراوتر بكلمات المرور", 2, 73, ["enable secret", "line console", "line vty", "service password-encryption"], [
          howTo("m37-l02-p02-how", ["كلمات المرور تُكتب في وضع configure terminal.", "جرّب show running-config لترى الإعدادات."]),
          PASSWORDS,
        ]),
      ],
    },
    {
      id: "791381s-m37-l03",
      title: "الخدمات",
      order: 3,
      pages: [
        page("791381s-m37-l03-p01", "خادم DHCP في الشبكة", 1, 66, ["DHCP", "Server", "DORA"], [
          howTo("m37-l03-p01-how", ["الخادم نفسه يحتاج عنوانًا ثابتًا.", "جرّب ipconfig /all في الحاسوب بعد DHCP."]),
          DHCP_SERVER,
        ]),
        page("791381s-m37-l03-p02", "خادم ويب في المنطقة العازلة DMZ", 2, 59, ["DMZ", "HTTP", "Router"], [
          howTo("m37-l03-p02-how", ["الـ DMZ شبكة منفصلة على منفذ آخر في الراوتر.", "كل جهاز يحتاج بوابة للوصول إلى الشبكة الأخرى."]),
          DMZ,
        ]),
      ],
    },
  ],
};

export default m37;
