// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 16 «الشبكات الافتراضية VLAN».
//
// Verbatim conversion of booklet PDF pages 44–48 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every converted block is origin:"book": nothing is added, removed or reworded; bold runs are `strong`, monospace
// runs are `code`, printed box labels are the callout titles. The VLAN drawing is a crop of the booklet itself.
//
// Enrichment (docs/enterprise-791381s-enrichment-plan.md, Phases 2–5): teacher-enrichment blocks (visuals / activities reused from
// course 791381 after checking their labels against this section, and the end-of-unit «تدريبات الوحدة» lesson) are ADDED after the
// book blocks they explain. The book blocks above stay verbatim — pinned by the book lock (bookLock.test.ts).

import type { ContentModule, ContentSource } from "../../types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };

const m16: ContentModule = {
  id: "791381s-m16",
  title: "الشبكات الافتراضية VLAN",
  order: 16,
  lessons: [
    {
      id: "791381s-m16-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m16-l00-p01",
          title: "الشبكات الافتراضية VLAN",
          order: 1,
          layout: "opener",
          source: src(44),
          blocks: [
            {
              id: "m16-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الدفعة الرابعة · كتاب ص 125–134", unitNumber: "16", title: "الشبكات الافتراضية VLAN",
              subtitle: "كيف نقسم شبكة واحدة إلى أقسام منفصلة بدون تغيير الكوابل؟",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m16-l01",
      title: "الشبكات الافتراضية VLAN",
      order: 1,
      pages: [
        {
          id: "791381s-m16-l01-p01",
          title: "ما هي VLAN؟",
          order: 1,
          source: src(44, 45),
          blocks: [
            {
              id: "m16-l01-p01-def", type: "text", origin: "book",
              spans: [{ text: "VLAN تقسم الشبكة الكبيرة إلى شبكات أصغر، والتقسيم يكون افتراضيًا بدون تغيير الكوابل.", style: "strong" }],
            },
            {
              id: "m16-l01-p01-intro", type: "text", origin: "book",
              spans: [{ text: "تخيّل مدرسة فيها سويتش واحد. نريد أن تكون حواسيب الإدارة منفصلة عن حواسيب الطلاب، مع أنها متصلة بنفس السويتش. الحل: نضع كل قسم في VLAN خاصة به، فيصبح كل قسم كأنه شبكة مستقلة." }],
            },
            {
              id: "m16-l01-p01-drawing", type: "diagram", origin: "book",
              src: "/learning-assets/791381s/2a4a529a9bd81705.png",
              alt: "مربع «Switch» تخرج منه أربعة خطوط إلى أربعة حواسيب: حاسوبان داخل إطار متقطع مكتوب فيه «VLAN 10 · الإدارة»، وحاسوبان داخل إطار متقطع آخر مكتوب فيه «VLAN 20 · المحاسبة».",
              caption: "نفس السويتش ونفس الكوابل — لكن قسمان منفصلان",
            },
            {
              // ENRICHMENT: SVG next to the booklet drawing (not replacing it) — same switch, VLAN 10 الإدارة / VLAN 20 المحاسبة.
              id: "m16-l01-p01-v-segmentation", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m03/vlan-segmentation", motion: true,
              source: src(44),
              title: "رسم توضيحي: سويتش واحد وقسمان منفصلان",
              alt: "سويتش واحد في الوسط تتصل به أربعة أجهزة: جهازان داخل مجموعة «VLAN 10 · الإدارة» وجهازان داخل مجموعة «VLAN 20 · المحاسبة»؛ وتتحرّك الحزم بين جهازَي كل مجموعة عبر السويتش، ولا تنتقل إلى المجموعة الأخرى.",
              caption: "نفس السويتش ونفس الكوابل — لكن كل قسم في VLAN خاصة به، كأنه شبكة مستقلة.",
            },
            { id: "m16-l01-p01-why-h", type: "heading", origin: "book", level: 3, text: "لماذا نستعمل VLAN؟" },
            {
              id: "m16-l01-p01-why", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m16-l01-p01-w1", text: [{ text: "أمان أفضل:", style: "strong" }, { text: " قسم لا يرى بيانات قسم آخر." }] },
                { id: "m16-l01-p01-w2", text: [{ text: "تنظيم أسهل:", style: "strong" }, { text: " كل قسم في مجموعة واضحة." }] },
                { id: "m16-l01-p01-w3", text: [{ text: "ازدحام أقل:", style: "strong" }, { text: " كل VLAN مجال بث منفصل، فلا تصل رسائل البث لكل الشبكة." }] },
              ],
            },
            {
              id: "m16-l01-p01-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [
                { text: "الأجهزة داخل " },
                { text: "نفس VLAN", style: "strong" },
                { text: " تتواصل بسهولة. أما بين VLAN " },
                { text: "مختلفة", style: "strong" },
                { text: " فنحتاج راوتر (أو سويتش طبقة ثالثة)." },
              ],
            },
          ],
        },
        {
          id: "791381s-m16-l01-p02",
          title: "مصطلحات مهمة",
          order: 2,
          source: src(45),
          blocks: [
            {
              id: "m16-l01-p02-table", type: "table", origin: "book",
              headers: ["المصطلح", "معناه", "احفظ"],
              rows: [
                ["VLAN ID", "رقم يميّز كل VLAN. مثال: VLAN 10 للإدارة، VLAN 20 للمحاسبة.", "المجال: من 1 إلى 4094"],
                ["VLAN 1", "الشبكة الافتراضية الموجودة في السويتش من البداية. كل المنافذ فيها في البداية.", "لا يُفضّل استعمالها للأمان"],
                ["Access", "منفذ لجهاز عادي، ينتمي إلى VLAN واحدة.", "جهاز واحد"],
                ["Trunk", "وصلة بين أجهزة الشبكة، تمرّر أكثر من VLAN عبر نفس الكابل.", "كابل واحد لعدة VLAN"],
              ],
            },
            {
              // ENRICHMENT: SVG — the table's Access (one VLAN, one device) vs Trunk (one cable, several VLAN) rows.
              id: "m16-l01-p02-v-access-trunk", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m03/vlan-access-trunk-terms", motion: true,
              source: src(45),
              title: "رسم توضيحي: Access مقابل Trunk",
              alt: "سويتشان SW1 و SW2 بينهما كابل Trunk واحد تمرّ فيه حزم VLAN 10 و VLAN 20 معًا؛ وتحت كل سويتش جهاز موصول بمنفذ Access ينتمي إلى VLAN واحدة فقط: VLAN 10 تحت الأول و VLAN 20 تحت الثاني.",
              caption: "Access = منفذ لجهاز عادي في VLAN واحدة · Trunk = كابل واحد لعدة VLAN.",
            },
          ],
        },
        {
          id: "791381s-m16-l01-p03",
          title: "مثال: جدول VLAN",
          order: 3,
          source: src(45, 46),
          blocks: [
            {
              id: "m16-l01-p03-intro", type: "text", origin: "book",
              spans: [{ text: "قبل البرمجة نخطّط: لكل قسم رقم VLAN، ولكل VLAN شبكة IP مختلفة." }],
            },
            {
              id: "m16-l01-p03-table", type: "table", origin: "book",
              headers: ["الفرع", "الجهاز", "VLAN", "العنوان", "القناع"],
              columnDirs: ["rtl", "rtl", "rtl", "ltr", "ltr"],
              rows: [
                ["الإدارة", "Pc1-ADMIN", "10", "192.168.10.1", "/24"],
                ["الإدارة", "Pc2-ADMIN", "10", "192.168.10.2", "/24"],
                ["المحاسبة", "Pc1-GAZ", "20", "192.168.20.1", "/24"],
                ["المحاسبة", "Pc2-GAZ", "20", "192.168.20.2", "/24"],
              ],
            },
            {
              // ENRICHMENT: SVG — the example table itself drawn as a network (same four devices, VLANs and addresses).
              id: "m16-l01-p03-v-topology", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m03/vlan-example-topology", motion: true,
              source: src(45),
              title: "رسم توضيحي: جدول المثال كشبكة",
              alt: "سويتش في الوسط تتصل به الأجهزة الأربعة من الجدول: Pc1-ADMIN (192.168.10.1) و Pc2-ADMIN (192.168.10.2) داخل مجموعة «VLAN 10 · الإدارة»، و Pc1-GAZ (192.168.20.1) و Pc2-GAZ (192.168.20.2) داخل مجموعة «VLAN 20 · المحاسبة».",
              caption: "لكل قسم رقم VLAN، ولكل VLAN شبكة IP مختلفة: 192.168.10.x للإدارة و 192.168.20.x للمحاسبة.",
            },
            {
              id: "m16-l01-p03-note", type: "callout", origin: "book", kind: "summary", title: "لاحظ",
              spans: [{ text: "الإدارة في الشبكة 192.168.10.x والمحاسبة في 192.168.20.x. ورقم الشبكة يشبه رقم VLAN — هذا يسهّل التذكّر." }],
            },
            {
              id: "m16-l01-p03-how", type: "callout", origin: "book", kind: "summary", title: "كيف يعرف السويتش القسم؟",
              spans: [
                { text: "السويتش " },
                { text: "لا يعرف", style: "strong" },
                { text: " القسم من اسم الجهاز، بل من " },
                { text: "المنفذ", style: "strong" },
                { text: " الذي يتصل به الجهاز وإعداد هذا المنفذ." },
              ],
            },
          ],
        },
        {
          id: "791381s-m16-l01-p04",
          title: "إنشاء VLAN على السويتش",
          order: 4,
          source: src(46),
          blocks: [
            {
              id: "m16-l01-p04-intro", type: "text", origin: "book",
              spans: [{ text: "أولًا ننشئ الـ VLAN ونعطيها اسمًا. الاسم لا يغيّر عمل الشبكة، لكنه يسهّل الإدارة والمتابعة." }],
            },
            { id: "m16-l01-p04-cli-h", type: "heading", origin: "book", level: 4, text: "Switch CLI", dir: "ltr" },
            {
              id: "m16-l01-p04-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: "① Switch(config)# vlan 10\n② Switch(config-vlan)# name MNG\n③ Switch(config-vlan)# exit\n④ Switch(config)# vlan 20\n⑤ Switch(config-vlan)# name GAZ",
            },
            {
              id: "m16-l01-p04-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m16-l01-p04-s1", text: [{ text: "يُنشئ VLAN رقم 10." }] },
                { id: "m16-l01-p04-s2", text: [{ text: "يعطيها اسمًا واضحًا: MNG (الإدارة)." }] },
                { id: "m16-l01-p04-s3", text: [{ text: "يرجع إلى وضع الإعدادات العامة." }] },
                { id: "m16-l01-p04-s4", text: [{ text: "يُنشئ VLAN رقم 20 — نكرّر الأمر لكل VLAN نحتاجها." }] },
                { id: "m16-l01-p04-s5", text: [{ text: "اسم VLAN المحاسبة: GAZ." }] },
              ],
            },
            {
              // ENRICHMENT: CLI simulation — the booklet's own box ① vlan 10 ② name MNG ③ exit ④ vlan 20 ⑤ name GAZ.
              id: "m16-l01-p04-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              source: src(46),
              title: "مثال موجّه: إنشاء VLAN 10 و VLAN 20",
              description: "أنت في وضع الإعدادات العامة. نفّذ أسطر صندوق Switch CLI الخمسة بالترتيب. محاكاة تعليمية مبسّطة، ليست جهازًا حقيقيًا.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "المثال الموجّه: Switch(config)# vlan 10 ثم name MNG ثم exit، ثم vlan 20 ثم name GAZ." },
              config: {
                kind: "guided",
                device: "switch",
                startMode: "global",
                intro: "أنت في وضع الإعدادات العامة Switch(config)#. أنشئ VLAN الإدارة ثم VLAN المحاسبة كما في الصندوق.",
                steps: [
                  { id: "s1", instruction: "أنشئ VLAN رقم 10", expect: { command: "vlan", args: { vlanId: 10 } }, success: "✓ أحسنت — أنشأت VLAN 10، والموجّه الآن Switch(config-vlan)#", hints: ["السطر ① في صندوق Switch CLI.", "الكلمة vlan ثم الرقم 10."] },
                  { id: "s2", instruction: "أعطها اسمًا واضحًا: MNG (الإدارة)", expect: { command: "name", args: { name: "MNG" } }, hints: ["السطر ② في الصندوق.", "الكلمة name ثم الاسم MNG."] },
                  { id: "s3", instruction: "ارجع إلى وضع الإعدادات العامة", expect: { mode: "global" }, success: "✓ أحسنت — رجعت إلى Switch(config)#", hints: ["السطر ③ في الصندوق: الرجوع خطوة إلى الوراء.", "اكتب exit."] },
                  { id: "s4", instruction: "أنشئ VLAN رقم 20", expect: { command: "vlan", args: { vlanId: 20 } }, hints: ["السطر ④: نكرّر الأمر لكل VLAN نحتاجها.", "الكلمة vlan ثم الرقم 20."] },
                  { id: "s5", instruction: "أعطها اسم VLAN المحاسبة: GAZ", expect: { command: "name", args: { name: "GAZ" } }, hints: ["السطر ⑤ في الصندوق.", "الكلمة name ثم الاسم GAZ."] },
                ],
                completion: "✓ أحسنت — أنشأت VLAN 10 باسم MNG و VLAN 20 باسم GAZ. الاسم لا يغيّر عمل الشبكة، لكنه يسهّل الإدارة والمتابعة.",
              },
            },
          ],
        },
        {
          id: "791381s-m16-l01-p05",
          title: "ربط المنافذ مع VLAN (منافذ Access)",
          order: 5,
          source: src(46, 47),
          blocks: [
            {
              id: "m16-l01-p05-intro", type: "text", origin: "book",
              spans: [{ text: "بعد إنشاء VLAN نقول للسويتش: «المنافذ من 1 إلى 10 تابعة لـ VLAN 10». كل جهاز نوصله بهذه المنافذ يصبح تلقائيًا في VLAN 10." }],
            },
            { id: "m16-l01-p05-cli-h", type: "heading", origin: "book", level: 4, text: "Switch CLI", dir: "ltr" },
            {
              id: "m16-l01-p05-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: "① Switch(config)# interface range f0/1-10\n② Switch(config-if-range)# switchport mode access\n③ Switch(config-if-range)# switchport access vlan 10",
            },
            {
              id: "m16-l01-p05-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m16-l01-p05-s1", text: [{ text: "interface range", style: "strong" }, { text: ": نختار مجموعة منافذ معًا (من F0/1 حتى F0/10) بدل أن نبرمج كل منفذ وحده." }] },
                { id: "m16-l01-p05-s2", text: [{ text: "mode access", style: "strong" }, { text: ": هذه المنافذ لأجهزة عادية (حواسيب)." }] },
                { id: "m16-l01-p05-s3", text: [{ text: "access vlan 10", style: "strong" }, { text: ": نربط هذه المنافذ بـ VLAN 10." }] },
              ],
            },
            { id: "m16-l01-p05-one-h", type: "heading", origin: "book", level: 4, text: "مثال: منفذ واحد فقط" },
            {
              id: "m16-l01-p05-one-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: "① Switch(config)# interface f0/1\n② Switch(config-if)# switchport mode access\n③ Switch(config-if)# switchport access vlan 10",
            },
            {
              id: "m16-l01-p05-one-note", type: "text", origin: "book",
              spans: [{ text: "لمنفذ واحد نكتب " }, { text: "interface", style: "strong" }, { text: " بدون كلمة range." }],
            },
            { id: "m16-l01-p05-access-h", type: "heading", origin: "book", level: 4, text: "منفذ Access" },
            {
              id: "m16-l01-p05-access", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m16-l01-p05-a1", text: [{ text: "ينتمي إلى " }, { text: "VLAN واحدة فقط", style: "strong" }, { text: "." }] },
                { id: "m16-l01-p05-a2", text: [{ text: "يُستخدم مع الحواسيب والطابعات والأجهزة النهائية." }] },
                { id: "m16-l01-p05-a3", text: [{ text: "الجهاز " }, { text: "لا يحتاج", style: "strong" }, { text: " أن يعرف رقم VLAN — السويتش هو الذي يحدّد." }] },
              ],
            },
            { id: "m16-l01-p05-check-h", type: "heading", origin: "book", level: 4, text: "للتأكد (أمر إضافي مفيد)" },
            {
              id: "m16-l01-p05-check-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: "✓ Switch# show vlan brief",
            },
            {
              id: "m16-l01-p05-check-note", type: "text", origin: "book",
              spans: [{ text: "يعرض قائمة كل VLAN والمنافذ التابعة لكل واحدة." }],
            },
            {
              // ENRICHMENT: CLI simulation — the page's «مثال: منفذ واحد فقط» box (interface f0/1 → mode access → access vlan 10)
              // + the «للتأكد» command show vlan brief. VLAN 10 / 20 are preset with the names created on the previous page.
              // (The range box is not simulated: the simulator prints Switch(config-if)# after interface range, while the
              // booklet's prompt table teaches Switch(config-if-range)#.)
              id: "m16-l01-p05-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              source: src(46, 47),
              title: "مثال موجّه: ربط المنفذ F0/1 بـ VLAN 10 ثم التأكد",
              description: "أنت في وضع الإعدادات العامة، و VLAN 10 (MNG) و VLAN 20 (GAZ) موجودتان. برمج منفذًا واحدًا كما في المثال ثم تأكّد بالأمر الإضافي. محاكاة تعليمية مبسّطة، ليست جهازًا حقيقيًا.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "المثال الموجّه: Switch(config)# interface f0/1 ثم switchport mode access ثم switchport access vlan 10، ثم الرجوع إلى Switch# والأمر show vlan brief." },
              config: {
                kind: "guided",
                device: "switch",
                startMode: "global",
                preset: { vlans: { "10": { name: "MNG" }, "20": { name: "GAZ" } } },
                intro: "أنت في وضع الإعدادات العامة Switch(config)#. لمنفذ واحد نكتب interface بدون كلمة range.",
                steps: [
                  { id: "s1", instruction: "اختر المنفذ الواحد f0/1", expect: { command: "interface", args: { interfaces: ["f0/1"] } }, success: "✓ أحسنت — الموجّه الآن Switch(config-if)#: داخل منفذ واحد", hints: ["السطر ① في «مثال: منفذ واحد فقط» — بدون كلمة range.", "interface ثم اسم المنفذ f0/1."] },
                  { id: "s2", instruction: "اجعل هذا المنفذ لجهاز عادي (Access)", expect: { command: "switchport-mode", args: { mode: "access" } }, hints: ["السطر ② في المثال.", "switchport mode ثم access."] },
                  { id: "s3", instruction: "اربط المنفذ بـ VLAN 10", expect: { command: "switchport-access-vlan", args: { vlanId: 10 } }, hints: ["السطر ③ في المثال.", "switchport access vlan ثم الرقم 10."] },
                  { id: "s4", instruction: "ارجع إلى الوضع المتقدّم Switch#", expect: { mode: "privileged" }, success: "✓ أحسنت — أنت الآن في Switch#", hints: ["أمر التأكد يُكتب بعد Switch# في الأوراق.", "اكتب exit مرّتين: من (config-if)# إلى (config)# ثم إلى Switch#."] },
                  { id: "s5", instruction: "اعرض قائمة كل VLAN والمنافذ التابعة لكل واحدة", expect: { command: "show", args: { what: "vlan-brief" } }, hints: ["الأمر الإضافي في «للتأكد».", "show vlan brief."] },
                ],
                completion: "✓ أحسنت — المنفذ F0/1 يظهر تحت VLAN 10: كل جهاز نوصله به يصبح تلقائيًا في VLAN 10، والجهاز لا يحتاج أن يعرف رقم VLAN.",
              },
            },
          ],
        },
        {
          id: "791381s-m16-l01-p06",
          title: "الواجهة SVI والبوابة (Gateway)",
          order: 6,
          source: src(48),
          blocks: [
            {
              id: "m16-l01-p06-def", type: "text", origin: "book",
              spans: [{ text: "SVI هي واجهة افتراضية داخل السويتش نعطيها عنوان IP خاصًا بـ VLAN.", style: "strong" }],
            },
            {
              id: "m16-l01-p06-intro", type: "text", origin: "book",
              spans: [{ text: "المنافذ العادية لا تأخذ عنوان IP. لكن أحيانًا نريد عنوانًا للـ VLAN نفسها: لإدارة السويتش عن بُعد، أو ليكون بوابة (Gateway) لأجهزة هذه VLAN." }],
            },
            { id: "m16-l01-p06-cli-h", type: "heading", origin: "book", level: 4, text: "Switch CLI", dir: "ltr" },
            {
              id: "m16-l01-p06-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: "① Switch(config)# interface vlan 10\n② Switch(config-if)# ip address 192.168.10.254 255.255.255.0\n③ Switch(config-if)# no shutdown",
            },
            {
              id: "m16-l01-p06-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m16-l01-p06-s1", text: [{ text: "يُنشئ واجهة افتراضية لـ VLAN 10." }] },
                { id: "m16-l01-p06-s2", text: [{ text: "يعطيها عنوان IP وقناع شبكة." }] },
                { id: "m16-l01-p06-s3", text: [{ text: "no shutdown", style: "strong" }, { text: " يشغّل الواجهة (بدونه تبقى مطفأة)." }] },
              ],
            },
            {
              id: "m16-l01-p06-points", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m16-l01-p06-t1", text: [{ text: "لكل VLAN يمكن أن يكون " }, { text: "Gateway خاص بها", style: "strong" }, { text: "، مثل 192.168.10.254." }] },
                { id: "m16-l01-p06-t2", text: [{ text: "البوابة هي الباب الذي يخرج منه الجهاز إلى شبكة أخرى." }] },
                { id: "m16-l01-p06-t3", text: [{ text: "SVI مفيدة خاصة في السويتشات التي تدعم الطبقة الثالثة (Layer 3)." }] },
              ],
            },
            {
              id: "m16-l01-p06-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [
                { text: "بدون Gateway تعمل VLAN داخليًا، لكن أجهزتها " },
                { text: "لا تصل", style: "strong" },
                { text: " إلى الشبكات الأخرى." },
              ],
            },
            {
              // ENRICHMENT: CLI simulation — the booklet's own box ① interface vlan 10 ② ip address 192.168.10.254 255.255.255.0
              // ③ no shutdown. The SVI is preset administratively down (the booklet: without no shutdown it stays off).
              id: "m16-l01-p06-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              source: src(48),
              title: "مثال موجّه: الواجهة SVI لـ VLAN 10",
              description: "أنت في وضع الإعدادات العامة. نفّذ أسطر صندوق Switch CLI الثلاثة بالترتيب. محاكاة تعليمية مبسّطة، ليست جهازًا حقيقيًا.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "المثال الموجّه: Switch(config)# interface vlan 10 ثم ip address 192.168.10.254 255.255.255.0 ثم no shutdown." },
              config: {
                kind: "guided",
                device: "switch",
                startMode: "global",
                preset: { interfaces: { vlan10: { shutdown: true } } },
                intro: "أنت في وضع الإعدادات العامة Switch(config)#. أعطِ VLAN 10 عنوانًا من خلال واجهة افتراضية، ثم شغّلها.",
                steps: [
                  { id: "s1", instruction: "أنشئ واجهة افتراضية لـ VLAN 10", expect: { command: "interface", args: { interfaces: ["vlan10"] } }, success: "✓ أحسنت — الموجّه الآن Switch(config-if)#", hints: ["السطر ① في صندوق Switch CLI.", "interface ثم vlan 10."] },
                  { id: "s2", instruction: "أعطها العنوان 192.168.10.254 وقناع الشبكة 255.255.255.0", expect: { command: "ip-address", args: { address: "192.168.10.254", mask: "255.255.255.0" } }, hints: ["السطر ② في الصندوق: العنوان ثم القناع.", "ip address 192.168.10.254 255.255.255.0"] },
                  { id: "s3", instruction: "شغّل الواجهة (بدون هذا الأمر تبقى مطفأة)", expect: { command: "no-shutdown" }, hints: ["السطر ③ في الصندوق.", "كلمتان: no shutdown."] },
                ],
                completion: "✓ أحسنت — الواجهة SVI لـ VLAN 10 تعمل بالعنوان 192.168.10.254، ويمكن أن يكون هذا العنوان Gateway لأجهزة VLAN 10.",
              },
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m16-l02",
      title: "تدريبات الوحدة",
      order: 2,
      pages: [
        {
          id: "791381s-m16-l02-p01",
          title: "تدريبات الوحدة: الشبكات الافتراضية VLAN",
          order: 1,
          layout: "practice",
          source: src(44, 48),
          blocks: [
            {
              id: "m16-l02-p01-q01", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ماذا تفعل VLAN؟",
                options: [{ id: "a", text: "تربط شبكتين بعيدتين بكابل جديد." }, { id: "b", text: "تزيد عدد المنافذ في السويتش." }, { id: "c", text: "تقسم الشبكة الكبيرة إلى شبكات أصغر، والتقسيم يكون افتراضيًا بدون تغيير الكوابل.", correct: true }, { id: "d", text: "تعطي كل جهاز اسمًا جديدًا." }],
                feedback: { explanation: "VLAN تقسم الشبكة الكبيرة إلى شبكات أصغر، والتقسيم يكون افتراضيًا بدون تغيير الكوابل: نضع كل قسم في VLAN خاصة به، فيصبح كأنه شبكة مستقلة." },
              },
            },
            {
              id: "m16-l02-p01-q02", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "لتقسيم الشبكة إلى VLAN يجب تغيير الكوابل بين الأجهزة والسويتش.", answer: false, feedback: { explanation: "التقسيم بـ VLAN يكون افتراضيًا بدون تغيير الكوابل — نفس السويتش ونفس الكوابل، لكن قسمان منفصلان." } },
            },
            {
              id: "m16-l02-p01-q03", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "حاسوب في VLAN 10 يريد التواصل مع حاسوب في VLAN 20. ماذا نحتاج؟",
                options: [{ id: "a", text: "لا شيء، لأنهما متصلان بنفس السويتش." }, { id: "b", text: "راوتر (أو سويتش طبقة ثالثة).", correct: true }, { id: "c", text: "أن نغيّر اسم VLAN 20." }, { id: "d", text: "أن نضع الحاسوبين في VLAN 1." }],
                feedback: { explanation: "الأجهزة داخل نفس VLAN تتواصل بسهولة. أما بين VLAN مختلفة فنحتاج راوتر (أو سويتش طبقة ثالثة)." },
              },
            },
            {
              id: "m16-l02-p01-q04", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "matching", prompt: "صِل كل فائدة من فوائد VLAN بشرحها:",
                left: [{ id: "sec", text: "أمان أفضل" }, { id: "org", text: "تنظيم أسهل" }, { id: "less", text: "ازدحام أقل" }],
                right: [{ id: "r1", text: "كل VLAN مجال بث منفصل، فلا تصل رسائل البث لكل الشبكة." }, { id: "r2", text: "قسم لا يرى بيانات قسم آخر." }, { id: "r3", text: "كل قسم في مجموعة واضحة." }],
                pairs: { sec: "r2", org: "r3", less: "r1" },
                feedback: { explanation: "أمان أفضل: قسم لا يرى بيانات قسم آخر. تنظيم أسهل: كل قسم في مجموعة واضحة. ازدحام أقل: كل VLAN مجال بث منفصل، فلا تصل رسائل البث لكل الشبكة." },
              },
            },
            {
              id: "m16-l02-p01-q05", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ما مجال أرقام VLAN ID؟",
                options: [{ id: "a", text: "من 0 إلى 255" }, { id: "b", text: "من 1 إلى 24" }, { id: "c", text: "من 10 إلى 20" }, { id: "d", text: "من 1 إلى 4094", correct: true }],
                feedback: { explanation: "VLAN ID رقم يميّز كل VLAN (مثال: VLAN 10 للإدارة، VLAN 20 للمحاسبة)، والمجال: من 1 إلى 4094." },
              },
            },
            {
              id: "m16-l02-p01-q06", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "يُفضّل استعمال VLAN 1 لأنها موجودة في السويتش من البداية.", answer: false, feedback: { explanation: "VLAN 1 هي الشبكة الافتراضية الموجودة في السويتش من البداية، وكل المنافذ فيها في البداية — لكن لا يُفضّل استعمالها للأمان." } },
            },
            {
              id: "m16-l02-p01-q07", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "كيف يعرف السويتش أن الجهاز Pc1-GAZ تابع لقسم المحاسبة؟",
                options: [{ id: "a", text: "من المنفذ الذي يتصل به الجهاز وإعداد هذا المنفذ.", correct: true }, { id: "b", text: "من اسم الجهاز Pc1-GAZ." }, { id: "c", text: "من لون الكابل." }],
                feedback: { explanation: "السويتش لا يعرف القسم من اسم الجهاز، بل من المنفذ الذي يتصل به الجهاز وإعداد هذا المنفذ." },
              },
            },
            {
              id: "m16-l02-p01-q08", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "ordering", prompt: "رتّب أسطر صندوق Switch CLI لإنشاء VLAN الإدارة و VLAN المحاسبة:",
                items: [{ id: "v20", text: "vlan 20" }, { id: "mng", text: "name MNG" }, { id: "exit", text: "exit" }, { id: "gaz", text: "name GAZ" }, { id: "v10", text: "vlan 10" }],
                order: ["v10", "mng", "exit", "v20", "gaz"],
                feedback: { explanation: "① vlan 10 يُنشئ VLAN رقم 10 ② name MNG يعطيها اسمًا ③ exit يرجع إلى وضع الإعدادات العامة ④ vlan 20 يُنشئ VLAN رقم 20 ⑤ name GAZ اسم VLAN المحاسبة." },
              },
            },
            {
              id: "m16-l02-p01-q09", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "wordBank", prompt: "أكمل الأوامر التي تربط المنافذ من F0/1 حتى F0/10 بـ VLAN 10:",
                segments: ["نختار المنافذ معًا: interface ", { blank: "b1" }, " f0/1-10، ثم نجعلها لأجهزة عادية: switchport mode ", { blank: "b2" }, "، ثم نربطها: switchport access ", { blank: "b3" }, " 10."],
                bank: ["range", "access", "vlan", "trunk", "name"],
                answers: { b1: "range", b2: "access", b3: "vlan" },
                feedback: { explanation: "① interface range f0/1-10 ② switchport mode access ③ switchport access vlan 10 — interface range يختار مجموعة منافذ معًا، و mode access لأجهزة عادية، و access vlan 10 يربطها بـ VLAN 10." },
              },
            },
            {
              id: "m16-l02-p01-q10", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "بعد الأوامر الثلاثة على المنافذ f0/1-10، ماذا يحدث لحاسوب نوصله بالمنفذ F0/3؟",
                options: [{ id: "a", text: "يجب أن نكتب رقم VLAN في الحاسوب نفسه." }, { id: "b", text: "يبقى في VLAN 1." }, { id: "c", text: "يصبح تلقائيًا في VLAN 10.", correct: true }],
                feedback: { explanation: "كل جهاز نوصله بهذه المنافذ يصبح تلقائيًا في VLAN 10، والجهاز لا يحتاج أن يعرف رقم VLAN — السويتش هو الذي يحدّد." },
              },
            },
            {
              id: "m16-l02-p01-q11", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "أي أمر يشغّل الواجهة SVI (بدونه تبقى مطفأة)؟",
                options: [{ id: "a", text: "interface vlan 10" }, { id: "b", text: "ip address 192.168.10.254 255.255.255.0" }, { id: "c", text: "show vlan brief" }, { id: "d", text: "no shutdown", correct: true }],
                feedback: { explanation: "interface vlan 10 يُنشئ واجهة افتراضية لـ VLAN 10، و ip address يعطيها عنوان IP وقناع شبكة، و no shutdown يشغّل الواجهة (بدونه تبقى مطفأة)." },
              },
            },
            {
              id: "m16-l02-p01-q12", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "بدون Gateway تعمل VLAN داخليًا، لكن أجهزتها لا تصل إلى الشبكات الأخرى.", answer: true, feedback: { explanation: "البوابة هي الباب الذي يخرج منه الجهاز إلى شبكة أخرى؛ بدون Gateway تعمل VLAN داخليًا، لكن أجهزتها لا تصل إلى الشبكات الأخرى." } },
            },
          ],
        },
      ],
    },
  ],
};

export default m16;
