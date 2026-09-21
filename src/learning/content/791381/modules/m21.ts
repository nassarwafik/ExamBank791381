// Learning Materials — Batch 8 phase: REAL converted body for Book 791381, module m21 (the book's section
// «IPv6 والمنافذ», source PDF 166–168 — three pages under the running header «IPv6 والمنافذ», no section cover).
// NEW stable id m21, reading `order` 19: after m20 («Wi-Fi والشبكات اللاسلكية», order 18) and before m22 («بروتوكول
// DHCP», order 20). Book-derived blocks are origin:"book": the PDF 166 IPv6 facts + «تذكّر», the PDF 167 full /
// shortened address table + «القاعدة», the PDF 168 ports table + «الفكرة». Technical tokens (IPv6, IPv4, 128 / 32 بت,
// Hexadecimal, the six addresses, ::, HTTP, HTTPS, SMTP, POP3, IMAP, SSH, FTP, Telnet, DNS, IP, the port numbers) are
// LTR spans; no arrow glyphs. The addresses are copied character by character from the book.
// SOURCE LEVEL: the book gives the IPv6 idea (128 bit, hexadecimal, three shortening examples, the «::» rule) and one
// port table — no IPv6 address types, prefixes, subnetting, or transport-layer details. Nothing more is added.
// SOURCE ORDER: nothing from PDF 169+ (DHCP) or PDF 180+ (Port Security, passwords) appears here.
// PRINTED PAGE = the rendered page circle = the PDF index (PDF 166 prints «166» … PDF 168 prints «168»).

import type { ContentModule, ContentSource, InlineSpan, PracticeOption, PracticeTableSelectCell } from "../../types";

const CID = "791381";
const src = (pdf: number, printed?: number): ContentSource => ({ kind: "book", sourceId: CID, pdfPageStart: pdf, printedPage: printed });
const L = (text: string): InlineSpan => ({ text, dir: "ltr", style: "code" });
const T = (text: string): InlineSpan => ({ text });
const opt = (id: string, text: string, correct?: true): PracticeOption => (correct ? { id, text, correct } : { id, text });
const SERVICES = ["HTTP", "HTTPS", "SSH", "FTP", "DNS", "Telnet"] as const;
const SV = (key: (typeof SERVICES)[number]): PracticeTableSelectCell => ({ kind: "select", options: [...SERVICES], key });

const m21: ContentModule = {
  id: "791381-m21",
  title: "IPv6 والمنافذ",
  shortTitle: "IPv6 والمنافذ",
  order: 19,
  source: { kind: "book", sourceId: CID, pdfPageStart: 166, pdfPageEnd: 168, sourceNote: "ثلاث صفحات تحت العنوان الجاري «IPv6 والمنافذ» (PDF 166–168) بلا صفحة عنوان خاصة. PDF 165 آخر صفحة في وحدة Wi-Fi (m20)، و PDF 169 تبدأ وحدة «بروتوكول DHCP» (m22)." },
  lessons: [
    {
      id: "791381-m21-l01",
      title: "IPv6 والمنافذ المهمة",
      order: 1,
      pages: [
        // PDF 166 — IPv6 — عنوان الجيل الجديد
        {
          id: "791381-m21-l01-p01",
          title: "IPv6 — عنوان الجيل الجديد",
          order: 1,
          source: src(166, 166),
          keywords: ["IPv6", "IPv4", "128 بت", "Hexadecimal"],
          blocks: [
            {
              id: "m21-l01-p01-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m21-l01-p01-f1", text: [L("IPv6"), T(" رقم مميّز لكل جهاز متصل بالشبكة.")] },
                { id: "m21-l01-p01-f2", text: [T("جاء لأن عناوين "), L("IPv4"), T(" أصبحت غير كافية.")] },
                { id: "m21-l01-p01-f3", text: [T("طوله "), L("128"), T(" بت، فيعطي عددًا هائلًا من العناوين.")] },
                { id: "m21-l01-p01-f4", text: [T("يُكتب بالميزان السادس عشر "), L("Hexadecimal"), T(".")] },
              ],
            },
            {
              id: "m21-l01-p01-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [L("IPv4 = 32"), T(" بت، و "), L("IPv6 = 128"), T(" بت.")],
            },
            {
              id: "m21-l01-p01-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("الميزان السادس عشر هو الذي درسته في وحدة الأعداد: أرقامه من "), L("0"), T(" إلى "), L("9"), T(" ثم الحروف من "), L("a"), T(" إلى "), L("f"), T(". لذلك تظهر حروف مثل "), L("d"), T(" و "), L("b"), T(" و "), L("f"), T(" داخل عنوان "), L("IPv6"), T(".")],
            },
            {
              id: "m21-l01-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "لماذا جاء IPv6 بحسب الكتاب؟",
                options: [opt("m21-l01-p01-q1-a", "لأن عناوين IPv4 أصبحت غير كافية", true), opt("m21-l01-p01-q1-b", "لأن IPv4 أطول من اللازم"), opt("m21-l01-p01-q1-c", "لأن الشبكات اللاسلكية لا تقبل IPv4")],
                feedback: {
                  hints: ["السطر الثاني في قائمة الحقائق.", "الكلمة المفتاحية: «غير كافية»."],
                  correctFeedback: "صحيح — IPv6 جاء لأن عناوين IPv4 لم تعد كافية.",
                  incorrectFeedback: "افحص السطر: «جاء لأن عناوين IPv4 أصبحت غير كافية».",
                  explanation: "طول IPv6 هو 128 بت، فيعطي عددًا هائلًا من العناوين مقارنة بـ 32 بت في IPv4.",
                },
              },
            },
            {
              id: "m21-l01-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "كم بتًا طول عنوان IPv6؟ (اكتب الرقم فقط)", answer: "128",
                feedback: {
                  hints: ["اقرأ صندوق «تذكّر».", "IPv4 = 32 بت، فكم IPv6؟"],
                  correctFeedback: "صحيح — 128 بت.",
                  incorrectFeedback: "افحص صندوق «تذكّر»: «IPv6 = 128 بت».",
                  explanation: "IPv4 طوله 32 بت، بينما IPv6 طوله 128 بت، ويُكتب بالميزان السادس عشر.",
                },
              },
            },
          ],
        },
        // PDF 167 — أمثلة اختصار IPv6
        {
          id: "791381-m21-l01-p02",
          title: "أمثلة اختصار IPv6",
          order: 2,
          source: src(167, 167),
          keywords: ["اختصار IPv6", "::", "الأصفار المتتالية", "2001:db8::ff00:42:8329"],
          blocks: [
            {
              id: "m21-l01-p02-table", type: "table", origin: "book", caption: "أمثلة اختصار IPv6 كما في جدول الكتاب",
              headers: ["العنوان الكامل", "العنوان المختصر"],
              rows: [
                ["2001:0db8:0000:0000:0000:ff00:0042:8329", "2001:db8::ff00:42:8329"],
                ["fe80:0000:0000:0000:0202:b3ff:fe1e:8329", "fe80::202:b3ff:fe1e:8329"],
                ["2a00:8640:0000:0000:0200:23ff:fe10:8329", "2a00:8640::200:23ff:fe10:8329"],
              ],
              columnDirs: ["ltr", "ltr"],
            },
            {
              id: "m21-l01-p02-rule", type: "callout", origin: "book", kind: "important", title: "القاعدة",
              spans: [T("نختصر الأصفار المتتالية باستعمال "), L("::"), T(" مرة واحدة فقط في العنوان.")],
            },
            {
              id: "m21-l01-p02-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("لاحظ في أمثلة الكتاب أمرين: الأصفار في بداية كل مقطع تُحذف ("), L("0db8"), T(" تصبح "), L("db8"), T("، و "), L("0042"), T(" تصبح "), L("42"), T(")، والمقاطع المكوّنة من أصفار فقط والمتتالية تُستبدل بـ "), L("::"), T(" مرة واحدة فقط.")],
            },
            {
              id: "m21-l01-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما الاختصار الصحيح للعنوان fe80:0000:0000:0000:0202:b3ff:fe1e:8329 كما في الكتاب؟",
                options: [opt("m21-l01-p02-q1-a", "fe80::202:b3ff:fe1e:8329", true), opt("m21-l01-p02-q1-b", "fe80::0202:b3ff::8329"), opt("m21-l01-p02-q1-c", "fe80:0:0:0:202:b3ff:fe1e:8329::")],
                feedback: {
                  hints: ["الصف الثاني في جدول الكتاب.", "القاعدة: :: مرة واحدة فقط، وتُحذف الأصفار في بداية المقطع."],
                  correctFeedback: "صحيح — fe80::202:b3ff:fe1e:8329.",
                  incorrectFeedback: "افحص الصف الثاني في الجدول وقاعدة «مرة واحدة فقط».",
                  explanation: "المقاطع الثلاثة الصفرية المتتالية تصبح ::، والمقطع 0202 يصبح 202 بحذف الصفر الأول.",
                },
              },
            },
            {
              id: "m21-l01-p02-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "يمكن استعمال :: أكثر من مرة في العنوان الواحد.", answer: false,
                feedback: {
                  hints: ["اقرأ صندوق «القاعدة».", "الكلمات الأخيرة: «مرة واحدة فقط»."],
                  correctFeedback: "صحيح — :: تُستعمل مرة واحدة فقط في العنوان.",
                  incorrectFeedback: "افحص القاعدة: «باستعمال :: مرة واحدة فقط في العنوان».",
                  explanation: "لو استُعملت :: مرتين لما عرفنا كم مقطعًا صفريًا يمثّل كل واحد منها؛ لذلك تُستعمل مرة واحدة فقط.",
                },
              },
            },
          ],
        },
        // PDF 168 — Ports — المنافذ المهمة (module closing page + review)
        {
          id: "791381-m21-l01-p03",
          title: "Ports — المنافذ المهمة",
          order: 3,
          source: src(168, 168),
          keywords: ["Port", "HTTP 80", "HTTPS 443", "SSH 22", "DNS 53", "FTP 21", "Telnet 23"],
          blocks: [
            {
              id: "m21-l01-p03-table", type: "table", origin: "book", caption: "المنافذ المهمة كما في جدول الكتاب",
              headers: ["الخدمة", "Port", "الاستخدام"],
              rows: [
                ["HTTP", "80", "تصفّح مواقع الويب"],
                ["HTTPS", "443", "تصفّح آمن"],
                ["SMTP", "25", "إرسال بريد"],
                ["POP3", "110", "استقبال بريد"],
                ["IMAP", "143", "استقبال بريد"],
                ["SSH", "22", "اتصال آمن"],
                ["FTP", "21", "نقل ملفات"],
                ["Telnet", "23", "اتصال غير آمن"],
                ["DNS", "53", "تحويل اسم الموقع إلى IP"],
              ],
              columnDirs: ["ltr", "ltr", "rtl"],
            },
            {
              id: "m21-l01-p03-idea", type: "callout", origin: "book", kind: "summary", title: "الفكرة",
              spans: [T("المنفذ يساعد الجهاز أن يعرف لأي خدمة وصلت البيانات.")],
            },
            {
              // ENRICHMENT (Batch 6): SVG visual enrichment appended after the book content.
              id: "m21-l01-p03-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m21/well-known-ports", motion: false,
              source: src(168),
              title: "مخطط: المنافذ المهمة وأرقامها",
              alt: "مخطط لأرقام المنافذ المعروفة: HTTP 80 و HTTPS 443 و DNS 53 و SSH 22 و Telnet 23 و FTP 21 و SMTP 25 و POP3 110 و IMAP 143.",
              caption: "‏لكل خدمة رقم منفذ ثابت.",
            },
            {
              id: "m21-l01-p03-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("لاحظ الأزواج في الجدول: "), L("HTTP 80"), T(" و "), L("HTTPS 443"), T(" للتصفّح (الثاني آمن)، و "), L("Telnet 23"), T(" و "), L("SSH 22"), T(" للاتصال بجهاز آخر (الثاني آمن). البريد له ثلاثة منافذ: "), L("SMTP 25"), T(" للإرسال، و "), L("POP3 110"), T(" و "), L("IMAP 143"), T(" للاستقبال.")],
            },
            {
              id: "m21-l01-p03-ws", type: "practice-table", origin: "teacher-enrichment", caption: "ورقة عمل: اختر الخدمة التي تعمل على كل منفذ (اعتمد على جدول الكتاب)",
              headers: ["Port", "الخدمة"],
              rows: [
                ["443", SV("HTTPS")],
                ["22", SV("SSH")],
                ["53", SV("DNS")],
                ["21", SV("FTP")],
              ],
              columnDirs: ["ltr", "ltr"],
            },
            {
              id: "m21-l01-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "ما رقم منفذ HTTP؟ (اكتب الرقم فقط)", answer: "80",
                feedback: {
                  hints: ["الصف الأول في جدول الكتاب.", "منفذ تصفّح مواقع الويب غير الآمن."],
                  correctFeedback: "صحيح — HTTP على المنفذ 80.",
                  incorrectFeedback: "افحص الصف الأول في الجدول: HTTP.",
                  explanation: "HTTP 80 لتصفّح مواقع الويب، و HTTPS 443 للتصفّح الآمن.",
                },
              },
            },
            { id: "m21-l01-p03-review", type: "heading", origin: "teacher-enrichment", text: "مراجعة الوحدة", level: 3 },
            {
              id: "m21-l01-p03-r1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "بأي ميزان يُكتب عنوان IPv6؟",
                options: [opt("m21-l01-p03-r1-a", "السادس عشر (Hexadecimal)", true), opt("m21-l01-p03-r1-b", "الثنائي فقط"), opt("m21-l01-p03-r1-c", "العشري المنقوط مثل IPv4")],
                feedback: {
                  hints: ["الصفحة الأولى في هذه الوحدة.", "الحروف a إلى f تظهر في العنوان."],
                  correctFeedback: "صحيح — يُكتب بالميزان السادس عشر.",
                  incorrectFeedback: "افحص صفحة «IPv6 — عنوان الجيل الجديد».",
                  explanation: "IPv6 طوله 128 بت ويُكتب بالميزان السادس عشر Hexadecimal.",
                },
              },
            },
            {
              id: "m21-l01-p03-r2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما الاختصار الصحيح للعنوان 2001:0db8:0000:0000:0000:ff00:0042:8329؟",
                options: [opt("m21-l01-p03-r2-a", "2001:db8::ff00:42:8329", true), opt("m21-l01-p03-r2-b", "2001:db8::ff00::42:8329"), opt("m21-l01-p03-r2-c", "2001:0db8::0042:8329")],
                feedback: {
                  hints: ["الصف الأول في جدول الاختصار.", ":: مرة واحدة فقط، وتُحذف أصفار بداية المقطع."],
                  correctFeedback: "صحيح — 2001:db8::ff00:42:8329.",
                  incorrectFeedback: "افحص جدول «أمثلة اختصار IPv6» وقاعدة «مرة واحدة فقط».",
                  explanation: "المقاطع الصفرية المتتالية الثلاثة تصبح ::، و 0db8 تصبح db8، و 0042 تصبح 42.",
                },
              },
            },
            {
              id: "m21-l01-p03-r3", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما الخدمة التي تعمل على المنفذ 53 بحسب جدول الكتاب؟",
                options: [opt("m21-l01-p03-r3-a", "DNS — تحويل اسم الموقع إلى IP", true), opt("m21-l01-p03-r3-b", "SSH — اتصال آمن"), opt("m21-l01-p03-r3-c", "FTP — نقل ملفات")],
                feedback: {
                  hints: ["الصف الأخير في جدول المنافذ.", "الخدمة التي تحوّل اسم الموقع إلى عنوان."],
                  correctFeedback: "صحيح — DNS على المنفذ 53.",
                  incorrectFeedback: "افحص الصف الأخير من الجدول.",
                  explanation: "DNS 53 يحوّل اسم الموقع إلى IP؛ SSH 22 اتصال آمن؛ FTP 21 نقل ملفات.",
                },
              },
            },
          ],
        },
      ],
    },
  ],
};

export default m21;
