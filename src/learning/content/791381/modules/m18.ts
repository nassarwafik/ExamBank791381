// Learning Materials — Batch 5 phase: REAL converted body for Book 791381, module m18 (the book's section
// «تجزئة البيانات», source PDF 116–118, plus the PDF 119 end-of-batch trainings page). Stable id m18, order 14 (b3).
//
// PDF 116–118 are the concept pages (encapsulation names in OSI, Segment / Packet / Frame, TCP 3-Way Handshake).
// PDF 119 («نهاية الدفعة · تدريبات») closes the book's third batch: QR cards for the electronic trainings 13–18 and
// the «الدفعة التالية» line. It is kept as a learner-visible closing page (conversionNote): the cards and lines are
// the book's own text; the QR codes live in the printed book and trainings 13–18 are NOT delivered inside the
// platform, so no `library-training` block is authored here. PDF 120 is the «الدفعة الرابعة · برمجة السويتش و VLAN»
// cover and is the HARD STOP of this batch: nothing from PDF 120+ (switch CLI, VLAN configuration, Trunk …) appears.
// Book-derived blocks are origin:"book": the PDF 116 definition + stack (as a table) + facts + «احفظ», the PDF 117
// cards with their field labels, «الترتيب» (rendered as prose «من Segment إلى Packet ثم إلى Frame» — the book prints
// arrows), the PDF 118 idea + three steps + «الخلاصة», the PDF 119 cards and lines. Technical tokens
// (Segment, Packet, Frame, Transport, Network, Data Link, IP, MAC, TCP, SYN, SYN-ACK, ACK) are LTR spans.
// SOURCE LEVEL: the book names the PDUs and their field families («أرقام المنافذ والتحكّم بالتدفّق», «IP المصدر
// والهدف ومعلومات التوجيه», «MAC المصدر والهدف وفحص الأخطاء») and the three handshake steps only — no header byte
// layouts, no sequence numbers, no connection teardown. Nothing more is added.
// PRINTED PAGE = the rendered page circle (PDF 116 prints «116» … PDF 118 prints «118»; PDF 119 prints none).

import type { ContentModule, ContentSource, InlineSpan, PracticeOption, PracticeTableSelectCell } from "../../types";

const CID = "791381";
const src = (pdf: number, printed?: number): ContentSource => ({ kind: "book", sourceId: CID, pdfPageStart: pdf, printedPage: printed });
const L = (text: string): InlineSpan => ({ text, dir: "ltr", style: "code" });
const T = (text: string): InlineSpan => ({ text });
const opt = (id: string, text: string, correct?: true): PracticeOption => (correct ? { id, text, correct } : { id, text });
const PDUS = ["Segment", "Packet", "Frame"] as const;
const U = (key: (typeof PDUS)[number]): PracticeTableSelectCell => ({ kind: "select", options: [...PDUS], key });

const m18: ContentModule = {
  id: "791381-m18",
  title: "تجزئة البيانات",
  shortTitle: "تجزئة البيانات",
  order: 14,
  source: { kind: "book", sourceId: CID, pdfPageStart: 116, pdfPageEnd: 119, sourceNote: "PDF 119 صفحة «نهاية الدفعة · تدريبات» ختامية (رموز QR لتدريبات 13–18 في الكتاب المطبوع، بلا رقم صفحة مطبوع). PDF 120 صفحة عنوان الدفعة الرابعة من الكتاب ولا يُحوَّل هنا." },
  lessons: [
    // ── l01 — encapsulation names (PDF 116–117) ─────────────────────────────────────────────────────────────
    {
      id: "791381-m18-l01",
      title: "Segment و Packet و Frame",
      order: 1,
      pages: [
        // PDF 116 — تجزئة البيانات في OSI
        {
          id: "791381-m18-l01-p01",
          title: "تجزئة البيانات في OSI",
          order: 1,
          source: src(116, 116),
          keywords: ["تجزئة البيانات", "Segment", "Packet", "Frame", "غلاف"],
          blocks: [
            {
              id: "m18-l01-p01-def", type: "callout", origin: "book", kind: "important",
              spans: [T("قبل إرسال البيانات، يتم تقسيمها وتنظيمها.")],
            },
            {
              id: "m18-l01-p01-stack", type: "table", origin: "book",
              caption: "الرسم: كل طبقة تضيف غلافًا حول البيانات (من الأعلى إلى الأسفل)",
              headers: ["الطبقة", "اسم البيانات"],
              columnDirs: ["ltr", "ltr"],
              rows: [
                ["—", "Data (البيانات)"],
                ["Transport", "Segment"],
                ["Network", "Packet"],
                ["Data Link", "Frame"],
              ],
            },
            {
              id: "m18-l01-p01-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m18-l01-p01-f1", text: [T("كل طبقة تضيف معلومات تساعد على الإرسال.")] },
                { id: "m18-l01-p01-f2", text: [T("تختلف تسمية البيانات حسب الطبقة.")] },
                { id: "m18-l01-p01-f3", text: [T("أهم الأسماء: "), L("Segment"), T("، "), L("Packet"), T("، "), L("Frame"), T(".")] },
              ],
            },
            {
              id: "m18-l01-p01-memo", type: "callout", origin: "book", kind: "tip", title: "احفظ",
              spans: [L("Transport = Segment"), T(" · "), L("Network = Packet"), T(" · "), L("Data Link = Frame"), T(".")],
            },
            {
              id: "m18-l01-p01-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("«غلاف» يعني أن كل طبقة تضع معلوماتها حول ما وصلها من الطبقة الأعلى دون أن تغيّر البيانات نفسها، ثم يتغيّر اسم الكلّ: في طبقة النقل يسمّى "), L("Segment"), T("، وفي الشبكة "), L("Packet"), T("، وفي ربط البيانات "), L("Frame"), T(". تعرفت على "), L("Packet"), T(" و "), L("Frame"), T(" في قسم نماذج الاتصال؛ الجديد هنا الاسم الثالث وترتيب الثلاثة.")],
            },
            {
              id: "m18-l01-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما اسم البيانات في طبقة النقل Transport؟",
                options: [opt("m18-l01-p01-q1-a", "Segment", true), opt("m18-l01-p01-q1-b", "Packet"), opt("m18-l01-p01-q1-c", "Frame")],
                feedback: {
                  hints: ["افحص صندوق «احفظ».", "Transport = …"],
                  correctFeedback: "أحسنت — Transport = Segment.",
                  incorrectFeedback: "افحص صندوق «احفظ»: «Transport = Segment · Network = Packet · Data Link = Frame».",
                  explanation: "Packet للشبكة و Frame لربط البيانات.",
                },
              },
            },
            {
              id: "m18-l01-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "كل طبقة تضيف معلومات تساعد على الإرسال، لذلك يختلف اسم البيانات حسب الطبقة.",
                answer: true,
                feedback: {
                  hints: ["افحص أول سطرين في قائمة الصفحة.", "«كل طبقة تضيف غلافًا»."],
                  correctFeedback: "صحيح — كل طبقة تضيف غلافًا والاسم يتغيّر معه.",
                  incorrectFeedback: "افحص قائمة الصفحة: «كل طبقة تضيف معلومات تساعد على الإرسال» و«تختلف تسمية البيانات حسب الطبقة».",
                  explanation: "Segment ثم Packet ثم Frame.",
                },
              },
            },
          ],
        },
        // PDF 117 — Frame / Packet / Segment
        {
          id: "791381-m18-l01-p02",
          title: "Frame / Packet / Segment",
          order: 2,
          source: src(117, 117),
          keywords: ["Segment", "Packet", "Frame", "المنافذ", "IP", "MAC"],
          blocks: [
            {
              id: "m18-l01-p02-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m18-l01-p02-seg", term: "Segment", text: [T("في طبقة النقل. يحتوي أرقام المنافذ والتحكّم بالتدفّق.")], note: "Transport Layer: منافذ · تحكّم · بيانات" },
                { id: "m18-l01-p02-pkt", term: "Packet", text: [T("في طبقة الشبكة. يحتوي "), L("IP"), T(" المصدر والهدف ومعلومات التوجيه.")], note: "Network Layer: مصدر IP · هدف IP · بيانات" },
                { id: "m18-l01-p02-frm", term: "Frame", text: [T("في طبقة ربط البيانات. يحتوي "), L("MAC"), T(" المصدر والهدف وفحص الأخطاء.")], note: "Data Link Layer: MAC · بيانات · فحص" },
              ],
            },
            {
              id: "m18-l01-p02-order", type: "callout", origin: "book", kind: "important", title: "الترتيب",
              spans: [T("تنزل البيانات من "), L("Segment"), T(" إلى "), L("Packet"), T(" ثم إلى "), L("Frame"), T("، وكل طبقة تضيف معلوماتها قبل الإرسال.")],
            },
            {
              id: "m18-l01-p02-ex1", type: "example", origin: "teacher-enrichment", mode: "solved",
              title: "مثال محلول: أين يُضاف عنوان MAC وأين يُضاف عنوان IP؟",
              steps: [
                { text: "بطاقة Packet تقول: «يحتوي IP المصدر والهدف» — إذن عنوان IP يُضاف في طبقة الشبكة، والاسم هناك Packet." },
                { text: "بطاقة Frame تقول: «يحتوي MAC المصدر والهدف وفحص الأخطاء» — إذن عنوان MAC يُضاف في طبقة ربط البيانات، والاسم هناك Frame." },
                { text: "وهذا يوافق ما تعلّمته سابقًا: Network تختار الطريق بعنوان IP، و Data Link تنقل Frame بعنوان MAC." },
              ],
              result: "عنوان IP في Packet (طبقة الشبكة) · عنوان MAC في Frame (طبقة ربط البيانات)",
              explanation: "الترتيب عند الإرسال: Segment (منافذ) ثم Packet (IP) ثم Frame (MAC).",
            },
            {
              id: "m18-l01-p02-match", type: "practice-table", origin: "teacher-enrichment",
              caption: "تحقّق من نفسك: أي اسم لكل وصف؟ (اعتمد على البطاقات)",
              headers: ["الوصف", "الاسم"],
              columnDirs: ["rtl", "ltr"],
              rows: [
                ["يحتوي MAC المصدر والهدف وفحص الأخطاء.", U("Frame")],
                ["يحتوي أرقام المنافذ والتحكّم بالتدفّق.", U("Segment")],
                ["يحتوي IP المصدر والهدف ومعلومات التوجيه.", U("Packet")],
                ["اسم البيانات في طبقة ربط البيانات.", U("Frame")],
                ["اسم البيانات في طبقة النقل.", U("Segment")],
              ],
            },
            {
              id: "m18-l01-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي وحدة تحتوي فحص الأخطاء حسب الكتاب؟",
                options: [opt("m18-l01-p02-q1-a", "Frame", true), opt("m18-l01-p02-q1-b", "Segment"), opt("m18-l01-p02-q1-c", "Packet")],
                feedback: {
                  hints: ["افحص البطاقة التي فيها MAC.", "طبقة ربط البيانات «تساعد في كشف أخطاء الإرسال»."],
                  correctFeedback: "أحسنت — Frame: MAC المصدر والهدف وفحص الأخطاء.",
                  incorrectFeedback: "افحص بطاقة Frame: «يحتوي MAC المصدر والهدف وفحص الأخطاء».",
                  explanation: "Segment: منافذ وتحكّم. Packet: IP وتوجيه. Frame: MAC وفحص.",
                },
              },
            },
          ],
        },
      ],
    },
    // ── l02 — TCP 3-Way Handshake (PDF 118) ──────────────────────────────────────────────────────────────────
    {
      id: "791381-m18-l02",
      title: "TCP 3-Way Handshake",
      order: 2,
      pages: [
        {
          id: "791381-m18-l02-p01",
          title: "TCP 3-Way Handshake",
          order: 1,
          source: src(118, 118),
          keywords: ["TCP", "3-Way Handshake", "SYN", "SYN-ACK", "ACK"],
          blocks: [
            {
              id: "m18-l02-p01-idea", type: "callout", origin: "book", kind: "important", title: "الفكرة",
              spans: [T("عملية من 3 خطوات لإنشاء اتصال موثوق قبل تبادل أي بيانات.")],
            },
            {
              id: "m18-l02-p01-steps", type: "list", origin: "book", variant: "ordered", title: "الرسم: الجهاز الأول والجهاز الثاني",
              items: [
                { id: "m18-l02-p01-s1", term: "SYN", text: [T("الجهاز الأول يطلب بدء الاتصال.")] },
                { id: "m18-l02-p01-s2", term: "SYN-ACK", text: [T("الجهاز الثاني يوافق ويردّ.")] },
                { id: "m18-l02-p01-s3", term: "ACK", text: [T("الجهاز الأول يؤكّد، ثم يبدأ تبادل البيانات.")] },
              ],
            },
            {
              id: "m18-l02-p01-summary", type: "callout", origin: "book", kind: "summary", title: "الخلاصة",
              spans: [T("الطرفان يتأكّدان أن الاتصال جاهز قبل إرسال البيانات الفعلية.")],
            },
            {
              id: "m18-l02-p01-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("هذا هو معنى «موثوق» الذي قرأته عن "), L("TCP"), T(" في قسم نماذج الاتصال: قبل أي بيانات، طلبٌ من الأول، موافقةٌ وردٌّ من الثاني، ثم تأكيدٌ من الأول. الرسالة الثانية اسمها "), L("SYN-ACK"), T(" لأنها موافقة وردّ معًا.")],
            },
            {
              // ENRICHMENT — interactive-diagram / tcp-handshake / v1: placed after the book's idea, the three steps and
              // «الخلاصة». Steps and texts are the book's own; the learner reveals them one at a time.
              id: "m18-l02-p01-stepper", type: "interactive-diagram", origin: "teacher-enrichment",
              interactionType: "tcp-handshake", version: 1,
              title: "تتبّع خطوات المصافحة الثلاثية",
              description: "اضغط «الخطوة التالية» لترى كل رسالة بين الجهاز الأول والجهاز الثاني مع جملة الكتاب لها.",
              source: src(118, 118),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "المصافحة الثلاثية في TCP: 1) SYN — الجهاز الأول يطلب بدء الاتصال. 2) SYN-ACK — الجهاز الثاني يوافق ويردّ. 3) ACK — الجهاز الأول يؤكّد، ثم يبدأ تبادل البيانات. الطرفان يتأكّدان أن الاتصال جاهز قبل إرسال البيانات الفعلية." },
              config: {
                first: "الجهاز الأول", second: "الجهاز الثاني",
                steps: [
                  { label: "SYN", from: "first", text: "الجهاز الأول يطلب بدء الاتصال." },
                  { label: "SYN-ACK", from: "second", text: "الجهاز الثاني يوافق ويردّ." },
                  { label: "ACK", from: "first", text: "الجهاز الأول يؤكّد، ثم يبدأ تبادل البيانات." },
                ],
                summary: "الطرفان يتأكّدان أن الاتصال جاهز قبل إرسال البيانات الفعلية.",
                nextLabel: "الخطوة التالية", prevLabel: "الخطوة السابقة", startHint: "لم تبدأ المصافحة بعد.",
              },
            },
            {
              id: "m18-l02-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما الرسالة الثانية في المصافحة الثلاثية، ومن يرسلها؟",
                options: [opt("m18-l02-p01-q1-a", "SYN-ACK، يرسلها الجهاز الثاني (يوافق ويردّ)", true), opt("m18-l02-p01-q1-b", "SYN، يرسلها الجهاز الثاني"), opt("m18-l02-p01-q1-c", "ACK، يرسلها الجهاز الأول")],
                feedback: {
                  hints: ["افحص الخطوة 2 في الرسم.", "«يوافق ويردّ»."],
                  correctFeedback: "أحسنت — SYN-ACK من الجهاز الثاني.",
                  incorrectFeedback: "افحص الخطوات: 1 SYN من الأول، 2 SYN-ACK من الثاني، 3 ACK من الأول.",
                  explanation: "الترتيب: SYN ثم SYN-ACK ثم ACK.",
                },
              },
            },
            {
              id: "m18-l02-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "كم خطوة في المصافحة الثلاثية قبل تبادل البيانات؟ (اكتب الرقم)",
                answer: "3",
                feedback: {
                  hints: ["افحص صندوق «الفكرة».", "الاسم نفسه يقول العدد."],
                  correctFeedback: "صحيح — 3 خطوات.",
                  incorrectFeedback: "افحص صندوق «الفكرة»: «عملية من … خطوات لإنشاء اتصال موثوق».",
                  explanation: "SYN، SYN-ACK، ACK.",
                },
              },
            },
            {
              id: "m18-l02-p01-q3", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "في المصافحة الثلاثية يبدأ تبادل البيانات قبل أن يتأكّد الطرفان أن الاتصال جاهز.",
                answer: false,
                feedback: {
                  hints: ["افحص صندوق «الخلاصة».", "«قبل إرسال البيانات الفعلية»."],
                  correctFeedback: "صحيح أنها خطأ — يتأكّد الطرفان أولًا، ثم تُرسل البيانات.",
                  incorrectFeedback: "افحص صندوق «الخلاصة»: «الطرفان يتأكّدان أن الاتصال جاهز قبل إرسال البيانات الفعلية».",
                  explanation: "الخطوة 3 (ACK) هي التي بعدها يبدأ تبادل البيانات.",
                },
              },
            },
          ],
        },
      ],
    },
    // ── l03 — the batch's closing trainings page (PDF 119) ───────────────────────────────────────────────────
    {
      id: "791381-m18-l03",
      title: "تدريبات نهاية الدفعة",
      order: 3,
      pages: [
        {
          id: "791381-m18-l03-p01",
          title: "تدريبات نهاية الدفعة",
          order: 1,
          source: src(119),
          conversionNote: "PDF 119 صفحة ختامية للدفعة الثالثة من الكتاب (بلا رقم صفحة مطبوع): ثلاث بطاقات تجمع التدريبات الإلكترونية 13–18 حسب الموضوع خلف رموز QR، وسطر «الدفعة التالية». الرموز في الكتاب المطبوع؛ تُعرض البطاقات والسطور كما هي، وتُفتح التدريبات 13–18 من داخل المنصة (library-training) عندما يصبح الجزء المرتبط بكل تدريب متاحًا، ثم تُضاف مراجعة ختامية للقسم.",
          keywords: ["تدريبات", "نهاية الدفعة", "QR"],
          blocks: [
            {
              id: "m18-l03-p01-lead", type: "text", origin: "book",
              spans: [T("امسح الرمز للوصول إلى التدريبات.")],
            },
            {
              id: "m18-l03-p01-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m18-l03-p01-t1314", term: "تدريب 13–14", text: [L("OSI"), T(" و "), L("TCP/IP"), T(".")] },
                { id: "m18-l03-p01-t1516", term: "تدريب 15–16", text: [T("البروتوكولات والأوامر.")] },
                { id: "m18-l03-p01-t1718", term: "تدريب 17–18", text: [T("المجالات والأمان والتجزئة.")] },
              ],
            },
            {
              id: "m18-l03-p01-next", type: "callout", origin: "book", kind: "summary", title: "الدفعة التالية",
              spans: [T("مشاريع وتطبيقات عملية على ما تعلّمته في هذه الدفعة.")],
            },
            {
              id: "m18-l03-p01-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("رموز QR موجودة في الكتاب المطبوع. يمكن فتح التدريبات 13–18 من داخل المنصة عندما يصبح الجزء المرتبط بكل تدريب متاحًا، ثم راجع القسم من خلال المراجعة الختامية التالية.")],
            },
            // ── Learning Practice (Reader position 110): the platform's T13–T18, grouped as the book groups them.
            // Metadata only — the host / API decide availability and disclose the library title.
            { id: "m18-l03-p01-practice", type: "heading", origin: "teacher-enrichment", level: 3, text: "تدريبات مرتبطة بهذه الصفحة" },
            { id: "m18-l03-p01-g1314", type: "heading", origin: "teacher-enrichment", level: 4, text: "تدريب 13–14" },
            { id: "m18-l03-p01-lt13", type: "library-training", origin: "book", trainingId: "T13", label: "تدريب 13", requiredModuleId: "791381-m16" },
            { id: "m18-l03-p01-lt14", type: "library-training", origin: "book", trainingId: "T14", label: "تدريب 14", requiredModuleId: "791381-m18" },
            { id: "m18-l03-p01-g1516", type: "heading", origin: "teacher-enrichment", level: 4, text: "تدريب 15–16" },
            { id: "m18-l03-p01-lt15", type: "library-training", origin: "book", trainingId: "T15", label: "تدريب 15", requiredModuleId: "791381-m03" },
            { id: "m18-l03-p01-lt16", type: "library-training", origin: "book", trainingId: "T16", label: "تدريب 16", requiredModuleId: "791381-m19" },
            { id: "m18-l03-p01-g1718", type: "heading", origin: "teacher-enrichment", level: 4, text: "تدريب 17–18" },
            { id: "m18-l03-p01-lt17", type: "library-training", origin: "book", trainingId: "T17", label: "تدريب 17", requiredModuleId: "791381-m04" },
            { id: "m18-l03-p01-lt18", type: "library-training", origin: "book", trainingId: "T18", label: "تدريب 18", requiredModuleId: "791381-m21" },
            // ── closing review for the section (easy, medium, exam-like) ──
            {
              id: "m18-l03-p01-review", type: "heading", origin: "teacher-enrichment", level: 3, text: "مراجعة ختامية: تجزئة البيانات",
            },
            {
              id: "m18-l03-p01-r1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما ترتيب أسماء البيانات عند النزول في الطبقات قبل الإرسال؟",
                options: [opt("m18-l03-p01-r1-a", "Segment ثم Packet ثم Frame", true), opt("m18-l03-p01-r1-b", "Frame ثم Packet ثم Segment"), opt("m18-l03-p01-r1-c", "Packet ثم Frame ثم Segment")],
                feedback: {
                  hints: ["افحص صندوق «الترتيب» في صفحة Frame / Packet / Segment.", "النقل أولًا (الأعلى)."],
                  correctFeedback: "أحسنت — Segment ثم Packet ثم Frame.",
                  incorrectFeedback: "افحص صندوق «الترتيب»: «تنزل البيانات من Segment إلى Packet ثم إلى Frame».",
                  explanation: "Transport = Segment · Network = Packet · Data Link = Frame.",
                },
              },
            },
            {
              id: "m18-l03-p01-r2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "سؤال بأسلوب الامتحان: أي وحدة بيانات تحمل أرقام المنافذ، وفي أي طبقة؟",
                options: [opt("m18-l03-p01-r2-a", "Segment، في طبقة النقل", true), opt("m18-l03-p01-r2-b", "Packet، في طبقة الشبكة"), opt("m18-l03-p01-r2-c", "Frame، في طبقة ربط البيانات")],
                feedback: {
                  hints: ["افحص بطاقة Segment.", "«أرقام المنافذ والتحكّم بالتدفّق»."],
                  correctFeedback: "أحسنت — Segment في طبقة النقل يحتوي أرقام المنافذ.",
                  incorrectFeedback: "افحص بطاقة Segment: «في طبقة النقل. يحتوي أرقام المنافذ والتحكّم بالتدفّق».",
                  explanation: "Packet يحمل IP، و Frame يحمل MAC.",
                },
              },
            },
            {
              id: "m18-l03-p01-r3", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "سؤال بأسلوب الامتحان: لماذا يحتاج TCP إلى مصافحة ثلاثية قبل تبادل البيانات؟",
                options: [opt("m18-l03-p01-r3-a", "ليتأكّد الطرفان أن الاتصال جاهز قبل إرسال البيانات الفعلية — وهذا معنى الاتصال الموثوق", true), opt("m18-l03-p01-r3-b", "لتسريع الإرسال كما في UDP"), opt("m18-l03-p01-r3-c", "لتوزيع عناوين IP")],
                feedback: {
                  hints: ["افحص صندوق «الخلاصة» في صفحة المصافحة.", "TCP موثوق، لا سريع."],
                  correctFeedback: "أحسنت — المصافحة تضمن أن الاتصال جاهز قبل البيانات.",
                  incorrectFeedback: "افحص صندوق «الفكرة» و«الخلاصة»: «عملية من 3 خطوات لإنشاء اتصال موثوق قبل تبادل أي بيانات».",
                  explanation: "SYN ثم SYN-ACK ثم ACK، ثم البيانات.",
                },
              },
            },
          ],
        },
      ],
    },
  ],
};

export default m18;
