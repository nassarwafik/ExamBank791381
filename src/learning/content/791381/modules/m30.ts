// Learning Materials — «ابنِ الشبكة: التوجيه والأمان» (docs/enterprise-network-build-exercises.md §5c): a PRACTICE module of Book 791381 —
// not a book section (owner decision 2026-11-26). NEW stable id m30, reading `order` 30: after «ابنِ الشبكة» (m29).
//
// Eight BUILD-THE-NETWORK exercises in LAB mode (`simulation` / `network-build` v1 with `task.lab: true`): the learner builds the network
// in the full network lab — serial WAN links, static / RIP / OSPF / EIGRP routing, standard and extended ACLs, NAT / PAT and IPv6 — and
// the SERVER replays it with the lab's own engine (src/studentTools/netLabReplay.ts, shared with the API) and judges it goal by goal with
// build checks and lab checks (lab.reach, lab.route, lab.reach6). Behaviour, not typing: a route must really be in the routing table
// (learned the way the task asks), an ACL must really stop the traffic it should and pass the rest, PAT must really carry the reply home.
//
// Every block is origin:"teacher-enrichment"; `source` points at the book page of the topic (sourceNote: an exercise, not a book page).
// STUDY STRENGTH (owner decision 2026-11-26): one more study module, 20 points. Each solution is proven by
// src/learning/lab/networkBuild.contract.test.ts (the empty network earns no goal; the solution reaches every goal).

import type { ContentBlock, ContentModule, ContentSource } from "../../types";
import { buildExercise, cable, cli, dev, howTo, ip, L, linkCheck, net, T, type Exercise } from "../../networkBuildAuthoring";

const CID = "791381";
const NOTE = "تمرين «ابنِ الشبكة» على موضوع هذه الصفحة من الكتاب (ليس صفحة من الكتاب).";
const src = (pdf: number): ContentSource => ({ kind: "book", sourceId: CID, pdfPageStart: pdf, sourceNote: NOTE });
/** A LAB-mode exercise: the task carries `lab: true` (the builder runs the full lab; the server judges on the lab's replay). */
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

// The WAN of the routing exercises: PC1 — R1 ═serial═ R2 — PC2 (the book's two-network example).
const WAN_INTRO = "ابنِ راوترين R1 وR2 وحاسوبين. صِل PC1 بالمنفذ g0/0 في R1 وPC2 بالمنفذ g0/0 في R2، وصِل الراوترين بكابل تسلسلي من s0/0/0 إلى s0/0/0. العناوين: R1 g0/0 = 192.168.1.1 وR2 g0/0 = 192.168.2.1 (القناع 255.255.255.0)، والرابط التسلسلي: R1 s0/0/0 = 10.0.0.1 وR2 s0/0/0 = 10.0.0.2 (القناع 255.255.255.252)، وعلى R1 أضف clock rate 64000. PC1 = 192.168.1.10 وبوابته 192.168.1.1، PC2 = 192.168.2.10 وبوابته 192.168.2.1. ";
const wanNet = () => net([dev("r1", "router", 0.25, 0.1), dev("r2", "router", 0.75, 0.1), dev("pc1", "pc", 0.25, 0.88), dev("pc2", "pc", 0.75, 0.88)],
  [cable(1, "r1", "s0/0/0", "r2", "s0/0/0"), cable(2, "r1", "g0/0", "pc1", "eth0"), cable(3, "r2", "g0/0", "pc2", "eth0")]);
const wanBase = (r1Extra: string[], r2Extra: string[]) => [
  ...cli("router.command", "r1", [...enter, ...iface("g0/0", "192.168.1.1", "255.255.255.0"), ...iface("s0/0/0", "10.0.0.1", "255.255.255.252", ["clock rate 64000"]), ...r1Extra, "end"]),
  ...cli("router.command", "r2", [...enter, ...iface("g0/0", "192.168.2.1", "255.255.255.0"), ...iface("s0/0/0", "10.0.0.2", "255.255.255.252"), ...r2Extra, "end"]),
  ip("pc1", "192.168.1.10", "192.168.1.1"), ip("pc2", "192.168.2.10", "192.168.2.1"),
];
const wanChecks = (code: "S" | "R" | "O" | "D", how: string) => [
  linkCheck("wan", "R1 وR2 موصولان (الرابط التسلسلي)", "r1", "r2"),
  route("r1", "R1 تعلّم الشبكة 192.168.2.0/24 " + how, "r1", "192.168.2.0/24", code),
  route("r2", "R2 تعلّم الشبكة 192.168.1.0/24 " + how, "r2", "192.168.1.0/24", code),
  reach("ping", "PC1 يصل إلى PC2 (192.168.2.10) عبر الـ WAN", "pc1", "192.168.2.10"),
];
const WAN_HINTS = [
  "الواجهة التسلسلية: interface s0/0/0 ثم ip address 10.0.0.1 255.255.255.252 ثم clock rate 64000 (على R1 فقط) ثم no shutdown.",
  "تأكّد بالأمر show ip route: الحرف في بداية السطر يقول كيف تعلّم الراوتر الشبكة (S ثابت، R ‏RIP، O ‏OSPF، D ‏EIGRP).",
];

const STATIC = build({
  id: "m30-l01-p01-build-static", title: "ابنِ الشبكة: WAN وتوجيه ثابت",
  description: "ابنِ شبكتين يصل بينهما رابط تسلسلي، وعلّم الراوترين الطريق بالتوجيه الثابت، ثم اضغط «تحقّق من شبكتي».",
  fallback: "R1: ip route 192.168.2.0 255.255.255.0 10.0.0.2 · R2: ip route 192.168.1.0 255.255.255.0 10.0.0.1 (بعد عنونة g0/0 وs0/0/0 وclock rate على R1).",
  intro: WAN_INTRO + "الراوتر لا يعرف الشبكة البعيدة وحده: أضف على كل راوتر مسارًا ثابتًا (ip route) إلى شبكة الطرف الآخر عبر عنوان الراوتر المقابل.",
  kinds: ["router", "pc"],
  checks: wanChecks("S", "بمسار ثابت (S)"),
  hints: [...WAN_HINTS, "على R1: ip route 192.168.2.0 255.255.255.0 10.0.0.2 — وعلى R2: ip route 192.168.1.0 255.255.255.0 10.0.0.1."],
  explanation: "التوجيه الثابت: المدير يكتب كل مسار بيده (الشبكة، القناع، والقفزة التالية). مناسب لشبكات صغيرة، لكنه لا يتغيّر وحده إذا تغيّرت الشبكة.",
  solution: { config: wanNet(), actions: wanBase(["ip route 192.168.2.0 255.255.255.0 10.0.0.2"], ["ip route 192.168.1.0 255.255.255.0 10.0.0.1"]) },
});

const RIP = build({
  id: "m30-l01-p02-build-rip", title: "ابنِ الشبكة: التوجيه الديناميكي RIP",
  description: "ابنِ الشبكتين والرابط التسلسلي، ودع الراوترين يتبادلان المسارات بـ RIP الإصدار 2، ثم اضغط «تحقّق من شبكتي».",
  fallback: "على كل راوتر: router rip · version 2 · network للشبكة المحلية · network 10.0.0.0 · no auto-summary.",
  intro: WAN_INTRO + "بدل المسارات الثابتة شغّل RIP الإصدار 2 على الراوترين: أعلن عن الشبكة المحلية لكل راوتر وعن شبكة الرابط 10.0.0.0، وأوقف التلخيص التلقائي.",
  kinds: ["router", "pc"],
  checks: wanChecks("R", "بـ RIP (R)"),
  hints: [...WAN_HINTS, "على R1: router rip ثم version 2 ثم network 192.168.1.0 ثم network 10.0.0.0 ثم no auto-summary — وعلى R2 بالشبكة 192.168.2.0."],
  explanation: "RIP بروتوكول Distance Vector: كل راوتر يرسل جدوله لجيرانه، والمقياس عدد القفزات (حتى 15). الإصدار 2 يرسل القناع مع المسار.",
  solution: { config: wanNet(), actions: wanBase(["router rip", "version 2", "network 192.168.1.0", "network 10.0.0.0", "no auto-summary", "exit"], ["router rip", "version 2", "network 192.168.2.0", "network 10.0.0.0", "no auto-summary", "exit"]) },
});

const OSPF = build({
  id: "m30-l01-p03-build-ospf", title: "ابنِ الشبكة: التوجيه الديناميكي OSPF",
  description: "ابنِ الشبكتين والرابط التسلسلي، وشغّل OSPF في المنطقة 0، ثم اضغط «تحقّق من شبكتي».",
  fallback: "على كل راوتر: router ospf 1 · network <الشبكة المحلية> 0.0.0.255 area 0 · network 10.0.0.0 0.0.0.3 area 0.",
  intro: WAN_INTRO + "شغّل OSPF (رقم العملية 1) على الراوترين، وأعلن في المنطقة 0 عن الشبكة المحلية وعن شبكة الرابط. انتبه: OSPF يكتب Wildcard Mask وليس القناع.",
  kinds: ["router", "pc"],
  checks: wanChecks("O", "بـ OSPF (O)"),
  hints: [...WAN_HINTS, "على R1: router ospf 1 ثم network 192.168.1.0 0.0.0.255 area 0 ثم network 10.0.0.0 0.0.0.3 area 0.", "Wildcard الشبكة /30 هو 0.0.0.3، والشبكة /24 هو 0.0.0.255."],
  explanation: "OSPF بروتوكول Link-State: كل راوتر يعرف خريطة المنطقة كاملة ويحسب أقصر طريق حسب التكلفة (Cost). الجيران يجب أن يكونوا في المنطقة نفسها.",
  solution: { config: wanNet(), actions: wanBase(["router ospf 1", "network 192.168.1.0 0.0.0.255 area 0", "network 10.0.0.0 0.0.0.3 area 0", "exit"], ["router ospf 1", "network 192.168.2.0 0.0.0.255 area 0", "network 10.0.0.0 0.0.0.3 area 0", "exit"]) },
});

const EIGRP = build({
  id: "m30-l01-p04-build-eigrp", title: "ابنِ الشبكة: التوجيه الديناميكي EIGRP",
  description: "ابنِ الشبكتين والرابط التسلسلي، وشغّل EIGRP بالرقم 10 على الراوترين، ثم اضغط «تحقّق من شبكتي».",
  fallback: "على كل راوتر: router eigrp 10 · network <الشبكة المحلية> · network 10.0.0.0.",
  intro: WAN_INTRO + "شغّل EIGRP بالرقم (AS) 10 على الراوترين، وأعلن عن الشبكة المحلية وعن شبكة الرابط. رقم الـ AS يجب أن يكون نفسه على الراوترين.",
  kinds: ["router", "pc"],
  checks: wanChecks("D", "بـ EIGRP (D)"),
  hints: [...WAN_HINTS, "على R1: router eigrp 10 ثم network 192.168.1.0 ثم network 10.0.0.0 — وعلى R2 بالشبكة 192.168.2.0."],
  explanation: "EIGRP بروتوكول من Cisco يجمع مزايا النوعين، ويحسب المقياس من عرض النطاق والتأخير. الراوتران يصبحان جارين فقط إذا كان رقم الـ AS نفسه.",
  solution: { config: wanNet(), actions: wanBase(["router eigrp 10", "network 192.168.1.0", "network 10.0.0.0", "exit"], ["router eigrp 10", "network 192.168.2.0", "network 10.0.0.0", "exit"]) },
});

// The ACL exercises: PC1 and PC2 on SW1 (192.168.1.0/24) — R1 — the server SRV1 (192.168.2.100) on g0/1.
const ACL_INTRO = "ابنِ راوترًا R1 وسويتشًا SW1 وحاسوبين وخادمًا SRV1. صِل g0/0 في R1 بـ SW1، وPC1 وPC2 بـ SW1، وSRV1 بالمنفذ g0/1 في R1. العناوين: R1 g0/0 = 192.168.1.1 وR1 g0/1 = 192.168.2.1، وPC1 = 192.168.1.10 وPC2 = 192.168.1.20 (بوابتهما 192.168.1.1)، وSRV1 = 192.168.2.100 وبوابته 192.168.2.1 (القناع 255.255.255.0 للجميع)، وشغّل HTTP على SRV1. ";
const aclNet = () => net([dev("r1", "router", 0.5, 0.1), dev("sw1", "switch", 0.25, 0.42), dev("pc1", "pc", 0.1, 0.88), dev("pc2", "pc", 0.4, 0.88), dev("srv1", "server", 0.75, 0.78)],
  [cable(1, "r1", "g0/0", "sw1", "g0/1"), cable(2, "sw1", "f0/1", "pc1", "eth0"), cable(3, "sw1", "f0/2", "pc2", "eth0"), cable(4, "r1", "g0/1", "srv1", "eth0")]);
const aclBase = (r1Extra: string[]) => [
  ...cli("router.command", "r1", [...enter, ...iface("g0/0", "192.168.1.1", "255.255.255.0"), ...iface("g0/1", "192.168.2.1", "255.255.255.0"), ...r1Extra, "end"]),
  ip("pc1", "192.168.1.10", "192.168.1.1"), ip("pc2", "192.168.1.20", "192.168.1.1"), ip("srv1", "192.168.2.100", "192.168.2.1"),
  { type: "server.setHttp", deviceId: "srv1", enabled: true, title: "Server", body: "Welcome" },
];

const ACL_STD = build({
  id: "m30-l02-p01-build-acl-standard", title: "ابنِ الشبكة: Standard ACL",
  description: "امنع حاسوبًا واحدًا من الوصول إلى الخادم بقائمة تحكم قياسية، ثم اضغط «تحقّق من شبكتي».",
  fallback: "access-list 1 deny host 192.168.1.20 · access-list 1 permit any · interface g0/1 · ip access-group 1 out.",
  intro: ACL_INTRO + "المطلوب: PC2 (192.168.1.20) ممنوع من الوصول إلى الخادم، وكل الباقي مسموح. اكتب Standard ACL رقم 1 وطبّقها على المنفذ القريب من الهدف (g0/1، للخارج out).",
  kinds: ["router", "switch", "pc", "server"],
  checks: [
    linkCheck("srv", "SRV1 موصول بالراوتر R1", "r1", "srv1"),
    reach("pc1", "PC1 يصل إلى الخادم (192.168.2.100)", "pc1", "192.168.2.100"),
    reach("pc2", "PC2 لا يصل إلى الخادم (ممنوع بالـ ACL)", "pc2", "192.168.2.100", false),
    reach("gw2", "PC2 ما زال يصل إلى بوابته 192.168.1.1", "pc2", "192.168.1.1"),
  ],
  hints: [
    "access-list 1 deny host 192.168.1.20 ثم access-list 1 permit any — بدون permit يمنع الـ deny الضمني كل شيء.",
    "Standard ACL توضع قريبًا من الهدف: interface g0/1 ثم ip access-group 1 out.",
    "جرّب show access-lists لترى عدد المطابقات.",
  ],
  explanation: "Standard ACL تفحص عنوان المصدر فقط، لذلك نضعها قريبًا من الهدف كي لا تمنع المصدر عن أماكن أخرى. في نهاية كل قائمة deny ضمني لكل شيء، فلا تنسَ permit any.",
  solution: { config: aclNet(), actions: aclBase(["access-list 1 deny host 192.168.1.20", "access-list 1 permit any", "interface g0/1", "ip access-group 1 out", "exit"]) },
});

const ACL_EXT = build({
  id: "m30-l02-p02-build-acl-extended", title: "ابنِ الشبكة: Extended ACL",
  description: "امنع ping إلى الخادم واسمح بالموقع (HTTP) بقائمة تحكم موسّعة، ثم اضغط «تحقّق من شبكتي».",
  fallback: "access-list 100 deny icmp any host 192.168.2.100 · access-list 100 permit ip any any · interface g0/0 · ip access-group 100 in.",
  intro: ACL_INTRO + "المطلوب: لا أحد يستطيع عمل ping للخادم، لكن الجميع يفتحون موقعه (HTTP). اكتب Extended ACL رقم 100 وطبّقها قريبًا من المصدر (g0/0، للداخل in).",
  kinds: ["router", "switch", "pc", "server"],
  checks: [
    linkCheck("srv", "SRV1 موصول بالراوتر R1", "r1", "srv1"),
    reach("noping", "ping من PC1 إلى الخادم ممنوع", "pc1", "192.168.2.100", false),
    reach("web1", "PC1 يفتح موقع الخادم (HTTP)", "pc1", "192.168.2.100", true, "http"),
    reach("web2", "PC2 يفتح موقع الخادم (HTTP)", "pc2", "192.168.2.100", true, "http"),
  ],
  hints: [
    "access-list 100 deny icmp any host 192.168.2.100 ثم access-list 100 permit ip any any.",
    "Extended ACL توضع قريبًا من المصدر: interface g0/0 ثم ip access-group 100 in.",
    "جرّب ping 192.168.2.100 (يجب أن يفشل)، وافتح http://192.168.2.100 في المتصفح (يجب أن ينجح).",
  ],
  explanation: "Extended ACL تفحص المصدر والهدف والبروتوكول (والمنفذ)، فتستطيع أن تمنع ping (icmp) وتسمح بالويب (tcp 80) معًا. لذلك نضعها قريبًا من المصدر لتوفير حركة الشبكة.",
  solution: { config: aclNet(), actions: aclBase(["access-list 100 deny icmp any host 192.168.2.100", "access-list 100 permit ip any any", "interface g0/0", "ip access-group 100 in", "exit"]) },
});

const NAT = build({
  id: "m30-l03-p01-build-pat", title: "ابنِ الشبكة: NAT / PAT إلى الإنترنت",
  description: "اجعل حواسيب الشبكة الخاصة تخرج إلى «الإنترنت» بعنوان عام واحد (PAT)، ثم اضغط «تحقّق من شبكتي».",
  fallback: "R1: ip route 0.0.0.0 0.0.0.0 200.0.0.2 · access-list 1 permit 192.168.1.0 0.0.0.255 · ip nat inside source list 1 interface s0/0/0 overload · g0/0 ip nat inside · s0/0/0 ip nat outside.",
  intro: "R1 راوتر المدرسة وR2 راوتر مزوّد الإنترنت (ISP). ابنِ: PC1 وPC2 على SW1 الموصول بـ R1 g0/0؛ R1 s0/0/0 بكابل تسلسلي إلى R2 s0/0/0؛ وخادم «الإنترنت» SRV1 على R2 g0/0. العناوين: R1 g0/0 = 192.168.1.1، PC1 = 192.168.1.10 وPC2 = 192.168.1.11 (بوابتهما 192.168.1.1، القناع 255.255.255.0)؛ الرابط: R1 s0/0/0 = 200.0.0.1 وR2 s0/0/0 = 200.0.0.2 (القناع 255.255.255.252، وclock rate 64000 على R1)؛ R2 g0/0 = 8.8.8.1 وSRV1 = 8.8.8.8 وبوابته 8.8.8.1 (القناع 255.255.255.0). مزوّد الإنترنت لا يعرف شبكتك الخاصة ولن يعرفها: على R1 أضف مسارًا افتراضيًا إلى 200.0.0.2، وشغّل PAT: كل الشبكة 192.168.1.0 تخرج بعنوان المنفذ s0/0/0.",
  kinds: ["router", "switch", "pc", "server"],
  checks: [
    linkCheck("wan", "R1 موصول بالمزوّد R2", "r1", "r2"),
    route("default", "R1 فيه مسار افتراضي ثابت 0.0.0.0/0", "r1", "0.0.0.0/0", "S"),
    reach("pc1", "PC1 يصل إلى خادم الإنترنت 8.8.8.8", "pc1", "8.8.8.8"),
    reach("pc2", "PC2 يصل إلى خادم الإنترنت 8.8.8.8", "pc2", "8.8.8.8"),
  ],
  hints: [
    "المسار الافتراضي على R1: ip route 0.0.0.0 0.0.0.0 200.0.0.2.",
    "PAT: access-list 1 permit 192.168.1.0 0.0.0.255 ثم ip nat inside source list 1 interface s0/0/0 overload.",
    "حدّد الجهتين: interface g0/0 ثم ip nat inside — وinterface s0/0/0 ثم ip nat outside. ثم جرّب show ip nat translations.",
  ],
  explanation: "العناوين الخاصة (192.168.x.x) لا تمرّ في الإنترنت. PAT (NAT overload) يبدّل عنوان المصدر لكل الأجهزة بعنوان عام واحد ويميّز الاتصالات برقم المنفذ، فيعود الردّ إلى الجهاز الصحيح.",
  solution: {
    config: net([dev("r1", "router", 0.3, 0.1), dev("r2", "router", 0.75, 0.1), dev("sw1", "switch", 0.3, 0.42), dev("pc1", "pc", 0.15, 0.88), dev("pc2", "pc", 0.45, 0.88), dev("srv1", "server", 0.75, 0.78)],
      [cable(1, "r1", "s0/0/0", "r2", "s0/0/0"), cable(2, "r1", "g0/0", "sw1", "g0/1"), cable(3, "sw1", "f0/1", "pc1", "eth0"), cable(4, "sw1", "f0/2", "pc2", "eth0"), cable(5, "r2", "g0/0", "srv1", "eth0")]),
    actions: [
      ...cli("router.command", "r1", [...enter, ...iface("g0/0", "192.168.1.1", "255.255.255.0", ["ip nat inside"]), ...iface("s0/0/0", "200.0.0.1", "255.255.255.252", ["clock rate 64000", "ip nat outside"]),
        "ip route 0.0.0.0 0.0.0.0 200.0.0.2", "access-list 1 permit 192.168.1.0 0.0.0.255", "ip nat inside source list 1 interface s0/0/0 overload", "end"]),
      ...cli("router.command", "r2", [...enter, ...iface("g0/0", "8.8.8.1", "255.255.255.0"), ...iface("s0/0/0", "200.0.0.2", "255.255.255.252"), "end"]),
      ip("pc1", "192.168.1.10", "192.168.1.1"), ip("pc2", "192.168.1.11", "192.168.1.1"), ip("srv1", "8.8.8.8", "8.8.8.1"),
    ],
  },
});

const IPV6 = build({
  id: "m30-l03-p02-build-ipv6", title: "ابنِ الشبكة: شبكتان بـ IPv6",
  description: "ابنِ شبكتين بعناوين IPv6 يصل بينهما راوتر، ثم اضغط «تحقّق من شبكتي».",
  fallback: "R1: ipv6 unicast-routing · g0/0 ipv6 address 2001:db8:1::1/64 · g0/1 ipv6 address 2001:db8:2::1/64 · PC1 2001:db8:1::10/64 (بوابة 2001:db8:1::1) · PC2 2001:db8:2::10/64 (بوابة 2001:db8:2::1).",
  intro: "ابنِ راوترًا R1 وحاسوبين: PC1 على g0/0 وPC2 على g0/1. على R1 شغّل توجيه IPv6 (ipv6 unicast-routing)، وأعطِ g0/0 العنوان 2001:db8:1::1/64 وg0/1 العنوان 2001:db8:2::1/64 وشغّل المنفذين. في نموذج IPv6 للحاسوب: PC1 = 2001:db8:1::10/64 وبوابته 2001:db8:1::1، وPC2 = 2001:db8:2::10/64 وبوابته 2001:db8:2::1.",
  kinds: ["router", "pc"],
  checks: [
    linkCheck("l1", "PC1 موصول بالراوتر R1", "r1", "pc1"),
    linkCheck("l2", "PC2 موصول بالراوتر R1", "r1", "pc2"),
    { id: "ping6", label: "PC1 يصل إلى PC2 بـ IPv6 (2001:db8:2::10)", kind: "lab.reach6", source: "pc1", destination: "2001:db8:2::10", value: true },
    { id: "back6", label: "PC2 يصل إلى بوابته 2001:db8:2::1", kind: "lab.reach6", source: "pc2", destination: "2001:db8:2::1", value: true },
  ],
  hints: [
    "بدون ipv6 unicast-routing لا يمرّر الراوتر رزم IPv6 بين المنافذ.",
    "على المنفذ: interface g0/0 ثم ipv6 address 2001:db8:1::1/64 ثم no shutdown.",
    "في الحاسوب: نموذج IPv6 تحت سطح المكتب، ثم جرّب ping 2001:db8:2::10 في Command Prompt.",
  ],
  explanation: "عنوان IPv6 طوله 128 بت ويُكتب بالست عشري، و/64 تعني أن أول 64 بت للشبكة. الراوتر يحتاج ipv6 unicast-routing ليمرّر رزم IPv6، والبوابة هي عنوان منفذ الراوتر في الشبكة.",
  solution: {
    config: net([dev("r1", "router", 0.5, 0.1), dev("pc1", "pc", 0.25, 0.88), dev("pc2", "pc", 0.75, 0.88)], [cable(1, "r1", "g0/0", "pc1", "eth0"), cable(2, "r1", "g0/1", "pc2", "eth0")]),
    actions: [
      ...cli("router.command", "r1", [...enter, "ipv6 unicast-routing", "interface g0/0", "ipv6 address 2001:db8:1::1/64", "no shutdown", "exit", "interface g0/1", "ipv6 address 2001:db8:2::1/64", "no shutdown", "end"]),
      { type: "host.setIpv6", deviceId: "pc1", adapter: "eth0", address: "2001:db8:1::10/64", gateway: "2001:db8:1::1" },
      { type: "host.setIpv6", deviceId: "pc2", adapter: "eth0", address: "2001:db8:2::10/64", gateway: "2001:db8:2::1" },
    ],
  },
});

const page = (id: string, title: string, order: number, pdf: number, keywords: string[], blocks: ContentBlock[]) => ({ id, title, order, source: src(pdf), keywords, blocks });

const m30: ContentModule = {
  id: "791381-m30",
  title: "ابنِ الشبكة: التوجيه والأمان",
  shortTitle: "التوجيه والأمان",
  order: 30,
  source: { kind: "book", sourceId: CID, pdfPageStart: 207, sourceNote: "وحدة تمارين «ابنِ الشبكة» (ليست قسمًا من الكتاب): كل تمرين على موضوع إحدى وحدات الكتاب، والمصدر في كل صفحة هو صفحة ذلك الموضوع." },
  lessons: [
    {
      id: "791381-m30-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        page("791381-m30-l00-p01", "ابنِ الشبكة: التوجيه والأمان", 1, 207, ["WAN", "Routing", "ACL", "NAT", "IPv6"], [
          { id: "m30-l00-p01-opener", type: "unit-opener", origin: "teacher-enrichment", unitLabel: "وحدة تمارين", unitNumber: "30", title: "ابنِ الشبكة: التوجيه والأمان", subtitle: "WAN · التوجيه · ACL · NAT · IPv6", goal: "الهدف: تبني شبكات بين مواقع، وتعلّم الراوترات الطريق، وتحمي الشبكة — ويفحص الخادم ما تفعله الشبكة حقًّا." },
          { id: "m30-l00-p01-text", type: "text", origin: "teacher-enrichment", spans: [T("هنا تعمل في المختبر الكامل: كوابل تسلسلية (s0/0/0)، وأوامر التوجيه والـ ACL والـ NAT وIPv6. الخادم لا يقرأ ما كتبت فقط: يرسل رزمًا حقيقية في شبكتك ويرى إن وصلت أو مُنعت.")] },
          {
            id: "m30-l00-p01-steps", type: "list", origin: "teacher-enrichment", variant: "plain",
            items: [
              { id: "s1", text: [T("1. أضف الأجهزة وصِلها. الكابل التسلسلي: من "), L("s0/0/0"), T(" إلى "), L("s0/0/0"), T(".")] },
              { id: "s2", text: [T("2. برمج الراوترات من سطر الأوامر. تحت الطرفية قائمة «أوامر إضافية في المختبر».")] },
              { id: "s3", text: [T("3. افحص بنفسك: "), L("show ip route"), T(" و"), L("show access-lists"), T(" و"), L("show ip nat translations"), T(" و"), L("ping"), T(".")] },
              { id: "s4", text: [T("4. اضغط «تحقّق من شبكتي».")] },
            ],
          },
        ]),
      ],
    },
    {
      id: "791381-m30-l01",
      title: "WAN والتوجيه",
      order: 1,
      pages: [
        page("791381-m30-l01-p01", "WAN وتوجيه ثابت", 1, 211, ["WAN", "Serial", "Static Route", "ip route"], [howTo("m30-l01-p01-how", ["الكابل التسلسلي يحتاج clock rate على جهة واحدة.", "المسار الثابت: الشبكة البعيدة + القناع + عنوان الراوتر المقابل."]), STATIC]),
        page("791381-m30-l01-p02", "التوجيه الديناميكي RIP", 2, 212, ["RIP", "Distance Vector", "version 2"], [howTo("m30-l01-p02-how", ["أعلن عن كل شبكة متصلة بالراوتر.", "الحرف R في show ip route يعني مسارًا من RIP."]), RIP]),
        page("791381-m30-l01-p03", "التوجيه الديناميكي OSPF", 3, 214, ["OSPF", "area 0", "Wildcard"], [howTo("m30-l01-p03-how", ["OSPF يكتب Wildcard: /24 = 0.0.0.255 و/30 = 0.0.0.3.", "جرّب show ip ospf neighbor."]), OSPF]),
        page("791381-m30-l01-p04", "التوجيه الديناميكي EIGRP", 4, 218, ["EIGRP", "AS"], [howTo("m30-l01-p04-how", ["رقم AS نفسه على كل الراوترات.", "الحرف D في show ip route يعني مسارًا من EIGRP."]), EIGRP]),
      ],
    },
    {
      id: "791381-m30-l02",
      title: "قوائم التحكم ACL",
      order: 2,
      pages: [
        page("791381-m30-l02-p01", "Standard ACL", 1, 224, ["Standard ACL", "access-list 1", "ip access-group"], [howTo("m30-l02-p01-how", ["Standard: قريبًا من الهدف.", "لا تنسَ permit any في النهاية."]), ACL_STD]),
        page("791381-m30-l02-p02", "Extended ACL", 2, 227, ["Extended ACL", "access-list 100", "icmp", "HTTP"], [howTo("m30-l02-p02-how", ["Extended: قريبًا من المصدر.", "تمنع بروتوكولًا وتسمح بآخر."]), ACL_EXT]),
      ],
    },
    {
      id: "791381-m30-l03",
      title: "NAT و IPv6",
      order: 3,
      pages: [
        page("791381-m30-l03-p01", "NAT / PAT إلى الإنترنت", 1, 258, ["NAT", "PAT", "overload", "ip nat inside"], [howTo("m30-l03-p01-how", ["inside = جهة الشبكة الخاصة، outside = جهة الإنترنت.", "جرّب show ip nat translations بعد ping."]), NAT]),
        page("791381-m30-l03-p02", "شبكتان بـ IPv6", 2, 166, ["IPv6", "ipv6 unicast-routing", "2001:db8"], [howTo("m30-l03-p02-how", ["ipv6 unicast-routing أولًا.", "عنوان الحاسوب في نموذج IPv6 تحت سطح المكتب."]), IPV6]),
      ],
    },
  ],
};

export default m30;
