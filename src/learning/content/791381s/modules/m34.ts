// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 34 «التبديل و VLANs».
//
// Verbatim conversion of booklet PDF pages 101–104 (the section header box → an opener page; each numbered sub-topic →
// one reader page). Every block is origin:"book": nothing is added, removed or reworded; bold runs are `strong`, monospace
// runs are `code`, printed box labels are the callout titles.

import type { ContentModule, ContentSource } from "../../types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };

const m34: ContentModule = {
  id: "791381s-m34",
  title: "التبديل و VLANs",
  order: 34,
  lessons: [
    {
      id: "791381s-m34-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m34-l00-p01",
          title: "التبديل و VLANs",
          order: 1,
          layout: "opener",
          source: src(101),
          blocks: [
            {
              id: "m34-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الملخص الشامل ④ · كتاب ص 245–250", unitNumber: "34", title: "التبديل و VLANs",
              subtitle: "VLAN وTrunk · أوضاع VTP · التوجيه بين VLANs · STP · Metro-Ethernet",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m34-l01",
      title: "التبديل و VLANs",
      order: 1,
      pages: [
        {
          id: "791381s-m34-l01-p01",
          title: "مفهوم VLANs و VTP",
          order: 1,
          source: src(101),
          blocks: [
            {
              id: "m34-l01-p01-def", type: "text", origin: "book",
              spans: [{ text: "VLAN = شبكة محلية افتراضية تقسّم السويتش إلى شبكات منطقية.", style: "strong" }],
            },
            {
              id: "m34-l01-p01-points", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m34-l01-p01-pt1", text: [{ text: "تقلّل حركة البث (Broadcast) وتزيد الأمان والتنظيم." }] },
                {
                  id: "m34-l01-p01-pt2",
                  text: [
                    { text: "النطاق من " },
                    { text: "1 إلى 4094", style: "strong" },
                    { text: "، و" },
                    { text: "VLAN 1", style: "strong" },
                    { text: " هي الافتراضية." },
                  ],
                },
                {
                  id: "m34-l01-p01-pt3",
                  text: [
                    { text: "VTP", style: "strong" },
                    { text: " يدير الـ VLANs عبر عدة سويتشات ضمن نفس " },
                    { text: "Domain", style: "strong" },
                    { text: "." },
                  ],
                },
              ],
            },
            {
              id: "m34-l01-p01-table", type: "table", origin: "book",
              headers: ["التقنية", "وظيفتها"],
              rows: [
                ["Trunk (802.1Q)", "ينقل عدة VLANs عبر كابل واحد."],
                ["DMZ", "تعزل السيرفرات العامة عن الشبكة الداخلية."],
                ["VPN", "شبكة آمنة (مشفّرة) عبر الإنترنت."],
              ],
            },
          ],
        },
        {
          id: "791381s-m34-l01-p02",
          title: "أوامر VLAN و Trunk",
          order: 2,
          source: src(102),
          blocks: [
            { id: "m34-l01-p02-cli1-h", type: "heading", origin: "book", level: 4, text: "Switch CLI", dir: "ltr" },
            {
              id: "m34-l01-p02-cli1", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: [
                "① Switch(config)# vlan 10",
                "② Switch(config-vlan)# name SALES",
                "③ Switch(config)# interface range fa0/1-10",
                "④ Switch(config-if-range)# switchport mode access",
                "⑤ Switch(config-if-range)# switchport access vlan 10",
              ].join("\n"),
            },
            {
              id: "m34-l01-p02-steps1", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m34-l01-p02-a1", text: [{ text: "إنشاء VLAN رقم 10." }] },
                { id: "m34-l01-p02-a2", text: [{ text: "تسميتها SALES." }] },
                { id: "m34-l01-p02-a3", text: [{ text: "تحديد عدة منافذ معًا." }] },
                { id: "m34-l01-p02-a4", text: [{ text: "وضع " }, { text: "Access", style: "strong" }, { text: ": المنفذ لجهاز واحد وVLAN واحدة." }] },
                { id: "m34-l01-p02-a5", text: [{ text: "ربط المنافذ بـ VLAN 10." }] },
              ],
            },
            { id: "m34-l01-p02-cli2-h", type: "heading", origin: "book", level: 4, text: "Switch CLI · منفذ الربط", dir: "ltr" },
            {
              id: "m34-l01-p02-cli2", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: [
                "① Switch(config)# interface g0/1",
                "② Switch(config-if)# switchport mode trunk",
                "③ Switch(config-if)# switchport trunk allowed vlan 10,20,30",
                "④ Switch(config-if)# switchport trunk native vlan 99",
              ].join("\n"),
            },
            {
              id: "m34-l01-p02-steps2", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m34-l01-p02-b1", text: [{ text: "اختيار منفذ الربط." }] },
                { id: "m34-l01-p02-b2", text: [{ text: "وضع " }, { text: "Trunk", style: "strong" }, { text: " لنقل عدة VLANs." }] },
                { id: "m34-l01-p02-b3", text: [{ text: "تحديد الـ VLANs المسموح بمرورها." }] },
                { id: "m34-l01-p02-b4", text: [{ text: "تغيير الـ " }, { text: "Native VLAN", style: "strong" }, { text: " إلى 99 لأغراض الأمان." }] },
              ],
            },
          ],
        },
        {
          id: "791381s-m34-l01-p03",
          title: "أوضاع وأوامر VTP",
          order: 3,
          source: src(103),
          blocks: [
            {
              id: "m34-l01-p03-table", type: "table", origin: "book",
              headers: ["الوضع", "الوصف"],
              rows: [
                ["Server", "يُنشئ ويعدّل ويحذف VLANs وينشرها."],
                ["Client", "يستقبل التحديثات فقط ولا يعدّل."],
                ["Transparent", "يحتفظ بإعداداته محليًا ويمرّر التحديثات."],
              ],
            },
            { id: "m34-l01-p03-cli-h", type: "heading", origin: "book", level: 4, text: "Switch CLI", dir: "ltr" },
            {
              id: "m34-l01-p03-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: [
                "① Switch(config)# vtp mode server",
                "② Switch(config)# vtp domain HFA",
                "③ Switch(config)# vtp password SA1234",
              ].join("\n"),
            },
            {
              id: "m34-l01-p03-warning", type: "callout", origin: "book", kind: "warning", title: "انتبه",
              spans: [
                { text: "يجب توحيد " },
                { text: "Domain", style: "strong" },
                { text: " و" },
                { text: "Password", style: "strong" },
                { text: " بين السويتشات حتى تصل التحديثات." },
              ],
            },
          ],
        },
        {
          id: "791381s-m34-l01-p04",
          title: "التوجيه بين VLANs — Dot1Q",
          order: 4,
          source: src(103, 104),
          blocks: [
            { id: "m34-l01-p04-cli-h", type: "heading", origin: "book", level: 4, text: "Router CLI", dir: "ltr" },
            {
              id: "m34-l01-p04-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: [
                "① Router(config)# interface gi0/0",
                "② Router(config-if)# no shutdown",
                "③ Router(config)# interface gi0/0.10",
                "④ Router(config-subif)# encapsulation dot1Q 10",
                "⑤ Router(config-subif)# ip address 192.168.10.1 255.255.255.0",
              ].join("\n"),
            },
            {
              id: "m34-l01-p04-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m34-l01-p04-s1", text: [{ text: "اختيار المنفذ الفيزيائي." }] },
                { id: "m34-l01-p04-s2", text: [{ text: "تشغيله." }] },
                { id: "m34-l01-p04-s3", text: [{ text: "واجهة فرعية لـ VLAN 10." }] },
                { id: "m34-l01-p04-s4", text: [{ text: "ترميز 802.1Q لـ VLAN 10." }] },
                { id: "m34-l01-p04-s5", text: [{ text: "عنوان Gateway لأجهزة VLAN 10." }] },
              ],
            },
            {
              id: "m34-l01-p04-condition", type: "callout", origin: "book", kind: "summary", title: "شرط أساسي",
              spans: [
                { text: "المنفذ في السويتش المتصل بالراوتر يجب أن يكون " },
                { text: "Trunk", style: "strong" },
                { text: " (لا Access) لتمرير وسوم كل الـ VLANs." },
              ],
            },
          ],
        },
        {
          id: "791381s-m34-l01-p05",
          title: "بروتوكول STP وسلوك السويتش",
          order: 5,
          source: src(104),
          blocks: [
            {
              id: "m34-l01-p05-table", type: "table", origin: "book",
              headers: ["العنصر", "الشرح"],
              rows: [
                ["الهدف من STP", "يمنع الحلقات (Loops) في الشبكة."],
                ["الطريقة", "اختيار Root Bridge وتعطيل المسارات الزائدة."],
                ["حالات المنافذ", "Blocking → Listening → Learning → Forwarding"],
              ],
            },
            {
              id: "m34-l01-p05-flooding", type: "callout", origin: "book", kind: "summary", title: "سلوك السويتش مع MAC غير معروف",
              spans: [
                { text: "عند استقبال إطار بعنوان MAC " },
                { text: "غير موجود", style: "strong" },
                { text: " في الجدول، يقوم السويتش بـ " },
                { text: "Flooding", style: "strong" },
                { text: ": يرسله لكل المنافذ عدا المصدر. وعندما يردّ الجهاز الهدف، يتعلّم السويتش العنوان ويضيفه إلى جدول MAC." },
              ],
            },
          ],
        },
        {
          id: "791381s-m34-l01-p06",
          title: "Metro-Ethernet و VLAN",
          order: 6,
          source: src(104),
          blocks: [
            {
              id: "m34-l01-p06-table", type: "table", origin: "book",
              headers: ["المفهوم", "الشرح"],
              rows: [
                ["Metro-Ethernet", "شبكة ألياف تربط عدة فروع أو مدارس بسرعات عالية."],
                ["VLANs", "تقسيم الشبكة منطقيًا داخل البنية نفسها للعزل."],
                ["العلاقة بينهما", "تُطبَّق VLANs في Metro-Ethernet للفصل بين العملاء."],
              ],
            },
            {
              id: "m34-l01-p06-idea", type: "callout", origin: "book", kind: "summary", title: "الفكرة",
              spans: [
                { text: "Metro-Ethernet يربط المواقع " },
                { text: "فيزيائيًا", style: "strong" },
                { text: "، وVLAN تفصلها " },
                { text: "منطقيًا", style: "strong" },
                { text: " داخل نفس البنية." },
              ],
            },
          ],
        },
      ],
    },
  ],
};

export default m34;
