// Learning Materials — Batch 4 phase: REAL converted body for Book 791381, module m14 (the book's section
// «البروتوكولات», source PDF 87–92, complete). Stable id m14 (next free), order 10 (batch b3).
//
// The section has NO «الوحدة N» opener page and no divider: PDF 87 («أهم البروتوكولات») is the first learner page and
// PDF 92 («البروتوكولات ونوع النقل») the last. PDF 93 opens the next section («أوامر فحص الشبكة», module m15).
//
// Book-derived blocks are origin:"book" and reproduce the RENDERED source: the PDF 87 definition + facts, the protocol
// cards of PDF 88–91 (each card = the book's one-line function + its short badge), the «تذكّر» / «معًا» / «مهم» boxes and
// the PDF 92 transport table + «القاعدة». Protocol names are LTR code spans. The book's two arrow badges
// («google.com → IP», «داخلي → عام») are rendered as prose «من … إلى …» under the permanent RTL rule.
// SOURCE LEVEL: the book gives ONE short function per protocol — no port numbers, no message formats, no
// handshake, no security comparison beyond «SSH آمن / Telnet غير آمن» and «HTTPS نسخة آمنة». Nothing more is added.
// SOURCE ORDER: `ping` is printed on PDF 91 only as the book's ICMP example; the ping COMMAND (syntax, what a
// successful ping means) is PDF 93 (m15) and never appears here. Collision/Broadcast domains, STP, Duplex,
// Localhost, APIPA (PDF 98+) and the security part (PDF 107+) never appear here.
// PRINTED PAGE = the rendered page circle (PDF 87 prints «87» … PDF 92 prints «92»).

import type { ContentModule, ContentSource, InlineSpan, PracticeOption, PracticeTableSelectCell } from "../../types";

const CID = "791381";
const src = (pdf: number, printed?: number): ContentSource => ({ kind: "book", sourceId: CID, pdfPageStart: pdf, printedPage: printed });
const L = (text: string): InlineSpan => ({ text, dir: "ltr", style: "code" });
const T = (text: string): InlineSpan => ({ text });
const opt = (id: string, text: string, correct?: true): PracticeOption => (correct ? { id, text, correct } : { id, text });
const PURPOSES = ["يحوّل اسم الموقع إلى عنوان IP", "يوزّع عناوين IP تلقائيًا", "إرسال البريد بين الخوادم", "نقل الملفات بين جهاز وخادم", "تحكّم آمن ومشفّر عن بُعد", "تصفّح آمن بالتشفير", "يربط عنوان IP بعنوان MAC", "رسائل فحص وأخطاء"] as const;
const P = (key: (typeof PURPOSES)[number]): PracticeTableSelectCell => ({ kind: "select", options: [...PURPOSES], key });
const TU = (key: "TCP" | "UDP"): PracticeTableSelectCell => ({ kind: "select", options: ["TCP", "UDP"], key });

const m14: ContentModule = {
  id: "791381-m14",
  title: "البروتوكولات",
  shortTitle: "البروتوكولات",
  order: 10,
  source: { kind: "book", sourceId: CID, pdfPageStart: 87, pdfPageEnd: 92 },
  lessons: [
    // ── l01 — what a protocol is · DNS / HTTP / DHCP (PDF 87–88) ─────────────────────────────────────────────
    {
      id: "791381-m14-l01",
      title: "ما هو البروتوكول؟ · DNS / HTTP / DHCP",
      order: 1,
      pages: [
        // PDF 87 — أهم البروتوكولات
        {
          id: "791381-m14-l01-p01",
          title: "أهم البروتوكولات",
          order: 1,
          source: src(87, 87),
          keywords: ["بروتوكول", "قاعدة", "لغة", "وظيفة"],
          blocks: [
            {
              id: "m14-l01-p01-def", type: "callout", origin: "book", kind: "important",
              spans: [T("البروتوكول هو قاعدة أو لغة تتفاهم بها الأجهزة.")],
            },
            {
              id: "m14-l01-p01-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m14-l01-p01-f1", text: [T("كل خدمة في الشبكة تعتمد على بروتوكول معيّن.")] },
                { id: "m14-l01-p01-f2", text: [T("بعضها للنقل، وبعضها للتصفح أو البريد أو الأمان.")] },
                { id: "m14-l01-p01-f3", text: [T("لكل بروتوكول وظيفة واضحة ومحدّدة.")] },
              ],
            },
            {
              id: "m14-l01-p01-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("احفظ وظيفة البروتوكول مع مثال واحد فقط، لا أكثر.")],
            },
            {
              id: "m14-l01-p01-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("«لغة تتفاهم بها الأجهزة» تعني اتفاقًا على طريقة الكلام: ماذا يُرسَل أولًا، وكيف يُفهم الردّ. في الصفحات التالية ستقرأ لكل بروتوكول وظيفته بجملة واحدة ومثالًا واحدًا — وهذا كل المطلوب.")],
            },
            {
              id: "m14-l01-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "البروتوكول هو قاعدة أو لغة تتفاهم بها الأجهزة.",
                answer: true,
                feedback: {
                  hints: ["افحص الصندوق الأول في الصفحة.", "كلمة «لغة» هي المفتاح."],
                  correctFeedback: "صحيح — البروتوكول قاعدة أو لغة مشتركة بين الأجهزة.",
                  incorrectFeedback: "افحص الصندوق الأول في الصفحة: «البروتوكول هو قاعدة أو لغة تتفاهم بها الأجهزة».",
                  explanation: "كل خدمة في الشبكة تعتمد على بروتوكول معيّن، ولكل بروتوكول وظيفة واضحة.",
                },
              },
            },
            {
              id: "m14-l01-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "حسب صندوق «تذكّر»، ما الطريقة الصحيحة لحفظ البروتوكولات؟",
                options: [opt("m14-l01-p01-q2-a", "وظيفة البروتوكول مع مثال واحد فقط", true), opt("m14-l01-p01-q2-b", "حفظ شرح طويل لكل بروتوكول"), opt("m14-l01-p01-q2-c", "حفظ الأسماء فقط دون الوظيفة")],
                feedback: {
                  hints: ["افحص صندوق «تذكّر».", "«… مع مثال واحد فقط، لا أكثر»."],
                  correctFeedback: "أحسنت — الوظيفة + مثال واحد.",
                  incorrectFeedback: "افحص صندوق «تذكّر»: «احفظ وظيفة البروتوكول مع مثال واحد فقط، لا أكثر».",
                  explanation: "الكتاب يطلب الوظيفة ومثالًا واحدًا لكل بروتوكول.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 3): SVG visual enrichment appended after the book content.
              id: "m14-l01-p01-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m14/protocols-overview", motion: true,
              source: src(87),
              title: "مخطط: خريطة البروتوكولات حسب المهمة",
              alt: "مركز يتفرّع إلى فئات بروتوكولات حسب المهمة: الويب والأسماء والإعداد والبريد والملفات والإدارة عن بُعد.",
              caption: "لكل مهمة بروتوكول (أو أكثر) يقوم بها.",
            },
          ],
        },
        // PDF 88 — DNS / HTTP / DHCP
        {
          id: "791381-m14-l01-p02",
          title: "DNS / HTTP / DHCP",
          order: 2,
          source: src(88, 88),
          keywords: ["DNS", "HTTP", "DHCP", "اسم الموقع", "صفحات الويب"],
          blocks: [
            {
              id: "m14-l01-p02-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m14-l01-p02-dns", term: "DNS", text: [T("يحوّل اسم الموقع إلى عنوان "), L("IP"), T(".")], note: "من google.com إلى IP" },
                { id: "m14-l01-p02-http", term: "HTTP", text: [T("يجلب صفحات الويب من الخادم ويعرضها في المتصفح.")], note: "تصفّح المواقع" },
                { id: "m14-l01-p02-dhcp", term: "DHCP", text: [T("يوزّع عناوين "), L("IP"), T(" تلقائيًا على الأجهزة.")], note: "الحاسوب يأخذ IP تلقائيًا" },
              ],
            },
            {
              id: "m14-l01-p02-together", type: "callout", origin: "book", kind: "summary", title: "معًا",
              spans: [L("DNS"), T(" يجد العنوان، "), L("HTTP"), T(" يجلب الصفحة، و "), L("DHCP"), T(" يمنح الجهاز عنوانه — أساس تصفّح الإنترنت.")],
            },
            {
              id: "m14-l01-p02-ex1", type: "example", origin: "teacher-enrichment", mode: "solved",
              title: "مثال محلول: طالب وصل جهازه بالشبكة ثم فتح المتصفح وكتب google.com — أين يعمل كل بروتوكول؟",
              prompt: "طالب وصل جهازه بالشبكة وحصل على إعداداته تلقائيًا، ثم فتح المتصفح وكتب google.com. أين تظهر وظيفة كل بروتوكول من الثلاثة؟",
              steps: [
                { text: "عند الانضمام إلى الشبكة حصل الجهاز على عنوان IP وإعداداته تلقائيًا: هذا عمل DHCP «يوزّع عناوين IP تلقائيًا على الأجهزة»." },
                { text: "الاسم google.com ليس عنوانًا؛ DNS «يحوّل اسم الموقع إلى عنوان IP»." },
                { text: "بعد معرفة العنوان، HTTP «يجلب صفحات الويب من الخادم ويعرضها في المتصفح»." },
              ],
              result: "DHCP منح الجهاز عنوانه عند الانضمام إلى الشبكة · DNS يجد عنوان الموقع · HTTP يجلب الصفحة",
              explanation: "هذا مثال يربط وظائف البروتوكولات الثلاثة في موقف واحد. DHCP لا يلزم أن يعمل من جديد عند كل فتح صفحة إذا كان الجهاز قد حصل على عنوانه مسبقًا.",
            },
            {
              id: "m14-l01-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي بروتوكول يحوّل اسم الموقع إلى عنوان IP؟",
                options: [opt("m14-l01-p02-q1-a", "DNS", true), opt("m14-l01-p02-q1-b", "HTTP"), opt("m14-l01-p02-q1-c", "DHCP")],
                feedback: {
                  hints: ["افحص بطاقة الاسم والعنوان.", "مثال البطاقة: من google.com إلى IP."],
                  correctFeedback: "أحسنت — DNS يحوّل اسم الموقع إلى عنوان IP.",
                  incorrectFeedback: "افحص البطاقات: HTTP يجلب الصفحات، DHCP يوزّع العناوين؛ «يحوّل اسم الموقع» بطاقة أخرى.",
                  explanation: "DNS: من الاسم إلى عنوان IP.",
                },
              },
            },
            {
              id: "m14-l01-p02-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "الحاسوب أخذ عنوان IP تلقائيًا عند الاتصال بالشبكة. أي بروتوكول فعل ذلك؟",
                options: [opt("m14-l01-p02-q2-a", "HTTP"), opt("m14-l01-p02-q2-b", "DHCP", true), opt("m14-l01-p02-q2-c", "DNS")],
                feedback: {
                  hints: ["افحص البطاقة التي فيها كلمة «تلقائيًا».", "«الحاسوب يأخذ IP تلقائيًا»."],
                  correctFeedback: "أحسنت — DHCP يوزّع عناوين IP تلقائيًا على الأجهزة.",
                  incorrectFeedback: "افحص بطاقة DHCP: «يوزّع عناوين IP تلقائيًا على الأجهزة».",
                  explanation: "DHCP يمنح الجهاز عنوانه؛ DNS يجد عنوان الموقع.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 3): SVG visual enrichment appended after the book content.
              id: "m14-l01-p02-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m14/dns-http-dhcp", motion: true,
              source: src(88),
              title: "مخطط: تسلسل DHCP ثم DNS ثم HTTP",
              alt: "ثلاث خطوات مرتّبة: DHCP يمنح عنوان IP، ثم DNS يحوّل google.com إلى عنوان، ثم HTTP يجلب الصفحة.",
              caption: "من الانضمام للشبكة إلى فتح الموقع: DHCP ثم DNS ثم HTTP.",
            },
          ],
        },
      ],
    },
    // ── l02 — mail, files and remote control (PDF 89–90) ─────────────────────────────────────────────────────
    {
      id: "791381-m14-l02",
      title: "SMTP / FTP / TFTP · SSH / Telnet / NAT",
      order: 2,
      pages: [
        // PDF 89 — SMTP / FTP / TFTP
        {
          id: "791381-m14-l02-p01",
          title: "SMTP / FTP / TFTP",
          order: 1,
          source: src(89, 89),
          keywords: ["SMTP", "FTP", "TFTP", "البريد", "نقل الملفات"],
          blocks: [
            {
              id: "m14-l02-p01-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m14-l02-p01-smtp", term: "SMTP", text: [T("يُستخدم لإرسال البريد الإلكتروني بين الخوادم.")], note: "إرسال البريد" },
                { id: "m14-l02-p01-ftp", term: "FTP", text: [T("يُستخدم لنقل الملفات بين جهاز وخادم.")], note: "نقل الملفات" },
                { id: "m14-l02-p01-tftp", term: "TFTP", text: [T("نسخة بسيطة من "), L("FTP"), T("، تُستعمل كثيرًا مع أجهزة الشبكة.")], note: "نقل ملفات بسيط" },
              ],
            },
            {
              id: "m14-l02-p01-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [L("SMTP"), T(" للبريد، و "), L("FTP/TFTP"), T(" لنقل الملفات؛ و "), L("TFTP"), T(" أبسط ويُستعمل لإعداد الأجهزة.")],
            },
            {
              id: "m14-l02-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي بروتوكول يُستخدم لإرسال البريد الإلكتروني بين الخوادم؟",
                options: [opt("m14-l02-p01-q1-a", "FTP"), opt("m14-l02-p01-q1-b", "SMTP", true), opt("m14-l02-p01-q1-c", "TFTP")],
                feedback: {
                  hints: ["افحص البطاقة التي شارتها «إرسال البريد».", "الحرف M في الاسم من كلمة Mail."],
                  correctFeedback: "أحسنت — SMTP لإرسال البريد.",
                  incorrectFeedback: "افحص البطاقات: FTP و TFTP لنقل الملفات؛ «إرسال البريد» بطاقة أخرى.",
                  explanation: "SMTP للبريد، FTP/TFTP للملفات.",
                },
              },
            },
            {
              id: "m14-l02-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "TFTP نسخة بسيطة من FTP تُستعمل كثيرًا مع أجهزة الشبكة.",
                answer: true,
                feedback: {
                  hints: ["افحص بطاقة TFTP.", "الحرف T الأول يعني «بسيط» (Trivial)."],
                  correctFeedback: "صحيح — TFTP أبسط ويُستعمل لإعداد الأجهزة.",
                  incorrectFeedback: "افحص بطاقة TFTP: «نسخة بسيطة من FTP، تُستعمل كثيرًا مع أجهزة الشبكة».",
                  explanation: "صندوق «تذكّر»: TFTP أبسط ويُستعمل لإعداد الأجهزة.",
                },
              },
            },
          ],
        },
        // PDF 90 — SSH / Telnet / NAT
        {
          id: "791381-m14-l02-p02",
          title: "SSH / Telnet / NAT",
          order: 2,
          source: src(90, 90),
          keywords: ["SSH", "Telnet", "NAT", "تحكّم عن بُعد", "عنوان عام"],
          blocks: [
            {
              id: "m14-l02-p02-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m14-l02-p02-ssh", term: "SSH", text: [T("اتصال آمن ومشفّر للتحكم بالأجهزة عن بُعد.")], note: "تحكّم آمن" },
                { id: "m14-l02-p02-telnet", term: "Telnet", text: [T("تحكّم عن بُعد لكنه غير آمن لأنه لا يشفّر البيانات.")], note: "تحكّم غير آمن" },
                { id: "m14-l02-p02-nat", term: "NAT", text: [T("يحوّل عناوين الشبكة الداخلية إلى عنوان عام للإنترنت.")], note: "من داخلي إلى عام" },
              ],
            },
            {
              id: "m14-l02-p02-important", type: "callout", origin: "book", kind: "important", title: "مهم",
              spans: [T("استخدم "), L("SSH"), T(" بدل "), L("Telnet"), T(" دائمًا لأنه يشفّر البيانات؛ و "), L("NAT"), T(" يتيح مشاركة عنوان عام واحد.")],
            },
            {
              id: "m14-l02-p02-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("«عناوين الشبكة الداخلية» هي العناوين الخاصة التي تعرفها من وحدة عناوين IP، و«العنوان العام» هو العنوان الذي يظهر على الإنترنت. "), L("NAT"), T(" يجعل أجهزة كثيرة في البيت أو المدرسة تخرج إلى الإنترنت بعنوان عام واحد.")],
            },
            {
              id: "m14-l02-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "لماذا يوصي الكتاب باستخدام SSH بدل Telnet؟",
                options: [opt("m14-l02-p02-q1-a", "لأن SSH يشفّر البيانات و Telnet لا يشفّرها", true), opt("m14-l02-p02-q1-b", "لأن Telnet أبطأ"), opt("m14-l02-p02-q1-c", "لأن SSH ينقل الملفات")],
                feedback: {
                  hints: ["افحص صندوق «مهم».", "ما الذي يفعله SSH بالبيانات ولا يفعله Telnet؟"],
                  correctFeedback: "أحسنت — SSH آمن ومشفّر، و Telnet غير آمن لأنه لا يشفّر.",
                  incorrectFeedback: "افحص صندوق «مهم»: «استخدم SSH بدل Telnet دائمًا لأنه يشفّر البيانات».",
                  explanation: "الفرق الذي يذكره الكتاب هو التشفير فقط.",
                },
              },
            },
            {
              id: "m14-l02-p02-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما وظيفة NAT حسب الكتاب؟",
                options: [opt("m14-l02-p02-q2-a", "تحكّم آمن بالأجهزة عن بُعد"), opt("m14-l02-p02-q2-b", "تحويل عناوين الشبكة الداخلية إلى عنوان عام للإنترنت", true), opt("m14-l02-p02-q2-c", "توزيع عناوين IP تلقائيًا")],
                feedback: {
                  hints: ["افحص بطاقة NAT.", "الشارة: من داخلي إلى عام."],
                  correctFeedback: "أحسنت — NAT يحوّل الداخلي إلى عام ويتيح مشاركة عنوان عام واحد.",
                  incorrectFeedback: "افحص بطاقة NAT: «يحوّل عناوين الشبكة الداخلية إلى عنوان عام للإنترنت». توزيع العناوين تلقائيًا وظيفة DHCP.",
                  explanation: "NAT: من العناوين الداخلية إلى عنوان عام واحد.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 3): SVG visual enrichment appended after the book content.
              id: "m14-l02-p02-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m14/ssh-vs-telnet", motion: true,
              source: src(90),
              title: "مخطط: SSH مقابل Telnet",
              alt: "لوحتان لوصول عن بُعد: SSH بقناة مشفّرة لا تُقرأ، وTelnet بنص صريح يمكن قراءته.",
              caption: "كلاهما وصول عن بُعد · SSH يشفّر و Telnet يرسل نصًا صريحًا.",
            },
          ],
        },
      ],
    },
    // ── l03 — security / mail / checking protocols and the transport table (PDF 91–92) ────────────────────
    {
      id: "791381-m14-l03",
      title: "HTTPS / POP / IMAP / ICMP / ARP · نوع النقل",
      order: 3,
      pages: [
        // PDF 91 — HTTPS / POP / IMAP / ICMP / ARP
        {
          id: "791381-m14-l03-p01",
          title: "HTTPS / POP / IMAP / ICMP / ARP",
          order: 1,
          source: src(91, 91),
          keywords: ["HTTPS", "POP", "IMAP", "ICMP", "ARP"],
          blocks: [
            {
              id: "m14-l03-p01-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m14-l03-p01-https", term: "HTTPS", text: [T("نسخة آمنة من "), L("HTTP"), T(" تستعمل التشفير.")] },
                { id: "m14-l03-p01-pop", term: "POP / IMAP", text: [T("استلام البريد الإلكتروني من الخادم.")] },
                { id: "m14-l03-p01-icmp", term: "ICMP", text: [T("رسائل فحص وأخطاء مثل "), L("ping"), T(".")] },
                { id: "m14-l03-p01-arp", term: "ARP", text: [T("يربط عنوان "), L("IP"), T(" بعنوان "), L("MAC"), T(" داخل الشبكة.")] },
              ],
            },
            {
              id: "m14-l03-p01-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [L("HTTPS"), T(" للتصفّح الآمن، "), L("POP/IMAP"), T(" للبريد، "), L("ICMP"), T(" للفحص ("), L("ping"), T(")، و "), L("ARP"), T(" يربط "), L("IP"), T(" بـ "), L("MAC"), T(".")],
            },
            {
              id: "m14-l03-p01-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("لاحظ أن البريد له بروتوكولان في اتجاهين: "), L("SMTP"), T(" لإرساله (الصفحة السابقة) و "), L("POP/IMAP"), T(" لاستلامه من الخادم. و "), L("ARP"), T(" يربط العنوانين اللذين تعرفهما: عنوان "), L("IP"), T(" وعنوان "), L("MAC"), T(".")],
            },
            {
              id: "m14-l03-p01-match", type: "practice-table", origin: "teacher-enrichment",
              caption: "تحقّق من نفسك: ما وظيفة كل بروتوكول؟ (بكلمات الكتاب)",
              headers: ["البروتوكول", "الوظيفة"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["DNS", P("يحوّل اسم الموقع إلى عنوان IP")],
                ["SSH", P("تحكّم آمن ومشفّر عن بُعد")],
                ["DHCP", P("يوزّع عناوين IP تلقائيًا")],
                ["ARP", P("يربط عنوان IP بعنوان MAC")],
                ["SMTP", P("إرسال البريد بين الخوادم")],
                ["HTTPS", P("تصفّح آمن بالتشفير")],
                ["FTP", P("نقل الملفات بين جهاز وخادم")],
                ["ICMP", P("رسائل فحص وأخطاء")],
              ],
            },
            {
              id: "m14-l03-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي بروتوكول يربط عنوان IP بعنوان MAC داخل الشبكة؟",
                options: [opt("m14-l03-p01-q1-a", "ICMP"), opt("m14-l03-p01-q1-b", "ARP", true), opt("m14-l03-p01-q1-c", "IMAP")],
                feedback: {
                  hints: ["افحص البطاقة التي فيها العنوانان معًا.", "الاسم يبدأ بحرف A."],
                  correctFeedback: "أحسنت — ARP يربط IP بـ MAC.",
                  incorrectFeedback: "افحص البطاقات: ICMP للفحص، IMAP لاستلام البريد؛ «يربط عنوان IP بعنوان MAC» بطاقة أخرى.",
                  explanation: "ARP: من عنوان IP إلى عنوان MAC داخل الشبكة.",
                },
              },
            },
            {
              id: "m14-l03-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "HTTPS هو:",
                options: [opt("m14-l03-p01-q2-a", "نسخة آمنة من HTTP تستعمل التشفير", true), opt("m14-l03-p01-q2-b", "بروتوكول لاستلام البريد"), opt("m14-l03-p01-q2-c", "بروتوكول لنقل الملفات")],
                feedback: {
                  hints: ["افحص بطاقة HTTPS.", "الحرف S الإضافي يعني آمن."],
                  correctFeedback: "أحسنت — HTTPS نسخة آمنة من HTTP بالتشفير.",
                  incorrectFeedback: "افحص بطاقة HTTPS: «نسخة آمنة من HTTP تستعمل التشفير». استلام البريد POP/IMAP، ونقل الملفات FTP.",
                  explanation: "HTTPS للتصفّح الآمن.",
                },
              },
            },
          ],
        },
        // PDF 92 — البروتوكولات ونوع النقل
        {
          id: "791381-m14-l03-p02",
          title: "البروتوكولات ونوع النقل",
          order: 2,
          source: src(92, 92),
          keywords: ["TCP", "UDP", "نوع النقل", "الموثوقية", "السرعة"],
          blocks: [
            {
              id: "m14-l03-p02-table", type: "table", origin: "book",
              caption: "البروتوكول · وظيفته المختصرة · النقل",
              headers: ["البروتوكول", "وظيفته المختصرة", "النقل"],
              columnDirs: ["ltr", "rtl", "ltr"],
              rows: [
                ["HTTP / HTTPS", "تصفّح المواقع", "TCP"],
                ["SMTP / POP / IMAP", "البريد الإلكتروني", "TCP"],
                ["FTP / SSH / Telnet", "نقل ملفات أو تحكّم عن بُعد", "TCP"],
                ["DNS", "تحويل اسم الموقع إلى IP", "UDP غالبًا"],
                ["DHCP", "توزيع عناوين IP", "UDP"],
                ["TFTP", "نقل ملفات بسيط", "UDP"],
              ],
            },
            {
              id: "m14-l03-p02-rule", type: "callout", origin: "book", kind: "important", title: "القاعدة",
              spans: [L("TCP"), T(" للموثوقية (الويب والبريد والملفات)، و "), L("UDP"), T(" للسرعة ("), L("DNS"), T(" و "), L("DHCP"), T(") والبث.")],
            },
            {
              id: "m14-l03-p02-ex1", type: "example", origin: "teacher-enrichment", mode: "solved",
              title: "مثال محلول: لماذا FTP على TCP بينما DHCP على UDP؟",
              steps: [
                { text: "من قسم نماذج الاتصال: TCP موثوق ويتأكّد أن البيانات وصلت كاملة، و UDP سريع." },
                { text: "نقل ملف يجب أن يصل كاملًا — لذلك FTP في صف TCP." },
                { text: "توزيع عنوان IP رسالة قصيرة والسرعة أهم — لذلك DHCP في صف UDP، كما تقول «القاعدة»." },
              ],
              result: "FTP على TCP (موثوقية) · DHCP على UDP (سرعة)",
              explanation: "الجدول يطبّق قاعدة TCP/UDP التي تعلّمتها على البروتوكولات نفسها.",
            },
            {
              id: "m14-l03-p02-match", type: "practice-table", origin: "teacher-enrichment",
              caption: "تحقّق من نفسك: TCP أم UDP لكل مجموعة؟ (اعتمد على جدول الكتاب)",
              headers: ["البروتوكول", "النقل"],
              columnDirs: ["ltr", "ltr"],
              rows: [
                ["DHCP", TU("UDP")],
                ["HTTP / HTTPS", TU("TCP")],
                ["TFTP", TU("UDP")],
                ["SMTP / POP / IMAP", TU("TCP")],
                ["DNS", TU("UDP")],
                ["FTP / SSH / Telnet", TU("TCP")],
              ],
            },
            {
              id: "m14-l03-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "حسب «القاعدة»، أي مجموعة تعمل على UDP للسرعة؟",
                options: [opt("m14-l03-p02-q1-a", "DNS و DHCP", true), opt("m14-l03-p02-q1-b", "HTTP و SMTP"), opt("m14-l03-p02-q1-c", "FTP و SSH")],
                feedback: {
                  hints: ["افحص صندوق «القاعدة».", "«UDP للسرعة (… و …) والبث»."],
                  correctFeedback: "أحسنت — DNS و DHCP على UDP للسرعة.",
                  incorrectFeedback: "افحص صندوق «القاعدة»: TCP للموثوقية (الويب والبريد والملفات)، و UDP للسرعة (DNS و DHCP) والبث.",
                  explanation: "الويب والبريد والملفات على TCP؛ DNS و DHCP و TFTP على UDP.",
                },
              },
            },
            // ── closing review for the protocols section (easy, medium, exam-like) ──
            {
              id: "m14-l03-p02-review", type: "heading", origin: "teacher-enrichment", level: 3, text: "مراجعة ختامية: البروتوكولات",
            },
            {
              id: "m14-l03-p02-r1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "اكتب اسم البروتوكول الذي يحوّل اسم الموقع إلى عنوان IP (بالأحرف اللاتينية).",
                answer: "DNS",
                feedback: {
                  hints: ["افحص بطاقات صفحة DNS / HTTP / DHCP.", "ثلاثة أحرف، أولها D."],
                  correctFeedback: "صحيح — DNS.",
                  incorrectFeedback: "افحص بطاقة الاسم والعنوان في صفحة DNS / HTTP / DHCP: من google.com إلى IP.",
                  explanation: "DNS يحوّل اسم الموقع إلى عنوان IP.",
                },
              },
            },
            {
              id: "m14-l03-p02-r2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "سؤال بأسلوب الامتحان: فنّي يريد التحكم بجهاز شبكة عن بُعد بشكل آمن. أي بروتوكول يختار، ولماذا؟",
                options: [opt("m14-l03-p02-r2-a", "Telnet، لأنه أسرع"), opt("m14-l03-p02-r2-b", "SSH، لأنه اتصال آمن ومشفّر", true), opt("m14-l03-p02-r2-c", "FTP، لأنه ينقل الملفات")],
                feedback: {
                  hints: ["افحص بطاقتي SSH و Telnet.", "أيهما يشفّر البيانات؟"],
                  correctFeedback: "أحسنت — SSH اتصال آمن ومشفّر للتحكم عن بُعد.",
                  incorrectFeedback: "افحص صندوق «مهم» في صفحة SSH / Telnet / NAT: استخدم SSH بدل Telnet دائمًا لأنه يشفّر البيانات.",
                  explanation: "Telnet تحكّم غير آمن؛ SSH تحكّم آمن.",
                },
              },
            },
            {
              id: "m14-l03-p02-r3", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "سؤال بأسلوب الامتحان: أي مجموعة صحيحة تمامًا حسب جدول الكتاب؟",
                options: [opt("m14-l03-p02-r3-a", "SMTP يرسل البريد · POP/IMAP يستلمه · كلاهما على TCP", true), opt("m14-l03-p02-r3-b", "DNS يوزّع عناوين IP · على TCP"), opt("m14-l03-p02-r3-c", "TFTP نسخة بسيطة من FTP · على TCP")],
                feedback: {
                  hints: ["افحص صف البريد الإلكتروني في الجدول.", "توزيع العناوين وظيفة DHCP لا DNS، و TFTP على UDP."],
                  correctFeedback: "أحسنت — البريد: SMTP للإرسال و POP/IMAP للاستلام، وكلها في صف TCP.",
                  incorrectFeedback: "افحص جدول الصفحة: صف البريد الإلكتروني (SMTP / POP / IMAP) على TCP؛ DNS يحوّل الاسم لا يوزّع العناوين؛ TFTP على UDP.",
                  explanation: "اجمع الوظيفة (من البطاقات) مع نوع النقل (من الجدول).",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 3): SVG visual enrichment appended after the book content.
              id: "m14-l03-p02-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m14/protocols-by-transport", motion: true,
              source: src(92),
              title: "مخطط: البروتوكولات حسب نوع النقل",
              alt: "عمودان يصنّفان البروتوكولات: TCP الموثوق مثل FTP وHTTP، وUDP السريع مثل DHCP وDNS.",
              caption: "مثال: FTP على TCP (ملف كامل) · DHCP على UDP (رسالة قصيرة سريعة).",
            },
          ],
        },
      ],
    },
  ],
};

export default m14;
