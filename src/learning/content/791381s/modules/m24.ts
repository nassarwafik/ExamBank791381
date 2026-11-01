// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 24 «حماية أجهزة Cisco بكلمات المرور».
//
// Verbatim conversion of booklet PDF pages 73–76 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every converted block is origin:"book": nothing is added, removed or reworded.
//
// Enrichment (docs/enterprise-791381s-enrichment-plan.md, Phase 6; the network lab: Phase 8B-3): teacher-enrichment blocks (visuals and CLI terminal
// simulations reused from course 791381 after checking their labels / commands against this section — each simulation types
// exactly the page's own command box — and the end-of-unit «تدريبات الوحدة» lesson) are ADDED after the book blocks they
// explain. The book blocks stay verbatim — pinned by the book lock (bookLock.test.ts).

import type { ContentModule, ContentSource } from "../../types";
import type { CliExerciseConfig } from "../../../cli/types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };
const EX = (exercise: CliExerciseConfig): Record<string, unknown> => ({ ...exercise });

const m24: ContentModule = {
  id: "791381s-m24",
  title: "حماية أجهزة Cisco بكلمات المرور",
  order: 24,
  lessons: [
    {
      id: "791381s-m24-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m24-l00-p01",
          title: "حماية أجهزة Cisco بكلمات المرور",
          order: 1,
          layout: "opener",
          source: src(73),
          blocks: [
            {
              id: "m24-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الدفعة الخامسة · كتاب ص 185–190", unitNumber: "24", title: "حماية أجهزة Cisco بكلمات المرور",
              subtitle: "كيف نمنع أي شخص من الدخول إلى السويتش أو الراوتر وتغيير إعداداته؟",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m24-l01",
      title: "حماية أجهزة Cisco بكلمات المرور",
      order: 1,
      pages: [
        {
          id: "791381s-m24-l01-p01",
          title: "لماذا نحمي السويتشات والراوترات؟",
          order: 1,
          source: src(73),
          blocks: [
            {
              id: "m24-l01-p01-intro", type: "text", origin: "book",
              spans: [{ text: "إذا استطاع أي شخص الدخول إلى الراوتر، يستطيع تغيير الإعدادات وتعطيل الشبكة كلها. لذلك نضع كلمات مرور حتى يدخل التقني المسؤول فقط." }],
            },
            {
              id: "m24-l01-p01-points", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m24-l01-p01-pt1", text: [{ text: "الهدف: السماح للتقني فقط بتعديل الإعدادات." }] },
                { id: "m24-l01-p01-pt2", text: [{ text: "كلمات المرور تمنع الدخول غير المصرّح به." }] },
              ],
            },
            {
              id: "m24-l01-p01-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [
                { text: "حماية الجهاز نفسه " },
                { text: "لا تقل أهمية", style: "strong" },
                { text: " عن حماية الشبكة." },
              ],
            },
            {
              id: "m24-l01-p01-v-layers", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m24/device-security-layers", motion: false,
              source: src(73),
              title: "مخطط: نحمي الجهاز نفسه بكلمات المرور",
              alt: "مخطط: جهاز Cisco في الأسفل تتصل به ثلاثة مربعات Console و VTY و Enable، على كل منها قفل وعبارة «كلمة مرور»؛ وتحتها عبارة «الهدف: يعدّل الإعدادات التقنيّ فقط — تُمنع كل محاولة دخول غير مصرّح بها».",
              caption: "كلمات المرور تمنع الدخول غير المصرّح به، حتى يدخل التقني المسؤول فقط.",
            },
          ],
        },
        {
          id: "791381s-m24-l01-p02",
          title: "طرق الدخول إلى أجهزة Cisco",
          order: 2,
          source: src(73),
          blocks: [
            {
              id: "m24-l01-p02-table", type: "table", origin: "book",
              headers: ["الطريقة", "معناها", "الأمر"],
              rows: [
                ["Console", "دخول مباشر بكابل Console. نستخدمه عند البرمجة الأولى، ونحن قريبون من الجهاز.", "line console 0"],
                ["VTY", "دخول عن بُعد عبر الشبكة باستخدام Telnet أو SSH.", "line vty 0 4"],
                ["Enable", "الدخول إلى وضع الأوامر المتقدّم (#).", "enable secret"],
              ],
              columnDirs: ["rtl", "rtl", "ltr"],
            },
            {
              id: "m24-l01-p02-memo", type: "text", origin: "book",
              spans: [{ text: "Console = قريب من الجهاز (بكابل) · VTY = دخول عن بُعد", style: "strong" }],
            },
            {
              id: "m24-l01-p02-v-paths", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m24/device-access-paths", motion: false,
              source: src(73),
              title: "مخطط: طرق الدخول إلى جهاز Cisco",
              alt: "مخطط: جهاز Cisco في الوسط؛ إلى اليسار خط متصل إلى «Console (كابل مباشر)» وتحته line console 0، وإلى اليمين خط متقطّع إلى «VTY (Telnet / SSH)» وتحته line vty 0 4، وفي الأسفل «Enable (وضع متقدّم)» وتحته enable secret.",
              caption: "Console = قريب من الجهاز (بكابل) · VTY = دخول عن بُعد · Enable = الوضع المتقدّم (#).",
            },
          ],
        },
        {
          id: "791381s-m24-l01-p03",
          title: "كلمة مرور Console",
          order: 3,
          source: src(74),
          blocks: [
            { id: "m24-l01-p03-cli-h", type: "heading", origin: "book", level: 4, text: "Switch / Router CLI", dir: "ltr" },
            {
              id: "m24-l01-p03-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: [
                "① Switch(config)# line console 0",
                "② Switch(config-line)# password cisco123",
                "③ Switch(config-line)# login",
              ].join("\n"),
            },
            {
              id: "m24-l01-p03-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m24-l01-p03-s1", text: [{ text: "ندخل إلى إعدادات منفذ الدخول المباشر للجهاز." }] },
                { id: "m24-l01-p03-s2", text: [{ text: "نحدّد كلمة المرور." }] },
                {
                  id: "m24-l01-p03-s3",
                  text: [{ text: "login", style: "strong" }, { text: ": يجعل الجهاز يطلب كلمة المرور عند الدخول (بدونه لا يسأل عنها)." }],
                },
              ],
            },
            {
              id: "m24-l01-p03-sim-console", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مثال موجّه: كلمة مرور Console",
              description: "أنت في وضع الإعداد العام. نفّذ الأسطر الثلاثة في صندوق الكتاب بالترتيب، ولاحظ تغيّر الموجّه إلى (config-line)#. محاكاة تعليمية مبسّطة، ليست جهازًا حقيقيًا.",
              source: src(74),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "line console 0 ثم password cisco123 ثم login." },
              config: EX({
                kind: "guided",
                device: "switch",
                startMode: "global",
                intro: "أنت في وضع الإعداد العام. نفّذ أسطر صندوق الكتاب بالترتيب.",
                steps: [
                  { id: "s1", instruction: "ادخل إلى إعدادات منفذ الدخول المباشر للجهاز", expect: { command: "line", args: { line: "console" } }, success: "✓ أحسنت، أنت الآن في (config-line)#", hints: ["السطر ① في صندوق الكتاب؛ يبدأ بـ line.", "اسم الخط console ورقمه 0."] },
                  { id: "s2", instruction: "حدّد كلمة المرور cisco123", expect: { command: "password", args: { password: "cisco123" } }, hints: ["السطر ② في صندوق الكتاب.", "الأمر يبدأ بـ password ويليه كلمة المرور."] },
                  { id: "s3", instruction: "اجعل الجهاز يطلب كلمة المرور عند الدخول", expect: { command: "login" }, hints: ["السطر ③ في صندوق الكتاب: بدونه لا يسأل الجهاز عن كلمة المرور.", "كلمة واحدة تعني «تسجيل الدخول»."] },
                ],
                completion: "✓ أحسنت — الدخول المباشر بكابل Console يطلب الآن كلمة المرور.",
              }),
            },
            {
              id: "m24-l01-p03-note", type: "text", origin: "book",
              spans: [{ text: "مهم عند وجود الجهاز في مكان مشترك، ونستعمله كثيرًا في Packet Tracer." }],
            },
          ],
        },
        {
          id: "791381s-m24-l01-p04",
          title: "كلمة مرور VTY (الدخول عن بُعد)",
          order: 4,
          source: src(74),
          blocks: [
            { id: "m24-l01-p04-cli-h", type: "heading", origin: "book", level: 4, text: "Switch / Router CLI", dir: "ltr" },
            {
              id: "m24-l01-p04-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: [
                "① Switch(config)# line vty 0 4",
                "② Switch(config-line)# password cisco123",
                "③ Switch(config-line)# login",
              ].join("\n"),
            },
            {
              id: "m24-l01-p04-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                {
                  id: "m24-l01-p04-s1",
                  text: [{ text: "vty 0 4", style: "strong" }, { text: ": خطوط الدخول عن بُعد — 5 خطوط (من 0 إلى 4)، أي 5 أشخاص معًا." }],
                },
                { id: "m24-l01-p04-s2", text: [{ text: "كلمة مرور تمنع الدخول العشوائي." }] },
                { id: "m24-l01-p04-s3", text: [{ text: "يجعل الجهاز يطلب كلمة المرور." }] },
              ],
            },
            {
              id: "m24-l01-p04-sim-vty", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "تحدّي الأمر: كلمة مرور للدخول عن بُعد",
              description: "أنت في وضع الإعداد العام. اكتب الأمر المطلوب في كل سؤال؛ المحاكي لا يكشف الإجابة. محاكاة تعليمية مبسّطة.",
              source: src(74),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "التحدّي: line vty 0 4 ثم password cisco123 ثم login." },
              config: EX({
                kind: "challenge",
                device: "switch",
                startMode: "global",
                intro: "أنت في وضع الإعداد العام.",
                steps: [
                  { id: "c1", instruction: "اختر خطوط الدخول عن بُعد الخمسة (من 0 إلى 4)", expect: { command: "line", args: { line: "vty" } }, hints: ["السطر ① في صندوق الكتاب؛ يبدأ بـ line.", "vty ثم رقم أول خط ورقم آخر خط."] },
                  { id: "c2", instruction: "ضع كلمة المرور cisco123", expect: { command: "password", args: { password: "cisco123" } }, hints: ["يُكتب داخل الخط، تحت (config-line)#.", "يبدأ بـ password."] },
                  { id: "c3", instruction: "اجعل الجهاز يطلب كلمة المرور", expect: { command: "login" }, hints: ["كلمة واحدة، في السطر ③ من صندوق الكتاب.", "نفس الكلمة في صندوق Console."] },
                ],
                allowed: ["password", "login"],
                completion: "✓ صحيح في كل الأوامر — خطوط VTY الخمسة تطلب الآن كلمة المرور.",
              }),
            },
            {
              id: "m24-l01-p04-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [
                { text: "يُفضّل " },
                { text: "SSH", style: "strong" },
                { text: " بدل Telnet، لأنه أكثر أمانًا ويشفّر البيانات." },
              ],
            },
          ],
        },
        {
          id: "791381s-m24-l01-p05",
          title: "تشفير كلمات المرور",
          order: 5,
          source: src(75),
          blocks: [
            { id: "m24-l01-p05-cli-h", type: "heading", origin: "book", level: 4, text: "Switch / Router CLI", dir: "ltr" },
            {
              id: "m24-l01-p05-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: [
                "① Switch(config)# enable secret cisco123",
                "② Switch(config)# service password-encryption",
              ].join("\n"),
            },
            {
              id: "m24-l01-p05-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                {
                  id: "m24-l01-p05-s1",
                  text: [
                    { text: "enable secret", style: "strong" },
                    { text: ": كلمة مرور لوضع الأوامر المتقدّم، محفوظة " },
                    { text: "بشكل مشفّر", style: "strong" },
                    { text: ". أقوى من enable password." },
                  ],
                },
                {
                  id: "m24-l01-p05-s2",
                  text: [
                    { text: "service password-encryption", style: "strong" },
                    { text: ": يخفي كلمات المرور العادية (مثل كلمة Console و VTY) في ملف الإعدادات." },
                  ],
                },
              ],
            },
            {
              id: "m24-l01-p05-sim-encrypt", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "تحدّي الأمر: enable secret والتشفير",
              description: "أنت في وضع الإعداد العام. اكتب الأمر المطلوب في كل سؤال؛ المحاكي لا يكشف الإجابة. محاكاة تعليمية مبسّطة.",
              source: src(75),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "التحدّي: enable secret cisco123 ثم service password-encryption." },
              config: EX({
                kind: "challenge",
                device: "switch",
                startMode: "global",
                intro: "أنت في وضع الإعداد العام.",
                steps: [
                  { id: "c1", instruction: "ضع كلمة المرور cisco123 لوضع الأوامر المتقدّم، محفوظة بشكل مشفّر", expect: { command: "enable-secret", args: { secret: "cisco123" } }, hints: ["السطر ① في صندوق الكتاب.", "أقوى من enable password."] },
                  { id: "c2", instruction: "أخفِ كلمات المرور العادية (مثل كلمة Console و VTY) في ملف الإعدادات", expect: { command: "service-password-encryption" }, hints: ["السطر ② في صندوق الكتاب.", "يبدأ بـ service، والكلمة encryption تعني التشفير."] },
                ],
                allowed: ["enable-secret", "service-password-encryption"],
                completion: "✓ صحيح — الوضع المتقدّم محمي بـ enable secret، وكلمات المرور العادية مخفية في ملف الإعدادات.",
              }),
            },
            {
              id: "m24-l01-p05-why", type: "callout", origin: "book", kind: "summary", title: "لماذا نشفّر؟",
              spans: [{ text: "بدون تشفير، من يعرض الإعدادات يرى password cisco123 مكتوبة بوضوح. بعد التشفير يرى رموزًا غير مفهومة بدلها." }],
            },
          ],
        },
        {
          id: "791381s-m24-l01-p06",
          title: "عرض الإعدادات وحفظها",
          order: 6,
          source: src(75, 76),
          blocks: [
            {
              id: "m24-l01-p06-intro", type: "text", origin: "book",
              spans: [{ text: "أوامر show نستعملها للفحص والتأكّد من الأوامر. تُكتب في الوضع المتقدّم (#)." }],
            },
            { id: "m24-l01-p06-cli-h", type: "heading", origin: "book", level: 4, text: "Switch / Router CLI", dir: "ltr" },
            {
              id: "m24-l01-p06-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: [
                "① Switch# show running-config",
                "② Switch# show startup-config",
                "③ Switch# copy running-config startup-config",
              ].join("\n"),
            },
            {
              id: "m24-l01-p06-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                {
                  id: "m24-l01-p06-s1",
                  text: [
                    { text: "running-config", style: "strong" },
                    { text: ": يعرض الإعدادات " },
                    { text: "الحالية", style: "strong" },
                    { text: " التي تعمل الآن." },
                  ],
                },
                {
                  id: "m24-l01-p06-s2",
                  text: [
                    { text: "startup-config", style: "strong" },
                    { text: ": يعرض الإعدادات " },
                    { text: "المحفوظة", style: "strong" },
                    { text: " التي تُحمّل عند تشغيل الجهاز." },
                  ],
                },
                {
                  id: "m24-l01-p06-s3",
                  text: [{ text: "copy", style: "strong" }, { text: ": يحفظ الإعدادات الحالية — حتى لا تضيع عند إطفاء الجهاز." }],
                },
              ],
            },
            {
              id: "m24-l01-p06-save", type: "callout", origin: "book", kind: "summary", title: "لا تنسَ الحفظ",
              spans: [{ text: "الإعدادات الحالية (running) تضيع إذا أُطفئ الجهاز. بعد البرمجة احفظها دائمًا بالأمر copy running-config startup-config." }],
            },
          ],
        },
      ],
    },
    {
      // «تدريبات الوحدة» — ADDED enrichment: an end-of-unit exercise page after the booklet's own pages. Every question is
      // answered by the section's printed text above (the explanation quotes it). The book pages are unchanged (book lock).
      id: "791381s-m24-l02",
      title: "تدريبات الوحدة",
      order: 2,
      pages: [
        {
          id: "791381s-m24-l02-p01",
          title: "تدريبات الوحدة: حماية أجهزة Cisco بكلمات المرور",
          order: 1,
          layout: "practice",
          source: src(73, 76),
          blocks: [
            {
              id: "m24-l02-p01-q01", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ما الهدف من وضع كلمات مرور على السويتشات والراوترات؟",
                options: [{ id: "a", text: "تسريع الشبكة" }, { id: "b", text: "السماح للتقني فقط بتعديل الإعدادات", correct: true }, { id: "c", text: "توزيع عناوين IP على الأجهزة" }, { id: "d", text: "إنشاء VLAN جديدة" }],
                feedback: { explanation: "إذا استطاع أي شخص الدخول إلى الراوتر، يستطيع تغيير الإعدادات وتعطيل الشبكة كلها. لذلك نضع كلمات مرور حتى يدخل التقني المسؤول فقط. الهدف: السماح للتقني فقط بتعديل الإعدادات." },
              },
            },
            {
              id: "m24-l02-p01-q02", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "حماية الجهاز نفسه أقل أهمية من حماية الشبكة.", answer: false, feedback: { explanation: "تذكّر: حماية الجهاز نفسه لا تقل أهمية عن حماية الشبكة." } },
            },
            {
              id: "m24-l02-p01-q03", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "matching", prompt: "صِل كل طريقة دخول بأمرها:",
                left: [
                  { id: "console", text: "Console" },
                  { id: "vty", text: "VTY" },
                  { id: "enable", text: "Enable" },
                ],
                right: [
                  { id: "r1", text: "enable secret" },
                  { id: "r2", text: "line vty 0 4" },
                  { id: "r3", text: "line console 0" },
                ],
                pairs: { console: "r3", vty: "r2", enable: "r1" },
                feedback: { explanation: "Console: دخول مباشر بكابل Console (line console 0). VTY: دخول عن بُعد عبر الشبكة باستخدام Telnet أو SSH (line vty 0 4). Enable: الدخول إلى وضع الأوامر المتقدّم (#) (enable secret)." },
              },
            },
            {
              id: "m24-l02-p01-q04", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "classify", prompt: "صنّف كل عبارة: دخول قريب من الجهاز (بكابل) أم دخول عن بُعد؟",
                groups: [{ id: "near", text: "قريب من الجهاز (بكابل)" }, { id: "remote", text: "دخول عن بُعد" }],
                items: [
                  { id: "i1", text: "line console 0" },
                  { id: "i2", text: "line vty 0 4" },
                  { id: "i3", text: "Telnet أو SSH عبر الشبكة" },
                  { id: "i4", text: "البرمجة الأولى للجهاز" },
                ],
                assign: { i1: "near", i2: "remote", i3: "remote", i4: "near" },
                feedback: { explanation: "Console = قريب من الجهاز (بكابل): نستخدمه عند البرمجة الأولى، ونحن قريبون من الجهاز (line console 0). VTY = دخول عن بُعد عبر الشبكة باستخدام Telnet أو SSH (line vty 0 4)." },
              },
            },
            {
              id: "m24-l02-p01-q05", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "في صندوق Console كتبنا password cisco123 ونسينا login. ماذا يحدث؟",
                options: [{ id: "a", text: "يطلب الجهاز كلمة المرور مرتين" }, { id: "b", text: "تُشفَّر كلمة المرور" }, { id: "c", text: "يُغلق منفذ Console" }, { id: "d", text: "لا يسأل الجهاز عن كلمة المرور عند الدخول", correct: true }],
                feedback: { explanation: "login: يجعل الجهاز يطلب كلمة المرور عند الدخول (بدونه لا يسأل عنها)." },
              },
            },
            {
              id: "m24-l02-p01-q06", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "مع الأمر line vty 0 4، كم شخصًا يستطيع الدخول عن بُعد معًا؟",
                options: [{ id: "a", text: "4" }, { id: "b", text: "5", correct: true }, { id: "c", text: "1" }, { id: "d", text: "0" }],
                feedback: { explanation: "vty 0 4: خطوط الدخول عن بُعد — 5 خطوط (من 0 إلى 4)، أي 5 أشخاص معًا." },
              },
            },
            {
              id: "m24-l02-p01-q07", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "يُفضّل Telnet بدل SSH، لأنه أكثر أمانًا ويشفّر البيانات.", answer: false, feedback: { explanation: "تذكّر: يُفضّل SSH بدل Telnet، لأنه أكثر أمانًا ويشفّر البيانات." } },
            },
            {
              id: "m24-l02-p01-q08", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "enable secret أقوى من enable password، لأن كلمة المرور محفوظة بشكل مشفّر.", answer: true, feedback: { explanation: "enable secret: كلمة مرور لوضع الأوامر المتقدّم، محفوظة بشكل مشفّر. أقوى من enable password." } },
            },
            {
              id: "m24-l02-p01-q09", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ماذا يفعل الأمر service password-encryption؟",
                options: [{ id: "a", text: "يخفي كلمات المرور العادية (مثل كلمة Console و VTY) في ملف الإعدادات", correct: true }, { id: "b", text: "يحذف كل كلمات المرور" }, { id: "c", text: "يحفظ الإعدادات الحالية" }, { id: "d", text: "يسمح بالدخول عن بُعد" }],
                feedback: { explanation: "service password-encryption: يخفي كلمات المرور العادية (مثل كلمة Console و VTY) في ملف الإعدادات." },
              },
            },
            {
              id: "m24-l02-p01-q10", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "لماذا نشفّر كلمات المرور؟",
                options: [{ id: "a", text: "حتى يعمل الجهاز أسرع" }, { id: "b", text: "حتى لا نحتاج إلى الأمر login" }, { id: "c", text: "لأن من يعرض الإعدادات بدون تشفير يرى password cisco123 مكتوبة بوضوح", correct: true }, { id: "d", text: "حتى تُحفظ الإعدادات عند إطفاء الجهاز" }],
                feedback: { explanation: "بدون تشفير، من يعرض الإعدادات يرى password cisco123 مكتوبة بوضوح. بعد التشفير يرى رموزًا غير مفهومة بدلها." },
              },
            },
            {
              id: "m24-l02-p01-q11", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "classify", prompt: "صنّف كل عبارة: هل تصف running-config أم startup-config؟",
                groups: [{ id: "running", text: "running-config" }, { id: "startup", text: "startup-config" }],
                items: [
                  { id: "i1", text: "الإعدادات الحالية التي تعمل الآن" },
                  { id: "i2", text: "الإعدادات المحفوظة" },
                  { id: "i3", text: "تُحمّل عند تشغيل الجهاز" },
                  { id: "i4", text: "تضيع إذا أُطفئ الجهاز" },
                ],
                assign: { i1: "running", i2: "startup", i3: "startup", i4: "running" },
                feedback: { explanation: "running-config: يعرض الإعدادات الحالية التي تعمل الآن، وهي تضيع إذا أُطفئ الجهاز. startup-config: يعرض الإعدادات المحفوظة التي تُحمّل عند تشغيل الجهاز." },
              },
            },
            {
              id: "m24-l02-p01-q12", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "wordBank", prompt: "أكمل الفراغات من مخزن الكلمات:",
                segments: ["أوامر ", { blank: "b1" }, " نستعملها للفحص والتأكّد من الأوامر، وتُكتب في الوضع المتقدّم (#). وبعد البرمجة نحفظ الإعدادات دائمًا بالأمر copy running-config ", { blank: "b2" }, "."],
                bank: ["show", "login", "startup-config", "password"],
                answers: { b1: "show", b2: "startup-config" },
                feedback: { explanation: "أوامر show نستعملها للفحص والتأكّد من الأوامر. تُكتب في الوضع المتقدّم (#). الإعدادات الحالية (running) تضيع إذا أُطفئ الجهاز، لذلك بعد البرمجة احفظها دائمًا بالأمر copy running-config startup-config." },
              },
            },
            {
              // Phase 8B-3 — a network lab on the curriculum network simulator (networkTopology@2) with this unit's own values; the
              // SERVER replays and judges it (checks, feedback and solution never reach the browser). Counted in
              // Study Strength (owner decision 2026-11-01, §21). Proven by networkLab.contract.test.ts (no free credit, solution passes).
              id: "m24-l02-p01-lab-passwords", type: "simulation", origin: "teacher-enrichment", simulationType: "network-lab", version: 1,
              title: "مختبر شبكي: حماية السويتش بكلمات المرور",
              description: "مختبر على محاكي الشبكات: احمِ طرق الدخول إلى السويتش بكلمات مرور، ثم اضغط «تحقّق من الإعداد».",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "line console 0، password cisco123، login؛ line vty 0 4، password cisco123، login؛ enable secret cisco123؛ service password-encryption." },
              config: {
                topology: {"v":2,"devices":[{"id":"sw1","kind":"switch","label":"SW1","x":0.5,"y":0.25},{"id":"pc1","kind":"pc","label":"PC1","x":0.5,"y":0.8,"initial":{"v":2,"device":"host","adapters":{"eth0":{"mode":"static","address":"192.168.1.11","mask":"255.255.255.0","gateway":""}}}}],"links":[{"id":"a","a":{"deviceId":"sw1","port":"f0/1"},"b":{"deviceId":"pc1","port":"eth0"}}]},
                task: {
                  intro: "على السويتش SW1: احمِ الدخول المباشر (line console 0) والدخول عن بُعد (line vty 0 4) بكلمة المرور cisco123 واجعل الجهاز يطلبها. احمِ وضع الأوامر المتقدّم بـ enable secret cisco123، ثم شفّر كلمات المرور المحفوظة.",
                  goals: [{"id":"con","label":"line console 0: كلمة المرور cisco123"},{"id":"conl","label":"line console 0: الجهاز يطلب كلمة المرور (login)"},{"id":"vty","label":"line vty 0 4: كلمة المرور cisco123"},{"id":"vtyl","label":"line vty 0 4: الجهاز يطلب كلمة المرور (login)"},{"id":"sec","label":"enable secret cisco123"},{"id":"enc","label":"تشفير كلمات المرور (service password-encryption)"}],
                },
                checks: [{"id":"con","label":"line console 0: كلمة المرور cisco123","weight":1,"kind":"switch.consolePassword","deviceId":"sw1","value":"cisco123"},{"id":"conl","label":"line console 0: الجهاز يطلب كلمة المرور (login)","weight":1,"kind":"switch.consoleLogin","deviceId":"sw1","value":true},{"id":"vty","label":"line vty 0 4: كلمة المرور cisco123","weight":1,"kind":"switch.vtyPassword","deviceId":"sw1","value":"cisco123"},{"id":"vtyl","label":"line vty 0 4: الجهاز يطلب كلمة المرور (login)","weight":1,"kind":"switch.vtyLogin","deviceId":"sw1","value":true},{"id":"sec","label":"enable secret cisco123","weight":1,"kind":"switch.enableSecret","deviceId":"sw1","value":"cisco123"},{"id":"enc","label":"تشفير كلمات المرور (service password-encryption)","weight":1,"kind":"switch.passwordEncryption","deviceId":"sw1","value":true}],
                feedback: {
                  correctFeedback: "أحسنت! تحققت كل أهداف المختبر.",
                  incorrectFeedback: "لم تتحقق كل الأهداف بعد.",
                  hints: ["line console 0 ثم password cisco123 ثم login ثم exit.","line vty 0 4 ثم password cisco123 ثم login ثم exit.","enable secret cisco123 ثم service password-encryption."],
                  explanation: "login يجعل الجهاز يطلب كلمة المرور عند الدخول (بدونه لا يسأل عنها). enable secret أقوى من enable password لأن كلمة المرور محفوظة بشكل مشفّر، و service password-encryption يشفّر باقي كلمات المرور حتى لا تُرى مكتوبة بوضوح.",
                },
                solution: [{"type":"switch.command","deviceId":"sw1","command":"enable"},{"type":"switch.command","deviceId":"sw1","command":"configure terminal"},{"type":"switch.command","deviceId":"sw1","command":"line console 0"},{"type":"switch.command","deviceId":"sw1","command":"password cisco123"},{"type":"switch.command","deviceId":"sw1","command":"login"},{"type":"switch.command","deviceId":"sw1","command":"exit"},{"type":"switch.command","deviceId":"sw1","command":"line vty 0 4"},{"type":"switch.command","deviceId":"sw1","command":"password cisco123"},{"type":"switch.command","deviceId":"sw1","command":"login"},{"type":"switch.command","deviceId":"sw1","command":"exit"},{"type":"switch.command","deviceId":"sw1","command":"enable secret cisco123"},{"type":"switch.command","deviceId":"sw1","command":"service password-encryption"},{"type":"switch.command","deviceId":"sw1","command":"end"}],
              },
            },
            { id: "m24-l02-p01-lib-t20", type: "library-training", origin: "teacher-enrichment", trainingId: "T20", label: "تدريب 20", requiredModuleId: "791381s-m24" },
            { id: "m24-l02-p01-lib-t25", type: "library-training", origin: "teacher-enrichment", trainingId: "T25", label: "تدريب 25", requiredModuleId: "791381s-m24" },
            { id: "m24-l02-p01-lib-t26", type: "library-training", origin: "teacher-enrichment", trainingId: "T26", label: "تدريب 26", requiredModuleId: "791381s-m24" },
          ],
        },
      ],
    },
  ],
};

export default m24;
