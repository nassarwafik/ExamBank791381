// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 13 «أمان الشبكات».
//
// Verbatim conversion of booklet PDF pages 37–39 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every block is origin:"book": nothing is added, removed or reworded.

import type { ContentModule, ContentSource } from "../../types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };

const m13: ContentModule = {
  id: "791381s-m13",
  title: "أمان الشبكات",
  order: 13,
  lessons: [
    {
      id: "791381s-m13-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m13-l00-p01",
          title: "أمان الشبكات",
          order: 1,
          layout: "opener",
          source: src(37),
          blocks: [
            {
              id: "m13-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الدفعة الثالثة · كتاب ص 107–115", unitNumber: "13", title: "أمان الشبكات",
              subtitle: "الهجمات الشائعة، وكيف نحمي البيانات أثناء انتقالها.",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m13-l01",
      title: "أمان الشبكات",
      order: 1,
      pages: [
        {
          id: "791381s-m13-l01-p01",
          title: "القرصنة والهجمات على الشبكة",
          order: 1,
          source: src(37, 38),
          blocks: [
            {
              id: "m13-l01-p01-def", type: "text", origin: "book",
              spans: [{ text: "الهجمات = محاولات غير قانونية للوصول إلى الشبكة أو تعطيلها. قد تستهدف المعلومات أو الخوادم أو المستخدمين.", style: "strong" }],
            },
            {
              id: "m13-l01-p01-intro", type: "text", origin: "book",
              spans: [{ text: "المهاجم قد يريد سرقة المعلومات، أو التجسّس عليها، أو تعطيل الخدمة حتى لا يستطيع الناس استعمالها." }],
            },
            {
              id: "m13-l01-p01-task", type: "text", origin: "book",
              spans: [
                { text: "المطلوب منك:", style: "strong" },
                { text: " اسم الهجوم + فكرته الأساسية فقط، بدون تفاصيل تقنية." },
              ],
            },
            {
              id: "m13-l01-p01-table", type: "table", origin: "book",
              headers: ["الهجوم", "فكرته الأساسية"],
              rows: [
                ["DoS حجب الخدمة", "إغراق الخادم بطلبات كثيرة من مصدر واحد حتى يتوقّف أو يبطؤ."],
                ["DDoS حجب الخدمة الموزّع", "نفس الفكرة، لكن الهجوم يأتي من أجهزة كثيرة في نفس الوقت — وهو أصعب في الإيقاف."],
                ["Session Hijacking اختطاف الجلسة", "المهاجم يسيطر على جلسة اتصال مفتوحة بين المستخدم والخادم."],
                ["MitM الرجل في الوسط", "المهاجم يقف بين الطرفين، يقرأ البيانات وقد يغيّرها."],
                ["Phishing التصيّد", "خداع المستخدم بموقع أو رسالة تشبه جهة حقيقية للحصول على معلوماته."],
                ["Spoofing التزييف", "تزييف عنوان IP أو بريد إلكتروني حتى يبدو وكأنه من جهة موثوقة."],
              ],
            },
            {
              id: "m13-l01-p01-phishing", type: "callout", origin: "book", kind: "tip", title: "مثال على Phishing",
              spans: [{ text: "تصلك رسالة «حسابك في البنك سيُغلق! اضغط هنا وأدخل كلمة المرور» — الرابط لموقع مزيّف يشبه موقع البنك." }],
            },
            { id: "m13-l01-p01-dos-h", type: "heading", origin: "book", level: 4, text: "الفرق بين DoS و DDoS" },
            {
              id: "m13-l01-p01-dos-1", type: "text", origin: "book",
              spans: [
                { text: "DoS: " },
                { text: "جهاز واحد", style: "strong" },
                { text: " يرسل طلبات كثيرة." },
              ],
            },
            {
              id: "m13-l01-p01-dos-2", type: "text", origin: "book",
              spans: [
                { text: "DDoS: " },
                { text: "آلاف الأجهزة", style: "strong" },
                { text: " ترسل معًا." },
              ],
            },
            {
              id: "m13-l01-p01-beware", type: "callout", origin: "book", kind: "summary", title: "احذر",
              spans: [{ text: "لا تثق بأي رابط أو رسالة قبل التأكد من المصدر. كثير من الهجمات تبدأ بخداع بسيط." }],
            },
          ],
        },
        {
          id: "791381s-m13-l01-p02",
          title: "الاتصالات الآمنة",
          order: 2,
          source: src(38, 39),
          blocks: [
            {
              id: "m13-l01-p02-def", type: "text", origin: "book",
              spans: [{ text: "هدفها حماية البيانات أثناء انتقالها: تستخدم التشفير حتى لا يقرأ الآخرون البيانات، وتتحقّق من هوية الطرف الآخر.", style: "strong" }],
            },
            {
              id: "m13-l01-p02-intro", type: "text", origin: "book",
              spans: [{ text: "الفكرة الأساسية هي التشفير: نحوّل البيانات إلى رموز لا يفهمها إلا المستقبِل الصحيح." }],
            },
            {
              id: "m13-l01-p02-cards", type: "list", origin: "book", variant: "cards",
              items: [
                {
                  id: "m13-l01-p02-c1", term: "VPN",
                  text: [{ text: "ينشئ اتصالًا آمنًا عبر الإنترنت. يشفّر البيانات أثناء انتقالها. يخفي عنوان IP الحقيقي جزئيًا. مفيد للعمل عن بُعد وشبكات Wi-Fi العامة." }],
                },
                {
                  id: "m13-l01-p02-c2", term: "SSL/TLS و HTTPS",
                  text: [{ text: "SSL/TLS يشفّر الاتصال بين المتصفح والخادم. HTTP = HTTPS + طبقة أمان. علامة القفل 🔒 في المتصفح تعني اتصالًا آمنًا. يمنع التجسّس والتلاعب بالبيانات." }],
                },
                {
                  id: "m13-l01-p02-c3", term: "SSH",
                  text: [{ text: "اتصال آمن لإدارة الأجهزة عن بُعد. يشفّر البيانات أثناء النقل. أكثر أمانًا من Telnet. يستخدم كلمة مرور أو مفاتيح تشفير." }],
                },
              ],
            },
            {
              id: "m13-l01-p02-prevention", type: "callout", origin: "book", kind: "summary", title: "الوقاية",
              spans: [
                { text: "التشفير (HTTPS و VPN) يجعل اعتراض البيانات أو اختطاف الجلسة " },
                { text: "أصعب بكثير", style: "strong" },
                { text: ". " },
                { text: "الأمان يعني:", style: "strong" },
                { text: " حماية البيانات + التأكد من هوية الطرف الآخر." },
              ],
            },
          ],
        },
      ],
    },
  ],
};

export default m13;
