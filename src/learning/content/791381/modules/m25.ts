// Learning Materials — Batch 10 phase: REAL converted body for Book 791381, module m25 (the book's section
// «مراجعة الأوامر», source PDF 201–206 — six review pages that open the sixth batch; PDF 200 is the batch cover
// «الدفعة السادسة · WAN والتوجيه و ACL وقاموس شامل» and is structural only: in the module's coarse source range +
// `sourceNote`, never rendered). NEW stable id m25, reading `order` 24: after m05 («مرجع أوامر Cisco», order 23)
// and before m26 («الشبكة الواسعة WAN», order 25).
// Book-derived blocks are origin:"book": the five «Cisco CLI» boxes (PDF 201–205, as `code` blocks with the book's
// exact lines and its generic `Device(config)#` prompt + the annotation tables), their «الفكرة» / «ملاحظة» /
// «تذكّر» boxes, and the PDF 206 two `show` cards + «تذكّر».
// INTERACTIVE CLI (every command already exists in the simulator — nothing was added for this module): PDF 201
// task, PDF 202 task, PDF 203 challenge (with a fix-the-command step), PDF 204 challenge, PDF 205 guided, PDF 206
// show challenge. The book's review pages repeat commands taught in m03 / m19 / m04 / m23 / m24 / m05; the
// exercise KINDS here differ from the ones used on the earlier pages so the review adds practice, not repetition.
// SOURCE LEVEL: a one-line meaning per command; nothing beyond the book's lines is claimed. SOURCE ORDER: nothing
// from PDF 207+ (WAN, routing protocols, ACL) appears here. PRINTED PAGE = page circle = PDF index (201 … 206).

import type { ContentModule, ContentSource, InlineSpan, PracticeOption, PracticeTableSelectCell } from "../../types";
import type { CliExerciseConfig } from "../../../cli/types";

const CID = "791381";
const src = (pdf: number, printed?: number): ContentSource => ({ kind: "book", sourceId: CID, pdfPageStart: pdf, printedPage: printed });
const L = (text: string): InlineSpan => ({ text, dir: "ltr", style: "code" });
const T = (text: string): InlineSpan => ({ text });
const opt = (id: string, text: string, correct?: true): PracticeOption => (correct ? { id, text, correct } : { id, text });
const EX = (exercise: CliExerciseConfig): Record<string, unknown> => ({ ...exercise });
const GROUPS = ["VLAN / Interfaces / Config", "Security / Routing / DHCP"] as const;
const GR = (key: (typeof GROUPS)[number]): PracticeTableSelectCell => ({ kind: "select", options: [...GROUPS], key });

const m25: ContentModule = {
  id: "791381-m25",
  title: "مراجعة الأوامر",
  shortTitle: "مراجعة الأوامر",
  order: 24,
  source: { kind: "book", sourceId: CID, pdfPageStart: 200, pdfPageEnd: 206, sourceNote: "PDF 200 صفحة عنوان الدفعة السادسة «WAN والتوجيه و ACL وقاموس شامل» (لا تُعرض)، ثم ست صفحات تحت العنوان الجاري «مراجعة الأوامر» (PDF 201–206). PDF 199 آخر صفحة في وحدة مرجع أوامر Cisco (m05)، و PDF 207 تبدأ وحدة «الشبكة الواسعة WAN» (m26)." },
  lessons: [
    {
      id: "791381-m25-l01",
      title: "مراجعة أوامر Cisco",
      order: 1,
      pages: [
        // PDF 201 — الدخول والإعداد الأساسي + TASK
        {
          id: "791381-m25-l01-p01",
          title: "الدخول والإعداد الأساسي",
          order: 1,
          source: src(201, 201),
          keywords: ["enable", "configure terminal", "hostname R1", "interface g0/0", "ip address"],
          blocks: [
            {
              id: "m25-l01-p01-cli", type: "code", origin: "book", language: "cli",
              code: "Device(config)# enable\nDevice(config)# configure terminal\nDevice(config)# hostname R1\nDevice(config)# interface g0/0",
            },
            {
              id: "m25-l01-p01-cmds", type: "table", origin: "book",
              caption: "Cisco CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Device(config)# enable", "الدخول إلى وضع الأوامر"],
                ["Device(config)# configure terminal", "وضع الإعداد"],
                ["Device(config)# hostname R1", "تغيير اسم الجهاز"],
                ["Device(config)# interface g0/0", "ثم ip address لضبط منفذ"],
              ],
            },
            {
              id: "m25-l01-p01-idea", type: "callout", origin: "book", kind: "tip", title: "الفكرة",
              spans: [T("نبدأ بالدخول إلى وضع الإعداد، ثم نغيّر اسم الجهاز أو نضبط منفذًا معيّنًا.")],
            },
            {
              id: "m25-l01-p01-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("الكتاب يكتب السطور الأربعة تحت مؤشّر واحد للاختصار؛ في الحقيقة "), L("enable"), T(" يُكتب من "), L("Router>"), T(" و "), L("configure terminal"), T(" من "), L("Router#"), T("، ثم "), L("hostname"), T(" و "), L("interface"), T(" من "), L("(config)#"), T("، وبعد اختيار المنفذ يُكتب "), L("ip address"), T(" تحت "), L("(config-if)#"), T(". في التدريب أدناه اخترنا العنوان "), L("192.168.1.1 255.255.255.0"), T(" مثالًا.")],
            },
            {
              id: "m25-l01-p01-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مهمّة: سمِّ الراوتر R1 واضبط منفذه الأول",
              description: "ابدأ من وضع المستخدم. المطلوب حالة نهائية: اسم الجهاز R1، والمنفذ g0/0 يحمل العنوان 192.168.1.1 بقناع 255.255.255.0 ويعمل. اكتب الأوامر بأي ترتيب صحيح؛ المحاكي يحكم على النتيجة. محاكاة تعليمية مبسّطة.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "المهمّة: enable ثم configure terminal ثم hostname R1 ثم interface g0/0 ثم ip address 192.168.1.1 255.255.255.0 ثم no shutdown." },
              config: EX({
                kind: "task",
                device: "router",
                intro: "ابدأ من Router> وحقّق الأهداف الثلاثة.",
                goals: [
                  { id: "g-name", label: "اسم الجهاز R1", condition: { kind: "hostname", value: "R1" } },
                  { id: "g-ip", label: "g0/0 يحمل العنوان 192.168.1.1", condition: { kind: "interface", name: "g0/0", prop: "ipAddress", value: "192.168.1.1" } },
                  { id: "g-mask", label: "قناع g0/0 هو 255.255.255.0", condition: { kind: "interface", name: "g0/0", prop: "subnetMask", value: "255.255.255.0" } },
                  { id: "g-up", label: "المنفذ g0/0 يعمل (no shutdown)", condition: { kind: "interface", name: "g0/0", prop: "shutdown", value: false } },
                ],
                hints: ["اتبع ترتيب صندوق الكتاب: enable ثم configure terminal ثم hostname ثم interface.", "داخل المنفذ: ip address ثم no shutdown."],
                completion: "✓ أحسنت، الراوتر اسمه R1 ومنفذه g0/0 جاهز.",
              }),
            },
            {
              id: "m25-l01-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما الأمر الذي يغيّر اسم الجهاز في صندوق الكتاب؟",
                options: [opt("m25-l01-p01-q1-a", "hostname R1", true), opt("m25-l01-p01-q1-b", "configure terminal"), opt("m25-l01-p01-q1-c", "interface g0/0")],
                feedback: {
                  hints: ["الصف الثالث في جدول الأوامر.", "host + name = اسم الجهاز."],
                  correctFeedback: "صحيح — hostname R1.",
                  incorrectFeedback: "افحص الصف: «تغيير اسم الجهاز».",
                  explanation: "configure terminal يفتح وضع الإعداد، و interface g0/0 يختار منفذًا، أما hostname فيغيّر الاسم.",
                },
              },
            },
            {
              id: "m25-l01-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "ما الأمر الذي يُكتب بعد interface g0/0 لضبط عنوان المنفذ (اسم الأمر فقط، كلمتان)؟", answer: "ip address",
                feedback: {
                  hints: ["الصف الأخير في جدول الأوامر.", "يبدأ بـ ip."],
                  correctFeedback: "صحيح — ip address.",
                  incorrectFeedback: "افحص الصف: «ثم ip address لضبط منفذ».",
                  explanation: "بعد اختيار المنفذ نكتب ip address ثم العنوان والقناع.",
                },
              },
            },
          ],
        },
        // PDF 202 — VLAN و Trunk + TASK
        {
          id: "791381-m25-l01-p02",
          title: "VLAN و Trunk",
          order: 2,
          source: src(202, 202),
          keywords: ["interface range f0/1-10", "vlan 10", "switchport access vlan 10", "switchport mode trunk"],
          blocks: [
            {
              id: "m25-l01-p02-cli", type: "code", origin: "book", language: "cli",
              code: "Device(config)# interface range f0/1-10\nDevice(config)# vlan 10\nDevice(config)# switchport access vlan 10\nDevice(config)# switchport mode trunk",
            },
            {
              id: "m25-l01-p02-cmds", type: "table", origin: "book",
              caption: "Cisco CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Device(config)# interface range f0/1-10", "تفعيل عدة منافذ"],
                ["Device(config)# vlan 10", "تعريف VLAN"],
                ["Device(config)# switchport access vlan 10", "ربط المنافذ مع VLAN"],
                ["Device(config)# switchport mode trunk", "تعريف Trunk"],
              ],
            },
            {
              id: "m25-l01-p02-idea", type: "callout", origin: "book", kind: "tip", title: "الفكرة",
              spans: [L("VLAN"), T(" تقسّم الشبكة، و "), L("Trunk"), T(" يسمح بمرور أكثر من "), L("VLAN"), T(" بين السويتشات.")],
            },
            {
              id: "m25-l01-p02-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [L("vlan 10"), T(" يُكتب في الإعداد العام، أما "), L("switchport access vlan 10"), T(" و "), L("switchport mode trunk"), T(" فيُكتبان داخل المنافذ المختارة. في المهمّة أدناه أضفنا سيناريو: المنافذ "), L("f0/1-10"), T(" للطلاب في "), L("VLAN 10"), T("، والمنفذ "), L("f0/24"), T(" هو وصلة "), L("Trunk"), T(" إلى السويتش الآخر.")],
            },
            {
              id: "m25-l01-p02-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مهمّة: VLAN 10 على عشرة منافذ و Trunk على f0/24",
              description: "أنت في وضع الإعداد العام لسويتش. المطلوب حالة نهائية: VLAN 10 معرّفة، المنافذ f0/1 إلى f0/10 مربوطة بها، والمنفذ f0/24 في وضع Trunk. الترتيب لك؛ المحاكي يحكم على النتيجة. محاكاة تعليمية مبسّطة.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "المهمّة: vlan 10 ثم interface range f0/1-10 ثم switchport access vlan 10 ثم exit ثم interface f0/24 ثم switchport mode trunk." },
              config: EX({
                kind: "task",
                device: "switch",
                startMode: "global",
                intro: "أنت في وضع الإعداد العام لسويتش.",
                goals: [
                  { id: "g-vlan", label: "VLAN 10 معرّفة", condition: { kind: "vlan", vlanId: 10 } },
                  { id: "g-first", label: "المنفذ f0/1 في VLAN 10", condition: { kind: "interface", name: "f0/1", prop: "accessVlan", value: 10 } },
                  { id: "g-last", label: "المنفذ f0/10 في VLAN 10", condition: { kind: "interface", name: "f0/10", prop: "accessVlan", value: 10 } },
                  { id: "g-trunk", label: "المنفذ f0/24 في وضع Trunk", condition: { kind: "interface", name: "f0/24", prop: "switchportMode", value: "trunk" } },
                ],
                hints: ["interface range يختار المنافذ العشرة دفعة واحدة.", "لا تنسَ الخروج من المنافذ (exit) قبل اختيار f0/24."],
                completion: "✓ أحسنت، VLAN 10 على المنافذ العشرة و Trunk على f0/24.",
              }),
            },
            {
              id: "m25-l01-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما الأمر الذي يختار عدة منافذ دفعة واحدة؟",
                options: [opt("m25-l01-p02-q1-a", "interface range f0/1-10", true), opt("m25-l01-p02-q1-b", "vlan 10"), opt("m25-l01-p02-q1-c", "switchport mode trunk")],
                feedback: {
                  hints: ["الصف الأول في جدول الأوامر.", "كلمة range تعني «مدى»."],
                  correctFeedback: "صحيح — interface range f0/1-10.",
                  incorrectFeedback: "افحص الصف: «تفعيل عدة منافذ».",
                  explanation: "range يختار المنافذ من f0/1 إلى f0/10 معًا فنكتب الأوامر مرة واحدة.",
                },
              },
            },
            {
              id: "m25-l01-p02-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "Trunk يسمح بمرور أكثر من VLAN بين السويتشات.", answer: true,
                feedback: {
                  hints: ["صندوق «الفكرة».", "ما الذي يمرّ عبر Trunk؟"],
                  correctFeedback: "صحيح — Trunk يحمل أكثر من VLAN.",
                  incorrectFeedback: "افحص صندوق «الفكرة» في الصفحة.",
                  explanation: "VLAN تقسّم الشبكة، و Trunk يربط السويتشات بحيث تمرّ كل VLAN عبره.",
                },
              },
            },
          ],
        },
        // PDF 203 — VTP وكلمات المرور + CHALLENGE (with a fix-the-command step)
        {
          id: "791381-m25-l01-p03",
          title: "VTP وكلمات المرور",
          order: 3,
          source: src(203, 203),
          keywords: ["vtp mode server", "vtp mode client", "enable secret cisco", "line vty 0 4", "line console 0", "enable password"],
          blocks: [
            {
              id: "m25-l01-p03-cli", type: "code", origin: "book", language: "cli",
              code: "Device(config)# vtp mode server / client\nDevice(config)# enable secret cisco\nDevice(config)# line vty 0 4 / line console 0",
            },
            {
              id: "m25-l01-p03-cmds", type: "table", origin: "book",
              caption: "Cisco CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Device(config)# vtp mode server / client", "إعداد VTP"],
                ["Device(config)# enable secret cisco", "كلمة مرور مشفّرة"],
                ["Device(config)# line vty 0 4 / line console 0", "حماية طرق الدخول"],
              ],
            },
            {
              id: "m25-l01-p03-remark", type: "callout", origin: "book", kind: "remember", title: "ملاحظة",
              spans: [L("enable secret"), T(" أقوى من "), L("enable password"), T(" لأنه يحفظ كلمة السر بشكل مشفّر.")],
            },
            {
              id: "m25-l01-p03-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("الشرطة المائلة في الكتاب تعني «أو»: السويتش إما "), L("server"), T(" وإما "), L("client"), T("، والخطّان "), L("vty"), T(" و "), L("console"), T(" يُدخل إلى كل منهما بأمر مستقل ثم تُكتب داخله "), L("password"), T(" و "), L("login"), T(" كما تعلّمت في وحدة حماية الأجهزة.")],
            },
            {
              id: "m25-l01-p03-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "تحدّي الأمر: VTP وكلمات المرور",
              description: "أنت في وضع الإعداد العام. اكتب الأمر المطلوب في كل سؤال؛ في السؤال الأخير صحّح أمرًا خاطئًا. المحاكي لا يكشف الإجابة. محاكاة تعليمية مبسّطة.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "التحدّي: vtp mode server، ثم vtp mode client، ثم enable secret cisco، ثم line vty 0 4، ثم exit وصحّح «line console 1» إلى line console 0." },
              config: EX({
                kind: "challenge",
                device: "switch",
                startMode: "global",
                intro: "أنت في وضع الإعداد العام.",
                steps: [
                  { id: "c1", instruction: "اجعل السويتش هو الخادم في VTP", expect: { command: "vtp-mode", args: { mode: "server" } }, hints: ["السطر الأول في صندوق الكتاب، الخيار الأول.", "يبدأ بـ vtp mode."] },
                  { id: "c2", instruction: "اجعل السويتش عميلًا في VTP", expect: { command: "vtp-mode", args: { mode: "client" } }, hints: ["السطر الأول في صندوق الكتاب، الخيار الثاني.", "الكلمة الأخيرة client."] },
                  { id: "c3", instruction: "احمِ وضع الأوامر المتقدّم بكلمة السر المشفّرة cisco", expect: { command: "enable-secret", args: { secret: "cisco" } }, hints: ["السطر الثاني في صندوق الكتاب.", "الأمر الأقوى بحسب «ملاحظة»."] },
                  { id: "c4", instruction: "اختر خطوط الدخول عن بُعد كما يكتبها الكتاب", expect: { command: "line", args: { line: "vty" } }, hints: ["السطر الثالث في صندوق الكتاب، الخيار الأول.", "line ثم vty ثم الرقمين 0 و 4."] },
                  { id: "c5", instruction: "عد إلى الإعداد العام (exit) ثم صحّح الأمر الخاطئ: «line console 1» — اكتبه كما يطبعه الكتاب", expect: { command: "line", args: { line: "console" } }, hints: ["اخرج من خط VTY أولًا؛ الخطأ في الرقم.", "خط الدخول المباشر رقمه 0."] },
                ],
                allowed: ["vtp-mode", "enable-secret"],
                completion: "✓ صحيح في كل الأوامر — VTP وكلمات المرور جاهزة.",
              }),
            },
            {
              id: "m25-l01-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "لماذا enable secret أقوى من enable password بحسب الكتاب؟",
                options: [opt("m25-l01-p03-q1-a", "لأنه يحفظ كلمة السر بشكل مشفّر", true), opt("m25-l01-p03-q1-b", "لأنه أقصر في الكتابة"), opt("m25-l01-p03-q1-c", "لأنه يعمل على VTY فقط")],
                feedback: {
                  hints: ["صندوق «ملاحظة».", "الكلمة المفتاحية: مشفّر."],
                  correctFeedback: "صحيح — يحفظ كلمة السر مشفّرة.",
                  incorrectFeedback: "افحص صندوق «ملاحظة» في الصفحة.",
                  explanation: "enable password يحفظ كلمة السر نصًا واضحًا، أما enable secret فيحفظها مشفّرة.",
                },
              },
            },
            {
              id: "m25-l01-p03-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "اكتب الأمر الذي يختار خط الدخول المباشر (الأمر كاملًا).", answer: "line console 0",
                feedback: {
                  hints: ["السطر الثالث في صندوق الكتاب، بعد الشرطة المائلة.", "console ورقمه 0."],
                  correctFeedback: "صحيح — line console 0.",
                  incorrectFeedback: "افحص السطر: «line vty 0 4 / line console 0».",
                  explanation: "console للكابل المباشر، و vty 0 4 للدخول عن بُعد.",
                },
              },
            },
          ],
        },
        // PDF 204 — Router on a Stick — Dot1Q + CHALLENGE
        {
          id: "791381-m25-l01-p04",
          title: "Router on a Stick — Dot1Q",
          order: 4,
          source: src(204, 204),
          keywords: ["interface g0/0.10", "encapsulation dot1Q 10", "ip address 192.168.10.254", "Sub-Interface", "Gateway"],
          blocks: [
            {
              id: "m25-l01-p04-cli", type: "code", origin: "book", language: "cli",
              code: "Device(config)# interface g0/0.10\nDevice(config)# encapsulation dot1Q 10\nDevice(config)# ip address 192.168.10.254 255.255.255.0",
            },
            {
              id: "m25-l01-p04-cmds", type: "table", origin: "book",
              caption: "Cisco CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Device(config)# interface g0/0.10", "ننشئ Sub-Interface لكل VLAN"],
                ["Device(config)# encapsulation dot1Q 10", "يحدّد رقم VLAN"],
                ["Device(config)# ip address 192.168.10.254 255.255.255.0", "Gateway لأجهزة VLAN"],
              ],
            },
            {
              id: "m25-l01-p04-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("الـ "), L("IP"), T(" هنا يكون عادةً "), L("Default Gateway"), T(" لأجهزة تلك "), L("VLAN"), T(".")],
            },
            {
              id: "m25-l01-p04-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("الرقم بعد النقطة في "), L("g0/0.10"), T(" مجرّد اسم للواجهة الفرعية، أما ربطها بـ "), L("VLAN 10"), T(" فعلًا فيتم بسطر "), L("encapsulation dot1Q 10"), T("؛ لذلك يُكتب هذا السطر قبل العنوان.")],
            },
            {
              id: "m25-l01-p04-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "تحدّي الأمر: واجهة فرعية لـ VLAN 10",
              description: "أنت في وضع الإعداد العام لراوتر. اكتب الأمر المطلوب في كل سؤال بالترتيب. المحاكي لا يكشف الإجابة. محاكاة تعليمية مبسّطة.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "التحدّي: interface g0/0.10، ثم encapsulation dot1Q 10، ثم ip address 192.168.10.254 255.255.255.0." },
              config: EX({
                kind: "challenge",
                device: "router",
                startMode: "global",
                intro: "أنت في وضع الإعداد العام لراوتر.",
                steps: [
                  { id: "c1", instruction: "أنشئ الواجهة الفرعية رقم 10 على g0/0", expect: { command: "interface", args: { interfaces: ["g0/0.10"], sub: true } }, hints: ["السطر الأول في صندوق الكتاب.", "اسم الواجهة ثم نقطة ثم 10."] },
                  { id: "c2", instruction: "اربط الواجهة الفرعية بـ VLAN 10", expect: { command: "encapsulation-dot1q", args: { vlanId: 10 } }, hints: ["السطر الثاني في صندوق الكتاب.", "يبدأ بـ encapsulation."] },
                  { id: "c3", instruction: "أعطها العنوان 192.168.10.254 بقناع 255.255.255.0", expect: { command: "ip-address", args: { address: "192.168.10.254", mask: "255.255.255.0" } }, hints: ["السطر الثالث في صندوق الكتاب.", "ip address ثم العنوان ثم القناع."] },
                ],
                allowed: ["encapsulation-dot1q", "ip-address"],
                completion: "✓ صحيح في كل الأوامر — الواجهة الفرعية جاهزة كبوابة لـ VLAN 10.",
              }),
            },
            {
              id: "m25-l01-p04-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ماذا يفعل الأمر encapsulation dot1Q 10؟",
                options: [opt("m25-l01-p04-q1-a", "يحدّد رقم VLAN للواجهة الفرعية", true), opt("m25-l01-p04-q1-b", "يعطي الواجهة عنوان IP"), opt("m25-l01-p04-q1-c", "ينشئ الواجهة الفرعية")],
                feedback: {
                  hints: ["الصف الثاني في جدول الأوامر.", "dot1Q هو بروتوكول وسم VLAN."],
                  correctFeedback: "صحيح — يحدّد رقم VLAN.",
                  incorrectFeedback: "افحص الصف: «يحدّد رقم VLAN».",
                  explanation: "interface ينشئ الواجهة الفرعية، و encapsulation dot1Q يربطها بالـ VLAN، و ip address يعطيها العنوان.",
                },
              },
            },
            {
              id: "m25-l01-p04-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "العنوان 192.168.10.254 يكون عادةً Default Gateway لأجهزة VLAN 10.", answer: true,
                feedback: {
                  hints: ["صندوق «تذكّر».", "ما دور عنوان الواجهة الفرعية للأجهزة؟"],
                  correctFeedback: "صحيح — هو البوابة الافتراضية لتلك VLAN.",
                  incorrectFeedback: "افحص صندوق «تذكّر» في الصفحة.",
                  explanation: "أجهزة VLAN 10 تضع عنوان الواجهة الفرعية بوابةً افتراضية لتخرج إلى الشبكات الأخرى.",
                },
              },
            },
          ],
        },
        // PDF 205 — Port Security — أمان المنفذ + GUIDED
        {
          id: "791381-m25-l01-p05",
          title: "Port Security — أمان المنفذ",
          order: 5,
          source: src(205, 205),
          keywords: ["switchport mode access", "switchport port-security maximum 2", "violation shutdown"],
          blocks: [
            {
              id: "m25-l01-p05-cli", type: "code", origin: "book", language: "cli",
              code: "Device(config)# switchport mode access\nDevice(config)# switchport port-security maximum 2\nDevice(config)# switchport port-security violation shutdown",
            },
            {
              id: "m25-l01-p05-cmds", type: "table", origin: "book",
              caption: "Cisco CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Device(config)# switchport mode access", "نجعله Access"],
                ["Device(config)# switchport port-security maximum 2", "عدد الأجهزة المسموح"],
                ["Device(config)# switchport port-security violation shutdown", "العقوبة عند المخالفة"],
              ],
            },
            {
              id: "m25-l01-p05-idea", type: "callout", origin: "book", kind: "tip", title: "الفكرة",
              spans: [T("نحدّد عدد الأجهزة المسموح لها بالاتصال بالمنفذ، ونحدّد العقوبة عند المخالفة.")],
            },
            {
              id: "m25-l01-p05-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("السطور الثلاثة تُكتب داخل المنفذ؛ لذلك يبدأ المثال الموجّه وأنت داخل "), L("f0/1"), T(". لاحظ أن الكتاب هنا لا يكتب "), L("switchport port-security"), T(" وحده — على الجهاز الحقيقي يُكتب أيضًا لتفعيل الحماية، كما رأيت في وحدة "), L("Port Security"), T(".")],
            },
            {
              id: "m25-l01-p05-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مثال موجّه: أمان المنفذ f0/1",
              description: "أنت داخل المنفذ f0/1. نفّذ سطور صندوق الكتاب بالترتيب. محاكاة تعليمية مبسّطة.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "المثال الموجّه: switchport mode access ثم switchport port-security maximum 2 ثم switchport port-security violation shutdown." },
              config: EX({
                kind: "guided",
                device: "switch",
                startMode: "interface",
                startInterface: "f0/1",
                intro: "أنت داخل المنفذ f0/1. نفّذ سطور صندوق الكتاب بالترتيب.",
                steps: [
                  { id: "s1", instruction: "اجعل المنفذ Access", expect: { command: "switchport-mode", args: { mode: "access" } }, hints: ["السطر الأول في صندوق الكتاب.", "الأمر يبدأ بـ switchport mode."] },
                  { id: "s2", instruction: "اسمح بجهازين على الأكثر", expect: { command: "port-security-maximum", args: { maximum: 2 } }, hints: ["السطر الثاني في صندوق الكتاب.", "الأمر يبدأ بـ switchport port-security maximum."] },
                  { id: "s3", instruction: "اجعل العقوبة إغلاق المنفذ", expect: { command: "port-security-violation", args: { action: "shutdown" } }, hints: ["السطر الأخير في صندوق الكتاب.", "الأمر يبدأ بـ switchport port-security violation."] },
                ],
                completion: "✓ أحسنت، نفّذت سطور أمان المنفذ كما في الكتاب.",
              }),
            },
            {
              id: "m25-l01-p05-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "كم جهازًا يسمح به صندوق الكتاب على المنفذ؟ (رقم)", answer: "2",
                feedback: {
                  hints: ["السطر الثاني في صندوق الكتاب.", "الرقم بعد maximum."],
                  correctFeedback: "صحيح — جهازان.",
                  incorrectFeedback: "افحص السطر: «switchport port-security maximum 2».",
                  explanation: "maximum يحدّد عدد الأجهزة المسموح لها بالاتصال بالمنفذ.",
                },
              },
            },
            {
              id: "m25-l01-p05-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما «العقوبة عند المخالفة» في صندوق الكتاب؟",
                options: [opt("m25-l01-p05-q2-a", "إغلاق المنفذ (shutdown)", true), opt("m25-l01-p05-q2-b", "تغيير رقم VLAN"), opt("m25-l01-p05-q2-c", "إعادة تشغيل السويتش")],
                feedback: {
                  hints: ["السطر الأخير في صندوق الكتاب.", "الكلمة الأخيرة في السطر."],
                  correctFeedback: "صحيح — violation shutdown.",
                  incorrectFeedback: "افحص الصف: «العقوبة عند المخالفة».",
                  explanation: "عند دخول جهاز غير مسموح يُغلق المنفذ.",
                },
              },
            },
          ],
        },
        // PDF 206 — أوامر الفحص المهمة + SHOW CHALLENGE + worksheet + module review
        {
          id: "791381-m25-l01-p06",
          title: "أوامر الفحص المهمة",
          order: 6,
          source: src(206, 206),
          keywords: ["show vlan brief", "show ip interface brief", "show running-config", "show port-security", "show ip route", "show ip dhcp pool"],
          blocks: [
            {
              id: "m25-l01-p06-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m25-l01-p06-c1", term: "VLAN / Interfaces / Config", text: [L("show vlan brief"), T(" · "), L("show ip interface brief"), T(" · "), L("show running-config")] },
                { id: "m25-l01-p06-c2", term: "Security / Routing / DHCP", text: [L("show port-security"), T(" · "), L("show ip route"), T(" · "), L("show ip dhcp pool")] },
              ],
            },
            {
              id: "m25-l01-p06-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("هذه الأوامر لا تغيّر الإعدادات، بل تساعدنا على الفحص والتأكد من صحة البرمجة.")],
            },
            {
              id: "m25-l01-p06-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("أوامر "), L("show"), T(" تُكتب من وضع الأوامر المتقدّم "), L("#"), T(" ولا تحتاج إلى وضع الإعداد. في المحاكي مخرجاتها مبسّطة ومكتوب عليها أنها محاكاة؛ "), L("show ip route"), T(" ستراه بالتفصيل في وحدة بروتوكولات التوجيه.")],
            },
            {
              id: "m25-l01-p06-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "تحدّي الفحص: أي أمر show؟",
              description: "أنت في وضع الأوامر المتقدّم لجهاز فيه إعدادات جاهزة. لكل سؤال اكتب أمر show المناسب. أوامر show لا تغيّر شيئًا. محاكاة تعليمية مبسّطة.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "التحدّي: show vlan brief، ثم show ip interface brief، ثم show running-config، ثم show port-security، ثم show ip route، ثم show ip dhcp pool." },
              config: EX({
                kind: "challenge",
                device: "switch",
                hostname: "Device",
                startMode: "privileged",
                preset: { vlans: { 10: { name: "Students" } }, interfaces: { "f0/1": { switchportMode: "access", accessVlan: 10, portSecurity: { enabled: true, maximum: 2, violation: "shutdown" } }, vlan1: { ipAddress: "192.168.1.2", subnetMask: "255.255.255.0", shutdown: false } } },
                intro: "أنت في وضع الأوامر المتقدّم. اعرض ما يُطلب منك بأمر show المناسب.",
                steps: [
                  { id: "c1", instruction: "اعرض قائمة VLAN ومنافذها", expect: { command: "show", args: { what: "vlan-brief" } }, hints: ["البطاقة الأولى، الأمر الأول.", "show vlan ثم brief."] },
                  { id: "c2", instruction: "اعرض المنافذ وعناوينها وحالتها باختصار", expect: { command: "show", args: { what: "ip-interface-brief" } }, hints: ["البطاقة الأولى، الأمر الثاني.", "show ip interface brief."] },
                  { id: "c3", instruction: "اعرض الإعدادات الجارية للجهاز", expect: { command: "show", args: { what: "running-config" } }, hints: ["البطاقة الأولى، الأمر الثالث.", "running = الجارية."] },
                  { id: "c4", instruction: "اعرض حالة أمان المنافذ", expect: { command: "show", args: { what: "port-security" } }, hints: ["البطاقة الثانية، الأمر الأول.", "show port-security."] },
                  { id: "c5", instruction: "اعرض جدول التوجيه", expect: { command: "show", args: { what: "ip-route" } }, hints: ["البطاقة الثانية، الأمر الثاني.", "show ip route."] },
                  { id: "c6", instruction: "اعرض مجموعات DHCP", expect: { command: "show", args: { what: "ip-dhcp-pool" } }, hints: ["البطاقة الثانية، الأمر الثالث.", "show ip dhcp pool."] },
                ],
                allowed: [],
                completion: "✓ صحيح في كل الأوامر — تعرف الآن أوامر الفحص الستة.",
              }),
            },
            {
              id: "m25-l01-p06-ws", type: "practice-table", origin: "teacher-enrichment", caption: "ورقة عمل: إلى أي مجموعة ينتمي كل أمر في بطاقتي الكتاب؟",
              headers: ["الأمر", "المجموعة"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["show vlan brief", GR("VLAN / Interfaces / Config")],
                ["show ip route", GR("Security / Routing / DHCP")],
                ["show running-config", GR("VLAN / Interfaces / Config")],
                ["show port-security", GR("Security / Routing / DHCP")],
                ["show ip dhcp pool", GR("Security / Routing / DHCP")],
                ["show ip interface brief", GR("VLAN / Interfaces / Config")],
              ],
            },
            {
              id: "m25-l01-p06-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "أوامر show تغيّر الإعدادات على الجهاز.", answer: false,
                feedback: {
                  hints: ["صندوق «تذكّر».", "ما وظيفة أوامر show: تغيير أم فحص؟"],
                  correctFeedback: "صحيح — لا تغيّر شيئًا، بل تفحص.",
                  incorrectFeedback: "افحص صندوق «تذكّر»: «لا تغيّر الإعدادات».",
                  explanation: "أوامر show للفحص والتأكد من صحة البرمجة فقط.",
                },
              },
            },
            { id: "m25-l01-p06-review", type: "heading", origin: "teacher-enrichment", text: "مراجعة الوحدة", level: 3 },
            {
              id: "m25-l01-p06-r1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي أمر يعطي الراوتر اسمه R1؟",
                options: [opt("m25-l01-p06-r1-a", "hostname R1", true), opt("m25-l01-p06-r1-b", "enable secret R1"), opt("m25-l01-p06-r1-c", "vlan R1")],
                feedback: {
                  hints: ["صفحة «الدخول والإعداد الأساسي».", "host + name."],
                  correctFeedback: "صحيح — hostname R1.",
                  incorrectFeedback: "افحص صندوق صفحة «الدخول والإعداد الأساسي».",
                  explanation: "enable secret لكلمة السر، و vlan يأخذ رقمًا لا اسم جهاز.",
                },
              },
            },
            {
              id: "m25-l01-p06-r2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "اكتب الأمر الذي يجعل المنفذ Trunk (الأمر كاملًا).", answer: "switchport mode trunk",
                feedback: {
                  hints: ["صفحة «VLAN و Trunk»، السطر الأخير.", "switchport mode ثم الوضع."],
                  correctFeedback: "صحيح — switchport mode trunk.",
                  incorrectFeedback: "افحص صندوق صفحة «VLAN و Trunk».",
                  explanation: "Trunk يسمح بمرور أكثر من VLAN بين السويتشات.",
                },
              },
            },
            {
              id: "m25-l01-p06-r3", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي أمر يُكتب داخل الواجهة الفرعية لربطها بـ VLAN 10؟",
                options: [opt("m25-l01-p06-r3-a", "encapsulation dot1Q 10", true), opt("m25-l01-p06-r3-b", "switchport access vlan 10"), opt("m25-l01-p06-r3-c", "vtp mode client")],
                feedback: {
                  hints: ["صفحة «Router on a Stick — Dot1Q».", "الكلمة dot1Q."],
                  correctFeedback: "صحيح — encapsulation dot1Q 10.",
                  incorrectFeedback: "افحص جدول صفحة «Router on a Stick — Dot1Q».",
                  explanation: "switchport access vlan للسويتش، و vtp mode لإعداد VTP.",
                },
              },
            },
          ],
        },
      ],
    },
  ],
};

export default m25;
