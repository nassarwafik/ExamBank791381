// Learning Materials — Batch 8 phase: REAL converted body for Book 791381, module m22 (the book's section
// «بروتوكول DHCP», source PDF 169–179 — eleven pages under the running header «بروتوكول DHCP», no section cover).
// NEW stable id m22, reading `order` 20: after m21 («IPv6 والمنافذ», order 19) and before the m05 skeleton («مرجع
// أوامر Cisco», order 21). Book-derived blocks are origin:"book": the PDF 169 facts + «تذكّر», the PDF 170 four DORA
// stages + «احفظها بالترتيب», the PDF 171 example facts + «الفكرة», the PDF 172 / 173 «Cisco CLI» boxes (as `code`
// blocks with the book's exact command lines + the annotation tables) + «تذكّر», the PDF 174 command explanations +
// «تذكّر», the PDF 175 notes + «تذكّر», the PDF 176 server facts + «الفكرة», the PDF 177–179 three Packet Tracer steps.
// Technical tokens (DHCP, IP, Gateway, DNS, Discover / Offer / Request / ACK, DORA, the addresses, the commands,
// LAN, G0/0, APIPA, 169.254.x.x, Server, Packet Tracer, Services, On / Off, Default Gateway, DNS Server, Start IP,
// Add / Save, Static) are LTR spans; the DORA order is prose «ثم», never an arrow glyph.
// INTERACTIVE CLI (Batch 8): the three router pages carry declarative `simulation / cli-terminal / v1` exercises
// (guided on PDF 172, command challenges on PDF 173, a multi-step task on PDF 174) whose expected commands are the
// book's own lines; the interface name G0/0 comes from the book's PDF 174 explanation («interface G0/0»). Any
// simulated output is instructional simulation, never book content.
// SOURCE LEVEL: the book gives the DHCP idea, DORA, one router example with seven commands, four notes and the three
// server steps — no lease times, relay agents, DHCPv6 or `show` verification. Nothing more is added.
// SOURCE ORDER: nothing from PDF 180+ (Port Security, passwords, the command reference) appears here.
// PRINTED PAGE = the rendered page circle = the PDF index (PDF 169 prints «169» … PDF 179 prints «179»).

import type { ContentModule, ContentSource, InlineSpan, PracticeOption, PracticeTableSelectCell } from "../../types";
import type { CliExerciseConfig } from "../../../cli/types";

const CID = "791381";
const src = (pdf: number, printed?: number): ContentSource => ({ kind: "book", sourceId: CID, pdfPageStart: pdf, printedPage: printed });
const L = (text: string): InlineSpan => ({ text, dir: "ltr", style: "code" });
const T = (text: string): InlineSpan => ({ text });
const opt = (id: string, text: string, correct?: true): PracticeOption => (correct ? { id, text, correct } : { id, text });
/** A type-checked declarative CLI exercise as the opaque block `config` (data only; read defensively by the renderer). */
const EX = (exercise: CliExerciseConfig): Record<string, unknown> => ({ ...exercise });
const STAGES = ["Discover", "Offer", "Request", "ACK"] as const;
const ST = (key: (typeof STAGES)[number]): PracticeTableSelectCell => ({ kind: "select", options: [...STAGES], key });
const ROLES = ["نحدّد الواجهة المتصلة بالشبكة", "عنوان الراوتر داخل الشبكة", "يحدّد نطاق التوزيع", "تُعطى تلقائيًا للأجهزة"] as const;
const RO = (key: (typeof ROLES)[number]): PracticeTableSelectCell => ({ kind: "select", options: [...ROLES], key });

const GW = "192.168.1.254", MASK = "255.255.255.0", NET = "192.168.1.0", DNS = "8.8.8.8", EX_FROM = "192.168.1.1", EX_TO = "192.168.1.9";

const m22: ContentModule = {
  id: "791381-m22",
  title: "بروتوكول DHCP",
  shortTitle: "DHCP",
  order: 20,
  source: { kind: "book", sourceId: CID, pdfPageStart: 169, pdfPageEnd: 179, sourceNote: "إحدى عشرة صفحة تحت العنوان الجاري «بروتوكول DHCP» (PDF 169–179) بلا صفحة عنوان خاصة. PDF 168 آخر صفحة في وحدة IPv6 والمنافذ (m21)، و PDF 180 تبدأ قسم Port Security الذي لم يُحوَّل بعد." },
  lessons: [
    // ── l01 — ما هو DHCP (PDF 169–171) ─────────────────────────────────────────────────────────────────────────
    {
      id: "791381-m22-l01",
      title: "ما هو DHCP",
      order: 1,
      pages: [
        // PDF 169 — DHCP — مقدمة
        {
          id: "791381-m22-l01-p01",
          title: "DHCP — مقدمة",
          order: 1,
          source: src(169, 169),
          keywords: ["DHCP", "توزيع تلقائي", "IP", "Gateway", "DNS"],
          blocks: [
            {
              id: "m22-l01-p01-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m22-l01-p01-f1", text: [L("DHCP"), T(" يوزّع إعدادات الشبكة تلقائيًا على الأجهزة.")] },
                { id: "m22-l01-p01-f2", text: [T("يعطي عنوان "), L("IP"), T(" دون إدخال يدوي.")] },
                { id: "m22-l01-p01-f3", text: [T("يوزّع أيضًا "), L("Gateway"), T(" و "), L("DNS"), T(".")] },
                { id: "m22-l01-p01-f4", text: [T("يوفّر الوقت ويقلّل أخطاء الإعدادات.")] },
              ],
            },
            {
              id: "m22-l01-p01-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("بدون "), L("DHCP"), T(" نحتاج إدخال "), L("IP"), T(" يدويًا لكل جهاز على حدة.")],
            },
            {
              // ENRICHMENT (Batch 8; Reader follow-up: teacher-authorized unit-level enrichment showing the TWO DHCP
              // methods — router-as-DHCP or a dedicated DHCP server — both introduced in this unit, PDF 169–176).
              id: "m22-l01-p01-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m22/dhcp-automatic-config", motion: true,
              source: src(169),
              title: "مخطط: DHCP تلقائيًا — الراوتر أو خادم مخصّص",
              alt: "مخطط متحرّك يبيّن طريقتين لتوفير DHCP: الراوتر كخادم DHCP أو خادم DHCP مخصّص، وكلاهما يعطي الجهاز الجديد عنوان IP والبوابة وخادم DNS تلقائيًا بدل الإدخال اليدوي، دون عرض مراحل التبادل الأربع.",
              caption: "‏الراوتر أو خادم مخصّص — كلاهما يوزّع IP والبوابة و DNS تلقائيًا.",
            },
            {
              id: "m22-l01-p01-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("«إعدادات الشبكة» التي يوزّعها "), L("DHCP"), T(" هي نفس الأشياء التي تكتبها يدويًا عند إعداد حاسوب: عنوان "), L("IP"), T(" وقناع الشبكة و "), L("Gateway"), T(" و "), L("DNS"), T(". الفرق أنها تصل تلقائيًا.")],
            },
            {
              id: "m22-l01-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما الذي يوزّعه DHCP على الأجهزة بحسب الكتاب؟",
                options: [opt("m22-l01-p01-q1-a", "عنوان IP وكذلك Gateway و DNS تلقائيًا", true), opt("m22-l01-p01-q1-b", "أسماء الشبكات اللاسلكية فقط"), opt("m22-l01-p01-q1-c", "كابلات الشبكة")],
                feedback: {
                  hints: ["اقرأ السطرين الثاني والثالث في قائمة الحقائق.", "يعطي عنوانًا… ويوزّع أيضًا شيئين آخرين."],
                  correctFeedback: "صحيح — DHCP يعطي IP ويوزّع أيضًا Gateway و DNS.",
                  incorrectFeedback: "افحص قائمة الحقائق: «يعطي عنوان IP» و«يوزّع أيضًا Gateway و DNS».",
                  explanation: "DHCP يوزّع إعدادات الشبكة تلقائيًا، فيوفّر الوقت ويقلّل أخطاء الإعدادات.",
                },
              },
            },
            {
              id: "m22-l01-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "بدون DHCP يجب إدخال عنوان IP يدويًا لكل جهاز على حدة.", answer: true,
                feedback: {
                  hints: ["اقرأ صندوق «تذكّر».", "ماذا يحدث عندما لا يوجد توزيع تلقائي؟"],
                  correctFeedback: "صحيح — بدون DHCP نحتاج إدخال IP يدويًا لكل جهاز.",
                  incorrectFeedback: "افحص صندوق «تذكّر».",
                  explanation: "التوزيع التلقائي يغني عن الإدخال اليدوي، وهذا سبب توفير الوقت وتقليل الأخطاء.",
                },
              },
            },
          ],
        },
        // PDF 170 — مراحل عمل DHCP
        {
          id: "791381-m22-l01-p02",
          title: "مراحل عمل DHCP",
          order: 2,
          source: src(170, 170),
          keywords: ["Discover", "Offer", "Request", "ACK", "DORA"],
          blocks: [
            {
              id: "m22-l01-p02-stages", type: "list", origin: "book", variant: "ordered", title: "المراحل الأربع كما في رسم الكتاب (بين الجهاز وخادم DHCP)",
              items: [
                { id: "m22-l01-p02-s1", term: "Discover — اكتشاف", text: [T("الجهاز يبحث عن خادم "), L("DHCP"), T(".")] },
                { id: "m22-l01-p02-s2", term: "Offer — عرض", text: [T("الخادم يعرض عنوانًا على الجهاز.")] },
                { id: "m22-l01-p02-s3", term: "Request — طلب", text: [T("الجهاز يطلب العنوان المعروض.")] },
                { id: "m22-l01-p02-s4", term: "ACK — تأكيد", text: [T("الخادم يؤكّد، فيستعمل الجهاز العنوان.")] },
              ],
            },
            {
              id: "m22-l01-p02-caption", type: "callout", origin: "book", kind: "summary",
              spans: [T("الطلب يبدأ من الجهاز، والخادم يردّ في كل مرّة.")],
            },
            {
              id: "m22-l01-p02-remember", type: "callout", origin: "book", kind: "remember", title: "احفظها بالترتيب",
              spans: [L("Discover"), T(" ثم "), L("Offer"), T(" ثم "), L("Request"), T(" ثم "), L("ACK"), T(" (اختصارًا: "), L("DORA"), T(").")],
            },
            {
              // ENRICHMENT (Batch 6): SVG visual enrichment appended after the book content.
              id: "m22-l01-p02-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m22/dhcp-dora", motion: true,
              source: src(170),
              title: "مخطط: مراحل DHCP الأربع (DORA)",
              alt: "مخطط متحرّك للتبادل بين الجهاز وخادم DHCP: Discover و Request يخرجان من الجهاز، و Offer و ACK يعودان من الخادم، بالترتيب DORA.",
              caption: "‏الطلب يبدأ من الجهاز والخادم يردّ في كل مرحلة — DORA.",
            },
            {
              id: "m22-l01-p02-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("في رسم الكتاب السهمان الأول والثالث ("), L("Discover"), T(" و "), L("Request"), T(") يخرجان من الجهاز إلى الخادم، والسهمان الثاني والرابع ("), L("Offer"), T(" و "), L("ACK"), T(") يعودان من الخادم إلى الجهاز؛ لذلك «الخادم يردّ في كل مرّة». الوصف المختصر لكل مرحلة في القائمة أعلاه من شرح المعلّم للرسم.")],
            },
            {
              id: "m22-l01-p02-ws", type: "practice-table", origin: "teacher-enrichment", caption: "ورقة عمل: رتّب مراحل DHCP كما في DORA",
              headers: ["الرقم", "المرحلة"],
              rows: [
                ["1", ST("Discover")],
                ["2", ST("Offer")],
                ["3", ST("Request")],
                ["4", ST("ACK")],
              ],
              columnDirs: ["ltr", "ltr"],
            },
            {
              id: "m22-l01-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "من يبدأ عملية DHCP بحسب الكتاب؟",
                options: [opt("m22-l01-p02-q1-a", "الجهاز، والخادم يردّ في كل مرّة", true), opt("m22-l01-p02-q1-b", "الخادم، والجهاز يردّ في كل مرّة"), opt("m22-l01-p02-q1-c", "الراوتر بلا أي طلب من الجهاز")],
                feedback: {
                  hints: ["اقرأ الجملة تحت رسم الكتاب.", "المرحلة الأولى اسمها Discover — من يكتشف من؟"],
                  correctFeedback: "صحيح — الطلب يبدأ من الجهاز، والخادم يردّ في كل مرّة.",
                  incorrectFeedback: "افحص الجملة: «الطلب يبدأ من الجهاز، والخادم يردّ في كل مرّة».",
                  explanation: "Discover و Request من الجهاز؛ Offer و ACK من الخادم.",
                },
              },
            },
          ],
        },
        // PDF 171 — مثال DHCP على الراوتر
        {
          id: "791381-m22-l01-p03",
          title: "مثال DHCP على الراوتر",
          order: 3,
          source: src(171, 171),
          keywords: ["192.168.1.0/24", "192.168.1.10", "192.168.1.50", "192.168.1.254", "الراوتر كخادم DHCP"],
          blocks: [
            {
              id: "m22-l01-p03-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m22-l01-p03-f1", text: [T("نريد توزيع عناوين داخل شبكة "), L("192.168.1.0/24"), T(".")] },
                { id: "m22-l01-p03-f2", text: [T("العناوين توزَّع من "), L("192.168.1.10"), T(" حتى "), L("192.168.1.50"), T(".")] },
                { id: "m22-l01-p03-f3", text: [T("الراوتر سيكون "), L("Gateway"), T(" بعنوان "), L(GW), T(".")] },
                { id: "m22-l01-p03-f4", text: [T("الراوتر نفسه يعمل كخادم "), L("DHCP"), T(".")] },
              ],
            },
            {
              id: "m22-l01-p03-idea", type: "callout", origin: "book", kind: "summary", title: "الفكرة",
              spans: [T("جهاز واحد (الراوتر) يوزّع الإعدادات على كل أجهزة الشبكة.")],
            },
            {
              // ENRICHMENT (Batch 6): SVG visual enrichment appended after the book content.
              id: "m22-l01-p03-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m22/dhcp-pool-excluded", motion: false,
              source: src(171),
              title: "مخطط: نطاق توزيع DHCP في المثال",
              alt: "مخطط لمساحة العناوين 192.168.1.0/24 يبيّن نطاق توزيع DHCP في المثال من 192.168.1.10 إلى 192.168.1.50 فقط، والعناوين قبله وبعده ليست ضمن النطاق، والبوابة 192.168.1.254 خارج النطاق.",
              caption: "‏نطاق التوزيع في المثال من 192.168.1.10 إلى 192.168.1.50 فقط، والبوابة 192.168.1.254 خارجه.",
            },
            {
              id: "m22-l01-p03-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("هذا هو المثال الذي ستنفّذه بالأوامر في الصفحتين التاليتين: الشبكة "), L("192.168.1.0"), T(" بقناع "), L(MASK), T(" (هذا معنى "), L("/24"), T(")، والراوتر يحمل العنوان "), L(GW), T(" ويكون بوابة الأجهزة. نطاق التوزيع من "), L("192.168.1.10"), T(" إلى "), L("192.168.1.50"), T(" هو قرار التصميم في المثال.")],
            },
            {
              id: "m22-l01-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "ما عنوان الراوتر (Gateway) في مثال الكتاب؟", answer: GW,
                feedback: {
                  hints: ["السطر الثالث في قائمة الحقائق.", "ينتهي بالرقم 254."],
                  correctFeedback: "صحيح — الراوتر هو Gateway بعنوان 192.168.1.254.",
                  incorrectFeedback: "افحص السطر: «الراوتر سيكون Gateway بعنوان …».",
                  explanation: "في المثال الراوتر نفسه يعمل كخادم DHCP ويحمل العنوان 192.168.1.254 داخل الشبكة 192.168.1.0/24.",
                },
              },
            },
            {
              id: "m22-l01-p03-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "من أين إلى أين توزَّع العناوين في مثال الكتاب؟",
                options: [opt("m22-l01-p03-q2-a", "من 192.168.1.10 حتى 192.168.1.50", true), opt("m22-l01-p03-q2-b", "من 192.168.1.1 حتى 192.168.1.254"), opt("m22-l01-p03-q2-c", "من 192.168.1.254 حتى 192.168.1.255")],
                feedback: {
                  hints: ["السطر الثاني في قائمة الحقائق.", "النطاق يبدأ بـ 10."],
                  correctFeedback: "صحيح — من 192.168.1.10 حتى 192.168.1.50.",
                  incorrectFeedback: "افحص السطر: «العناوين توزَّع من … حتى …».",
                  explanation: "نطاق التوزيع في المثال من 192.168.1.10 حتى 192.168.1.50، والراوتر خارج النطاق بعنوان 192.168.1.254.",
                },
              },
            },
          ],
        },
      ],
    },
    // ── l02 — DHCP على الراوتر (PDF 172–175) ───────────────────────────────────────────────────────────────────
    {
      id: "791381-m22-l02",
      title: "DHCP على الراوتر",
      order: 2,
      pages: [
        // PDF 172 — DHCP على الراوتر — الجزء الأول (Cisco CLI box) + GUIDED CLI EXAMPLE
        {
          id: "791381-m22-l02-p01",
          title: "DHCP على الراوتر — الجزء الأول",
          order: 1,
          source: src(172, 172),
          keywords: ["ip address", "no shutdown", "ip dhcp pool LAN", "network", "Router(dhcp-config)#"],
          blocks: [
            {
              id: "m22-l02-p01-cli", type: "code", origin: "book", language: "cli",
              code: `Router(config-if)# ip address ${GW} ${MASK}\nRouter(config-if)# no shutdown\nRouter(config)# ip dhcp pool LAN\nRouter(dhcp-config)# network ${NET} ${MASK}`,
            },
            {
              id: "m22-l02-p01-cmds", type: "table", origin: "book",
              caption: "Cisco CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                [`Router(config-if)# ip address ${GW} ${MASK}`, "عنوان واجهة الراوتر (Gateway)"],
                ["Router(config-if)# no shutdown", "لتشغيل الواجهة"],
                ["Router(config)# ip dhcp pool LAN", "ينشئ مجموعة توزيع"],
                [`Router(dhcp-config)# network ${NET} ${MASK}`, "الشبكة التي سنوزّع منها"],
              ],
            },
            {
              id: "m22-l02-p01-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("عنوان الراوتر غالبًا يكون البوابة الافتراضية للأجهزة.")],
            },
            {
              id: "m22-l02-p01-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("لاحظ تغيّر المؤشّر في صندوق الكتاب: "), L("Router(config-if)#"), T(" يعني أنك داخل واجهة (يذكر الكتاب في صفحة شرح الأوامر أنها "), L("interface G0/0"), T(")، و "), L("Router(config)#"), T(" يعني وضع الإعداد العام، و "), L("Router(dhcp-config)#"), T(" يعني أنك داخل مجموعة التوزيع "), L("LAN"), T(". في المحاكي أدناه ستنتقل بين هذه الأوضاع بنفسك.")],
            },
            {
              id: "m22-l02-p01-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مثال موجّه: نفّذ الجزء الأول في محاكي سطر الأوامر",
              description: "اكتب كل أمر كما في صندوق الكتاب ثم اضغط Enter. المحاكي يتحقّق من الوضع الذي أنت فيه ومن الأمر، ويعطيك تلميحين عند الحاجة. محاكاة تعليمية مبسّطة، ليست جهازًا حقيقيًا.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "المثال الموجّه: من وضع المستخدم ادخل إلى الوضع المتقدّم ثم الإعداد العام، اختر الواجهة G0/0، أعطها العنوان 192.168.1.254 بالقناع 255.255.255.0 وشغّلها، ثم أنشئ مجموعة التوزيع LAN وحدّد الشبكة 192.168.1.0 بالقناع 255.255.255.0." },
              config: EX({
                kind: "guided",
                device: "router",
                intro: "نفّذ خطوات الجزء الأول كما في صندوق الكتاب. الواجهة المتصلة بالشبكة هي G0/0 (كما في صفحة شرح الأوامر).",
                steps: [
                  { id: "s1", instruction: "انتقل إلى وضع الأوامر المتقدّم", expect: { mode: "privileged" }, success: "✓ أحسنت، انتقلت إلى وضع الأوامر المتقدّم", hints: ["هذا هو الأمر الأول الذي يكتبه التقني عند فتح الجهاز، ويغيّر المؤشّر من > إلى #.", "الأمر كلمة واحدة تبدأ بـ en."] },
                  { id: "s2", instruction: "انتقل إلى وضع الإعداد العام", expect: { mode: "global" }, success: "✓ أحسنت، انتقلت إلى وضع الإعداد العام", hints: ["من الوضع المتقدّم تدخل إلى الإعداد بأمر من كلمتين، ويصبح المؤشّر (config)#.", "الأمر يبدأ بـ configure."] },
                  { id: "s3", instruction: "اختر الواجهة G0/0 المتصلة بالشبكة", expect: { command: "interface", args: { interfaces: ["g0/0"] } }, success: "✓ أحسنت، أنت الآن في وضع إعداد الواجهة", hints: ["أمر اختيار الواجهة مذكور في صفحة شرح الأوامر.", "الأمر يبدأ بـ interface ويليه اسم الواجهة."] },
                  { id: "s4", instruction: "أعطِ الواجهة عنوان الراوتر 192.168.1.254 بالقناع 255.255.255.0", expect: { command: "ip-address", args: { address: GW, mask: MASK } }, hints: ["السطر الأول في صندوق الكتاب.", "الأمر يبدأ بـ ip address ثم العنوان ثم القناع."] },
                  { id: "s5", instruction: "شغّل الواجهة", expect: { command: "no-shutdown" }, hints: ["السطر الثاني في صندوق الكتاب.", "كلمتان: no ثم اسم حالة الإطفاء."] },
                  { id: "s6", instruction: "عد إلى وضع الإعداد العام", expect: { mode: "global" }, success: "✓ أحسنت، عدت إلى وضع الإعداد العام", hints: ["أمر الخروج من الواجهة إلى الوضع الذي قبلها.", "الأمر كلمة واحدة تبدأ بـ ex."] },
                  { id: "s7", instruction: "أنشئ مجموعة توزيع باسم LAN", expect: { command: "ip-dhcp-pool", args: { name: "LAN" } }, success: "✓ أحسنت، أنت الآن داخل مجموعة التوزيع", hints: ["السطر الثالث في صندوق الكتاب.", "الأمر يبدأ بـ ip dhcp pool ويليه الاسم."] },
                  { id: "s8", instruction: "حدّد الشبكة التي سنوزّع منها: 192.168.1.0 بالقناع 255.255.255.0", expect: { command: "network", args: { address: NET, mask: MASK } }, hints: ["السطر الأخير في صندوق الكتاب.", "الأمر يبدأ بـ network ثم عنوان الشبكة ثم القناع."] },
                ],
                completion: "✓ أحسنت، أنهيت الجزء الأول كما في الكتاب. الجزء الثاني في الصفحة التالية.",
              }),
            },
            {
              id: "m22-l02-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما الأمر الذي ينشئ مجموعة توزيع باسم LAN؟",
                options: [opt("m22-l02-p01-q1-a", "ip dhcp pool LAN", true), opt("m22-l02-p01-q1-b", "network LAN"), opt("m22-l02-p01-q1-c", "no shutdown LAN")],
                feedback: {
                  hints: ["السطر الثالث في صندوق الكتاب.", "الأمر يُكتب في وضع الإعداد العام (config)#."],
                  correctFeedback: "صحيح — ip dhcp pool LAN ينشئ مجموعة توزيع.",
                  incorrectFeedback: "افحص جدول الأوامر: «ينشئ مجموعة توزيع».",
                  explanation: "بعد هذا الأمر يصبح المؤشّر Router(dhcp-config)# وتُكتب فيه أوامر المجموعة مثل network.",
                },
              },
            },
            {
              id: "m22-l02-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "الأمر no shutdown يطفئ الواجهة.", answer: false,
                feedback: {
                  hints: ["اقرأ الشرح المقابل للسطر الثاني في الجدول.", "الكلمة no تنفي الإطفاء."],
                  correctFeedback: "صحيح — no shutdown يشغّل الواجهة.",
                  incorrectFeedback: "افحص جدول الأوامر: «لتشغيل الواجهة».",
                  explanation: "shutdown يطفئ الواجهة، و no shutdown يلغي الإطفاء أي يشغّلها.",
                },
              },
            },
          ],
        },
        // PDF 173 — DHCP على الراوتر — الجزء الثاني (Cisco CLI box) + COMMAND CHALLENGES
        {
          id: "791381-m22-l02-p02",
          title: "DHCP على الراوتر — الجزء الثاني",
          order: 2,
          source: src(173, 173),
          keywords: ["default-router", "dns-server", "ip dhcp excluded-address", "8.8.8.8"],
          blocks: [
            {
              id: "m22-l02-p02-cli", type: "code", origin: "book", language: "cli",
              code: `Router(dhcp-config)# default-router ${GW}\nRouter(dhcp-config)# dns-server ${DNS}\nRouter(config)# ip dhcp excluded-address ${EX_FROM} ${EX_TO}`,
            },
            {
              id: "m22-l02-p02-cmds", type: "table", origin: "book",
              caption: "Cisco CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                [`Router(dhcp-config)# default-router ${GW}`, "يحدّد Gateway للأجهزة"],
                [`Router(dhcp-config)# dns-server ${DNS}`, "يحدّد خادم DNS"],
                [`Router(config)# ip dhcp excluded-address ${EX_FROM} ${EX_TO}`, "يستثني عناوين من التوزيع"],
              ],
            },
            {
              id: "m22-l02-p02-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("نستثني غالبًا عناوين الراوتر والسيرفرات والطابعات حتى لا يأخذها جهاز عادي.")],
            },
            {
              id: "m22-l02-p02-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("الأمران الأولان يُكتبان داخل مجموعة التوزيع ("), L("Router(dhcp-config)#"), T(")، أما أمر الاستثناء فيُكتب في وضع الإعداد العام ("), L("Router(config)#"), T(") — لاحظ اختلاف المؤشّر في الصندوق. لذلك تخرج من المجموعة قبل كتابته.")],
            },
            {
              id: "m22-l02-p02-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "تحدّي الأمر: أكمل الجزء الثاني بنفسك",
              description: "أنت داخل مجموعة التوزيع LAN بعد الجزء الأول. اكتب الأمر المطلوب في كل سؤال؛ المحاكي يخبرك إن كان صحيحًا أو إن كنت في الوضع غير المناسب، دون كشف الإجابة. محاكاة تعليمية مبسّطة.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "التحدّي: حدّد Gateway للأجهزة بعنوان 192.168.1.254، ثم خادم DNS بعنوان 8.8.8.8، ثم — من وضع الإعداد العام — استثنِ العناوين من 192.168.1.1 إلى 192.168.1.9." },
              config: EX({
                kind: "challenge",
                device: "router",
                startMode: "dhcp",
                startPool: "LAN",
                preset: { interfaces: { "g0/0": { ipAddress: GW, subnetMask: MASK, shutdown: false } }, dhcpPools: { LAN: { network: NET, mask: MASK } } },
                intro: "أنت الآن داخل مجموعة التوزيع LAN بعد الجزء الأول. اكتب الأمر المطلوب في كل سؤال.",
                steps: [
                  { id: "c1", instruction: "اكتب الأمر الذي يحدّد Gateway للأجهزة بعنوان 192.168.1.254", expect: { command: "default-router", args: { address: GW } }, hints: ["اسم الأمر يعني «الراوتر الافتراضي» بالإنجليزية، ويُكتب داخل المجموعة.", "الأمر يبدأ بـ default- ويليه العنوان."] },
                  { id: "c2", instruction: "اكتب الأمر الذي يحدّد خادم DNS بعنوان 8.8.8.8", expect: { command: "dns-server", args: { addresses: [DNS] } }, hints: ["الأمر يحمل اسم الخدمة التي تحوّل اسم الموقع إلى IP.", "الأمر يبدأ بـ dns- ويليه العنوان."] },
                  { id: "c3", instruction: "عد إلى وضع الإعداد العام ثم اكتب الأمر الذي يستثني العناوين من 192.168.1.1 إلى 192.168.1.9 من التوزيع", expect: { command: "ip-dhcp-excluded-address", args: { from: EX_FROM, to: EX_TO } }, hints: ["هذا الأمر لا يُكتب داخل المجموعة؛ اخرج أولًا إلى وضع الإعداد العام (config)#.", "الأمر يبدأ بـ ip dhcp excluded-address ويليه عنوان البداية ثم عنوان النهاية."] },
                ],
                allowed: ["default-router", "dns-server", "ip-dhcp-excluded-address"],
                completion: "✓ صحيح في كل الأوامر — أكملت الجزء الثاني كما في الكتاب.",
              }),
            },
            {
              id: "m22-l02-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "لماذا نستثني عناوين من التوزيع بحسب الكتاب؟",
                options: [opt("m22-l02-p02-q1-a", "حتى لا يأخذ جهاز عادي عناوين الراوتر والسيرفرات والطابعات", true), opt("m22-l02-p02-q1-b", "لتسريع الشبكة"), opt("m22-l02-p02-q1-c", "لأن DHCP لا يعمل بدون استثناء")],
                feedback: {
                  hints: ["اقرأ صندوق «تذكّر».", "أي الأجهزة تحتاج عناوين ثابتة لا تتغيّر؟"],
                  correctFeedback: "صحيح — نستثني عناوين الراوتر والسيرفرات والطابعات.",
                  incorrectFeedback: "افحص صندوق «تذكّر» في هذه الصفحة.",
                  explanation: "العناوين المستثناة لا توزَّع على الأجهزة، فتبقى للراوتر والسيرفرات والطابعات.",
                },
              },
            },
            {
              id: "m22-l02-p02-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "ما عنوان خادم DNS في صندوق الكتاب؟", answer: DNS,
                feedback: {
                  hints: ["السطر الثاني في صندوق الكتاب.", "أربعة أرقام متساوية."],
                  correctFeedback: "صحيح — dns-server 8.8.8.8.",
                  incorrectFeedback: "افحص السطر: «dns-server …».",
                  explanation: "الأمر dns-server داخل المجموعة يحدّد خادم DNS الذي تحصل عليه الأجهزة تلقائيًا.",
                },
              },
            },
          ],
        },
        // PDF 174 — شرح أوامر DHCP + MULTI-STEP CONFIGURATION TASK
        {
          id: "791381-m22-l02-p03",
          title: "شرح أوامر DHCP",
          order: 3,
          source: src(174, 174),
          keywords: ["interface G0/0", "ip address", "network", "default-router", "dns-server", "وظيفة كل أمر"],
          blocks: [
            {
              id: "m22-l02-p03-lead", type: "text", origin: "book",
              spans: [T("وظيفة كل أمر من أوامر "), L("DHCP"), T(" باختصار.")],
            },
            {
              id: "m22-l02-p03-roles", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m22-l02-p03-r1", term: "interface G0/0", text: [T("نحدّد الواجهة المتصلة بالشبكة.")] },
                { id: "m22-l02-p03-r2", term: "ip address", text: [T("عنوان الراوتر داخل الشبكة.")] },
                { id: "m22-l02-p03-r3", term: "network", text: [T("يحدّد نطاق التوزيع.")] },
                { id: "m22-l02-p03-r4", term: "default-router و dns-server", text: [T("تُعطى تلقائيًا.")] },
              ],
            },
            {
              id: "m22-l02-p03-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("لا تحفظ الأوامر فقط، بل افهم وظيفة كل أمر ومتى يُستخدم.")],
            },
            {
              id: "m22-l02-p03-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("«تُعطى تلقائيًا» تعني أن الأجهزة تستلم قيم "), L("default-router"), T(" و "), L("dns-server"), T(" ضمن إعدادات "), L("DHCP"), T(" دون أن يكتبها أحد على الحاسوب. المهمة أدناه تجمع أوامر الصفحتين السابقتين في إعداد واحد كامل.")],
            },
            {
              id: "m22-l02-p03-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مهمة إعداد: أعدّ DHCP على الراوتر كاملًا",
              description: "ابدأ من وضع المستخدم ونفّذ الجزء الأول والثاني بنفسك بأي ترتيب صحيح. تكتمل المهمة فقط عندما تصبح كل الإعدادات المطلوبة موجودة على الراوتر. محاكاة تعليمية مبسّطة.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "المهمة: الواجهة G0/0 بالعنوان 192.168.1.254 والقناع 255.255.255.0 ومشغّلة؛ مجموعة التوزيع LAN بالشبكة 192.168.1.0 والقناع 255.255.255.0، البوابة 192.168.1.254، وخادم DNS 8.8.8.8؛ والعناوين من 192.168.1.1 إلى 192.168.1.9 مستثناة." },
              config: EX({
                kind: "task",
                device: "router",
                intro: "أعدّ DHCP على الراوتر كاملًا بنفسك (الجزء الأول والثاني). تكتمل المهمة عندما تتحقّق كل النقاط التالية:",
                goals: [
                  { id: "g1", label: "الواجهة G0/0 تحمل العنوان 192.168.1.254", condition: { kind: "interface", name: "g0/0", prop: "ipAddress", value: GW } },
                  { id: "g2", label: "قناع الواجهة G0/0 هو 255.255.255.0", condition: { kind: "interface", name: "g0/0", prop: "subnetMask", value: MASK } },
                  { id: "g3", label: "الواجهة G0/0 مشغّلة", condition: { kind: "interface", name: "g0/0", prop: "shutdown", value: false } },
                  { id: "g4", label: "مجموعة التوزيع LAN تحدّد الشبكة 192.168.1.0", condition: { kind: "dhcp-pool", name: "LAN", prop: "network", value: NET } },
                  { id: "g5", label: "Gateway للأجهزة هو 192.168.1.254", condition: { kind: "dhcp-pool", name: "LAN", prop: "defaultRouter", value: GW } },
                  { id: "g6", label: "خادم DNS للأجهزة هو 8.8.8.8", condition: { kind: "dhcp-pool", name: "LAN", prop: "dnsServers", value: [DNS] } },
                  { id: "g7", label: "العناوين من 192.168.1.1 إلى 192.168.1.9 مستثناة من التوزيع", condition: { kind: "dhcp-excluded", from: EX_FROM, to: EX_TO } },
                ],
                hints: ["ابدأ بالانتقال إلى وضع الإعداد العام، ثم راجع صندوقي الكتاب في الصفحتين السابقتين: أوامر الواجهة أولًا ثم أوامر المجموعة.", "تسلسل الأوضاع: interface G0/0 لأوامر الواجهة، ثم exit، ثم ip dhcp pool LAN لأوامر المجموعة، ثم exit قبل أمر الاستثناء."],
                completion: "✓ أحسنت، الإعداد المطلوب مكتمل: الواجهة، المجموعة، البوابة، DNS، والعناوين المستثناة.",
              }),
            },
            {
              id: "m22-l02-p03-ws", type: "practice-table", origin: "teacher-enrichment", caption: "ورقة عمل: ما وظيفة كل أمر؟ (اعتمد على شرح الكتاب)",
              headers: ["الأمر", "الوظيفة"],
              rows: [
                ["interface G0/0", RO("نحدّد الواجهة المتصلة بالشبكة")],
                ["ip address", RO("عنوان الراوتر داخل الشبكة")],
                ["network", RO("يحدّد نطاق التوزيع")],
                ["default-router و dns-server", RO("تُعطى تلقائيًا للأجهزة")],
              ],
              columnDirs: ["ltr", "rtl"],
            },
            {
              id: "m22-l02-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما الأمر الذي يحدّد نطاق التوزيع بحسب شرح الكتاب؟",
                options: [opt("m22-l02-p03-q1-a", "network", true), opt("m22-l02-p03-q1-b", "ip address"), opt("m22-l02-p03-q1-c", "interface G0/0")],
                feedback: {
                  hints: ["البطاقة الثالثة في شرح الأوامر.", "يُكتب داخل مجموعة التوزيع ويليه عنوان الشبكة والقناع."],
                  correctFeedback: "صحيح — network يحدّد نطاق التوزيع.",
                  incorrectFeedback: "افحص شرح الكتاب: «network: يحدّد نطاق التوزيع».",
                  explanation: "ip address عنوان الراوتر داخل الشبكة، interface G0/0 يحدّد الواجهة، و network يحدّد نطاق التوزيع.",
                },
              },
            },
          ],
        },
        // PDF 175 — DHCP — ملاحظات مهمة
        {
          id: "791381-m22-l02-p04",
          title: "DHCP — ملاحظات مهمة",
          order: 4,
          source: src(175, 175),
          keywords: ["العناوين المستثناة", "إعادة الاستخدام", "مدة العنوان", "APIPA", "169.254.x.x"],
          blocks: [
            {
              id: "m22-l02-p04-lead", type: "text", origin: "book",
              spans: [T("نقاط مهمة عند العمل مع "), L("DHCP"), T(".")],
            },
            {
              id: "m22-l02-p04-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m22-l02-p04-f1", text: [T("العناوين المستثناة لا توزَّع على الأجهزة.")] },
                { id: "m22-l02-p04-f2", text: [T("الراوتر يعيد استخدام العناوين غير المستعملة.")] },
                { id: "m22-l02-p04-f3", text: [T("إذا انتهت مدة العنوان يجدّده الجهاز. وإذا فشل "), L("DHCP"), T(" يأخذ "), L("APIPA"), T(".")] },
              ],
            },
            {
              id: "m22-l02-p04-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("عنوان "), L("APIPA"), T(" غالبًا يبدأ بـ "), L("169.254.x.x"), T("، وهو إشارة لمشكلة في "), L("DHCP"), T(".")],
            },
            {
              id: "m22-l02-p04-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("«مدة العنوان» تعني أن العنوان الذي يعطيه "), L("DHCP"), T(" ليس دائمًا؛ له مدة صلاحية، وبعدها يطلب الجهاز تجديده. وإذا لم يجد الجهاز خادم "), L("DHCP"), T(" أصلًا فإنه يعطي نفسه عنوانًا يبدأ بـ "), L("169.254"), T(" — فرؤية هذا العنوان على حاسوب تعني أن التوزيع لم ينجح.")],
            },
            {
              id: "m22-l02-p04-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "حاسوب حصل على عنوان يبدأ بـ 169.254. ماذا يعني ذلك بحسب الكتاب؟",
                options: [opt("m22-l02-p04-q1-a", "إشارة لمشكلة في DHCP (عنوان APIPA)", true), opt("m22-l02-p04-q1-b", "أن DHCP نجح وأعطاه عنوانًا من النطاق"), opt("m22-l02-p04-q1-c", "أن العنوان مستثنى من التوزيع")],
                feedback: {
                  hints: ["اقرأ صندوق «تذكّر».", "ما اسم العنوان الذي يأخذه الجهاز إذا فشل DHCP؟"],
                  correctFeedback: "صحيح — 169.254.x.x عنوان APIPA، وهو إشارة لمشكلة في DHCP.",
                  incorrectFeedback: "افحص صندوق «تذكّر»: «عنوان APIPA غالبًا يبدأ بـ 169.254.x.x».",
                  explanation: "إذا فشل DHCP يأخذ الجهاز عنوان APIPA، فالعنوان 169.254.x.x يدل على أن التوزيع لم ينجح.",
                },
              },
            },
            {
              id: "m22-l02-p04-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "العناوين المستثناة يمكن أن توزَّع على الأجهزة إذا نفدت العناوين الأخرى.", answer: false,
                feedback: {
                  hints: ["السطر الأول في قائمة النقاط.", "كلمة «لا» في الجملة حاسمة."],
                  correctFeedback: "صحيح — العناوين المستثناة لا توزَّع على الأجهزة.",
                  incorrectFeedback: "افحص السطر: «العناوين المستثناة لا توزَّع على الأجهزة».",
                  explanation: "الاستثناء يحجز العناوين للراوتر والسيرفرات والطابعات، فلا توزَّع أبدًا.",
                },
              },
            },
          ],
        },
      ],
    },
    // ── l03 — DHCP عن طريق Server (PDF 176–179) ────────────────────────────────────────────────────────────────
    {
      id: "791381-m22-l03",
      title: "DHCP عن طريق Server",
      order: 3,
      pages: [
        // PDF 176 — DHCP عن طريق Server
        {
          id: "791381-m22-l03-p01",
          title: "DHCP عن طريق Server",
          order: 1,
          source: src(176, 176),
          keywords: ["Server", "192.168.10.0/24", "Packet Tracer", "جهاز مركزي"],
          blocks: [
            {
              id: "m22-l03-p01-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m22-l03-p01-f1", text: [T("يمكن توزيع العناوين من سيرفر بدل الراوتر.")] },
                { id: "m22-l03-p01-f2", text: [T("نحدّد الشبكة مثل "), L("192.168.10.0/24"), T(".")] },
                { id: "m22-l03-p01-f3", text: [T("ندخل "), L("Gateway"), T(" و "), L("DNS"), T(" وبداية العناوين.")] },
                { id: "m22-l03-p01-f4", text: [L("Packet Tracer"), T(" يسمح بتجربة ذلك بسهولة.")] },
              ],
            },
            {
              id: "m22-l03-p01-idea", type: "callout", origin: "book", kind: "summary", title: "الفكرة",
              spans: [T("نفس المبدأ: جهاز مركزي يوزّع إعدادات الشبكة على الأجهزة.")],
            },
            {
              // ENRICHMENT (Batch 8): SVG visual enrichment appended after the book content.
              id: "m22-l03-p01-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m22/dedicated-dhcp-server", motion: false,
              source: src(176),
              title: "مخطط: توزيع DHCP من خادم مخصّص",
              alt: "مخطط: خادم مخصّص يوزّع الإعدادات تلقائيًا عبر السويتش على أجهزة شبكة 192.168.10.0/24، دون إعادة رسم واجهة Packet Tracer.",
              caption: "‏خادم مخصّص يوزّع إعدادات شبكة 192.168.10.0/24 على الأجهزة.",
            },
            {
              id: "m22-l03-p01-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("في الراوتر كتبنا الإعدادات بالأوامر؛ في السيرفر داخل "), L("Packet Tracer"), T(" ندخل القيم نفسها (الشبكة و "), L("Gateway"), T(" و "), L("DNS"), T(" وبداية العناوين) في نافذة إعدادات بدل سطر الأوامر. الصفحات الثلاث التالية تشرح الخطوات.")],
            },
            {
              id: "m22-l03-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما الذي يجمع بين DHCP على الراوتر و DHCP على السيرفر بحسب «الفكرة»؟",
                options: [opt("m22-l03-p01-q1-a", "جهاز مركزي يوزّع إعدادات الشبكة على الأجهزة", true), opt("m22-l03-p01-q1-b", "كلاهما يحتاج إدخال العناوين يدويًا على كل حاسوب"), opt("m22-l03-p01-q1-c", "لا شيء مشترك بينهما")],
                feedback: {
                  hints: ["اقرأ صندوق «الفكرة».", "كلمة «مركزي» هي المفتاح."],
                  correctFeedback: "صحيح — نفس المبدأ: جهاز مركزي يوزّع الإعدادات.",
                  incorrectFeedback: "افحص صندوق «الفكرة»: «نفس المبدأ…».",
                  explanation: "سواء كان الراوتر أو السيرفر، جهاز واحد مركزي يوزّع IP و Gateway و DNS على الأجهزة.",
                },
              },
            },
            {
              id: "m22-l03-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "fillBlank", prompt: "الشبكة التي يذكرها الكتاب مثالًا للتوزيع من السيرفر هي 192.168.10.0/____.", answers: ["24"],
                feedback: {
                  hints: ["السطر الثاني في قائمة الحقائق.", "نفس طول القناع الذي رأيته في مثال الراوتر."],
                  correctFeedback: "صحيح — 192.168.10.0/24.",
                  incorrectFeedback: "افحص السطر: «نحدّد الشبكة مثل …».",
                  explanation: "/24 يعني قناع 255.255.255.0، كما في مثال الراوتر 192.168.1.0/24.",
                },
              },
            },
          ],
        },
        // PDF 177 — خطوة 1: الدخول للسيرفر
        {
          id: "791381-m22-l03-p02",
          title: "خطوة 1: الدخول للسيرفر",
          order: 2,
          source: src(177, 177),
          keywords: ["Server", "Services", "DHCP Service", "Packet Tracer"],
          blocks: [
            {
              id: "m22-l03-p02-lead", type: "text", origin: "book",
              spans: [T("نبدأ بإعداد خدمة "), L("DHCP"), T(" على السيرفر.")],
            },
            {
              id: "m22-l03-p02-diagram", type: "list", origin: "book", variant: "cards", title: "كما في رسم الكتاب",
              items: [
                { id: "m22-l03-p02-d1", term: "جهاز Server", text: [L("DHCP Service"), T(" — الخادم يوزّع عناوين "), L("IP"), T(".")] },
                { id: "m22-l03-p02-d2", term: "Switch", text: [T("يربط الخادم بأجهزة الشبكة.")] },
                { id: "m22-l03-p02-d3", term: "المسار", text: [T("نفتح الخادم ثم تبويب "), L("Services"), T(" ثم خدمة "), L("DHCP"), T(".")] },
              ],
            },
            {
              id: "m22-l03-p02-facts", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m22-l03-p02-f1", text: [T("نفتح جهاز "), L("Server"), T(" في "), L("Packet Tracer"), T(".")] },
                { id: "m22-l03-p02-f2", text: [T("ندخل إلى تبويب "), L("Services"), T(".")] },
                { id: "m22-l03-p02-f3", text: [T("من هناك نختار خدمة "), L("DHCP"), T(".")] },
              ],
            },
            {
              id: "m22-l03-p02-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("هذه الخطوة مهمة قبل إدخال إعدادات التوزيع.")],
            },
            {
              id: "m22-l03-p02-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("تبويب "), L("Services"), T(" هو مكان الخدمات التي يقدّمها السيرفر، و "), L("DHCP"), T(" واحدة منها. في الرسم يقوم السيرفر بالدور الذي قام به الراوتر في الصفحات السابقة، ويصل إلى الأجهزة عبر "), L("Switch"), T(".")],
            },
            {
              id: "m22-l03-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما التبويب الذي ندخل إليه في جهاز Server للوصول إلى خدمة DHCP؟",
                options: [opt("m22-l03-p02-q1-a", "Services", true), opt("m22-l03-p02-q1-b", "Config"), opt("m22-l03-p02-q1-c", "Desktop")],
                feedback: {
                  hints: ["الخطوة الثانية في الصفحة.", "اسم التبويب يعني «الخدمات»."],
                  correctFeedback: "صحيح — تبويب Services ثم خدمة DHCP.",
                  incorrectFeedback: "افحص الخطوة: «ندخل إلى تبويب …».",
                  explanation: "المسار: جهاز Server ثم تبويب Services ثم خدمة DHCP.",
                },
              },
            },
          ],
        },
        // PDF 178 — خطوة 2: تشغيل DHCP
        {
          id: "791381-m22-l03-p03",
          title: "خطوة 2: تشغيل DHCP",
          order: 3,
          source: src(178, 178),
          keywords: ["On", "Off", "تفعيل الخدمة"],
          blocks: [
            {
              id: "m22-l03-p03-lead", type: "text", origin: "book",
              spans: [T("نفعّل خدمة "), L("DHCP"), T(" قبل تعبئة البيانات.")],
            },
            {
              id: "m22-l03-p03-facts", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m22-l03-p03-f1", text: [T("ندخل إلى خدمة "), L("DHCP"), T(".")] },
                { id: "m22-l03-p03-f2", text: [T("نختار "), L("On"), T(" لتفعيل الخدمة.")] },
                { id: "m22-l03-p03-f3", text: [T("نبدأ بتعبئة بيانات الشبكة.")] },
              ],
            },
            {
              id: "m22-l03-p03-warning", type: "callout", origin: "book", kind: "warning", title: "انتبه",
              spans: [T("إذا كانت الخدمة "), L("Off"), T(" فلن يحصل الحاسوب على عنوان "), L("IP"), T(".")],
            },
            {
              id: "m22-l03-p03-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("خطأ شائع في التدريب: تعبئة كل البيانات وترك الخدمة على "), L("Off"), T("؛ عندها يبقى الحاسوب بلا عنوان (وقد يأخذ عنوان "), L("APIPA"), T(" الذي رأيته في الملاحظات المهمة). لذلك يطلب الكتاب التفعيل أولًا.")],
            },
            {
              id: "m22-l03-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "إذا كانت خدمة DHCP على السيرفر Off فسيحصل الحاسوب على عنوان IP رغم ذلك.", answer: false,
                feedback: {
                  hints: ["اقرأ صندوق «انتبه».", "ماذا يحدث إذا لم تُفعَّل الخدمة؟"],
                  correctFeedback: "صحيح — إذا كانت الخدمة Off فلن يحصل الحاسوب على عنوان IP.",
                  incorrectFeedback: "افحص صندوق «انتبه».",
                  explanation: "تفعيل الخدمة (On) شرط لتوزيع العناوين؛ بدونه لا توزيع.",
                },
              },
            },
            {
              id: "m22-l03-p03-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما الذي نختاره لتفعيل خدمة DHCP بحسب الكتاب؟",
                options: [opt("m22-l03-p03-q2-a", "On", true), opt("m22-l03-p03-q2-b", "Off"), opt("m22-l03-p03-q2-c", "Static")],
                feedback: {
                  hints: ["الخطوة الثانية في الصفحة.", "عكس Off."],
                  correctFeedback: "صحيح — نختار On لتفعيل الخدمة.",
                  incorrectFeedback: "افحص الخطوة: «نختار … لتفعيل الخدمة».",
                  explanation: "On يفعّل الخدمة، ثم نبدأ بتعبئة بيانات الشبكة.",
                },
              },
            },
          ],
        },
        // PDF 179 — خطوة 3: إدخال التعريفات (module closing page + review)
        {
          id: "791381-m22-l03-p04",
          title: "خطوة 3: إدخال التعريفات",
          order: 4,
          source: src(179, 179),
          keywords: ["Default Gateway", "DNS Server", "Start IP", "Add", "Save", "Static"],
          blocks: [
            {
              id: "m22-l03-p04-lead", type: "text", origin: "book",
              spans: [T("نملأ بيانات التوزيع ثم نحفظ.")],
            },
            {
              id: "m22-l03-p04-facts", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m22-l03-p04-f1", text: [T("نكتب "), L("Default Gateway"), T(" و "), L("DNS Server"), T(".")] },
                { id: "m22-l03-p04-f2", text: [T("نحدّد "), L("Start IP"), T(" وعدد العناوين.")] },
                { id: "m22-l03-p04-f3", text: [T("ثم نضغط "), L("Add"), T(" أو "), L("Save"), T(" حسب الواجهة.")] },
              ],
            },
            {
              id: "m22-l03-p04-try", type: "callout", origin: "book", kind: "tip", title: "جرّب",
              spans: [T("بعدها اختبر من الحاسوب: اختر "), L("DHCP"), T(" بدل "), L("Static"), T(".")],
            },
            {
              id: "m22-l03-p04-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("قارن مع أوامر الراوتر: "), L("Default Gateway"), T(" يقابل "), L("default-router"), T("، و "), L("DNS Server"), T(" يقابل "), L("dns-server"), T("، و "), L("Start IP"), T(" مع عدد العناوين يقابل نطاق التوزيع. اختيار "), L("DHCP"), T(" بدل "), L("Static"), T(" على الحاسوب يجعله يطلب عنوانه تلقائيًا بمراحل "), L("DORA"), T(".")],
            },
            {
              id: "m22-l03-p04-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "كيف نختبر التوزيع من الحاسوب بحسب صندوق «جرّب»؟",
                options: [opt("m22-l03-p04-q1-a", "نختار DHCP بدل Static", true), opt("m22-l03-p04-q1-b", "نختار Static بدل DHCP"), opt("m22-l03-p04-q1-c", "نضغط Off على السيرفر")],
                feedback: {
                  hints: ["اقرأ صندوق «جرّب».", "أي الخيارين يجعل الحاسوب يطلب عنوانه تلقائيًا؟"],
                  correctFeedback: "صحيح — اختر DHCP بدل Static على الحاسوب.",
                  incorrectFeedback: "افحص صندوق «جرّب»: «اختر DHCP بدل Static».",
                  explanation: "Static يعني إدخال العنوان يدويًا؛ DHCP يعني طلبه تلقائيًا من الخادم.",
                },
              },
            },
            { id: "m22-l03-p04-review", type: "heading", origin: "teacher-enrichment", text: "مراجعة الوحدة", level: 3 },
            {
              id: "m22-l03-p04-r1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما الترتيب الصحيح لمراحل DHCP؟",
                options: [opt("m22-l03-p04-r1-a", "Discover ثم Offer ثم Request ثم ACK", true), opt("m22-l03-p04-r1-b", "Offer ثم Discover ثم ACK ثم Request"), opt("m22-l03-p04-r1-c", "Request ثم Offer ثم Discover ثم ACK")],
                feedback: {
                  hints: ["الاختصار DORA.", "الحرف الأول من كل مرحلة بالترتيب."],
                  correctFeedback: "صحيح — DORA: Discover ثم Offer ثم Request ثم ACK.",
                  incorrectFeedback: "افحص صندوق «احفظها بالترتيب» في صفحة مراحل عمل DHCP.",
                  explanation: "الطلب يبدأ من الجهاز (Discover)، ويردّ الخادم (Offer)، ثم يطلب الجهاز (Request)، ويؤكّد الخادم (ACK).",
                },
              },
            },
            {
              id: "m22-l03-p04-r2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "اكتب الأمر الذي يحدّد Gateway للأجهزة داخل مجموعة التوزيع في صندوق الكتاب (الأمر مع العنوان).", answer: `default-router ${GW}`,
                feedback: {
                  hints: ["الصف الأول في جدول أوامر الجزء الثاني.", "الأمر يبدأ بـ default- ويليه عنوان الراوتر."],
                  correctFeedback: "صحيح — default-router 192.168.1.254.",
                  incorrectFeedback: "افحص جدول الأوامر في صفحة «الجزء الثاني».",
                  explanation: "default-router داخل المجموعة يحدّد Gateway الذي تحصل عليه الأجهزة تلقائيًا.",
                },
              },
            },
            {
              id: "m22-l03-p04-r3", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "عنوان يبدأ بـ 169.254 على حاسوب يعني أن DHCP عمل بنجاح.", answer: false,
                feedback: {
                  hints: ["صفحة «ملاحظات مهمة».", "ما اسم هذا العنوان؟"],
                  correctFeedback: "صحيح — 169.254.x.x عنوان APIPA، وهو إشارة لمشكلة في DHCP.",
                  incorrectFeedback: "افحص صندوق «تذكّر» في صفحة الملاحظات المهمة.",
                  explanation: "إذا فشل DHCP يأخذ الجهاز عنوان APIPA الذي يبدأ بـ 169.254.",
                },
              },
            },
          ],
        },
      ],
    },
  ],
};

export default m22;
