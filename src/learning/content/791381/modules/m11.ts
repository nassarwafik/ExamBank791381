// Learning Materials — Units 7–8 phase: REAL converted body for Book 791381, module m11 (the book's Unit 7
// «الكوابل وعنوان MAC», source PDF 61–65, complete). Stable id m11 (next free), order 7 (batch b2).
// HARD STOP for this module: PDF 66 opens Unit 8 («أنواع الرسائل») and belongs to m12.
//
// Book-derived blocks are origin:"book" and reproduce the RENDERED source (definition, cable cards, rule/info
// callouts, the MAC facts, the example MAC, the broadcast MAC, the five MAC-use cards, the «تذكّر» reminder).
// Technical tokens (UTP, STP, Fiber Optic, Coaxial, MAC, IP, OSI, Switch, A0:02:AF:2D:10:22, FF:FF:FF:FF:FF:FF)
// are LTR spans so they never reverse inside RTL prose. Pedagogy (clarifications, solved examples, the cable
// chooser, the MAC anatomy diagram, a matching worksheet, inline practices with «what to check» feedback and hint
// ladders, the closing review) is origin:"teacher-enrichment" — never presented as book text.
// PRINTED PAGE = the rendered page circle (PDF 62 → «62» … PDF 65 → «65»); the opener (PDF 61) prints none.
// Book level preserved: no OUI/vendor structure, no locally-administered bit, no cable categories/speeds/distances.

import type { ContentModule, ContentSource, InlineSpan, PracticeOption, PracticeTableSelectCell } from "../../types";

const CID = "791381";
const src = (pdf: number, printed?: number): ContentSource => ({ kind: "book", sourceId: CID, pdfPageStart: pdf, printedPage: printed });
const L = (text: string): InlineSpan => ({ text, dir: "ltr", style: "code" });
const T = (text: string): InlineSpan => ({ text });
const opt = (id: string, text: string, correct?: true): PracticeOption => (correct ? { id, text, correct } : { id, text });
const CABLES = ["UTP", "STP", "Fiber Optic", "Coaxial"] as const;
const CABLE = (key: (typeof CABLES)[number]): PracticeTableSelectCell => ({ kind: "select", options: [...CABLES], key });

const MAC_EXAMPLE = "A0:02:AF:2D:10:22";
const MAC_BROADCAST = "FF:FF:FF:FF:FF:FF";

const m11: ContentModule = {
  id: "791381-m11",
  title: "الكوابل وعنوان MAC",
  shortTitle: "الكوابل و MAC",
  order: 7,
  source: { kind: "book", sourceId: CID, pdfPageStart: 61, pdfPageEnd: 65 },
  lessons: [
    // ── l00 — unit opener (PDF 61) ───────────────────────────────────────────────────────────────────────────
    {
      id: "791381-m11-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381-m11-l00-p01",
          title: "الكوابل وعنوان MAC",
          order: 1,
          layout: "opener",
          source: src(61),
          blocks: [
            {
              id: "m11-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الوحدة السابعة", unitNumber: "07", title: "الكوابل وعنوان MAC",
              subtitle: "كيف تنتقل البيانات؟ وما هو العنوان الفيزيائي للجهاز؟",
              goal: "الهدف: فكرة أساسية + مثال واضح + تدريب",
            },
          ],
        },
      ],
    },

    // ── l01 — network cables (PDF 62–63) ─────────────────────────────────────────────────────────────────────
    {
      id: "791381-m11-l01",
      title: "كوابل الشبكة",
      order: 1,
      pages: [
        // PDF 62 — الكوابل المستعملة في الشبكات
        {
          id: "791381-m11-l01-p01",
          title: "الكوابل المستعملة في الشبكات",
          order: 1,
          source: src(62, 62),
          keywords: ["UTP", "STP", "زوج ملتوي", "التشويش"],
          blocks: [
            {
              id: "m11-l01-p01-def", type: "callout", origin: "book", kind: "important", title: "تعريف",
              spans: [T("الكوابل هي الطريق الذي تنتقل عبره البيانات بين الأجهزة.")],
            },
            {
              id: "m11-l01-p01-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m11-l01-p01-utp", term: "UTP", text: [T("زوج ملتوي غير محمي. شائع ورخيص.")], note: "غلاف بلاستيكي فقط · بدون طبقة حماية — أرخص وأشيع" },
                { id: "m11-l01-p01-stp", term: "STP", text: [T("زوج ملتوي محمي. أفضل ضد التشويش.")], note: "غلاف + طبقة حماية معدنية · الحماية تصدّ التشويش الخارجي" },
              ],
            },
            {
              id: "m11-l01-p01-rule", type: "callout", origin: "book", kind: "remember", title: "قاعدة",
              spans: [T("كلما زادت الحماية والجودة، كان الكابل أفضل ضد التشويش وفقدان البيانات.")],
            },
            {
              id: "m11-l01-p01-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("«زوج ملتوي» يعني أسلاكًا نحاسية ملفوفة معًا داخل الكابل. في مستوى هذه الوحدة، الفرق الذي نركّز عليه بين "), L("UTP"), T(" و "), L("STP"), T(" هو وجود طبقة الحماية المعدنية: بدونها الكابل أرخص، ومعها يصدّ التشويش الخارجي أفضل.")],
            },
            {
              id: "m11-l01-p01-ex1", type: "example", origin: "teacher-enrichment", mode: "solved",
              title: "مثال محلول: أي كابل نختار قرب محركات كهربائية؟",
              prompt: "نريد تمديد شبكة في ورشة فيها محركات كهربائية تُحدث تشويشًا. أي الكابلين أنسب: UTP أم STP؟",
              steps: [
                { text: "نسأل: هل يوجد تشويش خارجي قوي؟ نعم — المحركات الكهربائية تُحدث تشويشًا." },
                { text: "نتذكّر القاعدة: كلما زادت الحماية، كان الكابل أفضل ضد التشويش." },
                { text: "STP فيه طبقة حماية معدنية تصدّ التشويش، أما UTP فبلا حماية." },
              ],
              result: "الكابل الأنسب هو STP.",
              explanation: "في صف عادي بلا تشويش قوي، يكفي UTP لأنه أرخص وأشيع.",
            },
            {
              id: "m11-l01-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "كابل STP يحتوي على طبقة حماية معدنية تصدّ التشويش الخارجي.",
                answer: true,
                feedback: {
                  hints: ["افحص بطاقة STP: ما الذي يُضاف فوق الغلاف؟", "الحرف S في STP يدلّ على الحماية (Shielded)."],
                  correctFeedback: "صحيح — STP = زوج ملتوي محمي بطبقة معدنية.",
                  incorrectFeedback: "افحص البطاقتين: أيهما يذكر «طبقة حماية معدنية»؟ ليس UTP.",
                  explanation: "STP: غلاف + طبقة حماية معدنية تصدّ التشويش الخارجي.",
                },
              },
            },
            {
              id: "m11-l01-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي كابل يوصف في الكتاب بأنه «شائع ورخيص» وبلا طبقة حماية؟",
                options: [opt("m11-l01-p01-q2-a", "UTP", true), opt("m11-l01-p01-q2-b", "STP")],
                feedback: {
                  hints: ["أي بطاقة تقول «غلاف بلاستيكي فقط»؟", "الحرف U يدلّ على غير محمي (Unshielded)."],
                  correctFeedback: "أحسنت — UTP بلا حماية، لذلك هو أرخص وأشيع.",
                  incorrectFeedback: "افحص كلمة «غير محمي» في البطاقات: الكابل غير المحمي هو الأرخص.",
                  explanation: "UTP: زوج ملتوي غير محمي، شائع ورخيص. STP: محمي، أفضل ضد التشويش.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 3): SVG visual enrichment appended after the book content.
              id: "m11-l01-p01-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m11/utp-vs-stp", motion: true,
              source: src(62),
              title: "مخطط: UTP مقابل STP والحماية من التشويش",
              alt: "مقارنة كابل UTP بلا درع مع كابل STP ذي درع معدني، حيث يصل التشويش الخارجي إلى سلكي UTP بينما يصدّه درع STP.",
              caption: "الدرع المعدني في STP يزيد المقاومة للتشويش الخارجي.",
            },
          ],
        },
        // PDF 63 — أنواع أخرى من الكوابل (+ the cable chooser after all four cables are known)
        {
          id: "791381-m11-l01-p02",
          title: "أنواع أخرى من الكوابل",
          order: 2,
          source: src(63, 63),
          keywords: ["Fiber Optic", "Coaxial", "ألياف بصرية", "كابل محوري", "الضوء"],
          blocks: [
            {
              id: "m11-l01-p02-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m11-l01-p02-fiber", term: "Fiber Optic", text: [T("ألياف بصرية. سرعة عالية جدًا ومسافات طويلة.")], note: "لبّ زجاجي ينقل الضوء · سرعة عالية جدًا ومسافات طويلة" },
                { id: "m11-l01-p02-coax", term: "Coaxial", text: [T("كابل محوري. يُستعمل في التلفزيون والإنترنت عبر الكابل.")], note: "موصّل نحاسي في المنتصف · يُستعمل في التلفزيون والإنترنت عبر الكابل" },
              ],
            },
            {
              id: "m11-l01-p02-info", type: "callout", origin: "book", kind: "tip", title: "معلومة",
              spans: [T("الألياف البصرية تستعمل الضوء لنقل البيانات، لذلك سرعتها عالية جدًا.")],
            },
            {
              // ENRICHMENT — interactive-diagram / cable-comparison / v1: placed here because all FOUR cables are now
              // introduced (PDF 62 + 63). The scenarios are teacher-enrichment; the traits are the book's own.
              id: "m11-l01-p02-chooser", type: "interactive-diagram", origin: "teacher-enrichment",
              interactionType: "cable-comparison", version: 1,
              title: "قارن واختر الكابل المناسب",
              description: "اضغط على كل كابل لتقرأ صفاته كما وردت في الصفحة، ثم اختر سيناريو وحدّد الكابل الأنسب له.",
              source: src(63, 63),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "UTP: زوج ملتوي غير محمي، شائع ورخيص. STP: زوج ملتوي محمي بطبقة معدنية، أفضل ضد التشويش. Fiber Optic: لبّ زجاجي ينقل الضوء، سرعة عالية جدًا ومسافات طويلة. Coaxial: موصّل نحاسي في المنتصف، يُستعمل في التلفزيون والإنترنت عبر الكابل. القاعدة: كلما زادت الحماية والجودة، كان الكابل أفضل ضد التشويش وفقدان البيانات." },
              config: {
                cables: [
                  { id: "utp", name: "UTP", title: "زوج ملتوي غير محمي", traits: ["غلاف بلاستيكي فقط، بدون طبقة حماية", "أرخص وأشيع"], shield: false, kind: "pair" },
                  { id: "stp", name: "STP", title: "زوج ملتوي محمي", traits: ["غلاف + طبقة حماية معدنية", "الحماية تصدّ التشويش الخارجي"], shield: true, kind: "pair" },
                  { id: "fiber", name: "Fiber Optic", title: "ألياف بصرية", traits: ["لبّ زجاجي ينقل الضوء", "سرعة عالية جدًا ومسافات طويلة"], shield: false, kind: "fiber" },
                  { id: "coaxial", name: "Coaxial", title: "كابل محوري", traits: ["موصّل نحاسي في المنتصف", "يُستعمل في التلفزيون والإنترنت عبر الكابل"], shield: false, kind: "coaxial" },
                ],
                scenarios: [
                  { id: "classroom", prompt: "شبكة صف عادي في المدرسة، بأقل تكلفة وبلا تشويش قوي.", answer: "utp", why: "UTP شائع ورخيص، ويكفي عندما لا يوجد تشويش قوي." },
                  { id: "noisy", prompt: "ورشة فيها محركات وأجهزة كهربائية تُحدث تشويشًا قويًا.", answer: "stp", why: "STP فيه طبقة حماية معدنية تصدّ التشويش الخارجي." },
                  { id: "longfast", prompt: "وصلة سريعة جدًا بين مبنيين بعيدين.", answer: "fiber", why: "الألياف البصرية تنقل الضوء: سرعة عالية جدًا ومسافات طويلة." },
                  { id: "tv", prompt: "توصيل التلفزيون أو الإنترنت عن طريق شركة الكابل.", answer: "coaxial", why: "الكابل المحوري يُستعمل في التلفزيون والإنترنت عبر الكابل." },
                ],
                rule: "كلما زادت الحماية والجودة، كان الكابل أفضل ضد التشويش وفقدان البيانات.",
                scenarioNote: "السيناريوهات إضافة تعليمية للتدريب؛ صفات الكوابل كما في الصفحة.",
              },
            },
            {
              id: "m11-l01-p02-match", type: "practice-table", origin: "teacher-enrichment",
              caption: "تحقّق من نفسك: أي كابل يصفه كل سطر؟",
              headers: ["الوصف", "الكابل"],
              columnDirs: ["rtl", "ltr"],
              rows: [
                ["لبّ زجاجي ينقل الضوء، سرعة عالية جدًا ومسافات طويلة.", CABLE("Fiber Optic")],
                ["زوج ملتوي غير محمي، شائع ورخيص.", CABLE("UTP")],
                ["موصّل نحاسي في المنتصف، يُستعمل في التلفزيون.", CABLE("Coaxial")],
                ["زوج ملتوي محمي بطبقة معدنية، أفضل ضد التشويش.", CABLE("STP")],
              ],
            },
            {
              id: "m11-l01-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي كابل ينقل البيانات بالضوء؟",
                options: [opt("m11-l01-p02-q1-a", "UTP"), opt("m11-l01-p02-q1-b", "Coaxial"), opt("m11-l01-p02-q1-c", "Fiber Optic", true)],
                feedback: {
                  hints: ["أي بطاقة تذكر «لبّ زجاجي»؟", "الضوء يمرّ في الزجاج."],
                  correctFeedback: "أحسنت — الألياف البصرية تستعمل الضوء، لذلك سرعتها عالية جدًا.",
                  incorrectFeedback: "افحص بطاقة كل كابل: النحاس ينقل الكهرباء، والزجاج ينقل الضوء.",
                  explanation: "Fiber Optic: لبّ زجاجي ينقل الضوء — سرعة عالية جدًا ومسافات طويلة.",
                },
              },
            },
            {
              id: "m11-l01-p02-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "كابل فيه موصّل نحاسي في المنتصف، ويُستعمل في التلفزيون والإنترنت عبر الكابل. ما هو؟",
                options: [opt("m11-l01-p02-q2-a", "Coaxial", true), opt("m11-l01-p02-q2-b", "STP"), opt("m11-l01-p02-q2-c", "Fiber Optic")],
                feedback: {
                  hints: ["كلمة «محوري» تعني موصّلًا واحدًا في المحور (المنتصف).", "الكابل الذي يصل التلفزيون."],
                  correctFeedback: "أحسنت — Coaxial كابل محوري بموصّل نحاسي في المنتصف.",
                  incorrectFeedback: "افحص العبارة «موصّل نحاسي في المنتصف»: ليست في STP (زوج ملتوي) ولا في الألياف (زجاج).",
                  explanation: "Coaxial: موصّل نحاسي في المنتصف، يُستعمل في التلفزيون والإنترنت عبر الكابل.",
                },
              },
            },
          ],
        },
      ],
    },

    // ── l02 — the MAC address and its uses (PDF 64–65) ───────────────────────────────────────────────────────
    {
      id: "791381-m11-l02",
      title: "عنوان MAC واستخداماته",
      order: 2,
      pages: [
        // PDF 64 — عنوان MAC Address (+ the MAC anatomy diagram)
        {
          id: "791381-m11-l02-p01",
          title: "عنوان MAC Address",
          order: 1,
          source: src(64, 64),
          keywords: ["MAC", "MAC Address", "عنوان فيزيائي", "كرت الشبكة", "سداسي عشري", "Broadcast", "FF:FF:FF:FF:FF:FF"],
          blocks: [
            {
              id: "m11-l02-p01-def", type: "text", origin: "book",
              spans: [L("MAC Address"), T(" هو رقم فيزيائي خاص بكرت الشبكة.")],
            },
            {
              id: "m11-l02-p01-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m11-l02-p01-f1", text: [T("يكون فريدًا لكل جهاز تقريبًا.")] },
                { id: "m11-l02-p01-f2", text: [T("يتكوّن من 12 منزلة سداسية عشرية.")] },
                { id: "m11-l02-p01-f3", text: [T("يعمل في الطبقة الثانية من نموذج "), L("OSI"), T(".")] },
                { id: "m11-l02-p01-f4", text: [T("يستخدمه "), L("Switch"), T(" لمعرفة الجهاز المقصود.")] },
              ],
            },
            {
              id: "m11-l02-p01-example", type: "code", origin: "book", dir: "ltr", language: "text",
              code: MAC_EXAMPLE,
            },
            {
              id: "m11-l02-p01-bcast", type: "callout", origin: "book", kind: "important", title: "عنوان البث",
              spans: [T("عنوان "), L("Broadcast"), T(" في "), L("MAC"), T(" هو: "), L(MAC_BROADCAST)],
            },
            {
              id: "m11-l02-p01-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("المنازل السداسية العشرية هي الأرقام من 0 إلى 9 والحروف من A إلى F. العنوان يُكتب عادةً ستّ مجموعات، في كل مجموعة منزلتان، بينها نقطتان: "), L("A0"), T(" · "), L("02"), T(" · "), L("AF"), T(" · "), L("2D"), T(" · "), L("10"), T(" · "), L("22"), T(" — أي 6 × 2 = 12 منزلة.")],
            },
            {
              // ENRICHMENT — interactive-diagram / mac-address-anatomy / v1: the book's example MAC grouped as six
              // pairs, the broadcast MAC, and a "which string has the MAC shape?" task. Book level only.
              id: "m11-l02-p01-anatomy", type: "interactive-diagram", origin: "teacher-enrichment",
              interactionType: "mac-address-anatomy", version: 1,
              title: "شكل عنوان MAC",
              description: "اضغط على أي مجموعة لترى منزلتيها، واضغط «عنوان البث» لمقارنته بالعنوان العادي، ثم اختر النص الذي له شكل عنوان MAC.",
              source: src(64, 64),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "عنوان MAC رقم فيزيائي خاص بكرت الشبكة، يتكوّن من 12 منزلة سداسية عشرية (0–9 و A–F) تُكتب ستّ مجموعات من منزلتين، مثل A0:02:AF:2D:10:22. يعمل في الطبقة الثانية من نموذج OSI ويستخدمه Switch لمعرفة الجهاز المقصود. عنوان البث Broadcast في MAC هو FF:FF:FF:FF:FF:FF." },
              config: {
                example: MAC_EXAMPLE,
                broadcast: MAC_BROADCAST,
                broadcastLabel: "عنوان البث Broadcast",
                normalLabel: "عنوان جهاز",
                facts: ["رقم فيزيائي خاص بكرت الشبكة", "12 منزلة سداسية عشرية", "الطبقة الثانية من نموذج OSI", "يستخدمه Switch لمعرفة الجهاز المقصود"],
                hexDigits: "0 1 2 3 4 5 6 7 8 9 A B C D E F",
                task: {
                  prompt: "أي نص له شكل عنوان MAC (12 منزلة سداسية عشرية في ستّ مجموعات)؟",
                  candidates: [
                    { value: "192.168.1.10", why: "هذا عنوان IP: أربعة أرقام عشرية بينها نقاط، وليس 12 منزلة سداسية عشرية." },
                    { value: "A0:02:AF:2D:10:22", why: "ستّ مجموعات × منزلتان = 12 منزلة سداسية عشرية." },
                    { value: "A0:02:AF:2D", why: "أربع مجموعات فقط = 8 منازل؛ عنوان MAC يحتاج 12 منزلة." },
                    { value: "255.255.255.0", why: "هذا قناع شبكة بصيغة IP، وليس عنوان MAC." },
                  ],
                },
              },
            },
            {
              id: "m11-l02-p01-ex1", type: "example", origin: "teacher-enrichment", mode: "solved",
              title: "مثال محلول: هل هذا عنوان MAC؟",
              prompt: "النص A0:02:AF:2D:10:22 — هل له شكل عنوان MAC؟",
              steps: [
                { text: "نعدّ المجموعات بين النقطتين: A0 · 02 · AF · 2D · 10 · 22 = ستّ مجموعات." },
                { text: "في كل مجموعة منزلتان: 6 × 2 = 12 منزلة." },
                { text: "كل المنازل من 0–9 أو A–F، أي سداسية عشرية." },
              ],
              result: "نعم — 12 منزلة سداسية عشرية، فهو بشكل عنوان MAC.",
              explanation: "عنوان IP مثل 192.168.1.10 أرقام عشرية بنقاط، أما MAC فمنازل سداسية عشرية بنقطتين بين المجموعات.",
            },
            {
              id: "m11-l02-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي مما يلي عنوان MAC؟",
                options: [opt("m11-l02-p01-q1-a", "192.168.1.10"), opt("m11-l02-p01-q1-b", "A0:02:AF:2D:10:22", true), opt("m11-l02-p01-q1-c", "255.255.255.0")],
                feedback: {
                  hints: ["عدّ المنازل السداسية العشرية: يجب أن تكون 12.", "المجموعات بينها نقطتان (:) لا نقطة (.)."],
                  correctFeedback: "أحسنت — ستّ مجموعات من منزلتين = 12 منزلة سداسية عشرية.",
                  incorrectFeedback: "افحص الشكل: الأرقام العشرية بنقاط هي عناوين IP أو أقنعة؛ عنوان MAC منازل سداسية عشرية (0–9، A–F).",
                  explanation: "MAC = 12 منزلة سداسية عشرية مثل A0:02:AF:2D:10:22.",
                },
              },
            },
            {
              id: "m11-l02-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "من كم منزلة سداسية عشرية يتكوّن عنوان MAC؟ (اكتب الرقم)",
                answer: "12",
                feedback: {
                  hints: ["عدّ المجموعات في المثال ثم اضرب في 2.", "6 مجموعات × 2."],
                  correctFeedback: "صحيح — 12 منزلة سداسية عشرية.",
                  incorrectFeedback: "افحص المثال A0:02:AF:2D:10:22: كم مجموعة؟ وكم منزلة في كل مجموعة؟",
                  explanation: "ستّ مجموعات × منزلتان = 12 منزلة.",
                },
              },
            },
            {
              id: "m11-l02-p01-q3", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "FF:FF:FF:FF:FF:FF هو عنوان البث Broadcast في MAC.",
                answer: true,
                feedback: {
                  hints: ["افحص صندوق «عنوان البث» في الصفحة.", "كل المنازل F."],
                  correctFeedback: "صحيح — هذا هو عنوان Broadcast في MAC كما يظهر في الكتاب.",
                  incorrectFeedback: "افحص صندوق «عنوان البث»: ما العنوان المكتوب فيه؟",
                  explanation: "عنوان Broadcast في MAC هو FF:FF:FF:FF:FF:FF.",
                },
              },
            },
            {
              id: "m11-l02-p01-q4", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي جهاز يستخدم عنوان MAC لمعرفة الجهاز المقصود؟",
                options: [opt("m11-l02-p01-q4-a", "Hub"), opt("m11-l02-p01-q4-b", "Switch", true), opt("m11-l02-p01-q4-c", "Router")],
                feedback: {
                  hints: ["افحص آخر سطر في قائمة الصفحة.", "الجهاز الذي يرسل للمقصود فقط."],
                  correctFeedback: "أحسنت — Switch يستخدم MAC لمعرفة الجهاز المقصود.",
                  incorrectFeedback: "افحص القائمة: «يستخدمه … لمعرفة الجهاز المقصود» — الجهاز الذي تعلّمت في الوحدة الخامسة أنه يعرف الجهاز المقصود.",
                  explanation: "Switch يعرف الجهاز المقصود من عنوان MAC، لذلك يرسل له وحده.",
                },
              },
            },
          ],
        },
        // PDF 65 — استخدامات MAC Address (+ the unit's closing review)
        {
          id: "791381-m11-l02-p02",
          title: "استخدامات MAC Address",
          order: 2,
          source: src(65, 65),
          keywords: ["استخدامات MAC", "الأمان", "الجدار الناري", "إدارة الشبكة", "توجيه البيانات"],
          blocks: [
            {
              id: "m11-l02-p02-uses", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m11-l02-p02-u1", term: "تمييز الأجهزة", text: [T("يساعد على معرفة الجهاز داخل الشبكة.")] },
                { id: "m11-l02-p02-u2", term: "توجيه البيانات", text: [L("Switch"), T(" يستعمله لإرسال البيانات للمقصود.")] },
                { id: "m11-l02-p02-u3", term: "الأمان", text: [T("يمكن منع أجهزة غير مسموحة.")] },
                { id: "m11-l02-p02-u4", term: "إدارة الشبكة", text: [T("يساعد في تتبّع الأجهزة وتنظيمها.")] },
                { id: "m11-l02-p02-u5", term: "الجدار الناري", text: [T("قد يُستعمل للتحكم بالوصول.")] },
              ],
            },
            {
              id: "m11-l02-p02-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("عنوان "), L("IP"), T(" قد يتغيّر، لكن "), L("MAC"), T(" غالبًا ثابت لأنه مرتبط بكرت الشبكة نفسه.")],
            },
            {
              id: "m11-l02-p02-ex1", type: "example", origin: "teacher-enrichment", mode: "solved",
              title: "مثال محلول: لماذا يبقى MAC ثابتًا؟",
              prompt: "نقل طالب حاسوبه المحمول من شبكة المدرسة إلى شبكة البيت، فتغيّر عنوان IP لجهازه. هل يتغيّر عنوان MAC أيضًا؟",
              steps: [
                { text: "عنوان IP يتبع الشبكة التي يتصل بها الجهاز، فيتغيّر عند الانتقال بين الشبكات." },
                { text: "عنوان MAC مرتبط بكرت الشبكة نفسه داخل الجهاز." },
                { text: "كرت الشبكة لم يتغيّر، فيبقى MAC كما هو غالبًا." },
              ],
              result: "IP تغيّر، أما MAC فبقي ثابتًا.",
              explanation: "لهذا يُستعمل MAC في الأمان وإدارة الشبكة: يمكن معرفة الجهاز نفسه حتى لو تغيّر عنوان IP.",
            },
            {
              id: "m11-l02-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي استخدام لعنوان MAC يسمح بمنع أجهزة غير مسموحة من الشبكة؟",
                options: [opt("m11-l02-p02-q1-a", "الأمان", true), opt("m11-l02-p02-q1-b", "توجيه البيانات"), opt("m11-l02-p02-q1-c", "تمييز الأجهزة")],
                feedback: {
                  hints: ["افحص البطاقة التي تذكر «غير مسموحة».", "المنع = حماية = …"],
                  correctFeedback: "أحسنت — بطاقة الأمان: يمكن منع أجهزة غير مسموحة.",
                  incorrectFeedback: "افحص كلمات كل بطاقة: «للمقصود» توجيه، «معرفة الجهاز» تمييز، و«منع أجهزة غير مسموحة» بطاقة أخرى.",
                  explanation: "الأمان: يمكن منع أجهزة غير مسموحة بالاعتماد على عنوان MAC.",
                },
              },
            },
            {
              id: "m11-l02-p02-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "عنوان MAC غالبًا ثابت لأنه مرتبط بكرت الشبكة نفسه.",
                answer: true,
                feedback: {
                  hints: ["افحص صندوق «تذكّر».", "أيهما يتغيّر: IP أم MAC؟"],
                  correctFeedback: "صحيح — MAC مرتبط بكرت الشبكة، فهو غالبًا ثابت.",
                  incorrectFeedback: "افحص صندوق «تذكّر»: الذي «قد يتغيّر» هو IP، والذي «غالبًا ثابت» هو MAC.",
                  explanation: "IP قد يتغيّر مع الشبكة؛ MAC مرتبط بالكرت فيبقى غالبًا.",
                },
              },
            },
            // ── closing review (easy → medium → exam-like) ──
            {
              id: "m11-l02-p02-review", type: "heading", origin: "teacher-enrichment", level: 3, text: "مراجعة ختامية للوحدة السابعة",
            },
            {
              id: "m11-l02-p02-r1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "في أي طبقة من نموذج OSI يعمل عنوان MAC حسب الكتاب؟",
                options: [opt("m11-l02-p02-r1-a", "الطبقة الأولى"), opt("m11-l02-p02-r1-b", "الطبقة الثانية", true), opt("m11-l02-p02-r1-c", "الطبقة الثالثة")],
                feedback: {
                  hints: ["ارجع إلى قائمة صفحة MAC Address.", "بعد الأولى مباشرة."],
                  correctFeedback: "أحسنت — الطبقة الثانية من نموذج OSI.",
                  incorrectFeedback: "افحص السطر الثالث في قائمة صفحة MAC: «يعمل في الطبقة … من نموذج OSI».",
                  explanation: "الكتاب: MAC يعمل في الطبقة الثانية من نموذج OSI.",
                },
              },
            },
            {
              id: "m11-l02-p02-r2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "سؤال بأسلوب الامتحان: مدرسة تريد وصلة سريعة جدًا بين مبنيين بعيدين. أي كابل الأنسب؟",
                options: [opt("m11-l02-p02-r2-a", "UTP"), opt("m11-l02-p02-r2-b", "Coaxial"), opt("m11-l02-p02-r2-c", "Fiber Optic", true)],
                feedback: {
                  hints: ["أي كابل يجمع «سرعة عالية جدًا» و«مسافات طويلة»؟", "الكابل الذي ينقل الضوء."],
                  correctFeedback: "أحسنت — الألياف البصرية: سرعة عالية جدًا ومسافات طويلة.",
                  incorrectFeedback: "افحص الشرطين معًا: سرعة عالية جدًا + مسافة طويلة؛ أي بطاقة تذكرهما؟",
                  explanation: "Fiber Optic ينقل الضوء، لذلك سرعته عالية جدًا ويصلح للمسافات الطويلة.",
                },
              },
            },
            {
              id: "m11-l02-p02-r3", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "سؤال بأسلوب الامتحان: أي من العناوين التالية هو عنوان Broadcast في MAC؟",
                options: [opt("m11-l02-p02-r3-a", "A0:02:AF:2D:10:22"), opt("m11-l02-p02-r3-b", "FF:FF:FF:FF:FF:FF", true), opt("m11-l02-p02-r3-c", "192.168.1.255")],
                feedback: {
                  hints: ["افحص صندوق «عنوان البث» في صفحة MAC.", "عنوان MAC يتكوّن من 12 منزلة سداسية عشرية، وعنوان البث كل منازله F."],
                  correctFeedback: "أحسنت — FF:FF:FF:FF:FF:FF هو عنوان Broadcast في MAC كما في الكتاب.",
                  incorrectFeedback: "افحص الشكل أولًا: 192.168.1.255 عنوان بصيغة IP لا MAC، و A0:02:AF:2D:10:22 هو مثال الكتاب لعنوان جهاز عادي.",
                  explanation: "عنوان Broadcast في MAC هو FF:FF:FF:FF:FF:FF (صفحة MAC Address).",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 3): SVG visual enrichment appended after the book content.
              id: "m11-l02-p02-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m11/mac-frame-delivery", motion: true,
              source: src(65),
              title: "مخطط: تسليم الإطار بعنوان MAC",
              alt: "مخطط يبيّن إطارًا يحمل عنوان MAC الهدف ينتقل من PC1 عبر السويتش إلى PC2 داخل الشبكة المحلية.",
              caption: "داخل الشبكة يُسلَّم الإطار بعنوان MAC المرتبط بكرت الشبكة.",
            },
          ],
        },
      ],
    },
  ],
};

export default m11;
