// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 30 «قوائم التحكم بالوصول ACL».
//
// Verbatim conversion of booklet PDF pages 90–93 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every converted block is origin:"book": nothing is added, removed or reworded.
//
// Enrichment (docs/enterprise-791381s-enrichment-plan.md, Phase 6): teacher-enrichment blocks (visuals and CLI terminal
// simulations reused from course 791381 after checking their labels / commands against this section, and the end-of-unit
// «تدريبات الوحدة» lesson) are ADDED after the book blocks they explain. The book blocks stay verbatim — pinned by the book
// lock (bookLock.test.ts).

import type { ContentModule, ContentSource } from "../../types";
import type { CliExerciseConfig } from "../../../cli/types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };
const EX = (exercise: CliExerciseConfig): Record<string, unknown> => ({ ...exercise });

const m30: ContentModule = {
  id: "791381s-m30",
  title: "قوائم التحكم بالوصول ACL",
  order: 30,
  lessons: [
    {
      id: "791381s-m30-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m30-l00-p01",
          title: "قوائم التحكم بالوصول ACL",
          order: 1,
          layout: "opener",
          source: src(90),
          blocks: [
            {
              id: "m30-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الدفعة السادسة · كتاب ص 223–229", unitNumber: "30", title: "قوائم التحكم بالوصول ACL",
              subtitle: "كيف نسمح لأجهزة بالمرور ونمنع غيرها؟ Standard وExtended — مع الأوامر.",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m30-l01",
      title: "قوائم التحكم بالوصول ACL",
      order: 1,
      pages: [
        {
          id: "791381s-m30-l01-p01",
          title: "ما هي ACL؟",
          order: 1,
          source: src(90),
          blocks: [
            {
              id: "m30-l01-p01-def", type: "text", origin: "book",
              spans: [{ text: "ACL (Access Control List) = مجموعة قواعد تسمح أو تمنع مرور البيانات في الشبكة.", style: "strong" }],
            },
            {
              id: "m30-l01-p01-intro", type: "text", origin: "book",
              spans: [
                { text: "تشبه " },
                { text: "حارس البوابة", style: "strong" },
                { text: " الذي معه قائمة بالمسموح لهم. كل حزمة تصل إلى الراوتر تُفحص حسب القائمة: " },
                { text: "permit", style: "strong" },
                { text: " = مسموح، " },
                { text: "deny", style: "strong" },
                { text: " = ممنوع." },
              ],
            },
            {
              id: "m30-l01-p01-drawing", type: "diagram", origin: "book",
              src: "/learning-assets/791381s/5c349d06c955afbb.png",
              alt: "رسم: PC1 يرسل سهمًا مكتوبًا عليه «permit · مسموح» إلى Router داخل إطار متقطع فوقه «قائمة ACL على الواجهة»، ومن الراوتر سهم مع علامة صح إلى «الخادم»؛ وPC2 خطه مكتوب عليه «deny · ممنوع» وينتهي بعلامة منع قبل الراوتر.",
              caption: "PC1 مسموح له بالوصول إلى الخادم، وPC2 ممنوع",
            },
            {
              id: "m30-l01-p01-v-gate", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m06/acl-gate", motion: true,
              source: src(90),
              title: "رسم متحرّك: ACL — بوابة permit / deny على الراوتر",
              alt: "رسم متحرّك: خط «Permit ✓» تعبر عليه حزمة واجهة الراوتر المكتوب عليها ACL وتكمل طريقها، وخط «Deny ✕» تتوقّف حزمته عند الواجهة؛ وتحتهما عبارة: Standard قرب الوجهة (المصدر فقط) · Extended قرب المصدر.",
              caption: "‏الحزمة المسموح لها (permit) تعبر، والممنوعة (deny) تتوقّف عند الواجهة.",
            },
            {
              id: "m30-l01-p01-points", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m30-l01-p01-pt1", text: [{ text: "تزيد " }, { text: "الأمان", style: "strong" }, { text: " في الشبكة." }] },
                { id: "m30-l01-p01-pt2", text: [{ text: "تمنع أجهزة أو شبكات معيّنة." }] },
                { id: "m30-l01-p01-pt3", text: [{ text: "تُستخدم غالبًا مع " }, { text: "الراوترات والجدران النارية", style: "strong" }, { text: "." }] },
              ],
            },
          ],
        },
        {
          id: "791381s-m30-l01-p02",
          title: "نوعا ACL",
          order: 2,
          source: src(90, 91),
          blocks: [
            {
              id: "m30-l01-p02-table", type: "table", origin: "book",
              headers: ["النوع", "الأرقام", "ماذا تفحص؟", "أين نضعها؟"],
              rows: [
                ["Standard", "1–99", "IP المصدر فقط (Source IP)", "قريبًا من الوجهة"],
                ["Extended", "100–199", "المصدر + الوجهة + البروتوكول + المنفذ", "قريبًا من المصدر"],
              ],
              columnDirs: ["rtl", "ltr", "rtl", "rtl"],
            },
            {
              id: "m30-l01-p02-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [
                { text: "Standard", style: "strong" },
                { text: " قريبة من الوجهة (لأنها تفحص المصدر فقط)، و" },
                { text: "Extended", style: "strong" },
                { text: " قريبة من المصدر (لأنها تفحص كل شيء)." },
              ],
            },
            {
              id: "m30-l01-p02-v-standard", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m06/standard-acl-source", motion: true,
              source: src(90, 91),
              title: "رسم متحرّك: Standard ACL — القرار على المصدر فقط",
              alt: "رسم متحرّك: حزمة تخرج من «المصدر 192.168.1.0» إلى بوابة مكتوب عليها «ACL 1–99» وتحتها «يفحص: IP المصدر فقط»، ومن البوابة طريقان: Permit ✓ و Deny ✕.",
              caption: "‏Standard (الأرقام 1–99) تفحص IP المصدر فقط ثم تسمح أو تمنع.",
            },
          ],
        },
        {
          id: "791381s-m30-l01-p03",
          title: "Standard ACL خطوة خطوة",
          order: 3,
          source: src(91),
          blocks: [
            { id: "m30-l01-p03-cli-h", type: "heading", origin: "book", level: 4, text: "Router CLI", dir: "ltr" },
            {
              id: "m30-l01-p03-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: [
                "① Router(config)# access-list 10 permit 192.168.1.0 0.0.0.255",
                "② Router(config)# interface g0/0",
                "③ Router(config-if)# ip access-group 10 out",
              ].join("\n"),
            },
            {
              id: "m30-l01-p03-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                {
                  id: "m30-l01-p03-s1",
                  text: [
                    { text: "قائمة رقم " },
                    { text: "10", style: "strong" },
                    { text: " تسمح للشبكة 192.168.1.0/24 (Wildcard " },
                    { text: "0.0.0.255", style: "strong" },
                    { text: ")." },
                  ],
                },
                { id: "m30-l01-p03-s2", text: [{ text: "نحدّد الواجهة التي نريد تطبيق القائمة عليها." }] },
                {
                  id: "m30-l01-p03-s3",
                  text: [
                    { text: "نربط القائمة بالواجهة: " },
                    { text: "out", style: "strong" },
                    { text: " = للبيانات الخارجة من الواجهة، و" },
                    { text: "in", style: "strong" },
                    { text: " = للبيانات الداخلة إليها." },
                  ],
                },
              ],
            },
            {
              id: "m30-l01-p03-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مثال موجّه: Standard ACL على g0/0",
              description: "أنت في وضع الإعداد العام للراوتر. نفّذ أسطر صندوق الوحدة بالترتيب: القائمة، ثم الواجهة، ثم الربط. محاكاة تعليمية مبسّطة، ليست جهازًا حقيقيًا.",
              source: src(91),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "المثال الموجّه: access-list 10 permit 192.168.1.0 0.0.0.255 ثم interface g0/0 ثم ip access-group 10 out." },
              config: EX({
                kind: "guided",
                device: "router",
                startMode: "global",
                intro: "أنت في وضع الإعداد العام للراوتر. نفّذ أسطر صندوق الوحدة بالترتيب.",
                steps: [
                  { id: "s1", instruction: "اكتب القائمة 10 التي تسمح للشبكة 192.168.1.0/24", expect: { command: "access-list", args: { number: 10, action: "permit", source: "192.168.1.0 0.0.0.255" } }, hints: ["السطر ① في الصندوق.", "access-list 10 permit ثم الشبكة ثم Wildcard 0.0.0.255."] },
                  { id: "s2", instruction: "حدّد الواجهة g0/0", expect: { command: "interface", args: { interfaces: ["g0/0"] } }, success: "✓ أحسنت، أنت الآن داخل الواجهة g0/0", hints: ["السطر ② في الصندوق.", "interface ثم اسم الواجهة."] },
                  { id: "s3", instruction: "اربط القائمة 10 بالواجهة للبيانات الخارجة منها", expect: { command: "ip-access-group", args: { number: 10, direction: "out" } }, hints: ["السطر ③ في الصندوق.", "ip access-group ثم الرقم ثم out."] },
                ],
                completion: "✓ أحسنت، القائمة مكتوبة ومربوطة بالواجهة — بدون ip access-group لا تعمل إطلاقًا.",
              }),
            },
            {
              id: "m30-l01-p03-mistake", type: "callout", origin: "book", kind: "summary", title: "خطأ شائع",
              spans: [
                { text: "كتابة القائمة وحدها لا تكفي! بدون " },
                { text: "ip access-group", style: "strong" },
                { text: " على الواجهة القائمة " },
                { text: "لا تعمل إطلاقًا", style: "strong" },
                { text: "." },
              ],
            },
          ],
        },
        {
          id: "791381s-m30-l01-p04",
          title: "أمثلة Standard ACL",
          order: 4,
          source: src(91, 92),
          blocks: [
            {
              id: "m30-l01-p04-table", type: "table", origin: "book",
              headers: ["الأمر", "معناه"],
              rows: [
                ["access-list 10 permit 192.168.1.0 0.0.0.255", "السماح لشبكة كاملة."],
                ["access-list 20 deny 192.168.2.0 0.0.0.255", "منع شبكة كاملة."],
                ["access-list 20 permit any", "السماح لكل الباقي."],
                ["access-list 30 permit host 192.168.1.10", "السماح لجهاز واحد فقط (host)."],
                ["ip access-group 40 in", "تطبيق القائمة 40 على الواجهة للبيانات الداخلة."],
              ],
              columnDirs: ["ltr", "rtl"],
            },
            {
              id: "m30-l01-p04-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "تحدّي الأمر: أربع قواعد Standard",
              description: "أنت في وضع الإعداد العام. اكتب القاعدة المطلوبة في كل سؤال بالترتيب؛ المحاكي لا يكشف الإجابة. محاكاة تعليمية مبسّطة، ليست جهازًا حقيقيًا.",
              source: src(91, 92),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "التحدّي: access-list 10 permit 192.168.1.0 0.0.0.255، ثم access-list 20 deny 192.168.2.0 0.0.0.255، ثم access-list 20 permit any، ثم access-list 30 permit host 192.168.1.10." },
              config: EX({
                kind: "challenge",
                device: "router",
                startMode: "global",
                intro: "أنت في وضع الإعداد العام.",
                steps: [
                  { id: "c1", instruction: "في القائمة 10: اسمح للشبكة 192.168.1.0/24 كاملة", expect: { command: "access-list", args: { number: 10, action: "permit", source: "192.168.1.0 0.0.0.255" } }, hints: ["الصف الأول في الجدول.", "permit ثم الشبكة ثم Wildcard 0.0.0.255."] },
                  { id: "c2", instruction: "في القائمة 20: امنع الشبكة 192.168.2.0/24 كاملة", expect: { command: "access-list", args: { number: 20, action: "deny", source: "192.168.2.0 0.0.0.255" } }, hints: ["الصف الثاني في الجدول.", "deny بدل permit والرقم 20."] },
                  { id: "c3", instruction: "في القائمة 20: اسمح لكل الباقي", expect: { command: "access-list", args: { number: 20, action: "permit", source: "any" } }, hints: ["الصف الثالث في الجدول.", "الكلمة any."] },
                  { id: "c4", instruction: "في القائمة 30: اسمح للجهاز 192.168.1.10 وحده", expect: { command: "access-list", args: { number: 30, action: "permit", source: "host 192.168.1.10" } }, hints: ["الصف الرابع في الجدول.", "الكلمة host قبل عنوان الجهاز."] },
                ],
                allowed: ["access-list"],
                completion: "✓ صحيح في كل القواعد — ولاحظ: بعد deny كتبنا permit any حتى لا نمنع الجميع.",
              }),
            },
            {
              id: "m30-l01-p04-implicit", type: "callout", origin: "book", kind: "summary", title: "في الامتحان · الرفض الضمني",
              spans: [
                { text: "كل ACL تنتهي ضمنيًا بـ " },
                { text: "deny any", style: "strong" },
                { text: " غير مكتوب. أي عنوان لا تسمح له صراحةً " },
                { text: "يُمنع تلقائيًا", style: "strong" },
                { text: ". لذلك بعد deny نكتب " },
                { text: "permit any", style: "strong" },
                { text: " حتى لا نمنع الجميع." },
              ],
            },
          ],
        },
        {
          id: "791381s-m30-l01-p05",
          title: "Extended ACL",
          order: 5,
          source: src(92, 93),
          blocks: [
            {
              id: "m30-l01-p05-points", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m30-l01-p05-pt1", text: [{ text: "تحدّد البروتوكول: " }, { text: "TCP / UDP / ICMP", style: "strong" }, { text: "." }] },
                { id: "m30-l01-p05-pt2", text: [{ text: "تحدّد IP " }, { text: "المصدر والوجهة", style: "strong" }, { text: "." }] },
                { id: "m30-l01-p05-pt3", text: [{ text: "تحدّد المنفذ " }, { text: "Port", style: "strong" }, { text: " مثل 80 أو 443." }] },
                { id: "m30-l01-p05-pt4", text: [{ text: "أرقامها غالبًا من " }, { text: "100 إلى 199", style: "strong" }, { text: "." }] },
              ],
            },
            {
              id: "m30-l01-p05-v-extended", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m06/extended-acl-decision", motion: true,
              source: src(92),
              title: "رسم متحرّك: Extended ACL — أربعة معايير معًا",
              alt: "رسم متحرّك: أربعة صناديق تظهر تباعًا — المصدر Source IP، الوجهة Destination IP، البروتوكول TCP · UDP · ICMP، المنفذ Port 80 · 443 — تتجه كلها إلى بوابة ACL ومنها طريقان Permit ✓ و Deny ✕؛ وفي الأعلى «100–199».",
              caption: "‏Extended (الأرقام 100–199) تفحص المصدر والوجهة والبروتوكول والمنفذ معًا.",
            },
            { id: "m30-l01-p05-cli-h", type: "heading", origin: "book", level: 4, text: "Router CLI", dir: "ltr" },
            {
              id: "m30-l01-p05-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: "① Router(config)# access-list 100 permit tcp any any eq 80",
            },
            {
              id: "m30-l01-p05-parts", type: "table", origin: "book",
              headers: ["الجزء", "permit", "tcp", "any (الأولى)", "any (الثانية)", "eq 80"],
              rows: [["معناه", "سماح", "البروتوكول", "أي مصدر", "أي وجهة", "المنفذ HTTP = 80"]],
            },
            { id: "m30-l01-p05-example-h", type: "heading", origin: "book", level: 4, text: "مثال" },
            {
              id: "m30-l01-p05-example-cmd", type: "text", origin: "book",
              spans: [{ text: "access-list 100 permit tcp 192.168.1.0 0.0.0.255 any eq 80", style: "code" }],
            },
            {
              id: "m30-l01-p05-example-text", type: "text", origin: "book",
              spans: [
                { text: "يسمح لأجهزة الشبكة 192.168.1.0/24 بتصفّح المواقع (HTTP) إلى أي وجهة. ثم نطبّقها قرب المصدر: " },
                { text: "ip access-group 100 in", style: "code" },
              ],
            },
            {
              id: "m30-l01-p05-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مهمّة: مثال Extended ACL للتصفّح HTTP",
              description: "أنت في وضع الإعداد العام للراوتر. المطلوب حالة نهائية: القائمة 100 تسمح لشبكة 192.168.1.0/24 بالتصفّح (HTTP) إلى أي وجهة كما في المثال، ومطبّقة بالأمر ip access-group 100 in. الوحدة لا تسمّي الواجهة؛ في هذا التمرين نستعمل g0/0. الترتيب لك. محاكاة تعليمية مبسّطة، ليست جهازًا حقيقيًا.",
              source: src(92, 93),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "المهمّة: access-list 100 permit tcp 192.168.1.0 0.0.0.255 any eq 80 ثم interface g0/0 ثم ip access-group 100 in." },
              config: EX({
                kind: "task",
                device: "router",
                startMode: "global",
                intro: "أنت في وضع الإعداد العام. اكتب قائمة المثال، ثم طبّقها للبيانات الداخلة على الواجهة g0/0.",
                goals: [
                  { id: "g-ext", label: "القائمة 100 تسمح بـ tcp من 192.168.1.0 0.0.0.255 إلى any على المنفذ 80", condition: { kind: "acl", number: 100, prop: "entry", value: "permit tcp 192.168.1.0 0.0.0.255 any eq 80" } },
                  { id: "g-apply", label: "القائمة 100 مطبّقة على g0/0 للبيانات الداخلة (in)", condition: { kind: "interface", name: "g0/0", prop: "accessGroup", value: "100 in" } },
                ],
                hints: ["القائمة تُكتب في الإعداد العام، والتطبيق ip access-group داخل الواجهة.", "access-list 100 permit tcp 192.168.1.0 0.0.0.255 any eq 80، ثم interface g0/0 و ip access-group 100 in."],
                completion: "✓ أحسنت، القائمة الموسّعة مكتوبة ومطبّقة للبيانات الداخلة.",
              }),
            },
            {
              id: "m30-l01-p05-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [
                { text: "Extended " },
                { text: "أكثر تفصيلًا", style: "strong" },
                { text: " من Standard لأنها تفحص المصدر والوجهة والبروتوكول والمنفذ معًا." },
              ],
            },
            {
              id: "m30-l01-p05-exam", type: "text", origin: "book",
              spans: [{ text: "في ACL: الكلمة permit تسمح، والكلمة deny تمنع، وفي النهاية deny any مخفي", style: "strong" }],
            },
          ],
        },
      ],
    },
    {
      // «تدريبات الوحدة» — ADDED enrichment: an end-of-unit exercise page after the booklet's own pages. Every question is
      // answered by the section's printed text above (the explanation quotes it). The book pages are unchanged (book lock).
      id: "791381s-m30-l02",
      title: "تدريبات الوحدة",
      order: 2,
      pages: [
        {
          id: "791381s-m30-l02-p01",
          title: "تدريبات الوحدة: قوائم التحكم بالوصول ACL",
          order: 1,
          layout: "practice",
          source: src(90, 93),
          blocks: [
            {
              id: "m30-l02-p01-q01", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ماذا تعني الكلمة deny في قائمة ACL؟",
                options: [{ id: "a", text: "مسموح" }, { id: "b", text: "ممنوع", correct: true }, { id: "c", text: "أي مصدر" }, { id: "d", text: "رقم القائمة" }],
                feedback: { explanation: "كل حزمة تصل إلى الراوتر تُفحص حسب القائمة: permit = مسموح، deny = ممنوع." },
              },
            },
            {
              id: "m30-l02-p01-q02", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "wordBank", prompt: "أكمل الفراغات من مخزن الكلمات:",
                segments: ["ACL مجموعة ", { blank: "b1" }, " تسمح أو تمنع مرور البيانات في الشبكة. تشبه ", { blank: "b2" }, " الذي معه قائمة بالمسموح لهم. وتُستخدم غالبًا مع الراوترات و", { blank: "b3" }, "."],
                bank: ["حارس البوابة", "قواعد", "الجدران النارية", "الطابعات", "عناوين MAC"],
                answers: { b1: "قواعد", b2: "حارس البوابة", b3: "الجدران النارية" },
                feedback: { explanation: "ACL مجموعة قواعد تسمح أو تمنع مرور البيانات في الشبكة، تشبه حارس البوابة الذي معه قائمة بالمسموح لهم، وتُستخدم غالبًا مع الراوترات والجدران النارية." },
              },
            },
            {
              id: "m30-l02-p01-q03", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "classify", prompt: "صنّف كل خاصية حسب جدول «نوعا ACL»: Standard أم Extended؟",
                groups: [{ id: "std", text: "Standard" }, { id: "ext", text: "Extended" }],
                items: [
                  { id: "i1", text: "الأرقام 100–199" },
                  { id: "i2", text: "تفحص IP المصدر فقط" },
                  { id: "i3", text: "نضعها قريبًا من المصدر" },
                  { id: "i4", text: "الأرقام 1–99" },
                  { id: "i5", text: "تفحص المصدر + الوجهة + البروتوكول + المنفذ" },
                  { id: "i6", text: "نضعها قريبًا من الوجهة" },
                ],
                assign: { i1: "ext", i2: "std", i3: "ext", i4: "std", i5: "ext", i6: "std" },
                feedback: { explanation: "Standard: الأرقام 1–99، تفحص IP المصدر فقط، ونضعها قريبًا من الوجهة. Extended: الأرقام 100–199، تفحص المصدر + الوجهة + البروتوكول + المنفذ، ونضعها قريبًا من المصدر." },
              },
            },
            {
              id: "m30-l02-p01-q04", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "القائمة رقم 10 من أي نوع؟",
                options: [{ id: "a", text: "Extended لأن أرقامها 1–99" }, { id: "b", text: "Extended لأن أرقامها 100–199" }, { id: "c", text: "Standard لأن أرقامها 1–99", correct: true }],
                feedback: { explanation: "أرقام Standard من 1 إلى 99، وأرقام Extended من 100 إلى 199؛ لذلك القائمة 10 من نوع Standard." },
              },
            },
            {
              id: "m30-l02-p01-q05", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "قائمة ACL مكتوبة ولم تُربط بالواجهة بالأمر ip access-group تعمل بشكل طبيعي.", answer: false, feedback: { explanation: "خطأ شائع: كتابة القائمة وحدها لا تكفي! بدون ip access-group على الواجهة القائمة لا تعمل إطلاقًا." } },
            },
            {
              id: "m30-l02-p01-q06", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "ordering", prompt: "رتّب أوامر Standard ACL كما في صندوق الوحدة:",
                items: [
                  { id: "apply", text: "ip access-group 10 out" },
                  { id: "list", text: "access-list 10 permit 192.168.1.0 0.0.0.255" },
                  { id: "if", text: "interface g0/0" },
                ],
                order: ["list", "if", "apply"],
                feedback: { explanation: "① القائمة رقم 10 تسمح للشبكة 192.168.1.0/24، ② نحدّد الواجهة التي نريد تطبيق القائمة عليها، ③ نربط القائمة بالواجهة بالأمر ip access-group 10 out." },
              },
            },
            {
              id: "m30-l02-p01-q07", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "matching", prompt: "صِل كل أمر من جدول «أمثلة Standard ACL» بمعناه:",
                left: [
                  { id: "net", text: "access-list 10 permit 192.168.1.0 0.0.0.255" },
                  { id: "deny", text: "access-list 20 deny 192.168.2.0 0.0.0.255" },
                  { id: "any", text: "access-list 20 permit any" },
                  { id: "host", text: "access-list 30 permit host 192.168.1.10" },
                  { id: "in", text: "ip access-group 40 in" },
                ],
                right: [
                  { id: "r1", text: "السماح لجهاز واحد فقط (host)" },
                  { id: "r2", text: "منع شبكة كاملة" },
                  { id: "r3", text: "تطبيق القائمة 40 على الواجهة للبيانات الداخلة" },
                  { id: "r4", text: "السماح لشبكة كاملة" },
                  { id: "r5", text: "السماح لكل الباقي" },
                ],
                pairs: { net: "r4", deny: "r2", any: "r5", host: "r1", in: "r3" },
                feedback: { explanation: "من الجدول: 10 permit 192.168.1.0 = السماح لشبكة كاملة، 20 deny 192.168.2.0 = منع شبكة كاملة، 20 permit any = السماح لكل الباقي، 30 permit host 192.168.1.10 = السماح لجهاز واحد فقط، ip access-group 40 in = تطبيق القائمة 40 للبيانات الداخلة." },
              },
            },
            {
              id: "m30-l02-p01-q08", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "قائمة فيها سطر واحد فقط: access-list 20 deny 192.168.2.0 0.0.0.255. ماذا يحدث لجهاز من شبكة أخرى لم تُذكر في القائمة؟",
                options: [{ id: "a", text: "يُسمح له تلقائيًا" }, { id: "b", text: "تتوقّف القائمة عن العمل" }, { id: "c", text: "يُسمح له فقط إذا كانت القائمة out" }, { id: "d", text: "يُمنع تلقائيًا بسبب deny any الضمني", correct: true }],
                feedback: { explanation: "كل ACL تنتهي ضمنيًا بـ deny any غير مكتوب؛ أي عنوان لا تسمح له صراحةً يُمنع تلقائيًا. لذلك بعد deny نكتب permit any حتى لا نمنع الجميع." },
              },
            },
            {
              id: "m30-l02-p01-q09", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "كل ACL تنتهي ضمنيًا بسطر deny any غير مكتوب.", answer: true, feedback: { explanation: "في الامتحان · الرفض الضمني: كل ACL تنتهي ضمنيًا بـ deny any غير مكتوب." } },
            },
            {
              id: "m30-l02-p01-q10", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "في الأمر ip access-group 10 out، ماذا تعني الكلمة out؟",
                options: [{ id: "a", text: "تطبيق القائمة على البيانات الخارجة من الواجهة", correct: true }, { id: "b", text: "تطبيق القائمة على البيانات الداخلة إلى الواجهة" }, { id: "c", text: "حذف القائمة من الواجهة" }],
                feedback: { explanation: "نربط القائمة بالواجهة: out = للبيانات الخارجة من الواجهة، و in = للبيانات الداخلة إليها." },
              },
            },
            {
              id: "m30-l02-p01-q11", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "في الأمر access-list 100 permit tcp any any eq 80، ماذا تعني any الثانية؟",
                options: [{ id: "a", text: "أي مصدر" }, { id: "b", text: "أي وجهة", correct: true }, { id: "c", text: "أي بروتوكول" }, { id: "d", text: "أي منفذ" }],
                feedback: { explanation: "أجزاء الأمر: permit = سماح، tcp = البروتوكول، any الأولى = أي مصدر، any الثانية = أي وجهة، eq 80 = المنفذ HTTP = 80." },
              },
            },
            {
              id: "m30-l02-p01-q12", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "نضع Extended ACL قريبًا من الوجهة.", answer: false, feedback: { explanation: "Standard قريبة من الوجهة (لأنها تفحص المصدر فقط)، و Extended قريبة من المصدر (لأنها تفحص كل شيء)." } },
            },
            { id: "m30-l02-p01-lib-t24", type: "library-training", origin: "teacher-enrichment", trainingId: "T24", label: "تدريب 24", requiredModuleId: "791381s-m30" },
            { id: "m30-l02-p01-lib-t27", type: "library-training", origin: "teacher-enrichment", trainingId: "T27", label: "تدريب 27", requiredModuleId: "791381s-m30" },
            { id: "m30-l02-p01-lib-t28", type: "library-training", origin: "teacher-enrichment", trainingId: "T28", label: "تدريب 28", requiredModuleId: "791381s-m30" },
            { id: "m30-l02-p01-lib-t29", type: "library-training", origin: "teacher-enrichment", trainingId: "T29", label: "تدريب 29", requiredModuleId: "791381s-m30" },
            { id: "m30-l02-p01-lib-t30", type: "library-training", origin: "teacher-enrichment", trainingId: "T30", label: "تدريب 30", requiredModuleId: "791381s-m30" },
          ],
        },
      ],
    },
  ],
};

export default m30;
