// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 20 «المنطقة العازلة DMZ والشبكات اللاسلكية».
//
// Verbatim conversion of booklet PDF pages 59–63 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every converted block is origin:"book": nothing is added, removed or reworded.
//
// Enrichment (docs/enterprise-791381s-enrichment-plan.md, Phase 6): teacher-enrichment blocks (visuals reused from course
// 791381 after checking their labels against this section, and the end-of-unit «تدريبات الوحدة» lesson) are ADDED after the
// book blocks they explain. The book blocks stay verbatim — pinned by the book lock (bookLock.test.ts).

import type { ContentModule, ContentSource } from "../../types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };

const m20: ContentModule = {
  id: "791381s-m20",
  title: "المنطقة العازلة DMZ والشبكات اللاسلكية",
  order: 20,
  lessons: [
    {
      id: "791381s-m20-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m20-l00-p01",
          title: "المنطقة العازلة DMZ والشبكات اللاسلكية",
          order: 1,
          layout: "opener",
          source: src(59),
          blocks: [
            {
              id: "m20-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الدفعة الخامسة · كتاب ص 159–165", unitNumber: "20", title: "المنطقة العازلة DMZ والشبكات اللاسلكية",
              subtitle: "كيف نحمي الشبكة الداخلية؟ وكيف تعمل شبكة Wi-Fi وكيف نؤمّنها؟",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m20-l01",
      title: "المنطقة العازلة DMZ والشبكات اللاسلكية",
      order: 1,
      pages: [
        {
          id: "791381s-m20-l01-p01",
          title: "المنطقة العازلة DMZ",
          order: 1,
          source: src(59, 60),
          blocks: [
            {
              id: "m20-l01-p01-def", type: "text", origin: "book",
              spans: [{ text: "DMZ منطقة بين الشبكة الداخلية والإنترنت، نضع فيها الخدمات العامة مثل خادم الموقع.", style: "strong" }],
            },
            {
              id: "m20-l01-p01-intro", type: "text", origin: "book",
              spans: [{ text: "تخيّل مدرسة لها غرفة استقبال للزوار: الزائر يدخل غرفة الاستقبال فقط، ولا يدخل الصفوف. كذلك DMZ: الناس من الإنترنت يصلون إلى الخدمات العامة فقط، ولا يدخلون شبكة الموظفين." }],
            },
            {
              id: "m20-l01-p01-drawing", type: "diagram", origin: "book",
              src: "/learning-assets/791381s/d14a4a3e8a55c716.png",
              alt: "رسمة: سحابة «الإنترنت»، ثم «جدار حماية»، ثم منطقة منقّطة عنوانها «DMZ» فيها ثلاثة خوادم «Web» و«Mail» و«DNS» تحتها «خدمات عامة»، ثم «جدار حماية» ثانٍ، ثم منطقة منقّطة عنوانها «الشبكة الداخلية» فيها حاسوبان وتحتهما «محمية»؛ وتحت الرسمة: «الزائر يصل إلى DMZ فقط — ولا يدخل الشبكة الداخلية».",
            },
            {
              // ENRICHMENT: SVG next to the booklet drawing — the same three zones and two firewalls; the visitor stops in the DMZ.
              id: "m20-l01-p01-v-dmz", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m20/dmz-three-zone", motion: true,
              source: src(59, 60),
              title: "مخطط: الزائر يصل إلى DMZ فقط",
              alt: "ثلاث مناطق متتالية: «الإنترنت» (خارج الشبكة)، ثم جدار حماية، ثم «DMZ» فيها خدمات عامة Web و Mail و DNS، ثم جدار ثانٍ، ثم «الشبكة الداخلية» (محمية). زائر ينطلق من الإنترنت، يعبر الجدار الأول ويتوقف داخل DMZ، ولا يصل إلى الشبكة الداخلية.",
              caption: "الناس من الإنترنت يصلون إلى الخدمات العامة في DMZ فقط، ولا يدخلون الشبكة الداخلية.",
            },
            {
              id: "m20-l01-p01-points", type: "list", origin: "book", variant: "plain",
              items: [
                {
                  id: "m20-l01-p01-pt1",
                  text: [
                    { text: "تسمح بخدمات عامة مثل " },
                    { text: "Web", style: "strong" },
                    { text: " و " },
                    { text: "Mail", style: "strong" },
                    { text: " و " },
                    { text: "DNS", style: "strong" },
                    { text: "." },
                  ],
                },
                { id: "m20-l01-p01-pt2", text: [{ text: "تحمي الشبكة الداخلية من الوصول المباشر." }] },
              ],
            },
            {
              id: "m20-l01-p01-example", type: "callout", origin: "book", kind: "tip", title: "مثال",
              spans: [{ text: "نضع خادم موقع المدرسة في DMZ، وليس داخل شبكة الموظفين. هكذا يستطيع الجميع فتح الموقع، وتبقى ملفات الموظفين محمية." }],
            },
          ],
        },
        {
          id: "791381s-m20-l01-p02",
          title: "الشبكة اللاسلكية Wi-Fi",
          order: 2,
          source: src(60),
          blocks: [
            {
              id: "m20-l01-p02-def", type: "text", origin: "book",
              spans: [{ text: "Wi-Fi تقنية اتصال بدون كوابل، تعتمد على موجات الراديو.", style: "strong" }],
            },
            {
              id: "m20-l01-p02-intro", type: "text", origin: "book",
              spans: [{ text: "بدل أن نوصل كابلًا لكل جهاز، ترسل الأجهزة البيانات في الهواء بموجات الراديو. لذلك نستطيع أن نتحرّك بالهاتف أو الحاسوب داخل البيت ونبقى متصلين." }],
            },
            {
              // ENRICHMENT: SVG of the definition — a device reaches the network over radio waves, no cable drawn.
              id: "m20-l01-p02-v-radio", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m20/wifi-radio-link", motion: true,
              source: src(60),
              title: "مخطط: اتصال بدون كوابل عبر موجات الراديو",
              alt: "جهاز على اليسار و«الشبكة» على اليمين، وبينهما ثلاثة أقواس موجات راديو تظهر واحدًا بعد الآخر، ولا يوجد كابل بينهما؛ وتحتها: «موجات راديو بدل الكابل — ضمن مدى التغطية».",
              caption: "Wi-Fi: ترسل الأجهزة البيانات في الهواء بموجات الراديو بدل الكابل.",
            },
            {
              id: "m20-l01-p02-table", type: "table", origin: "book",
              headers: ["", "ماذا يعني؟"],
              rows: [
                ["حسناتها", "سهلة، مرنة، وتربط عدة أجهزة بدون كوابل."],
                ["عيوبها", "المدى محدود، وقد تتأثر بالتداخل (التشويش)، وأمانها أضعف من الكوابل."],
              ],
            },
            {
              id: "m20-l01-p02-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [
                { text: "Wi-Fi مناسبة للحركة، لكنها تحتاج " },
                { text: "حماية جيدة", style: "strong" },
                { text: "." },
              ],
            },
          ],
        },
        {
          id: "791381s-m20-l01-p03",
          title: "أنواع الشبكات اللاسلكية",
          order: 3,
          source: src(61),
          blocks: [
            {
              id: "m20-l01-p03-intro", type: "text", origin: "book",
              spans: [{ text: "مثل أنواع الشبكات حسب الحجم التي تعلّمناها (PAN و LAN و WAN)، لكن هنا بدون كوابل. الحرف W في البداية معناه Wireless أي لاسلكي." }],
            },
            {
              id: "m20-l01-p03-table", type: "table", origin: "book",
              headers: ["النوع", "الفكرة", "مثال"],
              rows: [
                ["PAN", "أجهزة قريبة جدًا من بعضها.", "هاتف وسماعة بلوتوث"],
                ["WPAN", "اتصال شخصي لاسلكي.", "Bluetooth / IR"],
                ["WLAN", "شبكة محلية لاسلكية.", "Wi-Fi في البيت أو المدرسة"],
                ["WWAN", "شبكة واسعة لاسلكية.", "شبكة الهاتف الخلوي / 4G 5G"],
              ],
            },
            {
              // ENRICHMENT: SVG of the table — the four types placed from the nearest to the widest, with the table's examples.
              id: "m20-l01-p03-v-types", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m20/wireless-network-types", motion: false,
              source: src(61),
              title: "مخطط: أنواع الشبكات اللاسلكية من الأقرب إلى الأوسع",
              alt: "أربع بطاقات على محور من «أقرب» إلى «أوسع»: PAN (أجهزة قريبة جدًا · هاتف وسماعة)، WPAN (اتصال شخصي · Bluetooth / IR)، WLAN (شبكة محلية · بيت أو مدرسة)، WWAN (شبكة واسعة · 4G / 5G).",
              caption: "البيت = WLAN · الخلوي = WWAN · البلوتوث = WPAN — والحرف W معناه Wireless أي لاسلكي.",
            },
            {
              id: "m20-l01-p03-memo", type: "text", origin: "book",
              spans: [{ text: "احفظ من المثال: البيت = WLAN · الخلوي = WWAN · البلوتوث = WPAN", style: "strong" }],
            },
          ],
        },
        {
          id: "791381s-m20-l01-p04",
          title: "SSID — اسم شبكة Wi-Fi",
          order: 4,
          source: src(61),
          blocks: [
            {
              id: "m20-l01-p04-def", type: "text", origin: "book",
              spans: [{ text: "SSID هو اسم الشبكة اللاسلكية الذي يظهر لك عندما تبحث عن شبكات Wi-Fi.", style: "strong" }],
            },
            {
              id: "m20-l01-p04-points", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m20-l01-p04-pt1", text: [{ text: "يبثّه الراوتر أو نقطة الوصول (Access Point) حتى تكون الشبكة مرئية." }] },
                { id: "m20-l01-p04-pt2", text: [{ text: "قد يحتوي على حروف وأرقام ورموز." }] },
                {
                  id: "m20-l01-p04-pt3",
                  text: [
                    { text: "يمكن إخفاؤه لزيادة الحماية، لكن " },
                    { text: "كلمة المرور تبقى الأهم", style: "strong" },
                    { text: "." },
                  ],
                },
              ],
            },
            {
              // ENRICHMENT: SVG of «يبثّه الراوتر أو نقطة الوصول حتى تكون الشبكة مرئية» — the name travels to the device.
              id: "m20-l01-p04-v-ssid", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m20/ssid-beacon", motion: true,
              source: src(61),
              title: "مخطط: نقطة الوصول تبثّ اسم الشبكة SSID",
              alt: "«Access Point» على اليسار مكتوب تحته «يبثّ الاسم»، وبطاقة «SSID» تنتقل منها إلى جهاز على اليمين، ثم يظهر تحت الجهاز «وجد الشبكة ويختارها»؛ وتحتها: «SSID هو اسم الشبكة الذي تراه عند البحث».",
              caption: "الراوتر أو نقطة الوصول يبثّ SSID فتصبح الشبكة مرئية — وSSID اسم الشبكة، ليس كلمة السر.",
            },
            {
              id: "m20-l01-p04-example", type: "callout", origin: "book", kind: "tip", title: "مثال",
              spans: [{ text: "عندما تفتح قائمة Wi-Fi في هاتفك وترى «Home-WiFi» أو «School-Net» — هذه أسماء SSID." }],
            },
            {
              id: "m20-l01-p04-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [
                { text: "SSID " },
                { text: "ليس كلمة السر", style: "strong" },
                { text: "، بل اسم الشبكة الذي تراه عند البحث." },
              ],
            },
          ],
        },
        {
          id: "791381s-m20-l01-p05",
          title: "أمان الشبكة اللاسلكية",
          order: 5,
          source: src(62),
          blocks: [
            {
              id: "m20-l01-p05-intro", type: "text", origin: "book",
              spans: [{ text: "الشبكة اللاسلكية أسهل في الاستهداف من السلكية، لأن الإشارة تنتشر في الهواء ويمكن التقاطها من خارج البيت أيضًا." }],
            },
            {
              id: "m20-l01-p05-points", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m20-l01-p05-pt1", text: [{ text: "الخطر:", style: "strong" }, { text: " التنصّت على البيانات، أو الدخول بدون إذن." }] },
                {
                  id: "m20-l01-p05-pt2",
                  text: [
                    { text: "قد تحدث هجمات " },
                    { text: "Spoofing", style: "strong" },
                    { text: " (انتحال الهوية)." },
                  ],
                },
                {
                  id: "m20-l01-p05-pt3",
                  text: [
                    { text: "لذلك يجب استعمال " },
                    { text: "تشفير", style: "strong" },
                    { text: " و" },
                    { text: "كلمة مرور قوية", style: "strong" },
                    { text: "." },
                  ],
                },
              ],
            },
            { id: "m20-l01-p05-h-wifi", type: "heading", origin: "book", level: 3, text: "تقنيات حماية Wi-Fi" },
            {
              id: "m20-l01-p05-table", type: "table", origin: "book",
              headers: ["التقنية", "الوصف", "التقييم"],
              rows: [
                ["WEP", "نظام قديم وضعيف، لا يُنصح باستخدامه إطلاقًا.", "ضعيف ✗"],
                ["WPA", "جاء لتحسين WEP، ويستعمل مفاتيح تتغيّر.", "أفضل من WEP"],
                ["WPA2 / WPA3", "الأحدث والأكثر أمانًا، ويُنصح باستخدامه اليوم.", "الأفضل ✓"],
              ],
            },
            {
              // ENRICHMENT: SVG of the table — a ladder from WEP (weak) through WPA to WPA2 / WPA3 (the best).
              id: "m20-l01-p05-v-protection", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m20/wifi-protection-technologies", motion: false,
              source: src(62),
              title: "مخطط: تقنيات حماية Wi-Fi من الأضعف إلى الأفضل",
              alt: "سُلّم من ثلاث درجات تطول من أعلى إلى أسفل: WEP «قديم وضعيف» (ضعيف)، ثم WPA «تحسين WEP · مفاتيح تتغيّر» (أفضل من WEP)، ثم WPA2 / WPA3 «الأحدث والأكثر أمانًا» (الأفضل).",
              caption: "WEP ضعيف ولا يُنصح به، و WPA أفضل منه، و WPA2 / WPA3 الأحدث والأكثر أمانًا.",
            },
            {
              id: "m20-l01-p05-rule", type: "callout", origin: "book", kind: "summary", title: "قاعدة",
              spans: [
                { text: "لا تترك", style: "strong" },
                { text: " شبكة Wi-Fi مفتوحة بدون كلمة مرور أبدًا. وإذا رأيت WPA2 أو WPA3 فهذا اختيار جيد وآمن." },
              ],
            },
          ],
        },
        {
          id: "791381s-m20-l01-p06",
          title: "نقطة الوصول Access Point",
          order: 6,
          source: src(62, 63),
          blocks: [
            {
              id: "m20-l01-p06-def", type: "text", origin: "book",
              spans: [{ text: "Access Point جهاز يربط الأجهزة اللاسلكية بالشبكة السلكية.", style: "strong" }],
            },
            {
              id: "m20-l01-p06-intro", type: "text", origin: "book",
              spans: [{ text: "نقطة الوصول تشبه «جسرًا» بين الهواء والكابل: من جهة تتصل بالسويتش بكابل، ومن الجهة الأخرى ترسل Wi-Fi للأجهزة." }],
            },
            {
              id: "m20-l01-p06-drawing", type: "diagram", origin: "book",
              src: "/learning-assets/791381s/e582a2e7c5d204f0.png",
              alt: "رسمة: «Switch» متصل بكابل بنقطة «AP»، ومن «AP» قوس منقّط نحو حاسوبين قريبين مع عبارة «تغطية Wi-Fi»، وحاسوبان آخران أبعد على الجانبين.",
            },
            {
              // ENRICHMENT: SVG next to the booklet drawing — the cable part (Switch — AP) and the wireless part (AP — devices).
              id: "m20-l01-p06-v-bridge", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m20/access-point-bridge", motion: false,
              source: src(62, 63),
              title: "مخطط: نقطة الوصول جسر بين الكابل والهواء",
              alt: "«Switch» موصول بكابل سميك مكتوب عليه «كابل (سلكي)» إلى «AP» المكتوب فوقه «يبثّ Wi-Fi»، ومن AP خطوط متقطّعة إلى ثلاثة أجهزة مكتوب تحتها «الأجهزة (لاسلكيًا)».",
              caption: "من جهة تتصل نقطة الوصول بالسويتش بكابل، ومن الجهة الأخرى ترسل Wi-Fi للأجهزة — وهي ليست الإنترنت نفسه.",
            },
            {
              id: "m20-l01-p06-points", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m20-l01-p06-pt1", text: [{ text: "تُنشئ نقطة اتصال Wi-Fi للأجهزة." }] },
                { id: "m20-l01-p06-pt2", text: [{ text: "توسّع تغطية الشبكة وتحسّن الإشارة." }] },
                { id: "m20-l01-p06-pt3", text: [{ text: "تُستخدم في البيوت والشركات والفنادق والمقاهي." }] },
              ],
            },
            {
              id: "m20-l01-p06-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [
                { text: "Access Point " },
                { text: "ليس الإنترنت نفسه", style: "strong" },
                { text: "، بل نقطة اتصال بالشبكة." },
              ],
            },
          ],
        },
      ],
    },
    {
      // «تدريبات الوحدة» — ADDED enrichment: an end-of-unit exercise page after the booklet's own pages. Every question is
      // answered by the section's printed text above (the explanation quotes it). The book pages are unchanged (book lock).
      id: "791381s-m20-l02",
      title: "تدريبات الوحدة",
      order: 2,
      pages: [
        {
          id: "791381s-m20-l02-p01",
          title: "تدريبات الوحدة: المنطقة العازلة DMZ والشبكات اللاسلكية",
          order: 1,
          layout: "practice",
          source: src(59, 63),
          blocks: [
            {
              id: "m20-l02-p01-q01", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "أين نضع خادم موقع المدرسة حسب المثال؟",
                options: [{ id: "a", text: "داخل شبكة الموظفين." }, { id: "b", text: "في DMZ.", correct: true }, { id: "c", text: "على حاسوب أحد الموظفين." }, { id: "d", text: "داخل الشبكة الداخلية المحمية." }],
                feedback: { explanation: "مثال الصفحة: نضع خادم موقع المدرسة في DMZ، وليس داخل شبكة الموظفين. هكذا يستطيع الجميع فتح الموقع، وتبقى ملفات الموظفين محمية." },
              },
            },
            {
              id: "m20-l02-p01-q02", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "الزائر من الإنترنت يصل إلى DMZ فقط، ولا يدخل الشبكة الداخلية.", answer: true, feedback: { explanation: "الناس من الإنترنت يصلون إلى الخدمات العامة فقط، ولا يدخلون شبكة الموظفين: «الزائر يصل إلى DMZ فقط — ولا يدخل الشبكة الداخلية»." } },
            },
            {
              id: "m20-l02-p01-q03", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "على ماذا تعتمد تقنية Wi-Fi؟",
                options: [{ id: "a", text: "على كوابل الشبكة." }, { id: "b", text: "على جدار الحماية." }, { id: "c", text: "على عنوان SSID فقط." }, { id: "d", text: "على موجات الراديو.", correct: true }],
                feedback: { explanation: "Wi-Fi تقنية اتصال بدون كوابل، تعتمد على موجات الراديو." },
              },
            },
            {
              id: "m20-l02-p01-q04", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "classify", prompt: "صنّف كل صفة من صفات Wi-Fi حسب الجدول:",
                groups: [{ id: "pro", text: "حسناتها" }, { id: "con", text: "عيوبها" }],
                items: [
                  { id: "easy", text: "سهلة" },
                  { id: "range", text: "المدى محدود" },
                  { id: "flex", text: "مرنة" },
                  { id: "noise", text: "قد تتأثر بالتداخل (التشويش)" },
                  { id: "many", text: "تربط عدة أجهزة بدون كوابل" },
                  { id: "weak", text: "أمانها أضعف من الكوابل" },
                ],
                assign: { easy: "pro", range: "con", flex: "pro", noise: "con", many: "pro", weak: "con" },
                feedback: { explanation: "حسناتها: سهلة، مرنة، وتربط عدة أجهزة بدون كوابل. عيوبها: المدى محدود، وقد تتأثر بالتداخل (التشويش)، وأمانها أضعف من الكوابل." },
              },
            },
            {
              id: "m20-l02-p01-q05", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "matching", prompt: "صِل كل نوع شبكة لاسلكية بمثاله:",
                left: [
                  { id: "wlan", text: "WLAN" },
                  { id: "wwan", text: "WWAN" },
                  { id: "wpan", text: "WPAN" },
                ],
                right: [
                  { id: "r1", text: "Bluetooth / IR" },
                  { id: "r2", text: "Wi-Fi في البيت أو المدرسة" },
                  { id: "r3", text: "شبكة الهاتف الخلوي / 4G 5G" },
                ],
                pairs: { wlan: "r2", wwan: "r3", wpan: "r1" },
                feedback: { explanation: "احفظ من المثال: البيت = WLAN · الخلوي = WWAN · البلوتوث = WPAN." },
              },
            },
            {
              id: "m20-l02-p01-q06", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ماذا يعني الحرف W في بداية WLAN و WWAN و WPAN؟",
                options: [{ id: "a", text: "Wireless أي لاسلكي.", correct: true }, { id: "b", text: "Wide أي واسع." }, { id: "c", text: "Web أي الويب." }, { id: "d", text: "Wired أي سلكي." }],
                feedback: { explanation: "مثل أنواع الشبكات حسب الحجم (PAN و LAN و WAN)، لكن هنا بدون كوابل. الحرف W في البداية معناه Wireless أي لاسلكي." },
              },
            },
            {
              id: "m20-l02-p01-q07", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "SSID هو كلمة سر الشبكة اللاسلكية.", answer: false, feedback: { explanation: "SSID ليس كلمة السر، بل اسم الشبكة الذي تراه عند البحث عن شبكات Wi-Fi، مثل «Home-WiFi» أو «School-Net»." } },
            },
            {
              id: "m20-l02-p01-q08", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "wordBank", prompt: "أكمل نقاط SSID من مخزن الكلمات:",
                segments: ["SSID هو ", { blank: "b1" }, " الشبكة اللاسلكية. يبثّه الراوتر أو ", { blank: "b2" }, " حتى تكون الشبكة مرئية. يمكن إخفاؤه لزيادة الحماية، لكن ", { blank: "b3" }, " تبقى الأهم."],
                bank: ["كلمة المرور", "اسم", "جدار الحماية", "نقطة الوصول", "عنوان IP"],
                answers: { b1: "اسم", b2: "نقطة الوصول", b3: "كلمة المرور" },
                feedback: { explanation: "SSID هو اسم الشبكة اللاسلكية. يبثّه الراوتر أو نقطة الوصول (Access Point) حتى تكون الشبكة مرئية. يمكن إخفاؤه لزيادة الحماية، لكن كلمة المرور تبقى الأهم." },
              },
            },
            {
              id: "m20-l02-p01-q09", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "ordering", prompt: "رتّب تقنيات حماية Wi-Fi من الأضعف إلى الأفضل:",
                items: [
                  { id: "wpa2", text: "WPA2 / WPA3" },
                  { id: "wep", text: "WEP" },
                  { id: "wpa", text: "WPA" },
                ],
                order: ["wep", "wpa", "wpa2"],
                feedback: { explanation: "WEP نظام قديم وضعيف لا يُنصح باستخدامه إطلاقًا، و WPA جاء لتحسين WEP، و WPA2 / WPA3 الأحدث والأكثر أمانًا (الأفضل)." },
              },
            },
            {
              id: "m20-l02-p01-q10", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ما معنى هجوم Spoofing المذكور في الكتاب؟",
                options: [{ id: "a", text: "قطع موجات الراديو." }, { id: "b", text: "إخفاء اسم الشبكة SSID." }, { id: "c", text: "انتحال الهوية.", correct: true }, { id: "d", text: "تشفير البيانات." }],
                feedback: { explanation: "في أمان الشبكة اللاسلكية: قد تحدث هجمات Spoofing (انتحال الهوية)، لذلك يجب استعمال تشفير وكلمة مرور قوية." },
              },
            },
            {
              id: "m20-l02-p01-q11", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ما وظيفة نقطة الوصول Access Point؟",
                options: [{ id: "a", text: "هي الإنترنت نفسه." }, { id: "b", text: "تربط الأجهزة اللاسلكية بالشبكة السلكية.", correct: true }, { id: "c", text: "تحمي الشبكة الداخلية مثل DMZ." }, { id: "d", text: "تستبدل السويتش في الشبكة." }],
                feedback: { explanation: "Access Point جهاز يربط الأجهزة اللاسلكية بالشبكة السلكية: من جهة تتصل بالسويتش بكابل، ومن الجهة الأخرى ترسل Wi-Fi للأجهزة." },
              },
            },
            {
              id: "m20-l02-p01-q12", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "يمكن ترك شبكة Wi-Fi مفتوحة بدون كلمة مرور إذا كان SSID مخفيًا.", answer: false, feedback: { explanation: "القاعدة: لا تترك شبكة Wi-Fi مفتوحة بدون كلمة مرور أبدًا. وإخفاء SSID يزيد الحماية، لكن كلمة المرور تبقى الأهم." } },
            },
          ],
        },
      ],
    },
  ],
};

export default m20;
