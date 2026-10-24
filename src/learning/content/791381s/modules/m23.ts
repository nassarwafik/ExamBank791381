// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 23 «حماية المنافذ Port Security».
//
// Verbatim conversion of booklet PDF pages 70–72 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every block is origin:"book": nothing is added, removed or reworded.

import type { ContentModule, ContentSource } from "../../types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };

const m23: ContentModule = {
  id: "791381s-m23",
  title: "حماية المنافذ Port Security",
  order: 23,
  lessons: [
    {
      id: "791381s-m23-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m23-l00-p01",
          title: "حماية المنافذ Port Security",
          order: 1,
          layout: "opener",
          source: src(70),
          blocks: [
            {
              id: "m23-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الدفعة الخامسة · كتاب ص 180–184", unitNumber: "23", title: "حماية المنافذ Port Security",
              subtitle: "كيف نمنع جهازًا غريبًا من الاتصال بمنفذ في السويتش؟",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m23-l01",
      title: "حماية المنافذ Port Security",
      order: 1,
      pages: [
        {
          id: "791381s-m23-l01-p01",
          title: "ما هو Port Security؟",
          order: 1,
          source: src(70),
          blocks: [
            {
              id: "m23-l01-p01-def", type: "text", origin: "book",
              spans: [{ text: "Port Security خاصية في السويتش للتحكّم بمن يُسمح له بالاتصال بالمنفذ.", style: "strong" }],
            },
            {
              id: "m23-l01-p01-intro", type: "text", origin: "book",
              spans: [{ text: "تخيّل أن طالبًا أحضر حاسوبه من البيت ووصله بمنفذ في غرفة الحاسوب. مع Port Security يعرف السويتش أن هذا الجهاز غريب (من عنوان MAC الخاص به) فيمنعه." }],
            },
            {
              id: "m23-l01-p01-points", type: "list", origin: "book", variant: "plain",
              items: [
                {
                  id: "m23-l01-p01-pt1",
                  text: [{ text: "يعتمد غالبًا على " }, { text: "MAC Address", style: "strong" }, { text: "." }],
                },
                { id: "m23-l01-p01-pt2", text: [{ text: "إذا دخل جهاز غير مسموح به، يتم منعه." }] },
                { id: "m23-l01-p01-pt3", text: [{ text: "يُستخدم لحماية المنافذ من أجهزة مجهولة." }] },
              ],
            },
            {
              id: "m23-l01-p01-drawing", type: "diagram", origin: "book",
              src: "/learning-assets/791381s/64cc1cdfec70c0a6.png",
              alt: "رسمة: «Switch» فوقه عبارة «المنفذ يحفظ عنوان MAC المسموح»، وتحته ثلاثة حواسيب: «PC0 ✓» و«PC1 ✓» متصلان به، و«جهاز غريب ✗» على خطه علامة منع ⊗.",
            },
            {
              id: "m23-l01-p01-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [{ text: "Port Security = حماية المنفذ حسب الجهاز المتصل به. المنفذ لا يقبل أي جهاز عشوائي، بل المسموح به فقط." }],
            },
          ],
        },
        {
          id: "791381s-m23-l01-p02",
          title: "الطريقة الأولى: MAC ثابت",
          order: 2,
          source: src(71),
          blocks: [
            {
              id: "m23-l01-p02-intro", type: "text", origin: "book",
              spans: [{ text: "نكتب بأنفسنا عنوان MAC للجهاز المسموح. أي جهاز آخر يُمنع." }],
            },
            { id: "m23-l01-p02-cli-h", type: "heading", origin: "book", level: 4, text: "Switch CLI", dir: "ltr" },
            {
              id: "m23-l01-p02-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: [
                "① Switch(config)# interface f0/1",
                "② Switch(config-if)# switchport mode access",
                "③ Switch(config-if)# switchport port-security",
                "④ Switch(config-if)# switchport port-security mac-address 00A0.1234.5678",
                "⑤ Switch(config-if)# switchport port-security violation shutdown",
              ].join("\n"),
            },
            {
              id: "m23-l01-p02-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m23-l01-p02-s1", text: [{ text: "نختار المنفذ." }] },
                { id: "m23-l01-p02-s2", text: [{ text: "نجعله Access — Port Security يعمل على منافذ Access." }] },
                {
                  id: "m23-l01-p02-s3",
                  text: [{ text: "port-security", style: "strong" }, { text: ": نشغّل الحماية على المنفذ (بدون هذا السطر لا تعمل الحماية)." }],
                },
                {
                  id: "m23-l01-p02-s4",
                  text: [{ text: "mac-address", style: "strong" }, { text: ": نسمح فقط لعنوان MAC المكتوب." }],
                },
                {
                  id: "m23-l01-p02-s5",
                  text: [{ text: "violation shutdown", style: "strong" }, { text: ": إذا اتصل جهاز آخر، يُغلق المنفذ." }],
                },
              ],
            },
            {
              id: "m23-l01-p02-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [
                { text: "violation shutdown", style: "strong" },
                { text: " يعني إغلاق المنفذ تمامًا عند دخول جهاز غير مسموح. وكلمة violation معناها: مخالفة." },
              ],
            },
          ],
        },
        {
          id: "791381s-m23-l01-p03",
          title: "الطريقة الثانية: Sticky MAC",
          order: 3,
          source: src(71, 72),
          blocks: [
            {
              id: "m23-l01-p03-intro", type: "text", origin: "book",
              spans: [{ text: "أحيانًا لا نعرف عنوان MAC للجهاز مسبقًا. مع Sticky يتعلّم السويتش وحده عنوان أول جهاز يتصل بالمنفذ، ويحفظه، ثم يسمح له فقط. ومعنى كلمة Sticky: لاصق." }],
            },
            { id: "m23-l01-p03-cli-h", type: "heading", origin: "book", level: 4, text: "Switch CLI", dir: "ltr" },
            {
              id: "m23-l01-p03-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: [
                "① Switch(config-if)# switchport port-security",
                "② Switch(config-if)# switchport port-security mac-address sticky",
              ].join("\n"),
            },
            {
              id: "m23-l01-p03-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m23-l01-p03-s1", text: [{ text: "نشغّل الحماية على المنفذ." }] },
                {
                  id: "m23-l01-p03-s2",
                  text: [{ text: "sticky", style: "strong" }, { text: ": السويتش يتعلّم عنوان MAC تلقائيًا ويحفظه." }],
                },
              ],
            },
          ],
        },
        {
          id: "791381s-m23-l01-p04",
          title: "تحديد عدد الأجهزة",
          order: 4,
          source: src(72),
          blocks: [
            {
              id: "m23-l01-p04-intro", type: "text", origin: "book",
              spans: [{ text: "نستطيع أن نحدّد كم جهازًا مسموح له أن يستعمل نفس المنفذ." }],
            },
            { id: "m23-l01-p04-cli-h", type: "heading", origin: "book", level: 4, text: "Switch CLI", dir: "ltr" },
            {
              id: "m23-l01-p04-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: [
                "① Switch(config-if)# switchport port-security maximum 3",
                "② Switch(config-if)# switchport port-security violation shutdown",
              ].join("\n"),
            },
            {
              id: "m23-l01-p04-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                {
                  id: "m23-l01-p04-s1",
                  text: [{ text: "maximum 3", style: "strong" }, { text: ": نسمح بثلاثة أجهزة فقط على هذا المنفذ." }],
                },
                { id: "m23-l01-p04-s2", text: [{ text: "إذا زاد العدد تحدث مخالفة، فيُغلق المنفذ." }] },
              ],
            },
            { id: "m23-l01-p04-h-summary", type: "heading", origin: "book", level: 4, text: "ملخّص Port Security" },
            {
              id: "m23-l01-p04-summary", type: "table", origin: "book",
              headers: ["port-security", "تشغيل الحماية"],
              rows: [
                ["mac-address 00A0.1234.5678", "السماح لجهاز محدّد"],
                ["mac-address sticky", "تعلّم الجهاز تلقائيًا"],
                ["maximum 3", "عدد الأجهزة المسموح"],
                ["violation shutdown", "العقوبة: إغلاق المنفذ"],
              ],
              columnDirs: ["ltr", "rtl"],
            },
          ],
        },
      ],
    },
  ],
};

export default m23;
