// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 19 «Trunk و Router on a Stick».
//
// Verbatim conversion of booklet PDF pages 54–58 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every converted block is origin:"book": nothing is added, removed or reworded; bold runs are `strong`, monospace
// runs are `code`, printed box labels are the callout titles. The Trunk and Router-on-a-Stick drawings are crops of the
// booklet itself.
//
// Enrichment (docs/enterprise-791381s-enrichment-plan.md, Phase 5; the network lab: Phase 8B-2): teacher-enrichment blocks (visuals and CLI terminal
// simulations reused from course 791381 after checking their labels / commands against this section, and the end-of-unit
// «تدريبات الوحدة» lesson) are ADDED after the book blocks they explain. The book blocks stay verbatim — pinned by the book
// lock (bookLock.test.ts).

import type { ContentModule, ContentSource } from "../../types";
import type { CliExerciseConfig } from "../../../cli/types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };
const EX = (exercise: CliExerciseConfig): Record<string, unknown> => ({ ...exercise });

const m19: ContentModule = {
  id: "791381s-m19",
  title: "Trunk و Router on a Stick",
  order: 19,
  lessons: [
    {
      id: "791381s-m19-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m19-l00-p01",
          title: "Trunk و Router on a Stick",
          order: 1,
          layout: "opener",
          source: src(54),
          blocks: [
            {
              id: "m19-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الدفعة الرابعة · كتاب ص 145–156", unitNumber: "19", title: "Trunk و Router on a Stick",
              subtitle: "كيف ننقل عدة VLAN في كابل واحد؟ وكيف تتواصل VLAN مختلفة مع بعضها؟",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m19-l01",
      title: "Trunk و Router on a Stick",
      order: 1,
      pages: [
        {
          id: "791381s-m19-l01-p01",
          title: "ما هو Trunk؟",
          order: 1,
          source: src(54),
          blocks: [
            {
              id: "m19-l01-p01-def", type: "text", origin: "book",
              spans: [{ text: "Trunk هو رابط ينقل عدة VLAN عبر نفس الكابل.", style: "strong" }],
            },
            {
              id: "m19-l01-p01-intro", type: "text", origin: "book",
              spans: [{ text: "بدون Trunk نحتاج كابلًا منفصلًا لكل VLAN بين السويتشات! مع Trunk يكفي كابل واحد، وكل حزمة تحمل Tag حتى نعرف لأي VLAN تنتمي." }],
            },
            {
              id: "m19-l01-p01-drawing", type: "diagram", origin: "book",
              src: "/learning-assets/791381s/0f0bef0d5c1e9e49.png",
              alt: "مربعان «Switch 1» و«Switch 2» يصل بينهما كابل عريض فيه ثلاثة خطوط (متصل، ومتقطع، ومنقّط)، وفوقه عبارة «كابل واحد Trunk»، وتحته مفتاح الخطوط: «VLAN 10━» و«VLAN 20╍» و«VLAN 30┈».",
              caption: "كل حزمة تحمل Tag يدلّ على VLAN التي تنتمي إليها",
            },
            {
              id: "m19-l01-p01-v-trunk", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m04/trunk-multi-vlan", motion: true,
              source: src(54),
              title: "رسم متحرّك: Trunk — كابل واحد يحمل عدة VLAN",
              alt: "رسم متحرّك: كابل Trunk واحد بين Switch 1 و Switch 2 تمرّ عليه ثلاث حزم مكتوب عليها Tag 10 و Tag 20 و Tag 30؛ وتحته عبارة «بدون Trunk: كابل منفصل لكل VLAN» مع ثلاثة خطوط منفصلة.",
              caption: "مع Trunk يكفي كابل واحد، وكل حزمة تحمل Tag حتى نعرف لأي VLAN تنتمي.",
            },
            {
              id: "m19-l01-p01-points", type: "list", origin: "book", variant: "plain",
              items: [
                {
                  id: "m19-l01-p01-t1",
                  text: [
                    { text: "يُستخدم غالبًا " },
                    { text: "بين سويتش وسويتش", style: "strong" },
                    { text: "، أو " },
                    { text: "بين سويتش وراوتر", style: "strong" },
                    { text: "." },
                  ],
                },
                { id: "m19-l01-p01-t2", text: [{ text: "الحزم تحمل Tag حتى نعرف لأي VLAN تنتمي." }] },
              ],
            },
            {
              id: "m19-l01-p01-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [
                { text: "Access", style: "strong" },
                { text: " لجهاز واحد.   " },
                { text: "Trunk", style: "strong" },
                { text: " لنقل عدة VLAN عبر كابل واحد." },
              ],
            },
          ],
        },
        {
          id: "791381s-m19-l01-p02",
          title: "منافذ الربط بين السويتشات",
          order: 2,
          source: src(54, 55),
          blocks: [
            {
              id: "m19-l01-p02-intro", type: "text", origin: "book",
              spans: [{ text: "في مثال الكتاب توجد 6 سويتشات متصلة ببعضها. المنافذ التي تربط سويتشًا بسويتش آخر تكون Trunk." }],
            },
            {
              id: "m19-l01-p02-table", type: "table", origin: "book",
              headers: ["السويتش", "المنافذ التي ستكون Trunk"],
              columnDirs: ["rtl", "ltr"],
              rows: [
                ["Sw1-HFA", "F0/23 , F0/24"],
                ["Sw2-HFA", "F0/22 , F0/23 , F0/24"],
                ["Sw3-HFA", "F0/22 , F0/23 , F0/24"],
                ["Sw4-HFA", "F0/23 , F0/24"],
                ["Sw5-HFA", "F0/22 , F0/23 , F0/24"],
                ["Sw6-HFA", "F0/22 , F0/23 , F0/24 , G0/0"],
              ],
            },
            {
              id: "m19-l01-p02-v-ports", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m04/inter-switch-trunk-ports", motion: false,
              source: src(54, 55),
              title: "مخطط: المنافذ التي ستكون Trunk في كل سويتش",
              alt: "مخطط فيه ستة سويتشات Sw1-HFA حتى Sw6-HFA، وتحت كل سويتش منافذه التي ستكون Trunk كما في الجدول؛ و Sw6-HFA وحده فيه المنفذ G0/0.",
              caption: "المنافذ بين السويتشات تكون Trunk، وفي Sw6 المنفذ G0/0 يربطه بالراوتر.",
            },
            {
              id: "m19-l01-p02-rule", type: "callout", origin: "book", kind: "summary", title: "قاعدة",
              spans: [
                { text: "المنافذ بين السويتشات تكون غالبًا " },
                { text: "Trunk", style: "strong" },
                { text: " لتمرير عدة VLAN عبرها. وفي Sw6 المنفذ G0/0 يربطه بالراوتر." },
              ],
            },
          ],
        },
        {
          id: "791381s-m19-l01-p03",
          title: "أوامر Trunk على السويتشات",
          order: 3,
          source: src(55),
          blocks: [
            { id: "m19-l01-p03-cli-h", type: "heading", origin: "book", level: 4, text: "Switch CLI · Sw1 و Sw2", dir: "ltr" },
            {
              id: "m19-l01-p03-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: "① Switch(config)# interface range f0/23-24\n② Switch(config-if-range)# switchport mode trunk",
            },
            {
              id: "m19-l01-p03-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m19-l01-p03-s1", text: [{ text: "نختار المنفذين F0/23 و F0/24 معًا." }] },
                { id: "m19-l01-p03-s2", text: [{ text: "نحوّلهما إلى Trunk." }] },
              ],
            },
            {
              id: "m19-l01-p03-sim-trunk", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مثال موجّه: تحويل المنفذين F0/23 و F0/24 إلى Trunk",
              description: "أنت في وضع الإعداد العام على Sw1. اكتب أمرَي صندوق الكتاب بالترتيب. في هذا المحاكي المبسّط يظهر الموجّه (config-if)# بدل (config-if-range)#. محاكاة تعليمية، ليست جهازًا حقيقيًا.",
              source: src(55),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "على Sw1 و Sw2: interface range f0/23-24 ثم switchport mode trunk." },
              config: EX({
                kind: "guided",
                device: "switch",
                startMode: "global",
                intro: "اختر المنفذين F0/23 و F0/24 معًا، ثم حوّلهما إلى Trunk.",
                steps: [
                  { id: "s1", instruction: "اختر المنفذين F0/23 و F0/24 معًا بأمر واحد", expect: { command: "interface", args: { interfaces: ["f0/23", "f0/24"] } }, success: "✓ أحسنت، اخترت المنفذين معًا", hints: ["السطر ① في صندوق الكتاب؛ الكلمة range تعني مدى.", "interface range ثم f0/23-24."] },
                  { id: "s2", instruction: "حوّل المنفذين إلى Trunk", expect: { command: "switchport-mode", args: { mode: "trunk" } }, success: "✓ أحسنت، المنفذان الآن Trunk", hints: ["السطر ② في صندوق الكتاب.", "switchport mode ثم نوع المنفذ."] },
                ],
                allowed: ["switchport-mode"],
                completion: "✓ أحسنت — وتذكّر: المنفذ المقابل في السويتش الآخر يجب أن يكون Trunk أيضًا.",
              }),
            },
            {
              id: "m19-l01-p03-points", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m19-l01-p03-t1", text: [{ text: "نكتب الأوامر على " }, { text: "كل سويتش", style: "strong" }, { text: " في منافذ الربط بين السويتشات." }] },
                { id: "m19-l01-p03-t2", text: [{ text: "مهم أن يكون " }, { text: "المنفذ المقابل", style: "strong" }, { text: " في السويتش الآخر Trunk أيضًا." }] },
              ],
            },
            {
              id: "m19-l01-p03-rule", type: "callout", origin: "book", kind: "summary", title: "قاعدة",
              spans: [
                { text: "إذا كان أحد الطرفين Trunk والآخر ليس Trunk، " },
                { text: "لن تمرّ VLAN", style: "strong" },
                { text: " بينهما. يجب أن يكون الإعداد متّفقًا من الجهتين." },
              ],
            },
          ],
        },
        {
          id: "791381s-m19-l01-p04",
          title: "ما هو Dot1Q؟",
          order: 4,
          source: src(56),
          blocks: [
            {
              id: "m19-l01-p04-def", type: "text", origin: "book",
              spans: [{ text: "Dot1Q (واسمه الرسمي 802.1Q) هو المعيار الذي يضع الـ Tag على الحزمة.", style: "strong" }],
            },
            {
              id: "m19-l01-p04-intro", type: "text", origin: "book",
              spans: [{ text: "Dot1Q هو «الطريقة المتّفق عليها» لكتابة رقم VLAN داخل الحزمة، حتى تفهمه كل الأجهزة." }],
            },
            {
              id: "m19-l01-p04-points", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m19-l01-p04-t1", text: [{ text: "الـ Tag يحمل رقم VLAN." }] },
                { id: "m19-l01-p04-t2", text: [{ text: "يسمح بتمييز عدة VLAN على نفس رابط Trunk." }] },
                { id: "m19-l01-p04-t3", text: [{ text: "يُستخدم في Trunk بين السويتشات، وبين السويتش والراوتر." }] },
              ],
            },
            {
              id: "m19-l01-p04-v-tag", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m04/dot1q-tag-frame", motion: true,
              source: src(56),
              title: "رسم متحرّك: Dot1Q يضع Tag يحمل رقم VLAN",
              alt: "رسم متحرّك لحزمة فيها حقلان MAC و Data، يظهر بينهما حقل جديد مكتوب فيه «Tag: VLAN 10».",
              caption: "الـ Tag يحمل رقم VLAN، ويسمح بتمييز عدة VLAN على نفس رابط Trunk.",
            },
            { id: "m19-l01-p04-cli-h", type: "heading", origin: "book", level: 4, text: "Switch CLI", dir: "ltr" },
            {
              id: "m19-l01-p04-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: "① Switch(config)# interface g0/1\n② Switch(config-if)# switchport mode trunk\n③ Switch(config-if)# switchport trunk allowed vlan 10,20,30",
            },
            {
              id: "m19-l01-p04-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m19-l01-p04-s1", text: [{ text: "نختار المنفذ GigabitEthernet 0/1." }] },
                { id: "m19-l01-p04-s2", text: [{ text: "نجعله Trunk." }] },
                { id: "m19-l01-p04-s3", text: [{ text: "نسمح بمرور VLAN 10 و 20 و 30 فقط." }] },
              ],
            },
            {
              id: "m19-l01-p04-sim-allowed", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "تحدّي الأمر: Trunk على g0/1 يسمح بـ VLAN 10 و 20 و 30 فقط",
              description: "أنت في وضع الإعداد العام لسويتش. اكتب الأمر المطلوب في كل سؤال بالترتيب؛ المحاكي لا يكشف الإجابة. محاكاة تعليمية مبسّطة.",
              source: src(56),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "التحدّي: interface g0/1 ثم switchport mode trunk ثم switchport trunk allowed vlan 10,20,30." },
              config: EX({
                kind: "challenge",
                device: "switch",
                startMode: "global",
                intro: "أنت في وضع الإعداد العام لسويتش.",
                steps: [
                  { id: "c1", instruction: "اختر المنفذ GigabitEthernet 0/1", expect: { command: "interface", args: { interfaces: ["g0/1"] } }, hints: ["السطر ① في صندوق الكتاب.", "interface ثم اسم المنفذ المختصر g0/1."] },
                  { id: "c2", instruction: "اجعل هذا المنفذ Trunk", expect: { command: "switchport-mode", args: { mode: "trunk" } }, hints: ["السطر ② في صندوق الكتاب.", "switchport mode ثم نوع المنفذ."] },
                  { id: "c3", instruction: "اسمح بمرور VLAN 10 و 20 و 30 فقط", expect: { command: "switchport-trunk-allowed-vlan", args: { vlans: [10, 20, 30] } }, hints: ["السطر ③ في صندوق الكتاب.", "switchport trunk allowed vlan ثم 10,20,30."] },
                ],
                allowed: ["switchport-mode", "switchport-trunk-allowed-vlan"],
                completion: "✓ صحيح في كل الأوامر — g0/1 الآن Trunk يمرّ عليه VLAN 10 و 20 و 30 فقط.",
              }),
            },
            {
              id: "m19-l01-p04-note", type: "callout", origin: "book", kind: "summary", title: "ملاحظة",
              spans: [{ text: "أجهزة Cisco الحديثة تستخدم Dot1Q تلقائيًا على السويتش بدون أمر إضافي." }],
            },
          ],
        },
        {
          id: "791381s-m19-l01-p05",
          title: "Router on a Stick",
          order: 5,
          source: src(56, 57),
          blocks: [
            {
              id: "m19-l01-p05-def", type: "text", origin: "book",
              spans: [{ text: "راوتر واحد، متصل بكابل Trunk واحد، يوجّه البيانات بين VLAN مختلفة.", style: "strong" }],
            },
            {
              id: "m19-l01-p05-intro", type: "text", origin: "book",
              spans: [
                { text: "السويتش العادي يعمل في الطبقة الثانية (Layer 2)، لذلك الأجهزة في VLAN مختلفة " },
                { text: "لا تتواصل مباشرة", style: "strong" },
                { text: ". الحل: نوصل راوترًا بكابل Trunk واحد، ونقسم منفذه إلى «منافذ فرعية»، واحد لكل VLAN. اسم هذه الفكرة: " },
                { text: "Inter-VLAN Routing", style: "strong" },
                { text: "." },
              ],
            },
            {
              id: "m19-l01-p05-drawing", type: "diagram", origin: "book",
              src: "/learning-assets/791381s/1be4e7c0b196198d.png",
              alt: "شكل بيضوي «Router» يتصل بخط عريض بمربع «Switch»، وبجانب الخط من جهة «g0/0.10» و«g0/0.20» ومن الجهة الأخرى «Trunk» و«كابل واحد»؛ ويخرج من «Switch» خطان إلى إطارين متقطعين في كل منهما حاسوبان: الأول مكتوب فيه «VLAN 10» والثاني «VLAN 20».",
            },
            {
              id: "m19-l01-p05-v-ros", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m04/router-on-a-stick", motion: false,
              source: src(56, 57),
              title: "مخطط: Router on a Stick",
              alt: "مخطط: Router في الأعلى بجانبه g0/0.10 و g0/0.20، يتصل بكابل Trunk واحد بسويتش، ويخرج من السويتش خطان إلى مجموعتين في كل منهما حاسوبان: VLAN 10 و VLAN 20.",
              caption: "راوتر واحد، متصل بكابل Trunk واحد، ومنفذ فرعي لكل VLAN — Inter-VLAN Routing.",
            },
            {
              id: "m19-l01-p05-points", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m19-l01-p05-t1", text: [{ text: "نستخدم " }, { text: "راوترًا واحدًا", style: "strong" }, { text: " للتوجيه بين VLAN." }] },
                { id: "m19-l01-p05-t2", text: [{ text: "نُنشئ " }, { text: "Sub-Interface", style: "strong" }, { text: " (منفذ فرعي) لكل VLAN على نفس المنفذ." }] },
                {
                  id: "m19-l01-p05-t3",
                  text: [
                    { text: "المنفذ في Sw6 المتصل بالراوتر يجب أن يكون " },
                    { text: "Trunk", style: "strong" },
                    { text: "، لأن الراوتر لا يعرف VLAN إلا إذا وصلته الحزم عبر Trunk." },
                  ],
                },
              ],
            },
          ],
        },
        {
          id: "791381s-m19-l01-p06",
          title: "أوامر الراوتر: VLAN 10 و VLAN 20",
          order: 6,
          source: src(57, 58),
          blocks: [
            {
              id: "m19-l01-p06-intro", type: "text", origin: "book",
              spans: [
                { text: "لكل VLAN نكتب 3 أوامر على الراوتر: نُنشئ المنفذ الفرعي، نربطه برقم VLAN، ثم نعطيه عنوان IP الذي سيكون " },
                { text: "Gateway", style: "strong" },
                { text: " لأجهزة هذه VLAN." },
              ],
            },
            { id: "m19-l01-p06-cli-h", type: "heading", origin: "book", level: 4, text: "Router CLI", dir: "ltr" },
            {
              id: "m19-l01-p06-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: "① Router(config)# interface g0/0.10\n② Router(config-subif)# encapsulation dot1Q 10\n③ Router(config-subif)# ip address 192.168.10.254 255.255.255.0\n④ Router(config-subif)# interface g0/0.20\n⑤ Router(config-subif)# encapsulation dot1Q 20\n⑥ Router(config-subif)# ip address 192.168.20.254 255.255.255.0",
            },
            {
              id: "m19-l01-p06-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m19-l01-p06-s1", text: [{ text: "يُنشئ منفذًا فرعيًا لـ VLAN 10. الرقم بعد النقطة (.10) نختاره عادة مثل رقم VLAN حتى نتذكّر." }] },
                { id: "m19-l01-p06-s2", text: [{ text: "encapsulation dot1Q 10", style: "strong" }, { text: ": يربط المنفذ الفرعي بـ VLAN 10 (يقرأ الحزم التي عليها Tag رقم 10)." }] },
                { id: "m19-l01-p06-s3", text: [{ text: "عنوان Gateway لأجهزة VLAN 10." }] },
                { id: "m19-l01-p06-s4", text: [{ text: "يُنشئ منفذًا فرعيًا لـ VLAN 20." }] },
                { id: "m19-l01-p06-s5", text: [{ text: "يربطه بـ VLAN 20." }] },
                { id: "m19-l01-p06-s6", text: [{ text: "عنوان Gateway لأجهزة VLAN 20." }] },
              ],
            },
            {
              id: "m19-l01-p06-sim-subif", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مثال موجّه: منفذان فرعيان لـ VLAN 10 و VLAN 20",
              description: "أنت في وضع الإعداد العام للراوتر. اكتب الأوامر الستة في صندوق الكتاب بالترتيب: 3 أوامر لكل VLAN. محاكاة تعليمية مبسّطة، ليست جهازًا حقيقيًا.",
              source: src(57, 58),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "interface g0/0.10 ثم encapsulation dot1Q 10 ثم ip address 192.168.10.254 255.255.255.0، ثم interface g0/0.20 ثم encapsulation dot1Q 20 ثم ip address 192.168.20.254 255.255.255.0." },
              config: EX({
                kind: "guided",
                device: "router",
                startMode: "global",
                intro: "لكل VLAN: نُنشئ المنفذ الفرعي، نربطه برقم VLAN، ثم نعطيه عنوان Gateway.",
                steps: [
                  { id: "s1", instruction: "أنشئ منفذًا فرعيًا لـ VLAN 10: g0/0.10", expect: { command: "interface", args: { interfaces: ["g0/0.10"], sub: true } }, success: "✓ أحسنت، أنت الآن داخل المنفذ الفرعي g0/0.10", hints: ["السطر ① في صندوق الكتاب.", "interface ثم g0/0.10."] },
                  { id: "s2", instruction: "اربط المنفذ الفرعي بـ VLAN 10", expect: { command: "encapsulation-dot1q", args: { vlanId: 10 } }, success: "✓ أحسنت، المنفذ الفرعي يقرأ الحزم التي عليها Tag رقم 10", hints: ["السطر ② في صندوق الكتاب.", "encapsulation dot1Q ثم رقم VLAN."] },
                  { id: "s3", instruction: "أعطه عنوان Gateway لأجهزة VLAN 10: ‏192.168.10.254 بقناع 255.255.255.0", expect: { command: "ip-address", args: { address: "192.168.10.254", mask: "255.255.255.0" } }, hints: ["السطر ③ في صندوق الكتاب.", "ip address ثم العنوان ثم القناع."] },
                  { id: "s4", instruction: "أنشئ منفذًا فرعيًا لـ VLAN 20: g0/0.20", expect: { command: "interface", args: { interfaces: ["g0/0.20"], sub: true } }, success: "✓ أحسنت، أنت الآن داخل المنفذ الفرعي g0/0.20", hints: ["السطر ④ في صندوق الكتاب.", "interface ثم g0/0.20."] },
                  { id: "s5", instruction: "اربطه بـ VLAN 20", expect: { command: "encapsulation-dot1q", args: { vlanId: 20 } }, hints: ["السطر ⑤ في صندوق الكتاب.", "encapsulation dot1Q ثم 20."] },
                  { id: "s6", instruction: "أعطه عنوان Gateway لأجهزة VLAN 20: ‏192.168.20.254 بقناع 255.255.255.0", expect: { command: "ip-address", args: { address: "192.168.20.254", mask: "255.255.255.0" } }, hints: ["السطر ⑥ في صندوق الكتاب.", "ip address ثم العنوان ثم القناع."] },
                ],
                allowed: ["encapsulation-dot1q", "ip-address"],
                completion: "✓ أحسنت — المنفذان الفرعيان جاهزان: Gateway لـ VLAN 10 و VLAN 20.",
              }),
            },
          ],
        },
        {
          id: "791381s-m19-l01-p07",
          title: "أوامر الراوتر: VLAN 30 و VLAN 40",
          order: 7,
          source: src(58),
          blocks: [
            {
              id: "m19-l01-p07-intro", type: "text", origin: "book",
              spans: [{ text: "نفس الفكرة بالضبط: نغيّر فقط رقم VLAN ورقم الشبكة." }],
            },
            { id: "m19-l01-p07-cli-h", type: "heading", origin: "book", level: 4, text: "Router CLI", dir: "ltr" },
            {
              id: "m19-l01-p07-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: "① Router(config)# interface g0/0.30\n② Router(config-subif)# encapsulation dot1Q 30\n③ Router(config-subif)# ip address 192.168.30.254 255.255.255.0\n④ Router(config-subif)# interface g0/0.40\n⑤ Router(config-subif)# encapsulation dot1Q 40\n⑥ Router(config-subif)# ip address 192.168.40.254 255.255.255.0",
            },
            {
              id: "m19-l01-p07-table", type: "table", origin: "book",
              headers: ["VLAN", "المنفذ الفرعي", "رقم Dot1Q", "Gateway"],
              columnDirs: ["rtl", "ltr", "rtl", "ltr"],
              rows: [
                ["10", "g0/0.10", "10", "192.168.10.254"],
                ["20", "g0/0.20", "20", "192.168.20.254"],
                ["30", "g0/0.30", "30", "192.168.30.254"],
                ["40", "g0/0.40", "40", "192.168.40.254"],
              ],
            },
            {
              id: "m19-l01-p07-v-subif", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m04/subinterfaces-vlan30-40", motion: false,
              source: src(58),
              title: "مخطط: المنفذ g0/0 ومنفذاه الفرعيان g0/0.30 و g0/0.40",
              alt: "مخطط: المنفذ g0/0 في الأعلى يتفرّع إلى g0/0.30 (encapsulation dot1Q 30، Gateway VLAN 30: ‏192.168.30.254) و g0/0.40 (encapsulation dot1Q 40، Gateway VLAN 40: ‏192.168.40.254).",
              caption: "نفس الفكرة بالضبط: نغيّر فقط رقم VLAN ورقم الشبكة.",
            },
            { id: "m19-l01-p07-dont-forget-h", type: "heading", origin: "book", level: 4, text: "لا تنسَ" },
            {
              id: "m19-l01-p07-dont-forget", type: "text", origin: "book",
              spans: [
                { text: "المنفذ الأصلي في الراوتر يجب أن يكون " },
                { text: "مشغّلًا", style: "strong" },
                { text: "، وإلا لن تعمل المنافذ الفرعية:" },
              ],
            },
            {
              id: "m19-l01-p07-dont-forget-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: "① Router(config)# interface g0/0\n② Router(config-if)# no shutdown",
            },
            {
              id: "m19-l01-p07-sim-subif", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مهمّة: VLAN 30 و VLAN 40 وتشغيل المنفذ الأصلي",
              description: "أنت في وضع الإعداد العام للراوتر. المطلوب حالة نهائية كما في صندوقَي الكتاب في هذه الصفحة؛ المحاكي يحكم على النتيجة. محاكاة تعليمية مبسّطة.",
              source: src(58),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "interface g0/0.30 ثم encapsulation dot1Q 30 ثم ip address 192.168.30.254 255.255.255.0، ثم interface g0/0.40 ثم encapsulation dot1Q 40 ثم ip address 192.168.40.254 255.255.255.0، ثم interface g0/0 ثم no shutdown." },
              config: EX({
                kind: "task",
                device: "router",
                startMode: "global",
                intro: "اضبط المنفذين الفرعيين لـ VLAN 30 و VLAN 40، ولا تنسَ تشغيل المنفذ الأصلي g0/0.",
                goals: [
                  { id: "g30-dot1q", label: "g0/0.30 مربوط بـ VLAN 30 (dot1Q 30)", condition: { kind: "interface", name: "g0/0.30", prop: "encapsulationVlan", value: 30 } },
                  { id: "g30-ip", label: "g0/0.30 يحمل العنوان 192.168.30.254", condition: { kind: "interface", name: "g0/0.30", prop: "ipAddress", value: "192.168.30.254" } },
                  { id: "g30-mask", label: "قناع g0/0.30 هو 255.255.255.0", condition: { kind: "interface", name: "g0/0.30", prop: "subnetMask", value: "255.255.255.0" } },
                  { id: "g40-dot1q", label: "g0/0.40 مربوط بـ VLAN 40 (dot1Q 40)", condition: { kind: "interface", name: "g0/0.40", prop: "encapsulationVlan", value: 40 } },
                  { id: "g40-ip", label: "g0/0.40 يحمل العنوان 192.168.40.254", condition: { kind: "interface", name: "g0/0.40", prop: "ipAddress", value: "192.168.40.254" } },
                  { id: "g40-mask", label: "قناع g0/0.40 هو 255.255.255.0", condition: { kind: "interface", name: "g0/0.40", prop: "subnetMask", value: "255.255.255.0" } },
                  { id: "g-up", label: "المنفذ الأصلي g0/0 مشغّل (no shutdown)", condition: { kind: "interface", name: "g0/0", prop: "shutdown", value: false } },
                ],
                hints: ["لكل VLAN 3 أوامر: interface g0/0.30 ثم encapsulation dot1Q 30 ثم ip address … — وكذلك لـ 40.", "في النهاية: interface g0/0 ثم no shutdown، وإلا لن تعمل المنافذ الفرعية."],
                allowed: ["encapsulation-dot1q", "ip-address", "no-shutdown"],
                completion: "✓ أحسنت — المنفذان الفرعيان g0/0.30 و g0/0.40 جاهزان، والمنفذ الأصلي g0/0 مشغّل.",
              }),
            },
          ],
        },
      ],
    },
    {
      // «تدريبات الوحدة» — ADDED enrichment: an end-of-unit exercise page after the booklet's own pages. Every question is
      // answered by the section's printed text above (the explanation quotes it). The book pages are unchanged (book lock).
      id: "791381s-m19-l02",
      title: "تدريبات الوحدة",
      order: 2,
      pages: [
        {
          id: "791381s-m19-l02-p01",
          title: "تدريبات الوحدة: Trunk و Router on a Stick",
          order: 1,
          layout: "practice",
          source: src(54, 58),
          blocks: [
            {
              id: "m19-l02-p01-q01", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "على رابط Trunk، لماذا تحمل كل حزمة Tag؟",
                options: [{ id: "a", text: "لتسريع الحزمة" }, { id: "b", text: "حتى نعرف لأي VLAN تنتمي", correct: true }, { id: "c", text: "لتشفير البيانات" }, { id: "d", text: "لتغيير عنوان الجهاز" }],
                feedback: { explanation: "مع Trunk يكفي كابل واحد، وكل حزمة تحمل Tag حتى نعرف لأي VLAN تنتمي." },
              },
            },
            {
              id: "m19-l02-p01-q02", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "بدون Trunk نحتاج كابلًا منفصلًا لكل VLAN بين السويتشات.", answer: true, feedback: { explanation: "بدون Trunk نحتاج كابلًا منفصلًا لكل VLAN بين السويتشات! مع Trunk يكفي كابل واحد." } },
            },
            {
              id: "m19-l02-p01-q03", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "classify", prompt: "صنّف كل عبارة: هل تصف منفذ Access أم Trunk؟",
                groups: [{ id: "access", text: "Access" }, { id: "trunk", text: "Trunk" }],
                items: [
                  { id: "i1", text: "لنقل عدة VLAN عبر كابل واحد" },
                  { id: "i2", text: "لجهاز واحد" },
                  { id: "i3", text: "المنافذ التي تربط سويتشًا بسويتش آخر" },
                  { id: "i4", text: "المنفذ في Sw6 المتصل بالراوتر" },
                ],
                assign: { i1: "trunk", i2: "access", i3: "trunk", i4: "trunk" },
                feedback: { explanation: "تذكّر: Access لجهاز واحد، و Trunk لنقل عدة VLAN عبر كابل واحد. المنافذ التي تربط سويتشًا بسويتش آخر تكون Trunk، والمنفذ في Sw6 المتصل بالراوتر يجب أن يكون Trunk." },
              },
            },
            {
              id: "m19-l02-p01-q04", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "حسب جدول منافذ الربط، كم منفذًا سيكون Trunk في Sw6-HFA؟",
                options: [{ id: "a", text: "1" }, { id: "b", text: "2" }, { id: "c", text: "3" }, { id: "d", text: "4", correct: true }],
                feedback: { explanation: "في Sw6-HFA المنافذ التي ستكون Trunk هي F0/22 و F0/23 و F0/24 و G0/0 (أربعة)، والمنفذ G0/0 يربطه بالراوتر." },
              },
            },
            {
              id: "m19-l02-p01-q05", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ماذا يحدث إذا كان أحد طرفي الكابل Trunk والآخر ليس Trunk؟",
                options: [{ id: "a", text: "لن تمرّ VLAN بينهما", correct: true }, { id: "b", text: "تمرّ كل VLAN بشكل عادي" }, { id: "c", text: "تمرّ VLAN 10 فقط" }, { id: "d", text: "يصبح الطرفان Access تلقائيًا" }],
                feedback: { explanation: "إذا كان أحد الطرفين Trunk والآخر ليس Trunk، لن تمرّ VLAN بينهما. يجب أن يكون الإعداد متّفقًا من الجهتين." },
              },
            },
            {
              id: "m19-l02-p01-q06", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "يكفي أن نكتب أوامر Trunk على سويتش واحد فقط من السويتشين المتصلين.", answer: false, feedback: { explanation: "نكتب الأوامر على كل سويتش في منافذ الربط بين السويتشات، ومهم أن يكون المنفذ المقابل في السويتش الآخر Trunk أيضًا." } },
            },
            {
              id: "m19-l02-p01-q07", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ما الاسم الرسمي لـ Dot1Q؟",
                options: [{ id: "a", text: "802.11" }, { id: "b", text: "802.3" }, { id: "c", text: "802.1Q", correct: true }, { id: "d", text: "VTP" }],
                feedback: { explanation: "Dot1Q (واسمه الرسمي 802.1Q) هو المعيار الذي يضع الـ Tag على الحزمة." },
              },
            },
            {
              id: "m19-l02-p01-q08", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "matching", prompt: "صِل كل أمر من صندوق Dot1Q بشرحه:",
                left: [
                  { id: "if", text: "interface g0/1" },
                  { id: "mode", text: "switchport mode trunk" },
                  { id: "allowed", text: "switchport trunk allowed vlan 10,20,30" },
                ],
                right: [
                  { id: "r1", text: "نجعله Trunk" },
                  { id: "r2", text: "نسمح بمرور VLAN 10 و 20 و 30 فقط" },
                  { id: "r3", text: "نختار المنفذ GigabitEthernet 0/1" },
                ],
                pairs: { if: "r3", mode: "r1", allowed: "r2" },
                feedback: { explanation: "interface g0/1: نختار المنفذ GigabitEthernet 0/1. switchport mode trunk: نجعله Trunk. switchport trunk allowed vlan 10,20,30: نسمح بمرور VLAN 10 و 20 و 30 فقط." },
              },
            },
            {
              id: "m19-l02-p01-q09", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "wordBank", prompt: "أكمل الفراغات من مخزن الكلمات:",
                segments: ["السويتش العادي يعمل في الطبقة الثانية (Layer 2). الحل: نوصل راوترًا بكابل ", { blank: "b1" }, " واحد، ونقسم منفذه إلى ", { blank: "b2" }, "، واحد لكل VLAN. اسم هذه الفكرة: ", { blank: "b3" }, "."],
                bank: ["Access", "Inter-VLAN Routing", "Trunk", "VTP", "منافذ فرعية"],
                answers: { b1: "Trunk", b2: "منافذ فرعية", b3: "Inter-VLAN Routing" },
                feedback: { explanation: "الحل: نوصل راوترًا بكابل Trunk واحد، ونقسم منفذه إلى «منافذ فرعية»، واحد لكل VLAN. اسم هذه الفكرة: Inter-VLAN Routing." },
              },
            },
            {
              id: "m19-l02-p01-q10", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "ordering", prompt: "رتّب أوامر الراوتر الثلاثة لـ VLAN 20:",
                items: [
                  { id: "ip", text: "ip address 192.168.20.254 255.255.255.0" },
                  { id: "if", text: "interface g0/0.20" },
                  { id: "enc", text: "encapsulation dot1Q 20" },
                ],
                order: ["if", "enc", "ip"],
                feedback: { explanation: "لكل VLAN نكتب 3 أوامر: نُنشئ المنفذ الفرعي (interface g0/0.20)، نربطه برقم VLAN (encapsulation dot1Q 20)، ثم نعطيه عنوان Gateway (ip address 192.168.20.254 255.255.255.0)." },
              },
            },
            {
              id: "m19-l02-p01-q11", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "أيّ أمر يربط المنفذ الفرعي g0/0.10 بـ VLAN 10؟",
                options: [{ id: "a", text: "switchport mode trunk" }, { id: "b", text: "encapsulation dot1Q 10", correct: true }, { id: "c", text: "ip address 192.168.10.254 255.255.255.0" }, { id: "d", text: "no shutdown" }],
                feedback: { explanation: "encapsulation dot1Q 10: يربط المنفذ الفرعي بـ VLAN 10 (يقرأ الحزم التي عليها Tag رقم 10)." },
              },
            },
            {
              id: "m19-l02-p01-q12", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "إذا كان المنفذ الأصلي g0/0 في الراوتر غير مشغّل، تعمل المنافذ الفرعية رغم ذلك.", answer: false, feedback: { explanation: "المنفذ الأصلي في الراوتر يجب أن يكون مشغّلًا (interface g0/0 ثم no shutdown)، وإلا لن تعمل المنافذ الفرعية." } },
            },
            {
              // Phase 8B-2 — the FIRST network lab (pilot): the curriculum network simulator (networkTopology@2) on this section's
              // Router-on-a-Stick task, with the booklet's own values (VLAN 10 / 20, g0/0.10 / g0/0.20, dot1Q, 192.168.10.254 /
              // 192.168.20.254 /24, the trunk on g0/1, «no shutdown» on g0/0). The SERVER replays and judges it; checks, feedback and
              // the solution never reach the browser. Checked only — not counted in Study Strength until the owner decides (§11.3).
              id: "m19-l02-p01-lab-roas", type: "simulation", origin: "teacher-enrichment", simulationType: "network-lab", version: 1, studyEligible: false,
              title: "مختبر شبكي: Router on a Stick",
              description: "مختبر على محاكي الشبكات: أكمل إعداد السويتش والراوتر حتى يتواصل جهازان في VLAN مختلفتين، ثم اضغط «تحقّق من الإعداد».",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "على SW1: interface g0/1 ثم switchport mode trunk. على R1: interface g0/0.10 ثم encapsulation dot1Q 10 ثم ip address 192.168.10.254 255.255.255.0، ثم interface g0/0.20 ثم encapsulation dot1Q 20 ثم ip address 192.168.20.254 255.255.255.0، ثم interface g0/0 ثم no shutdown." },
              config: {
                topology: {"v": 2, "devices": [{"id": "r1", "kind": "router", "label": "R1", "x": 0.5, "y": 0.12}, {"id": "sw1", "kind": "switch", "label": "SW1", "x": 0.5, "y": 0.45, "initial": {"v": 2, "device": "switch", "hostname": "SW1", "vlans": {"10": {"name": "VLAN0010"}, "20": {"name": "VLAN0020"}}, "interfaces": {"f0/1": {"mode": "access", "accessVlan": 10}, "f0/2": {"mode": "access", "accessVlan": 20}}, "vtp": {"mode": "server", "domain": "", "password": "", "version": 1, "revision": 0}, "security": {}}}, {"id": "pc1", "kind": "pc", "label": "PC1", "x": 0.25, "y": 0.85, "initial": {"v": 2, "device": "host", "adapters": {"eth0": {"mode": "static", "address": "192.168.10.11", "mask": "255.255.255.0", "gateway": "192.168.10.254"}}}}, {"id": "pc2", "kind": "pc", "label": "PC2", "x": 0.75, "y": 0.85, "initial": {"v": 2, "device": "host", "adapters": {"eth0": {"mode": "static", "address": "192.168.20.11", "mask": "255.255.255.0", "gateway": "192.168.20.254"}}}}], "links": [{"id": "u", "a": {"deviceId": "r1", "port": "g0/0"}, "b": {"deviceId": "sw1", "port": "g0/1"}}, {"id": "a", "a": {"deviceId": "sw1", "port": "f0/1"}, "b": {"deviceId": "pc1", "port": "eth0"}}, {"id": "b", "a": {"deviceId": "sw1", "port": "f0/2"}, "b": {"deviceId": "pc2", "port": "eth0"}}]},
                task: {
                  intro: "السويتش SW1 جاهز: VLAN 10 على المنفذ f0/1 (PC1) و VLAN 20 على المنفذ f0/2 (PC2)، وبوابة كل جهاز هي عنوان المنفذ الفرعي على الراوتر. أكمل الإعداد كما في هذه الوحدة: اجعل منفذ السويتش المتصل بالراوتر Trunk، وأنشئ على R1 منفذًا فرعيًا لكل VLAN بـ encapsulation dot1Q وعنوان Gateway، ثم شغّل المنفذ الأصلي g0/0.",
                  goals: [{"id": "trunk", "label": "SW1: المنفذ g0/1 في وضع Trunk"}, {"id": "g0-up", "label": "R1: المنفذ الأصلي g0/0 مشغّل (no shutdown)"}, {"id": "s10-vlan", "label": "R1: g0/0.10 مربوط بـ VLAN 10 (encapsulation dot1Q 10)"}, {"id": "s10-ip", "label": "R1: g0/0.10 يحمل عنوان Gateway لـ VLAN 10: ‏192.168.10.254"}, {"id": "s20-vlan", "label": "R1: g0/0.20 مربوط بـ VLAN 20 (encapsulation dot1Q 20)"}, {"id": "s20-ip", "label": "R1: g0/0.20 يحمل عنوان Gateway لـ VLAN 20: ‏192.168.20.254"}, {"id": "ping", "label": "PC1 في VLAN 10 يصل إلى PC2 في VLAN 20 عبر الراوتر"}],
                },
                checks: [{"id": "trunk", "label": "SW1: المنفذ g0/1 في وضع Trunk", "weight": 1, "kind": "switch.portMode", "deviceId": "sw1", "interface": "g0/1", "value": "trunk"}, {"id": "g0-up", "label": "R1: المنفذ الأصلي g0/0 مشغّل (no shutdown)", "weight": 1, "kind": "router.interfaceEnabled", "deviceId": "r1", "interface": "g0/0", "value": true}, {"id": "s10-vlan", "label": "R1: g0/0.10 مربوط بـ VLAN 10 (encapsulation dot1Q 10)", "weight": 1, "kind": "router.subinterfaceVlan", "deviceId": "r1", "interface": "g0/0.10", "value": 10}, {"id": "s10-ip", "label": "R1: g0/0.10 يحمل عنوان Gateway لـ VLAN 10: ‏192.168.10.254", "weight": 1, "kind": "router.ipAddress", "deviceId": "r1", "interface": "g0/0.10", "value": "192.168.10.254"}, {"id": "s20-vlan", "label": "R1: g0/0.20 مربوط بـ VLAN 20 (encapsulation dot1Q 20)", "weight": 1, "kind": "router.subinterfaceVlan", "deviceId": "r1", "interface": "g0/0.20", "value": 20}, {"id": "s20-ip", "label": "R1: g0/0.20 يحمل عنوان Gateway لـ VLAN 20: ‏192.168.20.254", "weight": 1, "kind": "router.ipAddress", "deviceId": "r1", "interface": "g0/0.20", "value": "192.168.20.254"}, {"id": "ping", "label": "PC1 في VLAN 10 يصل إلى PC2 في VLAN 20 عبر الراوتر", "weight": 1, "kind": "reachability", "source": "pc1", "destination": "pc2", "value": true}],
                feedback: {
                  correctFeedback: "أحسنت! الحزم تمر بين VLAN 10 و VLAN 20 عبر الراوتر.",
                  incorrectFeedback: "لم تتحقق كل الأهداف بعد.",
                  hints: ["على SW1: interface g0/1 ثم switchport mode trunk.", "لكل VLAN 3 أوامر على R1: interface g0/0.10 ثم encapsulation dot1Q 10 ثم ip address 192.168.10.254 255.255.255.0 — وكذلك لـ 20.", "في النهاية: interface g0/0 ثم no shutdown، وإلا لن تعمل المنافذ الفرعية."],
                  explanation: "Router on a Stick: منفذ واحد على الراوتر (g0/0) متصل بمنفذ Trunk على السويتش، وعليه منفذ فرعي لكل VLAN. encapsulation dot1Q يربط المنفذ الفرعي برقم VLAN، وعنوانه هو Gateway أجهزة تلك الـ VLAN.",
                },
                solution: [{"type": "switch.command", "deviceId": "sw1", "command": "enable"}, {"type": "switch.command", "deviceId": "sw1", "command": "configure terminal"}, {"type": "switch.command", "deviceId": "sw1", "command": "interface g0/1"}, {"type": "switch.command", "deviceId": "sw1", "command": "switchport mode trunk"}, {"type": "switch.command", "deviceId": "sw1", "command": "end"}, {"type": "router.command", "deviceId": "r1", "command": "enable"}, {"type": "router.command", "deviceId": "r1", "command": "configure terminal"}, {"type": "router.command", "deviceId": "r1", "command": "interface g0/0.10"}, {"type": "router.command", "deviceId": "r1", "command": "encapsulation dot1Q 10"}, {"type": "router.command", "deviceId": "r1", "command": "ip address 192.168.10.254 255.255.255.0"}, {"type": "router.command", "deviceId": "r1", "command": "interface g0/0.20"}, {"type": "router.command", "deviceId": "r1", "command": "encapsulation dot1Q 20"}, {"type": "router.command", "deviceId": "r1", "command": "ip address 192.168.20.254 255.255.255.0"}, {"type": "router.command", "deviceId": "r1", "command": "interface g0/0"}, {"type": "router.command", "deviceId": "r1", "command": "no shutdown"}, {"type": "router.command", "deviceId": "r1", "command": "end"}],
              },
            },
            { id: "m19-l02-p01-lib-t17", type: "library-training", origin: "teacher-enrichment", trainingId: "T17", label: "تدريب 17", requiredModuleId: "791381s-m19" },
          ],
        },
      ],
    },
  ],
};

export default m19;
