// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 1 «أساسيات الشبكات».
//
// Verbatim conversion of booklet PDF pages 4–6 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every converted block is origin:"book": nothing is added, removed or reworded; bold runs are `strong`, monospace
// runs are `code`, printed box labels are the callout titles. The drawing above the PAN/LAN/WAN cards is a crop of the
// booklet itself.
//
// Enrichment (docs/enterprise-791381s-enrichment-plan.md, Phases 2–4): teacher-enrichment blocks (visuals / activities reused from
// course 791381 after checking their labels against this section, and the end-of-unit «تدريبات الوحدة» lesson) are ADDED after the
// book blocks they explain. The book blocks above stay verbatim — pinned by the book lock (bookLock.test.ts).

import type { ContentModule, ContentSource } from "../../types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };

const m01: ContentModule = {
  id: "791381s-m01",
  title: "أساسيات الشبكات",
  order: 1,
  lessons: [
    {
      id: "791381s-m01-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m01-l00-p01",
          title: "أساسيات الشبكات",
          order: 1,
          layout: "opener",
          source: src(4),
          blocks: [
            {
              id: "m01-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الدفعة الأولى · الوحدة الأولى · كتاب ص 7–13", unitNumber: "01", title: "أساسيات الشبكات",
              subtitle: "ما هي الشبكة؟ لماذا نحتاجها؟ وما أنواعها؟",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m01-l01",
      title: "أساسيات الشبكات",
      order: 1,
      pages: [
        {
          id: "791381s-m01-l01-p01",
          title: "ما هي الشبكة؟",
          order: 1,
          source: src(4),
          blocks: [
            {
              id: "m01-l01-p01-def", type: "text", origin: "book",
              spans: [{ text: "الشبكة = مجموعة أجهزة متصلة مع بعضها، حتى تتبادل المعلومات والملفات وتصل إلى الإنترنت.", style: "strong" }],
            },
            {
              // ENRICHMENT: SVG — a network IS connected devices exchanging information (the definition above).
              id: "m01-l01-p01-v-devices", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/ch1/network-connected-devices", motion: true,
              source: src(4),
              title: "رسم توضيحي: الشبكة أجهزة متصلة",
              alt: "رسم يبيّن أربعة أجهزة (حاسوب، هاتف، طابعة، لوحي) متصلة بشبكة واحدة في الوسط، وتتنقّل البيانات بينها.",
              caption: "الأجهزة المتصلة بنفس الشبكة تتبادل المعلومات والملفات.",
            },
            {
              id: "m01-l01-p01-eg", type: "text", origin: "book",
              spans: [{ text: "مثلًا: عندما ترسل صورة من هاتفك إلى حاسوبك في البيت، فهي تنتقل عبر الشبكة. الجهازان يتواصلان لأنهما متصلان بنفس الشبكة." }],
            },
            {
              id: "m01-l01-p01-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m01-l01-p01-c1", term: "شبكة البيت", text: [{ text: "الهاتف والحاسوب متصلان معًا بالواي فاي." }] },
                { id: "m01-l01-p01-c2", term: "شبكة المدرسة", text: [{ text: "حواسيب الصفوف متصلة مع بعضها." }] },
              ],
            },
            {
              id: "m01-l01-p01-close", type: "text", origin: "book",
              spans: [
                { text: "بدون شبكة لا تستطيع الأجهزة أن تتواصل بسهولة. " },
                { text: "الشبكة هي التي تجعل الأجهزة تعمل معًا.", style: "strong" },
              ],
            },
          ],
        },
        {
          id: "791381s-m01-l01-p02",
          title: "لماذا نحتاج الشبكة؟ (الاستخدامات والحسنات)",
          order: 2,
          source: src(4, 5),
          blocks: [
            {
              id: "m01-l01-p02-intro", type: "text", origin: "book",
              spans: [{ text: "الشبكة توفّر الوقت والمال: بدل أن يعمل كل جهاز وحده، تعمل الأجهزة معًا وتتشارك المعلومات والأجهزة." }],
            },
            {
              id: "m01-l01-p02-uses", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m01-l01-p02-u1", text: [{ text: "ملفات:", style: "strong" }, { text: " مشاركة الملفات والصور بين الأجهزة." }] },
                { id: "m01-l01-p02-u2", text: [{ text: "إنترنت:", style: "strong" }, { text: " الدخول إلى المواقع ومصادر التعلّم." }] },
                { id: "m01-l01-p02-u3", text: [{ text: "تواصل:", style: "strong" }, { text: " بريد إلكتروني ورسائل ومحادثات." }] },
                { id: "m01-l01-p02-u4", text: [{ text: "تعاون:", style: "strong" }, { text: " عمل جماعي ودراسة عن بُعد." }] },
                { id: "m01-l01-p02-u5", text: [{ text: "مشاركة أجهزة:", style: "strong" }, { text: " مثل طابعة واحدة لعدة حواسيب." }] },
                { id: "m01-l01-p02-u6", text: [{ text: "سرعة:", style: "strong" }, { text: " تبادل المعلومات بسرعة بين الناس." }] },
              ],
            },
            {
              id: "m01-l01-p02-example", type: "callout", origin: "book", kind: "tip", title: "مثال",
              spans: [
                { text: "في غرفة الحاسوب في المدرسة توجد " },
                { text: "طابعة واحدة", style: "strong" },
                { text: ". كل الحواسيب تطبع عليها عن طريق الشبكة، بدل أن نشتري طابعة لكل حاسوب." },
              ],
            },
            {
              // ENRICHMENT: SVG for the booklet's own example — one printer shared by all the computers over the network.
              id: "m01-l01-p02-v-printer", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/ch1/shared-printer", motion: true,
              source: src(4, 5),
              title: "رسم توضيحي: طابعة واحدة لعدة حواسيب",
              alt: "رسم يبيّن ثلاثة حواسيب متصلة بطابعة واحدة، وتنتقل أوامر الطباعة من الحواسيب إلى الطابعة عبر الشبكة.",
              caption: "كل الحواسيب تطبع على طابعة واحدة عن طريق الشبكة، بدل طابعة لكل حاسوب.",
            },
          ],
        },
        {
          id: "791381s-m01-l01-p03",
          title: "أنواع الشبكات حسب الحجم",
          order: 3,
          source: src(5),
          blocks: [
            {
              id: "m01-l01-p03-intro", type: "text", origin: "book",
              spans: [{ text: "نقسم الشبكات حسب المساحة التي تغطيها: هل الأجهزة قريبة جدًا من بعضها؟ في نفس البناية؟ أم في مدن ودول مختلفة؟" }],
            },
            {
              id: "m01-l01-p03-drawing", type: "diagram", origin: "book",
              src: "/learning-assets/791381s/57609ca01baeaee3.png",
              alt: "ثلاث رسومات: هاتف يتصل بجهاز قريب لاسلكيًا مع عبارة «أمتار قليلة»؛ Switch يتصل بثلاثة حواسيب مع عبارة «بيت أو مدرسة»؛ سحابة تتصل بمبنيين مع عبارة «بين مدن أو دول».",
            },
            {
              id: "m01-l01-p03-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m01-l01-p03-c1", term: "PAN · شبكة شخصية", text: [{ text: "أجهزة قريبة جدًا. مثال: هاتف + سماعة بلوتوث." }] },
                { id: "m01-l01-p03-c2", term: "LAN · شبكة محلية", text: [{ text: "داخل بيت أو مدرسة أو بناية. مثال: غرفة الحاسوب." }] },
                { id: "m01-l01-p03-c3", term: "WAN · شبكة واسعة", text: [{ text: "بين مدن أو دول. أكبر مثال: " }, { text: "الإنترنت", style: "strong" }, { text: "." }] },
              ],
            },
            {
              // ENRICHMENT: interactive scope explorer PAN → LAN → WAN; every text in config is the booklet's own wording
              // (the drawing's labels and the three cards above). The booklet drawing above stays unchanged.
              id: "m01-l01-p03-scope", type: "interactive-diagram", origin: "teacher-enrichment",
              interactionType: "network-scope", version: 1,
              title: "استكشف أنواع الشبكات حسب الحجم", description: "اختر نوع الشبكة لترى كيف يكبر الحجم والمسافة.",
              source: src(5),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "PAN · شبكة شخصية: أمتار قليلة، مثل هاتف + سماعة بلوتوث. LAN · شبكة محلية: بيت أو مدرسة، مثل غرفة الحاسوب. WAN · شبكة واسعة: بين مدن أو دول، وأكبر مثال الإنترنت." },
              config: {
                scopes: [
                  { id: "pan", name: "PAN", title: "شبكة شخصية", distance: "أمتار قليلة", example: "أجهزة قريبة جدًا. مثال: هاتف + سماعة بلوتوث." },
                  { id: "lan", name: "LAN", title: "شبكة محلية", distance: "بيت أو مدرسة", example: "داخل بيت أو مدرسة أو بناية. مثال: غرفة الحاسوب." },
                  { id: "wan", name: "WAN", title: "شبكة واسعة", distance: "بين مدن أو دول", example: "بين مدن أو دول. أكبر مثال: الإنترنت." },
                ],
                note: "الفرق بين الأنواع هو الحجم والمسافة: PAN الأصغر ثم LAN ثم WAN الأكبر (العالم كله).",
              },
            },
            {
              id: "m01-l01-p03-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [
                { text: "الفرق بين الأنواع هو " },
                { text: "الحجم والمسافة", style: "strong" },
                { text: ": PAN الأصغر \u200F←\u200F LAN \u200F←\u200F WAN الأكبر (العالم كله)." },
              ],
            },
          ],
        },
        {
          id: "791381s-m01-l01-p04",
          title: "ماذا نحتاج لبناء شبكة؟",
          order: 4,
          source: src(5),
          blocks: [
            {
              id: "m01-l01-p04-intro", type: "text", origin: "book",
              spans: [{ text: "حتى تعمل أي شبكة نحتاج ثلاثة أشياء: أجهزة وكوابل تربط، عناوين تميّز كل جهاز، ولغة متّفق عليها للتفاهم." }],
            },
            {
              id: "m01-l01-p04-table", type: "table", origin: "book",
              headers: ["الشيء", "معناه"],
              rows: [
                ["1. بنية تحتية", "أجهزة وكوابل: راوتر، سويتش، كوابل أو واي فاي، واتصال إنترنت."],
                ["2. عناوين IP", "كل جهاز يحتاج رقمًا خاصًا به حتى يتواصل مع غيره."],
                ["3. بروتوكول اتصال", "لغة متّفق عليها لتبادل البيانات، مثل TCP/IP."],
              ],
            },
            {
              // ENRICHMENT: SVG — the three things a network needs, as three pillars carrying a working network.
              id: "m01-l01-p04-v-blocks", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/ch1/network-building-blocks", motion: true,
              source: src(5),
              title: "مخطط: ثلاثة أشياء لبناء شبكة",
              alt: "مخطط فيه ثلاثة أعمدة تحمل «شبكة تعمل»: بنية تحتية، عناوين IP، وبروتوكول TCP/IP.",
              caption: "حتى تعمل أي شبكة نحتاج: بنية تحتية، عناوين IP، وبروتوكول اتصال.",
            },
          ],
        },
        {
          id: "791381s-m01-l01-p05",
          title: "إدارة الشبكة وصيانتها",
          order: 5,
          source: src(6),
          blocks: [
            {
              id: "m01-l01-p05-intro", type: "text", origin: "book",
              spans: [{ text: "بناء الشبكة ليس النهاية: يجب أن نضبطها ونحميها ونفحصها دائمًا حتى تبقى تعمل بشكل صحيح." }],
            },
            {
              id: "m01-l01-p05-areas", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m01-l01-p05-a1", text: [{ text: "التكوين والإدارة:", style: "strong" }, { text: " ضبط الأجهزة وكلمات المرور." }] },
                { id: "m01-l01-p05-a2", text: [{ text: "أمان الشبكة:", style: "strong" }, { text: " حمايتها من الدخول غير المسموح." }] },
                { id: "m01-l01-p05-a3", text: [{ text: "خدمات الشبكة:", style: "strong" }, { text: " ملفات وطابعات وبريد إلكتروني." }] },
                { id: "m01-l01-p05-a4", text: [{ text: "الفحص والصيانة:", style: "strong" }, { text: " فحص الاتصال وحلّ الأعطال." }] },
              ],
            },
            {
              // ENRICHMENT: SVG — the four management areas as an ongoing cycle («بناء الشبكة ليس النهاية»).
              id: "m01-l01-p05-v-cycle", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/ch1/network-management-cycle", motion: true,
              source: src(6),
              title: "مخطط: إدارة الشبكة عمل مستمر",
              alt: "مخطط دائري حول عبارة «إدارة الشبكة» فيه أربعة مجالات: التكوين، الأمان، الخدمات، الصيانة.",
              caption: "نضبط الشبكة ونحميها ونفحصها دائمًا حتى تبقى تعمل بشكل صحيح.",
            },
            {
              id: "m01-l01-p05-example", type: "callout", origin: "book", kind: "tip", title: "مثال",
              spans: [
                { text: "بعد بناء الشبكة نفحصها بأوامر مثل " },
                { text: "ping", style: "code" },
                { text: " و " },
                { text: "ipconfig", style: "code" },
                { text: " لنتأكد أن الأجهزة تتواصل بشكل صحيح." },
              ],
            },
          ],
        },
      ],
    },
    {
      // «تدريبات الوحدة» — ADDED enrichment (owner decisions D2/D3/D6, docs/enterprise-791381s-enrichment-plan.md): an end-of-unit
      // exercise page after the booklet's own pages. Every question is answered by the section's printed text above (the
      // explanation quotes it); reveal mode shows the right answer and the explanation after each answer; study activities
      // count toward Strength. The book pages of this module are unchanged (book lock).
      id: "791381s-m01-l02",
      title: "تدريبات الوحدة",
      order: 2,
      pages: [
        {
          id: "791381s-m01-l02-p01",
          title: "تدريبات الوحدة: أساسيات الشبكات",
          order: 1,
          layout: "practice",
          source: src(4, 6),
          blocks: [
            {
              id: "m01-l02-p01-q01", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ما هي الشبكة؟",
                options: [{ id: "a", text: "مجموعة أجهزة متصلة مع بعضها، حتى تتبادل المعلومات والملفات وتصل إلى الإنترنت.", correct: true }, { id: "b", text: "جهاز واحد يعمل وحده بدون أي اتصال." }, { id: "c", text: "برنامج نستعمله لتصفّح المواقع فقط." }, { id: "d", text: "كابل واحد يربط الحاسوب بالطابعة." }],
                feedback: { explanation: "الشبكة = مجموعة أجهزة متصلة مع بعضها، حتى تتبادل المعلومات والملفات وتصل إلى الإنترنت." },
              },
            },
            {
              id: "m01-l02-p01-q02", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "بدون شبكة تستطيع الأجهزة أن تتواصل بسهولة.", answer: false, feedback: { explanation: "بدون شبكة لا تستطيع الأجهزة أن تتواصل بسهولة. الشبكة هي التي تجعل الأجهزة تعمل معًا." } },
            },
            {
              id: "m01-l02-p01-q03", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "في غرفة الحاسوب في المدرسة طابعة واحدة، وكل الحواسيب تطبع عليها عن طريق الشبكة. أيّ استخدام للشبكة هذا؟",
                options: [{ id: "a", text: "تواصل" }, { id: "b", text: "مشاركة أجهزة", correct: true }, { id: "c", text: "سرعة" }, { id: "d", text: "تعاون" }],
                feedback: { explanation: "مشاركة أجهزة: مثل طابعة واحدة لعدة حواسيب، بدل أن نشتري طابعة لكل حاسوب." },
              },
            },
            {
              id: "m01-l02-p01-q04", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "«بريد إلكتروني ورسائل ومحادثات» — أيّ استخدام للشبكة هذا؟",
                options: [{ id: "a", text: "ملفات" }, { id: "b", text: "إنترنت" }, { id: "c", text: "تواصل", correct: true }, { id: "d", text: "مشاركة أجهزة" }],
                feedback: { explanation: "تواصل: بريد إلكتروني ورسائل ومحادثات." },
              },
            },
            {
              id: "m01-l02-p01-q05", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "هاتف متصل بسماعة بلوتوث: ما نوع هذه الشبكة؟",
                options: [{ id: "a", text: "PAN · شبكة شخصية", correct: true }, { id: "b", text: "LAN · شبكة محلية" }, { id: "c", text: "WAN · شبكة واسعة" }],
                feedback: { explanation: "PAN · شبكة شخصية: أجهزة قريبة جدًا. مثال: هاتف + سماعة بلوتوث." },
              },
            },
            {
              id: "m01-l02-p01-q06", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ما أكبر مثال على الشبكة الواسعة WAN؟",
                options: [{ id: "a", text: "غرفة الحاسوب" }, { id: "b", text: "شبكة البيت" }, { id: "c", text: "هاتف + سماعة بلوتوث" }, { id: "d", text: "الإنترنت", correct: true }],
                feedback: { explanation: "WAN · شبكة واسعة: بين مدن أو دول. أكبر مثال: الإنترنت." },
              },
            },
            {
              id: "m01-l02-p01-q07", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ما الفرق بين أنواع الشبكات PAN و LAN و WAN؟",
                options: [{ id: "a", text: "نوع الكابل فقط" }, { id: "b", text: "الحجم والمسافة", correct: true }, { id: "c", text: "عدد الطابعات" }, { id: "d", text: "لون الأجهزة" }],
                feedback: { explanation: "الفرق بين الأنواع هو الحجم والمسافة: PAN الأصغر ← LAN ← WAN الأكبر (العالم كله)." },
              },
            },
            {
              id: "m01-l02-p01-q08", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "«لغة متّفق عليها لتبادل البيانات، مثل TCP/IP» — أيّ شيء نحتاجه لبناء الشبكة هذا؟",
                options: [{ id: "a", text: "بنية تحتية" }, { id: "b", text: "عناوين IP" }, { id: "c", text: "بروتوكول اتصال", correct: true }],
                feedback: { explanation: "بروتوكول اتصال: لغة متّفق عليها لتبادل البيانات، مثل TCP/IP." },
              },
            },
            {
              id: "m01-l02-p01-q09", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "بعد بناء الشبكة، بأيّ أوامر نفحصها لنتأكد أن الأجهزة تتواصل بشكل صحيح؟",
                options: [{ id: "a", text: "ping و ipconfig", correct: true }, { id: "b", text: "copy و paste" }, { id: "c", text: "save و open" }, { id: "d", text: "print و scan" }],
                feedback: { explanation: "بعد بناء الشبكة نفحصها بأوامر مثل ping و ipconfig لنتأكد أن الأجهزة تتواصل بشكل صحيح." },
              },
            },
            {
              id: "m01-l02-p01-q10", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "بناء الشبكة هو النهاية، ولا نحتاج إلى فحصها بعد ذلك.", answer: false, feedback: { explanation: "بناء الشبكة ليس النهاية: يجب أن نضبطها ونحميها ونفحصها دائمًا حتى تبقى تعمل بشكل صحيح." } },
            },
            {
              id: "m01-l02-p01-q11", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "wordBank", prompt: "أكمل الفراغات من مخزن الكلمات:",
                segments: ["الفرق بين أنواع الشبكات هو ", { blank: "b1" }, " و", { blank: "b2" }, ": ", { blank: "b3" }, " الأصغر \u200F←\u200F LAN \u200F←\u200F ", { blank: "b4" }, " الأكبر (العالم كله)."],
                bank: ["المسافة", "WAN", "السرعة", "الحجم", "PAN"],
                answers: { b1: "الحجم", b2: "المسافة", b3: "PAN", b4: "WAN" },
                feedback: { explanation: "الفرق بين الأنواع هو الحجم والمسافة: PAN الأصغر ‏←‏ LAN ‏←‏ WAN الأكبر (العالم كله)." },
              },
            },
            {
              id: "m01-l02-p01-q12", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "matching", prompt: "صِل كل نوع شبكة بوصفه:",
                left: [{ id: "pan", text: "PAN · شبكة شخصية" }, { id: "lan", text: "LAN · شبكة محلية" }, { id: "wan", text: "WAN · شبكة واسعة" }],
                right: [{ id: "r1", text: "بين مدن أو دول، وأكبر مثال: الإنترنت" }, { id: "r2", text: "أجهزة قريبة جدًا، مثل هاتف + سماعة بلوتوث" }, { id: "r3", text: "داخل بيت أو مدرسة أو بناية، مثل غرفة الحاسوب" }],
                pairs: { pan: "r2", lan: "r3", wan: "r1" },
                feedback: { explanation: "PAN: أجهزة قريبة جدًا (هاتف + سماعة بلوتوث). LAN: داخل بيت أو مدرسة أو بناية (غرفة الحاسوب). WAN: بين مدن أو دول، وأكبر مثال الإنترنت." },
              },
            },
            {
              id: "m01-l02-p01-q13", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "ordering", prompt: "رتّب أنواع الشبكات من الأصغر إلى الأكبر:",
                items: [{ id: "wan", text: "WAN · شبكة واسعة" }, { id: "pan", text: "PAN · شبكة شخصية" }, { id: "lan", text: "LAN · شبكة محلية" }],
                order: ["pan", "lan", "wan"],
                feedback: { explanation: "PAN الأصغر ‏←‏ LAN ‏←‏ WAN الأكبر (العالم كله): الفرق بين الأنواع هو الحجم والمسافة." },
              },
            },
            {
              id: "m01-l02-p01-q14", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "classify", prompt: "صنّف كل عبارة: هل هي من استخدامات الشبكة، أم من إدارة الشبكة وصيانتها؟",
                groups: [{ id: "use", text: "استخدامات الشبكة" }, { id: "admin", text: "إدارة الشبكة وصيانتها" }],
                items: [
                  { id: "i1", text: "مشاركة الملفات والصور بين الأجهزة" },
                  { id: "i2", text: "ضبط الأجهزة وكلمات المرور" },
                  { id: "i3", text: "بريد إلكتروني ورسائل ومحادثات" },
                  { id: "i4", text: "فحص الاتصال وحلّ الأعطال" },
                  { id: "i5", text: "طابعة واحدة لعدة حواسيب" },
                  { id: "i6", text: "حمايتها من الدخول غير المسموح" },
                ],
                assign: { i1: "use", i2: "admin", i3: "use", i4: "admin", i5: "use", i6: "admin" },
                feedback: { explanation: "الاستخدامات: ملفات، إنترنت، تواصل، تعاون، مشاركة أجهزة، سرعة. الإدارة والصيانة: التكوين والإدارة (ضبط الأجهزة وكلمات المرور)، أمان الشبكة، خدمات الشبكة، الفحص والصيانة (فحص الاتصال وحلّ الأعطال)." },
              },
            },
            { id: "m01-l02-p01-lib-t01", type: "library-training", origin: "teacher-enrichment", trainingId: "T01", label: "تدريب 1", requiredModuleId: "791381s-m01" },
          ],
        },
      ],
    },
  ],
};

export default m01;
