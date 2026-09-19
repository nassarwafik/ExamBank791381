// Learning Materials — Units 7–8 phase: REAL converted body for Book 791381, module m12 (the book's Unit 8
// «أنواع الرسائل», source PDF 66–74, plus PDF 75 — the book's «نهاية الدفعة الثانية · خلاصة سريعة» batch summary,
// a learner-visible summary page kept as the LAST page of this module, not a fake unit). Stable id m12 (next
// free), order 8 (batch b2). HARD STOP: PDF 76 opens batch 3 («نماذج الاتصال والبروتوكولات والأمان») and is NOT
// converted; PDF 75's closing line merely names the next batch, as printed.
//
// Book-derived blocks are origin:"book" and reproduce the RENDERED source in the book's order (cards, bullets,
// the broadcast-address table, the protocol table, the storage-units table, the message-field cards, callouts).
// Technical tokens (Unicast / Multicast / Broadcast / Switch / Router / MAC / IP / ARP / DHCP / RIP / KB … TB /
// addresses / FF:FF:FF:FF:FF:FF) are LTR spans. Pedagogy (clarifications, solved examples, the delivery
// simulation, the broadcast-address builder, worksheets, inline practices with «what to check» feedback, the closing
// review) is origin:"teacher-enrichment".
// TRANSPARENT NORMALIZATION (documented, not silent): PDF 68 prints «مصدر واحد ← هدف واحد» / «مصدر واحد ← مجموعة
// محدّدة» with an arrow glyph; the reader renders the same meaning as prose «من مصدر واحد إلى هدف واحد» so the
// direction never depends on an arrow inside mixed RTL/LTR text (the permanent «من X إلى Y» rule).
// PRINTED PAGE = the rendered page circle (PDF 67 → «67» … PDF 74 → «74»); PDF 66 (opener) and PDF 75 (summary)
// print none. Book level preserved: broadcast addresses at whole-octet /8 /16 /24 only; storage units by 1024.

import type { ContentModule, ContentSource, InlineSpan, PracticeOption, PracticeTableSelectCell } from "../../types";

const CID = "791381";
const src = (pdf: number, printed?: number): ContentSource => ({ kind: "book", sourceId: CID, pdfPageStart: pdf, printedPage: printed });
const L = (text: string): InlineSpan => ({ text, dir: "ltr", style: "code" });
const T = (text: string): InlineSpan => ({ text });
const opt = (id: string, text: string, correct?: true): PracticeOption => (correct ? { id, text, correct } : { id, text });
const CASTS = ["Unicast", "Multicast", "Broadcast"] as const;
const CAST = (key: (typeof CASTS)[number]): PracticeTableSelectCell => ({ kind: "select", options: [...CASTS], key });
const PROTOS = ["ARP", "DHCP", "RIP"] as const;
const PROTO = (key: (typeof PROTOS)[number]): PracticeTableSelectCell => ({ kind: "select", options: [...PROTOS], key });
const UNITS = ["Bit", "Byte", "KB", "MB", "GB", "TB"] as const;
const UNIT = (key: (typeof UNITS)[number]): PracticeTableSelectCell => ({ kind: "select", options: [...UNITS], key });
const BCAST = "FF:FF:FF:FF:FF:FF";

const m12: ContentModule = {
  id: "791381-m12",
  title: "أنواع الرسائل",
  shortTitle: "أنواع الرسائل",
  order: 8,
  source: { kind: "book", sourceId: CID, pdfPageStart: 66, pdfPageEnd: 75, sourceNote: "PDF 75 هو خلاصة الدفعة الثانية (صفحة تعليمية ختامية)؛ PDF 76 يبدأ الدفعة الثالثة ولم يُحوَّل." },
  lessons: [
    // ── l00 — unit opener (PDF 66) ───────────────────────────────────────────────────────────────────────────
    {
      id: "791381-m12-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381-m12-l00-p01",
          title: "أنواع الرسائل",
          order: 1,
          layout: "opener",
          source: src(66),
          blocks: [
            {
              id: "m12-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الوحدة الثامنة", unitNumber: "08", title: "أنواع الرسائل",
              subtitle: "ما الفرق بين رسالة لجهاز واحد، لمجموعة، أو للجميع؟",
              goal: "الهدف: فكرة أساسية + مثال واضح + تدريب",
            },
          ],
        },
      ],
    },

    // ── l01 — Unicast / Multicast / Broadcast (PDF 67–69) ────────────────────────────────────────────────────
    {
      id: "791381-m12-l01",
      title: "Unicast / Multicast / Broadcast",
      order: 1,
      pages: [
        // PDF 67 — the three kinds side by side (+ the delivery simulation, after all three are introduced)
        {
          id: "791381-m12-l01-p01",
          title: "Unicast / Multicast / Broadcast",
          order: 1,
          source: src(67, 67),
          keywords: ["Unicast", "Multicast", "Broadcast", "عدد المستقبلين"],
          blocks: [
            {
              id: "m12-l01-p01-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m12-l01-p01-uni", term: "Unicast", text: [T("رسالة من جهاز واحد إلى جهاز واحد محدّد.")], note: "جهاز واحد فقط يستقبل" },
                { id: "m12-l01-p01-multi", term: "Multicast", text: [T("رسالة من جهاز واحد إلى مجموعة محدّدة.")], note: "مجموعة محدّدة تستقبل" },
                { id: "m12-l01-p01-broad", term: "Broadcast", text: [T("رسالة من جهاز واحد إلى جميع الأجهزة.")], note: "الجميع يستقبلون" },
              ],
            },
            {
              id: "m12-l01-p01-diff", type: "callout", origin: "book", kind: "important", title: "الفرق الأساسي",
              spans: [T("الفرق هو عدد الأجهزة التي تستقبل الرسالة: واحد، مجموعة، أو الجميع.")],
            },
            {
              id: "m12-l01-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "رسالة من جهاز واحد إلى جميع الأجهزة. ما نوعها؟",
                options: [opt("m12-l01-p01-q1-a", "Unicast"), opt("m12-l01-p01-q1-b", "Multicast"), opt("m12-l01-p01-q1-c", "Broadcast", true)],
                feedback: {
                  hints: ["افحص كلمة «جميع».", "الجميع يستقبلون = بث."],
                  correctFeedback: "أحسنت — Broadcast: الجميع يستقبلون.",
                  incorrectFeedback: "افحص عدد المستقبلين في السؤال: «جميع الأجهزة» ليس واحدًا ولا مجموعة.",
                  explanation: "Unicast لجهاز واحد، Multicast لمجموعة محدّدة، Broadcast للجميع.",
                },
              },
            },
            {
              id: "m12-l01-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما الفرق الأساسي بين الأنواع الثلاثة حسب الكتاب؟",
                options: [opt("m12-l01-p01-q2-a", "سرعة الرسالة"), opt("m12-l01-p01-q2-b", "عدد الأجهزة التي تستقبل الرسالة", true), opt("m12-l01-p01-q2-c", "طول الرسالة")],
                feedback: {
                  hints: ["افحص صندوق «الفرق الأساسي».", "واحد، مجموعة، أو الجميع."],
                  correctFeedback: "أحسنت — الفرق هو عدد المستقبلين.",
                  incorrectFeedback: "افحص صندوق «الفرق الأساسي»: لا يتحدث عن السرعة أو الطول.",
                  explanation: "الفرق هو عدد الأجهزة التي تستقبل الرسالة: واحد، مجموعة، أو الجميع.",
                },
              },
            },
          ],
        },
        // PDF 68 — Unicast و Multicast (examples + the Multicast warning)
        {
          id: "791381-m12-l01-p02",
          title: "Unicast و Multicast",
          order: 2,
          source: src(68, 68),
          keywords: ["Unicast", "Multicast", "بث فيديو", "مجموعة مشتركين"],
          blocks: [
            {
              id: "m12-l01-p02-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m12-l01-p02-uni", term: "Unicast", text: [T("من مصدر واحد إلى هدف واحد. مثال: تصفّح موقع أو إرسال رسالة لجهاز محدّد.")], note: "هدف واحد فقط" },
                { id: "m12-l01-p02-multi", term: "Multicast", text: [T("من مصدر واحد إلى مجموعة محدّدة. مثال: بث فيديو لمجموعة مشتركين.")], note: "مجموعة محدّدة فقط" },
              ],
            },
            {
              id: "m12-l01-p02-warn", type: "callout", origin: "book", kind: "warning", title: "انتبه",
              spans: [T("في "), L("Multicast"), T(" لا تصل الرسالة للجميع، بل فقط للمجموعة المطلوبة.")],
            },
            {
              id: "m12-l01-p02-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("في رسم الكتاب: في "), L("Unicast"), T(" يستقبل جهاز واحد والباقي «لا يستقبل»؛ وفي "), L("Multicast"), T(" يستقبل أعضاء المجموعة فقط، ومن ليس في المجموعة «لا يستقبل» حتى لو كان في الشبكة نفسها.")],
            },
            {
              id: "m12-l01-p02-ex1", type: "example", origin: "teacher-enrichment", mode: "solved",
              title: "مثال محلول: تصفّح موقع أم بث فيديو؟",
              prompt: "طالب يتصفّح موقعًا على حاسوبه، ومعلم يبث درسًا مصوّرًا لمجموعة طلاب مشتركين. ما نوع كل رسالة؟",
              steps: [
                { text: "التصفّح: رسالة من جهاز الطالب إلى خادم الموقع — مصدر واحد وهدف واحد." },
                { text: "إذن التصفّح Unicast (المثال الأول في الكتاب)." },
                { text: "البث المصوّر: من جهاز المعلم إلى مجموعة المشتركين فقط — مصدر واحد ومجموعة محدّدة." },
                { text: "إذن البث لمجموعة المشتركين Multicast (المثال الثاني في الكتاب)." },
              ],
              result: "التصفّح = Unicast · بث الفيديو لمجموعة = Multicast",
              explanation: "لو وصل البث لكل الأجهزة في الشبكة بلا استثناء لكان Broadcast.",
            },
            {
              id: "m12-l01-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "في Multicast تصل الرسالة إلى جميع الأجهزة في الشبكة.",
                answer: false,
                feedback: {
                  hints: ["افحص صندوق «انتبه».", "المجموعة المطلوبة فقط."],
                  correctFeedback: "صحيح أنها خطأ — في Multicast تصل الرسالة للمجموعة المطلوبة فقط.",
                  incorrectFeedback: "افحص صندوق «انتبه»: «لا تصل الرسالة للجميع، بل فقط للمجموعة المطلوبة».",
                  explanation: "الجميع = Broadcast؛ المجموعة فقط = Multicast.",
                },
              },
            },
            {
              id: "m12-l01-p02-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "إرسال رسالة إلى جهاز واحد محدّد، مثل تصفّح موقع. ما نوعها؟",
                options: [opt("m12-l01-p02-q2-a", "Unicast", true), opt("m12-l01-p02-q2-b", "Multicast"), opt("m12-l01-p02-q2-c", "Broadcast")],
                feedback: {
                  hints: ["كم هدفًا في الرسالة؟", "هدف واحد = Uni."],
                  correctFeedback: "أحسنت — Unicast: مصدر واحد وهدف واحد.",
                  incorrectFeedback: "افحص عدد الأهداف: «جهاز واحد محدّد» يعني هدفًا واحدًا فقط.",
                  explanation: "مثال Unicast في الكتاب: تصفّح موقع أو إرسال رسالة لجهاز محدّد.",
                },
              },
            },
          ],
        },
        // PDF 69 — Broadcast (stays inside the network; the Router stops it; the broadcast MAC)
        {
          id: "791381-m12-l01-p03",
          title: "Broadcast",
          order: 3,
          source: src(69, 69),
          keywords: ["Broadcast", "البث", "الراوتر", "يتوقّف هنا", "FF:FF:FF:FF:FF:FF"],
          blocks: [
            {
              id: "m12-l01-p03-def", type: "text", origin: "book",
              spans: [L("Broadcast"), T(" يعني إرسال الرسالة إلى جميع الأجهزة داخل الشبكة.")],
            },
            {
              id: "m12-l01-p03-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m12-l01-p03-f1", text: [T("مفيد عند البحث عن جهاز أو خدمة.")] },
                { id: "m12-l01-p03-f2", text: [T("يزيد حركة المرور داخل الشبكة.")] },
                { id: "m12-l01-p03-f3", text: [T("يُستخدم بشكل محدود في الشبكات الحديثة.")] },
              ],
            },
            {
              id: "m12-l01-p03-figure", type: "callout", origin: "book", kind: "important", title: "الشبكة نفسها",
              spans: [T("في رسم الصفحة: البث يصل من "), L("Switch"), T(" لكل الأجهزة داخل الشبكة، ولا يعبر الراوتر — عند "), L("Router"), T(" مكتوب «يتوقّف هنا».")],
            },
            {
              id: "m12-l01-p03-addr", type: "callout", origin: "book", kind: "important", title: "عنوان البث",
              spans: [L(BCAST)],
            },
            {
              id: "m12-l01-p03-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("الراوتر لا يمرّر "), L("Broadcast"), T(" عادةً بين الشبكات المختلفة، بل يبقى داخل الشبكة نفسها.")],
            },
            {
              // ENRICHMENT — simulation / message-delivery / v1, placed on PDF 69 (not PDF 67) because its Broadcast mode
              // shows the Router boundary («يتوقّف هنا») that only THIS page states: the student first learns one /
              // group / everyone (67), sees the Unicast / Multicast examples (68) and the Broadcast boundary (69), THEN runs
              // all three modes. Book order is sacred; the simulator exists once.
              id: "m12-l01-p03-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "message-delivery", version: 1,
              title: "جرّب: من يستقبل الرسالة؟",
              description: "اختر نوع الرسالة ثم اضغط «أرسل الرسالة» وعدّ الأجهزة التي تستقبلها.",
              source: src(69, 69),
              capabilities: { fullscreen: true, reset: true, replay: true, animated: true, interactive: true },
              fallback: { text: "Unicast: رسالة من جهاز واحد إلى جهاز واحد محدّد، فيستقبلها جهاز واحد فقط. Multicast: رسالة من جهاز واحد إلى مجموعة محدّدة، فتستقبلها المجموعة فقط لا الجميع. Broadcast: رسالة من جهاز واحد إلى جميع الأجهزة داخل الشبكة، والراوتر لا يمرّرها إلى شبكة أخرى. الفرق هو عدد الأجهزة التي تستقبل الرسالة." },
              config: {
                sender: "PC1", receivers: ["PC2", "PC3", "PC4"], switchLabel: "Switch",
                unicast: { target: "PC3", caption: "Unicast: جهاز واحد فقط يستقبل الرسالة." },
                multicast: { group: ["PC2", "PC4"], caption: "Multicast: المجموعة المحدّدة فقط تستقبل، ولا تصل الرسالة للجميع." },
                broadcast: { caption: "Broadcast: جميع الأجهزة داخل الشبكة تستقبل الرسالة، والراوتر لا يمرّرها إلى شبكة أخرى.", router: { label: "Router", stopLabel: "يتوقّف هنا", outside: "شبكة أخرى" } },
                receivesLabel: "يستقبل", notLabel: "لا يستقبل", localLabel: "الشبكة نفسها",
              },
            },
            {
              id: "m12-l01-p03-ex1", type: "example", origin: "teacher-enrichment", mode: "solved",
              title: "مثال محلول: هل يصل البث إلى الشبكة الأخرى؟",
              prompt: "PC1 في شبكة 1 يرسل رسالة Broadcast. في الشبكة نفسها PC2 و PC3، وخلف الراوتر شبكة 2 فيها PC9. من يستقبل؟",
              steps: [
                { text: "Broadcast يصل إلى جميع الأجهزة داخل الشبكة نفسها: PC2 و PC3 يستقبلان." },
                { text: "الرسالة تصل إلى الراوتر، لكنه لا يمرّر Broadcast عادةً بين الشبكات المختلفة." },
                { text: "PC9 في شبكة 2 خلف الراوتر، فلا يستقبل." },
              ],
              result: "يستقبل PC2 و PC3 فقط؛ البث يتوقّف عند الراوتر.",
              explanation: "لهذا يقول الكتاب إن البث «يبقى داخل الشبكة نفسها».",
            },
            {
              id: "m12-l01-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "الراوتر يمرّر رسالة Broadcast عادةً إلى الشبكات الأخرى.",
                answer: false,
                feedback: {
                  hints: ["افحص كلمة «يتوقّف هنا» في الرسم.", "البث يبقى داخل الشبكة نفسها."],
                  correctFeedback: "صحيح أنها خطأ — الراوتر لا يمرّر Broadcast عادةً بين الشبكات.",
                  incorrectFeedback: "افحص صندوق «تذكّر»: «الراوتر لا يمرّر Broadcast عادةً بين الشبكات المختلفة».",
                  explanation: "البث يصل لكل الأجهزة داخل الشبكة، ولا يعبر الراوتر.",
                },
              },
            },
            {
              id: "m12-l01-p03-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "لماذا يُستخدم Broadcast بشكل محدود في الشبكات الحديثة؟",
                options: [opt("m12-l01-p03-q2-a", "لأنه يزيد حركة المرور داخل الشبكة", true), opt("m12-l01-p03-q2-b", "لأنه لا يصل إلى أي جهاز"), opt("m12-l01-p03-q2-c", "لأنه يحتاج كابل Fiber")],
                feedback: {
                  hints: ["افحص السطر الثاني في قائمة الصفحة.", "كثرة الرسائل = ازدحام."],
                  correctFeedback: "أحسنت — البث يزيد حركة المرور داخل الشبكة.",
                  incorrectFeedback: "افحص قائمة الصفحة: البث «يزيد حركة المرور داخل الشبكة»، وهذا سبب الحدّ من استعماله.",
                  explanation: "مفيد للبحث عن جهاز أو خدمة، لكنه يزيد حركة المرور، لذلك يُستخدم بشكل محدود.",
                },
              },
            },
          ],
        },
      ],
    },

    // ── l02 — the broadcast address + protocols that use Broadcast (PDF 70–71) ──────────────────────────────
    {
      id: "791381-m12-l02",
      title: "عنوان Broadcast والبروتوكولات",
      order: 2,
      pages: [
        // PDF 70 — كيف نعرف عنوان Broadcast؟ (+ the broadcast-address builder)
        {
          id: "791381-m12-l02-p01",
          title: "كيف نعرف عنوان Broadcast؟",
          order: 1,
          source: src(70, 70),
          keywords: ["عنوان Broadcast", "/8", "/16", "/24", "255"],
          blocks: [
            {
              id: "m12-l02-p01-table", type: "table", origin: "book",
              caption: "أمثلة الكتاب على عنوان Broadcast",
              headers: ["عنوان الشبكة", "القناع", "Broadcast"],
              columnDirs: ["ltr", "ltr", "ltr"],
              rows: [
                ["10.0.0.0", "/8", "10.255.255.255"],
                ["192.168.10.0", "/24", "192.168.10.255"],
                ["192.168.0.0", "/16", "192.168.255.255"],
                ["172.18.20.0", "/24", "172.18.20.255"],
                ["172.30.0.0", "/16", "172.30.255.255"],
              ],
            },
            {
              id: "m12-l02-p01-rule", type: "callout", origin: "book", kind: "remember", title: "القاعدة",
              spans: [T("في "), L("/24"), T(" يكون غالبًا آخر رقم "), L("255"), T("، وفي "), L("/16"), T(" يكون آخر رقمين "), L("255.255"), T(".")],
            },
            {
              id: "m12-l02-p01-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("نبقي أقسام الشبكة كما هي ونجعل أقسام الجهاز "), L("255"), T(": مع "), L("/8"), T(" قسم واحد للشبكة فتصير الأقسام الثلاثة الأخيرة "), L("255.255.255"), T("، ومع "), L("/16"), T(" قسمان للشبكة، ومع "), L("/24"), T(" ثلاثة أقسام للشبكة ويبقى قسم واحد للجهاز.")],
            },
            {
              id: "m12-l02-p01-ex1", type: "example", origin: "teacher-enrichment", mode: "solved",
              title: "مثال محلول: عنوان Broadcast للشبكة 172.18.20.0 /24",
              prompt: "ما عنوان Broadcast للشبكة 172.18.20.0 مع القناع /24؟",
              steps: [
                { text: "/24 يعني: الأقسام الثلاثة الأولى للشبكة (172.18.20)، والقسم الأخير للجهاز (0)." },
                { text: "نبقي جزء الشبكة كما هو: 172.18.20." },
                { text: "نجعل قسم الجهاز 255." },
              ],
              result: "172.18.20.255",
              explanation: "هذا هو السطر الرابع في جدول الكتاب. مع /16 كان سيصبح القسمان الأخيران 255.255.",
            },
            {
              // ENRICHMENT — interactive-diagram / broadcast-address / v1: the book's five rows as examples to
              // inspect, then guided attempts at the SAME whole-octet level (/8, /16, /24 only).
              id: "m12-l02-p01-builder", type: "interactive-diagram", origin: "teacher-enrichment",
              interactionType: "broadcast-address", version: 1,
              title: "ابنِ عنوان Broadcast",
              description: "اختر شبكة من الأمثلة لترى أقسام الشبكة وأقسام الجهاز، ثم في التدريب اجعل أقسام الجهاز 255 واضغط «تحقّق».",
              source: src(70, 70),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "لإيجاد عنوان Broadcast نبقي أقسام الشبكة كما هي ونجعل أقسام الجهاز 255. أمثلة الكتاب: 10.0.0.0 /8 يصبح 10.255.255.255؛ 192.168.10.0 /24 يصبح 192.168.10.255؛ 192.168.0.0 /16 يصبح 192.168.255.255؛ 172.18.20.0 /24 يصبح 172.18.20.255؛ 172.30.0.0 /16 يصبح 172.30.255.255." },
              config: {
                examples: [
                  { network: "10.0.0.0", prefix: 8 },
                  { network: "192.168.10.0", prefix: 24 },
                  { network: "192.168.0.0", prefix: 16 },
                  { network: "172.18.20.0", prefix: 24 },
                  { network: "172.30.0.0", prefix: 16 },
                ],
                practice: [
                  { network: "192.168.50.0", prefix: 24 },
                  { network: "10.10.0.0", prefix: 16 },
                  { network: "20.0.0.0", prefix: 8 },
                ],
                networkLabel: "شبكة", hostLabel: "جهاز",
                rule: "نبقي أقسام الشبكة كما هي، ونجعل أقسام الجهاز 255.",
              },
            },
            {
              id: "m12-l02-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "ما عنوان Broadcast للشبكة 192.168.20.0 مع القناع /24؟ (اكتب العنوان كاملًا)",
                answer: "192.168.20.255",
                feedback: {
                  hints: ["مع /24 تبقى الأقسام الثلاثة الأولى كما هي.", "القسم الأخير فقط يصبح 255."],
                  correctFeedback: "أحسنت — 192.168.20.255.",
                  incorrectFeedback: "افحص القاعدة: مع /24 نبقي 192.168.20 ونجعل القسم الأخير 255.",
                  explanation: "192.168.20.0 /24 يصبح 192.168.20.255.",
                },
              },
            },
            {
              id: "m12-l02-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "ما عنوان Broadcast للشبكة 172.16.0.0 مع القناع /16؟",
                answer: "172.16.255.255",
                feedback: {
                  hints: ["مع /16 يبقى القسمان الأولان كما هما.", "القسمان الأخيران يصبحان 255.255."],
                  correctFeedback: "أحسنت — 172.16.255.255.",
                  incorrectFeedback: "افحص القاعدة: مع /16 نبقي 172.16 ونجعل القسمين الأخيرين 255.255.",
                  explanation: "172.16.0.0 /16 يصبح 172.16.255.255.",
                },
              },
            },
            {
              id: "m12-l02-p01-q3", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما عنوان Broadcast للشبكة 10.0.0.0 مع القناع /8؟",
                options: [opt("m12-l02-p01-q3-a", "10.0.0.255"), opt("m12-l02-p01-q3-b", "10.255.255.255", true), opt("m12-l02-p01-q3-c", "255.255.255.255")],
                feedback: {
                  hints: ["مع /8 قسم واحد فقط للشبكة.", "الأقسام الثلاثة الأخيرة للجهاز."],
                  correctFeedback: "أحسنت — 10.255.255.255 (السطر الأول في جدول الكتاب).",
                  incorrectFeedback: "افحص كم قسمًا للشبكة مع /8: قسم واحد (10) يبقى، والأقسام الثلاثة الأخرى تصبح 255.",
                  explanation: "10.0.0.0 /8 يصبح 10.255.255.255.",
                },
              },
            },
          ],
        },
        // PDF 71 — بروتوكولات تستعمل Broadcast
        {
          id: "791381-m12-l02-p02",
          title: "بروتوكولات تستعمل Broadcast",
          order: 2,
          source: src(71, 71),
          keywords: ["ARP", "DHCP", "RIP", "بروتوكولات"],
          blocks: [
            {
              id: "m12-l02-p02-table", type: "table", origin: "book",
              headers: ["البروتوكول", "متى يستعمل Broadcast؟"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["ARP", "عندما يبحث الجهاز عن MAC Address لجهاز داخل نفس الشبكة."],
                ["DHCP", "عندما يبحث الجهاز عن خادم DHCP للحصول على عنوان IP."],
                ["RIP", "لإعلان جداول التوجيه — الإصدار الأول يستعمل Broadcast، والثاني Multicast."],
              ],
            },
            {
              id: "m12-l02-p02-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [L("Broadcast"), T(" مهم، لكن استعماله بكثرة يجعل الشبكة أبطأ بسبب كثرة الرسائل.")],
            },
            {
              id: "m12-l02-p02-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "لماذا البث هنا؟",
              spans: [T("في الحالات الثلاث لا يعرف الجهاز عنوان الطرف الآخر بعد، فيسأل الجميع داخل الشبكة: «من يملك هذا العنوان؟» ("), L("ARP"), T(") أو «أين خادم "), L("DHCP"), T("؟». الجهاز المعني وحده يجيب.")],
            },
            {
              id: "m12-l02-p02-match", type: "practice-table", origin: "teacher-enrichment",
              caption: "تحقّق من نفسك: أي بروتوكول يصفه كل سطر؟",
              headers: ["الحالة", "البروتوكول"],
              columnDirs: ["rtl", "ltr"],
              rows: [
                ["الجهاز يبحث عن خادم للحصول على عنوان IP.", PROTO("DHCP")],
                ["الجهاز يبحث عن MAC Address لجهاز في نفس الشبكة.", PROTO("ARP")],
                ["إعلان جداول التوجيه.", PROTO("RIP")],
              ],
            },
            {
              id: "m12-l02-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي إصدار من RIP يستعمل Multicast بدل Broadcast؟",
                options: [opt("m12-l02-p02-q1-a", "الإصدار الأول"), opt("m12-l02-p02-q1-b", "الإصدار الثاني", true)],
                feedback: {
                  hints: ["افحص سطر RIP في الجدول.", "الأول Broadcast، والثاني …"],
                  correctFeedback: "أحسنت — الإصدار الأول Broadcast، والثاني Multicast.",
                  incorrectFeedback: "افحص سطر RIP: «الإصدار الأول يستعمل Broadcast، والثاني Multicast».",
                  explanation: "RIP v1 يستعمل Broadcast، و RIP v2 يستعمل Multicast.",
                },
              },
            },
            {
              id: "m12-l02-p02-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "استعمال Broadcast بكثرة يجعل الشبكة أبطأ.",
                answer: true,
                feedback: {
                  hints: ["افحص صندوق «تذكّر».", "كثرة الرسائل …"],
                  correctFeedback: "صحيح — كثرة رسائل البث تجعل الشبكة أبطأ.",
                  incorrectFeedback: "افحص صندوق «تذكّر»: «استعماله بكثرة يجعل الشبكة أبطأ بسبب كثرة الرسائل».",
                  explanation: "Broadcast مهم لكنه يزيد حركة المرور.",
                },
              },
            },
          ],
        },
      ],
    },

    // ── l03 — storage units + message structure (PDF 72–74) ─────────────────────────────────────────────────
    {
      id: "791381-m12-l03",
      title: "وحدات التخزين ومبنى الرسالة",
      order: 3,
      pages: [
        // PDF 72 — وحدات التخزين
        {
          id: "791381-m12-l03-p01",
          title: "وحدات التخزين",
          order: 1,
          source: src(72, 72),
          keywords: ["Bit", "Byte", "KB", "MB", "GB", "TB", "1024"],
          blocks: [
            {
              id: "m12-l03-p01-def", type: "callout", origin: "book", kind: "important", title: "تعريف",
              spans: [T("وحدات التخزين تقيس كمية البيانات التي يمكن حفظها في الأجهزة.")],
            },
            {
              id: "m12-l03-p01-table", type: "table", origin: "book",
              headers: ["الوحدة", "المعنى المختصر"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Bit", "أصغر وحدة: 0 أو 1"],
                ["Byte", "8 بت، تقريبًا حرف واحد"],
                ["KB", "1024 بايت"],
                ["MB", "1024 كيلوبايت"],
                ["GB", "1024 ميجابايت"],
                ["TB", "1024 جيجابايت"],
              ],
            },
            {
              id: "m12-l03-p01-note", type: "callout", origin: "book", kind: "tip", title: "لاحظ",
              spans: [T("كلما صعدنا في الجدول، زادت كمية البيانات التي يمكن تخزينها بمقدار 1024 ضعفًا.")],
            },
            {
              id: "m12-l03-p01-ladder", type: "list", origin: "teacher-enrichment", variant: "ordered", title: "السلّم من الأصغر إلى الأكبر",
              items: [
                { id: "m12-l03-p01-s1", term: "Bit", text: [T("0 أو 1")] },
                { id: "m12-l03-p01-s2", term: "Byte", text: [T("= 8 بت")] },
                { id: "m12-l03-p01-s3", term: "KB", text: [T("= 1024 بايت")] },
                { id: "m12-l03-p01-s4", term: "MB", text: [T("= 1024 كيلوبايت")] },
                { id: "m12-l03-p01-s5", term: "GB", text: [T("= 1024 ميجابايت")] },
                { id: "m12-l03-p01-s6", term: "TB", text: [T("= 1024 جيجابايت")] },
              ],
            },
            {
              id: "m12-l03-p01-ex1", type: "example", origin: "teacher-enrichment", mode: "solved",
              title: "مثال محلول: كم بت في 2 بايت؟ وكم كيلوبايت في 1 ميجابايت؟",
              steps: [
                { text: "من الجدول: 1 بايت = 8 بت، إذن 2 بايت = 2 × 8 = 16 بت." },
                { text: "من الجدول: 1 ميجابايت = 1024 كيلوبايت." },
              ],
              result: "2 بايت = 16 بت · 1 MB = 1024 KB",
              explanation: "كل درجة في السلّم تساوي 1024 ضعفًا من الدرجة التي قبلها (ما عدا Byte = 8 بت).",
            },
            {
              id: "m12-l03-p01-match", type: "practice-table", origin: "teacher-enrichment",
              caption: "تحقّق من نفسك: أي وحدة يصفها كل سطر؟",
              headers: ["المعنى", "الوحدة"],
              columnDirs: ["rtl", "ltr"],
              rows: [
                ["أصغر وحدة: 0 أو 1", UNIT("Bit")],
                ["1024 كيلوبايت", UNIT("MB")],
                ["8 بت، تقريبًا حرف واحد", UNIT("Byte")],
                ["1024 جيجابايت", UNIT("TB")],
              ],
            },
            {
              id: "m12-l03-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي ترتيب صحيح من الأصغر إلى الأكبر؟",
                options: [opt("m12-l03-p01-q1-a", "Bit · Byte · KB · MB · GB · TB", true), opt("m12-l03-p01-q1-b", "Byte · Bit · MB · KB · TB · GB"), opt("m12-l03-p01-q1-c", "KB · Bit · Byte · MB · GB · TB")],
                feedback: {
                  hints: ["ابدأ من أصغر وحدة: 0 أو 1.", "اتبع ترتيب الجدول من الأعلى إلى الأسفل."],
                  correctFeedback: "أحسنت — Bit ثم Byte ثم KB ثم MB ثم GB ثم TB.",
                  incorrectFeedback: "افحص ترتيب الجدول: كل سطر أكبر من الذي قبله؛ أصغر وحدة هي Bit.",
                  explanation: "الجدول مرتّب من الأصغر (Bit) إلى الأكبر (TB).",
                },
              },
            },
            {
              id: "m12-l03-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "1 كيلوبايت = كم بايت؟ (اكتب الرقم)",
                answer: "1024",
                feedback: {
                  hints: ["افحص سطر KB في الجدول.", "الرقم الذي يتكرر في كل درجة من السلّم."],
                  correctFeedback: "صحيح — 1 KB = 1024 بايت.",
                  incorrectFeedback: "افحص سطر KB في الجدول: «1024 بايت».",
                  explanation: "الكتاب يعتمد 1024 لكل درجة.",
                },
              },
            },
          ],
        },
        // PDF 73 — مبنى الرسائل في الشبكات
        {
          id: "791381-m12-l03-p02",
          title: "مبنى الرسائل في الشبكات",
          order: 2,
          source: src(73, 73),
          keywords: ["IP المصدر", "IP الهدف", "MAC المصدر", "MAC الهدف", "مبنى الرسالة"],
          blocks: [
            {
              id: "m12-l03-p02-idea", type: "callout", origin: "book", kind: "important", title: "الفكرة",
              spans: [T("حتى تنتقل الرسالة في الشبكة، تحتاج معلومات تساعدها على الوصول للهدف الصحيح.")],
            },
            {
              id: "m12-l03-p02-fields", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m12-l03-p02-f1", term: "IP المصدر", text: [T("عنوان الجهاز المرسِل.")] },
                { id: "m12-l03-p02-f2", term: "IP الهدف", text: [T("عنوان الجهاز المستقبِل.")] },
                { id: "m12-l03-p02-f3", term: "MAC المصدر", text: [T("عنوان كرت الشبكة للمرسِل.")] },
                { id: "m12-l03-p02-f4", term: "MAC الهدف", text: [T("عنوان كرت الشبكة للمستقبِل.")] },
              ],
            },
            {
              id: "m12-l03-p02-unicast", type: "callout", origin: "book", kind: "remember", title: "في رسالة Unicast",
              spans: [T("يوجد مصدر واحد وهدف واحد محدّد، فتُملأ كل الحقول الأربعة بعناوين معروفة.")],
            },
            {
              id: "m12-l03-p02-ex1", type: "example", origin: "teacher-enrichment", mode: "solved",
              title: "مثال محلول: حقول رسالة Unicast من PC1 إلى PC2",
              prompt: "PC1 (عنوانه 192.168.1.10 وكرت شبكته A0:02:AF:2D:10:22) يرسل رسالة Unicast إلى PC2 (عنوانه 192.168.1.20 وكرت شبكته B4:11:C2:07:9E:31). ماذا في الحقول الأربعة؟",
              steps: [
                { text: "IP المصدر = عنوان المرسِل PC1: 192.168.1.10" },
                { text: "IP الهدف = عنوان المستقبِل PC2: 192.168.1.20" },
                { text: "MAC المصدر = كرت شبكة PC1: A0:02:AF:2D:10:22" },
                { text: "MAC الهدف = كرت شبكة PC2: B4:11:C2:07:9E:31" },
              ],
              result: "كل الحقول الأربعة معروفة لأن المصدر واحد والهدف واحد محدّد.",
              explanation: "الحقلان IP يحدّدان الجهازين، والحقلان MAC يحدّدان كرتي الشبكة.",
            },
            {
              id: "m12-l03-p02-table", type: "table", origin: "teacher-enrichment",
              caption: "الحقول الأربعة في المثال",
              headers: ["الحقل", "القيمة في المثال"],
              columnDirs: ["rtl", "ltr"],
              rows: [
                ["IP المصدر", "192.168.1.10"],
                ["IP الهدف", "192.168.1.20"],
                ["MAC المصدر", "A0:02:AF:2D:10:22"],
                ["MAC الهدف", "B4:11:C2:07:9E:31"],
              ],
            },
            {
              id: "m12-l03-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي حقل يحمل عنوان كرت الشبكة للجهاز المستقبِل؟",
                options: [opt("m12-l03-p02-q1-a", "IP الهدف"), opt("m12-l03-p02-q1-b", "MAC الهدف", true), opt("m12-l03-p02-q1-c", "MAC المصدر")],
                feedback: {
                  hints: ["كرت الشبكة = MAC.", "المستقبِل = الهدف."],
                  correctFeedback: "أحسنت — MAC الهدف: عنوان كرت الشبكة للمستقبِل.",
                  incorrectFeedback: "افحص كلمتي السؤال: «كرت الشبكة» تعني MAC، و«المستقبِل» تعني الهدف.",
                  explanation: "IP للجهاز، MAC لكرت الشبكة؛ المصدر مرسِل، الهدف مستقبِل.",
                },
              },
            },
            {
              id: "m12-l03-p02-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "في رسالة Unicast تُملأ الحقول الأربعة كلها بعناوين معروفة.",
                answer: true,
                feedback: {
                  hints: ["افحص صندوق «في رسالة Unicast».", "مصدر واحد وهدف واحد محدّد."],
                  correctFeedback: "صحيح — مصدر واحد وهدف واحد محدّد، فكل الحقول معروفة.",
                  incorrectFeedback: "افحص صندوق «في رسالة Unicast»: «تُملأ كل الحقول الأربعة بعناوين معروفة».",
                  explanation: "في Unicast الهدف محدّد، فعنواناه IP و MAC معروفان.",
                },
              },
            },
          ],
        },
        // PDF 74 — مبنى رسالة Broadcast (+ the Unit-8 closing review)
        {
          id: "791381-m12-l03-p03",
          title: "مبنى رسالة Broadcast",
          order: 3,
          source: src(74, 74),
          keywords: ["Broadcast Domain", "MAC الهدف", "FF:FF:FF:FF:FF:FF", "الراوتر يفصل"],
          blocks: [
            {
              id: "m12-l03-p03-def", type: "text", origin: "book",
              spans: [T("في "), L("Broadcast"), T(" لا يوجد جهاز هدف واحد فقط، بل الرسالة تصل للجميع داخل نفس الشبكة.")],
            },
            {
              id: "m12-l03-p03-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m12-l03-p03-f1", text: [T("يُستعمل للبحث عن خدمة أو جهاز.")] },
                { id: "m12-l03-p03-f2", text: [T("يبقى داخل نفس "), L("Broadcast Domain"), T(".")] },
                { id: "m12-l03-p03-f3", text: [T("الراوتر يفصل بين مجالات "), L("Broadcast"), T(".")] },
              ],
            },
            {
              id: "m12-l03-p03-mac", type: "callout", origin: "book", kind: "important", title: "MAC الهدف في Broadcast",
              spans: [L(BCAST), T(" — أي: أرسل الرسالة للجميع داخل الشبكة المحلية.")],
            },
            {
              id: "m12-l03-p03-compare", type: "table", origin: "teacher-enrichment",
              caption: "مقارنة الحقول: Unicast مقابل Broadcast (المثال السابق)",
              headers: ["الحقل", "Unicast", "Broadcast"],
              columnDirs: ["rtl", "ltr", "ltr"],
              rows: [
                ["IP المصدر", "192.168.1.10", "192.168.1.10"],
                ["MAC المصدر", "A0:02:AF:2D:10:22", "A0:02:AF:2D:10:22"],
                ["الهدف", "جهاز واحد محدّد", "الجميع داخل الشبكة"],
                ["MAC الهدف", "B4:11:C2:07:9E:31", BCAST],
              ],
            },
            {
              id: "m12-l03-p03-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("المصدر لا يتغيّر: الجهاز نفسه يرسل. الذي يتغيّر هو الهدف — بدل عنوان كرت شبكة جهاز واحد، يُوضع "), L(BCAST), T(" فيفهم كل جهاز في الشبكة المحلية أن الرسالة له أيضًا. الراوتر لا يمرّرها، فتبقى داخل "), L("Broadcast Domain"), T(" نفسه.")],
            },
            {
              id: "m12-l03-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ماذا يُكتب في حقل MAC الهدف في رسالة Broadcast؟",
                options: [opt("m12-l03-p03-q1-a", "عنوان كرت شبكة الراوتر"), opt("m12-l03-p03-q1-b", "FF:FF:FF:FF:FF:FF", true), opt("m12-l03-p03-q1-c", "00:00:00:00:00:00")],
                feedback: {
                  hints: ["افحص صندوق «MAC الهدف في Broadcast».", "كل المنازل F."],
                  correctFeedback: "أحسنت — FF:FF:FF:FF:FF:FF: أرسل الرسالة للجميع داخل الشبكة المحلية.",
                  incorrectFeedback: "افحص الصندوق: الهدف ليس جهازًا واحدًا، فيُكتب عنوان البث المكوّن من F.",
                  explanation: "MAC الهدف في Broadcast = FF:FF:FF:FF:FF:FF.",
                },
              },
            },
            // ── closing review (easy → medium → exam-like) ──
            {
              id: "m12-l03-p03-review", type: "heading", origin: "teacher-enrichment", level: 3, text: "مراجعة ختامية للوحدة الثامنة",
            },
            {
              id: "m12-l03-p03-r0", type: "practice-table", origin: "teacher-enrichment",
              caption: "صنّف كل رسالة: Unicast أم Multicast أم Broadcast؟",
              headers: ["الرسالة", "النوع"],
              columnDirs: ["rtl", "ltr"],
              rows: [
                ["تصفّح موقع من جهاز واحد.", CAST("Unicast")],
                ["بث فيديو لمجموعة مشتركين محدّدة.", CAST("Multicast")],
                ["جهاز يسأل كل الشبكة عن خادم DHCP.", CAST("Broadcast")],
                ["إرسال رسالة إلى جهاز واحد محدّد.", CAST("Unicast")],
              ],
            },
            {
              id: "m12-l03-p03-r1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "في شبكة فيها 5 أجهزة، أرسل PC1 رسالة Multicast إلى مجموعة من جهازين. كم جهازًا يستقبلها؟",
                options: [opt("m12-l03-p03-r1-a", "جهاز واحد"), opt("m12-l03-p03-r1-b", "جهازان", true), opt("m12-l03-p03-r1-c", "الأجهزة الأربعة الأخرى كلها")],
                feedback: {
                  hints: ["Multicast = المجموعة المحدّدة فقط.", "كم جهازًا في المجموعة؟"],
                  correctFeedback: "أحسنت — تستقبل المجموعة المحدّدة فقط: جهازان.",
                  incorrectFeedback: "افحص تعريف Multicast: تصل للمجموعة المطلوبة فقط، لا لجهاز واحد ولا للجميع.",
                  explanation: "عدد المستقبلين في Multicast = عدد أعضاء المجموعة.",
                },
              },
            },
            {
              id: "m12-l03-p03-r2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "سؤال بأسلوب الامتحان: شبكتان مرتبطتان براوتر. أرسل جهاز في الشبكة الأولى رسالة Broadcast. من يستقبلها؟",
                options: [opt("m12-l03-p03-r2-a", "كل أجهزة الشبكتين"), opt("m12-l03-p03-r2-b", "أجهزة الشبكة الأولى فقط", true), opt("m12-l03-p03-r2-c", "الراوتر فقط")],
                feedback: {
                  hints: ["الراوتر يفصل بين مجالات Broadcast.", "البث يبقى داخل الشبكة نفسها."],
                  correctFeedback: "أحسنت — البث يبقى داخل الشبكة الأولى، والراوتر لا يمرّره.",
                  incorrectFeedback: "افحص جملتي الكتاب: «يبقى داخل نفس Broadcast Domain» و«الراوتر يفصل بين مجالات Broadcast».",
                  explanation: "الراوتر لا يمرّر Broadcast عادةً بين الشبكات المختلفة.",
                },
              },
            },
            {
              id: "m12-l03-p03-r3", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "سؤال بأسلوب الامتحان: ما عنوان Broadcast للشبكة 172.30.0.0 مع القناع /16؟",
                answer: "172.30.255.255",
                feedback: {
                  hints: ["مع /16 قسمان للشبكة يبقيان كما هما.", "القسمان الأخيران 255.255."],
                  correctFeedback: "أحسنت — 172.30.255.255 (السطر الأخير في جدول الكتاب).",
                  incorrectFeedback: "افحص القاعدة: مع /16 نبقي 172.30 ونجعل القسمين الأخيرين 255.255.",
                  explanation: "172.30.0.0 /16 يصبح 172.30.255.255.",
                },
              },
            },
          ],
        },
      ],
    },

    // ── l04 — the book's batch-2 summary (PDF 75) ────────────────────────────────────────────────────────────
    {
      id: "791381-m12-l04",
      title: "خلاصة الدفعة الثانية",
      order: 4,
      pages: [
        {
          id: "791381-m12-l04-p01",
          title: "نهاية الدفعة الثانية — خلاصة سريعة",
          order: 1,
          source: src(75),
          conversionNote: "PDF 75 صفحة خلاصة ختامية للدفعة الثانية (بلا رقم صفحة مطبوع)؛ تُعرض كصفحة تعليمية ختامية داخل m12، وتلخّص مفاهيم الوحدات 5–8 كما يفعل الكتاب.",
          keywords: ["خلاصة", "الدفعة الثانية", "Hub", "Switch", "Router", "MAC", "Broadcast", "Cables"],
          blocks: [
            {
              id: "m12-l04-p01-cards", type: "list", origin: "book", variant: "cards", title: "خلاصة سريعة",
              items: [
                { id: "m12-l04-p01-hub", term: "Hub", text: [T("يرسل الرسالة للجميع.")] },
                { id: "m12-l04-p01-switch", term: "Switch", text: [T("يرسل الرسالة للمقصود فقط.")] },
                { id: "m12-l04-p01-router", term: "Router", text: [T("يربط الشبكة بالإنترنت أو بشبكات أخرى.")] },
                { id: "m12-l04-p01-mac", term: "MAC", text: [T("عنوان فيزيائي لكرت الشبكة.")] },
                { id: "m12-l04-p01-bcast", term: "Broadcast", text: [T("رسالة تصل لكل الأجهزة داخل الشبكة.")] },
                { id: "m12-l04-p01-cables", term: "Cables", text: [T("طرق انتقال البيانات بين الأجهزة.")] },
              ],
            },
            {
              id: "m12-l04-p01-next", type: "callout", origin: "book", kind: "summary", title: "الدفعة التالية",
              spans: [L("OSI"), T(" · "), L("TCP/IP"), T(" · البروتوكولات · أوامر الشبكات · التصادم والهجمات")],
            },
            {
              id: "m12-l04-p01-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "قبل أن تنتقل",
              spans: [T("هذه الخلاصة تجمع ما تعلّمته في الوحدات 5–8: الأجهزة الثلاثة، وأشكال الشبكات، والكوابل، وعنوان "), L("MAC"), T("، وأنواع الرسائل. إن لم تكن بطاقة من البطاقات واضحة لك، ارجع إلى وحدتها قبل الدفعة التالية.")],
            },
            {
              id: "m12-l04-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "مراجعة الدفعة: أي جهاز «يرسل الرسالة للمقصود فقط»؟",
                options: [opt("m12-l04-p01-q1-a", "Hub"), opt("m12-l04-p01-q1-b", "Switch", true), opt("m12-l04-p01-q1-c", "Router")],
                feedback: {
                  hints: ["افحص بطاقات الخلاصة.", "الجهاز الذي يعرف المقصود من عنوان MAC."],
                  correctFeedback: "أحسنت — Switch يرسل للمقصود فقط.",
                  incorrectFeedback: "افحص البطاقات: Hub «للجميع»، Router «يربط الشبكة»، والباقي …",
                  explanation: "Hub للجميع · Switch للمقصود فقط · Router يربط بالإنترنت أو بشبكات أخرى.",
                },
              },
            },
            {
              id: "m12-l04-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "مراجعة الدفعة: «عنوان فيزيائي لكرت الشبكة» هو تعريف …",
                options: [opt("m12-l04-p01-q2-a", "IP"), opt("m12-l04-p01-q2-b", "MAC", true), opt("m12-l04-p01-q2-c", "Broadcast")],
                feedback: {
                  hints: ["افحص بطاقة MAC في الخلاصة.", "الفيزيائي = مرتبط بالكرت."],
                  correctFeedback: "أحسنت — MAC عنوان فيزيائي لكرت الشبكة.",
                  incorrectFeedback: "افحص كلمة «فيزيائي»: IP قد يتغيّر، أما العنوان المرتبط بكرت الشبكة نفسه فهو …",
                  explanation: "MAC: عنوان فيزيائي لكرت الشبكة، غالبًا ثابت.",
                },
              },
            },
          ],
        },
      ],
    },
  ],
};

export default m12;
