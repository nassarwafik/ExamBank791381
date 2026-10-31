// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 31 «الأساسيات».
//
// Verbatim conversion of booklet PDF pages 93–96 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every converted block is origin:"book": nothing is added, removed or reworded; bold runs are `strong`,
// monospace runs are `code`, printed box labels are the callout titles. The part of page 93 above the header box belongs
// to section 30 and is not part of this module.
//
// Enrichment (docs/enterprise-791381s-enrichment-plan.md, Phase 7): teacher-enrichment blocks (visuals and activities
// reused from course 791381 after checking their labels against this section, interactive practice-table twins of the
// review tables, and the end-of-unit «تدريبات الوحدة» lesson) are ADDED after the book blocks they explain. The book
// blocks stay verbatim — pinned by the book lock (bookLock.test.ts).

import type { ContentModule, ContentSource, PracticeTableSelectCell } from "../../types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };
/** A dropdown cell of a practice-table twin: `options` = the values the column takes (not in row order), `key` = the booklet's cell. */
const sel = (options: string[]) => (key: string): PracticeTableSelectCell => ({ kind: "select", options, key });
const PROP = sel(["Gateway · البوابة", "MAC · عنوان البطاقة", "IP خاص Private", "Subnet Mask · القناع", "IP · عنوان الجهاز"]);
const MASK = sel(["255.255.0.0 /16", "255.255.255.0 /24", "255.0.0.0 /8"]);
const BASE = sel(["2", "10", "16"]);
const BIT = sel(["0", "1"]);
const LAYER = sel(["Physical", "Data Link", "Network"]);
const CABLE = sel(["Fiber", "UTP", "STP"]);
const WIRING = sel(["Cross · متقاطع", "Roll-over · كونسول", "Straight · مستقيم"]);
const SCOPE = sel(["LAN", "MAN", "PAN", "WAN", "WLAN"]);

const m31: ContentModule = {
  id: "791381s-m31",
  title: "الأساسيات",
  order: 31,
  lessons: [
    {
      id: "791381s-m31-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m31-l00-p01",
          title: "الأساسيات",
          order: 1,
          layout: "opener",
          source: src(93),
          blocks: [
            {
              id: "m31-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الملخص الشامل ① · كتاب ص 230–236", unitNumber: "31", title: "الأساسيات",
              subtitle: "IP وMAC · فئات العناوين · أنظمة العدّ · الأجهزة · الكوابل · أنواع الشبكات",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m31-l01",
      title: "الأساسيات",
      order: 1,
      pages: [
        {
          id: "791381s-m31-l01-p01",
          title: "المفاهيم الأولى: IP و MAC",
          order: 1,
          source: src(93),
          blocks: [
            {
              id: "m31-l01-p01-intro", type: "text", origin: "book",
              spans: [{ text: "في آخر الكتاب ملخّص شامل يجمع أهم المفاهيم والأوامر في سبعة أقسام. هنا نرتّبه في جداول قصيرة للحفظ والمراجعة.", style: "strong" }],
            },
            {
              id: "m31-l01-p01-table", type: "table", origin: "book",
              headers: ["الخاصية", "القيمة"],
              rows: [
                ["IP · عنوان الجهاز", "عنوان منطقي بطول 32 bit يحدّد الجهاز."],
                ["IP خاص Private", "10.0.0.0/8 · 172.16.0.0/12 · 192.168.0.0/16 (داخل الشبكة فقط)"],
                ["MAC · عنوان البطاقة", "عنوان فيزيائي ثابت بطول 48 bit = 6 أزواج Hex."],
                ["Subnet Mask · القناع", "يقسّم العنوان إلى جزء شبكة وجزء أجهزة."],
                ["Gateway · البوابة", "مخرج الشبكة إلى الإنترنت = عنوان الراوتر."],
              ],
            },
            {
              id: "m31-l01-p01-assign", type: "callout", origin: "book", kind: "summary", title: "التعيين",
              spans: [
                { text: "Static", style: "strong" },
                { text: " = يُدخَل يدويًا ولا يتغيّر. " },
                { text: "DHCP", style: "strong" },
                { text: " = يُعطى تلقائيًا (IP · Gateway · Subnet · DNS)." },
              ],
            },
            {
              // ENRICHMENT — visual reused from course 791381 (m07 private-public, also used in 791381s m03): private
              // addresses inside the local network, the router as the way out to the internet (the Gateway row).
              id: "m31-l01-p01-v-private-public", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m07/private-public", motion: true,
              source: src(93),
              title: "رسم توضيحي: عناوين خاصة داخل الشبكة والراوتر مخرجها إلى الإنترنت",
              alt: "رسم يبيّن ثلاثة أجهزة بعناوين خاصة (192.168.1.5 و 192.168.1.6 و 192.168.1.20) داخل إطار «شبكة محلية — خاصة»، متصلة عبر راوتر بسحابة «إنترنت» عليها العنوان العام 8.8.8.8.",
              caption: "العناوين الخاصة (مثل 192.168.0.0/16) داخل الشبكة فقط، والبوابة Gateway هي مخرج الشبكة إلى الإنترنت = عنوان الراوتر.",
            },
          ],
        },
        {
          id: "791381s-m31-l01-p02",
          title: "فئات عناوين IPv4",
          order: 2,
          source: src(94),
          blocks: [
            {
              id: "m31-l01-p02-table", type: "table", origin: "book",
              headers: ["الفئة", "النطاق", "Subnet Mask", "عدد الأجهزة"],
              rows: [
                ["Class A", "1.0.0.0 – 126.255.255.255", "255.0.0.0 /8", "16,777,214"],
                ["Class B", "128.0.0.0 – 191.255.255.255", "255.255.0.0 /16", "65,534"],
                ["Class C", "192.0.0.0 – 223.255.255.255", "255.255.255.0 /24", "254"],
              ],
              columnDirs: ["rtl", "ltr", "ltr", "ltr"],
            },
            { id: "m31-l01-p02-notes-h", type: "heading", origin: "book", level: 4, text: "ملاحظتان" },
            {
              id: "m31-l01-p02-note1", type: "text", origin: "book",
              spans: [
                { text: "العناوين " },
                { text: "127.x", style: "strong" },
                { text: " محجوزة لـ Loopback (لذلك تنتهي الفئة A عند 126)." },
              ],
            },
            {
              id: "m31-l01-p02-note2", type: "text", origin: "book",
              spans: [
                { text: "عدد الأجهزة = " },
                { text: "2^(host) − 2", style: "code" },
                { text: " بعد طرح عنوان الشبكة وعنوان البث." },
              ],
            },
            {
              // ENRICHMENT — visual reused from course 791381 (m08 address-classes): the first number decides the class,
              // with the table's bands A 1–126 · B 128–191 · C 192–223 (and the 127 gap of the Loopback note).
              id: "m31-l01-p02-v-classes", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m08/address-classes", motion: true,
              source: src(94),
              title: "رسم توضيحي: الخانة الأولى تحدّد الفئة",
              alt: "خط أعداد للخانة الأولى من العنوان مقسوم إلى ثلاثة أشرطة: A من 1 إلى 126، وB من 128 إلى 191، وC من 192 إلى 223، وفوقه عبارة «الرقم الأول من اليسار يحدّد الفئة».",
              caption: "Class A من 1 إلى 126، وClass B من 128 إلى 191، وClass C من 192 إلى 223؛ والعناوين 127.x محجوزة لـ Loopback.",
            },
          ],
        },
        {
          id: "791381s-m31-l01-p03",
          title: "أنظمة العدّ والتحويل",
          order: 3,
          source: src(94),
          blocks: [
            {
              id: "m31-l01-p03-table", type: "table", origin: "book",
              headers: ["النظام", "الأساس", "الأرقام", "الاستخدام"],
              rows: [
                ["العشري Decimal", "10", "0 – 9", "الاستخدام اليومي"],
                ["الثنائي Binary", "2", "0 , 1", "لغة الحاسوب"],
                ["السادس عشر Hex", "16", "0–9 , A–F", "عناوين MAC · IPv6"],
              ],
              columnDirs: ["rtl", "rtl", "ltr", "rtl"],
            },
            {
              id: "m31-l01-p03-boxes-intro", type: "text", origin: "book",
              spans: [
                { text: "طريقة الصناديق", style: "strong" },
                { text: " (العشري ⇄ الثنائي): نضع 1 تحت الصناديق التي مجموعها يساوي الرقم." },
              ],
            },
            {
              id: "m31-l01-p03-boxes", type: "table", origin: "book",
              headers: ["1", "2", "4", "8", "16", "32", "64", "128"],
              rows: [["0", "0", "0", "0", "0", "0", "1", "1"]],
            },
            {
              id: "m31-l01-p03-example", type: "text", origin: "book",
              spans: [
                { text: "مثال: ", style: "strong" },
                { text: "192 = 64 + 128 = 11000000", style: "code", dir: "rtl" },
              ],
            },
          ],
        },
        {
          id: "791381s-m31-l01-p04",
          title: "أجهزة الشبكة",
          order: 4,
          source: src(94, 95),
          blocks: [
            {
              id: "m31-l01-p04-table", type: "table", origin: "book",
              headers: ["الجهاز", "الوظيفة", "الطبقة"],
              rows: [
                ["Hub", "يرسل للجميع (قديم).", "Physical"],
                ["Switch", "يرسل للمطلوب فقط ويحفظ MAC.", "Data Link"],
                ["Router", "يربط شبكات مختلفة (يفهم IP).", "Network"],
                ["Access Point", "نقطة وصول WiFi لاسلكية.", "Data Link"],
                ["Modem", "يحوّل الإشارة (رقمي ⇄ تناظري).", "Physical"],
              ],
            },
            {
              id: "m31-l01-p04-rule", type: "text", origin: "book",
              spans: [{ text: "Hub يرسل للكل · Switch للمقصود · Router بين الشبكات", style: "strong" }],
            },
            {
              // ENRICHMENT — simulation / hub-switch-router-flow / v1 (as in 791381s m05): the rule line «Hub يرسل للكل ·
              // Switch للمقصود · Router بين الشبكات» brought to life; every caption restates this unit's table rows.
              id: "m31-l01-p04-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "hub-switch-router-flow", version: 1,
              title: "جرّب: Hub يرسل للكل · Switch للمقصود · Router بين الشبكات",
              description: "اختر Hub أو Switch أو Router ثم اضغط «أرسل البيانات» وراقب من تصله البيانات.",
              source: src(94, 95),
              capabilities: { fullscreen: true, reset: true, replay: true, animated: true, interactive: true },
              fallback: { text: "Hub: يرسل للجميع (قديم)، طبقة Physical. Switch: يرسل للمطلوب فقط ويحفظ MAC، طبقة Data Link. Router: يربط شبكات مختلفة (يفهم IP)، طبقة Network. Hub يرسل للكل · Switch للمقصود · Router بين الشبكات." },
              config: {
                sender: "PC1", target: "PC3", others: ["PC2", "PC4"],
                hub: { label: "Hub", caption: "Hub يرسل للجميع (قديم): البيانات تصل إلى كل الأجهزة. يعمل في طبقة Physical." },
                switch: { label: "Switch", caption: "Switch يرسل للمطلوب فقط ويحفظ MAC: البيانات تصل إلى الجهاز المقصود وحده. يعمل في طبقة Data Link." },
                router: { label: "Router", networks: ["شبكة 1", "شبكة 2"], outside: "الإنترنت", caption: "Router يربط شبكات مختلفة (يفهم IP): البيانات من PC1 في شبكة 1 تمرّ عبر الراوتر لتصل إلى PC3 في شبكة 2. يعمل في طبقة Network، وعنوانه هو البوابة Gateway: مخرج الشبكة إلى الإنترنت." },
                useLabel: "المقصود: تصله", ignoreLabel: "تصله أيضًا", notReachedLabel: "لا تصله", targetLabel: "المقصود",
              },
            },
          ],
        },
        {
          id: "791381s-m31-l01-p05",
          title: "الكوابل ووسائط الاتصال",
          order: 5,
          source: src(95),
          blocks: [
            {
              id: "m31-l01-p05-cables", type: "table", origin: "book",
              headers: ["الكابل", "الوصف"],
              rows: [
                ["UTP", "نحاسي بدون حماية. الأشيع (حتى 100م بسرعة 1 Gbps)."],
                ["STP", "نحاسي مع حماية ضد التشويش."],
                ["Fiber", "ألياف ضوئية. مسافات طويلة وسرعة عالية."],
              ],
            },
            {
              id: "m31-l01-p05-wiring", type: "table", origin: "book",
              headers: ["طريقة التوصيل", "تربط بين"],
              rows: [
                ["Straight · مستقيم", "جهازين مختلفين، مثل: حاسوب ← سويتش."],
                ["Cross · متقاطع", "جهازين من نفس النوع، مثل: حاسوب ← حاسوب."],
                ["Roll-over · كونسول", "الحاسوب بمنفذ Console في الراوتر أو السويتش لبرمجته."],
              ],
            },
            {
              id: "m31-l01-p05-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [
                { text: "الألياف " },
                { text: "Fiber", style: "strong" },
                { text: " هي الأسرع والأبعد والأكثر مقاومة للتشويش." },
              ],
            },
            {
              // ENRICHMENT — interactive-diagram / cable-comparison / v1 (as in 791381s m07): only the three cables of this
              // table, with its own descriptions; the rule is the page's «تذكّر» box. No speed or range beyond the table.
              id: "m31-l01-p05-cable-compare", type: "interactive-diagram", origin: "teacher-enrichment",
              interactionType: "cable-comparison", version: 1,
              title: "قارن واختر الكابل المناسب",
              description: "اضغط على كل كابل لتقرأ وصفه كما ورد في الجدول، ثم اختر حالة وحدّد الكابل الذي يناسبها.",
              source: src(95),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "UTP: نحاسي بدون حماية، الأشيع (حتى 100م بسرعة 1 Gbps). STP: نحاسي مع حماية ضد التشويش. Fiber: ألياف ضوئية، مسافات طويلة وسرعة عالية. تذكّر: الألياف Fiber هي الأسرع والأبعد والأكثر مقاومة للتشويش." },
              config: {
                cables: [
                  { id: "utp", name: "UTP", title: "نحاسي بدون حماية", traits: ["نحاسي بدون حماية.", "الأشيع (حتى 100م بسرعة 1 Gbps)."], shield: false, kind: "pair" },
                  { id: "stp", name: "STP", title: "نحاسي مع حماية", traits: ["نحاسي مع حماية ضد التشويش."], shield: true, kind: "pair" },
                  { id: "fiber", name: "Fiber", title: "ألياف ضوئية", traits: ["ألياف ضوئية.", "مسافات طويلة وسرعة عالية."], shield: false, kind: "fiber" },
                ],
                scenarios: [
                  { id: "common", prompt: "الكابل النحاسي الأشيع، حتى 100م بسرعة 1 Gbps.", answer: "utp", why: "UTP نحاسي بدون حماية، وهو الأشيع (حتى 100م بسرعة 1 Gbps)." },
                  { id: "noise", prompt: "كابل نحاسي مع حماية ضد التشويش.", answer: "stp", why: "STP نحاسي مع حماية ضد التشويش." },
                  { id: "far", prompt: "وصلة لمسافة طويلة وبسرعة عالية.", answer: "fiber", why: "Fiber ألياف ضوئية: مسافات طويلة وسرعة عالية." },
                ],
                rule: "الألياف Fiber هي الأسرع والأبعد والأكثر مقاومة للتشويش.",
                scenarioNote: "الحالات مأخوذة من عمود «الوصف» في جدول الكوابل.",
              },
            },
          ],
        },
        {
          id: "791381s-m31-l01-p06",
          title: "أنواع الشبكات حسب النطاق",
          order: 6,
          source: src(95, 96),
          blocks: [
            {
              id: "m31-l01-p06-table", type: "table", origin: "book",
              headers: ["الرمز", "الاسم الكامل", "المدى"],
              rows: [
                ["PAN", "Personal Area Network", "بلوتوث (أمتار)"],
                ["LAN", "Local Area Network", "مكتب / بيت (محلية)"],
                ["MAN", "Metropolitan Area Network", "مدينة"],
                ["WAN", "Wide Area Network", "إنترنت (دول)"],
                ["WLAN", "Wireless LAN", "محلية لاسلكية (WiFi)"],
              ],
            },
            {
              id: "m31-l01-p06-idea", type: "callout", origin: "book", kind: "summary", title: "الفكرة",
              spans: [
                { text: "التصنيف حسب " },
                { text: "المسافة", style: "strong" },
                { text: ": من أمتار في PAN إلى العالم كله في WAN." },
              ],
            },
            {
              // ENRICHMENT — interactive-diagram / network-scope / v1 (as in 791381s m01): the table's four ranges from the
              // smallest to the largest, in the table's own words; WLAN (the same LAN without cable) is named in the note.
              id: "m31-l01-p06-scope", type: "interactive-diagram", origin: "teacher-enrichment",
              interactionType: "network-scope", version: 1,
              title: "استكشف أنواع الشبكات حسب النطاق", description: "اختر نوع الشبكة لترى كيف يكبر المدى من PAN إلى WAN.",
              source: src(95, 96),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "PAN · Personal Area Network: بلوتوث (أمتار). LAN · Local Area Network: مكتب / بيت (محلية). MAN · Metropolitan Area Network: مدينة. WAN · Wide Area Network: إنترنت (دول). WLAN · Wireless LAN: محلية لاسلكية (WiFi). التصنيف حسب المسافة: من أمتار في PAN إلى العالم كله في WAN." },
              config: {
                scopes: [
                  { id: "pan", name: "PAN", title: "Personal Area Network", distance: "بلوتوث (أمتار)", example: "المدى: بلوتوث (أمتار)." },
                  { id: "lan", name: "LAN", title: "Local Area Network", distance: "مكتب / بيت", example: "المدى: مكتب / بيت (محلية)." },
                  { id: "man", name: "MAN", title: "Metropolitan Area Network", distance: "مدينة", example: "المدى: مدينة." },
                  { id: "wan", name: "WAN", title: "Wide Area Network", distance: "إنترنت (دول)", example: "المدى: إنترنت (دول)." },
                ],
                note: "التصنيف حسب المسافة: من أمتار في PAN إلى العالم كله في WAN. و WLAN = Wireless LAN: محلية لاسلكية (WiFi).",
              },
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m31-l02",
      title: "تدريبات الوحدة",
      order: 2,
      pages: [
        {
          id: "791381s-m31-l02-p01",
          title: "تدريبات الوحدة: الأساسيات",
          order: 1,
          layout: "practice",
          source: src(93, 96),
          blocks: [
            {
              id: "m31-l02-p01-t01", type: "practice-table", origin: "teacher-enrichment",
              caption: "املأ العمود «الخاصية»: اختر الخاصية التي تصفها كل قيمة",
              headers: ["الخاصية", "القيمة"],
              rows: [
                [PROP("IP · عنوان الجهاز"), "عنوان منطقي بطول 32 bit يحدّد الجهاز."],
                [PROP("IP خاص Private"), "10.0.0.0/8 · 172.16.0.0/12 · 192.168.0.0/16 (داخل الشبكة فقط)"],
                [PROP("MAC · عنوان البطاقة"), "عنوان فيزيائي ثابت بطول 48 bit = 6 أزواج Hex."],
                [PROP("Subnet Mask · القناع"), "يقسّم العنوان إلى جزء شبكة وجزء أجهزة."],
                [PROP("Gateway · البوابة"), "مخرج الشبكة إلى الإنترنت = عنوان الراوتر."],
              ],
            },
            {
              id: "m31-l02-p01-t02", type: "practice-table", origin: "teacher-enrichment",
              caption: "املأ العمود «Subnet Mask»: اختر القناع المناسب لكل فئة",
              headers: ["الفئة", "النطاق", "Subnet Mask", "عدد الأجهزة"],
              rows: [
                ["Class A", "1.0.0.0 – 126.255.255.255", MASK("255.0.0.0 /8"), "16,777,214"],
                ["Class B", "128.0.0.0 – 191.255.255.255", MASK("255.255.0.0 /16"), "65,534"],
                ["Class C", "192.0.0.0 – 223.255.255.255", MASK("255.255.255.0 /24"), "254"],
              ],
              columnDirs: ["rtl", "ltr", "ltr", "ltr"],
            },
            {
              id: "m31-l02-p01-t03", type: "practice-table", origin: "teacher-enrichment",
              caption: "املأ العمود «الأساس»: اختر أساس كل نظام",
              headers: ["النظام", "الأساس", "الأرقام", "الاستخدام"],
              rows: [
                ["العشري Decimal", BASE("10"), "0 – 9", "الاستخدام اليومي"],
                ["الثنائي Binary", BASE("2"), "0 , 1", "لغة الحاسوب"],
                ["السادس عشر Hex", BASE("16"), "0–9 , A–F", "عناوين MAC · IPv6"],
              ],
              columnDirs: ["rtl", "rtl", "ltr", "rtl"],
            },
            {
              id: "m31-l02-p01-t04", type: "practice-table", origin: "teacher-enrichment",
              caption: "املأ صفّ الصناديق للعدد 192: اختر 0 أو 1 تحت كل صندوق",
              headers: ["1", "2", "4", "8", "16", "32", "64", "128"],
              rows: [[BIT("0"), BIT("0"), BIT("0"), BIT("0"), BIT("0"), BIT("0"), BIT("1"), BIT("1")]],
            },
            {
              id: "m31-l02-p01-t05", type: "practice-table", origin: "teacher-enrichment",
              caption: "املأ العمود «الطبقة»: في أي طبقة يعمل كل جهاز؟",
              headers: ["الجهاز", "الوظيفة", "الطبقة"],
              rows: [
                ["Hub", "يرسل للجميع (قديم).", LAYER("Physical")],
                ["Switch", "يرسل للمطلوب فقط ويحفظ MAC.", LAYER("Data Link")],
                ["Router", "يربط شبكات مختلفة (يفهم IP).", LAYER("Network")],
                ["Access Point", "نقطة وصول WiFi لاسلكية.", LAYER("Data Link")],
                ["Modem", "يحوّل الإشارة (رقمي ⇄ تناظري).", LAYER("Physical")],
              ],
            },
            {
              id: "m31-l02-p01-t06", type: "practice-table", origin: "teacher-enrichment",
              caption: "املأ العمود «الكابل»: أي كابل يطابق كل وصف؟",
              headers: ["الكابل", "الوصف"],
              rows: [
                [CABLE("UTP"), "نحاسي بدون حماية. الأشيع (حتى 100م بسرعة 1 Gbps)."],
                [CABLE("STP"), "نحاسي مع حماية ضد التشويش."],
                [CABLE("Fiber"), "ألياف ضوئية. مسافات طويلة وسرعة عالية."],
              ],
            },
            {
              id: "m31-l02-p01-t07", type: "practice-table", origin: "teacher-enrichment",
              caption: "املأ العمود «طريقة التوصيل»: أي طريقة تربط بين كل جهازين؟",
              headers: ["طريقة التوصيل", "تربط بين"],
              rows: [
                [WIRING("Straight · مستقيم"), "جهازين مختلفين، مثل: حاسوب ← سويتش."],
                [WIRING("Cross · متقاطع"), "جهازين من نفس النوع، مثل: حاسوب ← حاسوب."],
                [WIRING("Roll-over · كونسول"), "الحاسوب بمنفذ Console في الراوتر أو السويتش لبرمجته."],
              ],
            },
            {
              id: "m31-l02-p01-t08", type: "practice-table", origin: "teacher-enrichment",
              caption: "املأ العمود «الرمز»: ما رمز كل شبكة؟",
              headers: ["الرمز", "الاسم الكامل", "المدى"],
              rows: [
                [SCOPE("PAN"), "Personal Area Network", "بلوتوث (أمتار)"],
                [SCOPE("LAN"), "Local Area Network", "مكتب / بيت (محلية)"],
                [SCOPE("MAN"), "Metropolitan Area Network", "مدينة"],
                [SCOPE("WAN"), "Wide Area Network", "إنترنت (دول)"],
                [SCOPE("WLAN"), "Wireless LAN", "محلية لاسلكية (WiFi)"],
              ],
            },
            {
              id: "m31-l02-p01-q01", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ما طول عنوان MAC · عنوان البطاقة؟",
                options: [{ id: "a", text: "32 bit" }, { id: "b", text: "48 bit = 6 أزواج Hex", correct: true }, { id: "c", text: "16 bit" }, { id: "d", text: "128 bit" }],
                feedback: { explanation: "MAC · عنوان البطاقة: عنوان فيزيائي ثابت بطول 48 bit = 6 أزواج Hex. أما IP فعنوان منطقي بطول 32 bit." },
              },
            },
            {
              id: "m31-l02-p01-q02", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "العنوان 192.168.1.20 عنوان خاص Private يُستعمل داخل الشبكة فقط.", answer: true, feedback: { explanation: "IP خاص Private: 10.0.0.0/8 · 172.16.0.0/12 · 192.168.0.0/16 (داخل الشبكة فقط)، والعنوان 192.168.1.20 من النطاق 192.168.0.0/16." } },
            },
            {
              id: "m31-l02-p01-q03", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "العنوان 172.16.5.40 من أي فئة؟",
                options: [{ id: "a", text: "Class C" }, { id: "b", text: "Class A" }, { id: "c", text: "Class B", correct: true }],
                feedback: { explanation: "Class B: 128.0.0.0 – 191.255.255.255، والخانة الأولى 172 تقع بين 128 و 191." },
              },
            },
            {
              id: "m31-l02-p01-q04", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "لماذا تنتهي الفئة A عند 126؟",
                options: [{ id: "a", text: "لأن العناوين 127.x محجوزة لـ Loopback.", correct: true }, { id: "b", text: "لأن 127 هو أول رقم في الفئة B." }, { id: "c", text: "لأن العناوين 127.x عناوين خاصة Private." }, { id: "d", text: "لأن الفئة A لا تحتاج إلى أكثر من 126 جهازًا." }],
                feedback: { explanation: "العناوين 127.x محجوزة لـ Loopback (لذلك تنتهي الفئة A عند 126)، والفئة B تبدأ عند 128." },
              },
            },
            {
              id: "m31-l02-p01-q05", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "كم عدد الأجهزة في شبكة من الفئة C (القناع 255.255.255.0 /24)؟",
                options: [{ id: "a", text: "65,534" }, { id: "b", text: "254", correct: true }, { id: "c", text: "256" }, { id: "d", text: "16,777,214" }],
                feedback: { explanation: "في جدول الفئات: Class C · 255.255.255.0 /24 · 254 جهازًا، لأن عدد الأجهزة = 2^(host) − 2 بعد طرح عنوان الشبكة وعنوان البث." },
              },
            },
            {
              id: "m31-l02-p01-q06", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "wordBank", prompt: "أكمل الفراغات من مخزن الكلمات:",
                segments: ["في طريقة الصناديق نضع ", { blank: "b1" }, " تحت الصناديق التي مجموعها يساوي الرقم. مثال: 192 = 64 + ", { blank: "b2" }, " = ", { blank: "b3" }, "."],
                bank: ["1", "0", "128", "32", "11000000", "10100000"],
                answers: { b1: "1", b2: "128", b3: "11000000" },
                feedback: { explanation: "طريقة الصناديق (العشري ⇄ الثنائي): نضع 1 تحت الصناديق التي مجموعها يساوي الرقم. مثال: 192 = 64 + 128 = 11000000." },
              },
            },
            {
              id: "m31-l02-p01-q07", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "matching", prompt: "صِل كل مصطلح بمعناه:",
                left: [{ id: "mask", text: "Subnet Mask · القناع" }, { id: "gw", text: "Gateway · البوابة" }, { id: "static", text: "Static" }, { id: "dhcp", text: "DHCP" }],
                right: [{ id: "r1", text: "يُعطى تلقائيًا (IP · Gateway · Subnet · DNS)" }, { id: "r2", text: "يقسّم العنوان إلى جزء شبكة وجزء أجهزة" }, { id: "r3", text: "يُدخَل يدويًا ولا يتغيّر" }, { id: "r4", text: "مخرج الشبكة إلى الإنترنت = عنوان الراوتر" }],
                pairs: { mask: "r2", gw: "r4", static: "r3", dhcp: "r1" },
                feedback: { explanation: "Subnet Mask يقسّم العنوان إلى جزء شبكة وجزء أجهزة، وGateway مخرج الشبكة إلى الإنترنت = عنوان الراوتر. Static = يُدخَل يدويًا ولا يتغيّر، وDHCP = يُعطى تلقائيًا (IP · Gateway · Subnet · DNS)." },
              },
            },
            {
              id: "m31-l02-p01-q08", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "classify", prompt: "صنّف كل صفة: هل هي صفة IP أم صفة MAC؟",
                groups: [{ id: "ip", text: "IP · عنوان الجهاز" }, { id: "mac", text: "MAC · عنوان البطاقة" }],
                items: [
                  { id: "i1", text: "عنوان منطقي" },
                  { id: "i2", text: "عنوان فيزيائي ثابت" },
                  { id: "i3", text: "طوله 32 bit" },
                  { id: "i4", text: "طوله 48 bit" },
                  { id: "i5", text: "يُكتب 6 أزواج Hex" },
                ],
                assign: { i1: "ip", i2: "mac", i3: "ip", i4: "mac", i5: "mac" },
                feedback: { explanation: "IP · عنوان الجهاز: عنوان منطقي بطول 32 bit يحدّد الجهاز. MAC · عنوان البطاقة: عنوان فيزيائي ثابت بطول 48 bit = 6 أزواج Hex." },
              },
            },
            {
              id: "m31-l02-p01-q09", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "أي جهاز يرسل للمطلوب فقط ويحفظ MAC؟",
                options: [{ id: "a", text: "Hub" }, { id: "b", text: "Router" }, { id: "c", text: "Modem" }, { id: "d", text: "Switch", correct: true }],
                feedback: { explanation: "Switch يرسل للمطلوب فقط ويحفظ MAC (طبقة Data Link)، أما Hub فيرسل للجميع، وRouter يربط شبكات مختلفة، وModem يحوّل الإشارة." },
              },
            },
            {
              id: "m31-l02-p01-q10", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "نستعمل التوصيل Cross · متقاطع لربط حاسوب بسويتش.", answer: false, feedback: { explanation: "Straight · مستقيم يربط جهازين مختلفين، مثل: حاسوب ← سويتش. أما Cross · متقاطع فيربط جهازين من نفس النوع، مثل: حاسوب ← حاسوب." } },
            },
            {
              id: "m31-l02-p01-q11", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "ordering", prompt: "رتّب أنواع الشبكات حسب المدى من الأصغر إلى الأكبر:",
                items: [{ id: "wan", text: "WAN · إنترنت (دول)" }, { id: "lan", text: "LAN · مكتب / بيت" }, { id: "pan", text: "PAN · بلوتوث (أمتار)" }, { id: "man", text: "MAN · مدينة" }],
                order: ["pan", "lan", "man", "wan"],
                feedback: { explanation: "التصنيف حسب المسافة: PAN بلوتوث (أمتار) ‏←‏ LAN مكتب / بيت ‏←‏ MAN مدينة ‏←‏ WAN إنترنت (دول)، من أمتار في PAN إلى العالم كله في WAN." },
              },
            },
            {
              id: "m31-l02-p01-q12", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "أي وسيط هو الأسرع والأبعد والأكثر مقاومة للتشويش؟",
                options: [{ id: "a", text: "Fiber", correct: true }, { id: "b", text: "UTP" }, { id: "c", text: "STP" }],
                feedback: { explanation: "تذكّر: الألياف Fiber هي الأسرع والأبعد والأكثر مقاومة للتشويش. UTP نحاسي بدون حماية، وSTP نحاسي مع حماية ضد التشويش." },
              },
            },
          ],
        },
      ],
    },
  ],
};

export default m31;
