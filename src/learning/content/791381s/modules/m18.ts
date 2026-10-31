// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 18 «إدارة VLAN مركزيًا: VTP».
//
// Verbatim conversion of booklet PDF pages 51–53 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every converted block is origin:"book": nothing is added, removed or reworded; bold runs are `strong`, monospace
// runs are `code`, printed box labels are the callout titles. The VTP Server/Client drawing is a crop of the booklet
// itself.
//
// Enrichment (docs/enterprise-791381s-enrichment-plan.md, Phase 5): teacher-enrichment blocks (visuals and CLI terminal
// simulations reused from course 791381 after checking their labels / commands against this section, and the end-of-unit
// «تدريبات الوحدة» lesson) are ADDED after the book blocks they explain. The book blocks stay verbatim — pinned by the book
// lock (bookLock.test.ts).

import type { ContentModule, ContentSource } from "../../types";
import type { CliExerciseConfig } from "../../../cli/types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };
const EX = (exercise: CliExerciseConfig): Record<string, unknown> => ({ ...exercise });

const m18: ContentModule = {
  id: "791381s-m18",
  title: "إدارة VLAN مركزيًا: VTP",
  order: 18,
  lessons: [
    {
      id: "791381s-m18-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m18-l00-p01",
          title: "إدارة VLAN مركزيًا: VTP",
          order: 1,
          layout: "opener",
          source: src(51),
          blocks: [
            {
              id: "m18-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الدفعة الرابعة · كتاب ص 139–144", unitNumber: "18", title: "إدارة VLAN مركزيًا: VTP",
              subtitle: "كيف نعرّف VLAN مرة واحدة فتصل إلى كل السويتشات؟",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m18-l01",
      title: "إدارة VLAN مركزيًا: VTP",
      order: 1,
      pages: [
        {
          id: "791381s-m18-l01-p01",
          title: "ما هو VTP؟",
          order: 1,
          source: src(51),
          blocks: [
            {
              id: "m18-l01-p01-def", type: "text", origin: "book",
              spans: [{ text: "VTP بروتوكول من Cisco لإدارة VLAN على عدة سويتشات من مكان واحد.", style: "strong" }],
            },
            {
              id: "m18-l01-p01-intro", type: "text", origin: "book",
              spans: [{ text: "تخيّل مدرسة فيها 6 سويتشات. إذا أردنا إضافة VLAN جديدة، يجب أن نكتب الأوامر 6 مرات! مع VTP نكتبها مرة واحدة فقط على سويتش رئيسي، وهو يوزّعها على الباقي." }],
            },
            {
              id: "m18-l01-p01-points", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m18-l01-p01-t1", text: [{ text: "المشكلة:", style: "strong" }, { text: " تعديل VLAN يدويًا على كل سويتش يأخذ وقتًا ويسبّب أخطاء." }] },
                {
                  id: "m18-l01-p01-t2",
                  text: [
                    { text: "الحل:", style: "strong" },
                    { text: " سويتش " },
                    { text: "Server", style: "strong" },
                    { text: " يرسل التحديثات إلى سويتشات " },
                    { text: "Client", style: "strong" },
                    { text: "." },
                  ],
                },
                { id: "m18-l01-p01-t3", text: [{ text: "يعمل غالبًا عبر وصلات " }, { text: "Trunk", style: "strong" }, { text: "." }] },
              ],
            },
            {
              id: "m18-l01-p01-v-roles", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m19/vtp-roles", motion: false,
              source: src(51),
              title: "مخطط: أدوار VTP — Server و Client",
              alt: "مخطط فيه سويتش Server في الأعلى مكتوب تحته «يعرّف VLAN ويرسل التحديثات»، يتصل بوصلتي Trunk بسويتشين Client مكتوب تحت كل منهما «يستقبل التحديثات».",
              caption: "سويتش Server يرسل التحديثات إلى سويتشات Client، غالبًا عبر وصلات Trunk.",
            },
            {
              id: "m18-l01-p01-fullname", type: "text", origin: "book",
              spans: [{ text: "الاسم الكامل:", style: "strong" }, { text: " VTP = VLAN Trunking Protocol" }],
            },
          ],
        },
        {
          id: "791381s-m18-l01-p02",
          title: "كيف يعمل VTP؟",
          order: 2,
          source: src(52),
          blocks: [
            {
              id: "m18-l01-p02-drawing", type: "diagram", origin: "book",
              src: "/learning-assets/791381s/bf24757a6d996271.png",
              alt: "مربع في الأعلى مكتوب فيه «Switch · Server» و«هنا نعرّف VLAN»، تخرج منه ثلاثة خطوط إلى ثلاثة مربعات مكتوب في كل منها «Client»؛ وعلى الخطين الجانبيين عبارة «VLAN 10, 20»، وينتهي أحدهما بسهم.",
              caption: "نعرّف VLAN على الـ Server فقط، فتصل تلقائيًا إلى كل الـ Clients",
            },
            {
              id: "m18-l01-p02-v-propagation", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m19/vtp-propagation", motion: true,
              source: src(52),
              title: "رسم متحرّك: من الـ Server إلى الـ Clients تلقائيًا",
              alt: "رسم متحرّك: سويتش «Server · VLAN» في الأعلى تخرج منه ثلاث وصلات Trunk إلى ثلاثة سويتشات Client، وينتقل التحديث من الـ Server إلى كل Client.",
              caption: "نعرّف VLAN في الـ Server مرة واحدة، فتصل للباقي تلقائيًا.",
            },
            {
              id: "m18-l01-p02-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m18-l01-p02-s1", text: [{ text: "نضبط سويتشًا واحدًا كـ " }, { text: "Server", style: "strong" }, { text: "." }] },
                { id: "m18-l01-p02-s2", text: [{ text: "نضبط باقي السويتشات كـ " }, { text: "Client", style: "strong" }, { text: "." }] },
                { id: "m18-l01-p02-s3", text: [{ text: "نعرّف VLAN في الـ Server فقط، فتصل للباقي تلقائيًا." }] },
              ],
            },
            {
              id: "m18-l01-p02-benefit", type: "callout", origin: "book", kind: "summary", title: "الفائدة",
              spans: [{ text: "توفير الوقت، وتقليل أخطاء تكرار الإعدادات على كل سويتش." }],
            },
          ],
        },
        {
          id: "791381s-m18-l01-p03",
          title: "إعداد VTP: Server و Client",
          order: 3,
          source: src(52, 53),
          blocks: [
            {
              id: "m18-l01-p03-intro", type: "text", origin: "book",
              spans: [{ text: "كل السويتشات يجب أن تكون في نفس «المجموعة» (Domain) ولها نفس كلمة المرور، حتى تقبل التحديثات من الـ Server." }],
            },
            { id: "m18-l01-p03-server-h", type: "heading", origin: "book", level: 3, text: "على السويتش الرئيسي (Server)" },
            { id: "m18-l01-p03-server-cli-h", type: "heading", origin: "book", level: 4, text: "Switch CLI · Server", dir: "ltr" },
            {
              id: "m18-l01-p03-server-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: "① Switch(config)# vtp mode server\n② Switch(config)# vtp domain HFA\n③ Switch(config)# vtp password 123",
            },
            {
              id: "m18-l01-p03-server-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m18-l01-p03-ss1", text: [{ text: "هذا السويتش هو الـ Server: هو الذي يدير تعريفات VLAN." }] },
                { id: "m18-l01-p03-ss2", text: [{ text: "اسم المجال المشترك " }, { text: "(Domain)", dir: "ltr" }, { text: ": HFA." }] },
                { id: "m18-l01-p03-ss3", text: [{ text: "كلمة مرور المجال: 123." }] },
              ],
            },
            {
              id: "m18-l01-p03-sim-server", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مثال موجّه: إعداد السويتش الرئيسي (Server)",
              description: "أنت في وضع الإعداد العام. اكتب أوامر صندوق الكتاب الثلاثة بالترتيب. محاكاة تعليمية مبسّطة، ليست جهازًا حقيقيًا.",
              source: src(52, 53),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "على السويتش الرئيسي (Server): vtp mode server ثم vtp domain HFA ثم vtp password 123." },
              config: EX({
                kind: "guided",
                device: "switch",
                startMode: "global",
                intro: "اضبط هذا السويتش كـ Server في المجال HFA بكلمة المرور 123.",
                steps: [
                  { id: "s1", instruction: "اجعل هذا السويتش هو الـ Server الذي يدير تعريفات VLAN", expect: { command: "vtp-mode", args: { mode: "server" } }, success: "✓ أحسنت، هذا السويتش الآن Server", hints: ["السطر ① في صندوق الكتاب.", "vtp mode ثم دور السويتش."] },
                  { id: "s2", instruction: "اكتب اسم المجال المشترك (Domain): HFA", expect: { command: "vtp-domain", args: { name: "HFA" } }, success: "✓ أحسنت، المجال HFA", hints: ["السطر ② في صندوق الكتاب.", "vtp domain ثم اسم المجال."] },
                  { id: "s3", instruction: "اكتب كلمة مرور المجال: 123", expect: { command: "vtp-password", args: { password: "123" } }, success: "✓ أحسنت، كلمة مرور المجال 123", hints: ["السطر ③ في صندوق الكتاب.", "vtp password ثم كلمة المرور."] },
                ],
                allowed: ["vtp-mode", "vtp-domain", "vtp-password"],
                completion: "✓ أحسنت، السويتش الرئيسي جاهز: Server في المجال HFA بكلمة المرور 123.",
              }),
            },
            { id: "m18-l01-p03-client-h", type: "heading", origin: "book", level: 3, text: "على كل سويتش آخر (Client)" },
            { id: "m18-l01-p03-client-cli-h", type: "heading", origin: "book", level: 4, text: "Switch CLI · Client", dir: "ltr" },
            {
              id: "m18-l01-p03-client-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: "① Switch(config)# vtp mode client\n② Switch(config)# vtp domain HFA\n③ Switch(config)# vtp password 123",
            },
            {
              id: "m18-l01-p03-client-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m18-l01-p03-cs1", text: [{ text: "هذا السويتش Client: يستقبل تعريفات VLAN من الـ Server." }] },
                { id: "m18-l01-p03-cs2", text: [{ text: "نفس اسم المجال بالضبط." }] },
                { id: "m18-l01-p03-cs3", text: [{ text: "نفس كلمة المرور بالضبط." }] },
              ],
            },
            {
              id: "m18-l01-p03-sim-client", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "تحدّي الأمر: إعداد سويتش Client",
              description: "أنت في وضع الإعداد العام على سويتش آخر. اكتب الأمر المطلوب في كل سؤال؛ المحاكي لا يكشف الإجابة. محاكاة تعليمية مبسّطة.",
              source: src(52, 53),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "على كل سويتش آخر (Client): vtp mode client ثم vtp domain HFA ثم vtp password 123 — نفس اسم المجال ونفس كلمة المرور بالضبط." },
              config: EX({
                kind: "challenge",
                device: "switch",
                startMode: "global",
                intro: "هذا سويتش آخر في نفس الشبكة. اجعله يستقبل تعريفات VLAN من الـ Server.",
                steps: [
                  { id: "c1", instruction: "اجعل هذا السويتش Client يستقبل تعريفات VLAN من الـ Server", expect: { command: "vtp-mode", args: { mode: "client" } }, hints: ["السطر ① في صندوق الـ Client.", "نفس أمر الـ Server لكن بالدور الآخر."] },
                  { id: "c2", instruction: "اكتب نفس اسم المجال الذي على الـ Server بالضبط", expect: { command: "vtp-domain", args: { name: "HFA" } }, hints: ["اسم المجال على الـ Server هو HFA.", "vtp domain ثم الاسم."] },
                  { id: "c3", instruction: "اكتب نفس كلمة المرور التي على الـ Server بالضبط", expect: { command: "vtp-password", args: { password: "123" } }, hints: ["كلمة مرور المجال على الـ Server هي 123.", "vtp password ثم كلمة المرور."] },
                ],
                allowed: ["vtp-mode", "vtp-domain", "vtp-password"],
                completion: "✓ صحيح — Domain و Password متطابقان مع الـ Server، فتصل التحديثات.",
              }),
            },
            {
              id: "m18-l01-p03-warning", type: "callout", origin: "book", kind: "warning", title: "انتبه",
              spans: [
                { text: "يجب أن يكون " },
                { text: "Domain", style: "strong" },
                { text: " و " },
                { text: "Password", style: "strong" },
                { text: " متطابقين في كل السويتشات، وإلا لن تصل التحديثات." },
              ],
            },
          ],
        },
        {
          id: "791381s-m18-l01-p04",
          title: "تعريف VLAN على سويتش الـ Server",
          order: 4,
          source: src(53),
          blocks: [
            {
              id: "m18-l01-p04-intro", type: "text", origin: "book",
              spans: [{ text: "بعد إعداد VTP نعرّف VLAN مرة واحدة فقط على الـ Server (بالأوامر التي تعلّمناها: vlan 10 ثم name)." }],
            },
            {
              id: "m18-l01-p04-points", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m18-l01-p04-t1", text: [{ text: "الـ Server ينقل التعريفات لباقي السويتشات." }] },
                { id: "m18-l01-p04-t2", text: [{ text: "هذا يقلّل الحاجة لتكرار الأوامر." }] },
                { id: "m18-l01-p04-t3", text: [{ text: "كل السويتشات يجب أن تكون داخل نفس الـ Domain، وكل سويتش Client ما عدا الـ Server." }] },
              ],
            },
            {
              id: "m18-l01-p04-check", type: "callout", origin: "book", kind: "summary", title: "تأكّد",
              spans: [{ text: "إذا كان VTP صحيحًا، ستظهر VLAN على الـ Clients تلقائيًا (نفحص بالأمر show vlan brief)." }],
            },
            {
              id: "m18-l01-p04-exam", type: "callout", origin: "book", kind: "summary", title: "للامتحان",
              spans: [
                { text: "يكفي أن تعرف الفرق بين " },
                { text: "Server", style: "strong" },
                { text: " (يعرّف ويرسل) و " },
                { text: "Client", style: "strong" },
                { text: " (يستقبل)، ووظيفة كل منهما." },
              ],
            },
          ],
        },
      ],
    },
    {
      // «تدريبات الوحدة» — ADDED enrichment: an end-of-unit exercise page after the booklet's own pages. Every question is
      // answered by the section's printed text above (the explanation quotes it). The book pages are unchanged (book lock).
      id: "791381s-m18-l02",
      title: "تدريبات الوحدة",
      order: 2,
      pages: [
        {
          id: "791381s-m18-l02-p01",
          title: "تدريبات الوحدة: إدارة VLAN مركزيًا: VTP",
          order: 1,
          layout: "practice",
          source: src(51, 53),
          blocks: [
            {
              id: "m18-l02-p01-q01", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "مدرسة فيها 6 سويتشات وتعمل بـ VTP. كم مرة نكتب أوامر VLAN جديدة؟",
                options: [{ id: "a", text: "6 مرات، مرة على كل سويتش" }, { id: "b", text: "مرة واحدة فقط على سويتش رئيسي", correct: true }, { id: "c", text: "مرتين: على الـ Server وعلى أول Client" }, { id: "d", text: "لا نكتبها أبدًا" }],
                feedback: { explanation: "بدون VTP يجب أن نكتب الأوامر 6 مرات! مع VTP نكتبها مرة واحدة فقط على سويتش رئيسي، وهو يوزّعها على الباقي." },
              },
            },
            {
              id: "m18-l02-p01-q02", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "VTP يعمل غالبًا عبر منافذ Access.", answer: false, feedback: { explanation: "VTP يعمل غالبًا عبر وصلات Trunk." } },
            },
            {
              id: "m18-l02-p01-q03", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ما الاسم الكامل لـ VTP؟",
                options: [{ id: "a", text: "VLAN Transfer Protocol" }, { id: "b", text: "Virtual Trunk Path" }, { id: "c", text: "VLAN Trunking Protocol", correct: true }, { id: "d", text: "VLAN Telnet Protocol" }],
                feedback: { explanation: "الاسم الكامل: VTP = VLAN Trunking Protocol، وهو بروتوكول من Cisco لإدارة VLAN على عدة سويتشات من مكان واحد." },
              },
            },
            {
              id: "m18-l02-p01-q04", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "ordering", prompt: "رتّب خطوات عمل VTP كما في الكتاب:",
                items: [
                  { id: "s3", text: "نعرّف VLAN في الـ Server فقط، فتصل للباقي تلقائيًا." },
                  { id: "s1", text: "نضبط سويتشًا واحدًا كـ Server." },
                  { id: "s2", text: "نضبط باقي السويتشات كـ Client." },
                ],
                order: ["s1", "s2", "s3"],
                feedback: { explanation: "1) نضبط سويتشًا واحدًا كـ Server. 2) نضبط باقي السويتشات كـ Client. 3) نعرّف VLAN في الـ Server فقط، فتصل للباقي تلقائيًا." },
              },
            },
            {
              id: "m18-l02-p01-q05", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "classify", prompt: "صنّف كل عبارة: هل تصف الـ Server أم الـ Client؟",
                groups: [{ id: "server", text: "Server" }, { id: "client", text: "Client" }],
                items: [
                  { id: "i1", text: "نعرّف VLAN عليه فقط" },
                  { id: "i2", text: "يستقبل تعريفات VLAN" },
                  { id: "i3", text: "يرسل التحديثات" },
                  { id: "i4", text: "باقي السويتشات" },
                  { id: "i5", text: "سويتش واحد فقط" },
                ],
                assign: { i1: "server", i2: "client", i3: "server", i4: "client", i5: "server" },
                feedback: { explanation: "نضبط سويتشًا واحدًا كـ Server: نعرّف VLAN عليه فقط وهو يرسل التحديثات (يعرّف ويرسل). باقي السويتشات Client: تستقبل تعريفات VLAN من الـ Server." },
              },
            },
            {
              id: "m18-l02-p01-q06", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "على الـ Server كتبنا vtp domain HFA، وعلى أحد الـ Clients كتبنا vtp domain HFB. ماذا يحدث؟",
                options: [{ id: "a", text: "يصبح هذا الـ Client هو الـ Server" }, { id: "b", text: "لا مشكلة، اسم المجال لا يهمّ" }, { id: "c", text: "تصل التحديثات مرتين" }, { id: "d", text: "لن تصل التحديثات إلى هذا الـ Client", correct: true }],
                feedback: { explanation: "يجب أن يكون Domain و Password متطابقين في كل السويتشات، وإلا لن تصل التحديثات." },
              },
            },
            {
              id: "m18-l02-p01-q07", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "matching", prompt: "صِل كل أمر بشرحه:",
                left: [
                  { id: "srv", text: "vtp mode server" },
                  { id: "dom", text: "vtp domain HFA" },
                  { id: "pwd", text: "vtp password 123" },
                  { id: "cli", text: "vtp mode client" },
                ],
                right: [
                  { id: "r1", text: "كلمة مرور المجال: 123" },
                  { id: "r2", text: "هذا السويتش Client: يستقبل تعريفات VLAN من الـ Server" },
                  { id: "r3", text: "هذا السويتش هو الـ Server: هو الذي يدير تعريفات VLAN" },
                  { id: "r4", text: "اسم المجال المشترك (Domain): HFA" },
                ],
                pairs: { srv: "r3", dom: "r4", pwd: "r1", cli: "r2" },
                feedback: { explanation: "vtp mode server: هذا السويتش هو الـ Server. vtp domain HFA: اسم المجال المشترك. vtp password 123: كلمة مرور المجال. vtp mode client: هذا السويتش Client يستقبل تعريفات VLAN." },
              },
            },
            {
              id: "m18-l02-p01-q08", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "في شبكة VTP نضبط كل السويتشات كـ Server.", answer: false, feedback: { explanation: "كل السويتشات يجب أن تكون داخل نفس الـ Domain، وكل سويتش Client ما عدا الـ Server." } },
            },
            {
              id: "m18-l02-p01-q09", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "بأيّ أمر نفحص أن VLAN ظهرت على الـ Clients تلقائيًا؟",
                options: [{ id: "a", text: "show vlan brief", correct: true }, { id: "b", text: "vtp mode client" }, { id: "c", text: "vtp domain HFA" }, { id: "d", text: "vtp password 123" }],
                feedback: { explanation: "إذا كان VTP صحيحًا، ستظهر VLAN على الـ Clients تلقائيًا (نفحص بالأمر show vlan brief)." },
              },
            },
            {
              id: "m18-l02-p01-q10", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "wordBank", prompt: "أكمل الفراغات من مخزن الكلمات:",
                segments: ["للامتحان يكفي أن تعرف الفرق بين ", { blank: "b1" }, " (يعرّف ويرسل) و ", { blank: "b2" }, " (يستقبل). وكل السويتشات يجب أن تكون داخل نفس الـ ", { blank: "b3" }, "."],
                bank: ["Client", "Trunk", "Server", "Access", "Domain"],
                answers: { b1: "Server", b2: "Client", b3: "Domain" },
                feedback: { explanation: "يكفي أن تعرف الفرق بين Server (يعرّف ويرسل) و Client (يستقبل). كل السويتشات يجب أن تكون داخل نفس الـ Domain." },
              },
            },
            {
              id: "m18-l02-p01-q11", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ما فائدة VTP كما يذكرها الكتاب؟",
                options: [{ id: "a", text: "زيادة سرعة الإنترنت" }, { id: "b", text: "تشفير البيانات بين السويتشات" }, { id: "c", text: "توفير الوقت، وتقليل أخطاء تكرار الإعدادات على كل سويتش", correct: true }, { id: "d", text: "الاستغناء عن تعريف VLAN نهائيًا" }],
                feedback: { explanation: "الفائدة: توفير الوقت، وتقليل أخطاء تكرار الإعدادات على كل سويتش." },
              },
            },
          ],
        },
      ],
    },
  ],
};

export default m18;
