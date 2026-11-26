// Learning Materials — «ابنِ الشبكة» (docs/enterprise-network-build-exercises.md): a PRACTICE module of Book 791381 — not a book section.
// NEW stable id m29, reading `order` 29: after the final summary (m28). Seven BUILD-THE-NETWORK exercises (`simulation` /
// `network-build` v1), each on the topic of one of the book's units: the learner starts from an EMPTY network in the book's network
// lab (the student tool «مختبر الشبكات», plain mode), adds the devices, connects the cables and configures them; the SERVER judges the
// network built, goal by goal (src/learning/lab/networkBuildJudge.ts). Checks, feedback and solutions never reach the browser.
//
// Every block here is origin:"teacher-enrichment". `source` points at the book page of the topic the exercise practises (sourceNote
// says it is an exercise, not a book page). Device ids are the ones the builder gives (PC1 → pc1, SW1 → sw1, R1 → r1, AP1 → ap1,
// LAP1 → lap1, SRV1 → srv1): the goals name the devices exactly as the builder labels them. Each solution is proven by
// src/learning/lab/networkBuild.contract.test.ts: the empty network earns no goal, the solution reaches every goal.
// The language stays simple: one idea per sentence, the values written out, the commands in the hints.
// STUDY STRENGTH (owner decision 2026-11-26): «ابنِ الشبكة» counts as the book's 29th study module, worth 20 points like every module
// (round(completed / 7 × 20)); a right network is recorded once, like every study exercise.

import type { ContentBlock, ContentModule, ContentSource } from "../../types";
import { buildExercise as build, cable, cli, dev, howTo, ip, L, linkCheck, net, reach, T } from "../../networkBuildAuthoring";

const CID = "791381";
const NOTE = "تمرين «ابنِ الشبكة» على موضوع هذه الصفحة من الكتاب (ليس صفحة من الكتاب).";
const src = (pdf: number): ContentSource => ({ kind: "book", sourceId: CID, pdfPageStart: pdf, sourceNote: NOTE });

// ── the seven exercises ────────────────────────────────────────────────────────────────────────────────────────────────────────
const LAN = build({
  id: "m29-l01-p01-build-lan", title: "ابنِ الشبكة: شبكة محلية بسويتش",
  description: "ابنِ شبكة محلية من سويتش وثلاثة حواسيب، ثم اضغط «تحقّق من شبكتي».",
  fallback: "سويتش SW1 وثلاثة حواسيب، كل حاسوب بكابل إلى السويتش؛ PC1 = 192.168.1.10 وPC2 = 192.168.1.11 وPC3 = 192.168.1.12 والقناع 255.255.255.0؛ ping من PC1 إلى الآخرين.",
  intro: "ابنِ شبكة محلية LAN صغيرة: سويتش واحد SW1 وثلاثة حواسيب. صِل كل حاسوب بالسويتش بكابل. ثم أعطِ كل حاسوب عنوانه في IP Configuration: PC1 = 192.168.1.10 وPC2 = 192.168.1.11 وPC3 = 192.168.1.12، والقناع 255.255.255.0 للجميع. جرّب ping من PC1.",
  kinds: ["switch", "pc"],
  checks: [
    { id: "sw", label: "في الشبكة سويتش SW1", kind: "build.device", deviceId: "sw1", deviceKind: "switch" },
    { id: "pcs", label: "في الشبكة ثلاثة حواسيب على الأقل", kind: "build.count", deviceKind: "pc", min: 3 },
    linkCheck("l1", "PC1 موصول بالسويتش SW1", "sw1", "pc1"),
    linkCheck("l2", "PC2 موصول بالسويتش SW1", "sw1", "pc2"),
    linkCheck("l3", "PC3 موصول بالسويتش SW1", "sw1", "pc3"),
    { id: "a1", label: "عنوان PC1 هو 192.168.1.10", weight: 1, kind: "host.address", deviceId: "pc1", adapter: "eth0", value: "192.168.1.10" },
    reach("r2", "PC1 يصل إلى PC2 (ping ينجح)", "pc1", "pc2"),
    reach("r3", "PC1 يصل إلى PC3 (ping ينجح)", "pc1", "pc3"),
  ],
  hints: [
    "اضغط «+ سويتش» مرة و«+ حاسوب» ثلاث مرات.",
    "في «توصيل كابل»: من SW1 (منفذ f0/1) إلى PC1 (eth0)، ثم f0/2 إلى PC2، ثم f0/3 إلى PC3.",
    "اختر الحاسوب ← IP Configuration ← اكتب العنوان والقناع ← حفظ. كل الحواسيب في نفس الشبكة 192.168.1.x.",
  ],
  explanation: "السويتش يصل أجهزة الشبكة المحلية الواحدة. الحواسيب في نفس الشبكة (192.168.1.x بالقناع 255.255.255.0) تتصل مباشرة عبر السويتش بدون راوتر.",
  solution: {
    config: net([dev("sw1", "switch", 0.5, 0.42), dev("pc1", "pc", 0.2, 0.88), dev("pc2", "pc", 0.5, 0.88), dev("pc3", "pc", 0.8, 0.88)],
      [cable(1, "sw1", "f0/1", "pc1", "eth0"), cable(2, "sw1", "f0/2", "pc2", "eth0"), cable(3, "sw1", "f0/3", "pc3", "eth0")]),
    actions: [ip("pc1", "192.168.1.10"), ip("pc2", "192.168.1.11"), ip("pc3", "192.168.1.12")],
  },
});

const VLAN = build({
  id: "m29-l01-p02-build-vlan", title: "ابنِ الشبكة: قسمان على سويتش واحد (VLAN)",
  description: "ابنِ سويتشًا وأربعة حواسيب وقسّمها إلى VLAN 10 وVLAN 20، ثم اضغط «تحقّق من شبكتي».",
  fallback: "SW1 وأربعة حواسيب على f0/1–f0/4؛ العناوين 192.168.10.1–4؛ vlan 10 وvlan 20؛ f0/1 وf0/2 في VLAN 10، f0/3 وf0/4 في VLAN 20؛ PC1 يصل إلى PC2 ولا يصل إلى PC3.",
  intro: "في المدرسة قسمان: الإدارة في VLAN 10 والطلاب في VLAN 20. ابنِ سويتشًا SW1 وأربعة حواسيب. صِل PC1 بالمنفذ f0/1 وPC2 بـ f0/2 وPC3 بـ f0/3 وPC4 بـ f0/4. أعطِ الحواسيب العناوين 192.168.10.1 و192.168.10.2 و192.168.10.3 و192.168.10.4 (القناع 255.255.255.0). ثم برمج SW1: أنشئ VLAN 10 وVLAN 20، وضع f0/1 وf0/2 في VLAN 10، وf0/3 وf0/4 في VLAN 20.",
  kinds: ["switch", "pc"],
  checks: [
    { id: "pcs", label: "في الشبكة أربعة حواسيب على الأقل", kind: "build.count", deviceKind: "pc", min: 4 },
    { id: "v10", label: "VLAN 10 موجودة على SW1", weight: 1, kind: "switch.vlanExists", deviceId: "sw1", vlan: 10 },
    { id: "v20", label: "VLAN 20 موجودة على SW1", weight: 1, kind: "switch.vlanExists", deviceId: "sw1", vlan: 20 },
    { id: "p1", label: "المنفذ f0/1 في VLAN 10", weight: 1, kind: "switch.accessVlan", deviceId: "sw1", interface: "f0/1", value: 10 },
    { id: "p2", label: "المنفذ f0/2 في VLAN 10", weight: 1, kind: "switch.accessVlan", deviceId: "sw1", interface: "f0/2", value: 10 },
    { id: "p3", label: "المنفذ f0/3 في VLAN 20", weight: 1, kind: "switch.accessVlan", deviceId: "sw1", interface: "f0/3", value: 20 },
    { id: "p4", label: "المنفذ f0/4 في VLAN 20", weight: 1, kind: "switch.accessVlan", deviceId: "sw1", interface: "f0/4", value: 20 },
    reach("same", "PC1 يصل إلى PC2 (نفس VLAN)", "pc1", "pc2"),
    reach("apart", "PC1 لا يصل إلى PC3 (VLAN مختلفة)", "pc1", "pc3", false),
  ],
  hints: [
    "صِل كل حاسوب بالمنفذ المطلوب بالضبط: PC1 ← f0/1، PC2 ← f0/2، PC3 ← f0/3، PC4 ← f0/4.",
    "في سطر أوامر SW1: enable ثم configure terminal ثم vlan 10 ثم exit ثم vlan 20 ثم exit.",
    "لكل منفذ: interface f0/1 ثم switchport mode access ثم switchport access vlan 10 ثم exit (وهكذا لبقية المنافذ).",
  ],
  explanation: "VLAN تقسم السويتش الواحد إلى شبكات منفصلة: PC1 وPC3 في نفس عناوين الشبكة، لكنهما في VLAN مختلفة فلا يصل أحدهما إلى الآخر بدون راوتر.",
  solution: {
    config: net([dev("sw1", "switch", 0.5, 0.42), dev("pc1", "pc", 0.08, 0.88), dev("pc2", "pc", 0.36, 0.88), dev("pc3", "pc", 0.64, 0.88), dev("pc4", "pc", 0.92, 0.88)],
      [cable(1, "sw1", "f0/1", "pc1", "eth0"), cable(2, "sw1", "f0/2", "pc2", "eth0"), cable(3, "sw1", "f0/3", "pc3", "eth0"), cable(4, "sw1", "f0/4", "pc4", "eth0")]),
    actions: [
      ip("pc1", "192.168.10.1"), ip("pc2", "192.168.10.2"), ip("pc3", "192.168.10.3"), ip("pc4", "192.168.10.4"),
      ...cli("switch.command", "sw1", ["enable", "configure terminal", "vlan 10", "exit", "vlan 20", "exit",
        "interface f0/1", "switchport mode access", "switchport access vlan 10", "exit",
        "interface f0/2", "switchport mode access", "switchport access vlan 10", "exit",
        "interface f0/3", "switchport mode access", "switchport access vlan 20", "exit",
        "interface f0/4", "switchport mode access", "switchport access vlan 20", "end"]),
    ],
  },
});

const ROUTED = build({
  id: "m29-l02-p01-build-router", title: "ابنِ الشبكة: راوتر يصل شبكتين",
  description: "ابنِ شبكتين يصل بينهما راوتر، ثم اضغط «تحقّق من شبكتي».",
  fallback: "R1: g0/0 = 192.168.1.1 إلى SW1، g0/1 = 192.168.2.1 إلى SW2، no shutdown؛ PC1 = 192.168.1.10 بوابته 192.168.1.1 على SW1؛ PC2 = 192.168.2.10 بوابته 192.168.2.1 على SW2.",
  intro: "ابنِ شبكتين يصل بينهما راوتر: R1 وسويتشان SW1 وSW2 وحاسوبان. صِل المنفذ g0/0 في R1 بـ SW1، والمنفذ g0/1 بـ SW2. صِل PC1 بـ SW1 وPC2 بـ SW2. الشبكة الأولى: المنفذ g0/0 = 192.168.1.1، وPC1 = 192.168.1.10 وبوابته 192.168.1.1. الشبكة الثانية: المنفذ g0/1 = 192.168.2.1، وPC2 = 192.168.2.10 وبوابته 192.168.2.1. القناع 255.255.255.0 للجميع.",
  kinds: ["router", "switch", "pc"],
  checks: [
    { id: "r", label: "في الشبكة راوتر R1", kind: "build.device", deviceId: "r1", deviceKind: "router" },
    linkCheck("l1", "R1 موصول بالسويتش SW1", "r1", "sw1"),
    linkCheck("l2", "R1 موصول بالسويتش SW2", "r1", "sw2"),
    { id: "ip0", label: "R1: المنفذ g0/0 بالعنوان 192.168.1.1", weight: 1, kind: "router.ipAddress", deviceId: "r1", interface: "g0/0", value: "192.168.1.1" },
    { id: "ip1", label: "R1: المنفذ g0/1 بالعنوان 192.168.2.1", weight: 1, kind: "router.ipAddress", deviceId: "r1", interface: "g0/1", value: "192.168.2.1" },
    { id: "gw1", label: "بوابة PC1 هي 192.168.1.1", weight: 1, kind: "host.gateway", deviceId: "pc1", adapter: "eth0", value: "192.168.1.1" },
    { id: "gw2", label: "بوابة PC2 هي 192.168.2.1", weight: 1, kind: "host.gateway", deviceId: "pc2", adapter: "eth0", value: "192.168.2.1" },
    reach("far", "PC1 يصل إلى PC2 عبر الراوتر", "pc1", "pc2"),
  ],
  hints: [
    "الأجهزة: «+ راوتر» مرة، «+ سويتش» مرتين، «+ حاسوب» مرتين. صِل R1 (g0/0) بـ SW1 وR1 (g0/1) بـ SW2.",
    "في سطر أوامر R1: enable ثم configure terminal ثم interface g0/0 ثم ip address 192.168.1.1 255.255.255.0 ثم no shutdown ثم exit — وكذلك g0/1 بالعنوان 192.168.2.1.",
    "البوابة Default Gateway لكل حاسوب هي عنوان منفذ الراوتر في شبكته.",
  ],
  explanation: "الراوتر يصل بين شبكات مختلفة. كل منفذ في الراوتر ينتمي إلى شبكة، وعنوانه هو البوابة Default Gateway للأجهزة في تلك الشبكة. بدون بوابة لا يعرف الحاسوب إلى أين يرسل الرسائل للشبكة الأخرى.",
  solution: {
    config: net([dev("r1", "router", 0.5, 0.1), dev("sw1", "switch", 0.25, 0.42), dev("sw2", "switch", 0.75, 0.42), dev("pc1", "pc", 0.25, 0.88), dev("pc2", "pc", 0.75, 0.88)],
      [cable(1, "r1", "g0/0", "sw1", "g0/1"), cable(2, "r1", "g0/1", "sw2", "g0/1"), cable(3, "sw1", "f0/1", "pc1", "eth0"), cable(4, "sw2", "f0/1", "pc2", "eth0")]),
    actions: [
      ...cli("router.command", "r1", ["enable", "configure terminal", "interface g0/0", "ip address 192.168.1.1 255.255.255.0", "no shutdown", "exit",
        "interface g0/1", "ip address 192.168.2.1 255.255.255.0", "no shutdown", "end"]),
      ip("pc1", "192.168.1.10", "192.168.1.1"), ip("pc2", "192.168.2.10", "192.168.2.1"),
    ],
  },
});

const ROAS = build({
  id: "m29-l02-p02-build-roas", title: "ابنِ الشبكة: Router on a Stick",
  description: "ابنِ راوترًا بمنفذ واحد يصل بين VLAN 10 وVLAN 20، ثم اضغط «تحقّق من شبكتي».",
  fallback: "SW1: vlan 10، vlan 20، f0/1 access 10، f0/2 access 20، g0/1 trunk؛ R1: g0/0 no shutdown، g0/0.10 dot1Q 10 = 192.168.10.1، g0/0.20 dot1Q 20 = 192.168.20.1؛ PC1 = 192.168.10.10 (بوابة .10.1)، PC2 = 192.168.20.10 (بوابة .20.1).",
  intro: "نصل بين VLAN 10 وVLAN 20 بمنفذ واحد في الراوتر. ابنِ R1 وSW1 وحاسوبين. صِل المنفذ g0/0 في R1 بالمنفذ g0/1 في SW1، وPC1 بـ f0/1 وPC2 بـ f0/2. على SW1: أنشئ VLAN 10 وVLAN 20، وضع f0/1 في VLAN 10 وf0/2 في VLAN 20، واجعل g0/1 منفذ Trunk. على R1: شغّل g0/0، وأنشئ الواجهة g0/0.10 (dot1Q 10، العنوان 192.168.10.1) والواجهة g0/0.20 (dot1Q 20، العنوان 192.168.20.1). PC1 = 192.168.10.10 وبوابته 192.168.10.1، PC2 = 192.168.20.10 وبوابته 192.168.20.1.",
  kinds: ["router", "switch", "pc"],
  checks: [
    linkCheck("link", "R1 موصول بالسويتش SW1", "r1", "sw1"),
    { id: "trunk", label: "SW1: المنفذ g0/1 في وضع Trunk", weight: 1, kind: "switch.portMode", deviceId: "sw1", interface: "g0/1", value: "trunk" },
    { id: "a1", label: "SW1: المنفذ f0/1 في VLAN 10", weight: 1, kind: "switch.accessVlan", deviceId: "sw1", interface: "f0/1", value: 10 },
    { id: "a2", label: "SW1: المنفذ f0/2 في VLAN 20", weight: 1, kind: "switch.accessVlan", deviceId: "sw1", interface: "f0/2", value: 20 },
    { id: "s10", label: "R1: الواجهة g0/0.10 لـ VLAN 10", weight: 1, kind: "router.subinterfaceVlan", deviceId: "r1", interface: "g0/0.10", value: 10 },
    { id: "s20", label: "R1: الواجهة g0/0.20 لـ VLAN 20", weight: 1, kind: "router.subinterfaceVlan", deviceId: "r1", interface: "g0/0.20", value: 20 },
    reach("far", "PC1 (VLAN 10) يصل إلى PC2 (VLAN 20)", "pc1", "pc2"),
  ],
  hints: [
    "على SW1: interface g0/1 ثم switchport mode trunk.",
    "على R1: interface g0/0 ثم no shutdown ثم exit. ثم interface g0/0.10 ثم encapsulation dot1Q 10 ثم ip address 192.168.10.1 255.255.255.0 ثم exit (وكذلك g0/0.20).",
    "كل حاسوب بوابته عنوان الواجهة الفرعية لـ VLAN الخاصة به.",
  ],
  explanation: "في Router on a Stick يمرّ كابل واحد Trunk بين السويتش والراوتر ويحمل كل الـ VLANs. في الراوتر واجهة فرعية لكل VLAN (encapsulation dot1Q)، وعنوانها هو بوابة أجهزة تلك الـ VLAN.",
  solution: {
    config: net([dev("r1", "router", 0.5, 0.1), dev("sw1", "switch", 0.5, 0.42), dev("pc1", "pc", 0.25, 0.88), dev("pc2", "pc", 0.75, 0.88)],
      [cable(1, "r1", "g0/0", "sw1", "g0/1"), cable(2, "sw1", "f0/1", "pc1", "eth0"), cable(3, "sw1", "f0/2", "pc2", "eth0")]),
    actions: [
      ...cli("switch.command", "sw1", ["enable", "configure terminal", "vlan 10", "exit", "vlan 20", "exit",
        "interface f0/1", "switchport mode access", "switchport access vlan 10", "exit",
        "interface f0/2", "switchport mode access", "switchport access vlan 20", "exit",
        "interface g0/1", "switchport mode trunk", "end"]),
      ...cli("router.command", "r1", ["enable", "configure terminal", "interface g0/0", "no shutdown", "exit",
        "interface g0/0.10", "encapsulation dot1Q 10", "ip address 192.168.10.1 255.255.255.0", "exit",
        "interface g0/0.20", "encapsulation dot1Q 20", "ip address 192.168.20.1 255.255.255.0", "end"]),
      ip("pc1", "192.168.10.10", "192.168.10.1"), ip("pc2", "192.168.20.10", "192.168.20.1"),
    ],
  },
});

const DHCP = build({
  id: "m29-l03-p01-build-dhcp", title: "ابنِ الشبكة: الراوتر يوزّع العناوين (DHCP)",
  description: "ابنِ شبكة يأخذ فيها كل حاسوب عنوانه من الراوتر تلقائيًا، ثم اضغط «تحقّق من شبكتي».",
  fallback: "R1 g0/0 = 192.168.1.1 إلى SW1، no shutdown؛ ip dhcp pool LAN: network 192.168.1.0 255.255.255.0، default-router 192.168.1.1؛ ثلاثة حواسيب على SW1 في وضع DHCP.",
  intro: "ابنِ شبكة يوزّع فيها الراوتر العناوين تلقائيًا: R1 وSW1 وثلاثة حواسيب. صِل g0/0 في R1 بـ SW1، والحواسيب بالسويتش. أعطِ g0/0 العنوان 192.168.1.1 (القناع 255.255.255.0) وشغّله. أنشئ في R1 مجموعة التوزيع ip dhcp pool LAN بالشبكة 192.168.1.0 255.255.255.0 والبوابة default-router 192.168.1.1. اجعل كل حاسوب يأخذ عنوانه بـ DHCP.",
  kinds: ["router", "switch", "pc"],
  checks: [
    { id: "pcs", label: "في الشبكة ثلاثة حواسيب على الأقل", kind: "build.count", deviceKind: "pc", min: 3 },
    { id: "pool", label: "مجموعة التوزيع ip dhcp pool LAN موجودة في R1", weight: 1, kind: "router.dhcpPool", deviceId: "r1", pool: "LAN", value: true },
    { id: "net", label: "المجموعة LAN توزّع من الشبكة 192.168.1.0/24", weight: 1, kind: "router.dhcpNetwork", deviceId: "r1", pool: "LAN", value: "192.168.1.0 255.255.255.0" },
    { id: "gw", label: "المجموعة LAN تعطي البوابة 192.168.1.1", weight: 1, kind: "router.dhcpDefaultRouter", deviceId: "r1", pool: "LAN", value: "192.168.1.1" },
    { id: "d1", label: "PC1 أخذ عنوانه من DHCP", weight: 1, kind: "host.dhcpLease", deviceId: "pc1", adapter: "eth0", value: true },
    { id: "d2", label: "PC2 أخذ عنوانه من DHCP", weight: 1, kind: "host.dhcpLease", deviceId: "pc2", adapter: "eth0", value: true },
    { id: "d3", label: "PC3 أخذ عنوانه من DHCP", weight: 1, kind: "host.dhcpLease", deviceId: "pc3", adapter: "eth0", value: true },
    reach("ping", "PC1 يصل إلى PC3", "pc1", "pc3"),
  ],
  hints: [
    "على R1: interface g0/0 ثم ip address 192.168.1.1 255.255.255.0 ثم no shutdown ثم exit.",
    "ثم: ip dhcp pool LAN ثم network 192.168.1.0 255.255.255.0 ثم default-router 192.168.1.1 ثم exit.",
    "في كل حاسوب: IP Configuration ← اختر DHCP بدل Static.",
  ],
  explanation: "DHCP يوزّع العنوان والقناع والبوابة على الأجهزة تلقائيًا، بلا إدخال يدوي. هنا الراوتر نفسه هو خادم DHCP، والبوابة التي يوزّعها هي عنوان منفذه.",
  solution: {
    config: net([dev("r1", "router", 0.5, 0.1), dev("sw1", "switch", 0.5, 0.42), dev("pc1", "pc", 0.2, 0.88), dev("pc2", "pc", 0.5, 0.88), dev("pc3", "pc", 0.8, 0.88)],
      [cable(1, "r1", "g0/0", "sw1", "g0/1"), cable(2, "sw1", "f0/1", "pc1", "eth0"), cable(3, "sw1", "f0/2", "pc2", "eth0"), cable(4, "sw1", "f0/3", "pc3", "eth0")]),
    actions: [
      ...cli("router.command", "r1", ["enable", "configure terminal", "interface g0/0", "ip address 192.168.1.1 255.255.255.0", "no shutdown", "exit",
        "ip dhcp pool LAN", "network 192.168.1.0 255.255.255.0", "default-router 192.168.1.1", "end"]),
      ...["pc1", "pc2", "pc3"].map(deviceId => ({ type: "host.setMode", deviceId, adapter: "eth0", mode: "dhcp" })),
    ],
  },
});

const WIFI = build({
  id: "m29-l03-p02-build-wifi", title: "ابنِ الشبكة: شبكة لاسلكية محميّة",
  description: "ابنِ شبكة فيها نقطة وصول لاسلكية محميّة بـ WPA2 ولابتوب متصل بها، ثم اضغط «تحقّق من شبكتي».",
  fallback: "AP1 وPC1 موصولان بـ SW1؛ AP1: SSID = SCHOOL، WPA2، كلمة المرور Net12345؛ LAP1 يتصل لاسلكيًا بـ SCHOOL؛ PC1 = 192.168.1.10، LAP1 = 192.168.1.20.",
  intro: "ابنِ شبكة فيها نقطة وصول لاسلكية: نقطة وصول AP1 وسويتش SW1 وحاسوب PC1 ولابتوب LAP1. صِل AP1 وPC1 بالسويتش بكابل. على AP1 اجعل اسم الشبكة SSID = SCHOOL، والأمان WPA2، وكلمة المرور Net12345. ثم صِل LAP1 لاسلكيًا بالشبكة SCHOOL. العناوين: PC1 = 192.168.1.10 وLAP1 = 192.168.1.20 (القناع 255.255.255.0).",
  kinds: ["ap", "switch", "pc", "laptop"],
  checks: [
    { id: "ap", label: "في الشبكة نقطة وصول AP1", kind: "build.device", deviceId: "ap1", deviceKind: "ap" },
    linkCheck("link", "AP1 موصولة بالسويتش SW1", "ap1", "sw1"),
    { id: "ssid", label: "اسم الشبكة اللاسلكية SSID هو SCHOOL", weight: 1, kind: "ap.ssid", deviceId: "ap1", value: "SCHOOL" },
    { id: "sec", label: "الشبكة اللاسلكية محميّة بـ WPA2", weight: 1, kind: "ap.security", deviceId: "ap1", value: "wpa2" },
    { id: "join", label: "LAP1 متصل لاسلكيًا", weight: 1, kind: "host.wifiAssociated", deviceId: "lap1", value: true },
    reach("ping", "LAP1 يصل إلى PC1", "lap1", "pc1"),
  ],
  hints: [
    "اختر AP1 وغيّر الإعدادات: SSID = SCHOOL، Security = WPA2، Passphrase = Net12345.",
    "اختر LAP1 ← Wi-Fi ← اختر SCHOOL واكتب كلمة المرور Net12345 ← اتصال.",
    "لا تنسَ عنوان LAP1 على محوّل Wi-Fi (wlan0): 192.168.1.20.",
  ],
  explanation: "نقطة الوصول تصل الأجهزة اللاسلكية بالشبكة السلكية. SSID هو اسم الشبكة، وWPA2 يحميها بكلمة مرور: بدونها لا يستطيع جهاز غريب أن يتصل.",
  solution: {
    config: net([dev("sw1", "switch", 0.5, 0.42), dev("ap1", "ap", 0.25, 0.62), dev("pc1", "pc", 0.75, 0.88), dev("lap1", "laptop", 0.2, 0.94)],
      [cable(1, "sw1", "f0/1", "ap1", "eth0"), cable(2, "sw1", "f0/2", "pc1", "eth0")]),
    actions: [
      { type: "ap.set", deviceId: "ap1", field: "ssid", value: "SCHOOL" },
      { type: "ap.set", deviceId: "ap1", field: "passphrase", value: "Net12345" },
      { type: "ap.set", deviceId: "ap1", field: "security", value: "wpa2" },
      ip("pc1", "192.168.1.10"), ip("lap1", "192.168.1.20", "", "", "wlan0"),
      { type: "host.wifiConnect", deviceId: "lap1", ssid: "SCHOOL", passphrase: "Net12345" },
    ],
  },
});

const WEB = build({
  id: "m29-l03-p03-build-web", title: "ابنِ الشبكة: خادم ويب واسم موقع (HTTP و DNS)",
  description: "ابنِ شبكة فيها خادم ويب وخادم أسماء، وافتح الموقع باسمه من الحاسوب، ثم اضغط «تحقّق من شبكتي».",
  fallback: "SW1 وPC1 وSRV1؛ SRV1 = 192.168.1.100 مع HTTP وDNS (www.school.local ← 192.168.1.100)؛ PC1 = 192.168.1.10 وDNS Server = 192.168.1.100؛ المتصفح: http://www.school.local.",
  intro: "ابنِ شبكة فيها خادم: سويتش SW1 وحاسوب PC1 وخادم SRV1. صِل الحاسوب والخادم بالسويتش. العناوين: SRV1 = 192.168.1.100، وPC1 = 192.168.1.10 وخادم DNS في PC1 هو 192.168.1.100 (القناع 255.255.255.0). على SRV1 شغّل خدمة HTTP، وشغّل خدمة DNS وأضف السجل: الاسم www.school.local ← العنوان 192.168.1.100. ثم افتح في متصفح PC1 العنوان http://www.school.local.",
  kinds: ["switch", "pc", "server"],
  checks: [
    { id: "srv", label: "في الشبكة خادم SRV1", kind: "build.device", deviceId: "srv1", deviceKind: "server" },
    linkCheck("link", "SRV1 موصول بالسويتش SW1", "srv1", "sw1"),
    { id: "dns", label: "خادم DNS في PC1 هو 192.168.1.100", weight: 1, kind: "host.dns", deviceId: "pc1", adapter: "eth0", value: "192.168.1.100" },
    reach("ping", "PC1 يصل إلى SRV1", "pc1", "srv1"),
    { id: "web", label: "المتصفح في PC1 يفتح http://www.school.local", weight: 1, kind: "browse", source: "pc1", url: "http://www.school.local", value: true },
  ],
  hints: [
    "اختر SRV1 ← IP Configuration: 192.168.1.100 والقناع 255.255.255.0.",
    "في PC1 اكتب في DNS Server العنوان 192.168.1.100 (عنوان الخادم).",
    "في خدمات SRV1: HTTP ← On. DNS ← On، ثم أضف السجل www.school.local والعنوان 192.168.1.100.",
  ],
  explanation: "DNS يحوّل اسم الموقع (www.school.local) إلى عنوان IP، وHTTP يرسل صفحة الموقع. الحاسوب يسأل خادم DNS المكتوب في إعداداته، ثم يطلب الصفحة من العنوان الذي حصل عليه.",
  solution: {
    config: net([dev("sw1", "switch", 0.5, 0.42), dev("srv1", "server", 0.25, 0.78), dev("pc1", "pc", 0.75, 0.88)],
      [cable(1, "sw1", "f0/1", "srv1", "eth0"), cable(2, "sw1", "f0/2", "pc1", "eth0")]),
    actions: [
      ip("srv1", "192.168.1.100"), ip("pc1", "192.168.1.10", "", "192.168.1.100"),
      { type: "server.setHttp", deviceId: "srv1", enabled: true, title: "School", body: "Welcome" },
      { type: "server.setDns", deviceId: "srv1", enabled: true, records: [{ name: "www.school.local", address: "192.168.1.100" }] },
    ],
  },
});

const page = (id: string, title: string, order: number, pdf: number, keywords: string[], blocks: ContentBlock[]) => ({ id, title, order, source: src(pdf), keywords, blocks });

const m29: ContentModule = {
  id: "791381-m29",
  title: "ابنِ الشبكة",
  shortTitle: "ابنِ الشبكة",
  order: 29,
  source: { kind: "book", sourceId: CID, pdfPageStart: 7, sourceNote: "وحدة تمارين «ابنِ الشبكة» (ليست قسمًا من الكتاب): كل تمرين على موضوع إحدى وحدات الكتاب، والمصدر في كل صفحة هو صفحة ذلك الموضوع." },
  lessons: [
    {
      id: "791381-m29-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        page("791381-m29-l00-p01", "ابنِ الشبكة بنفسك", 1, 7, ["ابنِ الشبكة", "مختبر الشبكات", "تمارين"], [
          { id: "m29-l00-p01-opener", type: "unit-opener", origin: "teacher-enrichment", unitLabel: "وحدة تمارين", unitNumber: "29", title: "ابنِ الشبكة", subtitle: "من الشبكة الفارغة إلى شبكة تعمل", goal: "الهدف: تبني الشبكة بيدك وتبرمجها، ثم يفحصها الخادم هدفًا هدفًا." },
          { id: "m29-l00-p01-text", type: "text", origin: "teacher-enrichment", spans: [T("في كل تمرين تبدأ بشبكة فارغة. تضيف الأجهزة، وتصلها بالكوابل، وتبرمجها كما في Packet Tracer. عندما تنتهي، اضغط «تحقّق من شبكتي»: الخادم يفحص شبكتك ويعلّم كل هدف بـ ✓ أو ✕.")] },
          {
            id: "m29-l00-p01-steps", type: "list", origin: "teacher-enrichment", variant: "plain",
            items: [
              { id: "s1", text: [T("1. أضف الأجهزة بالأزرار: "), L("+ راوتر"), T(" "), L("+ سويتش"), T(" "), L("+ حاسوب"), T(" …")] },
              { id: "s2", text: [T("2. صِل كابلًا في «توصيل كابل»: اختر الجهاز والمنفذ من الجهتين ثم «صِل».")] },
              { id: "s3", text: [T("3. اختر جهازًا لبرمجته: سطر الأوامر للراوتر والسويتش، وIP Configuration للحاسوب.")] },
              { id: "s4", text: [T("4. جرّب بنفسك "), L("ping"), T(" من Command Prompt، ثم اضغط «تحقّق من شبكتي».")] },
            ],
          },
          { id: "m29-l00-p01-note", type: "callout", origin: "teacher-enrichment", kind: "remember", title: "تذكّر", spans: [T("أسماء الأجهزة في الأهداف (PC1، SW1، R1…) هي الأسماء التي يعطيها المختبر بالترتيب. إذا حذفت جهازًا وأضفته من جديد قد يأخذ رقمًا آخر — عندها اضغط «ابدأ من جديد». شبكتك تُحفظ تلقائيًا في هذا المتصفح.")] },
        ]),
      ],
    },
    {
      id: "791381-m29-l01",
      title: "الشبكة المحلية و VLAN",
      order: 1,
      pages: [
        page("791381-m29-l01-p01", "شبكة محلية بسويتش", 1, 48, ["Switch", "LAN", "ping", "IP"], [
          howTo("m29-l01-p01-how", ["الحواسيب في نفس الشبكة تحتاج عناوين من نفس الشبكة ونفس القناع.", "السويتش لا يحتاج برمجة ليعمل."]),
          LAN,
        ]),
        page("791381-m29-l01-p02", "قسمان على سويتش واحد (VLAN)", 2, 121, ["VLAN", "switchport access vlan", "Switch"], [
          howTo("m29-l01-p02-how", ["كل VLAN مثل سويتش منفصل.", "المنفذ الذي يتصل بحاسوب يكون access، ونضعه في VLAN واحدة."]),
          VLAN,
        ]),
      ],
    },
    {
      id: "791381-m29-l02",
      title: "التوجيه بين الشبكات",
      order: 2,
      pages: [
        page("791381-m29-l02-p01", "راوتر يصل شبكتين", 1, 52, ["Router", "Default Gateway", "ip address", "no shutdown"], [
          howTo("m29-l02-p01-how", ["منافذ الراوتر مطفأة في البداية: شغّلها بـ no shutdown.", "كل شبكة لها منفذ في الراوتر، وعنوانه هو بوابة أجهزتها."]),
          ROUTED,
        ]),
        page("791381-m29-l02-p02", "Router on a Stick", 2, 146, ["Router on a Stick", "Trunk", "dot1Q", "Subinterface"], [
          howTo("m29-l02-p02-how", ["كابل واحد Trunk يحمل كل الـ VLANs بين السويتش والراوتر.", "لكل VLAN واجهة فرعية في الراوتر."]),
          ROAS,
        ]),
      ],
    },
    {
      id: "791381-m29-l03",
      title: "خدمات الشبكة",
      order: 3,
      pages: [
        page("791381-m29-l03-p01", "الراوتر يوزّع العناوين (DHCP)", 1, 170, ["DHCP", "ip dhcp pool", "default-router"], [
          howTo("m29-l03-p01-how", ["خادم DHCP يعطي كل جهاز عنوانه تلقائيًا.", "اختر DHCP في الحاسوب بعد أن تبرمج الراوتر."]),
          DHCP,
        ]),
        page("791381-m29-l03-p02", "شبكة لاسلكية محميّة", 2, 159, ["Wi-Fi", "Access Point", "SSID", "WPA2"], [
          howTo("m29-l03-p02-how", ["نقطة الوصول تُوصل بالسويتش بكابل.", "اللابتوب يتصل بها لاسلكيًا باسم الشبكة وكلمة المرور."]),
          WIFI,
        ]),
        page("791381-m29-l03-p03", "خادم ويب واسم موقع (HTTP و DNS)", 3, 87, ["HTTP", "DNS", "Server", "Browser"], [
          howTo("m29-l03-p03-how", ["DNS يحوّل الاسم إلى عنوان.", "HTTP يرسل صفحة الموقع إلى المتصفح."]),
          WEB,
        ]),
      ],
    },
  ],
};

export default m29;
