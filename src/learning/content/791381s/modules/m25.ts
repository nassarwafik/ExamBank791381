// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 25 «مرجع أوامر Cisco».
//
// Verbatim conversion of booklet PDF pages 76–79 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every converted block is origin:"book": nothing is added, removed or reworded. In the topic table a merged topic
// cell is written once, on the first row of its group (the following rows of the group carry an empty cell).
//
// Enrichment (docs/enterprise-791381s-enrichment-plan.md, Phase 6): teacher-enrichment blocks (a visual and CLI terminal
// simulations reused from course 791381 after checking their labels / commands against this section — each simulation types
// exactly the page's own commands, with `maximum 2` as printed in this section's table — and the end-of-unit «تدريبات الوحدة»
// lesson) are ADDED after the book blocks they explain. The book blocks stay verbatim — pinned by the book lock (bookLock.test.ts).

import type { ContentModule, ContentSource } from "../../types";
import type { CliExerciseConfig } from "../../../cli/types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };
const EX = (exercise: CliExerciseConfig): Record<string, unknown> => ({ ...exercise });

const m25: ContentModule = {
  id: "791381s-m25",
  title: "مرجع أوامر Cisco",
  order: 25,
  lessons: [
    {
      id: "791381s-m25-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m25-l00-p01",
          title: "مرجع أوامر Cisco",
          order: 1,
          layout: "opener",
          source: src(76),
          blocks: [
            {
              id: "m25-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الدفعة الخامسة + مراجعة · كتاب ص 192–206", unitNumber: "25", title: "مرجع أوامر Cisco",
              subtitle: "كل الأوامر المهمة في مكان واحد، مرتّبة حسب الموضوع.",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m25-l01",
      title: "مرجع أوامر Cisco",
      order: 1,
      pages: [
        {
          id: "791381s-m25-l01-p01",
          title: "أوامر أساسية للجهاز",
          order: 1,
          source: src(76, 77),
          blocks: [
            {
              id: "m25-l01-p01-def", type: "text", origin: "book",
              spans: [{ text: "أجهزة Cisco تُدار غالبًا من خلال CLI. المطلوب منك: معرفة وظيفة الأمر ومتى يُستخدم.", style: "strong" }],
            },
            {
              id: "m25-l01-p01-lead", type: "text", origin: "book",
              spans: [{ text: "في الصفحات التالية جمعنا الأوامر التي تعلّمناها. الأوامر قد تختلف قليلًا حسب نوع الجهاز والإصدار، لكن الفكرة نفسها. هذه الأوامر مهمة جدًا في أسئلة البرمجة والامتحانات العملية." }],
            },
            {
              id: "m25-l01-p01-intro", type: "text", origin: "book",
              spans: [{ text: "هذه أوامر البداية التي تتكرّر في أغلب التمارين العملية." }],
            },
            { id: "m25-l01-p01-cli-h", type: "heading", origin: "book", level: 4, text: "Cisco CLI", dir: "ltr" },
            {
              id: "m25-l01-p01-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: [
                "① Switch> enable",
                "② Switch# configure terminal",
                "③ Switch(config)# hostname SW1",
                "④ SW1(config)# banner motd #Authorized only#",
                "⑤ SW1(config)# interface g0/0",
                "⑥ SW1(config-if)# no shutdown",
              ].join("\n"),
            },
            {
              id: "m25-l01-p01-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m25-l01-p01-s1", text: [{ text: "الدخول إلى الوضع المتقدّم." }] },
                { id: "m25-l01-p01-s2", text: [{ text: "الدخول إلى وضع الإعدادات." }] },
                {
                  id: "m25-l01-p01-s3",
                  text: [{ text: "hostname", style: "strong" }, { text: ": يغيّر اسم الجهاز — لاحظ أن الموجّه أصبح SW1." }],
                },
                {
                  id: "m25-l01-p01-s4",
                  text: [{ text: "banner motd", style: "strong" }, { text: ": يضيف رسالة تظهر عند الدخول للجهاز (بين علامتي #)." }],
                },
                { id: "m25-l01-p01-s5", text: [{ text: "نختار منفذًا." }] },
                {
                  id: "m25-l01-p01-s6",
                  text: [{ text: "no shutdown", style: "strong" }, { text: ": يشغّل المنفذ." }],
                },
              ],
            },
            {
              id: "m25-l01-p01-sim-basics", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مثال موجّه: أوامر البداية على السويتش",
              description: "ابدأ من وضع المستخدم ونفّذ الأسطر الستة في صندوق الكتاب بالترتيب، ولاحظ تغيّر الموجّه. محاكاة تعليمية مبسّطة، ليست جهازًا حقيقيًا.",
              source: src(76, 77),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "enable ثم configure terminal ثم hostname SW1 ثم banner motd #Authorized only# ثم interface g0/0 ثم no shutdown." },
              config: EX({
                kind: "guided",
                device: "switch",
                intro: "أنت في وضع المستخدم (Switch>). نفّذ أسطر صندوق الكتاب بالترتيب.",
                steps: [
                  { id: "s1", instruction: "ادخل إلى الوضع المتقدّم", expect: { command: "enable" }, success: "✓ أحسنت، الموجّه الآن Switch#", hints: ["السطر ① في صندوق الكتاب.", "كلمة واحدة تبدأ بـ en."] },
                  { id: "s2", instruction: "ادخل إلى وضع الإعدادات", expect: { command: "configure-terminal" }, success: "✓ أحسنت، الموجّه الآن Switch(config)#", hints: ["السطر ② في صندوق الكتاب.", "كلمتان: configure ثم terminal."] },
                  { id: "s3", instruction: "غيّر اسم الجهاز إلى SW1", expect: { command: "hostname", args: { name: "SW1" } }, success: "✓ أحسنت — لاحظ أن الموجّه أصبح SW1", hints: ["السطر ③ في صندوق الكتاب.", "يبدأ بـ hostname ويليه الاسم."] },
                  { id: "s4", instruction: "أضف الرسالة Authorized only بين علامتي #", expect: { command: "banner-motd", args: { text: "Authorized only" } }, hints: ["السطر ④ في صندوق الكتاب.", "banner motd ثم #Authorized only#."] },
                  { id: "s5", instruction: "اختر المنفذ g0/0", expect: { command: "interface", args: { interfaces: ["g0/0"] } }, success: "✓ أحسنت، أنت الآن داخل المنفذ", hints: ["السطر ⑤ في صندوق الكتاب.", "يبدأ بـ interface ويليه اسم المنفذ."] },
                  { id: "s6", instruction: "شغّل المنفذ", expect: { command: "no-shutdown" }, hints: ["السطر ⑥ في صندوق الكتاب.", "كلمتان: no ثم shutdown."] },
                ],
                completion: "✓ أحسنت، نفّذت أوامر البداية الستة كما في الكتاب.",
              }),
            },
          ],
        },
        {
          id: "791381s-m25-l01-p02",
          title: "جدول الأوامر حسب الموضوع",
          order: 2,
          source: src(77, 78),
          blocks: [
            {
              id: "m25-l01-p02-table", type: "table", origin: "book",
              headers: ["الموضوع", "الأمر", "وظيفته"],
              rows: [
                ["VLAN و Trunk", "vlan 10", "ينشئ VLAN"],
                ["", "interface range f0/1-10", "يحدّد عدة منافذ"],
                ["", "switchport access vlan 10", "يربط المنافذ بـ VLAN"],
                ["", "switchport mode trunk", "يجعل المنفذ ناقلًا لعدة VLAN"],
                ["VTP", "vtp mode server", "يدير VLAN ويرسل التحديثات"],
                ["", "vtp mode client", "يستقبل التحديثات"],
                ["Router on a Stick", "interface g0/0.10", "Sub-Interface للتوجيه بين VLAN"],
                ["", "encapsulation dot1Q 10", "يحدّد رقم VLAN"],
                ["", "ip address 192.168.10.254 255.255.255.0", "Gateway لأجهزة هذه VLAN"],
                ["Port Security", "switchport port-security", "تشغيل الحماية"],
                ["", "switchport port-security maximum 2", "عدد الأجهزة المسموح"],
                ["", "switchport port-security violation shutdown", "العقوبة عند المخالفة"],
                ["كلمات المرور", "enable secret cisco123", "يحمي الوضع المتقدّم (مشفّرة)"],
                ["", "line console 0", "حماية الدخول المباشر"],
                ["", "line vty 0 4", "حماية الدخول عن بُعد"],
                ["", "service password-encryption", "تشفير كلمات المرور العادية"],
              ],
              columnDirs: ["rtl", "ltr", "rtl"],
            },
            {
              id: "m25-l01-p02-sim-portsec", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "تحدّي الأمر: صفوف Port Security في الجدول",
              description: "أنت داخل منفذ Access في وضع (config-if)#. لكل وظيفة من الجدول اكتب أمرها؛ المحاكي لا يكشف الإجابة. محاكاة تعليمية مبسّطة.",
              source: src(77, 78),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "التحدّي: switchport port-security ثم switchport port-security maximum 2 ثم switchport port-security violation shutdown." },
              config: EX({
                kind: "challenge",
                device: "switch",
                startMode: "interface",
                startInterface: "f0/1",
                preset: { interfaces: { "f0/1": { switchportMode: "access" } } },
                intro: "أنت داخل منفذ Access في وضع (config-if)#.",
                steps: [
                  { id: "c1", instruction: "تشغيل الحماية", expect: { command: "switchport-port-security" }, hints: ["أول صف في موضوع Port Security.", "switchport ثم port-security، بلا كلمات إضافية."] },
                  { id: "c2", instruction: "عدد الأجهزة المسموح: جهازان (كما في الجدول)", expect: { command: "port-security-maximum", args: { maximum: 2 } }, hints: ["الصف الثاني في موضوع Port Security.", "switchport port-security maximum ثم العدد."] },
                  { id: "c3", instruction: "العقوبة عند المخالفة: إغلاق المنفذ", expect: { command: "port-security-violation", args: { action: "shutdown" } }, hints: ["الصف الثالث في موضوع Port Security.", "switchport port-security violation ثم shutdown."] },
                ],
                allowed: ["switchport-port-security", "port-security-maximum", "port-security-violation"],
                completion: "✓ صحيح في كل الأوامر — هذه صفوف Port Security الثلاثة في جدول الأوامر.",
              }),
            },
            {
              id: "m25-l01-p02-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [
                { text: "Access", style: "strong" },
                { text: " للأجهزة النهائية · " },
                { text: "Trunk", style: "strong" },
                { text: " بين أجهزة الشبكة · وفي VTP يجب أن يكون " },
                { text: "Domain", style: "strong" },
                { text: " متطابقًا بين الأجهزة." },
              ],
            },
          ],
        },
        {
          id: "791381s-m25-l01-p03",
          title: "أوامر الفحص المهمة (show)",
          order: 3,
          source: src(78),
          blocks: [
            {
              id: "m25-l01-p03-intro", type: "text", origin: "book",
              spans: [
                { text: "أوامر show " },
                { text: "للفحص فقط", style: "strong" },
                { text: " ولا تغيّر الإعدادات. تساعدنا على التأكّد من صحة البرمجة. تُكتب في الوضع المتقدّم (#)." },
              ],
            },
            {
              id: "m25-l01-p03-table", type: "table", origin: "book",
              headers: ["الأمر", "ماذا يعرض؟"],
              rows: [
                ["show vlan brief", "قائمة VLAN والمنافذ التابعة لكل واحدة."],
                ["show ip interface brief", "المنافذ وعناوين IP وهل هي تعمل."],
                ["show mac-address-table", "جدول عناوين MAC في السويتش."],
                ["show vtp status", "حالة VTP: الوضع (Server/Client) والـ Domain."],
                ["show interfaces", "تفاصيل كاملة عن المنافذ."],
                ["show running-config", "الإعدادات الحالية."],
                ["show startup-config", "الإعدادات المحفوظة."],
                ["show port-security", "حالة حماية المنافذ."],
                ["show port-security interface f0/1", "حالة الحماية في منفذ واحد."],
                ["show arp", "جدول IP و MAC في الراوتر."],
                ["show cdp neighbors", "أجهزة Cisco المجاورة المتصلة مباشرة."],
                ["show ip route", "جدول التوجيه في الراوتر."],
                ["show ip dhcp pool", "مجموعات توزيع DHCP."],
              ],
              columnDirs: ["ltr", "rtl"],
            },
          ],
        },
        {
          id: "791381s-m25-l01-p04",
          title: "لمحة عن الوحدة القادمة: OSPF و EIGRP و ACL",
          order: 4,
          source: src(79),
          blocks: [
            {
              id: "m25-l01-p04-intro", type: "text", origin: "book",
              spans: [{ text: "هذه مواضيع الدفعة التالية، وسيتم شرحها بالتفصيل لاحقًا. الآن يكفي أن تعرف الفكرة:" }],
            },
            {
              id: "m25-l01-p04-table", type: "table", origin: "book",
              headers: ["الكلمة", "الفكرة"],
              rows: [
                ["OSPF و EIGRP", "بروتوكولات توجيه: تساعد الراوترات على إيجاد الطريق بين الشبكات."],
                ["ACL", "قوائم تتحكّم بالسماح أو المنع لمرور البيانات."],
                ["show access-lists", "يفحص قوائم ACL."],
              ],
            },
          ],
        },
      ],
    },
    {
      // «تدريبات الوحدة» — ADDED enrichment: an end-of-unit exercise page after the booklet's own pages. Every question is
      // answered by the section's printed text above (the explanation quotes it). The book pages are unchanged (book lock).
      id: "791381s-m25-l02",
      title: "تدريبات الوحدة",
      order: 2,
      pages: [
        {
          id: "791381s-m25-l02-p01",
          title: "تدريبات الوحدة: مرجع أوامر Cisco",
          order: 1,
          layout: "practice",
          source: src(76, 79),
          blocks: [
            {
              id: "m25-l02-p01-q01", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "ordering", prompt: "رتّب أوامر البداية كما في صندوق الكتاب:",
                items: [
                  { id: "host", text: "hostname SW1" },
                  { id: "if", text: "interface g0/0" },
                  { id: "en", text: "enable" },
                  { id: "noshut", text: "no shutdown" },
                  { id: "conf", text: "configure terminal" },
                ],
                order: ["en", "conf", "host", "if", "noshut"],
                feedback: { explanation: "الدخول إلى الوضع المتقدّم (enable)، ثم الدخول إلى وضع الإعدادات (configure terminal)، ثم hostname يغيّر اسم الجهاز، ثم نختار منفذًا (interface g0/0)، ثم no shutdown يشغّل المنفذ." },
              },
            },
            {
              id: "m25-l02-p01-q02", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ماذا يفعل الأمر banner motd #Authorized only#؟",
                options: [{ id: "a", text: "يغيّر اسم الجهاز" }, { id: "b", text: "يضيف رسالة تظهر عند الدخول للجهاز", correct: true }, { id: "c", text: "يشغّل المنفذ" }, { id: "d", text: "يحفظ الإعدادات" }],
                feedback: { explanation: "banner motd: يضيف رسالة تظهر عند الدخول للجهاز (بين علامتي #)." },
              },
            },
            {
              id: "m25-l02-p01-q03", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "بعد الأمر Switch(config)# hostname SW1، كيف يصبح الموجّه؟",
                options: [{ id: "a", text: "Switch(config)#" }, { id: "b", text: "SW1>" }, { id: "c", text: "Switch#" }, { id: "d", text: "SW1(config)#", correct: true }],
                feedback: { explanation: "hostname: يغيّر اسم الجهاز — لاحظ أن الموجّه أصبح SW1، فالسطر التالي في الصندوق يبدأ بـ SW1(config)#." },
              },
            },
            {
              id: "m25-l02-p01-q04", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "classify", prompt: "صنّف كل أمر إلى موضوعه في جدول الأوامر:",
                groups: [
                  { id: "vlan", text: "VLAN و Trunk" },
                  { id: "vtp", text: "VTP" },
                  { id: "ros", text: "Router on a Stick" },
                  { id: "ps", text: "Port Security" },
                  { id: "pw", text: "كلمات المرور" },
                ],
                items: [
                  { id: "i1", text: "vtp mode client" },
                  { id: "i2", text: "encapsulation dot1Q 10" },
                  { id: "i3", text: "switchport access vlan 10" },
                  { id: "i4", text: "switchport port-security maximum 2" },
                  { id: "i5", text: "line vty 0 4" },
                  { id: "i6", text: "interface g0/0.10" },
                ],
                assign: { i1: "vtp", i2: "ros", i3: "vlan", i4: "ps", i5: "pw", i6: "ros" },
                feedback: { explanation: "في جدول الأوامر: switchport access vlan 10 في VLAN و Trunk · vtp mode client في VTP · interface g0/0.10 و encapsulation dot1Q 10 في Router on a Stick · switchport port-security maximum 2 في Port Security · line vty 0 4 في كلمات المرور." },
              },
            },
            {
              id: "m25-l02-p01-q05", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "matching", prompt: "صِل كل أمر بوظيفته كما في جدول الأوامر:",
                left: [
                  { id: "server", text: "vtp mode server" },
                  { id: "client", text: "vtp mode client" },
                  { id: "range", text: "interface range f0/1-10" },
                  { id: "enc", text: "service password-encryption" },
                ],
                right: [
                  { id: "r1", text: "يحدّد عدة منافذ" },
                  { id: "r2", text: "يستقبل التحديثات" },
                  { id: "r3", text: "تشفير كلمات المرور العادية" },
                  { id: "r4", text: "يدير VLAN ويرسل التحديثات" },
                ],
                pairs: { server: "r4", client: "r2", range: "r1", enc: "r3" },
                feedback: { explanation: "vtp mode server: يدير VLAN ويرسل التحديثات · vtp mode client: يستقبل التحديثات · interface range f0/1-10: يحدّد عدة منافذ · service password-encryption: تشفير كلمات المرور العادية." },
              },
            },
            {
              id: "m25-l02-p01-q06", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "في VTP يجب أن يكون Domain متطابقًا بين الأجهزة.", answer: true, feedback: { explanation: "تذكّر: Access للأجهزة النهائية · Trunk بين أجهزة الشبكة · وفي VTP يجب أن يكون Domain متطابقًا بين الأجهزة." } },
            },
            {
              id: "m25-l02-p01-q07", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "منفذ Trunk للأجهزة النهائية، ومنفذ Access بين أجهزة الشبكة.", answer: false, feedback: { explanation: "العكس: Access للأجهزة النهائية، و Trunk بين أجهزة الشبكة (switchport mode trunk يجعل المنفذ ناقلًا لعدة VLAN)." } },
            },
            {
              id: "m25-l02-p01-q08", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "matching", prompt: "صِل كل حاجة فحص بأمر show المناسب:",
                left: [
                  { id: "vlan", text: "قائمة VLAN والمنافذ التابعة لكل واحدة" },
                  { id: "route", text: "جدول التوجيه في الراوتر" },
                  { id: "mac", text: "جدول عناوين MAC في السويتش" },
                  { id: "cdp", text: "أجهزة Cisco المجاورة المتصلة مباشرة" },
                ],
                right: [
                  { id: "r1", text: "show cdp neighbors" },
                  { id: "r2", text: "show vlan brief" },
                  { id: "r3", text: "show ip route" },
                  { id: "r4", text: "show mac-address-table" },
                ],
                pairs: { vlan: "r2", route: "r3", mac: "r4", cdp: "r1" },
                feedback: { explanation: "show vlan brief: قائمة VLAN والمنافذ التابعة لكل واحدة · show ip route: جدول التوجيه في الراوتر · show mac-address-table: جدول عناوين MAC في السويتش · show cdp neighbors: أجهزة Cisco المجاورة المتصلة مباشرة." },
              },
            },
            {
              id: "m25-l02-p01-q09", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "أوامر show تغيّر إعدادات الجهاز.", answer: false, feedback: { explanation: "أوامر show للفحص فقط ولا تغيّر الإعدادات. تساعدنا على التأكّد من صحة البرمجة، وتُكتب في الوضع المتقدّم (#)." } },
            },
            {
              id: "m25-l02-p01-q10", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "أي أمر يعرض مجموعات توزيع DHCP؟",
                options: [{ id: "a", text: "show ip route" }, { id: "b", text: "show arp" }, { id: "c", text: "show ip dhcp pool", correct: true }, { id: "d", text: "show vtp status" }],
                feedback: { explanation: "show ip dhcp pool: مجموعات توزيع DHCP." },
              },
            },
            {
              id: "m25-l02-p01-q11", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ما هي ACL؟",
                options: [{ id: "a", text: "قوائم تتحكّم بالسماح أو المنع لمرور البيانات", correct: true }, { id: "b", text: "بروتوكول توجيه بين الراوترات" }, { id: "c", text: "أمر يغيّر اسم الجهاز" }, { id: "d", text: "جدول عناوين MAC في السويتش" }],
                feedback: { explanation: "ACL: قوائم تتحكّم بالسماح أو المنع لمرور البيانات، والأمر show access-lists يفحص قوائم ACL." },
              },
            },
            {
              id: "m25-l02-p01-q12", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ما هما OSPF و EIGRP؟",
                options: [{ id: "a", text: "أمرا فحص show" }, { id: "b", text: "بروتوكولات توجيه تساعد الراوترات على إيجاد الطريق بين الشبكات", correct: true }, { id: "c", text: "قوائم للسماح أو المنع" }, { id: "d", text: "وضعان من أوضاع VTP" }],
                feedback: { explanation: "OSPF و EIGRP: بروتوكولات توجيه تساعد الراوترات على إيجاد الطريق بين الشبكات." },
              },
            },
            { id: "m25-l02-p01-lib-t21", type: "library-training", origin: "teacher-enrichment", trainingId: "T21", label: "تدريب 21", requiredModuleId: "791381s-m25" },
          ],
        },
      ],
    },
  ],
};

export default m25;
