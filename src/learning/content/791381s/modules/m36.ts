// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 36 «الخدمات والأوامر».
//
// Verbatim conversion of booklet PDF pages 109–112 (the section header box → an opener page; each numbered sub-topic →
// one reader page). Every converted block is origin:"book": nothing is added, removed or reworded; bold runs are `strong`,
// monospace runs are `code`, printed box labels are the callout titles. The DORA and TCP handshake drawings are crops of
// the booklet itself. Page 112 closes with the «كلمة الختام» box, kept on the last sub-topic page as printed.
//
// Enrichment (docs/enterprise-791381s-enrichment-plan.md, Phase 7; the network lab: Phase 8B-3): teacher-enrichment blocks (visuals — including SVG
// twins placed right after the two booklet crops, never replacing them — and CLI terminal simulations reused from course
// 791381 after checking their labels / commands against this section, interactive practice-table twins of the review
// tables, and the end-of-unit «تدريبات الوحدة» lesson) are ADDED after the book blocks they explain. The book blocks stay
// verbatim — pinned by the book lock (bookLock.test.ts).

import type { ContentModule, ContentSource, PracticeTableSelectCell } from "../../types";
import type { CliExerciseConfig } from "../../../cli/types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };
const EX = (exercise: CliExerciseConfig): Record<string, unknown> => ({ ...exercise });
/** A practice-table dropdown cell: the options are the values the column takes in the booklet table; `key` is the cell's exact text. */
const sel = <const O extends readonly string[]>(options: O) => (key: O[number]): PracticeTableSelectCell => ({ kind: "select", options: [...options], key });
const TERM = sel(["PAT", "APIPA", "NAT"] as const);
const CMD = sel(["nslookup", "ipconfig /all", "ping 8.8.8.8", "arp -a", "tracert", "ipconfig"] as const);
const SHOW = sel(["show ip route", "show interfaces status", "show vlan brief", "show access-lists", "show spanning-tree", "show interfaces trunk", "show vtp status", "show mac address-table"] as const);

const m36: ContentModule = {
  id: "791381s-m36",
  title: "الخدمات والأوامر",
  order: 36,
  lessons: [
    {
      id: "791381s-m36-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m36-l00-p01",
          title: "الخدمات والأوامر",
          order: 1,
          layout: "opener",
          source: src(109),
          blocks: [
            {
              id: "m36-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الملخص الشامل ⑥ · كتاب ص 258–263", unitNumber: "36", title: "الخدمات والأوامر",
              subtitle: "NAT وAPIPA · DHCP · مصافحة TCP · سيناريو فتح موقع · أوامر CMD وshow",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m36-l01",
      title: "الخدمات والأوامر",
      order: 1,
      pages: [
        {
          id: "791381s-m36-l01-p01",
          title: "NAT و PAT و APIPA",
          order: 1,
          source: src(109, 110),
          blocks: [
            {
              id: "m36-l01-p01-table", type: "table", origin: "book",
              headers: ["المصطلح", "الشرح"],
              rows: [
                ["NAT", "تحويل عناوين IP الداخلية (الخاصة) إلى العامة."],
                ["PAT", "عنوان عام واحد لعدة أجهزة باختلاف المنافذ (NAT + Ports)."],
                ["APIPA", "عند فشل DHCP، يعطي الجهاز نفسه IP يبدأ بـ 169.254.x.x"],
              ],
            },
            {
              id: "m36-l01-p01-idea", type: "callout", origin: "book", kind: "summary", title: "الفكرة",
              spans: [
                { text: "NAT/PAT يتيحان لأجهزة الشبكة الخاصة الخروج إلى الإنترنت عبر عنوان عام، و" },
                { text: "APIPA", style: "strong" },
                { text: " إشارة إلى " },
                { text: "مشكلة في DHCP", style: "strong" },
                { text: "." },
              ],
            },
            {
              id: "m36-l01-p01-v-nat", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m28/nat-pat-apipa", motion: false,
              source: src(109, 110),
              title: "مخطط: NAT و PAT و APIPA — ثلاثة مفاهيم منفصلة",
              alt: "مخطط عنوانه «ثلاثة مفاهيم منفصلة»: على اليسار تحت «تحويل للخروج إلى الإنترنت» بطاقتان — NAT «تحويل العنوان الخاص إلى العام» و PAT «عنوان عام واحد لعدة أجهزة بالمنافذ (Ports)»؛ وبعد خط فاصل، تحت «ليس تحويلًا — فشل DHCP» بطاقة APIPA «الجهاز يعطي نفسه 169.254.x.x عند فشل DHCP».",
              caption: "‏NAT/PAT للخروج بعنوان عام، و APIPA إشارة إلى مشكلة في DHCP.",
            },
          ],
        },
        {
          id: "791381s-m36-l01-p02",
          title: "بروتوكول DHCP — مراحل DORA",
          order: 2,
          source: src(110, 111),
          blocks: [
            {
              id: "m36-l01-p02-drawing", type: "diagram", origin: "book",
              src: "/learning-assets/791381s/eb50b11c5e80a5dc.png",
              alt: "رسم تبادل الرسائل بين «خادم DHCP» (أيقونة خادم على اليمين) و«العميل (الحاسوب)» (أيقونة حاسوب على اليسار) بأربعة أسهم: «1 · Discover» من العميل إلى الخادم وتحته «العميل يبحث عن خادم (Broadcast)»؛ «2 · Offer» من الخادم إلى العميل وتحته «الخادم يعرض عنوان IP»؛ «3 · Request» من العميل إلى الخادم وتحته «العميل يطلب العنوان المعروض»؛ «4 · ACK» من الخادم إلى العميل وتحته «الخادم يؤكّد: العنوان أصبح لك».",
            },
            {
              id: "m36-l01-p02-v-dora", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m22/dhcp-dora", motion: true,
              source: src(110),
              title: "رسم متحرّك: رسائل DORA الأربع بالترتيب",
              alt: "رسم متحرّك: «الجهاز» على اليسار و«خادم DHCP» على اليمين، وأربع رسائل تتحرّك واحدة بعد الأخرى: Discover من الجهاز إلى الخادم، ثم Offer من الخادم إلى الجهاز، ثم Request من الجهاز إلى الخادم، ثم ACK من الخادم إلى الجهاز.",
              caption: "‏Discover ثم Offer ثم Request ثم ACK — العميل يبدأ والخادم يردّ.",
            },
            {
              id: "m36-l01-p02-memo", type: "text", origin: "book",
              spans: [{ text: "احفظها بالترتيب: Discover \u200F←\u200F Offer \u200F←\u200F Request \u200F←\u200F ACK (اختصارها: DORA)", style: "strong" }],
            },
            { id: "m36-l01-p02-cli-h", type: "heading", origin: "book", level: 4, text: "Router CLI", dir: "ltr" },
            {
              id: "m36-l01-p02-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: [
                "① R(config)# ip dhcp excluded-address 192.168.10.1 192.168.10.10",
                "② R(config)# ip dhcp pool STUDENTS",
                "③ R(dhcp-config)# network 192.168.10.0 255.255.255.0",
                "④ R(dhcp-config)# default-router 192.168.10.1",
                "⑤ R(dhcp-config)# dns-server 8.8.8.8",
              ].join("\n"),
            },
            {
              id: "m36-l01-p02-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m36-l01-p02-s1", text: [{ text: "عناوين محجوزة لا يوزّعها الخادم (من .1 إلى .10)." }] },
                { id: "m36-l01-p02-s2", text: [{ text: "إنشاء مجموعة توزيع باسم STUDENTS." }] },
                { id: "m36-l01-p02-s3", text: [{ text: "الشبكة التي توزَّع منها العناوين." }] },
                { id: "m36-l01-p02-s4", text: [{ text: "عنوان البوابة Gateway للأجهزة." }] },
                { id: "m36-l01-p02-s5", text: [{ text: "عنوان خادم DNS." }] },
              ],
            },
            {
              id: "m36-l01-p02-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مهمّة: مجموعة DHCP باسم STUDENTS",
              description: "أنت في وضع الإعداد العام للراوتر R. احجز العناوين 192.168.10.1 إلى 192.168.10.10، وأنشئ المجموعة STUDENTS بشبكتها وبوابتها وخادم DNS كما في صندوق الوحدة. تُقيَّم الحالة النهائية. محاكاة تعليمية مبسّطة، ليست جهازًا حقيقيًا.",
              source: src(110, 111),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "المهمّة: ip dhcp excluded-address 192.168.10.1 192.168.10.10 ثم ip dhcp pool STUDENTS ثم network 192.168.10.0 255.255.255.0 ثم default-router 192.168.10.1 ثم dns-server 8.8.8.8." },
              config: EX({
                kind: "task",
                device: "router",
                hostname: "R",
                startMode: "global",
                intro: "أنت في وضع الإعداد العام للراوتر R. نفّذ أسطر الصندوق الخمسة.",
                goals: [
                  { id: "g-excl", label: "العناوين 192.168.10.1 إلى 192.168.10.10 محجوزة لا يوزّعها الخادم", condition: { kind: "dhcp-excluded", from: "192.168.10.1", to: "192.168.10.10" } },
                  { id: "g-net", label: "المجموعة STUDENTS توزّع من الشبكة 192.168.10.0", condition: { kind: "dhcp-pool", name: "STUDENTS", prop: "network", value: "192.168.10.0" } },
                  { id: "g-mask", label: "قناع الشبكة 255.255.255.0", condition: { kind: "dhcp-pool", name: "STUDENTS", prop: "mask", value: "255.255.255.0" } },
                  { id: "g-gw", label: "البوابة Gateway للأجهزة 192.168.10.1", condition: { kind: "dhcp-pool", name: "STUDENTS", prop: "defaultRouter", value: "192.168.10.1" } },
                  { id: "g-dns", label: "خادم DNS 8.8.8.8", condition: { kind: "dhcp-pool", name: "STUDENTS", prop: "dnsServers", value: ["8.8.8.8"] } },
                ],
                hints: ["السطر ① في الإعداد العام: ip dhcp excluded-address 192.168.10.1 192.168.10.10.", "ثم ip dhcp pool STUDENTS، وداخلها network و default-router و dns-server."],
                completion: "✓ أحسنت، المجموعة STUDENTS جاهزة، والعناوين من .1 إلى .10 محجوزة لا يوزّعها الخادم.",
              }),
            },
            { id: "m36-l01-p02-pc-h", type: "heading", origin: "book", level: 4, text: "في الحاسوب" },
            {
              id: "m36-l01-p02-pc1", type: "text", origin: "book",
              spans: [{ text: "الأمر " }, { text: "ipconfig /release", style: "code" }, { text: " يحرّر العنوان الحالي." }],
            },
            {
              id: "m36-l01-p02-pc2", type: "text", origin: "book",
              spans: [{ text: "الأمر " }, { text: "ipconfig /renew", style: "code" }, { text: " يطلب عنوانًا جديدًا من الخادم." }],
            },
          ],
        },
        {
          id: "791381s-m36-l01-p03",
          title: "مصافحة TCP الثلاثية",
          order: 3,
          source: src(111),
          blocks: [
            {
              id: "m36-l01-p03-drawing", type: "diagram", origin: "book",
              src: "/learning-assets/791381s/f3dcb027c928e93a.png",
              alt: "رسم تبادل الرسائل بين «الخادم» (أيقونة خادم على اليمين) و«العميل» (أيقونة حاسوب على اليسار) بثلاثة أسهم: «SYN» من العميل إلى الخادم وتحته «طلب بدء اتصال + رقم تسلسل»؛ «SYN-ACK» من الخادم إلى العميل وتحته «موافقة + رقم تسلسله + تأكيد SYN»؛ «ACK» من العميل إلى الخادم وتحته «تأكيد الردّ — يبدأ تبادل البيانات».",
            },
            {
              id: "m36-l01-p03-v-handshake", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m28/tcp-three-way-handshake", motion: true,
              source: src(111),
              title: "رسم متحرّك: مصافحة TCP الثلاثية",
              alt: "رسم متحرّك: «العميل» على اليسار و«الخادم» على اليمين، وثلاث رسائل تتحرّك واحدة بعد الأخرى: 1 · SYN من العميل إلى الخادم «طلب اتصال + رقم تسلسل»، 2 · SYN-ACK من الخادم إلى العميل «موافقة + رقم تسلسل + تأكيد SYN»، 3 · ACK من العميل إلى الخادم «تأكيد الرد»؛ وفي الأسفل «بعد ACK يبدأ تبادل البيانات — اتصال TCP موثوق».",
              caption: "‏SYN ثم SYN-ACK ثم ACK — ثم يبدأ تبادل البيانات.",
            },
            {
              id: "m36-l01-p03-result", type: "callout", origin: "book", kind: "summary", title: "النتيجة",
              spans: [
                { text: "اتصال " },
                { text: "موثوق", style: "strong" },
                { text: " بين الجهازين قبل تبادل أي بيانات فعلية عبر TCP." },
              ],
            },
          ],
        },
        {
          id: "791381s-m36-l01-p04",
          title: "سيناريو تكاملي: فتح موقع",
          order: 4,
          source: src(111, 112),
          blocks: [
            {
              id: "m36-l01-p04-intro", type: "text", origin: "book",
              spans: [{ text: "ماذا يحدث عندما نكتب اسم موقع في المتصفّح؟ أربع خطوات تجمع معظم ما تعلّمناه:" }],
            },
            {
              id: "m36-l01-p04-cards", type: "list", origin: "book", variant: "cards",
              items: [
                {
                  id: "m36-l01-p04-c1", term: "DNS · 1",
                  text: [{ text: "يسأل الحاسوب عن عنوان IP للموقع. " }, { text: "UDP 53", style: "code" }],
                },
                {
                  id: "m36-l01-p04-c2", term: "ARP · 2",
                  text: [{ text: "يجد عنوان MAC للبوابة عبر Broadcast. " }, { text: "L2", style: "code" }],
                },
                {
                  id: "m36-l01-p04-c3", term: "TCP · 3",
                  text: [{ text: "يبني اتصالًا موثوقًا: SYN ثم SYN-ACK ثم ACK. " }, { text: "Handshake", style: "strong" }],
                },
                {
                  id: "m36-l01-p04-c4", term: "HTTP/S · 4",
                  text: [{ text: "يطلب الصفحة (GET)، مع تشفير TLS في HTTPS. " }, { text: "80 / 443", style: "code" }],
                },
              ],
            },
            {
              id: "m36-l01-p04-v-journey", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m28/web-opening-journey", motion: true,
              source: src(111, 112),
              title: "رسم متحرّك: الخطوات الأربع لفتح موقع",
              alt: "رسم متحرّك لأربع بطاقات مرقّمة تظهر بالترتيب على خط واحد: 1 · DNS «UDP 53»، 2 · ARP «Broadcast · L2»، 3 · TCP Handshake «SYN·SYN-ACK·ACK»، 4 · HTTP/HTTPS «GET · TLS · 80/443».",
              caption: "‏DNS ثم ARP ثم TCP ثم HTTP/S — كل خطوة بعد التي قبلها.",
            },
            {
              id: "m36-l01-p04-idea", type: "callout", origin: "book", kind: "summary", title: "الفكرة",
              spans: [{ text: "فتح موقع واحد يجمع DNS وARP وTCP وHTTP معًا — مثال يربط كل البروتوكولات." }],
            },
          ],
        },
        {
          id: "791381s-m36-l01-p05",
          title: "أوامر CMD و Show",
          order: 5,
          source: src(112),
          blocks: [
            { id: "m36-l01-p05-cmd-h", type: "heading", origin: "book", level: 3, text: "في الحاسوب · Windows CMD" },
            {
              id: "m36-l01-p05-cmd", type: "table", origin: "book",
              headers: ["الأمر", "الوظيفة"],
              rows: [
                ["ping 8.8.8.8", "اختبار الاتصال"],
                ["tracert", "مسار الوصول"],
                ["ipconfig", "عرض عنوان IP"],
                ["ipconfig /all", "تفاصيل كاملة"],
                ["nslookup", "فحص DNS"],
                ["arp -a", "جدول MAC"],
              ],
              columnDirs: ["ltr", "rtl"],
            },
            { id: "m36-l01-p05-show-h", type: "heading", origin: "book", level: 3, text: "في الأجهزة · أوامر Show" },
            {
              id: "m36-l01-p05-show", type: "table", origin: "book",
              headers: ["الأمر", "الوظيفة"],
              rows: [
                ["show vlan brief", "الـ VLANs ومنافذها"],
                ["show interfaces trunk", "منافذ Trunk"],
                ["show mac address-table", "جدول MAC"],
                ["show interfaces status", "حالة المنافذ"],
                ["show vtp status", "إعدادات VTP"],
                ["show spanning-tree", "معلومات STP"],
                ["show ip route", "جدول التوجيه"],
                ["show access-lists", "قوائم ACL"],
              ],
              columnDirs: ["ltr", "rtl"],
            },
            {
              id: "m36-l01-p05-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "تحدّي الأمر: أمرا Show على السويتش",
              description: "أنت في الوضع المميّز (#) لسويتش جديد. اكتب أمر Show المناسب من الجدول لكل سؤال؛ المحاكي لا يكشف الإجابة. مخرجات المحاكاة مبسّطة، وليست مخرجات جهاز حقيقي.",
              source: src(112),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "التحدّي: show vlan brief ثم show vtp status." },
              config: EX({
                kind: "challenge",
                device: "switch",
                hostname: "Switch",
                startMode: "privileged",
                intro: "أنت في الوضع المميّز للسويتش. أجب بأمر Show المناسب من جدول «في الأجهزة · أوامر Show».",
                steps: [
                  { id: "s1", instruction: "اعرض الـ VLANs ومنافذها", expect: { command: "show", args: { what: "vlan-brief" } }, hints: ["الصف الأول في جدول أوامر Show.", "show vlan brief."] },
                  { id: "s2", instruction: "اعرض إعدادات VTP", expect: { command: "show", args: { what: "vtp-status" } }, hints: ["صف «إعدادات VTP» في الجدول.", "show vtp status."] },
                ],
                completion: "✓ أحسنت، استعملت أمرين من جدول أوامر Show.",
              }),
            },
            { id: "m36-l01-p05-closing-h", type: "heading", origin: "book", level: 4, text: "كلمة الختام" },
            {
              id: "m36-l01-p05-closing1", type: "text", origin: "book",
              spans: [{ text: "الحمد لله الذي وفّقنا وأعاننا على إتمام هذا الكتاب. علم الشبكات واسع، وما في هذه الأوراق بداية تساعد الطالب على بناء أساس قوي للتعلّم والتطوّر." }],
            },
            {
              id: "m36-l01-p05-closing2", type: "text", origin: "book",
              spans: [{ text: "بالتوفيق في الامتحان — " }, { text: "الأستاذ وفيق نصار", style: "strong" }],
            },
          ],
        },
      ],
    },
    {
      // «تدريبات الوحدة» — ADDED enrichment: an end-of-unit exercise page after the booklet's own pages (after «كلمة
      // الختام», which stays on its printed page). Every question is answered by the section's printed text above (the
      // explanation quotes it). The book pages are unchanged (book lock).
      id: "791381s-m36-l02",
      title: "تدريبات الوحدة",
      order: 2,
      pages: [
        {
          id: "791381s-m36-l02-p01",
          title: "تدريبات الوحدة: الخدمات والأوامر",
          order: 1,
          layout: "practice",
          source: src(109, 112),
          blocks: [
            {
              id: "m36-l02-p01-t01", type: "practice-table", origin: "teacher-enrichment",
              caption: "املأ عمود «المصطلح»: اختر المصطلح الذي يطابق كل شرح",
              headers: ["المصطلح", "الشرح"],
              rows: [
                [TERM("NAT"), "تحويل عناوين IP الداخلية (الخاصة) إلى العامة."],
                [TERM("PAT"), "عنوان عام واحد لعدة أجهزة باختلاف المنافذ (NAT + Ports)."],
                [TERM("APIPA"), "عند فشل DHCP، يعطي الجهاز نفسه IP يبدأ بـ 169.254.x.x"],
              ],
            },
            {
              id: "m36-l02-p01-t02", type: "practice-table", origin: "teacher-enrichment",
              caption: "املأ عمود «الأمر»: اختر أمر CMD لكل وظيفة",
              headers: ["الأمر", "الوظيفة"],
              rows: [
                [CMD("ping 8.8.8.8"), "اختبار الاتصال"],
                [CMD("tracert"), "مسار الوصول"],
                [CMD("ipconfig"), "عرض عنوان IP"],
                [CMD("ipconfig /all"), "تفاصيل كاملة"],
                [CMD("nslookup"), "فحص DNS"],
                [CMD("arp -a"), "جدول MAC"],
              ],
              columnDirs: ["ltr", "rtl"],
            },
            {
              id: "m36-l02-p01-t03", type: "practice-table", origin: "teacher-enrichment",
              caption: "املأ عمود «الأمر»: اختر أمر Show لكل وظيفة",
              headers: ["الأمر", "الوظيفة"],
              rows: [
                [SHOW("show vlan brief"), "الـ VLANs ومنافذها"],
                [SHOW("show interfaces trunk"), "منافذ Trunk"],
                [SHOW("show mac address-table"), "جدول MAC"],
                [SHOW("show interfaces status"), "حالة المنافذ"],
                [SHOW("show vtp status"), "إعدادات VTP"],
                [SHOW("show spanning-tree"), "معلومات STP"],
                [SHOW("show ip route"), "جدول التوجيه"],
                [SHOW("show access-lists"), "قوائم ACL"],
              ],
              columnDirs: ["ltr", "rtl"],
            },
            {
              id: "m36-l02-p01-q01", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "عند فشل DHCP يعطي الجهاز نفسه عنوان APIPA. بماذا يبدأ هذا العنوان؟",
                options: [{ id: "a", text: "192.168.x.x" }, { id: "b", text: "8.8.x.x" }, { id: "c", text: "169.254.x.x", correct: true }, { id: "d", text: "0.0.x.x" }],
                feedback: { explanation: "APIPA: عند فشل DHCP، يعطي الجهاز نفسه IP يبدأ بـ 169.254.x.x" },
              },
            },
            {
              id: "m36-l02-p01-q02", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "ظهور عنوان يبدأ بـ 169.254 على الجهاز يعني أن خادم DHCP أعطاه هذا العنوان.", answer: false, feedback: { explanation: "عند فشل DHCP يعطي الجهاز نفسه IP يبدأ بـ 169.254.x.x؛ لذلك APIPA إشارة إلى مشكلة في DHCP." } },
            },
            {
              id: "m36-l02-p01-q03", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "ordering", prompt: "رتّب رسائل DHCP الأربع (DORA) كما تحدث:",
                items: [
                  { id: "request", text: "Request — العميل يطلب العنوان المعروض" },
                  { id: "ack", text: "ACK — الخادم يؤكّد: العنوان أصبح لك" },
                  { id: "discover", text: "Discover — العميل يبحث عن خادم (Broadcast)" },
                  { id: "offer", text: "Offer — الخادم يعرض عنوان IP" },
                ],
                order: ["discover", "offer", "request", "ack"],
                feedback: { explanation: "احفظها بالترتيب: Discover ثم Offer ثم Request ثم ACK (اختصارها: DORA)." },
              },
            },
            {
              id: "m36-l02-p01-q04", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "matching", prompt: "صِل كل أمر من صندوق DHCP بوظيفته:",
                left: [
                  { id: "excl", text: "ip dhcp excluded-address 192.168.10.1 192.168.10.10" },
                  { id: "pool", text: "ip dhcp pool STUDENTS" },
                  { id: "net", text: "network 192.168.10.0 255.255.255.0" },
                  { id: "gw", text: "default-router 192.168.10.1" },
                  { id: "dns", text: "dns-server 8.8.8.8" },
                ],
                right: [
                  { id: "r1", text: "عنوان البوابة Gateway للأجهزة" },
                  { id: "r2", text: "عناوين محجوزة لا يوزّعها الخادم" },
                  { id: "r3", text: "عنوان خادم DNS" },
                  { id: "r4", text: "إنشاء مجموعة توزيع باسم STUDENTS" },
                  { id: "r5", text: "الشبكة التي توزَّع منها العناوين" },
                ],
                pairs: { excl: "r2", pool: "r4", net: "r5", gw: "r1", dns: "r3" },
                feedback: { explanation: "① عناوين محجوزة لا يوزّعها الخادم، ② إنشاء مجموعة توزيع باسم STUDENTS، ③ الشبكة التي توزَّع منها العناوين، ④ عنوان البوابة Gateway للأجهزة، ⑤ عنوان خادم DNS." },
              },
            },
            {
              id: "m36-l02-p01-q05", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "بحسب صندوق DHCP، هل يوزّع الخادم العنوان 192.168.10.5 على الأجهزة؟",
                options: [{ id: "a", text: "لا، لأنه من العناوين المحجوزة (من .1 إلى .10)", correct: true }, { id: "b", text: "نعم، لأنه داخل الشبكة 192.168.10.0" }, { id: "c", text: "نعم، لأنه عنوان خادم DNS" }],
                feedback: { explanation: "الأمر ip dhcp excluded-address 192.168.10.1 192.168.10.10 يحدّد عناوين محجوزة لا يوزّعها الخادم (من .1 إلى .10)، و .5 بينها." },
              },
            },
            {
              id: "m36-l02-p01-q06", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "أيّ أمر في الحاسوب يطلب عنوانًا جديدًا من خادم DHCP؟",
                options: [{ id: "a", text: "ipconfig /release" }, { id: "b", text: "ipconfig /all" }, { id: "c", text: "nslookup" }, { id: "d", text: "ipconfig /renew", correct: true }],
                feedback: { explanation: "في الحاسوب: الأمر ipconfig /release يحرّر العنوان الحالي، والأمر ipconfig /renew يطلب عنوانًا جديدًا من الخادم." },
              },
            },
            {
              id: "m36-l02-p01-q07", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "ordering", prompt: "رتّب رسائل مصافحة TCP الثلاثية:",
                items: [
                  { id: "ack", text: "ACK — تأكيد الردّ، يبدأ تبادل البيانات" },
                  { id: "syn", text: "SYN — طلب بدء اتصال + رقم تسلسل" },
                  { id: "synack", text: "SYN-ACK — موافقة + رقم تسلسله + تأكيد SYN" },
                ],
                order: ["syn", "synack", "ack"],
                feedback: { explanation: "العميل يرسل SYN (طلب بدء اتصال + رقم تسلسل)، ثم يردّ الخادم SYN-ACK (موافقة + رقم تسلسله + تأكيد SYN)، ثم يرسل العميل ACK (تأكيد الردّ — يبدأ تبادل البيانات)." },
              },
            },
            {
              id: "m36-l02-p01-q08", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "في TCP تبدأ البيانات الفعلية بالانتقال قبل المصافحة الثلاثية.", answer: false, feedback: { explanation: "النتيجة: اتصال موثوق بين الجهازين قبل تبادل أي بيانات فعلية عبر TCP؛ تبادل البيانات يبدأ بعد ACK." } },
            },
            {
              id: "m36-l02-p01-q09", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "matching", prompt: "صِل كل خطوة في سيناريو «فتح موقع» بما كُتب في بطاقتها:",
                left: [
                  { id: "dns", text: "DNS · 1" },
                  { id: "arp", text: "ARP · 2" },
                  { id: "tcp", text: "TCP · 3" },
                  { id: "http", text: "HTTP/S · 4" },
                ],
                right: [
                  { id: "r1", text: "يطلب الصفحة (GET)، مع تشفير TLS في HTTPS — 80 / 443" },
                  { id: "r2", text: "يسأل الحاسوب عن عنوان IP للموقع — UDP 53" },
                  { id: "r3", text: "يبني اتصالًا موثوقًا: SYN ثم SYN-ACK ثم ACK" },
                  { id: "r4", text: "يجد عنوان MAC للبوابة عبر Broadcast — L2" },
                ],
                pairs: { dns: "r2", arp: "r4", tcp: "r3", http: "r1" },
                feedback: { explanation: "DNS يسأل عن عنوان IP للموقع (UDP 53)، و ARP يجد عنوان MAC للبوابة عبر Broadcast (L2)، و TCP يبني اتصالًا موثوقًا (Handshake)، و HTTP/S يطلب الصفحة GET مع TLS في HTTPS (80 / 443)." },
              },
            },
            {
              id: "m36-l02-p01-q10", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "classify", prompt: "صنّف كل أمر حسب مكان كتابته:",
                groups: [{ id: "pc", text: "في الحاسوب · Windows CMD" }, { id: "dev", text: "في الأجهزة · أوامر Show" }],
                items: [
                  { id: "i1", text: "ipconfig /all" },
                  { id: "i2", text: "show mac address-table" },
                  { id: "i3", text: "nslookup" },
                  { id: "i4", text: "show spanning-tree" },
                  { id: "i5", text: "arp -a" },
                  { id: "i6", text: "show interfaces status" },
                ],
                assign: { i1: "pc", i2: "dev", i3: "pc", i4: "dev", i5: "pc", i6: "dev" },
                feedback: { explanation: "في الحاسوب (Windows CMD): ping و tracert و ipconfig و ipconfig /all و nslookup و arp -a. وفي الأجهزة: أوامر show مثل show mac address-table و show interfaces status و show spanning-tree." },
              },
            },
            {
              id: "m36-l02-p01-q11", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "في سيناريو فتح موقع، أيّ خطوة تجد عنوان MAC للبوابة عبر Broadcast؟",
                options: [{ id: "a", text: "DNS" }, { id: "b", text: "ARP", correct: true }, { id: "c", text: "TCP" }, { id: "d", text: "HTTP/S" }],
                feedback: { explanation: "الخطوة 2 (ARP): يجد عنوان MAC للبوابة عبر Broadcast (L2)." },
              },
            },
            {
              id: "m36-l02-p01-q12", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "أيّ أمر من أوامر Show في الأجهزة يعرض جدول التوجيه؟",
                options: [{ id: "a", text: "show ip route", correct: true }, { id: "b", text: "show access-lists" }, { id: "c", text: "tracert" }, { id: "d", text: "show vlan brief" }],
                feedback: { explanation: "من جدول أوامر Show: show ip route = جدول التوجيه، و show access-lists = قوائم ACL، و show vlan brief = الـ VLANs ومنافذها؛ أما tracert فأمر حاسوب يعرض مسار الوصول." },
              },
            },
            {
              // Phase 8B-3 — a network lab on the curriculum network simulator (networkTopology@2) with this unit's own values; the
              // SERVER replays and judges it (checks, feedback and solution never reach the browser). Counted in
              // Study Strength (owner decision 2026-11-01, §21). Proven by networkLab.contract.test.ts (no free credit, solution passes).
              id: "m36-l02-p01-lab-dhcp-students", type: "simulation", origin: "teacher-enrichment", simulationType: "network-lab", version: 1,
              title: "مختبر شبكي: مجموعة DHCP باسم STUDENTS",
              description: "مختبر على محاكي الشبكات: أنشئ مجموعة التوزيع، ثم اطلب عنوانًا من الحاسوب وتأكّد من إعداداته، واضغط «تحقّق من الإعداد».",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "ip dhcp excluded-address 192.168.10.1 192.168.10.10؛ ip dhcp pool STUDENTS، network 192.168.10.0 255.255.255.0، default-router 192.168.10.1، dns-server 8.8.8.8؛ ثم ipconfig /renew على PC1." },
              config: {
                topology: {"v":2,"devices":[{"id":"r1","kind":"router","label":"R","x":0.5,"y":0.1,"initial":{"v":2,"device":"router","hostname":"R","interfaces":{"g0/0":{"ipAddress":"192.168.10.1","subnetMask":"255.255.255.0","shutdown":false}},"subinterfaces":{},"dhcp":{"excluded":[],"pools":{}},"security":{}}},{"id":"sw1","kind":"switch","label":"SW1","x":0.5,"y":0.45},{"id":"pc1","kind":"pc","label":"PC1","x":0.3,"y":0.85,"initial":{"v":2,"device":"host","adapters":{"eth0":{"mode":"dhcp"}}}},{"id":"pc2","kind":"pc","label":"PC2","x":0.7,"y":0.85,"initial":{"v":2,"device":"host","adapters":{"eth0":{"mode":"dhcp"}}}}],"links":[{"id":"u","a":{"deviceId":"r1","port":"g0/0"},"b":{"deviceId":"sw1","port":"g0/1"}},{"id":"a","a":{"deviceId":"sw1","port":"f0/1"},"b":{"deviceId":"pc1","port":"eth0"}},{"id":"b","a":{"deviceId":"sw1","port":"f0/2"},"b":{"deviceId":"pc2","port":"eth0"}}]},
                task: {
                  intro: "الراوتر R جاهز على الشبكة 192.168.10.0/24 بالعنوان 192.168.10.1. احجز العناوين 192.168.10.1 إلى 192.168.10.10، وأنشئ المجموعة STUDENTS بشبكتها وبوابتها 192.168.10.1 وخادم DNS 8.8.8.8 كما في صندوق الوحدة. ثم على PC1 اطلب عنوانًا جديدًا بالأمر ipconfig /renew.",
                  goals: [{"id":"ex","label":"العناوين 192.168.10.1 إلى 192.168.10.10 محجوزة (excluded-address)"},{"id":"pool","label":"المجموعة ip dhcp pool STUDENTS موجودة"},{"id":"net","label":"network 192.168.10.0 255.255.255.0"},{"id":"gw","label":"default-router 192.168.10.1"},{"id":"dns","label":"dns-server 8.8.8.8"},{"id":"lease","label":"PC1 طلب عنوانًا جديدًا (ipconfig /renew) وحصل عليه من DHCP"},{"id":"pcgw","label":"Gateway على PC1 هي 192.168.10.1"},{"id":"pcdns","label":"خادم DNS على PC1 هو 8.8.8.8"}],
                },
                checks: [{"id":"ex","label":"العناوين 192.168.10.1 إلى 192.168.10.10 محجوزة (excluded-address)","weight":1,"kind":"router.dhcpExcluded","deviceId":"r1","value":"192.168.10.1 192.168.10.10"},{"id":"pool","label":"المجموعة ip dhcp pool STUDENTS موجودة","weight":1,"kind":"router.dhcpPool","deviceId":"r1","pool":"STUDENTS","value":true},{"id":"net","label":"network 192.168.10.0 255.255.255.0","weight":1,"kind":"router.dhcpNetwork","deviceId":"r1","pool":"STUDENTS","value":"192.168.10.0 255.255.255.0"},{"id":"gw","label":"default-router 192.168.10.1","weight":1,"kind":"router.dhcpDefaultRouter","deviceId":"r1","pool":"STUDENTS","value":"192.168.10.1"},{"id":"dns","label":"dns-server 8.8.8.8","weight":1,"kind":"router.dhcpDns","deviceId":"r1","pool":"STUDENTS","value":"8.8.8.8"},{"id":"lease","label":"PC1 طلب عنوانًا جديدًا (ipconfig /renew) وحصل عليه من DHCP","weight":1,"kind":"host.dhcpLease","deviceId":"pc1","adapter":"eth0","value":true},{"id":"pcgw","label":"Gateway على PC1 هي 192.168.10.1","weight":1,"kind":"host.gateway","deviceId":"pc1","adapter":"eth0","value":"192.168.10.1"},{"id":"pcdns","label":"خادم DNS على PC1 هو 8.8.8.8","weight":1,"kind":"host.dns","deviceId":"pc1","adapter":"eth0","value":"8.8.8.8"}],
                feedback: {
                  correctFeedback: "أحسنت! تحققت كل أهداف المختبر.",
                  incorrectFeedback: "لم تتحقق كل الأهداف بعد.",
                  hints: ["في الإعداد العام: ip dhcp excluded-address 192.168.10.1 192.168.10.10.","ip dhcp pool STUDENTS ثم network 192.168.10.0 255.255.255.0 ثم default-router 192.168.10.1 ثم dns-server 8.8.8.8.","على PC1 في Command Prompt: ipconfig /renew يطلب عنوانًا جديدًا من الخادم."],
                  explanation: "الأمر ipconfig /renew يطلب عنوانًا جديدًا من الخادم، فيحصل PC1 من المجموعة STUDENTS على عنوان وبوابة 192.168.10.1 وخادم DNS 8.8.8.8؛ والعناوين من .1 إلى .10 محجوزة لا يوزّعها الخادم.",
                },
                solution: [{"type":"router.command","deviceId":"r1","command":"enable"},{"type":"router.command","deviceId":"r1","command":"configure terminal"},{"type":"router.command","deviceId":"r1","command":"ip dhcp excluded-address 192.168.10.1 192.168.10.10"},{"type":"router.command","deviceId":"r1","command":"ip dhcp pool STUDENTS"},{"type":"router.command","deviceId":"r1","command":"network 192.168.10.0 255.255.255.0"},{"type":"router.command","deviceId":"r1","command":"default-router 192.168.10.1"},{"type":"router.command","deviceId":"r1","command":"dns-server 8.8.8.8"},{"type":"router.command","deviceId":"r1","command":"end"},{"type":"host.command","deviceId":"pc1","command":"ipconfig /renew"}],
              },
            },
            { id: "m36-l02-p01-lib-f01", type: "library-training", origin: "teacher-enrichment", trainingId: "F01", label: "الامتحان الأول", requiredModuleId: "791381s-m30" },
            { id: "m36-l02-p01-lib-f02", type: "library-training", origin: "teacher-enrichment", trainingId: "F02", label: "الامتحان الثاني", requiredModuleId: "791381s-m30" },
            { id: "m36-l02-p01-lib-f03", type: "library-training", origin: "teacher-enrichment", trainingId: "F03", label: "الامتحان الثالث", requiredModuleId: "791381s-m30" },
            { id: "m36-l02-p01-lib-f04", type: "library-training", origin: "teacher-enrichment", trainingId: "F04", label: "الامتحان الرابع", requiredModuleId: "791381s-m30" },
            { id: "m36-l02-p01-lib-f05", type: "library-training", origin: "teacher-enrichment", trainingId: "F05", label: "الامتحان الخامس", requiredModuleId: "791381s-m30" },
            { id: "m36-l02-p01-lib-f06", type: "library-training", origin: "teacher-enrichment", trainingId: "F06", label: "الامتحان السادس", requiredModuleId: "791381s-m30" },
          ],
        },
      ],
    },
  ],
};

export default m36;
