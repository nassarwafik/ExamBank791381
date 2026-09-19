// Learning Materials — Batch 3 phase: REAL converted body for Book 791381, module m13 (the book's section
// «نماذج الاتصال · OSI و TCP/IP», source PDF 77–86, complete). Stable id m13 (next free), order 9 (batch b3).
//
// PDF 76 is the book's batch-3 DIVIDER («الدفعة الثالثة · نماذج الاتصال والبروتوكولات والأمان …») — a structural
// page with no learner concept. It is NOT a learner page: it is represented as the start of this module's coarse
// source range (`source.pdfPageStart: 76`, `sourceNote`); the first learner page is PDF 77. Batch 3 has NO «الوحدة N»
// opener page, so no opener is invented: the section header is the module title.
// HARD STOP: PDF 87 opens the next section («البروتوكولات · أهم البروتوكولات») and is NOT converted.
//
// Book-derived blocks are origin:"book" and reproduce the RENDERED source (bullets, the seven-layer stack, the
// lower/upper layer cards, the four TCP/IP layers, the comparison, TCP/UDP cards, callouts). Technical tokens
// (OSI, TCP/IP, TCP, UDP, IP, MAC, Frame, Packet, HTTP, FTP, SMTP, layer names) are LTR spans. Pedagogy (clarifications,
// solved examples, the OSI layers explorer, worksheets, inline practices with «what to check» feedback, the closing
// review) is origin:"teacher-enrichment".
// SOURCE ORDER inside the module: TCP/UDP are only NAMED as layer-4 tokens on PDF 78–79; their reliability / speed
// semantics appear on PDF 84–86 only. TCP/IP's four layers appear on PDF 81+ only. Protocol FUNCTIONS (PDF 87–92)
// and network commands (PDF 93+) never appear here; HTTP / FTP / SMTP are printed as bare example names (PDF 80, 85).
// PRINTED PAGE = the rendered page circle (PDF 77 prints «77» … PDF 86 prints «86»).

import type { ContentModule, ContentSource, InlineSpan, PracticeOption, PracticeTableSelectCell } from "../../types";

const CID = "791381";
const src = (pdf: number, printed?: number): ContentSource => ({ kind: "book", sourceId: CID, pdfPageStart: pdf, printedPage: printed });
const L = (text: string): InlineSpan => ({ text, dir: "ltr", style: "code" });
const T = (text: string): InlineSpan => ({ text });
const opt = (id: string, text: string, correct?: true): PracticeOption => (correct ? { id, text, correct } : { id, text });
const TCPIP = ["Application", "Transport", "Internet", "Link"] as const;
const TL = (key: (typeof TCPIP)[number]): PracticeTableSelectCell => ({ kind: "select", options: [...TCPIP], key });
const TU = (key: "TCP" | "UDP"): PracticeTableSelectCell => ({ kind: "select", options: ["TCP", "UDP"], key });

const m13: ContentModule = {
  id: "791381-m13",
  title: "نماذج الاتصال: OSI و TCP/IP",
  shortTitle: "OSI و TCP/IP",
  order: 9,
  source: { kind: "book", sourceId: CID, pdfPageStart: 76, pdfPageEnd: 86, sourceNote: "PDF 76 هو فاصل الدفعة الثالثة (بلا محتوى تعليمي)؛ أول صفحة تعليمية هي PDF 77. لا توجد صفحة افتتاحية وحدة في هذه الدفعة." },
  lessons: [
    // ── l01 — the OSI model (PDF 77–80) ──────────────────────────────────────────────────────────────────────
    {
      id: "791381-m13-l01",
      title: "نموذج OSI",
      order: 1,
      pages: [
        // PDF 77 — ما هو نموذج OSI؟
        {
          id: "791381-m13-l01-p01",
          title: "ما هو نموذج OSI؟",
          order: 1,
          source: src(77, 77),
          keywords: ["OSI", "نموذج", "7 طبقات", "طبقات"],
          blocks: [
            {
              id: "m13-l01-p01-def", type: "callout", origin: "book", kind: "important",
              spans: [T("نموذج يساعدنا على فهم انتقال البيانات بين الأجهزة.")],
            },
            {
              id: "m13-l01-p01-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m13-l01-p01-f1", text: [T("يقسّم عملية الاتصال إلى 7 طبقات.")] },
                { id: "m13-l01-p01-f2", text: [T("كل طبقة لها وظيفة محدّدة.")] },
                { id: "m13-l01-p01-f3", text: [T("يساعد في اكتشاف الأعطال وفهم الشبكات.")] },
              ],
            },
            {
              id: "m13-l01-p01-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("لا تحفظ شرحًا طويلًا؛ احفظ وظيفة كل طبقة بكلمات قليلة.")],
            },
            {
              id: "m13-l01-p01-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("«نموذج» هنا يعني طريقة لترتيب الأفكار: بدل أن نفكّر في الاتصال كخطوة واحدة كبيرة، نقسّمه إلى طبقات، لكل طبقة عمل صغير وواضح. هذا يسهّل الفهم ويسهّل معرفة أين حدث العطل.")],
            },
            {
              id: "m13-l01-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "إلى كم طبقة يقسّم نموذج OSI عملية الاتصال؟ (اكتب الرقم)",
                answer: "7",
                feedback: {
                  hints: ["افحص السطر الأول في قائمة الصفحة.", "الرقم بين 5 و 9."],
                  correctFeedback: "صحيح — 7 طبقات.",
                  incorrectFeedback: "افحص قائمة الصفحة: «يقسّم عملية الاتصال إلى … طبقات».",
                  explanation: "نموذج OSI يقسّم الاتصال إلى 7 طبقات، لكل طبقة وظيفة محدّدة.",
                },
              },
            },
            {
              id: "m13-l01-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "الطريقة الصحيحة لدراسة نموذج OSI هي حفظ شرح طويل لكل طبقة.",
                answer: false,
                feedback: {
                  hints: ["افحص صندوق «تذكّر».", "«بكلمات قليلة»."],
                  correctFeedback: "صحيح أنها خطأ — احفظ وظيفة كل طبقة بكلمات قليلة.",
                  incorrectFeedback: "افحص صندوق «تذكّر»: «لا تحفظ شرحًا طويلًا».",
                  explanation: "الكتاب يوصي بحفظ وظيفة كل طبقة بكلمات قليلة.",
                },
              },
            },
          ],
        },
        // PDF 78 — طبقات OSI السبع
        {
          id: "791381-m13-l01-p02",
          title: "طبقات OSI السبع",
          order: 2,
          source: src(78, 78),
          keywords: ["Application", "Presentation", "Session", "Transport", "Network", "Data Link", "Physical"],
          blocks: [
            {
              id: "m13-l01-p02-table", type: "table", origin: "book",
              caption: "الطبقات السبع من الأعلى (7) إلى الأسفل (1)",
              headers: ["الرقم", "الطبقة", "الاختصار"],
              columnDirs: ["ltr", "rtl", "ltr"],
              rows: [
                ["7", "التطبيق Application", "App"],
                ["6", "العرض Presentation", "Pres"],
                ["5", "الجلسة Session", "Sess"],
                ["4", "النقل Transport", "TCP/UDP"],
                ["3", "الشبكة Network", "IP"],
                ["2", "ربط البيانات Data Link", "MAC"],
                ["1", "الفيزيائية Physical", "Cable"],
              ],
            },
            {
              id: "m13-l01-p02-idea", type: "callout", origin: "book", kind: "important", title: "الفكرة",
              spans: [T("كل طبقة لها وظيفة صغيرة تساعد في إرسال البيانات بشكل صحيح، وتسلّمها للطبقة التالية.")],
            },
            {
              id: "m13-l01-p02-memo", type: "callout", origin: "book", kind: "tip", title: "للحفظ",
              spans: [T("عند الإرسال ننزل من 7 إلى 1، وعند الاستقبال نصعد من 1 إلى 7. ركّز على وظيفة كل طبقة لا اسمها فقط.")],
            },
            {
              id: "m13-l01-p02-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("العمود الأخير في الجدول هو «الاختصار» الذي يذكّرك بالطبقة: "), L("IP"), T(" للشبكة و "), L("MAC"), T(" لربط البيانات و "), L("Cable"), T(" للفيزيائية — وهي أشياء تعرفها من الوحدات السابقة (عنوان IP، عنوان MAC، الكوابل). ما تفعله كل طبقة يأتي في الصفحتين التاليتين.")],
            },
            {
              id: "m13-l01-p02-ex1", type: "example", origin: "teacher-enrichment", mode: "solved",
              title: "مثال محلول: بأي ترتيب تمرّ البيانات عند الإرسال؟",
              prompt: "طالب يرسل بيانات من برنامج على حاسوبه. بأي ترتيب تمرّ في طبقات OSI عند الإرسال، وبأي ترتيب عند الاستقبال؟",
              steps: [
                { text: "من صندوق «للحفظ»: عند الإرسال ننزل من 7 إلى 1." },
                { text: "إذن الإرسال يبدأ من التطبيق (7) وينتهي بالفيزيائية (1)، أي بالكابل." },
                { text: "وعند الاستقبال نصعد من 1 إلى 7: من الكابل حتى التطبيق." },
              ],
              result: "إرسال: من 7 إلى 1 (من التطبيق إلى الفيزيائية) · استقبال: من 1 إلى 7 (من الفيزيائية إلى التطبيق)",
              explanation: "الرقم يساعدك على تذكّر الاتجاه: المرسل ينزل في الجدول، والمستقبل يصعد فيه.",
            },
            {
              id: "m13-l01-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما رقم طبقة النقل Transport في نموذج OSI؟",
                options: [opt("m13-l01-p02-q1-a", "2"), opt("m13-l01-p02-q1-b", "4", true), opt("m13-l01-p02-q1-c", "7")],
                feedback: {
                  hints: ["افحص الجدول: أي سطر فيه Transport؟", "بين الجلسة (5) والشبكة (3)."],
                  correctFeedback: "أحسنت — Transport هي الطبقة 4.",
                  incorrectFeedback: "افحص جدول الطبقات: الرقم 2 لربط البيانات، والرقم 7 للتطبيق.",
                  explanation: "4 = النقل Transport (اختصارها TCP/UDP).",
                },
              },
            },
            {
              id: "m13-l01-p02-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "عند إرسال البيانات، بأي اتجاه نمرّ في طبقات OSI؟",
                options: [opt("m13-l01-p02-q2-a", "من 1 إلى 7"), opt("m13-l01-p02-q2-b", "من 7 إلى 1", true), opt("m13-l01-p02-q2-c", "من 4 إلى 4")],
                feedback: {
                  hints: ["افحص صندوق «للحفظ».", "الإرسال = ننزل."],
                  correctFeedback: "أحسنت — عند الإرسال ننزل من 7 إلى 1.",
                  incorrectFeedback: "افحص صندوق «للحفظ»: «عند الإرسال ننزل من 7 إلى 1، وعند الاستقبال نصعد من 1 إلى 7».",
                  explanation: "إرسال: من الأعلى (7) إلى الأسفل (1). استقبال: العكس.",
                },
              },
            },
          ],
        },
        // PDF 79 — طبقات OSI الأساسية (Physical / Data Link / Network / Transport)
        {
          id: "791381-m13-l01-p03",
          title: "طبقات OSI الأساسية",
          order: 3,
          source: src(79, 79),
          keywords: ["Physical", "Data Link", "Network", "Transport", "Frame", "Packet"],
          blocks: [
            {
              id: "m13-l01-p03-lower", type: "list", origin: "book", variant: "cards", title: "Physical / Data Link",
              items: [
                { id: "m13-l01-p03-phy", term: "Physical", text: [T("الكابلات، الإشارات، الواي فاي.")] },
                { id: "m13-l01-p03-dl1", term: "Data Link", text: [T("تنقل "), L("Frame"), T(" داخل الشبكة.")] },
                { id: "m13-l01-p03-dl2", text: [T("تتعامل مع "), L("MAC Address"), T(".")] },
                { id: "m13-l01-p03-dl3", text: [T("تساعد في كشف أخطاء الإرسال.")] },
              ],
            },
            {
              id: "m13-l01-p03-mid", type: "list", origin: "book", variant: "cards", title: "Network / Transport",
              items: [
                { id: "m13-l01-p03-net1", term: "Network", text: [T("تختار الطريق باستخدام "), L("IP"), T(".")] },
                { id: "m13-l01-p03-net2", text: [T("تتعامل مع "), L("Packet"), T(".")] },
                { id: "m13-l01-p03-tr1", term: "Transport", text: [T("تنظّم وصول البيانات.")] },
                { id: "m13-l01-p03-tr2", text: [L("TCP"), T(" و "), L("UDP"), T(" يعملان في هذه الطبقة.")] },
              ],
            },
            {
              id: "m13-l01-p03-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("الطبقات الدنيا تنقل البيانات فعليًا: من الكابل ("), L("Physical"), T(") إلى التوجيه ("), L("Network"), T(") فالتنظيم ("), L("Transport"), T(").")],
            },
            {
              id: "m13-l01-p03-ex1", type: "example", origin: "teacher-enrichment", mode: "solved",
              title: "مثال محلول: في أي طبقة يُستعمل عنوان MAC وفي أي طبقة يُستعمل عنوان IP؟",
              steps: [
                { text: "بطاقة Data Link تقول: «تتعامل مع MAC Address» — إذن عنوان MAC في طبقة ربط البيانات (2)." },
                { text: "بطاقة Network تقول: «تختار الطريق باستخدام IP» — إذن عنوان IP في طبقة الشبكة (3)." },
                { text: "هذا يوافق ما تعلّمته في الوحدة السابعة: MAC يعمل في الطبقة الثانية من نموذج OSI." },
              ],
              result: "عنوان MAC في طبقة Data Link (2) · عنوان IP في طبقة Network (3)",
              explanation: "الطبقة 2 تنقل Frame داخل الشبكة بعنوان MAC، والطبقة 3 تختار الطريق بين الشبكات بعنوان IP.",
            },
            {
              id: "m13-l01-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي طبقة تختار الطريق باستخدام IP؟",
                options: [opt("m13-l01-p03-q1-a", "Physical"), opt("m13-l01-p03-q1-b", "Data Link"), opt("m13-l01-p03-q1-c", "Network", true)],
                feedback: {
                  hints: ["افحص البطاقة التي تذكر «الطريق».", "اختصار هذه الطبقة في جدول الصفحة السابقة هو IP."],
                  correctFeedback: "أحسنت — Network تختار الطريق باستخدام IP.",
                  incorrectFeedback: "افحص البطاقات: Physical للكابلات والإشارات، Data Link لعنوان MAC و Frame، و«تختار الطريق» بطاقة أخرى.",
                  explanation: "Network: تختار الطريق باستخدام IP وتتعامل مع Packet.",
                },
              },
            },
            {
              id: "m13-l01-p03-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "في أي طبقة يعمل TCP و UDP حسب الكتاب؟",
                options: [opt("m13-l01-p03-q2-a", "Transport", true), opt("m13-l01-p03-q2-b", "Network"), opt("m13-l01-p03-q2-c", "Data Link")],
                feedback: {
                  hints: ["افحص آخر سطر في بطاقة Network / Transport.", "اختصار الطبقة 4 في الجدول."],
                  correctFeedback: "أحسنت — TCP و UDP يعملان في طبقة النقل Transport.",
                  incorrectFeedback: "افحص بطاقة Transport: «TCP و UDP يعملان في هذه الطبقة».",
                  explanation: "Transport تنظّم وصول البيانات، وفيها يعمل TCP و UDP.",
                },
              },
            },
          ],
        },
        // PDF 80 — باقي طبقات OSI (Session / Presentation / Application) + the OSI layers explorer
        {
          id: "791381-m13-l01-p04",
          title: "باقي طبقات OSI",
          order: 4,
          source: src(80, 80),
          keywords: ["Session", "Presentation", "Application", "الطبقات العليا"],
          blocks: [
            {
              id: "m13-l01-p04-upper", type: "list", origin: "book", variant: "cards", title: "Session / Presentation",
              items: [
                { id: "m13-l01-p04-s1", term: "Session", text: [T("تفتح الاتصال وتديره.")] },
                { id: "m13-l01-p04-s2", text: [T("تحافظ على استمرار الجلسة.")] },
                { id: "m13-l01-p04-s3", text: [T("تنهي الاتصال عند الانتهاء.")] },
                { id: "m13-l01-p04-p1", term: "Presentation", text: [T("تنسيق وتشفير البيانات.")] },
              ],
            },
            {
              id: "m13-l01-p04-app", type: "list", origin: "book", variant: "cards", title: "Application",
              items: [
                { id: "m13-l01-p04-a1", text: [T("الطبقة الأقرب للمستخدم.")] },
                { id: "m13-l01-p04-a2", text: [T("تظهر في المتصفح والبريد والبرامج.")] },
                { id: "m13-l01-p04-a3", text: [T("أمثلة: "), L("HTTP, FTP, SMTP"), T(".")] },
                { id: "m13-l01-p04-a4", text: [T("هي ما يتعامل معه الطالب مباشرة.")] },
              ],
            },
            {
              id: "m13-l01-p04-idea", type: "callout", origin: "book", kind: "important", title: "الفكرة",
              spans: [T("الطبقات العليا أقرب للمستخدم: تدير الجلسة، تنسّق البيانات، وتقدّم الخدمة في البرامج.")],
            },
            {
              // ENRICHMENT — interactive-diagram / osi-layers / v1: placed here because all SEVEN layers are now
              // introduced (PDF 78 names, PDF 79 lower four, PDF 80 upper three). Layer texts are the book's own.
              id: "m13-l01-p04-explorer", type: "interactive-diagram", origin: "teacher-enrichment",
              interactionType: "osi-layers", version: 1,
              title: "استكشف طبقات OSI السبع",
              description: "اضغط على أي طبقة لتقرأ وظيفتها بكلمات قليلة، وبدّل بين «إرسال» و«استقبال» لترى اتجاه المرور في الطبقات.",
              source: src(80, 80),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "طبقات OSI من الأعلى إلى الأسفل: 7 Application (الأقرب للمستخدم؛ المتصفح والبريد والبرامج) · 6 Presentation (تنسيق وتشفير البيانات) · 5 Session (تفتح الاتصال وتديره وتنهيه) · 4 Transport (تنظّم وصول البيانات؛ فيها TCP و UDP) · 3 Network (تختار الطريق باستخدام IP؛ Packet) · 2 Data Link (تنقل Frame داخل الشبكة؛ MAC Address) · 1 Physical (الكابلات والإشارات والواي فاي). عند الإرسال ننزل من 7 إلى 1، وعند الاستقبال نصعد من 1 إلى 7." },
              config: {
                layers: [
                  { number: 7, name: "Application", arabic: "التطبيق", token: "App", role: "الطبقة الأقرب للمستخدم: تظهر في المتصفح والبريد والبرامج." },
                  { number: 6, name: "Presentation", arabic: "العرض", token: "Pres", role: "تنسيق وتشفير البيانات." },
                  { number: 5, name: "Session", arabic: "الجلسة", token: "Sess", role: "تفتح الاتصال وتديره، وتنهيه عند الانتهاء." },
                  { number: 4, name: "Transport", arabic: "النقل", token: "TCP/UDP", role: "تنظّم وصول البيانات؛ TCP و UDP يعملان فيها." },
                  { number: 3, name: "Network", arabic: "الشبكة", token: "IP", role: "تختار الطريق باستخدام IP، وتتعامل مع Packet." },
                  { number: 2, name: "Data Link", arabic: "ربط البيانات", token: "MAC", role: "تنقل Frame داخل الشبكة، وتتعامل مع MAC Address." },
                  { number: 1, name: "Physical", arabic: "الفيزيائية", token: "Cable", role: "الكابلات، الإشارات، الواي فاي." },
                ],
                sendLabel: "إرسال", receiveLabel: "استقبال",
                sendNote: "عند الإرسال ننزل من 7 إلى 1.", receiveNote: "عند الاستقبال نصعد من 1 إلى 7.",
                upperLabel: "الطبقات العليا: أقرب للمستخدم", lowerLabel: "الطبقات الدنيا: تنقل البيانات فعليًا",
              },
            },
            {
              id: "m13-l01-p04-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي طبقة تفتح الاتصال وتديره وتنهيه عند الانتهاء؟",
                options: [opt("m13-l01-p04-q1-a", "Session", true), opt("m13-l01-p04-q1-b", "Presentation"), opt("m13-l01-p04-q1-c", "Application")],
                feedback: {
                  hints: ["كلمة «جلسة» تعني اتصالًا يبدأ وينتهي.", "افحص بطاقة Session / Presentation."],
                  correctFeedback: "أحسنت — Session (الجلسة) تفتح الاتصال وتديره وتنهيه.",
                  incorrectFeedback: "افحص البطاقات: Presentation للتنسيق والتشفير، Application الأقرب للمستخدم؛ «تفتح الاتصال وتديره» طبقة أخرى.",
                  explanation: "Session: تفتح الاتصال، تحافظ على استمرار الجلسة، وتنهيه.",
                },
              },
            },
            {
              id: "m13-l01-p04-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي طبقة هي الأقرب للمستخدم وتظهر في المتصفح والبريد؟",
                options: [opt("m13-l01-p04-q2-a", "Physical"), opt("m13-l01-p04-q2-b", "Application", true), opt("m13-l01-p04-q2-c", "Transport")],
                feedback: {
                  hints: ["افحص بطاقة Application.", "الطبقة رقم 7 في الجدول."],
                  correctFeedback: "أحسنت — Application هي ما يتعامل معه الطالب مباشرة.",
                  incorrectFeedback: "افحص بطاقة Application: «الطبقة الأقرب للمستخدم … تظهر في المتصفح والبريد والبرامج».",
                  explanation: "Application (7): الأقرب للمستخدم، أمثلة HTTP, FTP, SMTP.",
                },
              },
            },
          ],
        },
      ],
    },

    // ── l02 — the TCP/IP model and the comparison (PDF 81–83) ────────────────────────────────────────────────
    {
      id: "791381-m13-l02",
      title: "نموذج TCP/IP",
      order: 2,
      pages: [
        // PDF 81 — نموذج TCP/IP
        {
          id: "791381-m13-l02-p01",
          title: "نموذج TCP/IP",
          order: 1,
          source: src(81, 81),
          keywords: ["TCP/IP", "4 طبقات", "الإنترنت"],
          blocks: [
            {
              id: "m13-l02-p01-def", type: "callout", origin: "book", kind: "important",
              spans: [T("هو النموذج العملي الذي تعتمد عليه الإنترنت.")],
            },
            {
              id: "m13-l02-p01-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m13-l02-p01-f1", text: [T("يتكوّن من 4 طبقات بدل 7 طبقات.")] },
                { id: "m13-l02-p01-f2", text: [T("ينظّم تقسيم البيانات وإرسالها وتوجيهها.")] },
                { id: "m13-l02-p01-f3", text: [T("يصل في النهاية إلى البرنامج الذي يستخدمه الطالب.")] },
              ],
            },
            {
              id: "m13-l02-p01-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [L("TCP/IP"), T(" هو النموذج المستخدم فعليًا في شبكات الإنترنت اليوم.")],
            },
            {
              id: "m13-l02-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "من كم طبقة يتكوّن نموذج TCP/IP؟ (اكتب الرقم)",
                answer: "4",
                feedback: {
                  hints: ["افحص السطر الأول في قائمة الصفحة.", "أقل من 7."],
                  correctFeedback: "صحيح — 4 طبقات بدل 7.",
                  incorrectFeedback: "افحص قائمة الصفحة: «يتكوّن من … طبقات بدل 7 طبقات».",
                  explanation: "TCP/IP: 4 طبقات؛ OSI: 7 طبقات.",
                },
              },
            },
            {
              id: "m13-l02-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي النموذجين هو المستخدم فعليًا في شبكات الإنترنت اليوم؟",
                options: [opt("m13-l02-p01-q2-a", "OSI"), opt("m13-l02-p01-q2-b", "TCP/IP", true)],
                feedback: {
                  hints: ["افحص صندوق «تذكّر».", "النموذج «العملي»."],
                  correctFeedback: "أحسنت — TCP/IP هو النموذج العملي الذي تعتمد عليه الإنترنت.",
                  incorrectFeedback: "افحص صندوق «تذكّر»: أي نموذج «المستخدم فعليًا في شبكات الإنترنت اليوم»؟",
                  explanation: "TCP/IP عملي ومستخدم فعليًا؛ OSI يساعد على الفهم.",
                },
              },
            },
          ],
        },
        // PDF 82 — طبقات TCP/IP الأربع
        {
          id: "791381-m13-l02-p02",
          title: "طبقات TCP/IP الأربع",
          order: 2,
          source: src(82, 82),
          keywords: ["Application", "Transport", "Internet", "Link"],
          blocks: [
            {
              id: "m13-l02-p02-table", type: "table", origin: "book",
              caption: "الطبقات الأربع من الأعلى (4) إلى الأسفل (1)",
              headers: ["الرقم", "الطبقة", "وظيفتها"],
              columnDirs: ["ltr", "rtl", "rtl"],
              rows: [
                ["4", "التطبيق Application", "خدمات المستخدم مثل الويب والبريد ونقل الملفات."],
                ["3", "النقل Transport", "تنظيم وصول البيانات بواسطة TCP أو UDP."],
                ["2", "الإنترنت Internet", "توجيه البيانات باستخدام IP لاختيار الطريق."],
                ["1", "الربط Link", "التعامل مع الكابل أو الواي فاي وطريقة الإرسال."],
              ],
            },
            {
              id: "m13-l02-p02-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("لاحظ أن طبقة "), L("Internet"), T(" هنا تقوم بما تقوم به طبقة "), L("Network"), T(" في OSI (اختيار الطريق بعنوان IP)، وأن "), L("Link"), T(" تجمع الكابل والواي فاي وطريقة الإرسال. المقارنة الكاملة في الصفحة التالية.")],
            },
            {
              id: "m13-l02-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي طبقة في TCP/IP توجّه البيانات باستخدام IP لاختيار الطريق؟",
                options: [opt("m13-l02-p02-q1-a", "Link"), opt("m13-l02-p02-q1-b", "Internet", true), opt("m13-l02-p02-q1-c", "Application")],
                feedback: {
                  hints: ["افحص السطر الذي يذكر «اختيار الطريق».", "الطبقة رقم 2."],
                  correctFeedback: "أحسنت — Internet توجّه البيانات باستخدام IP.",
                  incorrectFeedback: "افحص الجدول: Link للكابل والواي فاي، Application لخدمات المستخدم؛ «توجيه … باستخدام IP» طبقة أخرى.",
                  explanation: "Internet (2): توجيه البيانات باستخدام IP لاختيار الطريق.",
                },
              },
            },
            {
              id: "m13-l02-p02-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي طبقة في TCP/IP تتعامل مع الكابل أو الواي فاي وطريقة الإرسال؟",
                options: [opt("m13-l02-p02-q2-a", "Link", true), opt("m13-l02-p02-q2-b", "Transport"), opt("m13-l02-p02-q2-c", "Internet")],
                feedback: {
                  hints: ["الطبقة رقم 1 في الجدول.", "الكابل والواي فاي = الربط."],
                  correctFeedback: "أحسنت — Link تتعامل مع الكابل أو الواي فاي.",
                  incorrectFeedback: "افحص السطر الأخير في الجدول: «التعامل مع الكابل أو الواي فاي وطريقة الإرسال».",
                  explanation: "Link (1): الكابل أو الواي فاي وطريقة الإرسال.",
                },
              },
            },
          ],
        },
        // PDF 83 — مقارنة سريعة: OSI و TCP/IP
        {
          id: "791381-m13-l02-p03",
          title: "مقارنة سريعة: OSI و TCP/IP",
          order: 3,
          source: src(83, 83),
          keywords: ["مقارنة", "OSI", "TCP/IP", "7 طبقات", "4 طبقات"],
          blocks: [
            {
              id: "m13-l02-p03-figure", type: "table", origin: "book",
              caption: "الرسم المقارن: 7 طبقات OSI مقابل 4 طبقات TCP/IP",
              headers: ["طبقات OSI — 7", "طبقات TCP/IP — 4"],
              columnDirs: ["ltr", "ltr"],
              rows: [
                ["Application", "Application"],
                ["Presentation", "Application"],
                ["Session", "Application"],
                ["Transport", "Transport"],
                ["Network", "Internet"],
                ["Data Link", "Link"],
                ["Physical", "Link"],
              ],
            },
            {
              id: "m13-l02-p03-figure-note", type: "callout", origin: "book", kind: "important",
              spans: [T("الطبقات الثلاث العليا في "), L("OSI"), T(" تُجمع في طبقة "), L("Application"), T(" في "), L("TCP/IP"), T(".")],
            },
            {
              id: "m13-l02-p03-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m13-l02-p03-f1", text: [L("OSI"), T(" نموذج تعليمي يساعد على الفهم، و "), L("TCP/IP"), T(" نموذج عملي أكثر استعمالًا.")] },
                { id: "m13-l02-p03-f2", text: [T("طبقة النقل "), L("Transport"), T(" فيها "), L("TCP"), T(" و "), L("UDP"), T(".")] },
                { id: "m13-l02-p03-f3", text: [T("طبقة "), L("Internet"), T(" فيها "), L("IP"), T(" والتوجيه، و "), L("Link"), T(" فيها الكابل والواي فاي و "), L("MAC"), T(".")] },
              ],
            },
            {
              id: "m13-l02-p03-exam", type: "callout", origin: "book", kind: "tip", title: "في الامتحان",
              spans: [T("افهم وظيفة الطبقة وليس الاسم فقط؛ هذا ما يُسأل عنه غالبًا.")],
            },
            {
              id: "m13-l02-p03-ex1", type: "example", origin: "teacher-enrichment", mode: "solved",
              title: "مثال محلول: أين تقع طبقة Session من OSI في نموذج TCP/IP؟",
              steps: [
                { text: "Session هي إحدى الطبقات الثلاث العليا في OSI (Application, Presentation, Session)." },
                { text: "الرسم المقارن يقول: الطبقات الثلاث العليا في OSI تُجمع في طبقة Application في TCP/IP." },
              ],
              result: "Session في OSI تقع في طبقة Application في TCP/IP",
              explanation: "بالمثل: Network تقابل Internet، و Data Link و Physical تقابلان Link، أما Transport فتبقى Transport.",
            },
            {
              id: "m13-l02-p03-match", type: "practice-table", origin: "teacher-enrichment",
              caption: "تحقّق من نفسك: في أي طبقة من TCP/IP تقع كل طبقة من OSI؟",
              headers: ["طبقة OSI", "طبقة TCP/IP"],
              columnDirs: ["ltr", "ltr"],
              rows: [
                ["Presentation", TL("Application")],
                ["Network", TL("Internet")],
                ["Physical", TL("Link")],
                ["Transport", TL("Transport")],
                ["Session", TL("Application")],
                ["Data Link", TL("Link")],
              ],
            },
            {
              id: "m13-l02-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "OSI نموذج تعليمي يساعد على الفهم، أما TCP/IP فنموذج عملي أكثر استعمالًا.",
                answer: true,
                feedback: {
                  hints: ["افحص السطر الأول في قائمة الصفحة.", "أيهما «تعليمي» وأيهما «عملي»؟"],
                  correctFeedback: "صحيح — OSI للفهم، و TCP/IP عملي أكثر استعمالًا.",
                  incorrectFeedback: "افحص قائمة الصفحة: «OSI نموذج تعليمي … و TCP/IP نموذج عملي أكثر استعمالًا».",
                  explanation: "هذا هو الفرق الجوهري بين النموذجين حسب الكتاب.",
                },
              },
            },
          ],
        },
      ],
    },

    // ── l03 — TCP and UDP (PDF 84–86) ────────────────────────────────────────────────────────────────────────
    {
      id: "791381-m13-l03",
      title: "TCP و UDP",
      order: 3,
      pages: [
        // PDF 84 — TCP و UDP
        {
          id: "791381-m13-l03-p01",
          title: "TCP و UDP",
          order: 1,
          source: src(84, 84),
          keywords: ["TCP", "UDP", "Transport Layer", "موثوق", "سريع"],
          blocks: [
            {
              id: "m13-l03-p01-both", type: "text", origin: "book",
              spans: [T("كلاهما يعمل في طبقة النقل "), L("Transport Layer"), T(".")],
            },
            {
              id: "m13-l03-p01-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m13-l03-p01-tcp", term: "TCP", text: [T("بروتوكول موثوق. يتأكّد أن البيانات وصلت كاملة وبالترتيب الصحيح.")], note: "مناسب: الويب، البريد، الملفات" },
                { id: "m13-l03-p01-udp", term: "UDP", text: [T("بروتوكول سريع. لا يتأكّد من وصول كل البيانات، فيُستخدم عندما تكون السرعة أهم.")], note: "مناسب: بث مباشر، ألعاب" },
              ],
            },
            {
              id: "m13-l03-p01-diff", type: "callout", origin: "book", kind: "important", title: "الفرق باختصار",
              spans: [L("TCP"), T(" للموثوقية وضمان الوصول، و "), L("UDP"), T(" للسرعة عندما يُمكن تحمّل فقد جزء بسيط.")],
            },
            {
              id: "m13-l03-p01-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("«موثوق» تعني أن المرسل يتأكّد من الوصول ويعيد ما لم يصل، لذلك لا يضيع شيء لكن الأمر يأخذ وقتًا أطول. «سريع» تعني الإرسال دون انتظار التأكيد، لذلك قد يضيع جزء صغير لكن الوقت أقصر.")],
            },
            {
              id: "m13-l03-p01-ex1", type: "example", origin: "teacher-enrichment", mode: "solved",
              title: "مثال محلول: تحميل ملف أم مشاهدة بث مباشر؟",
              prompt: "طالب يحمّل ملف واجب من موقع المدرسة، وطالب آخر يشاهد بثًا مباشرًا لمباراة. أي بروتوكول يناسب كل حالة؟",
              steps: [
                { text: "الملف يجب أن يصل كاملًا وبالترتيب الصحيح، وإلا تلف — بطاقة TCP: «مناسب: الويب، البريد، الملفات»." },
                { text: "إذن تحميل الملف: TCP." },
                { text: "في البث المباشر السرعة أهم، وفقد جزء بسيط لا يفسد المشاهدة — بطاقة UDP: «مناسب: بث مباشر، ألعاب»." },
                { text: "إذن البث المباشر: UDP." },
              ],
              result: "تحميل الملف = TCP · البث المباشر = UDP",
              explanation: "السؤال دائمًا: هل يجب أن يصل كل شيء كاملًا (TCP) أم أن السرعة أهم ويمكن تحمّل فقد بسيط (UDP)؟",
            },
            {
              id: "m13-l03-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي بروتوكول يتأكّد أن البيانات وصلت كاملة وبالترتيب الصحيح؟",
                options: [opt("m13-l03-p01-q1-a", "TCP", true), opt("m13-l03-p01-q1-b", "UDP")],
                feedback: {
                  hints: ["افحص كلمة «موثوق» في البطاقتين.", "البروتوكول المناسب للملفات."],
                  correctFeedback: "أحسنت — TCP موثوق ويضمن الوصول.",
                  incorrectFeedback: "افحص بطاقة UDP: «لا يتأكّد من وصول كل البيانات» — إذن البروتوكول الذي يتأكّد هو الآخر.",
                  explanation: "TCP للموثوقية وضمان الوصول.",
                },
              },
            },
            {
              id: "m13-l03-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "TCP و UDP يعملان معًا في طبقة النقل Transport Layer.",
                answer: true,
                feedback: {
                  hints: ["افحص أول سطر في الصفحة.", "«كلاهما يعمل في …»."],
                  correctFeedback: "صحيح — كلاهما في طبقة النقل.",
                  incorrectFeedback: "افحص أول سطر في الصفحة: «كلاهما يعمل في طبقة النقل Transport Layer».",
                  explanation: "طبقة النقل تنظّم وصول البيانات، وفيها TCP و UDP.",
                },
              },
            },
          ],
        },
        // PDF 85 — متى نستخدم TCP؟
        {
          id: "791381-m13-l03-p02",
          title: "متى نستخدم TCP؟",
          order: 2,
          source: src(85, 85),
          keywords: ["TCP", "موثوق", "مضمون", "الترتيب"],
          blocks: [
            {
              id: "m13-l03-p02-def", type: "callout", origin: "book", kind: "important",
              spans: [T("نستخدم "), L("TCP"), T(" عندما نحتاج اتصالًا موثوقًا ومضمونًا.")],
            },
            {
              id: "m13-l03-p02-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m13-l03-p02-f1", text: [T("عندما يجب أن تصل البيانات كاملة.")] },
                { id: "m13-l03-p02-f2", text: [T("عندما يهمّنا ترتيب البيانات.")] },
                { id: "m13-l03-p02-f3", text: [T("أمثلة: "), L("HTTP, SMTP, FTP"), T(".")] },
              ],
            },
            {
              id: "m13-l03-p02-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [L("TCP"), T(" أبطأ نسبيًا، لكنه أكثر أمانًا من ناحية ضمان وصول البيانات.")],
            },
            {
              id: "m13-l03-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "لماذا يُعدّ TCP أبطأ نسبيًا من UDP حسب الكتاب؟",
                options: [opt("m13-l03-p02-q1-a", "لأنه لا يضمن وصول البيانات"), opt("m13-l03-p02-q1-b", "لأنه يضمن وصول البيانات كاملة وبالترتيب", true), opt("m13-l03-p02-q1-c", "لأنه يعمل في طبقة أخرى")],
                feedback: {
                  hints: ["افحص صندوق «تذكّر».", "«أبطأ … لكنه أكثر أمانًا من ناحية …»."],
                  correctFeedback: "أحسنت — الضمان يأخذ وقتًا، لذلك TCP أبطأ نسبيًا لكنه مضمون.",
                  incorrectFeedback: "افحص صندوق «تذكّر»: TCP أبطأ «لكنه أكثر أمانًا من ناحية ضمان وصول البيانات».",
                  explanation: "الموثوقية (ضمان الوصول والترتيب) تكلّف وقتًا.",
                },
              },
            },
          ],
        },
        // PDF 86 — متى نستخدم UDP؟ (+ the TCP/UDP worksheet and the closing review)
        {
          id: "791381-m13-l03-p03",
          title: "متى نستخدم UDP؟",
          order: 3,
          source: src(86, 86),
          keywords: ["UDP", "السرعة", "البث المباشر", "الألعاب", "المكالمات"],
          blocks: [
            {
              id: "m13-l03-p03-def", type: "callout", origin: "book", kind: "important",
              spans: [T("نستخدم "), L("UDP"), T(" عندما تكون السرعة مهمة جدًا.")],
            },
            {
              id: "m13-l03-p03-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m13-l03-p03-f1", text: [T("عندما يمكن تحمّل فقدان جزء صغير من البيانات.")] },
                { id: "m13-l03-p03-f2", text: [T("لا يضمن وصول كل الرسائل.")] },
                { id: "m13-l03-p03-f3", text: [T("أمثلة: الألعاب، البث المباشر، المكالمات.")] },
              ],
            },
            {
              id: "m13-l03-p03-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [L("UDP"), T(" سريع لأنه لا ينتظر تأكيدًا على كل رسالة يرسلها.")],
            },
            {
              id: "m13-l03-p03-match", type: "practice-table", origin: "teacher-enrichment",
              caption: "تحقّق من نفسك: TCP أم UDP؟ (اعتمد على أمثلة الكتاب)",
              headers: ["الحالة", "البروتوكول"],
              columnDirs: ["rtl", "ltr"],
              rows: [
                ["إرسال بريد إلكتروني.", TU("TCP")],
                ["مكالمة صوتية مباشرة.", TU("UDP")],
                ["نقل ملف يجب أن يصل كاملًا.", TU("TCP")],
                ["لعبة جماعية عبر الشبكة.", TU("UDP")],
                ["تصفّح موقع ويب.", TU("TCP")],
                ["بث مباشر لمباراة.", TU("UDP")],
              ],
            },
            {
              id: "m13-l03-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "لماذا UDP سريع حسب الكتاب؟",
                options: [opt("m13-l03-p03-q1-a", "لأنه لا ينتظر تأكيدًا على كل رسالة", true), opt("m13-l03-p03-q1-b", "لأنه يعمل في طبقة الشبكة"), opt("m13-l03-p03-q1-c", "لأنه يرسل الرسائل مرتين")],
                feedback: {
                  hints: ["افحص صندوق «تذكّر».", "ما الذي لا ينتظره UDP؟"],
                  correctFeedback: "أحسنت — UDP لا ينتظر تأكيدًا على كل رسالة، لذلك هو سريع.",
                  incorrectFeedback: "افحص صندوق «تذكّر»: «UDP سريع لأنه لا ينتظر تأكيدًا على كل رسالة يرسلها».",
                  explanation: "بلا انتظار تأكيد = أسرع، لكن بلا ضمان وصول كل الرسائل.",
                },
              },
            },
            // ── closing review for the section (easy, medium, exam-like) ──
            {
              id: "m13-l03-p03-review", type: "heading", origin: "teacher-enrichment", level: 3, text: "مراجعة ختامية: نماذج الاتصال",
            },
            {
              id: "m13-l03-p03-r1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "كم طبقة في OSI وكم طبقة في TCP/IP؟",
                options: [opt("m13-l03-p03-r1-a", "OSI: 7 · TCP/IP: 4", true), opt("m13-l03-p03-r1-b", "OSI: 4 · TCP/IP: 7"), opt("m13-l03-p03-r1-c", "OSI: 7 · TCP/IP: 7")],
                feedback: {
                  hints: ["OSI هو النموذج التعليمي الأطول.", "TCP/IP «4 طبقات بدل 7»."],
                  correctFeedback: "أحسنت — OSI 7 طبقات و TCP/IP 4 طبقات.",
                  incorrectFeedback: "افحص صفحة نموذج TCP/IP: «يتكوّن من 4 طبقات بدل 7 طبقات».",
                  explanation: "OSI 7 · TCP/IP 4.",
                },
              },
            },
            {
              id: "m13-l03-p03-r2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "سؤال بأسلوب الامتحان: طبقة تتعامل مع Frame و MAC Address وتساعد في كشف أخطاء الإرسال. ما هي؟",
                options: [opt("m13-l03-p03-r2-a", "Network"), opt("m13-l03-p03-r2-b", "Data Link", true), opt("m13-l03-p03-r2-c", "Session")],
                feedback: {
                  hints: ["MAC = الطبقة الثانية.", "افحص بطاقة Physical / Data Link."],
                  correctFeedback: "أحسنت — Data Link: Frame، MAC Address، كشف أخطاء الإرسال.",
                  incorrectFeedback: "افحص بطاقة Data Link في صفحة «طبقات OSI الأساسية»: من يتعامل مع MAC Address؟",
                  explanation: "Data Link (2) تنقل Frame داخل الشبكة بعنوان MAC.",
                },
              },
            },
            {
              id: "m13-l03-p03-r3", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "سؤال بأسلوب الامتحان: تطبيق لمكالمات الفيديو المباشرة يفضّل السرعة على وصول كل الرسائل. أي بروتوكول نقل يناسبه، ولماذا؟",
                options: [opt("m13-l03-p03-r3-a", "TCP، لأنه يضمن الترتيب"), opt("m13-l03-p03-r3-b", "UDP، لأنه سريع ولا ينتظر تأكيدًا على كل رسالة", true), opt("m13-l03-p03-r3-c", "UDP، لأنه يضمن وصول كل الرسائل")],
                feedback: {
                  hints: ["افحص أمثلة UDP في الكتاب: «المكالمات».", "أي بروتوكول «لا يضمن وصول كل الرسائل» لكنه سريع؟"],
                  correctFeedback: "أحسنت — المكالمات مثال الكتاب على UDP: السرعة أهم، ويمكن تحمّل فقد جزء صغير.",
                  incorrectFeedback: "افحص صفحة «متى نستخدم UDP؟»: UDP سريع لكنه «لا يضمن وصول كل الرسائل»؛ و TCP للموثوقية لا للسرعة.",
                  explanation: "UDP: السرعة مهمة جدًا ويمكن تحمّل فقد صغير — الألعاب والبث المباشر والمكالمات.",
                },
              },
            },
          ],
        },
      ],
    },
  ],
};

export default m13;
