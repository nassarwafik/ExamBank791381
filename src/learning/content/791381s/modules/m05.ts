// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 5 «أجهزة الشبكات».
//
// Verbatim conversion of booklet PDF pages 19–21 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every converted block is origin:"book": nothing is added, removed or reworded; bold runs are `strong`, monospace
// runs are `code`, printed box labels are the callout titles. The drawing above the Hub/Switch/Router cards is a crop of
// the booklet itself.
//
// Enrichment (docs/enterprise-791381s-enrichment-plan.md, Phases 2–4): teacher-enrichment blocks (visuals / activities reused from
// course 791381 after checking their labels against this section, and the end-of-unit «تدريبات الوحدة» lesson) are ADDED after the
// book blocks they explain. The book blocks above stay verbatim — pinned by the book lock (bookLock.test.ts).

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
              // ENRICHMENT — simulation / hub-switch-router-flow / v1: the three drawings above (Hub للجميع · Switch
              // للمقصود · Router بين الشبكات) brought to life. Every caption restates this page and the next two.
              id: "m05-l01-p01-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "hub-switch-router-flow", version: 1,
              title: "جرّب: كيف يرسل كل جهاز البيانات؟",
              description: "اختر Hub أو Switch أو Router ثم اضغط «أرسل البيانات» وراقب من تصله البيانات.",
              source: src(19),
              capabilities: { fullscreen: true, reset: true, replay: true, animated: true, interactive: true },
              fallback: { text: "Hub: يرسل البيانات إلى جميع الأجهزة؛ الجهاز الصحيح فقط يستعمل البيانات، والباقي يتجاهلها. Switch: يرسل البيانات للجهاز المقصود فقط. Router: يربط بين شبكات مختلفة وبالإنترنت." },
              config: {
                sender: "PC1", target: "PC3", others: ["PC2", "PC4"],
                hub: { label: "Hub", caption: "Hub لا يعرف من هو الجهاز المقصود، فيرسل البيانات للجميع؛ الجهاز الصحيح فقط يستعمل البيانات، والباقي يتجاهلها. لذلك يسبّب ازدحامًا وتداخلًا في الشبكة." },
                switch: { label: "Switch", caption: "Switch يرسل البيانات إلى الجهاز المقصود فقط، لأنه يحفظ عناوين MAC للأجهزة ليعرف أين كل جهاز. لذلك يقلّل الازدحام داخل الشبكة." },
                router: { label: "Router", networks: ["شبكة 1", "شبكة 2"], outside: "الإنترنت", caption: "Router يربط بين شبكات مختلفة: البيانات من PC1 في شبكة 1 تمرّ عبر الراوتر لتصل إلى PC3 في شبكة 2، والراوتر يربط الشبكات أيضًا بالإنترنت." },
                useLabel: "يستعملها", ignoreLabel: "يتجاهلها", notReachedLabel: "لا تصله", targetLabel: "المقصود",
              },
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
              id: "m05-l01-p02-v-unicast", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m09/switch-unicast", motion: true,
              source: src(20),
              title: "رسم توضيحي: السويتش يرسل لصاحب الرسالة فقط",
              alt: "رسم يبيّن جهاز Switch متصلًا بثلاثة حواسيب PC2 و PC3 و PC4، والبيانات تخرج إلى PC3 وحده (الجهاز المقصود) حسب عنوان MAC، ولا تصل إلى الحاسوبين الآخرين.",
              caption: "يرسل البيانات إلى الجهاز المقصود فقط، فيقلّ الازدحام داخل الشبكة.",
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
              id: "m05-l01-p03-v-router", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m09/router-networks", motion: true,
              source: src(21),
              title: "رسم توضيحي: الراوتر بين الشبكات",
              alt: "رسم يبيّن راوتر في الوسط متصلًا بشبكتين مختلفتين (شبكة 1 وشبكة 2) وبالإنترنت، والبيانات تخرج من شبكة 1 عبر الراوتر إلى الإنترنت.",
              caption: "يربط بين شبكات مختلفة، وكل ما يخرج من الشبكة أو يدخل إليها يمرّ من خلاله.",
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
    {
      // «تدريبات الوحدة» — ADDED enrichment: an end-of-unit exercise page after the booklet's own pages. Every question is
      // answered by the section's printed text above (the explanation quotes it). The book pages are unchanged (book lock).
      id: "791381s-m05-l02",
      title: "تدريبات الوحدة",
      order: 2,
      pages: [
        {
          id: "791381s-m05-l02-p01",
          title: "تدريبات الوحدة: أجهزة الشبكات",
          order: 1,
          layout: "practice",
          source: src(19, 21),
          blocks: [
            {
              id: "m05-l02-p01-q01", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "إلى من يرسل الـ Hub البيانات التي تصله؟",
                options: [{ id: "a", text: "للجهاز المقصود فقط" }, { id: "b", text: "إلى جميع الأجهزة", correct: true }, { id: "c", text: "إلى شبكة أخرى عبر الإنترنت فقط" }],
                feedback: { explanation: "Hub · المجمّع: يرسل البيانات إلى جميع الأجهزة، لأنه لا يعرف من هو الجهاز المقصود." },
              },
            },
            {
              id: "m05-l02-p01-q02", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "الـ Hub يحفظ عناوين الأجهزة ويعرف الجهاز المقصود، فيرسل البيانات إليه وحده.", answer: false, feedback: { explanation: "الـ Hub جهاز قديم وبسيط: لا يفكّر ولا يحفظ أي عنوان، بل ينسخ كل ما يصله ويرسله لكل المنافذ." } },
            },
            {
              id: "m05-l02-p01-q03", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "أرسل الـ Hub البيانات إلى كل الأجهزة. ماذا تفعل الأجهزة غير المقصودة؟",
                options: [{ id: "a", text: "تستعمل البيانات" }, { id: "b", text: "تعيد إرسالها إلى الـ Hub" }, { id: "c", text: "تتجاهل البيانات", correct: true }],
                feedback: { explanation: "الجهاز الصحيح فقط يستعمل البيانات، والباقي يتجاهلها." },
              },
            },
            {
              id: "m05-l02-p01-q04", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ماذا يحفظ السويتش ليعرف أين كل جهاز؟",
                options: [{ id: "a", text: "عناوين IP" }, { id: "b", text: "أسماء المستخدمين" }, { id: "c", text: "كلمات المرور" }, { id: "d", text: "عناوين MAC", correct: true }],
                feedback: { explanation: "السويتش يحفظ عناوين MAC للأجهزة ليعرف أين كل جهاز، ثم يرسل كل رسالة إلى صاحبها فقط." },
              },
            },
            {
              id: "m05-l02-p01-q05", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "Switch هو البديل الأفضل والأكثر استخدامًا في الشبكات الحديثة بدل Hub.", answer: true, feedback: { explanation: "الخلاصة: Switch هو البديل الأفضل والأكثر استخدامًا في الشبكات الحديثة بدل Hub." } },
            },
            {
              id: "m05-l02-p01-q06", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "أيّ خاصية من خصائص الراوتر توزّع عناوين IP على الأجهزة تلقائيًا؟",
                options: [{ id: "a", text: "توجيه" }, { id: "b", text: "NAT" }, { id: "c", text: "DHCP", correct: true }, { id: "d", text: "أمان" }],
                feedback: { explanation: "DHCP: يوزّع عناوين IP على الأجهزة تلقائيًا." },
              },
            },
            {
              id: "m05-l02-p01-q07", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "الراوتر يتعامل مع عناوين MAC وليس مع عناوين IP.", answer: false, feedback: { explanation: "الراوتر يعمل غالبًا في طبقة الشبكة، ويتعامل مع عناوين IP (وليس MAC)." } },
            },
            {
              id: "m05-l02-p01-q08", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "جهاز في البيت هو «باب الشبكة إلى الإنترنت»: كل البيانات الخارجة من البيت تمرّ منه. ما هو؟",
                options: [{ id: "a", text: "Router", correct: true }, { id: "b", text: "Hub" }, { id: "c", text: "Switch" }],
                feedback: { explanation: "راوتر البيت هو باب الشبكة إلى الإنترنت: كل البيانات الخارجة من البيت تمرّ منه." },
              },
            },
            {
              id: "m05-l02-p01-q09", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "matching", prompt: "احفظ الفرق بكلمة واحدة: صِل كل جهاز بكلمته.",
                left: [{ id: "hub", text: "Hub" }, { id: "switch", text: "Switch" }, { id: "router", text: "Router" }],
                right: [{ id: "r1", text: "للخارج" }, { id: "r2", text: "للجميع" }, { id: "r3", text: "للمقصود" }],
                pairs: { hub: "r2", switch: "r3", router: "r1" },
                feedback: { explanation: "احفظ الفرق بكلمة واحدة: Hub ‏←‏ للجميع · Switch ‏←‏ للمقصود · Router ‏←‏ للخارج." },
              },
            },
            {
              id: "m05-l02-p01-q10", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "matching", prompt: "صِل كل خاصية من خصائص الراوتر بمعناها:",
                left: [{ id: "route", text: "توجيه" }, { id: "link", text: "ربط" }, { id: "nat", text: "NAT" }, { id: "dhcp", text: "DHCP" }, { id: "sec", text: "أمان" }],
                right: [
                  { id: "r1", text: "يوزّع عناوين IP على الأجهزة تلقائيًا." },
                  { id: "r2", text: "يساعد في التحكم بمرور البيانات." },
                  { id: "r3", text: "يختار الطريق (المسار) الأفضل لوصول البيانات." },
                  { id: "r4", text: "يسمح لكل أجهزة البيت بمشاركة عنوان عام واحد." },
                  { id: "r5", text: "يربط بين شبكات مختلفة." },
                ],
                pairs: { route: "r3", link: "r5", nat: "r4", dhcp: "r1", sec: "r2" },
                feedback: { explanation: "توجيه: يختار الطريق الأفضل. ربط: يربط بين شبكات مختلفة. NAT: مشاركة عنوان عام واحد. DHCP: يوزّع عناوين IP تلقائيًا. أمان: يساعد في التحكم بمرور البيانات." },
              },
            },
            {
              id: "m05-l02-p01-q11", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "wordBank", prompt: "لماذا استُبدل Hub بـ Switch؟ أكمل الفراغات من مخزن الكلمات:",
                segments: ["الـ Hub يرسل البيانات ", { blank: "b1" }, "، أما الـ Switch فيرسلها ", { blank: "b2" }, ". لذلك في الـ Hub ازدحام ", { blank: "b3" }, "، والـ Switch أداؤه ", { blank: "b4" }, "."],
                bank: ["للجميع", "للجهاز المقصود", "أكثر", "أفضل", "أضعف", "بين الشبكات"],
                answers: { b1: "للجميع", b2: "للجهاز المقصود", b3: "أكثر", b4: "أفضل" },
                feedback: { explanation: "طريقة الإرسال: Hub يرسل البيانات للجميع، وSwitch يرسلها للجهاز المقصود. الازدحام: Hub ازدحام أكثر. الأداء: Switch أداء أفضل." },
              },
            },
            {
              id: "m05-l02-p01-q12", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "classify", prompt: "صنّف كل عبارة حسب الجهاز الذي تصفه:",
                groups: [{ id: "hub", text: "Hub" }, { id: "switch", text: "Switch" }, { id: "router", text: "Router" }],
                items: [
                  { id: "i1", text: "ينسخ كل ما يصله ويرسله لكل المنافذ" },
                  { id: "i2", text: "يحفظ عناوين MAC للأجهزة" },
                  { id: "i3", text: "يربط شبكة البيت أو المدرسة بالإنترنت" },
                  { id: "i4", text: "يسبّب ازدحامًا وتداخلًا في الشبكة" },
                  { id: "i5", text: "يختار الطريق (المسار) الأفضل لوصول البيانات" },
                  { id: "i6", text: "كل منفذ فيه طريق خاص لجهاز معيّن" },
                ],
                assign: { i1: "hub", i2: "switch", i3: "router", i4: "hub", i5: "router", i6: "switch" },
                feedback: { explanation: "Hub: ينسخ كل ما يصله ويرسله لكل المنافذ، ويسبّب ازدحامًا وتداخلًا. Switch: يحفظ عناوين MAC، وكل منفذ فيه طريق خاص لجهاز معيّن. Router: يربط شبكة البيت أو المدرسة بالإنترنت، ويختار الطريق الأفضل لوصول البيانات." },
              },
            },
            { id: "m05-l02-p01-lib-t06", type: "library-training", origin: "teacher-enrichment", trainingId: "T06", label: "تدريب 6", requiredModuleId: "791381s-m05" },
          ],
        },
      ],
    },
  ],
};

export default m05;
