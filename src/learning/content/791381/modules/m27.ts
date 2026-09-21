// Learning Materials — Batch 10 phase: REAL converted body for Book 791381, module m27 (the book's section
// «بروتوكولات التوجيه», source PDF 210–222 — thirteen pages under the running header «بروتوكولات التوجيه», no
// section cover). NEW stable id m27, reading `order` 26: after m26 («الشبكة الواسعة WAN», order 25) and before
// m06 («قوائم التحكم ACL», order 27, completed in place in this batch).
// Book-derived blocks are origin:"book": the PDF 210 three protocol cards + «التوجيه», the PDF 211 Static Route
// pros / cons + «متى نستعمله؟», the PDF 212 Distance Vector / Link-State cards + «للطالب», the PDF 213 METRIC
// cards + the AD values, the PDF 214 / 218 protocol facts + «تذكّر», the PDF 215 / 219 example set-ups (the
// topology of the book's figure as a table) + «الفكرة», the four «Cisco CLI» boxes (PDF 216, 217, 220, 221 — as
// `code` blocks with the book's exact lines and its generic `Device(config)#` prompt + the annotation tables;
// the visible wildcard of the shared /30 link on PDF 216 / 217 is 0.0.0.3) + «تذكّر» / «انتبه», and the PDF 222
// `show ip route` sample output + its four explanations.
// INTERACTIVE CLI: PDF 216 guided (R1 OSPF), PDF 217 challenge (R2 OSPF), PDF 220 guided (R1 EIGRP), PDF 221
// task (R2 EIGRP, final state), PDF 222 show challenge. The simulator's `show ip route` prints only the connected
// routes of ONE device (there are no neighbours), so the book's R / O lines are quoted as book output, not
// simulated. SOURCE LEVEL: no RIP configuration, no static-route command, no router-id / passive-interface /
// metrics tuning — the book prints none of them. SOURCE ORDER: nothing from PDF 223+ (ACL) appears here.
// PRINTED PAGE = page circle = PDF index (210 … 222).

import type { ContentModule, ContentSource, InlineSpan, PracticeOption, PracticeTableSelectCell } from "../../types";
import type { CliExerciseConfig } from "../../../cli/types";

const CID = "791381";
const src = (pdf: number, printed?: number): ContentSource => ({ kind: "book", sourceId: CID, pdfPageStart: pdf, printedPage: printed });
const L = (text: string): InlineSpan => ({ text, dir: "ltr", style: "code" });
const T = (text: string): InlineSpan => ({ text });
const opt = (id: string, text: string, correct?: true): PracticeOption => (correct ? { id, text, correct } : { id, text });
const EX = (exercise: CliExerciseConfig): Record<string, unknown> => ({ ...exercise });
const ADS = ["0", "1", "90", "110", "120"] as const;
const AD = (key: (typeof ADS)[number]): PracticeTableSelectCell => ({ kind: "select", options: [...ADS], key });

const NET1 = "192.168.1.0", NET2 = "192.168.2.0", LINK = "10.0.0.0", WC24 = "0.0.0.255", WC30 = "0.0.0.3";

const m27: ContentModule = {
  id: "791381-m27",
  title: "بروتوكولات التوجيه",
  shortTitle: "التوجيه",
  order: 26,
  source: { kind: "book", sourceId: CID, pdfPageStart: 210, pdfPageEnd: 222, sourceNote: "ثلاث عشرة صفحة تحت العنوان الجاري «بروتوكولات التوجيه» (PDF 210–222) بلا صفحة عنوان خاصة. PDF 209 آخر صفحة في وحدة الشبكة الواسعة WAN (m26)، و PDF 223 تبدأ وحدة «قوائم التحكم ACL» (m06)." },
  lessons: [
    // ── l01 — أساسيات التوجيه (PDF 210–213) ───────────────────────────────────────────────────────────────────
    {
      id: "791381-m27-l01",
      title: "أساسيات التوجيه",
      order: 1,
      pages: [
        // PDF 210 — بروتوكولات التوجيه
        {
          id: "791381-m27-l01-p01",
          title: "بروتوكولات التوجيه",
          order: 1,
          source: src(210, 210),
          keywords: ["Static Route", "OSPF", "EIGRP", "التوجيه", "Link-State", "Bandwidth"],
          blocks: [
            {
              id: "m27-l01-p01-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m27-l01-p01-c1", term: "Static Route", text: [T("مسار يدوي يكتبه مدير الشبكة بنفسه.")], note: "يدوي · بسيط" },
                { id: "m27-l01-p01-c2", term: "OSPF", text: [T("بروتوكول ذكي يختار الطريق حسب السرعة / "), L("Bandwidth"), T(".")], note: "Link-State" },
                { id: "m27-l01-p01-c3", term: "EIGRP", text: [T("بروتوكول من "), L("Cisco"), T(" يعتمد على "), L("Bandwidth + Delay"), T(".")], note: "Cisco · متطور" },
              ],
            },
            {
              id: "m27-l01-p01-def", type: "callout", origin: "book", kind: "important", title: "التوجيه",
              spans: [T("اختيار الطريق الذي تسلكه البيانات للوصول إلى الشبكة المطلوبة.")],
            },
            {
              // ENRICHMENT (Batch 8): SVG visual enrichment appended after the book content.
              id: "m27-l01-p01-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m27/routing-methods-overview", motion: false,
              source: src(210),
              title: "مخطط: نظرة عامة على طرق التوجيه",
              alt: "مخطط: طرق التوجيه الثلاث كما في الكتاب — Static Route (مسار يدوي)، و OSPF (Link-State حسب Bandwidth)، و EIGRP (من Cisco بـ Bandwidth + Delay) — دون أوامر إعداد.",
              caption: "‏Static يدوي · OSPF ذكي حسب Bandwidth · EIGRP من Cisco.",
            },
            {
              id: "m27-l01-p01-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("الراوتر لا يعرف الشبكات البعيدة من تلقاء نفسه: إما أن يكتبها له المدير يدويًا ("), L("Static"), T(")، أو أن يتعلّمها من الراوترات الأخرى ببروتوكول مثل "), L("OSPF"), T(" أو "), L("EIGRP"), T(". الصفحات التالية تشرح كلًّا منها ثم تطبّقها بالأوامر.")],
            },
            {
              id: "m27-l01-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي بروتوكول يعتمد على Bandwidth + Delay وهو من Cisco؟",
                options: [opt("m27-l01-p01-q1-a", "EIGRP", true), opt("m27-l01-p01-q1-b", "OSPF"), opt("m27-l01-p01-q1-c", "Static Route")],
                feedback: {
                  hints: ["البطاقة الثالثة.", "الشارة: Cisco · متطور."],
                  correctFeedback: "صحيح — EIGRP.",
                  incorrectFeedback: "افحص بطاقة EIGRP: «بروتوكول من Cisco يعتمد على Bandwidth + Delay».",
                  explanation: "OSPF يختار حسب Bandwidth فقط، و Static Route مسار يدوي.",
                },
              },
            },
            {
              id: "m27-l01-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "Static Route مسار يدوي يكتبه مدير الشبكة بنفسه.", answer: true,
                feedback: {
                  hints: ["البطاقة الأولى.", "الشارة: يدوي · بسيط."],
                  correctFeedback: "صحيح — مسار يدوي.",
                  incorrectFeedback: "افحص بطاقة Static Route.",
                  explanation: "التوجيه الثابت لا يتعلّم شيئًا تلقائيًا؛ المدير يكتب المسار.",
                },
              },
            },
          ],
        },
        // PDF 211 — Static Route — التوجيه الثابت
        {
          id: "791381-m27-l01-p02",
          title: "Static Route — التوجيه الثابت",
          order: 2,
          source: src(211, 211),
          keywords: ["Static Route", "المزايا", "العيوب", "الشبكات الصغيرة"],
          blocks: [
            {
              id: "m27-l01-p02-pros", type: "list", origin: "book", variant: "checklist", title: "المزايا",
              items: [
                { id: "m27-l01-p02-a1", text: [T("يتم تحديد المسار يدويًا بوضوح.")] },
                { id: "m27-l01-p02-a2", text: [T("مناسب للشبكات الصغيرة والبسيطة.")] },
                { id: "m27-l01-p02-a3", text: [T("لا يستهلك موارد كثيرة من الراوتر.")] },
              ],
            },
            {
              id: "m27-l01-p02-cons", type: "list", origin: "book", variant: "plain", title: "العيوب",
              items: [
                { id: "m27-l01-p02-d1", text: [T("غير مناسب للشبكات الكبيرة.")] },
                { id: "m27-l01-p02-d2", text: [T("أي تغيير يحتاج تعديلًا يدويًا.")] },
                { id: "m27-l01-p02-d3", text: [T("إذا نسي المدير تحديثه قد يحدث انقطاع.")] },
              ],
            },
            {
              id: "m27-l01-p02-when", type: "callout", origin: "book", kind: "tip", title: "متى نستعمله؟",
              spans: [T("في الشبكات الصغيرة الثابتة التي لا تتغيّر كثيرًا.")],
            },
            {
              // ENRICHMENT (Batch 8): SVG visual enrichment appended after the book content.
              id: "m27-l01-p02-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m27/static-route-path", motion: true,
              source: src(211),
              title: "مخطط: المسار الثابت يحدّده المدير",
              alt: "مخطط متحرّك: مدير الشبكة يحدّد مسارًا ثابتًا يدويًا من الراوتر إلى الشبكة الهدف، مسار واحد ثابت بلا سلوك بروتوكول ديناميكي.",
              caption: "‏التوجيه الثابت: المدير يحدّد المسار يدويًا نحو الشبكة الهدف.",
            },
            {
              id: "m27-l01-p02-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("كل ميزة هنا لها وجه آخر: «يدوي بوضوح» يعني أيضًا «يدوي عند كل تغيير». لذلك تُستعمل المسارات الثابتة في الشبكات الصغيرة، وتُترك الشبكات الكبيرة للبروتوكولات التي تتعلّم التغييرات بنفسها.")],
            },
            {
              id: "m27-l01-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما العيب الذي قد يسبّب انقطاعًا في التوجيه الثابت؟",
                options: [opt("m27-l01-p02-q1-a", "نسيان المدير تحديث المسار بعد التغيير", true), opt("m27-l01-p02-q1-b", "استهلاك موارد كثيرة من الراوتر"), opt("m27-l01-p02-q1-c", "اختيار الطريق حسب السرعة")],
                feedback: {
                  hints: ["قائمة العيوب، السطر الأخير.", "ماذا يحدث إذا لم يُحدَّث المسار؟"],
                  correctFeedback: "صحيح — نسيان التحديث قد يسبّب انقطاعًا.",
                  incorrectFeedback: "افحص قائمة العيوب في الصفحة.",
                  explanation: "التوجيه الثابت لا يستهلك موارد كثيرة (ميزة)، لكنه يحتاج تعديلًا يدويًا عند كل تغيير.",
                },
              },
            },
            {
              id: "m27-l01-p02-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "التوجيه الثابت مناسب للشبكات الكبيرة المتغيّرة.", answer: false,
                feedback: {
                  hints: ["صندوق «متى نستعمله؟».", "صغيرة أم كبيرة؟"],
                  correctFeedback: "صحيح — هو للشبكات الصغيرة الثابتة.",
                  incorrectFeedback: "افحص صندوق «متى نستعمله؟» وقائمة العيوب.",
                  explanation: "الشبكات الكبيرة تتغيّر كثيرًا فيصعب تحديث المسارات يدويًا.",
                },
              },
            },
          ],
        },
        // PDF 212 — Distance Vector / Link-State
        {
          id: "791381-m27-l01-p03",
          title: "Distance Vector / Link-State",
          order: 3,
          source: src(212, 212),
          keywords: ["Distance Vector", "Link-State", "Metric", "تحديثات دورية", "هجين"],
          blocks: [
            {
              id: "m27-l01-p03-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m27-l01-p03-c1", term: "Distance Vector", text: [T("يعتمد على "), L("Metric"), T(" ويرسل تحديثات دورية.")], note: "مثال: EIGRP" },
                { id: "m27-l01-p03-c2", term: "Link-State", text: [T("يجمع معلومات عن الشبكة ويرسل تحديثات عند التغيير.")], note: "مثال: OSPF" },
              ],
            },
            {
              id: "m27-l01-p03-student", type: "callout", origin: "book", kind: "remember", title: "للطالب",
              spans: [T("ميّز فقط: "), L("OSPF = Link-State"), T("، و "), L("EIGRP = Distance Vector"), T(" متطوّر — ويسمّى أحيانًا هجينًا لأنه يجمع صفات من النوعين.")],
            },
            {
              // ENRICHMENT (Batch 6): SVG visual enrichment appended after the book content.
              id: "m27-l01-p03-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m27/routing-update-types", motion: true,
              source: src(212),
              title: "مخطط: Distance Vector مقابل Link-State",
              alt: "مخطط متحرّك يقارن Distance Vector الذي يرسل تحديثات دورية (مثل EIGRP) بـ Link-State الذي يرسل تحديثًا عند التغيير ويبني خريطة كاملة (مثل OSPF).",
              caption: "‏Distance Vector يرسل دوريًا · Link-State يرسل عند التغيير.",
            },
            {
              id: "m27-l01-p03-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("في تبسيط هذه الوحدة: "), L("Distance Vector"), T(" يعتمد تحديثات دورية يرسل فيها الراوتر ما يعرفه كل فترة، بينما "), L("Link-State"), T(" يركّز على تحديث معلومات الحالة عند حدوث تغيير؛ وهذا سبب ملاءمة "), L("Link-State"), T(" للشبكات الكبيرة.")],
            },
            {
              id: "m27-l01-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي نوع يرسل تحديثات عند التغيير فقط؟",
                options: [opt("m27-l01-p03-q1-a", "Link-State", true), opt("m27-l01-p03-q1-b", "Distance Vector"), opt("m27-l01-p03-q1-c", "Static Route")],
                feedback: {
                  hints: ["البطاقة الثانية.", "مثاله OSPF."],
                  correctFeedback: "صحيح — Link-State.",
                  incorrectFeedback: "افحص بطاقة Link-State: «يرسل تحديثات عند التغيير».",
                  explanation: "Distance Vector يرسل تحديثات دورية، و Static Route لا يرسل تحديثات أصلًا.",
                },
              },
            },
            {
              id: "m27-l01-p03-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "OSPF = Link-State، و EIGRP = ____ Vector متطوّر. (اكتب الكلمة الناقصة)", answer: "Distance",
                feedback: {
                  hints: ["صندوق «للطالب».", "الكلمة الأولى في اسم النوع الأول."],
                  correctFeedback: "صحيح — Distance Vector.",
                  incorrectFeedback: "افحص صندوق «للطالب».",
                  explanation: "EIGRP يسمّى أحيانًا هجينًا لأنه يجمع صفات من النوعين.",
                },
              },
            },
          ],
        },
        // PDF 213 — Administrative Distance و METRIC + worksheet
        {
          id: "791381-m27-l01-p04",
          title: "Administrative Distance و METRIC",
          order: 4,
          source: src(213, 213),
          keywords: ["METRIC", "Administrative Distance", "AD", "RIP = 120", "OSPF = 110", "EIGRP = 90", "Static = 1", "Connected = 0"],
          blocks: [
            {
              id: "m27-l01-p04-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m27-l01-p04-c1", term: "METRIC", text: [T("قيمة تساعد الراوتر على اختيار أفضل طريق للوصول.")], note: "الأصغر أفضل" },
                { id: "m27-l01-p04-c2", term: "EIGRP Metric", text: [T("يعتمد غالبًا على "), L("Bandwidth + Delay"), T(".")], note: "Bandwidth + Delay" },
                { id: "m27-l01-p04-c3", term: "OSPF Metric", text: [T("يعتمد غالبًا على "), L("Bandwidth"), T(" فقط.")], note: "Bandwidth" },
              ],
            },
            {
              id: "m27-l01-p04-ad", type: "callout", origin: "book", kind: "important", title: "AD — Administrative Distance",
              spans: [T("تفضيل البروتوكولات: "), L("RIP = 120"), T(" · "), L("OSPF = 110"), T(" · "), L("EIGRP = 90"), T(" · "), L("Static = 1"), T(" · "), L("Connected = 0"), T(". والأصغر أفضل.")],
            },
            {
              id: "m27-l01-p04-table", type: "table", origin: "book",
              caption: "قيم AD كما يذكرها الكتاب (الأصغر أفضل)",
              headers: ["المصدر", "AD"],
              columnDirs: ["ltr", "ltr"],
              rows: [["Connected", "0"], ["Static", "1"], ["EIGRP", "90"], ["OSPF", "110"], ["RIP", "120"]],
            },
            {
              // ENRICHMENT (Batch 6): SVG visual enrichment appended after the book content.
              id: "m27-l01-p04-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m27/admin-distance", motion: false,
              source: src(213),
              title: "مخطط: Metric مقابل Administrative Distance",
              alt: "مخطط يميّز سؤالين: Metric يختار أفضل طريق داخل البروتوكول (EIGRP: Bandwidth + Delay، OSPF: Bandwidth)، و AD يختار بين البروتوكولات بالقيم Connected 0 ثم Static 1 ثم EIGRP 90 ثم OSPF 110 ثم RIP 120 — وفي الحالتين الأصغر أفضل.",
              caption: "‏Metric يختار داخل البروتوكول · AD يختار بين البروتوكولات — الأصغر أفضل.",
            },
            {
              id: "m27-l01-p04-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("سؤالان مختلفان: "), L("Metric"), T(" يجيب «أي طريق أفضل داخل البروتوكول نفسه؟»، و "), L("AD"), T(" يجيب «أي بروتوكول أصدّق إذا عرف كل منهم طريقًا للشبكة نفسها؟». في الحالتين الرقم الأصغر يفوز.")],
            },
            {
              id: "m27-l01-p04-ws", type: "practice-table", origin: "teacher-enrichment", caption: "ورقة عمل: اختر قيمة AD لكل مصدر توجيه كما في الكتاب",
              headers: ["المصدر", "AD"],
              columnDirs: ["ltr", "ltr"],
              rows: [["OSPF", AD("110")], ["Connected", AD("0")], ["RIP", AD("120")], ["EIGRP", AD("90")], ["Static", AD("1")]],
            },
            {
              id: "m27-l01-p04-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "إذا عرف الراوتر الشبكة نفسها عبر OSPF وعبر EIGRP، أيهما يفضّل بحسب AD؟",
                options: [opt("m27-l01-p04-q1-a", "EIGRP لأن 90 أصغر من 110", true), opt("m27-l01-p04-q1-b", "OSPF لأن 110 أكبر"), opt("m27-l01-p04-q1-c", "لا فرق بينهما")],
                feedback: {
                  hints: ["صندوق AD.", "الأصغر أفضل."],
                  correctFeedback: "صحيح — EIGRP (AD = 90).",
                  incorrectFeedback: "افحص صندوق AD: «والأصغر أفضل».",
                  explanation: "AD هو ترتيب الثقة بين مصادر التوجيه؛ 90 أصغر من 110.",
                },
              },
            },
          ],
        },
      ],
    },
    // ── l02 — OSPF (PDF 214–217) ──────────────────────────────────────────────────────────────────────────────
    {
      id: "791381-m27-l02",
      title: "OSPF",
      order: 2,
      pages: [
        // PDF 214 — OSPF
        {
          id: "791381-m27-l02-p01",
          title: "OSPF",
          order: 1,
          source: src(214, 214),
          keywords: ["OSPF", "Open Shortest Path First", "Link-State", "Open Standard", "خريطة كاملة"],
          blocks: [
            {
              id: "m27-l02-p01-def", type: "callout", origin: "book", kind: "important",
              spans: [L("OSPF = Open Shortest Path First")],
            },
            {
              id: "m27-l02-p01-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m27-l02-p01-f1", text: [T("كل راوتر يبني خريطة كاملة للشبكة (في رسم الكتاب: "), L("R1"), T(" و "), L("R2"), T(" و "), L("R3"), T(" و "), L("R4"), T(" مع «تحديث عند التغيير فقط»).")] },
                { id: "m27-l02-p01-f2", text: [T("يختار المسار الأفضل حسب "), L("Bandwidth"), T(".")] },
                { id: "m27-l02-p01-f3", text: [T("بروتوكول من نوع "), L("Link-State"), T(".")] },
                { id: "m27-l02-p01-f4", text: [T("يناسب الشبكات الكبيرة والمعقّدة.")] },
                { id: "m27-l02-p01-f5", text: [T("يختار المسار الأفضل حسب "), L("Bandwidth"), T("، ويرسل تحديثات عند التغيير.")] },
              ],
            },
            {
              id: "m27-l02-p01-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [L("OSPF"), T(" معيار مفتوح ("), L("Open Standard"), T(") غير مملوك لشركة واحدة، لذلك يعمل مع أجهزة من شركات مختلفة.")],
            },
            {
              id: "m27-l02-p01-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("«خريطة كاملة» تعني أن كل راوتر يعرف كل الوصلات في المنطقة لا جيرانه فقط، ثم يحسب بنفسه أقصر طريق — ومن هنا الاسم "), L("Shortest Path First"), T(".")],
            },
            {
              id: "m27-l02-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "لماذا يعمل OSPF مع أجهزة من شركات مختلفة؟",
                options: [opt("m27-l02-p01-q1-a", "لأنه معيار مفتوح غير مملوك لشركة واحدة", true), opt("m27-l02-p01-q1-b", "لأنه من نوع Distance Vector"), opt("m27-l02-p01-q1-c", "لأنه يرسل تحديثات دورية")],
                feedback: {
                  hints: ["صندوق «تذكّر».", "Open Standard."],
                  correctFeedback: "صحيح — معيار مفتوح.",
                  incorrectFeedback: "افحص صندوق «تذكّر» في الصفحة.",
                  explanation: "OSPF من نوع Link-State ويرسل تحديثات عند التغيير؛ انفتاحه هو ما يجعله يعمل بين الشركات.",
                },
              },
            },
            {
              id: "m27-l02-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "ما الكلمة الثالثة في الاسم الكامل Open Shortest ____ First؟", answer: "Path",
                feedback: {
                  hints: ["صندوق التعريف.", "تعني «طريق»."],
                  correctFeedback: "صحيح — Path.",
                  incorrectFeedback: "افحص التعريف: «OSPF = Open Shortest Path First».",
                  explanation: "أقصر طريق أولًا: الراوتر يحسب أقصر طريق من خريطته الكاملة.",
                },
              },
            },
          ],
        },
        // PDF 215 — مثال OSPF
        {
          id: "791381-m27-l02-p02",
          title: "مثال OSPF",
          order: 2,
          source: src(215, 215),
          keywords: ["مثال OSPF", "R1", "R2", "10.0.0.0/30", "192.168.1.0/24", "192.168.2.0/24", "area"],
          blocks: [
            {
              id: "m27-l02-p02-given", type: "callout", origin: "book", kind: "important", title: "معطى",
              spans: [T("شبكتان متصلتان عبر راوترات.")],
            },
            {
              id: "m27-l02-p02-topology", type: "table", origin: "book",
              caption: "رسم الكتاب: شبكتان متصلتان عبر راوترين",
              headers: ["العنصر", "العنوان"],
              columnDirs: ["ltr", "ltr"],
              rows: [["R1 — R2 (الوصلة بينهما)", "10.0.0.0/30"], ["الشبكة خلف R1", "192.168.1.0/24"], ["الشبكة خلف R2", "192.168.2.0/24"]],
            },
            {
              id: "m27-l02-p02-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m27-l02-p02-s1", text: [T("المطلوب: تعريف "), L("OSPF"), T(" حتى تعرف الراوترات الشبكات حولها.")] },
                { id: "m27-l02-p02-s2", text: [T("نركّز على أوامر "), L("R1"), T(" و "), L("R2"), T(".")] },
                { id: "m27-l02-p02-s3", text: [T("نستعمل نفس رقم العملية ونفس "), L("area"), T(".")] },
              ],
            },
            {
              id: "m27-l02-p02-idea", type: "callout", origin: "book", kind: "tip", title: "الفكرة",
              spans: [T("الراوترات تتبادل معلومات الشبكات تلقائيًا بعد تعريف "), L("OSPF"), T(".")],
            },
            {
              // ENRICHMENT (Batch 6): SVG visual enrichment appended after the book content.
              id: "m27-l02-p02-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m27/ospf-topology", motion: false,
              source: src(215),
              title: "مخطط: مثال شبكة OSPF",
              alt: "مخطط طوبولوجيا OSPF: الراوتران R1 و R2 يربطهما رابط 10.0.0.0/30، خلف R1 شبكة 192.168.1.0/24 وخلف R2 شبكة 192.168.2.0/24، وكلاهما في area 0.",
              caption: "‏R1 و R2 يتبادلان مساراتهما بـ OSPF في area 0.",
            },
            {
              id: "m27-l02-p02-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("الوصلة "), L("10.0.0.0/30"), T(" تحوي عنوانين صالحين فقط — واحد لكل راوتر — كما تعلّمت في "), L("CIDR"), T("؛ ستراها في الصفحتين التاليتين مكتوبة بـ "), L("wildcard"), T(" وهو مقلوب القناع: "), L("/30 = 0.0.0.3"), T(" و "), L("/24 = 0.0.0.255"), T(".")],
            },
            {
              id: "m27-l02-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما شرط تبادل المعلومات بين R1 و R2 في مثال الكتاب؟",
                options: [opt("m27-l02-p02-q1-a", "نفس رقم العملية ونفس area", true), opt("m27-l02-p02-q1-b", "نفس اسم الجهاز"), opt("m27-l02-p02-q1-c", "نفس عنوان IP")],
                feedback: {
                  hints: ["السطر الثالث في قائمة الخطوات.", "رقم العملية و…"],
                  correctFeedback: "صحيح — نفس رقم العملية ونفس area.",
                  incorrectFeedback: "افحص السطر: «نستعمل نفس رقم العملية ونفس area».",
                  explanation: "بعد تعريف OSPF بالشروط نفسها تتبادل الراوترات معلومات الشبكات تلقائيًا.",
                },
              },
            },
            {
              id: "m27-l02-p02-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "ما عنوان الشبكة التي تربط R1 بـ R2 في رسم الكتاب؟ (مع طول البادئة)", answer: "10.0.0.0/30",
                feedback: {
                  hints: ["الصف الأول في جدول الرسم.", "يبدأ بـ 10."],
                  correctFeedback: "صحيح — 10.0.0.0/30.",
                  incorrectFeedback: "افحص جدول «شبكتان متصلتان عبر راوترين».",
                  explanation: "/30 شبكة صغيرة لعنوانين: واحد لكل طرف من الوصلة.",
                },
              },
            },
          ],
        },
        // PDF 216 — مثال OSPF — تعريفات R1 + GUIDED
        {
          id: "791381-m27-l02-p03",
          title: "مثال OSPF — تعريفات R1",
          order: 3,
          source: src(216, 216),
          keywords: ["router ospf 1", "network 192.168.1.0 0.0.0.255 area 0", "network 10.0.0.0 0.0.0.3 area 0", "wildcard"],
          blocks: [
            {
              id: "m27-l02-p03-cli", type: "code", origin: "book", language: "cli",
              code: `Device(config)# router ospf 1\nDevice(config)# network ${NET1} ${WC24} area 0\nDevice(config)# network ${LINK} ${WC30} area 0`,
            },
            {
              id: "m27-l02-p03-cmds", type: "table", origin: "book",
              caption: "Cisco CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Device(config)# router ospf 1", "تفعيل OSPF برقم العملية 1"],
                [`Device(config)# network ${NET1} ${WC24} area 0`, "إعلان الشبكة الأولى"],
                [`Device(config)# network ${LINK} ${WC30} area 0`, "إعلان الشبكة الثانية"],
              ],
            },
            {
              id: "m27-l02-p03-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("كل أمر "), L("network"), T(" يعلن عن شبكة متصلة بالراوتر.")],
            },
            {
              id: "m27-l02-p03-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("بعد "), L("router ospf 1"), T(" يتغيّر المؤشّر إلى "), L("R1(config-router)#"), T(" وهناك تُكتب سطور "), L("network"), T("؛ الكتاب يختصر ويكتبها تحت "), L("Device(config)#"), T(". الرقم "), L("1"), T(" هو رقم العملية داخل الراوتر، و "), L("0.0.0.3"), T(" هو "), L("wildcard"), T(" الوصلة "), L("/30"), T(".")],
            },
            {
              id: "m27-l02-p03-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مثال موجّه: OSPF على R1",
              description: "أنت في وضع الإعداد العام للراوتر R1. نفّذ سطور صندوق الكتاب بالترتيب؛ لاحظ تغيّر المؤشّر بعد السطر الأول. محاكاة تعليمية مبسّطة.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "المثال الموجّه: router ospf 1 ثم network 192.168.1.0 0.0.0.255 area 0 ثم network 10.0.0.0 0.0.0.3 area 0." },
              config: EX({
                kind: "guided",
                device: "router",
                hostname: "R1",
                startMode: "global",
                intro: "أنت في وضع الإعداد العام للراوتر R1. نفّذ سطور صندوق الكتاب بالترتيب.",
                steps: [
                  { id: "s1", instruction: "فعّل OSPF برقم العملية 1", expect: { command: "router", args: { protocol: "ospf", number: 1 } }, success: "✓ أحسنت، أنت الآن في وضع إعداد التوجيه (config-router)#", hints: ["السطر الأول في صندوق الكتاب.", "الأمر يبدأ بـ router ospf."] },
                  { id: "s2", instruction: "أعلن الشبكة الأولى 192.168.1.0 في area 0", expect: { command: "network", args: { form: "ospf", address: NET1, wildcard: WC24, area: 0 } }, hints: ["السطر الثاني في صندوق الكتاب.", "network ثم الشبكة ثم wildcard 0.0.0.255 ثم area 0."] },
                  { id: "s3", instruction: "أعلن الشبكة الثانية 10.0.0.0 (الوصلة /30) في area 0", expect: { command: "network", args: { form: "ospf", address: LINK, wildcard: WC30, area: 0 } }, hints: ["السطر الأخير في صندوق الكتاب.", "wildcard الوصلة /30 هو 0.0.0.3."] },
                ],
                completion: "✓ أحسنت، R1 يعلن شبكتيه في OSPF كما في الكتاب.",
              }),
            },
            {
              id: "m27-l02-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ماذا يفعل الأمر network في OSPF بحسب الكتاب؟",
                options: [opt("m27-l02-p03-q1-a", "يعلن عن شبكة متصلة بالراوتر", true), opt("m27-l02-p03-q1-b", "يعطي الراوتر عنوان IP"), opt("m27-l02-p03-q1-c", "يفعّل OSPF")],
                feedback: {
                  hints: ["صندوق «تذكّر».", "يعلن عن…"],
                  correctFeedback: "صحيح — يعلن عن شبكة متصلة بالراوتر.",
                  incorrectFeedback: "افحص صندوق «تذكّر»: «كل أمر network يعلن عن شبكة متصلة بالراوتر».",
                  explanation: "router ospf 1 يفعّل البروتوكول، و network يعلن كل شبكة، و ip address يُعطى للواجهات لا للبروتوكول.",
                },
              },
            },
            {
              id: "m27-l02-p03-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "ما رقم العملية في الأمر الأول من صندوق الكتاب؟ (رقم)", answer: "1",
                feedback: {
                  hints: ["السطر الأول في صندوق الكتاب.", "الرقم بعد ospf."],
                  correctFeedback: "صحيح — 1.",
                  incorrectFeedback: "افحص السطر: «router ospf 1».",
                  explanation: "رقم العملية يميّز عملية OSPF داخل الراوتر؛ الكتاب يستعمل الرقم 1 على الراوترين.",
                },
              },
            },
          ],
        },
        // PDF 217 — مثال OSPF — تعريفات R2 + CHALLENGE
        {
          id: "791381-m27-l02-p04",
          title: "مثال OSPF — تعريفات R2",
          order: 4,
          source: src(217, 217),
          keywords: ["router ospf 1", "network 192.168.2.0 0.0.0.255 area 0", "network 10.0.0.0 0.0.0.3 area 0", "نفس رقم العملية"],
          blocks: [
            {
              id: "m27-l02-p04-cli", type: "code", origin: "book", language: "cli",
              code: `Device(config)# router ospf 1\nDevice(config)# network ${NET2} ${WC24} area 0\nDevice(config)# network ${LINK} ${WC30} area 0`,
            },
            {
              id: "m27-l02-p04-cmds", type: "table", origin: "book",
              caption: "Cisco CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Device(config)# router ospf 1", "نفس رقم العملية"],
                [`Device(config)# network ${NET2} ${WC24} area 0`, "شبكة R2 الأولى"],
                [`Device(config)# network ${LINK} ${WC30} area 0`, "الشبكة المشتركة"],
              ],
            },
            {
              id: "m27-l02-p04-attention", type: "callout", origin: "book", kind: "warning", title: "انتبه",
              spans: [T("نستعمل نفس رقم العملية ونفس "), L("area"), T(" حتى تتبادل الراوترات المعلومات.")],
            },
            {
              id: "m27-l02-p04-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("الفرق الوحيد عن R1 هو الشبكة الأولى: R2 يعلن "), L("192.168.2.0"), T(" بدل "), L("192.168.1.0"), T("، أما الوصلة المشتركة "), L("10.0.0.0"), T(" فيعلنها الطرفان لأنها متصلة بكليهما.")],
            },
            {
              id: "m27-l02-p04-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "تحدّي الأمر: OSPF على R2",
              description: "أنت في وضع الإعداد العام للراوتر R2. اكتب الأمر المطلوب في كل سؤال. المحاكي لا يكشف الإجابة. محاكاة تعليمية مبسّطة.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "التحدّي: router ospf 1، ثم network 192.168.2.0 0.0.0.255 area 0، ثم network 10.0.0.0 0.0.0.3 area 0." },
              config: EX({
                kind: "challenge",
                device: "router",
                hostname: "R2",
                startMode: "global",
                intro: "أنت في وضع الإعداد العام للراوتر R2.",
                steps: [
                  { id: "c1", instruction: "فعّل OSPF بنفس رقم العملية الذي استعمله R1", expect: { command: "router", args: { protocol: "ospf", number: 1 } }, hints: ["الصف الأول في جدول الأوامر: «نفس رقم العملية».", "router ospf ثم الرقم 1."] },
                  { id: "c2", instruction: "أعلن شبكة R2 الأولى 192.168.2.0 في area 0", expect: { command: "network", args: { form: "ospf", address: NET2, wildcard: WC24, area: 0 } }, hints: ["السطر الثاني في صندوق الكتاب.", "wildcard الشبكة /24 هو 0.0.0.255."] },
                  { id: "c3", instruction: "أعلن الشبكة المشتركة 10.0.0.0 في area 0", expect: { command: "network", args: { form: "ospf", address: LINK, wildcard: WC30, area: 0 } }, hints: ["السطر الأخير في صندوق الكتاب.", "wildcard الوصلة /30 هو 0.0.0.3."] },
                ],
                allowed: ["network"],
                completion: "✓ صحيح في كل الأوامر — R1 و R2 يتبادلان المعلومات الآن.",
              }),
            },
            {
              id: "m27-l02-p04-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي شبكة يعلنها R1 و R2 كلاهما في مثال الكتاب؟",
                options: [opt("m27-l02-p04-q1-a", "10.0.0.0 (الشبكة المشتركة)", true), opt("m27-l02-p04-q1-b", "192.168.1.0"), opt("m27-l02-p04-q1-c", "192.168.2.0")],
                feedback: {
                  hints: ["الصف الأخير في جدول الأوامر.", "الشبكة التي تربط الراوترين."],
                  correctFeedback: "صحيح — 10.0.0.0 الشبكة المشتركة.",
                  incorrectFeedback: "افحص الصف: «الشبكة المشتركة».",
                  explanation: "كل راوتر يعلن الشبكات المتصلة به؛ الوصلة بينهما متصلة بكليهما.",
                },
              },
            },
            {
              id: "m27-l02-p04-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "يمكن أن يستعمل R2 رقم area مختلفًا عن R1 ويظلّان يتبادلان المعلومات.", answer: false,
                feedback: {
                  hints: ["صندوق «انتبه».", "نفس رقم العملية ونفس…"],
                  correctFeedback: "صحيح — يجب أن تتطابق area.",
                  incorrectFeedback: "افحص صندوق «انتبه» في الصفحة.",
                  explanation: "نستعمل نفس رقم العملية ونفس area حتى تتبادل الراوترات المعلومات.",
                },
              },
            },
          ],
        },
      ],
    },
    // ── l03 — EIGRP و show ip route (PDF 218–222) ─────────────────────────────────────────────────────────────
    {
      id: "791381-m27-l03",
      title: "EIGRP و show ip route",
      order: 3,
      pages: [
        // PDF 218 — EIGRP
        {
          id: "791381-m27-l03-p01",
          title: "EIGRP",
          order: 1,
          source: src(218, 218),
          keywords: ["EIGRP", "Enhanced Interior Gateway Routing Protocol", "Distance Vector", "Cisco", "Bandwidth + Delay"],
          blocks: [
            {
              id: "m27-l03-p01-def", type: "callout", origin: "book", kind: "important",
              spans: [L("EIGRP = Enhanced Interior Gateway Routing Protocol")],
            },
            {
              id: "m27-l03-p01-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m27-l03-p01-f1", text: [T("بروتوكول "), L("Distance Vector"), T(" متطوّر من "), L("Cisco"), T(".")] },
                { id: "m27-l03-p01-f2", text: [T("يعتمد على "), L("Bandwidth + Delay"), T(".")] },
                { id: "m27-l03-p01-f3", text: [T("سريع في التكيّف مع التغييرات.")] },
              ],
            },
            {
              id: "m27-l03-p01-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [L("EIGRP"), T(" خاص بأجهزة "), L("Cisco"), T(" وأسرع في التقارب من البروتوكولات القديمة.")],
            },
            {
              // ENRICHMENT (Batch 8): SVG visual enrichment appended after the book content.
              id: "m27-l03-p01-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m27/eigrp-metric-adaptation", motion: false,
              source: src(218),
              title: "مخطط: مقياس EIGRP والتكيّف السريع",
              alt: "مخطط: EIGRP بروتوكول Distance Vector من Cisco، يختار المسار بمقياس Bandwidth + Delay ويتكيّف بسرعة مع تغيّرات الشبكة، عند مستوى صفحة المفهوم دون أوامر إعداد.",
              caption: "‏EIGRP: مقياس Bandwidth + Delay لاختيار المسار، وتكيّف سريع مع التغييرات.",
            },
            {
              id: "m27-l03-p01-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("«التقارب» ("), L("Convergence"), T(") هو الوقت الذي تحتاجه كل الراوترات لتتفق على الطرق الجديدة بعد تغيير؛ كلما كان أقصر عاد الاتصال أسرع بعد انقطاع وصلة.")],
            },
            {
              id: "m27-l03-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "على ماذا يعتمد EIGRP في اختيار الطريق؟",
                options: [opt("m27-l03-p01-q1-a", "Bandwidth + Delay", true), opt("m27-l03-p01-q1-b", "Bandwidth فقط"), opt("m27-l03-p01-q1-c", "عدد الراوترات فقط")],
                feedback: {
                  hints: ["السطر الثاني في قائمة الحقائق.", "قيمتان مجموعتان."],
                  correctFeedback: "صحيح — Bandwidth + Delay.",
                  incorrectFeedback: "افحص السطر: «يعتمد على Bandwidth + Delay».",
                  explanation: "OSPF يعتمد على Bandwidth فقط، أما EIGRP فيضيف التأخير.",
                },
              },
            },
            {
              id: "m27-l03-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "EIGRP معيار مفتوح يعمل مع أجهزة كل الشركات.", answer: false,
                feedback: {
                  hints: ["صندوق «تذكّر».", "خاص بأجهزة…"],
                  correctFeedback: "صحيح — EIGRP خاص بأجهزة Cisco.",
                  incorrectFeedback: "افحص صندوق «تذكّر»: «خاص بأجهزة Cisco».",
                  explanation: "المعيار المفتوح هو OSPF؛ EIGRP من Cisco.",
                },
              },
            },
          ],
        },
        // PDF 219 — مثال EIGRP
        {
          id: "791381-m27-l03-p02",
          title: "مثال EIGRP",
          order: 2,
          source: src(219, 219),
          keywords: ["مثال EIGRP", "AS 100", "رقم AS", "R1", "R2"],
          blocks: [
            {
              id: "m27-l03-p02-given", type: "callout", origin: "book", kind: "important", title: "معطى",
              spans: [T("نفس شكل الشبكات تقريبًا — في رسم الكتاب: "), L("AS 100"), T("، "), L("R1"), T(" و "), L("R2"), T(" عبر "), L("10.0.0.0/30"), T("، والشبكتان "), L("192.168.1.0/24"), T(" و "), L("192.168.2.0/24"), T(". نفس رقم "), L("AS"), T(" في الراوترين — وإلا لا يتبادلان المعلومات.")],
            },
            {
              id: "m27-l03-p02-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m27-l03-p02-s1", text: [T("المطلوب: تعريف "), L("EIGRP"), T(" حتى تتعرّف الراوترات على الشبكات.")] },
                { id: "m27-l03-p02-s2", text: [T("نستعمل رقم "), L("AS"), T(" مثل "), L("100"), T(".")] },
                { id: "m27-l03-p02-s3", text: [T("يجب توحيد رقم "), L("AS"), T(" بين الراوترات.")] },
              ],
            },
            {
              id: "m27-l03-p02-idea", type: "callout", origin: "book", kind: "tip", title: "الفكرة",
              spans: [T("رقم "), L("AS"), T(" يجمع الراوترات التي تتبادل معلومات التوجيه معًا.")],
            },
            {
              id: "m27-l03-p02-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [L("AS"), T(" اختصار "), L("Autonomous System"), T(": «نظام مستقل»، أي مجموعة الراوترات التي تديرها جهة واحدة. رقم "), L("AS"), T(" في "), L("EIGRP"), T(" يقوم بدور رقم العملية و "), L("area"), T(" معًا في "), L("OSPF"), T(".")],
            },
            {
              id: "m27-l03-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "ما رقم AS الذي يستعمله مثال الكتاب؟ (رقم)", answer: "100",
                feedback: {
                  hints: ["رسم الكتاب أو السطر الثاني في الخطوات.", "ثلاثة أرقام."],
                  correctFeedback: "صحيح — 100.",
                  incorrectFeedback: "افحص السطر: «نستعمل رقم AS مثل 100».",
                  explanation: "الرقم نفسه يجب أن يُكتب على R1 و R2.",
                },
              },
            },
            {
              id: "m27-l03-p02-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "إذا اختلف رقم AS بين R1 و R2 فلن يتبادلا معلومات التوجيه.", answer: true,
                feedback: {
                  hints: ["صندوق «معطى» وصندوق «الفكرة».", "ما الذي يجمع الراوترات معًا؟"],
                  correctFeedback: "صحيح — رقم AS يجب أن يتطابق.",
                  incorrectFeedback: "افحص السطر: «نفس رقم AS في الراوترين — وإلا لا يتبادلان المعلومات».",
                  explanation: "رقم AS يجمع الراوترات التي تتبادل معلومات التوجيه معًا.",
                },
              },
            },
          ],
        },
        // PDF 220 — مثال EIGRP — تعريفات R1 + GUIDED
        {
          id: "791381-m27-l03-p03",
          title: "مثال EIGRP — تعريفات R1",
          order: 3,
          source: src(220, 220),
          keywords: ["router eigrp 100", "network 192.168.1.0", "network 10.0.0.0", "لا نكتب area"],
          blocks: [
            {
              id: "m27-l03-p03-cli", type: "code", origin: "book", language: "cli",
              code: `Device(config)# router eigrp 100\nDevice(config)# network ${NET1}\nDevice(config)# network ${LINK}`,
            },
            {
              id: "m27-l03-p03-cmds", type: "table", origin: "book",
              caption: "Cisco CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Device(config)# router eigrp 100", "تفعيل EIGRP برقم AS 100"],
                [`Device(config)# network ${NET1}`, "إعلان الشبكة الأولى"],
                [`Device(config)# network ${LINK}`, "إعلان الشبكة المشتركة"],
              ],
            },
            {
              id: "m27-l03-p03-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("في "), L("EIGRP"), T(" لا نكتب "), L("area"), T("؛ نكتب رقم "), L("AS"), T(" ثم الشبكات.")],
            },
            {
              id: "m27-l03-p03-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("قارن السطرين: في "), L("OSPF"), T(" كتبنا "), L("network 10.0.0.0 0.0.0.3 area 0"), T("، وهنا يكفي "), L("network 10.0.0.0"), T(" — لا "), L("wildcard"), T(" ولا "), L("area"), T(". في المحاكي، كتابة "), L("area"), T(" داخل "), L("EIGRP"), T(" تُرفض بالرسالة نفسها التي يقولها الكتاب.")],
            },
            {
              id: "m27-l03-p03-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مثال موجّه: EIGRP على R1",
              description: "أنت في وضع الإعداد العام للراوتر R1. نفّذ سطور صندوق الكتاب بالترتيب. محاكاة تعليمية مبسّطة.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "المثال الموجّه: router eigrp 100 ثم network 192.168.1.0 ثم network 10.0.0.0." },
              config: EX({
                kind: "guided",
                device: "router",
                hostname: "R1",
                startMode: "global",
                intro: "أنت في وضع الإعداد العام للراوتر R1. نفّذ سطور صندوق الكتاب بالترتيب.",
                steps: [
                  { id: "s1", instruction: "فعّل EIGRP برقم AS 100", expect: { command: "router", args: { protocol: "eigrp", number: 100 } }, success: "✓ أحسنت، أنت الآن في وضع إعداد التوجيه (config-router)#", hints: ["السطر الأول في صندوق الكتاب.", "الأمر يبدأ بـ router eigrp."] },
                  { id: "s2", instruction: "أعلن الشبكة الأولى 192.168.1.0", expect: { command: "network", args: { form: "eigrp", address: NET1 } }, hints: ["السطر الثاني في صندوق الكتاب.", "network ثم عنوان الشبكة فقط — بلا area."] },
                  { id: "s3", instruction: "أعلن الشبكة المشتركة 10.0.0.0", expect: { command: "network", args: { form: "eigrp", address: LINK } }, hints: ["السطر الأخير في صندوق الكتاب.", "network 10.0.0.0."] },
                ],
                completion: "✓ أحسنت، R1 يعلن شبكتيه في EIGRP كما في الكتاب.",
              }),
            },
            {
              id: "m27-l03-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما الذي لا نكتبه في أوامر EIGRP بحسب «تذكّر»؟",
                options: [opt("m27-l03-p03-q1-a", "area", true), opt("m27-l03-p03-q1-b", "رقم AS"), opt("m27-l03-p03-q1-c", "الشبكات")],
                feedback: {
                  hints: ["صندوق «تذكّر».", "كلمة من OSPF لا تظهر هنا."],
                  correctFeedback: "صحيح — لا نكتب area.",
                  incorrectFeedback: "افحص صندوق «تذكّر»: «في EIGRP لا نكتب area».",
                  explanation: "نكتب رقم AS ثم الشبكات فقط.",
                },
              },
            },
            {
              id: "m27-l03-p03-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "اكتب الأمر الذي يفعّل EIGRP برقم AS 100 (الأمر كاملًا).", answer: "router eigrp 100",
                feedback: {
                  hints: ["السطر الأول في صندوق الكتاب.", "router ثم اسم البروتوكول ثم الرقم."],
                  correctFeedback: "صحيح — router eigrp 100.",
                  incorrectFeedback: "افحص السطر الأول في صندوق الكتاب.",
                  explanation: "بعده يتغيّر المؤشّر إلى (config-router)# وتُكتب سطور network.",
                },
              },
            },
          ],
        },
        // PDF 221 — مثال EIGRP — تعريفات R2 + TASK
        {
          id: "791381-m27-l03-p04",
          title: "مثال EIGRP — تعريفات R2",
          order: 4,
          source: src(221, 221),
          keywords: ["router eigrp 100", "network 192.168.2.0", "network 10.0.0.0", "نفس رقم AS"],
          blocks: [
            {
              id: "m27-l03-p04-cli", type: "code", origin: "book", language: "cli",
              code: `Device(config)# router eigrp 100\nDevice(config)# network ${NET2}\nDevice(config)# network ${LINK}`,
            },
            {
              id: "m27-l03-p04-cmds", type: "table", origin: "book",
              caption: "Cisco CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Device(config)# router eigrp 100", "نفس رقم AS"],
                [`Device(config)# network ${NET2}`, "شبكة R2"],
                [`Device(config)# network ${LINK}`, "الشبكة المشتركة"],
              ],
            },
            {
              id: "m27-l03-p04-attention", type: "callout", origin: "book", kind: "warning", title: "انتبه",
              spans: [T("يجب أن يكون رقم "), L("AS"), T(" متطابقًا بين الراوترات حتى تتبادل المعلومات.")],
            },
            {
              id: "m27-l03-p04-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("في المهمّة أدناه لا نمليك الترتيب: المحاكي يحكم على الحالة النهائية فقط — عملية "), L("EIGRP 100"), T(" مع الشبكتين — كما يفعل مصحّح الامتحان العملي.")],
            },
            {
              id: "m27-l03-p04-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مهمّة: EIGRP على R2",
              description: "أنت في وضع الإعداد العام للراوتر R2. المطلوب حالة نهائية: EIGRP برقم AS 100 يعلن الشبكتين 192.168.2.0 و 10.0.0.0. الترتيب لك. محاكاة تعليمية مبسّطة.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "المهمّة: router eigrp 100 ثم network 192.168.2.0 ثم network 10.0.0.0." },
              config: EX({
                kind: "task",
                device: "router",
                hostname: "R2",
                startMode: "global",
                intro: "أنت في وضع الإعداد العام للراوتر R2.",
                goals: [
                  { id: "g-as", label: "EIGRP مفعّل برقم AS 100", condition: { kind: "routing", protocol: "eigrp", prop: "id", value: 100 } },
                  { id: "g-net2", label: "الشبكة 192.168.2.0 معلنة", condition: { kind: "routing", protocol: "eigrp", prop: "network", value: NET2 } },
                  { id: "g-link", label: "الشبكة المشتركة 10.0.0.0 معلنة", condition: { kind: "routing", protocol: "eigrp", prop: "network", value: LINK } },
                ],
                hints: ["ابدأ بـ router eigrp ثم رقم AS كما في R1.", "داخل (config-router)#: network ثم عنوان الشبكة، بلا area."],
                completion: "✓ أحسنت، R2 يعلن شبكتيه برقم AS المطابق لـ R1.",
              }),
            },
            {
              id: "m27-l03-p04-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ماذا يحدث إذا كتب R2 الأمر router eigrp 200 بينما R1 يستعمل 100؟",
                options: [opt("m27-l03-p04-q1-a", "لا يتبادلان معلومات التوجيه", true), opt("m27-l03-p04-q1-b", "يعمل كل شيء بشكل طبيعي"), opt("m27-l03-p04-q1-c", "يتحوّل EIGRP إلى OSPF")],
                feedback: {
                  hints: ["صندوق «انتبه».", "رقم AS يجب أن يكون…"],
                  correctFeedback: "صحيح — لا يتبادلان المعلومات.",
                  incorrectFeedback: "افحص صندوق «انتبه» في الصفحة.",
                  explanation: "رقم AS يجمع الراوترات التي تتبادل معلومات التوجيه؛ اختلافه يفصلها.",
                },
              },
            },
            {
              id: "m27-l03-p04-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "ما الشبكة التي يعلنها R2 وحده (وليست مشتركة)؟", answer: NET2,
                feedback: {
                  hints: ["الصف الثاني في جدول الأوامر: «شبكة R2».", "تبدأ بـ 192.168.2."],
                  correctFeedback: "صحيح — 192.168.2.0.",
                  incorrectFeedback: "افحص الصف: «شبكة R2».",
                  explanation: "10.0.0.0 مشتركة بين الراوترين، و 192.168.1.0 خلف R1.",
                },
              },
            },
          ],
        },
        // PDF 222 — show ip route + SHOW CHALLENGE + module review
        {
          id: "791381-m27-l03-p05",
          title: "show ip route",
          order: 5,
          source: src(222, 222),
          keywords: ["show ip route", "directly connected", "[120/1]", "via", "C", "R", "O", "D"],
          blocks: [
            {
              id: "m27-l03-p05-out", type: "code", origin: "book", language: "cli",
              code: "C    192.168.1.0/24 is directly connected, G0/0\nR    192.168.2.0/24 [120/1] via 192.168.1.1\nO    10.0.0.0/24 [110/2] via 192.168.1.1",
            },
            {
              id: "m27-l03-p05-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m27-l03-p05-f1", text: [L("C"), T(" تعني أن الشبكة متصلة مباشرة بالراوتر.")] },
                { id: "m27-l03-p05-f2", text: [L("R"), T(" تعني أنها وصلت عبر بروتوكول "), L("RIP"), T("، و "), L("O"), T(" عبر "), L("OSPF"), T("، و "), L("D"), T(" عبر "), L("EIGRP"), T(".")] },
                { id: "m27-l03-p05-f3", text: [L("[120/1]"), T(": الرقم "), L("120"), T(" هو المسافة الإدارية "), L("AD"), T("، والرقم "), L("1"), T(" هو المقياس "), L("Metric"), T(".")] },
                { id: "m27-l03-p05-f4", text: [L("via 192.168.1.1"), T(" يعني أن الطريق يمر عبر هذا العنوان.")] },
              ],
            },
            {
              // ENRICHMENT (Batch 6): SVG visual enrichment appended after the book content.
              id: "m27-l03-p05-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m27/show-ip-route", motion: false,
              source: src(222),
              title: "مخطط: قراءة سطر من جدول التوجيه",
              alt: "مخطط يشرح حقول سطر جدول التوجيه: الكود (R = RIP، C = متّصل مباشرة، O = OSPF، D = EIGRP)، والقوسان [AD/Metric] مثل [120/1]، و via عنوان القفزة التالية.",
              caption: "‏الكود يدلّ على مصدر المسار، والقوسان [AD/Metric]، و via القفزة التالية.",
            },
            {
              id: "m27-l03-p05-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("مخرجات الكتاب من راوتر له جيران؛ في المحاكي جهاز واحد فقط، لذلك يعرض "), L("show ip route"), T(" السطور "), L("C"), T(" للشبكات المتصلة بواجهاته العاملة، ويكتب أن طرق "), L("O"), T(" و "), L("D"), T(" تظهر بعد تبادل التحديثات مع الجيران — وهذا ما لا يُحاكى.")],
            },
            {
              id: "m27-l03-p05-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "تحدّي الفحص: اعرض جدول التوجيه",
              description: "أنت في وضع الأوامر المتقدّم للراوتر R1 وواجهتاه مضبوطتان. اعرض جدول التوجيه بالأمر المناسب واقرأ سطور C. محاكاة تعليمية مبسّطة.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "التحدّي: show ip route — تظهر الشبكات المتصلة مباشرة بسطور تبدأ بـ C." },
              config: EX({
                kind: "challenge",
                device: "router",
                hostname: "R1",
                startMode: "privileged",
                preset: { interfaces: { "g0/0": { ipAddress: "192.168.1.1", subnetMask: "255.255.255.0", shutdown: false }, "g0/1": { ipAddress: "10.0.0.1", subnetMask: "255.255.255.252", shutdown: false } } },
                intro: "أنت في وضع الأوامر المتقدّم للراوتر R1.",
                steps: [
                  { id: "c1", instruction: "اعرض جدول التوجيه", expect: { command: "show", args: { what: "ip-route" } }, success: "✓ صحيح — لاحظ أن سطور C هي شبكات واجهتي R1 المتصلتين مباشرة", hints: ["عنوان الصفحة هو الأمر.", "show ip ثم route."] },
                ],
                allowed: [],
                completion: "✓ أحسنت — C = متصلة مباشرة، و O و D تظهر بعد تبادل المعلومات مع الجيران.",
              }),
            },
            {
              id: "m27-l03-p05-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "في السطر R 192.168.2.0/24 [120/1] via 192.168.1.1، ماذا يعني الرقم 120؟",
                options: [opt("m27-l03-p05-q1-a", "المسافة الإدارية AD", true), opt("m27-l03-p05-q1-b", "المقياس Metric"), opt("m27-l03-p05-q1-c", "رقم المنفذ")],
                feedback: {
                  hints: ["السطر الثالث في قائمة الشرح.", "الرقم الأول داخل القوسين."],
                  correctFeedback: "صحيح — 120 هو AD (وهو AD لبروتوكول RIP).",
                  incorrectFeedback: "افحص السطر: «[120/1]: الرقم 120 هو المسافة الإدارية AD».",
                  explanation: "الرقم الثاني 1 هو Metric، و via يحدّد العنوان الذي يمر عبره الطريق.",
                },
              },
            },
            { id: "m27-l03-p05-review", type: "heading", origin: "teacher-enrichment", text: "مراجعة الوحدة", level: 3 },
            {
              id: "m27-l03-p05-r1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي حرف في show ip route يدل على شبكة وصلت عبر OSPF؟",
                options: [opt("m27-l03-p05-r1-a", "O", true), opt("m27-l03-p05-r1-b", "C"), opt("m27-l03-p05-r1-c", "D")],
                feedback: {
                  hints: ["السطر الثاني في قائمة الشرح.", "الحرف الأول من اسم البروتوكول."],
                  correctFeedback: "صحيح — O = OSPF.",
                  incorrectFeedback: "افحص السطر: «O عبر OSPF، و D عبر EIGRP».",
                  explanation: "C متصلة مباشرة، R عبر RIP، D عبر EIGRP.",
                },
              },
            },
            {
              id: "m27-l03-p05-r2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "اكتب أمر OSPF الذي يعلن الشبكة 192.168.1.0 في area 0 كما في صندوق R1 (الأمر كاملًا).", answer: `network ${NET1} ${WC24} area 0`,
                feedback: {
                  hints: ["صفحة «مثال OSPF — تعريفات R1»، السطر الثاني.", "network ثم الشبكة ثم wildcard ثم area 0."],
                  correctFeedback: "صحيح — network 192.168.1.0 0.0.0.255 area 0.",
                  incorrectFeedback: "افحص صندوق صفحة «مثال OSPF — تعريفات R1».",
                  explanation: "في OSPF تُكتب الشبكة مع wildcard ورقم area؛ في EIGRP تُكتب الشبكة وحدها.",
                },
              },
            },
            {
              id: "m27-l03-p05-r3", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي بروتوكول له أصغر AD بين OSPF و EIGRP و RIP؟",
                options: [opt("m27-l03-p05-r3-a", "EIGRP (90)", true), opt("m27-l03-p05-r3-b", "OSPF (110)"), opt("m27-l03-p05-r3-c", "RIP (120)")],
                feedback: {
                  hints: ["صفحة «Administrative Distance و METRIC».", "الأصغر أفضل."],
                  correctFeedback: "صحيح — EIGRP = 90.",
                  incorrectFeedback: "افحص صندوق AD في صفحة «Administrative Distance و METRIC».",
                  explanation: "RIP = 120 · OSPF = 110 · EIGRP = 90 · Static = 1 · Connected = 0.",
                },
              },
            },
          ],
        },
      ],
    },
  ],
};

export default m27;
