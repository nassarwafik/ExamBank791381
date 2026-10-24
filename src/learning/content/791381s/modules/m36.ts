// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 36 «الخدمات والأوامر».
//
// Verbatim conversion of booklet PDF pages 109–112 (the section header box → an opener page; each numbered sub-topic →
// one reader page). Every block is origin:"book": nothing is added, removed or reworded; bold runs are `strong`, monospace
// runs are `code`, printed box labels are the callout titles. The DORA and TCP handshake drawings are crops of the
// booklet itself. Page 112 closes with the «كلمة الختام» box, kept on the last sub-topic page as printed.

import type { ContentModule, ContentSource } from "../../types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };

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
  ],
};

export default m36;
