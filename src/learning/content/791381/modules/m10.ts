// Learning Materials — Units 4–6 phase: REAL converted body for Book 791381, module m10 (the book's Unit 6
// «أنواع شبكات الاتصال», source PDF 57–60, complete). Stable id m10 (next free), order 6 (batch b2).
// HARD STOP: PDF 61 opens Unit 7 («الكوابل وعنوان MAC») and is NOT converted.
//
// Book-derived cards, figure captions and callouts are origin:"book" as rendered; topology names (P2P, Bus, Ring,
// Star, Tree, Hybrid, Switch, Collision) are LTR tokens. Pedagogy (a worked Bus-collision example, the topology
// explorer, a matching worksheet, inline practices with «what to check» feedback) is origin:"teacher-enrichment".
// Printed page = the rendered page circle (PDF 58 → «58», 59 → «59», 60 → «60»); the opener prints none.

import type { ContentModule, ContentSource, InlineSpan, PracticeOption, PracticeTableSelectCell } from "../../types";

const CID = "791381";
const src = (pdf: number, printed?: number): ContentSource => ({ kind: "book", sourceId: CID, pdfPageStart: pdf, printedPage: printed });
const L = (text: string): InlineSpan => ({ text, dir: "ltr", style: "code" });
const T = (text: string): InlineSpan => ({ text });
const opt = (id: string, text: string, correct?: true): PracticeOption => (correct ? { id, text, correct } : { id, text });
const TOPOS = ["P2P", "Bus", "Ring", "Star", "Tree", "Hybrid"] as const;
const TOPO = (key: (typeof TOPOS)[number]): PracticeTableSelectCell => ({ kind: "select", options: [...TOPOS], key });

const m10: ContentModule = {
  id: "791381-m10",
  title: "أنواع شبكات الاتصال",
  shortTitle: "أنواع الشبكات",
  order: 6,
  source: { kind: "book", sourceId: CID, pdfPageStart: 57, pdfPageEnd: 60 },
  lessons: [
    // ── l00 — unit opener (PDF 57) ───────────────────────────────────────────────────────────────────────────
    {
      id: "791381-m10-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381-m10-l00-p01",
          title: "أنواع شبكات الاتصال",
          order: 1,
          layout: "opener",
          source: src(57),
          blocks: [
            {
              id: "m10-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الوحدة السادسة", unitNumber: "06", title: "أنواع شبكات الاتصال",
              subtitle: "الأشكال التي يمكن أن تُرتّب بها الأجهزة داخل الشبكة.",
              goal: "الهدف: فكرة أساسية + مثال واضح + تدريب",
            },
          ],
        },
      ],
    },

    // ── l01 — simple and traditional wired forms (PDF 58–59) ─────────────────────────────────────────────────
    {
      id: "791381-m10-l01",
      title: "الشبكات البسيطة والتقليدية",
      order: 1,
      pages: [
        // PDF 58 — أنواع الشبكات البسيطة
        {
          id: "791381-m10-l01-p01",
          title: "أنواع الشبكات البسيطة",
          order: 1,
          source: src(58, 58),
          keywords: ["P2P", "نقطة لنقطة", "عقدة لعقدة"],
          blocks: [
            {
              id: "m10-l01-p01-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m10-l01-p01-p2p", term: "نقطة لنقطة P2P", text: [T("جهازان يتواصلان مباشرة بدون جهاز وسيط.")], note: "جهاز 1 ↔ جهاز 2: كابل مباشر، لا يوجد جهاز وسيط بينهما" },
                { id: "m10-l01-p01-n2n", term: "عقدة لعقدة", text: [T("كل جهاز يمكنه التواصل مع جهاز آخر داخل الشبكة.")], note: "كل جهاز يستطيع الوصول إلى الآخر" },
              ],
            },
            {
              id: "m10-l01-p01-idea", type: "callout", origin: "book", kind: "important", title: "الفكرة الأساسية",
              spans: [T("شكل التوصيل يحدّد طريقة انتقال البيانات بين الأجهزة داخل الشبكة.")],
            },
            {
              id: "m10-l01-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "في شبكة نقطة لنقطة (P2P) يوجد جهاز وسيط بين الجهازين.",
                answer: false,
                feedback: {
                  correctFeedback: "صحيح أنها خطأ — في P2P يتواصل الجهازان مباشرة بكابل، بلا جهاز وسيط.",
                  incorrectFeedback: "افحص بطاقة P2P في الصفحة: «بدون جهاز وسيط» — الكابل مباشر بين الجهازين.",
                  hints: ["ماذا يوجد بين الجهازين في الرسم؟", "كابل مباشر فقط."],
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 3): SVG visual enrichment appended after the book content.
              id: "m10-l01-p01-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m10/p2p-direct", motion: true,
              source: src(58),
              title: "مخطط: الاتصال المباشر P2P",
              alt: "مخطط يبيّن جهازين متّصلين مباشرة نقطة إلى نقطة بلا جهاز وسيط بينهما، مع رسالة تنتقل بينهما مباشرة.",
              caption: "‏P2P: تواصل مباشر بين جهازين بلا وسيط.",
            },
          ],
        },
        // PDF 59 — الشبكات السلكية التقليدية
        {
          id: "791381-m10-l01-p02",
          title: "الشبكات السلكية التقليدية",
          order: 2,
          source: src(59, 59),
          keywords: ["Bus", "Ring", "Collision", "تصادم"],
          blocks: [
            {
              id: "m10-l01-p02-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m10-l01-p02-bus", term: "Bus", text: [T("خط واحد مشترك بين الأجهزة. رخيص وسهل، لكن الاصطدامات كثيرة.")], note: "خط واحد مشترك بين كل الأجهزة" },
                { id: "m10-l01-p02-ring", term: "Ring", text: [T("الأجهزة على شكل دائرة مغلقة، والبيانات تسير باتجاه محدّد.")], note: "دائرة مغلقة والبيانات باتجاه واحد" },
              ],
            },
            {
              id: "m10-l01-p02-problem", type: "callout", origin: "book", kind: "warning", title: "مشكلة Bus",
              spans: [T("إذا أرسل أكثر من جهاز في نفس الوقت قد يحدث تصادم ("), L("Collision"), T(") للبيانات.")],
            },
            {
              id: "m10-l01-p02-ex1", type: "example", origin: "teacher-enrichment", mode: "solved",
              title: "مثال محلول: لماذا تكثر الاصطدامات في Bus؟",
              steps: [
                { text: "في Bus كل الأجهزة تشترك في خط واحد." },
                { text: "إذا أرسل جهازان في اللحظة نفسها، تلتقي بياناتهما على الخط نفسه." },
                { text: "هذا الالتقاء هو التصادم (Collision)، فتتلف البيانات ويُعاد الإرسال." },
              ],
              result: "Bus = خط واحد → تصادم",
              explanation: "في Ring تسير البيانات باتجاه واحد على الدائرة، وفي Star لكل جهاز طريق خاص إلى الجهاز المركزي، فتقلّ الاصطدامات.",
            },
            {
              id: "m10-l01-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي شكل تسير فيه البيانات في دائرة مغلقة باتجاه محدّد؟",
                options: [opt("m10-l01-p02-q1-a", "Bus"), opt("m10-l01-p02-q1-b", "Ring", true), opt("m10-l01-p02-q1-c", "Star")],
                feedback: {
                  hints: ["أي بطاقة تذكر «دائرة مغلقة»؟", "Ring = حلقة = دائرة."],
                  correctFeedback: "أحسنت — Ring دائرة مغلقة والبيانات باتجاه واحد.",
                  incorrectFeedback: "افحص وصف كل شكل: «خط واحد مشترك» هو Bus، أما «دائرة مغلقة» فهو شكل آخر.",
                  explanation: "Ring: الأجهزة على دائرة مغلقة وتسير البيانات باتجاه محدّد.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 3): SVG visual enrichment appended after the book content.
              id: "m10-l01-p02-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m10/bus-collision", motion: true,
              source: src(59),
              title: "مخطط: التصادم في شبكة Bus",
              alt: "مخطط يبيّن جهازين على خط واحد مشترك يرسلان في اللحظة نفسها فتلتقي بياناتهما ويقع تصادم.",
              caption: "إرسالان في اللحظة نفسها على الخط المشترك ⇐ تصادم فتتلف البيانات.",
            },
          ],
        },
      ],
    },

    // ── l02 — modern forms + the topology explorer (PDF 60) ──────────────────────────────────────────────────
    {
      id: "791381-m10-l02",
      title: "الشبكات الحديثة",
      order: 2,
      pages: [
        {
          id: "791381-m10-l02-p01",
          title: "الشبكات الحديثة",
          order: 1,
          source: src(60, 60),
          keywords: ["Star", "Tree", "Hybrid", "Switch", "الشكل النجمي"],
          blocks: [
            {
              id: "m10-l02-p01-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m10-l02-p01-star", term: "Star", text: [T("كل الأجهزة تتصل بجهاز مركزي مثل "), L("Switch"), T(".")], note: "الكل يتصل بجهاز مركزي واحد" },
                { id: "m10-l02-p01-tree", term: "Tree", text: [T("شبكة على شكل مستويات أو طبقات.")], note: "مستويات فوق بعضها" },
                { id: "m10-l02-p01-hybrid", term: "Hybrid", text: [T("دمج أكثر من نوع في شبكة واحدة.")], note: "Star + Bus في شبكة واحدة" },
              ],
            },
            {
              id: "m10-l02-p01-most", type: "callout", origin: "book", kind: "important", title: "الأكثر استعمالًا",
              spans: [T("الشكل النجمي "), L("Star"), T(" هو الأكثر استعمالًا في المدارس والشركات.")],
            },
            {
              // ENRICHMENT — interactive-diagram / network-topologies / v1: all six forms of PDF 58–60, after the
              // book has introduced every one of them (book order preserved).
              id: "m10-l02-p01-explorer", type: "interactive-diagram", origin: "teacher-enrichment",
              interactionType: "network-topologies", version: 1,
              title: "استكشف أشكال الشبكات",
              description: "اختر شكلًا لترى ترتيب الأجهزة، ثم اضغط «أرسل» لترى الطريق الذي تسلكه البيانات. في Bus جرّب إرسال جهازين معًا.",
              source: src(60, 60),
              capabilities: { fullscreen: true, reset: true, interactive: true, animated: true },
              fallback: { text: "P2P: جهازان بكابل مباشر. Bus: خط واحد مشترك بين كل الأجهزة (قد يحدث تصادم). Ring: دائرة مغلقة والبيانات باتجاه واحد. Star: كل الأجهزة تتصل بجهاز مركزي مثل Switch. Tree: مستويات فوق بعضها. Hybrid: دمج أكثر من نوع مثل Star + Bus في شبكة واحدة." },
              config: {
                topologies: [
                  { id: "p2p", name: "P2P", title: "نقطة لنقطة", description: "جهازان يتواصلان مباشرة بدون جهاز وسيط." },
                  { id: "bus", name: "Bus", title: "الناقل المشترك", description: "خط واحد مشترك بين الأجهزة. رخيص وسهل، لكن الاصطدامات كثيرة." },
                  { id: "ring", name: "Ring", title: "الحلقة", description: "الأجهزة على شكل دائرة مغلقة، والبيانات تسير باتجاه محدّد." },
                  { id: "star", name: "Star", title: "النجمي", description: "كل الأجهزة تتصل بجهاز مركزي مثل Switch." },
                  { id: "tree", name: "Tree", title: "الشجري", description: "شبكة على شكل مستويات أو طبقات." },
                  { id: "hybrid", name: "Hybrid", title: "المختلط", description: "دمج أكثر من نوع في شبكة واحدة (Star + Bus)." },
                ],
                centerLabel: "Switch",
                collisionLabel: "تصادم Collision",
                collisionNote: "أرسل جهازان في نفس الوقت على الخط المشترك، فتصادمت البيانات.",
              },
            },
            {
              id: "m10-l02-p01-match", type: "practice-table", origin: "teacher-enrichment",
              caption: "تحقّق من نفسك: أي شكل يصفه كل سطر؟",
              headers: ["الوصف", "الشكل"],
              columnDirs: ["rtl", "ltr"],
              rows: [
                ["كل الأجهزة تتصل بجهاز مركزي واحد.", TOPO("Star")],
                ["خط واحد مشترك بين كل الأجهزة.", TOPO("Bus")],
                ["دائرة مغلقة والبيانات باتجاه واحد.", TOPO("Ring")],
                ["مستويات فوق بعضها.", TOPO("Tree")],
                ["جهازان بكابل مباشر بلا وسيط.", TOPO("P2P")],
                ["دمج أكثر من نوع في شبكة واحدة.", TOPO("Hybrid")],
              ],
            },
            {
              id: "m10-l02-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "سؤال ختامي: في مختبر المدرسة تتصل كل الحواسيب بجهاز Switch واحد. ما شكل هذه الشبكة؟",
                options: [opt("m10-l02-p01-q1-a", "Bus"), opt("m10-l02-p01-q1-b", "Star", true), opt("m10-l02-p01-q1-c", "Ring")],
                feedback: {
                  hints: ["هل يوجد جهاز مركزي واحد يتصل به الجميع؟", "الجهاز المركزي = الشكل النجمي."],
                  correctFeedback: "أحسنت — جهاز مركزي واحد يتصل به الجميع = Star، وهو الأكثر استعمالًا في المدارس.",
                  incorrectFeedback: "افحص الكلمة المفتاحية: «جهاز Switch واحد» يتصل به الجميع؛ أي شكل في الصفحة يقوم على جهاز مركزي؟",
                  explanation: "Star: كل الأجهزة تتصل بجهاز مركزي مثل Switch — الأكثر استعمالًا في المدارس والشركات.",
                },
              },
            },
          ],
        },
      ],
    },
  ],
};

export default m10;
