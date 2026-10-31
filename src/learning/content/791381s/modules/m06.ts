// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 6 «أنواع شبكات الاتصال (أشكال التوصيل)».
//
// Verbatim conversion of booklet PDF pages 21–23 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every converted block is origin:"book": nothing is added, removed or reworded; bold runs are `strong`, printed box
// labels are the callout titles. The drawings above the topology cards are crops of the booklet itself.
//
// Enrichment (docs/enterprise-791381s-enrichment-plan.md, Phases 2–4): teacher-enrichment blocks (visuals / activities reused from
// course 791381 after checking their labels against this section, and the end-of-unit «تدريبات الوحدة» lesson) are ADDED after the
// book blocks they explain. The book blocks above stay verbatim — pinned by the book lock (bookLock.test.ts).

import type { ContentModule, ContentSource } from "../../types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };

const m06: ContentModule = {
  id: "791381s-m06",
  title: "أنواع شبكات الاتصال (أشكال التوصيل)",
  order: 6,
  lessons: [
    {
      id: "791381s-m06-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m06-l00-p01",
          title: "أنواع شبكات الاتصال (أشكال التوصيل)",
          order: 1,
          layout: "opener",
          source: src(21),
          blocks: [
            {
              id: "m06-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الدفعة الثانية · الوحدة السادسة · كتاب ص 57–60", unitNumber: "06", title: "أنواع شبكات الاتصال (أشكال التوصيل)",
              subtitle: "الأشكال التي يمكن أن نرتّب بها الأجهزة داخل الشبكة.",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m06-l01",
      title: "أنواع شبكات الاتصال (أشكال التوصيل)",
      order: 1,
      pages: [
        {
          id: "791381s-m06-l01-p01",
          title: "الشبكات البسيطة",
          order: 1,
          source: src(21, 22),
          blocks: [
            {
              id: "m06-l01-p01-def", type: "text", origin: "book",
              spans: [{ text: "شكل التوصيل يحدّد طريقة انتقال البيانات بين الأجهزة داخل الشبكة.", style: "strong" }],
            },
            {
              id: "m06-l01-p01-intro", type: "text", origin: "book",
              spans: [{ text: "في هذه الأنواع تتصل الأجهزة ببعضها مباشرة، بدون جهاز مركزي في الوسط." }],
            },
            {
              id: "m06-l01-p01-drawing-p2p", type: "diagram", origin: "book",
              src: "/learning-assets/791381s/506674017300a3f1.png",
              alt: "حاسوبان بينهما سهم باتجاهين مكتوب فوقه «كابل مباشر» وتحته «لا يوجد جهاز وسيط».",
            },
            {
              id: "m06-l01-p01-v-p2p", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m10/p2p-direct", motion: true,
              source: src(21),
              title: "رسم توضيحي: P2P · نقطة لنقطة",
              alt: "رسم يبيّن جهازين (جهاز A وجهاز B) يربطهما خط مباشر واحد، والبيانات تنتقل بينهما مباشرة، ولا يوجد أي جهاز وسيط في الوسط.",
              caption: "جهازان يتواصلان مباشرة بدون جهاز وسيط.",
            },
            {
              id: "m06-l01-p01-drawing-mesh", type: "diagram", origin: "book",
              src: "/learning-assets/791381s/29f28090e9fd4a60.png",
              alt: "أربعة حواسيب، كل حاسوب متصل بخط بكل حاسوب آخر.",
            },
            {
              id: "m06-l01-p01-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m06-l01-p01-c1", term: "P2P · نقطة لنقطة", text: [{ text: "جهازان يتواصلان مباشرة بدون جهاز وسيط." }] },
                { id: "m06-l01-p01-c2", term: "Mesh · عقدة لعقدة", text: [{ text: "كل جهاز يتصل بكل جهاز آخر في الشبكة." }] },
              ],
            },
          ],
        },
        {
          id: "791381s-m06-l01-p02",
          title: "الشبكات السلكية التقليدية",
          order: 2,
          source: src(22),
          blocks: [
            {
              id: "m06-l01-p02-intro", type: "text", origin: "book",
              spans: [{ text: "هذه أشكال قديمة لم تعد تُستعمل كثيرًا اليوم، لكن يجب أن نعرفها ونعرف مشاكلها." }],
            },
            {
              id: "m06-l01-p02-drawing-bus", type: "diagram", origin: "book",
              src: "/learning-assets/791381s/d2896f1690043a67.png",
              alt: "أربعة حواسيب متصلة بخط واحد مشترك.",
            },
            {
              id: "m06-l01-p02-drawing-ring", type: "diagram", origin: "book",
              src: "/learning-assets/791381s/bfcba242a31d4986.png",
              alt: "أربعة حواسيب على شكل دائرة مغلقة، تربطها أسهم باتجاه واحد.",
            },
            {
              id: "m06-l01-p02-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m06-l01-p02-c1", term: "Bus · الخط المشترك", text: [{ text: "خط واحد مشترك بين كل الأجهزة. رخيص وسهل، لكن " }, { text: "التصادمات كثيرة", style: "strong" }, { text: "." }] },
                { id: "m06-l01-p02-c2", term: "Ring · الحلقة", text: [{ text: "الأجهزة على شكل دائرة مغلقة، والبيانات تسير باتجاه واحد." }] },
              ],
            },
            {
              id: "m06-l01-p02-bus-problem", type: "callout", origin: "book", kind: "summary", title: "مشكلة Bus",
              spans: [
                { text: "إذا أرسل أكثر من جهاز في نفس الوقت قد يحدث " },
                { text: "تصادم (Collision)", style: "strong" },
                { text: " للبيانات." },
              ],
            },
          ],
        },
        {
          id: "791381s-m06-l01-p03",
          title: "الشبكات الحديثة",
          order: 3,
          source: src(22, 23),
          blocks: [
            {
              id: "m06-l01-p03-intro", type: "text", origin: "book",
              spans: [{ text: "هذه الأشكال تستعمل جهازًا مركزيًا مثل السويتش. إذا تعطّل حاسوب واحد، تبقى باقي الأجهزة تعمل بشكل عادي." }],
            },
            {
              id: "m06-l01-p03-drawing", type: "diagram", origin: "book",
              src: "/learning-assets/791381s/ceb1b31fe9b1c0b3.png",
              alt: "ثلاث رسومات: أربعة حواسيب متصلة بجهاز في الوسط مكتوب عليه «Switch»؛ جهاز في الأعلى يتفرّع إلى جهازين، وكل منهما يتفرّع إلى حاسوبين؛ خط مشترك عليه جهازان، وكل جهاز متصل بحاسوبين.",
            },
            {
              id: "m06-l01-p03-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m06-l01-p03-c1", term: "Star · النجمة", text: [{ text: "كل الأجهزة تتصل بجهاز مركزي مثل Switch." }] },
                { id: "m06-l01-p03-c2", term: "Tree · الشجرة", text: [{ text: "شبكة على شكل مستويات (طبقات) فوق بعضها." }] },
                { id: "m06-l01-p03-c3", term: "Hybrid · المختلطة", text: [{ text: "دمج أكثر من نوع في شبكة واحدة (مثل Bus + Star)." }] },
              ],
            },
            {
              id: "m06-l01-p03-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [
                { text: "شكل " },
                { text: "النجمة Star", style: "strong" },
                { text: " هو الأكثر استعمالًا في المدارس والشركات." },
              ],
            },
            {
              // ENRICHMENT — interactive-diagram / network-topologies / v1: the six forms of this section that the renderer
              // draws (P2P, Bus, Ring, Star, Tree, Hybrid), after the book has introduced every one of them. Mesh has no
              // mode in this renderer, so it is not offered. Every name and description is this section's own card text.
              id: "m06-l01-p03-explorer", type: "interactive-diagram", origin: "teacher-enrichment",
              interactionType: "network-topologies", version: 1,
              title: "استكشف أشكال التوصيل",
              description: "اختر شكلًا لترى ترتيب الأجهزة، ثم اضغط «أرسل» لترى الطريق الذي تسلكه البيانات. في Bus جرّب إرسال جهازين معًا.",
              source: src(21, 23),
              capabilities: { fullscreen: true, reset: true, interactive: true, animated: true },
              fallback: { text: "P2P: جهازان يتواصلان مباشرة بدون جهاز وسيط. Bus: خط واحد مشترك بين كل الأجهزة، رخيص وسهل، لكن التصادمات كثيرة. Ring: الأجهزة على شكل دائرة مغلقة، والبيانات تسير باتجاه واحد. Star: كل الأجهزة تتصل بجهاز مركزي مثل Switch. Tree: شبكة على شكل مستويات (طبقات) فوق بعضها. Hybrid: دمج أكثر من نوع في شبكة واحدة (مثل Bus + Star)." },
              config: {
                topologies: [
                  { id: "p2p", name: "P2P", title: "نقطة لنقطة", description: "جهازان يتواصلان مباشرة بدون جهاز وسيط." },
                  { id: "bus", name: "Bus", title: "الخط المشترك", description: "خط واحد مشترك بين كل الأجهزة. رخيص وسهل، لكن التصادمات كثيرة." },
                  { id: "ring", name: "Ring", title: "الحلقة", description: "الأجهزة على شكل دائرة مغلقة، والبيانات تسير باتجاه واحد." },
                  { id: "star", name: "Star", title: "النجمة", description: "كل الأجهزة تتصل بجهاز مركزي مثل Switch." },
                  { id: "tree", name: "Tree", title: "الشجرة", description: "شبكة على شكل مستويات (طبقات) فوق بعضها." },
                  { id: "hybrid", name: "Hybrid", title: "المختلطة", description: "دمج أكثر من نوع في شبكة واحدة (مثل Bus + Star)." },
                ],
                centerLabel: "Switch",
                collisionLabel: "تصادم Collision",
                collisionNote: "إذا أرسل أكثر من جهاز في نفس الوقت قد يحدث تصادم (Collision) للبيانات.",
              },
            },
          ],
        },
      ],
    },
    {
      // «تدريبات الوحدة» — ADDED enrichment: an end-of-unit exercise page after the booklet's own pages. Every question is
      // answered by the section's printed text above (the explanation quotes it). The book pages are unchanged (book lock).
      id: "791381s-m06-l02",
      title: "تدريبات الوحدة",
      order: 2,
      pages: [
        {
          id: "791381s-m06-l02-p01",
          title: "تدريبات الوحدة: أنواع شبكات الاتصال (أشكال التوصيل)",
          order: 1,
          layout: "practice",
          source: src(21, 23),
          blocks: [
            {
              id: "m06-l02-p01-q01", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ماذا يحدّد شكل التوصيل في الشبكة؟",
                options: [{ id: "a", text: "سرعة الإنترنت في البيت" }, { id: "b", text: "طريقة انتقال البيانات بين الأجهزة داخل الشبكة", correct: true }, { id: "c", text: "عدد البرامج في كل حاسوب" }, { id: "d", text: "لون الكوابل" }],
                feedback: { explanation: "شكل التوصيل يحدّد طريقة انتقال البيانات بين الأجهزة داخل الشبكة." },
              },
            },
            {
              id: "m06-l02-p01-q02", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "في شبكة P2P (نقطة لنقطة) يوجد جهاز وسيط بين الجهازين.", answer: false, feedback: { explanation: "P2P · نقطة لنقطة: جهازان يتواصلان مباشرة بدون جهاز وسيط." } },
            },
            {
              id: "m06-l02-p01-q03", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "في أيّ شكل يتصل كل جهاز بكل جهاز آخر في الشبكة؟",
                options: [{ id: "a", text: "P2P" }, { id: "b", text: "Star" }, { id: "c", text: "Mesh", correct: true }, { id: "d", text: "Bus" }],
                feedback: { explanation: "Mesh · عقدة لعقدة: كل جهاز يتصل بكل جهاز آخر في الشبكة." },
              },
            },
            {
              id: "m06-l02-p01-q04", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "أيّ شكل تكون فيه الأجهزة على شكل دائرة مغلقة، والبيانات تسير باتجاه واحد؟",
                options: [{ id: "a", text: "Bus" }, { id: "b", text: "Tree" }, { id: "c", text: "Star" }, { id: "d", text: "Ring", correct: true }],
                feedback: { explanation: "Ring · الحلقة: الأجهزة على شكل دائرة مغلقة، والبيانات تسير باتجاه واحد." },
              },
            },
            {
              id: "m06-l02-p01-q05", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "في شكل Bus، إذا أرسل أكثر من جهاز في نفس الوقت قد يحدث تصادم (Collision) للبيانات.", answer: true, feedback: { explanation: "مشكلة Bus: إذا أرسل أكثر من جهاز في نفس الوقت قد يحدث تصادم (Collision) للبيانات." } },
            },
            {
              id: "m06-l02-p01-q06", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "في الشبكات الحديثة (التي تستعمل جهازًا مركزيًا مثل السويتش)، إذا تعطّل حاسوب واحد تتوقّف كل الشبكة.", answer: false, feedback: { explanation: "هذه الأشكال تستعمل جهازًا مركزيًا مثل السويتش. إذا تعطّل حاسوب واحد، تبقى باقي الأجهزة تعمل بشكل عادي." } },
            },
            {
              id: "m06-l02-p01-q07", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ما الشكل الأكثر استعمالًا في المدارس والشركات؟",
                options: [{ id: "a", text: "Star · النجمة", correct: true }, { id: "b", text: "Bus · الخط المشترك" }, { id: "c", text: "Ring · الحلقة" }, { id: "d", text: "Mesh · عقدة لعقدة" }],
                feedback: { explanation: "شكل النجمة Star هو الأكثر استعمالًا في المدارس والشركات." },
              },
            },
            {
              id: "m06-l02-p01-q08", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "شبكة تدمج أكثر من نوع في شبكة واحدة (مثل Bus + Star). ما شكلها؟",
                options: [{ id: "a", text: "Tree" }, { id: "b", text: "Hybrid", correct: true }, { id: "c", text: "P2P" }],
                feedback: { explanation: "Hybrid · المختلطة: دمج أكثر من نوع في شبكة واحدة (مثل Bus + Star)." },
              },
            },
            {
              id: "m06-l02-p01-q09", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "wordBank", prompt: "أكمل وصف شكل Bus من مخزن الكلمات:",
                segments: ["Bus: خط واحد ", { blank: "b1" }, " بين كل الأجهزة. ", { blank: "b2" }, " وسهل، لكن ", { blank: "b3" }, " كثيرة."],
                bank: ["مشترك", "رخيص", "التصادمات", "مركزي", "غالٍ"],
                answers: { b1: "مشترك", b2: "رخيص", b3: "التصادمات" },
                feedback: { explanation: "Bus · الخط المشترك: خط واحد مشترك بين كل الأجهزة. رخيص وسهل، لكن التصادمات كثيرة." },
              },
            },
            {
              id: "m06-l02-p01-q10", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "matching", prompt: "صِل كل شكل بوصفه:",
                left: [{ id: "star", text: "Star · النجمة" }, { id: "tree", text: "Tree · الشجرة" }, { id: "p2p", text: "P2P · نقطة لنقطة" }, { id: "ring", text: "Ring · الحلقة" }],
                right: [
                  { id: "r1", text: "جهازان يتواصلان مباشرة بدون جهاز وسيط." },
                  { id: "r2", text: "شبكة على شكل مستويات (طبقات) فوق بعضها." },
                  { id: "r3", text: "الأجهزة على شكل دائرة مغلقة، والبيانات تسير باتجاه واحد." },
                  { id: "r4", text: "كل الأجهزة تتصل بجهاز مركزي مثل Switch." },
                ],
                pairs: { star: "r4", tree: "r2", p2p: "r1", ring: "r3" },
                feedback: { explanation: "Star: جهاز مركزي مثل Switch. Tree: مستويات (طبقات) فوق بعضها. P2P: جهازان مباشرة بدون جهاز وسيط. Ring: دائرة مغلقة والبيانات باتجاه واحد." },
              },
            },
            {
              id: "m06-l02-p01-q11", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "classify", prompt: "صنّف كل شكل توصيل إلى مجموعته في الوحدة:",
                groups: [{ id: "simple", text: "الشبكات البسيطة" }, { id: "classic", text: "الشبكات السلكية التقليدية" }, { id: "modern", text: "الشبكات الحديثة" }],
                items: [
                  { id: "i1", text: "Star" },
                  { id: "i2", text: "P2P" },
                  { id: "i3", text: "Ring" },
                  { id: "i4", text: "Tree" },
                  { id: "i5", text: "Mesh" },
                  { id: "i6", text: "Bus" },
                  { id: "i7", text: "Hybrid" },
                ],
                assign: { i1: "modern", i2: "simple", i3: "classic", i4: "modern", i5: "simple", i6: "classic", i7: "modern" },
                feedback: { explanation: "الشبكات البسيطة (اتصال مباشر بدون جهاز مركزي): P2P و Mesh. الشبكات السلكية التقليدية: Bus و Ring. الشبكات الحديثة (جهاز مركزي مثل السويتش): Star و Tree و Hybrid." },
              },
            },
            { id: "m06-l02-p01-lib-t07", type: "library-training", origin: "teacher-enrichment", trainingId: "T07", label: "تدريب 7", requiredModuleId: "791381s-m06" },
          ],
        },
      ],
    },
  ],
};

export default m06;
