// Learning Materials — Batch 9 phase: REAL converted body for Book 791381, module m24 (the book's section
// «حماية أجهزة Cisco», source PDF 185–191 — seven pages under the running header «حماية أجهزة Cisco», no section
// cover; PDF 191 is the section's closing QR trainings page). NEW stable id m24, reading `order` 22: after m23
// («Port Security», order 21) and before m05 («مرجع أوامر Cisco», order 23, completed in place).
// Book-derived blocks are origin:"book": the PDF 185 definition + facts + «تذكّر», the PDF 186 three access cards
// (Console / VTY / Enable with their commands) + «تذكّر», the PDF 187 / 188 / 189 / 190 «Cisco CLI» boxes (as
// `code` blocks with the book's exact lines and its generic `Device(config)#` prompt + the annotation tables) +
// «تذكّر» / «متى؟», the PDF 191 four training cards + «ملاحظة».
// INTERACTIVE CLI: PDF 187 guided example, PDF 188 command challenge, PDF 189 multi-step hardening task (final
// state), PDF 190 show-command challenge. The book prints the line commands under the generic `Device(config)#`;
// the simulator (and the clarification notes) enters the line mode `(config-line)#` after `line console 0` /
// `line vty 0 4`, as a real device does.
// Technical tokens (Cisco, Console, VTY, Enable, Telnet, SSH, the commands, cisco123, Packet Tracer) are LTR
// spans; no arrow glyphs. Trainings T23–T26 are the book's QR trainings: static cards with a conversionNote, not
// delivered in the platform (no `library-training` block).
// SOURCE LEVEL: the book gives the three access methods, two line-password boxes, encryption + enable secret, and
// the two show commands — no SSH configuration, no usernames, no `enable password`, no save command. Nothing more.
// SOURCE ORDER: nothing from PDF 192+ (the command reference) appears here beyond what the section itself prints.
// PRINTED PAGE = the rendered page circle = the PDF index (PDF 185 prints «185» … PDF 191 prints «191»).

import type { ContentModule, ContentSource, InlineSpan, PracticeOption, PracticeTableSelectCell } from "../../types";
import type { CliExerciseConfig } from "../../../cli/types";

const CID = "791381";
const src = (pdf: number, printed?: number): ContentSource => ({ kind: "book", sourceId: CID, pdfPageStart: pdf, printedPage: printed });
const L = (text: string): InlineSpan => ({ text, dir: "ltr", style: "code" });
const T = (text: string): InlineSpan => ({ text });
const opt = (id: string, text: string, correct?: true): PracticeOption => (correct ? { id, text, correct } : { id, text });
const EX = (exercise: CliExerciseConfig): Record<string, unknown> => ({ ...exercise });
const CMDS = ["line console 0", "line vty 0 4", "enable secret"] as const;
const CM = (key: (typeof CMDS)[number]): PracticeTableSelectCell => ({ kind: "select", options: [...CMDS], key });
const PW = "cisco123";

const m24: ContentModule = {
  id: "791381-m24",
  title: "حماية أجهزة Cisco",
  shortTitle: "حماية الأجهزة",
  order: 22,
  source: { kind: "book", sourceId: CID, pdfPageStart: 185, pdfPageEnd: 191, sourceNote: "سبع صفحات تحت العنوان الجاري «حماية أجهزة Cisco» (PDF 185–191) بلا صفحة عنوان خاصة؛ PDF 191 صفحة تدريبات QR ختامية. PDF 184 آخر صفحة في وحدة Port Security (m23)، و PDF 192 تبدأ وحدة «مرجع أوامر Cisco» (m05)." },
  lessons: [
    // ── l01 — طرق الدخول إلى أجهزة Cisco (PDF 185–186) ────────────────────────────────────────────────────────
    {
      id: "791381-m24-l01",
      title: "طرق الدخول إلى أجهزة Cisco",
      order: 1,
      pages: [
        // PDF 185 — حماية السويتشات والراوترات
        {
          id: "791381-m24-l01-p01",
          title: "حماية السويتشات والراوترات",
          order: 1,
          source: src(185, 185),
          keywords: ["كلمات مرور", "Console", "VTY", "Enable", "الدخول غير المصرّح به"],
          blocks: [
            {
              id: "m24-l01-p01-def", type: "callout", origin: "book", kind: "important",
              spans: [T("نحمي أجهزة "), L("Cisco"), T(" بكلمات مرور.")],
            },
            {
              id: "m24-l01-p01-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m24-l01-p01-f1", text: [T("الدخول قد يكون من "), L("Console"), T(" أو "), L("VTY"), T(" أو "), L("Enable"), T(".")] },
                { id: "m24-l01-p01-f2", text: [T("الهدف: السماح للتقني فقط بتعديل الإعدادات.")] },
                { id: "m24-l01-p01-f3", text: [T("كلمات المرور تمنع الدخول غير المصرّح به.")] },
              ],
            },
            {
              id: "m24-l01-p01-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("حماية الجهاز نفسه لا تقل أهمية عن حماية الشبكة.")],
            },
            {
              // ENRICHMENT (Batch 8): SVG visual enrichment appended after the book content.
              id: "m24-l01-p01-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m24/device-security-layers", motion: false,
              source: src(185),
              title: "مخطط: حماية الجهاز نفسه بكلمات المرور",
              alt: "مخطط: جهاز Cisco تحميه ثلاث طرق دخول مقفلة بكلمة مرور — Console و VTY و Enable — دون عرض أوامر أو قيم كلمات المرور.",
              caption: "‏نحمي الجهاز نفسه: Console و VTY و Enable كلٌّ بكلمة مرور.",
            },
            {
              id: "m24-l01-p01-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("في الوحدات السابقة حمينا الشبكة (جدار الحماية، "), L("Port Security"), T("…)؛ هنا نحمي الجهاز نفسه: من يستطيع فتح السويتش أو الراوتر وتغيير إعداداته. الصفحة التالية تعرض الطرق الثلاث للدخول، وكل طريقة لها كلمة مرور.")],
            },
            {
              id: "m24-l01-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما الهدف من حماية أجهزة Cisco بكلمات مرور بحسب الكتاب؟",
                options: [opt("m24-l01-p01-q1-a", "السماح للتقني فقط بتعديل الإعدادات", true), opt("m24-l01-p01-q1-b", "تسريع الشبكة"), opt("m24-l01-p01-q1-c", "توزيع عناوين IP")],
                feedback: {
                  hints: ["السطر الثاني في قائمة الحقائق.", "من الذي يجب أن يعدّل الإعدادات؟"],
                  correctFeedback: "صحيح — الهدف السماح للتقني فقط بتعديل الإعدادات.",
                  incorrectFeedback: "افحص السطر: «الهدف: السماح للتقني فقط بتعديل الإعدادات».",
                  explanation: "كلمات المرور تمنع الدخول غير المصرّح به إلى الجهاز.",
                },
              },
            },
            {
              id: "m24-l01-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "fillBlank", prompt: "الدخول إلى أجهزة Cisco قد يكون من Console أو VTY أو ______.", answers: ["Enable", "enable"],
                feedback: {
                  hints: ["السطر الأول في قائمة الحقائق.", "الوضع المتقدّم للأوامر."],
                  correctFeedback: "صحيح — Console أو VTY أو Enable.",
                  incorrectFeedback: "افحص السطر: «الدخول قد يكون من Console أو VTY أو …».",
                  explanation: "الطرق الثلاث تُشرح في الصفحة التالية مع أمر كل واحدة منها.",
                },
              },
            },
          ],
        },
        // PDF 186 — طرق الدخول إلى أجهزة Cisco
        {
          id: "791381-m24-l01-p02",
          title: "طرق الدخول إلى أجهزة Cisco",
          order: 2,
          source: src(186, 186),
          keywords: ["Console", "VTY", "Enable", "line console 0", "line vty 0 4", "enable secret", "Telnet", "SSH"],
          blocks: [
            {
              id: "m24-l01-p02-table", type: "table", origin: "book", caption: "بطاقات الكتاب الثلاث",
              headers: ["الطريقة", "الوصف", "الأمر"],
              rows: [
                ["Console", "دخول مباشر بكابل Console، يُستخدم عند البرمجة الأولى.", "line console 0"],
                ["VTY", "دخول عن بُعد باستخدام Telnet أو SSH، ويحتاج كلمة مرور.", "line vty 0 4"],
                ["Enable", "وضع الأوامر المتقدّم، يُفضّل حمايته بـ enable secret.", "enable secret"],
              ],
              columnDirs: ["ltr", "rtl", "ltr"],
            },
            {
              id: "m24-l01-p02-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [L("Console"), T(" = قريب من الجهاز، و "), L("VTY"), T(" = دخول عن بُعد.")],
            },
            {
              // ENRICHMENT (Batch 6): SVG visual enrichment appended after the book content.
              id: "m24-l01-p02-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m24/device-access-paths", motion: false,
              source: src(186),
              title: "مخطط: طرق الدخول إلى أجهزة Cisco",
              alt: "مخطط لثلاث طرق للدخول إلى جهاز Cisco: Console بكابل مباشر (line console 0)، و VTY عن بُعد عبر Telnet أو SSH (line vty 0 4)، و Enable للوضع المتقدّم (enable secret).",
              caption: "‏Console محلي · VTY عن بُعد · Enable للأوامر المتقدّمة.",
            },
            {
              id: "m24-l01-p02-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("الأرقام في الأمرين هي أرقام الخطوط: "), L("line console 0"), T(" هو خط الكابل المباشر الوحيد، و "), L("line vty 0 4"), T(" يعني خمسة خطوط للدخول عن بُعد (من 0 إلى 4) تُضبط معًا. الصفحتان التاليتان تكملان كل أمر بكلمة المرور.")],
            },
            {
              id: "m24-l01-p02-ws", type: "practice-table", origin: "teacher-enrichment", caption: "ورقة عمل: اختر أمر كل طريقة دخول كما في بطاقات الكتاب",
              headers: ["الطريقة", "الأمر"],
              rows: [
                ["دخول مباشر بكابل (Console)", CM("line console 0")],
                ["دخول عن بُعد (VTY)", CM("line vty 0 4")],
                ["وضع الأوامر المتقدّم (Enable)", CM("enable secret")],
              ],
              columnDirs: ["rtl", "ltr"],
            },
            {
              id: "m24-l01-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي طريقة دخول تُستخدم عند البرمجة الأولى للجهاز؟",
                options: [opt("m24-l01-p02-q1-a", "Console — دخول مباشر بكابل", true), opt("m24-l01-p02-q1-b", "VTY — دخول عن بُعد"), opt("m24-l01-p02-q1-c", "Enable — وضع الأوامر المتقدّم")],
                feedback: {
                  hints: ["البطاقة الأولى في الكتاب.", "قبل أن يكون للجهاز عنوان، لا يمكن الدخول عن بُعد."],
                  correctFeedback: "صحيح — Console يُستخدم عند البرمجة الأولى.",
                  incorrectFeedback: "افحص بطاقة Console: «يُستخدم عند البرمجة الأولى».",
                  explanation: "Console قريب من الجهاز بكابل مباشر، و VTY دخول عن بُعد باستخدام Telnet أو SSH.",
                },
              },
            },
          ],
        },
      ],
    },
    // ── l02 — كلمات المرور وعرض الإعدادات (PDF 187–190) ───────────────────────────────────────────────────────
    {
      id: "791381-m24-l02",
      title: "كلمات المرور وعرض الإعدادات",
      order: 2,
      pages: [
        // PDF 187 — كلمة مرور VTY + GUIDED
        {
          id: "791381-m24-l02-p01",
          title: "كلمة مرور VTY",
          order: 1,
          source: src(187, 187),
          keywords: ["line vty 0 4", "password cisco123", "login", "SSH", "Telnet"],
          blocks: [
            {
              id: "m24-l02-p01-cli", type: "code", origin: "book", language: "cli",
              code: `Device(config)# line vty 0 4\nDevice(config)# password ${PW}\nDevice(config)# login`,
            },
            {
              id: "m24-l02-p01-cmds", type: "table", origin: "book",
              caption: "Cisco CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Device(config)# line vty 0 4", "يسمح بالدخول عن بُعد"],
                [`Device(config)# password ${PW}`, "كلمة مرور لمنع الدخول العشوائي"],
                ["Device(config)# login", "يجعل الجهاز يطلب كلمة المرور"],
              ],
            },
            {
              id: "m24-l02-p01-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("يُفضّل "), L("SSH"), T(" بدل "), L("Telnet"), T(" لأنه أكثر أمانًا ويشفّر البيانات.")],
            },
            {
              id: "m24-l02-p01-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("بعد "), L("line vty 0 4"), T(" يتغيّر المؤشّر على الجهاز الحقيقي إلى "), L("Switch(config-line)#"), T("، وهناك تُكتب "), L("password"), T(" ثم "), L("login"), T(". الكتاب يكتب السطور الثلاثة تحت المؤشّر العام للاختصار، وفي المحاكي سترى تغيّر المؤشّر بنفسك.")],
            },
            {
              id: "m24-l02-p01-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مثال موجّه: كلمة مرور للدخول عن بُعد",
              description: "ابدأ من وضع المستخدم ونفّذ سطور صندوق الكتاب. المحاكي يتحقّق من الوضع ومن الأمر ويعطيك تلميحين عند الحاجة. محاكاة تعليمية مبسّطة.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "المثال الموجّه: ادخل إلى الوضع المتقدّم ثم الإعداد العام، اختر خطوط VTY من 0 إلى 4، ضع كلمة المرور cisco123، ثم اطلب كلمة المرور بالأمر login." },
              config: EX({
                kind: "guided",
                device: "switch",
                intro: "نفّذ سطور صندوق الكتاب بالترتيب، بدءًا من وضع المستخدم.",
                steps: [
                  { id: "s1", instruction: "انتقل إلى وضع الأوامر المتقدّم", expect: { mode: "privileged" }, success: "✓ أحسنت، انتقلت إلى وضع الأوامر المتقدّم", hints: ["الأمر الأول عند فتح الجهاز، ويغيّر المؤشّر من > إلى #.", "كلمة واحدة تبدأ بـ en."] },
                  { id: "s2", instruction: "انتقل إلى وضع الإعداد العام", expect: { mode: "global" }, success: "✓ أحسنت، انتقلت إلى وضع الإعداد العام", hints: ["أمر من كلمتين يجعل المؤشّر (config)#.", "يبدأ بـ configure."] },
                  { id: "s3", instruction: "اختر خطوط الدخول عن بُعد من 0 إلى 4", expect: { command: "line", args: { line: "vty" } }, success: "✓ أحسنت، أنت الآن في وضع إعداد خط الدخول", hints: ["السطر الأول في صندوق الكتاب.", "يبدأ بـ line vty ويليه رقما البداية والنهاية."] },
                  { id: "s4", instruction: "ضع كلمة المرور cisco123", expect: { command: "password", args: { password: PW } }, hints: ["السطر الثاني في صندوق الكتاب.", "يبدأ بـ password ويليه كلمة المرور."] },
                  { id: "s5", instruction: "اجعل الجهاز يطلب كلمة المرور عند الدخول", expect: { command: "login" }, hints: ["السطر الأخير في صندوق الكتاب.", "كلمة واحدة تعني «تسجيل الدخول»."] },
                ],
                completion: "✓ أحسنت، الدخول عن بُعد محمي الآن بكلمة مرور.",
              }),
            },
            {
              id: "m24-l02-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ماذا يفعل الأمر login في صندوق الكتاب؟",
                options: [opt("m24-l02-p01-q1-a", "يجعل الجهاز يطلب كلمة المرور", true), opt("m24-l02-p01-q1-b", "يحدّد كلمة المرور"), opt("m24-l02-p01-q1-c", "يسمح بالدخول عن بُعد")],
                feedback: {
                  hints: ["الصف الأخير في جدول الأوامر.", "بدونه لا يُسأل الداخل عن كلمة المرور."],
                  correctFeedback: "صحيح — login يجعل الجهاز يطلب كلمة المرور.",
                  incorrectFeedback: "افحص جدول الأوامر: «يجعل الجهاز يطلب كلمة المرور».",
                  explanation: "line vty 0 4 يسمح بالدخول عن بُعد، password يحدّد الكلمة، و login يطلبها.",
                },
              },
            },
            {
              id: "m24-l02-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "يُفضّل Telnet بدل SSH لأنه يشفّر البيانات.", answer: false,
                feedback: {
                  hints: ["اقرأ صندوق «تذكّر».", "أيهما يشفّر البيانات؟"],
                  correctFeedback: "صحيح — العكس: يُفضّل SSH لأنه أكثر أمانًا ويشفّر البيانات.",
                  incorrectFeedback: "افحص صندوق «تذكّر»: «يُفضّل SSH بدل Telnet».",
                  explanation: "في جدول المنافذ رأيت أن Telnet (23) اتصال غير آمن و SSH (22) اتصال آمن.",
                },
              },
            },
          ],
        },
        // PDF 188 — كلمة مرور Console + CHALLENGE
        {
          id: "791381-m24-l02-p02",
          title: "كلمة مرور Console",
          order: 2,
          source: src(188, 188),
          keywords: ["line console 0", "password cisco123", "login", "Packet Tracer"],
          blocks: [
            {
              id: "m24-l02-p02-cli", type: "code", origin: "book", language: "cli",
              code: `Device(config)# line console 0\nDevice(config)# password ${PW}\nDevice(config)# login`,
            },
            {
              id: "m24-l02-p02-cmds", type: "table", origin: "book",
              caption: "Cisco CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Device(config)# line console 0", "منفذ الدخول المباشر للجهاز"],
                [`Device(config)# password ${PW}`, "كلمة مرور للحماية"],
                ["Device(config)# login", "يطلب كلمة المرور عند الدخول"],
              ],
            },
            {
              id: "m24-l02-p02-when", type: "callout", origin: "book", kind: "tip", title: "متى؟",
              spans: [T("مهم عند وجود الجهاز في مكان مشترك، ويُستخدم كثيرًا في "), L("Packet Tracer"), T(".")],
            },
            {
              id: "m24-l02-p02-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("السطران الثاني والثالث مطابقان لصفحة "), L("VTY"), T("؛ الفرق فقط في السطر الأول: "), L("line console 0"), T(" لخط الكابل المباشر بدل "), L("line vty 0 4"), T(". هكذا تُحمى كل طريقة دخول بكلمة المرور نفسها أو بكلمة مختلفة.")],
            },
            {
              id: "m24-l02-p02-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "تحدّي الأمر: احمِ منفذ Console",
              description: "أنت في وضع الإعداد العام. اكتب الأمر المطلوب في كل سؤال؛ المحاكي لا يكشف الإجابة. محاكاة تعليمية مبسّطة.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "التحدّي: اختر خط الدخول المباشر (console 0)، ضع كلمة المرور cisco123، ثم اطلبها بالأمر login." },
              config: EX({
                kind: "challenge",
                device: "switch",
                startMode: "global",
                intro: "أنت في وضع الإعداد العام.",
                steps: [
                  { id: "c1", instruction: "اكتب الأمر الذي يختار منفذ الدخول المباشر للجهاز", expect: { command: "line", args: { line: "console" } }, hints: ["السطر الأول في صندوق الكتاب؛ يبدأ بـ line.", "اسم الخط هو console ورقمه 0."] },
                  { id: "c2", instruction: "اكتب الأمر الذي يضع كلمة المرور cisco123", expect: { command: "password", args: { password: PW } }, hints: ["يُكتب داخل الخط، تحت (config-line)#.", "يبدأ بـ password."] },
                  { id: "c3", instruction: "اكتب الأمر الذي يجعل الجهاز يطلب كلمة المرور عند الدخول", expect: { command: "login" }, hints: ["كلمة واحدة، في السطر الأخير من صندوق الكتاب.", "تعني «تسجيل الدخول»."] },
                ],
                allowed: ["password", "login"],
                completion: "✓ صحيح في كل الأوامر — منفذ Console محمي الآن.",
              }),
            },
            {
              id: "m24-l02-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما الفرق الوحيد بين صندوق Console وصندوق VTY في الكتاب؟",
                options: [opt("m24-l02-p02-q1-a", "السطر الأول: line console 0 بدل line vty 0 4", true), opt("m24-l02-p02-q1-b", "كلمة المرور مختلفة"), opt("m24-l02-p02-q1-c", "لا يوجد أمر login في Console")],
                feedback: {
                  hints: ["قارن السطور الثلاثة في الصفحتين.", "السطران الثاني والثالث متطابقان."],
                  correctFeedback: "صحيح — الفرق في السطر الأول فقط.",
                  incorrectFeedback: "افحص الصندوقين سطرًا سطرًا.",
                  explanation: "line console 0 لخط الكابل المباشر، و line vty 0 4 لخطوط الدخول عن بُعد؛ password و login متطابقان.",
                },
              },
            },
          ],
        },
        // PDF 189 — تشفير كلمات المرور + TASK
        {
          id: "791381-m24-l02-p03",
          title: "تشفير كلمات المرور",
          order: 3,
          source: src(189, 189),
          keywords: ["service password-encryption", "enable secret cisco123", "enable password"],
          blocks: [
            {
              id: "m24-l02-p03-cli", type: "code", origin: "book", language: "cli",
              code: `Device(config)# service password-encryption\nDevice(config)# enable secret ${PW}`,
            },
            {
              id: "m24-l02-p03-cmds", type: "table", origin: "book",
              caption: "Cisco CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Device(config)# service password-encryption", "يخفي كلمات المرور العادية في الإعدادات"],
                [`Device(config)# enable secret ${PW}`, "أقوى من enable password"],
              ],
            },
            {
              id: "m24-l02-p03-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [L("enable secret"), T(" يحمي وضع الأوامر المتقدّم، ويُفضّل دائمًا كلمة سر قوية.")],
            },
            {
              id: "m24-l02-p03-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("بدون "), L("service password-encryption"), T(" تظهر كلمات مرور الخطوط كما كُتبت عند عرض الإعدادات؛ بعده تظهر مخفية. أما "), L("enable secret"), T(" فيُحفظ مشفّرًا دائمًا، ولهذا هو أقوى من "), L("enable password"), T(" الذي لا يذكره الكتاب إلا للمقارنة. المهمة أدناه تجمع حماية الجهاز كلها.")],
            },
            {
              id: "m24-l02-p03-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مهمة إعداد: احمِ الجهاز كاملًا",
              description: "ابدأ من وضع المستخدم وطبّق أوامر الصفحات الثلاث: كلمة مرور Console، كلمة مرور VTY، enable secret، والتشفير. تكتمل المهمة فقط عندما تصبح كل النقاط موجودة. محاكاة تعليمية مبسّطة.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "المهمة: خط Console بكلمة المرور cisco123 مع login، خطوط VTY 0 4 بكلمة المرور cisco123 مع login، enable secret cisco123، وتفعيل service password-encryption." },
              config: EX({
                kind: "task",
                device: "switch",
                intro: "احمِ الجهاز بأوامر الصفحات الثلاث. تكتمل المهمة عندما تتحقّق كل النقاط التالية:",
                goals: [
                  { id: "g1", label: "خط Console له كلمة المرور cisco123", condition: { kind: "line", line: "console", prop: "password", value: PW } },
                  { id: "g2", label: "خط Console يطلب كلمة المرور (login)", condition: { kind: "line", line: "console", prop: "login", value: true } },
                  { id: "g3", label: "خطوط VTY لها كلمة المرور cisco123", condition: { kind: "line", line: "vty", prop: "password", value: PW } },
                  { id: "g4", label: "خطوط VTY تطلب كلمة المرور (login)", condition: { kind: "line", line: "vty", prop: "login", value: true } },
                  { id: "g5", label: "وضع الأوامر المتقدّم محمي بـ enable secret cisco123", condition: { kind: "device", prop: "enableSecret", value: PW } },
                  { id: "g6", label: "تشفير كلمات المرور مفعّل", condition: { kind: "device", prop: "passwordEncryption", value: true } },
                ],
                hints: ["لكل خط دخول وضعه الخاص: ادخل بـ line ثم اكتب password و login، ثم exit قبل الخط التالي.", "أمرا التشفير و enable secret يُكتبان في وضع الإعداد العام (config)#، لا داخل الخط."],
                completion: "✓ أحسنت، الجهاز محمي: Console و VTY بكلمة مرور، enable secret، والتشفير مفعّل.",
              }),
            },
            {
              id: "m24-l02-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ماذا يفعل الأمر service password-encryption؟",
                options: [opt("m24-l02-p03-q1-a", "يخفي كلمات المرور العادية في الإعدادات", true), opt("m24-l02-p03-q1-b", "يحذف كلمات المرور"), opt("m24-l02-p03-q1-c", "يسمح بالدخول عن بُعد")],
                feedback: {
                  hints: ["الصف الأول في جدول الأوامر.", "الكلمة encryption تعني التشفير."],
                  correctFeedback: "صحيح — يخفي كلمات المرور العادية في الإعدادات.",
                  incorrectFeedback: "افحص جدول الأوامر: «يخفي كلمات المرور العادية في الإعدادات».",
                  explanation: "بعده لا تظهر كلمات مرور الخطوط بنصّها عند عرض الإعدادات.",
                },
              },
            },
            {
              id: "m24-l02-p03-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "enable secret أقوى من enable password بحسب الكتاب.", answer: true,
                feedback: {
                  hints: ["الصف الثاني في جدول الأوامر.", "أيهما يذكره الكتاب في صندوق «تذكّر»؟"],
                  correctFeedback: "صحيح — enable secret أقوى من enable password.",
                  incorrectFeedback: "افحص جدول الأوامر: «أقوى من enable password».",
                  explanation: "enable secret يحمي وضع الأوامر المتقدّم، ويُفضّل دائمًا كلمة سر قوية.",
                },
              },
            },
          ],
        },
        // PDF 190 — عرض الإعدادات + SHOW CHALLENGE
        {
          id: "791381-m24-l02-p04",
          title: "عرض الإعدادات",
          order: 4,
          source: src(190, 190),
          keywords: ["show running-config", "show startup-config", "الفحص", "الحفظ"],
          blocks: [
            {
              id: "m24-l02-p04-cli", type: "code", origin: "book", language: "cli",
              code: "Device(config)# show running-config\nDevice(config)# show startup-config",
            },
            {
              id: "m24-l02-p04-cmds", type: "table", origin: "book",
              caption: "Cisco CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Device(config)# show running-config", "يعرض الإعدادات الحالية"],
                ["Device(config)# show startup-config", "يعرض الإعدادات المحفوظة عند التشغيل"],
              ],
            },
            {
              id: "m24-l02-p04-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("نستخدمها للفحص والتأكّد من الأوامر، ولا تنسَ الحفظ بعد البرمجة.")],
            },
            {
              id: "m24-l02-p04-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("«الإعدادات الحالية» هي ما يعمل به الجهاز الآن في الذاكرة، و«المحفوظة» هي ما يعود إليه بعد إعادة التشغيل. الكتاب لا يعرض أمر الحفظ نفسه، لذلك في المحاكي يعرض "), L("show startup-config"), T(" أنه لا يوجد شيء محفوظ بعد — وهذا مخرج محاكاة تعليمية، لا مخرج جهاز حقيقي.")],
            },
            {
              id: "m24-l02-p04-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "تحدّي الفحص: اعرض الإعدادات",
              description: "اكتب أمر العرض المطلوب في كل سؤال واقرأ المخرجات المبسّطة (محاكاة تعليمية، ليست مخرجات جهاز حقيقي).",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "التحدّي: اعرض الإعدادات الحالية بالأمر show running-config، ثم الإعدادات المحفوظة بالأمر show startup-config." },
              config: EX({
                kind: "challenge",
                device: "switch",
                hostname: "SW1",
                startMode: "privileged",
                intro: "أنت على الجهاز SW1 في وضع الأوامر المتقدّم.",
                steps: [
                  { id: "c1", instruction: "اكتب الأمر الذي يعرض الإعدادات الحالية", expect: { command: "show", args: { what: "running-config" } }, hints: ["السطر الأول في صندوق الكتاب؛ يبدأ بـ show.", "الإعدادات «الجارية» بالإنجليزية running-config."] },
                  { id: "c2", instruction: "اكتب الأمر الذي يعرض الإعدادات المحفوظة عند التشغيل", expect: { command: "show", args: { what: "startup-config" } }, hints: ["السطر الثاني في صندوق الكتاب.", "كلمة «التشغيل» بالإنجليزية startup."] },
                ],
                allowed: [],
                completion: "✓ صحيح — أوامر show للفحص فقط، ولا تغيّر الإعدادات.",
              }),
            },
            {
              id: "m24-l02-p04-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي أمر يعرض الإعدادات المحفوظة عند التشغيل؟",
                options: [opt("m24-l02-p04-q1-a", "show startup-config", true), opt("m24-l02-p04-q1-b", "show running-config"), opt("m24-l02-p04-q1-c", "service password-encryption")],
                feedback: {
                  hints: ["الصف الثاني في جدول الأوامر.", "الكلمة startup تعني بدء التشغيل."],
                  correctFeedback: "صحيح — show startup-config يعرض الإعدادات المحفوظة عند التشغيل.",
                  incorrectFeedback: "افحص جدول الأوامر: «يعرض الإعدادات المحفوظة عند التشغيل».",
                  explanation: "show running-config يعرض الإعدادات الحالية، و show startup-config المحفوظة عند التشغيل.",
                },
              },
            },
          ],
        },
      ],
    },
    // ── l03 — تدريبات نهاية القسم (PDF 191) ───────────────────────────────────────────────────────────────────
    {
      id: "791381-m24-l03",
      title: "تدريبات نهاية القسم",
      order: 3,
      pages: [
        // PDF 191 — تدريبات على DHCP و Security (closing QR trainings page + module review)
        {
          id: "791381-m24-l03-p01",
          title: "تدريبات على DHCP و Security",
          order: 1,
          source: src(191, 191),
          conversionNote: "صفحة تدريبات QR ختامية في الكتاب (التدريبات 23–26). البطاقات الأربع تُعرض كما في الكتاب كبطاقات ثابتة مع ملاحظة الكتاب؛ وتُفتح التدريبات T23–T26 من داخل المنصة (library-training) عندما يصبح الجزء المرتبط بكل تدريب متاحًا، ومراجعة الوحدة أُضيفت بعدها كإثراء تعليمي.",
          keywords: ["تدريبات", "QR", "T23", "T24", "T25", "T26"],
          blocks: [
            {
              id: "m24-l03-p01-cards", type: "list", origin: "book", variant: "cards", title: "بطاقات التدريب كما في الكتاب (امسح الرمز لحل التدريب)",
              items: [
                { id: "m24-l03-p01-t23", term: "T23", text: [T("التدريب الثالث والعشرون")] },
                { id: "m24-l03-p01-t24", term: "T24", text: [T("التدريب الرابع والعشرون")] },
                { id: "m24-l03-p01-t25", term: "T25", text: [T("التدريب الخامس والعشرون")] },
                { id: "m24-l03-p01-t26", term: "T26", text: [T("التدريب السادس والعشرون")] },
              ],
            },
            {
              id: "m24-l03-p01-note", type: "callout", origin: "book", kind: "tip", title: "ملاحظة",
              spans: [T("يُفضّل حل التدريبات بعد مراجعة "), L("DHCP"), T(" و "), L("Port Security"), T(" وكلمات المرور.")],
            },
            {
              id: "m24-l03-p01-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("يمكن فتح التدريبات 23–26 من داخل المنصة عندما يصبح الجزء المرتبط بكل تدريب متاحًا؛ وهنا نضيف بعدها مراجعة قصيرة تجمع الوحدات الثلاث التي يذكرها الكتاب.")],
            },
            // ── Learning Practice (Reader position 178): the platform's T23–T26, one card per printed training
            // (T25 / T26 are the comprehensive basic-section exams). Metadata only — the host / API decide availability.
            { id: "m24-l03-p01-practice", type: "heading", origin: "teacher-enrichment", level: 3, text: "تدريبات مرتبطة بهذه الصفحة" },
            { id: "m24-l03-p01-lt23", type: "library-training", origin: "book", trainingId: "T23", label: "تدريب 23", requiredModuleId: "791381-m27" },
            { id: "m24-l03-p01-lt24", type: "library-training", origin: "book", trainingId: "T24", label: "تدريب 24", requiredModuleId: "791381-m06" },
            { id: "m24-l03-p01-lt25", type: "library-training", origin: "book", trainingId: "T25", label: "تدريب 25", requiredModuleId: "791381-m24" },
            { id: "m24-l03-p01-lt26", type: "library-training", origin: "book", trainingId: "T26", label: "تدريب 26", requiredModuleId: "791381-m24" },
            { id: "m24-l03-p01-review", type: "heading", origin: "teacher-enrichment", text: "مراجعة الوحدة", level: 3 },
            {
              id: "m24-l03-p01-r1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما الأمر الذي يختار خطوط الدخول عن بُعد في الكتاب؟",
                options: [opt("m24-l03-p01-r1-a", "line vty 0 4", true), opt("m24-l03-p01-r1-b", "line console 0"), opt("m24-l03-p01-r1-c", "enable secret cisco123")],
                feedback: {
                  hints: ["صفحة «كلمة مرور VTY»، السطر الأول.", "VTY = دخول عن بُعد."],
                  correctFeedback: "صحيح — line vty 0 4.",
                  incorrectFeedback: "افحص صندوق صفحة «كلمة مرور VTY».",
                  explanation: "line console 0 للكابل المباشر، و line vty 0 4 للدخول عن بُعد، و enable secret لوضع الأوامر المتقدّم.",
                },
              },
            },
            {
              id: "m24-l03-p01-r2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "اكتب الأمر الذي يخفي كلمات المرور العادية في الإعدادات (الأمر كاملًا).", answer: "service password-encryption",
                feedback: {
                  hints: ["صفحة «تشفير كلمات المرور»، السطر الأول.", "يبدأ بـ service."],
                  correctFeedback: "صحيح — service password-encryption.",
                  incorrectFeedback: "افحص صندوق صفحة «تشفير كلمات المرور».",
                  explanation: "بعده تظهر كلمات مرور الخطوط مخفية عند عرض الإعدادات.",
                },
              },
            },
            {
              id: "m24-l03-p01-r3", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "show running-config يعرض الإعدادات الحالية للجهاز.", answer: true,
                feedback: {
                  hints: ["صفحة «عرض الإعدادات».", "running = الجارية الآن."],
                  correctFeedback: "صحيح — يعرض الإعدادات الحالية.",
                  incorrectFeedback: "افحص جدول صفحة «عرض الإعدادات».",
                  explanation: "أوامر show للفحص والتأكّد من الأوامر، ولا تنسَ الحفظ بعد البرمجة.",
                },
              },
            },
          ],
        },
      ],
    },
  ],
};

export default m24;
