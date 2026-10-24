// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 5 «أجهزة الشبكات».
//
// Verbatim conversion of booklet PDF pages 19–21 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every block is origin:"book": nothing is added, removed or reworded; bold runs are `strong`, monospace
// runs are `code`, printed box labels are the callout titles. The drawing above the Hub/Switch/Router cards is a crop of
// the booklet itself.

import type { ContentModule, ContentSource } from "../../types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };

const m05: ContentModule = {
  id: "791381s-m05",
  title: "أجهزة الشبكات",
  order: 5,
  lessons: [
    {
      id: "791381s-m05-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m05-l00-p01",
          title: "أجهزة الشبكات",
          order: 1,
          layout: "opener",
          source: src(19),
          blocks: [
            {
              id: "m05-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الدفعة الثانية · الوحدة الخامسة · كتاب ص 48–56", unitNumber: "05", title: "أجهزة الشبكات",
              subtitle: "ما وظيفة Hub و Switch و Router؟ وكيف نميّز بينها؟",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m05-l01",
      title: "أجهزة الشبكات",
      order: 1,
      pages: [
        {
          id: "791381s-m05-l01-p01",
          title: "جهاز Hub",
          order: 1,
          source: src(19),
          blocks: [
            {
              id: "m05-l01-p01-lead", type: "text", origin: "book",
              spans: [
                { text: "في كل شبكة توجد أجهزة تنقل البيانات بين الحواسيب. أهمها ثلاثة: Hub و Switch و Router. الفرق بينها هو " },
                { text: "طريقة إرسال البيانات", style: "strong" },
                { text: "." },
              ],
            },
            {
              id: "m05-l01-p01-drawing", type: "diagram", origin: "book",
              src: "/learning-assets/791381s/3257fa30d87dc6fd.png",
              alt: "ثلاث رسومات: «المرسِل» يرسل إلى Hub فيرسل Hub إلى ثلاثة حواسيب؛ «المرسِل» يرسل إلى Switch فيرسل Switch إلى حاسوب واحد فقط (والخطان الآخران متقطعان)؛ سحابة «الإنترنت» متصلة بـ Router، وRouter متصل بـ «شبكة 1» و«شبكة 2».",
            },
            {
              id: "m05-l01-p01-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m05-l01-p01-c1", term: "Hub · المجمّع", text: [{ text: "يرسل البيانات " }, { text: "إلى جميع", style: "strong" }, { text: " الأجهزة." }] },
                { id: "m05-l01-p01-c2", term: "Switch · المبدّل (السويتش)", text: [{ text: "يرسل البيانات " }, { text: "للجهاز المقصود فقط", style: "strong" }, { text: "." }] },
                { id: "m05-l01-p01-c3", term: "Router · الموجّه (الراوتر)", text: [{ text: "يربط " }, { text: "بين شبكات مختلفة", style: "strong" }, { text: " وبالإنترنت." }] },
              ],
            },
            {
              id: "m05-l01-p01-intro", type: "text", origin: "book",
              spans: [{ text: "الـ Hub جهاز قديم وبسيط: لا يفكّر ولا يحفظ أي عنوان، بل ينسخ كل ما يصله ويرسله لكل المنافذ." }],
            },
            {
              id: "m05-l01-p01-what", type: "text", origin: "book",
              spans: [{ text: "جهاز بسيط يربط عدة أجهزة في شبكة محلية." }],
            },
            {
              id: "m05-l01-p01-points", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m05-l01-p01-pt1", text: [{ text: "عندما تصله بيانات، يرسلها " }, { text: "للجميع", style: "strong" }, { text: "، لأنه لا يعرف من هو الجهاز المقصود." }] },
                { id: "m05-l01-p01-pt2", text: [{ text: "الجهاز الصحيح فقط يستعمل البيانات، والباقي يتجاهلها." }] },
                { id: "m05-l01-p01-pt3", text: [{ text: "يسبّب " }, { text: "ازدحامًا وتداخلًا", style: "strong" }, { text: " في الشبكة." }] },
              ],
            },
            {
              id: "m05-l01-p01-analogy", type: "callout", origin: "book", kind: "summary", title: "تشبيه",
              spans: [{ text: "الـ Hub مثل طالب يصرخ بالمعلومة في الصف ليسمعها الجميع، مع أنها لطالب واحد فقط." }],
            },
          ],
        },
        {
          id: "791381s-m05-l01-p02",
          title: "جهاز Switch",
          order: 2,
          source: src(20),
          blocks: [
            {
              id: "m05-l01-p02-intro", type: "text", origin: "book",
              spans: [{ text: "السويتش جهاز ذكي: يتعلّم أين يوجد كل جهاز (حسب عنوان MAC)، ثم يرسل كل رسالة إلى صاحبها فقط." }],
            },
            {
              id: "m05-l01-p02-what", type: "text", origin: "book",
              spans: [{ text: "يربط أجهزة الشبكة المحلية LAN بكفاءة عالية." }],
            },
            {
              id: "m05-l01-p02-points", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m05-l01-p02-pt1", text: [{ text: "يرسل البيانات " }, { text: "إلى الجهاز المقصود فقط", style: "strong" }, { text: "." }] },
                { id: "m05-l01-p02-pt2", text: [{ text: "يحفظ " }, { text: "عناوين MAC", style: "strong" }, { text: " للأجهزة ليعرف أين كل جهاز." }] },
                { id: "m05-l01-p02-pt3", text: [{ text: "يقلّل الازدحام داخل الشبكة." }] },
                { id: "m05-l01-p02-pt4", text: [{ text: "يزيد سرعة الاتصال وأمانه." }] },
                { id: "m05-l01-p02-pt5", text: [{ text: "دقة:", style: "strong" }, { text: " يوجّه البيانات للجهاز الصحيح." }] },
                { id: "m05-l01-p02-pt6", text: [{ text: "أداء:", style: "strong" }, { text: " يقلّل التداخل والازدحام." }] },
                { id: "m05-l01-p02-pt7", text: [{ text: "توسيع:", style: "strong" }, { text: " نضيف أجهزة أكثر بسهولة." }] },
                { id: "m05-l01-p02-pt8", text: [{ text: "إدارة وأمان:", style: "strong" }, { text: " بعض الأنواع تسمح بإعدادات متقدمة وتنظيم الشبكة." }] },
              ],
            },
            {
              id: "m05-l01-p02-idea", type: "text", origin: "book",
              spans: [
                { text: "فكرة مهمة:", style: "strong" },
                { text: " كل منفذ في السويتش هو طريق خاص لجهاز معيّن، فلا تتزاحم البيانات. مناسب لغرفة حواسيب، مكتب، مدرسة أو شركة." },
              ],
            },
            { id: "m05-l01-p02-why", type: "heading", origin: "book", level: 3, text: "لماذا استُبدل Hub بـ Switch؟" },
            {
              id: "m05-l01-p02-table", type: "table", origin: "book",
              headers: ["وجه المقارنة", "Hub", "Switch"],
              rows: [
                ["طريقة الإرسال", "يرسل البيانات للجميع", "يرسلها للجهاز المقصود"],
                ["الازدحام", "ازدحام أكثر", "ازدحام أقل"],
                ["الذكاء", "أقل ذكاءً", "أكثر ذكاءً"],
                ["الأداء", "أداء أضعف", "أداء أفضل"],
              ],
            },
            {
              id: "m05-l01-p02-summary", type: "text", origin: "book",
              spans: [
                { text: "الخلاصة: " },
                { text: "Switch هو البديل الأفضل والأكثر استخدامًا", style: "strong" },
                { text: " في الشبكات الحديثة بدل Hub." },
              ],
            },
          ],
        },
        {
          id: "791381s-m05-l01-p03",
          title: "جهاز Router",
          order: 3,
          source: src(21),
          blocks: [
            {
              id: "m05-l01-p03-intro", type: "text", origin: "book",
              spans: [{ text: "الراوتر يقف بين الشبكات، مثل الباب بين البيت والشارع: كل ما يخرج من الشبكة أو يدخل إليها يمرّ من خلاله." }],
            },
            {
              id: "m05-l01-p03-what", type: "text", origin: "book",
              spans: [
                { text: "يربط " },
                { text: "بين شبكات مختلفة", style: "strong" },
                { text: "، مثلًا يربط شبكة البيت أو المدرسة بالإنترنت." },
              ],
            },
            {
              id: "m05-l01-p03-table", type: "table", origin: "book",
              headers: ["الخاصية", "معناها"],
              rows: [
                ["توجيه", "يختار الطريق (المسار) الأفضل لوصول البيانات."],
                ["ربط", "يربط بين شبكات مختلفة."],
                ["NAT", "يسمح لكل أجهزة البيت بمشاركة عنوان عام واحد."],
                ["DHCP", "يوزّع عناوين IP على الأجهزة تلقائيًا."],
                ["أمان", "يساعد في التحكم بمرور البيانات."],
              ],
            },
            {
              id: "m05-l01-p03-example", type: "callout", origin: "book", kind: "tip", title: "مثال",
              spans: [
                { text: "راوتر البيت هو " },
                { text: "باب الشبكة إلى الإنترنت", style: "strong" },
                { text: ": كل البيانات الخارجة من البيت تمرّ منه." },
              ],
            },
            {
              id: "m05-l01-p03-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [
                { text: "الراوتر يعمل غالبًا في " },
                { text: "طبقة الشبكة", style: "strong" },
                { text: "، ويتعامل مع عناوين " },
                { text: "IP", style: "strong" },
                { text: " (وليس MAC)." },
              ],
            },
            {
              id: "m05-l01-p03-memo", type: "text", origin: "book",
              spans: [{ text: "احفظ الفرق بكلمة واحدة: Hub ← للجميع · Switch ← للمقصود · Router ← للخارج", style: "strong" }],
            },
          ],
        },
      ],
    },
  ],
};

export default m05;
