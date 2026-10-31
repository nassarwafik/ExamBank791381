// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 10 «البروتوكولات».
//
// Verbatim conversion of booklet PDF pages 31–32 (the section header box → an opener page; the section has no numbered
// sub-topics, so its whole body is one reader page). Every converted block is origin:"book": nothing is added, removed or reworded.
//
// Enrichment (docs/enterprise-791381s-enrichment-plan.md, Phase 5): teacher-enrichment blocks (visuals / activities reused from
// course 791381 after checking their labels against this section, and the end-of-unit «تدريبات الوحدة» lesson) are ADDED after the
// book blocks they explain. The book blocks stay verbatim — pinned by the book lock (bookLock.test.ts).

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
            {
              // ENRICHMENT: SVG — why «استخدم SSH بدل Telnet دائمًا»: both control a device remotely, only SSH encrypts.
              id: "m10-l01-p01-v-ssh-telnet", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m14/ssh-vs-telnet", motion: true,
              source: src(32),
              title: "رسم توضيحي: SSH مشفّر و Telnet غير مشفّر",
              alt: "لوحتان: في لوحة SSH يتصل جهاز بجهاز آخر عبر قناة مكتوب عليها «مشفّر — لا يمكن قراءتها»، وفي لوحة Telnet يتصل عبر قناة مكتوب عليها «مكشوف — نص صريح يمكن قراءته».",
              caption: "كلاهما للتحكم بالأجهزة عن بُعد، لكن SSH يشفّر البيانات و Telnet لا يشفّرها.",
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
            {
              // ENRICHMENT: SVG — the «معًا» sentence above as three ordered steps: DHCP gives the device its IP, DNS finds the
              // site's IP, HTTP fetches the page.
              id: "m10-l01-p01-v-google-steps", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m14/dns-http-dhcp", motion: true,
              source: src(32),
              title: "مخطط: ثلاث خطوات لفتح google.com",
              alt: "ثلاث خطوات مرقّمة من اليمين: 1 DHCP يمنح الجهاز عنوان IP تلقائيًا، 2 DNS يحوّل google.com إلى عنوان IP، 3 HTTP يجلب صفحة الويب من الخادم، وعلامة تتقدّم من خطوة إلى التي بعدها.",
              caption: "DHCP يمنح الجهاز عنوانه، ثم DNS يجد عنوان الموقع، ثم HTTP يجلب الصفحة.",
            },
          ],
        },
      ],
    },
    {
      // «تدريبات الوحدة» — ADDED enrichment: an end-of-unit exercise page after the booklet's own pages. Every question is
      // answered by the section's printed text above (the explanation quotes it). The book pages are unchanged (book lock).
      id: "791381s-m10-l02",
      title: "تدريبات الوحدة",
      order: 2,
      pages: [
        {
          id: "791381s-m10-l02-p01",
          title: "تدريبات الوحدة: البروتوكولات",
          order: 1,
          layout: "practice",
          source: src(31, 32),
          blocks: [
            {
              id: "m10-l02-p01-q01", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ما هو البروتوكول؟",
                options: [{ id: "a", text: "جهاز يربط الشبكات ببعضها." }, { id: "b", text: "قاعدة أو لغة تتفاهم بها الأجهزة.", correct: true }, { id: "c", text: "كابل ينقل الإشارات بين الأجهزة." }, { id: "d", text: "برنامج لتصفّح المواقع فقط." }],
                feedback: { explanation: "البروتوكول = قاعدة أو لغة تتفاهم بها الأجهزة. كل خدمة في الشبكة تعتمد على بروتوكول معيّن، ولكل بروتوكول وظيفة واضحة." },
              },
            },
            {
              id: "m10-l02-p01-q02", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "أيّ بروتوكول يحوّل اسم الموقع إلى عنوان IP؟",
                options: [{ id: "a", text: "DHCP" }, { id: "b", text: "ARP" }, { id: "c", text: "DNS", correct: true }, { id: "d", text: "SMTP" }],
                feedback: { explanation: "DNS يحوّل اسم الموقع إلى عنوان IP. مثال للحفظ: google.com → IP." },
              },
            },
            {
              id: "m10-l02-p01-q03", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "فنّي يريد التحكم بجهاز شبكة عن بُعد باتصال آمن ومشفّر. أيّ بروتوكول يستعمل؟",
                options: [{ id: "a", text: "Telnet" }, { id: "b", text: "TFTP" }, { id: "c", text: "FTP" }, { id: "d", text: "SSH", correct: true }],
                feedback: { explanation: "SSH: اتصال آمن ومشفّر للتحكم بالأجهزة عن بُعد. استخدم SSH بدل Telnet دائمًا لأنه يشفّر البيانات." },
              },
            },
            {
              id: "m10-l02-p01-q04", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "أيّ بروتوكول يوزّع عناوين IP على الأجهزة تلقائيًا؟",
                options: [{ id: "a", text: "DHCP", correct: true }, { id: "b", text: "DNS" }, { id: "c", text: "NAT" }, { id: "d", text: "HTTPS" }],
                feedback: { explanation: "DHCP يوزّع عناوين IP على الأجهزة تلقائيًا. مثال للحفظ: الحاسوب يأخذ IP تلقائيًا." },
              },
            },
            {
              id: "m10-l02-p01-q05", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "Telnet آمن لأنه يشفّر البيانات.", answer: false, feedback: { explanation: "Telnet: تحكّم عن بُعد، لكنه غير آمن لأنه لا يشفّر البيانات. SSH هو الذي يشفّر البيانات." } },
            },
            {
              id: "m10-l02-p01-q06", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "HTTPS نسخة آمنة من HTTP تستعمل التشفير.", answer: true, feedback: { explanation: "HTTPS: نسخة آمنة من HTTP تستعمل التشفير. مثال للحفظ: تصفّح آمن 🔒." } },
            },
            {
              id: "m10-l02-p01-q07", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "أيّ بروتوكول نستعمله لاستلام البريد الإلكتروني من الخادم؟",
                options: [{ id: "a", text: "SMTP" }, { id: "b", text: "FTP" }, { id: "c", text: "POP / IMAP", correct: true }, { id: "d", text: "ARP" }],
                feedback: { explanation: "POP / IMAP: استلام البريد الإلكتروني من الخادم. أما SMTP فلإرسال البريد الإلكتروني بين الخوادم." },
              },
            },
            {
              id: "m10-l02-p01-q08", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "أيّ بروتوكول هو نسخة بسيطة من FTP، تُستعمل كثيرًا مع أجهزة الشبكة؟",
                options: [{ id: "a", text: "HTTP" }, { id: "b", text: "TFTP", correct: true }, { id: "c", text: "SSH" }, { id: "d", text: "SMTP" }],
                feedback: { explanation: "TFTP: نسخة بسيطة من FTP، تُستعمل كثيرًا مع أجهزة الشبكة. مثال للحفظ: نقل ملفات بسيط." },
              },
            },
            {
              id: "m10-l02-p01-q09", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "matching", prompt: "صِل كل بروتوكول بوظيفته:",
                left: [
                  { id: "dns", text: "DNS" },
                  { id: "dhcp", text: "DHCP" },
                  { id: "arp", text: "ARP" },
                  { id: "smtp", text: "SMTP" },
                  { id: "nat", text: "NAT" },
                  { id: "icmp", text: "ICMP" },
                ],
                right: [
                  { id: "r1", text: "إرسال البريد الإلكتروني بين الخوادم" },
                  { id: "r2", text: "يربط عنوان IP بعنوان MAC داخل الشبكة" },
                  { id: "r3", text: "يحوّل اسم الموقع إلى عنوان IP" },
                  { id: "r4", text: "يوزّع عناوين IP على الأجهزة تلقائيًا" },
                  { id: "r5", text: "رسائل فحص وأخطاء" },
                  { id: "r6", text: "يحوّل عناوين الشبكة الداخلية إلى عنوان عام للإنترنت" },
                ],
                pairs: { dns: "r3", dhcp: "r4", arp: "r2", smtp: "r1", nat: "r6", icmp: "r5" },
                feedback: { explanation: "من الجدول: DNS يحوّل اسم الموقع إلى عنوان IP؛ DHCP يوزّع عناوين IP تلقائيًا؛ ARP يربط IP بـ MAC داخل الشبكة؛ SMTP إرسال البريد بين الخوادم؛ NAT يحوّل العناوين الداخلية إلى عنوان عام؛ ICMP رسائل فحص وأخطاء (ping)." },
              },
            },
            {
              id: "m10-l02-p01-q10", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "classify", prompt: "صنّف كل بروتوكول حسب عمود «النقل» في الجدول:",
                groups: [{ id: "tcp", text: "TCP" }, { id: "udp", text: "UDP" }],
                items: [
                  { id: "http", text: "HTTP" },
                  { id: "dhcp", text: "DHCP" },
                  { id: "smtp", text: "SMTP" },
                  { id: "ssh", text: "SSH" },
                  { id: "tftp", text: "TFTP" },
                  { id: "ftp", text: "FTP" },
                  { id: "telnet", text: "Telnet" },
                  { id: "https", text: "HTTPS" },
                ],
                assign: { http: "tcp", dhcp: "udp", smtp: "tcp", ssh: "tcp", tftp: "udp", ftp: "tcp", telnet: "tcp", https: "tcp" },
                feedback: { explanation: "في عمود «النقل»: HTTP و HTTPS و SMTP و FTP و SSH و Telnet على TCP، و DHCP و TFTP على UDP. القاعدة: TCP للموثوقية، UDP للسرعة." },
              },
            },
            {
              id: "m10-l02-p01-q11", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "ordering", prompt: "رتّب ما يحدث عندما تفتح google.com:",
                items: [
                  { id: "https", text: "HTTPS يجلب الصفحة ويعرضها في المتصفح بشكل آمن." },
                  { id: "dhcp", text: "DHCP أعطى حاسوبك عنوان IP عندما اتصل بالشبكة." },
                  { id: "dns", text: "DNS يجد عنوان IP الخاص بالموقع google.com." },
                ],
                order: ["dhcp", "dns", "https"],
                feedback: { explanation: "مثال الصفحة: 1) DHCP أعطى حاسوبك عنوان IP عندما اتصل بالشبكة، 2) DNS يجد عنوان IP الخاص بالموقع، 3) HTTPS يجلب الصفحة ويعرضها في المتصفح بشكل آمن." },
              },
            },
            {
              id: "m10-l02-p01-q12", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "wordBank", prompt: "أكمل «القاعدة» من مخزن الكلمات:",
                segments: [{ blank: "b1" }, " للموثوقية: الويب والبريد والملفات والتحكم عن بعد. ", { blank: "b2" }, " للسرعة: DNS و DHCP و ", { blank: "b3" }, " والبث."],
                bank: ["UDP", "SSH", "TCP", "FTP", "TFTP"],
                answers: { b1: "TCP", b2: "UDP", b3: "TFTP" },
                feedback: { explanation: "القاعدة: TCP للموثوقية: الويب والبريد والملفات والتحكم عن بعد. UDP للسرعة: DNS و DHCP و TFTP والبث." },
              },
            },
            { id: "m10-l02-p01-lib-t11", type: "library-training", origin: "teacher-enrichment", trainingId: "T11", label: "تدريب 11", requiredModuleId: "791381s-m10" },
          ],
        },
      ],
    },
  ],
};

export default m10;
