// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 14 «تجزئة البيانات والمصافحة الثلاثية».
//
// Verbatim conversion of booklet PDF pages 39–41 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every block is origin:"book": nothing is added, removed or reworded. The encapsulation drawing and the
// handshake drawing are crops of the booklet itself.

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
              id: "m14-l01-p01-table", type: "table", origin: "book",
              headers: ["الاسم", "الطبقة", "ماذا يحتوي؟"],
              rows: [
                ["Segment", "النقل (4)", "أرقام المنافذ والتحكّم بالتدفّق + البيانات."],
                ["Packet", "الشبكة (3)", "IP المصدر والهدف ومعلومات التوجيه."],
                ["Frame", "ربط البيانات (2)", "MAC المصدر والهدف وفحص الأخطاء."],
              ],
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
  ],
};

export default m14;
