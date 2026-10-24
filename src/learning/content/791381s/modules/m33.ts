// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 33 «العنونة والتجزئة».
//
// Verbatim conversion of booklet PDF pages 98–101 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every block is origin:"book": nothing is added, removed or reworded; bold runs are `strong`, monospace
// runs are `code`, printed box labels are the callout titles.

import type { ContentModule, ContentSource } from "../../types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };

const m33: ContentModule = {
  id: "791381s-m33",
  title: "العنونة والتجزئة",
  order: 33,
  lessons: [
    {
      id: "791381s-m33-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m33-l00-p01",
          title: "العنونة والتجزئة",
          order: 1,
          layout: "opener",
          source: src(98),
          blocks: [
            {
              id: "m33-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الملخص الشامل ③ · كتاب ص 241–244", unitNumber: "33", title: "العنونة والتجزئة",
              subtitle: "عناوين خاصة · أنواع الرسائل · Subnetting · Wildcard · IPv6",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m33-l01",
      title: "العنونة والتجزئة",
      order: 1,
      pages: [
        {
          id: "791381s-m33-l01-p01",
          title: "العناوين الخاصة وأنواع الرسائل",
          order: 1,
          source: src(98, 99),
          blocks: [
            {
              id: "m33-l01-p01-addresses", type: "table", origin: "book",
              headers: ["العنوان", "المعنى"],
              rows: [
                ["127.0.0.1", "الجهاز نفسه (Loopback)."],
                ["169.254.x.x", "APIPA: عند فشل DHCP."],
                ["0.0.0.0", "لا يوجد عنوان."],
                ["255.255.255.255", "Broadcast للجميع."],
              ],
              columnDirs: ["ltr", "rtl"],
            },
            {
              id: "m33-l01-p01-types", type: "table", origin: "book",
              headers: ["النوع", "المعنى"],
              rows: [
                ["Unicast", "من جهاز إلى جهاز واحد."],
                ["Multicast", "من جهاز إلى مجموعة أجهزة."],
                ["Broadcast", "من جهاز إلى جميع الأجهزة."],
              ],
            },
            {
              id: "m33-l01-p01-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [
                { text: "البروتوكولات التي تستخدم " },
                { text: "Broadcast", style: "strong" },
                { text: ": ARP · DHCP · RIP." },
              ],
            },
          ],
        },
        {
          id: "791381s-m33-l01-p02",
          title: "التجزئة Subnetting — أمثلة محلولة",
          order: 2,
          source: src(99),
          blocks: [
            {
              id: "m33-l01-p02-table", type: "table", origin: "book",
              headers: ["IP", "البادئة", "الشبكة", "أول جهاز", "آخر جهاز", "البث"],
              rows: [
                ["10.5.6.7", "/8", "10.0.0.0", "10.0.0.1", "10.255.255.254", "10.255.255.255"],
                ["172.16.5.40", "/16", "172.16.0.0", "172.16.0.1", "172.16.255.254", "172.16.255.255"],
                ["192.168.1.25", "/24", "192.168.1.0", "192.168.1.1", "192.168.1.254", "192.168.1.255"],
              ],
              columnDirs: ["ltr", "ltr", "ltr", "ltr", "ltr", "ltr"],
            },
            { id: "m33-l01-p02-method-h", type: "heading", origin: "book", level: 3, text: "طريقة الحل للعنوان 192.168.1.25/24:" },
            {
              id: "m33-l01-p02-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m33-l01-p02-s1", text: [{ text: "الشبكة", style: "strong" }, { text: ": نصفّر جزء الأجهزة ← " }, { text: "192.168.1.0", style: "code" }] },
                { id: "m33-l01-p02-s2", text: [{ text: "أول جهاز", style: "strong" }, { text: ": الشبكة + 1 ← " }, { text: "192.168.1.1", style: "code" }] },
                { id: "m33-l01-p02-s3", text: [{ text: "عنوان البث", style: "strong" }, { text: ": نملأ جزء الأجهزة بـ 255 ← " }, { text: "192.168.1.255", style: "code" }] },
                { id: "m33-l01-p02-s4", text: [{ text: "آخر جهاز", style: "strong" }, { text: ": البث − 1 ← " }, { text: "192.168.1.254", style: "code" }] },
              ],
            },
            {
              id: "m33-l01-p02-count", type: "text", origin: "book",
              spans: [
                { text: "عدد الأجهزة القابلة للاستخدام = ", style: "strong" },
                { text: "2^(host) − 2", style: "code" },
              ],
            },
          ],
        },
        {
          id: "791381s-m33-l01-p03",
          title: "قناع البدل Wildcard Mask",
          order: 3,
          source: src(99, 100),
          blocks: [
            {
              id: "m33-l01-p03-def", type: "text", origin: "book",
              spans: [{ text: "Wildcard = عكس قناع الشبكة. يُستخدم كثيرًا في قوائم ACL وبروتوكول OSPF.", style: "strong" }],
            },
            {
              id: "m33-l01-p03-table", type: "table", origin: "book",
              headers: ["المعنى", "Subnet Mask", "Wildcard"],
              rows: [
                ["جهاز واحد", "255.255.255.255", "0.0.0.0"],
                ["شبكة 24/", "255.255.255.0", "0.0.0.255"],
                ["شبكة 16/", "255.255.0.0", "0.0.255.255"],
                ["أي عنوان", "0.0.0.0", "255.255.255.255"],
              ],
              columnDirs: ["rtl", "ltr", "ltr"],
            },
            { id: "m33-l01-p03-rule-h", type: "heading", origin: "book", level: 4, text: "القاعدة" },
            {
              id: "m33-l01-p03-rule", type: "text", origin: "book",
              spans: [
                { text: "خانة Wildcard = " },
                { text: "255 − الخانة المقابلة في القناع", style: "strong" },
                { text: "." },
              ],
            },
            {
              id: "m33-l01-p03-example", type: "text", origin: "book",
              spans: [
                { text: "مثال: إذا كان القناع " },
                { text: "255.255.255.0", style: "code" },
                { text: " فإن Wildcard هو " },
                { text: "0.0.0.255", style: "code" },
                { text: " (شبكة 24/ كاملة)." },
              ],
            },
          ],
        },
        {
          id: "791381s-m33-l01-p04",
          title: "العنوان IPv6 — البنية والتصغير",
          order: 4,
          source: src(100, 101),
          blocks: [
            {
              id: "m33-l01-p04-table", type: "table", origin: "book",
              headers: ["الخاصية", "القيمة", "الشرح"],
              rows: [
                ["الطول الكلّي", "128 bit", "أطول من IPv4 بأربع مرّات."],
                ["التقسيم", "8 مجموعات", "كل مجموعة Hextet = 16 bit."],
                ["جزء الشبكة Prefix", "64 bit /64", "الجزء الأيسر."],
                ["جزء الجهاز", "64 bit", "الجزء الأيمن يميّز الجهاز."],
              ],
              columnDirs: ["rtl", "ltr", "rtl"],
            },
            { id: "m33-l01-p04-short-h", type: "heading", origin: "book", level: 4, text: "تصغير عنوان IPv6", dir: "ltr" },
            {
              id: "m33-l01-p04-short", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: [
                "① 2001:0DB8:0000:0000:0000:0000:0000:0001",
                "② 2001:DB8:0:0:0:0:0:1",
                "③ 2001:DB8::1",
              ].join("\n"),
            },
            {
              id: "m33-l01-p04-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m33-l01-p04-s1", text: [{ text: "العنوان الكامل." }] },
                { id: "m33-l01-p04-s2", text: [{ text: "نحذف الأصفار البادئة في كل مجموعة." }] },
                {
                  id: "m33-l01-p04-s3",
                  text: [
                    { text: "نستبدل المجموعات الصفرية المتتالية بـ " },
                    { text: "::", style: "strong" },
                    { text: " — " },
                    { text: "مرة واحدة فقط", style: "strong" },
                    { text: "." },
                  ],
                },
              ],
            },
            {
              id: "m33-l01-p04-special", type: "table", origin: "book",
              headers: ["العنوان الخاص", "معناه"],
              rows: [
                ["::1", "Loopback (الجهاز نفسه)"],
                ["::", "لا يوجد عنوان"],
                ["FE80::/10", "Link-Local (داخل الرابط فقط)"],
                ["FF00::/8", "Multicast"],
              ],
              columnDirs: ["ltr", "rtl"],
            },
            {
              id: "m33-l01-p04-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [
                { text: "لا يوجد " },
                { text: "Broadcast", style: "strong" },
                { text: " في IPv6." },
              ],
            },
          ],
        },
      ],
    },
  ],
};

export default m33;
