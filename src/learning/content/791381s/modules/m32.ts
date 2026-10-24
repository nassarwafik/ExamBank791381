// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 32 «النماذج والبروتوكولات».
//
// Verbatim conversion of booklet PDF pages 96–98 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every block is origin:"book": nothing is added, removed or reworded; bold runs are `strong`, monospace
// runs are `code`, printed box labels are the callout titles.

import type { ContentModule, ContentSource } from "../../types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };

const m32: ContentModule = {
  id: "791381s-m32",
  title: "النماذج والبروتوكولات",
  order: 32,
  lessons: [
    {
      id: "791381s-m32-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m32-l00-p01",
          title: "النماذج والبروتوكولات",
          order: 1,
          layout: "opener",
          source: src(96),
          blocks: [
            {
              id: "m32-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الملخص الشامل ② · كتاب ص 237–240", unitNumber: "32", title: "النماذج والبروتوكولات",
              subtitle: "نموذج OSI · المنافذ المهمّة · TCP وUDP · وحدات البيانات والتغليف",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m32-l01",
      title: "النماذج والبروتوكولات",
      order: 1,
      pages: [
        {
          id: "791381s-m32-l01-p01",
          title: "نموذج OSI — الطبقات السبع",
          order: 1,
          source: src(96),
          blocks: [
            {
              id: "m32-l01-p01-table", type: "table", origin: "book",
              headers: ["#", "الطبقة", "أمثلة"],
              rows: [
                ["7", "Application · التطبيقات", "HTTP · DNS"],
                ["6", "Presentation · العرض", "SSL · JPEG"],
                ["5", "Session · الجلسات", "RPC"],
                ["4", "Transport · النقل", "TCP · UDP"],
                ["3", "Network · التوجيه", "IP · ICMP"],
                ["2", "Data Link · الربط", "MAC"],
                ["1", "Physical · الإشارات", "Cables"],
              ],
            },
            { id: "m32-l01-p01-memo-h", type: "heading", origin: "book", level: 4, text: "للحفظ (7 إلى 1)" },
            {
              id: "m32-l01-p01-memo1", type: "text", origin: "book",
              spans: [
                { text: "احفظ الجملة: " },
                { text: "All People Seem To Need Data Processing", style: "strong" },
                { text: "." },
              ],
            },
            {
              id: "m32-l01-p01-memo2", type: "text", origin: "book",
              spans: [{ text: "كل كلمة تبدأ بحرف طبقة: نبدأ من الأعلى (الطبقة 7) إلى الأسفل (الطبقة 1)، وهذا اتجاه الإرسال." }],
            },
          ],
        },
        {
          id: "791381s-m32-l01-p02",
          title: "البروتوكولات والمنافذ المهمّة",
          order: 2,
          source: src(97),
          blocks: [
            {
              id: "m32-l01-p02-table", type: "table", origin: "book",
              headers: ["البروتوكول", "Port", "الوظيفة"],
              rows: [
                ["HTTP", "80", "تصفّح عادي"],
                ["HTTPS", "443", "تصفّح آمن"],
                ["FTP", "20 , 21", "نقل ملفات"],
                ["TFTP", "69", "نقل ملفات بسيط"],
                ["DNS", "53", "ترجمة الأسماء إلى IP"],
                ["DHCP", "67 , 68", "توزيع IP تلقائي"],
                ["SMTP", "25", "إرسال بريد"],
                ["POP3", "110", "استقبال بريد"],
                ["IMAP", "143", "إدارة البريد"],
                ["SSH", "22", "دخول آمن عن بُعد"],
                ["TELNET", "23", "دخول غير آمن"],
              ],
              columnDirs: ["rtl", "ltr", "rtl"],
            },
            {
              id: "m32-l01-p02-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [
                { text: "ARP", style: "strong" },
                { text: " يربط IP بـ MAC، و" },
                { text: "ICMP", style: "strong" },
                { text: " للفحص (ping)، وكلاهما في الطبقات الدنيا." },
              ],
            },
          ],
        },
        {
          id: "791381s-m32-l01-p03",
          title: "الفروق بين TCP و UDP",
          order: 3,
          source: src(97, 98),
          blocks: [
            {
              id: "m32-l01-p03-table", type: "table", origin: "book",
              headers: ["الميزة", "TCP", "UDP"],
              rows: [
                ["نوع الاتصال", "يتصل أولًا (Connection-Oriented)", "بدون اتصال"],
                ["التأكيد", "يرسل تأكيد استلام ACK", "لا يرسل تأكيدًا"],
                ["الموثوقية", "موثوق — يضمن الوصول", "قد تضيع البيانات"],
                ["السرعة", "بطيء نسبيًا", "سريع جدًا"],
                ["الاستخدام", "الملفات، الويب، البريد", "البث، الألعاب، VoIP"],
              ],
            },
            {
              id: "m32-l01-p03-transport", type: "table", origin: "book",
              headers: ["تعمل عبر TCP", "تعمل عبر UDP", "تعمل عبر الاثنين"],
              rows: [["HTTP / HTTPS · FTP · SMTP · SSH", "TFTP · DHCP · RIP · SNMP", "DNS"]],
            },
          ],
        },
        {
          id: "791381s-m32-l01-p04",
          title: "وحدات البيانات والتغليف",
          order: 4,
          source: src(98),
          blocks: [
            {
              id: "m32-l01-p04-table", type: "table", origin: "book",
              headers: ["الطبقة", "الوحدة", "تحتوي"],
              rows: [
                ["Application", "Data", "البيانات النهائية"],
                ["Transport", "Segment", "المنفذ Port"],
                ["Network", "Packet", "عنوان IP"],
                ["Data Link", "Frame", "عنوان MAC"],
                ["Physical", "Bit", "إشارات 0 و 1"],
              ],
            },
            {
              id: "m32-l01-p04-send", type: "text", origin: "book",
              spans: [
                { text: "عند الإرسال: ", style: "strong" },
                { text: "Data → Segment → Packet → Frame → Bits", style: "code" },
              ],
            },
            {
              id: "m32-l01-p04-receive", type: "text", origin: "book",
              spans: [{ text: "وعند الاستقبال بالعكس", style: "strong" }],
            },
          ],
        },
      ],
    },
  ],
};

export default m32;
