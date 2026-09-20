// Learning Materials — Batch 7 phase: REAL converted body for Book 791381, module m19 (the book's section
// «إدارة VLAN · VTP», source PDF 140–144; PDF 139 is the «إدارة مركزية · VTP» section cover). NEW stable id m19 (the
// next free id — the m04 skeleton is a different section, «Trunk و Router on a Stick», that starts at the PDF 145 cover),
// reading `order` 16: after m03 («برمجة السويتش CLI و VLAN», order 15) and before m04 (order 17).
// PDF 139 is the HARD START of the batch and is represented only by this module's coarse source range + sourceNote —
// never a learner page. Book-derived blocks are origin:"book": the PDF 140 definition + facts + «اختصار», the PDF 141
// steps + «الفائدة», the PDF 142 «Switch CLI» box (as a `code` block with the book's exact command lines) + its
// annotations + «انتبه», the PDF 143 lead + facts + «للتدريب», the PDF 144 lead + facts + «تأكّد». Technical tokens
// (VTP, VLAN, Cisco, Server, Client, Trunk, Domain, Password, the commands, HFA, 123) are LTR spans; no arrow glyphs.
// SOURCE LEVEL: the book gives the problem/solution idea, the three steps, the four commands with one-line meanings,
// the "same Domain + Password" rule and the "define VLAN once on the Server" rule — no VTP versions, revision
// numbers, transparent mode, pruning or show commands. Nothing more is added.
// SOURCE ORDER: nothing from PDF 145+ (Router on a Stick, Dot1Q, sub-interfaces) appears here; Trunk is named only
// because PDF 140 prints «يعمل غالبًا عبر وصلات Trunk».
// PRINTED PAGE = the rendered page circle = the PDF index (PDF 140 prints «140» … PDF 144 prints «144»).

import type { ContentModule, ContentSource, InlineSpan, PracticeOption, PracticeTableSelectCell } from "../../types";

const CID = "791381";
const src = (pdf: number, printed?: number): ContentSource => ({ kind: "book", sourceId: CID, pdfPageStart: pdf, printedPage: printed });
const L = (text: string): InlineSpan => ({ text, dir: "ltr", style: "code" });
const T = (text: string): InlineSpan => ({ text });
const opt = (id: string, text: string, correct?: true): PracticeOption => (correct ? { id, text, correct } : { id, text });
const ROLES = ["Server", "Client"] as const;
const R = (key: (typeof ROLES)[number]): PracticeTableSelectCell => ({ kind: "select", options: [...ROLES], key });
const PURPOSES = ["Server يدير تعريفات VLAN", "اسم المجال المشترك", "كلمة مرور المجال", "على السويتش العميل"] as const;
const PU = (key: (typeof PURPOSES)[number]): PracticeTableSelectCell => ({ kind: "select", options: [...PURPOSES], key });

const m19: ContentModule = {
  id: "791381-m19",
  title: "إدارة VLAN: VTP",
  shortTitle: "VTP",
  order: 16,
  source: { kind: "book", sourceId: CID, pdfPageStart: 139, pdfPageEnd: 144, sourceNote: "PDF 139 صفحة عنوان القسم «إدارة مركزية · VTP» (بيانات وصفية فقط؛ لا تُعرض كصفحة تعلّم). صفحات التعلّم من PDF 140 إلى PDF 144. PDF 145 صفحة عنوان القسم التالي «توجيه بين الشبكات» وتخصّ الوحدة m04." },
  lessons: [
    // ── l01 — ما هو VTP وكيف يعمل (PDF 140–141) ─────────────────────────────────────────────────────────────
    {
      id: "791381-m19-l01",
      title: "ما هو VTP وكيف يعمل",
      order: 1,
      pages: [
        // PDF 140 — ما هو VTP؟
        {
          id: "791381-m19-l01-p01",
          title: "ما هو VTP؟",
          order: 1,
          source: src(140, 140),
          keywords: ["VTP", "VLAN Trunking Protocol", "Server", "Clients", "Cisco"],
          blocks: [
            {
              id: "m19-l01-p01-def", type: "callout", origin: "book", kind: "important",
              spans: [L("VTP"), T(" بروتوكول من "), L("Cisco"), T(" لإدارة "), L("VLAN"), T(" على عدة سويتشات.")],
            },
            {
              id: "m19-l01-p01-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m19-l01-p01-f1", text: [T("المشكلة: تعديل "), L("VLAN"), T(" يدويًا على كل سويتش يأخذ وقتًا.")] },
                { id: "m19-l01-p01-f2", text: [T("الحل: سويتش "), L("Server"), T(" يرسل التحديثات إلى "), L("Clients"), T(".")] },
                { id: "m19-l01-p01-f3", text: [T("يعمل غالبًا عبر وصلات "), L("Trunk"), T(".")] },
              ],
            },
            {
              id: "m19-l01-p01-abbr", type: "callout", origin: "book", kind: "tip", title: "اختصار",
              spans: [L("VTP = VLAN Trunking Protocol"), T(".")],
            },
            {
              id: "m19-l01-p01-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("في القسم السابق عرّفت "), L("VLAN"), T(" على سويتش واحد بالأوامر. عندما يكون في الشبكة عدة سويتشات، يوفّر "), L("VTP"), T(" كتابة التعريفات نفسها على كل سويتش: سويتش واحد ("), L("Server"), T(") يعرّفها ويرسلها، والباقي ("), L("Clients"), T(") يستقبلها. كلمة "), L("Trunk"), T(" هنا هي الوصلة التي عرفتها بين السويتشات، والتي تمرّ عبرها هذه التحديثات.")],
            },
            {
              id: "m19-l01-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما المشكلة التي يحلّها VTP حسب الكتاب؟",
                options: [opt("m19-l01-p01-q1-a", "تعديل VLAN يدويًا على كل سويتش يأخذ وقتًا", true), opt("m19-l01-p01-q1-b", "الكابلات بين السويتشات قصيرة"), opt("m19-l01-p01-q1-c", "الحاسوب لا يعرف رقم VLAN")],
                feedback: {
                  hints: ["افحص السطر الأول في القائمة.", "«المشكلة: …»."],
                  correctFeedback: "أحسنت — التعديل اليدوي على كل سويتش يأخذ وقتًا.",
                  incorrectFeedback: "افحص القائمة: «المشكلة: تعديل VLAN يدويًا على كل سويتش يأخذ وقتًا».",
                  explanation: "الحل: سويتش Server يرسل التحديثات إلى Clients.",
                },
              },
            },
            {
              id: "m19-l01-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "VTP اختصار VLAN Trunking Protocol، وهو بروتوكول من Cisco لإدارة VLAN على عدة سويتشات.",
                answer: true,
                feedback: {
                  hints: ["افحص صندوق «اختصار».", "افحص الصندوق الأول."],
                  correctFeedback: "صحيح — VTP = VLAN Trunking Protocol.",
                  incorrectFeedback: "افحص صندوق «اختصار»: «VTP = VLAN Trunking Protocol»، والصندوق الأول: «بروتوكول من Cisco لإدارة VLAN على عدة سويتشات».",
                  explanation: "يعمل غالبًا عبر وصلات Trunk.",
                },
              },
            },
          ],
        },
        // PDF 141 — كيف يعمل VTP؟
        {
          id: "791381-m19-l01-p02",
          title: "كيف يعمل VTP؟",
          order: 2,
          source: src(141, 141),
          keywords: ["خطوات تشغيل VTP", "Server", "Client", "تلقائيًا"],
          blocks: [
            {
              id: "m19-l01-p02-lead", type: "callout", origin: "book", kind: "important",
              spans: [T("خطوات تشغيل "), L("VTP"), T(" في الشبكة.")],
            },
            {
              id: "m19-l01-p02-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m19-l01-p02-s1", text: [T("نضبط سويتشًا واحدًا كـ "), L("Server"), T(".")] },
                { id: "m19-l01-p02-s2", text: [T("نضبط باقي السويتشات كـ "), L("Client"), T(".")] },
                { id: "m19-l01-p02-s3", text: [T("نعرّف "), L("VLAN"), T(" في السيرفر فقط، فتصل تلقائيًا.")] },
              ],
            },
            {
              id: "m19-l01-p02-benefit", type: "callout", origin: "book", kind: "summary", title: "الفائدة",
              spans: [T("توفير الوقت وتقليل أخطاء تكرار الإعدادات على كل سويتش.")],
            },
            {
              id: "m19-l01-p02-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("ثلاث خطوات فقط: واحد "), L("Server"), T("، الباقي "), L("Client"), T("، ثم التعريف في السيرفر وحده. لاحظ أن الخطوة الثالثة هي أمر "), L("vlan 10"), T(" نفسه الذي تعلّمته في صفحة إنشاء VLAN، لكن مكتوبًا مرة واحدة على السيرفر بدل تكراره على كل سويتش.")],
            },
            {
              id: "m19-l01-p02-match", type: "practice-table", origin: "teacher-enrichment",
              caption: "تحقّق من نفسك: Server أم Client؟ (اعتمد على الخطوات)",
              headers: ["الوصف", "الدور"],
              columnDirs: ["rtl", "ltr"],
              rows: [
                ["سويتش واحد فقط في الشبكة نعرّف عليه VLAN.", R("Server")],
                ["باقي السويتشات التي تصلها التعريفات تلقائيًا.", R("Client")],
                ["السويتش الذي يرسل التحديثات.", R("Server")],
              ],
            },
            {
              id: "m19-l01-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أين نعرّف VLAN عند استخدام VTP؟",
                options: [opt("m19-l01-p02-q1-a", "في السيرفر فقط، فتصل إلى الباقي تلقائيًا", true), opt("m19-l01-p02-q1-b", "على كل سويتش Client يدويًا"), opt("m19-l01-p02-q1-c", "على الحاسوب المتصل بالسويتش")],
                feedback: {
                  hints: ["افحص الخطوة الثالثة.", "«نعرّف VLAN في … فقط»."],
                  correctFeedback: "أحسنت — في السيرفر فقط.",
                  incorrectFeedback: "افحص الخطوات: «نعرّف VLAN في السيرفر فقط، فتصل تلقائيًا».",
                  explanation: "الفائدة: توفير الوقت وتقليل أخطاء تكرار الإعدادات.",
                },
              },
            },
          ],
        },
      ],
    },
    // ── l02 — إعداد VTP (PDF 142–144) ────────────────────────────────────────────────────────────────────────
    {
      id: "791381-m19-l02",
      title: "إعداد VTP",
      order: 2,
      pages: [
        // PDF 142 — إعداد VTP: Server و Client
        {
          id: "791381-m19-l02-p01",
          title: "إعداد VTP: Server و Client",
          order: 1,
          source: src(142, 142),
          keywords: ["vtp mode server", "vtp domain", "vtp password", "vtp mode client"],
          blocks: [
            {
              id: "m19-l02-p01-cli", type: "code", origin: "book", language: "cli",
              code: "Switch(config)# vtp mode server\nSwitch(config)# vtp domain HFA\nSwitch(config)# vtp password 123\nSwitch(config)# vtp mode client",
            },
            {
              id: "m19-l02-p01-cmds", type: "table", origin: "book",
              caption: "Switch CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Switch(config)# vtp mode server", "Server يدير تعريفات VLAN"],
                ["Switch(config)# vtp domain HFA", "اسم المجال المشترك"],
                ["Switch(config)# vtp password 123", "كلمة مرور المجال"],
                ["Switch(config)# vtp mode client", "على السويتش العميل"],
              ],
            },
            {
              id: "m19-l02-p01-warn", type: "callout", origin: "book", kind: "warning", title: "انتبه",
              spans: [T("يجب أن يكون "), L("Domain"), T(" و "), L("Password"), T(" متطابقين، وإلا لن تصل التحديثات.")],
            },
            {
              id: "m19-l02-p01-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("الأوامر الثلاثة الأولى تُكتب على سويتش السيرفر، والأمر الرابع على كل سويتش عميل. "), L("HFA"), T(" و "), L("123"), T(" هما اسم المجال وكلمة المرور في مثال الكتاب؛ المهم أن يُكتب الاسم وكلمة المرور نفسهما على كل السويتشات في المجال، كما يقول صندوق «انتبه».")],
            },
            {
              id: "m19-l02-p01-match", type: "practice-table", origin: "teacher-enrichment",
              caption: "تحقّق من نفسك: ماذا يفعل كل أمر؟ (اعتمد على جدول الأوامر)",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["vtp domain HFA", PU("اسم المجال المشترك")],
                ["vtp mode client", PU("على السويتش العميل")],
                ["vtp password 123", PU("كلمة مرور المجال")],
                ["vtp mode server", PU("Server يدير تعريفات VLAN")],
              ],
            },
            {
              id: "m19-l02-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "سويتش عميل كُتب عليه vtp domain HFB بينما السيرفر vtp domain HFA. ماذا يحدث حسب الكتاب؟",
                options: [opt("m19-l02-p01-q1-a", "لن تصل التحديثات، لأن Domain غير متطابق", true), opt("m19-l02-p01-q1-b", "تصل التحديثات لأن كلمة المرور تكفي"), opt("m19-l02-p01-q1-c", "يتحوّل العميل إلى Server")],
                feedback: {
                  hints: ["افحص صندوق «انتبه».", "Domain و Password متطابقين."],
                  correctFeedback: "أحسنت — Domain مختلف، فلن تصل التحديثات.",
                  incorrectFeedback: "افحص صندوق «انتبه»: «يجب أن يكون Domain و Password متطابقين، وإلا لن تصل التحديثات».",
                  explanation: "اسم المجال المشترك يجب أن يكون نفسه على السيرفر والعملاء.",
                },
              },
            },
          ],
        },
        // PDF 143 — إعداد VTP لباقي السويتشات
        {
          id: "791381-m19-l02-p02",
          title: "إعداد VTP لباقي السويتشات",
          order: 2,
          source: src(143, 143),
          keywords: ["Client", "Domain", "باقي السويتشات", "Server"],
          blocks: [
            {
              id: "m19-l02-p02-lead", type: "callout", origin: "book", kind: "important",
              spans: [T("نكرّر نفس الفكرة على باقي السويتشات.")],
            },
            {
              id: "m19-l02-p02-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m19-l02-p02-f1", text: [T("كلها يجب أن تكون داخل نفس "), L("Domain"), T(".")] },
                { id: "m19-l02-p02-f2", text: [T("بهذا تصبح "), L("VLAN"), T(" موحّدة في الشبكة كلها.")] },
                { id: "m19-l02-p02-f3", text: [T("نضبط كل سويتش كـ "), L("Client"), T(" ما عدا السيرفر.")] },
              ],
            },
            {
              id: "m19-l02-p02-train", type: "callout", origin: "book", kind: "tip", title: "للتدريب",
              spans: [T("يكفي أن تعرف الفرق بين "), L("Server"), T(" و "), L("Client"), T(" ووظيفة كل منهما.")],
            },
            {
              id: "m19-l02-p02-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("على كل سويتش من الباقي نكتب أمر "), L("vtp domain HFA"), T(" وأمر "), L("vtp password 123"), T(" نفسيهما من الصفحة السابقة، ثم "), L("vtp mode client"), T(". النتيجة: مجال واحد، سيرفر واحد، والباقي عملاء.")],
            },
            {
              id: "m19-l02-p02-match", type: "practice-table", origin: "teacher-enrichment",
              caption: "تحقّق من نفسك: من يقوم بماذا؟ (اعتمد على الصفحتين)",
              headers: ["الوصف", "الدور"],
              columnDirs: ["rtl", "ltr"],
              rows: [
                ["يدير تعريفات VLAN ويرسل التحديثات.", R("Server")],
                ["يستقبل التحديثات ولا نعرّف عليه VLAN.", R("Client")],
                ["نضبط كل سويتش هكذا ما عدا السيرفر.", R("Client")],
              ],
            },
            {
              id: "m19-l02-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "في شبكة VTP نضبط كل السويتشات كـ Server حتى تصبح VLAN موحّدة.",
                answer: false,
                feedback: {
                  hints: ["افحص السطر الثالث في القائمة.", "«ما عدا السيرفر»."],
                  correctFeedback: "صحيح أنها خطأ — سيرفر واحد، والباقي Client.",
                  incorrectFeedback: "افحص القائمة: «نضبط كل سويتش كـ Client ما عدا السيرفر».",
                  explanation: "التوحيد يأتي من كون الكل داخل نفس Domain.",
                },
              },
            },
          ],
        },
        // PDF 144 — تعريف VLAN على سويتش السيرفر (the section's last page: closing review)
        {
          id: "791381-m19-l02-p03",
          title: "تعريف VLAN على سويتش السيرفر",
          order: 3,
          source: src(144, 144),
          keywords: ["تعريف VLAN", "السيرفر", "العملاء", "تلقائيًا"],
          blocks: [
            {
              id: "m19-l02-p03-lead", type: "callout", origin: "book", kind: "important",
              spans: [T("بعد إعداد "), L("VTP"), T(" نعرّف "), L("VLAN"), T(" على السويتش "), L("Server"), T(".")],
            },
            {
              id: "m19-l02-p03-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m19-l02-p03-f1", text: [T("السيرفر ينقل التعريفات لباقي السويتشات.")] },
                { id: "m19-l02-p03-f2", text: [T("لهذا يقلّ الحاجة لتكرار الأوامر.")] },
                { id: "m19-l02-p03-f3", text: [T("نعرّف كل "), L("VLAN"), T(" مرة واحدة فقط.")] },
              ],
            },
            {
              id: "m19-l02-p03-check", type: "callout", origin: "book", kind: "tip", title: "تأكّد",
              spans: [T("إذا كان "), L("VTP"), T(" صحيحًا، ستظهر "), L("VLAN"), T(" على العملاء تلقائيًا.")],
            },
            {
              id: "m19-l02-p03-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("الترتيب الكامل: إعداد "), L("VTP"), T(" على السيرفر والعملاء أولًا، ثم تعريف "), L("VLAN"), T(" على السيرفر بالأوامر التي تعرفها ("), L("vlan 10"), T(" ثم "), L("name"), T("). إذا لم تظهر "), L("VLAN"), T(" على العملاء، فالسبب الذي يذكره الكتاب هو اختلاف "), L("Domain"), T(" أو "), L("Password"), T(".")],
            },
            {
              id: "m19-l02-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "كم مرة نعرّف كل VLAN في شبكة تعمل بـ VTP؟",
                options: [opt("m19-l02-p03-q1-a", "مرة واحدة فقط، على السيرفر", true), opt("m19-l02-p03-q1-b", "مرة على كل سويتش"), opt("m19-l02-p03-q1-c", "مرتين: على السيرفر وعلى أوّل عميل")],
                feedback: {
                  hints: ["افحص السطر الثالث في القائمة.", "«مرة واحدة فقط»."],
                  correctFeedback: "أحسنت — مرة واحدة على السيرفر.",
                  incorrectFeedback: "افحص القائمة: «نعرّف كل VLAN مرة واحدة فقط» و«السيرفر ينقل التعريفات لباقي السويتشات».",
                  explanation: "لهذا يقلّ الحاجة لتكرار الأوامر.",
                },
              },
            },
            {
              id: "m19-l02-p03-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "إذا كان VTP صحيحًا، ستظهر VLAN على العملاء تلقائيًا.",
                answer: true,
                feedback: {
                  hints: ["افحص صندوق «تأكّد».", "هذه هي طريقة التحقّق التي يعطيها الكتاب."],
                  correctFeedback: "صحيح — تظهر تلقائيًا على العملاء.",
                  incorrectFeedback: "افحص صندوق «تأكّد»: «إذا كان VTP صحيحًا، ستظهر VLAN على العملاء تلقائيًا».",
                  explanation: "السيرفر ينقل التعريفات لباقي السويتشات.",
                },
              },
            },
            // ── closing review for the section (easy, medium, exam-like) ──
            {
              id: "m19-l02-p03-review", type: "heading", origin: "teacher-enrichment", level: 3, text: "مراجعة ختامية: إدارة VLAN بـ VTP",
            },
            {
              id: "m19-l02-p03-r1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما وظيفة VTP؟",
                options: [opt("m19-l02-p03-r1-a", "إدارة VLAN على عدة سويتشات من مكان واحد", true), opt("m19-l02-p03-r1-b", "إعطاء عنوان IP للحاسوب"), opt("m19-l02-p03-r1-c", "فحص الاتصال بين جهازين")],
                feedback: {
                  hints: ["افحص صفحة ما هو VTP؟.", "بروتوكول من Cisco لإدارة …"],
                  correctFeedback: "أحسنت — إدارة VLAN على عدة سويتشات.",
                  incorrectFeedback: "افحص الصندوق الأول في صفحة ما هو VTP؟: «بروتوكول من Cisco لإدارة VLAN على عدة سويتشات».",
                  explanation: "Server يرسل التحديثات إلى Clients عبر وصلات Trunk.",
                },
              },
            },
            {
              id: "m19-l02-p03-r2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "سؤال بأسلوب الامتحان: أي أمر يجعل السويتش هو الذي يدير تعريفات VLAN في المجال؟",
                options: [opt("m19-l02-p03-r2-a", "vtp mode server", true), opt("m19-l02-p03-r2-b", "vtp mode client"), opt("m19-l02-p03-r2-c", "vtp password 123")],
                feedback: {
                  hints: ["افحص جدول الأوامر في صفحة الإعداد.", "«Server يدير تعريفات VLAN»."],
                  correctFeedback: "أحسنت — vtp mode server.",
                  incorrectFeedback: "افحص جدول الأوامر: «Switch(config)# vtp mode server — Server يدير تعريفات VLAN».",
                  explanation: "vtp mode client يُكتب على السويتش العميل.",
                },
              },
            },
            {
              id: "m19-l02-p03-r3", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "سؤال بأسلوب الامتحان: عرّفت VLAN 30 على السيرفر لكنها لم تظهر على أحد العملاء. ما السبب الذي يذكره الكتاب؟",
                options: [opt("m19-l02-p03-r3-a", "Domain أو Password غير متطابقين بين السيرفر وهذا العميل", true), opt("m19-l02-p03-r3-b", "يجب تعريف VLAN 30 على كل عميل يدويًا"), opt("m19-l02-p03-r3-c", "رقم 30 خارج مجال VLAN ID")],
                feedback: {
                  hints: ["افحص صندوق «انتبه» في صفحة الإعداد.", "افحص صندوق «تأكّد»."],
                  correctFeedback: "أحسنت — الشرط: Domain و Password متطابقان.",
                  incorrectFeedback: "افحص صندوق «انتبه»: «يجب أن يكون Domain و Password متطابقين، وإلا لن تصل التحديثات».",
                  explanation: "مجال VLAN ID من 1 إلى 4094، فالرقم 30 صحيح.",
                },
              },
            },
          ],
        },
      ],
    },
  ],
};

export default m19;
