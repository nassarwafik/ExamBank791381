// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 10 «البروتوكولات».
//
// Verbatim conversion of booklet PDF pages 31–32 (the section header box → an opener page; the section has no numbered
// sub-topics, so its whole body is one reader page). Every block is origin:"book": nothing is added, removed or reworded.

import type { ContentModule, ContentSource } from "../../types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };

const m10: ContentModule = {
  id: "791381s-m10",
  title: "البروتوكولات",
  order: 10,
  lessons: [
    {
      id: "791381s-m10-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m10-l00-p01",
          title: "البروتوكولات",
          order: 1,
          layout: "opener",
          source: src(31),
          blocks: [
            {
              id: "m10-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الدفعة الثالثة · كتاب ص 87–92", unitNumber: "10", title: "البروتوكولات",
              subtitle: "ما هو البروتوكول؟ وما وظيفة أهم البروتوكولات؟",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m10-l01",
      title: "البروتوكولات",
      order: 1,
      pages: [
        {
          id: "791381s-m10-l01-p01",
          title: "البروتوكولات",
          order: 1,
          source: src(31, 32),
          blocks: [
            {
              id: "m10-l01-p01-def", type: "text", origin: "book",
              spans: [{ text: "البروتوكول = قاعدة أو لغة تتفاهم بها الأجهزة. كل خدمة في الشبكة تعتمد على بروتوكول معيّن، ولكل بروتوكول وظيفة واضحة.", style: "strong" }],
            },
            {
              id: "m10-l01-p01-task", type: "text", origin: "book",
              spans: [
                { text: "المطلوب:", style: "strong" },
                { text: " احفظ وظيفة البروتوكول مع مثال واحد فقط، لا أكثر." },
              ],
            },
            {
              id: "m10-l01-p01-table", type: "table", origin: "book",
              headers: ["البروتوكول", "وظيفته", "مثال / كلمة للحفظ", "النقل"],
              rows: [
                ["DNS", "يحوّل اسم الموقع إلى عنوان IP.", "google.com → IP", "UDP غالبًا"],
                ["HTTP", "يجلب صفحات الويب من الخادم ويعرضها في المتصفح.", "تصفّح المواقع", "TCP"],
                ["HTTPS", "نسخة آمنة من HTTP تستعمل التشفير.", "تصفّح آمن 🔒", "TCP"],
                ["DHCP", "يوزّع عناوين IP على الأجهزة تلقائيًا.", "الحاسوب يأخذ IP تلقائيًا", "UDP"],
                ["SMTP", "إرسال البريد الإلكتروني بين الخوادم.", "إرسال البريد", "TCP"],
                ["POP / IMAP", "استلام البريد الإلكتروني من الخادم.", "استلام البريد", "TCP"],
                ["FTP", "نقل الملفات بين جهاز وخادم.", "نقل الملفات", "TCP"],
                ["TFTP", "نسخة بسيطة من FTP، تُستعمل كثيرًا مع أجهزة الشبكة.", "نقل ملفات بسيط", "UDP"],
                ["SSH", "اتصال آمن ومشفّر للتحكم بالأجهزة عن بُعد.", "تحكّم آمن", "TCP"],
                ["Telnet", "تحكّم عن بُعد، لكنه غير آمن لأنه لا يشفّر البيانات.", "تحكّم غير آمن", "TCP"],
                ["NAT", "يحوّل عناوين الشبكة الداخلية إلى عنوان عام للإنترنت.", "داخلي ← عام", "—"],
                ["ICMP", "رسائل فحص وأخطاء.", "ping", "—"],
                ["ARP", "يربط عنوان IP بعنوان MAC داخل الشبكة.", "MAC ← IP", "—"],
              ],
            },
            { id: "m10-l01-p01-rule-h", type: "heading", origin: "book", level: 4, text: "القاعدة" },
            {
              id: "m10-l01-p01-rule-1", type: "text", origin: "book",
              spans: [
                { text: "TCP", style: "strong" },
                { text: " للموثوقية: الويب والبريد والملفات والتحكم عن بعد. " },
                { text: "UDP", style: "strong" },
                { text: " للسرعة: DNS و DHCP و TFTP والبث." },
              ],
            },
            {
              id: "m10-l01-p01-rule-2", type: "text", origin: "book",
              spans: [
                { text: "استخدم " },
                { text: "SSH", style: "strong" },
                { text: " بدل Telnet دائمًا لأنه يشفّر البيانات." },
              ],
            },
            { id: "m10-l01-p01-example-h", type: "heading", origin: "book", level: 4, text: "مثال: ماذا يحدث عندما تفتح google.com؟" },
            {
              id: "m10-l01-p01-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m10-l01-p01-s1", text: [{ text: "DHCP", style: "strong" }, { text: " أعطى حاسوبك عنوان IP عندما اتصل بالشبكة." }] },
                { id: "m10-l01-p01-s2", text: [{ text: "DNS", style: "strong" }, { text: " يجد عنوان IP الخاص بالموقع " }, { text: "google.com", style: "code" }, { text: "." }] },
                { id: "m10-l01-p01-s3", text: [{ text: "HTTPS", style: "strong" }, { text: " يجلب الصفحة ويعرضها في المتصفح بشكل آمن." }] },
              ],
            },
            {
              id: "m10-l01-p01-together", type: "text", origin: "book",
              spans: [{ text: "معًا: DNS يجد العنوان، HTTP يجلب الصفحة، و DHCP يمنح الجهاز عنوانه — هذا أساس تصفّح الإنترنت." }],
            },
          ],
        },
      ],
    },
  ],
};

export default m10;
