// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 33 «العنونة والتجزئة».
//
// Verbatim conversion of booklet PDF pages 98–101 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every converted block is origin:"book": nothing is added, removed or reworded; bold runs are `strong`,
// monospace runs are `code`, printed box labels are the callout titles.
//
// Enrichment (docs/enterprise-791381s-enrichment-plan.md, Phase 7): teacher-enrichment blocks (an interactive
// practice-table twin under each review table — the same table with one column turned into dropdowns —, visuals and an
// IPv6 compression practice reused from course 791381 after checking their values against this section, one solved
// example on the booklet's own numbers, and the end-of-unit «تدريبات الوحدة» lesson) are ADDED after the book blocks
// they explain. The book blocks stay verbatim — pinned by the book lock (bookLock.test.ts).

import type { ContentModule, ContentSource, PracticeTableSelectCell } from "../../types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };
/** A dropdown cell of a practice-table twin: `options` = the values the column takes in the booklet table. */
const sel = (options: readonly string[]) => (key: string): PracticeTableSelectCell => ({ kind: "select", options: [...options], key });
const ADDR = sel(["127.0.0.1", "169.254.x.x", "0.0.0.0", "255.255.255.255"]);
const MSG = sel(["Unicast", "Multicast", "Broadcast"]);
const PREFIX = sel(["/8", "/16", "/24"]);
const WC = sel(["0.0.0.0", "0.0.0.255", "0.0.255.255", "255.255.255.255"]);
const V6VAL = sel(["128 bit", "8 مجموعات", "64 bit /64", "64 bit"]);
const V6SPECIAL = sel(["::1", "::", "FE80::/10", "FF00::/8"]);

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
              // ENRICHMENT: reuse of 791381/m28/subnetting-walkthrough — the same example 192.168.1.25/24 and the same four
              // results (.0 / .1 / .254 / .255) as «طريقة الحل» above.
              id: "m33-l01-p02-v-walkthrough", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m28/subnetting-walkthrough", motion: true,
              source: src(99),
              title: "مخطط: طريقة الحل للعنوان 192.168.1.25/24",
              alt: "مخطط يقسم العنوان 192.168.1.25/24 إلى جزء الشبكة (الخانات الثلاث الأولى) وجزء الجهاز (الخانة الأخيرة) عند البادئة /24، ثم يُظهر النتائج بالترتيب: الشبكة 192.168.1.0، أول جهاز 192.168.1.1، آخر جهاز 192.168.1.254، البث 192.168.1.255.",
              caption: "نصفّر جزء الأجهزة للشبكة، ونملؤه بـ 255 للبث.",
            },
            {
              id: "m33-l01-p02-count", type: "text", origin: "book",
              spans: [
                { text: "عدد الأجهزة القابلة للاستخدام = ", style: "strong" },
                { text: "2^(host) − 2", style: "code" },
              ],
            },
            {
              // ENRICHMENT: solved example — the same four steps applied to the table's second row (every number is printed in
              // the table above).
              id: "m33-l01-p02-ex-172", type: "example", origin: "teacher-enrichment", mode: "solved",
              source: src(99),
              title: "مثال محلول: الطريقة نفسها للعنوان 172.16.5.40/16",
              prompt: "طبّق خطوات طريقة الحل على السطر الثاني من الجدول: 172.16.5.40/16.",
              steps: [
                { text: "الشبكة: نصفّر جزء الأجهزة ← 172.16.0.0" },
                { text: "أول جهاز: الشبكة + 1 ← 172.16.0.1" },
                { text: "عنوان البث: نملأ جزء الأجهزة بـ 255 ← 172.16.255.255" },
                { text: "آخر جهاز: البث − 1 ← 172.16.255.254" },
              ],
              result: "الشبكة 172.16.0.0 · أول جهاز 172.16.0.1 · آخر جهاز 172.16.255.254 · البث 172.16.255.255 — كما في السطر الثاني من الجدول.",
              explanation: "لاحظ في الجدول: مع /16 تتغيّر الخانتان الأخيرتان فقط (جزء الأجهزة): 0.0 للشبكة و 255.255 للبث.",
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
            {
              // ENRICHMENT: reuse of 791381/m28/wildcard-inversion — exactly this page's example 255.255.255.0 → 0.0.0.255 and
              // the 255 − rule.
              id: "m33-l01-p03-v-inversion", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m28/wildcard-inversion", motion: true,
              source: src(100),
              title: "مخطط: قلب القناع 255.255.255.0 إلى Wildcard",
              alt: "مخطط يحوّل القناع 255.255.255.0 إلى Wildcard 0.0.0.255 خانةً خانةً: كل خانة = 255 ناقص الخانة المقابلة، فتصبح 255 صفرًا ويصبح الصفر 255.",
              caption: "خانة Wildcard = 255 − الخانة المقابلة في القناع.",
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
              // ENRICHMENT: reuse of the 791381 ipv6-compress practice with the booklet's ONLY full address from the box above;
              // the expected answer is the box's final form ③ (checked offline, case-insensitive).
              id: "m33-l01-p04-sim-compress", type: "simulation", origin: "teacher-enrichment",
              simulationType: "ipv6-compress", version: 1,
              title: "تدرّب: صغّر العنوان الكامل",
              description: "يظهر لك العنوان الكامل ①؛ اكتب شكله النهائي المصغّر ثم اضغط «تحقّق». التحقق يتم محليًا وبدون تصحيح أو حفظ، ويُتجاهل اختلاف حجم الأحرف والمسافات المحيطة. تلميحان يذكّرانك بالخطوتين دون كشف الإجابة.",
              source: src(100, 101),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "تدريب تصغير IPv6: نحذف الأصفار البادئة في كل مجموعة، ثم نستبدل المجموعات الصفرية المتتالية بـ :: مرة واحدة فقط: 2001:0DB8:0000:0000:0000:0000:0000:0001 ← 2001:DB8::1." },
              config: {
                examples: [
                  { long: "2001:0DB8:0000:0000:0000:0000:0000:0001", short: "2001:DB8::1" },
                ],
              },
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
    {
      // «تدريبات الوحدة» — ADDED enrichment: an end-of-unit exercise page after the booklet's own pages. Every question is
      // answered by this section's printed tables / text above (the explanation quotes it). The book pages are unchanged
      // (book lock).
      id: "791381s-m33-l02",
      title: "تدريبات الوحدة",
      order: 2,
      pages: [
        {
          id: "791381s-m33-l02-p01",
          title: "تدريبات الوحدة: العنونة والتجزئة",
          order: 1,
          layout: "practice",
          source: src(98, 101),
          blocks: [
            {
              // ENRICHMENT: interactive twin of the table above — the «العنوان» column becomes dropdowns.
              id: "m33-l02-p01-t01", type: "practice-table", origin: "teacher-enrichment",
              caption: "املأ العمود «العنوان»: اختر العنوان الخاص المناسب لكل معنى.",
              source: src(98),
              headers: ["العنوان", "المعنى"],
              rows: [
                [ADDR("127.0.0.1"), "الجهاز نفسه (Loopback)."],
                [ADDR("169.254.x.x"), "APIPA: عند فشل DHCP."],
                [ADDR("0.0.0.0"), "لا يوجد عنوان."],
                [ADDR("255.255.255.255"), "Broadcast للجميع."],
              ],
              columnDirs: ["ltr", "rtl"],
            },
            {
              // ENRICHMENT: interactive twin of the table above — the «النوع» column becomes dropdowns.
              id: "m33-l02-p01-t02", type: "practice-table", origin: "teacher-enrichment",
              caption: "املأ العمود «النوع»: اختر نوع الرسالة المناسب لكل معنى.",
              source: src(98, 99),
              headers: ["النوع", "المعنى"],
              rows: [
                [MSG("Unicast"), "من جهاز إلى جهاز واحد."],
                [MSG("Multicast"), "من جهاز إلى مجموعة أجهزة."],
                [MSG("Broadcast"), "من جهاز إلى جميع الأجهزة."],
              ],
              columnDirs: ["ltr", "rtl"],
            },
            {
              // ENRICHMENT: interactive twin of the table above — the «البادئة» column becomes dropdowns: the student reads
              // which part was zeroed / filled with 255 and picks the prefix.
              id: "m33-l02-p01-t03", type: "practice-table", origin: "teacher-enrichment",
              caption: "املأ العمود «البادئة»: انظر إلى الشبكة والبث في كل سطر واختر البادئة.",
              source: src(99),
              headers: ["IP", "البادئة", "الشبكة", "أول جهاز", "آخر جهاز", "البث"],
              rows: [
                ["10.5.6.7", PREFIX("/8"), "10.0.0.0", "10.0.0.1", "10.255.255.254", "10.255.255.255"],
                ["172.16.5.40", PREFIX("/16"), "172.16.0.0", "172.16.0.1", "172.16.255.254", "172.16.255.255"],
                ["192.168.1.25", PREFIX("/24"), "192.168.1.0", "192.168.1.1", "192.168.1.254", "192.168.1.255"],
              ],
              columnDirs: ["ltr", "ltr", "ltr", "ltr", "ltr", "ltr"],
            },
            {
              // ENRICHMENT: interactive twin of the table above — the «Wildcard» column becomes dropdowns.
              id: "m33-l02-p01-t04", type: "practice-table", origin: "teacher-enrichment",
              caption: "املأ العمود «Wildcard»: اختر عكس القناع في كل سطر.",
              source: src(99, 100),
              headers: ["المعنى", "Subnet Mask", "Wildcard"],
              rows: [
                ["جهاز واحد", "255.255.255.255", WC("0.0.0.0")],
                ["شبكة 24/", "255.255.255.0", WC("0.0.0.255")],
                ["شبكة 16/", "255.255.0.0", WC("0.0.255.255")],
                ["أي عنوان", "0.0.0.0", WC("255.255.255.255")],
              ],
              columnDirs: ["rtl", "ltr", "ltr"],
            },
            {
              // ENRICHMENT: interactive twin of the table above — the «القيمة» column becomes dropdowns.
              id: "m33-l02-p01-t05", type: "practice-table", origin: "teacher-enrichment",
              caption: "املأ العمود «القيمة»: اختر القيمة المناسبة لكل خاصية من خصائص IPv6.",
              source: src(100),
              headers: ["الخاصية", "القيمة", "الشرح"],
              rows: [
                ["الطول الكلّي", V6VAL("128 bit"), "أطول من IPv4 بأربع مرّات."],
                ["التقسيم", V6VAL("8 مجموعات"), "كل مجموعة Hextet = 16 bit."],
                ["جزء الشبكة Prefix", V6VAL("64 bit /64"), "الجزء الأيسر."],
                ["جزء الجهاز", V6VAL("64 bit"), "الجزء الأيمن يميّز الجهاز."],
              ],
              columnDirs: ["rtl", "ltr", "rtl"],
            },
            {
              // ENRICHMENT: interactive twin of the table above — the «العنوان الخاص» column becomes dropdowns.
              id: "m33-l02-p01-t06", type: "practice-table", origin: "teacher-enrichment",
              caption: "املأ العمود «العنوان الخاص»: اختر عنوان IPv6 المناسب لكل معنى.",
              source: src(101),
              headers: ["العنوان الخاص", "معناه"],
              rows: [
                [V6SPECIAL("::1"), "Loopback (الجهاز نفسه)"],
                [V6SPECIAL("::"), "لا يوجد عنوان"],
                [V6SPECIAL("FE80::/10"), "Link-Local (داخل الرابط فقط)"],
                [V6SPECIAL("FF00::/8"), "Multicast"],
              ],
              columnDirs: ["ltr", "rtl"],
            },
            {
              id: "m33-l02-p01-q01", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "أي عنوان يظهر عند فشل DHCP (APIPA)؟",
                options: [{ id: "a", text: "127.0.0.1" }, { id: "b", text: "169.254.x.x", correct: true }, { id: "c", text: "0.0.0.0" }, { id: "d", text: "255.255.255.255" }],
                feedback: { explanation: "جدول العناوين الخاصة: 169.254.x.x = APIPA: عند فشل DHCP. أما 127.0.0.1 فهو الجهاز نفسه (Loopback)." },
              },
            },
            {
              id: "m33-l02-p01-q02", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "matching", prompt: "صِل كل نوع رسالة بمعناه:",
                left: [{ id: "uni", text: "Unicast" }, { id: "multi", text: "Multicast" }, { id: "broad", text: "Broadcast" }],
                right: [{ id: "r1", text: "من جهاز إلى جميع الأجهزة." }, { id: "r2", text: "من جهاز إلى جهاز واحد." }, { id: "r3", text: "من جهاز إلى مجموعة أجهزة." }],
                pairs: { uni: "r2", multi: "r3", broad: "r1" },
                feedback: { explanation: "Unicast: من جهاز إلى جهاز واحد · Multicast: من جهاز إلى مجموعة أجهزة · Broadcast: من جهاز إلى جميع الأجهزة." },
              },
            },
            {
              id: "m33-l02-p01-q03", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "أي مجموعة بروتوكولات تستخدم Broadcast بحسب صندوق «تذكّر»؟",
                options: [{ id: "a", text: "HTTP · FTP · SSH" }, { id: "b", text: "SMTP · POP3 · IMAP" }, { id: "c", text: "ARP · DHCP · RIP", correct: true }],
                feedback: { explanation: "صندوق «تذكّر»: البروتوكولات التي تستخدم Broadcast: ARP · DHCP · RIP." },
              },
            },
            {
              id: "m33-l02-p01-q04", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "ordering", prompt: "رتّب خطوات طريقة الحل للعنوان 192.168.1.25/24 كما في الصفحة:",
                items: [
                  { id: "last", text: "آخر جهاز: البث − 1 ← 192.168.1.254" },
                  { id: "net", text: "الشبكة: نصفّر جزء الأجهزة ← 192.168.1.0" },
                  { id: "bc", text: "عنوان البث: نملأ جزء الأجهزة بـ 255 ← 192.168.1.255" },
                  { id: "first", text: "أول جهاز: الشبكة + 1 ← 192.168.1.1" },
                ],
                order: ["net", "first", "bc", "last"],
                feedback: { explanation: "① الشبكة: نصفّر جزء الأجهزة ② أول جهاز: الشبكة + 1 ③ عنوان البث: نملأ جزء الأجهزة بـ 255 ④ آخر جهاز: البث − 1." },
              },
            },
            {
              id: "m33-l02-p01-q05", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ما آخر جهاز في شبكة العنوان 172.16.5.40/16 بحسب الجدول؟",
                options: [{ id: "a", text: "172.16.255.255" }, { id: "b", text: "172.16.0.1" }, { id: "c", text: "172.16.0.0" }, { id: "d", text: "172.16.255.254", correct: true }],
                feedback: { explanation: "السطر الثاني في الجدول: الشبكة 172.16.0.0، أول جهاز 172.16.0.1، آخر جهاز 172.16.255.254 (البث − 1)، البث 172.16.255.255." },
              },
            },
            {
              id: "m33-l02-p01-q06", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "Wildcard هو عكس قناع الشبكة، ويُستخدم كثيرًا في قوائم ACL وبروتوكول OSPF.", answer: true, feedback: { explanation: "Wildcard = عكس قناع الشبكة. يُستخدم كثيرًا في قوائم ACL وبروتوكول OSPF." } },
            },
            {
              id: "m33-l02-p01-q07", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ما Wildcard المقابل للقناع 255.255.0.0؟",
                options: [{ id: "a", text: "0.0.255.255", correct: true }, { id: "b", text: "0.0.0.255" }, { id: "c", text: "255.255.0.0" }, { id: "d", text: "255.255.255.255" }],
                feedback: { explanation: "القاعدة: خانة Wildcard = 255 − الخانة المقابلة في القناع، فالقناع 255.255.0.0 (شبكة 16/) يقابله 0.0.255.255." },
              },
            },
            {
              id: "m33-l02-p01-q08", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "wordBank", prompt: "أكمل الفراغات من مخزن الكلمات:",
                segments: ["طول عنوان IPv6 الكلّي ", { blank: "b1" }, " bit، ويُقسم إلى ", { blank: "b2" }, " مجموعات، وكل مجموعة Hextet = ", { blank: "b3" }, " bit."],
                bank: ["64", "128", "16", "8", "32"],
                answers: { b1: "128", b2: "8", b3: "16" },
                feedback: { explanation: "جدول IPv6: الطول الكلّي 128 bit، والتقسيم 8 مجموعات، وكل مجموعة Hextet = 16 bit." },
              },
            },
            {
              id: "m33-l02-p01-q09", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ما الشكل النهائي المصغّر للعنوان 2001:0DB8:0000:0000:0000:0000:0000:0001؟",
                options: [{ id: "a", text: "2001:DB8:0:0:0:0:0:1" }, { id: "b", text: "2001:DB8::1", correct: true }, { id: "c", text: "2001::DB8::1" }, { id: "d", text: "2001:0DB8::0001" }],
                feedback: { explanation: "② نحذف الأصفار البادئة ← 2001:DB8:0:0:0:0:0:1، ③ نستبدل المجموعات الصفرية المتتالية بـ :: مرة واحدة فقط ← 2001:DB8::1." },
              },
            },
            {
              id: "m33-l02-p01-q10", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "يمكن استعمال :: أكثر من مرة في عنوان IPv6 نفسه.", answer: false, feedback: { explanation: "نستبدل المجموعات الصفرية المتتالية بـ :: — مرة واحدة فقط." } },
            },
            {
              id: "m33-l02-p01-q11", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "matching", prompt: "صِل كل عنوان IPv6 خاص بمعناه:",
                left: [{ id: "lo", text: "::1" }, { id: "none", text: "::" }, { id: "ll", text: "FE80::/10" }, { id: "mc", text: "FF00::/8" }],
                right: [{ id: "r1", text: "Multicast" }, { id: "r2", text: "لا يوجد عنوان" }, { id: "r3", text: "Link-Local (داخل الرابط فقط)" }, { id: "r4", text: "Loopback (الجهاز نفسه)" }],
                pairs: { lo: "r4", none: "r2", ll: "r3", mc: "r1" },
                feedback: { explanation: "::1 = Loopback (الجهاز نفسه) · :: = لا يوجد عنوان · FE80::/10 = Link-Local (داخل الرابط فقط) · FF00::/8 = Multicast." },
              },
            },
            {
              id: "m33-l02-p01-q12", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "في IPv6 يوجد عنوان Broadcast كما في IPv4.", answer: false, feedback: { explanation: "صندوق «تذكّر»: لا يوجد Broadcast في IPv6." } },
            },
          ],
        },
      ],
    },
  ],
};

export default m33;
