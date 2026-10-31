// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 22 «بروتوكول DHCP».
//
// Verbatim conversion of booklet PDF pages 66–70 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every converted block is origin:"book": nothing is added, removed or reworded.
//
// Enrichment (docs/enterprise-791381s-enrichment-plan.md, Phase 6; the network lab: Phase 8B-3): teacher-enrichment blocks (visuals and CLI terminal
// simulations reused from course 791381 after checking their labels / commands against this section, and the end-of-unit
// «تدريبات الوحدة» lesson) are ADDED after the book blocks they explain. The book blocks stay verbatim — pinned by the book
// lock (bookLock.test.ts).

import type { ContentModule, ContentSource } from "../../types";
import type { CliExerciseConfig } from "../../../cli/types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };
const EX = (exercise: CliExerciseConfig): Record<string, unknown> => ({ ...exercise });

const m22: ContentModule = {
  id: "791381s-m22",
  title: "بروتوكول DHCP",
  order: 22,
  lessons: [
    {
      id: "791381s-m22-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m22-l00-p01",
          title: "بروتوكول DHCP",
          order: 1,
          layout: "opener",
          source: src(66),
          blocks: [
            {
              id: "m22-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الدفعة الخامسة · كتاب ص 169–179", unitNumber: "22", title: "بروتوكول DHCP",
              subtitle: "كيف تحصل الأجهزة على عنوان IP تلقائيًا؟ وكيف نبرمج ذلك على الراوتر أو السيرفر؟",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m22-l01",
      title: "بروتوكول DHCP",
      order: 1,
      pages: [
        {
          id: "791381s-m22-l01-p01",
          title: "ما هو DHCP؟",
          order: 1,
          source: src(66),
          blocks: [
            {
              id: "m22-l01-p01-def", type: "text", origin: "book",
              spans: [{ text: "DHCP يوزّع إعدادات الشبكة تلقائيًا على الأجهزة.", style: "strong" }],
            },
            {
              id: "m22-l01-p01-intro", type: "text", origin: "book",
              spans: [{ text: "في مدرسة فيها 100 حاسوب، إدخال العنوان يدويًا في كل حاسوب يأخذ وقتًا طويلًا ويسبّب أخطاء. مع DHCP يكفي أن يتصل الحاسوب بالشبكة، فيحصل وحده على كل الإعدادات." }],
            },
            {
              id: "m22-l01-p01-points", type: "list", origin: "book", variant: "plain",
              items: [
                {
                  id: "m22-l01-p01-pt1",
                  text: [{ text: "يعطي " }, { text: "عنوان IP", style: "strong" }, { text: " بدون إدخال يدوي." }],
                },
                {
                  id: "m22-l01-p01-pt2",
                  text: [
                    { text: "يوزّع أيضًا " },
                    { text: "Gateway", style: "strong" },
                    { text: " و " },
                    { text: "DNS", style: "strong" },
                    { text: " وقناع الشبكة." },
                  ],
                },
                { id: "m22-l01-p01-pt3", text: [{ text: "يوفّر الوقت ويقلّل أخطاء الإعدادات." }] },
              ],
            },
            {
              // ENRICHMENT: SVG of the points — a new device receives IP, Gateway and DNS automatically, from the router or from a
              // server (the two ways this section teaches on its later pages).
              id: "m22-l01-p01-v-auto", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m22/dhcp-automatic-config", motion: true,
              source: src(66),
              title: "مخطط: الجهاز يحصل على إعداداته تلقائيًا",
              alt: "على اليسار «راوتر كخادم DHCP» و«خادم DHCP مخصّص»، ومنهما تظهر بالتتابع ثلاث بطاقات: IP (عنوان IP)، Gateway (البوابة)، DNS (خادم DNS)، تصل إلى «جهاز جديد ينضمّ للشبكة» على اليمين؛ وتحتها «بلا إدخال يدوي لكل جهاز».",
              caption: "مع DHCP يكفي أن يتصل الجهاز بالشبكة، فيحصل وحده على عنوان IP و Gateway و DNS — من الراوتر أو من سيرفر.",
            },
            {
              id: "m22-l01-p01-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [{ text: "بدون DHCP نحتاج إدخال IP يدويًا لكل جهاز على حدة." }],
            },
          ],
        },
        {
          id: "791381s-m22-l01-p02",
          title: "مراحل عمل DHCP (DORA)",
          order: 2,
          source: src(66, 67),
          blocks: [
            {
              id: "m22-l01-p02-intro", type: "text", origin: "book",
              spans: [{ text: "عندما يتصل الجهاز بالشبكة، تحدث «محادثة» من 4 رسائل بينه وبين خادم DHCP:" }],
            },
            {
              id: "m22-l01-p02-drawing", type: "diagram", origin: "book",
              src: "/learning-assets/791381s/ec56acbe1158d77e.png",
              alt: "رسمة: «الجهاز» (حاسوب) على اليسار و«خادم DHCP» على اليمين، وبينهما أربعة أسهم بالترتيب: «1 · Discover — «هل يوجد خادم DHCP؟»» من الجهاز إلى الخادم، «2 · Offer — «نعم، خذ هذا العنوان»» من الخادم إلى الجهاز، «3 · Request — «أريد هذا العنوان»» من الجهاز إلى الخادم، «4 · ACK — «تمّ، العنوان لك»» من الخادم إلى الجهاز؛ وتحتها: «الطلب يبدأ من الجهاز، والخادم يردّ في كل مرة».",
            },
            {
              // ENRICHMENT: SVG next to the booklet drawing — the four messages travel one after another in their directions.
              id: "m22-l01-p02-v-dora", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m22/dhcp-dora", motion: true,
              source: src(66, 67),
              title: "مخطط متحرّك: رسائل DORA الأربع بالترتيب",
              alt: "«الجهاز» على اليسار و«خادم DHCP» على اليمين، وبينهما أربعة مسارات بالترتيب: Discover (الجهاز ← الخادم)، Offer (الخادم ← الجهاز)، Request (الجهاز ← الخادم)، ACK (الخادم ← الجهاز)؛ رسالة تتحرّك في كل مسار بعد انتهاء الذي قبله.",
              caption: "الطلب يبدأ من الجهاز، والخادم يردّ في كل مرة: Discover ← Offer ← Request ← ACK.",
            },
            {
              id: "m22-l01-p02-table", type: "table", origin: "book",
              headers: ["#", "الرسالة", "بالعربية", "من؟ ← إلى؟"],
              rows: [
                ["D", "Discover", "اكتشاف", "الجهاز يبحث عن خادم DHCP (رسالة بث للجميع)."],
                ["O", "Offer", "عرض", "الخادم يعرض عنوانًا على الجهاز."],
                ["R", "Request", "طلب", "الجهاز يطلب العنوان المعروض."],
                ["A", "ACK", "تأكيد", "الخادم يؤكّد: العنوان أصبح للجهاز."],
              ],
            },
            {
              id: "m22-l01-p02-memo", type: "text", origin: "book",
              spans: [{ text: "احفظها بالترتيب: Discover \u200F←\u200F Offer \u200F←\u200F Request \u200F←\u200F ACK (اختصارها: DORA)", style: "strong" }],
            },
          ],
        },
        {
          id: "791381s-m22-l01-p03",
          title: "مثال: DHCP على الراوتر",
          order: 3,
          source: src(67, 68),
          blocks: [
            {
              id: "m22-l01-p03-intro", type: "text", origin: "book",
              spans: [{ text: "نريد أن يكون الراوتر نفسه خادم DHCP يوزّع العناوين داخل الشبكة 192.168.1.0/24." }],
            },
            {
              id: "m22-l01-p03-table", type: "table", origin: "book",
              headers: ["المطلوب", "القيمة"],
              rows: [
                ["الشبكة", "192.168.1.0 /24"],
                ["عنوان الراوتر (Gateway)", "192.168.1.254"],
                ["عناوين لا نوزّعها (محجوزة)", "192.168.1.1 → 192.168.1.9"],
                ["خادم DNS", "8.8.8.8"],
              ],
              columnDirs: ["rtl", "ltr"],
            },
            { id: "m22-l01-p03-h-part1", type: "heading", origin: "book", level: 3, text: "الجزء الأول: عنوان الراوتر ومجموعة التوزيع" },
            { id: "m22-l01-p03-cli1-h", type: "heading", origin: "book", level: 4, text: "Router CLI", dir: "ltr" },
            {
              id: "m22-l01-p03-cli1", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: [
                "① Router(config)# interface g0/0",
                "② Router(config-if)# ip address 192.168.1.254 255.255.255.0",
                "③ Router(config-if)# no shutdown",
                "④ Router(config-if)# exit",
                "⑤ Router(config)# ip dhcp pool LAN",
                "⑥ Router(dhcp-config)# network 192.168.1.0 255.255.255.0",
              ].join("\n"),
            },
            {
              id: "m22-l01-p03-cli1-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m22-l01-p03-s1", text: [{ text: "نختار منفذ الراوتر المتصل بالشبكة." }] },
                {
                  id: "m22-l01-p03-s2",
                  text: [{ text: "نعطيه عنوانًا — هذا العنوان سيكون " }, { text: "Gateway", style: "strong" }, { text: " للأجهزة." }],
                },
                { id: "m22-l01-p03-s3", text: [{ text: "نشغّل المنفذ." }] },
                { id: "m22-l01-p03-s4", text: [{ text: "نرجع إلى وضع الإعدادات العامة." }] },
                {
                  id: "m22-l01-p03-s5",
                  text: [{ text: "ip dhcp pool LAN", style: "strong" }, { text: ": نُنشئ «مجموعة توزيع» اسمها LAN." }],
                },
                {
                  id: "m22-l01-p03-s6",
                  text: [{ text: "network", style: "strong" }, { text: ": الشبكة التي سنوزّع منها العناوين." }],
                },
              ],
            },
            {
              // ENRICHMENT: CLI — the student types the six lines of the «الجزء الأول» box (interface g0/0, the router address
              // 192.168.1.254 /24, no shutdown, exit, ip dhcp pool LAN, network 192.168.1.0 /24), starting at Router(config)#.
              id: "m22-l01-p03-sim-part1", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مثال موجّه: نفّذ الجزء الأول في محاكي سطر الأوامر",
              description: "أنت في وضع الإعدادات العامة Router(config)#. اكتب أوامر صندوق الجزء الأول بالترتيب ثم اضغط Enter بعد كل أمر. المحاكي يتحقّق من الوضع الذي أنت فيه ومن الأمر، ويعطيك تلميحين عند الحاجة. محاكاة تعليمية مبسّطة، ليست جهازًا حقيقيًا.",
              source: src(67, 68),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "الجزء الأول: interface g0/0 ثم ip address 192.168.1.254 255.255.255.0 ثم no shutdown ثم exit ثم ip dhcp pool LAN ثم network 192.168.1.0 255.255.255.0." },
              config: EX({
                kind: "guided",
                device: "router",
                startMode: "global",
                intro: "اجعل الراوتر خادم DHCP يوزّع العناوين داخل الشبكة 192.168.1.0/24 — الجزء الأول: عنوان الراوتر ومجموعة التوزيع.",
                steps: [
                  { id: "s1", instruction: "اختر منفذ الراوتر g0/0 المتصل بالشبكة", expect: { command: "interface", args: { interfaces: ["g0/0"] } }, success: "✓ أحسنت، أنت الآن داخل المنفذ g0/0", hints: ["السطر ① في صندوق الكتاب.", "interface ثم اسم المنفذ g0/0."] },
                  { id: "s2", instruction: "أعطِ المنفذ العنوان 192.168.1.254 بالقناع 255.255.255.0 — سيكون Gateway للأجهزة", expect: { command: "ip-address", args: { address: "192.168.1.254", mask: "255.255.255.0" } }, success: "✓ أحسنت، هذا العنوان هو Gateway للأجهزة", hints: ["السطر ② في صندوق الكتاب.", "ip address ثم العنوان ثم القناع."] },
                  { id: "s3", instruction: "شغّل المنفذ", expect: { command: "no-shutdown" }, success: "✓ أحسنت، المنفذ يعمل", hints: ["السطر ③ في صندوق الكتاب.", "كلمتان: no ثم shutdown."] },
                  { id: "s4", instruction: "ارجع إلى وضع الإعدادات العامة", expect: { mode: "global" }, success: "✓ أحسنت، رجعت إلى Router(config)#", hints: ["السطر ④ في صندوق الكتاب.", "كلمة واحدة: exit."] },
                  { id: "s5", instruction: "أنشئ «مجموعة توزيع» اسمها LAN", expect: { command: "ip-dhcp-pool", args: { name: "LAN" } }, success: "✓ أحسنت، أنت الآن داخل مجموعة التوزيع LAN", hints: ["السطر ⑤ في صندوق الكتاب.", "ip dhcp pool ثم الاسم LAN."] },
                  { id: "s6", instruction: "حدّد الشبكة التي سنوزّع منها العناوين: 192.168.1.0 بالقناع 255.255.255.0", expect: { command: "network", args: { address: "192.168.1.0", mask: "255.255.255.0" } }, success: "✓ أحسنت، حدّدت الشبكة", hints: ["السطر ⑥ في صندوق الكتاب.", "network ثم عنوان الشبكة ثم القناع."] },
                ],
                allowed: ["ip-address", "no-shutdown", "network"],
                completion: "✓ أحسنت، أنهيت الجزء الأول كما في الكتاب. الجزء الثاني بعد الصندوق التالي.",
              }),
            },
            { id: "m22-l01-p03-h-part2", type: "heading", origin: "book", level: 3, text: "الجزء الثاني: البوابة و DNS والعناوين المستثناة" },
            { id: "m22-l01-p03-cli2-h", type: "heading", origin: "book", level: 4, text: "Router CLI", dir: "ltr" },
            {
              id: "m22-l01-p03-cli2", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: [
                "① Router(dhcp-config)# default-router 192.168.1.254",
                "② Router(dhcp-config)# dns-server 8.8.8.8",
                "③ Router(dhcp-config)# exit",
                "④ Router(config)# ip dhcp excluded-address 192.168.1.1 192.168.1.9",
              ].join("\n"),
            },
            {
              id: "m22-l01-p03-cli2-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                {
                  id: "m22-l01-p03-t1",
                  text: [{ text: "default-router", style: "strong" }, { text: ": عنوان Gateway الذي سيُعطى للأجهزة." }],
                },
                {
                  id: "m22-l01-p03-t2",
                  text: [{ text: "dns-server", style: "strong" }, { text: ": عنوان خادم DNS الذي سيُعطى للأجهزة." }],
                },
                { id: "m22-l01-p03-t3", text: [{ text: "نخرج من مجموعة التوزيع." }] },
                {
                  id: "m22-l01-p03-t4",
                  text: [
                    { text: "excluded-address", style: "strong" },
                    { text: ": نستثني العناوين من 1 إلى 9، فلا يوزّعها DHCP. تُكتب في وضع الإعدادات العامة." },
                  ],
                },
              ],
            },
            {
              // ENRICHMENT: CLI — the four lines of the «الجزء الثاني» box, starting inside the pool LAN that part 1 created
              // (default-router 192.168.1.254, dns-server 8.8.8.8, exit, ip dhcp excluded-address 192.168.1.1 192.168.1.9).
              id: "m22-l01-p03-sim-part2", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "تحدّي الأمر: أكمل الجزء الثاني بنفسك",
              description: "أنت داخل مجموعة التوزيع LAN بعد الجزء الأول (Router(dhcp-config)#). اكتب الأمر المطلوب في كل سؤال؛ المحاكي يخبرك إن كان صحيحًا أو إن كنت في الوضع غير المناسب، دون كشف الإجابة. محاكاة تعليمية مبسّطة.",
              source: src(67, 68),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "الجزء الثاني: default-router 192.168.1.254 ثم dns-server 8.8.8.8 ثم exit ثم — في وضع الإعدادات العامة — ip dhcp excluded-address 192.168.1.1 192.168.1.9." },
              config: EX({
                kind: "challenge",
                device: "router",
                startMode: "dhcp",
                startPool: "LAN",
                preset: {
                  interfaces: { "g0/0": { ipAddress: "192.168.1.254", subnetMask: "255.255.255.0", shutdown: false } },
                  dhcpPools: { LAN: { network: "192.168.1.0", mask: "255.255.255.0" } },
                },
                intro: "أنت داخل مجموعة التوزيع LAN بعد الجزء الأول. اكتب الأمر المطلوب في كل سؤال.",
                steps: [
                  { id: "c1", instruction: "اكتب الأمر الذي يحدّد عنوان Gateway الذي سيُعطى للأجهزة: 192.168.1.254", expect: { command: "default-router", args: { address: "192.168.1.254" } }, hints: ["السطر ① في صندوق الجزء الثاني، ويُكتب داخل مجموعة التوزيع.", "الأمر يبدأ بـ default- ويليه العنوان."] },
                  { id: "c2", instruction: "اكتب الأمر الذي يحدّد عنوان خادم DNS الذي سيُعطى للأجهزة: 8.8.8.8", expect: { command: "dns-server", args: { addresses: ["8.8.8.8"] } }, hints: ["السطر ② في صندوق الجزء الثاني.", "الأمر يبدأ بـ dns- ويليه العنوان."] },
                  { id: "c3", instruction: "اخرج من مجموعة التوزيع إلى وضع الإعدادات العامة", expect: { mode: "global" }, hints: ["السطر ③ في صندوق الجزء الثاني.", "كلمة واحدة تبدأ بـ ex."] },
                  { id: "c4", instruction: "اكتب الأمر الذي يستثني العناوين من 192.168.1.1 إلى 192.168.1.9 فلا يوزّعها DHCP", expect: { command: "ip-dhcp-excluded-address", args: { from: "192.168.1.1", to: "192.168.1.9" } }, hints: ["السطر ④ في صندوق الجزء الثاني، ويُكتب في وضع الإعدادات العامة.", "الأمر يبدأ بـ ip dhcp excluded-address ويليه عنوان البداية ثم عنوان النهاية."] },
                ],
                allowed: ["default-router", "dns-server", "ip-dhcp-excluded-address"],
                completion: "✓ صحيح في كل الأوامر — أكملت الجزء الثاني كما في الكتاب.",
              }),
            },
            {
              id: "m22-l01-p03-why", type: "callout", origin: "book", kind: "summary", title: "لماذا نستثني عناوين؟",
              spans: [{ text: "نحجز عناوين للراوتر والسيرفرات والطابعات (عناوين ثابتة)، حتى لا يأخذها حاسوب عادي." }],
            },
            { id: "m22-l01-p03-h-extra", type: "heading", origin: "book", level: 4, text: "مثال إضافي" },
            {
              id: "m22-l01-p03-extra", type: "text", origin: "book",
              spans: [{ text: "إذا أردنا أن يوزّع DHCP فقط العناوين من 10. حتى 50.، نستثني أيضًا الباقي:" }],
            },
            {
              id: "m22-l01-p03-extra-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: "✓ Router(config)# ip dhcp excluded-address 192.168.1.51 192.168.1.254",
            },
            {
              // ENRICHMENT: SVG of the «مثال إضافي» — with 1→9 and 51→254 excluded, only .10 → .50 is distributed; the router
              // (192.168.1.254) is both the DHCP server and the Gateway.
              id: "m22-l01-p03-v-pool", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m22/dhcp-pool-excluded", motion: false,
              source: src(68),
              title: "مخطط: ما يوزّعه DHCP في المثال الإضافي",
              alt: "شريط عناوين الشبكة 192.168.1.0/24 من ثلاثة أجزاء: ‎.1 – .9 «لا توزَّع»، ثم «نطاق DHCP» من 192.168.1.10 إلى 192.168.1.50 «تُوزَّع تلقائيًا»، ثم ‎.51 – .253 «لا توزَّع»؛ وتحته «الراوتر: خادم DHCP في هذا المثال وهو البوابة أيضًا» و«البوابة 192.168.1.254 خارج النطاق».",
              caption: "مع استثناء 1 إلى 9 و 51 إلى 254، يوزّع DHCP فقط العناوين من 192.168.1.10 حتى 192.168.1.50.",
            },
          ],
        },
        {
          id: "791381s-m22-l01-p04",
          title: "ملاحظات مهمة عن DHCP",
          order: 4,
          source: src(69),
          blocks: [
            {
              id: "m22-l01-p04-notes", type: "list", origin: "book", variant: "plain",
              items: [
                {
                  id: "m22-l01-p04-n1",
                  text: [{ text: "العناوين المستثناة " }, { text: "لا توزّع", style: "strong" }, { text: " على الأجهزة." }],
                },
                { id: "m22-l01-p04-n2", text: [{ text: "الراوتر يعيد استخدام العناوين غير المستعملة." }] },
                { id: "m22-l01-p04-n3", text: [{ text: "لكل عنوان مدة. إذا انتهت المدة، الجهاز يجدّد العنوان." }] },
                {
                  id: "m22-l01-p04-n4",
                  text: [
                    { text: "إذا فشل DHCP، يأخذ الجهاز عنوان " },
                    { text: "APIPA", style: "strong" },
                    { text: " الذي يبدأ بـ 169.254.x.x." },
                  ],
                },
              ],
            },
            {
              id: "m22-l01-p04-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [
                { text: "إذا رأيت عنوانًا يبدأ بـ 169.254 فهذه " },
                { text: "إشارة لمشكلة في DHCP", style: "strong" },
                { text: "." },
              ],
            },
          ],
        },
        {
          id: "791381s-m22-l01-p05",
          title: "DHCP عن طريق Server (في Packet Tracer)",
          order: 5,
          source: src(69, 70),
          blocks: [
            {
              id: "m22-l01-p05-intro", type: "text", origin: "book",
              spans: [{ text: "بدل الراوتر، يمكن أن يوزّع العناوين جهاز سيرفر. الفكرة نفسها: جهاز مركزي يوزّع إعدادات الشبكة على الأجهزة. في Packet Tracer نعمل ذلك بالفأرة، بدون أوامر." }],
            },
            {
              id: "m22-l01-p05-drawing", type: "diagram", origin: "book",
              src: "/learning-assets/791381s/38ddc5616c00e101.png",
              alt: "رسمة: منطقة منقّطة عنوانها «أجهزة الشبكة» فيها ثلاثة حواسيب متصلة بـ «Switch»، و«Switch» متصل بمنطقة منقّطة عنوانها «جهاز Server» فيها خادم وتحته «DHCP Service».",
            },
            {
              // ENRICHMENT: SVG next to the booklet drawing — the server → Switch → devices chain on the example network.
              id: "m22-l01-p05-v-server", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m22/dedicated-dhcp-server", motion: false,
              source: src(69, 70),
              title: "مخطط: سيرفر مركزي يوزّع الإعدادات",
              alt: "«خادم Server» مكتوب عليه «DHCP مركزي» موصول بـ «Switch»، والسويتش موصول بجهازين؛ وتحت السويتش «توزيع تلقائي للإعدادات» والشبكة 192.168.10.0/24.",
              caption: "الفكرة نفسها: جهاز مركزي — هنا سيرفر بدل الراوتر — يوزّع إعدادات الشبكة 192.168.10.0/24 على الأجهزة.",
            },
            {
              id: "m22-l01-p05-table", type: "table", origin: "book",
              headers: ["الخطوة", "ماذا نفعل؟"],
              rows: [
                ["1. الدخول", "نفتح جهاز Server في Packet Tracer ← تبويب Services ← نختار خدمة DHCP."],
                ["2. التشغيل", "نختار On لتفعيل الخدمة. (إذا بقيت Off لن يحصل الحاسوب على عنوان IP.)"],
                ["3. التعريفات", "نكتب Default Gateway و DNS Server، ونحدّد Start IP (أول عنوان) وعدد العناوين."],
                ["4. الحفظ", "نضغط Add أو Save حسب الواجهة."],
                ["5. التجربة", "في الحاسوب: نختار DHCP بدل Static — فيحصل على العنوان تلقائيًا."],
              ],
            },
            {
              id: "m22-l01-p05-example", type: "callout", origin: "book", kind: "tip", title: "مثال",
              spans: [{ text: "الشبكة 192.168.10.0/24: البوابة 192.168.10.1، و DNS\u200F 8.8.8.8، و Start IP\u200F 192.168.10.10." }],
            },
          ],
        },
      ],
    },
    {
      // «تدريبات الوحدة» — ADDED enrichment: an end-of-unit exercise page after the booklet's own pages. Every question is
      // answered by the section's printed text above (the explanation quotes it). The book pages are unchanged (book lock).
      id: "791381s-m22-l02",
      title: "تدريبات الوحدة",
      order: 2,
      pages: [
        {
          id: "791381s-m22-l02-p01",
          title: "تدريبات الوحدة: بروتوكول DHCP",
          order: 1,
          layout: "practice",
          source: src(66, 70),
          blocks: [
            {
              id: "m22-l02-p01-q01", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ماذا يوزّع DHCP على الأجهزة تلقائيًا؟",
                options: [{ id: "a", text: "عنوان IP فقط." }, { id: "b", text: "عنوان IP و Gateway و DNS وقناع الشبكة.", correct: true }, { id: "c", text: "اسم الشبكة SSID فقط." }, { id: "d", text: "كلمات المرور فقط." }],
                feedback: { explanation: "DHCP يوزّع إعدادات الشبكة تلقائيًا: يعطي عنوان IP بدون إدخال يدوي، ويوزّع أيضًا Gateway و DNS وقناع الشبكة." },
              },
            },
            {
              id: "m22-l02-p01-q02", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "ordering", prompt: "رتّب رسائل DHCP الأربع كما تحدث عندما يتصل الجهاز بالشبكة:",
                items: [
                  { id: "request", text: "Request — طلب" },
                  { id: "ack", text: "ACK — تأكيد" },
                  { id: "discover", text: "Discover — اكتشاف" },
                  { id: "offer", text: "Offer — عرض" },
                ],
                order: ["discover", "offer", "request", "ack"],
                feedback: { explanation: "احفظها بالترتيب: Discover ← Offer ← Request ← ACK (اختصارها: DORA)." },
              },
            },
            {
              id: "m22-l02-p01-q03", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "classify", prompt: "صنّف كل رسالة حسب من يرسلها (عمود «من؟ ← إلى؟» في الجدول):",
                groups: [{ id: "device", text: "يرسلها الجهاز" }, { id: "server", text: "يرسلها خادم DHCP" }],
                items: [
                  { id: "offer", text: "Offer" },
                  { id: "discover", text: "Discover" },
                  { id: "ack", text: "ACK" },
                  { id: "request", text: "Request" },
                ],
                assign: { offer: "server", discover: "device", ack: "server", request: "device" },
                feedback: { explanation: "من الجدول: الجهاز يبحث عن خادم DHCP (Discover)، والخادم يعرض عنوانًا (Offer)، والجهاز يطلب العنوان المعروض (Request)، والخادم يؤكّد (ACK). الطلب يبدأ من الجهاز، والخادم يردّ في كل مرة." },
              },
            },
            {
              id: "m22-l02-p01-q04", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "أي رسالة يرسلها الجهاز بثًا للجميع بحثًا عن خادم DHCP؟",
                options: [{ id: "a", text: "Offer" }, { id: "b", text: "ACK" }, { id: "c", text: "Discover", correct: true }, { id: "d", text: "Request" }],
                feedback: { explanation: "من الجدول: Discover (اكتشاف) — الجهاز يبحث عن خادم DHCP (رسالة بث للجميع)." },
              },
            },
            {
              id: "m22-l02-p01-q05", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "matching", prompt: "صِل كل أمر من مثال الراوتر بوظيفته:",
                left: [
                  { id: "pool", text: "ip dhcp pool LAN" },
                  { id: "network", text: "network" },
                  { id: "gw", text: "default-router" },
                  { id: "dns", text: "dns-server" },
                  { id: "excl", text: "ip dhcp excluded-address" },
                ],
                right: [
                  { id: "r1", text: "عنوان خادم DNS الذي سيُعطى للأجهزة" },
                  { id: "r2", text: "نستثني عناوين فلا يوزّعها DHCP" },
                  { id: "r3", text: "نُنشئ «مجموعة توزيع» اسمها LAN" },
                  { id: "r4", text: "عنوان Gateway الذي سيُعطى للأجهزة" },
                  { id: "r5", text: "الشبكة التي سنوزّع منها العناوين" },
                ],
                pairs: { pool: "r3", network: "r5", gw: "r4", dns: "r1", excl: "r2" },
                feedback: { explanation: "ip dhcp pool LAN: نُنشئ «مجموعة توزيع» اسمها LAN · network: الشبكة التي سنوزّع منها العناوين · default-router: عنوان Gateway للأجهزة · dns-server: عنوان خادم DNS للأجهزة · excluded-address: نستثني العناوين فلا يوزّعها DHCP." },
              },
            },
            {
              id: "m22-l02-p01-q06", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "في أي وضع يُكتب الأمر ip dhcp excluded-address 192.168.1.1 192.168.1.9؟",
                options: [{ id: "a", text: "وضع الإعدادات العامة Router(config)#", correct: true }, { id: "b", text: "داخل مجموعة التوزيع Router(dhcp-config)#" }, { id: "c", text: "داخل المنفذ Router(config-if)#" }],
                feedback: { explanation: "excluded-address: نستثني العناوين من 1 إلى 9، فلا يوزّعها DHCP. تُكتب في وضع الإعدادات العامة — لذلك نخرج من مجموعة التوزيع (exit) قبلها." },
              },
            },
            {
              id: "m22-l02-p01-q07", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "نريد أن يوزّع DHCP فقط العناوين من 10. حتى 50. (والعناوين من 1 إلى 9 مستثناة). أي أمر نضيف؟",
                options: [{ id: "a", text: "network 192.168.1.50 255.255.255.0" }, { id: "b", text: "ip dhcp excluded-address 192.168.1.10 192.168.1.50" }, { id: "c", text: "default-router 192.168.1.50" }, { id: "d", text: "ip dhcp excluded-address 192.168.1.51 192.168.1.254", correct: true }],
                feedback: { explanation: "المثال الإضافي: إذا أردنا أن يوزّع DHCP فقط العناوين من 10. حتى 50.، نستثني أيضًا الباقي: Router(config)# ip dhcp excluded-address 192.168.1.51 192.168.1.254." },
              },
            },
            {
              id: "m22-l02-p01-q08", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "العناوين المستثناة توزَّع على الأجهزة.", answer: false, feedback: { explanation: "ملاحظة مهمة: العناوين المستثناة لا توزّع على الأجهزة. نحجزها للراوتر والسيرفرات والطابعات (عناوين ثابتة)، حتى لا يأخذها حاسوب عادي." } },
            },
            {
              id: "m22-l02-p01-q09", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "wordBank", prompt: "أكمل ملاحظات DHCP من مخزن الكلمات:",
                segments: ["لكل عنوان ", { blank: "b1" }, ". إذا انتهت المدة، الجهاز ", { blank: "b2" }, " العنوان. وإذا فشل DHCP، يأخذ الجهاز عنوان ", { blank: "b3" }, " الذي يبدأ بـ 169.254.x.x."],
                bank: ["يحذف", "مدة", "Gateway", "APIPA", "يجدّد"],
                answers: { b1: "مدة", b2: "يجدّد", b3: "APIPA" },
                feedback: { explanation: "لكل عنوان مدة. إذا انتهت المدة، الجهاز يجدّد العنوان. إذا فشل DHCP، يأخذ الجهاز عنوان APIPA الذي يبدأ بـ 169.254.x.x." },
              },
            },
            {
              id: "m22-l02-p01-q10", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "رأيت على حاسوب عنوانًا يبدأ بـ 169.254. ماذا يعني ذلك؟",
                options: [{ id: "a", text: "DHCP أعطى الحاسوب عنوانه بنجاح." }, { id: "b", text: "العنوان من العناوين المستثناة." }, { id: "c", text: "إشارة لمشكلة في DHCP.", correct: true }, { id: "d", text: "الحاسوب هو Gateway الشبكة." }],
                feedback: { explanation: "تذكّر: إذا رأيت عنوانًا يبدأ بـ 169.254 فهذه إشارة لمشكلة في DHCP — إذا فشل DHCP، يأخذ الجهاز عنوان APIPA." },
              },
            },
            {
              id: "m22-l02-p01-q11", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "إذا بقيت خدمة DHCP على Server في وضع Off، فلن يحصل الحاسوب على عنوان IP.", answer: true, feedback: { explanation: "خطوة التشغيل: نختار On لتفعيل الخدمة. (إذا بقيت Off لن يحصل الحاسوب على عنوان IP.)" } },
            },
            {
              id: "m22-l02-p01-q12", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "ordering", prompt: "رتّب خطوات إعداد DHCP على Server في Packet Tracer:",
                items: [
                  { id: "save", text: "نضغط Add أو Save حسب الواجهة." },
                  { id: "on", text: "نختار On لتفعيل الخدمة." },
                  { id: "test", text: "في الحاسوب: نختار DHCP بدل Static." },
                  { id: "open", text: "نفتح جهاز Server ← تبويب Services ← نختار خدمة DHCP." },
                  { id: "def", text: "نكتب Default Gateway و DNS Server، ونحدّد Start IP وعدد العناوين." },
                ],
                order: ["open", "on", "def", "save", "test"],
                feedback: { explanation: "الخطوات: 1. الدخول (Server ← Services ← DHCP)، 2. التشغيل (On)، 3. التعريفات (Default Gateway و DNS Server و Start IP وعدد العناوين)، 4. الحفظ (Add أو Save)، 5. التجربة (في الحاسوب: DHCP بدل Static)." },
              },
            },
            {
              // Phase 8B-3 — a network lab on the curriculum network simulator (networkTopology@2) with this unit's own values; the
              // SERVER replays and judges it (checks, feedback and solution never reach the browser). Checked only — not counted in
              // Study Strength until the owner decides (§11.3). Proven by networkLab.contract.test.ts (no free credit, solution passes).
              id: "m22-l02-p01-lab-dhcp", type: "simulation", origin: "teacher-enrichment", simulationType: "network-lab", version: 1, studyEligible: false,
              title: "مختبر شبكي: الراوتر خادم DHCP",
              description: "مختبر على محاكي الشبكات: اجعل الراوتر يوزّع العناوين تلقائيًا على الأجهزة، ثم اضغط «تحقّق من الإعداد».",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "interface g0/0، ip address 192.168.1.254 255.255.255.0، no shutdown؛ ip dhcp pool LAN، network 192.168.1.0 255.255.255.0، default-router 192.168.1.254، dns-server 8.8.8.8؛ ip dhcp excluded-address 192.168.1.1 192.168.1.9؛ ثم ipconfig /renew على PC1." },
              config: {
                topology: {"v":2,"devices":[{"id":"r1","kind":"router","label":"R1","x":0.5,"y":0.1},{"id":"sw1","kind":"switch","label":"SW1","x":0.5,"y":0.45},{"id":"pc1","kind":"pc","label":"PC1","x":0.3,"y":0.85,"initial":{"v":2,"device":"host","adapters":{"eth0":{"mode":"dhcp"}}}},{"id":"pc2","kind":"pc","label":"PC2","x":0.7,"y":0.85,"initial":{"v":2,"device":"host","adapters":{"eth0":{"mode":"dhcp"}}}}],"links":[{"id":"u","a":{"deviceId":"r1","port":"g0/0"},"b":{"deviceId":"sw1","port":"g0/1"}},{"id":"a","a":{"deviceId":"sw1","port":"f0/1"},"b":{"deviceId":"pc1","port":"eth0"}},{"id":"b","a":{"deviceId":"sw1","port":"f0/2"},"b":{"deviceId":"pc2","port":"eth0"}}]},
                task: {
                  intro: "نريد أن يكون الراوتر R1 نفسه خادم DHCP يوزّع العناوين داخل الشبكة 192.168.1.0/24. أعطِ المنفذ g0/0 العنوان 192.168.1.254 وشغّله، وأنشئ ip dhcp pool LAN بالشبكة والبوابة وخادم DNS 8.8.8.8، واحجز العناوين 192.168.1.1 إلى 192.168.1.9. ثم اطلب من PC1 عنوانًا (ipconfig /renew في Command Prompt).",
                  goals: [{"id":"ip","label":"R1: المنفذ g0/0 بالعنوان 192.168.1.254"},{"id":"up","label":"R1: المنفذ g0/0 مشغّل (no shutdown)"},{"id":"pool","label":"مجموعة التوزيع ip dhcp pool LAN موجودة"},{"id":"net","label":"network 192.168.1.0 255.255.255.0"},{"id":"gw","label":"default-router 192.168.1.254"},{"id":"dns","label":"dns-server 8.8.8.8"},{"id":"ex","label":"ip dhcp excluded-address 192.168.1.1 192.168.1.9"},{"id":"lease","label":"PC1 حصل على عنوان تلقائيًا من DHCP"}],
                },
                checks: [{"id":"ip","label":"R1: المنفذ g0/0 بالعنوان 192.168.1.254","weight":1,"kind":"router.ipAddress","deviceId":"r1","interface":"g0/0","value":"192.168.1.254"},{"id":"up","label":"R1: المنفذ g0/0 مشغّل (no shutdown)","weight":1,"kind":"router.interfaceEnabled","deviceId":"r1","interface":"g0/0","value":true},{"id":"pool","label":"مجموعة التوزيع ip dhcp pool LAN موجودة","weight":1,"kind":"router.dhcpPool","deviceId":"r1","pool":"LAN","value":true},{"id":"net","label":"network 192.168.1.0 255.255.255.0","weight":1,"kind":"router.dhcpNetwork","deviceId":"r1","pool":"LAN","value":"192.168.1.0 255.255.255.0"},{"id":"gw","label":"default-router 192.168.1.254","weight":1,"kind":"router.dhcpDefaultRouter","deviceId":"r1","pool":"LAN","value":"192.168.1.254"},{"id":"dns","label":"dns-server 8.8.8.8","weight":1,"kind":"router.dhcpDns","deviceId":"r1","pool":"LAN","value":"8.8.8.8"},{"id":"ex","label":"ip dhcp excluded-address 192.168.1.1 192.168.1.9","weight":1,"kind":"router.dhcpExcluded","deviceId":"r1","value":"192.168.1.1 192.168.1.9"},{"id":"lease","label":"PC1 حصل على عنوان تلقائيًا من DHCP","weight":1,"kind":"host.dhcpLease","deviceId":"pc1","adapter":"eth0","value":true}],
                feedback: {
                  correctFeedback: "أحسنت! تحققت كل أهداف المختبر.",
                  incorrectFeedback: "لم تتحقق كل الأهداف بعد.",
                  hints: ["interface g0/0 ثم ip address 192.168.1.254 255.255.255.0 ثم no shutdown ثم exit.","ip dhcp pool LAN ثم network 192.168.1.0 255.255.255.0 ثم default-router 192.168.1.254 ثم dns-server 8.8.8.8 ثم exit.","في الإعدادات العامة: ip dhcp excluded-address 192.168.1.1 192.168.1.9، ثم على PC1: ipconfig /renew."],
                  explanation: "DHCP يوزّع إعدادات الشبكة تلقائيًا على الأجهزة بدون إدخال يدوي: العنوان وقناع الشبكة والبوابة وخادم DNS. default-router هو عنوان Gateway للأجهزة، و excluded-address يحجز عناوين لا يوزّعها الخادم.",
                },
                solution: [{"type":"router.command","deviceId":"r1","command":"enable"},{"type":"router.command","deviceId":"r1","command":"configure terminal"},{"type":"router.command","deviceId":"r1","command":"interface g0/0"},{"type":"router.command","deviceId":"r1","command":"ip address 192.168.1.254 255.255.255.0"},{"type":"router.command","deviceId":"r1","command":"no shutdown"},{"type":"router.command","deviceId":"r1","command":"exit"},{"type":"router.command","deviceId":"r1","command":"ip dhcp pool LAN"},{"type":"router.command","deviceId":"r1","command":"network 192.168.1.0 255.255.255.0"},{"type":"router.command","deviceId":"r1","command":"default-router 192.168.1.254"},{"type":"router.command","deviceId":"r1","command":"dns-server 8.8.8.8"},{"type":"router.command","deviceId":"r1","command":"exit"},{"type":"router.command","deviceId":"r1","command":"ip dhcp excluded-address 192.168.1.1 192.168.1.9"},{"type":"router.command","deviceId":"r1","command":"end"},{"type":"host.command","deviceId":"pc1","command":"ipconfig /renew"}],
              },
            },
            { id: "m22-l02-p01-lib-t19", type: "library-training", origin: "teacher-enrichment", trainingId: "T19", label: "تدريب 19", requiredModuleId: "791381s-m22" },
          ],
        },
      ],
    },
  ],
};

export default m22;
