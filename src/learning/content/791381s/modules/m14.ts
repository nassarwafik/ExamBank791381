// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 14 «تجزئة البيانات والمصافحة الثلاثية».
//
// Verbatim conversion of booklet PDF pages 39–41 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every converted block is origin:"book": nothing is added, removed or reworded. The encapsulation drawing and the
// handshake drawing are crops of the booklet itself.
//
// Enrichment (docs/enterprise-791381s-enrichment-plan.md, Phases 2–5): teacher-enrichment blocks (visuals / activities reused from
// course 791381 after checking their labels against this section, and the end-of-unit «تدريبات الوحدة» lesson) are ADDED after the
// book blocks they explain. The book blocks above stay verbatim — pinned by the book lock (bookLock.test.ts).

import type { ContentModule, ContentSource } from "../../types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };

const m14: ContentModule = {
  id: "791381s-m14",
  title: "تجزئة البيانات والمصافحة الثلاثية",
  order: 14,
  lessons: [
    {
      id: "791381s-m14-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m14-l00-p01",
          title: "تجزئة البيانات والمصافحة الثلاثية",
          order: 1,
          layout: "opener",
          source: src(39),
          blocks: [
            {
              id: "m14-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الدفعة الثالثة · كتاب ص 116–118", unitNumber: "14", title: "تجزئة البيانات والمصافحة الثلاثية",
              subtitle: "كيف تُغلّف البيانات قبل الإرسال؟ وكيف يبدأ اتصال TCP؟",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m14-l01",
      title: "تجزئة البيانات والمصافحة الثلاثية",
      order: 1,
      pages: [
        {
          id: "791381s-m14-l01-p01",
          title: "تجزئة البيانات في OSI",
          order: 1,
          source: src(39, 40),
          blocks: [
            {
              id: "m14-l01-p01-def", type: "text", origin: "book",
              spans: [{ text: "قبل إرسال البيانات يتم تقسيمها وتنظيمها: كل طبقة تضيف معلومات (مثل غلاف) تساعد على الإرسال، ويتغيّر اسم البيانات حسب الطبقة.", style: "strong" }],
            },
            {
              id: "m14-l01-p01-intro", type: "text", origin: "book",
              spans: [{ text: "البيانات الكبيرة تُقسَم إلى قطع صغيرة، وكل قطعة تُغلّف بمعلومات تساعدها على الوصول إلى المكان الصحيح." }],
            },
            {
              id: "m14-l01-p01-drawing", type: "diagram", origin: "book",
              src: "/learning-assets/791381s/e8151af93e561945.png",
              alt: "صناديق متداخلة: الصندوق الخارجي «طبقة ربط البيانات (2) · Frame» وفيه على الجانبين «MAC مصدر وهدف» و«فحص أخطاء»؛ داخله «طبقة الشبكة (3) · Packet» وفيه «IP مصدر وهدف»؛ داخله «طبقة النقل (4) · Segment» وفيه «المنافذ والتحكّم» وصندوق متقطّع «البيانات · Data».",
              caption: "كل طبقة تضيف غلافًا حول البيانات",
            },
            {
              // ENRICHMENT: SVG next to the booklet drawing — the wrappers appear one after the other around the data:
              // Segment (النقل) → Packet (الشبكة) → Frame (ربط البيانات), the page's own order when sending.
              id: "m14-l01-p01-v-stack", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m18/encapsulation-stack", motion: true,
              source: src(39, 40),
              title: "رسم توضيحي: الأغلفة واحدًا بعد الآخر",
              alt: "في الوسط صندوق Data، ثم يظهر حوله غلاف «Segment — النقل (منافذ)»، ثم حوله غلاف «Packet — الشبكة (IP)»، ثم حوله غلاف «Frame — ربط البيانات (MAC)».",
              caption: "الترتيب عند الإرسال: البيانات ‏←‏ Segment ‏←‏ Packet ‏←‏ Frame — كل غلاف يحيط بالذي قبله.",
            },
            {
              id: "m14-l01-p01-table", type: "table", origin: "book",
              headers: ["الاسم", "الطبقة", "ماذا يحتوي؟"],
              rows: [
                ["Segment", "النقل (4)", "أرقام المنافذ والتحكّم بالتدفّق + البيانات."],
                ["Packet", "الشبكة (3)", "IP المصدر والهدف ومعلومات التوجيه."],
                ["Frame", "ربط البيانات (2)", "MAC المصدر والهدف وفحص الأخطاء."],
              ],
            },
            {
              // ENRICHMENT: SVG of the table's «ماذا يحتوي؟» column — the fields each unit adds around the smaller unit.
              id: "m14-l01-p01-v-pdu", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m18/pdu-anatomy", motion: true,
              source: src(39, 40),
              title: "رسم توضيحي: ماذا يضيف كل غلاف؟",
              alt: "ثلاثة صفوف: Segment (النقل) = «منافذ · تحكّم بالتدفّق» + بيانات؛ Packet (الشبكة) = «IP المصدر/الهدف · توجيه» + Segment؛ Frame (ربط البيانات) = «MAC المصدر/الهدف» + Packet + «فحص الأخطاء».",
              caption: "Segment: المنافذ والتحكّم بالتدفّق. Packet: IP المصدر والهدف ومعلومات التوجيه. Frame: MAC المصدر والهدف وفحص الأخطاء.",
            },
            {
              id: "m14-l01-p01-order", type: "text", origin: "book",
              spans: [{ text: "الترتيب عند الإرسال: البيانات \u200F←\u200F Segment \u200F←\u200F Packet \u200F←\u200F Frame", style: "strong" }],
            },
            {
              id: "m14-l01-p01-analogy", type: "callout", origin: "book", kind: "summary", title: "تشبيه",
              spans: [
                { text: "تكتب رسالة (" },
                { text: "البيانات", style: "strong" },
                { text: ")، تضعها في ظرف عليه رقم الغرفة (" },
                { text: "Segment", style: "strong" },
                { text: ")، ثم في ظرف أكبر عليه عنوان المدينة (" },
                { text: "Packet", style: "strong" },
                { text: ")، ثم في صندوق عليه اسم الشارع والبيت (" },
                { text: "Frame", style: "strong" },
                { text: "). عند الاستلام نفتح الأغلفة بالعكس." },
              ],
            },
            {
              id: "m14-l01-p01-memo", type: "callout", origin: "book", kind: "summary", title: "احفظ",
              spans: [{ text: "Frame = Data Link · Packet = Network · Segment = Transport", style: "strong" }],
            },
          ],
        },
        {
          id: "791381s-m14-l01-p02",
          title: "المصافحة الثلاثية في TCP\u200F (\u200E3-Way Handshake)",
          order: 2,
          source: src(40, 41),
          blocks: [
            {
              id: "m14-l01-p02-def", type: "text", origin: "book",
              spans: [{ text: "عملية من 3 خطوات لإنشاء اتصال موثوق قبل تبادل أي بيانات.", style: "strong" }],
            },
            {
              id: "m14-l01-p02-intro", type: "text", origin: "book",
              spans: [{ text: "قبل أن يرسل TCP البيانات، يتأكد أن الطرف الآخر جاهز ويسمعه. لذلك يبدأ بثلاث رسائل قصيرة." }],
            },
            {
              id: "m14-l01-p02-drawing", type: "diagram", origin: "book",
              src: "/learning-assets/791381s/f8db9ce486797117.png",
              alt: "حاسوبان: «الجهاز الأول» على اليسار و«الجهاز الثاني» على اليمين، وبينهما ثلاثة أسهم: «1 · SYN» من الأول إلى الثاني مع عبارة «الأول يطلب بدء الاتصال»؛ «2 · SYN-ACK» من الثاني إلى الأول مع عبارة «الثاني يوافق ويردّ»؛ «3 · ACK» من الأول إلى الثاني مع عبارة «الأول يؤكّد ← ثم يبدأ تبادل البيانات».",
            },
            {
              // ENRICHMENT — interactive-diagram / tcp-handshake / v1: the booklet drawing's three arrows, revealed one at
              // a time. Step labels and sentences are the drawing's own; the summary is «الخلاصة».
              id: "m14-l01-p02-stepper", type: "interactive-diagram", origin: "teacher-enrichment",
              interactionType: "tcp-handshake", version: 1,
              title: "تتبّع خطوات المصافحة الثلاثية",
              description: "اضغط «الخطوة التالية» لترى كل رسالة بين الجهاز الأول والجهاز الثاني مع جملتها من الرسم.",
              source: src(40, 41),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "المصافحة الثلاثية في TCP: 1) SYN — الجهاز الأول يطلب بدء الاتصال. 2) SYN-ACK — الجهاز الثاني يوافق ويردّ. 3) ACK — الجهاز الأول يؤكّد، ثم يبدأ تبادل البيانات. الطرفان يتأكدان أن الاتصال جاهز قبل إرسال البيانات الفعلية، لذلك TCP موثوق." },
              config: {
                first: "الجهاز الأول", second: "الجهاز الثاني",
                steps: [
                  { label: "SYN", from: "first", text: "الجهاز الأول يطلب بدء الاتصال." },
                  { label: "SYN-ACK", from: "second", text: "الجهاز الثاني يوافق ويردّ." },
                  { label: "ACK", from: "first", text: "الجهاز الأول يؤكّد، ثم يبدأ تبادل البيانات." },
                ],
                summary: "الطرفان يتأكدان أن الاتصال جاهز قبل إرسال البيانات الفعلية، لذلك TCP موثوق.",
                nextLabel: "الخطوة التالية", prevLabel: "الخطوة السابقة", startHint: "لم تبدأ المصافحة بعد.",
              },
            },
            { id: "m14-l01-p02-call-h", type: "heading", origin: "book", level: 4, text: "تشبيه: مكالمة هاتفية" },
            {
              id: "m14-l01-p02-call", type: "table", origin: "book",
              headers: ["SYN · 1", "«ألو، هل تسمعني؟»"],
              rows: [
                ["SYN-ACK · 2", "«نعم أسمعك، وأنت هل تسمعني؟»"],
                ["ACK · 3", "«نعم أسمعك» ← ثم نبدأ الكلام."],
              ],
            },
            {
              id: "m14-l01-p02-summary", type: "callout", origin: "book", kind: "summary", title: "الخلاصة",
              spans: [
                { text: "الطرفان يتأكدان أن الاتصال جاهز قبل إرسال البيانات الفعلية، لذلك TCP " },
                { text: "موثوق", style: "strong" },
                { text: ". الترتيب: " },
                { text: "ACK ← SYN-ACK ← SYN", style: "strong" },
              ],
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m14-l02",
      title: "تدريبات الوحدة",
      order: 2,
      pages: [
        {
          id: "791381s-m14-l02-p01",
          title: "تدريبات الوحدة: تجزئة البيانات والمصافحة الثلاثية",
          order: 1,
          layout: "practice",
          source: src(39, 41),
          blocks: [
            {
              id: "m14-l02-p01-q01", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "ordering", prompt: "رتّب أسماء البيانات كما تتكوّن عند الإرسال:",
                items: [{ id: "packet", text: "Packet" }, { id: "data", text: "البيانات" }, { id: "frame", text: "Frame" }, { id: "segment", text: "Segment" }],
                order: ["data", "segment", "packet", "frame"],
                feedback: { explanation: "الترتيب عند الإرسال: البيانات ‏←‏ Segment ‏←‏ Packet ‏←‏ Frame. كل طبقة تضيف غلافًا ويتغيّر اسم البيانات حسب الطبقة." },
              },
            },
            {
              id: "m14-l02-p01-q02", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "classify", prompt: "صنّف كل معلومة حسب الغلاف الذي يحتويها (من جدول «ماذا يحتوي؟»):",
                groups: [{ id: "seg", text: "Segment" }, { id: "pkt", text: "Packet" }, { id: "frm", text: "Frame" }],
                items: [
                  { id: "i1", text: "أرقام المنافذ" },
                  { id: "i2", text: "IP المصدر والهدف" },
                  { id: "i3", text: "MAC المصدر والهدف" },
                  { id: "i4", text: "التحكّم بالتدفّق" },
                  { id: "i5", text: "فحص الأخطاء" },
                  { id: "i6", text: "معلومات التوجيه" },
                ],
                assign: { i1: "seg", i2: "pkt", i3: "frm", i4: "seg", i5: "frm", i6: "pkt" },
                feedback: { explanation: "Segment: أرقام المنافذ والتحكّم بالتدفّق + البيانات. Packet: IP المصدر والهدف ومعلومات التوجيه. Frame: MAC المصدر والهدف وفحص الأخطاء." },
              },
            },
            {
              id: "m14-l02-p01-q03", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "matching", prompt: "صِل كل اسم بطبقته:",
                left: [{ id: "frame", text: "Frame" }, { id: "packet", text: "Packet" }, { id: "segment", text: "Segment" }],
                right: [{ id: "r1", text: "النقل Transport (4)" }, { id: "r2", text: "ربط البيانات Data Link (2)" }, { id: "r3", text: "الشبكة Network (3)" }],
                pairs: { frame: "r2", packet: "r3", segment: "r1" },
                feedback: { explanation: "احفظ: Frame = Data Link · Packet = Network · Segment = Transport." },
              },
            },
            {
              id: "m14-l02-p01-q04", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "wordBank", prompt: "أكمل التشبيه من مخزن الكلمات:",
                segments: ["تكتب رسالة (", { blank: "b1" }, ")، تضعها في ظرف عليه رقم الغرفة (", { blank: "b2" }, ")، ثم في ظرف أكبر عليه عنوان المدينة (", { blank: "b3" }, ")، ثم في صندوق عليه اسم الشارع والبيت (", { blank: "b4" }, ")."],
                bank: ["Frame", "البيانات", "ACK", "Packet", "Segment"],
                answers: { b1: "البيانات", b2: "Segment", b3: "Packet", b4: "Frame" },
                feedback: { explanation: "التشبيه في الكتيّب: الرسالة = البيانات، ظرف رقم الغرفة = Segment، ظرف عنوان المدينة = Packet، صندوق اسم الشارع والبيت = Frame. عند الاستلام نفتح الأغلفة بالعكس." },
              },
            },
            {
              id: "m14-l02-p01-q05", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "عند الاستلام نفتح الأغلفة بنفس ترتيب الإرسال.", answer: false, feedback: { explanation: "عند الاستلام نفتح الأغلفة بالعكس." } },
            },
            {
              id: "m14-l02-p01-q06", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ماذا يحتوي Frame في طبقة ربط البيانات (2)؟",
                options: [{ id: "a", text: "أرقام المنافذ والتحكّم بالتدفّق" }, { id: "b", text: "IP المصدر والهدف ومعلومات التوجيه" }, { id: "c", text: "MAC المصدر والهدف وفحص الأخطاء", correct: true }],
                feedback: { explanation: "Frame · ربط البيانات (2): MAC المصدر والهدف وفحص الأخطاء." },
              },
            },
            {
              id: "m14-l02-p01-q07", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "لماذا تُغلّف كل قطعة من البيانات بمعلومات قبل الإرسال؟",
                options: [{ id: "a", text: "لتساعدها على الوصول إلى المكان الصحيح.", correct: true }, { id: "b", text: "حتى لا يستطيع أحد استقبالها." }, { id: "c", text: "حتى تصبح قطعة واحدة كبيرة." }, { id: "d", text: "لتحذف أرقام المنافذ منها." }],
                feedback: { explanation: "البيانات الكبيرة تُقسَم إلى قطع صغيرة، وكل قطعة تُغلّف بمعلومات تساعدها على الوصول إلى المكان الصحيح." },
              },
            },
            {
              id: "m14-l02-p01-q08", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "ordering", prompt: "رتّب رسائل المصافحة الثلاثية في TCP:",
                items: [{ id: "ack", text: "ACK" }, { id: "syn", text: "SYN" }, { id: "synack", text: "SYN-ACK" }],
                order: ["syn", "synack", "ack"],
                feedback: { explanation: "1 · SYN: الأول يطلب بدء الاتصال. 2 · SYN-ACK: الثاني يوافق ويردّ. 3 · ACK: الأول يؤكّد، ثم يبدأ تبادل البيانات." },
              },
            },
            {
              id: "m14-l02-p01-q09", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "matching", prompt: "صِل كل رسالة بجملتها في تشبيه المكالمة الهاتفية:",
                left: [{ id: "syn", text: "SYN · 1" }, { id: "synack", text: "SYN-ACK · 2" }, { id: "ack", text: "ACK · 3" }],
                right: [{ id: "r1", text: "«نعم أسمعك» ← ثم نبدأ الكلام." }, { id: "r2", text: "«ألو، هل تسمعني؟»" }, { id: "r3", text: "«نعم أسمعك، وأنت هل تسمعني؟»" }],
                pairs: { syn: "r2", synack: "r3", ack: "r1" },
                feedback: { explanation: "SYN: «ألو، هل تسمعني؟». SYN-ACK: «نعم أسمعك، وأنت هل تسمعني؟». ACK: «نعم أسمعك» ← ثم نبدأ الكلام." },
              },
            },
            {
              id: "m14-l02-p01-q10", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ما الرسالة الثانية في المصافحة الثلاثية، ومن يرسلها؟",
                options: [{ id: "a", text: "SYN، يرسلها الجهاز الثاني" }, { id: "b", text: "ACK، يرسلها الجهاز الأول" }, { id: "c", text: "SYN، يرسلها الجهاز الأول" }, { id: "d", text: "SYN-ACK، يرسلها الجهاز الثاني (يوافق ويردّ)", correct: true }],
                feedback: { explanation: "الخطوة 2 · SYN-ACK: الجهاز الثاني يوافق ويردّ." },
              },
            },
            {
              id: "m14-l02-p01-q11", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "في المصافحة الثلاثية يبدأ تبادل البيانات قبل أن يتأكد الطرفان أن الاتصال جاهز.", answer: false, feedback: { explanation: "المصافحة عملية من 3 خطوات لإنشاء اتصال موثوق قبل تبادل أي بيانات: الطرفان يتأكدان أن الاتصال جاهز قبل إرسال البيانات الفعلية، لذلك TCP موثوق." } },
            },
            {
              id: "m14-l02-p01-q12", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ماذا يعني SYN، الرسالة الأولى في المصافحة الثلاثية؟",
                options: [{ id: "a", text: "الجهاز الثاني يوافق ويردّ." }, { id: "b", text: "الجهاز الأول يطلب بدء الاتصال.", correct: true }, { id: "c", text: "الجهاز الأول يؤكّد، ثم يبدأ تبادل البيانات." }],
                feedback: { explanation: "1 · SYN: الأول يطلب بدء الاتصال — مثل «ألو، هل تسمعني؟» في المكالمة الهاتفية." },
              },
            },
            { id: "m14-l02-p01-lib-t14", type: "library-training", origin: "teacher-enrichment", trainingId: "T14", label: "تدريب 14", requiredModuleId: "791381s-m14" },
          ],
        },
      ],
    },
  ],
};

export default m14;
