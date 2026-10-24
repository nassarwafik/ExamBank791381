// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 30 «قوائم التحكم بالوصول ACL».
//
// Verbatim conversion of booklet PDF pages 90–93 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every block is origin:"book": nothing is added, removed or reworded.

import type { ContentModule, ContentSource } from "../../types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };

const m30: ContentModule = {
  id: "791381s-m30",
  title: "قوائم التحكم بالوصول ACL",
  order: 30,
  lessons: [
    {
      id: "791381s-m30-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m30-l00-p01",
          title: "قوائم التحكم بالوصول ACL",
          order: 1,
          layout: "opener",
          source: src(90),
          blocks: [
            {
              id: "m30-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الدفعة السادسة · كتاب ص 223–229", unitNumber: "30", title: "قوائم التحكم بالوصول ACL",
              subtitle: "كيف نسمح لأجهزة بالمرور ونمنع غيرها؟ Standard وExtended — مع الأوامر.",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m30-l01",
      title: "قوائم التحكم بالوصول ACL",
      order: 1,
      pages: [
        {
          id: "791381s-m30-l01-p01",
          title: "ما هي ACL؟",
          order: 1,
          source: src(90),
          blocks: [
            {
              id: "m30-l01-p01-def", type: "text", origin: "book",
              spans: [{ text: "ACL (Access Control List) = مجموعة قواعد تسمح أو تمنع مرور البيانات في الشبكة.", style: "strong" }],
            },
            {
              id: "m30-l01-p01-intro", type: "text", origin: "book",
              spans: [
                { text: "تشبه " },
                { text: "حارس البوابة", style: "strong" },
                { text: " الذي معه قائمة بالمسموح لهم. كل حزمة تصل إلى الراوتر تُفحص حسب القائمة: " },
                { text: "permit", style: "strong" },
                { text: " = مسموح، " },
                { text: "deny", style: "strong" },
                { text: " = ممنوع." },
              ],
            },
            {
              id: "m30-l01-p01-drawing", type: "diagram", origin: "book",
              src: "/learning-assets/791381s/5c349d06c955afbb.png",
              alt: "رسم: PC1 يرسل سهمًا مكتوبًا عليه «permit · مسموح» إلى Router داخل إطار متقطع فوقه «قائمة ACL على الواجهة»، ومن الراوتر سهم مع علامة صح إلى «الخادم»؛ وPC2 خطه مكتوب عليه «deny · ممنوع» وينتهي بعلامة منع قبل الراوتر.",
              caption: "PC1 مسموح له بالوصول إلى الخادم، وPC2 ممنوع",
            },
            {
              id: "m30-l01-p01-points", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m30-l01-p01-pt1", text: [{ text: "تزيد " }, { text: "الأمان", style: "strong" }, { text: " في الشبكة." }] },
                { id: "m30-l01-p01-pt2", text: [{ text: "تمنع أجهزة أو شبكات معيّنة." }] },
                { id: "m30-l01-p01-pt3", text: [{ text: "تُستخدم غالبًا مع " }, { text: "الراوترات والجدران النارية", style: "strong" }, { text: "." }] },
              ],
            },
          ],
        },
        {
          id: "791381s-m30-l01-p02",
          title: "نوعا ACL",
          order: 2,
          source: src(90, 91),
          blocks: [
            {
              id: "m30-l01-p02-table", type: "table", origin: "book",
              headers: ["النوع", "الأرقام", "ماذا تفحص؟", "أين نضعها؟"],
              rows: [
                ["Standard", "1–99", "IP المصدر فقط (Source IP)", "قريبًا من الوجهة"],
                ["Extended", "100–199", "المصدر + الوجهة + البروتوكول + المنفذ", "قريبًا من المصدر"],
              ],
              columnDirs: ["rtl", "ltr", "rtl", "rtl"],
            },
            {
              id: "m30-l01-p02-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [
                { text: "Standard", style: "strong" },
                { text: " قريبة من الوجهة (لأنها تفحص المصدر فقط)، و" },
                { text: "Extended", style: "strong" },
                { text: " قريبة من المصدر (لأنها تفحص كل شيء)." },
              ],
            },
          ],
        },
        {
          id: "791381s-m30-l01-p03",
          title: "Standard ACL خطوة خطوة",
          order: 3,
          source: src(91),
          blocks: [
            { id: "m30-l01-p03-cli-h", type: "heading", origin: "book", level: 4, text: "Router CLI", dir: "ltr" },
            {
              id: "m30-l01-p03-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: [
                "① Router(config)# access-list 10 permit 192.168.1.0 0.0.0.255",
                "② Router(config)# interface g0/0",
                "③ Router(config-if)# ip access-group 10 out",
              ].join("\n"),
            },
            {
              id: "m30-l01-p03-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                {
                  id: "m30-l01-p03-s1",
                  text: [
                    { text: "قائمة رقم " },
                    { text: "10", style: "strong" },
                    { text: " تسمح للشبكة 192.168.1.0/24 (Wildcard " },
                    { text: "0.0.0.255", style: "strong" },
                    { text: ")." },
                  ],
                },
                { id: "m30-l01-p03-s2", text: [{ text: "نحدّد الواجهة التي نريد تطبيق القائمة عليها." }] },
                {
                  id: "m30-l01-p03-s3",
                  text: [
                    { text: "نربط القائمة بالواجهة: " },
                    { text: "out", style: "strong" },
                    { text: " = للبيانات الخارجة من الواجهة، و" },
                    { text: "in", style: "strong" },
                    { text: " = للبيانات الداخلة إليها." },
                  ],
                },
              ],
            },
            {
              id: "m30-l01-p03-mistake", type: "callout", origin: "book", kind: "summary", title: "خطأ شائع",
              spans: [
                { text: "كتابة القائمة وحدها لا تكفي! بدون " },
                { text: "ip access-group", style: "strong" },
                { text: " على الواجهة القائمة " },
                { text: "لا تعمل إطلاقًا", style: "strong" },
                { text: "." },
              ],
            },
          ],
        },
        {
          id: "791381s-m30-l01-p04",
          title: "أمثلة Standard ACL",
          order: 4,
          source: src(91, 92),
          blocks: [
            {
              id: "m30-l01-p04-table", type: "table", origin: "book",
              headers: ["الأمر", "معناه"],
              rows: [
                ["access-list 10 permit 192.168.1.0 0.0.0.255", "السماح لشبكة كاملة."],
                ["access-list 20 deny 192.168.2.0 0.0.0.255", "منع شبكة كاملة."],
                ["access-list 20 permit any", "السماح لكل الباقي."],
                ["access-list 30 permit host 192.168.1.10", "السماح لجهاز واحد فقط (host)."],
                ["ip access-group 40 in", "تطبيق القائمة 40 على الواجهة للبيانات الداخلة."],
              ],
              columnDirs: ["ltr", "rtl"],
            },
            {
              id: "m30-l01-p04-implicit", type: "callout", origin: "book", kind: "summary", title: "في الامتحان · الرفض الضمني",
              spans: [
                { text: "كل ACL تنتهي ضمنيًا بـ " },
                { text: "deny any", style: "strong" },
                { text: " غير مكتوب. أي عنوان لا تسمح له صراحةً " },
                { text: "يُمنع تلقائيًا", style: "strong" },
                { text: ". لذلك بعد deny نكتب " },
                { text: "permit any", style: "strong" },
                { text: " حتى لا نمنع الجميع." },
              ],
            },
          ],
        },
        {
          id: "791381s-m30-l01-p05",
          title: "Extended ACL",
          order: 5,
          source: src(92, 93),
          blocks: [
            {
              id: "m30-l01-p05-points", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m30-l01-p05-pt1", text: [{ text: "تحدّد البروتوكول: " }, { text: "TCP / UDP / ICMP", style: "strong" }, { text: "." }] },
                { id: "m30-l01-p05-pt2", text: [{ text: "تحدّد IP " }, { text: "المصدر والوجهة", style: "strong" }, { text: "." }] },
                { id: "m30-l01-p05-pt3", text: [{ text: "تحدّد المنفذ " }, { text: "Port", style: "strong" }, { text: " مثل 80 أو 443." }] },
                { id: "m30-l01-p05-pt4", text: [{ text: "أرقامها غالبًا من " }, { text: "100 إلى 199", style: "strong" }, { text: "." }] },
              ],
            },
            { id: "m30-l01-p05-cli-h", type: "heading", origin: "book", level: 4, text: "Router CLI", dir: "ltr" },
            {
              id: "m30-l01-p05-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: "① Router(config)# access-list 100 permit tcp any any eq 80",
            },
            {
              id: "m30-l01-p05-parts", type: "table", origin: "book",
              headers: ["الجزء", "permit", "tcp", "any (الأولى)", "any (الثانية)", "eq 80"],
              rows: [["معناه", "سماح", "البروتوكول", "أي مصدر", "أي وجهة", "المنفذ HTTP = 80"]],
            },
            { id: "m30-l01-p05-example-h", type: "heading", origin: "book", level: 4, text: "مثال" },
            {
              id: "m30-l01-p05-example-cmd", type: "text", origin: "book",
              spans: [{ text: "access-list 100 permit tcp 192.168.1.0 0.0.0.255 any eq 80", style: "code" }],
            },
            {
              id: "m30-l01-p05-example-text", type: "text", origin: "book",
              spans: [
                { text: "يسمح لأجهزة الشبكة 192.168.1.0/24 بتصفّح المواقع (HTTP) إلى أي وجهة. ثم نطبّقها قرب المصدر: " },
                { text: "ip access-group 100 in", style: "code" },
              ],
            },
            {
              id: "m30-l01-p05-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [
                { text: "Extended " },
                { text: "أكثر تفصيلًا", style: "strong" },
                { text: " من Standard لأنها تفحص المصدر والوجهة والبروتوكول والمنفذ معًا." },
              ],
            },
            {
              id: "m30-l01-p05-exam", type: "text", origin: "book",
              spans: [{ text: "في ACL: الكلمة permit تسمح، والكلمة deny تمنع، وفي النهاية deny any مخفي", style: "strong" }],
            },
          ],
        },
      ],
    },
  ],
};

export default m30;
