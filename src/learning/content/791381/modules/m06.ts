// Learning Materials — Batch 10 phase: REAL converted body for Book 791381, module m06 — the HISTORICAL Phase-2
// skeleton «قوائم التحكم ACL» COMPLETED IN PLACE. The book's section «قوائم التحكم ACL» is exactly PDF 223–229 and the
// skeleton's one page (PDF 227 «Extended ACL», printedPage 225 — the skeleton's text-layer number, pinned as
// immutable) sits inside it, so m06 is the correct stable id: its id, title, shortTitle, lesson `791381-m06-l01`
// («التحكم بالوصول») and the historical page id `-l01-p01` (title, mapping, keywords) are unchanged; only its
// explicit `order` moved (1 → 5) because PDF 223–226 precede it as new stable ids `-l01-p02` … `-l01-p05` at
// orders 1–4. Reading `order` 27: after m27 («بروتوكولات التوجيه», order 26). The new lesson `l02` (PDF 228–229)
// holds the section's closing QR trainings and final-exams pages. PDF 230 is the «مرجع نهائي · الملخّص الشامل»
// divider: HARD STOP — nothing from it is converted.
// Book-derived blocks are origin:"book": the PDF 223 definition + rule roles + facts + Standard / Extended cards +
// «تذكّر», the three Standard-ACL «Cisco CLI» boxes (PDF 224–226, as `code` blocks with the book's exact lines
// and prompts — `Router(config)#` / `Router(config-if)#` on 224, `Device(config)#` / `Device(config-if)#` on 225
// and 226 — + the annotation tables) with «تذكّر» / «قاعدة» / «في الامتحان · الرفض الضمني» / «خطأ شائع», the
// PDF 227 Extended-ACL facts + example + «شرح المثال», and the PDF 228 / 229 QR cards + their notes.
// INTERACTIVE CLI: PDF 224 guided, PDF 225 challenge, PDF 226 task (final state), PDF 227 challenge (the book's
// HTTP line, then the same rule for the port 443 the page names). PDF 223, 228 and 229 carry no exercise.
// SOURCE LEVEL: numbered lists only (1–99 / 100–199) exactly as the book prints them; no named ACLs, no
// `access-class`, no `show access-lists` (not on these pages), no protect-the-VTY scenarios. PRINTED PAGE = page
// circle = PDF index for the new pages (223–226, 228, 229); the historical page keeps the skeleton's printedPage 225.

import type { ContentModule, ContentSource, InlineSpan, PracticeOption, PracticeTableSelectCell } from "../../types";
import type { CliExerciseConfig } from "../../../cli/types";

const CID = "791381";
const src = (pdf: number, printed?: number): ContentSource => ({ kind: "book", sourceId: CID, pdfPageStart: pdf, printedPage: printed });
const L = (text: string): InlineSpan => ({ text, dir: "ltr", style: "code" });
const T = (text: string): InlineSpan => ({ text });
const opt = (id: string, text: string, correct?: true): PracticeOption => (correct ? { id, text, correct } : { id, text });
const EX = (exercise: CliExerciseConfig): Record<string, unknown> => ({ ...exercise });
const MEANINGS = ["سماح", "البروتوكول", "أي مصدر / أي وجهة", "منفذ HTTP"] as const;
const MN = (key: (typeof MEANINGS)[number]): PracticeTableSelectCell => ({ kind: "select", options: [...MEANINGS], key });

const LAN = "192.168.1.0 0.0.0.255", LAN2 = "192.168.2.0 0.0.0.255", HOST = "192.168.1.10";

const m06: ContentModule = {
  id: "791381-m06",
  title: "قوائم التحكم ACL",
  shortTitle: "ACL",
  order: 27,
  source: { kind: "book", sourceId: CID, pdfPageStart: 223, pdfPageEnd: 229, sourceNote: "سبع صفحات تحت العنوان الجاري «قوائم التحكم ACL» (PDF 223–229) بلا صفحة عنوان خاصة. PDF 222 آخر صفحة في وحدة بروتوكولات التوجيه (m27)، و PDF 230 صفحة فاصلة «مرجع نهائي · الملخّص الشامل» ولم تُحوَّل." },
  lessons: [
    // ── l01 — التحكم بالوصول (historical lesson id/title; PDF 223–226 new pages first, then the historical 227) ──
    {
      id: "791381-m06-l01",
      title: "التحكم بالوصول",
      order: 1,
      pages: [
        // PDF 223 — ACL — Access Control List (new stable id p02, order 1)
        {
          id: "791381-m06-l01-p02",
          title: "ACL — Access Control List",
          order: 1,
          source: src(223, 223),
          keywords: ["ACL", "Access Control List", "permit", "deny", "Standard", "Extended"],
          blocks: [
            {
              id: "m06-l01-p02-def", type: "callout", origin: "book", kind: "important",
              spans: [L("ACL"), T(" مجموعة قواعد تسمح أو تمنع مرور البيانات في الشبكة.")],
            },
            {
              id: "m06-l01-p02-rule", type: "list", origin: "book", variant: "cards", title: "رسم الكتاب: قاعدة ACL على الواجهة (Router)",
              items: [
                { id: "m06-l01-p02-permit", term: "permit", text: [T("مسموح — الجهاز الأول يمرّ عبر الراوتر.")] },
                { id: "m06-l01-p02-deny", term: "deny", text: [T("ممنوع — الجهاز الثاني يُوقَف عند الراوتر.")] },
              ],
            },
            {
              id: "m06-l01-p02-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m06-l01-p02-f1", text: [T("تزيد الأمان في الشبكة.")] },
                { id: "m06-l01-p02-f2", text: [T("تمنع أجهزة أو شبكات معيّنة.")] },
                { id: "m06-l01-p02-f3", text: [T("تُستخدم غالبًا مع الراوترات والجدران النارية.")] },
              ],
            },
            {
              id: "m06-l01-p02-types", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m06-l01-p02-std", term: "Standard", text: [T("تعتمد على "), L("IP"), T(" المصدر فقط.")] },
                { id: "m06-l01-p02-ext", term: "Extended", text: [T("تعتمد على المصدر والوجهة والبروتوكول والمنفذ.")] },
              ],
            },
            {
              id: "m06-l01-p02-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("نضع القائمة قريبًا من الوجهة في "), L("Standard ACL"), T("، وقريبًا من المصدر في "), L("Extended"), T(".")],
            },
            {
              id: "m06-l01-p02-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("السبب في قاعدة الموضع: "), L("Standard"), T(" لا تعرف الوجهة، فلو وضعناها قرب المصدر لمنعت الجهاز عن كل الشبكات لا عن الوجهة المقصودة فقط؛ أما "), L("Extended"), T(" فتعرف الوجهة، فنوقف الحركة غير المرغوبة مبكرًا قرب مصدرها.")],
            },
            {
              id: "m06-l01-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "على ماذا تعتمد Standard ACL؟",
                options: [opt("m06-l01-p02-q1-a", "على IP المصدر فقط", true), opt("m06-l01-p02-q1-b", "على المصدر والوجهة والبروتوكول والمنفذ"), opt("m06-l01-p02-q1-c", "على عنوان MAC")],
                feedback: {
                  hints: ["بطاقة Standard.", "كلمة «فقط»."],
                  correctFeedback: "صحيح — IP المصدر فقط.",
                  incorrectFeedback: "افحص بطاقة Standard: «تعتمد على IP المصدر فقط».",
                  explanation: "Extended هي التي تفحص المصدر والوجهة والبروتوكول والمنفذ.",
                },
              },
            },
            {
              id: "m06-l01-p02-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "نضع Standard ACL قريبًا من الوجهة.", answer: true,
                feedback: {
                  hints: ["صندوق «تذكّر».", "Standard قرب الوجهة، Extended قرب…"],
                  correctFeedback: "صحيح — Standard قرب الوجهة.",
                  incorrectFeedback: "افحص صندوق «تذكّر» في الصفحة.",
                  explanation: "Standard لا تعرف الوجهة، لذلك توضع قريبًا منها؛ Extended توضع قرب المصدر.",
                },
              },
            },
          ],
        },
        // PDF 224 — Standard ACL (new stable id p03, order 2) + GUIDED
        {
          id: "791381-m06-l01-p03",
          title: "Standard ACL",
          order: 2,
          source: src(224, 224),
          keywords: ["access-list 10 permit 192.168.1.0 0.0.0.255", "interface g0/0", "ip access-group 10 out", "1 إلى 99"],
          blocks: [
            {
              id: "m06-l01-p03-cli", type: "code", origin: "book", language: "cli",
              code: `Router(config)# access-list 10 permit ${LAN}\nRouter(config)# interface g0/0\nRouter(config-if)# ip access-group 10 out`,
            },
            {
              id: "m06-l01-p03-cmds", type: "table", origin: "book",
              caption: "Cisco CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                [`Router(config)# access-list 10 permit ${LAN}`, "السماح لشبكة معيّنة"],
                ["Router(config)# interface g0/0", "نحدّد الواجهة"],
                ["Router(config-if)# ip access-group 10 out", "نربط القائمة بالواجهة"],
              ],
            },
            {
              id: "m06-l01-p03-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [L("Standard ACL"), T(" تتحكّم بالمرور حسب "), L("IP"), T(" المصدر فقط، وأرقامها من "), L("1"), T(" إلى "), L("99"), T("، ونضعها قريبًا من الوجهة.")],
            },
            {
              id: "m06-l01-p03-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("خطوتان دائمًا: كتابة القائمة في الإعداد العام، ثم ربطها بواجهة واتجاه ("), L("in"), T(" داخل إلى الراوتر، "), L("out"), T(" خارج منه). الرقم "), L("0.0.0.255"), T(" هو "), L("wildcard"), T(" — مقلوب القناع — ويعني «أي جهاز في الشبكة 192.168.1.0».")],
            },
            {
              id: "m06-l01-p03-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مثال موجّه: قائمة قياسية على g0/0",
              description: "أنت في وضع الإعداد العام للراوتر. نفّذ سطور صندوق الكتاب بالترتيب: القائمة، ثم الواجهة، ثم الربط. محاكاة تعليمية مبسّطة.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "المثال الموجّه: access-list 10 permit 192.168.1.0 0.0.0.255 ثم interface g0/0 ثم ip access-group 10 out." },
              config: EX({
                kind: "guided",
                device: "router",
                startMode: "global",
                intro: "أنت في وضع الإعداد العام للراوتر. نفّذ سطور صندوق الكتاب بالترتيب.",
                steps: [
                  { id: "s1", instruction: "اكتب القائمة 10 التي تسمح للشبكة 192.168.1.0/24", expect: { command: "access-list", args: { number: 10, action: "permit", source: LAN } }, hints: ["السطر الأول في صندوق الكتاب.", "access-list 10 permit ثم الشبكة ثم wildcard 0.0.0.255."] },
                  { id: "s2", instruction: "حدّد الواجهة g0/0", expect: { command: "interface", args: { interfaces: ["g0/0"] } }, success: "✓ أحسنت، أنت الآن داخل الواجهة g0/0", hints: ["السطر الثاني في صندوق الكتاب.", "interface ثم اسم الواجهة."] },
                  { id: "s3", instruction: "اربط القائمة 10 بالواجهة في الاتجاه الخارج", expect: { command: "ip-access-group", args: { number: 10, direction: "out" } }, hints: ["السطر الأخير في صندوق الكتاب.", "ip access-group ثم الرقم ثم out."] },
                ],
                completion: "✓ أحسنت، القائمة القياسية مكتوبة ومربوطة بالواجهة كما في الكتاب.",
              }),
            },
            {
              id: "m06-l01-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما مدى أرقام Standard ACL بحسب الكتاب؟",
                options: [opt("m06-l01-p03-q1-a", "من 1 إلى 99", true), opt("m06-l01-p03-q1-b", "من 100 إلى 199"), opt("m06-l01-p03-q1-c", "من 1 إلى 4094")],
                feedback: {
                  hints: ["صندوق «تذكّر».", "رقم القائمة في صندوق الكتاب هو 10."],
                  correctFeedback: "صحيح — من 1 إلى 99.",
                  incorrectFeedback: "افحص صندوق «تذكّر»: «أرقامها من 1 إلى 99».",
                  explanation: "100–199 للقوائم الموسّعة، و 1–4094 مدى أرقام VLAN.",
                },
              },
            },
            {
              id: "m06-l01-p03-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "اكتب الأمر الذي يربط القائمة 10 بالواجهة في الاتجاه out (الأمر كاملًا).", answer: "ip access-group 10 out",
                feedback: {
                  hints: ["السطر الأخير في صندوق الكتاب.", "يبدأ بـ ip access-group."],
                  correctFeedback: "صحيح — ip access-group 10 out.",
                  incorrectFeedback: "افحص السطر: «Router(config-if)# ip access-group 10 out».",
                  explanation: "يُكتب داخل الواجهة تحت (config-if)#.",
                },
              },
            },
          ],
        },
        // PDF 225 — Standard ACL — أمثلة (new stable id p04, order 3) + CHALLENGE
        {
          id: "791381-m06-l01-p04",
          title: "Standard ACL — أمثلة",
          order: 3,
          source: src(225, 225),
          keywords: ["access-list 10 permit", "access-list 20 deny", "access-list 20 permit any", "القاعدة الأقرب للهدف"],
          blocks: [
            {
              id: "m06-l01-p04-cli", type: "code", origin: "book", language: "cli",
              code: `Device(config)# access-list 10 permit ${LAN}\nDevice(config)# access-list 20 deny ${LAN2}\nDevice(config)# access-list 20 permit any`,
            },
            {
              id: "m06-l01-p04-cmds", type: "table", origin: "book",
              caption: "Cisco CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                [`Device(config)# access-list 10 permit ${LAN}`, "مثال 1: السماح لشبكة"],
                [`Device(config)# access-list 20 deny ${LAN2}`, "مثال 2: منع شبكة"],
                ["Device(config)# access-list 20 permit any", "السماح للباقي"],
              ],
            },
            {
              id: "m06-l01-p04-rule", type: "callout", origin: "book", kind: "remember", title: "قاعدة",
              spans: [T("في "), L("Standard ACL"), T(" نضع القاعدة الأقرب للهدف، لأنها تتحكّم بالمصدر فقط.")],
            },
            {
              id: "m06-l01-p04-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("القائمة 20 سطران بالترتيب: منع الشبكة "), L("192.168.2.0"), T(" ثم "), L("permit any"), T(" لكل ما عداها. الراوتر يقرأ السطور من الأعلى ويتوقف عند أول سطر ينطبق، لذلك لو كُتب "), L("permit any"), T(" أولًا لما وصل الراوتر إلى سطر المنع أبدًا.")],
            },
            {
              id: "m06-l01-p04-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "تحدّي الأمر: ثلاث قواعد قياسية",
              description: "أنت في وضع الإعداد العام. اكتب القاعدة المطلوبة في كل سؤال بالترتيب؛ المحاكي لا يكشف الإجابة. محاكاة تعليمية مبسّطة.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "التحدّي: access-list 10 permit 192.168.1.0 0.0.0.255، ثم access-list 20 deny 192.168.2.0 0.0.0.255، ثم access-list 20 permit any." },
              config: EX({
                kind: "challenge",
                device: "router",
                startMode: "global",
                intro: "أنت في وضع الإعداد العام.",
                steps: [
                  { id: "c1", instruction: "في القائمة 10: اسمح للشبكة 192.168.1.0/24", expect: { command: "access-list", args: { number: 10, action: "permit", source: LAN } }, hints: ["السطر الأول في صندوق الكتاب.", "permit ثم الشبكة ثم wildcard 0.0.0.255."] },
                  { id: "c2", instruction: "في القائمة 20: امنع الشبكة 192.168.2.0/24", expect: { command: "access-list", args: { number: 20, action: "deny", source: LAN2 } }, hints: ["السطر الثاني في صندوق الكتاب.", "deny بدل permit والرقم 20."] },
                  { id: "c3", instruction: "في القائمة 20: اسمح لكل الباقي", expect: { command: "access-list", args: { number: 20, action: "permit", source: "any" } }, hints: ["السطر الأخير في صندوق الكتاب.", "الكلمة any تعني «أي مصدر»."] },
                ],
                allowed: ["access-list"],
                completion: "✓ صحيح في كل القواعد — لاحظ ترتيب السطرين في القائمة 20.",
              }),
            },
            {
              id: "m06-l01-p04-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ماذا تفعل القاعدة access-list 20 permit any؟",
                options: [opt("m06-l01-p04-q1-a", "تسمح لكل الباقي بعد سطر المنع", true), opt("m06-l01-p04-q1-b", "تمنع كل الشبكات"), opt("m06-l01-p04-q1-c", "تحذف القائمة 20")],
                feedback: {
                  hints: ["الصف الأخير في جدول الأوامر.", "any = أي مصدر."],
                  correctFeedback: "صحيح — السماح للباقي.",
                  incorrectFeedback: "افحص الصف: «السماح للباقي».",
                  explanation: "بعد منع شبكة معيّنة نسمح لما عداها صراحةً، وإلا مُنع الجميع بالرفض الضمني.",
                },
              },
            },
            {
              id: "m06-l01-p04-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "ما الشبكة التي تمنعها القائمة 20 في مثال الكتاب؟ (العنوان فقط)", answer: "192.168.2.0",
                feedback: {
                  hints: ["السطر الثاني في صندوق الكتاب.", "تبدأ بـ 192.168.2."],
                  correctFeedback: "صحيح — 192.168.2.0.",
                  incorrectFeedback: "افحص السطر: «access-list 20 deny 192.168.2.0 0.0.0.255».",
                  explanation: "wildcard 0.0.0.255 يجعل القاعدة تشمل كل أجهزة تلك الشبكة.",
                },
              },
            },
          ],
        },
        // PDF 226 — Standard ACL — أمثلة إضافية (new stable id p05, order 4) + TASK
        {
          id: "791381-m06-l01-p05",
          title: "Standard ACL — أمثلة إضافية",
          order: 4,
          source: src(226, 226),
          keywords: ["access-list 30 permit host", "access-list 40 permit", "ip access-group 40 in", "الرفض الضمني", "deny any", "خطأ شائع"],
          blocks: [
            {
              id: "m06-l01-p05-cli", type: "code", origin: "book", language: "cli",
              code: `Device(config)# access-list 30 permit host ${HOST}\nDevice(config)# access-list 40 permit ${LAN}\nDevice(config-if)# ip access-group 40 in`,
            },
            {
              id: "m06-l01-p05-cmds", type: "table", origin: "book",
              caption: "Cisco CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                [`Device(config)# access-list 30 permit host ${HOST}`, "السماح لجهاز واحد"],
                [`Device(config)# access-list 40 permit ${LAN}`, "السماح لشبكة كاملة"],
                ["Device(config-if)# ip access-group 40 in", "تطبيق القائمة على الواجهة"],
              ],
            },
            {
              id: "m06-l01-p05-implicit", type: "callout", origin: "book", kind: "important", title: "في الامتحان · الرفض الضمني",
              spans: [T("كل "), L("ACL"), T(" تنتهي ضمنيًا بـ "), L("deny any"), T(" غير مكتوب. أي عنوان لا تسمح له صراحةً يُمنع تلقائيًا.")],
            },
            {
              id: "m06-l01-p05-mistake", type: "callout", origin: "book", kind: "warning", title: "خطأ شائع",
              spans: [T("كتابة القائمة دون تطبيقها على الواجهة بـ "), L("ip access-group"), T(" — القائمة لا تعمل إطلاقًا.")],
            },
            {
              id: "m06-l01-p05-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [L("host 192.168.1.10"), T(" اختصار لـ «هذا الجهاز وحده» بدل كتابة "), L("wildcard 0.0.0.0"), T(". الكتاب يكتب سطر التطبيق تحت "), L("(config-if)#"), T(" دون أن يسمّي الواجهة؛ في المهمّة أدناه اخترنا "), L("g0/0"), T(" كما في صفحة "), L("Standard ACL"), T(".")],
            },
            {
              id: "m06-l01-p05-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مهمّة: جهاز واحد، شبكة كاملة، وتطبيق على g0/0",
              description: "أنت في وضع الإعداد العام للراوتر. المطلوب حالة نهائية: القائمة 30 تسمح للجهاز 192.168.1.10 وحده، القائمة 40 تسمح للشبكة 192.168.1.0/24، والقائمة 40 مطبّقة على الواجهة g0/0 بالاتجاه in. الترتيب لك؛ لا تنسَ «الخطأ الشائع». محاكاة تعليمية مبسّطة.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "المهمّة: access-list 30 permit host 192.168.1.10 ثم access-list 40 permit 192.168.1.0 0.0.0.255 ثم interface g0/0 ثم ip access-group 40 in." },
              config: EX({
                kind: "task",
                device: "router",
                startMode: "global",
                intro: "أنت في وضع الإعداد العام للراوتر.",
                goals: [
                  { id: "g-host", label: "القائمة 30 تسمح للجهاز 192.168.1.10 وحده", condition: { kind: "acl", number: 30, prop: "entry", value: `permit host ${HOST}` } },
                  { id: "g-net", label: "القائمة 40 تسمح للشبكة 192.168.1.0/24", condition: { kind: "acl", number: 40, prop: "entry", value: `permit ${LAN}` } },
                  { id: "g-apply", label: "القائمة 40 مطبّقة على g0/0 بالاتجاه in", condition: { kind: "interface", name: "g0/0", prop: "accessGroup", value: "40 in" } },
                ],
                hints: ["القائمتان تُكتبان في الإعداد العام؛ الكلمة host قبل عنوان الجهاز الواحد.", "التطبيق يكون داخل الواجهة g0/0 بـ ip access-group 40 in."],
                completion: "✓ أحسنت، القائمتان مكتوبتان والقائمة 40 مطبّقة على الواجهة — لا «خطأ شائع» هنا.",
              }),
            },
            {
              id: "m06-l01-p05-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ماذا يحدث لعنوان لم تسمح له أي قاعدة في القائمة صراحةً؟",
                options: [opt("m06-l01-p05-q1-a", "يُمنع تلقائيًا بالرفض الضمني deny any", true), opt("m06-l01-p05-q1-b", "يُسمح له تلقائيًا"), opt("m06-l01-p05-q1-c", "يسأل الراوتر المدير")],
                feedback: {
                  hints: ["صندوق «في الامتحان · الرفض الضمني».", "deny any غير مكتوب."],
                  correctFeedback: "صحيح — يُمنع تلقائيًا.",
                  incorrectFeedback: "افحص صندوق «الرفض الضمني»: «أي عنوان لا تسمح له صراحةً يُمنع تلقائيًا».",
                  explanation: "كل ACL تنتهي ضمنيًا بـ deny any.",
                },
              },
            },
            {
              id: "m06-l01-p05-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "قائمة ACL مكتوبة ولم تُطبَّق على واجهة تعمل بشكل طبيعي.", answer: false,
                feedback: {
                  hints: ["صندوق «خطأ شائع».", "ما الأمر الذي يفعّلها على الواجهة؟"],
                  correctFeedback: "صحيح — لا تعمل إطلاقًا بدون ip access-group.",
                  incorrectFeedback: "افحص صندوق «خطأ شائع» في الصفحة.",
                  explanation: "القائمة مجرّد نص حتى تُربط بواجهة واتجاه.",
                },
              },
            },
          ],
        },
        // PDF 227 — Extended ACL (HISTORICAL page id p01, printedPage 225 immutable; order 1 → 5) + CHALLENGE
        {
          id: "791381-m06-l01-p01",
          title: "Extended ACL",
          order: 5,
          source: src(227, 225),
          keywords: ["acl", "extended"],
          blocks: [
            {
              id: "m06-l01-p01-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m06-l01-p01-f1", text: [T("تحدّد البروتوكول: "), L("TCP / UDP / ICMP"), T(".")] },
                { id: "m06-l01-p01-f2", text: [T("تحدّد "), L("IP"), T(" المصدر والوجهة.")] },
                { id: "m06-l01-p01-f3", text: [T("تحدّد المنفذ "), L("Port"), T(" مثل "), L("80"), T(" أو "), L("443"), T(".")] },
                { id: "m06-l01-p01-f4", text: [T("أرقامها غالبًا من "), L("100"), T(" إلى "), L("199"), T(".")] },
              ],
            },
            {
              id: "m06-l01-p01-cli", type: "code", origin: "book", language: "cli",
              code: "access-list 100\n  permit tcp any any eq 80",
            },
            {
              id: "m06-l01-p01-explain", type: "callout", origin: "book", kind: "summary", title: "شرح المثال",
              spans: [L("permit"), T(" = سماح · "), L("tcp"), T(" = البروتوكول · "), L("any"), T(" = أي وجهة · "), L("eq 80"), T(" = منفذ "), L("HTTP"), T(". "), L("Extended ACL"), T(" أكثر تفصيلًا من "), L("Standard"), T(" لأنها تفحص المصدر والوجهة والبروتوكول والمنفذ معًا.")],
            },
            {
              id: "m06-l01-p01-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("الكتاب يكسر السطر بعد رقم القائمة للعرض؛ على الجهاز يُكتب كله في سطر واحد: "), L("access-list 100 permit tcp any any eq 80"), T(". الكلمة "), L("any"), T(" الأولى هي المصدر والثانية الوجهة، و "), L("eq 80"), T(" تعني «يساوي المنفذ 80».")],
            },
            {
              id: "m06-l01-p01-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "تحدّي الأمر: قائمة موسّعة لـ HTTP و HTTPS",
              description: "أنت في وضع الإعداد العام. اكتب قاعدة الكتاب للمنفذ 80، ثم القاعدة نفسها للمنفذ 443 الذي تذكره الصفحة. المحاكي لا يكشف الإجابة. محاكاة تعليمية مبسّطة.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "التحدّي: access-list 100 permit tcp any any eq 80، ثم access-list 100 permit tcp any any eq 443." },
              config: EX({
                kind: "challenge",
                device: "router",
                startMode: "global",
                intro: "أنت في وضع الإعداد العام.",
                steps: [
                  { id: "c1", instruction: "اكتب مثال الكتاب: القائمة 100 تسمح بـ TCP من أي مصدر إلى أي وجهة على المنفذ 80", expect: { command: "access-list", args: { number: 100, action: "permit", protocol: "tcp", source: "any", destination: "any", port: 80 } }, hints: ["صندوق مثال HTTP في الصفحة، في سطر واحد.", "access-list 100 permit tcp any any eq 80."] },
                  { id: "c2", instruction: "اكتب القاعدة نفسها للمنفذ 443", expect: { command: "access-list", args: { number: 100, action: "permit", protocol: "tcp", source: "any", destination: "any", port: 443 } }, hints: ["غيّر رقم المنفذ فقط.", "eq 443."] },
                ],
                allowed: ["access-list"],
                completion: "✓ صحيح — القائمة 100 تسمح بـ HTTP و HTTPS.",
              }),
            },
            {
              id: "m06-l01-p01-ws", type: "practice-table", origin: "teacher-enrichment", caption: "ورقة عمل: ما معنى كل جزء في مثال الكتاب؟",
              headers: ["الجزء", "المعنى"],
              columnDirs: ["ltr", "rtl"],
              rows: [["permit", MN("سماح")], ["tcp", MN("البروتوكول")], ["any any", MN("أي مصدر / أي وجهة")], ["eq 80", MN("منفذ HTTP")]],
            },
            {
              id: "m06-l01-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما مدى أرقام Extended ACL غالبًا بحسب الكتاب؟",
                options: [opt("m06-l01-p01-q1-a", "من 100 إلى 199", true), opt("m06-l01-p01-q1-b", "من 1 إلى 99"), opt("m06-l01-p01-q1-c", "من 0 إلى 65535")],
                feedback: {
                  hints: ["السطر الأخير في قائمة الحقائق.", "رقم القائمة في المثال هو 100."],
                  correctFeedback: "صحيح — من 100 إلى 199.",
                  incorrectFeedback: "افحص السطر: «أرقامها غالبًا من 100 إلى 199».",
                  explanation: "1–99 للقوائم القياسية.",
                },
              },
            },
          ],
        },
      ],
    },
    // ── l02 — تدريبات وامتحانات (PDF 228–229) ────────────────────────────────────────────────────────────────
    {
      id: "791381-m06-l02",
      title: "تدريبات وامتحانات",
      order: 2,
      pages: [
        // PDF 228 — تدريبات (QR trainings page)
        {
          id: "791381-m06-l02-p01",
          title: "تدريبات",
          order: 1,
          source: src(228, 228),
          conversionNote: "صفحة تدريبات QR في الكتاب (التدريبات 27–30). البطاقات الأربع تُعرض كما في الكتاب كبطاقات ثابتة مع ملاحظة الكتاب؛ وتُفتح التدريبات T27–T30 من داخل المنصة (library-training) عندما يصبح الجزء المرتبط بها متاحًا.",
          keywords: ["تدريبات", "QR", "T27", "T28", "T29", "T30"],
          blocks: [
            {
              id: "m06-l02-p01-cards", type: "list", origin: "book", variant: "cards", title: "بطاقات التدريب كما في الكتاب (امسح الرمز لحل التدريب)",
              items: [
                { id: "m06-l02-p01-t27", term: "T27", text: [T("التدريب السابع والعشرون")] },
                { id: "m06-l02-p01-t28", term: "T28", text: [T("التدريب الثامن والعشرون")] },
                { id: "m06-l02-p01-t29", term: "T29", text: [T("التدريب التاسع والعشرون")] },
                { id: "m06-l02-p01-t30", term: "T30", text: [T("التدريب الثلاثون")] },
              ],
            },
            {
              id: "m06-l02-p01-review-note", type: "callout", origin: "book", kind: "tip", title: "للمراجعة",
              spans: [T("تدريبات مرفقة للمراجعة والتطبيق على أوامر الشبكات و "), L("ACL"), T(".")],
            },
            {
              id: "m06-l02-p01-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("يمكن فتح التدريبات 27–30 من داخل المنصة عندما يصبح الجزء المرتبط بها متاحًا؛ قبل حلّها راجع الصفحات الخمس السابقة وتدرّب في محاكياتها على كتابة القائمة ثم تطبيقها.")],
            },
            // ── Learning Practice (Reader position 214): the platform's T27–T30 (exam reviews), one card per printed
            // training. Metadata only — the host / API decide availability and disclose the library title.
            { id: "m06-l02-p01-practice", type: "heading", origin: "teacher-enrichment", level: 3, text: "تدريبات مرتبطة بهذه الصفحة" },
            { id: "m06-l02-p01-lt27", type: "library-training", origin: "book", trainingId: "T27", label: "تدريب 27", requiredModuleId: "791381-m06" },
            { id: "m06-l02-p01-lt28", type: "library-training", origin: "book", trainingId: "T28", label: "تدريب 28", requiredModuleId: "791381-m06" },
            { id: "m06-l02-p01-lt29", type: "library-training", origin: "book", trainingId: "T29", label: "تدريب 29", requiredModuleId: "791381-m06" },
            { id: "m06-l02-p01-lt30", type: "library-training", origin: "book", trainingId: "T30", label: "تدريب 30", requiredModuleId: "791381-m06" },
            {
              id: "m06-l02-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "اكتب أمر Cisco الذي يجب ألا تنساه بعد كتابة أي قائمة ACL حتى تعمل (الأمر بلا قيم).", answer: "ip access-group",
                feedback: {
                  hints: ["صندوق «خطأ شائع» في صفحة «أمثلة إضافية».", "يبدأ بـ ip."],
                  correctFeedback: "صحيح — ip access-group.",
                  incorrectFeedback: "افحص صندوق «خطأ شائع» في صفحة «Standard ACL — أمثلة إضافية».",
                  explanation: "القائمة لا تعمل إطلاقًا حتى تُربط بواجهة واتجاه.",
                },
              },
            },
          ],
        },
        // PDF 229 — امتحانات نهائية للتدريب (QR exams page) + module review
        {
          id: "791381-m06-l02-p02",
          title: "امتحانات نهائية للتدريب",
          order: 2,
          source: src(229, 229),
          conversionNote: "صفحة امتحانات QR في الكتاب (الامتحانات F01–F06). البطاقات الست تُعرض كما في الكتاب كبطاقات ثابتة مع ملاحظة الكتاب؛ وتُفتح الامتحانات النهائية للتدريب F01–F06 من داخل المنصة (library-training) عندما يصبح الجزء المرتبط بها متاحًا، ومراجعة الوحدة أُضيفت بعدها كإثراء تعليمي.",
          keywords: ["امتحانات نهائية", "QR", "F01", "F02", "F03", "F04", "F05", "F06"],
          blocks: [
            {
              id: "m06-l02-p02-cards", type: "list", origin: "book", variant: "cards", title: "بطاقات الامتحانات كما في الكتاب (امسح الرمز لفتح الامتحان)",
              items: [
                { id: "m06-l02-p02-f01", term: "F01", text: [T("الامتحان الأول")] },
                { id: "m06-l02-p02-f02", term: "F02", text: [T("الامتحان الثاني")] },
                { id: "m06-l02-p02-f03", term: "F03", text: [T("الامتحان الثالث")] },
                { id: "m06-l02-p02-f04", term: "F04", text: [T("الامتحان الرابع")] },
                { id: "m06-l02-p02-f05", term: "F05", text: [T("الامتحان الخامس")] },
                { id: "m06-l02-p02-f06", term: "F06", text: [T("الامتحان السادس")] },
              ],
            },
            {
              id: "m06-l02-p02-before", type: "callout", origin: "book", kind: "tip", title: "قبل الاختبار",
              spans: [T("امتحانات نهائية للتدريب والمراجعة الشاملة قبل الاختبار الرسمي.")],
            },
            {
              id: "m06-l02-p02-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("الامتحانات النهائية للتدريب الستة يمكن فتحها من داخل المنصة عندما يصبح الجزء المرتبط بها متاحًا (كل امتحان يُحل كتدريب حرّ: تُحفظ أفضل نتيجة تلقائية فقط، لا يُحسب كواجب ولا يمنح نقاط تقوية)؛ وهنا نختم بمراجعة قصيرة لوحدة "), L("ACL"), T(".")],
            },
            // ── Learning Practice (Reader position 215): the platform's F01–F06 «امتحانات نهائية للتدريب», one card per
            // printed exam. Metadata only — the host / API decide availability and disclose the library title.
            { id: "m06-l02-p02-practice", type: "heading", origin: "teacher-enrichment", level: 3, text: "امتحانات نهائية للتدريب" },
            { id: "m06-l02-p02-lf01", type: "library-training", origin: "book", trainingId: "F01", label: "الامتحان الأول", requiredModuleId: "791381-m06" },
            { id: "m06-l02-p02-lf02", type: "library-training", origin: "book", trainingId: "F02", label: "الامتحان الثاني", requiredModuleId: "791381-m06" },
            { id: "m06-l02-p02-lf03", type: "library-training", origin: "book", trainingId: "F03", label: "الامتحان الثالث", requiredModuleId: "791381-m06" },
            { id: "m06-l02-p02-lf04", type: "library-training", origin: "book", trainingId: "F04", label: "الامتحان الرابع", requiredModuleId: "791381-m06" },
            { id: "m06-l02-p02-lf05", type: "library-training", origin: "book", trainingId: "F05", label: "الامتحان الخامس", requiredModuleId: "791381-m06" },
            { id: "m06-l02-p02-lf06", type: "library-training", origin: "book", trainingId: "F06", label: "الامتحان السادس", requiredModuleId: "791381-m06" },
            { id: "m06-l02-p02-review", type: "heading", origin: "teacher-enrichment", text: "مراجعة الوحدة", level: 3 },
            {
              id: "m06-l02-p02-r1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي قائمة تفحص المصدر والوجهة والبروتوكول والمنفذ معًا؟",
                options: [opt("m06-l02-p02-r1-a", "Extended ACL", true), opt("m06-l02-p02-r1-b", "Standard ACL"), opt("m06-l02-p02-r1-c", "VLAN")],
                feedback: {
                  hints: ["صفحة «Extended ACL»، صندوق «شرح المثال».", "أرقامها 100–199."],
                  correctFeedback: "صحيح — Extended ACL.",
                  incorrectFeedback: "افحص بطاقتي Standard و Extended في الصفحة الأولى.",
                  explanation: "Standard تفحص IP المصدر فقط.",
                },
              },
            },
            {
              id: "m06-l02-p02-r2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "اكتب القاعدة القياسية التي تسمح للجهاز 192.168.1.10 وحده في القائمة 30 (الأمر كاملًا).", answer: `access-list 30 permit host ${HOST}`,
                feedback: {
                  hints: ["صفحة «أمثلة إضافية»، السطر الأول.", "الكلمة host قبل عنوان الجهاز."],
                  correctFeedback: "صحيح — access-list 30 permit host 192.168.1.10.",
                  incorrectFeedback: "افحص صندوق صفحة «Standard ACL — أمثلة إضافية».",
                  explanation: "host تعني «هذا الجهاز وحده».",
                },
              },
            },
            {
              id: "m06-l02-p02-r3", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "كل ACL تنتهي ضمنيًا بـ deny any حتى لو لم يُكتب.", answer: true,
                feedback: {
                  hints: ["صفحة «أمثلة إضافية»، صندوق «في الامتحان».", "الرفض الضمني."],
                  correctFeedback: "صحيح — الرفض الضمني.",
                  incorrectFeedback: "افحص صندوق «في الامتحان · الرفض الضمني».",
                  explanation: "أي عنوان لا تسمح له صراحةً يُمنع تلقائيًا.",
                },
              },
            },
          ],
        },
      ],
    },
  ],
};

export default m06;
