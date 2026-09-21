// Learning Materials — Batch 4 phase: REAL converted body for Book 791381, module m15 (the book's section
// «أوامر فحص الشبكة», source PDF 93–97, complete). Stable id m15 (next free), order 11 (batch b3).
//
// Five command pages, one command each, all with the SAME book layout: the command line as printed (a `code` block,
// language "cli", LTR), «الوظيفة» (one sentence), and on PDF 94–97 the «أوامر الشبكة» lead-in + «تذكّر». PDF 93 (ping)
// prints «تطبيق سريع» and «خطأ شائع» instead. PDF 98 opens the next section («المجالات والمفاهيم», module m16).
//
// SOURCE LEVEL: the book prints ONLY the command names, one syntax line each (`ping google.com`, `ipconfig /all`,
// `tracert google.com`, `nslookup google.com`, `arp -a`) and one-sentence purposes. No terminal OUTPUT is printed
// anywhere in the section, so none is invented here; no other switches, no operating-system context, no
// traceroute/netstat/route (the book does not name them). Enrichment applies the book's purposes to short
// "which command would you use" situations only.
// PRINTED PAGE = the rendered page circle (PDF 93 prints «93» … PDF 97 prints «97»).

import type { ContentModule, ContentSource, InlineSpan, PracticeOption, PracticeTableSelectCell } from "../../types";

const CID = "791381";
const src = (pdf: number, printed?: number): ContentSource => ({ kind: "book", sourceId: CID, pdfPageStart: pdf, printedPage: printed });
const L = (text: string): InlineSpan => ({ text, dir: "ltr", style: "code" });
const T = (text: string): InlineSpan => ({ text });
const opt = (id: string, text: string, correct?: true): PracticeOption => (correct ? { id, text, correct } : { id, text });
const CMDS = ["ping", "ipconfig", "tracert", "nslookup", "arp"] as const;
const C = (key: (typeof CMDS)[number]): PracticeTableSelectCell => ({ kind: "select", options: [...CMDS], key });
const LEAD = (id: string) => ({
  id, type: "callout" as const, origin: "book" as const, kind: "important" as const, title: "أوامر الشبكة",
  spans: [T("أوامر تساعدنا في فحص الشبكة ومعرفة الخلل وتحديد مكانه.")],
});
const REMEMBER = (id: string) => ({
  id, type: "callout" as const, origin: "book" as const, kind: "remember" as const, title: "تذكّر",
  spans: [T("احفظ وظيفة الأمر أكثر من حفظ النص الطويل.")],
});

const m15: ContentModule = {
  id: "791381-m15",
  title: "أوامر فحص الشبكة",
  shortTitle: "أوامر الشبكة",
  order: 11,
  source: { kind: "book", sourceId: CID, pdfPageStart: 93, pdfPageEnd: 97 },
  lessons: [
    // ── l01 — ping · ipconfig (PDF 93–94) ────────────────────────────────────────────────────────────────────
    {
      id: "791381-m15-l01",
      title: "ping و ipconfig",
      order: 1,
      pages: [
        // PDF 93 — أمر ping
        {
          id: "791381-m15-l01-p01",
          title: "أمر ping",
          order: 1,
          source: src(93, 93),
          keywords: ["ping", "اتصال", "زمن الوصول"],
          blocks: [
            {
              id: "m15-l01-p01-fn", type: "callout", origin: "book", kind: "important", title: "الوظيفة",
              spans: [T("يفحص هل يوجد اتصال بين جهازك وجهاز آخر أو موقع، ويعرض أيضًا زمن الوصول.")],
            },
            { id: "m15-l01-p01-cmd", type: "code", origin: "book", language: "cli", code: "> ping google.com" },
            {
              id: "m15-l01-p01-try", type: "callout", origin: "book", kind: "tip", title: "تطبيق سريع",
              spans: [T("نفّذ "), L("ping 8.8.8.8"), T(" ثم "), L("ping 10.255.255.1"), T(". أيّهما يصل؟ ولماذا؟")],
            },
            {
              id: "m15-l01-p01-mistake", type: "callout", origin: "book", kind: "warning", title: "خطأ شائع",
              spans: [T("نجاح "), L("ping"), T(" لا يعني أن كل الخدمات تعمل؛ يعني فقط أن الجهازين متّصلان على مستوى الشبكة.")],
            },
            {
              id: "m15-l01-p01-ex1", type: "example", origin: "teacher-enrichment", mode: "solved",
              title: "مثال محلول: «تطبيق سريع» — ping 8.8.8.8 ثم ping 10.255.255.1",
              steps: [
                { text: "8.8.8.8 عنوان عام على الإنترنت؛ في شبكة عادية متصلة بالإنترنت قد يردّ على ping ويظهر زمن الوصول." },
                { text: "10.255.255.1 من نطاق العناوين الخاصة (تعرفه من وحدة عناوين IP)؛ لا يردّ إلا إذا وُجدت في شبكتك أو عبر البوابة وجهة تحمل هذا العنوان." },
                { text: "إذن النتيجة الفعلية تعتمد على الشبكة التي تجرّب فيها. وعدم الردّ وحده لا يثبت أن الإنترنت غير متاح؛ فبعض الوجهات لا تردّ على رسائل الفحص ICMP." },
              ],
              result: "النتيجة المتوقعة في شبكة عادية: قد يردّ 8.8.8.8، أما 10.255.255.1 فلا يردّ إلا إذا كانت هناك وجهة محلية أو موجّهة بهذا العنوان. النتيجة الفعلية تعتمد على الشبكة.",
              explanation: "ping يفحص الاتصال «على مستوى الشبكة» فقط: الردّ يعني أن الوجهة موجودة ومتّصلة، وعدم الردّ يعني أنها غير موجودة أو لا تردّ على الفحص.",
            },
            {
              id: "m15-l01-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ماذا يفحص أمر ping حسب الكتاب؟",
                options: [opt("m15-l01-p01-q1-a", "هل يوجد اتصال بين جهازك وجهاز آخر أو موقع، ويعرض زمن الوصول", true), opt("m15-l01-p01-q1-b", "إعدادات الشبكة في جهازك"), opt("m15-l01-p01-q1-c", "الطريق الذي تسلكه الرسالة خطوة بعد خطوة")],
                feedback: {
                  hints: ["افحص صندوق «الوظيفة».", "الكلمة المفتاحية: «اتصال»."],
                  correctFeedback: "أحسنت — ping يفحص وجود اتصال ويعرض زمن الوصول.",
                  incorrectFeedback: "افحص صندوق «الوظيفة»: «يفحص هل يوجد اتصال بين جهازك وجهاز آخر أو موقع، ويعرض أيضًا زمن الوصول».",
                  explanation: "ping = هل يوجد اتصال؟ وكم زمن الوصول؟",
                },
              },
            },
            {
              id: "m15-l01-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "إذا نجح ping إلى موقع، فهذا يعني أن كل خدمات الموقع تعمل.",
                answer: false,
                feedback: {
                  hints: ["افحص صندوق «خطأ شائع».", "«يعني فقط أن الجهازين متّصلان على مستوى الشبكة»."],
                  correctFeedback: "صحيح أنها خطأ — نجاح ping يعني اتصالًا على مستوى الشبكة فقط.",
                  incorrectFeedback: "افحص صندوق «خطأ شائع»: نجاح ping لا يعني أن كل الخدمات تعمل.",
                  explanation: "الاتصال موجود لا يعني أن كل خدمة (موقع، بريد …) تعمل.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 3): SVG visual enrichment appended after the book content.
              id: "m15-l01-p01-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m15/ping-echo", motion: true,
              source: src(93),
              title: "مخطط: طلب ورد أمر ping",
              alt: "مخطط يبيّن جهازك يرسل طلب Echo عبر ICMP إلى الوجهة ثم يعود رد Echo، ما يقيس الوصول وزمنه.",
              caption: "طلب ثم رد يقيس الوصول وزمنه · بعض الوجهات لا تردّ على ICMP.",
            },
          ],
        },
        // PDF 94 — أمر ipconfig
        {
          id: "791381-m15-l01-p02",
          title: "أمر ipconfig",
          order: 2,
          source: src(94, 94),
          keywords: ["ipconfig", "إعدادات الشبكة", "البوابة الافتراضية", "MAC"],
          blocks: [
            LEAD("m15-l01-p02-lead"),
            { id: "m15-l01-p02-cmd", type: "code", origin: "book", language: "cli", code: "> ipconfig /all" },
            {
              id: "m15-l01-p02-fn", type: "callout", origin: "book", kind: "important", title: "الوظيفة",
              spans: [T("يعرض إعدادات الشبكة في جهازك: عنوان "), L("IP"), T("، قناع الشبكة، البوابة الافتراضية، و "), L("MAC Address"), T(".")],
            },
            REMEMBER("m15-l01-p02-remember"),
            {
              id: "m15-l01-p02-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("الأربعة التي يعرضها الأمر تعرفها كلها من الوحدات السابقة: عنوان "), L("IP"), T(" وقناع الشبكة (وحدة العناوين)، البوابة الافتراضية (الراوتر الذي يخرج منه الجهاز)، وعنوان "), L("MAC"), T(" لكرت الشبكة. "), L("ipconfig"), T(" يعرضها لجهازك أنت فقط.")],
            },
            {
              id: "m15-l01-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "تريد معرفة عنوان IP والبوابة الافتراضية لجهازك. أي أمر تنفّذ؟",
                options: [opt("m15-l01-p02-q1-a", "ping google.com"), opt("m15-l01-p02-q1-b", "ipconfig /all", true), opt("m15-l01-p02-q1-c", "ping 8.8.8.8")],
                feedback: {
                  hints: ["افحص صندوق «الوظيفة» في هذه الصفحة.", "الأمر الذي «يعرض إعدادات الشبكة في جهازك»."],
                  correctFeedback: "أحسنت — ipconfig /all يعرض عنوان IP وقناع الشبكة والبوابة الافتراضية و MAC.",
                  incorrectFeedback: "افحص صندوق «الوظيفة»: ping يفحص الاتصال، أما «إعدادات الشبكة في جهازك» فيعرضها أمر آخر.",
                  explanation: "ipconfig: إعدادات جهازك. ping: هل يوجد اتصال؟",
                },
              },
            },
            {
              id: "m15-l01-p02-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "اكتب اسم الأمر الذي يعرض إعدادات الشبكة في جهازك (بالأحرف اللاتينية، بدون خيارات).",
                answer: "ipconfig",
                feedback: {
                  hints: ["افحص سطر الأمر في الصفحة.", "الكلمة قبل /all."],
                  correctFeedback: "صحيح — ipconfig.",
                  incorrectFeedback: "افحص سطر الأمر في الصفحة: الكلمة قبل /all.",
                  explanation: "ipconfig /all يعرض إعدادات الشبكة في جهازك.",
                },
              },
            },
          ],
        },
      ],
    },
    // ── l02 — tracert · nslookup · arp (PDF 95–97) ───────────────────────────────────────────────────────────
    {
      id: "791381-m15-l02",
      title: "tracert و nslookup و arp",
      order: 2,
      pages: [
        // PDF 95 — أمر tracert
        {
          id: "791381-m15-l02-p01",
          title: "أمر tracert",
          order: 1,
          source: src(95, 95),
          keywords: ["tracert", "الطريق", "خطوة بعد خطوة"],
          blocks: [
            LEAD("m15-l02-p01-lead"),
            { id: "m15-l02-p01-cmd", type: "code", origin: "book", language: "cli", code: "> tracert google.com" },
            {
              id: "m15-l02-p01-fn", type: "callout", origin: "book", kind: "important", title: "الوظيفة",
              spans: [T("يعرض الطريق الذي تسلكه الرسالة حتى تصل إلى الموقع، خطوة بعد خطوة.")],
            },
            REMEMBER("m15-l02-p01-remember"),
            {
              id: "m15-l02-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما الفرق بين ping و tracert حسب الكتاب؟",
                options: [opt("m15-l02-p01-q1-a", "ping يفحص وجود الاتصال، و tracert يعرض الطريق خطوة بعد خطوة", true), opt("m15-l02-p01-q1-b", "لا فرق؛ كلاهما يعرض إعدادات الجهاز"), opt("m15-l02-p01-q1-c", "tracert يفحص خدمة DNS")],
                feedback: {
                  hints: ["افحص صندوق «الوظيفة» هنا وفي صفحة ping.", "«خطوة بعد خطوة» = الطريق."],
                  correctFeedback: "أحسنت — ping: هل يوجد اتصال؟ tracert: أي طريق تسلكه الرسالة؟",
                  incorrectFeedback: "افحص صندوق «الوظيفة»: tracert «يعرض الطريق الذي تسلكه الرسالة حتى تصل إلى الموقع، خطوة بعد خطوة».",
                  explanation: "ping = اتصال وزمن وصول؛ tracert = الطريق خطوة بعد خطوة.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 3): SVG visual enrichment appended after the book content.
              id: "m15-l02-p01-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m15/tracert-hops", motion: true,
              source: src(95),
              title: "مخطط: مسار أمر tracert قفزة بقفزة",
              alt: "مخطط يبيّن رزمة تتقدّم من جهازك عبر القفزات (الراوترات) واحدة تلو الأخرى حتى تصل إلى الوجهة.",
              caption: "يعرض الطريق قفزة بعد قفزة حتى الوجهة.",
            },
          ],
        },
        // PDF 96 — أمر nslookup
        {
          id: "791381-m15-l02-p02",
          title: "أمر nslookup",
          order: 2,
          source: src(96, 96),
          keywords: ["nslookup", "DNS", "اسم الموقع"],
          blocks: [
            LEAD("m15-l02-p02-lead"),
            { id: "m15-l02-p02-cmd", type: "code", origin: "book", language: "cli", code: "> nslookup google.com" },
            {
              id: "m15-l02-p02-fn", type: "callout", origin: "book", kind: "important", title: "الوظيفة",
              spans: [T("يفحص خدمة "), L("DNS"), T(" ويعرض عنوان "), L("IP"), T(" المرتبط باسم الموقع.")],
            },
            REMEMBER("m15-l02-p02-remember"),
            {
              id: "m15-l02-p02-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("هذا هو أمر فحص بروتوكول "), L("DNS"), T(" الذي تعلّمته في قسم البروتوكولات: إن عرض الأمر عنوان "), L("IP"), T(" للاسم، فخدمة "), L("DNS"), T(" تعمل.")],
            },
            {
              id: "m15-l02-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "الموقع لا يفتح بالاسم. أي أمر يفحص خدمة DNS ويعرض عنوان IP المرتبط بالاسم؟",
                options: [opt("m15-l02-p02-q1-a", "nslookup google.com", true), opt("m15-l02-p02-q1-b", "ipconfig /all"), opt("m15-l02-p02-q1-c", "tracert google.com")],
                feedback: {
                  hints: ["افحص صندوق «الوظيفة».", "الأمر الذي يذكر DNS."],
                  correctFeedback: "أحسنت — nslookup يفحص خدمة DNS.",
                  incorrectFeedback: "افحص صندوق «الوظيفة»: ipconfig يعرض إعدادات جهازك، tracert يعرض الطريق؛ «يفحص خدمة DNS» أمر آخر.",
                  explanation: "nslookup: من اسم الموقع إلى عنوان IP عبر DNS.",
                },
              },
            },
          ],
        },
        // PDF 97 — أمر arp
        {
          id: "791381-m15-l02-p03",
          title: "أمر arp",
          order: 3,
          source: src(97, 97),
          keywords: ["arp", "جدول", "IP", "MAC"],
          blocks: [
            LEAD("m15-l02-p03-lead"),
            { id: "m15-l02-p03-cmd", type: "code", origin: "book", language: "cli", code: "> arp -a" },
            {
              id: "m15-l02-p03-fn", type: "callout", origin: "book", kind: "important", title: "الوظيفة",
              spans: [T("يعرض جدولًا فيه عناوين "), L("IP"), T(" وعناوين "), L("MAC"), T(" التي عرفها الجهاز مؤخرًا.")],
            },
            REMEMBER("m15-l02-p03-remember"),
            {
              id: "m15-l02-p03-ex1", type: "example", origin: "teacher-enrichment", mode: "solved",
              title: "مثال محلول: أي أمر لكل مشكلة؟",
              prompt: "طالب لا يستطيع فتح المواقع. بأي ترتيب يستعمل أوامر الفحص الخمسة؟",
              steps: [
                { text: "أولًا يعرف إعدادات جهازه (هل له عنوان IP وبوابة؟): ipconfig /all." },
                { text: "ثم يفحص هل يوجد اتصال مع البوابة أو مع موقع: ping." },
                { text: "إن كان الاتصال موجودًا لكن الاسم لا يُفتح: nslookup يفحص خدمة DNS." },
                { text: "إن كان الاتصال بطيئًا أو ينقطع في الطريق: tracert يعرض الطريق خطوة بعد خطوة." },
                { text: "لمعرفة أي عناوين MAC عرفها الجهاز في شبكته: arp -a." },
              ],
              result: "ipconfig ثم ping ثم nslookup أو tracert حسب المشكلة، و arp -a لجدول IP/MAC",
              explanation: "كل أمر يجيب عن سؤال واحد من صندوق «الوظيفة» الخاص به؛ الترتيب مجرد اقتراح للبدء من جهازك ثم الخروج نحو الشبكة.",
            },
            {
              id: "m15-l02-p03-match", type: "practice-table", origin: "teacher-enrichment",
              caption: "تحقّق من نفسك: أي أمر يناسب كل مهمة؟ (اعتمد على صناديق «الوظيفة»)",
              headers: ["المهمة", "الأمر"],
              columnDirs: ["rtl", "ltr"],
              rows: [
                ["معرفة عنوان IP والبوابة الافتراضية لجهازك.", C("ipconfig")],
                ["هل يوجد اتصال بين جهازك وموقع؟ وكم زمن الوصول؟", C("ping")],
                ["عرض جدول عناوين IP و MAC التي عرفها الجهاز مؤخرًا.", C("arp")],
                ["فحص خدمة DNS ومعرفة عنوان IP لاسم موقع.", C("nslookup")],
                ["عرض الطريق الذي تسلكه الرسالة خطوة بعد خطوة.", C("tracert")],
              ],
            },
            {
              id: "m15-l02-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ماذا يعرض الأمر arp -a؟",
                options: [opt("m15-l02-p03-q1-a", "جدول عناوين IP وعناوين MAC التي عرفها الجهاز مؤخرًا", true), opt("m15-l02-p03-q1-b", "الطريق إلى الموقع خطوة بعد خطوة"), opt("m15-l02-p03-q1-c", "عنوان IP المرتبط باسم الموقع")],
                feedback: {
                  hints: ["افحص صندوق «الوظيفة».", "تذكّر بروتوكول ARP: يربط IP بـ MAC."],
                  correctFeedback: "أحسنت — arp -a يعرض جدول IP/MAC.",
                  incorrectFeedback: "افحص صندوق «الوظيفة»: «يعرض جدولًا فيه عناوين IP وعناوين MAC التي عرفها الجهاز مؤخرًا».",
                  explanation: "arp -a: الجدول الذي يربط عناوين IP بعناوين MAC في جهازك.",
                },
              },
            },
            // ── closing review for the commands section (easy, medium, exam-like) ──
            {
              id: "m15-l02-p03-review", type: "heading", origin: "teacher-enrichment", level: 3, text: "مراجعة ختامية: أوامر فحص الشبكة",
            },
            {
              id: "m15-l02-p03-r1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما القاعدة التي يكرّرها الكتاب في صندوق «تذكّر» لكل أمر؟",
                options: [opt("m15-l02-p03-r1-a", "احفظ وظيفة الأمر أكثر من حفظ النص الطويل", true), opt("m15-l02-p03-r1-b", "احفظ كل خيارات الأمر"), opt("m15-l02-p03-r1-c", "احفظ نتيجة الأمر كاملة")],
                feedback: {
                  hints: ["افحص صندوق «تذكّر» في أي صفحة أمر.", "الوظيفة قبل النص."],
                  correctFeedback: "أحسنت — الوظيفة أهم من النص الطويل.",
                  incorrectFeedback: "افحص صندوق «تذكّر»: «احفظ وظيفة الأمر أكثر من حفظ النص الطويل».",
                  explanation: "الامتحان يسأل عن الوظيفة.",
                },
              },
            },
            {
              id: "m15-l02-p03-r2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "سؤال بأسلوب الامتحان: ping إلى الموقع ينجح، لكن الموقع لا يفتح بالاسم في المتصفح. أي أمر يساعدك أكثر في تحديد الخلل؟",
                options: [opt("m15-l02-p03-r2-a", "ping مرة أخرى"), opt("m15-l02-p03-r2-b", "nslookup لفحص خدمة DNS", true), opt("m15-l02-p03-r2-c", "arp -a")],
                feedback: {
                  hints: ["الاتصال موجود (ping نجح)؛ ما الذي يحوّل الاسم إلى عنوان؟", "افحص صندوق «الوظيفة» في صفحة nslookup."],
                  correctFeedback: "أحسنت — الاسم لا يُفتح رغم وجود اتصال، فالفحص التالي هو خدمة DNS بأمر nslookup.",
                  incorrectFeedback: "افحص صندوق «خطأ شائع» في صفحة ping وصندوق «الوظيفة» في صفحة nslookup: نجاح ping لا يعني أن كل الخدمات تعمل، و nslookup يفحص DNS.",
                  explanation: "ping ناجح = اتصال موجود؛ الاسم لا يُفتح = افحص DNS.",
                },
              },
            },
            {
              id: "m15-l02-p03-r3", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "اكتب الأمر الذي يعرض الطريق الذي تسلكه الرسالة حتى الموقع خطوة بعد خطوة (اسم الأمر فقط).",
                answer: "tracert",
                feedback: {
                  hints: ["افحص صفحة الأمر الثالث في القسم.", "يبدأ بـ tr."],
                  correctFeedback: "صحيح — tracert.",
                  incorrectFeedback: "افحص سطر الأمر في صفحة «أمر tracert»: الكلمة قبل google.com.",
                  explanation: "tracert google.com يعرض الطريق خطوة بعد خطوة.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 3): SVG visual enrichment appended after the book content.
              id: "m15-l02-p03-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m15/arp-association", motion: true,
              source: src(97),
              title: "مخطط: ربط IP بعنوان MAC (arp)",
              alt: "مخطط يبيّن جهازك يسأل من له عنوان IP، فيردّ الجار بعنوان MAC الخاص به، فيُسجَّل ربط IP↔MAC.",
              caption: "ARP يربط عنوان IP بعنوان MAC الذي يملكه الجهاز · arp -a يعرض ما تعلّمه.",
            },
          ],
        },
      ],
    },
  ],
};

export default m15;
