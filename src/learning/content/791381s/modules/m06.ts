// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 6 «أنواع شبكات الاتصال (أشكال التوصيل)».
//
// Verbatim conversion of booklet PDF pages 21–23 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every block is origin:"book": nothing is added, removed or reworded; bold runs are `strong`, printed box
// labels are the callout titles. The drawings above the topology cards are crops of the booklet itself.

import type { ContentModule, ContentSource } from "../../types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };

const m06: ContentModule = {
  id: "791381s-m06",
  title: "أنواع شبكات الاتصال (أشكال التوصيل)",
  order: 6,
  lessons: [
    {
      id: "791381s-m06-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m06-l00-p01",
          title: "أنواع شبكات الاتصال (أشكال التوصيل)",
          order: 1,
          layout: "opener",
          source: src(21),
          blocks: [
            {
              id: "m06-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الدفعة الثانية · الوحدة السادسة · كتاب ص 57–60", unitNumber: "06", title: "أنواع شبكات الاتصال (أشكال التوصيل)",
              subtitle: "الأشكال التي يمكن أن نرتّب بها الأجهزة داخل الشبكة.",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m06-l01",
      title: "أنواع شبكات الاتصال (أشكال التوصيل)",
      order: 1,
      pages: [
        {
          id: "791381s-m06-l01-p01",
          title: "الشبكات البسيطة",
          order: 1,
          source: src(21, 22),
          blocks: [
            {
              id: "m06-l01-p01-def", type: "text", origin: "book",
              spans: [{ text: "شكل التوصيل يحدّد طريقة انتقال البيانات بين الأجهزة داخل الشبكة.", style: "strong" }],
            },
            {
              id: "m06-l01-p01-intro", type: "text", origin: "book",
              spans: [{ text: "في هذه الأنواع تتصل الأجهزة ببعضها مباشرة، بدون جهاز مركزي في الوسط." }],
            },
            {
              id: "m06-l01-p01-drawing-p2p", type: "diagram", origin: "book",
              src: "/learning-assets/791381s/506674017300a3f1.png",
              alt: "حاسوبان بينهما سهم باتجاهين مكتوب فوقه «كابل مباشر» وتحته «لا يوجد جهاز وسيط».",
            },
            {
              id: "m06-l01-p01-drawing-mesh", type: "diagram", origin: "book",
              src: "/learning-assets/791381s/29f28090e9fd4a60.png",
              alt: "أربعة حواسيب، كل حاسوب متصل بخط بكل حاسوب آخر.",
            },
            {
              id: "m06-l01-p01-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m06-l01-p01-c1", term: "P2P · نقطة لنقطة", text: [{ text: "جهازان يتواصلان مباشرة بدون جهاز وسيط." }] },
                { id: "m06-l01-p01-c2", term: "Mesh · عقدة لعقدة", text: [{ text: "كل جهاز يتصل بكل جهاز آخر في الشبكة." }] },
              ],
            },
          ],
        },
        {
          id: "791381s-m06-l01-p02",
          title: "الشبكات السلكية التقليدية",
          order: 2,
          source: src(22),
          blocks: [
            {
              id: "m06-l01-p02-intro", type: "text", origin: "book",
              spans: [{ text: "هذه أشكال قديمة لم تعد تُستعمل كثيرًا اليوم، لكن يجب أن نعرفها ونعرف مشاكلها." }],
            },
            {
              id: "m06-l01-p02-drawing-bus", type: "diagram", origin: "book",
              src: "/learning-assets/791381s/d2896f1690043a67.png",
              alt: "أربعة حواسيب متصلة بخط واحد مشترك.",
            },
            {
              id: "m06-l01-p02-drawing-ring", type: "diagram", origin: "book",
              src: "/learning-assets/791381s/bfcba242a31d4986.png",
              alt: "أربعة حواسيب على شكل دائرة مغلقة، تربطها أسهم باتجاه واحد.",
            },
            {
              id: "m06-l01-p02-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m06-l01-p02-c1", term: "Bus · الخط المشترك", text: [{ text: "خط واحد مشترك بين كل الأجهزة. رخيص وسهل، لكن " }, { text: "التصادمات كثيرة", style: "strong" }, { text: "." }] },
                { id: "m06-l01-p02-c2", term: "Ring · الحلقة", text: [{ text: "الأجهزة على شكل دائرة مغلقة، والبيانات تسير باتجاه واحد." }] },
              ],
            },
            {
              id: "m06-l01-p02-bus-problem", type: "callout", origin: "book", kind: "summary", title: "مشكلة Bus",
              spans: [
                { text: "إذا أرسل أكثر من جهاز في نفس الوقت قد يحدث " },
                { text: "تصادم (Collision)", style: "strong" },
                { text: " للبيانات." },
              ],
            },
          ],
        },
        {
          id: "791381s-m06-l01-p03",
          title: "الشبكات الحديثة",
          order: 3,
          source: src(22, 23),
          blocks: [
            {
              id: "m06-l01-p03-intro", type: "text", origin: "book",
              spans: [{ text: "هذه الأشكال تستعمل جهازًا مركزيًا مثل السويتش. إذا تعطّل حاسوب واحد، تبقى باقي الأجهزة تعمل بشكل عادي." }],
            },
            {
              id: "m06-l01-p03-drawing", type: "diagram", origin: "book",
              src: "/learning-assets/791381s/ceb1b31fe9b1c0b3.png",
              alt: "ثلاث رسومات: أربعة حواسيب متصلة بجهاز في الوسط مكتوب عليه «Switch»؛ جهاز في الأعلى يتفرّع إلى جهازين، وكل منهما يتفرّع إلى حاسوبين؛ خط مشترك عليه جهازان، وكل جهاز متصل بحاسوبين.",
            },
            {
              id: "m06-l01-p03-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m06-l01-p03-c1", term: "Star · النجمة", text: [{ text: "كل الأجهزة تتصل بجهاز مركزي مثل Switch." }] },
                { id: "m06-l01-p03-c2", term: "Tree · الشجرة", text: [{ text: "شبكة على شكل مستويات (طبقات) فوق بعضها." }] },
                { id: "m06-l01-p03-c3", term: "Hybrid · المختلطة", text: [{ text: "دمج أكثر من نوع في شبكة واحدة (مثل Bus + Star)." }] },
              ],
            },
            {
              id: "m06-l01-p03-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [
                { text: "شكل " },
                { text: "النجمة Star", style: "strong" },
                { text: " هو الأكثر استعمالًا في المدارس والشركات." },
              ],
            },
          ],
        },
      ],
    },
  ],
};

export default m06;
