// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 4 «الفئات وقناع الشبكة و CIDR».
//
// Verbatim conversion of booklet PDF pages 14–19 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every block is origin:"book": nothing is added, removed or reworded; bold runs are `strong`, monospace
// runs are `code`, printed box labels are the callout titles. The IP/Mask drawing and the Default Gateway drawing are
// crops of the booklet itself. The «خلاصة الدفعة الأولى» table ends with its Gateway row at the top of PDF page 19.

import type { ContentModule, ContentSource } from "../../types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };

const m04: ContentModule = {
  id: "791381s-m04",
  title: "الفئات وقناع الشبكة و CIDR",
  order: 4,
  lessons: [
    {
      id: "791381s-m04-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m04-l00-p01",
          title: "الفئات وقناع الشبكة و CIDR",
          order: 1,
          layout: "opener",
          source: src(14),
          blocks: [
            {
              id: "m04-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الدفعة الأولى · الوحدة الرابعة · كتاب ص 34–46", unitNumber: "04", title: "الفئات وقناع الشبكة و CIDR",
              subtitle: "كيف نحدّد جزء الشبكة وجزء الجهاز في العنوان؟",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m04-l01",
      title: "الفئات وقناع الشبكة و CIDR",
      order: 1,
      pages: [
        {
          id: "791381s-m04-l01-p01",
          title: "فئات العناوين (Class)",
          order: 1,
          source: src(14, 15),
          blocks: [
            {
              id: "m04-l01-p01-def", type: "text", origin: "book",
              spans: [{ text: "نحدّد الفئة من الرقم الأول (الأيسر) في العنوان فقط.", style: "strong" }],
            },
            {
              id: "m04-l01-p01-intro", type: "text", origin: "book",
              spans: [{ text: "عناوين IPv4 مقسومة إلى مجموعات اسمها فئات. كل فئة مناسبة لحجم مختلف من الشبكات: كبيرة، متوسطة أو صغيرة." }],
            },
            {
              id: "m04-l01-p01-classes", type: "table", origin: "book",
              headers: ["الفئة", "الرقم الأول", "القناع الطبيعي", "CIDR", "عدد الأجهزة تقريبًا", "تُستعمل لـ"],
              rows: [
                ["A", "1 – 126", "255.0.0.0", "/8", "16 مليون", "شبكات كبيرة جدًا"],
                ["B", "128 – 191", "255.255.0.0", "/16", "65 ألف", "شبكات متوسطة"],
                ["C", "192 – 223", "255.255.255.0", "/24", "254", "شبكات صغيرة"],
              ],
              columnDirs: ["rtl", "ltr", "ltr", "ltr", "rtl", "rtl"],
            },
            { id: "m04-l01-p01-examples-label", type: "heading", origin: "book", level: 4, text: "أمثلة" },
            {
              id: "m04-l01-p01-examples", type: "table", origin: "book",
              headers: ["العنوان", "الرقم الأول", "الفئة", "القناع"],
              rows: [
                ["20.20.20.10", "20", "A", "255.0.0.0"],
                ["129.192.168.100", "129", "B", "255.255.0.0"],
                ["200.100.50.1", "200", "C", "255.255.255.0"],
              ],
              columnDirs: ["ltr", "rtl", "rtl", "ltr"],
            },
            {
              id: "m04-l01-p01-examples-note", type: "text", origin: "book",
              spans: [
                { text: "انتبه: " },
                { text: "129.192.168.100", style: "code" },
                { text: " فئة " },
                { text: "B", style: "strong" },
                { text: " مع أن فيه 192 و 168 — لأننا ننظر للرقم الأول فقط!" },
              ],
            },
          ],
        },
        {
          id: "791381s-m04-l01-p02",
          title: "قناع الشبكة (Subnet Mask)",
          order: 2,
          source: src(15),
          blocks: [
            {
              id: "m04-l01-p02-def", type: "text", origin: "book",
              spans: [{ text: "القناع يخبرنا: أي جزء من عنوان IP يخصّ الشبكة، وأي جزء يخصّ الجهاز.", style: "strong" }],
            },
            {
              id: "m04-l01-p02-phone", type: "text", origin: "book",
              spans: [{ text: "مثل رقم الهاتف: المقدمة تخبرنا عن المنطقة، وباقي الرقم يخبرنا عن البيت. كذلك في عنوان IP: جزء للشبكة وجزء للجهاز." }],
            },
            {
              id: "m04-l01-p02-cover", type: "text", origin: "book",
              spans: [
                { text: "القناع يغطّي جزء الشبكة ويترك جزء الجهاز ظاهرًا: " },
                { text: "255 = هذا القسم للشبكة", style: "strong" },
                { text: " و " },
                { text: "0 = هذا القسم للجهاز", style: "strong" },
                { text: "." },
              ],
            },
            {
              id: "m04-l01-p02-drawing", type: "diagram", origin: "book",
              src: "/learning-assets/791381s/cc8dffda3d7b9e5b.png",
              alt: "شبكة من خانات: صف «IP» فيه 192 و 168 و 1 و 100، وصف «Mask» فيه 255 و 255 و 255 و 0؛ الخانتان الأخيرتان (100 و 0) بإطار عريض. تحت الأقسام الثلاثة الأولى عبارة «الشبكة (أول 3 أقسام)» وتحت القسم الأخير كلمة «الجهاز».",
            },
          ],
        },
        {
          id: "791381s-m04-l01-p03",
          title: "جزء الشبكة وجزء الجهاز",
          order: 3,
          source: src(15, 16),
          blocks: [
            {
              id: "m04-l01-p03-intro", type: "text", origin: "book",
              spans: [{ text: "الأجهزة في نفس الشبكة لها نفس جزء الشبكة، وكل جهاز له جزء جهاز مختلف عن غيره." }],
            },
            {
              id: "m04-l01-p03-table", type: "table", origin: "book",
              headers: ["القناع", "جزء الشبكة", "جزء الجهاز"],
              rows: [
                ["/8", "القسم الأول فقط", "آخر 3 أقسام"],
                ["/16", "أول قسمين", "آخر قسمين"],
                ["/24", "أول 3 أقسام", "القسم الأخير"],
              ],
              columnDirs: ["ltr", "rtl", "rtl"],
            },
            { id: "m04-l01-p03-examples-label", type: "heading", origin: "book", level: 4, text: "أمثلة" },
            {
              id: "m04-l01-p03-examples", type: "table", origin: "book",
              headers: ["العنوان", "جزء الشبكة", "جزء الجهاز"],
              rows: [
                ["192.168.10.10/24", "192.168.10", "10"],
                ["10.138.10.1/8", "10", "138.10.1"],
                ["172.18.200.100/16", "172.18", "200.100"],
              ],
              columnDirs: ["ltr", "ltr", "ltr"],
            },
          ],
        },
        {
          id: "791381s-m04-l01-p04",
          title: "ما هو CIDR؟",
          order: 4,
          source: src(16),
          blocks: [
            {
              id: "m04-l01-p04-def", type: "text", origin: "book",
              spans: [{ text: "CIDR = طريقة مختصرة لكتابة قناع الشبكة: نكتب عدد بتات الشبكة بعد علامة / مثل 24/.", style: "strong" }],
            },
            {
              id: "m04-l01-p04-why", type: "text", origin: "book",
              spans: [
                { text: "لماذا 24؟ لأن كل 255 = 8 بتات ← 255.255.255.0 = 8 + 8 + 8 = " },
                { text: "24", style: "strong" },
                { text: "." },
              ],
            },
            {
              id: "m04-l01-p04-table", type: "table", origin: "book",
              headers: ["الصيغة", "قناع الشبكة", "عدد بتات الشبكة", "عدد الأجهزة تقريبًا"],
              rows: [
                ["/8", "255.0.0.0", "8", "16 مليون"],
                ["/16", "255.255.0.0", "16", "65 ألف"],
                ["/24", "255.255.255.0", "24", "254"],
              ],
              columnDirs: ["ltr", "ltr", "rtl", "rtl"],
            },
            {
              id: "m04-l01-p04-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [
                { text: "كلما " },
                { text: "زاد", style: "strong" },
                { text: " رقم CIDR، زاد الجزء الخاص بالشبكة، و" },
                { text: "قلّ", style: "strong" },
                { text: " الجزء المتاح للأجهزة." },
              ],
            },
          ],
        },
        {
          id: "791381s-m04-l01-p05",
          title: "أول عنوان وآخر عنوان في الشبكة",
          order: 5,
          source: src(17),
          blocks: [
            {
              id: "m04-l01-p05-intro", type: "text", origin: "book",
              spans: [{ text: "عنوان الشبكة هو «اسم» الشبكة نفسها، وعنوان البث يُستعمل لإرسال رسالة لكل الأجهزة، لذلك لا يأخذهما أي حاسوب." }],
            },
            {
              id: "m04-l01-p05-rule", type: "text", origin: "book",
              spans: [
                { text: "في كل شبكة: " },
                { text: "أول عنوان = عنوان الشبكة", style: "strong" },
                { text: "، و" },
                { text: "آخر عنوان = عنوان البث (Broadcast)", style: "strong" },
                { text: ". لا نعطيهما للحواسيب. العناوين بينهما هي للأجهزة." },
              ],
            },
            { id: "m04-l01-p05-ex-label", type: "heading", origin: "book", level: 4, text: "مثال" },
            {
              id: "m04-l01-p05-ex-task", type: "text", origin: "book",
              spans: [{ text: "الشبكة " }, { text: "192.168.1.0/24", style: "code" }, { text: ":" }],
            },
            {
              id: "m04-l01-p05-ex-table", type: "table", origin: "book",
              headers: ["عنوان الشبكة", "عناوين الأجهزة", "عنوان البث"],
              rows: [["192.168.1.0", "192.168.1.1 → 192.168.1.254", "192.168.1.255"]],
              columnDirs: ["ltr", "ltr", "ltr"],
            },
            { id: "m04-l01-p05-more-heading", type: "heading", origin: "book", level: 3, text: "أمثلة أخرى" },
            {
              id: "m04-l01-p05-more-table", type: "table", origin: "book",
              headers: ["عنوان الشبكة", "قناع الشبكة", "مجال عناوين الأجهزة"],
              rows: [
                ["10.10.10.0/24", "255.255.255.0", "10.10.10.1 → 10.10.10.254"],
                ["172.16.40.0/24", "255.255.255.0", "172.16.40.1 → 172.16.40.254"],
                ["192.168.0.0/16", "255.255.0.0", "192.168.0.1 → 192.168.255.254"],
                ["20.113.0.0/16", "255.255.0.0", "20.113.0.1 → 20.113.255.254"],
              ],
              columnDirs: ["ltr", "ltr", "ltr"],
            },
          ],
        },
        {
          id: "791381s-m04-l01-p06",
          title: "أجهزة في نفس الشبكة",
          order: 6,
          source: src(17, 18),
          blocks: [
            {
              id: "m04-l01-p06-def", type: "text", origin: "book",
              spans: [{ text: "حتى تتواصل الأجهزة في نفس الشبكة: جزء الشبكة يبقى ثابتًا، ونغيّر جزء الجهاز فقط.", style: "strong" }],
            },
            {
              id: "m04-l01-p06-table", type: "table", origin: "book",
              headers: ["الجهاز", "عنوان IP (القناع 24/)"],
              rows: [
                ["PC1", "192.168.1.1"],
                ["PC2", "192.168.1.2"],
                ["Printer", "192.168.1.10"],
                ["Phone", "192.168.1.20"],
              ],
              columnDirs: ["rtl", "ltr"],
            },
            { id: "m04-l01-p06-ex-label", type: "heading", origin: "book", level: 4, text: "مثال: أعطِ عنوانًا لـ PC2" },
            {
              id: "m04-l01-p06-ex-pc1", type: "text", origin: "book",
              spans: [{ text: "عنوان PC1 هو " }, { text: "172.18.10.10/16", style: "code" }],
            },
            {
              id: "m04-l01-p06-ex-keep", type: "text", origin: "book",
              spans: [
                { text: "القناع 16/ ← نُبقي " },
                { text: "172.18", style: "strong" },
                { text: " ونغيّر الباقي." },
              ],
            },
            {
              id: "m04-l01-p06-ex-pc2", type: "text", origin: "book",
              spans: [{ text: "عنوان مناسب لـ PC2 هو " }, { text: "172.18.50.7", style: "code" }, { text: " ✓" }],
            },
            {
              id: "m04-l01-p06-ex-dont", type: "text", origin: "book",
              spans: [{ text: "لا تستعمل نفس عنوان PC1!" }],
            },
          ],
        },
        {
          id: "791381s-m04-l01-p07",
          title: "البوابة الافتراضية (Default Gateway)",
          order: 7,
          source: src(18, 19),
          blocks: [
            {
              id: "m04-l01-p07-def", type: "text", origin: "book",
              spans: [{ text: "البوابة الافتراضية هي غالبًا عنوان الراوتر. وظيفتها: إخراج البيانات من الشبكة المحلية إلى الإنترنت أو إلى شبكة أخرى.", style: "strong" }],
            },
            {
              id: "m04-l01-p07-route", type: "text", origin: "book",
              spans: [{ text: "عندما يكون الهدف خارج الشبكة المحلية (مثل موقع في الإنترنت)، يرسل الحاسوب الرسالة إلى البوابة، والبوابة تكمل الطريق." }],
            },
            {
              id: "m04-l01-p07-drawing", type: "diagram", origin: "book",
              src: "/learning-assets/791381s/46cfaed59f993987.png",
              alt: "إطار متقطع عنوانه «الشبكة المحلية» فيه حاسوبان متصلان بـ Switch؛ سهم من الشبكة المحلية إلى Router، وسهم من Router إلى سحابة «الإنترنت». تحت Router عبارة «البوابة: 192.168.1.1»، وبجانبه عبارة «كل ما يخرج من الشبكة يمرّ عبر البوابة».",
            },
            {
              id: "m04-l01-p07-points", type: "list", origin: "book", variant: "plain",
              items: [
                {
                  id: "m04-l01-p07-pt1",
                  text: [
                    { text: "في البيت تكون البوابة غالبًا " },
                    { text: "192.168.1.1", style: "code" },
                    { text: " أو " },
                    { text: "192.168.0.1", style: "code" },
                    { text: "." },
                  ],
                },
                {
                  id: "m04-l01-p07-pt2",
                  text: [
                    { text: "بدون بوابة:", style: "strong" },
                    { text: " الشبكة المحلية قد تعمل، لكن الأجهزة " },
                    { text: "لن تصل إلى الإنترنت", style: "strong" },
                    { text: "." },
                  ],
                },
              ],
            },
            { id: "m04-l01-p07-summary-label", type: "heading", origin: "book", level: 4, text: "خلاصة الدفعة الأولى" },
            {
              id: "m04-l01-p07-summary", type: "table", origin: "book",
              headers: ["الشبكة", "أجهزة متصلة لتبادل المعلومات."],
              rows: [
                ["IP", "عنوان خاص لكل جهاز."],
                ["Subnet Mask", "يحدّد جزء الشبكة وجزء الجهاز."],
                ["CIDR", "طريقة مختصرة لكتابة القناع، مثل 24/."],
                ["Gateway", "الباب الذي يخرج منه الجهاز إلى الخارج (الراوتر)."],
              ],
            },
          ],
        },
      ],
    },
  ],
};

export default m04;
