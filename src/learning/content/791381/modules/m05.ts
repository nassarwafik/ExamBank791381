// Learning Materials — Batch 9 phase: REAL converted body for Book 791381, module m05 — the HISTORICAL Phase-2
// skeleton «مرجع أوامر Cisco» COMPLETED IN PLACE. The book's section «مرجع أوامر Cisco» is exactly PDF 192–199 and the
// skeleton's two pages (PDF 193 «أوامر أساسية للجهاز», PDF 194 «أوامر VLAN و Trunk») sit inside it, so m05 is the
// correct stable id: its id, title, shortTitle, lesson `791381-m05-l01` («الأوامر الأساسية») and the historical page
// ids `-l01-p01` (PDF 193, printedPage 191 — the skeleton's text-layer number, pinned as immutable) and `-l01-p02`
// (PDF 194, printedPage 192) are unchanged; only their explicit `order` moved (1 → 2, 2 → 3) because PDF 192 precedes
// them as the new stable id `-l01-p03` at order 1. Reading `order` 23: after m24 («حماية أجهزة Cisco», order 22).
// New lessons `l02` (PDF 195–197) and `l03` (PDF 198–199) hold the rest of the section. PDF 200 is the sixth-batch
// cover: HARD STOP — nothing from it is converted.
// Book-derived blocks are origin:"book": the PDF 192 facts + «مهم», the PDF 193–197 «Cisco CLI» boxes (as `code`
// blocks with the book's exact lines and its generic `Device(config)#` prompt + the annotation tables) with their
// «تذكّر» / «انتبه» / «مهم» boxes, the PDF 198 four `show` groups + «تذكّر», the PDF 199 facts + «الدفعة التالية».
// INTERACTIVE CLI: PDF 193 guided, PDF 194 challenges, PDF 195 challenges (incl. a fix-the-command), PDF 196 task,
// PDF 197 task. PDF 198 (reference) and 199 (outlook) carry tables / worksheets / practices only.
// SOURCE LEVEL: a command reference — every line is a one-line meaning; nothing (versions, options, the other
// show outputs, OSPF / EIGRP / ACL configuration) is added. PRINTED PAGE = page circle = PDF index for the new
// pages (192, 195–199); the two historical pages keep the skeleton's printedPage values 191 / 192.

import type { ContentModule, ContentSource, InlineSpan, PracticeOption, PracticeTableSelectCell } from "../../types";
import type { CliExerciseConfig } from "../../../cli/types";

const CID = "791381";
const src = (pdf: number, printed?: number): ContentSource => ({ kind: "book", sourceId: CID, pdfPageStart: pdf, printedPage: printed });
const L = (text: string): InlineSpan => ({ text, dir: "ltr", style: "code" });
const T = (text: string): InlineSpan => ({ text });
const opt = (id: string, text: string, correct?: true): PracticeOption => (correct ? { id, text, correct } : { id, text });
const EX = (exercise: CliExerciseConfig): Record<string, unknown> => ({ ...exercise });
const GROUPS = ["VLAN & Ports", "Port Security", "Config", "Routing & Services"] as const;
const GR = (key: (typeof GROUPS)[number]): PracticeTableSelectCell => ({ kind: "select", options: [...GROUPS], key });
const PW = "cisco123";

const m05: ContentModule = {
  id: "791381-m05",
  title: "مرجع أوامر Cisco",
  shortTitle: "أوامر Cisco",
  order: 23,
  source: { kind: "book", sourceId: CID, pdfPageStart: 192, pdfPageEnd: 199, sourceNote: "ثماني صفحات تحت العنوان الجاري «مرجع أوامر Cisco» (PDF 192–199) بلا صفحة عنوان خاصة. PDF 191 آخر صفحة في وحدة حماية أجهزة Cisco (m24)، و PDF 200 صفحة عنوان الدفعة السادسة «WAN والتوجيه و ACL وقاموس شامل» ولم تُحوَّل." },
  lessons: [
    // ── l01 — الأوامر الأساسية (historical lesson id/title; PDF 192 new p03 first, then the historical 193 / 194) ──
    {
      id: "791381-m05-l01",
      title: "الأوامر الأساسية",
      order: 1,
      pages: [
        // PDF 192 — أوامر السويتش والراوتر (NEW stable id p03, reads FIRST)
        {
          id: "791381-m05-l01-p03",
          title: "أوامر السويتش والراوتر",
          order: 1,
          source: src(192, 192),
          keywords: ["CLI", "أوامر", "الامتحانات العملية", "نوع الجهاز والإصدار"],
          blocks: [
            {
              id: "m05-l01-p03-def", type: "callout", origin: "book", kind: "important",
              spans: [T("أجهزة "), L("Cisco"), T(" تُدار غالبًا من خلال "), L("CLI"), T(".")],
            },
            {
              id: "m05-l01-p03-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m05-l01-p03-f1", text: [T("نكتب أوامر مباشرة لإعداد الجهاز.")] },
                { id: "m05-l01-p03-f2", text: [T("الأوامر تختلف حسب نوع الجهاز والإصدار.")] },
                { id: "m05-l01-p03-f3", text: [T("المطلوب: معرفة وظيفة الأمر ومتى يُستخدم.")] },
              ],
            },
            {
              id: "m05-l01-p03-important", type: "callout", origin: "book", kind: "important", title: "مهم",
              spans: [L("CLI"), T(" مهم جدًا في أسئلة البرمجة والامتحانات العملية.")],
            },
            {
              // ENRICHMENT (Batch 8): SVG visual enrichment appended after the book content.
              id: "m05-l01-p03-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m05/cisco-cli-overview", motion: false,
              source: src(192),
              title: "مخطط: إدارة أجهزة Cisco عبر CLI",
              alt: "مخطط: أجهزة Cisco تُدار عبر CLI بأوامر مباشرة لإعداد الجهاز، وتختلف الأوامر حسب نوع الجهاز والإصدار، والمطلوب فهم وظيفة الأمر ومتى يُستخدم.",
              caption: "‏أجهزة Cisco تُدار عبر CLI: افهم وظيفة الأمر ومتى يُستخدم.",
            },
            {
              id: "m05-l01-p03-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("هذه الوحدة مرجع يجمع الأوامر التي تفرّقت في الوحدات السابقة (السويتش و "), L("VLAN"), T("، "), L("VTP"), T("، "), L("Router on a Stick"), T("، "), L("Port Security"), T("، كلمات المرور). في صفحات المرجع يكتب الكتاب كل الأوامر تحت المؤشّر العام "), L("Device(config)#"), T("؛ في المحاكي ستكتب كل أمر في وضعه الصحيح.")],
            },
            {
              id: "m05-l01-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما المطلوب من الطالب في مرجع الأوامر بحسب الكتاب؟",
                options: [opt("m05-l01-p03-q1-a", "معرفة وظيفة الأمر ومتى يُستخدم", true), opt("m05-l01-p03-q1-b", "حفظ أرقام الإصدارات"), opt("m05-l01-p03-q1-c", "كتابة الأوامر بواجهة رسومية")],
                feedback: {
                  hints: ["السطر الثالث في قائمة الحقائق.", "ليس الحفظ الأعمى."],
                  correctFeedback: "صحيح — معرفة وظيفة الأمر ومتى يُستخدم.",
                  incorrectFeedback: "افحص السطر: «المطلوب: معرفة وظيفة الأمر ومتى يُستخدم».",
                  explanation: "الأوامر تختلف حسب نوع الجهاز والإصدار، فالمهم فهم الوظيفة والوقت المناسب.",
                },
              },
            },
            {
              id: "m05-l01-p03-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "بحسب الكتاب، CLI مهم جدًا في أسئلة البرمجة والامتحانات العملية.", answer: true,
                feedback: {
                  hints: ["اقرأ صندوق «مهم».", "أين تظهر أوامر CLI في الامتحان؟"],
                  correctFeedback: "صحيح — CLI مهم جدًا في أسئلة البرمجة والامتحانات العملية.",
                  incorrectFeedback: "افحص صندوق «مهم».",
                  explanation: "لذلك تجمع هذه الوحدة الأوامر الأساسية في مرجع واحد.",
                },
              },
            },
          ],
        },
        // PDF 193 — أوامر أساسية للجهاز (HISTORICAL page id p01, printedPage 191 immutable; order 1 → 2) + GUIDED
        {
          id: "791381-m05-l01-p01",
          title: "أوامر أساسية للجهاز",
          order: 2,
          source: src(193, 191),
          keywords: ["cisco", "cli"],
          blocks: [
            {
              id: "m05-l01-p01-cli", type: "code", origin: "book", language: "cli",
              code: "Device(config)# enable\nDevice(config)# hostname SW1\nDevice(config)# banner motd #...#\nDevice(config)# no shutdown",
            },
            {
              id: "m05-l01-p01-cmds", type: "table", origin: "book",
              caption: "Cisco CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Device(config)# enable", "للدخول إلى الإعدادات ثم config t"],
                ["Device(config)# hostname SW1", "يغيّر اسم الجهاز"],
                ["Device(config)# banner motd #...#", "يضيف رسالة عند الدخول"],
                ["Device(config)# no shutdown", "يشغّل المنفذ"],
              ],
            },
            {
              id: "m05-l01-p01-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("هذه أوامر بداية تتكرّر في أغلب التمارين العملية.")],
            },
            {
              id: "m05-l01-p01-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [L("enable"), T(" يُكتب في وضع المستخدم ("), L("Switch>"), T(") ثم "), L("config t"), T(" للدخول إلى الإعداد العام كما يقول شرح الكتاب؛ "), L("hostname"), T(" و "), L("banner motd"), T(" في الإعداد العام، و "), L("no shutdown"), T(" داخل المنفذ. الرسالة بين رمزين متطابقين مثل "), L("#...#"), T(".")],
            },
            {
              id: "m05-l01-p01-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مثال موجّه: أوامر البداية على السويتش",
              description: "ابدأ من وضع المستخدم ونفّذ أوامر الكتاب الأربعة في أوضاعها الصحيحة. محاكاة تعليمية مبسّطة، ليست جهازًا حقيقيًا.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "المثال الموجّه: enable ثم configure terminal، ثم hostname SW1، ثم banner motd #Welcome#، ثم داخل المنفذ f0/1 الأمر no shutdown." },
              config: EX({
                kind: "guided",
                device: "switch",
                intro: "نفّذ أوامر البداية الأربعة بالترتيب، بدءًا من وضع المستخدم.",
                steps: [
                  { id: "s1", instruction: "انتقل إلى وضع الأوامر المتقدّم", expect: { mode: "privileged" }, success: "✓ أحسنت، انتقلت إلى وضع الأوامر المتقدّم", hints: ["السطر الأول في صندوق الكتاب.", "كلمة واحدة تبدأ بـ en."] },
                  { id: "s2", instruction: "ادخل إلى الإعداد العام (كما يقول الكتاب: ثم config t)", expect: { mode: "global" }, success: "✓ أحسنت، انتقلت إلى وضع الإعداد العام", hints: ["شرح السطر الأول يذكر الأمر بالاختصار.", "config t أو configure terminal."] },
                  { id: "s3", instruction: "غيّر اسم الجهاز إلى SW1", expect: { command: "hostname", args: { name: "SW1" } }, hints: ["السطر الثاني في صندوق الكتاب.", "يبدأ بـ hostname ويليه الاسم."] },
                  { id: "s4", instruction: "أضف رسالة دخول بين رمزين # مثل #Welcome#", expect: { command: "banner-motd" }, hints: ["السطر الثالث في صندوق الكتاب.", "يبدأ بـ banner motd ثم الرسالة بين # و #."] },
                  { id: "s5", instruction: "اختر المنفذ f0/1", expect: { command: "interface", args: { interfaces: ["f0/1"] } }, success: "✓ أحسنت، أنت الآن داخل المنفذ", hints: ["no shutdown يُكتب داخل منفذ، فاختر واحدًا أولًا.", "يبدأ بـ interface ويليه اسم المنفذ."] },
                  { id: "s6", instruction: "شغّل المنفذ", expect: { command: "no-shutdown" }, hints: ["السطر الأخير في صندوق الكتاب.", "كلمتان: no ثم اسم حالة الإطفاء."] },
                ],
                completion: "✓ أحسنت، نفّذت أوامر البداية الأربعة في أوضاعها الصحيحة.",
              }),
            },
            {
              id: "m05-l01-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما الأمر الذي يضيف رسالة عند الدخول إلى الجهاز؟",
                options: [opt("m05-l01-p01-q1-a", "banner motd #...#", true), opt("m05-l01-p01-q1-b", "hostname SW1"), opt("m05-l01-p01-q1-c", "no shutdown")],
                feedback: {
                  hints: ["الصف الثالث في جدول الأوامر.", "الكلمة banner تعني لافتة."],
                  correctFeedback: "صحيح — banner motd #...# يضيف رسالة عند الدخول.",
                  incorrectFeedback: "افحص جدول الأوامر: «يضيف رسالة عند الدخول».",
                  explanation: "hostname يغيّر اسم الجهاز، و no shutdown يشغّل المنفذ.",
                },
              },
            },
            {
              id: "m05-l01-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "ما الاسم الذي يعطيه الكتاب للجهاز بأمر hostname؟", answer: "SW1",
                feedback: {
                  hints: ["السطر الثاني في صندوق الكتاب.", "حرفان ورقم."],
                  correctFeedback: "صحيح — SW1.",
                  incorrectFeedback: "افحص السطر: «hostname …».",
                  explanation: "بعد الأمر يصبح المؤشّر SW1(config)# بدل Switch(config)#.",
                },
              },
            },
          ],
        },
        // PDF 194 — أوامر VLAN و Trunk (HISTORICAL page id p02, printedPage 192 immutable; order 2 → 3) + CHALLENGES
        {
          id: "791381-m05-l01-p02",
          title: "أوامر VLAN و Trunk",
          order: 3,
          source: src(194, 192),
          keywords: ["vlan", "trunk"],
          blocks: [
            {
              id: "m05-l01-p02-cli", type: "code", origin: "book", language: "cli",
              code: "Device(config)# interface range f0/1-10\nDevice(config)# vlan 10\nDevice(config)# switchport access vlan 10\nDevice(config)# switchport mode trunk",
            },
            {
              id: "m05-l01-p02-cmds", type: "table", origin: "book",
              caption: "Cisco CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Device(config)# interface range f0/1-10", "يحدّد عدة منافذ"],
                ["Device(config)# vlan 10", "ينشئ شبكة ظاهرية"],
                ["Device(config)# switchport access vlan 10", "يربط المنافذ بـ VLAN"],
                ["Device(config)# switchport mode trunk", "يجعل المنفذ ناقلًا لعدة VLAN"],
              ],
            },
            {
              id: "m05-l01-p02-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [L("Access"), T(" للأجهزة النهائية، و "), L("Trunk"), T(" بين أجهزة الشبكة.")],
            },
            {
              id: "m05-l01-p02-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("الصفحة مرجع، لا تسلسل واحد: "), L("vlan 10"), T(" يُكتب في الإعداد العام، وأمرا "), L("switchport"), T(" داخل المنافذ. لذلك في التحدّي أدناه تنتقل بين الأوضاع بنفسك ("), L("exit"), T(" للخروج من الوضع الحالي).")],
            },
            {
              id: "m05-l01-p02-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "تحدّي الأمر: أوامر VLAN و Trunk",
              description: "أنت في وضع الإعداد العام. اكتب الأمر المطلوب في كل سؤال، وانتقل بين الأوضاع بنفسك عند الحاجة؛ المحاكي لا يكشف الإجابة. محاكاة تعليمية مبسّطة.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "التحدّي: حدّد المنافذ من f0/1 إلى f0/10 بأمر واحد، اربطها بـ VLAN 10، أنشئ VLAN 10 في الإعداد العام، ثم اجعل منفذًا آخر Trunk." },
              config: EX({
                kind: "challenge",
                device: "switch",
                startMode: "global",
                intro: "أنت في وضع الإعداد العام. انتقل بين الأوضاع بنفسك عند الحاجة.",
                steps: [
                  { id: "c1", instruction: "اكتب الأمر الذي يحدّد المنافذ من f0/1 إلى f0/10 دفعة واحدة", expect: { command: "interface", args: { interfaces: ["f0/1", "f0/2", "f0/3", "f0/4", "f0/5", "f0/6", "f0/7", "f0/8", "f0/9", "f0/10"] } }, hints: ["السطر الأول في صندوق الكتاب؛ الكلمة range تعني مدى.", "يبدأ بـ interface range ويليه المدى f0/1-10."] },
                  { id: "c2", instruction: "اكتب الأمر الذي يربط هذه المنافذ بـ VLAN 10", expect: { command: "switchport-access-vlan", args: { vlanId: 10 } }, hints: ["السطر الثالث في صندوق الكتاب، ويُكتب داخل المنافذ.", "يبدأ بـ switchport access vlan."] },
                  { id: "c3", instruction: "عد إلى الإعداد العام ثم اكتب الأمر الذي ينشئ VLAN 10", expect: { command: "vlan", args: { vlanId: 10 } }, hints: ["اخرج من المنافذ أولًا (exit)، فالأمر يُكتب في (config)#.", "السطر الثاني في صندوق الكتاب: كلمة ورقم."] },
                  { id: "c4", instruction: "اختر منفذًا آخر (مثل f0/24) ثم اكتب الأمر الذي يجعله ناقلًا لعدة VLAN", expect: { command: "switchport-mode", args: { mode: "trunk" } }, hints: ["اخرج من وضع VLAN وادخل إلى المنفذ أولًا.", "السطر الأخير في صندوق الكتاب: switchport mode ثم نوع المنفذ."] },
                ],
                allowed: ["switchport-access-vlan", "switchport-mode"],
                completion: "✓ صحيح في كل الأوامر — Access للأجهزة النهائية، و Trunk بين أجهزة الشبكة.",
              }),
            },
            {
              id: "m05-l01-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما الأمر الذي يحدّد عدة منافذ دفعة واحدة؟",
                options: [opt("m05-l01-p02-q1-a", "interface range f0/1-10", true), opt("m05-l01-p02-q1-b", "vlan 10"), opt("m05-l01-p02-q1-c", "switchport mode trunk")],
                feedback: {
                  hints: ["الصف الأول في جدول الأوامر.", "الكلمة range تعني مدى من المنافذ."],
                  correctFeedback: "صحيح — interface range f0/1-10 يحدّد عدة منافذ.",
                  incorrectFeedback: "افحص جدول الأوامر: «يحدّد عدة منافذ».",
                  explanation: "vlan 10 ينشئ الشبكة الظاهرية، و switchport mode trunk يجعل المنفذ ناقلًا لعدة VLAN.",
                },
              },
            },
          ],
        },
      ],
    },
    // ── l02 — VTP و Dot1Q و Port Security (PDF 195–197) ──────────────────────────────────────────────────────
    {
      id: "791381-m05-l02",
      title: "VTP و Dot1Q و Port Security",
      order: 2,
      pages: [
        // PDF 195 — VTP وكلمات مرور سريعة + CHALLENGES (incl. fix-the-command)
        {
          id: "791381-m05-l02-p01",
          title: "VTP وكلمات مرور سريعة",
          order: 1,
          source: src(195, 195),
          keywords: ["vtp mode server", "vtp mode client", "enable secret cisco123", "line console 0", "line vty 0 4", "VTP domain"],
          blocks: [
            {
              id: "m05-l02-p01-cli", type: "code", origin: "book", language: "cli",
              code: `Device(config)# vtp mode server\nDevice(config)# vtp mode client\nDevice(config)# enable secret ${PW}\nDevice(config)# line console 0 / line vty 0 4`,
            },
            {
              id: "m05-l02-p01-cmds", type: "table", origin: "book",
              caption: "Cisco CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Device(config)# vtp mode server", "يدير VLAN"],
                ["Device(config)# vtp mode client", "يستقبل التحديثات"],
                [`Device(config)# enable secret ${PW}`, "يحمي الدخول المتقدّم"],
                ["Device(config)# line console 0 / line vty 0 4", "لحماية طرق الدخول"],
              ],
            },
            {
              id: "m05-l02-p01-warning", type: "callout", origin: "book", kind: "warning", title: "انتبه",
              spans: [T("يجب أن يكون "), L("VTP domain"), T(" متطابقًا بين الأجهزة لتصل التحديثات.")],
            },
            {
              id: "m05-l02-p01-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("السطر الأخير في صندوق الكتاب يجمع أمرين مختلفين بشرطة مائلة: "), L("line console 0"), T(" و "), L("line vty 0 4"), T("؛ كل واحد منهما أمر مستقل يفتح وضع الخط. أما "), L("vtp mode"), T(" فيُكتب "), L("server"), T(" على سويتش واحد و "), L("client"), T(" على الباقي، كما درست في وحدة VTP.")],
            },
            {
              id: "m05-l02-p01-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "تحدّي الأمر: VTP وكلمات المرور — مع تصحيح أمر خاطئ",
              description: "أنت في وضع الإعداد العام. اكتب الأمر المطلوب في كل سؤال؛ السؤال الأخير يعرض أمرًا مكتوبًا بشكل خاطئ وعليك كتابته صحيحًا. محاكاة تعليمية مبسّطة.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "التحدّي: اجعل السويتش VTP server، ثم client، ثم احمِ الدخول المتقدّم بـ enable secret cisco123، ثم صحّح الأمر الخاطئ «line vty 0-4»." },
              config: EX({
                kind: "challenge",
                device: "switch",
                startMode: "global",
                intro: "أنت في وضع الإعداد العام.",
                steps: [
                  { id: "c1", instruction: "اكتب الأمر الذي يجعل هذا السويتش يدير VLAN (VTP)", expect: { command: "vtp-mode", args: { mode: "server" } }, hints: ["السطر الأول في صندوق الكتاب.", "يبدأ بـ vtp mode ويليه دور السويتش المدير."] },
                  { id: "c2", instruction: "اكتب الأمر الذي يجعل السويتش يستقبل التحديثات فقط", expect: { command: "vtp-mode", args: { mode: "client" } }, hints: ["السطر الثاني في صندوق الكتاب.", "نفس بداية الأمر السابق مع الدور الآخر."] },
                  { id: "c3", instruction: "اكتب الأمر الذي يحمي الدخول المتقدّم بكلمة السر cisco123", expect: { command: "enable-secret", args: { secret: PW } }, hints: ["السطر الثالث في صندوق الكتاب.", "يبدأ بـ enable secret ويليه كلمة السر."] },
                  { id: "c4", instruction: "صحّح الأمر الخاطئ: «line vty 0-4» — اكتبه كما يطبعه الكتاب", expect: { command: "line", args: { line: "vty" } }, hints: ["الخطأ في طريقة كتابة الرقمين.", "الرقمان يُفصلان بمسافة لا بشرطة: line vty 0 4."] },
                ],
                allowed: ["vtp-mode", "enable-secret"],
                completion: "✓ صحيح في كل الأوامر — وتذكّر: VTP domain يجب أن يتطابق بين الأجهزة.",
              }),
            },
            {
              id: "m05-l02-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "بحسب صندوق «انتبه»، ما الذي يجب أن يتطابق بين الأجهزة لتصل تحديثات VTP؟",
                options: [opt("m05-l02-p01-q1-a", "VTP domain", true), opt("m05-l02-p01-q1-b", "اسم الجهاز hostname"), opt("m05-l02-p01-q1-c", "كلمة مرور Console")],
                feedback: {
                  hints: ["اقرأ صندوق «انتبه».", "درست هذا في وحدة VTP: المجال المشترك."],
                  correctFeedback: "صحيح — VTP domain يجب أن يتطابق.",
                  incorrectFeedback: "افحص صندوق «انتبه».",
                  explanation: "السيرفر يرسل التحديثات إلى العملاء داخل المجال نفسه فقط.",
                },
              },
            },
          ],
        },
        // PDF 196 — Sub-Interface و Dot1Q + TASK
        {
          id: "791381-m05-l02-p02",
          title: "Sub-Interface و Dot1Q",
          order: 2,
          source: src(196, 196),
          keywords: ["interface g0/0.10", "encapsulation dot1Q 10", "ip address 192.168.10.254", "Sub-Interface", "Gateway"],
          blocks: [
            {
              id: "m05-l02-p02-cli", type: "code", origin: "book", language: "cli",
              code: "Device(config)# interface g0/0.10\nDevice(config)# encapsulation dot1Q 10\nDevice(config)# ip address 192.168.10.254 255.255.255.0",
            },
            {
              id: "m05-l02-p02-cmds", type: "table", origin: "book",
              caption: "Cisco CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Device(config)# interface g0/0.10", "Sub-Interface للتوجيه بين VLAN"],
                ["Device(config)# encapsulation dot1Q 10", "يحدّد رقم VLAN"],
                ["Device(config)# ip address 192.168.10.254 255.255.255.0", "يصبح Gateway لتلك VLAN"],
              ],
            },
            {
              id: "m05-l02-p02-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("كل "), L("VLAN"), T(" تحتاج "), L("Sub-Interface"), T(" خاصة بها على الراوتر.")],
            },
            {
              id: "m05-l02-p02-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("هذه هي أوامر "), L("Router on a Stick"), T(" التي درستها: الرقم بعد النقطة في "), L("g0/0.10"), T(" هو رقم الواجهة الفرعية، ورقم "), L("VLAN"), T(" يُحدَّد بأمر "), L("encapsulation dot1Q"), T("، والعنوان يجعل الراوتر بوابة تلك الشبكة. المهمة أدناه تُنفَّذ على الراوتر.")],
            },
            {
              id: "m05-l02-p02-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مهمة إعداد: واجهة فرعية لـ VLAN 10 على الراوتر",
              description: "ابدأ من وضع المستخدم على الراوتر ونفّذ أوامر الكتاب الثلاثة. تكتمل المهمة فقط عندما تصبح الواجهة الفرعية مضبوطة كما في الكتاب. محاكاة تعليمية مبسّطة.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "المهمة: الواجهة الفرعية g0/0.10 بترميز dot1Q 10 والعنوان 192.168.10.254 بالقناع 255.255.255.0." },
              config: EX({
                kind: "task",
                device: "router",
                intro: "أعدّ الواجهة الفرعية لـ VLAN 10 كما في صندوق الكتاب. تكتمل المهمة عندما تتحقّق كل النقاط التالية:",
                goals: [
                  { id: "g1", label: "الواجهة الفرعية g0/0.10 تحمل ترميز dot1Q لـ VLAN 10", condition: { kind: "interface", name: "g0/0.10", prop: "encapsulationVlan", value: 10 } },
                  { id: "g2", label: "عنوانها 192.168.10.254", condition: { kind: "interface", name: "g0/0.10", prop: "ipAddress", value: "192.168.10.254" } },
                  { id: "g3", label: "قناعها 255.255.255.0", condition: { kind: "interface", name: "g0/0.10", prop: "subnetMask", value: "255.255.255.0" } },
                ],
                hints: ["انتقل إلى الإعداد العام ثم اختر الواجهة الفرعية بأمر interface واسمها بالنقطة.", "داخل الواجهة الفرعية: encapsulation dot1Q ثم ip address مع القناع."],
                completion: "✓ أحسنت، الراوتر أصبح Gateway لـ VLAN 10 عبر الواجهة الفرعية g0/0.10.",
              }),
            },
            {
              id: "m05-l02-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ماذا يفعل الأمر encapsulation dot1Q 10 بحسب الكتاب؟",
                options: [opt("m05-l02-p02-q1-a", "يحدّد رقم VLAN للواجهة الفرعية", true), opt("m05-l02-p02-q1-b", "يعطي الواجهة عنوان IP"), opt("m05-l02-p02-q1-c", "ينشئ VLAN 10 على السويتش")],
                feedback: {
                  hints: ["الصف الثاني في جدول الأوامر.", "الرقم 10 في الأمر هو رقم ماذا؟"],
                  correctFeedback: "صحيح — يحدّد رقم VLAN.",
                  incorrectFeedback: "افحص جدول الأوامر: «يحدّد رقم VLAN».",
                  explanation: "interface g0/0.10 ينشئ الواجهة الفرعية، و encapsulation dot1Q 10 يربطها بـ VLAN 10، و ip address يجعلها Gateway.",
                },
              },
            },
            {
              id: "m05-l02-p02-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "واجهة فرعية واحدة تكفي لكل شبكات VLAN على الراوتر.", answer: false,
                feedback: {
                  hints: ["اقرأ صندوق «تذكّر».", "كم واجهة فرعية تحتاج كل VLAN؟"],
                  correctFeedback: "صحيح — كل VLAN تحتاج Sub-Interface خاصة بها.",
                  incorrectFeedback: "افحص صندوق «تذكّر»: «كل VLAN تحتاج Sub-Interface خاصة بها على الراوتر».",
                  explanation: "لكل VLAN واجهة فرعية برقمها وترميزها وعنوانها الخاص.",
                },
              },
            },
          ],
        },
        // PDF 197 — أوامر Port Security مختصرة + TASK
        {
          id: "791381-m05-l02-p03",
          title: "أوامر Port Security مختصرة",
          order: 3,
          source: src(197, 197),
          keywords: ["interface f0/1", "switchport mode access", "switchport port-security maximum 2", "violation shutdown"],
          blocks: [
            {
              id: "m05-l02-p03-cli", type: "code", origin: "book", language: "cli",
              code: "Device(config)# interface f0/1\nDevice(config)# switchport mode access\nDevice(config)# switchport port-security maximum 2\nDevice(config)# switchport port-security violation shutdown",
            },
            {
              id: "m05-l02-p03-cmds", type: "table", origin: "book",
              caption: "Cisco CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Device(config)# interface f0/1", "نحدّد المنفذ أولًا"],
                ["Device(config)# switchport mode access", "نجعله Access"],
                ["Device(config)# switchport port-security maximum 2", "نحدّد عدد الأجهزة أو MAC"],
                ["Device(config)# switchport port-security violation shutdown", "نحدّد العقوبة عند المخالفة"],
              ],
            },
            {
              id: "m05-l02-p03-important", type: "callout", origin: "book", kind: "important", title: "مهم",
              spans: [L("Port Security"), T(" من أكثر الأوامر العملية ظهورًا في التدريب.")],
            },
            {
              id: "m05-l02-p03-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("هذا ملخّص وحدة "), L("Port Security"), T(" بحدّ أقصى جهازين بدل ثلاثة. لاحظ أن الكتاب يبدأ بتحديد المنفذ وجعله "), L("Access"), T(" قبل أوامر الحماية؛ وفي المحاكي تُفعَّل الحماية أيضًا بالأمر "), L("switchport port-security"), T(" كما في وحدة Port Security.")],
            },
            {
              id: "m05-l02-p03-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مهمة إعداد: Port Security بحدّ أقصى جهازين",
              description: "ابدأ من وضع المستخدم وطبّق ملخّص الكتاب على المنفذ f0/1. تكتمل المهمة فقط عندما تصبح كل النقاط موجودة. محاكاة تعليمية مبسّطة.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "المهمة: المنفذ f0/1 في وضع Access، Port Security مفعّل، الحد الأقصى جهازان، والعقوبة عند المخالفة shutdown." },
              config: EX({
                kind: "task",
                device: "switch",
                intro: "طبّق ملخّص الكتاب على المنفذ f0/1. تكتمل المهمة عندما تتحقّق كل النقاط التالية:",
                goals: [
                  { id: "g1", label: "المنفذ f0/1 في وضع Access", condition: { kind: "interface", name: "f0/1", prop: "switchportMode", value: "access" } },
                  { id: "g2", label: "Port Security مفعّل على f0/1", condition: { kind: "port-security", name: "f0/1", prop: "enabled", value: true } },
                  { id: "g3", label: "الحد الأقصى جهازان", condition: { kind: "port-security", name: "f0/1", prop: "maximum", value: 2 } },
                  { id: "g4", label: "العقوبة عند المخالفة shutdown", condition: { kind: "port-security", name: "f0/1", prop: "violation", value: "shutdown" } },
                ],
                hints: ["ادخل إلى المنفذ f0/1 أولًا؛ كل أوامر switchport تُكتب داخله.", "بعد تفعيل الحماية: maximum ثم violation، وكلاهما يبدأ بـ switchport port-security."],
                completion: "✓ أحسنت، المنفذ f0/1 يقبل جهازين فقط ويُغلق عند المخالفة.",
              }),
            },
            {
              id: "m05-l02-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "كم جهازًا يسمح به الأمر في ملخّص الكتاب على هذه الصفحة؟ (اكتب الرقم فقط)", answer: "2",
                feedback: {
                  hints: ["السطر الثالث في صندوق الكتاب.", "الرقم بعد maximum؛ يختلف عن صفحة وحدة Port Security."],
                  correctFeedback: "صحيح — جهازان.",
                  incorrectFeedback: "افحص السطر: «switchport port-security maximum …».",
                  explanation: "في وحدة Port Security كان الحد ثلاثة، وهنا في المرجع جهازان؛ العدد يتغيّر حسب الحاجة.",
                },
              },
            },
          ],
        },
      ],
    },
    // ── l03 — أوامر الفحص وما بعد (PDF 198–199) ─────────────────────────────────────────────────────────────
    {
      id: "791381-m05-l03",
      title: "أوامر الفحص وما بعد",
      order: 3,
      pages: [
        // PDF 198 — أوامر الفحص المهمة (reference, no simulation)
        {
          id: "791381-m05-l03-p01",
          title: "أوامر الفحص المهمة",
          order: 1,
          source: src(198, 198),
          keywords: ["show", "show vlan brief", "show port-security", "show running-config", "show ip route"],
          blocks: [
            {
              id: "m05-l03-p01-groups", type: "list", origin: "book", variant: "cards", title: "المجموعات الأربع كما في الكتاب",
              items: [
                { id: "m05-l03-p01-g1", term: "VLAN & Ports", text: [L("show vlan brief"), T(" · "), L("show ip interface brief"), T(" · "), L("show mac-address-table"), T(" · "), L("show vtp status")] },
                { id: "m05-l03-p01-g2", term: "Port Security", text: [L("show port-security"), T(" · "), L("show port-security interface F0/1")] },
                { id: "m05-l03-p01-g3", term: "Config", text: [L("show interfaces"), T(" · "), L("show running-config"), T(" · "), L("show startup-config")] },
                { id: "m05-l03-p01-g4", term: "Routing & Services", text: [L("show arp"), T(" · "), L("show cdp neighbors"), T(" · "), L("show ip route"), T(" · "), L("show ip dhcp pool")] },
              ],
            },
            {
              id: "m05-l03-p01-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("أوامر "), L("show"), T(" للفحص فقط، ولا تغيّر الإعدادات.")],
            },
            {
              // ENRICHMENT (Batch 8): SVG visual enrichment appended after the book content.
              id: "m05-l03-p01-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m05/show-commands-map", motion: false,
              source: src(198),
              title: "مخطط: خريطة أوامر الفحص show",
              alt: "خريطة قرار: ماذا أريد أن أفحص؟ المجموعات الأربع من أوامر show كما في الكتاب — VLAN & Ports و Port Security و Config و Routing & Services.",
              caption: "‏«ماذا أريد أن أفحص؟» تقودك إلى مجموعة أمر show المناسبة.",
            },
            {
              id: "m05-l03-p01-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("في محاكي هذه المنصة تعمل أوامر الفحص التالية بمخرجات مبسّطة: "), L("show running-config"), T("، "), L("show startup-config"), T("، "), L("show ip interface brief"), T("، "), L("show vlan brief"), T("، "), L("show vtp status"), T("، "), L("show ip dhcp pool"), T("، "), L("show port-security"), T(" و "), L("show port-security interface"), T(". الباقي (مثل "), L("show ip route"), T(" و "), L("show mac-address-table"), T(") مرجع للقراءة فقط هنا.")],
            },
            {
              id: "m05-l03-p01-ws", type: "practice-table", origin: "teacher-enrichment", caption: "ورقة عمل: إلى أي مجموعة ينتمي كل أمر فحص؟ (اعتمد على بطاقات الكتاب)",
              headers: ["الأمر", "المجموعة"],
              rows: [
                ["show vlan brief", GR("VLAN & Ports")],
                ["show port-security", GR("Port Security")],
                ["show running-config", GR("Config")],
                ["show ip route", GR("Routing & Services")],
              ],
              columnDirs: ["ltr", "ltr"],
            },
            {
              id: "m05-l03-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "أوامر show تغيّر إعدادات الجهاز.", answer: false,
                feedback: {
                  hints: ["اقرأ صندوق «تذكّر».", "show تعني «اعرض»."],
                  correctFeedback: "صحيح — أوامر show للفحص فقط ولا تغيّر الإعدادات.",
                  incorrectFeedback: "افحص صندوق «تذكّر».",
                  explanation: "لذلك يمكن كتابتها بأمان للتحقّق من الإعدادات قبل الحفظ.",
                },
              },
            },
          ],
        },
        // PDF 199 — OSPF / EIGRP / ACL — تذكير سريع (module closing page + review)
        {
          id: "791381-m05-l03-p02",
          title: "OSPF / EIGRP / ACL — تذكير سريع",
          order: 2,
          source: src(199, 199),
          keywords: ["OSPF", "EIGRP", "ACL", "show access-lists", "الدفعة التالية"],
          blocks: [
            {
              id: "m05-l03-p02-lead", type: "text", origin: "book",
              spans: [T("لمحة سريعة عن مواضيع الوحدة التالية.")],
            },
            {
              id: "m05-l03-p02-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m05-l03-p02-f1", text: [L("OSPF"), T(" و "), L("EIGRP"), T(" بروتوكولات توجيه.")] },
                { id: "m05-l03-p02-f2", text: [L("ACL"), T(" تتحكّم بالسماح أو المنع.")] },
                { id: "m05-l03-p02-f3", text: [L("show access-lists"), T(" يفحص القوائم.")] },
              ],
            },
            {
              id: "m05-l03-p02-next", type: "callout", origin: "book", kind: "tip", title: "الدفعة التالية",
              spans: [T("سيتم شرح هذه المواضيع بالتفصيل في الوحدة القادمة.")],
            },
            {
              id: "m05-l03-p02-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("هذه الصفحة تعريف بالأسماء فقط؛ شرح التوجيه و "), L("ACL"), T(" يأتي في الدفعة التالية من الكتاب، ولذلك لا تحاول تنفيذ أوامرها في المحاكي الآن.")],
            },
            {
              id: "m05-l03-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما وظيفة ACL بحسب التذكير السريع؟",
                options: [opt("m05-l03-p02-q1-a", "تتحكّم بالسماح أو المنع", true), opt("m05-l03-p02-q1-b", "بروتوكول توجيه"), opt("m05-l03-p02-q1-c", "تعرض الإعدادات المحفوظة")],
                feedback: {
                  hints: ["السطر الثاني في قائمة الحقائق.", "ما الذي تفعله القوائم بالحركة؟"],
                  correctFeedback: "صحيح — ACL تتحكّم بالسماح أو المنع.",
                  incorrectFeedback: "افحص السطر: «ACL تتحكّم بالسماح أو المنع».",
                  explanation: "OSPF و EIGRP بروتوكولا توجيه، و ACL قوائم تحكّم بالسماح أو المنع.",
                },
              },
            },
            { id: "m05-l03-p02-review", type: "heading", origin: "teacher-enrichment", text: "مراجعة الوحدة", level: 3 },
            {
              id: "m05-l03-p02-r1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي أمر يجعل السويتش يستقبل تحديثات VTP فقط؟",
                options: [opt("m05-l03-p02-r1-a", "vtp mode client", true), opt("m05-l03-p02-r1-b", "vtp mode server"), opt("m05-l03-p02-r1-c", "enable secret cisco123")],
                feedback: {
                  hints: ["صفحة «VTP وكلمات مرور سريعة».", "الدور الذي «يستقبل التحديثات»."],
                  correctFeedback: "صحيح — vtp mode client يستقبل التحديثات.",
                  incorrectFeedback: "افحص جدول صفحة «VTP وكلمات مرور سريعة».",
                  explanation: "server يدير VLAN، و client يستقبل التحديثات.",
                },
              },
            },
            {
              id: "m05-l03-p02-r2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "اكتب أمر الواجهة الفرعية لـ VLAN 10 كما في صندوق الكتاب (الأمر كاملًا).", answer: "interface g0/0.10",
                feedback: {
                  hints: ["صفحة «Sub-Interface و Dot1Q»، السطر الأول.", "يبدأ بـ interface ويليه اسم الواجهة بالنقطة."],
                  correctFeedback: "صحيح — interface g0/0.10.",
                  incorrectFeedback: "افحص صندوق صفحة «Sub-Interface و Dot1Q».",
                  explanation: "الرقم بعد النقطة هو رقم الواجهة الفرعية، ثم يحدّد encapsulation dot1Q رقم VLAN.",
                },
              },
            },
            {
              id: "m05-l03-p02-r3", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "إلى أي مجموعة ينتمي الأمر show port-security في صفحة أوامر الفحص؟",
                options: [opt("m05-l03-p02-r3-a", "Port Security", true), opt("m05-l03-p02-r3-b", "Routing & Services"), opt("m05-l03-p02-r3-c", "Config")],
                feedback: {
                  hints: ["صفحة «أوامر الفحص المهمة».", "اسم الأمر يحمل اسم المجموعة."],
                  correctFeedback: "صحيح — مجموعة Port Security.",
                  incorrectFeedback: "افحص بطاقات صفحة «أوامر الفحص المهمة».",
                  explanation: "أوامر show للفحص فقط، ولا تغيّر الإعدادات.",
                },
              },
            },
          ],
        },
      ],
    },
  ],
};

export default m05;
