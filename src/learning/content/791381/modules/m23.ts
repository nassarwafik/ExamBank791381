// Learning Materials — Batch 9 phase: REAL converted body for Book 791381, module m23 (the book's section
// «Port Security», source PDF 180–184 — five pages under the running header «Port Security», no section cover).
// NEW stable id m23, reading `order` 21: after m22 («بروتوكول DHCP», order 20) and before m24 («حماية أجهزة Cisco»,
// order 22). Book-derived blocks are origin:"book": the PDF 180 definition + facts + «تذكّر», the PDF 181 scenario
// diagram roles + facts + «الفكرة», the PDF 182 / 183 / 184 «Cisco CLI» boxes (as `code` blocks with the book's
// exact command lines and its generic `Device(config)#` prompt + the annotation tables) + «تذكّر» / «متى؟».
// INTERACTIVE CLI: PDF 182 guided example, PDF 183 command challenge, PDF 184 multi-step task (final state). The
// book prints every port command under the generic prompt `Device(config)#`; the simulator (and the clarification
// note) places them where a real switch accepts them — inside the selected interface — which is exactly the book's
// own first line `interface f0/1`.
// Technical tokens (Port Security, MAC Address, Switch, PC0, PC1, Sticky, the commands, 00A0.1234.5678, f0/1,
// Access, violation shutdown) are LTR spans; no arrow glyphs.
// SOURCE LEVEL: the book gives the definition, one scenario and seven command lines — no violation protect /
// restrict, no aging, no `show port-security` on these pages (that appears on PDF 198). Nothing more is added.
// SOURCE ORDER: nothing from PDF 185+ (device passwords, line console / vty, enable secret, the command reference)
// appears here.
// PRINTED PAGE = the rendered page circle = the PDF index (PDF 180 prints «180» … PDF 184 prints «184»).

import type { ContentModule, ContentSource, InlineSpan, PracticeOption, PracticeTableSelectCell } from "../../types";
import type { CliExerciseConfig } from "../../../cli/types";

const CID = "791381";
const src = (pdf: number, printed?: number): ContentSource => ({ kind: "book", sourceId: CID, pdfPageStart: pdf, printedPage: printed });
const L = (text: string): InlineSpan => ({ text, dir: "ltr", style: "code" });
const T = (text: string): InlineSpan => ({ text });
const opt = (id: string, text: string, correct?: true): PracticeOption => (correct ? { id, text, correct } : { id, text });
const EX = (exercise: CliExerciseConfig): Record<string, unknown> => ({ ...exercise });
const VERDICTS = ["يعمل", "يُرفض"] as const;
const VD = (key: (typeof VERDICTS)[number]): PracticeTableSelectCell => ({ kind: "select", options: [...VERDICTS], key });
const ROLES = ["يفعّل الحماية على المنفذ", "يتعلّم MAC تلقائيًا", "يسمح بثلاثة أجهزة فقط", "يغلق المنفذ عند المخالفة"] as const;
const RO = (key: (typeof ROLES)[number]): PracticeTableSelectCell => ({ kind: "select", options: [...ROLES], key });

const MAC = "00A0.1234.5678";

const m23: ContentModule = {
  id: "791381-m23",
  title: "Port Security",
  shortTitle: "Port Security",
  order: 21,
  source: { kind: "book", sourceId: CID, pdfPageStart: 180, pdfPageEnd: 184, sourceNote: "خمس صفحات تحت العنوان الجاري «Port Security» (PDF 180–184) بلا صفحة عنوان خاصة. PDF 179 آخر صفحة في وحدة DHCP (m22)، و PDF 185 تبدأ وحدة «حماية أجهزة Cisco» (m24)." },
  lessons: [
    // ── l01 — ما هو Port Security (PDF 180–181) ────────────────────────────────────────────────────────────────
    {
      id: "791381-m23-l01",
      title: "ما هو Port Security",
      order: 1,
      pages: [
        // PDF 180 — Port Security
        {
          id: "791381-m23-l01-p01",
          title: "Port Security",
          order: 1,
          source: src(180, 180),
          keywords: ["Port Security", "MAC Address", "حماية المنافذ", "جهاز غير مسموح"],
          blocks: [
            {
              id: "m23-l01-p01-def", type: "callout", origin: "book", kind: "important",
              spans: [T("خاصية في السويتش للتحكّم بمن يُسمح له بالاتصال.")],
            },
            {
              id: "m23-l01-p01-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m23-l01-p01-f1", text: [T("تعتمد غالبًا على "), L("MAC Address"), T(".")] },
                { id: "m23-l01-p01-f2", text: [T("إذا دخل جهاز غير مسموح به، يتم منعه.")] },
                { id: "m23-l01-p01-f3", text: [T("تُستخدم لحماية المنافذ من أجهزة مجهولة.")] },
              ],
            },
            {
              id: "m23-l01-p01-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [L("Port Security"), T(" = حماية المنفذ حسب الجهاز المتصل به.")],
            },
            {
              // ENRICHMENT (Batch 8): SVG visual enrichment appended after the book content.
              id: "m23-l01-p01-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m23/port-security-concept", motion: true,
              source: src(180),
              title: "مخطط: مفهوم Port Security",
              alt: "مخطط متحرّك: منفذ السويتش يسمح للجهاز المعروف بعنوان MAC ويمنع الجهاز المجهول، بلا أسماء أجهزة السيناريو.",
              caption: "‏المنفذ يسمح للجهاز المعروف بعنوان MAC ويمنع المجهول.",
            },
            {
              id: "m23-l01-p01-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("عرفت في وحدة الكوابل أن لكل بطاقة شبكة عنوان "), L("MAC"), T(" ثابتًا؛ "), L("Port Security"), T(" يستعمل هذا العنوان ليعرف السويتش أي جهاز موصول بالمنفذ، فيسمح للمعروف ويمنع المجهول.")],
            },
            {
              id: "m23-l01-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "على ماذا يعتمد Port Security غالبًا بحسب الكتاب؟",
                options: [opt("m23-l01-p01-q1-a", "على MAC Address للجهاز المتصل", true), opt("m23-l01-p01-q1-b", "على اسم شبكة Wi-Fi"), opt("m23-l01-p01-q1-c", "على عنوان IPv6")],
                feedback: {
                  hints: ["السطر الأول في قائمة الحقائق.", "العنوان الثابت لبطاقة الشبكة."],
                  correctFeedback: "صحيح — يعتمد غالبًا على MAC Address.",
                  incorrectFeedback: "افحص السطر: «تعتمد غالبًا على MAC Address».",
                  explanation: "Port Security يحمي المنفذ حسب الجهاز المتصل به، ويميّز الأجهزة بعناوين MAC.",
                },
              },
            },
            {
              id: "m23-l01-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "إذا دخل جهاز غير مسموح به إلى منفذ محمي بـ Port Security يتم منعه.", answer: true,
                feedback: {
                  hints: ["السطر الثاني في قائمة الحقائق.", "ما الذي يحدث للجهاز غير المسموح؟"],
                  correctFeedback: "صحيح — الجهاز غير المسموح به يُمنع.",
                  incorrectFeedback: "افحص السطر: «إذا دخل جهاز غير مسموح به، يتم منعه».",
                  explanation: "الهدف حماية المنافذ من أجهزة مجهولة.",
                },
              },
            },
          ],
        },
        // PDF 181 — سيناريو Port Security
        {
          id: "791381-m23-l01-p02",
          title: "سيناريو Port Security",
          order: 2,
          source: src(181, 181),
          keywords: ["سيناريو", "PC0", "PC1", "جهاز غريب", "Sticky", "MAC ثابت"],
          blocks: [
            {
              id: "m23-l01-p02-lead", type: "text", origin: "book",
              spans: [T("مثال عملي على "), L("Port Security"), T(".")],
            },
            {
              id: "m23-l01-p02-diagram", type: "list", origin: "book", variant: "cards", title: "كما في رسم الكتاب",
              items: [
                { id: "m23-l01-p02-d1", term: "Switch", text: [T("المنفذ يحفظ عنوان "), L("MAC"), T(" المسموح.")] },
                { id: "m23-l01-p02-d2", term: "PC0 و PC1", text: [T("جهازان مصرّح بهما: يعملان.")] },
                { id: "m23-l01-p02-d3", term: "جهاز غريب", text: [T("غير مصرّح به: يُرفض.")] },
                { id: "m23-l01-p02-d4", term: "الخلاصة", text: [T("الجهاز المصرّح به يعمل، وغيره يُرفض.")] },
              ],
            },
            {
              id: "m23-l01-p02-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m23-l01-p02-f1", text: [T("نسمح لـ "), L("PC0"), T(" و "), L("PC1"), T(" فقط باستعمال المنافذ المحدّدة.")] },
                { id: "m23-l01-p02-f2", text: [T("نمنع جهازًا غير مصرّح به من الدخول.")] },
                { id: "m23-l01-p02-f3", text: [T("يمكن تحديد "), L("MAC"), T(" ثابت أو استخدام "), L("Sticky"), T(".")] },
              ],
            },
            {
              id: "m23-l01-p02-idea", type: "callout", origin: "book", kind: "summary", title: "الفكرة",
              spans: [T("المنفذ لا يقبل أي جهاز عشوائي، بل المسموح به فقط.")],
            },
            {
              // ENRICHMENT (Batch 6): SVG visual enrichment appended after the book content.
              id: "m23-l01-p02-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m23/port-security-scenario", motion: false,
              source: src(181),
              title: "مخطط: سيناريو Port Security",
              alt: "مخطط يبيّن منفذ سويتش يسمح للجهازين المصرّح بهما PC0 و PC1 بالعمل، ويرفض جهازًا غريبًا.",
              caption: "‏المنفذ يقبل الأجهزة المسموح بها فقط.",
            },
            {
              id: "m23-l01-p02-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("«"), L("MAC"), T(" ثابت» يعني أن التقني يكتب عنوان الجهاز المسموح بنفسه في الأمر، أما «"), L("Sticky"), T("» فيعني أن السويتش يتعلّم عنوان أول جهاز يتصل ويثبّته تلقائيًا. الصفحتان التاليتان تعرضان أوامر الطريقتين.")],
            },
            {
              id: "m23-l01-p02-ws", type: "practice-table", origin: "teacher-enrichment", caption: "ورقة عمل: ماذا يحدث لكل جهاز في سيناريو الكتاب؟",
              headers: ["الجهاز", "النتيجة"],
              rows: [
                ["PC0 (مصرّح به)", VD("يعمل")],
                ["PC1 (مصرّح به)", VD("يعمل")],
                ["جهاز غريب", VD("يُرفض")],
              ],
              columnDirs: ["rtl", "rtl"],
            },
            {
              id: "m23-l01-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما الطريقتان اللتان يذكرهما الكتاب لتحديد الجهاز المسموح؟",
                options: [opt("m23-l01-p02-q1-a", "MAC ثابت أو Sticky", true), opt("m23-l01-p02-q1-b", "كلمة مرور أو SSID"), opt("m23-l01-p02-q1-c", "IPv6 أو DHCP")],
                feedback: {
                  hints: ["السطر الثالث في قائمة الحقائق.", "إحدى الطريقتين يكتبها التقني والأخرى يتعلّمها السويتش."],
                  correctFeedback: "صحيح — MAC ثابت أو Sticky.",
                  incorrectFeedback: "افحص السطر: «يمكن تحديد MAC ثابت أو استخدام Sticky».",
                  explanation: "MAC ثابت يُكتب يدويًا في الأمر، و Sticky يتعلّمه السويتش تلقائيًا.",
                },
              },
            },
          ],
        },
      ],
    },
    // ── l02 — أوامر Port Security (PDF 182–184) ───────────────────────────────────────────────────────────────
    {
      id: "791381-m23-l02",
      title: "أوامر Port Security",
      order: 2,
      pages: [
        // PDF 182 — Port Security — MAC ثابت + GUIDED CLI
        {
          id: "791381-m23-l02-p01",
          title: "Port Security — MAC ثابت",
          order: 1,
          source: src(182, 182),
          keywords: ["interface f0/1", "switchport mode access", "switchport port-security mac-address", "violation shutdown"],
          blocks: [
            {
              id: "m23-l02-p01-cli", type: "code", origin: "book", language: "cli",
              code: `Device(config)# interface f0/1\nDevice(config)# switchport mode access\nDevice(config)# switchport port-security mac-address ${MAC}\nDevice(config)# switchport port-security violation shutdown`,
            },
            {
              id: "m23-l02-p01-cmds", type: "table", origin: "book",
              caption: "Cisco CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Device(config)# interface f0/1", "نحدّد المنفذ"],
                ["Device(config)# switchport mode access", "نجعله Access"],
                [`Device(config)# switchport port-security mac-address ${MAC}`, "نسمح فقط للـ MAC المكتوب"],
                ["Device(config)# switchport port-security violation shutdown", "يغلق المنفذ عند المخالفة"],
              ],
            },
            {
              id: "m23-l02-p01-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [L("violation shutdown"), T(" يعني إغلاق المنفذ تمامًا عند دخول جهاز غير مسموح.")],
            },
            {
              id: "m23-l02-p01-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("الكتاب يكتب كل السطور تحت المؤشّر العام "), L("Device(config)#"), T(" للاختصار؛ على الجهاز الحقيقي — وفي المحاكي — أوامر "), L("switchport"), T(" تُكتب بعد اختيار المنفذ، أي تحت "), L("Switch(config-if)#"), T("، وهذا ما يفعله السطر الأول "), L("interface f0/1"), T(".")],
            },
            {
              id: "m23-l02-p01-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مثال موجّه: MAC ثابت على المنفذ f0/1",
              description: "نفّذ سطور صندوق الكتاب بالترتيب. المحاكي يتحقّق من الوضع ومن الأمر ويعطيك تلميحين عند الحاجة. محاكاة تعليمية مبسّطة، ليست جهازًا حقيقيًا.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "المثال الموجّه: ادخل إلى الإعداد العام، اختر المنفذ f0/1، اجعله Access، اسمح فقط للعنوان 00A0.1234.5678، ثم اجعل الإجراء عند المخالفة shutdown." },
              config: EX({
                kind: "guided",
                device: "switch",
                startMode: "global",
                intro: "أنت في وضع الإعداد العام. نفّذ سطور صندوق الكتاب بالترتيب.",
                steps: [
                  { id: "s1", instruction: "حدّد المنفذ f0/1", expect: { command: "interface", args: { interfaces: ["f0/1"] } }, success: "✓ أحسنت، أنت الآن داخل المنفذ f0/1", hints: ["السطر الأول في صندوق الكتاب.", "الأمر يبدأ بـ interface ويليه اسم المنفذ."] },
                  { id: "s2", instruction: "اجعل المنفذ Access", expect: { command: "switchport-mode", args: { mode: "access" } }, hints: ["السطر الثاني في صندوق الكتاب.", "الأمر يبدأ بـ switchport mode."] },
                  { id: "s3", instruction: "اسمح فقط للعنوان 00A0.1234.5678", expect: { command: "port-security-mac-address", args: { mac: MAC } }, hints: ["السطر الثالث في صندوق الكتاب.", "الأمر يبدأ بـ switchport port-security mac-address ويليه العنوان."] },
                  { id: "s4", instruction: "اجعل الإجراء عند المخالفة إغلاق المنفذ", expect: { command: "port-security-violation", args: { action: "shutdown" } }, hints: ["السطر الأخير في صندوق الكتاب.", "الأمر يبدأ بـ switchport port-security violation."] },
                ],
                completion: "✓ أحسنت، نفّذت أوامر MAC الثابت كما في الكتاب.",
              }),
            },
            {
              id: "m23-l02-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ماذا يفعل الأمر switchport port-security violation shutdown؟",
                options: [opt("m23-l02-p01-q1-a", "يغلق المنفذ عند المخالفة", true), opt("m23-l02-p01-q1-b", "يجعل المنفذ Access"), opt("m23-l02-p01-q1-c", "يحدّد عنوان MAC المسموح")],
                feedback: {
                  hints: ["الصف الأخير في جدول الأوامر.", "الكلمة shutdown تعني الإغلاق."],
                  correctFeedback: "صحيح — يغلق المنفذ عند المخالفة.",
                  incorrectFeedback: "افحص جدول الأوامر: «يغلق المنفذ عند المخالفة».",
                  explanation: "violation shutdown يعني إغلاق المنفذ تمامًا عند دخول جهاز غير مسموح.",
                },
              },
            },
            {
              id: "m23-l02-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "ما عنوان MAC المسموح في صندوق الكتاب؟ (اكتبه كما هو)", answer: MAC,
                feedback: {
                  hints: ["السطر الثالث في صندوق الكتاب.", "ثلاث مجموعات من أربعة رموز تفصلها نقاط."],
                  correctFeedback: "صحيح — 00A0.1234.5678.",
                  incorrectFeedback: "افحص السطر: «switchport port-security mac-address …».",
                  explanation: "هذا هو الشكل الذي تكتب به Cisco عناوين MAC: ثلاث مجموعات من أربعة رموز ستّ عشرية.",
                },
              },
            },
          ],
        },
        // PDF 183 — Port Security — Sticky MAC + CHALLENGE
        {
          id: "791381-m23-l02-p02",
          title: "Port Security — Sticky MAC",
          order: 2,
          source: src(183, 183),
          keywords: ["switchport port-security", "mac-address sticky", "Sticky"],
          blocks: [
            {
              id: "m23-l02-p02-cli", type: "code", origin: "book", language: "cli",
              code: "Device(config)# switchport port-security\nDevice(config)# switchport port-security mac-address sticky",
            },
            {
              id: "m23-l02-p02-cmds", type: "table", origin: "book",
              caption: "Cisco CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Device(config)# switchport port-security", "يفعّل الحماية على المنفذ"],
                ["Device(config)# switchport port-security mac-address sticky", "يتعلّم MAC تلقائيًا"],
              ],
            },
            {
              id: "m23-l02-p02-when", type: "callout", origin: "book", kind: "tip", title: "متى؟",
              spans: [L("Sticky"), T(" مفيد عندما لا نعرف "), L("MAC"), T(" الجهاز مسبقًا، فيتعلّمه السويتش ويسمح له فقط.")],
            },
            {
              id: "m23-l02-p02-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("لاحظ الفرق بين الصفحتين: في الصفحة السابقة كتبنا العنوان بأنفسنا بعد "), L("mac-address"), T("، وهنا نكتب الكلمة "), L("sticky"), T(" بدل العنوان فيتعلّمه السويتش. وفي الحالتين نكون داخل المنفذ ("), L("config-if"), T(").")],
            },
            {
              id: "m23-l02-p02-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "تحدّي الأمر: فعّل الحماية واجعلها Sticky",
              description: "أنت داخل المنفذ f0/1 (وهو Access). اكتب الأمر المطلوب في كل سؤال؛ المحاكي لا يكشف الإجابة. محاكاة تعليمية مبسّطة.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "التحدّي: فعّل Port Security على المنفذ f0/1 ثم اجعله يتعلّم عنوان MAC تلقائيًا (Sticky)." },
              config: EX({
                kind: "challenge",
                device: "switch",
                startMode: "interface",
                startInterface: "f0/1",
                preset: { interfaces: { "f0/1": { switchportMode: "access" } } },
                intro: "أنت داخل المنفذ f0/1 وهو في وضع Access.",
                steps: [
                  { id: "c1", instruction: "اكتب الأمر الذي يفعّل الحماية على المنفذ", expect: { command: "switchport-port-security" }, hints: ["السطر الأول في صندوق الكتاب: كلمتان فقط.", "الأمر يبدأ بـ switchport ويليه اسم الخاصية."] },
                  { id: "c2", instruction: "اكتب الأمر الذي يجعل السويتش يتعلّم عنوان MAC تلقائيًا", expect: { command: "port-security-sticky" }, hints: ["نفس بداية الأمر السابق مع كلمتين إضافيتين.", "ينتهي بالكلمة sticky."] },
                ],
                allowed: ["switchport-port-security", "port-security-sticky"],
                completion: "✓ صحيح — الحماية مفعّلة ويتعلّم المنفذ العنوان تلقائيًا.",
              }),
            },
            {
              id: "m23-l02-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "متى يكون Sticky مفيدًا بحسب الكتاب؟",
                options: [opt("m23-l02-p02-q1-a", "عندما لا نعرف MAC الجهاز مسبقًا", true), opt("m23-l02-p02-q1-b", "عندما نريد إغلاق المنفذ"), opt("m23-l02-p02-q1-c", "عندما يكون المنفذ Trunk")],
                feedback: {
                  hints: ["اقرأ صندوق «متى؟».", "ماذا يفعل السويتش بالعنوان الذي لا نعرفه؟"],
                  correctFeedback: "صحيح — Sticky مفيد عندما لا نعرف MAC الجهاز مسبقًا.",
                  incorrectFeedback: "افحص صندوق «متى؟».",
                  explanation: "مع Sticky يتعلّم السويتش العنوان من أول جهاز يتصل ويسمح له فقط.",
                },
              },
            },
          ],
        },
        // PDF 184 — Port Security — عدد الأجهزة + TASK (module closing page + review)
        {
          id: "791381-m23-l02-p03",
          title: "Port Security — عدد الأجهزة",
          order: 3,
          source: src(184, 184),
          keywords: ["switchport port-security maximum 3", "violation shutdown", "عدد الأجهزة"],
          blocks: [
            {
              id: "m23-l02-p03-cli", type: "code", origin: "book", language: "cli",
              code: "Device(config)# switchport port-security maximum 3\nDevice(config)# switchport port-security violation shutdown",
            },
            {
              id: "m23-l02-p03-cmds", type: "table", origin: "book",
              caption: "Cisco CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Device(config)# switchport port-security maximum 3", "يسمح بثلاثة أجهزة فقط"],
                ["Device(config)# switchport port-security violation shutdown", "يغلق المنفذ عند الزيادة"],
              ],
            },
            {
              id: "m23-l02-p03-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("إذا زاد العدد تحدث مخالفة، ويمكن تغيير العدد حسب الحاجة.")],
            },
            {
              id: "m23-l02-p03-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("الرقم بعد "), L("maximum"), T(" هو عدد عناوين "), L("MAC"), T(" التي يقبلها المنفذ؛ الجهاز الرابع في مثال الكتاب يسبّب مخالفة فيُغلق المنفذ. المهمة أدناه تجمع أوامر الصفحات الثلاث على منفذ واحد.")],
            },
            {
              id: "m23-l02-p03-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مهمة إعداد: أمّن المنفذ f0/1 كاملًا",
              description: "ابدأ من وضع المستخدم واجمع أوامر الصفحات الثلاث على المنفذ f0/1. تكتمل المهمة فقط عندما تصبح كل النقاط موجودة على السويتش. محاكاة تعليمية مبسّطة.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "المهمة: المنفذ f0/1 في وضع Access، Port Security مفعّل عليه، الحد الأقصى ثلاثة أجهزة، والإجراء عند المخالفة shutdown." },
              config: EX({
                kind: "task",
                device: "switch",
                intro: "أمّن المنفذ f0/1 بأوامر الصفحات الثلاث. تكتمل المهمة عندما تتحقّق كل النقاط التالية:",
                goals: [
                  { id: "g1", label: "المنفذ f0/1 في وضع Access", condition: { kind: "interface", name: "f0/1", prop: "switchportMode", value: "access" } },
                  { id: "g2", label: "Port Security مفعّل على f0/1", condition: { kind: "port-security", name: "f0/1", prop: "enabled", value: true } },
                  { id: "g3", label: "الحد الأقصى ثلاثة أجهزة", condition: { kind: "port-security", name: "f0/1", prop: "maximum", value: 3 } },
                  { id: "g4", label: "الإجراء عند المخالفة shutdown", condition: { kind: "port-security", name: "f0/1", prop: "violation", value: "shutdown" } },
                ],
                hints: ["انتقل إلى الإعداد العام، ثم ادخل إلى المنفذ f0/1 قبل أي أمر switchport.", "أوامر الحماية كلها تبدأ بـ switchport port-security، وتفعيلها هو الأمر بلا قيم إضافية."],
                completion: "✓ أحسنت، المنفذ f0/1 مؤمَّن: Access، حماية مفعّلة، ثلاثة أجهزة، وإغلاق عند المخالفة.",
              }),
            },
            {
              id: "m23-l02-p03-ws", type: "practice-table", origin: "teacher-enrichment", caption: "ورقة عمل: ما وظيفة كل أمر؟ (اعتمد على جداول الكتاب)",
              headers: ["الأمر", "الوظيفة"],
              rows: [
                ["switchport port-security", RO("يفعّل الحماية على المنفذ")],
                ["switchport port-security mac-address sticky", RO("يتعلّم MAC تلقائيًا")],
                ["switchport port-security maximum 3", RO("يسمح بثلاثة أجهزة فقط")],
                ["switchport port-security violation shutdown", RO("يغلق المنفذ عند المخالفة")],
              ],
              columnDirs: ["ltr", "rtl"],
            },
            {
              id: "m23-l02-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "كم جهازًا يسمح به الأمر في صندوق الكتاب؟ (اكتب الرقم فقط)", answer: "3",
                feedback: {
                  hints: ["السطر الأول في صندوق الكتاب.", "الرقم بعد الكلمة maximum."],
                  correctFeedback: "صحيح — ثلاثة أجهزة فقط.",
                  incorrectFeedback: "افحص السطر: «switchport port-security maximum …».",
                  explanation: "maximum 3 يسمح بثلاثة أجهزة فقط، وإذا زاد العدد تحدث مخالفة.",
                },
              },
            },
            { id: "m23-l02-p03-review", type: "heading", origin: "teacher-enrichment", text: "مراجعة الوحدة", level: 3 },
            {
              id: "m23-l02-p03-r1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما الأمر الذي يفعّل Port Security على المنفذ؟",
                options: [opt("m23-l02-p03-r1-a", "switchport port-security", true), opt("m23-l02-p03-r1-b", "switchport mode trunk"), opt("m23-l02-p03-r1-c", "no shutdown")],
                feedback: {
                  hints: ["صفحة Sticky MAC، السطر الأول.", "كلمتان فقط."],
                  correctFeedback: "صحيح — switchport port-security يفعّل الحماية على المنفذ.",
                  incorrectFeedback: "افحص جدول الأوامر في صفحة «Sticky MAC».",
                  explanation: "بعد التفعيل تُضاف الخيارات: MAC ثابت أو Sticky، والحد الأقصى، والإجراء عند المخالفة.",
                },
              },
            },
            {
              id: "m23-l02-p03-r2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "الأمر switchport port-security mac-address sticky يجعل السويتش يتعلّم عنوان MAC تلقائيًا.", answer: true,
                feedback: {
                  hints: ["صفحة Sticky MAC، السطر الثاني.", "ماذا تعني الكلمة sticky هنا؟"],
                  correctFeedback: "صحيح — يتعلّم MAC تلقائيًا.",
                  incorrectFeedback: "افحص جدول الأوامر: «يتعلّم MAC تلقائيًا».",
                  explanation: "Sticky مفيد عندما لا نعرف MAC الجهاز مسبقًا.",
                },
              },
            },
            {
              id: "m23-l02-p03-r3", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "في سيناريو الكتاب، ماذا يحدث للجهاز الغريب؟",
                options: [opt("m23-l02-p03-r3-a", "يُرفض", true), opt("m23-l02-p03-r3-b", "يعمل مثل PC0"), opt("m23-l02-p03-r3-c", "يحصل على عنوان IP")],
                feedback: {
                  hints: ["صفحة السيناريو.", "الجملة تحت الرسم: «الجهاز المصرّح به يعمل، وغيره …»."],
                  correctFeedback: "صحيح — الجهاز غير المصرّح به يُرفض.",
                  incorrectFeedback: "افحص الجملة تحت رسم الكتاب.",
                  explanation: "المنفذ لا يقبل أي جهاز عشوائي، بل المسموح به فقط.",
                },
              },
            },
          ],
        },
      ],
    },
  ],
};

export default m23;
