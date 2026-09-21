// Learning Materials — Batch 4 phase: REAL converted body for Book 791381, module m16 (the book's section
// «المجالات والمفاهيم», source PDF 98–106, complete). Stable id m16 (next free), order 12 (batch b3).
//
// PDF 98–105 are concept pages (Collision Domain, how the switch reduces collisions, Broadcast Domain, Broadcast
// Domain in Switch / Router / VLAN, STP, Half/Full Duplex, Localhost, APIPA). PDF 106 («تدريبات مراجعة سريعة») is the
// section's closing page: three cards that group the book's electronic trainings 5–12 by topic behind QR codes.
// It is kept as a learner-visible closing page (conversionNote): the cards and the note are the book's own text;
// the QR codes live in the printed book and trainings 5–12 are NOT delivered inside the platform, so no
// `library-training` block is authored here. PDF 107 is the book's «الجزء الثاني · أمان الشبكات» cover and is the
// HARD STOP of this batch: nothing from PDF 107+ (attacks, VPN, SSL/TLS, Segment/Packet/Frame encapsulation, the
// TCP 3-way handshake, switch CLI / VLAN programming) appears here. VLAN is named ONLY where PDF 100–101 name it
// (as a separator of Broadcast domains) — no VLAN configuration, Trunk or CLI.
// Book-derived blocks are origin:"book": definitions, facts, the book's figure captions (as text), the PDF 101 table,
// the Duplex cards, «قاعدة مهمة» / «النتيجة» / «تذكّر» / «متى؟» / «الفرق» / «إشارة تحذير» boxes. Technical tokens
// (Hub, Switch, Router, VLAN, STP, Broadcast, Collision Domain, 127.0.0.1, 169.254.x.x, DHCP) are LTR spans.
// PRINTED PAGE = the rendered page circle (PDF 98 prints «98» … PDF 106 prints «106»).

import type { ContentModule, ContentSource, InlineSpan, PracticeOption } from "../../types";

const CID = "791381";
const src = (pdf: number, printed?: number): ContentSource => ({ kind: "book", sourceId: CID, pdfPageStart: pdf, printedPage: printed });
const L = (text: string): InlineSpan => ({ text, dir: "ltr", style: "code" });
const T = (text: string): InlineSpan => ({ text });
const opt = (id: string, text: string, correct?: true): PracticeOption => (correct ? { id, text, correct } : { id, text });

const m16: ContentModule = {
  id: "791381-m16",
  title: "المجالات والمفاهيم",
  shortTitle: "المجالات والمفاهيم",
  order: 12,
  source: { kind: "book", sourceId: CID, pdfPageStart: 98, pdfPageEnd: 106, sourceNote: "PDF 106 صفحة «تدريبات مراجعة سريعة» ختامية (رموز QR لتدريبات 5–12 في الكتاب المطبوع). PDF 107 صفحة عنوان «الجزء الثاني · أمان الشبكات» ولا يُحوَّل هنا." },
  lessons: [
    // ── l01 — collision domain (PDF 98–99) ───────────────────────────────────────────────────────────────────
    {
      id: "791381-m16-l01",
      title: "مجال التصادم",
      order: 1,
      pages: [
        // PDF 98 — Collision Domain
        {
          id: "791381-m16-l01-p01",
          title: "Collision Domain",
          order: 1,
          source: src(98, 98),
          keywords: ["Collision Domain", "تصادم", "Hub", "Switch", "منفذ"],
          blocks: [
            {
              id: "m16-l01-p01-def", type: "callout", origin: "book", kind: "important",
              spans: [T("منطقة يمكن أن يحدث فيها تصادم بين الرسائل.")],
            },
            {
              id: "m16-l01-p01-figure", type: "list", origin: "book", variant: "cards", title: "الرسم: Hub مقابل Switch",
              items: [
                { id: "m16-l01-p01-fig-hub", term: "Hub", text: [T("مجال واحد: تصادم ممكن بين الجميع.")] },
                { id: "m16-l01-p01-fig-switch", term: "Switch", text: [T("مجال لكل منفذ: لا تصادم بين المنافذ.")], note: "كل منفذ في السويتش مجال تصادم مستقل" },
              ],
            },
            {
              id: "m16-l01-p01-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m16-l01-p01-f1", text: [T("يحدث التصادم عندما يرسل أكثر من جهاز بنفس الوقت.")] },
                { id: "m16-l01-p01-f2", text: [T("كان شائعًا في الشبكات القديمة التي تستخدم "), L("Hub"), T(".")] },
                { id: "m16-l01-p01-f3", text: [T("السويتش يقلّل التصادم لأن كل منفذ مجال منفصل.")] },
              ],
            },
            {
              id: "m16-l01-p01-rule", type: "callout", origin: "book", kind: "important", title: "قاعدة مهمة",
              spans: [T("كل منفذ في السويتش = "), L("Collision Domain"), T(" مستقل.")],
            },
            {
              id: "m16-l01-p01-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("تذكّر من وحدة أجهزة الشبكات: "), L("Hub"), T(" يرسل الرسالة للجميع، فكل الأجهزة المتصلة به تتشارك «منطقة» واحدة يمكن أن تتصادم فيها رسائلها. أما "), L("Switch"), T(" فلكل منفذ فيه منطقته الخاصة، لذلك نعدّ مجالات التصادم بعدد المنافذ المستعملة.")],
            },
            {
              id: "m16-l01-p01-ex1", type: "example", origin: "teacher-enrichment", mode: "solved",
              title: "مثال محلول: كم مجال تصادم؟",
              prompt: "أربعة حواسيب متصلة بـ Hub، وأربعة أخرى متصلة بـ Switch (كل حاسوب في منفذ). كم مجال تصادم في كل حالة؟",
              steps: [
                { text: "Hub: الرسم يقول «مجال واحد: تصادم ممكن بين الجميع» — إذن مجال تصادم واحد للحواسيب الأربعة." },
                { text: "Switch: «قاعدة مهمة»: كل منفذ في السويتش = Collision Domain مستقل — إذن 4 مجالات تصادم." },
              ],
              result: "Hub: مجال تصادم واحد · Switch بأربعة منافذ مستعملة: 4 مجالات تصادم",
              explanation: "عدد مجالات التصادم في السويتش = عدد المنافذ المستعملة.",
            },
            {
              id: "m16-l01-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "متى يحدث التصادم حسب الكتاب؟",
                options: [opt("m16-l01-p01-q1-a", "عندما يرسل أكثر من جهاز بنفس الوقت", true), opt("m16-l01-p01-q1-b", "عندما يكون الكابل طويلًا"), opt("m16-l01-p01-q1-c", "عندما يرسل جهاز واحد فقط")],
                feedback: {
                  hints: ["افحص السطر الأول في قائمة الصفحة.", "«بنفس الوقت»."],
                  correctFeedback: "أحسنت — التصادم عند إرسال أكثر من جهاز بنفس الوقت.",
                  incorrectFeedback: "افحص قائمة الصفحة: «يحدث التصادم عندما يرسل أكثر من جهاز بنفس الوقت».",
                  explanation: "التصادم = إرسالان أو أكثر في المنطقة نفسها بنفس الوقت.",
                },
              },
            },
            {
              id: "m16-l01-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "سويتش فيه 6 حواسيب، كل حاسوب في منفذ. كم مجال تصادم؟ (اكتب الرقم)",
                answer: "6",
                feedback: {
                  hints: ["افحص «قاعدة مهمة».", "كل منفذ = مجال مستقل."],
                  correctFeedback: "صحيح — 6 منافذ مستعملة = 6 مجالات تصادم.",
                  incorrectFeedback: "افحص «قاعدة مهمة»: كل منفذ في السويتش = Collision Domain مستقل؛ عدّ المنافذ المستعملة.",
                  explanation: "في السويتش، عدد مجالات التصادم = عدد المنافذ المستعملة.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 4): SVG visual enrichment appended after the book content.
              id: "m16-l01-p01-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m16/collision-domains", motion: true,
              source: src(98),
              title: "مخطط: مجالات التصادم — Hub مقابل Switch",
              alt: "مخطط يقارن Hub الذي يجمع الأجهزة في مجال تصادم واحد بـ Switch الذي يجعل كل منفذ مجال تصادم مستقل.",
              caption: "Hub يشارك مجال التصادم · Switch يفصله لكل منفذ.",
            },
          ],
        },
        // PDF 99 — كيف يقلّل السويتش التصادم؟
        {
          id: "791381-m16-l01-p02",
          title: "كيف يقلّل السويتش التصادم؟",
          order: 2,
          source: src(99, 99),
          keywords: ["Switch", "Hub", "تصادم", "المقصود فقط"],
          blocks: [
            {
              id: "m16-l01-p02-def", type: "callout", origin: "book", kind: "important",
              spans: [T("السويتش يعالج مشكلة التصادم بطريقة ذكية.")],
            },
            {
              id: "m16-l01-p02-figure", type: "list", origin: "book", variant: "cards", title: "الرسم: Hub مقابل Switch",
              items: [
                { id: "m16-l01-p02-fig-hub", term: "Hub", text: [T("رسالة واحدة للجميع: ازدحام وتصادم.")] },
                { id: "m16-l01-p02-fig-switch", term: "Switch", text: [T("لكل منفذ طريق خاص: لا تصادم، سرعة أعلى.")], note: "كل منفذ منطقة تصادم منفصلة" },
              ],
            },
            {
              id: "m16-l01-p02-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m16-l01-p02-f1", text: [T("لا يرسل الرسالة لكل الأجهزة مثل "), L("Hub"), T(".")] },
                { id: "m16-l01-p02-f2", text: [T("يرسل البيانات غالبًا للجهاز المقصود فقط.")] },
                { id: "m16-l01-p02-f3", text: [T("كل منفذ يعمل كمنطقة تصادم منفصلة.")] },
              ],
            },
            {
              id: "m16-l01-p02-result", type: "callout", origin: "book", kind: "summary", title: "النتيجة",
              spans: [T("هذا يحسّن سرعة الشبكة ويقلّل التداخل بين الرسائل.")],
            },
            {
              id: "m16-l01-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "لماذا يقلّل السويتش التصادم؟",
                options: [opt("m16-l01-p02-q1-a", "لأنه يرسل البيانات غالبًا للجهاز المقصود فقط، وكل منفذ منطقة تصادم منفصلة", true), opt("m16-l01-p02-q1-b", "لأنه يرسل الرسالة لكل الأجهزة مثل Hub"), opt("m16-l01-p02-q1-c", "لأنه يبطئ الإرسال")],
                feedback: {
                  hints: ["افحص قائمة الصفحة.", "«للجهاز المقصود فقط»."],
                  correctFeedback: "أحسنت — الإرسال للمقصود فقط + منطقة تصادم لكل منفذ.",
                  incorrectFeedback: "افحص قائمة الصفحة: «لا يرسل الرسالة لكل الأجهزة مثل Hub» و«كل منفذ يعمل كمنطقة تصادم منفصلة».",
                  explanation: "النتيجة: سرعة أعلى وتداخل أقل.",
                },
              },
            },
            {
              id: "m16-l01-p02-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "Hub يرسل رسالة واحدة للجميع، لذلك يسبّب ازدحامًا وتصادمًا.",
                answer: true,
                feedback: {
                  hints: ["افحص بطاقة Hub في الرسم.", "«رسالة واحدة للجميع»."],
                  correctFeedback: "صحيح — Hub: رسالة واحدة للجميع، ازدحام وتصادم.",
                  incorrectFeedback: "افحص بطاقة Hub في الرسم: «رسالة واحدة للجميع: ازدحام وتصادم».",
                  explanation: "السويتش يعالج ذلك بإعطاء كل منفذ طريقًا خاصًا.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 4): SVG visual enrichment appended after the book content.
              id: "m16-l01-p02-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m16/collision-domains", motion: true,
              source: src(99),
              title: "مخطط: كيف يقلّل السويتش التصادم",
              alt: "المخطط نفسه لمجالات التصادم: بفصل كل منفذ في مجاله يقلّل السويتش التصادمات مقارنةً بالـ Hub المشترك.",
              caption: "بفصل كل منفذ في مجاله يقلّل السويتش التصادمات.",
            },
          ],
        },
      ],
    },
    // ── l02 — broadcast domain (PDF 100–101) ─────────────────────────────────────────────────────────────────
    {
      id: "791381-m16-l02",
      title: "مجال البث",
      order: 2,
      pages: [
        // PDF 100 — Broadcast Domain
        {
          id: "791381-m16-l02-p01",
          title: "Broadcast Domain",
          order: 1,
          source: src(100, 100),
          keywords: ["Broadcast Domain", "Broadcast", "Router", "VLAN"],
          blocks: [
            {
              id: "m16-l02-p01-def", type: "callout", origin: "book", kind: "important",
              spans: [T("مجموعة أجهزة تستقبل رسائل "), L("Broadcast"), T(" من بعضها.")],
            },
            {
              id: "m16-l02-p01-figure", type: "list", origin: "book", variant: "cards", title: "الرسم: Broadcast Domain — مجال واحد",
              items: [
                { id: "m16-l02-p01-fig-1", term: "Switch", text: [T("رسالة واحدة تصل لكل الأجهزة في المجال.")] },
                { id: "m16-l02-p01-fig-2", text: [T("الراوتر و "), L("VLAN"), T(" يقسمان هذا المجال إلى مجالات أصغر.")] },
              ],
            },
            {
              id: "m16-l02-p01-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m16-l02-p01-f1", text: [T("رسالة "), L("Broadcast"), T(" تصل لكل الأجهزة في نفس المجال.")] },
                { id: "m16-l02-p01-f2", text: [T("تُستخدم لاكتشاف الأجهزة والخدمات.")] },
                { id: "m16-l02-p01-f3", text: [T("كثرتها قد تسبّب ازدحامًا في الشبكة.")] },
              ],
            },
            {
              id: "m16-l02-p01-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("الراوتر و "), L("VLAN"), T(" يفصلان مجالات "), L("Broadcast"), T(" عن بعضها.")],
            },
            {
              id: "m16-l02-p01-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("في وحدة أنواع الرسائل تعلّمت أن رسالة "), L("Broadcast"), T(" تصل لكل الأجهزة داخل الشبكة وأن الراوتر يوقفها. «مجال البث» هو اسم هذه المنطقة التي تصل إليها الرسالة. و "), L("VLAN"), T(" هنا مجرد اسم لطريقة تقسيم السويتش الواحد إلى أقسام منفصلة؛ تفاصيلها في دفعة لاحقة من الكتاب.")],
            },
            {
              id: "m16-l02-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما هو Broadcast Domain؟",
                options: [opt("m16-l02-p01-q1-a", "مجموعة أجهزة تستقبل رسائل Broadcast من بعضها", true), opt("m16-l02-p01-q1-b", "منطقة يمكن أن يحدث فيها تصادم"), opt("m16-l02-p01-q1-c", "منفذ واحد في السويتش")],
                feedback: {
                  hints: ["افحص الصندوق الأول في الصفحة.", "الفرق عن مجال التصادم: هنا الكلمة هي Broadcast."],
                  correctFeedback: "أحسنت — الأجهزة التي تصلها رسائل Broadcast بعضها من بعض.",
                  incorrectFeedback: "افحص الصندوق الأول: «مجموعة أجهزة تستقبل رسائل Broadcast من بعضها». منطقة التصادم مفهوم الصفحة السابقة.",
                  explanation: "مجال التصادم عن التصادم؛ مجال البث عن رسائل Broadcast.",
                },
              },
            },
            {
              id: "m16-l02-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "من يفصل مجالات Broadcast عن بعضها حسب صندوق «تذكّر»؟",
                options: [opt("m16-l02-p01-q2-a", "Hub و Switch"), opt("m16-l02-p01-q2-b", "الراوتر و VLAN", true), opt("m16-l02-p01-q2-c", "الكابل")],
                feedback: {
                  hints: ["افحص صندوق «تذكّر».", "جهاز واحد + طريقة تقسيم."],
                  correctFeedback: "أحسنت — الراوتر و VLAN.",
                  incorrectFeedback: "افحص صندوق «تذكّر»: «الراوتر و VLAN يفصلان مجالات Broadcast عن بعضها».",
                  explanation: "السويتش لا يفصلها؛ الراوتر و VLAN يفصلانها.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 4): SVG visual enrichment appended after the book content.
              id: "m16-l02-p01-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m16/broadcast-domain", motion: true,
              source: src(100),
              title: "مخطط: مجال البث",
              alt: "مخطط يبيّن رسالة بث تنتقل من المرسِل عبر السويتش لتصل إلى كل الأجهزة داخل مجال البث نفسه.",
              caption: "البث يصل إلى كل الأجهزة داخل مجال البث نفسه.",
            },
          ],
        },
        // PDF 101 — Broadcast Domain في Switch و Router
        {
          id: "791381-m16-l02-p02",
          title: "Broadcast Domain في Switch و Router",
          order: 2,
          source: src(101, 101),
          keywords: ["Broadcast Domain", "Switch", "Router", "VLAN"],
          blocks: [
            {
              id: "m16-l02-p02-table", type: "table", origin: "book",
              caption: "الجهاز · ماذا يحدث؟ · الخلاصة",
              headers: ["الجهاز", "ماذا يحدث؟", "الخلاصة"],
              columnDirs: ["ltr", "rtl", "rtl"],
              rows: [
                ["Switch", "كل المنافذ غالبًا ضمن Broadcast Domain واحد", "البرودكاست ينتشر داخل السويتش"],
                ["Router", "كل منفذ في الراوتر Broadcast Domain مستقل", "الراوتر يوقف البرودكاست بين الشبكات"],
                ["VLAN", "كل VLAN تعتبر Broadcast Domain منفصل", "تفصل الأقسام عن بعضها"],
              ],
            },
            {
              id: "m16-l02-p02-summary", type: "callout", origin: "book", kind: "summary", title: "الخلاصة",
              spans: [T("الراوتر و "), L("VLAN"), T(" يساعدان على فصل مناطق "), L("Broadcast"), T("، فتقلّ حركة المرور غير الضرورية.")],
            },
            {
              // ENRICHMENT — interactive-diagram / network-domains / v1: placed here because both domain kinds and the
              // Switch / Router / VLAN rules are now on the page (PDF 98, 100, 101). All wording is the book's own.
              id: "m16-l02-p02-explorer", type: "interactive-diagram", origin: "teacher-enrichment",
              interactionType: "network-domains", version: 1,
              title: "استكشف مجالات التصادم ومجالات Broadcast",
              description: "اختر الشبكة (Hub، Switch، Router، VLAN) واقرأ كم مجال تصادم وكم مجال Broadcast فيها، مع سبب الكتاب لكل عدد.",
              source: src(101, 101),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "Hub بأربعة أجهزة: مجال تصادم واحد ومجال Broadcast واحد. Switch بأربعة أجهزة: 4 مجالات تصادم (كل منفذ مجال مستقل) ومجال Broadcast واحد (كل المنافذ غالبًا ضمن مجال واحد). Router يربط سويتشين بجهازين لكل منهما: 6 مجالات تصادم (منفذان للأجهزة ومنفذ للراوتر في كل سويتش) ومجالا Broadcast (كل منفذ في الراوتر مجال مستقل). Switch مقسّم إلى VLAN 10 و VLAN 20: 4 مجالات تصادم ومجالا Broadcast (كل VLAN مجال منفصل)." },
              config: {
                scenarios: [
                  { id: "hub", name: "Hub", title: "أربعة أجهزة على Hub", collision: 1, broadcast: 1, collisionNote: "Hub: مجال واحد، تصادم ممكن بين الجميع.", broadcastNote: "رسالة واحدة تصل لكل الأجهزة في المجال." },
                  { id: "switch", name: "Switch", title: "أربعة أجهزة على Switch", collision: 4, broadcast: 1, collisionNote: "كل منفذ في السويتش = Collision Domain مستقل.", broadcastNote: "كل المنافذ غالبًا ضمن Broadcast Domain واحد." },
                  { id: "router", name: "Router", title: "راوتر يربط سويتشين", collision: 6, broadcast: 2, collisionNote: "كل منفذ سويتش مستعمل مجال مستقل: منفذان للأجهزة ومنفذ للراوتر في كل سويتش.", broadcastNote: "كل منفذ في الراوتر Broadcast Domain مستقل؛ الراوتر يوقف البرودكاست بين الشبكات." },
                  { id: "vlan", name: "VLAN", title: "Switch مقسّم إلى VLAN 10 و VLAN 20", collision: 4, broadcast: 2, collisionNote: "كل منفذ في السويتش = Collision Domain مستقل.", broadcastNote: "كل VLAN تعتبر Broadcast Domain منفصل؛ تفصل الأقسام عن بعضها." },
                ],
                collisionLabel: "مجال تصادم", broadcastLabel: "مجال Broadcast",
                showCollisionLabel: "أظهر مجالات التصادم", showBroadcastLabel: "أظهر مجالات Broadcast",
                legend: "الخط المتقطّع يحيط بكل مجال تصادم، والخط الملوّن يحيط بكل مجال Broadcast.",
              },
            },
            {
              id: "m16-l02-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "راوتر له منفذان، كل منفذ متصل بشبكة. كم مجال Broadcast؟",
                options: [opt("m16-l02-p02-q1-a", "مجال واحد"), opt("m16-l02-p02-q1-b", "مجالان", true), opt("m16-l02-p02-q1-c", "لا يوجد")],
                feedback: {
                  hints: ["افحص صف Router في الجدول.", "«كل منفذ في الراوتر … مستقل»."],
                  correctFeedback: "أحسنت — كل منفذ في الراوتر Broadcast Domain مستقل: منفذان = مجالان.",
                  incorrectFeedback: "افحص صف Router في الجدول: «كل منفذ في الراوتر Broadcast Domain مستقل».",
                  explanation: "الراوتر يوقف البرودكاست بين الشبكات.",
                },
              },
            },
            {
              id: "m16-l02-p02-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "في السويتش العادي، كل المنافذ غالبًا ضمن Broadcast Domain واحد.",
                answer: true,
                feedback: {
                  hints: ["افحص صف Switch في الجدول.", "«البرودكاست ينتشر داخل السويتش»."],
                  correctFeedback: "صحيح — البرودكاست ينتشر داخل السويتش.",
                  incorrectFeedback: "افحص صف Switch في الجدول: «كل المنافذ غالبًا ضمن Broadcast Domain واحد».",
                  explanation: "السويتش يفصل مجالات التصادم لا مجالات البث؛ الفصل يحتاج راوتر أو VLAN.",
                },
              },
            },
          ],
        },
      ],
    },
    // ── l03 — STP · Duplex (PDF 102–103) ─────────────────────────────────────────────────────────────────────
    {
      id: "791381-m16-l03",
      title: "STP و Duplex",
      order: 3,
      pages: [
        // PDF 102 — بروتوكول STP
        {
          id: "791381-m16-l03-p01",
          title: "بروتوكول STP",
          order: 1,
          source: src(102, 102),
          keywords: ["STP", "حلقات", "Loops", "سويتشات"],
          blocks: [
            {
              id: "m16-l03-p01-def", type: "callout", origin: "book", kind: "important",
              spans: [L("STP"), T(" يمنع حدوث حلقات ("), L("Loops"), T(") في الشبكة.")],
            },
            {
              id: "m16-l03-p01-figure", type: "list", origin: "book", variant: "cards", title: "الرسم: ثلاثة سويتشات SW1 · SW2 · SW3",
              items: [
                { id: "m16-l03-p01-fig-1", text: [T("رابط معطّل مؤقّتًا بين "), L("SW2"), T(" و "), L("SW3"), T(".")] },
                { id: "m16-l03-p01-fig-2", text: [L("STP"), T(" يترك طريقًا واحدًا فقط فلا تدور البيانات في حلقة.")] },
              ],
            },
            {
              id: "m16-l03-p01-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m16-l03-p01-f1", text: [T("يختار أفضل طريق لنقل البيانات.")] },
                { id: "m16-l03-p01-f2", text: [T("يعطّل الروابط الزائدة مؤقّتًا.")] },
                { id: "m16-l03-p01-f3", text: [T("يحافظ على استقرار الشبكة.")] },
              ],
            },
            {
              id: "m16-l03-p01-when", type: "callout", origin: "book", kind: "tip", title: "متى؟",
              spans: [L("STP"), T(" مهم عند وجود أكثر من طريق بين السويتشات لتفادي الحلقات.")],
            },
            {
              id: "m16-l03-p01-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("«الحلقة» تحدث عندما يكون بين السويتشات أكثر من طريق، فتدور الرسالة نفسها بينها بلا نهاية. "), L("STP"), T(" لا يقطع الكابل؛ هو يعطّل الرابط الزائد مؤقّتًا فقط، ويمكن أن يعيد تشغيله إن تعطّل الطريق الأساسي.")],
            },
            {
              id: "m16-l03-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما وظيفة STP؟",
                options: [opt("m16-l03-p01-q1-a", "منع حدوث حلقات (Loops) في الشبكة", true), opt("m16-l03-p01-q1-b", "توزيع عناوين IP"), opt("m16-l03-p01-q1-c", "منع التصادم داخل Hub")],
                feedback: {
                  hints: ["افحص الصندوق الأول في الصفحة.", "الكلمة المفتاحية: حلقات."],
                  correctFeedback: "أحسنت — STP يمنع الحلقات.",
                  incorrectFeedback: "افحص الصندوق الأول: «STP يمنع حدوث حلقات (Loops) في الشبكة».",
                  explanation: "يعطّل الروابط الزائدة مؤقّتًا فيبقى طريق واحد.",
                },
              },
            },
            {
              id: "m16-l03-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "متى يكون STP مهمًا حسب الكتاب؟",
                options: [opt("m16-l03-p01-q2-a", "عند وجود أكثر من طريق بين السويتشات", true), opt("m16-l03-p01-q2-b", "عند وجود جهاز واحد فقط"), opt("m16-l03-p01-q2-c", "عند استخدام Hub")],
                feedback: {
                  hints: ["افحص صندوق «متى؟».", "«أكثر من طريق»."],
                  correctFeedback: "أحسنت — أكثر من طريق بين السويتشات = خطر الحلقات.",
                  incorrectFeedback: "افحص صندوق «متى؟»: «STP مهم عند وجود أكثر من طريق بين السويتشات لتفادي الحلقات».",
                  explanation: "بلا طريق زائد لا حلقة، فلا حاجة لتعطيل شيء.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 4): SVG visual enrichment appended after the book content.
              id: "m16-l03-p01-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m16/stp-loop-blocking", motion: true,
              source: src(102),
              title: "مخطط: STP يحظر مسارًا زائدًا",
              alt: "مخطط لثلاثة سويتشات SW1 وSW2 وSW3 بروابط زائدة، حيث يحظر STP أحد المسارات لمنع الحلقة ويبقي الشجرة الفعّالة.",
              caption: "STP يحظر مسارًا زائدًا فيمنع الحلقة.",
            },
          ],
        },
        // PDF 103 — Half Duplex / Full Duplex
        {
          id: "791381-m16-l03-p02",
          title: "Half Duplex / Full Duplex",
          order: 2,
          source: src(103, 103),
          keywords: ["Half Duplex", "Full Duplex", "إرسال", "استقبال"],
          blocks: [
            {
              id: "m16-l03-p02-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m16-l03-p02-half", term: "Half Duplex", text: [T("الجهاز يرسل أو يستقبل، لكن ليس في نفس الوقت. مثال: جهاز لاسلكي قديم.")], note: "اتجاه واحد في كل مرة" },
                { id: "m16-l03-p02-full", term: "Full Duplex", text: [T("الجهاز يرسل ويستقبل في نفس الوقت. مثال: مكالمة هاتفية أو سويتش حديث.")], note: "اتجاهان في نفس الوقت" },
              ],
            },
            {
              id: "m16-l03-p02-diff", type: "callout", origin: "book", kind: "important", title: "الفرق",
              spans: [L("Half"), T(" = اتجاه واحد في كل مرة، و "), L("Full"), T(" = إرسال واستقبال معًا في نفس اللحظة.")],
            },
            {
              id: "m16-l03-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "جهاز لاسلكي قديم يرسل أو يستقبل لكن ليس في نفس الوقت. ما نوعه؟",
                options: [opt("m16-l03-p02-q1-a", "Half Duplex", true), opt("m16-l03-p02-q1-b", "Full Duplex")],
                feedback: {
                  hints: ["افحص بطاقة المثال «جهاز لاسلكي قديم».", "«اتجاه واحد في كل مرة»."],
                  correctFeedback: "أحسنت — Half Duplex: اتجاه واحد في كل مرة.",
                  incorrectFeedback: "افحص بطاقة Half Duplex: «يرسل أو يستقبل، لكن ليس في نفس الوقت. مثال: جهاز لاسلكي قديم».",
                  explanation: "Full = معًا في نفس اللحظة (مكالمة هاتفية، سويتش حديث).",
                },
              },
            },
            {
              id: "m16-l03-p02-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "المكالمة الهاتفية مثال على Full Duplex لأن الطرفين يرسلان ويستقبلان في نفس الوقت.",
                answer: true,
                feedback: {
                  hints: ["افحص بطاقة Full Duplex.", "«في نفس الوقت»."],
                  correctFeedback: "صحيح — Full Duplex: إرسال واستقبال معًا.",
                  incorrectFeedback: "افحص بطاقة Full Duplex: «مثال: مكالمة هاتفية أو سويتش حديث».",
                  explanation: "Half = اتجاه واحد في كل مرة.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 4): SVG visual enrichment appended after the book content.
              id: "m16-l03-p02-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m16/half-full-duplex", motion: true,
              source: src(103),
              title: "مخطط: Half Duplex مقابل Full Duplex",
              alt: "مخطط يقارن Half Duplex حيث الإرسال باتجاه واحد في كل مرة، بـ Full Duplex حيث الإرسال والاستقبال في نفس الوقت.",
              caption: "Half: اتجاه واحد كل مرة · Full: إرسال واستقبال معًا.",
            },
          ],
        },
      ],
    },
    // ── l04 — Localhost · APIPA (PDF 104–105) ────────────────────────────────────────────────────────────────
    {
      id: "791381-m16-l04",
      title: "Localhost و APIPA",
      order: 4,
      pages: [
        // PDF 104 — Localhost
        {
          id: "791381-m16-l04-p01",
          title: "Localhost",
          order: 1,
          source: src(104, 104),
          keywords: ["Localhost", "127.0.0.1", "اختبار محلي"],
          blocks: [
            {
              id: "m16-l04-p01-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m16-l04-p01-f1", text: [T("يشير إلى نفس الجهاز الذي تعمل عليه.")] },
                { id: "m16-l04-p01-f2", text: [T("العنوان الخاص به هو "), L("127.0.0.1"), T(".")] },
                { id: "m16-l04-p01-f3", text: [T("يُستخدم لاختبار المواقع والبرامج محليًا.")] },
                { id: "m16-l04-p01-f4", text: [T("لا يحتاج اتصالًا بالإنترنت.")] },
              ],
            },
            {
              id: "m16-l04-p01-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [L("Localhost"), T(" و "), L("127.0.0.1"), T(" لهما نفس المعنى تقريبًا.")],
            },
            {
              id: "m16-l04-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "اكتب عنوان Localhost كما في الكتاب.",
                answer: "127.0.0.1",
                feedback: {
                  hints: ["افحص السطر الثاني في قائمة الصفحة.", "يبدأ بـ 127."],
                  correctFeedback: "صحيح — 127.0.0.1.",
                  incorrectFeedback: "افحص قائمة الصفحة: «العنوان الخاص به هو …» (أربعة أجزاء تبدأ بـ 127).",
                  explanation: "Localhost = 127.0.0.1 = الجهاز نفسه.",
                },
              },
            },
            {
              id: "m16-l04-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "اختبار موقع على Localhost يحتاج اتصالًا بالإنترنت.",
                answer: false,
                feedback: {
                  hints: ["افحص السطر الأخير في قائمة الصفحة.", "الجهاز يتحدث مع نفسه."],
                  correctFeedback: "صحيح أنها خطأ — Localhost لا يحتاج اتصالًا بالإنترنت.",
                  incorrectFeedback: "افحص قائمة الصفحة: «لا يحتاج اتصالًا بالإنترنت».",
                  explanation: "Localhost يشير إلى الجهاز نفسه، فالاختبار محلي.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 4): SVG visual enrichment appended after the book content.
              id: "m16-l04-p01-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m16/localhost-loopback", motion: true,
              source: src(104),
              title: "مخطط: Localhost والعودة إلى الجهاز نفسه",
              alt: "مخطط يبيّن طلبًا إلى 127.0.0.1 يعود داخل الجهاز نفسه عبر مكدّس الشبكة دون أن يغادر إلى الشبكة.",
              caption: "127.0.0.1 يعود إلى نفس الجهاز — لا يغادر إلى الشبكة.",
            },
          ],
        },
        // PDF 105 — APIPA
        {
          id: "791381-m16-l04-p02",
          title: "APIPA",
          order: 2,
          source: src(105, 105),
          keywords: ["APIPA", "169.254", "DHCP"],
          blocks: [
            {
              id: "m16-l04-p02-def", type: "callout", origin: "book", kind: "important",
              spans: [T("عنوان "), L("IP"), T(" يختاره الجهاز لنفسه تلقائيًا.")],
            },
            {
              id: "m16-l04-p02-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m16-l04-p02-f1", text: [T("يظهر عندما لا يجد الجهاز خادم "), L("DHCP"), T(".")] },
                { id: "m16-l04-p02-f2", text: [T("يبدأ دائمًا بـ "), L("169.254.x.x"), T(".")] },
                { id: "m16-l04-p02-f3", text: [T("حل مؤقت داخل الشبكة المحلية فقط.")] },
              ],
            },
            {
              id: "m16-l04-p02-warning", type: "callout", origin: "book", kind: "warning", title: "إشارة تحذير",
              spans: [T("إذا رأيت "), L("169.254.x.x"), T(" فغالبًا هناك مشكلة في "), L("DHCP"), T(".")],
            },
            {
              id: "m16-l04-p02-ex1", type: "example", origin: "teacher-enrichment", mode: "solved",
              title: "مثال محلول: نفّذ الطالب ipconfig فظهر العنوان 169.254.10.7 — ماذا يعني؟",
              steps: [
                { text: "العنوان يبدأ بـ 169.254 — هذا عنوان APIPA اختاره الجهاز لنفسه تلقائيًا." },
                { text: "APIPA يظهر عندما لا يجد الجهاز خادم DHCP (البروتوكول الذي يوزّع عناوين IP)." },
                { text: "«إشارة تحذير»: غالبًا هناك مشكلة في DHCP، والجهاز يعمل مؤقتًا داخل الشبكة المحلية فقط." },
              ],
              result: "عنوان APIPA = لم يصل عنوان من DHCP؛ افحص خدمة DHCP أو الاتصال بالشبكة",
              explanation: "ipconfig أظهر العنوان، ومعرفة أن 169.254 يعني APIPA حدّدت مكان الخلل.",
            },
            {
              id: "m16-l04-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "متى يظهر عنوان APIPA؟",
                options: [opt("m16-l04-p02-q1-a", "عندما لا يجد الجهاز خادم DHCP", true), opt("m16-l04-p02-q1-b", "عندما يتصل الجهاز بالإنترنت"), opt("m16-l04-p02-q1-c", "عندما نختبر موقعًا محليًا")],
                feedback: {
                  hints: ["افحص السطر الأول في قائمة الصفحة.", "أي بروتوكول يوزّع عناوين IP؟"],
                  correctFeedback: "أحسنت — لا خادم DHCP، فالجهاز يختار عنوانًا لنفسه.",
                  incorrectFeedback: "افحص قائمة الصفحة: «يظهر عندما لا يجد الجهاز خادم DHCP». الاختبار المحلي هو Localhost.",
                  explanation: "APIPA حل مؤقت داخل الشبكة المحلية فقط.",
                },
              },
            },
            {
              id: "m16-l04-p02-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي عنوان من التالية عنوان APIPA؟",
                options: [opt("m16-l04-p02-q2-a", "127.0.0.1"), opt("m16-l04-p02-q2-b", "169.254.3.20", true), opt("m16-l04-p02-q2-c", "192.168.1.10")],
                feedback: {
                  hints: ["افحص «يبدأ دائمًا بـ …».", "127.0.0.1 هو Localhost."],
                  correctFeedback: "أحسنت — يبدأ بـ 169.254 فهو APIPA.",
                  incorrectFeedback: "افحص قائمة الصفحة: APIPA «يبدأ دائمًا بـ 169.254.x.x»؛ 127.0.0.1 هو Localhost.",
                  explanation: "169.254.x.x = APIPA = مشكلة في DHCP غالبًا.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 4): SVG visual enrichment appended after the book content.
              id: "m16-l04-p02-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m16/apipa-fallback", motion: true,
              source: src(105),
              title: "مخطط: APIPA عند غياب DHCP",
              alt: "مخطط يبيّن جهازًا يطلب إعدادًا تلقائيًا فلا يجد خادم DHCP فيختار لنفسه عنوان 169.254 الذي يعمل محليًا فقط.",
              caption: "لا يجد DHCP فيختار 169.254 لنفسه · محلي فقط.",
            },
          ],
        },
      ],
    },
    // ── l05 — the section's closing trainings page (PDF 106) ─────────────────────────────────────────────────
    {
      id: "791381-m16-l05",
      title: "تدريبات مراجعة سريعة",
      order: 5,
      pages: [
        {
          id: "791381-m16-l05-p01",
          title: "تدريبات مراجعة سريعة",
          order: 1,
          source: src(106, 106),
          conversionNote: "PDF 106 صفحة ختامية لقسم «المجالات والمفاهيم»: ثلاث بطاقات تجمع تدريبات الكتاب الإلكترونية 5–12 حسب الموضوع خلف رموز QR. الرموز في الكتاب المطبوع؛ تُعرض البطاقات وملاحظة الكتاب كما هي، وتُفتح التدريبات 5–12 من داخل المنصة (library-training) عندما يصبح الجزء المرتبط بكل تدريب متاحًا، ثم تُضاف مراجعة ختامية للقسم.",
          keywords: ["تدريبات", "مراجعة", "QR"],
          blocks: [
            {
              id: "m16-l05-p01-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m16-l05-p01-t56", term: "تدريب 5–6", text: [L("IP"), T("، "), L("Subnet"), T("، وفحص الاتصال.")] },
                { id: "m16-l05-p01-t78", term: "تدريب 7–8", text: [T("أوامر الشبكة والبروتوكولات.")] },
                { id: "m16-l05-p01-t912", term: "تدريب 9–12", text: [L("OSI"), T("، "), L("TCP/UDP"), T("، ومفاهيم "), L("Broadcast"), T(".")] },
              ],
            },
            {
              id: "m16-l05-p01-note", type: "callout", origin: "book", kind: "tip", title: "ملاحظة",
              spans: [T("امسح رمز كل تدريب لحلّه إلكترونيًا مع التفسير الفوري ومراجعة الأخطاء.")],
            },
            {
              id: "m16-l05-p01-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("رموز QR موجودة في الكتاب المطبوع. يمكن فتح التدريبات 5–12 من داخل المنصة عندما يصبح الجزء المرتبط بكل تدريب متاحًا، ثم راجع القسم من خلال المراجعة الختامية التالية.")],
            },
            // ── Learning Practice (Reader position 98): the platform's T05–T12, grouped as the book groups them.
            // Metadata only — the host / API decide availability and disclose the library title.
            { id: "m16-l05-p01-practice", type: "heading", origin: "teacher-enrichment", level: 3, text: "تدريبات مرتبطة بهذه الصفحة" },
            { id: "m16-l05-p01-g56", type: "heading", origin: "teacher-enrichment", level: 4, text: "تدريب 5–6" },
            { id: "m16-l05-p01-lt05", type: "library-training", origin: "book", trainingId: "T05", label: "تدريب 5", requiredModuleId: "791381-m08" },
            { id: "m16-l05-p01-lt06", type: "library-training", origin: "book", trainingId: "T06", label: "تدريب 6", requiredModuleId: "791381-m09" },
            { id: "m16-l05-p01-g78", type: "heading", origin: "teacher-enrichment", level: 4, text: "تدريب 7–8" },
            { id: "m16-l05-p01-lt07", type: "library-training", origin: "book", trainingId: "T07", label: "تدريب 7", requiredModuleId: "791381-m10" },
            { id: "m16-l05-p01-lt08", type: "library-training", origin: "book", trainingId: "T08", label: "تدريب 8", requiredModuleId: "791381-m11" },
            { id: "m16-l05-p01-g912", type: "heading", origin: "teacher-enrichment", level: 4, text: "تدريب 9–12" },
            { id: "m16-l05-p01-lt09", type: "library-training", origin: "book", trainingId: "T09", label: "تدريب 9", requiredModuleId: "791381-m12" },
            { id: "m16-l05-p01-lt10", type: "library-training", origin: "book", trainingId: "T10", label: "تدريب 10", requiredModuleId: "791381-m13" },
            { id: "m16-l05-p01-lt11", type: "library-training", origin: "book", trainingId: "T11", label: "تدريب 11", requiredModuleId: "791381-m14" },
            { id: "m16-l05-p01-lt12", type: "library-training", origin: "book", trainingId: "T12", label: "تدريب 12", requiredModuleId: "791381-m15" },
            // ── closing review for the section (easy, medium, exam-like) ──
            {
              id: "m16-l05-p01-review", type: "heading", origin: "teacher-enrichment", level: 3, text: "مراجعة ختامية: المجالات والمفاهيم",
            },
            {
              id: "m16-l05-p01-r1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "كل منفذ في السويتش هو:",
                options: [opt("m16-l05-p01-r1-a", "Collision Domain مستقل", true), opt("m16-l05-p01-r1-b", "Broadcast Domain مستقل"), opt("m16-l05-p01-r1-c", "عنوان APIPA")],
                feedback: {
                  hints: ["افحص «قاعدة مهمة» في صفحة Collision Domain.", "الفصل بين مجالات Broadcast يحتاج راوتر أو VLAN."],
                  correctFeedback: "أحسنت — كل منفذ في السويتش = Collision Domain مستقل.",
                  incorrectFeedback: "افحص «قاعدة مهمة» في صفحة Collision Domain وجدول صفحة Broadcast Domain في Switch و Router.",
                  explanation: "السويتش يفصل مجالات التصادم؛ الراوتر و VLAN يفصلان مجالات Broadcast.",
                },
              },
            },
            {
              id: "m16-l05-p01-r2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "سؤال بأسلوب الامتحان: بين ثلاثة سويتشات أكثر من طريق، والبيانات تدور بلا نهاية. أي بروتوكول يعالج ذلك، وكيف؟",
                options: [opt("m16-l05-p01-r2-a", "STP، يعطّل الروابط الزائدة مؤقّتًا فيبقى طريق واحد", true), opt("m16-l05-p01-r2-b", "DHCP، يوزّع العناوين"), opt("m16-l05-p01-r2-c", "ARP، يربط IP بـ MAC")],
                feedback: {
                  hints: ["الكلمة المفتاحية: حلقة.", "افحص صفحة بروتوكول STP."],
                  correctFeedback: "أحسنت — STP يمنع الحلقات بتعطيل الروابط الزائدة مؤقّتًا.",
                  incorrectFeedback: "افحص صفحة بروتوكول STP: «يمنع حدوث حلقات (Loops)» و«يعطّل الروابط الزائدة مؤقّتًا».",
                  explanation: "STP مهم عند وجود أكثر من طريق بين السويتشات.",
                },
              },
            },
            {
              id: "m16-l05-p01-r3", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "سؤال بأسلوب الامتحان: طالب يرى في جهازه العنوان 169.254.7.7 ولا يستطيع الوصول للإنترنت. ما التفسير الأقرب؟",
                options: [opt("m16-l05-p01-r3-a", "العنوان هو Localhost"), opt("m16-l05-p01-r3-b", "عنوان APIPA: الجهاز لم يجد خادم DHCP فاختار عنوانًا لنفسه", true), opt("m16-l05-p01-r3-c", "الجهاز في Full Duplex")],
                feedback: {
                  hints: ["افحص «يبدأ دائمًا بـ …» في صفحة APIPA.", "Localhost هو 127.0.0.1."],
                  correctFeedback: "أحسنت — 169.254.x.x = APIPA = مشكلة في DHCP غالبًا.",
                  incorrectFeedback: "افحص صفحة APIPA: «يبدأ دائمًا بـ 169.254.x.x» و«إشارة تحذير: … مشكلة في DHCP».",
                  explanation: "APIPA حل مؤقت داخل الشبكة المحلية فقط.",
                },
              },
            },
          ],
        },
      ],
    },
  ],
};

export default m16;
