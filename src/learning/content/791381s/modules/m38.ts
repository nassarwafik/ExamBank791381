// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), module 38 «ابنِ الشبكة: التوجيه والأمان»: a PRACTICE module — not a section of
// the printed booklet (owner decisions 2026-11-26, like m37 and book 791381's m30). NEW stable id m38, reading `order` 38: after m37.
//
// Seven BUILD-THE-NETWORK exercises in LAB mode (`simulation` / `network-build` v1 with `task.lab: true`, docs/enterprise-network-build-
// exercises.md §5d), a step beyond 791381's m30: a WAN of THREE routers (static routes with default routes, OSPF and EIGRP across two
// hops), ACLs that filter whole networks (a standard ACL that lets one network in, an extended ACL that denies one network the web), a
// server published with STATIC NAT, and IPv6 static routing between two routers. The SERVER replays the learner's lab network with the
// network lab's own engine and judges it goal by goal (build checks + lab.reach / lab.route / lab.reach6). Checks, feedback and solutions
// never reach the browser.
//
// Every block is origin:"teacher-enrichment" and follows the booklet's rule for added blocks (activities and «توضيح» callouts only); the
// book lock holds no page of this module; `source` points at the booklet page of the topic (sourceNote: an exercise, not a booklet page).
// STUDY STRENGTH: one more study module, 20 points. Each solution is proven by src/learning/lab/networkBuild.contract.test.ts.

import type { ContentBlock, ContentModule, ContentSource } from "../../types";
import { buildExercise, cable, cli, dev, ip, linkCheck, net, T, type Exercise } from "../../networkBuildAuthoring";

const CID = "791381s";
const NOTE = "تمرين «ابنِ الشبكة» على موضوع هذه الصفحة من الكتاب (ليس صفحة من الكتاب).";
const src = (pdf: number): ContentSource => ({ kind: "book", sourceId: CID, pdfPageStart: pdf, sourceNote: NOTE });
const note = (id: string, title: string, text: string): ContentBlock => ({ id, type: "callout", origin: "teacher-enrichment", kind: "clarification", title, spans: [T(text)] } as ContentBlock);
const howTo = (id: string, steps: string[]): ContentBlock => note(id, "كيف أعمل في المختبر؟", steps.join(" "));
const build = (e: Exercise): ContentBlock => {
  const b = buildExercise(e) as ContentBlock & { config: { task: Record<string, unknown> } };
  b.config.task.lab = true;
  return b;
};
const reach = (id: string, label: string, source: string, destination: string, value = true, proto?: "http") =>
  ({ id, label, kind: "lab.reach", source, destination, ...(proto ? { proto } : {}), value });
const route = (id: string, label: string, deviceId: string, network: string, code: "S" | "R" | "O" | "D") => ({ id, label, kind: "lab.route", deviceId, network, code });
const enter = ["enable", "configure terminal"];
const iface = (name: string, address: string, mask: string, extra: string[] = []) => ["interface " + name, "ip address " + address + " " + mask, ...extra, "no shutdown", "exit"];
const M24 = "255.255.255.0", M30 = "255.255.255.252";

// ── A WAN of three routers: PC1 — R1 ═ R2 ═ R3 — PC3 (two serial links) ──────────────────────────────────────────────────────────
const CHAIN_INTRO = "ابنِ ثلاثة راوترات في سلسلة: R1 وR2 وR3، وحاسوبًا على كل طرف. الروابط التسلسلية: R1 s0/0/0 ↔ R2 s0/0/0 (الشبكة 10.0.0.0/30: R1 = 10.0.0.1 وR2 = 10.0.0.2، وclock rate 64000 على R1)، وR2 s0/0/1 ↔ R3 s0/0/0 (الشبكة 10.0.0.4/30: R2 = 10.0.0.5 وR3 = 10.0.0.6، وclock rate 64000 على R2). الشبكات المحلية: PC1 على R1 g0/0 (R1 = 192.168.1.1، PC1 = 192.168.1.10) وPC3 على R3 g0/0 (R3 = 192.168.3.1، PC3 = 192.168.3.10)، القناع 255.255.255.0 وبوابة كل حاسوب هي راوتره. ";
const chainNet = () => net([dev("r1", "router", 0.15, 0.1), dev("r2", "router", 0.5, 0.1), dev("r3", "router", 0.85, 0.1), dev("pc1", "pc", 0.15, 0.88), dev("pc3", "pc", 0.85, 0.88)],
  [cable(1, "r1", "s0/0/0", "r2", "s0/0/0"), cable(2, "r2", "s0/0/1", "r3", "s0/0/0"), cable(3, "r1", "g0/0", "pc1", "eth0"), cable(4, "r3", "g0/0", "pc3", "eth0")]);
const chainBase = (r1: string[], r2: string[], r3: string[]) => [
  ...cli("router.command", "r1", [...enter, ...iface("g0/0", "192.168.1.1", M24), ...iface("s0/0/0", "10.0.0.1", M30, ["clock rate 64000"]), ...r1, "end"]),
  ...cli("router.command", "r2", [...enter, ...iface("s0/0/0", "10.0.0.2", M30), ...iface("s0/0/1", "10.0.0.5", M30, ["clock rate 64000"]), ...r2, "end"]),
  ...cli("router.command", "r3", [...enter, ...iface("g0/0", "192.168.3.1", M24), ...iface("s0/0/0", "10.0.0.6", M30), ...r3, "end"]),
  { type: "host.setStatic", deviceId: "pc1", adapter: "eth0", address: "192.168.1.10", mask: M24, gateway: "192.168.1.1", dns: "" },
  { type: "host.setStatic", deviceId: "pc3", adapter: "eth0", address: "192.168.3.10", mask: M24, gateway: "192.168.3.1", dns: "" },
];
const CHAIN_HINTS = [
  "رتّب العمل: العناوين على كل المنافذ أولًا (مع no shutdown)، ثم التوجيه.",
  "الراوتر الأوسط R2 يجب أن يعرف الشبكتين البعيدتين على الطرفين، وكل طرف يجب أن يعرف طريق العودة.",
];

const STATIC3 = build({
  id: "m38-l01-p01-build-static3", title: "ابنِ الشبكة: ثلاثة راوترات — توجيه ثابت ومسار افتراضي",
  description: "ابنِ WAN من ثلاثة راوترات، واجعل الطرفين يستعملان مسارًا افتراضيًا والوسط مسارات محددة، ثم اضغط «تحقّق من شبكتي».",
  fallback: "R1: ip route 0.0.0.0 0.0.0.0 10.0.0.2 · R3: ip route 0.0.0.0 0.0.0.0 10.0.0.5 · R2: ip route 192.168.1.0 255.255.255.0 10.0.0.1 و ip route 192.168.3.0 255.255.255.0 10.0.0.6.",
  intro: CHAIN_INTRO + "التوجيه: للراوترين على الطرفين طريق واحد فقط إلى الخارج، فأعطِ كلًّا منهما مسارًا افتراضيًا (0.0.0.0 0.0.0.0) نحو R2. أما R2 في الوسط فيحتاج مسارًا ثابتًا محددًا إلى كل شبكة محلية.",
  kinds: ["router", "pc"],
  checks: [
    linkCheck("l12", "R1 موصول بـ R2", "r1", "r2"),
    linkCheck("l23", "R2 موصول بـ R3", "r2", "r3"),
    route("d1", "R1 فيه مسار افتراضي ثابت 0.0.0.0/0", "r1", "0.0.0.0/0", "S"),
    route("d3", "R3 فيه مسار افتراضي ثابت 0.0.0.0/0", "r3", "0.0.0.0/0", "S"),
    route("m1", "R2 فيه مسار ثابت إلى 192.168.1.0/24", "r2", "192.168.1.0/24", "S"),
    route("m3", "R2 فيه مسار ثابت إلى 192.168.3.0/24", "r2", "192.168.3.0/24", "S"),
    reach("ping", "PC1 يصل إلى PC3 (192.168.3.10) عبر الراوترات الثلاثة", "pc1", "192.168.3.10"),
  ],
  hints: [...CHAIN_HINTS, "R1: ip route 0.0.0.0 0.0.0.0 10.0.0.2 — R3: ip route 0.0.0.0 0.0.0.0 10.0.0.5.", "R2: ip route 192.168.1.0 255.255.255.0 10.0.0.1 ثم ip route 192.168.3.0 255.255.255.0 10.0.0.6."],
  explanation: "المسار الافتراضي (0.0.0.0/0) يُستعمل لكل وجهة لا يعرفها الراوتر، وهو مناسب لراوتر له مخرج واحد (Stub). الراوتر في الوسط يحتاج مسارات محددة لأنه يوزّع الحركة في اتجاهين.",
  solution: { config: chainNet(), actions: chainBase(["ip route 0.0.0.0 0.0.0.0 10.0.0.2"], ["ip route 192.168.1.0 255.255.255.0 10.0.0.1", "ip route 192.168.3.0 255.255.255.0 10.0.0.6"], ["ip route 0.0.0.0 0.0.0.0 10.0.0.5"]) },
});

const OSPF3 = build({
  id: "m38-l01-p02-build-ospf3", title: "ابنِ الشبكة: ثلاثة راوترات — OSPF",
  description: "ابنِ WAN من ثلاثة راوترات وشغّل عليها OSPF في المنطقة 0، ثم اضغط «تحقّق من شبكتي».",
  fallback: "router ospf 1 على كل راوتر، و network لكل شبكة متصلة بالـ Wildcard: /24 = 0.0.0.255 و /30 = 0.0.0.3، كلها area 0.",
  intro: CHAIN_INTRO + "شغّل OSPF (العملية 1) على الراوترات الثلاثة، وأعلن في المنطقة 0 عن كل شبكة متصلة بكل راوتر. هكذا يتعلّم R1 شبكة R3 البعيدة قفزتين دون أي مسار ثابت.",
  kinds: ["router", "pc"],
  checks: [
    linkCheck("l12", "R1 موصول بـ R2", "r1", "r2"),
    linkCheck("l23", "R2 موصول بـ R3", "r2", "r3"),
    route("far1", "R1 تعلّم 192.168.3.0/24 (على بعد قفزتين) بـ OSPF", "r1", "192.168.3.0/24", "O"),
    route("far3", "R3 تعلّم 192.168.1.0/24 بـ OSPF", "r3", "192.168.1.0/24", "O"),
    route("link", "R1 تعلّم شبكة الرابط 10.0.0.4/30 بـ OSPF", "r1", "10.0.0.4/30", "O"),
    reach("ping", "PC1 يصل إلى PC3", "pc1", "192.168.3.10"),
  ],
  hints: [...CHAIN_HINTS, "R2 يعلن عن الرابطين: network 10.0.0.0 0.0.0.3 area 0 وnetwork 10.0.0.4 0.0.0.3 area 0.", "جرّب show ip ospf neighbor على R2: يجب أن يكون له جاران."],
  explanation: "في OSPF يعرف كل راوتر خريطة المنطقة كلها، فيحسب الطريق إلى شبكة على بعد قفزتين وحده. المهم أن يعلن كل راوتر عن كل شبكاته في المنطقة نفسها.",
  solution: { config: chainNet(), actions: chainBase(
    ["router ospf 1", "network 192.168.1.0 0.0.0.255 area 0", "network 10.0.0.0 0.0.0.3 area 0", "exit"],
    ["router ospf 1", "network 10.0.0.0 0.0.0.3 area 0", "network 10.0.0.4 0.0.0.3 area 0", "exit"],
    ["router ospf 1", "network 192.168.3.0 0.0.0.255 area 0", "network 10.0.0.4 0.0.0.3 area 0", "exit"]) },
});

const EIGRP3 = build({
  id: "m38-l01-p03-build-eigrp3", title: "ابنِ الشبكة: ثلاثة راوترات — EIGRP",
  description: "ابنِ WAN من ثلاثة راوترات وشغّل عليها EIGRP بالرقم 20، ثم اضغط «تحقّق من شبكتي».",
  fallback: "router eigrp 20 على كل راوتر، و network لكل شبكة متصلة (R1: 192.168.1.0 و10.0.0.0، R2: 10.0.0.0، R3: 192.168.3.0 و10.0.0.0).",
  intro: CHAIN_INTRO + "شغّل EIGRP بالرقم (AS) 20 على الراوترات الثلاثة، وأعلن عن الشبكات المتصلة بكل راوتر. الرقم يجب أن يكون نفسه على الثلاثة.",
  kinds: ["router", "pc"],
  checks: [
    linkCheck("l12", "R1 موصول بـ R2", "r1", "r2"),
    linkCheck("l23", "R2 موصول بـ R3", "r2", "r3"),
    route("far1", "R1 تعلّم 192.168.3.0/24 بـ EIGRP", "r1", "192.168.3.0/24", "D"),
    route("far3", "R3 تعلّم 192.168.1.0/24 بـ EIGRP", "r3", "192.168.1.0/24", "D"),
    reach("ping", "PC1 يصل إلى PC3", "pc1", "192.168.3.10"),
  ],
  hints: [...CHAIN_HINTS, "على كل راوتر: router eigrp 20 ثم network 10.0.0.0 — وعلى الطرفين أيضًا network للشبكة المحلية.", "جرّب show ip eigrp neighbors."],
  explanation: "EIGRP يبني جيرة بين الراوترات التي تحمل رقم AS نفسه، ويتبادل معها المسارات. إذا اختلف الرقم على راوتر واحد انقطعت السلسلة عنده.",
  solution: { config: chainNet(), actions: chainBase(["router eigrp 20", "network 192.168.1.0", "network 10.0.0.0", "exit"], ["router eigrp 20", "network 10.0.0.0", "exit"], ["router eigrp 20", "network 192.168.3.0", "network 10.0.0.0", "exit"]) },
});

// ── ACLs on one router with three networks: LAN A (PC1), LAN B (PC2) and the servers (SRV1) ──────────────────────────────────────
const ACL_INTRO = "ابنِ راوترًا R1 بثلاث شبكات: الإدارة على g0/0 (R1 = 192.168.1.1، PC1 = 192.168.1.10)، والطلاب على g0/1 (R1 = 192.168.2.1، PC2 = 192.168.2.10)، والخوادم على g0/2 (R1 = 192.168.3.1، SRV1 = 192.168.3.100). صِل كل جهاز بمنفذه مباشرة. القناع 255.255.255.0 للجميع، وبوابة كل جهاز هي عنوان R1 في شبكته. شغّل HTTP على SRV1. ";
const aclNet = () => net([dev("r1", "router", 0.5, 0.1), dev("pc1", "pc", 0.15, 0.88), dev("pc2", "pc", 0.5, 0.88), dev("srv1", "server", 0.85, 0.78)],
  [cable(1, "r1", "g0/0", "pc1", "eth0"), cable(2, "r1", "g0/1", "pc2", "eth0"), cable(3, "r1", "g0/2", "srv1", "eth0")]);
const aclBase = (r1: string[]) => [
  ...cli("router.command", "r1", [...enter, ...iface("g0/0", "192.168.1.1", M24), ...iface("g0/1", "192.168.2.1", M24), ...iface("g0/2", "192.168.3.1", M24), ...r1, "end"]),
  ip("pc1", "192.168.1.10", "192.168.1.1"), ip("pc2", "192.168.2.10", "192.168.2.1"), ip("srv1", "192.168.3.100", "192.168.3.1"),
  { type: "server.setHttp", deviceId: "srv1", enabled: true, title: "Servers", body: "Welcome" },
];

const ACL_ONLY = build({
  id: "m38-l02-p01-build-acl-one-network", title: "ابنِ الشبكة: Standard ACL — شبكة واحدة فقط إلى الخوادم",
  description: "اسمح لشبكة الإدارة وحدها بالوصول إلى شبكة الخوادم، ثم اضغط «تحقّق من شبكتي».",
  fallback: "access-list 10 permit 192.168.1.0 0.0.0.255 · interface g0/2 · ip access-group 10 out (الـ deny الضمني يمنع الباقي).",
  intro: ACL_INTRO + "المطلوب: شبكة الإدارة (192.168.1.0/24) وحدها تصل إلى الخوادم، وشبكة الطلاب ممنوعة منها — لكن الطلاب ما زالوا يصلون إلى شبكة الإدارة. اكتب Standard ACL رقم 10 فيها سطر permit واحد بالـ Wildcard، وطبّقها على المنفذ المتجه إلى الخوادم.",
  kinds: ["router", "pc", "server"],
  checks: [
    linkCheck("srv", "SRV1 موصول بالراوتر R1", "r1", "srv1"),
    reach("admin", "PC1 (الإدارة) يصل إلى الخادم", "pc1", "192.168.3.100"),
    reach("students", "PC2 (الطلاب) لا يصل إلى الخادم", "pc2", "192.168.3.100", false),
    reach("other", "PC2 ما زال يصل إلى PC1 (192.168.1.10)", "pc2", "192.168.1.10"),
  ],
  hints: [
    "سطر واحد يكفي: access-list 10 permit 192.168.1.0 0.0.0.255 — وكل ما سواه يمنعه الـ deny الضمني.",
    "طبّقها قريبًا من الهدف: interface g0/2 ثم ip access-group 10 out.",
    "لو وضعتها على g0/1 للداخل لمنعت الطلاب من كل شيء، حتى من شبكة الإدارة.",
  ],
  explanation: "الـ Wildcard 0.0.0.255 يطابق كل عناوين الشبكة 192.168.1.0/24. وفي نهاية كل ACL منع ضمني، فقائمة فيها permit واحد تسمح بهذه الشبكة فقط. موضعها قريب من الهدف كي لا تمنع حركة أخرى.",
  solution: { config: aclNet(), actions: aclBase(["access-list 10 permit 192.168.1.0 0.0.0.255", "interface g0/2", "ip access-group 10 out", "exit"]) },
});

const ACL_WEB = build({
  id: "m38-l02-p02-build-acl-no-web", title: "ابنِ الشبكة: Extended ACL — بلا ويب للطلاب",
  description: "امنع شبكة الطلاب من موقع الخادم فقط (HTTP) واترك لها الباقي، ثم اضغط «تحقّق من شبكتي».",
  fallback: "access-list 110 deny tcp 192.168.2.0 0.0.0.255 host 192.168.3.100 eq 80 · access-list 110 permit ip any any · interface g0/1 · ip access-group 110 in.",
  intro: ACL_INTRO + "المطلوب: الطلاب لا يفتحون موقع الخادم (HTTP، المنفذ 80) لكنهم يستطيعون عمل ping له، والإدارة تفتح الموقع. اكتب Extended ACL رقم 110 وطبّقها قريبًا من المصدر (منفذ الطلاب g0/1 للداخل).",
  kinds: ["router", "pc", "server"],
  checks: [
    linkCheck("srv", "SRV1 موصول بالراوتر R1", "r1", "srv1"),
    reach("noweb", "PC2 (الطلاب) لا يفتح موقع الخادم", "pc2", "192.168.3.100", false, "http"),
    reach("ping", "PC2 ما زال يصل إلى الخادم بـ ping", "pc2", "192.168.3.100"),
    reach("admin", "PC1 (الإدارة) يفتح موقع الخادم", "pc1", "192.168.3.100", true, "http"),
  ],
  hints: [
    "access-list 110 deny tcp 192.168.2.0 0.0.0.255 host 192.168.3.100 eq 80 ثم access-list 110 permit ip any any.",
    "قريبًا من المصدر: interface g0/1 ثم ip access-group 110 in.",
    "eq 80 تعني المنفذ 80 (HTTP) فقط؛ ping (icmp) لا يطابق هذا السطر.",
  ],
  explanation: "Extended ACL تحدد البروتوكول والمنفذ أيضًا: deny tcp … eq 80 يمنع الويب فقط ويترك icmp وغيره. ونضعها قريبًا من المصدر كي لا تعبر الرزم الممنوعة الشبكة بلا فائدة.",
  solution: { config: aclNet(), actions: aclBase(["access-list 110 deny tcp 192.168.2.0 0.0.0.255 host 192.168.3.100 eq 80", "access-list 110 permit ip any any", "interface g0/1", "ip access-group 110 in", "exit"]) },
});

const STATIC_NAT = build({
  id: "m38-l03-p01-build-static-nat", title: "ابنِ الشبكة: Static NAT — نشر خادم للإنترنت",
  description: "انشر خادمًا داخليًا بعنوان عام ثابت كي يصل إليه جهاز من «الإنترنت»، ثم اضغط «تحقّق من شبكتي».",
  fallback: "R1: ip nat inside source static 192.168.1.100 203.0.113.10 · g0/0 ip nat inside · s0/0/0 ip nat outside · ip route 0.0.0.0 0.0.0.0 200.0.0.2؛ R2: ip route 203.0.113.0 255.255.255.0 200.0.0.1؛ الجهاز الخارجي يصل إلى 203.0.113.10.",
  intro: "R1 راوتر المدرسة وR2 راوتر مزوّد الإنترنت. ابنِ: خادم المدرسة SRV1 على R1 g0/0 (R1 = 192.168.1.1، SRV1 = 192.168.1.100 وبوابته 192.168.1.1)؛ رابط تسلسلي R1 s0/0/0 ↔ R2 s0/0/0 (R1 = 200.0.0.1 وR2 = 200.0.0.2، القناع 255.255.255.252، وclock rate 64000 على R1)؛ وحاسوب «في الإنترنت» PC1 على R2 g0/0 (R2 = 8.8.8.1، PC1 = 8.8.8.10 وبوابته 8.8.8.1، القناع 255.255.255.0). المزوّد أعطى المدرسة الكتلة العامة 203.0.113.0/24: على R2 أضف مسارًا إليها عبر 200.0.0.1، وعلى R1 مسارًا افتراضيًا إلى 200.0.0.2. العنوان الخاص للخادم لا يمرّ في الإنترنت: انشره بالعنوان العام الثابت 203.0.113.10 (Static NAT) على R1، وحدّد جهة inside وجهة outside.",
  kinds: ["router", "pc", "server"],
  checks: [
    linkCheck("wan", "R1 موصول بالمزوّد R2", "r1", "r2"),
    reach("public", "PC1 من الإنترنت يصل إلى الخادم بعنوانه العام 203.0.113.10", "pc1", "203.0.113.10"),
    reach("web", "PC1 يفتح موقع الخادم على http://203.0.113.10", "pc1", "203.0.113.10", true, "http"),
    reach("private", "العنوان الخاص 192.168.1.100 لا يُرى من الإنترنت", "pc1", "192.168.1.100", false),
  ],
  hints: [
    "ip nat inside source static 192.168.1.100 203.0.113.10 — العنوان الخاص أولًا ثم العام.",
    "على R2: ip route 203.0.113.0 255.255.255.0 200.0.0.1 — وعلى R1: ip route 0.0.0.0 0.0.0.0 200.0.0.2.",
    "interface g0/0 ثم ip nat inside — وinterface s0/0/0 ثم ip nat outside.",
    "شغّل HTTP على SRV1، ثم جرّب من PC1: ping 203.0.113.10.",
  ],
  explanation: "Static NAT يربط عنوانًا خاصًا بعنوان عام ثابت في الاتجاهين، فيستطيع من في الخارج أن يبدأ الاتصال بالخادم. أما PAT فيسمح بالخروج فقط ولا يفتح الطريق إلى الداخل.",
  solution: {
    config: net([dev("r1", "router", 0.3, 0.1), dev("r2", "router", 0.75, 0.1), dev("srv1", "server", 0.3, 0.78), dev("pc1", "pc", 0.75, 0.88)],
      [cable(1, "r1", "s0/0/0", "r2", "s0/0/0"), cable(2, "r1", "g0/0", "srv1", "eth0"), cable(3, "r2", "g0/0", "pc1", "eth0")]),
    actions: [
      ...cli("router.command", "r1", [...enter, ...iface("g0/0", "192.168.1.1", M24, ["ip nat inside"]), ...iface("s0/0/0", "200.0.0.1", M30, ["clock rate 64000", "ip nat outside"]),
        "ip route 0.0.0.0 0.0.0.0 200.0.0.2", "ip nat inside source static 192.168.1.100 203.0.113.10", "end"]),
      ...cli("router.command", "r2", [...enter, ...iface("g0/0", "8.8.8.1", M24), ...iface("s0/0/0", "200.0.0.2", M30), "ip route 203.0.113.0 255.255.255.0 200.0.0.1", "end"]),
      ip("srv1", "192.168.1.100", "192.168.1.1"), ip("pc1", "8.8.8.10", "8.8.8.1"),
      { type: "server.setHttp", deviceId: "srv1", enabled: true, title: "School", body: "Public site" },
    ],
  },
});

const IPV6_STATIC = build({
  id: "m38-l03-p02-build-ipv6-static", title: "ابنِ الشبكة: IPv6 بين راوترين — توجيه ثابت",
  description: "ابنِ شبكتي IPv6 خلف راوترين، وعلّم كل راوتر الطريق بـ ipv6 route، ثم اضغط «تحقّق من شبكتي».",
  fallback: "R1 و R2: ipv6 unicast-routing؛ الرابط 2001:db8:12::/64؛ R1: ipv6 route 2001:db8:2::/64 2001:db8:12::2 — R2: ipv6 route 2001:db8:1::/64 2001:db8:12::1.",
  intro: "ابنِ راوترين R1 وR2 وحاسوبين. صِل R1 g0/1 بـ R2 g0/1 (الرابط 2001:db8:12::/64: R1 = 2001:db8:12::1 وR2 = 2001:db8:12::2)، وPC1 على R1 g0/0 (الشبكة 2001:db8:1::/64: R1 = 2001:db8:1::1، PC1 = 2001:db8:1::10 وبوابته 2001:db8:1::1)، وPC2 على R2 g0/0 (الشبكة 2001:db8:2::/64: R2 = 2001:db8:2::1، PC2 = 2001:db8:2::10 وبوابته 2001:db8:2::1). شغّل ipv6 unicast-routing على الراوترين، وأضف على كل راوتر مسار IPv6 ثابتًا إلى شبكة الطرف الآخر.",
  kinds: ["router", "pc"],
  checks: [
    linkCheck("link", "R1 موصول بـ R2", "r1", "r2"),
    { id: "go", label: "PC1 يصل إلى PC2 بـ IPv6 (2001:db8:2::10)", kind: "lab.reach6", source: "pc1", destination: "2001:db8:2::10", value: true },
    { id: "back", label: "PC2 يصل إلى PC1 بـ IPv6 (2001:db8:1::10)", kind: "lab.reach6", source: "pc2", destination: "2001:db8:1::10", value: true },
  ],
  hints: [
    "على كل راوتر: ipv6 unicast-routing، ثم ipv6 address على المنفذين مع no shutdown.",
    "R1: ipv6 route 2001:db8:2::/64 2001:db8:12::2 — R2: ipv6 route 2001:db8:1::/64 2001:db8:12::1.",
    "جرّب show ipv6 route على كل راوتر.",
  ],
  explanation: "التوجيه في IPv6 مثل IPv4: كل راوتر يعرف شبكاته المتصلة فقط، والشبكات البعيدة يتعلّمها بمسار ثابت (ipv6 route) أو ببروتوكول توجيه. المسار يكتب البادئة والطول ثم عنوان القفزة التالية.",
  solution: {
    config: net([dev("r1", "router", 0.3, 0.1), dev("r2", "router", 0.7, 0.1), dev("pc1", "pc", 0.3, 0.88), dev("pc2", "pc", 0.7, 0.88)],
      [cable(1, "r1", "g0/1", "r2", "g0/1"), cable(2, "r1", "g0/0", "pc1", "eth0"), cable(3, "r2", "g0/0", "pc2", "eth0")]),
    actions: [
      ...cli("router.command", "r1", [...enter, "ipv6 unicast-routing", "interface g0/0", "ipv6 address 2001:db8:1::1/64", "no shutdown", "exit", "interface g0/1", "ipv6 address 2001:db8:12::1/64", "no shutdown", "exit", "ipv6 route 2001:db8:2::/64 2001:db8:12::2", "end"]),
      ...cli("router.command", "r2", [...enter, "ipv6 unicast-routing", "interface g0/0", "ipv6 address 2001:db8:2::1/64", "no shutdown", "exit", "interface g0/1", "ipv6 address 2001:db8:12::2/64", "no shutdown", "exit", "ipv6 route 2001:db8:1::/64 2001:db8:12::1", "end"]),
      { type: "host.setIpv6", deviceId: "pc1", adapter: "eth0", address: "2001:db8:1::10/64", gateway: "2001:db8:1::1" },
      { type: "host.setIpv6", deviceId: "pc2", adapter: "eth0", address: "2001:db8:2::10/64", gateway: "2001:db8:2::1" },
    ],
  },
});

const page = (id: string, title: string, order: number, pdf: number, blocks: ContentBlock[]) => ({ id, title, order, source: src(pdf), blocks });

const m38: ContentModule = {
  id: "791381s-m38",
  title: "ابنِ الشبكة: التوجيه والأمان",
  order: 38,
  lessons: [
    {
      id: "791381s-m38-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        page("791381s-m38-l00-p01", "ابنِ الشبكة: التوجيه والأمان", 1, 80, [
          note("m38-l00-p01-about", "ابنِ الشبكة: التوجيه والأمان", "سبعة تحديات في المختبر الكامل: WAN من ثلاثة راوترات، وACL تفلتر شبكات كاملة، وStatic NAT، وتوجيه IPv6. الخادم لا يقرأ ما كتبت فقط: يرسل رزمًا حقيقية في شبكتك ويرى إن وصلت أو مُنعت، ويقرأ جدول التوجيه في كل راوتر."),
          note("m38-l00-p01-steps", "كيف أعمل في المختبر؟", "1. أضف الأجهزة وصِلها؛ الكابل التسلسلي من s0/0/0 (أو s0/0/1). 2. برمج الراوترات من سطر الأوامر؛ تحت الطرفية قائمة «أوامر إضافية في المختبر». 3. افحص بنفسك: show ip route وshow access-lists وshow ip nat translations وping وtracert. 4. اضغط «تحقّق من شبكتي»."),
        ]),
      ],
    },
    {
      id: "791381s-m38-l01",
      title: "WAN من ثلاثة راوترات",
      order: 1,
      pages: [
        page("791381s-m38-l01-p01", "ثلاثة راوترات — توجيه ثابت ومسار افتراضي", 1, 82, [howTo("m38-l01-p01-how", ["المسار الافتراضي: ip route 0.0.0.0 0.0.0.0 <القفزة التالية>.", "الراوتر الأوسط يحتاج مسارًا إلى كل طرف."]), STATIC3]),
        page("791381s-m38-l01-p02", "ثلاثة راوترات — OSPF", 2, 84, [howTo("m38-l01-p02-how", ["أعلن عن كل شبكة متصلة في area 0.", "R2 له جاران: جرّب show ip ospf neighbor."]), OSPF3]),
        page("791381s-m38-l01-p03", "ثلاثة راوترات — EIGRP", 3, 87, [howTo("m38-l01-p03-how", ["رقم AS نفسه على الثلاثة.", "الحرف D في show ip route يعني مسارًا من EIGRP."]), EIGRP3]),
      ],
    },
    {
      id: "791381s-m38-l02",
      title: "قوائم التحكم ACL",
      order: 2,
      pages: [
        page("791381s-m38-l02-p01", "Standard ACL — شبكة واحدة فقط إلى الخوادم", 1, 90, [howTo("m38-l02-p01-how", ["الـ Wildcard 0.0.0.255 يطابق شبكة /24 كاملة.", "Standard: قريبًا من الهدف."]), ACL_ONLY]),
        page("791381s-m38-l02-p02", "Extended ACL — بلا ويب للطلاب", 2, 90, [howTo("m38-l02-p02-how", ["eq 80 يحدد الويب فقط.", "Extended: قريبًا من المصدر."]), ACL_WEB]),
      ],
    },
    {
      id: "791381s-m38-l03",
      title: "NAT و IPv6",
      order: 3,
      pages: [
        page("791381s-m38-l03-p01", "Static NAT — نشر خادم للإنترنت", 1, 109, [howTo("m38-l03-p01-how", ["Static NAT: عنوان خاص ↔ عنوان عام ثابت.", "جرّب show ip nat translations."]), STATIC_NAT]),
        page("791381s-m38-l03-p02", "IPv6 بين راوترين — توجيه ثابت", 2, 63, [howTo("m38-l03-p02-how", ["ipv6 unicast-routing على كل راوتر.", "ipv6 route <البادئة/الطول> <القفزة التالية>."]), IPV6_STATIC]),
      ],
    },
  ],
};

export default m38;
