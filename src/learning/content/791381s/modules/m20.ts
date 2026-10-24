// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 20 «المنطقة العازلة DMZ والشبكات اللاسلكية».
//
// Verbatim conversion of booklet PDF pages 59–63 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every block is origin:"book": nothing is added, removed or reworded.

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
  ],
};

export default m20;
