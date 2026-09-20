// Learning Materials — Batch 7 phase: REAL converted body for Book 791381, module m04 (the book's section
// «توجيه بين الشبكات · Trunk و Router on a Stick», source PDF 146–156, plus the PDF 157 end-of-batch trainings page;
// PDF 145 is the section cover). m04 is a HISTORICAL Phase-2 skeleton module, COMPLETED IN PLACE: its stable id
// `791381-m04`, its title «Trunk و Router on a Stick», its lesson `791381-m04-l01` («الربط بين السويتشات والتوجيه») and
// its historical page keep their ids, titles, meanings and source mappings EXACTLY as the skeleton declared them —
//   `791381-m04-l01-p01` = PDF 148 «أوامر Trunk» (printedPage 146, as recorded by the Phase-2 skeleton; keywords unchanged)
// PDF 146–147 come BEFORE it in the book, so they are NEW stable page ids (`-p02`, `-p03`) placed first by explicit
// `order` (1, 2); the historical page takes order 3; PDF 149–150 follow as `-p04`, `-p05`. Ids are opaque — `order`
// sequences. PRINTED-PAGE NOTE: the skeleton recorded the hidden text-layer running number (two lower than the page
// circle) for its page; that value is immutable. Every NEW page follows PRINTED PAGE = the page circle = the PDF index.
// Reading `order`: 17 — after the new m19 («إدارة VLAN: VTP», order 16) which the book places before this section.
// PDF 158 («الدفعة الخامسة · Wi-Fi و IPv6 و DHCP والأمان» cover) is the HARD STOP of this batch: nothing from PDF 158+
// (DMZ, Wi-Fi, SSID, wireless security, access points, IPv6, port numbers, DHCP …) appears.
// Book-derived blocks are origin:"book": the PDF 146 table + «قاعدة», the PDF 147 definition + figure + facts +
// «تذكّر», every «Switch CLI» / «Router CLI» box as a `code` block (exact command lines, LTR) + a command/explanation
// table with the book's own annotations, the «تذكّر» / «قاعدة» / «الهدف» / «الفكرة» / «ملاحظة» boxes, the PDF 156
// concept cards + «للامتحان», and the PDF 157 training cards + line. Technical tokens (Trunk, VLAN, Tag, Access,
// Router on a Stick, Dot1Q, Sub-Interface, Layer 2, Inter-VLAN Routing, the port names, prompts, commands and
// addresses) are LTR spans; no arrow glyphs. SOURCE LEVEL: no real terminal, no invented output, no commands beyond
// the printed ones (no `no shutdown` on the router, no `show`, no VTP here — that is m19's section).

import type { ContentModule, ContentSource, InlineSpan, PracticeOption, PracticeTableSelectCell } from "../../types";

const CID = "791381";
const src = (pdf: number, printed?: number): ContentSource => ({ kind: "book", sourceId: CID, pdfPageStart: pdf, printedPage: printed });
const L = (text: string): InlineSpan => ({ text, dir: "ltr", style: "code" });
const T = (text: string): InlineSpan => ({ text });
const opt = (id: string, text: string, correct?: true): PracticeOption => (correct ? { id, text, correct } : { id, text });
const DOT1Q_PURPOSES = ["نحدّد منفذ GigabitEthernet0/1", "نجعله Trunk", "نسمح بمرور VLAN 10 و 20 و 30"] as const;
const DP = (key: (typeof DOT1Q_PURPOSES)[number]): PracticeTableSelectCell => ({ kind: "select", options: [...DOT1Q_PURPOSES], key });
const VLANS = ["VLAN 10", "VLAN 20", "VLAN 30", "VLAN 40"] as const;
const VL = (key: (typeof VLANS)[number]): PracticeTableSelectCell => ({ kind: "select", options: [...VLANS], key });
const CONCEPTS = ["VLAN", "Trunk", "Dot1Q", "Router on a Stick"] as const;
const CO = (key: (typeof CONCEPTS)[number]): PracticeTableSelectCell => ({ kind: "select", options: [...CONCEPTS], key });

const m04: ContentModule = {
  id: "791381-m04",
  title: "Trunk و Router on a Stick",
  shortTitle: "Trunk",
  order: 17,
  source: { kind: "book", sourceId: CID, pdfPageStart: 145, pdfPageEnd: 157, sourceNote: "PDF 145 صفحة عنوان القسم «توجيه بين الشبكات · Trunk و Router on a Stick» (بيانات وصفية فقط؛ لا تُعرض كصفحة تعلّم). صفحات التعلّم من PDF 146 إلى PDF 156، و PDF 157 صفحة «نهاية الدفعة الرابعة» الختامية (رموز QR للتدريبات 19–22، بلا رقم صفحة مطبوع). PDF 158 صفحة عنوان الدفعة الخامسة من الكتاب ولا يُحوَّل هنا." },
  lessons: [
    // ── l01 — الربط بين السويتشات والتوجيه (PDF 146–150; the historical lesson id and title) ────────────────
    {
      id: "791381-m04-l01",
      title: "الربط بين السويتشات والتوجيه",
      order: 1,
      pages: [
        // PDF 146 — منافذ الربط بين السويتشات (NEW stable id p02, reads FIRST by explicit order)
        {
          id: "791381-m04-l01-p02",
          title: "منافذ الربط بين السويتشات",
          order: 1,
          source: src(146, 146),
          keywords: ["منافذ الربط", "Trunk", "Sw1-HFA", "F0/23", "F0/24", "G0/0"],
          blocks: [
            {
              id: "m04-l01-p02-table", type: "table", origin: "book",
              caption: "المنافذ التي ستكون Trunk في كل سويتش",
              headers: ["السويتش", "المنافذ التي ستكون Trunk"],
              columnDirs: ["ltr", "ltr"],
              rows: [
                ["Sw1-HFA", "F0/23 , F0/24"],
                ["Sw2-HFA", "F0/22 , F0/23 , F0/24"],
                ["Sw3-HFA", "F0/22 , F0/23 , F0/24"],
                ["Sw4-HFA", "F0/23 , F0/24"],
                ["Sw5-HFA", "F0/22 , F0/23 , F0/24"],
                ["Sw6-HFA", "F0/22 , F0/23 , F0/24 , G0/0"],
              ],
            },
            {
              id: "m04-l01-p02-rule", type: "callout", origin: "book", kind: "important", title: "قاعدة",
              spans: [T("المنافذ بين السويتشات غالبًا تكون "), L("Trunk"), T(" لتمرير عدة "), L("VLAN"), T(" عبرها.")],
            },
            {
              id: "m04-l01-p02-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("الجدول هو مخطّط شبكة المثال في هذا القسم: ستة سويتشات أسماؤها من "), L("Sw1-HFA"), T(" إلى "), L("Sw6-HFA"), T("، وأمام كل واحد المنافذ التي تصله بسويتش آخر. هذه المنافذ عادة آخر منافذ "), L("FastEthernet"), T(" (من "), L("F0/22"), T(" إلى "), L("F0/24"), T(")، وفي "), L("Sw6-HFA"), T(" يوجد أيضًا المنفذ الأسرع "), L("G0/0"), T(". باقي المنافذ تبقى "), L("Access"), T(" للأجهزة كما تعلّمت.")],
            },
            {
              id: "m04-l01-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "كم منفذًا سيكون Trunk في Sw1-HFA حسب الجدول؟",
                options: [opt("m04-l01-p02-q1-a", "منفذان: F0/23 و F0/24", true), opt("m04-l01-p02-q1-b", "ثلاثة منافذ: F0/22 و F0/23 و F0/24"), opt("m04-l01-p02-q1-c", "أربعة منافذ مع G0/0")],
                feedback: {
                  hints: ["افحص صف Sw1-HFA في الجدول.", "الصف الأول."],
                  correctFeedback: "أحسنت — F0/23 و F0/24.",
                  incorrectFeedback: "افحص الجدول: صف Sw1-HFA يذكر «F0/23 , F0/24» فقط.",
                  explanation: "ثلاثة منافذ في Sw2 و Sw3 و Sw5، وأربعة في Sw6 مع G0/0.",
                },
              },
            },
            {
              id: "m04-l01-p02-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "اكتب اسم المنفذ الوحيد من نوع Gigabit الذي يظهر في الجدول.",
                answer: "G0/0",
                feedback: {
                  hints: ["افحص صف Sw6-HFA.", "الحرف G."],
                  correctFeedback: "صحيح — G0/0 في Sw6-HFA.",
                  incorrectFeedback: "افحص الجدول: صف Sw6-HFA ينتهي بـ «G0/0».",
                  explanation: "المنافذ الأسرع Gigabit تُكتب بالحرف G.",
                },
              },
            },
          ],
        },
        // PDF 147 — ما هو Trunk؟ (NEW stable id p03, reads SECOND)
        {
          id: "791381-m04-l01-p03",
          title: "ما هو Trunk؟",
          order: 2,
          source: src(147, 147),
          keywords: ["Trunk", "Tag", "كابل واحد", "Access"],
          blocks: [
            {
              id: "m04-l01-p03-def", type: "callout", origin: "book", kind: "important",
              spans: [L("Trunk"), T(" هو رابط ينقل عدة "), L("VLAN"), T(" عبر نفس الكابل.")],
            },
            {
              id: "m04-l01-p03-figure", type: "callout", origin: "book", kind: "summary", title: "الرسم: Switch 1 و Switch 2",
              spans: [T("كابل واحد "), L("Trunk"), T(" بين "), L("Switch 1"), T(" و "), L("Switch 2"), T(" تمرّ عبره "), L("VLAN 10"), T(" و "), L("VLAN 20"), T(" و "), L("VLAN 30"), T(". كل حزمة تحمل "), L("Tag"), T(" يدلّ على "), L("VLAN"), T(" التي تنتمي إليها. بدون "), L("Trunk"), T(" نحتاج كابلًا منفصلًا لكل "), L("VLAN"), T(".")],
            },
            {
              id: "m04-l01-p03-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m04-l01-p03-f1", text: [T("يُستخدم غالبًا بين سويتش وسويتش أو سويتش وراوتر.")] },
                { id: "m04-l01-p03-f2", text: [T("الحزم تحمل "), L("Tag"), T(" حتى نعرف لأي "), L("VLAN"), T(" تنتمي.")] },
                { id: "m04-l01-p03-f3", text: [T("بدون "), L("Trunk"), T(" نحتاج كابلًا منفصلًا لكل "), L("VLAN"), T(".")] },
              ],
            },
            {
              id: "m04-l01-p03-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [L("Access"), T(" لجهاز واحد، و "), L("Trunk"), T(" لنقل عدة "), L("VLAN"), T(" عبر كابل واحد.")],
            },
            {
              id: "m04-l01-p03-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("عرفت "), L("Trunk"), T(" و "), L("Tag"), T(" كمصطلحين في قسم برمجة السويتش؛ هذه الصفحة تجمعهما في صورة واحدة: كابل واحد بين السويتشين، وعلى كل حزمة علامة برقم الـ "), L("VLAN"), T(" حتى يعرف السويتش المستقبِل لمن هي. لولا ذلك لاحتجنا إلى ثلاثة كابلات لثلاث "), L("VLAN"), T(".")],
            },
            {
              id: "m04-l01-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "لماذا تحمل الحزم Tag على رابط Trunk؟",
                options: [opt("m04-l01-p03-q1-a", "حتى نعرف لأي VLAN تنتمي كل حزمة", true), opt("m04-l01-p03-q1-b", "لتسريع الكابل"), opt("m04-l01-p03-q1-c", "لأن Access يحتاج Tag")],
                feedback: {
                  hints: ["افحص السطر الثاني في القائمة.", "«حتى نعرف لأي VLAN …»."],
                  correctFeedback: "أحسنت — الـ Tag يدلّ على VLAN التي تنتمي إليها الحزمة.",
                  incorrectFeedback: "افحص القائمة: «الحزم تحمل Tag حتى نعرف لأي VLAN تنتمي».",
                  explanation: "Access لجهاز واحد بلا Tag؛ Trunk لعدة VLAN مع Tag.",
                },
              },
            },
            {
              id: "m04-l01-p03-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "بدون Trunk نحتاج كابلًا منفصلًا لكل VLAN بين السويتشين.",
                answer: true,
                feedback: {
                  hints: ["افحص السطر الثالث في القائمة.", "افحص نص الرسم."],
                  correctFeedback: "صحيح — كابل لكل VLAN، لذلك نستعمل Trunk.",
                  incorrectFeedback: "افحص القائمة: «بدون Trunk نحتاج كابلًا منفصلًا لكل VLAN».",
                  explanation: "Trunk هو رابط ينقل عدة VLAN عبر نفس الكابل.",
                },
              },
            },
          ],
        },
        // PDF 148 — أوامر Trunk (HISTORICAL id p01, historical mapping 148 / printed 146; reads THIRD)
        {
          id: "791381-m04-l01-p01",
          title: "أوامر Trunk",
          order: 3,
          source: src(148, 146),
          keywords: ["trunk", "dot1q"],
          blocks: [
            {
              id: "m04-l01-p01-cli", type: "code", origin: "book", language: "cli",
              code: "Switch(config)# interface range f0/23-24\nSwitch(config)# switchport mode trunk",
            },
            {
              id: "m04-l01-p01-cmds", type: "table", origin: "book",
              caption: "Switch CLI (Sw1 و Sw2): الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Switch(config)# interface range f0/23-24", "يحدّد عدة منافذ معًا"],
                ["Switch(config)# switchport mode trunk", "يحوّلها إلى Trunk"],
              ],
            },
            {
              id: "m04-l01-p01-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("نكتب الأمر على كل سويتش في منافذ الربط بين السويتشات.")],
            },
            {
              id: "m04-l01-p01-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("عنوان الصفحة في الكتاب «أوامر Trunk — Sw1 و Sw2»: المنافذ "), L("f0/23-24"), T(" هي بالضبط منافذ الربط التي يذكرها جدول الصفحة الأولى لـ "), L("Sw1-HFA"), T(". الأمران هما نفس أمري "), L("interface range"), T(" و "), L("switchport mode trunk"), T(" من قسم برمجة السويتش، لكن على منافذ الربط بدل منافذ الأجهزة.")],
            },
            {
              id: "m04-l01-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ماذا يفعل الأمر interface range f0/23-24؟",
                options: [opt("m04-l01-p01-q1-a", "يحدّد المنفذين F0/23 و F0/24 معًا", true), opt("m04-l01-p01-q1-b", "يحوّل المنفذين إلى Trunk"), opt("m04-l01-p01-q1-c", "يُنشئ VLAN 23 و VLAN 24")],
                feedback: {
                  hints: ["افحص السطر الأول في جدول الأوامر.", "«يحدّد عدة منافذ معًا»."],
                  correctFeedback: "أحسنت — يحدّد المنفذين معًا.",
                  incorrectFeedback: "افحص جدول الأوامر: «interface range f0/23-24 — يحدّد عدة منافذ معًا».",
                  explanation: "switchport mode trunk هو الذي يحوّلها إلى Trunk.",
                },
              },
            },
            {
              id: "m04-l01-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "يكفي كتابة أوامر Trunk على سويتش واحد فقط من السويتشين المتصلين.",
                answer: false,
                feedback: {
                  hints: ["افحص صندوق «تذكّر».", "«على كل سويتش»."],
                  correctFeedback: "صحيح أنها خطأ — نكتب الأمر على كل سويتش في منافذ الربط.",
                  incorrectFeedback: "افحص صندوق «تذكّر»: «نكتب الأمر على كل سويتش في منافذ الربط بين السويتشات».",
                  explanation: "الصفحة التالية تشرح لماذا يجب أن يكون الطرفان Trunk.",
                },
              },
            },
          ],
        },
        // PDF 149 — أوامر Trunk — باقي السويتشات (NEW stable id p04, reads FOURTH)
        {
          id: "791381-m04-l01-p04",
          title: "أوامر Trunk — باقي السويتشات",
          order: 4,
          source: src(149, 149),
          keywords: ["Trunk", "المنفذ المقابل", "من الجهتين", "قاعدة"],
          blocks: [
            {
              id: "m04-l01-p04-lead", type: "callout", origin: "book", kind: "important",
              spans: [T("نكرّر الفكرة على كل منفذ ربط بين السويتشات.")],
            },
            {
              id: "m04-l01-p04-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m04-l01-p04-f1", text: [T("المهم أن يكون المنفذ المقابل "), L("Trunk"), T(" أيضًا.")] },
                { id: "m04-l01-p04-f2", text: [T("بهذا تمرّ "), L("VLAN"), T(" بين السويتشات بسلاسة.")] },
                { id: "m04-l01-p04-f3", text: [L("Trunk"), T(" يجب أن يكون متّفقًا من الجهتين.")] },
              ],
            },
            {
              id: "m04-l01-p04-rule", type: "callout", origin: "book", kind: "warning", title: "قاعدة",
              spans: [T("إذا كان أحد الطرفين "), L("Trunk"), T(" والآخر ليس "), L("Trunk"), T("، لن تمرّ "), L("VLAN"), T(" بينهما.")],
            },
            {
              id: "m04-l01-p04-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("الكابل الواحد له طرفان: منفذ في السويتش الأول ومنفذ في السويتش الثاني. الأمر "), L("switchport mode trunk"), T(" يُكتب على الطرفين، كل واحد في سويتشه، وإلا فالطرف الذي بقي "), L("Access"), T(" لن يفهم الحزم التي تحمل "), L("Tag"), T(". لذلك يعطي جدول الصفحة الأولى منافذ الربط لكل سويتش من الستة.")],
            },
            {
              id: "m04-l01-p04-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "إذا كان منفذ Sw1 في وضع Trunk ومنفذ Sw2 المقابل له ليس Trunk، تمرّ VLAN بينهما بسلاسة.",
                answer: false,
                feedback: {
                  hints: ["افحص صندوق «قاعدة».", "«متّفقًا من الجهتين»."],
                  correctFeedback: "صحيح أنها خطأ — لن تمرّ VLAN بينهما.",
                  incorrectFeedback: "افحص صندوق «قاعدة»: «إذا كان أحد الطرفين Trunk والآخر ليس Trunk، لن تمرّ VLAN بينهما».",
                  explanation: "Trunk يجب أن يكون متّفقًا من الجهتين.",
                },
              },
            },
            {
              id: "m04-l01-p04-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ماذا نفعل على باقي السويتشات حسب الكتاب؟",
                options: [opt("m04-l01-p04-q2-a", "نكرّر الفكرة على كل منفذ ربط بين السويتشات", true), opt("m04-l01-p04-q2-b", "نجعل كل منافذها Trunk بما فيها منافذ الحواسيب"), opt("m04-l01-p04-q2-c", "لا شيء، يكفي Sw1")],
                feedback: {
                  hints: ["افحص الصندوق الأول.", "«على كل منفذ ربط …»."],
                  correctFeedback: "أحسنت — على كل منفذ ربط بين السويتشات.",
                  incorrectFeedback: "افحص الصندوق الأول: «نكرّر الفكرة على كل منفذ ربط بين السويتشات».",
                  explanation: "منافذ الأجهزة تبقى Access.",
                },
              },
            },
          ],
        },
        // PDF 150 — Trunk على Sw6 مع الراوتر (NEW stable id p05, reads FIFTH)
        {
          id: "791381-m04-l01-p05",
          title: "Trunk على Sw6 مع الراوتر",
          order: 5,
          source: src(150, 150),
          keywords: ["Sw6", "الراوتر", "G0/0", "Router on a Stick"],
          blocks: [
            {
              id: "m04-l01-p05-lead", type: "callout", origin: "book", kind: "important",
              spans: [L("Sw6"), T(" متصل بسويتشات أخرى وبالراوتر.")],
            },
            {
              id: "m04-l01-p05-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m04-l01-p05-f1", text: [T("رابط الراوتر يحتاج "), L("Trunk"), T(" إذا كان "), L("Router on a Stick"), T(".")] },
                { id: "m04-l01-p05-f2", text: [T("نقل "), L("VLAN"), T(" للراوتر يسمح بالتوجيه بينها.")] },
                { id: "m04-l01-p05-f3", text: [T("المنفذ "), L("G0/0"), T(" يربط "), L("Sw6"), T(" بالراوتر.")] },
              ],
            },
            {
              id: "m04-l01-p05-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("الراوتر لا يعرف "), L("VLAN"), T(" إلا إذا وصلته الحزم عبر "), L("Trunk"), T(".")],
            },
            {
              id: "m04-l01-p05-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("هنا يظهر المنفذ "), L("G0/0"), T(" الذي رأيته في صف "), L("Sw6-HFA"), T(" من الجدول: إنه المنفذ نحو الراوتر، ويجب أن يكون "), L("Trunk"), T(" أيضًا حتى تصل الحزم مع الـ "), L("Tag"), T(" إلى الراوتر. اسم الطريقة "), L("Router on a Stick"), T(" يشرحه الكتاب في الصفحة التالية.")],
            },
            {
              id: "m04-l01-p05-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي منفذ يربط Sw6 بالراوتر؟",
                options: [opt("m04-l01-p05-q1-a", "G0/0", true), opt("m04-l01-p05-q1-b", "F0/1"), opt("m04-l01-p05-q1-c", "F0/22")],
                feedback: {
                  hints: ["افحص السطر الثالث في القائمة.", "افحص صف Sw6-HFA في جدول الصفحة الأولى."],
                  correctFeedback: "أحسنت — G0/0.",
                  incorrectFeedback: "افحص القائمة: «المنفذ G0/0 يربط Sw6 بالراوتر».",
                  explanation: "F0/22 إلى F0/24 في Sw6 تصل سويتشات أخرى.",
                },
              },
            },
            {
              id: "m04-l01-p05-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "الراوتر يعرف VLAN حتى لو وصلته الحزم عبر منفذ Access.",
                answer: false,
                feedback: {
                  hints: ["افحص صندوق «تذكّر».", "«إلا إذا وصلته الحزم عبر …»."],
                  correctFeedback: "صحيح أنها خطأ — لا يعرفها إلا عبر Trunk.",
                  incorrectFeedback: "افحص صندوق «تذكّر»: «الراوتر لا يعرف VLAN إلا إذا وصلته الحزم عبر Trunk».",
                  explanation: "رابط الراوتر يحتاج Trunk إذا كان Router on a Stick.",
                },
              },
            },
          ],
        },
      ],
    },
    // ── l02 — Router on a Stick و Dot1Q (PDF 151–155) ───────────────────────────────────────────────────────
    {
      id: "791381-m04-l02",
      title: "Router on a Stick و Dot1Q",
      order: 2,
      pages: [
        // PDF 151 — Router on a Stick
        {
          id: "791381-m04-l02-p01",
          title: "Router on a Stick",
          order: 1,
          source: src(151, 151),
          keywords: ["Router on a Stick", "Sub-Interface", "Inter-VLAN Routing", "Layer 2"],
          blocks: [
            {
              id: "m04-l02-p01-def", type: "callout", origin: "book", kind: "important",
              spans: [T("السويتش العادي يعمل في الطبقة الثانية "), L("Layer 2"), T(".")],
            },
            {
              id: "m04-l02-p01-figure", type: "callout", origin: "book", kind: "summary", title: "الرسم: Router و Switch",
              spans: [L("Router"), T(" في الأعلى، منه كابل واحد "), L("Trunk"), T(" إلى "), L("Switch"), T("، وعلى الراوتر "), L("g0/0.10"), T(" و "), L("g0/0.20"), T(". تحت السويتش مجموعتان: "), L("VLAN 10"), T(" بحاسوبين و "), L("VLAN 20"), T(" بحاسوبين.")],
            },
            {
              id: "m04-l02-p01-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m04-l02-p01-f1", text: [T("الأجهزة في "), L("VLAN"), T(" مختلفة لا تتواصل مباشرة.")] },
                { id: "m04-l02-p01-f2", text: [T("نستخدم راوتر واحد للتوجيه بين "), L("VLAN"), T(".")] },
                { id: "m04-l02-p01-f3", text: [T("ننشئ "), L("Sub-Interface"), T(" لكل "), L("VLAN"), T(" على نفس المنفذ.")] },
              ],
            },
            {
              id: "m04-l02-p01-goal", type: "callout", origin: "book", kind: "important", title: "الهدف",
              spans: [L("Inter-VLAN Routing"), T(" — اتصال بين "), L("VLAN"), T(" مختلفة عبر راوتر واحد.")],
            },
            {
              id: "m04-l02-p01-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("في قسم برمجة السويتش قرأت أن الانتقال بين "), L("VLAN"), T(" مختلفة يحتاج راوتر. "), L("Router on a Stick"), T(" هو الاسم الشائع لهذه الطريقة: راوتر واحد موصول بكابل واحد "), L("Trunk"), T(" («العصا»)، وعلى منفذه الواحد واجهة فرعية "), L("Sub-Interface"), T(" لكل "), L("VLAN"), T(" (في الرسم "), L("g0/0.10"), T(" لـ "), L("VLAN 10"), T(" و "), L("g0/0.20"), T(" لـ "), L("VLAN 20"), T("). الأوامر تأتي بعد صفحتين.")],
            },
            {
              id: "m04-l02-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما هدف Router on a Stick حسب الكتاب؟",
                options: [opt("m04-l02-p01-q1-a", "Inter-VLAN Routing: اتصال بين VLAN مختلفة عبر راوتر واحد", true), opt("m04-l02-p01-q1-b", "زيادة عدد المنافذ في السويتش"), opt("m04-l02-p01-q1-c", "منع الأجهزة في نفس VLAN من التواصل")],
                feedback: {
                  hints: ["افحص صندوق «الهدف».", "«اتصال بين VLAN مختلفة …»."],
                  correctFeedback: "أحسنت — Inter-VLAN Routing عبر راوتر واحد.",
                  incorrectFeedback: "افحص صندوق «الهدف»: «Inter-VLAN Routing — اتصال بين VLAN مختلفة عبر راوتر واحد».",
                  explanation: "الأجهزة في VLAN مختلفة لا تتواصل مباشرة.",
                },
              },
            },
            {
              id: "m04-l02-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "كم Sub-Interface ننشئ على منفذ الراوتر في الرسم (VLAN 10 و VLAN 20)؟",
                options: [opt("m04-l02-p01-q2-a", "اثنتان: واحدة لكل VLAN على نفس المنفذ", true), opt("m04-l02-p01-q2-b", "واحدة فقط لكل السويتش"), opt("m04-l02-p01-q2-c", "أربع: واحدة لكل حاسوب")],
                feedback: {
                  hints: ["افحص السطر الثالث في القائمة.", "افحص أسماء g0/0.10 و g0/0.20 في الرسم."],
                  correctFeedback: "أحسنت — Sub-Interface لكل VLAN.",
                  incorrectFeedback: "افحص القائمة: «ننشئ Sub-Interface لكل VLAN على نفس المنفذ».",
                  explanation: "g0/0.10 لـ VLAN 10 و g0/0.20 لـ VLAN 20.",
                },
              },
            },
          ],
        },
        // PDF 152 — ما هو Dot1Q؟
        {
          id: "791381-m04-l02-p02",
          title: "ما هو Dot1Q؟",
          order: 2,
          source: src(152, 152),
          keywords: ["Dot1Q", "Tag", "معيار", "Trunk"],
          blocks: [
            {
              id: "m04-l02-p02-def", type: "callout", origin: "book", kind: "important",
              spans: [L("Dot1Q"), T(" هو معيار يضع "), L("Tag"), T(" للحزمة.")],
            },
            {
              id: "m04-l02-p02-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m04-l02-p02-f1", text: [T("الـ "), L("Tag"), T(" يحمل رقم "), L("VLAN"), T(".")] },
                { id: "m04-l02-p02-f2", text: [T("يسمح بتمييز عدة "), L("VLAN"), T(" على نفس رابط "), L("Trunk"), T(".")] },
                { id: "m04-l02-p02-f3", text: [T("يُستخدم في "), L("Trunk"), T(" وبين السويتش والراوتر.")] },
              ],
            },
            {
              id: "m04-l02-p02-idea", type: "callout", origin: "book", kind: "summary", title: "الفكرة",
              spans: [L("Dot1Q"), T(" يخبر الجهاز: هذه الحزمة تابعة لأي "), L("VLAN"), T("؟")],
            },
            {
              id: "m04-l02-p02-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("«ما هو الـ Tag؟» عرفته في قسم برمجة السويتش: علامة داخل الحزمة برقم الـ "), L("VLAN"), T(". "), L("Dot1Q"), T(" هو اسم المعيار الذي يحدّد شكل هذه العلامة، لذلك يستعمله السويتشان على رابط "), L("Trunk"), T(" ويستعمله الراوتر في "), L("Router on a Stick"), T(" ليعرف لأي "), L("VLAN"), T(" كل حزمة.")],
            },
            {
              id: "m04-l02-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما Dot1Q حسب الكتاب؟",
                options: [opt("m04-l02-p02-q1-a", "معيار يضع Tag برقم VLAN للحزمة", true), opt("m04-l02-p02-q1-b", "اسم منفذ في الراوتر"), opt("m04-l02-p02-q1-c", "بروتوكول لإعطاء عناوين IP")],
                feedback: {
                  hints: ["افحص الصندوق الأول.", "«معيار يضع Tag …»."],
                  correctFeedback: "أحسنت — معيار الـ Tag.",
                  incorrectFeedback: "افحص الصندوق الأول: «Dot1Q هو معيار يضع Tag للحزمة»، و«الـ Tag يحمل رقم VLAN».",
                  explanation: "يُستخدم في Trunk وبين السويتش والراوتر.",
                },
              },
            },
            {
              id: "m04-l02-p02-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "Dot1Q يسمح بتمييز عدة VLAN على نفس رابط Trunk.",
                answer: true,
                feedback: {
                  hints: ["افحص السطر الثاني في القائمة.", "افحص صندوق «الفكرة»."],
                  correctFeedback: "صحيح — التمييز يكون بالـ Tag.",
                  incorrectFeedback: "افحص القائمة: «يسمح بتمييز عدة VLAN على نفس رابط Trunk».",
                  explanation: "Dot1Q يخبر الجهاز: هذه الحزمة تابعة لأي VLAN؟",
                },
              },
            },
          ],
        },
        // PDF 153 — إعداد Dot1Q على منفذ Trunk
        {
          id: "791381-m04-l02-p03",
          title: "إعداد Dot1Q على منفذ Trunk",
          order: 3,
          source: src(153, 153),
          keywords: ["interface g0/1", "switchport mode trunk", "switchport trunk allowed vlan", "10,20,30"],
          blocks: [
            {
              id: "m04-l02-p03-cli", type: "code", origin: "book", language: "cli",
              code: "Switch(config)# interface g0/1\nSwitch(config)# switchport mode trunk\nSwitch(config)# switchport trunk allowed vlan 10,20,30",
            },
            {
              id: "m04-l02-p03-cmds", type: "table", origin: "book",
              caption: "Switch CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Switch(config)# interface g0/1", "نحدّد منفذ GigabitEthernet0/1"],
                ["Switch(config)# switchport mode trunk", "نجعله Trunk"],
                ["Switch(config)# switchport trunk allowed vlan 10,20,30", "نسمح بمرور VLAN 10 و 20 و 30"],
              ],
            },
            {
              id: "m04-l02-p03-note", type: "callout", origin: "book", kind: "tip", title: "ملاحظة",
              spans: [T("بعض أجهزة "), L("Cisco"), T(" الحديثة تستخدم "), L("Dot1Q"), T(" تلقائيًا دون أمر إضافي.")],
            },
            {
              id: "m04-l02-p03-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("لا يوجد أمر اسمه "), L("Dot1Q"), T(" على السويتش في هذا المثال: يكفي جعل المنفذ "), L("Trunk"), T(" وتحديد الـ "), L("VLAN"), T(" المسموح بها، وهي نفس أوامر صفحة Tagged VLAN في قسم برمجة السويتش لكن مع ثلاث "), L("VLAN"), T(" هنا ("), L("10,20,30"), T(") وعلى منفذ "), L("Gigabit"), T(". الـ "), L("Tag"), T(" الذي يُضاف للحزم على هذا المنفذ هو "), L("Dot1Q"), T(".")],
            },
            {
              id: "m04-l02-p03-match", type: "practice-table", origin: "teacher-enrichment",
              caption: "تحقّق من نفسك: ماذا يفعل كل أمر؟ (اعتمد على جدول الأوامر)",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["switchport trunk allowed vlan 10,20,30", DP("نسمح بمرور VLAN 10 و 20 و 30")],
                ["interface g0/1", DP("نحدّد منفذ GigabitEthernet0/1")],
                ["switchport mode trunk", DP("نجعله Trunk")],
              ],
            },
            {
              id: "m04-l02-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي VLAN يُسمح لها بالمرور عبر g0/1 بعد الأوامر الثلاثة؟",
                options: [opt("m04-l02-p03-q1-a", "VLAN 10 و 20 و 30 فقط", true), opt("m04-l02-p03-q1-b", "كل VLAN من 1 إلى 4094"), opt("m04-l02-p03-q1-c", "VLAN 1 فقط")],
                feedback: {
                  hints: ["افحص السطر الثالث في جدول الأوامر.", "«نسمح بمرور …»."],
                  correctFeedback: "أحسنت — 10 و 20 و 30.",
                  incorrectFeedback: "افحص جدول الأوامر: «switchport trunk allowed vlan 10,20,30 — نسمح بمرور VLAN 10 و 20 و 30».",
                  explanation: "الأرقام تُكتب بفاصلة بلا مسافة كما في الكتاب.",
                },
              },
            },
          ],
        },
        // PDF 154 — Router on a Stick — VLAN 10 / 20
        {
          id: "791381-m04-l02-p04",
          title: "Router on a Stick — VLAN 10 / 20",
          order: 4,
          source: src(154, 154),
          keywords: ["interface g0/0.10", "encapsulation dot1Q", "ip address", "Sub-Interface", "Gateway"],
          blocks: [
            {
              id: "m04-l02-p04-cli", type: "code", origin: "book", language: "cli",
              code: "Router(config)# interface g0/0.10\nRouter(config-subif)# encapsulation dot1Q 10\nRouter(config-subif)# ip address 192.168.10.254 255.255.255.0\nRouter(config-subif)# interface g0/0.20",
            },
            {
              id: "m04-l02-p04-cmds", type: "table", origin: "book",
              caption: "Router CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Router(config)# interface g0/0.10", "Sub-Interface لـ VLAN 10"],
                ["Router(config-subif)# encapsulation dot1Q 10", "يربطها بـ VLAN 10"],
                ["Router(config-subif)# ip address 192.168.10.254 255.255.255.0", "Gateway أجهزة VLAN 10"],
                ["Router(config-subif)# interface g0/0.20", "Sub-Interface لـ VLAN 20"],
              ],
            },
            {
              id: "m04-l02-p04-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("لكل "), L("VLAN"), T(" نكتب "), L("Sub-Interface"), T(" وعنوان "), L("Gateway"), T(" خاص بها.")],
            },
            {
              id: "m04-l02-p04-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("أوّل أوامر على الراوتر في الكتاب؛ الموجّه "), L("Router(config)#"), T(" ثم "), L("Router(config-subif)#"), T(" عندما تدخل واجهة فرعية. الاسم "), L("g0/0.10"), T(" هو المنفذ "), L("g0/0"), T(" وبعده نقطة ورقم الـ "), L("VLAN"), T("؛ "), L("encapsulation dot1Q 10"), T(" يربطها بـ "), L("VLAN 10"), T("؛ والعنوان "), L("192.168.10.254"), T(" هو نفسه عنوان "), L("Gateway"), T(" شبكة الإدارة الذي رأيته في قسم برمجة السويتش. السطر الأخير يبدأ الواجهة الفرعية الثانية لـ "), L("VLAN 20"), T(" بنفس الطريقة.")],
            },
            {
              id: "m04-l02-p04-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي أمر يربط الواجهة الفرعية g0/0.10 بـ VLAN 10؟",
                options: [opt("m04-l02-p04-q1-a", "encapsulation dot1Q 10", true), opt("m04-l02-p04-q1-b", "interface g0/0.10"), opt("m04-l02-p04-q1-c", "ip address 192.168.10.254 255.255.255.0")],
                feedback: {
                  hints: ["افحص السطر الثاني في جدول الأوامر.", "«يربطها بـ VLAN 10»."],
                  correctFeedback: "أحسنت — encapsulation dot1Q 10.",
                  incorrectFeedback: "افحص جدول الأوامر: «encapsulation dot1Q 10 — يربطها بـ VLAN 10».",
                  explanation: "interface g0/0.10 يُنشئ الواجهة الفرعية، و ip address يعطيها عنوان Gateway.",
                },
              },
            },
            {
              id: "m04-l02-p04-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما وظيفة العنوان 192.168.10.254 في هذه الأوامر؟",
                options: [opt("m04-l02-p04-q2-a", "Gateway أجهزة VLAN 10", true), opt("m04-l02-p04-q2-b", "عنوان السويتش Sw6"), opt("m04-l02-p04-q2-c", "رقم Dot1Q")],
                feedback: {
                  hints: ["افحص السطر الثالث في جدول الأوامر.", "افحص صندوق «تذكّر»."],
                  correctFeedback: "أحسنت — Gateway أجهزة VLAN 10.",
                  incorrectFeedback: "افحص جدول الأوامر: «ip address 192.168.10.254 255.255.255.0 — Gateway أجهزة VLAN 10».",
                  explanation: "لكل VLAN نكتب Sub-Interface وعنوان Gateway خاص بها.",
                },
              },
            },
          ],
        },
        // PDF 155 — Router on a Stick — VLAN 30 / 40
        {
          id: "791381-m04-l02-p05",
          title: "Router on a Stick — VLAN 30 / 40",
          order: 5,
          source: src(155, 155),
          keywords: ["g0/0.30", "g0/0.40", "encapsulation dot1Q", "192.168.30.254", "192.168.40.254"],
          blocks: [
            {
              id: "m04-l02-p05-cli", type: "code", origin: "book", language: "cli",
              code: "Router(config)# interface g0/0.30\nRouter(config-subif)# encapsulation dot1Q 30\nRouter(config-subif)# ip address 192.168.30.254 255.255.255.0\nRouter(config)# interface g0/0.40\nRouter(config-subif)# encapsulation dot1Q 40\nRouter(config-subif)# ip address 192.168.40.254 255.255.255.0",
            },
            {
              id: "m04-l02-p05-cmds", type: "table", origin: "book",
              caption: "Router CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Router(config)# interface g0/0.30", "Sub-Interface لـ VLAN 30"],
                ["Router(config-subif)# encapsulation dot1Q 30", "رقم Dot1Q خاص بـ VLAN 30"],
                ["Router(config-subif)# ip address 192.168.30.254 255.255.255.0", "Gateway VLAN 30"],
                ["Router(config)# interface g0/0.40", "Sub-Interface لـ VLAN 40"],
                ["Router(config-subif)# encapsulation dot1Q 40", "رقم Dot1Q خاص بـ VLAN 40"],
                ["Router(config-subif)# ip address 192.168.40.254 255.255.255.0", "Gateway VLAN 40"],
              ],
            },
            {
              id: "m04-l02-p05-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("لكل "), L("VLAN"), T(" واجهة فرعية "), L("Sub-Interface"), T(" خاصة بها: رقم "), L("Dot1Q"), T(" مختلف وعنوان "), L("Gateway"), T(" مختلف.")],
            },
            {
              id: "m04-l02-p05-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("النمط نفسه ثلاث مرات: رقم الواجهة الفرعية = رقم الـ "), L("VLAN"), T("، رقم "), L("dot1Q"), T(" = رقم الـ "), L("VLAN"), T("، وعنوان "), L("Gateway"), T(" من شبكة تلك الـ "), L("VLAN"), T(" (الخانة الثالثة تساوي رقمها في مثال الكتاب: "), L("192.168.30.254"), T(" لـ "), L("VLAN 30"), T(" و "), L("192.168.40.254"), T(" لـ "), L("VLAN 40"), T(").")],
            },
            {
              id: "m04-l02-p05-ex1", type: "example", origin: "teacher-enrichment", mode: "solved",
              title: "مثال محلول: اكتب واجهة فرعية لـ VLAN 50 بنفس نمط الكتاب",
              steps: [
                { text: "الواجهة الفرعية: interface g0/0.50 (المنفذ g0/0 ثم نقطة ورقم VLAN)." },
                { text: "ربطها بالـ VLAN: encapsulation dot1Q 50." },
                { text: "عنوان Gateway لأجهزتها بنفس نمط المثال: ip address 192.168.50.254 255.255.255.0." },
              ],
              result: "interface g0/0.50 · encapsulation dot1Q 50 · ip address 192.168.50.254 255.255.255.0",
              explanation: "الأوامر الثلاثة نفسها التي يعرضها الكتاب لـ VLAN 30 و 40، مع تغيير الرقم والعنوان فقط.",
            },
            {
              id: "m04-l02-p05-match", type: "practice-table", origin: "teacher-enrichment",
              caption: "تحقّق من نفسك: لأي VLAN كل سطر؟ (اعتمد على الصفحتين)",
              headers: ["السطر", "VLAN"],
              columnDirs: ["ltr", "ltr"],
              rows: [
                ["interface g0/0.30", VL("VLAN 30")],
                ["encapsulation dot1Q 40", VL("VLAN 40")],
                ["ip address 192.168.10.254 255.255.255.0", VL("VLAN 10")],
                ["interface g0/0.20", VL("VLAN 20")],
              ],
            },
            {
              id: "m04-l02-p05-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما عنوان Gateway لـ VLAN 40 في مثال الكتاب؟",
                options: [opt("m04-l02-p05-q1-a", "192.168.40.254", true), opt("m04-l02-p05-q1-b", "192.168.30.254"), opt("m04-l02-p05-q1-c", "192.168.40.1")],
                feedback: {
                  hints: ["افحص السطر الأخير في جدول الأوامر.", "«Gateway VLAN 40»."],
                  correctFeedback: "أحسنت — 192.168.40.254.",
                  incorrectFeedback: "افحص جدول الأوامر: «ip address 192.168.40.254 255.255.255.0 — Gateway VLAN 40».",
                  explanation: "192.168.30.254 هو Gateway VLAN 30.",
                },
              },
            },
          ],
        },
      ],
    },
    // ── l03 — خلاصة الوحدة وتدريبات نهاية الدفعة (PDF 156–157) ──────────────────────────────────────────────
    {
      id: "791381-m04-l03",
      title: "خلاصة الوحدة وتدريبات نهاية الدفعة",
      order: 3,
      pages: [
        // PDF 156 — خلاصة الوحدة
        {
          id: "791381-m04-l03-p01",
          title: "خلاصة الوحدة",
          order: 1,
          source: src(156, 156),
          keywords: ["خلاصة", "VLAN", "Trunk", "Dot1Q", "Router on a Stick"],
          blocks: [
            {
              id: "m04-l03-p01-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m04-l03-p01-vlan", term: "VLAN", text: [T("تقسيم افتراضي للشبكة إلى أقسام مستقلة.")], note: "VLAN 10 / VLAN 20" },
                { id: "m04-l03-p01-trunk", term: "Trunk", text: [T("رابط ينقل عدة "), L("VLAN"), T(" عبر نفس الكابل.")], note: "بين سويتشات" },
                { id: "m04-l03-p01-dot1q", term: "Dot1Q", text: [L("Tag"), T(" يحدّد رقم "), L("VLAN"), T(" داخل الحزمة.")], note: "encapsulation dot1Q" },
                { id: "m04-l03-p01-roas", term: "Router on a Stick", text: [T("راوتر واحد يوجّه بين "), L("VLAN"), T(" مختلفة.")], note: "Sub-Interfaces" },
              ],
            },
            {
              id: "m04-l03-p01-exam", type: "callout", origin: "book", kind: "important", title: "للامتحان",
              spans: [T("هذه المفاهيم الأربعة مرتبطة ببعضها: "), L("VLAN"), T(" تُقسّم، "), L("Trunk"), T(" ينقل، "), L("Dot1Q"), T(" يميّز، والراوتر يوجّه.")],
            },
            {
              id: "m04-l03-p01-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("اقرأ السطر الأخير كقصة حزمة واحدة: تخرج من حاسوب في "), L("VLAN 10"), T("، تمرّ على "), L("Trunk"), T(" وقد وُضع عليها "), L("Tag"), T(" بمعيار "), L("Dot1Q"), T("، تصل إلى الواجهة الفرعية "), L("g0/0.10"), T(" في الراوتر، فيوجّهها إلى "), L("VLAN 20"), T(" عبر "), L("g0/0.20"), T(".")],
            },
            {
              id: "m04-l03-p01-match", type: "practice-table", origin: "teacher-enrichment",
              caption: "تحقّق من نفسك: أي مفهوم لكل وصف؟ (اعتمد على البطاقات)",
              headers: ["الوصف", "المفهوم"],
              columnDirs: ["rtl", "ltr"],
              rows: [
                ["رابط ينقل عدة VLAN عبر نفس الكابل.", CO("Trunk")],
                ["راوتر واحد يوجّه بين VLAN مختلفة.", CO("Router on a Stick")],
                ["Tag يحدّد رقم VLAN داخل الحزمة.", CO("Dot1Q")],
                ["تقسيم افتراضي للشبكة إلى أقسام مستقلة.", CO("VLAN")],
              ],
            },
            {
              id: "m04-l03-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي عبارة تصف علاقة المفاهيم الأربعة كما في الكتاب؟",
                options: [opt("m04-l03-p01-q1-a", "VLAN تُقسّم، Trunk ينقل، Dot1Q يميّز، والراوتر يوجّه", true), opt("m04-l03-p01-q1-b", "VLAN تنقل، Trunk يوجّه، Dot1Q يقسّم، والراوتر يميّز"), opt("m04-l03-p01-q1-c", "الأربعة تعني الشيء نفسه")],
                feedback: {
                  hints: ["افحص صندوق «للامتحان».", "ابدأ بـ VLAN: تُقسّم."],
                  correctFeedback: "أحسنت — تُقسّم، ينقل، يميّز، يوجّه.",
                  incorrectFeedback: "افحص صندوق «للامتحان»: «VLAN تُقسّم، Trunk ينقل، Dot1Q يميّز، والراوتر يوجّه».",
                  explanation: "البطاقات الأربع تعطي تعريف كل مفهوم.",
                },
              },
            },
          ],
        },
        // PDF 157 — نهاية الدفعة الرابعة · تدريبات على VLAN و Trunk (closing trainings page)
        {
          id: "791381-m04-l03-p02",
          title: "تدريبات نهاية الدفعة",
          order: 2,
          source: src(157),
          conversionNote: "PDF 157 صفحة «نهاية الدفعة الرابعة» الختامية (بلا رقم صفحة مطبوع): أربع بطاقات للتدريبات الإلكترونية 19–22 خلف رموز QR وسطر الكتاب الختامي. الرموز في الكتاب المطبوع، والتدريبات 19–22 غير متاحة داخل المنصة بعد؛ تُعرض البطاقات والسطر كما هي، وتُضاف مراجعة ختامية للوحدة.",
          keywords: ["تدريبات", "نهاية الدفعة", "QR", "VLAN", "Trunk"],
          blocks: [
            {
              id: "m04-l03-p02-lead", type: "callout", origin: "book", kind: "important",
              spans: [T("تدريبات على "), L("VLAN"), T(" و "), L("Trunk"), T(".")],
            },
            {
              id: "m04-l03-p02-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m04-l03-p02-t19", term: "التدريب التاسع عشر", text: [T("امسح الرمز لحل التدريب.")] },
                { id: "m04-l03-p02-t20", term: "التدريب العشرون", text: [T("امسح الرمز لحل التدريب.")] },
                { id: "m04-l03-p02-t21", term: "التدريب الحادي والعشرون", text: [T("امسح الرمز لحل التدريب.")] },
                { id: "m04-l03-p02-t22", term: "التدريب الثاني والعشرون", text: [T("امسح الرمز لحل التدريب.")] },
              ],
            },
            {
              id: "m04-l03-p02-line", type: "callout", origin: "book", kind: "summary",
              spans: [T("امسح رمز "), L("QR"), T(" أو ضع روابط التدريبات هنا · أتممت نموذج 791381 بالكامل.")],
            },
            {
              id: "m04-l03-p02-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("رموز QR موجودة في الكتاب المطبوع. داخل المنصة، راجع الوحدة من خلال المراجعة الختامية التالية.")],
            },
            // ── closing review for the module (easy, medium, exam-like) ──
            {
              id: "m04-l03-p02-review", type: "heading", origin: "teacher-enrichment", level: 3, text: "مراجعة ختامية: Trunk و Router on a Stick",
            },
            {
              id: "m04-l03-p02-r1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما الأمر الذي يجعل منفذ الربط بين سويتشين Trunk؟",
                options: [opt("m04-l03-p02-r1-a", "switchport mode trunk", true), opt("m04-l03-p02-r1-b", "switchport mode access"), opt("m04-l03-p02-r1-c", "encapsulation dot1Q 10")],
                feedback: {
                  hints: ["افحص صفحة أوامر Trunk.", "«يحوّلها إلى Trunk»."],
                  correctFeedback: "أحسنت — switchport mode trunk.",
                  incorrectFeedback: "افحص جدول الأوامر في صفحة أوامر Trunk: «switchport mode trunk — يحوّلها إلى Trunk».",
                  explanation: "encapsulation dot1Q يُكتب على الواجهة الفرعية في الراوتر.",
                },
              },
            },
            {
              id: "m04-l03-p02-r2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "سؤال بأسلوب الامتحان: على راوتر Router on a Stick، ما الأسطر اللازمة لـ VLAN 20 حتى تحصل أجهزتها على Gateway؟",
                options: [opt("m04-l03-p02-r2-a", "interface g0/0.20 ثم encapsulation dot1Q 20 ثم ip address بعنوان Gateway", true), opt("m04-l03-p02-r2-b", "switchport mode trunk ثم vlan 20"), opt("m04-l03-p02-r2-c", "interface vlan 20 ثم no shutdown على الراوتر")],
                feedback: {
                  hints: ["افحص صفحتي Router on a Stick — VLAN 10 / 20 و 30 / 40.", "Sub-Interface، ثم Dot1Q، ثم العنوان."],
                  correctFeedback: "أحسنت — واجهة فرعية، ربط Dot1Q، ثم عنوان Gateway.",
                  incorrectFeedback: "افحص جدول أوامر Router CLI: «interface g0/0.20 — Sub-Interface لـ VLAN 20»، ثم «encapsulation dot1Q» و«ip address».",
                  explanation: "لكل VLAN واجهة فرعية خاصة بها: رقم Dot1Q مختلف وعنوان Gateway مختلف.",
                },
              },
            },
            {
              id: "m04-l03-p02-r3", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "سؤال بأسلوب الامتحان: حاسوب في VLAN 10 على Sw3 لا يستطيع الوصول إلى حاسوب في VLAN 10 على Sw1، مع أن الراوتر يعمل. ما أوّل شيء يذكره الكتاب للتحقّق منه؟",
                options: [opt("m04-l03-p02-r3-a", "أن منافذ الربط بين السويتشات Trunk من الجهتين، وإلا لن تمرّ VLAN بينها", true), opt("m04-l03-p02-r3-b", "أن الحاسوبين في VLAN مختلفة"), opt("m04-l03-p02-r3-c", "أن Dot1Q غير مدعوم في الحاسوب")],
                feedback: {
                  hints: ["افحص صندوق «قاعدة» في صفحة أوامر Trunk — باقي السويتشات.", "Trunk من الجهتين."],
                  correctFeedback: "أحسنت — القاعدة: إذا كان أحد الطرفين Trunk والآخر ليس Trunk، لن تمرّ VLAN بينهما.",
                  incorrectFeedback: "افحص صندوق «قاعدة»: «إذا كان أحد الطرفين Trunk والآخر ليس Trunk، لن تمرّ VLAN بينهما».",
                  explanation: "نفس VLAN على سويتشين مختلفين تحتاج Trunk بينهما، لا راوتر.",
                },
              },
            },
          ],
        },
      ],
    },
  ],
};

export default m04;
