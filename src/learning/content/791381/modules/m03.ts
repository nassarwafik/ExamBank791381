// Learning Materials — Batch 6 phase: REAL converted body for Book 791381, module m03 (the book's section
// «برمجة السويتش · CLI و VLAN», source PDF 121–138; PDF 120 is the «الدفعة الرابعة · برمجة السويتش و VLAN» cover).
// m03 is the HISTORICAL Phase-2 skeleton module, COMPLETED IN PLACE: its stable id `791381-m03`, its title, its
// lesson `791381-m03-l01` («مدخل إلى CLI و VLAN») and its two historical pages keep their ids, titles, meanings and
// source mappings EXACTLY as the skeleton declared them —
//   `791381-m03-l01-p01` = PDF 123 «منافذ السويتش»        (printedPage 121, as recorded by the Phase-2 skeleton)
//   `791381-m03-l01-p02` = PDF 124 «برمجة المنافذ من CLI»  (printedPage 122, as recorded by the Phase-2 skeleton)
// PDF 121–122 come BEFORE them in the book, so they are authored as NEW stable page ids (`-p03`, `-p04`) placed
// first by explicit `order` (1, 2); the historical pages take orders 3 and 4. Ids are opaque — `order` sequences.
// PRINTED-PAGE NOTE: the Phase-2 skeleton recorded the hidden running number of the PDF text layer (two lower than
// the page circle) for its two pages; those two values are immutable. Every NEW page follows the established rule
// PRINTED PAGE = the rendered page circle = the PDF index (PDF 121 prints «121» … PDF 138 prints «138»).
// Reading order (explicit `order`): m03 reads 15th, right after m18 (PDF 119) — before the m04 skeleton.
// PDF 139 («إدارة مركزية» cover of the next section) is the HARD STOP of this batch: nothing from PDF 139+ (the
// centralised VLAN management protocol, its server/client roles, sub-interfaces, port security, ACL …) appears.
// Book-derived blocks are origin:"book": every «Switch CLI» box as a `code` block (exact command lines, LTR) plus a
// command/explanation table with the book's own annotations, the definitions, facts, «تذكّر» / «الأهم للطالب» /
// «متى نستعملها؟» / «لاحظ» / «النتيجة» / «لماذا؟» / «الفائدة» / «ما هو الـ Tag؟» boxes, the PDF 128 table and the
// PDF 125 / 135 figure cards. Technical tokens (CLI, VLAN, Trunk, Access, Tag, SVI, Gateway, the port names F0/1 …
// G0/2, every command and every IP address) are LTR spans; direction is prose («من > إلى #»), never arrow glyphs.
// SOURCE LEVEL: the book teaches the three CLI modes by their prompts, the port names, the three port-programming
// steps, what a VLAN is, the VLAN ID range 1–4094, VLAN 1, Trunk, the example table, VLAN creation and naming,
// access-port binding, the SVI address, the gateway idea and Native / Tagged / Untagged with their commands —
// no real terminal, no invented command output, nothing beyond these pages is added.

import type { ContentModule, ContentSource, InlineSpan, PracticeOption, PracticeTableSelectCell } from "../../types";

const CID = "791381";
const src = (pdf: number, printed?: number): ContentSource => ({ kind: "book", sourceId: CID, pdfPageStart: pdf, printedPage: printed });
const L = (text: string): InlineSpan => ({ text, dir: "ltr", style: "code" });
const T = (text: string): InlineSpan => ({ text });
const opt = (id: string, text: string, correct?: true): PracticeOption => (correct ? { id, text, correct } : { id, text });
const PORT_KINDS = ["Access", "Trunk"] as const;
const PK = (key: (typeof PORT_KINDS)[number]): PracticeTableSelectCell => ({ kind: "select", options: [...PORT_KINDS], key });
const TERMS = ["VLAN ID", "VLAN 1", "Trunk"] as const;
const TM = (key: (typeof TERMS)[number]): PracticeTableSelectCell => ({ kind: "select", options: [...TERMS], key });
const VLANS = ["10", "20"] as const;
const VL = (key: (typeof VLANS)[number]): PracticeTableSelectCell => ({ kind: "select", options: [...VLANS], key });
const PURPOSES = ["يحدّد مجموعة منافذ", "المنفذ لجهاز عادي", "يربط المنافذ بـ VLAN 10"] as const;
const PU = (key: (typeof PURPOSES)[number]): PracticeTableSelectCell => ({ kind: "select", options: [...PURPOSES], key });
const TAGS = ["Native VLAN", "Tagged VLAN", "Untagged VLAN"] as const;
const TG = (key: (typeof TAGS)[number]): PracticeTableSelectCell => ({ kind: "select", options: [...TAGS], key });

const m03: ContentModule = {
  id: "791381-m03",
  title: "برمجة السويتش CLI و VLAN",
  shortTitle: "CLI و VLAN",
  order: 15,
  source: { kind: "book", sourceId: CID, pdfPageStart: 120, pdfPageEnd: 138, sourceNote: "PDF 120 صفحة عنوان الدفعة الرابعة من الكتاب (بيانات وصفية فقط؛ لا تُعرض كصفحة تعلّم). صفحات التعلّم من PDF 121 إلى PDF 138. PDF 139 صفحة عنوان القسم التالي (الإدارة المركزية للشبكات الظاهرية) ولا يُحوَّل هنا." },
  lessons: [
    // ── l01 — CLI ومنافذ السويتش (PDF 121–124; the historical lesson id and title) ────────────────────────────
    {
      id: "791381-m03-l01",
      title: "مدخل إلى CLI و VLAN",
      order: 1,
      pages: [
        // PDF 121 — برمجة السويتش — CLI (NEW stable id p03, reads FIRST by explicit order)
        {
          id: "791381-m03-l01-p03",
          title: "برمجة السويتش — CLI",
          order: 1,
          source: src(121, 121),
          keywords: ["CLI", "واجهة الأوامر", "برمجة السويتش", "Command Line Interface"],
          blocks: [
            {
              id: "m03-l01-p03-def", type: "callout", origin: "book", kind: "important",
              spans: [L("CLI"), T(" هي واجهة الأوامر التي نبرمج منها السويتش.")],
            },
            {
              id: "m03-l01-p03-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m03-l01-p03-f1", text: [T("نستعملها لتعريف "), L("VLAN"), T("، المنافذ، كلمات المرور، و "), L("Trunk"), T(".")] },
                { id: "m03-l01-p03-f2", text: [T("كل أمر يُكتب في سطر مستقل.")] },
                { id: "m03-l01-p03-f3", text: [L("CLI = Command Line Interface"), T(".")] },
              ],
            },
            {
              id: "m03-l01-p03-student", type: "callout", origin: "book", kind: "tip", title: "الأهم للطالب",
              spans: [T("فهم وظيفة الأمر، وليس حفظ النص الطويل فقط.")],
            },
            {
              id: "m03-l01-p03-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("تعرّفت على السويتش في قسم أجهزة الشبكات كجهاز يوصل الأجهزة داخل الشبكة. في هذا القسم نتعلّم كيف نبرمجه بالكتابة: نكتب أمرًا في سطر، نضغط إدخال، ثم نكتب الأمر التالي. كلمتا "), L("VLAN"), T(" و "), L("Trunk"), T(" هنا مجرّد أسماء لما سنعرّفه بالأوامر؛ معناهما يأتي في الصفحات التالية بترتيب الكتاب.")],
            },
            {
              id: "m03-l01-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما CLI حسب الكتاب؟",
                options: [opt("m03-l01-p03-q1-a", "واجهة الأوامر التي نبرمج منها السويتش", true), opt("m03-l01-p03-q1-b", "كابل يربط السويتش بالراوتر"), opt("m03-l01-p03-q1-c", "اسم أوّل منفذ في السويتش")],
                feedback: {
                  hints: ["افحص الصندوق الأول في الصفحة.", "CLI = Command Line Interface."],
                  correctFeedback: "أحسنت — CLI هي واجهة الأوامر.",
                  incorrectFeedback: "افحص الصندوق الأول: «CLI هي واجهة الأوامر التي نبرمج منها السويتش».",
                  explanation: "نستعملها لتعريف VLAN والمنافذ وكلمات المرور و Trunk.",
                },
              },
            },
            {
              id: "m03-l01-p03-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "في CLI يُكتب كل أمر في سطر مستقل، والأهم للطالب فهم وظيفة الأمر لا حفظ النص الطويل فقط.",
                answer: true,
                feedback: {
                  hints: ["افحص قائمة الصفحة.", "افحص صندوق «الأهم للطالب»."],
                  correctFeedback: "صحيح — سطر لكل أمر، والفهم قبل الحفظ.",
                  incorrectFeedback: "افحص القائمة: «كل أمر يُكتب في سطر مستقل»، وصندوق «الأهم للطالب».",
                  explanation: "الكتاب يطلب فهم وظيفة كل أمر.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 5): SVG visual enrichment appended after the book content.
              id: "m03-l01-p03-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m03/cli-interface", motion: true,
              source: src(121),
              title: "مخطط: CLI — واجهة الأوامر",
              alt: "مخطط لطرفية عامة تظهر فيها أسطر الأوامر واحدًا تلو الآخر، يبيّن أن CLI هي واجهة الأوامر التي نبرمج منها السويتش (لتعريف VLAN والمنافذ وكلمات المرور و Trunk)، وكل أمر في سطر مستقل.",
              caption: "‏CLI = Command Line Interface · كل أمر في سطر مستقل.",
            },
          ],
        },
        // PDF 122 — الدخول إلى وضع البرمجة (NEW stable id p04, reads SECOND by explicit order)
        {
          id: "791381-m03-l01-p04",
          title: "الدخول إلى وضع البرمجة",
          order: 2,
          source: src(122, 122),
          keywords: ["enable", "configure terminal", "وضع الإعدادات", "الموجّه", "Switch CLI"],
          blocks: [
            {
              id: "m03-l01-p04-cli", type: "code", origin: "book", language: "cli",
              code: "Switch> enable\nSwitch# configure terminal\nSwitch(config)# vlan 10",
            },
            {
              id: "m03-l01-p04-cmds", type: "table", origin: "book",
              caption: "Switch CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Switch> enable", "يدخلنا إلى وضع الأوامر المتقدّم"],
                ["Switch# configure terminal", "يدخلنا إلى وضع الإعدادات"],
                ["Switch(config)# vlan 10", "بعدها نعرّف VLAN أو المنافذ"],
              ],
            },
            {
              id: "m03-l01-p04-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("لاحظ تغيّر الموجّه في كل خطوة: من "), L(">"), T(" إلى "), L("#"), T(" ثم "), L("(config)#"), T(" — وهو يدلّك على الوضع الذي أنت فيه.")],
            },
            {
              id: "m03-l01-p04-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("الموجّه هو النص الذي يظهر قبل مكان الكتابة. ثلاثة أوضاع في هذه الصفحة: "), L("Switch>"), T(" قبل أي شيء، ثم "), L("Switch#"), T(" بعد الأمر "), L("enable"), T("، ثم "), L("Switch(config)#"), T(" بعد الأمر "), L("configure terminal"), T(". السطر الثالث "), L("vlan 10"), T(" مثال على أوّل أمر إعداد يمكن كتابته بعد الدخول؛ معناه الكامل يأتي في صفحة إنشاء VLAN.")],
            },
            {
              id: "m03-l01-p04-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي أمر يدخلنا إلى وضع الإعدادات؟",
                options: [opt("m03-l01-p04-q1-a", "configure terminal", true), opt("m03-l01-p04-q1-b", "enable"), opt("m03-l01-p04-q1-c", "vlan 10")],
                feedback: {
                  hints: ["افحص السطر الثاني في صندوق Switch CLI.", "الأمر الذي بعده يظهر (config)#."],
                  correctFeedback: "أحسنت — configure terminal يدخلنا إلى وضع الإعدادات.",
                  incorrectFeedback: "افحص جدول الأوامر: «Switch# configure terminal — يدخلنا إلى وضع الإعدادات».",
                  explanation: "enable يدخلنا إلى وضع الأوامر المتقدّم أولًا.",
                },
              },
            },
            {
              id: "m03-l01-p04-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ماذا يصبح الموجّه بعد الأمر configure terminal؟",
                options: [opt("m03-l01-p04-q2-a", "Switch(config)#", true), opt("m03-l01-p04-q2-b", "Switch>"), opt("m03-l01-p04-q2-c", "Switch#")],
                feedback: {
                  hints: ["افحص صندوق «تذكّر».", "من > إلى # ثم (config)#."],
                  correctFeedback: "أحسنت — Switch(config)# يدلّ على وضع الإعدادات.",
                  incorrectFeedback: "افحص صندوق «تذكّر»: «من > إلى # ثم (config)#».",
                  explanation: "الموجّه يدلّك على الوضع الذي أنت فيه.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 5): SVG visual enrichment appended after the book content.
              id: "m03-l01-p04-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m03/cli-mode-ladder", motion: true,
              source: src(122),
              title: "مخطط: الدخول إلى وضع البرمجة",
              alt: "المخطط نفسه لأوضاع CLI: enable ينقل إلى وضع الأوامر المتقدّم، وconfigure terminal إلى وضع الإعدادات، ثم vlan 10 إلى وضع إعداد VLAN.",
              caption: "‏enable ثم configure terminal ثم vlan 10 · الرمز يتغيّر بعد كل أمر.",
            },
          ],
        },
        // PDF 123 — منافذ السويتش (HISTORICAL id p01, historical mapping 123 / printed 121; reads THIRD)
        {
          id: "791381-m03-l01-p01",
          title: "منافذ السويتش",
          order: 3,
          source: src(123, 121),
          keywords: ["switch", "ports", "CLI"],
          blocks: [
            {
              id: "m03-l01-p01-def", type: "callout", origin: "book", kind: "important",
              spans: [T("لكل منفذ في السويتش اسم نستخدمه في البرمجة.")],
            },
            {
              id: "m03-l01-p01-figure", type: "callout", origin: "book", kind: "summary", title: "الرسم: واجهة السويتش من الأمام",
              spans: [T("صفّان من المنافذ: "), L("F0/1"), T(" في اليسار حتى "), L("F0/24"), T(" في اليمين، وبجانبها منفذا "), L("G0/1"), T(" و "), L("G0/2"), T(". أوّل منفذ هو "), L("F0/1"), T(" — نعدّه من اليسار. المنافذ الأسرع "), L("Gigabit"), T(" تُكتب "), L("G0/1"), T(" و "), L("G0/2"), T(".")],
            },
            {
              id: "m03-l01-p01-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m03-l01-p01-f1", text: [T("منافذ "), L("FastEthernet"), T(" تُكتب غالبًا "), L("F0/1"), T(" حتى "), L("F0/24"), T(".")] },
                { id: "m03-l01-p01-f2", text: [T("منافذ "), L("GigabitEthernet"), T(" أسرع وتُكتب "), L("G0/1"), T(" أو "), L("G0/2"), T(".")] },
                { id: "m03-l01-p01-f3", text: [T("نختار المنفذ الصحيح قبل كتابة أوامر البرمجة.")] },
              ],
            },
            {
              id: "m03-l01-p01-example", type: "callout", origin: "book", kind: "tip", title: "مثال",
              spans: [L("F0/1"), T(" يعني المنفذ رقم 1 في السويتش.")],
            },
            {
              id: "m03-l01-p01-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("اقرأ اسم المنفذ من اليسار إلى اليمين كما يُكتب في الأوامر: الحرف الأول يدلّ على نوعه ("), L("F"), T(" لمنفذ "), L("FastEthernet"), T(" و "), L("G"), T(" لمنفذ "), L("GigabitEthernet"), T(")، والرقم بعد الشرطة المائلة هو رقم المنفذ نفسه. لذلك "), L("F0/24"), T(" هو المنفذ رقم 24 من منافذ "), L("FastEthernet"), T(".")],
            },
            {
              id: "m03-l01-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "كيف تُكتب المنافذ الأسرع Gigabit في السويتش؟",
                options: [opt("m03-l01-p01-q1-a", "G0/1 و G0/2", true), opt("m03-l01-p01-q1-b", "F0/1 و F0/2"), opt("m03-l01-p01-q1-c", "F0/24 و G0/24")],
                feedback: {
                  hints: ["افحص الرسم.", "الحرف G."],
                  correctFeedback: "أحسنت — G0/1 و G0/2.",
                  incorrectFeedback: "افحص الرسم: «المنافذ الأسرع Gigabit تُكتب G0/1 و G0/2».",
                  explanation: "منافذ FastEthernet تُكتب F0/1 حتى F0/24.",
                },
              },
            },
            {
              id: "m03-l01-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "اكتب اسم المنفذ رقم 24 من منافذ FastEthernet كما يُكتب في الأوامر.",
                answer: "F0/24",
                feedback: {
                  hints: ["افحص قائمة الصفحة: «تُكتب غالبًا F0/1 حتى …».", "الحرف F ثم 0/ ثم رقم المنفذ."],
                  correctFeedback: "صحيح — F0/24.",
                  incorrectFeedback: "افحص القائمة: «منافذ FastEthernet تُكتب غالبًا F0/1 حتى F0/24».",
                  explanation: "F0/1 يعني المنفذ رقم 1، و F0/24 المنفذ رقم 24.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 5): SVG visual enrichment appended after the book content.
              id: "m03-l01-p01-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m03/switch-ports-map", motion: true,
              source: src(123),
              title: "مخطط: منافذ السويتش من الأمام",
              alt: "مخطط لواجهة السويتش يبيّن منافذ FastEthernet من F0/1 حتى F0/24 ومنفذَي Gigabit G0/1 وG0/2، مع تمييز المنفذ المختار.",
              caption: "‏لكل منفذ اسم: F0/1 … F0/24 و G0/1 و G0/2.",
            },
          ],
        },
        // PDF 124 — برمجة المنافذ من CLI (HISTORICAL id p02, historical mapping 124 / printed 122; reads FOURTH)
        {
          id: "791381-m03-l01-p02",
          title: "برمجة المنافذ من CLI",
          order: 4,
          source: src(124, 122),
          keywords: ["access", "trunk", "VLAN"],
          blocks: [
            {
              id: "m03-l01-p02-lead", type: "callout", origin: "book", kind: "important",
              spans: [T("خطوات برمجة أي منفذ في السويتش.")],
            },
            {
              id: "m03-l01-p02-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m03-l01-p02-s1", text: [T("نحدّد المنفذ أو مجموعة منافذ.")] },
                { id: "m03-l01-p02-s2", text: [T("نحدّد نوع المنفذ: "), L("Access"), T(" أو "), L("Trunk"), T(".")] },
                { id: "m03-l01-p02-s3", text: [T("بعد ذلك نربط المنفذ بـ "), L("VLAN"), T(" مناسبة.")] },
              ],
            },
            {
              id: "m03-l01-p02-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("كل منفذ يخدم جهازًا واحدًا ("), L("Access"), T(") أو يكون وصلة بين سويتشات ("), L("Trunk"), T(").")],
            },
            {
              id: "m03-l01-p02-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("هذه الصفحة تعطي الخطوات الثلاث بالكلام قبل الأوامر: أولًا اسم المنفذ (تعلّمته في الصفحة السابقة)، ثانيًا نوعه، ثالثًا الـ "), L("VLAN"), T(" التي يتبعها. الأوامر الفعلية لكل خطوة تأتي لاحقًا في هذا القسم بعد أن يشرح الكتاب ما هي "), L("VLAN"), T(".")],
            },
            {
              id: "m03-l01-p02-match", type: "practice-table", origin: "teacher-enrichment",
              caption: "تحقّق من نفسك: Access أم Trunk؟ (اعتمد على صندوق «تذكّر»)",
              headers: ["الوصف", "نوع المنفذ"],
              columnDirs: ["rtl", "ltr"],
              rows: [
                ["منفذ يخدم جهازًا واحدًا.", PK("Access")],
                ["وصلة بين سويتشات.", PK("Trunk")],
                ["منفذ حاسوب واحد نربطه بـ VLAN مناسبة.", PK("Access")],
              ],
            },
            {
              id: "m03-l01-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما الخطوة الأولى عند برمجة أي منفذ في السويتش؟",
                options: [opt("m03-l01-p02-q1-a", "نحدّد المنفذ أو مجموعة منافذ", true), opt("m03-l01-p02-q1-b", "نربط المنفذ بـ VLAN"), opt("m03-l01-p02-q1-c", "نحدّد نوع المنفذ")],
                feedback: {
                  hints: ["افحص القائمة المرقّمة.", "أوّل ما نحتاجه هو اسم المنفذ."],
                  correctFeedback: "أحسنت — أولًا نحدّد المنفذ.",
                  incorrectFeedback: "افحص القائمة المرقّمة: «نحدّد المنفذ أو مجموعة منافذ» أولًا، ثم نوعه، ثم VLAN.",
                  explanation: "الترتيب: المنفذ، ثم النوع، ثم VLAN.",
                },
              },
            },
            {
              id: "m03-l01-p02-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "منفذ Trunk يخدم جهازًا واحدًا، ومنفذ Access وصلة بين سويتشات.",
                answer: false,
                feedback: {
                  hints: ["افحص صندوق «تذكّر».", "الجهاز الواحد … Access."],
                  correctFeedback: "صحيح أنها خطأ — Access لجهاز واحد، و Trunk وصلة بين سويتشات.",
                  incorrectFeedback: "افحص صندوق «تذكّر»: «كل منفذ يخدم جهازًا واحدًا (Access) أو يكون وصلة بين سويتشات (Trunk)».",
                  explanation: "العبارة عكست النوعين.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 5): SVG visual enrichment appended after the book content.
              id: "m03-l01-p02-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m03/switch-ports-map", motion: true,
              source: src(124),
              title: "مخطط: اختيار المنفذ قبل البرمجة",
              alt: "المخطط نفسه لمنافذ السويتش: نحدّد المنفذ الصحيح أو مجموعة المنافذ فيُضاء المنفذ الفيزيائي المقابل قبل كتابة أوامر البرمجة.",
              caption: "‏نختار المنفذ الصحيح قبل كتابة أوامر البرمجة.",
            },
          ],
        },
      ],
    },
    // ── l02 — مفهوم VLAN والمصطلحات (PDF 125–129) ─────────────────────────────────────────────────────────────
    {
      id: "791381-m03-l02",
      title: "مفهوم VLAN والمصطلحات",
      order: 2,
      pages: [
        // PDF 125 — ما هي VLAN؟
        {
          id: "791381-m03-l02-p01",
          title: "ما هي VLAN؟",
          order: 1,
          source: src(125, 125),
          keywords: ["VLAN", "تقسيم الشبكة", "شبكة افتراضية", "الإدارة", "المحاسبة"],
          blocks: [
            {
              id: "m03-l02-p01-def", type: "callout", origin: "book", kind: "important",
              spans: [L("VLAN"), T(" تقسّم الشبكة الكبيرة إلى شبكات أصغر.")],
            },
            {
              id: "m03-l02-p01-figure", type: "table", origin: "book",
              caption: "الرسم: Switch واحد يقسّم الأجهزة — التقسيم منطقي، الكابلات لم تتغيّر",
              headers: ["VLAN", "القسم"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["VLAN 10", "الإدارة"],
                ["VLAN 20", "المحاسبة"],
              ],
            },
            {
              id: "m03-l02-p01-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m03-l02-p01-f1", text: [T("التقسيم يكون افتراضيًا دون تغيير الكابلات.")] },
                { id: "m03-l02-p01-f2", text: [T("كل قسم يصبح كأنه شبكة مستقلة.")] },
                { id: "m03-l02-p01-f3", text: [T("الفائدة: أمان أفضل وتنظيم أسهل وتقليل ازدحام.")] },
              ],
            },
            {
              id: "m03-l02-p01-when", type: "callout", origin: "book", kind: "tip", title: "متى نستعملها؟",
              spans: [T("مفيدة جدًا لفصل الإدارة عن المحاسبة أو الطلاب داخل نفس الشبكة.")],
            },
            {
              id: "m03-l02-p01-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("«منطقي» أي بالإعداد لا بالأسلاك: الحاسوبان الأربعة في الرسم موصولون بالسويتش نفسه، لكن السويتش يعامل الإدارة و المحاسبة كأنهما شبكتان منفصلتان. الحرف الأول في "), L("VLAN"), T(" من "), L("Virtual"), T(" (افتراضية)، والباقي "), L("LAN"), T(" الشبكة المحلية التي عرفتها في قسم أنواع الشبكات.")],
            },
            {
              id: "m03-l02-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ماذا تفعل VLAN حسب الكتاب؟",
                options: [opt("m03-l02-p01-q1-a", "تقسّم الشبكة الكبيرة إلى شبكات أصغر دون تغيير الكابلات", true), opt("m03-l02-p01-q1-b", "تزيد سرعة الكابلات"), opt("m03-l02-p01-q1-c", "تربط شبكتين بعيدتين عبر الإنترنت")],
                feedback: {
                  hints: ["افحص الصندوق الأول.", "«التقسيم يكون افتراضيًا»."],
                  correctFeedback: "أحسنت — تقسيم منطقي دون تغيير الكابلات.",
                  incorrectFeedback: "افحص الصندوق الأول والقائمة: «تقسّم الشبكة الكبيرة إلى شبكات أصغر» و«دون تغيير الكابلات».",
                  explanation: "كل قسم يصبح كأنه شبكة مستقلة.",
                },
              },
            },
            {
              id: "m03-l02-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "لتقسيم الشبكة بـ VLAN يجب تغيير الكابلات بين الأجهزة والسويتش.",
                answer: false,
                feedback: {
                  hints: ["افحص عنوان الرسم.", "«الكابلات لم تتغيّر»."],
                  correctFeedback: "صحيح أنها خطأ — التقسيم منطقي والكابلات لم تتغيّر.",
                  incorrectFeedback: "افحص القائمة: «التقسيم يكون افتراضيًا دون تغيير الكابلات».",
                  explanation: "الفائدة: أمان أفضل وتنظيم أسهل وتقليل ازدحام.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 5): SVG visual enrichment appended after the book content.
              id: "m03-l02-p01-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m03/vlan-segmentation", motion: true,
              source: src(125),
              title: "مخطط: سويتش واحد مقسّم منطقيًا",
              alt: "مخطط لسويتش واحد مقسّم منطقيًا إلى VLAN 10 للإدارة وVLAN 20 للمحاسبة، والحركة تبقى داخل كل VLAN دون تغيير الكابلات.",
              caption: "‏سويتش واحد · تقسيم منطقي · الحركة تبقى داخل VLAN.",
            },
          ],
        },
        // PDF 126 — مصطلحات مهمة في VLAN
        {
          id: "791381-m03-l02-p02",
          title: "مصطلحات مهمة في VLAN",
          order: 2,
          source: src(126, 126),
          keywords: ["VLAN ID", "VLAN 1", "Trunk", "1–4094", "Access"],
          blocks: [
            {
              id: "m03-l02-p02-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m03-l02-p02-id", term: "VLAN ID", text: [T("رقم يميّز كل "), L("VLAN"), T(". مثال: "), L("VLAN 10"), T(" للإدارة، "), L("VLAN 20"), T(" للمحاسبة.")], note: "المجال: 1 – 4094" },
                { id: "m03-l02-p02-one", term: "VLAN 1", text: [T("الشبكة الافتراضية الموجودة على السويتش عند البداية.")], note: "لا يُفضّل استخدامها للأمان" },
                { id: "m03-l02-p02-trunk", term: "Trunk", text: [T("وصلة تسمح بمرور أكثر من "), L("VLAN"), T(" عبر نفس الكابل بين السويتشات.")], note: "كابل واحد لعدة VLAN" },
              ],
            },
            {
              id: "m03-l02-p02-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [L("Access"), T(" = لجهاز عادي، و "), L("Trunk"), T(" = وصلة بين أجهزة الشبكة (سويتشات/راوتر).")],
            },
            {
              id: "m03-l02-p02-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("ثلاثة مصطلحات فقط: الرقم الذي يميّز كل "), L("VLAN"), T(" (من 1 إلى 4094)، و "), L("VLAN 1"), T(" التي يأتي بها السويتش جاهزة من البداية، و "), L("Trunk"), T(" الكابل الواحد الذي يحمل عدة "), L("VLAN"), T(" بين سويتشين. لاحظ أن صندوق «تذكّر» يعيد الفرق بين "), L("Access"), T(" و "), L("Trunk"), T(" من صفحة خطوات البرمجة، ويضيف أن الوصلة قد تكون إلى راوتر أيضًا.")],
            },
            {
              id: "m03-l02-p02-match", type: "practice-table", origin: "teacher-enrichment",
              caption: "تحقّق من نفسك: أي مصطلح لكل وصف؟ (اعتمد على البطاقات)",
              headers: ["الوصف", "المصطلح"],
              columnDirs: ["rtl", "ltr"],
              rows: [
                ["رقم يميّز كل VLAN، مجاله 1 – 4094.", TM("VLAN ID")],
                ["وصلة تسمح بمرور أكثر من VLAN عبر نفس الكابل بين السويتشات.", TM("Trunk")],
                ["الشبكة الافتراضية الموجودة على السويتش عند البداية.", TM("VLAN 1")],
                ["كابل واحد لعدة VLAN.", TM("Trunk")],
              ],
            },
            {
              id: "m03-l02-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما مجال VLAN ID حسب الكتاب؟",
                options: [opt("m03-l02-p02-q1-a", "من 1 إلى 4094", true), opt("m03-l02-p02-q1-b", "من 0 إلى 255"), opt("m03-l02-p02-q1-c", "من 1 إلى 24")],
                feedback: {
                  hints: ["افحص بطاقة VLAN ID.", "السطر الصغير تحت البطاقة."],
                  correctFeedback: "أحسنت — المجال 1 – 4094.",
                  incorrectFeedback: "افحص بطاقة VLAN ID: «المجال: 1 – 4094».",
                  explanation: "0 – 255 مجال خانة عنوان IP، و 24 عدد منافذ FastEthernet في الرسم.",
                },
              },
            },
            {
              id: "m03-l02-p02-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "يُفضّل استخدام VLAN 1 لأنها الشبكة الافتراضية الموجودة على السويتش عند البداية.",
                answer: false,
                feedback: {
                  hints: ["افحص بطاقة VLAN 1.", "السطر الصغير تحت البطاقة يتحدّث عن الأمان."],
                  correctFeedback: "صحيح أنها خطأ — «لا يُفضّل استخدامها للأمان».",
                  incorrectFeedback: "افحص بطاقة VLAN 1: «الشبكة الافتراضية الموجودة على السويتش عند البداية. لا يُفضّل استخدامها للأمان».",
                  explanation: "كونها موجودة من البداية لا يجعلها الخيار المفضّل.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 5): SVG visual enrichment appended after the book content.
              id: "m03-l02-p02-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m03/vlan-access-trunk-terms", motion: true,
              source: src(126),
              title: "مخطط: Access مقابل Trunk",
              alt: "مخطط يميّز منفذ Access الذي ينتمي إلى VLAN واحدة عن وصلة Trunk التي تحمل أكثر من VLAN عبر كابل واحد بين السويتشات.",
              caption: "‏Access = VLAN واحدة · Trunk = عدة VLAN بين السويتشات.",
            },
          ],
        },
        // PDF 127 — فكرة VLAN
        {
          id: "791381-m03-l02-p03",
          title: "فكرة VLAN",
          order: 3,
          source: src(127, 127),
          keywords: ["فكرة VLAN", "راوتر", "سويتش طبقة ثالثة", "فصل الشبكة"],
          blocks: [
            {
              id: "m03-l02-p03-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m03-l02-p03-f1", text: [T("كل مجموعة أجهزة لها "), L("VLAN"), T(" مختلفة.")] },
                { id: "m03-l02-p03-f2", text: [T("الأجهزة داخل نفس "), L("VLAN"), T(" تتواصل بسهولة.")] },
                { id: "m03-l02-p03-f3", text: [T("بين "), L("VLAN"), T(" مختلفة نحتاج راوتر أو سويتش طبقة ثالثة.")] },
              ],
            },
            {
              id: "m03-l02-p03-idea", type: "callout", origin: "book", kind: "important", title: "الفكرة الأساسية",
              spans: [T("فصل الشبكة إلى أقسام واضحة.")],
            },
            {
              id: "m03-l02-p03-summary", type: "callout", origin: "book", kind: "summary", title: "الخلاصة",
              spans: [L("VLAN"), T(" تفصل الأقسام منطقيًا، فيبدو كل قسم كأنه شبكة قائمة بذاتها.")],
            },
            {
              id: "m03-l02-p03-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("«سويتش طبقة ثالثة» أي سويتش يستطيع أيضًا عمل الطبقة الثالثة من نموذج "), L("OSI"), T(" (طبقة الشبكة، التي يعمل فيها الراوتر). داخل الـ "), L("VLAN"), T(" الواحدة يكفي السويتش؛ للانتقال بين "), L("VLAN"), T(" مختلفة نحتاج جهازًا يوجّه بين شبكتين، كما تعلّمت في قسم أجهزة الشبكات.")],
            },
            {
              id: "m03-l02-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ماذا نحتاج ليتواصل جهاز في VLAN مع جهاز في VLAN مختلفة؟",
                options: [opt("m03-l02-p03-q1-a", "راوتر أو سويتش طبقة ثالثة", true), opt("m03-l02-p03-q1-b", "كابل أطول"), opt("m03-l02-p03-q1-c", "لا شيء، فهما في نفس الشبكة")],
                feedback: {
                  hints: ["افحص السطر الثالث في القائمة.", "«بين VLAN مختلفة نحتاج …»."],
                  correctFeedback: "أحسنت — راوتر أو سويتش طبقة ثالثة.",
                  incorrectFeedback: "افحص القائمة: «بين VLAN مختلفة نحتاج راوتر أو سويتش طبقة ثالثة».",
                  explanation: "كل قسم يبدو كأنه شبكة قائمة بذاتها.",
                },
              },
            },
            {
              id: "m03-l02-p03-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "الأجهزة داخل نفس VLAN تتواصل بسهولة.",
                answer: true,
                feedback: {
                  hints: ["افحص السطر الثاني في القائمة.", "نفس القسم = نفس الشبكة."],
                  correctFeedback: "صحيح — داخل نفس VLAN التواصل سهل.",
                  incorrectFeedback: "افحص القائمة: «الأجهزة داخل نفس VLAN تتواصل بسهولة».",
                  explanation: "الصعوبة تكون فقط بين VLAN مختلفة.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 5): SVG visual enrichment appended after the book content.
              id: "m03-l02-p03-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m03/vlan-segmentation", motion: true,
              source: src(127),
              title: "مخطط: فكرة VLAN — فصل الأقسام منطقيًا",
              alt: "المخطط نفسه لفكرة VLAN: كل مجموعة أجهزة في VLAN مختلفة، والأجهزة داخل نفس VLAN تتواصل بينما تبقى الأقسام منفصلة منطقيًا.",
              caption: "‏كل قسم يصبح كأنه شبكة مستقلة.",
            },
          ],
        },
        // PDF 128 — جدول مثال VLAN
        {
          id: "791381-m03-l02-p04",
          title: "جدول مثال VLAN",
          order: 4,
          source: src(128, 128),
          keywords: ["جدول VLAN", "192.168.10", "192.168.20", "/24", "Pc1-ADMIN", "Pc1-GAZ"],
          blocks: [
            {
              id: "m03-l02-p04-table", type: "table", origin: "book",
              caption: "جدول مثال VLAN كما في الكتاب",
              headers: ["الجهاز", "الفرع", "VLAN", "العنوان", "القناع"],
              columnDirs: ["ltr", "rtl", "ltr", "ltr", "ltr"],
              rows: [
                ["Pc1-ADMIN", "الإدارة", "10", "192.168.10.1", "/24"],
                ["Pc2-ADMIN", "الإدارة", "10", "192.168.10.2", "/24"],
                ["Pc1-GAZ", "المحاسبة", "20", "192.168.20.1", "/24"],
                ["Pc2-GAZ", "المحاسبة", "20", "192.168.20.2", "/24"],
              ],
            },
            {
              id: "m03-l02-p04-note", type: "callout", origin: "book", kind: "important", title: "لاحظ",
              spans: [T("كل "), L("VLAN"), T(" لها شبكة "), L("IP"), T(" مختلفة في هذا المثال: الإدارة "), L("192.168.10.x"), T(" والمحاسبة "), L("192.168.20.x"), T(".")],
            },
            {
              id: "m03-l02-p04-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("اقرأ كل صف كسطر واحد: اسم الجهاز، الفرع الذي يعمل فيه، رقم "), L("VLAN"), T("، عنوانه، والقناع. القناع "), L("/24"), T(" هو ما تعلّمته في قسم "), L("CIDR"), T(": الخانات الثلاث الأولى شبكة والخانة الأخيرة جهاز؛ لذلك جهازا الإدارة في شبكة "), L("192.168.10.x"), T(" وجهازا المحاسبة في شبكة "), L("192.168.20.x"), T(".")],
            },
            {
              id: "m03-l02-p04-ex1", type: "example", origin: "teacher-enrichment", mode: "solved",
              title: "مثال محلول: اقرأ صف Pc2-GAZ",
              steps: [
                { text: "الفرع: المحاسبة — إذن هو من أجهزة المحاسبة." },
                { text: "VLAN: 20 — أجهزة المحاسبة في هذا المثال كلها في VLAN 20." },
                { text: "العنوان 192.168.20.2 والقناع /24 — شبكته 192.168.20.x، وهي غير شبكة الإدارة 192.168.10.x." },
              ],
              result: "Pc2-GAZ: المحاسبة · VLAN 20 · 192.168.20.2 /24",
              explanation: "في هذا المثال، كل VLAN لها شبكة IP مختلفة، كما يقول صندوق «لاحظ».",
            },
            {
              id: "m03-l02-p04-match", type: "practice-table", origin: "teacher-enrichment",
              caption: "تحقّق من نفسك: في أي VLAN كل جهاز؟ (اعتمد على الجدول)",
              headers: ["الجهاز", "VLAN"],
              columnDirs: ["ltr", "ltr"],
              rows: [
                ["Pc1-ADMIN", VL("10")],
                ["Pc2-GAZ", VL("20")],
                ["Pc1-GAZ", VL("20")],
                ["Pc2-ADMIN", VL("10")],
              ],
            },
            {
              id: "m03-l02-p04-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما عنوان Pc1-GAZ في الجدول؟",
                options: [opt("m03-l02-p04-q1-a", "192.168.20.1", true), opt("m03-l02-p04-q1-b", "192.168.10.1"), opt("m03-l02-p04-q1-c", "192.168.20.2")],
                feedback: {
                  hints: ["افحص صف Pc1-GAZ.", "المحاسبة في شبكة 192.168.20.x."],
                  correctFeedback: "أحسنت — 192.168.20.1.",
                  incorrectFeedback: "افحص الجدول: صف Pc1-GAZ — المحاسبة، VLAN 20، 192.168.20.1، /24.",
                  explanation: "192.168.10.1 هو Pc1-ADMIN، و 192.168.20.2 هو Pc2-GAZ.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 5): SVG visual enrichment appended after the book content.
              id: "m03-l02-p04-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m03/vlan-example-topology", motion: true,
              source: src(128),
              title: "مخطط: جدول مثال VLAN — أي جهاز في أي VLAN",
              alt: "مخطط يوزّع أجهزة المثال على شبكاتها: Pc1-ADMIN وPc2-ADMIN في VLAN 10 بعناوين 192.168.10.x، وPc1-GAZ وPc2-GAZ في VLAN 20 بعناوين 192.168.20.x.",
              caption: "‏كل VLAN لها شبكة IP مختلفة في هذا المثال.",
            },
          ],
        },
        // PDF 129 — توزيع الأجهزة على VLAN
        {
          id: "791381-m03-l02-p05",
          title: "توزيع الأجهزة على VLAN",
          order: 5,
          source: src(129, 129),
          keywords: ["توزيع الأجهزة", "إعداد المنفذ", "VLAN 10", "VLAN 20"],
          blocks: [
            {
              id: "m03-l02-p05-question", type: "callout", origin: "book", kind: "important",
              spans: [T("كيف يوزّع السويتش الأجهزة على "), L("VLAN"), T("؟")],
            },
            {
              id: "m03-l02-p05-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m03-l02-p05-f1", text: [L("Pc1"), T(" و "), L("Pc2"), T(" في "), L("VLAN 10"), T(" (الإدارة).")] },
                { id: "m03-l02-p05-f2", text: [T("أجهزة المحاسبة في "), L("VLAN 20"), T(".")] },
                { id: "m03-l02-p05-f3", text: [T("السويتش يميّز الأجهزة حسب المنفذ المتصل به.")] },
              ],
            },
            {
              id: "m03-l02-p05-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("السويتش لا يعرف القسم من اسم الجهاز، بل من إعداد المنفذ.")],
            },
            {
              id: "m03-l02-p05-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("هذا يربط جدول المثال بخطوات البرمجة: الاسم "), L("Pc1-ADMIN"), T(" في الجدول لا يعني شيئًا للسويتش؛ ما يعنيه هو المنفذ الذي وُصل به الجهاز وما أُعدّ لهذا المنفذ. لذلك كانت الخطوة الأولى في برمجة أي منفذ هي تحديد المنفذ نفسه.")],
            },
            {
              id: "m03-l02-p05-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ممّ يعرف السويتش القسم (VLAN) الذي ينتمي إليه الجهاز؟",
                options: [opt("m03-l02-p05-q1-a", "من إعداد المنفذ المتصل به الجهاز", true), opt("m03-l02-p05-q1-b", "من اسم الجهاز مثل Pc1-ADMIN"), opt("m03-l02-p05-q1-c", "من لون الكابل")],
                feedback: {
                  hints: ["افحص صندوق «تذكّر».", "«لا يعرف القسم من اسم الجهاز، بل من …»."],
                  correctFeedback: "أحسنت — من إعداد المنفذ.",
                  incorrectFeedback: "افحص صندوق «تذكّر»: «السويتش لا يعرف القسم من اسم الجهاز، بل من إعداد المنفذ».",
                  explanation: "السويتش يميّز الأجهزة حسب المنفذ المتصل به.",
                },
              },
            },
            {
              id: "m03-l02-p05-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "في المثال، أجهزة المحاسبة في VLAN 20 و Pc1 و Pc2 في VLAN 10.",
                answer: true,
                feedback: {
                  hints: ["افحص قائمة الصفحة.", "الإدارة 10، المحاسبة 20."],
                  correctFeedback: "صحيح — الإدارة في VLAN 10 والمحاسبة في VLAN 20.",
                  incorrectFeedback: "افحص القائمة: «Pc1 و Pc2 في VLAN 10 (الإدارة)» و«أجهزة المحاسبة في VLAN 20».",
                  explanation: "نفس التوزيع الذي في جدول المثال.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 5): SVG visual enrichment appended after the book content.
              id: "m03-l02-p05-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m03/vlan-example-topology", motion: true,
              source: src(129),
              title: "مخطط: توزيع الأجهزة على VLAN",
              alt: "المخطط نفسه لتوزيع الأجهزة: السويتش يميّز كل جهاز حسب المنفذ المتصل به، فيضع أجهزة الإدارة في VLAN 10 وأجهزة المحاسبة في VLAN 20.",
              caption: "‏السويتش يميّز الجهاز حسب المنفذ لا حسب الاسم.",
            },
          ],
        },
      ],
    },
    // ── l03 — إنشاء VLAN وربط المنافذ (PDF 130–134) ───────────────────────────────────────────────────────────
    {
      id: "791381-m03-l03",
      title: "إنشاء VLAN وربط المنافذ",
      order: 3,
      pages: [
        // PDF 130 — إنشاء VLAN على السويتش
        {
          id: "791381-m03-l03-p01",
          title: "إنشاء VLAN على السويتش",
          order: 1,
          source: src(130, 130),
          keywords: ["vlan 10", "name", "MNG", "GAZ", "إنشاء VLAN"],
          blocks: [
            {
              id: "m03-l03-p01-cli", type: "code", origin: "book", language: "cli",
              code: "Switch(config)# vlan 10\nSwitch(config-vlan)# name MNG\nSwitch(config)# vlan 20\nSwitch(config-vlan)# name GAZ",
            },
            {
              id: "m03-l03-p01-cmds", type: "table", origin: "book",
              caption: "Switch CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Switch(config)# vlan 10", "يُنشئ VLAN رقم 10"],
                ["Switch(config-vlan)# name MNG", "يعطيها اسمًا واضحًا"],
                ["Switch(config)# vlan 20", "نكرّر الأمر لكل VLAN نحتاجها"],
                ["Switch(config-vlan)# name GAZ", "اسم VLAN المحاسبة"],
              ],
            },
            {
              id: "m03-l03-p01-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("الاسم لا يغيّر عمل الشبكة، لكنه يسهّل الإدارة والمتابعة.")],
            },
            {
              id: "m03-l03-p01-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("لاحظ الموجّه كما علّمتك صفحة الدخول إلى وضع البرمجة: بعد "), L("vlan 10"), T(" يصبح "), L("Switch(config-vlan)#"), T("، أي أنك داخل إعداد هذه الـ "), L("VLAN"), T(" وتستطيع تسميتها. الاسمان من مثال الكتاب: "), L("MNG"), T(" للإدارة و "), L("GAZ"), T(" للمحاسبة، وهما اسما الفرعين في جدول المثال.")],
            },
            {
              id: "m03-l03-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي أمر يُنشئ VLAN رقم 20؟",
                options: [opt("m03-l03-p01-q1-a", "vlan 20", true), opt("m03-l03-p01-q1-b", "name GAZ"), opt("m03-l03-p01-q1-c", "configure terminal")],
                feedback: {
                  hints: ["افحص جدول الأوامر.", "«نكرّر الأمر لكل VLAN نحتاجها»."],
                  correctFeedback: "أحسنت — vlan 20.",
                  incorrectFeedback: "افحص جدول الأوامر: «Switch(config)# vlan 20 — نكرّر الأمر لكل VLAN نحتاجها».",
                  explanation: "name GAZ يعطيها اسمًا بعد إنشائها.",
                },
              },
            },
            {
              id: "m03-l03-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "اسم VLAN (مثل MNG) يغيّر طريقة عمل الشبكة.",
                answer: false,
                feedback: {
                  hints: ["افحص صندوق «تذكّر».", "«الاسم لا يغيّر …»."],
                  correctFeedback: "صحيح أنها خطأ — الاسم يسهّل الإدارة والمتابعة فقط.",
                  incorrectFeedback: "افحص صندوق «تذكّر»: «الاسم لا يغيّر عمل الشبكة، لكنه يسهّل الإدارة والمتابعة».",
                  explanation: "ما يميّز VLAN هو رقمها.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 5): SVG visual enrichment appended after the book content.
              id: "m03-l03-p01-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m03/create-vlan", motion: true,
              source: src(130),
              title: "مخطط: إنشاء VLAN بالأمر vlan",
              alt: "مخطط يبيّن أن الأمر vlan 10 ثم name MNG ينشئ VLAN داخل السويتش، ثم vlan 20 ثم name GAZ ينشئ الثانية — والاسم للإدارة فقط.",
              caption: "‏vlan 10 ثم name MNG · vlan 20 ثم name GAZ.",
            },
          ],
        },
        // PDF 131 — ربط المنافذ مع VLAN
        {
          id: "791381-m03-l03-p02",
          title: "ربط المنافذ مع VLAN",
          order: 2,
          source: src(131, 131),
          keywords: ["interface range", "switchport mode access", "switchport access vlan", "ربط المنافذ"],
          blocks: [
            {
              id: "m03-l03-p02-cli", type: "code", origin: "book", language: "cli",
              code: "Switch(config)# interface range f0/1-10\nSwitch(config)# switchport mode access\nSwitch(config)# switchport access vlan 10",
            },
            {
              id: "m03-l03-p02-cmds", type: "table", origin: "book",
              caption: "Switch CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Switch(config)# interface range f0/1-10", "يحدّد مجموعة منافذ"],
                ["Switch(config)# switchport mode access", "المنفذ لجهاز عادي"],
                ["Switch(config)# switchport access vlan 10", "يربط المنافذ بـ VLAN 10"],
              ],
            },
            {
              id: "m03-l03-p02-result", type: "callout", origin: "book", kind: "important", title: "النتيجة",
              spans: [T("الجهاز المتصل بالمنفذ يصبح داخل "), L("VLAN"), T(" المحدّدة تلقائيًا.")],
            },
            {
              id: "m03-l03-p02-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("هذه هي الخطوات الثلاث من صفحة برمجة المنافذ، لكن بالأوامر: "), L("interface range f0/1-10"), T(" يحدّد المنافذ من "), L("F0/1"), T(" إلى "), L("F0/10"), T(" (الخطوة الأولى)، "), L("switchport mode access"), T(" يجعلها منافذ "), L("Access"), T(" (الخطوة الثانية)، "), L("switchport access vlan 10"), T(" يربطها بـ "), L("VLAN 10"), T(" (الخطوة الثالثة). الكتاب يكتب الموجّه مختصرًا "), L("Switch(config)#"), T(" أمام الأوامر الثلاثة؛ في الجهاز الحقيقي يتغيّر الموجّه بعد أمر "), L("interface"), T(" ليدلّ على أنك داخل إعداد المنفذ، كما تغيّر إلى "), L("(config-vlan)#"), T(" في الصفحة السابقة.")],
            },
            {
              id: "m03-l03-p02-match", type: "practice-table", origin: "teacher-enrichment",
              caption: "تحقّق من نفسك: ماذا يفعل كل أمر؟ (اعتمد على جدول الأوامر)",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["switchport access vlan 10", PU("يربط المنافذ بـ VLAN 10")],
                ["interface range f0/1-10", PU("يحدّد مجموعة منافذ")],
                ["switchport mode access", PU("المنفذ لجهاز عادي")],
              ],
            },
            {
              id: "m03-l03-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "بعد الأوامر الثلاثة، ماذا يحدث للجهاز المتصل بالمنفذ F0/3؟",
                options: [opt("m03-l03-p02-q1-a", "يصبح داخل VLAN 10 تلقائيًا", true), opt("m03-l03-p02-q1-b", "يصبح داخل VLAN 20"), opt("m03-l03-p02-q1-c", "لا يتغيّر شيء لأن الأوامر لا تشمل F0/3")],
                feedback: {
                  hints: ["افحص صندوق «النتيجة».", "المجموعة f0/1-10 تشمل F0/3."],
                  correctFeedback: "أحسنت — F0/3 ضمن المجموعة، فالجهاز يصبح داخل VLAN 10.",
                  incorrectFeedback: "افحص جدول الأوامر و«النتيجة»: المجموعة f0/1-10 تُربط بـ VLAN 10، و«الجهاز المتصل بالمنفذ يصبح داخل VLAN المحدّدة تلقائيًا».",
                  explanation: "interface range f0/1-10 يشمل المنافذ من F0/1 إلى F0/10.",
                },
              },
            },
            {
              id: "m03-l03-p02-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "الأمر switchport mode access يجعل المنفذ لجهاز عادي.",
                answer: true,
                feedback: {
                  hints: ["افحص السطر الثاني في جدول الأوامر.", "Access = لجهاز عادي."],
                  correctFeedback: "صحيح — mode access للجهاز العادي.",
                  incorrectFeedback: "افحص جدول الأوامر: «switchport mode access — المنفذ لجهاز عادي».",
                  explanation: "ثم switchport access vlan 10 يربطه بـ VLAN 10.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 5): SVG visual enrichment appended after the book content.
              id: "m03-l03-p02-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m03/access-port-assignment", motion: true,
              source: src(131),
              title: "مخطط: ربط المنفذ بـ VLAN",
              alt: "مخطط يبيّن خطوات ربط المنفذ: interface f0/1 ثم switchport mode access ثم switchport access vlan 10، فيدخل الجهاز VLAN 10 تلقائيًا.",
              caption: "‏الجهاز المتصل يدخل VLAN المحدّدة بعد الإعداد.",
            },
          ],
        },
        // PDF 132 — توضيح Access Ports
        {
          id: "791381-m03-l03-p03",
          title: "توضيح Access Ports",
          order: 3,
          source: src(132, 132),
          keywords: ["Access Port", "VLAN واحدة", "Tag", "الأجهزة النهائية"],
          blocks: [
            {
              id: "m03-l03-p03-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m03-l03-p03-f1", text: [T("منفذ "), L("Access"), T(" ينتمي إلى "), L("VLAN"), T(" واحدة فقط.")] },
                { id: "m03-l03-p03-f2", text: [T("يُستخدم مع الحواسيب والطابعات والأجهزة النهائية.")] },
                { id: "m03-l03-p03-f3", text: [T("الجهاز لا يحتاج أن يعرف رقم "), L("VLAN"), T(".")] },
                { id: "m03-l03-p03-f4", text: [T("السويتش هو الذي يحدّد "), L("VLAN"), T(" حسب إعداد المنفذ.")] },
              ],
            },
            {
              id: "m03-l03-p03-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [L("Access Port"), T(" = جهاز واحد في "), L("VLAN"), T(" واحدة، بلا أي "), L("Tag"), T(".")],
            },
            {
              id: "m03-l03-p03-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("الحاسوب الموصول بمنفذ "), L("Access"), T(" لا يعرف أنه في "), L("VLAN 10"), T(" أو "), L("VLAN 20"), T("؛ السويتش وحده يقرّر ذلك من إعداد المنفذ، وهذا ما رأيته في صفحة توزيع الأجهزة. كلمة "), L("Tag"), T(" تظهر هنا أول مرة كاسم فقط؛ الكتاب يشرح معناها في صفحة "), L("Native / Tagged / Untagged"), T(" لاحقًا.")],
            },
            {
              id: "m03-l03-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "إلى كم VLAN ينتمي منفذ Access؟",
                options: [opt("m03-l03-p03-q1-a", "VLAN واحدة فقط", true), opt("m03-l03-p03-q1-b", "كل VLAN في السويتش"), opt("m03-l03-p03-q1-c", "VLAN 10 و VLAN 20 معًا")],
                feedback: {
                  hints: ["افحص السطر الأول في القائمة.", "افحص صندوق «تذكّر»."],
                  correctFeedback: "أحسنت — VLAN واحدة فقط.",
                  incorrectFeedback: "افحص القائمة: «منفذ Access ينتمي إلى VLAN واحدة فقط».",
                  explanation: "Access Port = جهاز واحد في VLAN واحدة.",
                },
              },
            },
            {
              id: "m03-l03-p03-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "الحاسوب الموصول بمنفذ Access يجب أن يعرف رقم VLAN الخاصة به.",
                answer: false,
                feedback: {
                  hints: ["افحص السطر الثالث في القائمة.", "من يحدّد VLAN؟"],
                  correctFeedback: "صحيح أنها خطأ — الجهاز لا يحتاج أن يعرف رقم VLAN؛ السويتش يحدّدها.",
                  incorrectFeedback: "افحص القائمة: «الجهاز لا يحتاج أن يعرف رقم VLAN» و«السويتش هو الذي يحدّد VLAN حسب إعداد المنفذ».",
                  explanation: "الإعداد على المنفذ لا على الجهاز.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 5): SVG visual enrichment appended after the book content.
              id: "m03-l03-p03-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m03/access-port-assignment", motion: true,
              source: src(132),
              title: "مخطط: Access Port — جهاز واحد في VLAN واحدة",
              alt: "المخطط نفسه لمنفذ Access: بعد الخطوات يصبح المنفذ عضوًا في VLAN واحدة فقط، ويرسل الجهاز ويستقبل بلا Tag.",
              caption: "‏Access Port = جهاز واحد في VLAN واحدة، بلا Tag.",
            },
          ],
        },
        // PDF 133 — الواجهة SVI
        {
          id: "791381-m03-l03-p04",
          title: "الواجهة SVI",
          order: 4,
          source: src(133, 133),
          keywords: ["SVI", "interface vlan", "ip address", "no shutdown", "Layer 3"],
          blocks: [
            {
              id: "m03-l03-p04-cli", type: "code", origin: "book", language: "cli",
              code: "Switch(config)# interface vlan 10\nSwitch(config)# ip address 192.168.10.254 255.255.255.0\nSwitch(config)# no shutdown",
            },
            {
              id: "m03-l03-p04-cmds", type: "table", origin: "book",
              caption: "Switch CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Switch(config)# interface vlan 10", "واجهة افتراضية داخل السويتش"],
                ["Switch(config)# ip address 192.168.10.254 255.255.255.0", "عنوان IP لإدارة VLAN"],
                ["Switch(config)# no shutdown", "يشغّل الواجهة"],
              ],
            },
            {
              id: "m03-l03-p04-when", type: "callout", origin: "book", kind: "tip", title: "متى؟",
              spans: [L("SVI"), T(" مفيدة خاصة في السويتشات التي تدعم الطبقة الثالثة ("), L("Layer 3"), T(").")],
            },
            {
              id: "m03-l03-p04-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [L("SVI"), T(" واجهة افتراضية: ليست منفذًا ماديًا مثل "), L("F0/1"), T("، بل واجهة داخل السويتش تمثّل "), L("VLAN 10"), T(" وتحمل عنوان "), L("IP"), T(". العنوان "), L("192.168.10.254"), T(" من شبكة الإدارة "), L("192.168.10.x"), T(" في جدول المثال، والقناع "), L("255.255.255.0"), T(" هو "), L("/24"), T(" نفسه مكتوبًا بالطريقة الطويلة. بلا "), L("no shutdown"), T(" تبقى الواجهة مطفأة.")],
            },
            {
              id: "m03-l03-p04-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي أمر يشغّل الواجهة SVI؟",
                options: [opt("m03-l03-p04-q1-a", "no shutdown", true), opt("m03-l03-p04-q1-b", "interface vlan 10"), opt("m03-l03-p04-q1-c", "ip address 192.168.10.254 255.255.255.0")],
                feedback: {
                  hints: ["افحص السطر الثالث في جدول الأوامر.", "«يشغّل الواجهة»."],
                  correctFeedback: "أحسنت — no shutdown يشغّل الواجهة.",
                  incorrectFeedback: "افحص جدول الأوامر: «Switch(config)# no shutdown — يشغّل الواجهة».",
                  explanation: "interface vlan 10 يدخل إلى الواجهة، و ip address يعطيها عنوانًا.",
                },
              },
            },
            {
              id: "m03-l03-p04-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما وظيفة العنوان 192.168.10.254 في هذه الصفحة؟",
                options: [opt("m03-l03-p04-q2-a", "عنوان IP لإدارة VLAN على الواجهة الافتراضية", true), opt("m03-l03-p04-q2-b", "عنوان الحاسوب Pc1-ADMIN"), opt("m03-l03-p04-q2-c", "رقم VLAN")],
                feedback: {
                  hints: ["افحص السطر الثاني في جدول الأوامر.", "«عنوان IP لإدارة VLAN»."],
                  correctFeedback: "أحسنت — عنوان IP لإدارة VLAN.",
                  incorrectFeedback: "افحص جدول الأوامر: «ip address 192.168.10.254 255.255.255.0 — عنوان IP لإدارة VLAN».",
                  explanation: "Pc1-ADMIN عنوانه 192.168.10.1 في جدول المثال؛ رقم VLAN هو 10.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 5): SVG visual enrichment appended after the book content.
              id: "m03-l03-p04-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m03/svi-interface", motion: true,
              source: src(133),
              title: "مخطط: الواجهة المنطقية SVI",
              alt: "مخطط يبيّن الواجهة المنطقية interface vlan 10 داخل السويتش بعنوان 192.168.10.254، مميّزة بخط متقطّع عن المنافذ الفيزيائية.",
              caption: "‏SVI واجهة منطقية داخل السويتش لا منفذ فيزيائي.",
            },
          ],
        },
        // PDF 134 — فكرة SVI و Gateway
        {
          id: "791381-m03-l03-p05",
          title: "فكرة SVI و Gateway",
          order: 5,
          source: src(134, 134),
          keywords: ["Gateway", "Default Gateway", "نقطة خروج", "192.168.1.254"],
          blocks: [
            {
              id: "m03-l03-p05-def", type: "callout", origin: "book", kind: "important",
              spans: [T("لكل "), L("VLAN"), T(" يمكن أن يكون "), L("Gateway"), T(" خاص بها.")],
            },
            {
              id: "m03-l03-p05-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m03-l03-p05-f1", text: [T("العنوان "), L("192.168.1.254"), T(" يمثّل نقطة خروج للأجهزة.")] },
                { id: "m03-l03-p05-f2", text: [T("تُستخدم لإدارة أو توجيه بين الشبكات الظاهرية.")] },
                { id: "m03-l03-p05-f3", text: [L("Default Gateway"), T(" هو الباب الذي يخرج منه الجهاز.")] },
              ],
            },
            {
              id: "m03-l03-p05-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("بدون "), L("Gateway"), T(" تعمل "), L("VLAN"), T(" داخليًا، لكن لا تصل إلى الشبكات الأخرى.")],
            },
            {
              id: "m03-l03-p05-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("«الشبكات الظاهرية» هي الـ "), L("VLAN"), T(" نفسها. تعرّفت على "), L("Default Gateway"), T(" في قسم عناوين "), L("IP"), T(" كباب الخروج من الشبكة؛ هنا الفكرة نفسها لكل "), L("VLAN"), T(": عنوان الواجهة الافتراضية في الصفحة السابقة يمكن أن يكون هذا الباب. الكتاب يستعمل هنا عنوان مثال عامًا "), L("192.168.1.254"), T("، وفي الصفحة السابقة "), L("192.168.10.254"), T(" لشبكة الإدارة؛ الفكرة واحدة: نقطة خروج للأجهزة.")],
            },
            {
              id: "m03-l03-p05-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ماذا يحدث لـ VLAN بلا Gateway؟",
                options: [opt("m03-l03-p05-q1-a", "تعمل داخليًا لكن لا تصل إلى الشبكات الأخرى", true), opt("m03-l03-p05-q1-b", "تتوقّف الأجهزة داخلها عن التواصل"), opt("m03-l03-p05-q1-c", "تصل إلى كل الشبكات الأخرى مباشرة")],
                feedback: {
                  hints: ["افحص صندوق «تذكّر».", "الباب الذي يخرج منه الجهاز."],
                  correctFeedback: "أحسنت — تعمل داخليًا فقط.",
                  incorrectFeedback: "افحص صندوق «تذكّر»: «بدون Gateway تعمل VLAN داخليًا، لكن لا تصل إلى الشبكات الأخرى».",
                  explanation: "Default Gateway هو الباب الذي يخرج منه الجهاز.",
                },
              },
            },
            {
              id: "m03-l03-p05-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "يمكن أن يكون لكل VLAN بوابة Gateway خاصة بها.",
                answer: true,
                feedback: {
                  hints: ["افحص الصندوق الأول.", "«لكل VLAN يمكن أن يكون …»."],
                  correctFeedback: "صحيح — لكل VLAN يمكن أن يكون Gateway خاص بها.",
                  incorrectFeedback: "افحص الصندوق الأول: «لكل VLAN يمكن أن يكون Gateway خاص بها».",
                  explanation: "تُستخدم لإدارة أو توجيه بين الشبكات الظاهرية.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 5): SVG visual enrichment appended after the book content.
              id: "m03-l03-p05-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m03/svi-gateway", motion: true,
              source: src(134),
              title: "مخطط: Gateway — الخروج إلى الشبكات الأخرى",
              alt: "مخطط يبيّن أن Default Gateway بعنوان 192.168.1.254 هو باب خروج أجهزة VLAN إلى الشبكات الأخرى؛ بدونه تعمل VLAN داخليًا فقط.",
              caption: "‏Gateway باب الخروج · بدونه تعمل VLAN داخليًا فقط.",
            },
          ],
        },
      ],
    },
    // ── l04 — Native / Tagged / Untagged (PDF 135–138) ────────────────────────────────────────────────────────
    {
      id: "791381-m03-l04",
      title: "Native / Tagged / Untagged",
      order: 4,
      pages: [
        // PDF 135 — Native / Tagged / Untagged VLAN
        {
          id: "791381-m03-l04-p01",
          title: "Native / Tagged / Untagged VLAN",
          order: 1,
          source: src(135, 135),
          keywords: ["Native VLAN", "Tagged VLAN", "Untagged VLAN", "Tag", "Trunk"],
          blocks: [
            {
              id: "m03-l04-p01-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m03-l04-p01-native", term: "Native VLAN", text: [T("تمرّ عبر "), L("Trunk"), T(" بدون "), L("Tag"), T("، وتُستخدم للتوافق مع أجهزة قديمة.")], note: "يُفضّل تغييرها من VLAN 1" },
                { id: "m03-l04-p01-tagged", term: "Tagged VLAN", text: [T("الحزمة تحمل رقم "), L("VLAN"), T("، وتُستخدم عبر وصلات "), L("Trunk"), T(".")], note: "مثال: VLAN 10,20" },
                { id: "m03-l04-p01-untagged", term: "Untagged VLAN", text: [T("حزمة بدون "), L("Tag"), T("، تظهر غالبًا في منافذ "), L("Access"), T(" للأجهزة العادية.")], note: "PC / Printer" },
              ],
            },
            {
              id: "m03-l04-p01-tag", type: "callout", origin: "book", kind: "important", title: "ما هو الـ Tag؟",
              spans: [T("علامة داخل الحزمة تخبر السويتش لأي "), L("VLAN"), T(" تنتمي هذه الحزمة.")],
            },
            {
              id: "m03-l04-p01-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("على كابل "), L("Trunk"), T(" الواحد تمرّ حزم من عدة "), L("VLAN"), T("؛ لكي يعرف السويتش الآخر لمن كل حزمة، تحمل الحزمة علامة برقم الـ "), L("VLAN"), T(" (هذه هي "), L("Tagged"), T("). حزم الـ "), L("Native VLAN"), T(" وحدها تمرّ على الـ "), L("Trunk"), T(" بلا علامة. أما منفذ "), L("Access"), T(" فيخدم جهازًا واحدًا في "), L("VLAN"), T(" واحدة، فلا يحتاج علامة أصلًا ("), L("Untagged"), T(")، كما قال صندوق «تذكّر» في صفحة توضيح "), L("Access Ports"), T(".")],
            },
            {
              id: "m03-l04-p01-match", type: "practice-table", origin: "teacher-enrichment",
              caption: "تحقّق من نفسك: أي نوع لكل وصف؟ (اعتمد على البطاقات)",
              headers: ["الوصف", "النوع"],
              columnDirs: ["rtl", "ltr"],
              rows: [
                ["الحزمة تحمل رقم VLAN عبر وصلات Trunk.", TG("Tagged VLAN")],
                ["تمرّ عبر Trunk بدون Tag، للتوافق مع أجهزة قديمة.", TG("Native VLAN")],
                ["حزمة بدون Tag في منافذ Access للأجهزة العادية.", TG("Untagged VLAN")],
                ["يُفضّل تغييرها من VLAN 1.", TG("Native VLAN")],
              ],
            },
            {
              id: "m03-l04-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما هو الـ Tag حسب الكتاب؟",
                options: [opt("m03-l04-p01-q1-a", "علامة داخل الحزمة تخبر السويتش لأي VLAN تنتمي الحزمة", true), opt("m03-l04-p01-q1-b", "اسم المنفذ على السويتش"), opt("m03-l04-p01-q1-c", "كلمة مرور الدخول إلى CLI")],
                feedback: {
                  hints: ["افحص صندوق «ما هو الـ Tag؟».", "علامة داخل الحزمة."],
                  correctFeedback: "أحسنت — علامة داخل الحزمة برقم VLAN.",
                  incorrectFeedback: "افحص صندوق «ما هو الـ Tag؟»: «علامة داخل الحزمة تخبر السويتش لأي VLAN تنتمي هذه الحزمة».",
                  explanation: "Tagged VLAN تحمل الرقم؛ Untagged بلا علامة.",
                },
              },
            },
            {
              id: "m03-l04-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "Native VLAN تمرّ عبر Trunk بدون Tag، ويُفضّل تركها على VLAN 1.",
                answer: false,
                feedback: {
                  hints: ["افحص بطاقة Native VLAN كاملة.", "السطر الصغير تحت البطاقة."],
                  correctFeedback: "صحيح أنها خطأ — الجزء الأول صحيح، لكن «يُفضّل تغييرها من VLAN 1».",
                  incorrectFeedback: "افحص بطاقة Native VLAN: «تمرّ عبر Trunk بدون Tag … يُفضّل تغييرها من VLAN 1».",
                  explanation: "تذكّر من صفحة المصطلحات: VLAN 1 لا يُفضّل استخدامها للأمان.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 5): SVG visual enrichment appended after the book content.
              id: "m03-l04-p01-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m03/tagged-untagged-native", motion: true,
              source: src(135),
              title: "مخطط: Tagged و Untagged و Native",
              alt: "مخطط يميّز بين الحزمة المُوسَمة (Tagged) التي تحمل رقم VLAN عبر Trunk، والحزمة على منفذ Access بلا Tag، والحزمة على Native VLAN التي تعبر Trunk بلا Tag.",
              caption: "‏الوسم يخبر السويتش لأي VLAN تنتمي الحزمة.",
            },
          ],
        },
        // PDF 136 — إعداد Native VLAN
        {
          id: "791381-m03-l04-p02",
          title: "إعداد Native VLAN",
          order: 2,
          source: src(136, 136),
          keywords: ["switchport mode trunk", "switchport trunk native vlan", "vlan 99", "f0/24"],
          blocks: [
            {
              id: "m03-l04-p02-cli", type: "code", origin: "book", language: "cli",
              code: "Switch(config)# interface f0/24\nSwitch(config)# switchport mode trunk\nSwitch(config)# switchport trunk native vlan 99",
            },
            {
              id: "m03-l04-p02-cmds", type: "table", origin: "book",
              caption: "Switch CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Switch(config)# interface f0/24", "نحدّد منفذ Trunk"],
                ["Switch(config)# switchport mode trunk", "نجعله Trunk"],
                ["Switch(config)# switchport trunk native vlan 99", "نجعل VLAN 99 هي Native"],
              ],
            },
            {
              id: "m03-l04-p02-why", type: "callout", origin: "book", kind: "important", title: "لماذا؟",
              spans: [T("لأسباب أمنية يُفضّل عدم ترك "), L("Native VLAN"), T(" على "), L("VLAN 1"), T("؛ وهي لا تحمل "), L("Tag"), T(" على رابط "), L("Trunk"), T(".")],
            },
            {
              id: "m03-l04-p02-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("الخطوتان الأوليان هما خطوتا برمجة أي منفذ: نحدّد المنفذ ("), L("F0/24"), T("، آخر منافذ "), L("FastEthernet"), T(" في رسم السويتش) ثم نحدّد نوعه "), L("Trunk"), T(" بدل "), L("Access"), T(". الأمر الثالث يختار رقم الـ "), L("Native VLAN"), T("؛ الرقم "), L("99"), T(" مثال الكتاب لرقم غير "), L("1"), T(" ضمن المجال "), L("1 – 4094"), T(".")],
            },
            {
              id: "m03-l04-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي أمر يجعل المنفذ Trunk؟",
                options: [opt("m03-l04-p02-q1-a", "switchport mode trunk", true), opt("m03-l04-p02-q1-b", "switchport mode access"), opt("m03-l04-p02-q1-c", "interface f0/24")],
                feedback: {
                  hints: ["افحص السطر الثاني في جدول الأوامر.", "«نجعله Trunk»."],
                  correctFeedback: "أحسنت — switchport mode trunk.",
                  incorrectFeedback: "افحص جدول الأوامر: «Switch(config)# switchport mode trunk — نجعله Trunk».",
                  explanation: "interface f0/24 يحدّد المنفذ أولًا، ثم mode trunk يحدّد نوعه.",
                },
              },
            },
            {
              id: "m03-l04-p02-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "لأسباب أمنية يُفضّل عدم ترك Native VLAN على VLAN 1.",
                answer: true,
                feedback: {
                  hints: ["افحص صندوق «لماذا؟».", "الكتاب يقترح رقمًا آخر مثل 99."],
                  correctFeedback: "صحيح — لذلك يجعل الكتاب VLAN 99 هي Native.",
                  incorrectFeedback: "افحص صندوق «لماذا؟»: «لأسباب أمنية يُفضّل عدم ترك Native VLAN على VLAN 1».",
                  explanation: "Native VLAN لا تحمل Tag على رابط Trunk.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 5): SVG visual enrichment appended after the book content.
              id: "m03-l04-p02-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m03/tagged-untagged-native", motion: true,
              source: src(136),
              title: "مخطط: إعداد Native VLAN",
              alt: "المخطط نفسه: Native VLAN (مثال 99) تعبر وصلة Trunk بدون Tag، ويُفضّل ألا تبقى على VLAN 1 لأسباب أمنية.",
              caption: "‏Native VLAN تعبر Trunk بلا Tag.",
            },
          ],
        },
        // PDF 137 — إعداد Tagged VLAN عبر Trunk
        {
          id: "791381-m03-l04-p03",
          title: "إعداد Tagged VLAN عبر Trunk",
          order: 3,
          source: src(137, 137),
          keywords: ["switchport trunk allowed vlan", "Tagged", "Trunk", "10,20"],
          blocks: [
            {
              id: "m03-l04-p03-cli", type: "code", origin: "book", language: "cli",
              code: "Switch(config)# interface f0/24\nSwitch(config)# switchport mode trunk\nSwitch(config)# switchport trunk allowed vlan 10,20",
            },
            {
              id: "m03-l04-p03-cmds", type: "table", origin: "book",
              caption: "Switch CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Switch(config)# interface f0/24", "منفذ الوصلة"],
                ["Switch(config)# switchport mode trunk", "Trunk يسمح بمرور عدة VLAN"],
                ["Switch(config)# switchport trunk allowed vlan 10,20", "يسمح فقط لـ VLAN 10 و 20"],
              ],
            },
            {
              id: "m03-l04-p03-benefit", type: "callout", origin: "book", kind: "summary", title: "الفائدة",
              spans: [T("الحزم تحمل "), L("Tag"), T(" برقم "), L("VLAN"), T("، فيعرف السويتش مصدر كل حزمة.")],
            },
            {
              id: "m03-l04-p03-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("نفس المنفذ "), L("F0/24"), T(" ونفس أمر "), L("Trunk"), T(" من الصفحة السابقة؛ الجديد هو الأمر الثالث الذي يحدّد أي "), L("VLAN"), T(" يُسمح لها بالمرور عبر الوصلة: "), L("10,20"), T(" هما مثال بطاقة "), L("Tagged VLAN"), T(" («مثال: "), L("VLAN 10,20"), T("»)، أي الإدارة والمحاسبة من جدول المثال. تُكتب الأرقام بفاصلة بلا مسافة كما في الكتاب.")],
            },
            {
              id: "m03-l04-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ماذا يفعل الأمر switchport trunk allowed vlan 10,20؟",
                options: [opt("m03-l04-p03-q1-a", "يسمح فقط لـ VLAN 10 و 20 بالمرور عبر الوصلة", true), opt("m03-l04-p03-q1-b", "يُنشئ VLAN 10 و VLAN 20"), opt("m03-l04-p03-q1-c", "يجعل VLAN 10 هي Native")],
                feedback: {
                  hints: ["افحص السطر الثالث في جدول الأوامر.", "«يسمح فقط لـ …»."],
                  correctFeedback: "أحسنت — يسمح فقط لـ VLAN 10 و 20.",
                  incorrectFeedback: "افحص جدول الأوامر: «switchport trunk allowed vlan 10,20 — يسمح فقط لـ VLAN 10 و 20».",
                  explanation: "إنشاء VLAN يكون بالأمر vlan 10 من صفحة الإنشاء؛ Native يُحدَّد بأمر native vlan.",
                },
              },
            },
            {
              id: "m03-l04-p03-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "لماذا يعرف السويتش مصدر كل حزمة على وصلة Trunk؟",
                options: [opt("m03-l04-p03-q2-a", "لأن الحزم تحمل Tag برقم VLAN", true), opt("m03-l04-p03-q2-b", "لأن لكل VLAN كابلًا منفصلًا"), opt("m03-l04-p03-q2-c", "لأن الجهاز يكتب اسمه في الحزمة")],
                feedback: {
                  hints: ["افحص صندوق «الفائدة».", "ما هو الـ Tag؟"],
                  correctFeedback: "أحسنت — Tag برقم VLAN.",
                  incorrectFeedback: "افحص صندوق «الفائدة»: «الحزم تحمل Tag برقم VLAN، فيعرف السويتش مصدر كل حزمة».",
                  explanation: "Trunk = كابل واحد لعدة VLAN، والتمييز بالـ Tag.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 5): SVG visual enrichment appended after the book content.
              id: "m03-l04-p03-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m03/tagged-untagged-native", motion: true,
              source: src(137),
              title: "مخطط: إعداد Tagged VLAN عبر Trunk",
              alt: "المخطط نفسه: على وصلة Trunk تحمل حزم VLAN 10 و20 وسمًا (Tag) يعرّف السويتش بمصدرها، بينما Native تعبر بلا Tag.",
              caption: "‏Tagged: الحزم تحمل رقم VLAN عبر Trunk.",
            },
          ],
        },
        // PDF 138 — إعداد Untagged / Access (the section's last page: closing review)
        {
          id: "791381-m03-l04-p04",
          title: "إعداد Untagged / Access",
          order: 4,
          source: src(138, 138),
          keywords: ["Untagged", "Access", "switchport access vlan", "f0/1", "Trunk Port"],
          blocks: [
            {
              id: "m03-l04-p04-cli", type: "code", origin: "book", language: "cli",
              code: "Switch(config)# interface f0/1\nSwitch(config)# switchport mode access\nSwitch(config)# switchport access vlan 10",
            },
            {
              id: "m03-l04-p04-cmds", type: "table", origin: "book",
              caption: "Switch CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Switch(config)# interface f0/1", "منفذ لجهاز نهائي مثل حاسوب"],
                ["Switch(config)# switchport mode access", "المنفذ ينتمي إلى VLAN واحدة"],
                ["Switch(config)# switchport access vlan 10", "الجهاز يرسل ويستقبل بدون Tag"],
              ],
            },
            {
              id: "m03-l04-p04-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [L("Access Port"), T(" = جهاز عادي، و "), L("Trunk Port"), T(" = بين أجهزة الشبكة.")],
            },
            {
              id: "m03-l04-p04-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("هذه الأوامر هي أوامر صفحة ربط المنافذ نفسها، لكن لمنفذ واحد "), L("F0/1"), T(" بدل مجموعة. الجديد هو الربط بالمصطلح: منفذ "), L("Access"), T(" يعمل "), L("Untagged"), T("، فالحاسوب يرسل ويستقبل بلا علامة، والسويتش هو الذي يعرف أن هذا المنفذ في "), L("VLAN 10"), T(". قارن مع الصفحتين السابقتين: على "), L("F0/24"), T(" جعلنا المنفذ "), L("Trunk"), T(" وحدّدنا "), L("Native"), T(" أو الـ "), L("VLAN"), T(" المسموح بها.")],
            },
            {
              id: "m03-l04-p04-ex1", type: "example", origin: "teacher-enrichment", mode: "solved",
              title: "مثال محلول: ضع حاسوب المحاسبة الموصول بالمنفذ F0/3 في VLAN 20",
              steps: [
                { text: "الخطوة الأولى: نحدّد المنفذ. الأمر: interface f0/3 (بدل f0/1 في مثال الكتاب)." },
                { text: "الخطوة الثانية: نحدّد النوع. حاسوب = جهاز عادي، إذن: switchport mode access." },
                { text: "الخطوة الثالثة: نربطه بـ VLAN المحاسبة من جدول المثال، وهي 20: switchport access vlan 20." },
              ],
              result: "interface f0/3 · switchport mode access · switchport access vlan 20",
              explanation: "الخطوات الثلاث من صفحة برمجة المنافذ، بالأوامر نفسها التي يعرضها الكتاب، مع تغيير رقم المنفذ ورقم VLAN فقط.",
            },
            {
              id: "m03-l04-p04-match", type: "practice-table", origin: "teacher-enrichment",
              caption: "تحقّق من نفسك: Access أم Trunk؟ (اعتمد على صفحات الإعداد الثلاث)",
              headers: ["المنفذ", "نوع المنفذ"],
              columnDirs: ["rtl", "ltr"],
              rows: [
                ["منفذ F0/1 لحاسوب واحد يرسل ويستقبل بدون Tag.", PK("Access")],
                ["منفذ F0/24 الذي يصل السويتش بسويتش آخر.", PK("Trunk")],
                ["منفذ تمرّ عبره VLAN 10 و 20 معًا بـ Tag.", PK("Trunk")],
                ["منفذ طابعة ينتمي إلى VLAN واحدة.", PK("Access")],
              ],
            },
            {
              id: "m03-l04-p04-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "الجهاز الموصول بمنفذ Access يرسل ويستقبل بدون Tag.",
                answer: true,
                feedback: {
                  hints: ["افحص السطر الثالث في جدول الأوامر.", "Untagged = بلا علامة."],
                  correctFeedback: "صحيح — بدون Tag.",
                  incorrectFeedback: "افحص جدول الأوامر: «switchport access vlan 10 — الجهاز يرسل ويستقبل بدون Tag».",
                  explanation: "منفذ Access ينتمي إلى VLAN واحدة، فلا يحتاج علامة.",
                },
              },
            },
            // ── closing review for the section (easy, medium, exam-like) ──
            {
              id: "m03-l04-p04-review", type: "heading", origin: "teacher-enrichment", level: 3, text: "مراجعة ختامية: برمجة السويتش CLI و VLAN",
            },
            {
              id: "m03-l04-p04-r1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما ترتيب الأوامر للدخول إلى وضع الإعدادات؟",
                options: [opt("m03-l04-p04-r1-a", "enable ثم configure terminal", true), opt("m03-l04-p04-r1-b", "configure terminal ثم enable"), opt("m03-l04-p04-r1-c", "vlan 10 ثم enable")],
                feedback: {
                  hints: ["افحص صفحة الدخول إلى وضع البرمجة.", "من > إلى # ثم (config)#."],
                  correctFeedback: "أحسنت — enable ثم configure terminal.",
                  incorrectFeedback: "افحص جدول الأوامر في صفحة الدخول إلى وضع البرمجة: «Switch> enable» ثم «Switch# configure terminal».",
                  explanation: "الموجّه يتغيّر من > إلى # ثم (config)#.",
                },
              },
            },
            {
              id: "m03-l04-p04-r2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "سؤال بأسلوب الامتحان: منفذ F0/24 يصل السويتش بسويتش آخر ويجب أن تمرّ عبره VLAN 10 و VLAN 20. أي نوع نجعله، وبأي أمر؟",
                options: [opt("m03-l04-p04-r2-a", "Trunk، بالأمر switchport mode trunk", true), opt("m03-l04-p04-r2-b", "Access، بالأمر switchport mode access"), opt("m03-l04-p04-r2-c", "SVI، بالأمر interface vlan 10")],
                feedback: {
                  hints: ["افحص صندوق «تذكّر» في هذه الصفحة.", "كابل واحد لعدة VLAN = Trunk."],
                  correctFeedback: "أحسنت — Trunk بين أجهزة الشبكة، بالأمر switchport mode trunk.",
                  incorrectFeedback: "افحص صندوق «تذكّر»: «Trunk Port = بين أجهزة الشبكة»، وجدول أوامر صفحة Tagged: «switchport mode trunk — Trunk يسمح بمرور عدة VLAN».",
                  explanation: "ثم switchport trunk allowed vlan 10,20 يسمح فقط لهاتين الـ VLAN.",
                },
              },
            },
            {
              id: "m03-l04-p04-r3", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "سؤال بأسلوب الامتحان: حاسوب في VLAN 10 يريد الوصول إلى حاسوب في VLAN 20. ما الصحيح؟",
                options: [opt("m03-l04-p04-r3-a", "يحتاج راوتر أو سويتش طبقة ثالثة، لأن كل VLAN كأنها شبكة قائمة بذاتها", true), opt("m03-l04-p04-r3-b", "يكفي أن يكونا على نفس السويتش"), opt("m03-l04-p04-r3-c", "يكفي أن يُغيَّر اسم الحاسوب")],
                feedback: {
                  hints: ["افحص صفحة فكرة VLAN.", "«بين VLAN مختلفة نحتاج …»."],
                  correctFeedback: "أحسنت — بين VLAN مختلفة نحتاج راوتر أو سويتش طبقة ثالثة.",
                  incorrectFeedback: "افحص صفحة فكرة VLAN: «بين VLAN مختلفة نحتاج راوتر أو سويتش طبقة ثالثة»، و«الخلاصة»: كل قسم كأنه شبكة قائمة بذاتها.",
                  explanation: "السويتش لا يعرف القسم من اسم الجهاز، بل من إعداد المنفذ.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 5): SVG visual enrichment appended after the book content.
              id: "m03-l04-p04-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m03/access-port-assignment", motion: true,
              source: src(138),
              title: "مخطط: إعداد Untagged / Access",
              alt: "المخطط نفسه لإعداد Access: interface f0/1 ثم switchport mode access ثم switchport access vlan 10، والجهاز يرسل ويستقبل بدون Tag.",
              caption: "‏إعداد Access: المنفذ ينتمي إلى VLAN واحدة بلا Tag.",
            },
          ],
        },
      ],
    },
  ],
};

export default m03;
