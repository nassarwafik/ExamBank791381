// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 29 «بروتوكول EIGRP وجدول التوجيه».
//
// Verbatim conversion of booklet PDF pages 87–90 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every converted block is origin:"book": nothing is added, removed or reworded.
//
// Enrichment (docs/enterprise-791381s-enrichment-plan.md, Phase 6): teacher-enrichment blocks (visuals and CLI terminal
// simulations reused from course 791381 after checking their labels / commands against this section, and the end-of-unit
// «تدريبات الوحدة» lesson) are ADDED after the book blocks they explain. The book blocks stay verbatim — pinned by the book
// lock (bookLock.test.ts). This section calls EIGRP «Distance Vector متطوّر»; every added block follows that wording only.

import type { ContentModule, ContentSource } from "../../types";
import type { CliExerciseConfig } from "../../../cli/types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };
const EX = (exercise: CliExerciseConfig): Record<string, unknown> => ({ ...exercise });

const m29: ContentModule = {
  id: "791381s-m29",
  title: "بروتوكول EIGRP وجدول التوجيه",
  order: 29,
  lessons: [
    {
      id: "791381s-m29-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m29-l00-p01",
          title: "بروتوكول EIGRP وجدول التوجيه",
          order: 1,
          layout: "opener",
          source: src(87),
          blocks: [
            {
              id: "m29-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الدفعة السادسة · كتاب ص 218–222", unitNumber: "29", title: "بروتوكول EIGRP وجدول التوجيه",
              subtitle: "بروتوكول Cisco السريع — وكيف نقرأ جدول التوجيه بالأمر show ip route؟",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m29-l01",
      title: "بروتوكول EIGRP وجدول التوجيه",
      order: 1,
      pages: [
        {
          id: "791381s-m29-l01-p01",
          title: "ما هو EIGRP؟",
          order: 1,
          source: src(87),
          blocks: [
            {
              id: "m29-l01-p01-def", type: "text", origin: "book",
              spans: [{ text: "EIGRP = Enhanced Interior Gateway Routing Protocol.", style: "strong" }],
            },
            {
              id: "m29-l01-p01-points", type: "list", origin: "book", variant: "plain",
              items: [
                {
                  id: "m29-l01-p01-pt1",
                  text: [
                    { text: "بروتوكول " },
                    { text: "Distance Vector متطوّر", style: "strong" },
                    { text: " من شركة " },
                    { text: "Cisco", style: "strong" },
                    { text: "." },
                  ],
                },
                { id: "m29-l01-p01-pt2", text: [{ text: "يعتمد على " }, { text: "Bandwidth + Delay", style: "strong" }, { text: "." }] },
                { id: "m29-l01-p01-pt3", text: [{ text: "سريع", style: "strong" }, { text: " في التكيّف مع التغييرات في الشبكة." }] },
              ],
            },
            {
              id: "m29-l01-p01-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [
                { text: "EIGRP خاص بأجهزة " },
                { text: "Cisco", style: "strong" },
                { text: "، وأسرع في التقارب من البروتوكولات القديمة. " },
                { text: "التقارب", style: "strong" },
                { text: " = أن تعرف كل الراوترات الطرق الصحيحة بعد أي تغيير." },
              ],
            },
            {
              id: "m29-l01-p01-v-eigrp", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m27/eigrp-metric-adaptation", motion: false,
              source: src(87),
              title: "مخطط: EIGRP — المقياس والتكيّف السريع",
              alt: "مخطط: شارتان «Distance Vector» و«من Cisco»، ثم مربعا «Bandwidth» و«Delay» بينهما علامة + يتجهان بسهم إلى «اختيار المسار»، وتحته سهم من «تغيّر في الشبكة» إلى «سريع التكيّف».",
              caption: "‏EIGRP من Cisco: يعتمد على Bandwidth + Delay، وسريع في التكيّف مع التغييرات.",
            },
          ],
        },
        {
          id: "791381s-m29-l01-p02",
          title: "مثال EIGRP",
          order: 2,
          source: src(87, 88),
          blocks: [
            {
              id: "m29-l01-p02-drawing", type: "diagram", origin: "book",
              src: "/learning-assets/791381s/904b238e4b3ca4ca.png",
              alt: "رسم: إطار متقطع مكتوب عليه «AS 100» يضم راوتر R1 وراوتر R2 متصلين بخط عليه «10.0.0.0/30»؛ تحت R1 شبكة داخل إطار متقطع مكتوب عليها «192.168.1.0/24» فيها حاسوبان، وتحت R2 شبكة مكتوب عليها «192.168.2.0/24» فيها حاسوبان.",
              caption: "نفس رقم AS في الراوترين — وإلا لا يتبادلان المعلومات",
            },
            {
              id: "m29-l01-p02-points", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m29-l01-p02-pt1", text: [{ text: "نفس شكل الشبكات في مثال OSPF تقريبًا." }] },
                {
                  id: "m29-l01-p02-pt2",
                  text: [
                    { text: "نستعمل رقم " },
                    { text: "AS", style: "strong" },
                    { text: " (Autonomous System) مثل " },
                    { text: "100", style: "strong" },
                    { text: "." },
                  ],
                },
                { id: "m29-l01-p02-pt3", text: [{ text: "يجب " }, { text: "توحيد رقم AS", style: "strong" }, { text: " بين الراوترات." }] },
              ],
            },
            {
              id: "m29-l01-p02-idea", type: "callout", origin: "book", kind: "summary", title: "الفكرة",
              spans: [{ text: "رقم AS يجمع الراوترات التي تتبادل معلومات التوجيه معًا." }],
            },
          ],
        },
        {
          id: "791381s-m29-l01-p03",
          title: "أوامر R1 و R2",
          order: 3,
          source: src(88),
          blocks: [
            { id: "m29-l01-p03-cli1-h", type: "heading", origin: "book", level: 4, text: "R1 · Router CLI", dir: "ltr" },
            {
              id: "m29-l01-p03-cli1", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: [
                "① R1(config)# router eigrp 100",
                "② R1(config-router)# network 192.168.1.0",
                "③ R1(config-router)# network 10.0.0.0",
              ].join("\n"),
            },
            {
              id: "m29-l01-p03-steps1", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m29-l01-p03-a1", text: [{ text: "router eigrp 100", style: "strong" }, { text: ": تفعيل EIGRP برقم AS 100." }] },
                { id: "m29-l01-p03-a2", text: [{ text: "إعلان الشبكة الأولى." }] },
                { id: "m29-l01-p03-a3", text: [{ text: "إعلان الشبكة المشتركة." }] },
              ],
            },
            {
              id: "m29-l01-p03-sim-r1", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مثال موجّه: EIGRP على R1",
              description: "أنت في وضع الإعداد العام للراوتر R1. نفّذ سطور صندوق R1 بالترتيب. محاكاة تعليمية مبسّطة، ليست جهازًا حقيقيًا.",
              source: src(88),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "على R1: router eigrp 100 ثم network 192.168.1.0 ثم network 10.0.0.0." },
              config: EX({
                kind: "guided",
                device: "router",
                hostname: "R1",
                startMode: "global",
                intro: "أنت في وضع الإعداد العام للراوتر R1. نفّذ سطور صندوق R1 بالترتيب.",
                steps: [
                  { id: "s1", instruction: "فعّل EIGRP برقم AS 100", expect: { command: "router", args: { protocol: "eigrp", number: 100 } }, success: "✓ أحسنت، أنت الآن في وضع إعداد التوجيه (config-router)#", hints: ["السطر ① في صندوق R1.", "الأمر يبدأ بـ router eigrp."] },
                  { id: "s2", instruction: "أعلن الشبكة الأولى 192.168.1.0", expect: { command: "network", args: { form: "eigrp", address: "192.168.1.0" } }, hints: ["السطر ② في صندوق R1.", "network ثم عنوان الشبكة فقط — بلا area."] },
                  { id: "s3", instruction: "أعلن الشبكة المشتركة 10.0.0.0", expect: { command: "network", args: { form: "eigrp", address: "10.0.0.0" } }, hints: ["السطر ③ في صندوق R1.", "network 10.0.0.0."] },
                ],
                completion: "✓ أحسنت، R1 يعلن شبكتيه في EIGRP برقم AS 100 كما في الصندوق.",
              }),
            },
            { id: "m29-l01-p03-cli2-h", type: "heading", origin: "book", level: 4, text: "R2 · Router CLI", dir: "ltr" },
            {
              id: "m29-l01-p03-cli2", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: [
                "① R2(config)# router eigrp 100",
                "② R2(config-router)# network 192.168.2.0",
                "③ R2(config-router)# network 10.0.0.0",
              ].join("\n"),
            },
            {
              id: "m29-l01-p03-steps2", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m29-l01-p03-b1", text: [{ text: "نفس رقم AS." }] },
                { id: "m29-l01-p03-b2", text: [{ text: "شبكة R2." }] },
                { id: "m29-l01-p03-b3", text: [{ text: "الشبكة المشتركة." }] },
              ],
            },
            {
              id: "m29-l01-p03-sim-r2", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مهمّة: EIGRP على R2",
              description: "أنت في وضع الإعداد العام للراوتر R2. المطلوب حالة نهائية: EIGRP برقم AS 100 (نفس رقم R1) يعلن الشبكتين 192.168.2.0 و 10.0.0.0. الترتيب لك. محاكاة تعليمية مبسّطة، ليست جهازًا حقيقيًا.",
              source: src(88),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "على R2: router eigrp 100 ثم network 192.168.2.0 ثم network 10.0.0.0." },
              config: EX({
                kind: "task",
                device: "router",
                hostname: "R2",
                startMode: "global",
                intro: "أنت في وضع الإعداد العام للراوتر R2.",
                goals: [
                  { id: "g-as", label: "EIGRP مفعّل برقم AS 100", condition: { kind: "routing", protocol: "eigrp", prop: "id", value: 100 } },
                  { id: "g-net2", label: "شبكة R2 192.168.2.0 معلنة", condition: { kind: "routing", protocol: "eigrp", prop: "network", value: "192.168.2.0" } },
                  { id: "g-link", label: "الشبكة المشتركة 10.0.0.0 معلنة", condition: { kind: "routing", protocol: "eigrp", prop: "network", value: "10.0.0.0" } },
                ],
                hints: ["ابدأ بـ router eigrp ثم نفس رقم AS الذي في R1.", "داخل (config-router)#: network ثم عنوان الشبكة، بلا area."],
                completion: "✓ أحسنت، R2 يعلن شبكتيه برقم AS المطابق لـ R1.",
              }),
            },
            {
              id: "m29-l01-p03-warning", type: "callout", origin: "book", kind: "warning", title: "انتبه",
              spans: [
                { text: "يجب أن يكون رقم " },
                { text: "AS", style: "strong" },
                { text: " متطابقًا بين الراوترات حتى تتبادل المعلومات." },
              ],
            },
          ],
        },
        {
          id: "791381s-m29-l01-p04",
          title: "مقارنة أوامر OSPF و EIGRP",
          order: 4,
          source: src(89),
          blocks: [
            {
              id: "m29-l01-p04-table", type: "table", origin: "book",
              headers: ["", "OSPF", "EIGRP"],
              rows: [
                ["التفعيل", "router ospf 1", "router eigrp 100"],
                ["الرقم", "رقم العملية", "رقم AS (يجب أن يتطابق)"],
                ["إعلان شبكة", "network 192.168.1.0 0.0.0.255 area 0", "network 192.168.1.0"],
                ["area", "نكتبها ✓", "لا نكتبها ✗"],
              ],
            },
            {
              id: "m29-l01-p04-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [{ text: "في EIGRP " }, { text: "لا نكتب area", style: "strong" }, { text: "؛ نكتب رقم AS ثم الشبكات." }],
            },
          ],
        },
        {
          id: "791381s-m29-l01-p05",
          title: "جدول التوجيه show ip route",
          order: 5,
          source: src(89, 90),
          blocks: [
            {
              id: "m29-l01-p05-intro", type: "text", origin: "book",
              spans: [
                { text: "الأمر " },
                { text: "show ip route", style: "strong" },
                { text: " يعرض كل الشبكات التي يعرفها الراوتر، ومن أين عرفها:" },
              ],
            },
            { id: "m29-l01-p05-cli-h", type: "heading", origin: "book", level: 4, text: "Router# show ip route", dir: "ltr" },
            {
              id: "m29-l01-p05-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: [
                "C    192.168.1.0/24 is directly connected, G0/0",
                "R    192.168.2.0/24 [120/1] via 192.168.1.1",
                "O    10.0.0.0/24 [110/2] via 192.168.1.1",
              ].join("\n"),
            },
            {
              id: "m29-l01-p05-codes", type: "table", origin: "book",
              headers: ["الرمز", "معناه"],
              rows: [
                ["C", "الشبكة متصلة مباشرة بالراوتر (Connected)."],
                ["S", "مسار ثابت كتبه المدير (Static)."],
                ["R", "وصلت عبر بروتوكول RIP."],
                ["O", "وصلت عبر OSPF."],
                ["D", "وصلت عبر EIGRP."],
              ],
            },
            {
              id: "m29-l01-p05-parts", type: "list", origin: "book", variant: "plain",
              items: [
                {
                  id: "m29-l01-p05-pt1",
                  text: [
                    { text: "[120/1]", style: "strong" },
                    { text: ": الرقم الأول 120 هو المسافة الإدارية " },
                    { text: "AD", style: "strong" },
                    { text: "، والرقم الثاني 1 هو المقياس " },
                    { text: "Metric", style: "strong" },
                    { text: "." },
                  ],
                },
                {
                  id: "m29-l01-p05-pt2",
                  text: [{ text: "via 192.168.1.1", style: "strong" }, { text: ": الطريق يمرّ عبر هذا العنوان (الراوتر التالي)." }],
                },
              ],
            },
            {
              id: "m29-l01-p05-v-route", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m27/show-ip-route", motion: false,
              source: src(89, 90),
              title: "مخطط: قراءة سطر من جدول التوجيه",
              alt: "مخطط يقسّم السطر «R 192.168.2.0/24 [120/1] via 192.168.1.1» إلى أجزاء: الكود R = RIP، والقوسان [AD / Metric] حيث 120 المسافة الإدارية و1 المقياس، و via عنوان الراوتر التالي؛ وتحته الرموز C و O و D و R.",
              caption: "‏الرمز يدلّ على مصدر الطريق، و[120/1] = AD / Metric، و via = الراوتر التالي.",
            },
            {
              id: "m29-l01-p05-memorize", type: "table", origin: "book",
              headers: ["الرمز", "C", "S", "R", "O", "D"],
              rows: [["احفظ", "متصلة", "ثابت", "RIP", "OSPF", "EIGRP"]],
            },
          ],
        },
      ],
    },
    {
      // «تدريبات الوحدة» — ADDED enrichment: an end-of-unit exercise page after the booklet's own pages. Every question is
      // answered by the section's printed text above (the explanation quotes it). The book pages are unchanged (book lock).
      id: "791381s-m29-l02",
      title: "تدريبات الوحدة",
      order: 2,
      pages: [
        {
          id: "791381s-m29-l02-p01",
          title: "تدريبات الوحدة: بروتوكول EIGRP وجدول التوجيه",
          order: 1,
          layout: "practice",
          source: src(87, 90),
          blocks: [
            {
              id: "m29-l02-p01-q01", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "على ماذا يعتمد EIGRP حسب الوحدة؟",
                options: [{ id: "a", text: "عنوان MAC" }, { id: "b", text: "Bandwidth + Delay", correct: true }, { id: "c", text: "رقم المنفذ Port" }, { id: "d", text: "اسم الراوتر" }],
                feedback: { explanation: "EIGRP بروتوكول Distance Vector متطوّر من شركة Cisco، يعتمد على Bandwidth + Delay." },
              },
            },
            {
              id: "m29-l02-p01-q02", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "EIGRP بروتوكول يعمل على أجهزة كل الشركات وليس خاصًا بشركة معيّنة.", answer: false, feedback: { explanation: "EIGRP خاص بأجهزة Cisco، وأسرع في التقارب من البروتوكولات القديمة." } },
            },
            {
              id: "m29-l02-p01-q03", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "wordBank", prompt: "أكمل الفراغات من مخزن الكلمات:",
                segments: ["EIGRP بروتوكول ", { blank: "b1" }, " من شركة ", { blank: "b2" }, "، يعتمد على ", { blank: "b3" }, ". التقارب = أن تعرف كل الراوترات ", { blank: "b4" }, " بعد أي تغيير."],
                bank: ["Cisco", "الطرق الصحيحة", "Distance Vector متطوّر", "Bandwidth + Delay", "عناوين MAC", "area 0"],
                answers: { b1: "Distance Vector متطوّر", b2: "Cisco", b3: "Bandwidth + Delay", b4: "الطرق الصحيحة" },
                feedback: { explanation: "EIGRP بروتوكول Distance Vector متطوّر من شركة Cisco، يعتمد على Bandwidth + Delay. التقارب = أن تعرف كل الراوترات الطرق الصحيحة بعد أي تغيير." },
              },
            },
            {
              id: "m29-l02-p01-q04", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ما وظيفة رقم AS في EIGRP؟",
                options: [{ id: "a", text: "يحدّد سرعة الخط بين الراوترين" }, { id: "b", text: "هو عنوان IP للراوتر" }, { id: "c", text: "يجمع الراوترات التي تتبادل معلومات التوجيه معًا", correct: true }, { id: "d", text: "يحدّد رقم area" }],
                feedback: { explanation: "الفكرة: رقم AS يجمع الراوترات التي تتبادل معلومات التوجيه معًا." },
              },
            },
            {
              id: "m29-l02-p01-q05", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "إذا كتب R1 الأمر router eigrp 100 وكتب R2 الأمر router eigrp 200، فلن يتبادلا معلومات التوجيه.", answer: true, feedback: { explanation: "يجب أن يكون رقم AS متطابقًا بين الراوترات حتى تتبادل المعلومات — نفس رقم AS في الراوترين، وإلا لا يتبادلان المعلومات." } },
            },
            {
              id: "m29-l02-p01-q06", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "ordering", prompt: "رتّب أسطر صندوق R2 كما في الوحدة (① ثم ② ثم ③):",
                items: [
                  { id: "link", text: "network 10.0.0.0" },
                  { id: "as", text: "router eigrp 100" },
                  { id: "lan", text: "network 192.168.2.0" },
                ],
                order: ["as", "lan", "link"],
                feedback: { explanation: "صندوق R2: ① router eigrp 100 (نفس رقم AS)، ② network 192.168.2.0 (شبكة R2)، ③ network 10.0.0.0 (الشبكة المشتركة)." },
              },
            },
            {
              id: "m29-l02-p01-q07", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "classify", prompt: "صنّف كل عنصر حسب جدول المقارنة: هل هو من أوامر OSPF أم EIGRP؟",
                groups: [{ id: "ospf", text: "OSPF" }, { id: "eigrp", text: "EIGRP" }],
                items: [
                  { id: "i1", text: "router eigrp 100" },
                  { id: "i2", text: "router ospf 1" },
                  { id: "i3", text: "network 192.168.1.0 0.0.0.255 area 0" },
                  { id: "i4", text: "network 192.168.1.0" },
                  { id: "i5", text: "رقم العملية" },
                  { id: "i6", text: "رقم AS (يجب أن يتطابق)" },
                ],
                assign: { i1: "eigrp", i2: "ospf", i3: "ospf", i4: "eigrp", i5: "ospf", i6: "eigrp" },
                feedback: { explanation: "جدول المقارنة: OSPF يُفعَّل بـ router ospf 1 (رقم العملية) ويعلن network 192.168.1.0 0.0.0.255 area 0؛ و EIGRP يُفعَّل بـ router eigrp 100 (رقم AS يجب أن يتطابق) ويعلن network 192.168.1.0 بلا area." },
              },
            },
            {
              id: "m29-l02-p01-q08", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "في أوامر EIGRP نكتب area بعد عنوان الشبكة كما في OSPF.", answer: false, feedback: { explanation: "تذكّر: في EIGRP لا نكتب area؛ نكتب رقم AS ثم الشبكات." } },
            },
            {
              id: "m29-l02-p01-q09", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "matching", prompt: "صِل كل رمز في جدول التوجيه بمعناه:",
                left: [
                  { id: "c", text: "C" },
                  { id: "s", text: "S" },
                  { id: "r", text: "R" },
                  { id: "o", text: "O" },
                  { id: "d", text: "D" },
                ],
                right: [
                  { id: "r1", text: "وصلت عبر OSPF" },
                  { id: "r2", text: "الشبكة متصلة مباشرة بالراوتر" },
                  { id: "r3", text: "وصلت عبر EIGRP" },
                  { id: "r4", text: "مسار ثابت كتبه المدير" },
                  { id: "r5", text: "وصلت عبر بروتوكول RIP" },
                ],
                pairs: { c: "r2", s: "r4", r: "r5", o: "r1", d: "r3" },
                feedback: { explanation: "C = متصلة مباشرة (Connected)، S = مسار ثابت كتبه المدير (Static)، R = عبر RIP، O = عبر OSPF، D = عبر EIGRP." },
              },
            },
            {
              id: "m29-l02-p01-q10", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "في السطر R 192.168.2.0/24 [120/1] via 192.168.1.1، ماذا يعني الرقم 120؟",
                options: [{ id: "a", text: "المقياس Metric" }, { id: "b", text: "رقم AS" }, { id: "c", text: "رقم المنفذ" }, { id: "d", text: "المسافة الإدارية AD", correct: true }],
                feedback: { explanation: "[120/1]: الرقم الأول 120 هو المسافة الإدارية AD، والرقم الثاني 1 هو المقياس Metric." },
              },
            },
            {
              id: "m29-l02-p01-q11", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "في السطر O 10.0.0.0/24 [110/2] via 192.168.1.1، ماذا يعني الجزء via 192.168.1.1؟",
                options: [{ id: "a", text: "الطريق يمرّ عبر هذا العنوان (الراوتر التالي)", correct: true }, { id: "b", text: "الشبكة متصلة مباشرة بالراوتر" }, { id: "c", text: "المسافة الإدارية للطريق" }],
                feedback: { explanation: "via 192.168.1.1: الطريق يمرّ عبر هذا العنوان (الراوتر التالي)." },
              },
            },
          ],
        },
      ],
    },
  ],
};

export default m29;
