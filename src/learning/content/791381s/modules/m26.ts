// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 26 «الشبكة الواسعة WAN».
//
// Verbatim conversion of booklet PDF pages 80–81 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every block is origin:"book": nothing is added, removed or reworded.

import type { ContentModule, ContentSource } from "../../types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };

const m26: ContentModule = {
  id: "791381s-m26",
  title: "الشبكة الواسعة WAN",
  order: 26,
  lessons: [
    {
      id: "791381s-m26-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m26-l00-p01",
          title: "الشبكة الواسعة WAN",
          order: 1,
          layout: "opener",
          source: src(80),
          blocks: [
            {
              id: "m26-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الدفعة السادسة · كتاب ص 207–209", unitNumber: "26", title: "الشبكة الواسعة WAN",
              subtitle: "كيف نربط فروعًا بعيدة في مدن ودول مختلفة؟",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m26-l01",
      title: "الشبكة الواسعة WAN",
      order: 1,
      pages: [
        {
          id: "791381s-m26-l01-p01",
          title: "ما هي WAN؟",
          order: 1,
          source: src(80),
          blocks: [
            {
              id: "m26-l01-p01-def", type: "text", origin: "book",
              spans: [{ text: "WAN = شبكة واسعة تمتد عبر مسافات كبيرة: مدن، دول، أو قارات.", style: "strong" }],
            },
            {
              id: "m26-l01-p01-intro", type: "text", origin: "book",
              spans: [
                { text: "تخيّل مدرسة لها فرع في مدينة أخرى. في كل فرع شبكة LAN صغيرة، و" },
                { text: "WAN", style: "strong" },
                { text: " هي التي تربط الشبكتين معًا مهما كانت المسافة بينهما." },
              ],
            },
            {
              id: "m26-l01-p01-drawing", type: "diagram", origin: "book",
              src: "/learning-assets/791381s/6a4e672a6166f8aa.png",
              alt: "رسم: شبكتان داخل إطارين متقطعين، في كل منهما Router متصل بحاسوبين؛ تحت اليمنى «LAN · المقر الرئيسي» وتحت اليسرى «LAN · الفرع». الراوتران متصلان بسحابة مكتوب عليها «WAN» وتحتها «مدن · دول · قارات».",
              caption: "كل فرع فيه LAN، وWAN تربط الفروع البعيدة مع بعضها",
            },
            {
              id: "m26-l01-p01-points", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m26-l01-p01-pt1", text: [{ text: "تربط " }, { text: "فروع الشركات والمؤسسات", style: "strong" }, { text: "." }] },
                { id: "m26-l01-p01-pt2", text: [{ text: "تستخدم الألياف الضوئية والإنترنت والاتصالات السلكية واللاسلكية." }] },
                { id: "m26-l01-p01-pt3", text: [{ text: "أكبر مثال على WAN هو " }, { text: "الإنترنت", style: "strong" }, { text: "." }] },
              ],
            },
            {
              id: "m26-l01-p01-example", type: "callout", origin: "book", kind: "tip", title: "مثال",
              spans: [{ text: "ربط فرع المدرسة أو الشركة بالمقر الرئيسي — حتى يستعمل الفرع نفس البرامج والملفات الموجودة في المقر." }],
            },
            {
              id: "m26-l01-p01-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [
                { text: "LAN", style: "strong" },
                { text: " تربط أجهزة في مكان واحد، و" },
                { text: "WAN", style: "strong" },
                { text: " تربط شبكات بعيدة مع بعضها عبر مسافات شاسعة." },
              ],
            },
          ],
        },
        {
          id: "791381s-m26-l01-p02",
          title: "تقنيات WAN القديمة",
          order: 2,
          source: src(81),
          blocks: [
            {
              id: "m26-l01-p02-intro", type: "text", origin: "book",
              spans: [
                { text: "تقنيات استُخدمت قديمًا لنقل البيانات بين المواقع البعيدة. الهدف منها: نقل البيانات بين مواقع بعيدة " },
                { text: "بكفاءة", style: "strong" },
                { text: "." },
              ],
            },
            {
              id: "m26-l01-p02-table", type: "table", origin: "book",
              headers: ["التقنية", "ماذا تفعل؟"],
              rows: [
                ["Frame Relay", "تنقل البيانات على شكل Frames وتعتمد على Packet Switching (تقسيم البيانات إلى حزم صغيرة)."],
                ["ATM", "تنقل صوتًا وفيديو وبيانات معًا على نفس الخط."],
              ],
            },
            {
              id: "m26-l01-p02-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [{ text: "تقنيات WAN القديمة تساعدنا على فهم فكرة الربط بين الفروع." }],
            },
          ],
        },
        {
          id: "791381s-m26-l01-p03",
          title: "تقنيات WAN الأحدث",
          order: 3,
          source: src(81),
          blocks: [
            {
              id: "m26-l01-p03-cards", type: "list", origin: "book", variant: "cards",
              items: [
                {
                  id: "m26-l01-p03-c1", term: "HDLC",
                  text: [{ text: "بروتوكول لربط الأجهزة (الراوترات) عبر خطوط WAN. " }, { text: "ربط راوتر براوتر", style: "strong" }],
                },
                {
                  id: "m26-l01-p03-c2", term: "Metro Ethernet",
                  text: [
                    { text: "ربط مواقع متعددة " },
                    { text: "داخل مدينة واحدة", style: "strong" },
                    { text: ". سريع ومستقر وسهل التوسعة. " },
                    { text: "شائع اليوم", style: "strong" },
                  ],
                },
              ],
            },
            {
              id: "m26-l01-p03-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [{ text: "Metro Ethernet", style: "strong" }, { text: " شائع لربط فروع داخل منطقة حضرية واحدة (مدينة)." }],
            },
            {
              id: "m26-l01-p03-exam", type: "text", origin: "book",
              spans: [{ text: "للامتحان: التقنيات القديمة Frame Relay وATM، والأحدث HDLC وMetro Ethernet", style: "strong" }],
            },
          ],
        },
      ],
    },
  ],
};

export default m26;
