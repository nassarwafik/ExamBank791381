// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 28 «بروتوكول OSPF».
//
// Verbatim conversion of booklet PDF pages 84–86 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every converted block is origin:"book": nothing is added, removed or reworded.
//
// Enrichment (docs/enterprise-791381s-enrichment-plan.md, Phase 6): teacher-enrichment blocks (visuals and CLI terminal
// simulations reused from course 791381 after checking their labels / commands against this section, and the end-of-unit
// «تدريبات الوحدة» lesson) are ADDED after the book blocks they explain. The book blocks stay verbatim — pinned by the book
// lock (bookLock.test.ts).

import type { ContentModule, ContentSource } from "../../types";
import type { CliExerciseConfig } from "../../../cli/types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };
const EX = (exercise: CliExerciseConfig): Record<string, unknown> => ({ ...exercise });

const m28: ContentModule = {
  id: "791381s-m28",
  title: "بروتوكول OSPF",
  order: 28,
  lessons: [
    {
      id: "791381s-m28-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m28-l00-p01",
          title: "بروتوكول OSPF",
          order: 1,
          layout: "opener",
          source: src(84),
          blocks: [
            {
              id: "m28-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الدفعة السادسة · كتاب ص 214–217", unitNumber: "28", title: "بروتوكول OSPF",
              subtitle: "بروتوكول مفتوح يبني خريطة كاملة للشبكة — مع مثال كامل بالأوامر.",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m28-l01",
      title: "بروتوكول OSPF",
      order: 1,
      pages: [
        {
          id: "791381s-m28-l01-p01",
          title: "ما هو OSPF؟",
          order: 1,
          source: src(84, 85),
          blocks: [
            {
              id: "m28-l01-p01-def", type: "text", origin: "book",
              spans: [{ text: "OSPF = Open Shortest Path First — «افتح أقصر طريق أولًا».", style: "strong" }],
            },
            {
              id: "m28-l01-p01-points", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m28-l01-p01-pt1", text: [{ text: "بروتوكول من نوع " }, { text: "Link-State", style: "strong" }, { text: "." }] },
                { id: "m28-l01-p01-pt2", text: [{ text: "يناسب " }, { text: "الشبكات الكبيرة والمعقّدة", style: "strong" }, { text: "." }] },
                { id: "m28-l01-p01-pt3", text: [{ text: "كل راوتر يبني " }, { text: "خريطة كاملة", style: "strong" }, { text: " للشبكة." }] },
                {
                  id: "m28-l01-p01-pt4",
                  text: [
                    { text: "يختار المسار الأفضل حسب " },
                    { text: "Bandwidth", style: "strong" },
                    { text: "، ويرسل تحديثات " },
                    { text: "عند التغيير فقط", style: "strong" },
                    { text: "." },
                  ],
                },
              ],
            },
            {
              id: "m28-l01-p01-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [
                { text: "OSPF " },
                { text: "معيار مفتوح", style: "strong" },
                { text: " (Open Standard) غير مملوك لشركة واحدة، لذلك يعمل مع أجهزة من شركات مختلفة." },
              ],
            },
          ],
        },
        {
          id: "791381s-m28-l01-p02",
          title: "مثال: شبكتان متصلتان عبر راوترين",
          order: 2,
          source: src(85),
          blocks: [
            {
              id: "m28-l01-p02-drawing", type: "diagram", origin: "book",
              src: "/learning-assets/791381s/5dc235a6caf9ba23.png",
              alt: "رسم: راوتر R1 وراوتر R2 متصلان بخط عليه «10.0.0.0/30»؛ تحت R1 شبكة داخل إطار متقطع مكتوب عليها «192.168.1.0/24» فيها حاسوبان، وتحت R2 شبكة مكتوب عليها «192.168.2.0/24» فيها حاسوبان.",
              caption: "R1 وR2 متصلان بالشبكة 10.0.0.0/30، ولكل راوتر شبكة LAN خاصة به",
            },
            {
              id: "m28-l01-p02-v-topology", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m27/ospf-topology", motion: false,
              source: src(85),
              title: "مخطط: R1 و R2 والشبكات المتصلة بهما",
              alt: "مخطط عنوانه «مثال OSPF — area 0»: راوتر R1 وراوتر R2 متصلان بخط عليه 10.0.0.0/30؛ تحت R1 منطقة LAN عليها 192.168.1.0/24، وتحت R2 منطقة LAN عليها 192.168.2.0/24؛ وفي الأسفل «/24 = 0.0.0.255 · /30 = 0.0.0.3».",
              caption: "R1 متصل بالشبكتين 192.168.1.0/24 و 10.0.0.0/30، و R2 متصل بالشبكتين 192.168.2.0/24 و 10.0.0.0/30.",
            },
            {
              id: "m28-l01-p02-task", type: "text", origin: "book",
              spans: [
                { text: "المطلوب:", style: "strong" },
                { text: " تعريف OSPF حتى يعرف كل راوتر الشبكة البعيدة. كل راوتر يعلن عن الشبكات " },
                { text: "المتصلة به مباشرة", style: "strong" },
                { text: ":" },
              ],
            },
            {
              id: "m28-l01-p02-table", type: "table", origin: "book",
              headers: ["الراوتر", "الشبكات المتصلة به"],
              rows: [
                ["R1", "192.168.1.0/24 و 10.0.0.0/30"],
                ["R2", "192.168.2.0/24 و 10.0.0.0/30"],
              ],
            },
          ],
        },
        {
          id: "791381s-m28-l01-p03",
          title: "أوامر R1",
          order: 3,
          source: src(85, 86),
          blocks: [
            { id: "m28-l01-p03-cli-h", type: "heading", origin: "book", level: 4, text: "R1 · Router CLI", dir: "ltr" },
            {
              id: "m28-l01-p03-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: [
                "① R1(config)# router ospf 1",
                "② R1(config-router)# network 192.168.1.0 0.0.0.255 area 0",
                "③ R1(config-router)# network 10.0.0.0 0.0.0.3 area 0",
              ].join("\n"),
            },
            {
              id: "m28-l01-p03-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m28-l01-p03-s1", text: [{ text: "router ospf 1", style: "strong" }, { text: ": تفعيل OSPF برقم العملية 1." }] },
                {
                  id: "m28-l01-p03-s2",
                  text: [
                    { text: "إعلان الشبكة الأولى. " },
                    { text: "0.0.0.255", style: "strong" },
                    { text: " هو Wildcard للشبكة 24/، و" },
                    { text: "area 0", style: "strong" },
                    { text: " هي المنطقة الرئيسية." },
                  ],
                },
                {
                  id: "m28-l01-p03-s3",
                  text: [
                    { text: "إعلان الشبكة المشتركة بين الراوترين. " },
                    { text: "0.0.0.3", style: "strong" },
                    { text: " هو Wildcard للشبكة 30/." },
                  ],
                },
              ],
            },
            {
              id: "m28-l01-p03-sim-r1", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مثال موجّه: OSPF على R1",
              description: "أنت في وضع الإعداد العام للراوتر R1. نفّذ سطور صندوق الكتاب بالترتيب؛ لاحظ تغيّر الموجّه إلى R1(config-router)# بعد السطر الأول. محاكاة تعليمية مبسّطة، ليست جهازًا حقيقيًا.",
              source: src(85, 86),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "على R1: router ospf 1 ثم network 192.168.1.0 0.0.0.255 area 0 ثم network 10.0.0.0 0.0.0.3 area 0." },
              config: EX({
                kind: "guided",
                device: "router",
                hostname: "R1",
                startMode: "global",
                intro: "أنت في وضع الإعداد العام للراوتر R1. فعّل OSPF ثم أعلن الشبكتين المتصلتين به.",
                steps: [
                  { id: "s1", instruction: "فعّل OSPF برقم العملية 1", expect: { command: "router", args: { protocol: "ospf", number: 1 } }, success: "✓ أحسنت، أنت الآن في وضع إعداد التوجيه R1(config-router)#", hints: ["السطر ① في صندوق الكتاب.", "الأمر يبدأ بـ router ospf."] },
                  { id: "s2", instruction: "أعلن الشبكة الأولى 192.168.1.0 (الشبكة 24/) في area 0", expect: { command: "network", args: { form: "ospf", address: "192.168.1.0", wildcard: "0.0.0.255", area: 0 } }, success: "✓ أحسنت، أعلنت شبكة R1 الأولى", hints: ["السطر ② في صندوق الكتاب.", "network ثم الشبكة ثم Wildcard 0.0.0.255 ثم area 0."] },
                  { id: "s3", instruction: "أعلن الشبكة المشتركة 10.0.0.0 (الشبكة 30/) في area 0", expect: { command: "network", args: { form: "ospf", address: "10.0.0.0", wildcard: "0.0.0.3", area: 0 } }, success: "✓ أحسنت، أعلنت الشبكة المشتركة بين الراوترين", hints: ["السطر ③ في صندوق الكتاب.", "Wildcard للشبكة 30/ هو 0.0.0.3."] },
                ],
                completion: "✓ أحسنت، R1 يعلن الشبكتين المتصلتين به كما في الكتاب.",
              }),
            },
          ],
        },
        {
          id: "791381s-m28-l01-p04",
          title: "أوامر R2",
          order: 4,
          source: src(86),
          blocks: [
            { id: "m28-l01-p04-cli-h", type: "heading", origin: "book", level: 4, text: "R2 · Router CLI", dir: "ltr" },
            {
              id: "m28-l01-p04-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: [
                "① R2(config)# router ospf 1",
                "② R2(config-router)# network 192.168.2.0 0.0.0.255 area 0",
                "③ R2(config-router)# network 10.0.0.0 0.0.0.3 area 0",
              ].join("\n"),
            },
            {
              id: "m28-l01-p04-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m28-l01-p04-s1", text: [{ text: "نفس رقم العملية." }] },
                { id: "m28-l01-p04-s2", text: [{ text: "شبكة R2 الخاصة به." }] },
                { id: "m28-l01-p04-s3", text: [{ text: "الشبكة المشتركة — نفسها في الراوترين." }] },
              ],
            },
            {
              id: "m28-l01-p04-sim-r2", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "تحدّي الأمر: OSPF على R2",
              description: "أنت في وضع الإعداد العام للراوتر R2. اكتب الأمر المطلوب في كل سؤال بالترتيب؛ المحاكي لا يكشف الإجابة. محاكاة تعليمية مبسّطة.",
              source: src(86),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "التحدّي على R2: router ospf 1، ثم network 192.168.2.0 0.0.0.255 area 0، ثم network 10.0.0.0 0.0.0.3 area 0." },
              config: EX({
                kind: "challenge",
                device: "router",
                hostname: "R2",
                startMode: "global",
                intro: "أنت في وضع الإعداد العام للراوتر R2.",
                steps: [
                  { id: "c1", instruction: "فعّل OSPF بنفس رقم العملية الذي استعمله R1", expect: { command: "router", args: { protocol: "ospf", number: 1 } }, hints: ["السطر ① في صندوق الكتاب: نفس رقم العملية.", "router ospf ثم الرقم 1."] },
                  { id: "c2", instruction: "أعلن شبكة R2 الخاصة به 192.168.2.0 (الشبكة 24/) في area 0", expect: { command: "network", args: { form: "ospf", address: "192.168.2.0", wildcard: "0.0.0.255", area: 0 } }, hints: ["السطر ② في صندوق الكتاب.", "Wildcard للشبكة 24/ هو 0.0.0.255."] },
                  { id: "c3", instruction: "أعلن الشبكة المشتركة 10.0.0.0 (الشبكة 30/) في area 0", expect: { command: "network", args: { form: "ospf", address: "10.0.0.0", wildcard: "0.0.0.3", area: 0 } }, hints: ["السطر ③ في صندوق الكتاب: نفسها في الراوترين.", "Wildcard للشبكة 30/ هو 0.0.0.3."] },
                ],
                allowed: ["network"],
                completion: "✓ صحيح في كل الأوامر — R1 و R2 في نفس area 0 ويتبادلان المعلومات.",
              }),
            },
            {
              id: "m28-l01-p04-warning", type: "callout", origin: "book", kind: "warning", title: "انتبه",
              spans: [
                { text: "في مثالنا نستعمل نفس رقم العملية 1 للتسهيل، والمهم أن تكون " },
                { text: "area", style: "strong" },
                { text: " نفسها في الراوترين حتى تتبادل الراوترات المعلومات." },
              ],
            },
            { id: "m28-l01-p04-wildcard-h", type: "heading", origin: "book", level: 4, text: "كيف نحسب Wildcard؟" },
            {
              id: "m28-l01-p04-wildcard-rule", type: "text", origin: "book",
              spans: [{ text: "نحسب Wildcard بطرح كل خانة في القناع من 255:" }],
            },
            {
              id: "m28-l01-p04-wildcard-eg", type: "text", origin: "book",
              spans: [
                { text: "255.255.255.0", style: "code" },
                { text: " ← " },
                { text: "0.0.0.255", style: "code" },
                { text: " · " },
                { text: "255.255.255.252", style: "code" },
                { text: " ← " },
                { text: "0.0.0.3", style: "code" },
              ],
            },
            {
              id: "m28-l01-p04-v-wildcard", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m28/wildcard-inversion", motion: true,
              source: src(86),
              title: "رسم متحرّك: من القناع 255.255.255.0 إلى Wildcard 0.0.0.255",
              alt: "رسم متحرّك من صفين: صف Mask فيه الخانات 255 و 255 و 255 و 0، وتحته صف Wildcard تظهر خاناته واحدة بعد الأخرى: 0 و 0 و 0 و 255، وفوق كل خانة عملية الطرح 255−255 أو 255−0.",
              caption: "نطرح كل خانة في القناع من 255: القناع 255.255.255.0 يصبح Wildcard 0.0.0.255.",
            },
            {
              id: "m28-l01-p04-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [
                { text: "كل أمر " },
                { text: "network", style: "strong" },
                { text: " يعلن عن شبكة متصلة بالراوتر. في OSPF نكتب: الشبكة + Wildcard + area." },
              ],
            },
          ],
        },
      ],
    },
    {
      // «تدريبات الوحدة» — ADDED enrichment (owner decisions D2/D3/D6, docs/enterprise-791381s-enrichment-plan.md): an end-of-unit
      // exercise page after the booklet's own pages. Every question is answered by the section's printed text above (the
      // explanation quotes it); reveal mode shows the right answer and the explanation after each answer; study activities
      // count toward Strength. The book pages of this module are unchanged (book lock).
      id: "791381s-m28-l02",
      title: "تدريبات الوحدة",
      order: 2,
      pages: [
        {
          id: "791381s-m28-l02-p01",
          title: "تدريبات الوحدة: بروتوكول OSPF",
          order: 1,
          layout: "practice",
          source: src(84, 86),
          blocks: [
            {
              id: "m28-l02-p01-q01", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "من أيّ نوع بروتوكول OSPF؟",
                options: [{ id: "a", text: "Distance Vector" }, { id: "b", text: "مسار يدوي Static" }, { id: "c", text: "Link-State", correct: true }],
                feedback: { explanation: "OSPF بروتوكول من نوع Link-State." },
              },
            },
            {
              id: "m28-l02-p01-q02", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ما الاسم الكامل للاختصار OSPF؟",
                options: [{ id: "a", text: "Open Shortest Path First", correct: true }, { id: "b", text: "Open Secure Port First" }, { id: "c", text: "Only Shortest Path Found" }, { id: "d", text: "Open Switch Path Fast" }],
                feedback: { explanation: "OSPF = Open Shortest Path First — «افتح أقصر طريق أولًا»." },
              },
            },
            {
              id: "m28-l02-p01-q03", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "wordBank", prompt: "أكمل الفراغات من مخزن الكلمات:",
                segments: ["OSPF بروتوكول من نوع ", { blank: "b1" }, "، يناسب الشبكات ", { blank: "b2" }, ". كل راوتر يبني ", { blank: "b3" }, " للشبكة، ويختار المسار الأفضل حسب ", { blank: "b4" }, "، ويرسل تحديثات عند التغيير فقط."],
                bank: ["Bandwidth", "Distance Vector", "خريطة كاملة", "Link-State", "عدد القفزات", "الكبيرة والمعقّدة"],
                answers: { b1: "Link-State", b2: "الكبيرة والمعقّدة", b3: "خريطة كاملة", b4: "Bandwidth" },
                feedback: { explanation: "OSPF بروتوكول من نوع Link-State، يناسب الشبكات الكبيرة والمعقّدة، كل راوتر يبني خريطة كاملة للشبكة، ويختار المسار الأفضل حسب Bandwidth، ويرسل تحديثات عند التغيير فقط." },
              },
            },
            {
              id: "m28-l02-p01-q04", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "OSPF مملوك لشركة واحدة، لذلك لا يعمل إلا مع أجهزتها.", answer: false, feedback: { explanation: "OSPF معيار مفتوح (Open Standard) غير مملوك لشركة واحدة، لذلك يعمل مع أجهزة من شركات مختلفة." } },
            },
            {
              id: "m28-l02-p01-q05", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "classify", prompt: "في مثال الكتاب: أيّ راوتر يعلن كل شبكة في OSPF؟",
                groups: [{ id: "r1", text: "R1 فقط" }, { id: "r2", text: "R2 فقط" }, { id: "both", text: "الراوتران معًا" }],
                items: [{ id: "i1", text: "10.0.0.0/30" }, { id: "i2", text: "192.168.2.0/24" }, { id: "i3", text: "192.168.1.0/24" }],
                assign: { i1: "both", i2: "r2", i3: "r1" },
                feedback: { explanation: "كل راوتر يعلن عن الشبكات المتصلة به مباشرة: R1 ← 192.168.1.0/24 و 10.0.0.0/30، و R2 ← 192.168.2.0/24 و 10.0.0.0/30. الشبكة المشتركة نفسها في الراوترين." },
              },
            },
            {
              id: "m28-l02-p01-q06", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "ordering", prompt: "رتّب أوامر R1 كما في صندوق الكتاب:",
                items: [{ id: "net30", text: "network 10.0.0.0 0.0.0.3 area 0" }, { id: "router", text: "router ospf 1" }, { id: "net24", text: "network 192.168.1.0 0.0.0.255 area 0" }],
                order: ["router", "net24", "net30"],
                feedback: { explanation: "① router ospf 1: تفعيل OSPF برقم العملية 1. ② network 192.168.1.0 0.0.0.255 area 0: إعلان الشبكة الأولى. ③ network 10.0.0.0 0.0.0.3 area 0: إعلان الشبكة المشتركة بين الراوترين." },
              },
            },
            {
              id: "m28-l02-p01-q07", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ما Wildcard المقابل للقناع 255.255.255.0؟",
                options: [{ id: "a", text: "255.255.255.0" }, { id: "b", text: "0.0.0.255", correct: true }, { id: "c", text: "0.0.0.3" }, { id: "d", text: "255.0.0.0" }],
                feedback: { explanation: "نحسب Wildcard بطرح كل خانة في القناع من 255: ‏255.255.255.0 ← 0.0.0.255." },
              },
            },
            {
              id: "m28-l02-p01-q08", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ما Wildcard المقابل للقناع 255.255.255.252 (الشبكة 30/)؟",
                options: [{ id: "a", text: "0.0.0.252" }, { id: "b", text: "0.0.0.255" }, { id: "c", text: "255.255.255.3" }, { id: "d", text: "0.0.0.3", correct: true }],
                feedback: { explanation: "نحسب Wildcard بطرح كل خانة في القناع من 255: ‏255.255.255.252 ← 0.0.0.3، وهو Wildcard للشبكة 30/." },
              },
            },
            {
              id: "m28-l02-p01-q09", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "يمكن أن يستعمل R2 رقم area مختلفًا عن R1، ويبقى الراوتران يتبادلان المعلومات.", answer: false, feedback: { explanation: "المهم أن تكون area نفسها في الراوترين حتى تتبادل الراوترات المعلومات." } },
            },
            {
              id: "m28-l02-p01-q10", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "أيّ أمر network يكتبه R1 و R2 بالشكل نفسه تمامًا؟",
                options: [{ id: "a", text: "network 192.168.1.0 0.0.0.255 area 0" }, { id: "b", text: "network 192.168.2.0 0.0.0.255 area 0" }, { id: "c", text: "network 10.0.0.0 0.0.0.3 area 0", correct: true }],
                feedback: { explanation: "الشبكة المشتركة 10.0.0.0 — نفسها في الراوترين؛ أما 192.168.1.0 فهي شبكة R1، و 192.168.2.0 شبكة R2 الخاصة به." },
              },
            },
            {
              id: "m28-l02-p01-q11", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "matching", prompt: "صِل كل جزء من أوامر R1 بمعناه:",
                left: [{ id: "proc", text: "router ospf 1" }, { id: "wc24", text: "0.0.0.255" }, { id: "wc30", text: "0.0.0.3" }, { id: "area", text: "area 0" }],
                right: [{ id: "r1", text: "المنطقة الرئيسية" }, { id: "r2", text: "Wildcard للشبكة 30/" }, { id: "r3", text: "تفعيل OSPF برقم العملية 1" }, { id: "r4", text: "Wildcard للشبكة 24/" }],
                pairs: { proc: "r3", wc24: "r4", wc30: "r2", area: "r1" },
                feedback: { explanation: "router ospf 1: تفعيل OSPF برقم العملية 1. ‏0.0.0.255 هو Wildcard للشبكة 24/، و area 0 هي المنطقة الرئيسية. ‏0.0.0.3 هو Wildcard للشبكة 30/." },
              },
            },
            {
              id: "m28-l02-p01-q12", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "wordBank", prompt: "أكمل قاعدة «تذكّر» من مخزن الكلمات:",
                segments: ["كل أمر network يعلن عن شبكة ", { blank: "b1" }, " بالراوتر. في OSPF نكتب: الشبكة + ", { blank: "b2" }, " + ", { blank: "b3" }, "."],
                bank: ["area", "بعيدة", "Wildcard", "متصلة", "Subnet Mask"],
                answers: { b1: "متصلة", b2: "Wildcard", b3: "area" },
                feedback: { explanation: "كل أمر network يعلن عن شبكة متصلة بالراوتر. في OSPF نكتب: الشبكة + Wildcard + area." },
              },
            },
          ],
        },
      ],
    },
  ],
};

export default m28;
