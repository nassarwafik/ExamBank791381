// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 17 «Native و Tagged و Untagged».
//
// Verbatim conversion of booklet PDF pages 48–51 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every converted block is origin:"book": nothing is added, removed or reworded; bold runs are `strong`, monospace
// runs are `code`, printed box labels are the callout titles. The tagged-packet drawing is a crop of the booklet itself.
//
// Enrichment (docs/enterprise-791381s-enrichment-plan.md, Phases 2–5): teacher-enrichment blocks (visuals / activities reused from
// course 791381 after checking their labels against this section, and the end-of-unit «تدريبات الوحدة» lesson) are ADDED after the
// book blocks they explain. The book blocks above stay verbatim — pinned by the book lock (bookLock.test.ts).

import type { ContentModule, ContentSource } from "../../types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };

const m17: ContentModule = {
  id: "791381s-m17",
  title: "Native و Tagged و Untagged",
  order: 17,
  lessons: [
    {
      id: "791381s-m17-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m17-l00-p01",
          title: "Native و Tagged و Untagged",
          order: 1,
          layout: "opener",
          source: src(48),
          blocks: [
            {
              id: "m17-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الدفعة الرابعة · كتاب ص 135–138", unitNumber: "17", title: "Native و Tagged و Untagged",
              subtitle: "كيف يعرف السويتش لأي VLAN تنتمي كل رسالة تمرّ في كابل Trunk؟",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m17-l01",
      title: "Native و Tagged و Untagged",
      order: 1,
      pages: [
        {
          id: "791381s-m17-l01-p01",
          title: "ما هو الـ Tag؟",
          order: 1,
          source: src(48, 49),
          blocks: [
            {
              id: "m17-l01-p01-def", type: "text", origin: "book",
              spans: [{ text: "الـ Tag = علامة داخل الحزمة تخبر السويتش: هذه الحزمة تابعة لـ VLAN رقم كذا.", style: "strong" }],
            },
            {
              id: "m17-l01-p01-intro", type: "text", origin: "book",
              spans: [{ text: "في كابل Trunk تمرّ رسائل من عدة VLAN معًا. حتى لا تختلط، نلصق على كل رسالة «ملصقًا» عليه رقم VLAN — مثل ملصق اسم الصف على دفتر الطالب." }],
            },
            {
              id: "m17-l01-p01-drawing", type: "diagram", origin: "book",
              src: "/learning-assets/791381s/0cf86d4a49977049.png",
              alt: "شريط حزمة مقسوم إلى أجزاء: «فحص»، «البيانات»، جزء مؤطّر بخط عريض مكتوب فيه «Tag» و«VLAN 10»، ثم «MAC».",
              caption: "الحزمة مع Tag (علامة) فيها رقم VLAN",
            },
          ],
        },
        {
          id: "791381s-m17-l01-p02",
          title: "الأنواع الثلاثة",
          order: 2,
          source: src(49),
          blocks: [
            {
              id: "m17-l01-p02-cards", type: "list", origin: "book", variant: "cards",
              items: [
                {
                  id: "m17-l01-p02-c1", term: "Tagged · مع علامة",
                  text: [
                    { text: "الحزمة تحمل رقم VLAN. تُستخدم عبر وصلات " },
                    { text: "Trunk", style: "strong" },
                    { text: ". " },
                    { text: "مثال:", style: "strong" },
                    { text: " VLAN 10 و 20" },
                  ],
                },
                {
                  id: "m17-l01-p02-c2", term: "Untagged · بدون علامة",
                  text: [
                    { text: "الحزمة بدون Tag. تظهر في منافذ " },
                    { text: "Access", style: "strong" },
                    { text: " للأجهزة العادية. " },
                    { text: "مثال:", style: "strong" },
                    { text: " حاسوب، طابعة" },
                  ],
                },
                {
                  id: "m17-l01-p02-c3", term: "Native · الأصلية",
                  text: [
                    { text: "VLAN تمرّ عبر " },
                    { text: "Trunk بدون Tag", style: "strong" },
                    { text: "، للتوافق مع أجهزة قديمة. " },
                    { text: "يُفضّل", style: "strong" },
                    { text: " تغييرها من VLAN 1" },
                  ],
                },
              ],
            },
            {
              // ENRICHMENT: SVG — the three cards in one picture: Tagged (VLAN 10 · 20 on Trunk), Untagged (Access), Native
              // (crosses the Trunk without a Tag; 99 is the unit's own Native example, p03).
              id: "m17-l01-p02-v-tagged-untagged-native", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m03/tagged-untagged-native", motion: true,
              source: src(49),
              title: "رسم توضيحي: Tagged و Untagged و Native",
              alt: "سويتشان SW1 و SW2 بينهما وصلة Trunk تعبرها ثلاث حزم: حزمة عليها «Tag 10»، وحزمة عليها «Tag 20»، وحزمة Native 99 «بلا Tag»؛ وتحت SW1 حاسوب على منفذ Access يرسل «بلا Tag (Untagged)».",
              caption: "على Trunk: VLAN 10 و 20 مع Tag، والـ Native بدون Tag · على منفذ Access: الحزمة بدون Tag.",
            },
            {
              id: "m17-l01-p02-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [
                { text: "Access", style: "strong" },
                { text: " = لجهاز عادي (بدون Tag).   " },
                { text: "Trunk", style: "strong" },
                { text: " = وصلة بين أجهزة الشبكة (مع Tag)." },
              ],
            },
          ],
        },
        {
          id: "791381s-m17-l01-p03",
          title: "إعداد Native VLAN",
          order: 3,
          source: src(49, 50),
          blocks: [
            {
              id: "m17-l01-p03-intro", type: "text", origin: "book",
              spans: [{ text: "بشكل تلقائي تكون Native VLAN هي VLAN 1. لأسباب أمنية نغيّرها إلى رقم آخر لا نستعمله للأجهزة، مثل 99." }],
            },
            { id: "m17-l01-p03-cli-h", type: "heading", origin: "book", level: 4, text: "Switch CLI", dir: "ltr" },
            {
              id: "m17-l01-p03-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: "① Switch(config)# interface f0/24\n② Switch(config-if)# switchport mode trunk\n③ Switch(config-if)# switchport trunk native vlan 99",
            },
            {
              id: "m17-l01-p03-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m17-l01-p03-s1", text: [{ text: "نختار المنفذ الذي يربط بين السويتشات (F0/24)." }] },
                { id: "m17-l01-p03-s2", text: [{ text: "نجعله Trunk حتى يمرّر عدة VLAN." }] },
                { id: "m17-l01-p03-s3", text: [{ text: "نجعل VLAN 99 هي الـ Native بدل VLAN 1." }] },
              ],
            },
            {
              id: "m17-l01-p03-why", type: "callout", origin: "book", kind: "summary", title: "لماذا؟",
              spans: [
                { text: "الـ Native VLAN لا تحمل Tag على وصلة Trunk، لذلك يُفضّل " },
                { text: "عدم تركها على VLAN 1", style: "strong" },
                { text: " لأسباب أمنية." },
              ],
            },
            {
              // ENRICHMENT: CLI simulation — the booklet's own box ① interface f0/24 ② switchport mode trunk
              // ③ switchport trunk native vlan 99.
              id: "m17-l01-p03-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              source: src(49, 50),
              title: "مثال موجّه: Native VLAN 99 على المنفذ F0/24",
              description: "أنت في وضع الإعدادات العامة. نفّذ أسطر صندوق Switch CLI الثلاثة بالترتيب. محاكاة تعليمية مبسّطة، ليست جهازًا حقيقيًا.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "المثال الموجّه: Switch(config)# interface f0/24 ثم switchport mode trunk ثم switchport trunk native vlan 99." },
              config: {
                kind: "guided",
                device: "switch",
                startMode: "global",
                intro: "أنت في وضع الإعدادات العامة Switch(config)#. اجعل VLAN 99 هي الـ Native على المنفذ الذي يربط بين السويتشات، بدل VLAN 1.",
                steps: [
                  { id: "s1", instruction: "اختر المنفذ الذي يربط بين السويتشات (F0/24)", expect: { command: "interface", args: { interfaces: ["f0/24"] } }, success: "✓ أحسنت — الموجّه الآن Switch(config-if)#", hints: ["السطر ① في صندوق Switch CLI.", "interface ثم f0/24."] },
                  { id: "s2", instruction: "اجعله Trunk حتى يمرّر عدة VLAN", expect: { command: "switchport-mode", args: { mode: "trunk" } }, hints: ["السطر ② في الصندوق.", "switchport mode ثم trunk."] },
                  { id: "s3", instruction: "اجعل VLAN 99 هي الـ Native بدل VLAN 1", expect: { command: "switchport-trunk-native-vlan", args: { vlanId: 99 } }, hints: ["السطر ③ في الصندوق: الكلمة native.", "switchport trunk native vlan 99"] },
                ],
                completion: "✓ أحسنت — F0/24 أصبح Trunk، والـ Native VLAN عليه هي 99 بدل VLAN 1: الـ Native لا تحمل Tag على وصلة Trunk، لذلك لا نتركها على VLAN 1 لأسباب أمنية.",
              },
            },
          ],
        },
        {
          id: "791381s-m17-l01-p04",
          title: "إعداد Tagged VLAN عبر Trunk",
          order: 4,
          source: src(50),
          blocks: [
            {
              id: "m17-l01-p04-intro", type: "text", origin: "book",
              spans: [{ text: "نستطيع أن نحدّد أي VLAN مسموح لها أن تمرّ في كابل Trunk، فلا يمرّ إلا ما نحتاجه." }],
            },
            { id: "m17-l01-p04-cli-h", type: "heading", origin: "book", level: 4, text: "Switch CLI", dir: "ltr" },
            {
              id: "m17-l01-p04-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: "① Switch(config)# interface f0/24\n② Switch(config-if)# switchport mode trunk\n③ Switch(config-if)# switchport trunk allowed vlan 10,20",
            },
            {
              id: "m17-l01-p04-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m17-l01-p04-s1", text: [{ text: "نختار منفذ الوصلة." }] },
                { id: "m17-l01-p04-s2", text: [{ text: "نجعله Trunk ليسمح بمرور عدة VLAN." }] },
                { id: "m17-l01-p04-s3", text: [{ text: "allowed vlan 10,20", style: "strong" }, { text: ": نسمح فقط لـ VLAN 10 و 20 بالمرور." }] },
              ],
            },
            {
              id: "m17-l01-p04-benefit", type: "callout", origin: "book", kind: "summary", title: "الفائدة",
              spans: [{ text: "كل حزمة تحمل Tag برقم VLAN، فيعرف السويتش في الطرف الآخر مصدر كل حزمة ويرسلها للقسم الصحيح." }],
            },
            {
              // ENRICHMENT: CLI simulation — the booklet's own box ① interface f0/24 ② switchport mode trunk
              // ③ switchport trunk allowed vlan 10,20.
              id: "m17-l01-p04-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              source: src(50),
              title: "تحدّي الأمر: السماح لـ VLAN 10 و 20 فقط على Trunk",
              description: "أنت في وضع الإعدادات العامة. اكتب الأمر المطلوب في كل سؤال كما في صندوق Switch CLI؛ المحاكي لا يكشف الإجابة. محاكاة تعليمية مبسّطة، ليست جهازًا حقيقيًا.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "التحدّي: Switch(config)# interface f0/24 ثم switchport mode trunk ثم switchport trunk allowed vlan 10,20." },
              config: {
                kind: "challenge",
                device: "switch",
                startMode: "global",
                intro: "أنت في وضع الإعدادات العامة Switch(config)#. حدّد أي VLAN مسموح لها أن تمرّ في كابل Trunk.",
                steps: [
                  { id: "c1", instruction: "اختر منفذ الوصلة F0/24", expect: { command: "interface", args: { interfaces: ["f0/24"] } }, hints: ["السطر ① في صندوق Switch CLI.", "interface ثم اسم المنفذ."] },
                  { id: "c2", instruction: "اجعله Trunk ليسمح بمرور عدة VLAN", expect: { command: "switchport-mode", args: { mode: "trunk" } }, hints: ["السطر ② في الصندوق.", "switchport mode ثم نوع المنفذ."] },
                  { id: "c3", instruction: "اسمح فقط لـ VLAN 10 و 20 بالمرور", expect: { command: "switchport-trunk-allowed-vlan", args: { vlans: [10, 20] } }, hints: ["السطر ③ في الصندوق: الكلمة allowed (لا native).", "switchport trunk allowed vlan ثم الرقمان مفصولان بفاصلة."] },
                ],
                allowed: ["switchport-mode", "switchport-trunk-allowed-vlan"],
                completion: "✓ صحيح — لا يمرّ في كابل Trunk إلا VLAN 10 و 20، وكل حزمة تحمل Tag برقم VLAN فيعرف السويتش في الطرف الآخر مصدرها.",
              },
            },
          ],
        },
        {
          id: "791381s-m17-l01-p05",
          title: "إعداد Untagged / Access (تذكير)",
          order: 5,
          source: src(50, 51),
          blocks: [
            { id: "m17-l01-p05-cli-h", type: "heading", origin: "book", level: 4, text: "Switch CLI", dir: "ltr" },
            {
              id: "m17-l01-p05-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: "① Switch(config)# interface f0/1\n② Switch(config-if)# switchport mode access\n③ Switch(config-if)# switchport access vlan 10",
            },
            {
              id: "m17-l01-p05-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m17-l01-p05-s1", text: [{ text: "منفذ لجهاز نهائي مثل حاسوب." }] },
                { id: "m17-l01-p05-s2", text: [{ text: "المنفذ ينتمي إلى VLAN واحدة." }] },
                { id: "m17-l01-p05-s3", text: [{ text: "الجهاز يرسل ويستقبل " }, { text: "بدون Tag", style: "strong" }, { text: "." }] },
              ],
            },
            {
              // ENRICHMENT: SVG — the page's own box (interface f0/1 → switchport mode access → switchport access vlan 10):
              // the device joins VLAN 10 and sends / receives without a Tag.
              id: "m17-l01-p05-v-access-port", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m03/access-port-assignment", motion: true,
              source: src(50),
              title: "رسم توضيحي: منفذ Access في VLAN 10",
              alt: "ثلاثة أسطر أوامر تظهر بالترتيب: interface f0/1 ثم switchport mode access ثم switchport access vlan 10؛ وبعد السطر الأخير يصبح الجهاز الموصول بالمنفذ f0/1 «عضو VLAN 10» داخل مجموعة VLAN 10.",
              caption: "منفذ Access لجهاز نهائي: ينتمي إلى VLAN واحدة، والجهاز يرسل ويستقبل بدون Tag.",
            },
            {
              id: "m17-l01-p05-table", type: "table", origin: "book",
              headers: ["النوع", "Access Port", "Trunk Port"],
              rows: [
                ["متصل بـ", "جهاز عادي (حاسوب، طابعة)", "سويتش آخر أو راوتر"],
                ["كم VLAN؟", "VLAN واحدة", "عدة VLAN"],
                ["Tag؟", "بدون Tag", "مع Tag (ما عدا Native)"],
                ["الأمر", "switchport mode access", "switchport mode trunk"],
              ],
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m17-l02",
      title: "تدريبات الوحدة",
      order: 2,
      pages: [
        {
          id: "791381s-m17-l02-p01",
          title: "تدريبات الوحدة: Native و Tagged و Untagged",
          order: 1,
          layout: "practice",
          source: src(48, 51),
          blocks: [
            {
              id: "m17-l02-p01-q01", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ما هو الـ Tag؟",
                options: [{ id: "a", text: "كلمة مرور نضعها على المنفذ." }, { id: "b", text: "علامة داخل الحزمة تخبر السويتش أن هذه الحزمة تابعة لـ VLAN رقم كذا.", correct: true }, { id: "c", text: "عنوان IP للسويتش." }, { id: "d", text: "اسم VLAN مثل MNG." }],
                feedback: { explanation: "الـ Tag = علامة داخل الحزمة تخبر السويتش: هذه الحزمة تابعة لـ VLAN رقم كذا — مثل ملصق اسم الصف على دفتر الطالب." },
              },
            },
            {
              id: "m17-l02-p01-q02", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "في كابل Trunk نلصق Tag على كل رسالة حتى لا تختلط رسائل VLAN المختلفة.", answer: true, feedback: { explanation: "في كابل Trunk تمرّ رسائل من عدة VLAN معًا. حتى لا تختلط، نلصق على كل رسالة «ملصقًا» عليه رقم VLAN." } },
            },
            {
              id: "m17-l02-p01-q03", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "matching", prompt: "صِل كل نوع بوصفه:",
                left: [{ id: "tagged", text: "Tagged · مع علامة" }, { id: "untagged", text: "Untagged · بدون علامة" }, { id: "native", text: "Native · الأصلية" }],
                right: [{ id: "r1", text: "VLAN تمرّ عبر Trunk بدون Tag، للتوافق مع أجهزة قديمة." }, { id: "r2", text: "الحزمة تحمل رقم VLAN، وتُستخدم عبر وصلات Trunk." }, { id: "r3", text: "الحزمة بدون Tag، وتظهر في منافذ Access للأجهزة العادية." }],
                pairs: { tagged: "r2", untagged: "r3", native: "r1" },
                feedback: { explanation: "Tagged: الحزمة تحمل رقم VLAN عبر Trunk (مثال: VLAN 10 و 20). Untagged: بدون Tag في منافذ Access (حاسوب، طابعة). Native: VLAN تمرّ عبر Trunk بدون Tag، للتوافق مع أجهزة قديمة." },
              },
            },
            {
              id: "m17-l02-p01-q04", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "classify", prompt: "صنّف كل حالة: هل تمرّ الحزمة مع Tag أم بدون Tag؟",
                groups: [{ id: "tag", text: "مع Tag" }, { id: "notag", text: "بدون Tag" }],
                items: [{ id: "i1", text: "حزمة VLAN 10 على وصلة Trunk" }, { id: "i2", text: "حاسوب على منفذ Access" }, { id: "i3", text: "Native VLAN على وصلة Trunk" }, { id: "i4", text: "حزمة VLAN 20 على وصلة Trunk" }, { id: "i5", text: "طابعة على منفذ Access" }],
                assign: { i1: "tag", i2: "notag", i3: "notag", i4: "tag", i5: "notag" },
                feedback: { explanation: "Trunk = وصلة بين أجهزة الشبكة (مع Tag)، ما عدا الـ Native التي تمرّ عبر Trunk بدون Tag. Access = لجهاز عادي (بدون Tag)." },
              },
            },
            {
              id: "m17-l02-p01-q05", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ما هي Native VLAN بشكل تلقائي؟",
                options: [{ id: "a", text: "VLAN 99" }, { id: "b", text: "VLAN 10" }, { id: "c", text: "VLAN 1", correct: true }, { id: "d", text: "VLAN 20" }],
                feedback: { explanation: "بشكل تلقائي تكون Native VLAN هي VLAN 1. لأسباب أمنية نغيّرها إلى رقم آخر لا نستعمله للأجهزة، مثل 99." },
              },
            },
            {
              id: "m17-l02-p01-q06", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "يُفضّل ترك Native VLAN على VLAN 1.", answer: false, feedback: { explanation: "الـ Native VLAN لا تحمل Tag على وصلة Trunk، لذلك يُفضّل عدم تركها على VLAN 1 لأسباب أمنية." } },
            },
            {
              id: "m17-l02-p01-q07", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "wordBank", prompt: "أكمل الأوامر التي تجعل VLAN 99 هي الـ Native على المنفذ F0/24:",
                segments: ["interface f0/24، ثم switchport mode ", { blank: "b1" }, "، ثم switchport trunk ", { blank: "b2" }, " vlan 99."],
                bank: ["trunk", "native", "access", "allowed"],
                answers: { b1: "trunk", b2: "native" },
                feedback: { explanation: "① interface f0/24 نختار المنفذ الذي يربط بين السويتشات ② switchport mode trunk نجعله Trunk ③ switchport trunk native vlan 99 نجعل VLAN 99 هي الـ Native بدل VLAN 1." },
              },
            },
            {
              id: "m17-l02-p01-q08", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ماذا يفعل الأمر switchport trunk allowed vlan 10,20؟",
                options: [{ id: "a", text: "ينشئ VLAN 10 و VLAN 20." }, { id: "b", text: "يجعل VLAN 10 هي الـ Native." }, { id: "c", text: "يسمح فقط لـ VLAN 10 و 20 بالمرور في كابل Trunk.", correct: true }, { id: "d", text: "يجعل المنفذ منفذ Access." }],
                feedback: { explanation: "allowed vlan 10,20: نسمح فقط لـ VLAN 10 و 20 بالمرور — نحدّد أي VLAN مسموح لها أن تمرّ في كابل Trunk، فلا يمرّ إلا ما نحتاجه." },
              },
            },
            {
              id: "m17-l02-p01-q09", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "منفذ يصل السويتش بسويتش آخر، ويجب أن تمرّ عبره عدة VLAN. أي أمر نكتب له؟",
                options: [{ id: "a", text: "switchport mode trunk", correct: true }, { id: "b", text: "switchport mode access" }, { id: "c", text: "switchport access vlan 10" }],
                feedback: { explanation: "Trunk Port متصل بسويتش آخر أو راوتر ويمرّر عدة VLAN، وأمره switchport mode trunk. أما Access Port فلجهاز عادي في VLAN واحدة، وأمره switchport mode access." },
              },
            },
            {
              id: "m17-l02-p01-q10", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "classify", prompt: "صنّف كل صفة حسب جدول المقارنة: Access Port أم Trunk Port؟",
                groups: [{ id: "access", text: "Access Port" }, { id: "trunk", text: "Trunk Port" }],
                items: [{ id: "i1", text: "متصل بجهاز عادي (حاسوب، طابعة)" }, { id: "i2", text: "عدة VLAN" }, { id: "i3", text: "بدون Tag" }, { id: "i4", text: "switchport mode trunk" }, { id: "i5", text: "VLAN واحدة" }, { id: "i6", text: "متصل بسويتش آخر أو راوتر" }, { id: "i7", text: "مع Tag (ما عدا Native)" }, { id: "i8", text: "switchport mode access" }],
                assign: { i1: "access", i2: "trunk", i3: "access", i4: "trunk", i5: "access", i6: "trunk", i7: "trunk", i8: "access" },
                feedback: { explanation: "Access Port: جهاز عادي (حاسوب، طابعة) · VLAN واحدة · بدون Tag · switchport mode access. Trunk Port: سويتش آخر أو راوتر · عدة VLAN · مع Tag (ما عدا Native) · switchport mode trunk." },
              },
            },
            {
              id: "m17-l02-p01-q11", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "الجهاز الموصول بمنفذ Access يرسل ويستقبل بدون Tag.", answer: true, feedback: { explanation: "منفذ Access لجهاز نهائي مثل حاسوب، ينتمي إلى VLAN واحدة، والجهاز يرسل ويستقبل بدون Tag." } },
            },
            {
              id: "m17-l02-p01-q12", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "لماذا يُفضّل عدم ترك Native VLAN على VLAN 1؟",
                options: [{ id: "a", text: "لأن الـ Native VLAN لا تحمل Tag على وصلة Trunk، فنغيّرها لأسباب أمنية.", correct: true }, { id: "b", text: "لأن الـ Native VLAN تحمل Tag مثل باقي VLAN." }, { id: "c", text: "لأن الرقم 1 خارج مجال أرقام VLAN." }],
                feedback: { explanation: "الـ Native VLAN لا تحمل Tag على وصلة Trunk، لذلك يُفضّل عدم تركها على VLAN 1 لأسباب أمنية، ونغيّرها إلى رقم آخر لا نستعمله للأجهزة، مثل 99." },
              },
            },
          ],
        },
      ],
    },
  ],
};

export default m17;
