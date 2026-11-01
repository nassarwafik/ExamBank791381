// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 9 «نموذج OSI ونموذج TCP/IP».
//
// Verbatim conversion of booklet PDF pages 28–30 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every converted block is origin:"book": nothing is added, removed or reworded.
//
// Enrichment (docs/enterprise-791381s-enrichment-plan.md, Phase 5): teacher-enrichment blocks (visuals / activities reused from
// course 791381 after checking their labels against this section, and the end-of-unit «تدريبات الوحدة» lesson) are ADDED after the
// book blocks they explain. The book blocks stay verbatim — pinned by the book lock (bookLock.test.ts).

import type { ContentModule, ContentSource } from "../../types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };

const m09: ContentModule = {
  id: "791381s-m09",
  title: "نموذج OSI ونموذج TCP/IP",
  order: 9,
  lessons: [
    {
      id: "791381s-m09-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m09-l00-p01",
          title: "نموذج OSI ونموذج TCP/IP",
          order: 1,
          layout: "opener",
          source: src(28),
          blocks: [
            {
              id: "m09-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الدفعة الثالثة · كتاب ص 77–86", unitNumber: "09", title: "نموذج OSI ونموذج TCP/IP",
              subtitle: "كيف تنتقل البيانات طبقة بعد طبقة؟ وما الفرق بين TCP و UDP؟",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m09-l01",
      title: "نموذج OSI ونموذج TCP/IP",
      order: 1,
      pages: [
        {
          id: "791381s-m09-l01-p01",
          title: "ما هو نموذج OSI؟",
          order: 1,
          source: src(28, 29),
          blocks: [
            {
              id: "m09-l01-p01-def", type: "text", origin: "book",
              spans: [{ text: "نموذج يساعدنا على فهم انتقال البيانات بين الأجهزة. يقسم عملية الاتصال إلى 7 طبقات، ولكل طبقة وظيفة محدّدة.", style: "strong" }],
            },
            {
              id: "m09-l01-p01-intro", type: "text", origin: "book",
              spans: [{ text: "الاتصال بين جهازين عملية كبيرة، لذلك قسّموها إلى طبقات صغيرة: كل طبقة تقوم بعمل واحد، ثم تسلّم البيانات للطبقة التي بعدها." }],
            },
            {
              id: "m09-l01-p01-tip", type: "text", origin: "book",
              spans: [
                { text: "يساعد أيضًا في " },
                { text: "اكتشاف الأعطال", style: "strong" },
                { text: " وفهم الشبكات. " },
                { text: "لا تحفظ شرحًا طويلًا:", style: "strong" },
                { text: " احفظ وظيفة كل طبقة بكلمات قليلة." },
              ],
            },
            {
              id: "m09-l01-p01-table", type: "table", origin: "book",
              headers: ["#", "الطبقة", "وظيفتها بكلمات قليلة", "كلمة مفتاح"],
              rows: [
                ["7", "التطبيق Application", "الأقرب للمستخدم: المتصفح والبريد والبرامج.", "HTTP · FTP · SMTP"],
                ["6", "العرض Presentation", "تنسيق البيانات وتشفيرها.", "تنسيق · تشفير"],
                ["5", "الجلسة Session", "تفتح الاتصال، تديره، وتنهيه عند الانتهاء.", "جلسة"],
                ["4", "النقل Transport", "تنظّم وصول البيانات.", "TCP · UDP · Segment"],
                ["3", "الشبكة Network", "تختار الطريق باستخدام IP.", "IP · Packet · Router"],
                ["2", "ربط البيانات Data Link", "تنقل البيانات داخل الشبكة، وتساعد في كشف أخطاء الإرسال.", "MAC · Frame · Switch"],
                ["1", "الفيزيائية Physical", "الكوابل والإشارات والواي فاي.", "كابل · إشارة"],
              ],
            },
            { id: "m09-l01-p01-memo-h", type: "heading", origin: "book", level: 4, text: "للحفظ" },
            {
              id: "m09-l01-p01-memo-1", type: "text", origin: "book",
              spans: [
                { text: "عند " },
                { text: "الإرسال", style: "strong" },
                { text: " ننزل من الطبقة 7 إلى 1. وعند " },
                { text: "الاستقبال", style: "strong" },
                { text: " نصعد من 1 إلى 7." },
              ],
            },
            {
              id: "m09-l01-p01-memo-2", type: "text", origin: "book",
              spans: [{ text: "الطبقات الدنيا تنقل البيانات فعليًا: من الكابل (1) إلى التوجيه (3) فالتنظيم (4). والطبقات العليا (5–7) أقرب للمستخدم." }],
            },
            {
              // ENRICHMENT — interactive-diagram / osi-layers / v1 (reused from 791381-m13): the table's seven layers with the
              // booklet's own "few words" per layer, and the «للحفظ» send (7→1) / receive (1→7) rule as a toggle.
              id: "m09-l01-p01-osi-explorer", type: "interactive-diagram", origin: "teacher-enrichment",
              interactionType: "osi-layers", version: 1,
              title: "استكشف طبقات OSI السبع",
              description: "اضغط على أي طبقة لتقرأ وظيفتها بكلمات قليلة، وبدّل بين «إرسال» و«استقبال» لترى اتجاه المرور في الطبقات.",
              source: src(28, 29),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "طبقات OSI من الأعلى إلى الأسفل: 7 التطبيق Application (الأقرب للمستخدم: المتصفح والبريد والبرامج) · 6 العرض Presentation (تنسيق البيانات وتشفيرها) · 5 الجلسة Session (تفتح الاتصال، تديره، وتنهيه عند الانتهاء) · 4 النقل Transport (تنظّم وصول البيانات؛ TCP · UDP) · 3 الشبكة Network (تختار الطريق باستخدام IP) · 2 ربط البيانات Data Link (تنقل البيانات داخل الشبكة، وتساعد في كشف أخطاء الإرسال؛ MAC) · 1 الفيزيائية Physical (الكوابل والإشارات والواي فاي). عند الإرسال ننزل من الطبقة 7 إلى 1، وعند الاستقبال نصعد من 1 إلى 7." },
              config: {
                layers: [
                  { number: 7, name: "Application", arabic: "التطبيق", token: "HTTP", role: "الأقرب للمستخدم: المتصفح والبريد والبرامج." },
                  { number: 6, name: "Presentation", arabic: "العرض", token: "تشفير", role: "تنسيق البيانات وتشفيرها." },
                  { number: 5, name: "Session", arabic: "الجلسة", token: "جلسة", role: "تفتح الاتصال، تديره، وتنهيه عند الانتهاء." },
                  { number: 4, name: "Transport", arabic: "النقل", token: "TCP/UDP", role: "تنظّم وصول البيانات. كلمة مفتاح: TCP · UDP · Segment." },
                  { number: 3, name: "Network", arabic: "الشبكة", token: "IP", role: "تختار الطريق باستخدام IP. كلمة مفتاح: IP · Packet · Router." },
                  { number: 2, name: "Data Link", arabic: "ربط البيانات", token: "MAC", role: "تنقل البيانات داخل الشبكة، وتساعد في كشف أخطاء الإرسال. كلمة مفتاح: MAC · Frame · Switch." },
                  { number: 1, name: "Physical", arabic: "الفيزيائية", token: "كابل", role: "الكوابل والإشارات والواي فاي." },
                ],
                sendLabel: "إرسال", receiveLabel: "استقبال",
                sendNote: "عند الإرسال ننزل من الطبقة 7 إلى 1.", receiveNote: "عند الاستقبال نصعد من 1 إلى 7.",
                upperLabel: "الطبقات العليا (5–7): أقرب للمستخدم", lowerLabel: "الطبقات الدنيا: تنقل البيانات فعليًا",
              },
            },
          ],
        },
        {
          id: "791381s-m09-l01-p02",
          title: "نموذج TCP/IP",
          order: 2,
          source: src(29, 30),
          blocks: [
            {
              id: "m09-l01-p02-def", type: "text", origin: "book",
              spans: [{ text: "هو النموذج العملي الذي يعتمد عليه الإنترنت اليوم. يتكوّن من 4 طبقات بدل 7.", style: "strong" }],
            },
            {
              id: "m09-l01-p02-table", type: "table", origin: "book",
              headers: ["طبقات OSI (7)", "طبقات TCP/IP (4)", "وظيفتها في TCP/IP"],
              rows: [
                ["7 التطبيق · 6 العرض · 5 الجلسة", "4 · التطبيق Application", "خدمات المستخدم: الويب والبريد ونقل الملفات."],
                ["4 النقل", "3 · النقل Transport", "تنظيم وصول البيانات بواسطة TCP أو UDP."],
                ["3 الشبكة", "2 · الإنترنت Internet", "توجيه البيانات باستخدام IP لاختيار الطريق."],
                ["2 ربط البيانات · 1 الفيزيائية", "1 · الربط Link", "التعامل مع الكابل أو الواي فاي و MAC."],
              ],
            },
            {
              // ENRICHMENT: SVG — the table above as two aligned columns: OSI 7·6·5 → one Application, 4 → Transport,
              // 3 → Internet, 2·1 → Link.
              id: "m09-l01-p02-v-osi-tcpip", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m13/osi-vs-tcpip", motion: true,
              source: src(29, 30),
              title: "مخطط: طبقات OSI السبع مقابل طبقات TCP/IP الأربع",
              alt: "عمودان: على اليمين طبقات OSI السبع من 7 Application إلى 1 Physical، وعلى اليسار طبقات TCP/IP الأربع؛ 4 Application تقابل الطبقات 7 و 6 و 5، و 3 Transport تقابل 4، و 2 Internet تقابل 3، و 1 Link تقابل 2 و 1.",
              caption: "TCP/IP يتكوّن من 4 طبقات بدل 7: التطبيق يجمع 7·6·5، والربط يجمع 2·1.",
            },
            { id: "m09-l01-p02-remember-h", type: "heading", origin: "book", level: 4, text: "تذكّر" },
            {
              id: "m09-l01-p02-remember-1", type: "text", origin: "book",
              spans: [
                { text: "OSI", style: "strong" },
                { text: " نموذج " },
                { text: "تعليمي", style: "strong" },
                { text: " يساعد على الفهم. " },
                { text: "TCP/IP", style: "strong" },
                { text: " نموذج " },
                { text: "عملي", style: "strong" },
                { text: " مستعمل فعليًا في الإنترنت." },
              ],
            },
            {
              id: "m09-l01-p02-remember-2", type: "text", origin: "book",
              spans: [
                { text: "في الامتحان: افهم " },
                { text: "وظيفة الطبقة", style: "strong" },
                { text: " وليس اسمها فقط — هذا ما يُسأل عنه غالبًا." },
              ],
            },
          ],
        },
        {
          id: "791381s-m09-l01-p03",
          title: "بروتوكولا النقل: TCP و UDP",
          order: 3,
          source: src(30),
          blocks: [
            {
              id: "m09-l01-p03-intro", type: "text", origin: "book",
              spans: [{ text: "كلاهما يوصل البيانات من برنامج في جهاز إلى برنامج في جهاز آخر، لكن كل واحد بطريقة مختلفة: الأول يهتم بالدقة، والثاني بالسرعة." }],
            },
            {
              id: "m09-l01-p03-layer", type: "text", origin: "book",
              spans: [
                { text: "كلاهما يعمل في " },
                { text: "طبقة النقل (Transport)", style: "strong" },
                { text: "." },
              ],
            },
            {
              id: "m09-l01-p03-table", type: "table", origin: "book",
              headers: ["وجه المقارنة", "TCP ✓", "UDP ⚡"],
              rows: [
                ["صفته", "موثوق", "سريع"],
                ["هل يتأكد من الوصول؟", "نعم: يتأكد أن البيانات وصلت كاملة وبالترتيب الصحيح", "لا: لا يضمن وصول كل الرسائل"],
                ["السرعة", "أبطأ نسبيًا", "أسرع، لأنه لا ينتظر تأكيدًا على كل رسالة"],
                ["متى نستعمله؟", "عندما يجب أن تصل البيانات كاملة ويهمّنا ترتيبها", "عندما تكون السرعة مهمة جدًا ويمكن تحمّل فقدان جزء صغير"],
                ["أمثلة", "الويب، البريد، الملفات HTTP · SMTP · FTP", "الألعاب، البث المباشر، المكالمات"],
              ],
            },
            {
              // ENRICHMENT: SVG — the table's «هل يتأكد من الوصول؟» and «السرعة» rows: TCP sends and waits for a confirmation,
              // UDP sends fast without waiting.
              id: "m09-l01-p03-v-tcp-udp", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m13/tcp-vs-udp", motion: true,
              source: src(30),
              title: "رسم توضيحي: TCP موثوق و UDP سريع",
              alt: "لوحتان: في لوحة TCP تذهب البيانات إلى الجهاز الآخر ثم يعود تأكيد الوصول، وتحتها «موثوق ومرتّب · الويب، البريد، الملفات»؛ وفي لوحة UDP تنطلق الرسائل بسرعة في اتجاه واحد بلا تأكيد، وتحتها «سريع · بث مباشر، ألعاب».",
              caption: "TCP يتأكد أن البيانات وصلت كاملة، و UDP أسرع لأنه لا ينتظر تأكيدًا على كل رسالة.",
            },
            { id: "m09-l01-p03-life-h", type: "heading", origin: "book", level: 4, text: "مثال من الحياة" },
            {
              id: "m09-l01-p03-life-1", type: "text", origin: "book",
              spans: [
                { text: "TCP", style: "strong" },
                { text: " مثل طرد بالبريد المسجّل: يجب أن يصل كاملًا ومع تأكيد استلام." },
              ],
            },
            {
              id: "m09-l01-p03-life-2", type: "text", origin: "book",
              spans: [
                { text: "UDP", style: "strong" },
                { text: " مثل البث المباشر لمباراة: إذا ضاعت صورة صغيرة لا نعيدها، المهم أن يستمر البث بسرعة." },
              ],
            },
          ],
        },
      ],
    },
    {
      // «تدريبات الوحدة» — ADDED enrichment: an end-of-unit exercise page after the booklet's own pages. Every question is
      // answered by the section's printed text above (the explanation quotes it). The book pages are unchanged (book lock).
      id: "791381s-m09-l02",
      title: "تدريبات الوحدة",
      order: 2,
      pages: [
        {
          id: "791381s-m09-l02-p01",
          title: "تدريبات الوحدة: نموذج OSI ونموذج TCP/IP",
          order: 1,
          layout: "practice",
          source: src(28, 30),
          blocks: [
            {
              id: "m09-l02-p01-q01", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "إلى كم طبقة يقسم نموذج OSI عملية الاتصال؟",
                options: [{ id: "a", text: "4 طبقات" }, { id: "b", text: "5 طبقات" }, { id: "c", text: "7 طبقات", correct: true }, { id: "d", text: "9 طبقات" }],
                feedback: { explanation: "نموذج OSI يقسم عملية الاتصال إلى 7 طبقات، ولكل طبقة وظيفة محدّدة." },
              },
            },
            {
              id: "m09-l02-p01-q02", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "عند الاستقبال ننزل من الطبقة 7 إلى الطبقة 1.", answer: false, feedback: { explanation: "للحفظ: عند الإرسال ننزل من الطبقة 7 إلى 1، وعند الاستقبال نصعد من 1 إلى 7." } },
            },
            {
              id: "m09-l02-p01-q03", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "أيّ طبقة تفتح الاتصال، تديره، وتنهيه عند الانتهاء؟",
                options: [{ id: "a", text: "النقل Transport" }, { id: "b", text: "الجلسة Session", correct: true }, { id: "c", text: "العرض Presentation" }, { id: "d", text: "الشبكة Network" }],
                feedback: { explanation: "الطبقة 5 الجلسة Session: تفتح الاتصال، تديره، وتنهيه عند الانتهاء." },
              },
            },
            {
              id: "m09-l02-p01-q04", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "أيّ طبقة تختار الطريق باستخدام IP؟",
                options: [{ id: "a", text: "ربط البيانات Data Link" }, { id: "b", text: "النقل Transport" }, { id: "c", text: "الفيزيائية Physical" }, { id: "d", text: "الشبكة Network", correct: true }],
                feedback: { explanation: "الطبقة 3 الشبكة Network: تختار الطريق باستخدام IP. كلمة مفتاح: IP · Packet · Router." },
              },
            },
            {
              id: "m09-l02-p01-q05", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "أيّ النموذجين نموذج عملي مستعمل فعليًا في الإنترنت؟",
                options: [{ id: "a", text: "TCP/IP", correct: true }, { id: "b", text: "OSI" }, { id: "c", text: "لا أحد منهما: كلاهما نموذج تعليمي فقط" }],
                feedback: { explanation: "تذكّر: OSI نموذج تعليمي يساعد على الفهم. TCP/IP نموذج عملي مستعمل فعليًا في الإنترنت." },
              },
            },
            {
              id: "m09-l02-p01-q06", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "يتكوّن نموذج TCP/IP من 4 طبقات بدل 7.", answer: true, feedback: { explanation: "TCP/IP هو النموذج العملي الذي يعتمد عليه الإنترنت اليوم. يتكوّن من 4 طبقات بدل 7." } },
            },
            {
              id: "m09-l02-p01-q07", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "أيّ بروتوكول يتأكد أن البيانات وصلت كاملة وبالترتيب الصحيح؟",
                options: [{ id: "a", text: "UDP" }, { id: "b", text: "لا أحد منهما" }, { id: "c", text: "TCP", correct: true }],
                feedback: { explanation: "TCP موثوق: يتأكد أن البيانات وصلت كاملة وبالترتيب الصحيح. أما UDP فلا يضمن وصول كل الرسائل." },
              },
            },
            {
              id: "m09-l02-p01-q08", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "UDP مناسب للبث المباشر لمباراة: إذا ضاعت صورة صغيرة لا نعيدها، المهم أن يستمر البث بسرعة.", answer: true, feedback: { explanation: "UDP مثل البث المباشر لمباراة: إذا ضاعت صورة صغيرة لا نعيدها، المهم أن يستمر البث بسرعة. نستعمله عندما تكون السرعة مهمة جدًا ويمكن تحمّل فقدان جزء صغير." } },
            },
            {
              id: "m09-l02-p01-q09", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "ordering", prompt: "رتّب طبقات OSI كما تمرّ بها البيانات عند الإرسال (من الأولى إلى الأخيرة):",
                items: [
                  { id: "net", text: "3 · الشبكة Network" },
                  { id: "app", text: "7 · التطبيق Application" },
                  { id: "phy", text: "1 · الفيزيائية Physical" },
                  { id: "ses", text: "5 · الجلسة Session" },
                  { id: "dl", text: "2 · ربط البيانات Data Link" },
                  { id: "tra", text: "4 · النقل Transport" },
                  { id: "pre", text: "6 · العرض Presentation" },
                ],
                order: ["app", "pre", "ses", "tra", "net", "dl", "phy"],
                feedback: { explanation: "عند الإرسال ننزل من الطبقة 7 إلى 1: التطبيق ← العرض ← الجلسة ← النقل ← الشبكة ← ربط البيانات ← الفيزيائية." },
              },
            },
            {
              id: "m09-l02-p01-q10", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "matching", prompt: "صِل كل طبقة بكلماتها المفتاحية:",
                left: [
                  { id: "net", text: "الشبكة Network" },
                  { id: "dl", text: "ربط البيانات Data Link" },
                  { id: "tra", text: "النقل Transport" },
                  { id: "app", text: "التطبيق Application" },
                  { id: "pre", text: "العرض Presentation" },
                ],
                right: [
                  { id: "r1", text: "MAC · Frame · Switch" },
                  { id: "r2", text: "HTTP · FTP · SMTP" },
                  { id: "r3", text: "IP · Packet · Router" },
                  { id: "r4", text: "تنسيق · تشفير" },
                  { id: "r5", text: "TCP · UDP · Segment" },
                ],
                pairs: { net: "r3", dl: "r1", tra: "r5", app: "r2", pre: "r4" },
                feedback: { explanation: "من جدول الطبقات: التطبيق HTTP · FTP · SMTP، العرض تنسيق · تشفير، النقل TCP · UDP · Segment، الشبكة IP · Packet · Router، ربط البيانات MAC · Frame · Switch." },
              },
            },
            {
              id: "m09-l02-p01-q11", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "classify", prompt: "ضع كل طبقة من طبقات OSI في طبقة TCP/IP التي تقابلها:",
                groups: [{ id: "t4", text: "4 · التطبيق Application" }, { id: "t3", text: "3 · النقل Transport" }, { id: "t2", text: "2 · الإنترنت Internet" }, { id: "t1", text: "1 · الربط Link" }],
                items: [
                  { id: "o5", text: "5 الجلسة" },
                  { id: "o2", text: "2 ربط البيانات" },
                  { id: "o7", text: "7 التطبيق" },
                  { id: "o3", text: "3 الشبكة" },
                  { id: "o1", text: "1 الفيزيائية" },
                  { id: "o6", text: "6 العرض" },
                  { id: "o4", text: "4 النقل" },
                ],
                assign: { o7: "t4", o6: "t4", o5: "t4", o4: "t3", o3: "t2", o2: "t1", o1: "t1" },
                feedback: { explanation: "7 التطبيق · 6 العرض · 5 الجلسة ← 4 التطبيق Application؛ 4 النقل ← 3 النقل Transport؛ 3 الشبكة ← 2 الإنترنت Internet؛ 2 ربط البيانات · 1 الفيزيائية ← 1 الربط Link." },
              },
            },
            {
              id: "m09-l02-p01-q12", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "wordBank", prompt: "أكمل الفراغات من مخزن الكلمات:",
                segments: ["يعمل TCP و UDP في طبقة ", { blank: "b1" }, ". صفة TCP أنه ", { blank: "b2" }, "، وصفة UDP أنه ", { blank: "b3" }, "، لأنه لا ينتظر ", { blank: "b4" }, " على كل رسالة."],
                bank: ["سريع", "الشبكة", "تأكيدًا", "موثوق", "النقل", "الجلسة"],
                answers: { b1: "النقل", b2: "موثوق", b3: "سريع", b4: "تأكيدًا" },
                feedback: { explanation: "كلاهما يعمل في طبقة النقل (Transport). صفة TCP: موثوق. صفة UDP: سريع — أسرع، لأنه لا ينتظر تأكيدًا على كل رسالة." },
              },
            },
            // Phase 8C-3 — an advanced exam item (private store api/src/data/learning-exam-items/791381s.json; the official grader judges it).
            { id: "m09-l02-p01-x-adv-osi", type: "exam-item", origin: "teacher-enrichment", itemId: "m09-adv-osi", label: "تدريب متقدّم: طبقات OSI" },
            { id: "m09-l02-p01-lib-t10", type: "library-training", origin: "teacher-enrichment", trainingId: "T10", label: "تدريب 10", requiredModuleId: "791381s-m09" },
          ],
        },
      ],
    },
  ],
};

export default m09;
