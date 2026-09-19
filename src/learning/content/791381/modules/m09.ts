// Learning Materials — Units 4–6 phase: REAL converted body for Book 791381, module m09 (the book's Unit 5
// «أجهزة الشبكات», source PDF 48–56, complete). Stable id m09 (next free), order 5 (batch b2).
//
// PDF 47 is the book's batch-2 DIVIDER («الدفعة الثانية · أجهزة الشبكات والرسائل …») — a structural page with no
// learner concept. It is NOT a learner page: it is represented structurally as the start of this module's coarse
// source range (`source.pdfPageStart: 47`, `sourceNote`), while the first learner page is the Unit-5 opener (PDF 48).
//
// Book-derived blocks are origin:"book" and reproduce the RENDERED source (cards, bullets, comparison table,
// callouts). Device names (Hub / Switch / Router / MAC / IP / DHCP / NAT / LAN) are LTR tokens. Pedagogy blocks
// (worked scenario, matching practice, inline practices with «what to check» feedback, the device simulation) are
// origin:"teacher-enrichment". Printed page = the rendered page circle (PDF 49 → «49» … PDF 56 → «56»).

import type { ContentModule, ContentSource, InlineSpan, PracticeOption, PracticeTableSelectCell } from "../../types";

const CID = "791381";
const src = (pdf: number, printed?: number): ContentSource => ({ kind: "book", sourceId: CID, pdfPageStart: pdf, printedPage: printed });
const L = (text: string): InlineSpan => ({ text, dir: "ltr", style: "code" });
const T = (text: string): InlineSpan => ({ text });
const opt = (id: string, text: string, correct?: true): PracticeOption => (correct ? { id, text, correct } : { id, text });
const FEATURES = ["دقة", "أداء", "توسيع", "إدارة", "أمان"] as const;
const FEATURE = (key: (typeof FEATURES)[number]): PracticeTableSelectCell => ({ kind: "select", options: [...FEATURES], key });

const m09: ContentModule = {
  id: "791381-m09",
  title: "أجهزة الشبكات",
  shortTitle: "أجهزة الشبكات",
  order: 5,
  source: { kind: "book", sourceId: CID, pdfPageStart: 47, pdfPageEnd: 56, sourceNote: "PDF 47 هو فاصل الدفعة الثانية (بلا محتوى تعليمي)؛ أول صفحة تعليمية هي افتتاحية الوحدة PDF 48." },
  lessons: [
    // ── l00 — unit opener (PDF 48) ───────────────────────────────────────────────────────────────────────────
    {
      id: "791381-m09-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381-m09-l00-p01",
          title: "أجهزة الشبكات",
          order: 1,
          layout: "opener",
          source: src(48),
          blocks: [
            {
              id: "m09-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الوحدة الخامسة", unitNumber: "05", title: "أجهزة الشبكات",
              subtitle: "ما وظيفة Hub و Switch و Router؟ وكيف نميّز بينها؟",
              goal: "الهدف: فكرة أساسية + مثال واضح + تدريب",
            },
          ],
        },
      ],
    },

    // ── l01 — the three devices, Hub, why Switch replaced Hub, Switch, Switch features (PDF 49–53) ───────────
    {
      id: "791381-m09-l01",
      title: "Hub و Switch",
      order: 1,
      pages: [
        // PDF 49 — الأجهزة المستعملة في الشبكات (+ the unit's device simulation)
        {
          id: "791381-m09-l01-p01",
          title: "الأجهزة المستعملة في الشبكات",
          order: 1,
          source: src(49, 49),
          keywords: ["Hub", "Switch", "Router", "أجهزة الشبكات"],
          blocks: [
            {
              id: "m09-l01-p01-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m09-l01-p01-hub", term: "Hub", text: [T("يرسل البيانات إلى جميع الأجهزة.")], note: "تصل للجميع" },
                { id: "m09-l01-p01-switch", term: "Switch", text: [T("يرسل البيانات للجهاز المقصود فقط.")], note: "تصل للمقصود فقط" },
                { id: "m09-l01-p01-router", term: "Router", text: [T("يربط بين شبكات مختلفة والإنترنت.")], note: "شبكة 1 · شبكة 2 · الإنترنت" },
              ],
            },
            {
              id: "m09-l01-p01-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("كل جهاز له وظيفة مختلفة داخل الشبكة، والفرق بينها هو في طريقة إرسال البيانات.")],
            },
            {
              // ENRICHMENT — simulation / hub-switch-router-flow / v1: the page's three figures brought to life.
              id: "m09-l01-p01-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "hub-switch-router-flow", version: 1,
              title: "جرّب: كيف يرسل كل جهاز البيانات؟",
              description: "اختر Hub أو Switch أو Router ثم اضغط «أرسل البيانات» وراقب من تصله البيانات.",
              source: src(49, 49),
              capabilities: { fullscreen: true, reset: true, replay: true, animated: true, interactive: true },
              fallback: { text: "Hub: يرسل البيانات إلى جميع الأجهزة المتصلة به، والجهاز المقصود وحده يستعملها. Switch: يرسل البيانات إلى الجهاز المقصود فقط، ولا تصل الأجهزة الأخرى. Router: يربط بين شبكتين مختلفتين وبالإنترنت، فتنتقل البيانات من شبكة 1 إلى شبكة 2 عبره." },
              config: {
                sender: "PC1", target: "PC3", others: ["PC2", "PC4"],
                hub: { label: "Hub", caption: "Hub لا يعرف الجهاز المقصود، فيرسل البيانات للجميع؛ الجهاز الصحيح فقط يستعملها والباقي يتجاهلها. لذلك يزداد الازدحام." },
                switch: { label: "Switch", caption: "Switch يعرف الجهاز المقصود، فيرسل البيانات إليه فقط ولا تصل الأجهزة الأخرى. لذلك يقلّ الازدحام." },
                router: { label: "Router", networks: ["شبكة 1", "شبكة 2"], outside: "الإنترنت", caption: "Router يربط بين شبكات مختلفة: البيانات من PC1 في شبكة 1 تمرّ عبر الراوتر لتصل إلى PC3 في شبكة 2، ومنه أيضًا تخرج الشبكتان إلى الإنترنت." },
                useLabel: "يستعملها", ignoreLabel: "يتجاهلها", notReachedLabel: "لا تصله", targetLabel: "المقصود",
              },
            },
            {
              id: "m09-l01-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "جهاز يرسل البيانات إلى كل الأجهزة المتصلة به، ولا يعرف من المقصود. ما هو؟",
                options: [opt("m09-l01-p01-q1-a", "Hub", true), opt("m09-l01-p01-q1-b", "Switch"), opt("m09-l01-p01-q1-c", "Router")],
                feedback: {
                  hints: ["أي بطاقة في الصفحة تقول «يرسل البيانات إلى جميع الأجهزة»؟", "الجهاز الذي «تصل للجميع» بياناته."],
                  correctFeedback: "أحسنت — Hub يرسل للجميع.",
                  incorrectFeedback: "افحص طريقة الإرسال في البطاقات: أيها يرسل «إلى جميع الأجهزة» لا «للمقصود فقط» ولا «بين شبكات»؟",
                  explanation: "Hub للجميع · Switch للمقصود فقط · Router بين الشبكات والإنترنت.",
                },
              },
            },
          ],
        },
        // PDF 50 — جهاز Hub
        {
          id: "791381-m09-l01-p02",
          title: "جهاز Hub",
          order: 2,
          source: src(50, 50),
          keywords: ["Hub", "ازدحام", "للجميع"],
          blocks: [
            { id: "m09-l01-p02-def", type: "text", origin: "book", spans: [L("Hub"), T(" جهاز بسيط يربط عدة أجهزة في شبكة محلية.")] },
            {
              id: "m09-l01-p02-points", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m09-l01-p02-pt1", text: [T("عندما تصله بيانات، يرسلها للجميع.")] },
                { id: "m09-l01-p02-pt2", text: [T("لا يعرف من هو الجهاز المقصود.")] },
                { id: "m09-l01-p02-pt3", text: [T("الجهاز الصحيح فقط يستعمل البيانات.")] },
                { id: "m09-l01-p02-pt4", text: [T("قد يسبب ازدحامًا وتداخلًا في الشبكة.")] },
              ],
            },
            {
              id: "m09-l01-p02-figure", type: "callout", origin: "book", kind: "remember",
              spans: [T("يصل إلى الجميع — والصحيح فقط يستعملها. (المرسل ← "), L("Hub"), T(" ← جهاز يستعملها، وجهازان يتجاهلانها.)")],
            },
            {
              id: "m09-l01-p02-analogy", type: "callout", origin: "book", kind: "tip", title: "تشبيه",
              spans: [T("كمن يصرخ بالمعلومة في الصف ليسمعها الجميع، دون أن يخصّ أحدًا.")],
            },
            {
              id: "m09-l01-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "Hub يعرف الجهاز المقصود ويرسل البيانات إليه وحده.",
                answer: false,
                feedback: {
                  correctFeedback: "صحيح أنها خطأ — Hub لا يعرف المقصود ويرسل للجميع.",
                  incorrectFeedback: "افحص النقطة الثانية في الصفحة: «لا يعرف من هو الجهاز المقصود»، فكيف يرسل إليه وحده؟",
                  hints: ["اقرأ النقاط الأربع في الصفحة.", "الإرسال إلى الجميع هو صفة Hub."],
                },
              },
            },
          ],
        },
        // PDF 51 — لماذا استُبدل Hub بـ Switch؟
        {
          id: "791381-m09-l01-p03",
          title: "لماذا استُبدل Hub بـ Switch؟",
          order: 3,
          source: src(51, 51),
          keywords: ["Hub", "Switch", "مقارنة", "ازدحام"],
          blocks: [
            {
              id: "m09-l01-p03-table", type: "table", origin: "book",
              headers: ["وجه المقارنة", "Hub", "Switch"],
              columnDirs: ["rtl", "rtl", "rtl"],
              rows: [
                ["طريقة الإرسال", "يرسل البيانات للجميع", "يرسلها للجهاز المقصود"],
                ["الازدحام", "ازدحام أكثر في الشبكة", "ازدحام أقل"],
                ["الذكاء", "أقل ذكاءً", "أكثر ذكاءً"],
                ["الأداء", "أداء أضعف", "أداء أفضل"],
              ],
            },
            {
              id: "m09-l01-p03-summary", type: "callout", origin: "book", kind: "summary", title: "الخلاصة",
              spans: [L("Switch"), T(" هو البديل الأفضل والأكثر استخدامًا في الشبكات الحديثة بدل "), L("Hub"), T(".")],
            },
            {
              id: "m09-l01-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "لماذا يقلّ الازدحام في الشبكة عند استعمال Switch بدل Hub؟",
                options: [
                  opt("m09-l01-p03-q1-a", "لأنه يرسل البيانات إلى الجهاز المقصود فقط", true),
                  opt("m09-l01-p03-q1-b", "لأنه يرسل البيانات إلى كل الأجهزة"),
                  opt("m09-l01-p03-q1-c", "لأنه يربط الشبكة بالإنترنت"),
                ],
                feedback: {
                  hints: ["انظر إلى صف «طريقة الإرسال» في الجدول.", "الإرسال للجميع يزيد الازدحام؛ الإرسال للمقصود يقلّله."],
                  correctFeedback: "أحسنت — إرسال البيانات للمقصود فقط يقلّل الازدحام.",
                  incorrectFeedback: "افحص صف «طريقة الإرسال» وصف «الازدحام» في الجدول معًا: أي طريقة إرسال تعطي ازدحامًا أقل؟",
                  explanation: "Switch يرسل للجهاز المقصود فقط، فلا تتزاحم البيانات على كل الأجهزة.",
                },
              },
            },
          ],
        },
        // PDF 52 — جهاز Switch
        {
          id: "791381-m09-l01-p04",
          title: "جهاز Switch",
          order: 4,
          source: src(52, 52),
          keywords: ["Switch", "LAN", "MAC", "المقصود"],
          blocks: [
            { id: "m09-l01-p04-def", type: "text", origin: "book", spans: [L("Switch"), T(" يربط أجهزة الشبكة المحلية "), L("LAN"), T(" بكفاءة عالية.")] },
            {
              id: "m09-l01-p04-points", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m09-l01-p04-pt1", text: [T("يرسل البيانات إلى الجهاز المقصود فقط.")] },
                { id: "m09-l01-p04-pt2", text: [T("يحفظ عناوين "), L("MAC"), T(" للأجهزة.")] },
                { id: "m09-l01-p04-pt3", text: [T("يقلل الازدحام داخل الشبكة.")] },
                { id: "m09-l01-p04-pt4", text: [T("يزيد سرعة وأمان الاتصال.")] },
              ],
            },
            {
              id: "m09-l01-p04-figure", type: "callout", origin: "book", kind: "remember",
              spans: [T("ترسل إلى الجهاز المقصود فقط. (المرسل ← "), L("Switch"), T(" ← المقصود؛ الجهازان الآخران لا تصلهما.)")],
            },
            {
              id: "m09-l01-p04-fit", type: "callout", origin: "book", kind: "tip", title: "مناسب لـ",
              spans: [T("غرفة حواسيب، مكتب، مدرسة أو شركة تحتاج اتصالًا سريعًا ومنظّمًا.")],
            },
            {
              id: "m09-l01-p04-ex1", type: "example", origin: "teacher-enrichment", mode: "solved",
              title: "مثال محلول: PC1 يرسل ملفًا إلى PC3 عبر Switch",
              prompt: "لماذا لا تصل البيانات إلى PC2 و PC4؟",
              steps: [
                { text: "Switch يحفظ عنوان MAC لكل جهاز متصل به (النقطة الثانية في الصفحة)." },
                { text: "عندما تصله بيانات موجّهة إلى PC3، يعرف من هو المقصود." },
                { text: "يرسل البيانات على المنفذ الموصول بـ PC3 فقط." },
              ],
              result: "PC1 → Switch → PC3",
              explanation: "PC2 و PC4 لا تصلهما البيانات أصلًا؛ هذا سبب قلّة الازدحام وزيادة الأمان.",
            },
          ],
        },
        // PDF 53 — مميزات Switch
        {
          id: "791381-m09-l01-p05",
          title: "مميزات Switch",
          order: 5,
          source: src(53, 53),
          keywords: ["Switch", "مميزات", "منفذ"],
          blocks: [
            {
              id: "m09-l01-p05-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m09-l01-p05-f1", term: "دقة", text: [T("يوجّه البيانات للجهاز الصحيح.")] },
                { id: "m09-l01-p05-f2", term: "أداء", text: [T("يقلل التداخل والازدحام.")] },
                { id: "m09-l01-p05-f3", term: "توسيع", text: [T("يمكن إضافة أجهزة أكثر بسهولة.")] },
                { id: "m09-l01-p05-f4", term: "إدارة", text: [T("بعض الأنواع تسمح بإعدادات متقدمة.")] },
                { id: "m09-l01-p05-f5", term: "أمان", text: [T("يساعد على عزل وتنظيم الشبكة.")] },
              ],
            },
            {
              id: "m09-l01-p05-idea", type: "callout", origin: "book", kind: "important", title: "فكرة مهمة",
              spans: [T("كل منفذ في "), L("Switch"), T(" يمكن اعتباره طريقًا خاصًا لجهاز معيّن، فلا تتزاحم البيانات.")],
            },
            {
              id: "m09-l01-p05-match", type: "practice-table", origin: "teacher-enrichment",
              caption: "تحقّق من نفسك: أي ميزة تصفها كل جملة؟",
              headers: ["الجملة", "الميزة"],
              columnDirs: ["rtl", "rtl"],
              rows: [
                ["يمكن إضافة أجهزة أكثر بسهولة.", FEATURE("توسيع")],
                ["يساعد على عزل وتنظيم الشبكة.", FEATURE("أمان")],
                ["يوجّه البيانات للجهاز الصحيح.", FEATURE("دقة")],
                ["يقلل التداخل والازدحام.", FEATURE("أداء")],
              ],
            },
          ],
        },
      ],
    },

    // ── l02 — Router (PDF 54–55) ─────────────────────────────────────────────────────────────────────────────
    {
      id: "791381-m09-l02",
      title: "Router",
      order: 2,
      pages: [
        // PDF 54 — جهاز Router
        {
          id: "791381-m09-l02-p01",
          title: "جهاز Router",
          order: 1,
          source: src(54, 54),
          keywords: ["Router", "الإنترنت", "DHCP", "شبكات مختلفة"],
          blocks: [
            { id: "m09-l02-p01-def", type: "text", origin: "book", spans: [L("Router"), T(" يربط بين شبكات مختلفة.")] },
            {
              id: "m09-l02-p01-points", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m09-l02-p01-pt1", text: [T("يربط شبكة البيت أو المدرسة بالإنترنت.")] },
                { id: "m09-l02-p01-pt2", text: [T("يختار الطريق المناسب للبيانات.")] },
                { id: "m09-l02-p01-pt3", text: [T("يساعد في تنظيم حركة البيانات.")] },
                { id: "m09-l02-p01-pt4", text: [T("قد يوزّع عناوين "), L("IP"), T(" باستخدام "), L("DHCP"), T(".")] },
              ],
            },
            {
              id: "m09-l02-p01-figure", type: "callout", origin: "book", kind: "remember",
              spans: [T("يربط شبكتين مختلفتين بالإنترنت. (الإنترنت ← "), L("Router"), T(" ← "), L("Switch"), T(" شبكة 1 و "), L("Switch"), T(" شبكة 2.)")],
            },
            {
              id: "m09-l02-p01-example", type: "callout", origin: "book", kind: "tip", title: "مثال",
              spans: [T("راوتر البيت هو باب الشبكة إلى الإنترنت، تمرّ منه كل البيانات الخارجة.")],
            },
            {
              id: "m09-l02-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي جهاز نحتاجه لربط شبكة المدرسة بالإنترنت؟",
                options: [opt("m09-l02-p01-q1-a", "Hub"), opt("m09-l02-p01-q1-b", "Switch"), opt("m09-l02-p01-q1-c", "Router", true)],
                feedback: {
                  hints: ["أي جهاز «يربط بين شبكات مختلفة»؟", "الإنترنت شبكة أخرى خارج المدرسة."],
                  correctFeedback: "أحسنت — Router يربط شبكة المدرسة بالإنترنت.",
                  incorrectFeedback: "افحص وظيفة كل جهاز: Hub و Switch يعملان داخل الشبكة المحلية، أما الربط مع شبكة أخرى أو الإنترنت فهو عمل جهاز آخر.",
                  explanation: "Router يربط بين شبكات مختلفة، ومنها شبكة المدرسة والإنترنت.",
                },
              },
            },
          ],
        },
        // PDF 55 — أهم خصائص Router
        {
          id: "791381-m09-l02-p02",
          title: "أهم خصائص Router",
          order: 2,
          source: src(55, 55),
          keywords: ["Router", "NAT", "DHCP", "توجيه", "طبقة الشبكة"],
          blocks: [
            {
              id: "m09-l02-p02-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m09-l02-p02-c1", term: "توجيه", text: [T("يختار المسار الأفضل لوصول البيانات.")] },
                { id: "m09-l02-p02-c2", term: "ربط", text: [T("يربط بين شبكات مختلفة.")] },
                { id: "m09-l02-p02-c3", term: "NAT", text: [T("يسمح بمشاركة عنوان عام واحد.")] },
                { id: "m09-l02-p02-c4", term: "DHCP", text: [T("يوزّع عناوين "), L("IP"), T(" تلقائيًا.")] },
                { id: "m09-l02-p02-c5", term: "أمان", text: [T("يساعد في التحكم بمرور البيانات.")] },
              ],
            },
            {
              id: "m09-l02-p02-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("الراوتر يعمل غالبًا في طبقة الشبكة، ويتعامل مع عناوين "), L("IP"), T(" لا مع عناوين "), L("MAC"), T(".")],
            },
            {
              id: "m09-l02-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "الراوتر يتعامل مع عناوين MAC لا مع عناوين IP.",
                answer: false,
                feedback: {
                  correctFeedback: "صحيح أنها خطأ — الراوتر يتعامل مع عناوين IP (أما MAC فهي شأن Switch).",
                  incorrectFeedback: "افحص جملة «تذكّر» في الصفحة: مع أي نوع من العناوين يتعامل الراوتر؟",
                  hints: ["الراوتر يعمل في طبقة الشبكة.", "Switch هو الذي يحفظ عناوين MAC (الصفحة السابقة)."],
                },
              },
            },
          ],
        },
      ],
    },

    // ── l03 — خلاصة الأجهزة (PDF 56) ─────────────────────────────────────────────────────────────────────────
    {
      id: "791381-m09-l03",
      title: "خلاصة الأجهزة",
      order: 3,
      pages: [
        {
          id: "791381-m09-l03-p01",
          title: "خلاصة الأجهزة",
          order: 1,
          source: src(56, 56),
          keywords: ["خلاصة", "Hub", "Switch", "Router"],
          blocks: [
            {
              id: "m09-l03-p01-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m09-l03-p01-hub", term: "Hub", text: [T("يرسل للجميع")] },
                { id: "m09-l03-p01-switch", term: "Switch", text: [T("يرسل للمقصود فقط")] },
                { id: "m09-l03-p01-router", term: "Router", text: [T("يربط الشبكات والإنترنت")] },
              ],
            },
            {
              id: "m09-l03-p01-oneword", type: "callout", origin: "book", kind: "important", title: "احفظ الفرق من كلمة واحدة",
              spans: [L("Hub"), T(" للجميع · "), L("Switch"), T(" للمقصود · "), L("Router"), T(" للخارج")],
            },
            {
              id: "m09-l03-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "سؤال ختامي 1: أرسل PC1 ملفًا إلى PC2، فوصلت نسخة من البيانات إلى كل الأجهزة في الغرفة. أي جهاز يربط هذه الأجهزة؟",
                options: [opt("m09-l03-p01-q1-a", "Hub", true), opt("m09-l03-p01-q1-b", "Switch"), opt("m09-l03-p01-q1-c", "Router")],
                feedback: {
                  hints: ["«وصلت إلى كل الأجهزة» = للجميع.", "Hub للجميع."],
                  correctFeedback: "أحسنت — الإرسال للجميع هو سلوك Hub.",
                  incorrectFeedback: "افحص الكلمة المفتاحية في السؤال: البيانات وصلت «إلى كل الأجهزة». أي جهاز في الخلاصة «للجميع»؟",
                  explanation: "Hub يرسل للجميع؛ Switch كان سيرسل إلى PC2 فقط.",
                },
              },
            },
            {
              id: "m09-l03-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "سؤال ختامي 2: جهاز يحفظ عناوين MAC ويرسل البيانات إلى الجهاز المقصود فقط. ما هو؟",
                options: [opt("m09-l03-p01-q2-a", "Hub"), opt("m09-l03-p01-q2-b", "Switch", true), opt("m09-l03-p01-q2-c", "Router")],
                feedback: {
                  hints: ["من يحفظ عناوين MAC؟", "Switch للمقصود."],
                  correctFeedback: "أحسنت — Switch يحفظ MAC ويرسل للمقصود فقط.",
                  incorrectFeedback: "افحص صفتين معًا: «يحفظ عناوين MAC» و«للمقصود فقط»؛ الراوتر يتعامل مع IP، و Hub لا يعرف المقصود.",
                  explanation: "Switch للمقصود فقط، ويحفظ عناوين MAC للأجهزة.",
                },
              },
            },
            {
              id: "m09-l03-p01-q3", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "سؤال ختامي 3: أي جهاز يختار الطريق المناسب للبيانات ويربط شبكة البيت بالإنترنت؟",
                options: [opt("m09-l03-p01-q3-a", "Hub"), opt("m09-l03-p01-q3-b", "Switch"), opt("m09-l03-p01-q3-c", "Router", true)],
                feedback: {
                  hints: ["الخروج إلى الإنترنت = «للخارج».", "Router للخارج."],
                  correctFeedback: "أحسنت — Router يربط الشبكة بالإنترنت ويختار الطريق.",
                  incorrectFeedback: "افحص الكلمة «الإنترنت» في السؤال: الربط مع الخارج عمل الراوتر، أما Hub و Switch فداخل الشبكة المحلية.",
                  explanation: "Router للخارج: يربط الشبكات والإنترنت ويختار المسار.",
                },
              },
            },
          ],
        },
      ],
    },
  ],
};

export default m09;
