// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 9 «نموذج OSI ونموذج TCP/IP».
//
// Verbatim conversion of booklet PDF pages 28–30 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every block is origin:"book": nothing is added, removed or reworded.

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
  ],
};

export default m09;
