// Learning Materials — Units 4–6 phase: REAL converted body for Book 791381, module m08 (the book's Unit 4
// «Class و Subnet و CIDR», source PDF 34–46, complete).
//
// The module id is `m08` — the next free stable id — never a repurposed skeleton id; reading position comes from
// the explicit `order` (4) in the manifest. Book-derived blocks are origin:"book" and reproduce the RENDERED
// source (the PDF text layer scrambles RTL/mixed lines and is never trusted alone). The book's simplified
// school-level rules (class from the first number; /8 /16 /24 = one / two / three octets; "first address for the
// network, last for Broadcast") are converted AS WRITTEN. Every address, mask, range, PC label and CIDR token is
// an LTR code span or an LTR table column so digits, dots and slashes never reverse inside the RTL page.
//
// PEDAGOGY (this phase's standard): a book page → its faithful content, then — only where an average student needs
// it — a solved example (structured steps, never a paragraph), a guided walkthrough, and an inline practice with
// immediate feedback that says WHAT TO CHECK. All of that is origin:"teacher-enrichment". The two printed
// worksheets (PDF 36, 39) are answerable in place with the printed column's own closed choices; PDF 44 stays the
// blank open-answer worksheet it is, followed by a separate closed-choice enrichment. Nothing here reaches PDF 47.
//
// PRINTED PAGE: recorded from the rendered page circle (PDF 35 → «35», … PDF 45 → «45»). PDF 34 (opener) and
// PDF 46 (batch summary) print no page number.

import type { ContentModule, ContentSource, InlineSpan, PracticeTableSelectCell, PracticeOption } from "../../types";

const CID = "791381";
const src = (pdf: number, printed?: number): ContentSource => ({ kind: "book", sourceId: CID, pdfPageStart: pdf, printedPage: printed });
/** An LTR technical token (address, mask, CIDR, range, PC label) — never reversed under RTL. */
const L = (text: string): InlineSpan => ({ text, dir: "ltr", style: "code" });
const T = (text: string): InlineSpan => ({ text });
/** Worksheet choice cells: the printed column's own vocabulary, with the expected choice as the key. */
const CLASS = (key: "A" | "B" | "C"): PracticeTableSelectCell => ({ kind: "select", options: ["A", "B", "C"], key });
const MASKS = ["255.0.0.0", "255.255.0.0", "255.255.255.0"] as const;
const MASK = (key: (typeof MASKS)[number]): PracticeTableSelectCell => ({ kind: "select", options: [...MASKS], key });
const PC2 = (options: [string, string, string], key: string): PracticeTableSelectCell => ({ kind: "select", options, key });
const opt = (id: string, text: string, correct?: true): PracticeOption => (correct ? { id, text, correct } : { id, text });

const m08: ContentModule = {
  id: "791381-m08",
  title: "Class و Subnet و CIDR",
  shortTitle: "CIDR والفئات",
  order: 4,
  source: { kind: "book", sourceId: CID, pdfPageStart: 34, pdfPageEnd: 46 },
  lessons: [
    // ── l00 — unit opener (PDF 34) ───────────────────────────────────────────────────────────────────────────
    {
      id: "791381-m08-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381-m08-l00-p01",
          title: "Class و Subnet و CIDR",
          order: 1,
          layout: "opener",
          source: src(34),
          blocks: [
            {
              id: "m08-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الوحدة الرابعة", unitNumber: "04", title: "Class و Subnet و CIDR",
              subtitle: "كيف نحدّد جزء الشبكة وجزء الجهاز؟",
              goal: "الهدف: فكرة أساسية + مثال واضح + تدريب",
            },
          ],
        },
      ],
    },

    // ── l01 — address classes and the natural mask (PDF 35–39) ───────────────────────────────────────────────
    {
      id: "791381-m08-l01",
      title: "فئات العناوين والقناع الطبيعي",
      order: 1,
      pages: [
        // PDF 35 — فئات العناوين
        {
          id: "791381-m08-l01-p01",
          title: "فئات العناوين",
          order: 1,
          source: src(35, 35),
          keywords: ["Class A", "Class B", "Class C", "فئات", "المدى"],
          blocks: [
            {
              id: "m08-l01-p01-table", type: "table", origin: "book",
              headers: ["الفئة", "المدى", "عدد الأجهزة", "الاستخدام"],
              columnDirs: ["ltr", "ltr", "rtl", "rtl"],
              rows: [
                ["A", "1.0.0.0 – 126.255.255.255", "16 مليون", "شبكات كبيرة جدًا"],
                ["B", "128.0.0.0 – 191.255.255.255", "65 ألف", "شبكات متوسطة"],
                ["C", "192.0.0.0 – 223.255.255.255", "254", "شبكات صغيرة"],
              ],
            },
            {
              id: "m08-l01-p01-rule", type: "callout", origin: "book", kind: "important", title: "القاعدة",
              spans: [T("نحدّد الفئة من الرقم الأول (الأيسر) في عنوان "), L("IP"), T(" فقط: "), L("A"), T(" أصغر، ثم "), L("B"), T("، ثم "), L("C"), T(".")],
            },
            {
              // ENRICHMENT — a worked model of the page's own rule before the student tries the worksheet.
              id: "m08-l01-p01-ex1", type: "example", origin: "teacher-enrichment", mode: "solved",
              title: "مثال محلول: ما فئة العنوان 172.20.5.9؟",
              prompt: "حدّد الفئة من الرقم الأول فقط.",
              steps: [
                { text: "انظر إلى الرقم الأول من اليسار: 172." },
                { text: "هل 172 بين 1 و 126؟ لا — إذًا ليس الفئة A." },
                { text: "هل 172 بين 128 و 191؟ نعم." },
              ],
              result: "Class B",
              explanation: "لا ننظر إلى باقي الأرقام أبدًا؛ الرقم الأول وحده يقرّر الفئة.",
            },
            {
              id: "m08-l01-p01-ex2", type: "example", origin: "teacher-enrichment", mode: "solved",
              title: "مثال محلول: ما فئة العنوان 200.45.1.1؟",
              steps: [
                { text: "الرقم الأول: 200." },
                { text: "200 أكبر من 191، وهو بين 192 و 223." },
              ],
              result: "Class C",
            },
            {
              id: "m08-l01-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "إلى أي فئة ينتمي العنوان 100.5.5.5؟",
                options: [opt("m08-l01-p01-q1-a", "A", true), opt("m08-l01-p01-q1-b", "B"), opt("m08-l01-p01-q1-c", "C")],
                feedback: {
                  hints: ["الرقم الأول فقط: 100.", "قارن 100 بمدى كل فئة في الجدول: 1–126 هو مدى الفئة A."],
                  correctFeedback: "أحسنت — 100 يقع بين 1 و 126، وهذا مدى الفئة A.",
                  incorrectFeedback: "افحص الرقم الأول فقط (100) وقارنه بالمدى في الجدول، ولا تنظر إلى الأرقام الأخرى.",
                  explanation: "الفئة A تبدأ من 1 وتنتهي عند 126؛ و100 داخل هذا المدى.",
                },
              },
            },
          ],
        },
        // PDF 36 — تدريب: لأي فئة ينتمي العنوان؟ (the printed worksheet, answerable in place)
        {
          id: "791381-m08-l01-p02",
          title: "تدريب: لأي فئة ينتمي العنوان؟",
          order: 2,
          source: src(36, 36),
          keywords: ["تدريب", "الفئة"],
          blocks: [
            {
              id: "m08-l01-p02-table", type: "practice-table", origin: "book",
              headers: ["العنوان", "الفئة"],
              columnDirs: ["ltr", "ltr"],
              rows: [
                ["192.168.10.200", CLASS("C")],
                ["200.10.168.192", CLASS("C")],
                ["20.20.20.10", CLASS("A")],
                ["129.192.168.100", CLASS("B")],
                ["178.177.100.178", CLASS("B")],
                ["200.100.50.1", CLASS("C")],
                ["1.2.3.4", CLASS("A")],
              ],
            },
            {
              id: "m08-l01-p02-how", type: "callout", origin: "book", kind: "tip", title: "طريقة الحل",
              spans: [T("انظر فقط إلى الرقم الأول من اليسار وقارنه بمدى كل فئة.")],
            },
          ],
        },
        // PDF 37 — قناع الشبكة Subnet Mask
        {
          id: "791381-m08-l01-p03",
          title: "قناع الشبكة Subnet Mask",
          order: 3,
          source: src(37, 37),
          keywords: ["Subnet Mask", "قناع", "255", "جزء الشبكة", "جزء الجهاز"],
          blocks: [
            {
              id: "m08-l01-p03-def", type: "text", origin: "book",
              spans: [T("قناع الشبكة يساعدنا على معرفة: أي جزء من عنوان "), L("IP"), T(" يخص الشبكة؟ وأي جزء يخص الجهاز؟")],
            },
            {
              // The page's IP / Mask alignment figure, reproduced as an LTR table (one column per octet).
              id: "m08-l01-p03-figure", type: "table", origin: "book", dir: "ltr",
              caption: "أي جزء للشبكة؟ وأي جزء للجهاز؟",
              headers: ["", "1", "2", "3", "4"],
              columnDirs: ["ltr", "ltr", "ltr", "ltr", "ltr"],
              rows: [
                ["IP", "192", "168", "1", "100"],
                ["Mask", "255", "255", "255", "0"],
              ],
            },
            {
              id: "m08-l01-p03-parts", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m08-l01-p03-net", term: "الشبكة", text: [T("أول 3 أقسام — كل قسم تحته "), L("255"), T(".")] },
                { id: "m08-l01-p03-host", term: "الجهاز", text: [T("القسم الأخير — تحته "), L("0"), T(".")] },
              ],
            },
            {
              id: "m08-l01-p03-meaning", type: "callout", origin: "book", kind: "remember",
              spans: [L("255"), T(" يعني: هذا القسم للشبكة · "), L("0"), T(" يعني: هذا القسم للجهاز")],
            },
            {
              id: "m08-l01-p03-idea", type: "callout", origin: "book", kind: "important", title: "الفكرة",
              spans: [T("القناع كقناع يغطّي جزء الشبكة ويترك جزء الجهاز ظاهرًا، فنعرف من ينتمي لنفس الشبكة.")],
            },
            {
              id: "m08-l01-p03-ex1", type: "example", origin: "teacher-enrichment", mode: "solved",
              title: "مثال محلول: العنوان 10.20.30.40 مع القناع 255.255.0.0",
              prompt: "أي أقسام للشبكة وأي أقسام للجهاز؟",
              steps: [
                { text: "اكتب القناع تحت العنوان، قسمًا تحت قسم: 10 تحته 255، 20 تحته 255، 30 تحته 0، 40 تحته 0." },
                { text: "كل قسم تحته 255 يخص الشبكة: 10 و 20." },
                { text: "كل قسم تحته 0 يخص الجهاز: 30 و 40." },
              ],
              result: "10.20 | 30.40",
              explanation: "جزء الشبكة 10.20، وجزء الجهاز 30.40. القناع لا يغيّر العنوان؛ هو فقط يخبرنا أين ينتهي جزء الشبكة.",
            },
            {
              id: "m08-l01-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "مع القناع 255.255.255.0 يكون القسم الأخير من العنوان هو جزء الجهاز.",
                answer: true,
                feedback: {
                  correctFeedback: "صحيح — القسم الذي تحته 0 هو جزء الجهاز.",
                  incorrectFeedback: "افحص القسم الرابع من القناع: تحته 0، و0 يعني «هذا القسم للجهاز».",
                  hints: ["ضع القناع تحت العنوان قسمًا تحت قسم.", "255 = شبكة، 0 = جهاز."],
                },
              },
            },
          ],
        },
        // PDF 38 — القناع الطبيعي لكل فئة
        {
          id: "791381-m08-l01-p04",
          title: "القناع الطبيعي لكل فئة",
          order: 4,
          source: src(38, 38),
          keywords: ["القناع الطبيعي", "/8", "/16", "/24", "Class"],
          blocks: [
            {
              id: "m08-l01-p04-table", type: "table", origin: "book",
              headers: ["الفئة", "المجال", "قناع الشبكة", "CIDR"],
              columnDirs: ["ltr", "ltr", "ltr", "ltr"],
              rows: [
                ["Class A", "1 – 126", "255.0.0.0", "/8"],
                ["Class B", "128 – 191", "255.255.0.0", "/16"],
                ["Class C", "192 – 223", "255.255.255.0", "/24"],
              ],
            },
            {
              id: "m08-l01-p04-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [L("Class C"), T(" هو الأكثر شيوعًا في الأمثلة المدرسية، وغالبًا قناعه "), L("/24"), T(".")],
            },
            {
              id: "m08-l01-p04-ex1", type: "example", origin: "teacher-enrichment", mode: "solved",
              title: "مثال محلول: ما القناع الطبيعي للعنوان 10.5.5.5؟",
              steps: [
                { text: "الرقم الأول 10 → بين 1 و 126 → الفئة A." },
                { text: "من الجدول: القناع الطبيعي للفئة A هو 255.0.0.0." },
                { text: "بصيغة CIDR نكتبه /8." },
              ],
              result: "255.0.0.0 = /8",
              explanation: "الفئة تقودك مباشرة إلى القناع؛ لا حساب آخر مطلوب في هذا المستوى.",
            },
            {
              id: "m08-l01-p04-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما القناع الطبيعي للعنوان 190.20.20.2؟",
                options: [opt("m08-l01-p04-q1-a", "255.0.0.0"), opt("m08-l01-p04-q1-b", "255.255.0.0", true), opt("m08-l01-p04-q1-c", "255.255.255.0")],
                feedback: {
                  hints: ["حدّد الفئة أولًا من الرقم 190.", "190 بين 128 و 191 → الفئة B → انظر إلى صف الفئة B في الجدول."],
                  correctFeedback: "أحسنت — 190 من الفئة B، وقناعها الطبيعي 255.255.0.0 أي /16.",
                  incorrectFeedback: "ابدأ بالفئة: الرقم الأول 190. في أي مدى يقع؟ ثم خذ قناع تلك الفئة من الجدول.",
                  explanation: "الفئة B (128–191) قناعها 255.255.0.0.",
                },
              },
            },
          ],
        },
        // PDF 39 — تدريب: ما هو قناع الشبكة؟ (the printed worksheet, answerable in place)
        {
          id: "791381-m08-l01-p05",
          title: "تدريب: ما هو قناع الشبكة؟",
          order: 5,
          source: src(39, 39),
          keywords: ["تدريب", "قناع الشبكة"],
          blocks: [
            {
              id: "m08-l01-p05-table", type: "practice-table", origin: "book",
              headers: ["العنوان", "قناع الشبكة"],
              columnDirs: ["ltr", "ltr"],
              rows: [
                ["192.168.10.200", MASK("255.255.255.0")],
                ["200.10.168.192", MASK("255.255.255.0")],
                ["20.20.20.10", MASK("255.0.0.0")],
                ["129.192.168.100", MASK("255.255.0.0")],
                ["178.177.100.178", MASK("255.255.0.0")],
                ["200.100.50.1", MASK("255.255.255.0")],
                ["1.2.3.4", MASK("255.0.0.0")],
              ],
            },
            {
              id: "m08-l01-p05-how", type: "callout", origin: "book", kind: "tip", title: "الحل يعتمد على الفئة",
              spans: [L("Class A = /8"), T(" · "), L("Class B = /16"), T(" · "), L("Class C = /24")],
            },
          ],
        },
      ],
    },

    // ── l02 — network part vs host part, CIDR (PDF 40–42) ────────────────────────────────────────────────────
    {
      id: "791381-m08-l02",
      title: "جزء الشبكة وجزء الجهاز و CIDR",
      order: 2,
      pages: [
        // PDF 40 — جزء الشبكة وجزء الجهاز (+ the unit's CIDR / network-host visualizer)
        {
          id: "791381-m08-l02-p01",
          title: "جزء الشبكة وجزء الجهاز",
          order: 1,
          source: src(40, 40),
          keywords: ["/24", "/16", "/8", "جزء الشبكة", "جزء الجهاز", "CIDR"],
          blocks: [
            {
              id: "m08-l02-p01-rules", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m08-l02-p01-r24", term: "/24", text: [T("القناع "), L("/24"), T(" ← أول 3 أقسام للشبكة، والقسم الأخير للجهاز.")] },
                { id: "m08-l02-p01-r16", term: "/16", text: [T("القناع "), L("/16"), T(" ← أول قسمين للشبكة.")] },
                { id: "m08-l02-p01-r8", term: "/8", text: [T("القناع "), L("/8"), T(" ← أول قسم فقط للشبكة.")] },
              ],
            },
            {
              // The page's figure «أين ينتهي جزء الشبكة؟» (192 168 10 10 under /8, /16, /24) becomes the
              // visualizer: interactive-diagram / cidr-network-host / v1 (ENRICHMENT with a PDF-40 association).
              id: "m08-l02-p01-visualizer", type: "interactive-diagram", origin: "teacher-enrichment",
              interactionType: "cidr-network-host", version: 1,
              title: "أين ينتهي جزء الشبكة؟",
              description: "اختر /8 أو /16 أو /24 لترى أي أقسام العنوان تخص الشبكة وأيها تخص الجهاز، ثم جرّب المهمة الصغيرة.",
              source: src(40, 40),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "العنوان 192.168.10.10: مع /8 جزء الشبكة هو 192 والباقي للجهاز؛ مع /16 جزء الشبكة 192.168؛ مع /24 جزء الشبكة 192.168.10 والقسم الأخير 10 للجهاز. كلما كبر الرقم اتّسع جزء الشبكة وضاق جزء الجهاز." },
              config: {
                examples: [
                  { address: "192.168.10.10", label: "المثال الأول" },
                  { address: "10.138.10.1", label: "المثال الثاني" },
                  { address: "172.18.200.100", label: "المثال الثالث" },
                ],
                prefixes: [8, 16, 24],
                initialPrefix: 24,
                networkLabel: "شبكة",
                hostLabel: "جهاز",
                note: "كلما كبر الرقم اتّسع جزء الشبكة وضاق جزء الجهاز.",
                task: { prompt: "مهمة: اختر عنوانًا لجهاز آخر في نفس الشبكة (جزء الشبكة نفسه، وجزء الجهاز مختلف).", pick: "اختر" },
              },
            },
            {
              id: "m08-l02-p01-caption", type: "callout", origin: "book", kind: "remember",
              spans: [T("كلما كبر الرقم اتّسع جزء الشبكة وضاق جزء الجهاز.")],
            },
            {
              id: "m08-l02-p01-table", type: "table", origin: "book",
              headers: ["العنوان", "جزء الشبكة", "جزء الجهاز"],
              columnDirs: ["ltr", "ltr", "ltr"],
              rows: [
                ["192.168.10.10", "192.168.10", "10"],
                ["10.138.10.1", "10", "138.10.1"],
                ["172.18.200.100", "172.18", "200.100"],
              ],
            },
            {
              id: "m08-l02-p01-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("كلما زاد رقم "), L("CIDR"), T(" زاد الجزء الخاص بالشبكة، وقلّ الجزء المتاح للأجهزة.")],
            },
            {
              id: "m08-l02-p01-ex1", type: "example", origin: "teacher-enrichment", mode: "solved",
              title: "مثال محلول: 192.168.10.25 /24",
              prompt: "ما هو جزء الشبكة وما هو جزء الجهاز؟",
              steps: [
                { text: "/24 يعني أن أول 24 بت للشبكة." },
                { text: "في مستوى هذه الوحدة، هذا يعني أول ثلاثة أقسام." },
                { text: "جزء الشبكة: 192.168.10 — جزء الجهاز: 25." },
              ],
              result: "192.168.10 | 25",
              explanation: "الشرطة المائلة ورقمها يخبراننا أين نقطع العنوان: /24 → بعد ثلاثة أقسام.",
            },
            {
              // Guided walkthrough (built-in reveal) — the SAME method on a /16 example from the page's table.
              id: "m08-l02-p01-guided", type: "guided", origin: "teacher-enrichment",
              guidedType: "reveal", version: 1,
              title: "خطوة بخطوة: 172.18.200.100 مع /16",
              source: src(40, 40),
              capabilities: { fullscreen: true, reset: true },
              prompt: [T("قبل أن تكشف الخطوات: كم قسمًا يخص الشبكة مع "), L("/16"), T("؟ فكّر ثم اكشف.")],
              steps: [
                { id: "m08-l02-p01-g1", text: [T("انظر إلى الرقم بعد الشرطة المائلة: "), L("16"), T(".")] },
                { id: "m08-l02-p01-g2", text: [L("/16"), T(" يعني أول قسمين للشبكة.")] },
                { id: "m08-l02-p01-g3", text: [T("ظلّل القسمين الأولين: "), L("172.18"), T(" — هذا جزء الشبكة.")] },
                { id: "m08-l02-p01-g4", text: [T("ما بقي: "), L("200.100"), T(" — هذا جزء الجهاز.")] },
              ],
              result: [T("الشبكة "), L("172.18"), T(" · الجهاز "), L("200.100")],
              explanation: "نفس الطريقة تعمل مع /8 (قسم واحد) و /24 (ثلاثة أقسام).",
            },
            {
              id: "m08-l02-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "في العنوان 10.138.10.1 مع القناع /8، ما هو جزء الشبكة؟",
                options: [opt("m08-l02-p01-q1-a", "10", true), opt("m08-l02-p01-q1-b", "10.138"), opt("m08-l02-p01-q1-c", "10.138.10")],
                feedback: {
                  hints: ["/8 = 8 بتات = قسم واحد.", "خذ القسم الأول فقط من العنوان."],
                  correctFeedback: "أحسنت — /8 يعني قسمًا واحدًا للشبكة: 10.",
                  incorrectFeedback: "افحص الرقم بعد الشرطة: /8 يعني قسمًا واحدًا فقط للشبكة، فلا تأخذ أكثر من قسم.",
                  explanation: "مع /8 جزء الشبكة هو 10، وجزء الجهاز 138.10.1 (كما في جدول الصفحة).",
                },
              },
            },
          ],
        },
        // PDF 41 — ما هو CIDR؟
        {
          id: "791381-m08-l02-p02",
          title: "ما هو CIDR؟",
          order: 2,
          source: src(41, 41),
          keywords: ["CIDR", "بتات الشبكة", "/24"],
          blocks: [
            {
              id: "m08-l02-p02-def", type: "callout", origin: "book", kind: "important", title: "التعريف",
              spans: [L("CIDR"), T(" طريقة مختصرة لكتابة قناع الشبكة: نكتب عدد بتات الشبكة بعد علامة / مثل "), L("/24"), T(".")],
            },
            {
              id: "m08-l02-p02-table", type: "table", origin: "book",
              headers: ["الصيغة", "قناع الشبكة", "عدد بتات الشبكة", "عدد الأجهزة"],
              columnDirs: ["ltr", "ltr", "ltr", "rtl"],
              rows: [
                ["/24", "255.255.255.0", "24", "254"],
                ["/16", "255.255.0.0", "16", "65 ألف"],
                ["/8", "255.0.0.0", "8", "16 مليون"],
              ],
            },
            {
              id: "m08-l02-p02-example", type: "callout", origin: "book", kind: "tip", title: "مثال",
              spans: [T("العنوان "), L("192.168.1.0/24"), T(" يعني أن أول 24 بت مخصصة للشبكة.")],
            },
            {
              id: "m08-l02-p02-ex1", type: "example", origin: "teacher-enrichment", mode: "solved",
              title: "مثال محلول: من /16 إلى القناع",
              prompt: "ما قناع الشبكة الذي يقابل /16؟",
              steps: [
                { text: "/16 = 16 بت للشبكة." },
                { text: "كل قسم في العنوان = 8 بتات، إذًا 16 ÷ 8 = قسمان." },
                { text: "القسمان الأولان يأخذان 255، والباقي 0." },
              ],
              result: "255.255.0.0",
              explanation: "بنفس الطريقة: /8 = قسم واحد = 255.0.0.0، و /24 = ثلاثة أقسام = 255.255.255.0.",
            },
            {
              id: "m08-l02-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي صيغة CIDR تقابل القناع 255.255.255.0؟",
                options: [opt("m08-l02-p02-q1-a", "/8"), opt("m08-l02-p02-q1-b", "/16"), opt("m08-l02-p02-q1-c", "/24", true)],
                feedback: {
                  hints: ["عدّ الأقسام التي قيمتها 255.", "ثلاثة أقسام × 8 بتات = 24."],
                  correctFeedback: "أحسنت — ثلاثة أقسام 255 تساوي 24 بت، أي /24.",
                  incorrectFeedback: "افحص كم قسمًا في القناع قيمته 255، ثم اضرب في 8 لتحصل على عدد البتات.",
                  explanation: "255.255.255.0 فيه ثلاثة أقسام للشبكة = 24 بت = /24.",
                },
              },
            },
          ],
        },
        // PDF 42 — أمثلة على CIDR
        {
          id: "791381-m08-l02-p03",
          title: "أمثلة على CIDR",
          order: 3,
          source: src(42, 42),
          keywords: ["CIDR", "مجال العناوين", "Broadcast"],
          blocks: [
            {
              id: "m08-l02-p03-table", type: "table", origin: "book",
              headers: ["عنوان الشبكة", "قناع الشبكة", "مجال العناوين"],
              columnDirs: ["ltr", "ltr", "ltr"],
              rows: [
                ["10.10.10.0/24", "255.255.255.0", "10.10.10.1 – 10.10.10.254"],
                ["172.16.40.0/24", "255.255.255.0", "172.16.40.1 – 172.16.40.254"],
                ["192.168.0.0/16", "255.255.0.0", "192.168.0.1 – 192.168.255.254"],
                ["20.113.0.0/16", "255.255.0.0", "20.113.0.1 – 20.113.255.254"],
              ],
            },
            {
              id: "m08-l02-p03-warn", type: "callout", origin: "book", kind: "warning", title: "انتبه",
              spans: [T("أول عنوان غالبًا للشبكة، وآخر عنوان غالبًا "), L("Broadcast"), T("، لذلك لا نعطيهما للحواسيب.")],
            },
            {
              id: "m08-l02-p03-ex1", type: "example", origin: "teacher-enrichment", mode: "solved",
              title: "مثال محلول: مجال العناوين للشبكة 192.168.5.0/24",
              prompt: "ما العناوين التي يمكن إعطاؤها للحواسيب؟",
              steps: [
                { text: "/24 → جزء الشبكة 192.168.5 ثابت في كل العناوين." },
                { text: "القسم الأخير هو الذي يتغيّر: من 0 إلى 255." },
                { text: "لا نعطي الحواسيب أول عنوان (192.168.5.0) ولا آخر عنوان (192.168.5.255)." },
              ],
              result: "192.168.5.1 – 192.168.5.254",
              explanation: "هذا هو نفس نمط الصفوف في جدول الصفحة: من .1 إلى .254.",
            },
            {
              id: "m08-l02-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي عنوان لا نعطيه لحاسوب في الشبكة 10.10.10.0/24؟",
                options: [opt("m08-l02-p03-q1-a", "10.10.10.1"), opt("m08-l02-p03-q1-b", "10.10.10.254"), opt("m08-l02-p03-q1-c", "10.10.10.255", true)],
                feedback: {
                  hints: ["انظر إلى مجال العناوين في الجدول: من .1 إلى .254.", "آخر عنوان في الشبكة (.255) هو Broadcast."],
                  correctFeedback: "أحسنت — 10.10.10.255 هو آخر عنوان (Broadcast) فلا يُعطى لحاسوب.",
                  incorrectFeedback: "افحص الجدول: المجال المسموح من .1 إلى .254؛ ما العنوان الذي يقع خارجه؟",
                  explanation: "أول عنوان (.0) للشبكة وآخر عنوان (.255) للبث؛ الحواسيب تأخذ ما بينهما.",
                },
              },
            },
          ],
        },
      ],
    },

    // ── l03 — devices in the same network, PC2, the default gateway, batch summary (PDF 43–46) ─────────────
    {
      id: "791381-m08-l03",
      title: "الأجهزة في نفس الشبكة والبوابة الافتراضية",
      order: 3,
      pages: [
        // PDF 43 — أجهزة في نفس الشبكة
        {
          id: "791381-m08-l03-p01",
          title: "أجهزة في نفس الشبكة",
          order: 1,
          source: src(43, 43),
          keywords: ["نفس الشبكة", "PC1", "PC2", "/24"],
          blocks: [
            {
              id: "m08-l03-p01-rule", type: "callout", origin: "book", kind: "important", title: "القاعدة",
              spans: [T("حتى تتواصل الأجهزة في نفس الشبكة يجب أن يبقى جزء الشبكة ثابتًا، ونغيّر فقط جزء الجهاز.")],
            },
            {
              id: "m08-l03-p01-table", type: "table", origin: "book",
              headers: ["الجهاز", "عنوان IP"],
              columnDirs: ["ltr", "ltr"],
              rows: [["PC1", "192.168.1.1"], ["PC2", "192.168.1.2"], ["Printer", "192.168.1.10"], ["Phone", "192.168.1.20"]],
            },
            {
              id: "m08-l03-p01-mask", type: "callout", origin: "book", kind: "remember", title: "في القناع /24",
              spans: [T("يجب أن تبقى أول 3 أقسام متشابهة ("), L("192.168.1"), T(") في كل الأجهزة، ويختلف القسم الأخير فقط.")],
            },
            {
              id: "m08-l03-p01-ex1", type: "example", origin: "teacher-enrichment", mode: "solved",
              title: "مثال محلول: هل 192.168.1.5 و 192.168.2.5 في نفس الشبكة مع /24؟",
              steps: [
                { text: "/24 → نقارن أول ثلاثة أقسام فقط." },
                { text: "الأول: 192.168.1 — الثاني: 192.168.2." },
                { text: "القسم الثالث مختلف (1 ≠ 2)." },
              ],
              result: "192.168.1 ≠ 192.168.2",
              explanation: "ليسا في نفس الشبكة، رغم أن القسم الأخير متساوٍ. المهم هو جزء الشبكة، لا جزء الجهاز.",
            },
            {
              id: "m08-l03-p01-ex2", type: "example", origin: "teacher-enrichment", mode: "solved",
              title: "مثال محلول: هل 10.5.7.9 و 10.9.9.9 في نفس الشبكة مع /8؟",
              steps: [
                { text: "/8 → نقارن القسم الأول فقط." },
                { text: "الأول: 10 — الثاني: 10. متساويان." },
              ],
              result: "10 = 10",
              explanation: "نعم، في نفس الشبكة؛ الأقسام الأخرى كلها جزء الجهاز مع /8.",
            },
            {
              id: "m08-l03-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "مع القناع /16، العنوانان 172.18.10.10 و 172.18.99.1 في نفس الشبكة.",
                answer: true,
                feedback: {
                  correctFeedback: "صحيح — مع /16 نقارن أول قسمين فقط: 172.18 = 172.18.",
                  incorrectFeedback: "افحص القناع أولًا: /16 يعني أن جزء الشبكة قسمان فقط، فقارن 172.18 مع 172.18 وتجاهل الباقي.",
                  hints: ["كم قسمًا يخص الشبكة مع /16؟", "قارن أول قسمين فقط."],
                },
              },
            },
          ],
        },
        // PDF 44 — تدريب: أعطِ عنوانًا لجهاز PC2 (the book's OPEN worksheet stays blank; a closed choice follows)
        {
          id: "791381-m08-l03-p02",
          title: "تدريب: أعطِ عنوانًا لجهاز PC2",
          order: 2,
          source: src(44, 44),
          keywords: ["تدريب", "PC2", "عنوان مناسب"],
          blocks: [
            {
              // The printed worksheet exactly as the book leaves it: the third column is the learner's (blank).
              id: "m08-l03-p02-table", type: "table", origin: "book",
              headers: ["PC1", "القناع", "عنوان مناسب لـ PC2"],
              columnDirs: ["ltr", "ltr", "rtl"],
              rows: [
                ["192.168.20.1", "/24", ""],
                ["172.18.10.10", "/16", ""],
                ["10.138.10.1", "/8", ""],
                ["200.10.10.200", "/24", ""],
                ["189.10.100.100", "/16", ""],
              ],
            },
            {
              id: "m08-l03-p02-rule", type: "callout", origin: "book", kind: "important", title: "القاعدة",
              spans: [T("غيّر فقط جزء الجهاز حسب القناع، ولا تستعمل نفس عنوان "), L("PC1"), T(".")],
            },
            {
              // ENRICHMENT — a closed-choice version of the same rows (the book's answer column is open, so the
              // choices are ours): one option keeps the network part and changes the host part; the distractors
              // either repeat PC1 exactly or change the network part.
              id: "m08-l03-p02-check", type: "practice-table", origin: "teacher-enrichment",
              caption: "تحقّق من نفسك: أي العناوين مناسب لـ PC2؟",
              headers: ["PC1", "القناع", "اختر عنوانًا مناسبًا لـ PC2"],
              columnDirs: ["ltr", "ltr", "ltr"],
              rows: [
                ["192.168.20.1", "/24", PC2(["192.168.20.1", "192.168.21.7", "192.168.20.7"], "192.168.20.7")],
                ["172.18.10.10", "/16", PC2(["172.19.10.11", "172.18.50.5", "172.18.10.10"], "172.18.50.5")],
                ["10.138.10.1", "/8", PC2(["11.138.10.2", "10.138.10.1", "10.200.1.1"], "10.200.1.1")],
                ["200.10.10.200", "/24", PC2(["200.10.10.201", "200.10.11.200", "200.10.10.200"], "200.10.10.201")],
                ["189.10.100.100", "/16", PC2(["189.10.100.100", "189.11.100.100", "189.10.7.7"], "189.10.7.7")],
              ],
            },
            {
              id: "m08-l03-p02-tip", type: "callout", origin: "teacher-enrichment", kind: "tip", title: "كيف تفحص اختيارك؟",
              spans: [T("سؤالان فقط: هل بقي جزء الشبكة كما هو حسب القناع؟ وهل العنوان مختلف عن "), L("PC1"), T("؟ إذا كان الجواب نعم للاثنين فالعنوان مناسب.")],
            },
          ],
        },
        // PDF 45 — البوابة الافتراضية Default Gateway (+ the gateway flow animation)
        {
          id: "791381-m08-l03-p03",
          title: "البوابة الافتراضية Default Gateway",
          order: 3,
          source: src(45, 45),
          keywords: ["Default Gateway", "البوابة الافتراضية", "Router", "192.168.1.1"],
          blocks: [
            {
              id: "m08-l03-p03-def", type: "text", origin: "book",
              spans: [T("البوابة الافتراضية هي غالبًا عنوان الراوتر. وظيفتها: إخراج البيانات من الشبكة المحلية إلى الإنترنت أو إلى شبكة أخرى.")],
            },
            {
              id: "m08-l03-p03-points", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m08-l03-p03-pt1", text: [T("البوابة الافتراضية هي غالبًا عنوان الراوتر.")] },
                { id: "m08-l03-p03-pt2", text: [T("وظيفتها إخراج البيانات من الشبكة المحلية.")] },
                { id: "m08-l03-p03-pt3", text: [T("في البيت غالبًا: "), L("192.168.1.1"), T(" أو "), L("192.168.0.1"), T(".")] },
              ],
            },
            {
              // The page's figure (الشبكة المحلية + Switch → Router «البوابة الافتراضية 192.168.1.1» → الإنترنت)
              // becomes the flow animation: animation / gateway-flow / v1 (ENRICHMENT with a PDF-45 association).
              id: "m08-l03-p03-flow", type: "animation", origin: "teacher-enrichment",
              animationType: "gateway-flow", version: 1,
              title: "كل ما يخرج من الشبكة يمرّ عبر البوابة",
              description: "اختر الوجهة ثم اضغط «أرسل البيانات»: داخل الشبكة المحلية تمرّ البيانات عبر Switch فقط، أما إلى الإنترنت فتخرج عبر الراوتر (البوابة الافتراضية).",
              source: src(45, 45),
              capabilities: { fullscreen: true, replay: true, reset: true, animated: true, interactive: true },
              fallback: { text: "الشبكة المحلية (PC1 و PC2 عبر Switch) ← Router وهو البوابة الافتراضية 192.168.1.1 ← الإنترنت. رسالة إلى جهاز في نفس الشبكة تمرّ عبر Switch فقط؛ رسالة إلى الإنترنت أو شبكة أخرى يجب أن تخرج عبر البوابة." },
              config: {
                sender: { label: "PC1", address: "192.168.1.10" },
                local: { label: "PC2", address: "192.168.1.20" },
                switchLabel: "Switch",
                router: { label: "Router", role: "البوابة الافتراضية", address: "192.168.1.1" },
                outside: { label: "الإنترنت" },
                localCaption: "الوجهة في نفس الشبكة المحلية: البيانات تمرّ عبر Switch ولا تحتاج البوابة.",
                outsideCaption: "الوجهة خارج الشبكة: البيانات تخرج عبر الراوتر — البوابة الافتراضية — إلى الإنترنت.",
              },
            },
            {
              id: "m08-l03-p03-caption", type: "callout", origin: "book", kind: "remember",
              spans: [T("كل ما يخرج من الشبكة يمرّ عبر البوابة.")],
            },
            {
              id: "m08-l03-p03-without", type: "callout", origin: "book", kind: "warning", title: "بدون Gateway",
              spans: [T("قد تعمل الشبكة المحلية، لكن لن تصل الأجهزة إلى الإنترنت.")],
            },
            {
              id: "m08-l03-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "متى يحتاج الجهاز إلى البوابة الافتراضية؟",
                options: [
                  opt("m08-l03-p03-q1-a", "عند إرسال بيانات إلى جهاز في نفس الشبكة المحلية"),
                  opt("m08-l03-p03-q1-b", "عند إرسال بيانات إلى الإنترنت أو إلى شبكة أخرى", true),
                  opt("m08-l03-p03-q1-c", "لا يحتاجها أبدًا"),
                ],
                feedback: {
                  hints: ["ما وظيفة البوابة كما في الصفحة؟", "«إخراج البيانات من الشبكة المحلية» — أي عندما تكون الوجهة خارجها."],
                  correctFeedback: "أحسنت — البوابة هي باب الخروج من الشبكة المحلية إلى الخارج.",
                  incorrectFeedback: "افحص وظيفة البوابة في الصفحة: هي «تُخرج» البيانات من الشبكة المحلية، فمتى نحتاج إلى الخروج؟",
                  explanation: "داخل الشبكة نفسها تكفي Switch؛ الخروج إلى الإنترنت أو شبكة أخرى يمرّ عبر البوابة الافتراضية.",
                },
              },
            },
          ],
        },
        // PDF 46 — نهاية الدفعة الأولى · خلاصة سريعة (no printed page number)
        {
          id: "791381-m08-l03-p04",
          title: "خلاصة سريعة",
          order: 4,
          source: src(46),
          keywords: ["خلاصة", "نهاية الدفعة الأولى", "Gateway", "CIDR", "Subnet"],
          blocks: [
            {
              id: "m08-l03-p04-heading", type: "heading", origin: "book", level: 3, text: "نهاية الدفعة الأولى",
            },
            {
              id: "m08-l03-p04-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m08-l03-p04-net", term: "الشبكة", text: [T("أجهزة متصلة لتبادل المعلومات.")] },
                { id: "m08-l03-p04-ip", term: "IP", text: [T("عنوان خاص لكل جهاز.")] },
                { id: "m08-l03-p04-subnet", term: "Subnet", text: [T("يحدّد جزء الشبكة وجزء الجهاز.")] },
                { id: "m08-l03-p04-cidr", term: "CIDR", text: [T("طريقة مختصرة للقناع مثل "), L("/24"), T(".")] },
                { id: "m08-l03-p04-gw", term: "Gateway", text: [T("الباب الذي يخرج منه الجهاز للخارج.")] },
              ],
            },
            {
              id: "m08-l03-p04-next", type: "callout", origin: "book", kind: "summary", title: "الدفعة التالية",
              spans: [T("أجهزة الشبكات · أنواع شبكات الاتصال · الكوابل · "), L("MAC Address"), T(" والرسائل")],
            },
            {
              // ENRICHMENT — three exam-style questions that mix the unit's ideas (class + mask, PC2, gateway).
              id: "m08-l03-p04-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "سؤال ختامي 1: العنوان 150.150.1.1 — ما فئته وقناعه الطبيعي؟",
                options: [
                  opt("m08-l03-p04-q1-a", "A — 255.0.0.0"),
                  opt("m08-l03-p04-q1-b", "B — 255.255.0.0", true),
                  opt("m08-l03-p04-q1-c", "C — 255.255.255.0"),
                ],
                feedback: {
                  hints: ["الرقم الأول 150 في أي مدى؟", "128–191 هو مدى الفئة B، وقناعها /16."],
                  correctFeedback: "أحسنت — الفئة B وقناعها 255.255.0.0.",
                  incorrectFeedback: "افحص الرقم الأول (150) في جدول الفئات، ثم خذ القناع الطبيعي لتلك الفئة.",
                  explanation: "150 بين 128 و 191 → الفئة B → 255.255.0.0 (/16).",
                },
              },
            },
            {
              id: "m08-l03-p04-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "سؤال ختامي 2: PC1 عنوانه 192.168.7.10 مع /24. أي عنوان يصلح لـ PC2 في نفس الشبكة؟",
                options: [opt("m08-l03-p04-q2-a", "192.168.8.10"), opt("m08-l03-p04-q2-b", "192.168.7.10"), opt("m08-l03-p04-q2-c", "192.168.7.25", true)],
                feedback: {
                  hints: ["مع /24 يجب أن يبقى 192.168.7 كما هو.", "ولا يجوز تكرار عنوان PC1 نفسه."],
                  correctFeedback: "أحسنت — 192.168.7 ثابت، وجزء الجهاز 25 مختلف عن 10.",
                  incorrectFeedback: "افحص أمرين: هل بقيت الأقسام الثلاثة الأولى 192.168.7؟ وهل العنوان مختلف عن عنوان PC1؟",
                  explanation: "192.168.8.10 غيّر جزء الشبكة، و192.168.7.10 هو عنوان PC1 نفسه.",
                },
              },
            },
            {
              id: "m08-l03-p04-q3", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "سؤال ختامي 3: جهاز في البيت عنوانه 192.168.1.15 يريد فتح موقع على الإنترنت. أي عنوان يكون غالبًا بوابته الافتراضية؟",
                options: [opt("m08-l03-p04-q3-a", "192.168.1.1", true), opt("m08-l03-p04-q3-b", "8.8.8.8"), opt("m08-l03-p04-q3-c", "192.168.1.15")],
                feedback: {
                  hints: ["البوابة هي غالبًا عنوان الراوتر في نفس الشبكة المحلية.", "في البيت غالبًا 192.168.1.1 أو 192.168.0.1."],
                  correctFeedback: "أحسنت — عنوان الراوتر في الشبكة المحلية هو البوابة الافتراضية.",
                  incorrectFeedback: "افحص: البوابة عنوان الراوتر داخل الشبكة المحلية نفسها (192.168.1.x)، وليست عنوان الجهاز ولا عنوانًا على الإنترنت.",
                  explanation: "192.168.1.15 هو الجهاز نفسه، و8.8.8.8 عنوان عام خارج الشبكة؛ البوابة هي الراوتر 192.168.1.1.",
                },
              },
            },
          ],
        },
      ],
    },
  ],
};

export default m08;
