// Learning Materials — Phase 3B PILOT: REAL converted body for Book 791381, module m01 (أساسيات الشبكات).
//
// Faithful native conversion of source PDF pages 7–13 (1 source page → 1 interactive page). Book-derived blocks are
// origin:"book"; added interactive teaching layers (the network-scope diagram, the "حل مع المعلم" guided reveal) and
// the SVG visual-enrichment illustrations (Chapter 1 pilot — `type:"visual"`, resolved by the trusted visuals
// registry) are origin:"teacher-enrichment" with a block-level `source` ASSOCIATING them to the page they build on
// (source association ≠ provenance). Wording is kept faithful to the source (verified against the rendered pages); technical
// strings (PAN/LAN/WAN, Wi-Fi, IP, TCP/IP, ping, ipconfig) render LTR. NOTHING here goes beyond PDF 13.
//
// This module is COMPLETE (every m01 manifest page has a body), so it carries no `partial` flag.

import type { ContentModule, ContentSource, PracticeOption } from "../../types";

const CID = "791381";
const src = (pdf: number, printed?: number): ContentSource => ({ kind: "book", sourceId: CID, pdfPageStart: pdf, printedPage: printed });

// Study-Practice exercises (teacher enrichment, Strength phase): short self-checks on what THIS page teaches — the
// Reader judges them locally and the server (learning-study key index) awards the module's Strength for uniquely
// completed exercises. Never book content, never a training (the T/F Learning-Practice items keep their own bucket).
const opt = (id: string, text: string, correct?: true): PracticeOption => (correct ? { id, text, correct } : { id, text });

const m01: ContentModule = {
  id: "791381-m01",
  title: "أساسيات الشبكات",
  shortTitle: "الأساسيات",
  order: 1,
  lessons: [
    // ── l00 — unit opener (PDF 7) ────────────────────────────────────────────────────────────────────────────
    {
      id: "791381-m01-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381-m01-l00-p01",
          title: "أساسيات الشبكات",
          order: 1,
          layout: "opener",
          source: src(7),
          blocks: [
            {
              id: "m01-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الوحدة الأولى", unitNumber: "01", title: "أساسيات الشبكات",
              subtitle: "ما هي الشبكة؟ ولماذا نحتاجها؟ وما أنواعها؟",
              goal: "الهدف: فكرة أساسية + مثال واضح + تدريب",
            },
          ],
        },
      ],
    },

    // ── l01 — intro (PDF 8–10), existing manifest ids preserved ───────────────────────────────────────────────
    {
      id: "791381-m01-l01",
      title: "مقدمة إلى الشبكات",
      order: 1,
      pages: [
        // PDF 8 — ما هي الشبكة؟
        {
          id: "791381-m01-l01-p01",
          title: "ما هي الشبكة؟",
          order: 1,
          source: src(8, 6),
          blocks: [
            {
              id: "m01-l01-p01-def", type: "text", origin: "book",
              spans: [{ text: "الشبكة هي مجموعة أجهزة متصلة مع بعضها. الهدف منها تبادل المعلومات والملفات والوصول إلى الإنترنت." }],
            },
            {
              id: "m01-l01-p01-examples", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m01-l01-p01-i1", term: "شبكة البيت", text: [{ text: "تربط الهاتف والحاسوب بالواي فاي." }] },
                { id: "m01-l01-p01-i2", term: "شبكة المدرسة", text: [{ text: "تربط حواسيب الصفوف ببعضها." }] },
              ],
            },
            {
              id: "m01-l01-p01-sum", type: "callout", origin: "book", kind: "summary", title: "الخلاصة",
              spans: [{ text: "بدون شبكة لا تستطيع الأجهزة التواصل مع بعضها بسهولة؛ الشبكة هي ما يجعل الأجهزة تعمل معًا." }],
            },
            {
              // ENRICHMENT: SVG visual for the core idea — a network IS connected devices exchanging data.
              id: "m01-l01-p01-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/ch1/network-connected-devices", motion: true,
              source: src(8, 6),
              title: "رسم توضيحي: الشبكة أجهزة متصلة",
              alt: "رسم يبيّن أجهزة متصلة بشبكة مركزية تتبادل البيانات فيما بينها.",
              caption: "تتبادل الأجهزة المتصلة المعلومات عبر الشبكة.",
            },
            {
              id: "m01-l01-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما الشبكة حسب تعريف الكتاب؟",
                options: [
                  opt("m01-l01-p01-q1-a", "مجموعة أجهزة متصلة مع بعضها لتبادل المعلومات والملفات والوصول إلى الإنترنت", true),
                  opt("m01-l01-p01-q1-b", "جهاز واحد يعمل منفصلًا عن غيره"),
                  opt("m01-l01-p01-q1-c", "برنامج لتحرير الصور والملفات"),
                ],
                feedback: { hints: ["افحص الجملة الأولى في الصفحة.", "الشبكة = أجهزة متصلة مع بعضها."], correctFeedback: "أحسنت — الشبكة مجموعة أجهزة متصلة تتبادل المعلومات.", incorrectFeedback: "افحص التعريف: «الشبكة هي مجموعة أجهزة متصلة مع بعضها».", explanation: "الهدف من الشبكة تبادل المعلومات والملفات والوصول إلى الإنترنت." },
              },
            },
          ],
        },
        // PDF 9 — استخدامات الشبكة
        {
          id: "791381-m01-l01-p02",
          title: "استخدامات الشبكة",
          order: 2,
          source: src(9, 7),
          blocks: [
            {
              id: "m01-l01-p02-uses", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m01-l01-p02-i1", term: "ملفات", text: [{ text: "مشاركة ملفات وصور بين الأجهزة." }] },
                { id: "m01-l01-p02-i2", term: "إنترنت", text: [{ text: "الدخول إلى المواقع ومصادر التعلم." }] },
                { id: "m01-l01-p02-i3", term: "تواصل", text: [{ text: "بريد إلكتروني ورسائل ومحادثات." }] },
                { id: "m01-l01-p02-i4", term: "تعاون", text: [{ text: "عمل جماعي ودراسة عن بُعد." }] },
              ],
            },
            {
              id: "m01-l01-p02-idea", type: "callout", origin: "book", kind: "important", title: "الفكرة",
              spans: [{ text: "الشبكة تجعل الأجهزة تعمل معًا بدلًا من أن يكون كل جهاز منفصلًا وحيدًا." }],
            },
            {
              // ENRICHMENT: SVG concept map — the four uses radiate from one central network.
              id: "m01-l01-p02-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/ch1/network-uses-map", motion: true,
              source: src(9, 7),
              title: "مخطط: استخدامات الشبكة",
              alt: "مخطط إشعاعي يربط شبكة مركزية بأربعة استخدامات: الملفات والإنترنت والتواصل والتعاون.",
              caption: "الاستخدامات المختلفة تنطلق من شبكة واحدة.",
            },
            {
              id: "m01-l01-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "من استخدامات الشبكة: مشاركة الملفات والصور، والدخول إلى الإنترنت، والتواصل، والتعاون عن بُعد.", answer: true,
                feedback: { hints: ["افحص بطاقات الاستخدامات الأربع في الصفحة."], correctFeedback: "أحسنت — هذه هي الاستخدامات الأربعة التي يذكرها الكتاب.", incorrectFeedback: "افحص البطاقات: ملفات، إنترنت، تواصل، تعاون.", explanation: "الشبكة تجعل الأجهزة تعمل معًا بدلًا من أن يكون كل جهاز منفصلًا." },
              },
            },
          ],
        },
        // PDF 10 — حسنات الشبكة
        {
          id: "791381-m01-l01-p03",
          title: "حسنات الشبكة",
          order: 3,
          source: src(10, 8),
          blocks: [
            {
              id: "m01-l01-p03-benefits", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m01-l01-p03-b1", text: [{ text: "سرعة في تبادل المعلومات بين الأشخاص." }] },
                { id: "m01-l01-p03-b2", text: [{ text: "سهولة الوصول إلى الإنترنت ومواقع التعلم." }] },
                { id: "m01-l01-p03-b3", text: [{ text: "التواصل السريع عبر البريد وبرامج المحادثة." }] },
                { id: "m01-l01-p03-b4", text: [{ text: "التعاون في الدراسة والعمل من أماكن مختلفة." }] },
                { id: "m01-l01-p03-b5", text: [{ text: "مشاركة الأجهزة مثل الطابعة بين عدة حواسيب." }] },
              ],
            },
            {
              // The shared-printer example is BOOK content (not enrichment) — a real ExampleBlock, origin:"book".
              id: "m01-l01-p03-ex", type: "example", origin: "book", mode: "solved", title: "مثال بسيط",
              steps: [],
              explanation: "في المدرسة يستطيع أكثر من حاسوب استعمال نفس الطابعة عن طريق الشبكة، بدل شراء طابعة لكل جهاز.",
            },
            {
              // ENRICHMENT: SVG for the book's own shared-printer example — many computers, one printer.
              id: "m01-l01-p03-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/ch1/shared-printer", motion: true,
              source: src(10, 8),
              title: "رسم توضيحي: مشاركة الطابعة",
              alt: "رسم يبيّن ثلاثة حواسيب تشترك في طابعة واحدة عبر الشبكة.",
              caption: "عدة حواسيب تشترك في طابعة واحدة عبر الشبكة.",
            },
            {
              id: "m01-l01-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "في المثال البسيط في الكتاب، ما الذي تتيحه الشبكة في المدرسة؟",
                options: [
                  opt("m01-l01-p03-q1-a", "أن يستعمل أكثر من حاسوب نفس الطابعة بدل شراء طابعة لكل جهاز", true),
                  opt("m01-l01-p03-q1-b", "شراء طابعة لكل جهاز على حدة"),
                  opt("m01-l01-p03-q1-c", "منع الحواسيب من مشاركة الملفات"),
                ],
                feedback: { hints: ["افحص صندوق «مثال بسيط».", "طابعة واحدة … عدة حواسيب."], correctFeedback: "أحسنت — مشاركة الأجهزة مثل الطابعة من حسنات الشبكة.", incorrectFeedback: "افحص المثال: «أكثر من حاسوب استعمال نفس الطابعة عن طريق الشبكة».", explanation: "مشاركة الأجهزة بين عدة حواسيب من حسنات الشبكة التي يعدّدها الكتاب." },
              },
            },
          ],
        },
      ],
    },

    // ── l02 — types / build / manage (PDF 11–13) ──────────────────────────────────────────────────────────────
    {
      id: "791381-m01-l02",
      title: "أنواع الشبكات وبناؤها وإدارتها",
      order: 2,
      pages: [
        // PDF 11 — أنواع الشبكات (+ the pilot's first real interactive diagram)
        {
          id: "791381-m01-l02-p01",
          title: "أنواع الشبكات",
          order: 1,
          source: src(11, 9),
          blocks: [
            {
              id: "m01-l02-p01-types", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m01-l02-p01-t1", term: "شبكة شخصية", text: [{ text: "PAN", dir: "ltr", style: "code" }, { text: " — أجهزة قريبة جدًا، مثل هاتف وسماعة بلوتوث." }], note: "أمتار قليلة" },
                { id: "m01-l02-p01-t2", term: "شبكة محلية", text: [{ text: "LAN", dir: "ltr", style: "code" }, { text: " — داخل بيت أو مدرسة، مثل غرفة الحاسوب." }], note: "بيت أو مدرسة" },
                { id: "m01-l02-p01-t3", term: "شبكة واسعة", text: [{ text: "WAN", dir: "ltr", style: "code" }, { text: " — بين مدن أو دول، وأكبر مثال هو الإنترنت." }], note: "بين مدن أو دول" },
              ],
            },
            {
              id: "m01-l02-p01-diff", type: "callout", origin: "book", kind: "important", title: "الفرق الأساسي",
              spans: [
                { text: "الفرق بين الأنواع هو حجم الشبكة والمسافة بين الأجهزة: من أمتار قليلة في " },
                { text: "PAN", dir: "ltr", style: "code" },
                { text: " إلى العالم كله في " },
                { text: "WAN", dir: "ltr", style: "code" },
                { text: "." },
              ],
            },
            {
              // ENRICHMENT: the pilot's first real production activity — explore PAN → LAN → WAN as growing scope.
              // Associated with PDF 11 (source association) but origin remains teacher-enrichment.
              id: "m01-l02-p01-scope", type: "interactive-diagram", origin: "teacher-enrichment",
              interactionType: "network-scope", version: 1,
              title: "استكشف نطاق الشبكات", description: "اختر نوع الشبكة لترى كيف يزداد النطاق والمسافة.",
              source: src(11, 9),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              config: {
                scopes: [
                  { id: "pan", name: "PAN", title: "شبكة شخصية", distance: "أمتار قليلة", example: "أجهزة قريبة جدًا، مثل هاتف وسماعة بلوتوث." },
                  { id: "lan", name: "LAN", title: "شبكة محلية", distance: "بيت أو مدرسة", example: "داخل بيت أو مدرسة، مثل غرفة الحاسوب." },
                  { id: "wan", name: "WAN", title: "شبكة واسعة", distance: "بين مدن أو دول", example: "بين مدن أو دول، وأكبر مثال هو الإنترنت." },
                ],
                note: "كلما زاد حجم الشبكة زادت المسافة بين الأجهزة: من PAN إلى WAN.",
              },
            },
            {
              id: "m01-l02-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "اكتب الاختصار الإنجليزي لنوع الشبكة التي تكون داخل بيت أو مدرسة (الشبكة المحلية).", answer: "LAN",
                feedback: { hints: ["افحص بطاقة «شبكة محلية».", "ثلاثة أحرف تبدأ بـ L."], correctFeedback: "أحسنت — الشبكة المحلية هي LAN.", incorrectFeedback: "افحص بطاقة «شبكة محلية»: الاختصار المكتوب بجانبها.", explanation: "PAN لأجهزة قريبة جدًا، LAN داخل بيت أو مدرسة، WAN بين مدن أو دول." },
              },
            },
            {
              id: "m01-l02-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي نوع من الشبكات يربط بين مدن أو دول، وأكبر مثال عليه هو الإنترنت؟",
                options: [
                  opt("m01-l02-p01-q2-a", "PAN — شبكة شخصية"),
                  opt("m01-l02-p01-q2-b", "LAN — شبكة محلية"),
                  opt("m01-l02-p01-q2-c", "WAN — شبكة واسعة", true),
                ],
                feedback: { hints: ["افحص بطاقة «شبكة واسعة».", "الفرق بين الأنواع هو الحجم والمسافة."], correctFeedback: "أحسنت — الإنترنت أكبر مثال على WAN.", incorrectFeedback: "افحص البطاقات: «بين مدن أو دول، وأكبر مثال هو الإنترنت».", explanation: "الفرق الأساسي بين الأنواع هو حجم الشبكة والمسافة بين الأجهزة." },
              },
            },
          ],
        },
        // PDF 12 — احتياجات بناء شبكة (+ a "حل مع المعلم" guided reveal)
        {
          id: "791381-m01-l02-p02",
          title: "احتياجات بناء شبكة",
          order: 2,
          source: src(12, 10),
          blocks: [
            {
              id: "m01-l02-p02-needs", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m01-l02-p02-n1", term: "بنية تحتية", text: [{ text: "راوتر، سويتش، كابلات أو " }, { text: "Wi-Fi", dir: "ltr", style: "code" }, { text: "، واتصال إنترنت." }] },
                { id: "m01-l02-p02-n2", term: "عناوين IP", text: [{ text: "كل جهاز يحتاج رقمًا خاصًا ليتواصل مع غيره." }] },
                { id: "m01-l02-p02-n3", term: "بروتوكول اتصال", text: [{ text: "لغة متّفق عليها لتبادل البيانات مثل " }, { text: "TCP/IP", dir: "ltr", style: "code" }, { text: "." }] },
              ],
            },
            {
              id: "m01-l02-p02-base", type: "callout", origin: "book", kind: "summary", title: "الأساس",
              spans: [{ text: "هذه الأشياء هي بداية أي شبكة: أجهزة تربط، عناوين تميّز، وبروتوكول ينظّم الاتصال." }],
            },
            {
              id: "m01-l02-p02-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [{ text: "الشبكة ليست كابلات فقط؛ تحتاج أيضًا إعدادات وأمان وخدمات." }],
            },
            {
              // ENRICHMENT: SVG for the three foundations that build a network (complements the guided reveal below).
              id: "m01-l02-p02-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/ch1/network-building-blocks", motion: true,
              source: src(12, 10),
              title: "مخطط: أسس بناء الشبكة",
              alt: "مخطط يبيّن ثلاثة أسس تحمل شبكة تعمل: البنية التحتية وعناوين IP وبروتوكول الاتصال.",
              caption: "ثلاثة أسس تحمل شبكة تعمل: بنية تحتية، وعناوين IP، وبروتوكول اتصال.",
            },
            {
              // ENRICHMENT: teacher-led "حل مع المعلم" reveal of the three fundamentals. Built-in guided/reveal/v1.
              id: "m01-l02-p02-guided", type: "guided", origin: "teacher-enrichment",
              guidedType: "reveal", version: 1, title: "ما الذي نحتاجه لبناء شبكة؟",
              source: src(12, 10),
              capabilities: { fullscreen: true, reset: true },
              prompt: [{ text: "قبل أن نكشف الإجابة: ما المكوّنات الأساسية التي نحتاجها لبناء شبكة؟ فكّر ثم اكشف الخطوات." }],
              steps: [
                { id: "m01-l02-p02-g1", text: [{ text: "بنية تحتية: راوتر، سويتش، كابلات أو " }, { text: "Wi-Fi", dir: "ltr", style: "code" }, { text: "، واتصال إنترنت." }] },
                { id: "m01-l02-p02-g2", text: [{ text: "عناوين " }, { text: "IP", dir: "ltr", style: "code" }, { text: ": كل جهاز يحتاج رقمًا خاصًا ليتواصل مع غيره." }] },
                { id: "m01-l02-p02-g3", text: [{ text: "بروتوكول اتصال: لغة متّفق عليها لتبادل البيانات مثل " }, { text: "TCP/IP", dir: "ltr", style: "code" }, { text: "." }] },
              ],
              explanation: "أجهزة تربط، عناوين تميّز، وبروتوكول ينظّم الاتصال.",
            },
            {
              id: "m01-l02-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما البروتوكول الذي يذكره الكتاب مثالًا على «لغة الاتصال المتّفق عليها» لتبادل البيانات؟",
                options: [
                  opt("m01-l02-p02-q1-a", "TCP/IP", true),
                  opt("m01-l02-p02-q1-b", "Wi-Fi"),
                  opt("m01-l02-p02-q1-c", "ping"),
                ],
                feedback: { hints: ["افحص بطاقة «بروتوكول اتصال».", "اسم يجمع حرفين بشرطة مائلة."], correctFeedback: "أحسنت — TCP/IP هو مثال الكتاب على بروتوكول الاتصال.", incorrectFeedback: "افحص بطاقة «بروتوكول اتصال»: المثال المذكور فيها.", explanation: "الشبكة تحتاج بنية تحتية وعناوين IP وبروتوكول اتصال." },
              },
            },
            {
              id: "m01-l02-p02-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "كل جهاز في الشبكة يحتاج عنوان IP خاصًا به ليتواصل مع غيره.", answer: true,
                feedback: { hints: ["افحص بطاقة «عناوين IP»."], correctFeedback: "أحسنت — لكل جهاز رقم خاص يميّزه.", incorrectFeedback: "افحص بطاقة «عناوين IP»: «كل جهاز يحتاج رقمًا خاصًا».", explanation: "أجهزة تربط، عناوين تميّز، وبروتوكول ينظّم الاتصال." },
              },
            },
          ],
        },
        // PDF 13 — إدارة الشبكة وصيانتها
        {
          id: "791381-m01-l02-p03",
          title: "إدارة الشبكة وصيانتها",
          order: 3,
          source: src(13, 11),
          blocks: [
            {
              id: "m01-l02-p03-areas", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m01-l02-p03-a1", term: "التكوين والإدارة", text: [{ text: "ضبط الأجهزة وكلمات المرور." }] },
                { id: "m01-l02-p03-a2", term: "أمان الشبكة", text: [{ text: "حماية الشبكة من الدخول غير المصرّح." }] },
                { id: "m01-l02-p03-a3", term: "خدمات الشبكة", text: [{ text: "ملفات وطابعات وبريد إلكتروني." }] },
                { id: "m01-l02-p03-a4", term: "الاختبار والصيانة", text: [{ text: "فحص الاتصال وحل الأعطال." }] },
              ],
            },
            {
              id: "m01-l02-p03-ex", type: "callout", origin: "book", kind: "tip", title: "مثال سريع",
              spans: [
                { text: "بعد بناء الشبكة نفحصها بأوامر مثل " },
                { text: "ping", dir: "ltr", style: "code" },
                { text: " و " },
                { text: "ipconfig", dir: "ltr", style: "code" },
                { text: " للتأكد أن الأجهزة تتواصل بشكل صحيح." },
              ],
            },
            {
              // ENRICHMENT: SVG cycle of the four ongoing network-management areas.
              id: "m01-l02-p03-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/ch1/network-management-cycle", motion: true,
              source: src(13, 11),
              title: "مخطط: دورة إدارة الشبكة",
              alt: "مخطط دائري يبيّن مجالات إدارة الشبكة الأربعة: التكوين والأمان والخدمات والصيانة.",
              caption: "الإدارة والصيانة عملية مستمرة تدور بين أربعة مجالات.",
            },
            {
              id: "m01-l02-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "فحص الاتصال وحل الأعطال يقع ضمن أي مجال من مجالات إدارة الشبكة؟",
                options: [
                  opt("m01-l02-p03-q1-a", "التكوين والإدارة"),
                  opt("m01-l02-p03-q1-b", "أمان الشبكة"),
                  opt("m01-l02-p03-q1-c", "الاختبار والصيانة", true),
                ],
                feedback: { hints: ["افحص البطاقات الأربع في الصفحة.", "الفحص وحل الأعطال …"], correctFeedback: "أحسنت — الاختبار والصيانة هو مجال فحص الاتصال وحل الأعطال.", incorrectFeedback: "افحص بطاقة «الاختبار والصيانة».", explanation: "إدارة الشبكة عملية مستمرة تدور بين التكوين والأمان والخدمات والصيانة." },
              },
            },
            {
              id: "m01-l02-p03-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "اكتب اسم الأمر الأول الذي يذكره الكتاب لفحص الاتصال بين الأجهزة بعد بناء الشبكة.", answer: "ping",
                feedback: { hints: ["افحص صندوق «مثال سريع».", "أمر قصير من أربعة أحرف."], correctFeedback: "أحسنت — ping يفحص أن الأجهزة تتواصل.", incorrectFeedback: "افحص صندوق «مثال سريع»: الأمر الأول المذكور فيه.", explanation: "بعد بناء الشبكة نفحصها بأوامر مثل ping و ipconfig." },
              },
            },
          ],
        },
      ],
    },
  ],
};

export default m01;
