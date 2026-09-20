// Learning Materials — Batch 8 phase: REAL converted body for Book 791381, module m20 (the book's section
// «Wi-Fi · الشبكات اللاسلكية», source PDF 159–165; PDF 158 is the «الدفعة الخامسة · Wi-Fi و IPv6 و DHCP والأمان» batch
// cover). NEW stable id m20 (the next free id — the m05/m06 skeletons are the different sections «مرجع أوامر Cisco»
// (PDF 193–194) and «ACL» (PDF 227) that this batch does not reach), reading `order` 18: after m04 («Trunk و Router on
// a Stick», order 17) and before m21 («IPv6 والمنافذ», order 19).
// PDF 158 is the HARD START of the batch and is represented only by this module's coarse source range + sourceNote —
// never a learner page. Book-derived blocks are origin:"book": the PDF 159 DMZ definition + diagram roles + facts +
// «الفكرة», the PDF 160 Wi-Fi facts + «تذكّر», the PDF 161 wireless-types table + «احفظ من المثال», the PDF 162 SSID
// facts + «تذكّر», the PDF 163 security facts + «قاعدة», the PDF 164 WEP / WPA / WPA2-WPA3 rows + «للطالب», the PDF 165
// Access Point definition + diagram roles + facts + «تذكّر». Technical tokens (DMZ, Wi-Fi, Web, Mail, DNS, PAN, WLAN,
// WPAN, WWAN, Bluetooth, IR, 4G / 5G, SSID, Access Point, Spoofing, WEP, WPA, WPA2, WPA3, Switch, AP) are LTR spans;
// no arrow glyphs.
// SOURCE LEVEL: the book gives short definitions, a type table, the SSID / security / WEP-WPA facts and the Access
// Point role — no frequencies, channels, 802.11 standards, WPA key details or configuration steps. Nothing more is
// added; every clarification is a separate teacher note.
// SOURCE ORDER: nothing from PDF 166+ (IPv6, ports, DHCP) or PDF 180+ (Port Security, passwords) appears here.
// PRINTED PAGE = the rendered page circle = the PDF index (PDF 159 prints «159» … PDF 165 prints «165»).

import type { ContentModule, ContentSource, InlineSpan, PracticeOption, PracticeTableSelectCell } from "../../types";

const CID = "791381";
const src = (pdf: number, printed?: number): ContentSource => ({ kind: "book", sourceId: CID, pdfPageStart: pdf, printedPage: printed });
const L = (text: string): InlineSpan => ({ text, dir: "ltr", style: "code" });
const T = (text: string): InlineSpan => ({ text });
const opt = (id: string, text: string, correct?: true): PracticeOption => (correct ? { id, text, correct } : { id, text });
const TYPES = ["PAN", "WLAN", "WPAN", "WWAN"] as const;
const TY = (key: (typeof TYPES)[number]): PracticeTableSelectCell => ({ kind: "select", options: [...TYPES], key });
const LEVELS = ["ضعيف", "أفضل من WEP", "الأفضل"] as const;
const LV = (key: (typeof LEVELS)[number]): PracticeTableSelectCell => ({ kind: "select", options: [...LEVELS], key });

const m20: ContentModule = {
  id: "791381-m20",
  title: "Wi-Fi والشبكات اللاسلكية",
  shortTitle: "Wi-Fi",
  order: 18,
  source: { kind: "book", sourceId: CID, pdfPageStart: 158, pdfPageEnd: 165, sourceNote: "PDF 158 صفحة عنوان الدفعة الخامسة «Wi-Fi و IPv6 و DHCP والأمان» (بيانات وصفية فقط؛ لا تُعرض كصفحة تعلّم). صفحات التعلّم من PDF 159 إلى PDF 165. PDF 166 تبدأ وحدة «IPv6 والمنافذ» (m21)." },
  lessons: [
    // ── l01 — DMZ و Wi-Fi (PDF 159–161) ─────────────────────────────────────────────────────────────────────────
    {
      id: "791381-m20-l01",
      title: "DMZ و Wi-Fi",
      order: 1,
      pages: [
        // PDF 159 — DMZ — المنطقة العازلة
        {
          id: "791381-m20-l01-p01",
          title: "DMZ — المنطقة العازلة",
          order: 1,
          source: src(159, 159),
          keywords: ["DMZ", "المنطقة العازلة", "جدار حماية", "Web", "Mail", "DNS"],
          blocks: [
            {
              id: "m20-l01-p01-def", type: "callout", origin: "book", kind: "important",
              spans: [L("DMZ"), T(" منطقة بين الشبكة الداخلية والإنترنت.")],
            },
            {
              id: "m20-l01-p01-diagram", type: "list", origin: "book", variant: "cards", title: "كما في رسم الكتاب",
              items: [
                { id: "m20-l01-p01-d1", term: "الإنترنت", text: [T("خارج الشبكة؛ يمرّ عبر جدار حماية.")] },
                { id: "m20-l01-p01-d2", term: "DMZ — خدمات عامة", text: [L("Web"), T(" و "), L("Mail"), T(" و "), L("DNS"), T(".")] },
                { id: "m20-l01-p01-d3", term: "الشبكة الداخلية", text: [T("محمية خلف جدار حماية ثانٍ.")] },
                { id: "m20-l01-p01-d4", term: "الزائر", text: [T("يصل إلى "), L("DMZ"), T(" فقط، ولا يدخل الشبكة الداخلية.")] },
              ],
            },
            {
              id: "m20-l01-p01-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m20-l01-p01-f1", text: [T("تسمح بخدمات عامة مثل "), L("Web"), T(" و "), L("Mail"), T(" و "), L("DNS"), T(".")] },
                { id: "m20-l01-p01-f2", text: [T("تحمي الشبكة الداخلية من الوصول المباشر.")] },
                { id: "m20-l01-p01-f3", text: [T("مثال: وضع خادم الموقع في "), L("DMZ"), T(" لا داخل شبكة الموظفين.")] },
              ],
            },
            {
              id: "m20-l01-p01-idea", type: "callout", origin: "book", kind: "summary", title: "الفكرة",
              spans: [T("خدمات عامة متاحة للناس، والشبكة الداخلية تبقى محمية.")],
            },
            {
              id: "m20-l01-p01-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("في رسم الكتاب يوجد جداران للحماية: واحد بين الإنترنت و "), L("DMZ"), T("، وآخر بين "), L("DMZ"), T(" والشبكة الداخلية. لذلك حتى لو وصل زائر إلى خادم الموقع، تبقى أجهزة الموظفين خلف جدار آخر.")],
            },
            {
              id: "m20-l01-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أين يضع الكتاب خادم الموقع (Web) الذي يزوره الناس؟",
                options: [opt("m20-l01-p01-q1-a", "في DMZ، لا داخل شبكة الموظفين", true), opt("m20-l01-p01-q1-b", "داخل الشبكة الداخلية مع أجهزة الموظفين"), opt("m20-l01-p01-q1-c", "خارج جدار الحماية مباشرة على الإنترنت")],
                feedback: {
                  hints: ["الزائر يصل إلى منطقة واحدة فقط.", "الخدمات العامة (Web و Mail و DNS) تُوضع في المنطقة العازلة."],
                  correctFeedback: "صحيح — خادم الموقع في DMZ، والشبكة الداخلية تبقى محمية.",
                  incorrectFeedback: "افحص مثال الكتاب: «وضع خادم الموقع في DMZ لا داخل شبكة الموظفين».",
                  explanation: "DMZ منطقة بين الشبكة الداخلية والإنترنت تُوضع فيها الخدمات العامة، فيصل الزائر إليها فقط ولا يدخل الشبكة الداخلية.",
                },
              },
            },
            {
              id: "m20-l01-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "الزائر الذي يصل إلى DMZ يستطيع الدخول إلى الشبكة الداخلية أيضًا.", answer: false,
                feedback: {
                  hints: ["اقرأ الجملة تحت رسم الكتاب.", "الكلمة المفتاحية: «فقط»."],
                  correctFeedback: "صحيح — الزائر يصل إلى DMZ فقط ولا يدخل الشبكة الداخلية.",
                  incorrectFeedback: "افحص الرسم: «الزائر يصل إلى DMZ فقط — ولا يدخل الشبكة الداخلية».",
                  explanation: "هدف DMZ حماية الشبكة الداخلية من الوصول المباشر، فتبقى محمية خلف جدار الحماية.",
                },
              },
            },
          ],
        },
        // PDF 160 — Wi-Fi — الشبكة اللاسلكية
        {
          id: "791381-m20-l01-p02",
          title: "Wi-Fi — الشبكة اللاسلكية",
          order: 2,
          source: src(160, 160),
          keywords: ["Wi-Fi", "موجات الراديو", "التغطية", "التداخل", "الأمان"],
          blocks: [
            {
              id: "m20-l01-p02-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m20-l01-p02-f1", text: [T("تقنية اتصال بدون كابلات تعتمد على موجات الراديو.")] },
                { id: "m20-l01-p02-f2", text: [T("تسمح للأجهزة بالاتصال بالإنترنت ضمن التغطية.")] },
                { id: "m20-l01-p02-f3", text: [T("حسناتها: سهلة، مرنة، وتربط عدة أجهزة.")] },
                { id: "m20-l01-p02-f4", text: [T("عيوبها: المدى محدود، وقد تتأثر بالتداخل أو ضعف الأمان.")] },
              ],
            },
            {
              id: "m20-l01-p02-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [L("Wi-Fi"), T(" مناسب للحركة، لكنه يحتاج حماية جيدة.")],
            },
            {
              id: "m20-l01-p02-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("«ضمن التغطية» تعني أن الجهاز يجب أن يكون قريبًا بما يكفي من مصدر الإشارة؛ كلما ابتعدت ضعفت الإشارة، وهذا هو «المدى المحدود» الذي يذكره الكتاب.")],
            },
            {
              id: "m20-l01-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أيّ مما يلي من عيوب Wi-Fi كما يذكرها الكتاب؟",
                options: [opt("m20-l01-p02-q1-a", "المدى محدود وقد يتأثر بالتداخل أو ضعف الأمان", true), opt("m20-l01-p02-q1-b", "يحتاج كابلًا لكل جهاز"), opt("m20-l01-p02-q1-c", "لا يربط أكثر من جهاز واحد")],
                feedback: {
                  hints: ["الكتاب يذكر الحسنات ثم العيوب في سطرين.", "الحسنات: سهل ومرن ويربط عدة أجهزة؛ فما العيوب؟"],
                  correctFeedback: "صحيح — المدى محدود، والتداخل أو ضعف الأمان قد يؤثّران.",
                  incorrectFeedback: "افحص سطر «عيوبها» في الصفحة.",
                  explanation: "Wi-Fi يعمل بدون كابلات ويربط عدة أجهزة، لكن مداه محدود وقد يتأثر بالتداخل أو ضعف الأمان.",
                },
              },
            },
            {
              id: "m20-l01-p02-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "fillBlank", prompt: "Wi-Fi تقنية اتصال بدون كابلات تعتمد على موجات ______.", answers: ["الراديو", "راديو"],
                feedback: {
                  hints: ["ما الذي يحمل الإشارة في الهواء بدون كابل؟", "الكلمة في السطر الأول من الصفحة."],
                  correctFeedback: "صحيح — موجات الراديو.",
                  incorrectFeedback: "افحص السطر الأول: «تعتمد على موجات …».",
                  explanation: "الشبكة اللاسلكية تنقل البيانات عبر موجات الراديو بدل الكابلات.",
                },
              },
            },
          ],
        },
        // PDF 161 — أنواع الشبكات اللاسلكية
        {
          id: "791381-m20-l01-p03",
          title: "أنواع الشبكات اللاسلكية",
          order: 3,
          source: src(161, 161),
          keywords: ["PAN", "WLAN", "WPAN", "WWAN", "Bluetooth", "4G / 5G"],
          blocks: [
            {
              id: "m20-l01-p03-table", type: "table", origin: "book", caption: "أنواع الشبكات اللاسلكية كما في جدول الكتاب",
              headers: ["النوع", "الفكرة", "مثال"],
              rows: [
                ["PAN", "أجهزة قريبة جدًا", "هاتف وسماعة بلوتوث"],
                ["WLAN", "شبكة محلية لاسلكية", "بيت أو مدرسة"],
                ["WPAN", "اتصال شخصي لاسلكي", "Bluetooth / IR"],
                ["WWAN", "شبكة واسعة لاسلكية", "4G / 5G"],
              ],
              columnDirs: ["ltr", "rtl", "rtl"],
            },
            {
              id: "m20-l01-p03-remember", type: "callout", origin: "book", kind: "remember", title: "احفظ من المثال",
              spans: [L("WLAN"), T(" = بيت، "), L("WWAN"), T(" = خلوي، "), L("WPAN"), T(" = بلوتوث.")],
            },
            {
              id: "m20-l01-p03-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("الحرف "), L("W"), T(" في بداية الاسم يعني لاسلكي (Wireless): "), L("WLAN"), T(" شبكة محلية لاسلكية، و "), L("WWAN"), T(" شبكة واسعة لاسلكية. جدول الكتاب يذكر "), L("PAN"), T(" و "), L("WPAN"), T(" معًا، وكلاهما لأجهزة قريبة جدًا مثل الهاتف وسماعة البلوتوث.")],
            },
            {
              id: "m20-l01-p03-ws", type: "practice-table", origin: "teacher-enrichment", caption: "ورقة عمل: اختر نوع الشبكة اللاسلكية المناسب لكل مثال",
              headers: ["المثال", "النوع"],
              rows: [
                ["شبكة بيت أو مدرسة", TY("WLAN")],
                ["شبكة الهاتف الخلوي 4G / 5G", TY("WWAN")],
                ["هاتف وسماعة بلوتوث (Bluetooth / IR)", TY("WPAN")],
              ],
              columnDirs: ["rtl", "ltr"],
            },
            {
              id: "m20-l01-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما النوع الذي يصفه الكتاب بأنه «شبكة واسعة لاسلكية» ومثاله 4G / 5G؟",
                options: [opt("m20-l01-p03-q1-a", "WWAN", true), opt("m20-l01-p03-q1-b", "WLAN"), opt("m20-l01-p03-q1-c", "WPAN")],
                feedback: {
                  hints: ["الحرف الثاني يدل على المدى: محلي أم واسع؟", "احفظ من المثال: WWAN = خلوي."],
                  correctFeedback: "صحيح — WWAN شبكة واسعة لاسلكية مثل 4G / 5G.",
                  incorrectFeedback: "افحص الصف الأخير من جدول الكتاب.",
                  explanation: "WWAN = شبكة واسعة لاسلكية (الشبكة الخلوية)، WLAN = محلية لاسلكية (بيت أو مدرسة)، WPAN = اتصال شخصي لاسلكي (بلوتوث).",
                },
              },
            },
          ],
        },
      ],
    },
    // ── l02 — SSID وأمان الشبكة اللاسلكية (PDF 162–165) ───────────────────────────────────────────────────────
    {
      id: "791381-m20-l02",
      title: "SSID وأمان الشبكة اللاسلكية",
      order: 2,
      pages: [
        // PDF 162 — SSID — اسم شبكة Wi-Fi
        {
          id: "791381-m20-l02-p01",
          title: "SSID — اسم شبكة Wi-Fi",
          order: 1,
          source: src(162, 162),
          keywords: ["SSID", "اسم الشبكة", "Access Point", "إخفاء الشبكة"],
          blocks: [
            {
              id: "m20-l02-p01-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m20-l02-p01-f1", text: [L("SSID"), T(" هو اسم الشبكة اللاسلكية الذي يظهر للمستخدم.")] },
                { id: "m20-l02-p01-f2", text: [T("يبثّه الراوتر أو "), L("Access Point"), T(" ليجعل الشبكة مرئية.")] },
                { id: "m20-l02-p01-f3", text: [T("قد يحتوي على حروف وأرقام ورموز.")] },
                { id: "m20-l02-p01-f4", text: [T("يمكن إخفاؤه لزيادة الحماية، لكن كلمة المرور تبقى الأهم.")] },
              ],
            },
            {
              id: "m20-l02-p01-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [L("SSID"), T(" ليس كلمة السر، بل اسم الشبكة الذي تراه عند البحث.")],
            },
            {
              id: "m20-l02-p01-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("عندما تفتح قائمة شبكات "), L("Wi-Fi"), T(" على هاتفك، كل اسم تراه في القائمة هو "), L("SSID"), T(" لشبكة قريبة. إخفاؤه يجعل الشبكة لا تظهر في القائمة، لكنه ليس بديلًا عن كلمة مرور قوية.")],
            },
            {
              id: "m20-l02-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "SSID هو كلمة سر الشبكة اللاسلكية.", answer: false,
                feedback: {
                  hints: ["اقرأ صندوق «تذكّر».", "ما الذي تراه عند البحث عن الشبكات: اسمًا أم كلمة سر؟"],
                  correctFeedback: "صحيح — SSID اسم الشبكة الذي تراه عند البحث، وليس كلمة السر.",
                  incorrectFeedback: "افحص صندوق «تذكّر»: «SSID ليس كلمة السر».",
                  explanation: "SSID هو اسم الشبكة الذي يبثّه الراوتر أو Access Point ليجعلها مرئية؛ كلمة المرور شيء آخر وهي الأهم للحماية.",
                },
              },
            },
            {
              id: "m20-l02-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "بحسب الكتاب، ماذا يحدث عند إخفاء SSID؟",
                options: [opt("m20-l02-p01-q2-a", "تزيد الحماية قليلًا، لكن كلمة المرور تبقى الأهم", true), opt("m20-l02-p01-q2-b", "تصبح الشبكة محمية تمامًا ولا تحتاج كلمة مرور"), opt("m20-l02-p01-q2-c", "يتوقّف الراوتر عن العمل")],
                feedback: {
                  hints: ["السطر الأخير في قائمة الحقائق.", "الإخفاء يزيد الحماية، لكن ما الذي «يبقى الأهم»؟"],
                  correctFeedback: "صحيح — يمكن إخفاؤه لزيادة الحماية، لكن كلمة المرور تبقى الأهم.",
                  incorrectFeedback: "افحص السطر: «يمكن إخفاؤه لزيادة الحماية، لكن كلمة المرور تبقى الأهم».",
                  explanation: "إخفاء الاسم يمنع ظهور الشبكة في القائمة فقط؛ الحماية الحقيقية تأتي من كلمة مرور قوية وتشفير.",
                },
              },
            },
          ],
        },
        // PDF 163 — أمان الشبكة اللاسلكية
        {
          id: "791381-m20-l02-p02",
          title: "أمان الشبكة اللاسلكية",
          order: 2,
          source: src(163, 163),
          keywords: ["أمان", "التنصّت", "Spoofing", "تشفير", "كلمة مرور قوية"],
          blocks: [
            {
              id: "m20-l02-p02-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m20-l02-p02-f1", text: [T("الشبكات اللاسلكية أسهل في الاستهداف من السلكية.")] },
                { id: "m20-l02-p02-f2", text: [T("الخطر: التنصّت على البيانات أو الدخول دون إذن.")] },
                { id: "m20-l02-p02-f3", text: [T("قد تحدث هجمات "), L("Spoofing"), T(" لانتحال الهوية.")] },
                { id: "m20-l02-p02-f4", text: [T("لذلك يجب استعمال تشفير وكلمة مرور قوية.")] },
              ],
            },
            {
              id: "m20-l02-p02-rule", type: "callout", origin: "book", kind: "important", title: "قاعدة",
              spans: [T("لا تترك شبكة "), L("Wi-Fi"), T(" مفتوحة دون كلمة مرور أبدًا.")],
            },
            {
              id: "m20-l02-p02-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("لماذا «أسهل في الاستهداف»؟ لأن إشارة الراديو تصل إلى كل من في مدى التغطية، حتى خارج الغرفة أو المبنى، بينما الشبكة السلكية تحتاج توصيل كابل فعليًا. "), L("Spoofing"), T(" يعني أن مهاجمًا يتظاهر بأنه جهاز أو شبكة موثوقة.")],
            },
            {
              id: "m20-l02-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما الهجوم الذي يذكره الكتاب باسم «انتحال الهوية»؟",
                options: [opt("m20-l02-p02-q1-a", "Spoofing", true), opt("m20-l02-p02-q1-b", "SSID"), opt("m20-l02-p02-q1-c", "DMZ")],
                feedback: {
                  hints: ["الاسم مذكور في السطر الثالث من قائمة الحقائق.", "ليس اسم الشبكة ولا المنطقة العازلة."],
                  correctFeedback: "صحيح — هجمات Spoofing لانتحال الهوية.",
                  incorrectFeedback: "افحص السطر: «قد تحدث هجمات … لانتحال الهوية».",
                  explanation: "Spoofing = انتحال الهوية؛ لذلك يطلب الكتاب تشفيرًا وكلمة مرور قوية.",
                },
              },
            },
            {
              id: "m20-l02-p02-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "بحسب قاعدة الكتاب، يمكن ترك شبكة Wi-Fi مفتوحة بلا كلمة مرور إذا كانت في البيت.", answer: false,
                feedback: {
                  hints: ["اقرأ صندوق «قاعدة».", "الكلمة الأخيرة في القاعدة: «أبدًا»."],
                  correctFeedback: "صحيح — القاعدة: لا تترك شبكة Wi-Fi مفتوحة دون كلمة مرور أبدًا.",
                  incorrectFeedback: "افحص القاعدة: «… دون كلمة مرور أبدًا».",
                  explanation: "الشبكة اللاسلكية أسهل في الاستهداف، فالحماية بكلمة مرور وتشفير ضرورية في كل مكان.",
                },
              },
            },
          ],
        },
        // PDF 164 — تقنيات حماية Wi-Fi
        {
          id: "791381-m20-l02-p03",
          title: "تقنيات حماية Wi-Fi",
          order: 3,
          source: src(164, 164),
          keywords: ["WEP", "WPA", "WPA2", "WPA3", "تشفير"],
          blocks: [
            {
              id: "m20-l02-p03-table", type: "table", origin: "book", caption: "تقنيات حماية Wi-Fi كما في الكتاب",
              headers: ["التقنية", "الوصف", "التقييم"],
              rows: [
                ["WEP", "نظام قديم وضعيف، ولا يُوصى باستخدامه إطلاقًا.", "ضعيف"],
                ["WPA", "جاء لتحسين WEP، ويستعمل مفاتيح تتغيّر.", "أفضل من WEP"],
                ["WPA2 / WPA3", "الأحدث والأكثر أمانًا، ويُوصى باستخدامه حاليًا.", "الأفضل"],
              ],
              columnDirs: ["ltr", "rtl", "rtl"],
            },
            {
              id: "m20-l02-p03-tip", type: "callout", origin: "book", kind: "tip", title: "للطالب",
              spans: [T("إذا رأيت "), L("WPA2"), T(" أو "), L("WPA3"), T(" فهذا اختيار جيد وآمن.")],
            },
            {
              id: "m20-l02-p03-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("الترتيب من الأقدم إلى الأحدث: "), L("WEP"), T(" ثم "), L("WPA"), T(" ثم "), L("WPA2"), T(" ثم "), L("WPA3"), T(". «مفاتيح تتغيّر» تعني أن مفتاح التشفير لا يبقى ثابتًا كما في "), L("WEP"), T("، وهذا ما جعل "), L("WPA"), T(" أفضل.")],
            },
            {
              id: "m20-l02-p03-ws", type: "practice-table", origin: "teacher-enrichment", caption: "ورقة عمل: قيّم كل تقنية كما يقيّمها الكتاب",
              headers: ["التقنية", "التقييم"],
              rows: [
                ["WEP", LV("ضعيف")],
                ["WPA", LV("أفضل من WEP")],
                ["WPA2 / WPA3", LV("الأفضل")],
              ],
              columnDirs: ["ltr", "rtl"],
            },
            {
              id: "m20-l02-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أيّ تقنية يقول الكتاب إنه لا يُوصى باستخدامها إطلاقًا؟",
                options: [opt("m20-l02-p03-q1-a", "WEP", true), opt("m20-l02-p03-q1-b", "WPA2"), opt("m20-l02-p03-q1-c", "WPA3")],
                feedback: {
                  hints: ["الصف الأول في جدول الكتاب.", "التقييم: «ضعيف»."],
                  correctFeedback: "صحيح — WEP نظام قديم وضعيف.",
                  incorrectFeedback: "افحص الصف الموصوف بـ «نظام قديم وضعيف».",
                  explanation: "WEP ضعيف ولا يُوصى به؛ WPA أفضل منه؛ WPA2 / WPA3 الأحدث والأكثر أمانًا.",
                },
              },
            },
          ],
        },
        // PDF 165 — Access Point — نقطة الوصول (module closing page + review)
        {
          id: "791381-m20-l02-p04",
          title: "Access Point — نقطة الوصول",
          order: 4,
          source: src(165, 165),
          keywords: ["Access Point", "AP", "نقطة الوصول", "تغطية Wi-Fi", "Switch"],
          blocks: [
            {
              id: "m20-l02-p04-def", type: "callout", origin: "book", kind: "important",
              spans: [L("Access Point"), T(" جهاز يربط الأجهزة اللاسلكية بالشبكة.")],
            },
            {
              id: "m20-l02-p04-diagram", type: "list", origin: "book", variant: "cards", title: "كما في رسم الكتاب",
              items: [
                { id: "m20-l02-p04-d1", term: "Switch", text: [T("السويتش السلكي الذي تتصل به نقطة الوصول.")] },
                { id: "m20-l02-p04-d2", term: "AP", text: [T("نقطة الوصول تبثّ تغطية "), L("Wi-Fi"), T(".")] },
                { id: "m20-l02-p04-d3", term: "الأجهزة", text: [T("تتصل بالشبكة لاسلكيًا عبر نقطة الوصول.")] },
              ],
            },
            {
              id: "m20-l02-p04-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m20-l02-p04-f1", text: [T("ينشئ نقطة اتصال "), L("Wi-Fi"), T(" للأجهزة.")] },
                { id: "m20-l02-p04-f2", text: [T("يوسّع تغطية الشبكة ويحسّن الإشارة.")] },
                { id: "m20-l02-p04-f3", text: [T("يُستخدم في البيوت والشركات والفنادق والمقاهي.")] },
              ],
            },
            {
              id: "m20-l02-p04-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [L("Access Point"), T(" ليس الإنترنت نفسه، بل نقطة اتصال بالشبكة.")],
            },
            {
              id: "m20-l02-p04-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("في رسم الكتاب نقطة الوصول "), L("AP"), T(" موصولة بكابل إلى "), L("Switch"), T("، والأجهزة تصل إليها لاسلكيًا. فالجزء اللاسلكي هو فقط بين الأجهزة ونقطة الوصول، والباقي شبكة سلكية عادية.")],
            },
            {
              id: "m20-l02-p04-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما وظيفة Access Point كما يعرّفها الكتاب؟",
                options: [opt("m20-l02-p04-q1-a", "يربط الأجهزة اللاسلكية بالشبكة", true), opt("m20-l02-p04-q1-b", "هو الإنترنت نفسه"), opt("m20-l02-p04-q1-c", "يمنع الأجهزة من الاتصال بالشبكة")],
                feedback: {
                  hints: ["اقرأ تعريف الكتاب في أول الصفحة.", "صندوق «تذكّر» ينفي أنه الإنترنت نفسه."],
                  correctFeedback: "صحيح — Access Point جهاز يربط الأجهزة اللاسلكية بالشبكة.",
                  incorrectFeedback: "افحص التعريف: «جهاز يربط الأجهزة اللاسلكية بالشبكة».",
                  explanation: "نقطة الوصول تنشئ نقطة اتصال Wi-Fi وتوسّع التغطية؛ وهي نقطة اتصال بالشبكة، لا الإنترنت نفسه.",
                },
              },
            },
            { id: "m20-l02-p04-review", type: "heading", origin: "teacher-enrichment", text: "مراجعة الوحدة", level: 3 },
            {
              id: "m20-l02-p04-r1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما المنطقة التي تُوضع فيها الخدمات العامة مثل Web و Mail و DNS لتبقى الشبكة الداخلية محمية؟",
                options: [opt("m20-l02-p04-r1-a", "DMZ", true), opt("m20-l02-p04-r1-b", "WLAN"), opt("m20-l02-p04-r1-c", "SSID")],
                feedback: {
                  hints: ["الصفحة الأولى في هذه الوحدة.", "اسمها بالعربية «المنطقة العازلة»."],
                  correctFeedback: "صحيح — DMZ منطقة بين الشبكة الداخلية والإنترنت.",
                  incorrectFeedback: "افحص صفحة «DMZ — المنطقة العازلة».",
                  explanation: "DMZ تسمح بخدمات عامة وتحمي الشبكة الداخلية من الوصول المباشر.",
                },
              },
            },
            {
              id: "m20-l02-p04-r2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "اكتب اسم التقنية التي يصفها الكتاب بأنها الأحدث والأكثر أمانًا مع WPA3 (اكتب الاسم بالإنجليزية).", answer: "WPA2",
                feedback: {
                  hints: ["الصف الأخير في جدول تقنيات الحماية.", "الاسم يبدأ بـ WPA ويتبعه رقم."],
                  correctFeedback: "صحيح — WPA2 / WPA3 الأحدث والأكثر أمانًا.",
                  incorrectFeedback: "افحص جدول «تقنيات حماية Wi-Fi».",
                  explanation: "WPA2 / WPA3 هما الخيار الموصى به حاليًا؛ WEP ضعيف ولا يُوصى به.",
                },
              },
            },
            {
              id: "m20-l02-p04-r3", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "Access Point يوسّع تغطية الشبكة ويحسّن الإشارة.", answer: true,
                feedback: {
                  hints: ["اقرأ قائمة الحقائق في هذه الصفحة.", "السطر الثاني يتحدث عن التغطية والإشارة."],
                  correctFeedback: "صحيح — من وظائف نقطة الوصول توسيع التغطية وتحسين الإشارة.",
                  incorrectFeedback: "افحص السطر: «يوسّع تغطية الشبكة ويحسّن الإشارة».",
                  explanation: "نقطة الوصول تنشئ نقطة اتصال Wi-Fi وتوسّع تغطية الشبكة، وتُستخدم في البيوت والشركات والفنادق والمقاهي.",
                },
              },
            },
          ],
        },
      ],
    },
  ],
};

export default m20;
