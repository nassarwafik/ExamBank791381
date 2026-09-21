// Learning Materials — FINAL SUMMARY phase: REAL converted body for Book 791381, module m28 (the book's closing
// section «الملخّص الشامل», the final reference «مرجع نهائي»: source PDF 230–264). NEW stable id m28, reading
// `order` 28: after m06 («قوائم التحكم ACL», order 27), the LAST module of the course; it fills the manifest's
// «summary» presentation batch.
// PDF 230 is the section cover («مرجع نهائي — الملخّص الشامل»: not a learner page, recorded as the module's source
// start like every earlier section cover) and PDF 264 is the book's back cover (metadata only: NOT converted). The
// learner pages are PDF 231–263 (33 pages, 1 book page → 1 interactive page) in the book's seven sections +
// «كلمة الختام»: الأساسيات (231–236), النماذج والبروتوكولات (237–240), العنونة والتجزئة (241–244), التبديل و VLANs
// (245–250), التوجيه (251–253), الأمان (254–257), الخدمات والأوامر (258–262), كلمة الختام (263).
// PRINTED PAGE: the page circle shows the PDF index, but the running-header number of PDF 231–262 is 229–260
// (PDF − 2); that printed number is what `printedPage` records. PDF 263 has no printed number.
// Book-derived blocks are origin:"book" (the summary tables, the book's «الفكرة» / «تذكّر» / «للتذكّر» / «انتبه» /
// «القاعدة» / «الوقاية» callouts, the CLI boxes repeated as code + command table). Practices, worksheets, the one
// «توضيح المعلّم» per page and the CLI exercises are teacher-enrichment. SOURCE LEVEL: a summary page stays a
// summary — nothing beyond the book's own lines is added. The closing word (PDF 263) is static and respectful:
// no quiz is forced on it; the module review sits on PDF 262 (the last content page, «تمّ بحمد الله»).
// CLI policy: the same `simulation / cli-terminal / v1` activity; the engine was extended ONLY where these pages
// require it (`switchport trunk native vlan` PDF 246, `ip route … <next-hop>` PDF 251, the EIGRP wildcard PDF 253).
// PDF 255 names Restrict / Protect in prose but prints only `violation shutdown`, so they are taught by practice,
// not simulated. PDF 262's Windows commands are practised in a worksheet, never typed into the Cisco simulator.

import type { ContentModule, ContentSource, InlineSpan, PracticeOption, PracticeTableSelectCell } from "../../types";
import type { CliExerciseConfig } from "../../../cli/types";

const CID = "791381";
/** PDF 231–262 carry the printed running-header number PDF − 2 (229–260); PDF 263 has none. */
const src = (pdf: number): ContentSource => (pdf <= 262 ? { kind: "book", sourceId: CID, pdfPageStart: pdf, printedPage: pdf - 2 } : { kind: "book", sourceId: CID, pdfPageStart: pdf });
const L = (text: string): InlineSpan => ({ text, dir: "ltr", style: "code" });
const T = (text: string): InlineSpan => ({ text });
const opt = (id: string, text: string, correct?: true): PracticeOption => (correct ? { id, text, correct } : { id, text });
const EX = (exercise: CliExerciseConfig): Record<string, unknown> => ({ ...exercise });
const sel = <const O extends readonly string[]>(options: O) => (key: O[number]): PracticeTableSelectCell => ({ kind: "select", options: [...options], key });

const PRIV = sel(["خاص Private", "عام Public"] as const);
const CLASS = sel(["Class A", "Class B", "Class C"] as const);
const LAYER = sel(["Physical", "Data Link", "Network"] as const);
const CABLE = sel(["Straight", "Cross", "Roll-over"] as const);
const SCOPE = sel(["PAN", "LAN", "MAN", "WAN", "WLAN"] as const);
const PORT = sel(["22", "23", "25", "53", "80", "443"] as const);
const TU = sel(["TCP", "UDP", "كلاهما"] as const);
const PDU = sel(["Data", "Segment", "Packet", "Frame", "Bit"] as const);
const SPECIAL = sel(["127.0.0.1", "169.254.x.x", "0.0.0.0", "255.255.255.255"] as const);
const WC = sel(["0.0.0.0", "0.0.0.255", "0.0.255.255", "255.255.255.255"] as const);
const ADV = sel(["0", "1", "90", "110", "120"] as const);
const ATTACK = sel(["DoS", "DDoS", "Spoofing", "MitM", "Sniffing", "Hijacking", "Phishing"] as const);
const SVC = sel(["NAT", "PAT", "APIPA"] as const);
const CMD = sel(["ping 8.8.8.8", "tracert", "ipconfig", "ipconfig /all", "nslookup", "arp -a"] as const);
const SHOW = sel(["show vlan brief", "show interfaces trunk", "show mac address-table", "show interfaces status", "show vtp status", "show spanning-tree"] as const);

const m28: ContentModule = {
  id: "791381-m28",
  title: "الملخّص الشامل",
  shortTitle: "الملخّص",
  order: 28,
  source: { kind: "book", sourceId: CID, pdfPageStart: 230, pdfPageEnd: 264, sourceNote: "المرجع النهائي «الملخّص الشامل»: PDF 230 صفحة عنوان القسم (ليست صفحة تعلّم)، الصفحات 231–263 هي صفحات المتعلّم (سبعة أقسام + كلمة الختام)، و PDF 264 الغلاف الخلفي (بيانات الكتاب فقط، لم يُحوَّل). الرقم المطبوع في رأس الصفحات 231–262 هو 229–260." },
  lessons: [
    // ── l01 الأساسيات (PDF 231–236) ─────────────────────────────────────────────────────────────────────────
    {
      id: "791381-m28-l01",
      title: "الأساسيات",
      order: 1,
      pages: [
        // PDF 231 — المفاهيم الأولى: IP و MAC
        {
          id: "791381-m28-l01-p01",
          title: "المفاهيم الأولى: IP و MAC",
          order: 1,
          source: src(231),
          keywords: ["IP", "Private", "MAC", "Subnet Mask", "Gateway", "Static", "DHCP", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"],
          blocks: [
            {
              id: "m28-l01-p01-table", type: "table", origin: "book",
              caption: "الخاصية والقيمة كما يلخّصها الكتاب",
              headers: ["الخاصية", "القيمة"],
              columnDirs: ["rtl", "rtl"],
              rows: [
                ["IP — عنوان الجهاز", "عنوان منطقي بطول 32 bit يحدّد الجهاز"],
                ["IP خاص Private", "10.x · 172.16–31 · 192.168 (داخل الشبكة فقط)"],
                ["MAC — عنوان البطاقة", "عنوان فيزيائي ثابت 48 bit = 6 أزواج Hex"],
                ["Subnet Mask — القناع", "يقسّم العنوان إلى جزء شبكة وجزء أجهزة"],
                ["Gateway — البوابة", "مَخرج الشبكة إلى الإنترنت = عنوان الراوتر"],
              ],
            },
            {
              id: "m28-l01-p01-ranges", type: "callout", origin: "book", kind: "remember", title: "المدى الخاص",
              spans: [L("10.0.0.0/8"), T(" · "), L("172.16.0.0/12"), T(" · "), L("192.168.0.0/16"), T(" (داخل الشبكة فقط).")],
            },
            {
              id: "m28-l01-p01-assign", type: "callout", origin: "book", kind: "important", title: "التعيين",
              spans: [L("Static"), T(" = يُدخَل يدويًّا ولا يتغيّر، و "), L("DHCP"), T(" = يُعطى تلقائيًّا ("), L("IP · Gateway · Subnet · DNS"), T(").")],
            },
            {
              // ENRICHMENT (Batch 9): SVG visual enrichment appended after the book content.
              id: "m28-l01-p01-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m28/ip-vs-mac-summary", motion: false,
              source: src(231),
              title: "مخطط: IP منطقي مقابل MAC فيزيائي",
              alt: "مخطط مقارنة يوضّح أن IP عنوان منطقي بطول 32 bit يتغيّر بتغيّر الشبكة، بينما MAC عنوان فيزيائي بطول 48 bit ثابت في بطاقة الجهاز.",
              caption: "‏IP منطقي يتغيّر مع الشبكة · MAC فيزيائي ثابت في البطاقة.",
            },
            {
              id: "m28-l01-p01-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("هذه الصفحة تجمع ما تفرّق في الوحدات الأولى: "), L("IP"), T(" منطقي ويتغيّر بتغيّر الشبكة، أما "), L("MAC"), T(" ففيزيائي مطبوع في البطاقة. القناع يفصل جزء الشبكة عن جزء الأجهزة، والبوابة هي الراوتر الذي تخرج منه إلى الإنترنت.")],
            },
            {
              id: "m28-l01-p01-ws", type: "practice-table", origin: "teacher-enrichment", caption: "ورقة عمل: هل العنوان خاص أم عام؟",
              headers: ["العنوان", "النوع"],
              columnDirs: ["ltr", "rtl"],
              rows: [["192.168.1.20", PRIV("خاص Private")], ["8.8.8.8", PRIV("عام Public")], ["10.5.6.7", PRIV("خاص Private")], ["172.20.0.5", PRIV("خاص Private")], ["172.32.0.5", PRIV("عام Public")]],
            },
            {
              id: "m28-l01-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما طول عنوان MAC بحسب جدول الكتاب؟",
                options: [opt("m28-l01-p01-q1-a", "48 bit = 6 أزواج Hex", true), opt("m28-l01-p01-q1-b", "32 bit = 4 خانات عشرية"), opt("m28-l01-p01-q1-c", "128 bit = 8 مجموعات")],
                feedback: {
                  hints: ["سطر «MAC — عنوان البطاقة» في الجدول.", "عنوان فيزيائي ثابت من ستة أزواج."],
                  correctFeedback: "صحيح — 48 bit تُكتب ستة أزواج Hex.",
                  incorrectFeedback: "افحص سطر MAC في الجدول: 32 bit هو طول IP، و 128 bit طول IPv6.",
                  explanation: "IP منطقي بطول 32 bit، و MAC فيزيائي بطول 48 bit.",
                },
              },
            },
          ],
        },
        // PDF 232 — فئات عناوين IPv4
        {
          id: "791381-m28-l01-p02",
          title: "فئات عناوين IPv4",
          order: 2,
          source: src(232),
          keywords: ["Class A", "Class B", "Class C", "255.0.0.0", "255.255.0.0", "255.255.255.0", "16,777,214", "65,534", "254", "Loopback", "127.x"],
          blocks: [
            {
              id: "m28-l01-p02-table", type: "table", origin: "book",
              caption: "الفئات الثلاث كما في الكتاب",
              headers: ["الفئة", "النطاق", "Subnet Mask", "عدد الأجهزة"],
              columnDirs: ["ltr", "ltr", "ltr", "ltr"],
              rows: [
                ["Class A", "1.0.0.0 – 126.255.255.255", "255.0.0.0  /8", "16,777,214"],
                ["Class B", "128.0.0.0 – 191.255.255.255", "255.255.0.0  /16", "65,534"],
                ["Class C", "192.0.0.0 – 223.255.255.255", "255.255.255.0  /24", "254"],
              ],
            },
            {
              id: "m28-l01-p02-notes", type: "callout", origin: "book", kind: "remember", title: "ملاحظتان",
              spans: [L("127.x"), T(" محجوز لـ "), L("Loopback"), T(" (لذلك تنتهي "), L("A"), T(" عند "), L("126"), T(")، وعدد الأجهزة = "), L("2^host − 2"), T(" بعد طرح الشبكة والبث.")],
            },
            {
              // ENRICHMENT (Batch 9): REUSE of the existing m08 address-classes visual (exact source match, PDF 232).
              id: "m28-l01-p02-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m08/address-classes", motion: true,
              source: src(232),
              title: "مخطط: فئات العناوين A · B · C",
              alt: "مخطط يوضّح فئات عناوين IPv4 الثلاث A و B و C بمداها وقناعها الافتراضي، كما في جدول الصفحة.",
              caption: "‏الخانة الأولى تحدّد الفئة، والقناع الافتراضي يتبعها.",
            },
            {
              id: "m28-l01-p02-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("انظر إلى الخانة الأولى فقط لتعرف الفئة: من "), L("1"), T(" إلى "), L("126"), T(" فئة A، ومن "), L("128"), T(" إلى "), L("191"), T(" فئة B، ومن "), L("192"), T(" إلى "), L("223"), T(" فئة C. القناع الافتراضي يتبع الفئة: "), L("/8"), T(" ثم "), L("/16"), T(" ثم "), L("/24"), T(".")],
            },
            {
              id: "m28-l01-p02-ws", type: "practice-table", origin: "teacher-enrichment", caption: "ورقة عمل: حدّد فئة كل عنوان من خانته الأولى",
              headers: ["العنوان", "الفئة"],
              columnDirs: ["ltr", "ltr"],
              rows: [["10.5.6.7", CLASS("Class A")], ["172.16.5.40", CLASS("Class B")], ["192.168.1.25", CLASS("Class C")], ["150.10.1.1", CLASS("Class B")], ["200.1.1.1", CLASS("Class C")]],
            },
            {
              id: "m28-l01-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "كم عدد الأجهزة القابلة للاستخدام في شبكة من الفئة C بحسب الجدول؟ (رقم)", answer: "254",
                feedback: {
                  hints: ["العمود الأخير في الجدول، سطر Class C.", "الفئة C قناعها /24 فيبقى 8 بتات للأجهزة."],
                  correctFeedback: "صحيح — 254 جهازًا.",
                  incorrectFeedback: "افحص سطر Class C: 2^8 − 2 = 254.",
                  explanation: "ثماني بتات للأجهزة تعطي 256 عنوانًا، نطرح عنوان الشبكة وعنوان البث فيبقى 254.",
                },
              },
            },
          ],
        },
        // PDF 233 — أنظمة العدّ والتحويل
        {
          id: "791381-m28-l01-p03",
          title: "أنظمة العدّ والتحويل",
          order: 3,
          source: src(233),
          keywords: ["Decimal", "Binary", "Hex", "128 64 32 16 8 4 2 1", "192 = 128 + 64", "11000000"],
          blocks: [
            {
              id: "m28-l01-p03-table", type: "table", origin: "book",
              caption: "أنظمة العدّ الثلاثة",
              headers: ["النظام", "الأساس", "الأرقام", "الاستخدام"],
              columnDirs: ["rtl", "ltr", "ltr", "rtl"],
              rows: [
                ["العشري Decimal", "10", "0 – 9", "الاستخدام اليومي"],
                ["الثنائي Binary", "2", "0 , 1", "لغة الحاسوب"],
                ["السادس عشر Hex", "16", "0–9 , A–F", "عناوين MAC · IPv6"],
              ],
            },
            {
              id: "m28-l01-p03-boxes", type: "table", origin: "book",
              caption: "طريقة الصناديق (العشري ↔ الثنائي)",
              headers: ["128", "64", "32", "16", "8", "4", "2", "1"],
              columnDirs: ["ltr", "ltr", "ltr", "ltr", "ltr", "ltr", "ltr", "ltr"],
              rows: [["1", "1", "0", "0", "0", "0", "0", "0"]],
            },
            {
              id: "m28-l01-p03-idea", type: "callout", origin: "book", kind: "tip", title: "الفكرة",
              spans: [T("نضع "), L("1"), T(" تحت الصناديق التي مجموعها يساوي الرقم. مثال: "), L("192 = 128 + 64 = 11000000₂"), T(".")],
            },
            {
              // ENRICHMENT (Batch 9): REUSE of the existing m02 conversion-map visual (exact source match, PDF 233).
              id: "m28-l01-p03-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m02/conversion-map", motion: true,
              source: src(233),
              title: "مخطط: التحويل بين أنظمة العدّ",
              alt: "مخطط يربط أنظمة العدّ الثلاثة العشري والثنائي والسادس عشر واتجاهات التحويل بينها، كما في جدول الصفحة.",
              caption: "‏العشري · الثنائي · السادس عشر والتحويل بينها.",
            },
            {
              id: "m28-l01-p03-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("سطر الصناديق أعلاه يحلّ المثال نفسه: "), L("1"), T(" تحت "), L("128"), T(" و "), L("1"), T(" تحت "), L("64"), T(" و "), L("0"), T(" تحت الباقي، فيُقرأ "), L("11000000"), T(". للتحويل العكسي اجمع قيم الصناديق التي تحتها "), L("1"), T(".")],
            },
            {
              id: "m28-l01-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "حوّل العدد العشري 192 إلى ثنائي بطريقة الصناديق (ثماني خانات).", answer: "11000000",
                feedback: {
                  hints: ["مثال «الفكرة» في الصفحة نفسها.", "192 = 128 + 64، فضع 1 تحت الصندوقين الأولين."],
                  correctFeedback: "صحيح — 11000000.",
                  incorrectFeedback: "افحص سطر الصناديق: 1 تحت 128 و 64 فقط، والبقية أصفار.",
                  explanation: "128 + 64 = 192، فالخانتان الأوليان 1 والست الباقية 0.",
                },
              },
            },
            {
              id: "m28-l01-p03-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي نظام عدّ يُستعمل لكتابة عناوين MAC و IPv6 بحسب الجدول؟",
                options: [opt("m28-l01-p03-q2-a", "السادس عشر Hex", true), opt("m28-l01-p03-q2-b", "الثنائي Binary"), opt("m28-l01-p03-q2-c", "العشري Decimal")],
                feedback: {
                  hints: ["عمود «الاستخدام» في الجدول الأول.", "أرقامه 0–9 والحروف A–F."],
                  correctFeedback: "صحيح — Hex الأساس 16.",
                  incorrectFeedback: "افحص السطر الثالث من الجدول: عناوين MAC · IPv6.",
                  explanation: "الثنائي لغة الحاسوب، والعشري للاستخدام اليومي، والسادس عشر لعناوين MAC و IPv6.",
                },
              },
            },
          ],
        },
        // PDF 234 — أجهزة الشبكة
        {
          id: "791381-m28-l01-p04",
          title: "أجهزة الشبكة",
          order: 4,
          source: src(234),
          keywords: ["Hub", "Switch", "Router", "Access Point", "Modem", "Physical", "Data Link", "Network"],
          blocks: [
            {
              id: "m28-l01-p04-table", type: "table", origin: "book",
              caption: "الجهاز ووظيفته وطبقته",
              headers: ["الجهاز", "الوظيفة", "الطبقة"],
              columnDirs: ["ltr", "rtl", "ltr"],
              rows: [
                ["Hub", "يرسل للجميع (قديم)", "Physical"],
                ["Switch", "يرسل للمطلوب فقط ويحفظ MAC", "Data Link"],
                ["Router", "يربط شبكات مختلفة (يفهم IP)", "Network"],
                ["Access Point", "نقطة وصول WiFi لاسلكية", "Data Link"],
                ["Modem", "يحوّل الإشارة (رقمي ↔ تناظري)", "Physical"],
              ],
            },
            {
              id: "m28-l01-p04-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [L("Hub"), T(" يرسل للكل، "), L("Switch"), T(" للمقصود، "), L("Router"), T(" بين الشبكات.")],
            },
            {
              // ENRICHMENT (Batch 9): SVG visual enrichment appended after the book content.
              id: "m28-l01-p04-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m28/network-device-roles", motion: false,
              source: src(234),
              title: "مخطط: أجهزة الشبكة ووظائفها وطبقاتها",
              alt: "مخطط يعرض الأجهزة الخمسة Hub و Switch و Router و Access Point و Modem مع وظيفة كل جهاز والطبقة التي يعمل فيها، كما في جدول الصفحة.",
              caption: "‏الطبقة تكشف ما «يفهمه» كل جهاز: إشارة أم MAC أم IP.",
            },
            {
              id: "m28-l01-p04-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("الطبقة تخبرك بما «يفهمه» الجهاز: "), L("Hub"), T(" و "), L("Modem"), T(" يتعاملان مع الإشارة فقط، و "), L("Switch"), T(" و "), L("Access Point"), T(" يقرآن عنوان "), L("MAC"), T("، و "), L("Router"), T(" وحده يقرأ عنوان "), L("IP"), T(" ليختار الطريق بين الشبكات.")],
            },
            {
              id: "m28-l01-p04-ws", type: "practice-table", origin: "teacher-enrichment", caption: "ورقة عمل: في أي طبقة يعمل كل جهاز؟",
              headers: ["الجهاز", "الطبقة"],
              columnDirs: ["ltr", "ltr"],
              rows: [["Switch", LAYER("Data Link")], ["Router", LAYER("Network")], ["Hub", LAYER("Physical")], ["Access Point", LAYER("Data Link")], ["Modem", LAYER("Physical")]],
            },
            {
              id: "m28-l01-p04-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "السويتش يرسل الإطار إلى المنفذ المطلوب فقط ويحفظ عناوين MAC.", answer: true,
                feedback: {
                  hints: ["سطر Switch في الجدول.", "قارنه بسطر Hub الذي يرسل للجميع."],
                  correctFeedback: "صحيح — للمطلوب فقط ويحفظ MAC.",
                  incorrectFeedback: "افحص سطر Switch: «يرسل للمطلوب فقط ويحفظ MAC».",
                  explanation: "الإرسال للجميع من صفات Hub القديم، أما Switch فيقرأ MAC ويرسل للمقصود.",
                },
              },
            },
          ],
        },
        // PDF 235 — الكوابل ووسائط الاتصال
        {
          id: "791381-m28-l01-p05",
          title: "الكوابل ووسائط الاتصال",
          order: 5,
          source: src(235),
          keywords: ["UTP", "STP", "Fiber", "Coaxial", "1 Gbps", "100 Gbps", "10 Mbps", "Straight", "Cross", "Roll-over"],
          blocks: [
            {
              id: "m28-l01-p05-cables", type: "table", origin: "book",
              caption: "أنواع الكوابل",
              headers: ["الكابل", "الوصف"],
              columnDirs: ["ltr", "rtl"],
              rows: [["UTP", "نحاسي بدون حماية، الأشيع"], ["STP", "نحاسي مع حماية ضد التشويش"], ["Fiber", "ألياف، مسافات طويلة وسرعة"]],
            },
            {
              id: "m28-l01-p05-media", type: "table", origin: "book",
              caption: "وسائط الاتصال",
              headers: ["الوسيط", "السرعة", "المدى"],
              columnDirs: ["ltr", "ltr", "rtl"],
              rows: [["UTP", "1 Gbps", "100 م"], ["Fiber", "100 Gbps", "عدّة كم"], ["Coaxial", "10 Mbps", "قصير"]],
            },
            {
              id: "m28-l01-p05-wiring", type: "table", origin: "book",
              caption: "توصيل الكابل",
              headers: ["الكابل", "الاستخدام"],
              columnDirs: ["ltr", "rtl"],
              rows: [["Straight", "جهاز — سويتش/راوتر"], ["Cross", "جهاز — جهاز"], ["Roll-over", "كونسول للإعداد"]],
            },
            {
              id: "m28-l01-p05-remember", type: "callout", origin: "book", kind: "remember", title: "للتذكّر",
              spans: [T("الألياف "), L("Fiber"), T(" هي الأسرع والأبعد والأكثر مقاومة للتشويش.")],
            },
            {
              // ENRICHMENT (Batch 9): SVG visual enrichment appended after the book content.
              id: "m28-l01-p05-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m28/cable-media-overview", motion: false,
              source: src(235),
              title: "مخطط: الكوابل وطرق التوصيل",
              alt: "مخطط يعرض أنواع الكوابل UTP و STP و Fiber وطرق التوصيل الثلاث Straight و Cross و Roll-over، كما في جداول الصفحة.",
              caption: "‏لكل كابل نوعه، ولكل حالة توصيلها المناسب.",
            },
            {
              id: "m28-l01-p05-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("ثلاث زوايا للكابل: نوعه (نحاسي أم ألياف)، وحدود وسيطه (سرعة ومدى)، وطريقة توصيله. "), L("Straight"), T(" بين جهازين مختلفين، و "), L("Cross"), T(" بين جهازين متشابهين، و "), L("Roll-over"), T(" لمنفذ الكونسول عند برمجة السويتش أو الراوتر.")],
            },
            {
              id: "m28-l01-p05-ws", type: "practice-table", origin: "teacher-enrichment", caption: "ورقة عمل: أي كابل توصيل تختار؟",
              headers: ["الحالة", "الكابل"],
              columnDirs: ["rtl", "ltr"],
              rows: [["حاسوب إلى سويتش", CABLE("Straight")], ["حاسوب إلى حاسوب", CABLE("Cross")], ["حاسوب إلى منفذ كونسول الراوتر للإعداد", CABLE("Roll-over")], ["راوتر إلى سويتش", CABLE("Straight")]],
            },
            {
              id: "m28-l01-p05-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي وسيط يصل مداه إلى عدّة كيلومترات بسرعة 100 Gbps بحسب الجدول؟",
                options: [opt("m28-l01-p05-q1-a", "Fiber", true), opt("m28-l01-p05-q1-b", "UTP"), opt("m28-l01-p05-q1-c", "Coaxial")],
                feedback: {
                  hints: ["جدول «وسائط الاتصال»، عمود المدى.", "الوسيط الذي يصفه الكتاب بالأسرع والأبعد."],
                  correctFeedback: "صحيح — الألياف Fiber.",
                  incorrectFeedback: "افحص جدول الوسائط: UTP مداه 100 م، و Coaxial مداه قصير.",
                  explanation: "Fiber 100 Gbps لعدّة كم، UTP 1 Gbps لمئة متر، Coaxial 10 Mbps لمدى قصير.",
                },
              },
            },
          ],
        },
        // PDF 236 — أنواع الشبكات حسب النطاق
        {
          id: "791381-m28-l01-p06",
          title: "أنواع الشبكات حسب النطاق",
          order: 6,
          source: src(236),
          keywords: ["PAN", "LAN", "MAN", "WAN", "WLAN", "Personal Area Network", "Local Area Network", "Metropolitan Area Network", "Wide Area Network", "Wireless LAN"],
          blocks: [
            {
              id: "m28-l01-p06-table", type: "table", origin: "book",
              caption: "الرمز والاسم الكامل والمدى",
              headers: ["الرمز", "الاسم الكامل", "المدى"],
              columnDirs: ["ltr", "ltr", "rtl"],
              rows: [
                ["PAN", "Personal Area Network", "بلوتوث (أمتار)"],
                ["LAN", "Local Area Network", "مكتب / بيت (محلية)"],
                ["MAN", "Metropolitan Area Network", "مدينة"],
                ["WAN", "Wide Area Network", "إنترنت (دول)"],
                ["WLAN", "Wireless LAN", "محلية لاسلكية (WiFi)"],
              ],
            },
            {
              id: "m28-l01-p06-idea", type: "callout", origin: "book", kind: "tip", title: "الفكرة",
              spans: [T("التصنيف حسب المسافة: من أمتار في "), L("PAN"), T(" إلى العالم كله في "), L("WAN"), T(".")],
            },
            {
              id: "m28-l01-p06-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("الحرف الأول يحمل المعنى: "), L("P"), T(" شخصي، "), L("L"), T(" محلي، "), L("M"), T(" مدينة، "), L("W"), T(" واسع. و "), L("WLAN"), T(" ليست مدى جديدًا بل "), L("LAN"), T(" نفسها لكن بلا كابل.")],
            },
            {
              id: "m28-l01-p06-ws", type: "practice-table", origin: "teacher-enrichment", caption: "ورقة عمل: حدّد نوع الشبكة من وصفها",
              headers: ["الوصف", "النوع"],
              columnDirs: ["rtl", "ltr"],
              rows: [["سماعة بلوتوث مع الهاتف", SCOPE("PAN")], ["حواسيب مختبر المدرسة بالكابل", SCOPE("LAN")], ["ربط فروع في مدينة واحدة", SCOPE("MAN")], ["ربط فروع في دول مختلفة", SCOPE("WAN")], ["أجهزة البيت عبر WiFi", SCOPE("WLAN")]],
            },
            {
              id: "m28-l01-p06-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "ما رمز الشبكة التي تغطّي مدينة كاملة؟ (بالإنجليزية)", answer: "MAN",
                feedback: {
                  hints: ["السطر الثالث في الجدول.", "الحرف الأول من Metropolitan."],
                  correctFeedback: "صحيح — MAN.",
                  incorrectFeedback: "افحص عمود المدى: «مدينة» تقابل Metropolitan Area Network.",
                  explanation: "LAN محلية، MAN مدينة، WAN دول.",
                },
              },
            },
          ],
        },
      ],
    },
    // ── l02 النماذج والبروتوكولات (PDF 237–240) ───────────────────────────────────────────────────────────────
    {
      id: "791381-m28-l02",
      title: "النماذج والبروتوكولات",
      order: 2,
      pages: [
        // PDF 237 — نموذج OSI
        {
          id: "791381-m28-l02-p01",
          title: "نموذج OSI — الطبقات السبع",
          order: 1,
          source: src(237),
          keywords: ["OSI", "Application", "Presentation", "Session", "Transport", "Network", "Data Link", "Physical", "All People Seem To Need Data Processing"],
          blocks: [
            {
              id: "m28-l02-p01-table", type: "table", origin: "book",
              caption: "الطبقات السبع مع أمثلتها",
              headers: ["الطبقة", "الاسم", "أمثلة"],
              columnDirs: ["rtl", "ltr", "ltr"],
              rows: [
                ["7 — التطبيقات", "Application", "HTTP·DNS"],
                ["6 — العرض", "Presentation", "SSL·JPEG"],
                ["5 — الجلسات", "Session", "RPC"],
                ["4 — النقل", "Transport", "TCP·UDP"],
                ["3 — التوجيه", "Network", "IP·ICMP"],
                ["2 — الربط", "Data Link", "MAC"],
                ["1 — الإشارات", "Physical", "Cables"],
              ],
            },
            {
              id: "m28-l02-p01-idea", type: "callout", origin: "book", kind: "tip", title: "الفكرة",
              spans: [T("سبع طبقات، كل طبقة وظيفة محدّدة وتسلّم للتالية أثناء انتقال البيانات.")],
            },
            {
              id: "m28-l02-p01-mnemonic", type: "callout", origin: "book", kind: "remember", title: "للحفظ (7 إلى 1)",
              spans: [L("All People Seem To Need Data Processing"), T(" ابدأ من الأعلى ("), L("Application"), T(") للأسفل ("), L("Physical"), T(") — وهذا اتجاه الإرسال.")],
            },
            {
              // ENRICHMENT (Batch 9): REUSE of the existing m13 osi-seven-layers visual (exact source match, PDF 237).
              id: "m28-l02-p01-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m13/osi-seven-layers", motion: true,
              source: src(237),
              title: "مخطط: طبقات OSI السبع",
              alt: "مخطط يعرض طبقات نموذج OSI السبع من التطبيقات إلى الإشارات بترتيبها، كما في جدول الصفحة.",
              caption: "‏سبع طبقات، المرسل ينزل من 7 إلى 1.",
            },
            {
              id: "m28-l02-p01-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("كل كلمة في جملة الحفظ تبدأ بحرف الطبقة: "), L("A"), T("pplication، "), L("P"), T("resentation، "), L("S"), T("ession، "), L("T"), T("ransport، "), L("N"), T("etwork، "), L("D"), T("ata Link، "), L("P"), T("hysical. المرسل ينزل من 7 إلى 1، والمستقبل يصعد من 1 إلى 7.")],
            },
            {
              id: "m28-l02-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "في أي طبقة يعمل TCP و UDP بحسب الجدول؟",
                options: [opt("m28-l02-p01-q1-a", "4 — النقل Transport", true), opt("m28-l02-p01-q1-b", "3 — التوجيه Network"), opt("m28-l02-p01-q1-c", "7 — التطبيقات Application")],
                feedback: {
                  hints: ["عمود «أمثلة» في الجدول.", "الطبقة الرابعة."],
                  correctFeedback: "صحيح — الطبقة 4 Transport.",
                  incorrectFeedback: "افحص السطر الرابع: TCP·UDP أمثلة طبقة النقل.",
                  explanation: "IP·ICMP في الطبقة 3، و HTTP·DNS في الطبقة 7.",
                },
              },
            },
            {
              id: "m28-l02-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "ما الطبقة رقم 2 في نموذج OSI؟ (اكتب اسمها بالإنجليزية)", answer: "Data Link",
                feedback: {
                  hints: ["السطر قبل الأخير في الجدول.", "الطبقة التي مثالها MAC."],
                  correctFeedback: "صحيح — Data Link.",
                  incorrectFeedback: "افحص سطر «2 — الربط» في الجدول.",
                  explanation: "الطبقة 2 هي الربط Data Link ومثالها عنوان MAC، والطبقة 1 هي Physical.",
                },
              },
            },
          ],
        },
        // PDF 238 — البروتوكولات والمنافذ المهمّة
        {
          id: "791381-m28-l02-p02",
          title: "البروتوكولات والمنافذ المهمّة",
          order: 2,
          source: src(238),
          keywords: ["HTTP 80", "HTTPS 443", "FTP 20,21", "TFTP 69", "DNS 53", "DHCP 67,68", "SMTP 25", "POP3 110", "IMAP 143", "SSH 22", "TELNET 23", "ARP", "ICMP"],
          blocks: [
            {
              id: "m28-l02-p02-table", type: "table", origin: "book",
              caption: "البروتوكول ومنفذه ووظيفته",
              headers: ["البروتوكول", "Port", "الوظيفة"],
              columnDirs: ["ltr", "ltr", "rtl"],
              rows: [
                ["HTTP", "80", "تصفّح عادي"], ["HTTPS", "443", "تصفّح آمن"], ["FTP", "20,21", "نقل ملفات"], ["TFTP", "69", "نقل ملفات بسيط"],
                ["DNS", "53", "ترجمة الأسماء إلى IP"], ["DHCP", "67,68", "توزيع IP تلقائي"], ["SMTP", "25", "إرسال بريد"], ["POP3", "110", "استقبال بريد"],
                ["IMAP", "143", "إدارة البريد"], ["SSH", "22", "دخول آمن عن بُعد"], ["TELNET", "23", "دخول غير آمن"],
              ],
            },
            {
              id: "m28-l02-p02-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [L("ARP"), T(" يربط "), L("IP"), T(" بـ "), L("MAC"), T("، و "), L("ICMP"), T(" للفحص ("), L("ping"), T(")، وكلاهما في الطبقات الدنيا.")],
            },
            {
              // ENRICHMENT (Batch 9): REUSE of the existing m21 well-known-ports visual (a source-faithful subset of the
              // page's port table — every service/port it draws is printed here; PDF 238).
              id: "m28-l02-p02-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m21/well-known-ports", motion: false,
              source: src(238),
              title: "مخطط: البروتوكولات ومنافذها",
              alt: "مخطط يربط البروتوكولات الشائعة بأرقام منافذها مثل HTTP 80 و HTTPS 443 و DNS 53 و SSH 22، كما في جدول الصفحة.",
              caption: "‏لكل بروتوكول منفذه المعروف.",
            },
            {
              id: "m28-l02-p02-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("لاحظ الأزواج: "), L("HTTP 80"), T(" وأخوه الآمن "), L("HTTPS 443"), T("، و "), L("TELNET 23"), T(" وبديله الآمن "), L("SSH 22"), T("، و "), L("FTP"), T(" الكامل مقابل "), L("TFTP"), T(" البسيط. "), L("ARP"), T(" و "), L("ICMP"), T(" لا منفذ لهما لأنهما تحت طبقة النقل.")],
            },
            {
              id: "m28-l02-p02-ws", type: "practice-table", origin: "teacher-enrichment", caption: "ورقة عمل: اختر رقم المنفذ لكل بروتوكول",
              headers: ["البروتوكول", "Port"],
              columnDirs: ["ltr", "ltr"],
              rows: [["HTTP", PORT("80")], ["SSH", PORT("22")], ["DNS", PORT("53")], ["HTTPS", PORT("443")], ["TELNET", PORT("23")], ["SMTP", PORT("25")]],
            },
            {
              id: "m28-l02-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي بروتوكول يربط عنوان IP بعنوان MAC بحسب تذكير الكتاب؟",
                options: [opt("m28-l02-p02-q1-a", "ARP", true), opt("m28-l02-p02-q1-b", "ICMP"), opt("m28-l02-p02-q1-c", "DNS")],
                feedback: {
                  hints: ["صندوق «تذكّر» أسفل الجدول.", "الآخر هو بروتوكول الفحص ping."],
                  correctFeedback: "صحيح — ARP.",
                  incorrectFeedback: "افحص صندوق تذكّر: ICMP للفحص، و DNS يترجم الأسماء إلى IP.",
                  explanation: "ARP يربط IP بـ MAC داخل الشبكة المحلية، و DNS يترجم الاسم إلى IP.",
                },
              },
            },
          ],
        },
        // PDF 239 — الفروق بين TCP و UDP
        {
          id: "791381-m28-l02-p03",
          title: "الفروق بين TCP و UDP",
          order: 3,
          source: src(239),
          keywords: ["TCP", "UDP", "Connection-Oriented", "ACK", "موثوق", "VoIP", "HTTP/HTTPS", "TFTP", "DHCP", "RIP", "SNMP", "DNS"],
          blocks: [
            {
              id: "m28-l02-p03-table", type: "table", origin: "book",
              caption: "المقارنة كما في الكتاب",
              headers: ["الميزة", "TCP", "UDP"],
              columnDirs: ["rtl", "rtl", "rtl"],
              rows: [
                ["نوع الاتصال", "يتصل أولًا (Connection-Oriented)", "بدون اتصال"],
                ["التأكيد", "يرسل تأكيد استلام ACK", "لا يرسل تأكيد"],
                ["الموثوقية", "موثوق — يضمن الوصول", "قد تضيع البيانات"],
                ["السرعة", "بطيء نسبيًّا", "سريع جدًّا"],
                ["الاستخدام", "الملفات، الويب، البريد", "VoIP، البث، الألعاب"],
              ],
            },
            {
              id: "m28-l02-p03-remember", type: "callout", origin: "book", kind: "remember", title: "للتذكّر",
              spans: [L("TCP: HTTP/HTTPS · FTP · SMTP · SSH"), T(" — "), L("UDP: TFTP · DHCP · RIP · SNMP"), T(" — كلاهما: "), L("DNS"), T(".")],
            },
            {
              // ENRICHMENT (Batch 9): REUSE of the existing m13 tcp-vs-udp visual (exact source match, PDF 239).
              id: "m28-l02-p03-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m13/tcp-vs-udp", motion: true,
              source: src(239),
              title: "مخطط: TCP مقابل UDP",
              alt: "مخطط مقارنة يوضّح الفروق بين TCP الموثوق الذي يتصل أولًا ويؤكّد، و UDP السريع بلا اتصال ولا تأكيد، كما في جدول الصفحة.",
              caption: "‏TCP موثوق ويؤكّد · UDP سريع بلا تأكيد.",
            },
            {
              id: "m28-l02-p03-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("القاعدة العملية: إذا كان ضياع جزء من البيانات مقبولًا مقابل السرعة (صوت، بث، ألعاب) فهو "), L("UDP"), T("، وإذا وجب وصول كل بايت (ملف، صفحة ويب، بريد) فهو "), L("TCP"), T(". "), L("DNS"), T(" يستعمل الاثنين.")],
            },
            {
              id: "m28-l02-p03-ws", type: "practice-table", origin: "teacher-enrichment", caption: "ورقة عمل: TCP أم UDP؟ (بحسب صندوق «للتذكّر»)",
              headers: ["البروتوكول", "النقل"],
              columnDirs: ["ltr", "rtl"],
              rows: [["HTTP", TU("TCP")], ["TFTP", TU("UDP")], ["DNS", TU("كلاهما")], ["SMTP", TU("TCP")], ["DHCP", TU("UDP")], ["SSH", TU("TCP")]],
            },
            {
              id: "m28-l02-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "UDP يرسل تأكيد استلام ACK لكل جزء من البيانات.", answer: false,
                feedback: {
                  hints: ["سطر «التأكيد» في جدول المقارنة.", "أي البروتوكولين «قد تضيع بياناته»؟"],
                  correctFeedback: "صحيح — UDP لا يرسل تأكيدًا.",
                  incorrectFeedback: "افحص سطر التأكيد: TCP يرسل ACK، و UDP لا يرسل تأكيدًا.",
                  explanation: "غياب التأكيد هو ما يجعل UDP سريعًا جدًّا لكن غير موثوق.",
                },
              },
            },
          ],
        },
        // PDF 240 — وحدات البيانات والتغليف
        {
          id: "791381-m28-l02-p04",
          title: "وحدات البيانات والتغليف",
          order: 4,
          source: src(240),
          keywords: ["Data", "Segment", "Packet", "Frame", "Bit", "PDU", "التغليف", "Port", "IP", "MAC"],
          blocks: [
            {
              id: "m28-l02-p04-table", type: "table", origin: "book",
              caption: "وحدة البيانات في كل طبقة",
              headers: ["الطبقة", "الوحدة", "تحتوي"],
              columnDirs: ["ltr", "ltr", "rtl"],
              rows: [
                ["Application", "Data", "البيانات النهائية"],
                ["Transport", "Segment", "يحتوي المنفذ Port"],
                ["Network", "Packet", "يحتوي عنوان IP"],
                ["Data Link", "Frame", "يحتوي عنوان MAC"],
                ["Physical", "Bit", "إشارات 0 و 1"],
              ],
            },
            {
              id: "m28-l02-p04-remember", type: "callout", origin: "book", kind: "remember", title: "للتذكّر",
              spans: [L("Data"), T(" ثم "), L("Segment"), T(" ثم "), L("Packet"), T(" ثم "), L("Frame"), T(" ثم "), L("Bits"), T(" عند الإرسال، والعكس عند الاستقبال.")],
            },
            {
              // ENRICHMENT (Batch 9): REUSE of the existing m18 encapsulation-stack visual (exact source match, PDF 240).
              id: "m28-l02-p04-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m18/encapsulation-stack", motion: true,
              source: src(240),
              title: "مخطط: التغليف ووحدات البيانات",
              alt: "مخطط يوضّح وحدات البيانات في كل طبقة Data ثم Segment ثم Packet ثم Frame ثم Bits وكيف يضيف التغليف ترويسة كل طبقة، كما في جدول الصفحة.",
              caption: "‏كل طبقة تغلّف وحدتها بترويسة تحمل عنوانها.",
            },
            {
              id: "m28-l02-p04-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("كل طبقة تضيف «ترويسة» تحمل عنوانها: "), L("Segment"), T(" يحمل المنفذ، و "), L("Packet"), T(" يحمل "), L("IP"), T("، و "), L("Frame"), T(" يحمل "), L("MAC"), T(". هذا هو التغليف، وفكّه عند المستقبل يسير بالترتيب المعاكس.")],
            },
            {
              id: "m28-l02-p04-ws", type: "practice-table", origin: "teacher-enrichment", caption: "ورقة عمل: ما وحدة البيانات في كل طبقة؟",
              headers: ["الطبقة", "الوحدة"],
              columnDirs: ["ltr", "ltr"],
              rows: [["Transport", PDU("Segment")], ["Network", PDU("Packet")], ["Data Link", PDU("Frame")], ["Physical", PDU("Bit")], ["Application", PDU("Data")]],
            },
            {
              id: "m28-l02-p04-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي وحدة بيانات تحتوي عنوان MAC؟",
                options: [opt("m28-l02-p04-q1-a", "Frame", true), opt("m28-l02-p04-q1-b", "Packet"), opt("m28-l02-p04-q1-c", "Segment")],
                feedback: {
                  hints: ["عمود «تحتوي» في الجدول.", "وحدة طبقة Data Link."],
                  correctFeedback: "صحيح — Frame.",
                  incorrectFeedback: "افحص الجدول: Packet يحمل IP، و Segment يحمل المنفذ.",
                  explanation: "Frame وحدة طبقة الربط وتحمل عنوان MAC.",
                },
              },
            },
          ],
        },
      ],
    },
    // ── l03 العنونة والتجزئة (PDF 241–244) ────────────────────────────────────────────────────────────────────
    {
      id: "791381-m28-l03",
      title: "العنونة والتجزئة",
      order: 3,
      pages: [
        // PDF 241 — العناوين الخاصة وأنواع الرسائل
        {
          id: "791381-m28-l03-p01",
          title: "العناوين الخاصة وأنواع الرسائل",
          order: 1,
          source: src(241),
          keywords: ["127.0.0.1", "APIPA", "169.254.x.x", "0.0.0.0", "255.255.255.255", "Unicast", "Multicast", "Broadcast", "ARP", "DHCP", "RIP"],
          blocks: [
            {
              id: "m28-l03-p01-special", type: "table", origin: "book",
              caption: "عناوين خاصة",
              headers: ["العنوان", "المعنى"],
              columnDirs: ["ltr", "rtl"],
              rows: [["127.0.0.1", "الجهاز نفسه"], ["169.254.x.x", "APIPA عند فشل DHCP"], ["0.0.0.0", "لا يوجد عنوان"], ["255.255.255.255", "Broadcast للجميع"]],
            },
            {
              id: "m28-l03-p01-types", type: "table", origin: "book",
              caption: "أنواع الرسائل",
              headers: ["النوع", "المعنى"],
              columnDirs: ["ltr", "rtl"],
              rows: [["Unicast", "من جهاز لجهاز"], ["Multicast", "من واحد لعديد"], ["Broadcast", "من جهاز للجميع"]],
            },
            {
              id: "m28-l03-p01-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("البروتوكولات التي تستخدم "), L("Broadcast"), T(": "), L("ARP · DHCP · RIP"), T(".")],
            },
            {
              id: "m28-l03-p01-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("إذا رأيت على جهاز عنوانًا يبدأ بـ "), L("169.254"), T(" فهذا ليس عنوانًا من الخادم بل "), L("APIPA"), T(": الجهاز أعطى نفسه عنوانًا لأن "), L("DHCP"), T(" لم يجب. و "), L("0.0.0.0"), T(" يظهر في المسار الافتراضي بمعنى «أي شبكة».")],
            },
            {
              id: "m28-l03-p01-ws", type: "practice-table", origin: "teacher-enrichment", caption: "ورقة عمل: اختر العنوان الخاص المناسب لكل معنى",
              headers: ["المعنى", "العنوان"],
              columnDirs: ["rtl", "ltr"],
              rows: [["الجهاز نفسه", SPECIAL("127.0.0.1")], ["Broadcast للجميع", SPECIAL("255.255.255.255")], ["APIPA عند فشل DHCP", SPECIAL("169.254.x.x")], ["لا يوجد عنوان", SPECIAL("0.0.0.0")]],
            },
            {
              id: "m28-l03-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي نوع رسائل يستخدمه ARP و DHCP و RIP بحسب الكتاب؟",
                options: [opt("m28-l03-p01-q1-a", "Broadcast", true), opt("m28-l03-p01-q1-b", "Unicast"), opt("m28-l03-p01-q1-c", "Multicast")],
                feedback: {
                  hints: ["صندوق «تذكّر» في أسفل الصفحة.", "الرسالة التي تصل إلى الجميع."],
                  correctFeedback: "صحيح — Broadcast.",
                  incorrectFeedback: "افحص صندوق تذكّر: ARP · DHCP · RIP تستخدم Broadcast.",
                  explanation: "Unicast لجهاز واحد، Multicast لمجموعة، Broadcast للجميع.",
                },
              },
            },
          ],
        },
        // PDF 242 — التجزئة Subnetting — أمثلة محلولة
        {
          id: "791381-m28-l03-p02",
          title: "التجزئة Subnetting — أمثلة محلولة",
          order: 2,
          source: src(242),
          keywords: ["Subnetting", "10.5.6.7 /8", "172.16.5.40 /16", "192.168.1.25 /24", "الشبكة", "أول جهاز", "آخر جهاز", "البث", "2^host − 2"],
          blocks: [
            {
              id: "m28-l03-p02-table", type: "table", origin: "book",
              caption: "الأمثلة الثلاثة المحلولة",
              headers: ["IP", "البادئة", "الشبكة", "أول جهاز", "آخر جهاز", "البث"],
              columnDirs: ["ltr", "ltr", "ltr", "ltr", "ltr", "ltr"],
              rows: [
                ["10.5.6.7", "/8", "10.0.0.0", "10.0.0.1", "10.255.255.254", "10.255.255.255"],
                ["172.16.5.40", "/16", "172.16.0.0", "172.16.0.1", "172.16.255.254", "172.16.255.255"],
                ["192.168.1.25", "/24", "192.168.1.0", "192.168.1.1", "192.168.1.254", "192.168.1.255"],
              ],
            },
            {
              id: "m28-l03-p02-method", type: "list", origin: "book", variant: "ordered", title: "طريقة الحل (192.168.1.25/24)",
              items: [
                { id: "m28-l03-p02-s1", text: [T("الشبكة: نصفّر جزء الأجهزة "), L("192.168.1.0"), T(".")] },
                { id: "m28-l03-p02-s2", text: [T("أول جهاز = الشبكة + 1 "), L("192.168.1.1"), T(".")] },
                { id: "m28-l03-p02-s3", text: [T("البث: نملأ جزء الأجهزة بـ 1 "), L("192.168.1.255"), T(".")] },
                { id: "m28-l03-p02-s4", text: [T("آخر جهاز = البث − 1 "), L("192.168.1.254"), T(".")] },
              ],
            },
            {
              id: "m28-l03-p02-hosts", type: "callout", origin: "book", kind: "remember", title: "عدد الأجهزة",
              spans: [T("عدد الأجهزة القابلة للاستخدام = "), L("2^host − 2"), T(".")],
            },
            {
              // ENRICHMENT (Batch 9): SVG visual enrichment appended after the book content.
              id: "m28-l03-p02-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m28/subnetting-walkthrough", motion: true,
              source: src(242),
              title: "مخطط: مثال التجزئة 192.168.1.25/24",
              alt: "مخطط يفصل مثال الكتاب 192.168.1.25/24 إلى جزء الشبكة وجزء الجهاز عند البادئة، ويعرض النتائج: الشبكة 192.168.1.0 وأول جهاز .1 وآخر جهاز .254 والبث .255.",
              caption: "‏نصفّر جزء الجهاز للشبكة ونملؤه بـ 255 للبث.",
            },
            {
              id: "m28-l03-p02-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("البادئة تخبرك أين ينتهي جزء الشبكة: "), L("/8"), T(" بعد الخانة الأولى، "), L("/16"), T(" بعد الثانية، "), L("/24"), T(" بعد الثالثة. ما بعدها هو جزء الأجهزة الذي تصفّره للشبكة وتملؤه بـ 255 للبث.")],
            },
            {
              id: "m28-l03-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "ما عنوان البث للشبكة التي ينتمي إليها 172.16.5.40/16؟", answer: "172.16.255.255",
                feedback: {
                  hints: ["السطر الثاني في الجدول، العمود الأخير.", "املأ الخانتين الأخيرتين بـ 255."],
                  correctFeedback: "صحيح — 172.16.255.255.",
                  incorrectFeedback: "افحص طريقة الحل: البث = ملء جزء الأجهزة بـ 1، أي 255 في الخانتين الأخيرتين.",
                  explanation: "مع /16 يبقى 16 بت للأجهزة، فالبث 172.16.255.255 وآخر جهاز 172.16.255.254.",
                },
              },
            },
            {
              id: "m28-l03-p02-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "ما أول جهاز في شبكة العنوان 10.5.6.7/8؟", answer: "10.0.0.1",
                feedback: {
                  hints: ["السطر الأول في الجدول.", "الشبكة 10.0.0.0 زائد واحد."],
                  correctFeedback: "صحيح — 10.0.0.1.",
                  incorrectFeedback: "افحص الخطوة 2 من طريقة الحل: أول جهاز = الشبكة + 1.",
                  explanation: "مع /8 تُصفَّر الخانات الثلاث الأخيرة للشبكة 10.0.0.0، فأول جهاز 10.0.0.1.",
                },
              },
            },
          ],
        },
        // PDF 243 — قناع البدل Wildcard Mask
        {
          id: "791381-m28-l03-p03",
          title: "قناع البدل Wildcard Mask",
          order: 3,
          source: src(243),
          keywords: ["Wildcard", "Subnet Mask", "0.0.0.255", "0.0.255.255", "255 −", "ACL", "OSPF"],
          blocks: [
            {
              id: "m28-l03-p03-def", type: "text", origin: "book",
              spans: [T("يعكس قناع الشبكة (يُحسب بطرح كل خانة من "), L("255"), T(")، ويُستخدم بكثرة في قوائم "), L("ACL"), T(" وبروتوكول "), L("OSPF"), T(".")],
            },
            {
              id: "m28-l03-p03-table", type: "table", origin: "book",
              caption: "القناع ومقابله",
              headers: ["Subnet Mask", "Wildcard", "المعنى"],
              columnDirs: ["ltr", "ltr", "rtl"],
              rows: [["255.255.255.255", "0.0.0.0", "جهاز واحد"], ["255.255.255.0", "0.0.0.255", "شبكة /24"], ["255.255.0.0", "0.0.255.255", "شبكة /16"], ["0.0.0.0", "255.255.255.255", "أي عنوان"]],
            },
            {
              id: "m28-l03-p03-rule", type: "callout", origin: "book", kind: "important", title: "القاعدة",
              spans: [T("قيمة كل خانة في القناع = "), L("255 −"), T(" الخانة المقابلة في "), L("Wildcard"), T(".")],
            },
            {
              id: "m28-l03-p03-example", type: "callout", origin: "book", kind: "tip", title: "مثال",
              spans: [T("قناع "), L("255.255.255.0"), T(" يقابله "), L("Wildcard 0.0.0.255"), T(" (شبكة "), L("/24"), T(" كاملة).")],
            },
            {
              // ENRICHMENT (Batch 9): SVG visual enrichment appended after the book content.
              id: "m28-l03-p03-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m28/wildcard-inversion", motion: true,
              source: src(243),
              title: "مخطط: قلب القناع إلى Wildcard",
              alt: "مخطط يحوّل القناع 255.255.255.0 إلى قناع البدل 0.0.0.255 خانةً خانةً بقاعدة 255 ناقص الخانة، كما في مثال الصفحة.",
              caption: "‏كل خانة في القناع = 255 − الخانة المقابلة في Wildcard.",
            },
            {
              id: "m28-l03-p03-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("في "), L("Wildcard"), T(" الصفر يعني «طابق هذه الخانة تمامًا» و "), L("255"), T(" يعني «لا يهم». لذلك "), L("0.0.0.0"), T(" مع عنوان يعني جهازًا واحدًا (وهو معنى "), L("host"), T(" في ACL)، و "), L("255.255.255.255"), T(" يعني أي عنوان (وهو معنى "), L("any"), T(").")],
            },
            {
              id: "m28-l03-p03-ws", type: "practice-table", origin: "teacher-enrichment", caption: "ورقة عمل: اكتب Wildcard المقابل لكل قناع",
              headers: ["Subnet Mask", "Wildcard"],
              columnDirs: ["ltr", "ltr"],
              rows: [["255.255.255.0", WC("0.0.0.255")], ["255.255.255.255", WC("0.0.0.0")], ["255.255.0.0", WC("0.0.255.255")], ["0.0.0.0", WC("255.255.255.255")]],
            },
            {
              id: "m28-l03-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "ما Wildcard المقابل للقناع 255.255.0.0؟", answer: "0.0.255.255",
                feedback: {
                  hints: ["السطر الثالث في الجدول.", "اطرح كل خانة من 255."],
                  correctFeedback: "صحيح — 0.0.255.255.",
                  incorrectFeedback: "افحص القاعدة: 255 − 255 = 0 للخانتين الأوليين، و 255 − 0 = 255 للخانتين الأخيرتين.",
                  explanation: "قناع /16 يقابله wildcard 0.0.255.255 وهو ما يُكتب في OSPF لشبكة /16.",
                },
              },
            },
          ],
        },
        // PDF 244 — العنوان IPv6 — البنية والتصغير
        {
          id: "791381-m28-l03-p04",
          title: "العنوان IPv6 — البنية والتصغير",
          order: 4,
          source: src(244),
          keywords: ["IPv6", "128 bit", "Hextet", "/64", "2001:0DB8:0000:0000:0000:0000:0000:0001", "2001:DB8::1", "::1", "FE80::/10", "FF00::/8"],
          blocks: [
            {
              id: "m28-l03-p04-table", type: "table", origin: "book",
              caption: "بنية العنوان وتصغيره",
              headers: ["الخاصية", "القيمة", "الشرح"],
              columnDirs: ["rtl", "ltr", "rtl"],
              rows: [
                ["الطول الكلّي", "128 bit", "أطول من IPv4 بأربع مرّات"],
                ["التقسيم", "8 مجموعات", "كل مجموعة Hextet = 16 bit"],
                ["جزء الشبكة Prefix", "64 bit /64", "الجزء الأيسر"],
                ["جزء الجهاز", "64 bit", "الجزء الأيمن يميّز الجهاز"],
                ["العنوان الكامل", "2001:0DB8:0000:0000:0000:0000:0000:0001", ""],
                ["خطوة 1 — حذف الأصفار البادئة", "2001:DB8:0:0:0:0:0:1", ""],
                ["الشكل النهائي — :: مرة واحدة فقط", "2001:DB8::1", ""],
              ],
            },
            {
              id: "m28-l03-p04-special", type: "callout", origin: "book", kind: "remember", title: "عناوين خاصة",
              spans: [L("Loopback = ::1"), T("، و "), L("::"), T(" = لا عنوان، و "), L("Link-Local = FE80::/10"), T("، و "), L("Multicast = FF00::/8"), T(" (لا يوجد "), L("Broadcast"), T(" في "), L("IPv6"), T(").")],
            },
            {
              id: "m28-l03-p04-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("خطوتا التصغير بالترتيب: أولًا احذف الأصفار في بداية كل مجموعة، ثم استبدل أطول سلسلة من مجموعات الأصفار المتتالية بـ "), L("::"), T(" مرة واحدة فقط، وإلا لم يعد ممكنًا معرفة عدد المجموعات المحذوفة.")],
            },
            {
              id: "m28-l03-p04-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "اكتب الشكل النهائي المصغّر للعنوان الكامل الوارد في الجدول (يبدأ بـ 2001:0DB8 وينتهي بـ 0001).", answer: "2001:DB8::1",
                feedback: {
                  hints: ["السطر الأخير في الجدول.", "احذف الأصفار البادئة ثم استبدل سلسلة الأصفار بـ :: مرة واحدة."],
                  correctFeedback: "صحيح — 2001:DB8::1.",
                  incorrectFeedback: "افحص الخطوتين في الجدول: 2001:DB8:0:0:0:0:0:1 ثم 2001:DB8::1.",
                  explanation: "ست مجموعات أصفار متتالية تُستبدل بـ :: مرة واحدة.",
                },
              },
            },
            {
              id: "m28-l03-p04-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "في IPv6 يوجد عنوان Broadcast كما في IPv4.", answer: false,
                feedback: {
                  hints: ["صندوق «عناوين خاصة».", "ما بين القوسين في نهايته."],
                  correctFeedback: "صحيح — لا يوجد Broadcast في IPv6.",
                  incorrectFeedback: "افحص نهاية صندوق العناوين الخاصة: «لا يوجد Broadcast في IPv6».",
                  explanation: "IPv6 يعتمد على Multicast (FF00::/8) بدل البث للجميع.",
                },
              },
            },
          ],
        },
      ],
    },
    // ── l04 التبديل و VLANs (PDF 245–250) ─────────────────────────────────────────────────────────────────────
    {
      id: "791381-m28-l04",
      title: "التبديل و VLANs",
      order: 4,
      pages: [
        // PDF 245 — مفهوم VLANs و VTP
        {
          id: "791381-m28-l04-p01",
          title: "مفهوم VLANs و VTP",
          order: 1,
          source: src(245),
          keywords: ["VLAN", "Broadcast", "1 إلى 4094", "VLAN 1", "VTP", "Domain", "Trunk (802.1Q)", "DMZ", "VPN"],
          blocks: [
            {
              id: "m28-l04-p01-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m28-l04-p01-vlan", term: "VLAN", text: [T("شبكة محلية افتراضية تقسّم السويتش إلى شبكات منطقية. تقلّل حركة البث ("), L("Broadcast"), T(") وتزيد الأمان والتنظيم. النطاق من "), L("1"), T(" إلى "), L("4094"), T("، و "), L("VLAN 1"), T(" هي الافتراضية.")] },
                { id: "m28-l04-p01-vtp", term: "VTP", text: [T("يدير الـ "), L("VLANs"), T(" عبر عدة سويتشات ضمن نفس "), L("Domain"), T(".")] },
              ],
            },
            {
              id: "m28-l04-p01-related", type: "callout", origin: "book", kind: "important", title: "تقنيات مرتبطة",
              spans: [L("Trunk (802.1Q)"), T(" ينقل عدة "), L("VLANs"), T(" · "), L("DMZ"), T(" يعزل السيرفرات · "), L("VPN"), T(" شبكة آمنة عبر الإنترنت.")],
            },
            {
              id: "m28-l04-p01-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("ثلاث أفكار تتكامل: "), L("VLAN"), T(" تقسّم داخل السويتش الواحد، و "), L("Trunk"), T(" يحمل هذا التقسيم بين السويتشات، و "), L("VTP"), T(" ينشر تعريف الـ "), L("VLANs"), T(" نفسها بينها حتى لا تعرّفها يدويًّا في كل سويتش.")],
            },
            {
              id: "m28-l04-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "ما أكبر رقم VLAN في النطاق الذي يذكره الكتاب؟ (رقم)", answer: "4094",
                feedback: {
                  hints: ["بطاقة VLAN، الجملة الأخيرة.", "النطاق من 1 إلى …"],
                  correctFeedback: "صحيح — 4094.",
                  incorrectFeedback: "افحص بطاقة VLAN: «النطاق من 1 إلى 4094».",
                  explanation: "أرقام VLAN من 1 إلى 4094، و VLAN 1 هي الافتراضية.",
                },
              },
            },
            {
              id: "m28-l04-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي تقنية يصفها الكتاب بأنها «شبكة آمنة عبر الإنترنت»؟",
                options: [opt("m28-l04-p01-q2-a", "VPN", true), opt("m28-l04-p01-q2-b", "DMZ"), opt("m28-l04-p01-q2-c", "Trunk (802.1Q)")],
                feedback: {
                  hints: ["صندوق «تقنيات مرتبطة».", "الاختصار الذي ينتهي بـ N من Network."],
                  correctFeedback: "صحيح — VPN.",
                  incorrectFeedback: "افحص الصندوق: DMZ يعزل السيرفرات، و Trunk ينقل عدة VLANs.",
                  explanation: "VPN تبني نفقًا آمنًا عبر الإنترنت العام.",
                },
              },
            },
          ],
        },
        // PDF 246 — أوامر VLAN و Trunk
        {
          id: "791381-m28-l04-p02",
          title: "أوامر VLAN و Trunk",
          order: 2,
          source: src(246),
          keywords: ["vlan 10", "name SALES", "interface range fa0/1-10", "switchport mode access", "switchport access vlan 10", "switchport mode trunk", "switchport trunk allowed vlan 10,20,30", "switchport trunk native vlan 99"],
          blocks: [
            {
              id: "m28-l04-p02-cli", type: "code", origin: "book", language: "cli",
              code: "Device(config)# vlan 10 / name SALES\nDevice(config)# interface range fa0/1-10\nDevice(config)# switchport mode access\nDevice(config)# switchport access vlan 10\nDevice(config)# switchport mode trunk\nDevice(config)# switchport trunk allowed vlan 10,20,30",
            },
            {
              id: "m28-l04-p02-cmds", type: "table", origin: "book",
              caption: "Cisco CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Device(config)# vlan 10 / name SALES", "إنشاء VLAN وتسميتها"],
                ["Device(config)# interface range fa0/1-10", "تحديد عدة منافذ"],
                ["Device(config)# switchport mode access", "وضع Access لربط VLAN واحدة"],
                ["Device(config)# switchport access vlan 10", "ربط المنفذ بـ VLAN 10"],
                ["Device(config)# switchport mode trunk", "وضع Trunk لنقل عدة VLANs"],
                ["Device(config)# switchport trunk allowed vlan 10,20,30", "تحديد VLANs المسموحة"],
              ],
            },
            {
              id: "m28-l04-p02-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [L("switchport trunk native vlan 99"), T(" لتغيير الـ "), L("Native"), T(" لأغراض الأمان.")],
            },
            {
              id: "m28-l04-p02-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("الشرطة المائلة في "), L("vlan 10 / name SALES"), T(" تعني أمرين متتاليين: الأول ينشئ الـ VLAN ويدخل وضعها والثاني يسمّيها. في المهمّة أدناه المنافذ "), L("fa0/1-10"), T(" منافذ وصول في "), L("VLAN 10"), T("، والمنفذ "), L("fa0/24"), T(" هو الـ "), L("Trunk"), T(" الذي يحمل "), L("10,20,30"), T(" مع "), L("native vlan 99"), T(" كما في صندوق «تذكّر».")],
            },
            {
              id: "m28-l04-p02-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مهمّة: VLAN و Trunk و Native VLAN",
              description: "أنت في وضع الإعداد العام للسويتش. أنشئ VLAN 10 باسم SALES، اجعل fa0/1-10 منافذ وصول فيها، واجعل fa0/24 وصلة Trunk تسمح بـ 10,20,30 مع native vlan 99. تُقيَّم الحالة النهائية. محاكاة تعليمية مبسّطة.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "المهمّة: vlan 10 / name SALES، ثم interface range fa0/1-10 مع switchport mode access و switchport access vlan 10، ثم interface fa0/24 مع switchport mode trunk و switchport trunk allowed vlan 10,20,30 و switchport trunk native vlan 99." },
              config: EX({
                kind: "task",
                device: "switch",
                hostname: "Switch",
                startMode: "global",
                intro: "أنت في وضع الإعداد العام. أنشئ VLAN 10 (SALES)، اربط fa0/1-10 بها كمنافذ وصول، واجعل fa0/24 وصلة Trunk (10,20,30، native 99).",
                goals: [
                  { id: "g-vlan", label: "VLAN 10 معرّفة", condition: { kind: "vlan", vlanId: 10 } },
                  ...Array.from({ length: 10 }, (_, i) => ({ id: "g-f" + (i + 1), label: "المنفذ f0/" + (i + 1) + " في VLAN 10", condition: { kind: "interface" as const, name: "f0/" + (i + 1), prop: "accessVlan" as const, value: 10 } })),
                  { id: "g-trunk", label: "المنفذ f0/24 في وضع Trunk", condition: { kind: "interface", name: "f0/24", prop: "switchportMode", value: "trunk" } },
                  { id: "g-allowed", label: "المنفذ f0/24 يسمح بـ VLANs 10,20,30", condition: { kind: "interface", name: "f0/24", prop: "allowedVlans", value: [10, 20, 30] } },
                  { id: "g-native", label: "المنفذ f0/24 يستعمل Native VLAN 99", condition: { kind: "interface", name: "f0/24", prop: "nativeVlan", value: 99 } },
                ],
                hints: ["اتبع سطور صندوق الكتاب بالترتيب، ثم انتقل إلى fa0/24 لأوامر Trunk.", "بعد switchport mode trunk اكتب switchport trunk allowed vlan 10,20,30 ثم switchport trunk native vlan 99."],
                completion: "✓ أحسنت، السويتش مقسّم كما في الكتاب: VLAN 10 على منافذ الوصول، و Trunk على fa0/24 مع Native VLAN 99.",
              }),
            },
            {
              id: "m28-l04-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "لماذا يغيّر الكتاب الـ Native VLAN إلى 99 بحسب صندوق «تذكّر»؟",
                options: [opt("m28-l04-p02-q1-a", "لأغراض الأمان", true), opt("m28-l04-p02-q1-b", "لزيادة سرعة الوصلة"), opt("m28-l04-p02-q1-c", "لأن VLAN 1 لا يمكن استخدامها")],
                feedback: {
                  hints: ["صندوق «تذكّر» أسفل الجدول.", "كلمتان بعد «لتغيير الـ Native»."],
                  correctFeedback: "صحيح — لأغراض الأمان.",
                  incorrectFeedback: "افحص صندوق تذكّر: «لتغيير الـ Native لأغراض الأمان».",
                  explanation: "الافتراضية VLAN 1 معروفة للجميع، فتغيير الـ Native إلى رقم آخر يقلّل المخاطر.",
                },
              },
            },
          ],
        },
        // PDF 247 — أوضاع وأوامر VTP
        {
          id: "791381-m28-l04-p03",
          title: "أوضاع وأوامر VTP",
          order: 3,
          source: src(247),
          keywords: ["VTP", "Server", "Client", "Transparent", "vtp mode server", "vtp domain HFA", "vtp password SA1234"],
          blocks: [
            {
              id: "m28-l04-p03-modes", type: "table", origin: "book",
              caption: "أوضاع VTP",
              headers: ["الوضع", "الوصف"],
              columnDirs: ["ltr", "rtl"],
              rows: [["Server", "ينشئ ويعدّل ويحذف VLANs وينشرها"], ["Client", "يستقبل التحديثات فقط ولا يعدّل"], ["Transparent", "يحتفظ بإعداداته محليًّا ويمرّر التحديثات"]],
            },
            {
              id: "m28-l04-p03-cli", type: "code", origin: "book", language: "cli",
              code: "Switch(config)# vtp mode server\nSwitch(config)# vtp domain HFA\nSwitch(config)# vtp password SA1234",
            },
            {
              id: "m28-l04-p03-cmds", type: "table", origin: "book",
              caption: "Cisco CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [["Switch(config)# vtp mode server", "وضع VTP: خادم"], ["Switch(config)# vtp domain HFA", "اسم المجال HFA"], ["Switch(config)# vtp password SA1234", "كلمة مرور المجال"]],
            },
            {
              id: "m28-l04-p03-warn", type: "callout", origin: "book", kind: "warning", title: "انتبه",
              spans: [T("يجب توحيد "), L("Domain"), T(" و "), L("Password"), T(" بين السويتشات لتصل التحديثات.")],
            },
            {
              id: "m28-l04-p03-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("المحاكي يدعم الوضعين اللذين تُكتب أوامرهما في الكتاب ("), L("server"), T(" و "), L("client"), T(")؛ الوضع "), L("Transparent"), T(" مذكور في الجدول للفهم فقط. الأوامر الثلاثة كلها في وضع الإعداد العام.")],
            },
            {
              id: "m28-l04-p03-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مثال موجّه: إعداد VTP",
              description: "أنت في وضع الإعداد العام. نفّذ سطور صندوق الكتاب الثلاثة بالترتيب. محاكاة تعليمية مبسّطة.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "المثال الموجّه: vtp mode server ثم vtp domain HFA ثم vtp password SA1234." },
              config: EX({
                kind: "guided",
                device: "switch",
                hostname: "Switch",
                startMode: "global",
                intro: "أنت في وضع الإعداد العام للسويتش. نفّذ سطور صندوق الكتاب بالترتيب.",
                steps: [
                  { id: "s1", instruction: "اجعل السويتش خادم VTP", expect: { command: "vtp-mode", args: { mode: "server" } }, hints: ["السطر الأول في صندوق الكتاب.", "vtp mode ثم server."] },
                  { id: "s2", instruction: "حدّد اسم المجال HFA", expect: { command: "vtp-domain", args: { name: "HFA" } }, hints: ["السطر الثاني في صندوق الكتاب.", "vtp domain ثم الاسم."] },
                  { id: "s3", instruction: "حدّد كلمة المرور SA1234", expect: { command: "vtp-password", args: { password: "SA1234" } }, hints: ["السطر الثالث في صندوق الكتاب.", "vtp password ثم الكلمة."] },
                ],
                completion: "✓ أحسنت، أُعدّ VTP كما في الكتاب؛ تذكّر توحيد Domain و Password في بقية السويتشات.",
              }),
            },
            {
              id: "m28-l04-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي وضع VTP يستقبل التحديثات فقط ولا يعدّل؟",
                options: [opt("m28-l04-p03-q1-a", "Client", true), opt("m28-l04-p03-q1-b", "Server"), opt("m28-l04-p03-q1-c", "Transparent")],
                feedback: {
                  hints: ["جدول الأوضاع، السطر الثاني.", "عكس الخادم الذي ينشئ وينشر."],
                  correctFeedback: "صحيح — Client.",
                  incorrectFeedback: "افحص الجدول: Server ينشئ وينشر، و Transparent يحتفظ بإعداداته ويمرّر.",
                  explanation: "Client لا يعدّل الـ VLANs محليًّا بل يأخذها من الخادم.",
                },
              },
            },
          ],
        },
        // PDF 248 — التوجيه بين VLANs — Dot1Q
        {
          id: "791381-m28-l04-p04",
          title: "التوجيه بين VLANs — Dot1Q",
          order: 4,
          source: src(248),
          keywords: ["Router on a Stick", "interface gi0/0", "no shutdown", "interface gi0/0.10", "encapsulation dot1Q 10", "ip address 192.168.10.1 255.255.255.0", "Trunk"],
          blocks: [
            {
              id: "m28-l04-p04-cli", type: "code", origin: "book", language: "cli",
              code: "Device(config)# interface gi0/0 / no shutdown\nDevice(config)# interface gi0/0.10\nDevice(config)# encapsulation dot1Q 10\nDevice(config)# ip address 192.168.10.1 255.255.255.0",
            },
            {
              id: "m28-l04-p04-cmds", type: "table", origin: "book",
              caption: "Cisco CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Device(config)# interface gi0/0 / no shutdown", "تشغيل المنفذ الفيزيائي"],
                ["Device(config)# interface gi0/0.10", "واجهة فرعية لـ VLAN 10"],
                ["Device(config)# encapsulation dot1Q 10", "ترميز 802.1Q"],
                ["Device(config)# ip address 192.168.10.1 255.255.255.0", "Gateway لأجهزة VLAN 10"],
              ],
            },
            {
              id: "m28-l04-p04-cond", type: "callout", origin: "book", kind: "important", title: "شرط أساسي",
              spans: [T("المنفذ المتصل بالراوتر يجب أن يكون "), L("Trunk"), T(" (لا "), L("Access"), T(") لتمرير وسوم كل الـ "), L("VLANs"), T(".")],
            },
            {
              id: "m28-l04-p04-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("الواجهة الفرعية "), L("gi0/0.10"), T(" هي «باب» الراوتر إلى "), L("VLAN 10"), T(": رقمها بعد النقطة اختيار للترتيب، أما الوسم الحقيقي فيحدّده "), L("encapsulation dot1Q 10"), T(". عنوانها هو البوابة التي تضعها أجهزة "), L("VLAN 10"), T(" في إعداداتها.")],
            },
            {
              id: "m28-l04-p04-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مثال موجّه: Router on a Stick",
              description: "أنت في وضع الإعداد العام للراوتر. نفّذ سطور صندوق الكتاب بالترتيب. محاكاة تعليمية مبسّطة.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "المثال الموجّه: interface gi0/0 ثم no shutdown ثم interface gi0/0.10 ثم encapsulation dot1Q 10 ثم ip address 192.168.10.1 255.255.255.0." },
              config: EX({
                kind: "guided",
                device: "router",
                hostname: "Router",
                startMode: "global",
                intro: "أنت في وضع الإعداد العام للراوتر. نفّذ سطور صندوق الكتاب بالترتيب.",
                steps: [
                  { id: "s1", instruction: "ادخل إلى المنفذ الفيزيائي gi0/0", expect: { command: "interface", args: { interfaces: ["g0/0"] } }, hints: ["السطر الأول في صندوق الكتاب قبل الشرطة المائلة.", "interface gi0/0."] },
                  { id: "s2", instruction: "شغّل المنفذ", expect: { command: "no-shutdown" }, hints: ["ما بعد الشرطة المائلة في السطر الأول.", "no shutdown."] },
                  { id: "s3", instruction: "أنشئ الواجهة الفرعية لـ VLAN 10", expect: { command: "interface", args: { interfaces: ["g0/0.10"], sub: true } }, hints: ["السطر الثاني في صندوق الكتاب.", "interface gi0/0.10 — النقطة ثم رقم الـ VLAN."] },
                  { id: "s4", instruction: "فعّل ترميز 802.1Q للـ VLAN 10", expect: { command: "encapsulation-dot1q", args: { vlanId: 10 } }, hints: ["السطر الثالث في صندوق الكتاب.", "encapsulation dot1Q 10."] },
                  { id: "s5", instruction: "أعطِ الواجهة الفرعية عنوان البوابة 192.168.10.1/24", expect: { command: "ip-address", args: { address: "192.168.10.1", mask: "255.255.255.0" } }, hints: ["السطر الأخير في صندوق الكتاب.", "ip address ثم العنوان ثم القناع 255.255.255.0."] },
                ],
                completion: "✓ أحسنت، الراوتر جاهز ليكون بوابة VLAN 10 — بشرط أن يكون منفذ السويتش المقابل Trunk.",
              }),
            },
            {
              id: "m28-l04-p04-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "منفذ السويتش المتصل بالراوتر في هذا الإعداد يجب أن يكون في وضع Access.", answer: false,
                feedback: {
                  hints: ["صندوق «شرط أساسي».", "أي وضع يمرّر وسوم كل الـ VLANs؟"],
                  correctFeedback: "صحيح — يجب أن يكون Trunk لا Access.",
                  incorrectFeedback: "افحص الشرط الأساسي: «يجب أن يكون Trunk (لا Access)».",
                  explanation: "Access يحمل VLAN واحدة بلا وسوم، أما الراوتر فيحتاج وسوم 802.1Q لكل VLAN.",
                },
              },
            },
          ],
        },
        // PDF 249 — بروتوكول STP وسلوك السويتش
        {
          id: "791381-m28-l04-p05",
          title: "بروتوكول STP وسلوك السويتش",
          order: 5,
          source: src(249),
          keywords: ["STP", "Loops", "Root Bridge", "Blocking", "Listening", "Learning", "Forwarding", "Flooding", "جدول MAC"],
          blocks: [
            {
              id: "m28-l04-p05-table", type: "table", origin: "book",
              caption: "STP في ثلاثة أسطر",
              headers: ["العنصر", "الشرح"],
              columnDirs: ["rtl", "rtl"],
              rows: [
                ["الهدف من STP", "يمنع الحلقات (Loops) في الشبكة"],
                ["الطريقة", "اختيار Root Bridge وتعطيل المسارات الزائدة"],
                ["حالات المنافذ", "Blocking ثم Listening ثم Learning ثم Forwarding"],
              ],
            },
            {
              id: "m28-l04-p05-flood", type: "callout", origin: "book", kind: "important", title: "سلوك السويتش مع MAC غير معروف",
              spans: [T("عند استقبال إطار بعنوان "), L("MAC"), T(" غير موجود في الجدول يقوم بـ "), L("Flooding"), T(" (إرساله لكل المنافذ عدا المصدر). وعندما يردّ الجهاز الهدف، يتعلّم السويتش العنوان ويضيفه إلى جدول الـ "), L("MAC"), T(".")],
            },
            {
              // ENRICHMENT (Batch 9): REUSE of the existing m16 stp-loop-blocking visual (exact source match, PDF 249).
              id: "m28-l04-p05-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m16/stp-loop-blocking", motion: true,
              source: src(249),
              title: "مخطط: STP يمنع الحلقات",
              alt: "مخطط يوضّح كيف يمنع STP الحلقات باختيار Root Bridge وتعطيل المسار الزائد، كما في جدول الصفحة.",
              caption: "‏STP يعطّل المسار الزائد فيمنع دوران الإطار بلا نهاية.",
            },
            {
              id: "m28-l04-p05-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("لا تخلط بين الأمرين: "), L("Flooding"), T(" سلوك طبيعي مؤقّت حتى يتعلّم السويتش العنوان، أما الحلقة "), L("Loop"), T(" فمشكلة دائمة تجعل الإطار يدور بلا نهاية، و "), L("STP"), T(" يمنعها بتعطيل المسار الزائد.")],
            },
            {
              id: "m28-l04-p05-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما آخر حالة يصل إليها المنفذ في STP بحسب الجدول؟",
                options: [opt("m28-l04-p05-q1-a", "Forwarding", true), opt("m28-l04-p05-q1-b", "Blocking"), opt("m28-l04-p05-q1-c", "Learning")],
                feedback: {
                  hints: ["سطر «حالات المنافذ».", "الحالة التي يبدأ فيها المنفذ تمرير الإطارات."],
                  correctFeedback: "صحيح — Forwarding.",
                  incorrectFeedback: "افحص الترتيب: Blocking ثم Listening ثم Learning ثم Forwarding.",
                  explanation: "المنفذ يبدأ محجوبًا وينتهي بالتمرير بعد الاستماع والتعلّم.",
                },
              },
            },
            {
              id: "m28-l04-p05-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "ما اسم العملية التي يقوم بها السويتش عندما يستقبل إطارًا بعنوان MAC غير موجود في جدوله؟ (بالإنجليزية)", answer: "Flooding",
                feedback: {
                  hints: ["صندوق «سلوك السويتش مع MAC غير معروف».", "إرسال الإطار لكل المنافذ عدا المصدر."],
                  correctFeedback: "صحيح — Flooding.",
                  incorrectFeedback: "افحص الصندوق: «يقوم بـ Flooding (إرساله لكل المنافذ عدا المصدر)».",
                  explanation: "بعد الردّ يتعلّم السويتش العنوان ويضيفه إلى جدول MAC فلا يحتاج إلى Flooding مرة أخرى.",
                },
              },
            },
          ],
        },
        // PDF 250 — Metro-Ethernet و VLAN
        {
          id: "791381-m28-l04-p06",
          title: "Metro-Ethernet و VLAN",
          order: 6,
          source: src(250),
          keywords: ["Metro-Ethernet", "VLANs", "ألياف", "فروع", "العزل"],
          blocks: [
            {
              id: "m28-l04-p06-table", type: "table", origin: "book",
              caption: "المفهوم والشرح",
              headers: ["المفهوم", "الشرح"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Metro-Ethernet", "شبكة ألياف تربط عدة فروع أو مدارس بسرعات عالية"],
                ["VLANs", "تقسيم الشبكة منطقيًّا داخل البنية نفسها للعزل"],
                ["العلاقة بينهما", "تُطبَّق VLANs في Metro-Ethernet للفصل بين العملاء"],
              ],
            },
            {
              id: "m28-l04-p06-idea", type: "callout", origin: "book", kind: "tip", title: "الفكرة",
              spans: [L("Metro-Ethernet"), T(" يربط المواقع فيزيائيًّا، و "), L("VLAN"), T(" تفصلها منطقيًّا داخل نفس البنية.")],
            },
            {
              id: "m28-l04-p06-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("هذا هو الرابط بين وحدة "), L("WAN"), T(" ووحدة "), L("VLAN"), T(": شركة الاتصالات تمدّ ألياف "), L("Metro-Ethernet"), T(" الواحدة لعدة عملاء، وتفصل حركة كل عميل عن الآخر بـ "), L("VLAN"), T(" خاصة به على البنية نفسها.")],
            },
            {
              id: "m28-l04-p06-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما دور VLANs داخل Metro-Ethernet بحسب الكتاب؟",
                options: [opt("m28-l04-p06-q1-a", "الفصل بين العملاء على البنية نفسها", true), opt("m28-l04-p06-q1-b", "زيادة سرعة الألياف"), opt("m28-l04-p06-q1-c", "استبدال الراوتر بين الفروع")],
                feedback: {
                  hints: ["سطر «العلاقة بينهما» في الجدول.", "كلمة «للفصل»."],
                  correctFeedback: "صحيح — الفصل بين العملاء.",
                  incorrectFeedback: "افحص سطر العلاقة: «تُطبَّق VLANs في Metro-Ethernet للفصل بين العملاء».",
                  explanation: "الربط الفيزيائي من Metro-Ethernet، والعزل المنطقي من VLAN.",
                },
              },
            },
          ],
        },
      ],
    },
    // ── l05 التوجيه (PDF 251–253) ─────────────────────────────────────────────────────────────────────────────
    {
      id: "791381-m28-l05",
      title: "التوجيه",
      order: 5,
      pages: [
        // PDF 251 — أنواع المسارات والمسار الثابت
        {
          id: "791381-m28-l05-p01",
          title: "أنواع المسارات والمسار الثابت",
          order: 1,
          source: src(251),
          keywords: ["Static Route", "Dynamic Route", "Default Route", "0.0.0.0/0", "0.0.0.0 0.0.0.0", "ip route 192.168.2.0 255.255.255.0 10.0.0.2"],
          blocks: [
            {
              id: "m28-l05-p01-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m28-l05-p01-static", term: "Static Route", text: [T("مسار يدوي يُدخَل من المدير. سريع وآمن لكنه لا يتغيّر تلقائيًّا. "), L("ip route ...")] },
                { id: "m28-l05-p01-dynamic", term: "Dynamic Route", text: [T("تلقائي عبر بروتوكولات ذكية تتعلّم الشبكات. "), L("OSPF · EIGRP")] },
                { id: "m28-l05-p01-default", term: "Default Route", text: [T("مسار افتراضي "), L("0.0.0.0/0"), T(" لكل ما هو غير معروف. "), L("0.0.0.0 0.0.0.0")] },
              ],
            },
            {
              id: "m28-l05-p01-cli", type: "code", origin: "book", language: "cli",
              code: "Router(config)# ip route 192.168.2.0 255.255.255.0 10.0.0.2",
            },
            {
              id: "m28-l05-p01-cmds", type: "table", origin: "book",
              caption: "Cisco CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [["Router(config)# ip route 192.168.2.0 255.255.255.0 10.0.0.2", "مسار ثابت إلى الشبكة 192.168.2.0/24 عبر القفزة التالية 10.0.0.2"]],
            },
            {
              id: "m28-l05-p01-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("اقرأ الأمر على ثلاثة أجزاء: الشبكة الهدف "), L("192.168.2.0"), T("، قناعها "), L("255.255.255.0"), T("، ثم القفزة التالية "), L("10.0.0.2"), T(" أي عنوان الراوتر المجاور الذي يعرف الطريق. المسار الافتراضي هو الأمر نفسه بشبكة وقناع "), L("0.0.0.0 0.0.0.0"), T(" كما في بطاقة الكتاب.")],
            },
            {
              id: "m28-l05-p01-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مهمّة: مسار ثابت ومسار افتراضي",
              description: "أنت في وضع الإعداد العام للراوتر. أضف مسار الكتاب الثابت إلى 192.168.2.0/24 عبر 10.0.0.2، ثم مسارًا افتراضيًّا عبر القفزة نفسها. تُقيَّم الحالة النهائية. محاكاة تعليمية مبسّطة.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "المهمّة: ip route 192.168.2.0 255.255.255.0 10.0.0.2 ثم ip route 0.0.0.0 0.0.0.0 10.0.0.2." },
              config: EX({
                kind: "task",
                device: "router",
                hostname: "Router",
                startMode: "global",
                intro: "أنت في وضع الإعداد العام للراوتر. أضف مسار الكتاب الثابت، ثم المسار الافتراضي عبر القفزة التالية نفسها 10.0.0.2.",
                goals: [
                  { id: "g-static", label: "مسار ثابت إلى 192.168.2.0/24 عبر 10.0.0.2", condition: { kind: "static-route", prop: "route", value: "192.168.2.0 255.255.255.0 10.0.0.2" } },
                  { id: "g-default", label: "مسار افتراضي 0.0.0.0/0 عبر 10.0.0.2", condition: { kind: "static-route", prop: "route", value: "0.0.0.0 0.0.0.0 10.0.0.2" } },
                ],
                hints: ["الأمر يبدأ بـ ip route ثم الشبكة ثم القناع ثم القفزة التالية.", "المسار الافتراضي: ip route 0.0.0.0 0.0.0.0 ثم القفزة التالية 10.0.0.2."],
                allowed: ["ip-route"],
                completion: "✓ أحسنت، الراوتر يعرف طريق 192.168.2.0/24 ويرسل كل ما هو غير معروف إلى 10.0.0.2. جرّب show ip route لترى المسارين S و S*.",
              }),
            },
            {
              id: "m28-l05-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "في الأمر ip route 192.168.2.0 255.255.255.0 10.0.0.2 ما عنوان القفزة التالية (next-hop)؟", answer: "10.0.0.2",
                feedback: {
                  hints: ["القيمة الأخيرة في سطر الأمر.", "عنوان الراوتر المجاور، لا الشبكة الهدف."],
                  correctFeedback: "صحيح — 10.0.0.2.",
                  incorrectFeedback: "افحص الأمر: الشبكة ثم القناع ثم القفزة التالية.",
                  explanation: "192.168.2.0 هي الشبكة الهدف و 255.255.255.0 قناعها، أما 10.0.0.2 فهي القفزة التالية.",
                },
              },
            },
          ],
        },
        // PDF 252 — المسافة الإدارية AD
        {
          id: "791381-m28-l05-p02",
          title: "المسافة الإدارية AD",
          order: 2,
          source: src(252),
          keywords: ["AD", "Administrative Distance", "RIP 120", "OSPF 110", "EIGRP 90", "Static 1", "Connected 0"],
          blocks: [
            {
              id: "m28-l05-p02-def", type: "text", origin: "book",
              spans: [L("AD"), T(" هي درجة «الثقة» في مصدر المسار — كلّما قلّ الرقم زادت الأولوية.")],
            },
            {
              id: "m28-l05-p02-table", type: "table", origin: "book",
              caption: "قيم AD",
              headers: ["البروتوكول", "AD"],
              columnDirs: ["ltr", "ltr"],
              rows: [["RIP", "120"], ["OSPF", "110"], ["EIGRP", "90"], ["Static", "1"], ["Connected", "0"]],
            },
            {
              id: "m28-l05-p02-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("عند وجود أكثر من مسار لنفس الشبكة، يختار الراوتر الأقل "), L("AD"), T(": "), L("Connected"), T(" ثم "), L("Static"), T(" ثم "), L("EIGRP"), T(" ثم "), L("OSPF"), T(" ثم "), L("RIP"), T(".")],
            },
            {
              // ENRICHMENT (Batch 9): REUSE of the existing m27 admin-distance visual (exact source match, PDF 252).
              id: "m28-l05-p02-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m27/admin-distance", motion: false,
              source: src(252),
              title: "مخطط: المسافة الإدارية AD",
              alt: "مخطط يرتّب قيم المسافة الإدارية Connected 0 و Static 1 و EIGRP 90 و OSPF 110 و RIP 120، والأصغر أوثق، كما في جدول الصفحة.",
              caption: "‏كلّما صغرت قيمة AD زادت ثقة المسار.",
            },
            {
              id: "m28-l05-p02-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("هذا ما رأيته في مخرجات "), L("show ip route"), T(" بين القوسين: الرقم الأول هو "), L("AD"), T(" مثل "), L("[1/0]"), T(" للمسار الثابت و "), L("[120/1]"), T(" لـ RIP. الثقة الأعلى للشبكة المتصلة مباشرة لأن الراوتر يراها بنفسه.")],
            },
            {
              id: "m28-l05-p02-ws", type: "practice-table", origin: "teacher-enrichment", caption: "ورقة عمل: اختر قيمة AD لكل مصدر",
              headers: ["المصدر", "AD"],
              columnDirs: ["ltr", "ltr"],
              rows: [["Static", ADV("1")], ["OSPF", ADV("110")], ["Connected", ADV("0")], ["EIGRP", ADV("90")], ["RIP", ADV("120")]],
            },
            {
              id: "m28-l05-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "الراوتر يعرف الشبكة نفسها عبر OSPF وعبر EIGRP. أيّهما يضعه في جدول التوجيه؟",
                options: [opt("m28-l05-p02-q1-a", "EIGRP لأن AD له 90 أقل من 110", true), opt("m28-l05-p02-q1-b", "OSPF لأن AD له 110 أكبر"), opt("m28-l05-p02-q1-c", "كلاهما معًا دائمًا")],
                feedback: {
                  hints: ["صندوق «تذكّر»: الترتيب من الأقل.", "قارن 90 مع 110."],
                  correctFeedback: "صحيح — الأقل AD يفوز: EIGRP.",
                  incorrectFeedback: "افحص القاعدة: كلّما قلّ الرقم زادت الأولوية، و EIGRP = 90.",
                  explanation: "Connected ثم Static ثم EIGRP ثم OSPF ثم RIP.",
                },
              },
            },
          ],
        },
        // PDF 253 — بروتوكولات التوجيه — مقارنة
        {
          id: "791381-m28-l05-p03",
          title: "بروتوكولات التوجيه — مقارنة",
          order: 3,
          source: src(253),
          keywords: ["RIP", "OSPF", "EIGRP", "BGP", "Distance Vector", "Link State", "Hybrid", "Path Vector", "Hops", "Cost", "Bandwidth + Delay", "router ospf 1", "network 192.168.1.0 0.0.0.255 area 0", "router eigrp 100", "network 192.168.1.0 0.0.0.255"],
          blocks: [
            {
              id: "m28-l05-p03-table", type: "table", origin: "book",
              caption: "المقارنة كما في الكتاب",
              headers: ["البروتوكول", "النوع", "AD", "المقياس Metric"],
              columnDirs: ["ltr", "ltr", "ltr", "ltr"],
              rows: [
                ["RIP (قديم)", "Distance Vector", "120", "عدد القفزات Hops"],
                ["OSPF (ذكي)", "Link State", "110", "Cost (سرعة الخط)"],
                ["EIGRP (Cisco فقط)", "Hybrid", "90", "Bandwidth + Delay"],
                ["BGP", "Path Vector", "—", "للإنترنت الكبير"],
              ],
            },
            {
              id: "m28-l05-p03-cli", type: "code", origin: "book", language: "cli",
              code: "R(config)# router ospf 1 / network 192.168.1.0 0.0.0.255 area 0\nR(config)# router eigrp 100 / network 192.168.1.0 0.0.0.255",
            },
            {
              id: "m28-l05-p03-cmds", type: "table", origin: "book",
              caption: "Cisco CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["R(config)# router ospf 1 / network 192.168.1.0 0.0.0.255 area 0", "تفعيل OSPF بالعملية 1 وإعلان الشبكة في area 0"],
                ["R(config)# router eigrp 100 / network 192.168.1.0 0.0.0.255", "تفعيل EIGRP بالنظام 100 وإعلان الشبكة بـ wildcard"],
              ],
            },
            {
              id: "m28-l05-p03-remember", type: "callout", origin: "book", kind: "remember", title: "للتذكّر",
              spans: [L("OSPF = Link-State"), T("، "), L("EIGRP = Hybrid"), T(" من "), L("Cisco"), T("، "), L("RIP = Distance Vector"), T(" قديم.")],
            },
            {
              id: "m28-l05-p03-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("لاحظ الفرق الوحيد بين السطرين: في "), L("OSPF"), T(" لا بدّ من "), L("area 0"), T(" بعد الـ wildcard، وفي "), L("EIGRP"), T(" لا نكتب area. هنا يكتب الكتاب الـ wildcard مع EIGRP أيضًا ("), L("network 192.168.1.0 0.0.0.255"), T(")، والصيغة القصيرة "), L("network 192.168.1.0"), T(" من وحدة التوجيه ما زالت صحيحة.")],
            },
            {
              id: "m28-l05-p03-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "تحدٍّ: سطرا الكتاب لـ OSPF و EIGRP",
              description: "أنت في وضع الإعداد العام. فعّل OSPF وأعلن الشبكة في area 0، ثم اخرج وفعّل EIGRP وأعلن الشبكة نفسها بصيغة الكتاب مع wildcard. محاكاة تعليمية مبسّطة.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "التحدّي: router ospf 1 ثم network 192.168.1.0 0.0.0.255 area 0 ثم exit ثم router eigrp 100 ثم network 192.168.1.0 0.0.0.255." },
              config: EX({
                kind: "challenge",
                device: "router",
                hostname: "R",
                startMode: "global",
                intro: "أنت في وضع الإعداد العام للراوتر R. نفّذ سطري الكتاب: OSPF أولًا ثم EIGRP.",
                steps: [
                  { id: "s1", instruction: "فعّل OSPF بالعملية رقم 1", expect: { command: "router", args: { protocol: "ospf", number: 1 } }, hints: ["السطر الأول في صندوق الكتاب قبل الشرطة المائلة.", "router ospf 1."] },
                  { id: "s2", instruction: "أعلن الشبكة 192.168.1.0 بـ wildcard 0.0.0.255 في area 0", expect: { condition: { kind: "routing", protocol: "ospf", prop: "network", value: "192.168.1.0 0.0.0.255 area 0" } }, hints: ["ما بعد الشرطة المائلة في السطر الأول.", "network ثم العنوان ثم wildcard ثم area 0."] },
                  { id: "s3", instruction: "فعّل EIGRP بالنظام المستقل 100", expect: { command: "router", args: { protocol: "eigrp", number: 100 } }, hints: ["اخرج من OSPF أولًا بـ exit.", "router eigrp 100."] },
                  { id: "s4", instruction: "أعلن الشبكة 192.168.1.0 بصيغة الكتاب مع wildcard 0.0.0.255", expect: { condition: { kind: "routing", protocol: "eigrp", prop: "network", value: "192.168.1.0 0.0.0.255" } }, hints: ["ما بعد الشرطة المائلة في السطر الثاني.", "network 192.168.1.0 0.0.0.255 — بلا area في EIGRP."] },
                ],
                completion: "✓ أحسنت، نفّذت سطري الكتاب: OSPF مع area و EIGRP بلا area.",
              }),
            },
            {
              id: "m28-l05-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما مقياس OSPF بحسب جدول المقارنة؟",
                options: [opt("m28-l05-p03-q1-a", "Cost (سرعة الخط)", true), opt("m28-l05-p03-q1-b", "عدد القفزات Hops"), opt("m28-l05-p03-q1-c", "Bandwidth + Delay")],
                feedback: {
                  hints: ["عمود «المقياس Metric»، سطر OSPF.", "ليس القفزات (RIP) ولا Bandwidth + Delay (EIGRP)."],
                  correctFeedback: "صحيح — Cost.",
                  incorrectFeedback: "افحص سطر OSPF في الجدول: Cost (سرعة الخط).",
                  explanation: "RIP يعدّ القفزات، OSPF يحسب الكلفة من سرعة الخط، EIGRP يجمع Bandwidth و Delay.",
                },
              },
            },
          ],
        },
      ],
    },
    // ── l06 الأمان (PDF 254–257) ──────────────────────────────────────────────────────────────────────────────
    {
      id: "791381-m28-l06",
      title: "الأمان",
      order: 6,
      pages: [
        // PDF 254 — الهجمات الشائعة
        {
          id: "791381-m28-l06-p01",
          title: "الهجمات الشائعة",
          order: 1,
          source: src(254),
          keywords: ["DoS", "DDoS", "Spoofing", "MitM", "Sniffing", "Hijacking", "Phishing", "HTTPS/VPN/SSH", "Port Security", "ACL"],
          blocks: [
            {
              id: "m28-l06-p01-table", type: "table", origin: "book",
              caption: "الهجوم ومعناه ووصفه",
              headers: ["الهجوم", "المعنى", "الوصف"],
              columnDirs: ["ltr", "rtl", "rtl"],
              rows: [
                ["DoS", "Denial of Service", "تعطيل الخدمة من جهاز واحد"],
                ["DDoS", "Distributed DoS", "تعطيل من أجهزة كثيرة"],
                ["Spoofing", "تزييف", "تزييف IP / MAC / DNS"],
                ["MitM", "الرجل الوسيط", "اعتراض الاتصال بين طرفين"],
                ["Sniffing", "تنصّت", "التقاط البيانات"],
                ["Hijacking", "اختطاف الجلسة", "سرقة Session"],
                ["Phishing", "احتيال", "صفحات/إيميلات مزيّفة"],
              ],
            },
            {
              id: "m28-l06-p01-prevent", type: "callout", origin: "book", kind: "important", title: "الوقاية",
              spans: [T("التشفير ("), L("HTTPS/VPN/SSH"), T(")، وكلمات المرور القوية، و "), L("Port Security"), T("، و "), L("ACL"), T(" تقلّل أثر هذه الهجمات.")],
            },
            {
              id: "m28-l06-p01-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("ميّز الهجوم من هدفه: "), L("DoS"), T(" و "), L("DDoS"), T(" يستهدفان التوفّر (تعطيل)، و "), L("Sniffing"), T(" و "), L("MitM"), T(" يستهدفان السرّية (قراءة أو اعتراض)، و "), L("Spoofing"), T(" و "), L("Phishing"), T(" يعتمدان على الخداع والانتحال.")],
            },
            {
              id: "m28-l06-p01-ws", type: "practice-table", origin: "teacher-enrichment", caption: "ورقة عمل: أي هجوم يصفه كل سطر؟",
              headers: ["الوصف", "الهجوم"],
              columnDirs: ["rtl", "ltr"],
              rows: [["تعطيل من أجهزة كثيرة", ATTACK("DDoS")], ["صفحات/إيميلات مزيّفة", ATTACK("Phishing")], ["التقاط البيانات", ATTACK("Sniffing")], ["اعتراض الاتصال بين طرفين", ATTACK("MitM")], ["تزييف IP / MAC / DNS", ATTACK("Spoofing")], ["سرقة Session", ATTACK("Hijacking")]],
            },
            {
              id: "m28-l06-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما الفرق بين DoS و DDoS بحسب الجدول؟",
                options: [opt("m28-l06-p01-q1-a", "DoS من جهاز واحد، و DDoS من أجهزة كثيرة", true), opt("m28-l06-p01-q1-b", "DoS يزيّف العناوين، و DDoS يلتقط البيانات"), opt("m28-l06-p01-q1-c", "لا فرق بينهما")],
                feedback: {
                  hints: ["السطران الأولان في الجدول.", "الحرف D الإضافي من Distributed."],
                  correctFeedback: "صحيح — الفرق في عدد الأجهزة المهاجمة.",
                  incorrectFeedback: "افحص السطرين: «من جهاز واحد» مقابل «من أجهزة كثيرة».",
                  explanation: "Distributed تعني موزّعًا على أجهزة كثيرة.",
                },
              },
            },
          ],
        },
        // PDF 255 — تأمين المنافذ Port Security
        {
          id: "791381-m28-l06-p02",
          title: "تأمين المنافذ Port Security",
          order: 2,
          source: src(255),
          keywords: ["switchport mode access", "switchport port-security", "maximum 2", "mac-address sticky", "violation shutdown", "err-disabled", "Restrict", "Protect"],
          blocks: [
            {
              id: "m28-l06-p02-cli", type: "code", origin: "book", language: "cli",
              code: "Device(config)# switchport mode access\nDevice(config)# switchport port-security\nDevice(config)# switchport port-security maximum 2\nDevice(config)# switchport port-security mac-address sticky\nDevice(config)# switchport port-security violation shutdown",
            },
            {
              id: "m28-l06-p02-cmds", type: "table", origin: "book",
              caption: "Cisco CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Device(config)# switchport mode access", "مطلوب لتفعيل الأمان"],
                ["Device(config)# switchport port-security", "تفعيل الميزة"],
                ["Device(config)# switchport port-security maximum 2", "عدد الأجهزة المسموح"],
                ["Device(config)# switchport port-security mac-address sticky", "تعلّم MAC تلقائيًّا"],
                ["Device(config)# switchport port-security violation shutdown", "الإجراء عند المخالفة"],
              ],
            },
            {
              id: "m28-l06-p02-violations", type: "callout", origin: "book", kind: "important", title: "أنواع المخالفة",
              spans: [L("Shutdown"), T(" = إغلاق المنفذ ("), L("err-disabled"), T(")، "), L("Restrict"), T(" = إسقاط مع تنبيه، "), L("Protect"), T(" = إسقاط بلا تنبيه.")],
            },
            {
              // ENRICHMENT (Batch 9 review-fix): NEW source-exact Port Security config summary for PDF 255 (the PDF181
              // PC0/PC1 scenario reuse was not source-exact for this configuration page).
              id: "m28-l06-p02-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m28/port-security-config-summary", motion: false,
              source: src(255),
              title: "مخطط: تأمين المنفذ — خطوات الإعداد والمخالفة",
              alt: "مخطط يلخّص إعداد Port Security: وضع Access ثم تفعيل الميزة ثم Maximum 2 ثم تعلّم MAC بـ Sticky ثم سياسة المخالفة، مع المخالفات الثلاث Shutdown و Restrict و Protect.",
              caption: "‏سلسلة إعداد المنفذ، ثم سياسات المخالفة الثلاث.",
            },
            {
              id: "m28-l06-p02-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("الأوامر الخمسة تُكتب داخل المنفذ (وضع الواجهة) رغم أن الكتاب يختصر البادئة. المحاكي ينفّذ الإجراء الذي يطبعه الكتاب ("), L("violation shutdown"), T(")؛ أما "), L("Restrict"), T(" و "), L("Protect"), T(" فتفرّق بينهما في التدريب أدناه: كلاهما يُسقط الإطارات المخالفة، والفرق في التنبيه.")],
            },
            {
              id: "m28-l06-p02-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مثال موجّه: Port Security على f0/1",
              description: "أنت داخل المنفذ f0/1. نفّذ سطور صندوق الكتاب الخمسة بالترتيب. محاكاة تعليمية مبسّطة.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "المثال الموجّه: switchport mode access ثم switchport port-security ثم switchport port-security maximum 2 ثم switchport port-security mac-address sticky ثم switchport port-security violation shutdown." },
              config: EX({
                kind: "guided",
                device: "switch",
                hostname: "Switch",
                startMode: "interface",
                startInterface: "f0/1",
                intro: "أنت داخل المنفذ f0/1 في وضع إعداد الواجهة. نفّذ سطور صندوق الكتاب بالترتيب.",
                steps: [
                  { id: "s1", instruction: "اجعل المنفذ في وضع Access (مطلوب قبل تفعيل الأمان)", expect: { command: "switchport-mode", args: { mode: "access" } }, hints: ["السطر الأول في صندوق الكتاب.", "switchport mode access."] },
                  { id: "s2", instruction: "فعّل ميزة Port Security", expect: { command: "switchport-port-security" }, hints: ["السطر الثاني في صندوق الكتاب.", "switchport port-security بلا قيم إضافية."] },
                  { id: "s3", instruction: "اسمح بجهازين على الأكثر", expect: { command: "port-security-maximum", args: { maximum: 2 } }, hints: ["السطر الثالث في صندوق الكتاب.", "switchport port-security maximum 2."] },
                  { id: "s4", instruction: "اجعل السويتش يتعلّم عنوان MAC تلقائيًّا", expect: { command: "port-security-sticky" }, hints: ["السطر الرابع في صندوق الكتاب.", "switchport port-security mac-address sticky."] },
                  { id: "s5", instruction: "حدّد الإجراء عند المخالفة: إغلاق المنفذ", expect: { command: "port-security-violation", args: { action: "shutdown" } }, hints: ["السطر الأخير في صندوق الكتاب.", "switchport port-security violation shutdown."] },
                ],
                completion: "✓ أحسنت، المنفذ f0/1 مؤمَّن كما في الكتاب: جهازان على الأكثر، وتعلّم تلقائي، وإغلاق عند المخالفة.",
              }),
            },
            {
              id: "m28-l06-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي إجراء مخالفة يُسقط الإطارات المخالفة ويرسل تنبيهًا دون إغلاق المنفذ؟",
                options: [opt("m28-l06-p02-q1-a", "Restrict", true), opt("m28-l06-p02-q1-b", "Protect"), opt("m28-l06-p02-q1-c", "Shutdown")],
                feedback: {
                  hints: ["صندوق «أنواع المخالفة».", "«إسقاط مع تنبيه»."],
                  correctFeedback: "صحيح — Restrict.",
                  incorrectFeedback: "افحص الصندوق: Protect إسقاط بلا تنبيه، و Shutdown إغلاق المنفذ.",
                  explanation: "الثلاثة تمنع الجهاز المخالف؛ Shutdown وحده يغلق المنفذ (err-disabled)، والفرق بين Restrict و Protect هو التنبيه.",
                },
              },
            },
          ],
        },
        // PDF 256 — تأمين الوصول بكلمات المرور و SSH
        {
          id: "791381-m28-l06-p03",
          title: "تأمين الوصول بكلمات المرور و SSH",
          order: 3,
          source: src(256),
          keywords: ["line console 0", "line vty 0 4", "password cisco", "login", "enable secret cisco123", "service password-encryption", "SSH", "Telnet", "المنفذ 22"],
          blocks: [
            {
              id: "m28-l06-p03-cli", type: "code", origin: "book", language: "cli",
              code: "Device(config)# line console 0 / password cisco / login\nDevice(config)# line vty 0 4 / password cisco / login\nDevice(config)# enable secret cisco123\nDevice(config)# service password-encryption",
            },
            {
              id: "m28-l06-p03-cmds", type: "table", origin: "book",
              caption: "Cisco CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["Device(config)# line console 0 / password cisco / login", "حماية الوصول المحلي بالكابل"],
                ["Device(config)# line vty 0 4 / password cisco / login", "حماية الدخول عن بُعد"],
                ["Device(config)# enable secret cisco123", "كلمة مرور مشفّرة للوضع المميّز"],
                ["Device(config)# service password-encryption", "تشفير كل كلمات المرور"],
              ],
            },
            {
              id: "m28-l06-p03-ssh", type: "callout", origin: "book", kind: "important", title: "SSH",
              spans: [T("بديل آمن ومشفّر لـ "), L("Telnet"), T(" لتسجيل الدخول إلى السويتش أو الراوتر عبر الشبكة (المنفذ "), L("22"), T(").")],
            },
            {
              // ENRICHMENT (Batch 9): REUSE of the existing m24 device-access-paths visual (exact source match, PDF 256):
              // the page secures exactly the Console / VTY / Enable access paths the visual maps.
              id: "m28-l06-p03-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m24/device-access-paths", motion: false,
              source: src(256),
              title: "مخطط: طرق الوصول إلى الجهاز",
              alt: "مخطط يوضّح طرق الوصول الثلاث Console و VTY و Enable وأوامر خطوطها التي تحميها الصفحة بكلمات المرور.",
              caption: "‏Console محلي · VTY عن بُعد · Enable للوضع المميّز.",
            },
            {
              id: "m28-l06-p03-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("كل شرطة مائلة في السطرين الأولين تعني أمرًا جديدًا: "), L("line console 0"), T(" يدخل خط الكونسول، ثم "), L("password cisco"), T("، ثم "), L("login"), T(" يجعل الخط يطلب الكلمة. اخرج بـ "), L("exit"), T(" قبل خط "), L("vty"), T("، والأمران الأخيران في وضع الإعداد العام.")],
            },
            {
              id: "m28-l06-p03-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مهمّة: حماية الوصول كما في الكتاب",
              description: "أنت في وضع الإعداد العام. احمِ خطّي الكونسول و vty بكلمة cisco مع login، وضع enable secret cisco123، وفعّل تشفير كلمات المرور. تُقيَّم الحالة النهائية. محاكاة تعليمية مبسّطة.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "المهمّة: line console 0 / password cisco / login، ثم line vty 0 4 / password cisco / login، ثم enable secret cisco123، ثم service password-encryption." },
              config: EX({
                kind: "task",
                device: "switch",
                hostname: "Switch",
                startMode: "global",
                intro: "أنت في وضع الإعداد العام. نفّذ سطور الكتاب الأربعة (كل شرطة مائلة = أمر جديد).",
                goals: [
                  { id: "g-con-pw", label: "خط الكونسول يحمل كلمة المرور cisco", condition: { kind: "line", line: "console", prop: "password", value: "cisco" } },
                  { id: "g-con-login", label: "خط الكونسول يطلب الكلمة (login)", condition: { kind: "line", line: "console", prop: "login", value: true } },
                  { id: "g-vty-pw", label: "خطوط vty 0 4 تحمل كلمة المرور cisco", condition: { kind: "line", line: "vty", prop: "password", value: "cisco" } },
                  { id: "g-vty-login", label: "خطوط vty تطلب الكلمة (login)", condition: { kind: "line", line: "vty", prop: "login", value: true } },
                  { id: "g-secret", label: "enable secret cisco123", condition: { kind: "device", prop: "enableSecret", value: "cisco123" } },
                  { id: "g-enc", label: "تشفير كلمات المرور مفعّل", condition: { kind: "device", prop: "passwordEncryption", value: true } },
                ],
                hints: ["ادخل الخط بـ line console 0 ثم password cisco ثم login، واخرج بـ exit قبل line vty 0 4.", "الأمران الأخيران في وضع الإعداد العام: enable secret cisco123 ثم service password-encryption."],
                completion: "✓ أحسنت، الوصول المحلي والبعيد والوضع المميّز كلها محمية، وكلمات المرور مشفّرة.",
              }),
            },
            {
              id: "m28-l06-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "ما رقم منفذ SSH الذي يذكره الكتاب؟ (رقم)", answer: "22",
                feedback: {
                  hints: ["صندوق SSH، بين القوسين.", "الرقم الذي يقابل «دخول آمن عن بُعد» في جدول المنافذ."],
                  correctFeedback: "صحيح — المنفذ 22.",
                  incorrectFeedback: "افحص صندوق SSH: «المنفذ 22». الرقم 23 هو Telnet غير الآمن.",
                  explanation: "SSH 22 مشفّر، و Telnet 23 غير مشفّر.",
                },
              },
            },
          ],
        },
        // PDF 257 — قوائم التحكم بالوصول ACL
        {
          id: "791381-m28-l06-p04",
          title: "قوائم التحكم بالوصول ACL",
          order: 4,
          source: src(257),
          keywords: ["Standard ACL", "Extended ACL", "1–99", "100–199", "access-list 10 permit 192.168.1.0 0.0.0.255", "ip access-group 10 out", "access-list 100 permit tcp 192.168.1.0 0.0.0.255 any eq 80", "ip access-group 100 in"],
          blocks: [
            {
              id: "m28-l06-p04-table", type: "table", origin: "book",
              caption: "النوعان كما في الكتاب",
              headers: ["النوع", "الرقم", "الفلترة", "التطبيق"],
              columnDirs: ["ltr", "ltr", "rtl", "rtl"],
              rows: [["Standard ACL", "1–99", "المصدر فقط (Source IP)", "قريب من الوجهة"], ["Extended ACL", "100–199", "IP + Port + Protocol", "قريب من المصدر"]],
            },
            {
              id: "m28-l06-p04-cli", type: "code", origin: "book", language: "cli",
              code: "access-list 10 permit 192.168.1.0 0.0.0.255      (Standard)\nip access-group 10 out\naccess-list 100 permit tcp 192.168.1.0 0.0.0.255 any eq 80   (Extended)\nip access-group 100 in",
            },
            {
              id: "m28-l06-p04-cmds", type: "table", origin: "book",
              caption: "Cisco CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["access-list 10 permit 192.168.1.0 0.0.0.255", "قائمة قياسية تسمح لشبكة 192.168.1.0/24"],
                ["ip access-group 10 out", "تطبيق القائمة 10 على المنفذ باتجاه الخروج"],
                ["access-list 100 permit tcp 192.168.1.0 0.0.0.255 any eq 80", "قائمة موسّعة تسمح بـ HTTP من الشبكة إلى أي وجهة"],
                ["ip access-group 100 in", "تطبيق القائمة 100 على المنفذ باتجاه الدخول"],
              ],
            },
            {
              id: "m28-l06-p04-rule", type: "callout", origin: "book", kind: "important", title: "القاعدة",
              spans: [L("Standard"), T(" قريبة من الوجهة (تفحص المصدر فقط)، و "), L("Extended"), T(" قريبة من المصدر (تفحص المصدر والوجهة والمنفذ).")],
            },
            {
              // ENRICHMENT (Batch 9): REUSE of the existing m06 acl-gate visual (exact source match, PDF 257):
              // the Standard-vs-Extended permit/deny gate and placement rule the page compares.
              id: "m28-l06-p04-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m06/acl-gate", motion: true,
              source: src(257),
              title: "مخطط: ACL — بوابة Permit / Deny",
              alt: "مخطط يبيّن ACL كبوابة تسمح أو تمنع، مع قاعدة الموضع: Standard قرب الوجهة (المصدر فقط) و Extended قرب المصدر (المصدر والوجهة والمنفذ).",
              caption: "‏Standard قرب الوجهة · Extended قرب المصدر.",
            },
            {
              id: "m28-l06-p04-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("الرقم يقرّر النوع قبل أي شيء: "), L("10"), T(" قياسية فلا تقبل إلا المصدر، و "), L("100"), T(" موسّعة فتطلب البروتوكول والمصدر والوجهة. في المهمّة أدناه سيناريو تعليمي: القائمة 10 تُطبَّق خروجًا على "), L("g0/0"), T(" والقائمة 100 دخولًا على "), L("g0/1"), T(" (الكتاب لا يسمّي المنافذ).")],
            },
            {
              id: "m28-l06-p04-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مهمّة: قائمتا الكتاب القياسية والموسّعة",
              description: "أنت في وضع الإعداد العام للراوتر. اكتب القائمتين كما في الكتاب، وطبّق 10 خروجًا على g0/0 و 100 دخولًا على g0/1. تُقيَّم الحالة النهائية. محاكاة تعليمية مبسّطة.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "المهمّة: access-list 10 permit 192.168.1.0 0.0.0.255 ثم interface g0/0 و ip access-group 10 out، ثم access-list 100 permit tcp 192.168.1.0 0.0.0.255 any eq 80 ثم interface g0/1 و ip access-group 100 in." },
              config: EX({
                kind: "task",
                device: "router",
                hostname: "Router",
                startMode: "global",
                intro: "أنت في وضع الإعداد العام. اكتب القائمتين كما في الكتاب، ثم طبّق القائمة 10 خروجًا على g0/0 والقائمة 100 دخولًا على g0/1.",
                goals: [
                  { id: "g-std", label: "القائمة 10 تسمح لـ 192.168.1.0 0.0.0.255", condition: { kind: "acl", number: 10, prop: "entry", value: "permit 192.168.1.0 0.0.0.255" } },
                  { id: "g-std-apply", label: "القائمة 10 مطبّقة خروجًا على g0/0", condition: { kind: "interface", name: "g0/0", prop: "accessGroup", value: "10 out" } },
                  { id: "g-ext", label: "القائمة 100 تسمح بـ tcp من 192.168.1.0 0.0.0.255 إلى any على المنفذ 80", condition: { kind: "acl", number: 100, prop: "entry", value: "permit tcp 192.168.1.0 0.0.0.255 any eq 80" } },
                  { id: "g-ext-apply", label: "القائمة 100 مطبّقة دخولًا على g0/1", condition: { kind: "interface", name: "g0/1", prop: "accessGroup", value: "100 in" } },
                ],
                hints: ["القوائم تُكتب في الإعداد العام، والتطبيق ip access-group داخل المنفذ.", "القائمة الموسّعة: access-list 100 permit tcp 192.168.1.0 0.0.0.255 any eq 80."],
                completion: "✓ أحسنت، القائمتان مكتوبتان ومطبّقتان: القياسية خروجًا والموسّعة دخولًا.",
              }),
            },
            {
              id: "m28-l06-p04-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أين تُوضع القائمة الموسّعة Extended بحسب القاعدة؟",
                options: [opt("m28-l06-p04-q1-a", "قريبة من المصدر", true), opt("m28-l06-p04-q1-b", "قريبة من الوجهة"), opt("m28-l06-p04-q1-c", "في أي مكان بلا فرق")],
                feedback: {
                  hints: ["صندوق «القاعدة».", "لأنها تفحص المصدر والوجهة والمنفذ فتمنع الحركة مبكرًا."],
                  correctFeedback: "صحيح — قريبة من المصدر.",
                  incorrectFeedback: "افحص القاعدة: Standard قريبة من الوجهة، و Extended قريبة من المصدر.",
                  explanation: "القائمة الموسّعة تعرف الوجهة والمنفذ فتستطيع الحكم مبكرًا قرب المصدر.",
                },
              },
            },
          ],
        },
      ],
    },
    // ── l07 الخدمات والأوامر (PDF 258–262) ────────────────────────────────────────────────────────────────────
    {
      id: "791381-m28-l07",
      title: "الخدمات والأوامر",
      order: 7,
      pages: [
        // PDF 258 — NAT و PAT و APIPA
        {
          id: "791381-m28-l07-p01",
          title: "NAT و PAT و APIPA",
          order: 1,
          source: src(258),
          keywords: ["NAT", "PAT", "APIPA", "169.254.x.x", "NAT + Ports", "عنوان عام"],
          blocks: [
            {
              id: "m28-l07-p01-table", type: "table", origin: "book",
              caption: "المصطلح وشرحه",
              headers: ["المصطلح", "الشرح"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["NAT", "تحويل عناوين IP الداخلية (خاص) إلى العامة"],
                ["PAT", "عنوان عام واحد لعدة أجهزة باختلاف المنافذ (NAT + Ports)"],
                ["APIPA", "عند فشل DHCP، يعطي الجهاز نفسه IP يبدأ بـ 169.254.x.x"],
              ],
            },
            {
              id: "m28-l07-p01-idea", type: "callout", origin: "book", kind: "tip", title: "الفكرة",
              spans: [L("NAT/PAT"), T(" يتيحان لأجهزة الشبكة الخاصة الخروج إلى الإنترنت عبر عنوان عام، و "), L("APIPA"), T(" إشارة لمشكلة في "), L("DHCP"), T(".")],
            },
            {
              // ENRICHMENT (Batch 9): SVG visual enrichment appended after the book content.
              id: "m28-l07-p01-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m28/nat-pat-apipa", motion: false,
              source: src(258),
              title: "مخطط: NAT و PAT و APIPA — مفاهيم منفصلة",
              alt: "مخطط يفصل ثلاثة مفاهيم: NAT وPAT للخروج بعنوان عام (PAT بالمنافذ)، وAPIPA المنفصل الذي يبدأ بـ 169.254 عند فشل DHCP وليس نمط NAT.",
              caption: "‏NAT/PAT للخروج بعنوان عام · APIPA إشارة إلى فشل DHCP.",
            },
            {
              id: "m28-l07-p01-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("العناوين الخاصة من الصفحة الأولى لا تُوجَّه على الإنترنت، لذلك يبدّلها الراوتر بعنوانه العام ("), L("NAT"), T(")، ويميّز الأجهزة برقم المنفذ حين يشتركون في عنوان واحد ("), L("PAT"), T("). و "), L("APIPA"), T(" ليس حلًّا بل عَرَض: الجهاز لم يجد خادم "), L("DHCP"), T(".")],
            },
            {
              id: "m28-l07-p01-ws", type: "practice-table", origin: "teacher-enrichment", caption: "ورقة عمل: أي مصطلح يطابق كل وصف؟",
              headers: ["الوصف", "المصطلح"],
              columnDirs: ["rtl", "ltr"],
              rows: [["عنوان عام واحد لعدة أجهزة باختلاف المنافذ", SVC("PAT")], ["عنوان يبدأ بـ 169.254 عند فشل DHCP", SVC("APIPA")], ["تحويل العناوين الخاصة إلى عامة", SVC("NAT")]],
            },
            {
              id: "m28-l07-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "ظهور عنوان يبدأ بـ 169.254 على الجهاز يعني أن خادم DHCP أعطاه هذا العنوان.", answer: false,
                feedback: {
                  hints: ["سطر APIPA في الجدول.", "من يعطي العنوان: الخادم أم الجهاز نفسه؟"],
                  correctFeedback: "صحيح — الجهاز أعطى نفسه العنوان لأن DHCP فشل.",
                  incorrectFeedback: "افحص سطر APIPA: «عند فشل DHCP، يعطي الجهاز نفسه IP يبدأ بـ 169.254».",
                  explanation: "APIPA إشارة إلى مشكلة في DHCP لا إلى نجاحه.",
                },
              },
            },
          ],
        },
        // PDF 259 — بروتوكول DHCP — DORA و Pool
        {
          id: "791381-m28-l07-p02",
          title: "بروتوكول DHCP — DORA و Pool",
          order: 2,
          source: src(259),
          keywords: ["DORA", "Discover", "Offer", "Request", "ACK", "ip dhcp pool STUDENTS", "network 192.168.10.0 255.255.255.0", "default-router 192.168.10.1", "dns-server 8.8.8.8", "ip dhcp excluded-address", "ipconfig /release", "ipconfig /renew"],
          blocks: [
            {
              id: "m28-l07-p02-dora", type: "list", origin: "book", variant: "ordered", title: "DORA",
              items: [
                { id: "m28-l07-p02-d", term: "Discover", text: [T("العميل يبحث عن خادم")] },
                { id: "m28-l07-p02-o", term: "Offer", text: [T("الخادم يعرض "), L("IP")] },
                { id: "m28-l07-p02-r", term: "Request", text: [T("العميل يطلب العنوان")] },
                { id: "m28-l07-p02-a", term: "ACK", text: [T("الخادم يؤكّد")] },
              ],
            },
            {
              id: "m28-l07-p02-cli", type: "code", origin: "book", language: "cli",
              code: "R(config)# ip dhcp pool STUDENTS\nR(dhcp-config)# network 192.168.10.0 255.255.255.0\nR(dhcp-config)# default-router 192.168.10.1 / dns-server 8.8.8.8\nR(config)# ip dhcp excluded-address 192.168.10.1 192.168.10.10",
            },
            {
              id: "m28-l07-p02-cmds", type: "table", origin: "book",
              caption: "Cisco CLI: الأمر وما يفعله",
              headers: ["الأمر", "ماذا يفعل"],
              columnDirs: ["ltr", "rtl"],
              rows: [
                ["R(config)# ip dhcp pool STUDENTS", "إنشاء مجموعة التوزيع STUDENTS"],
                ["R(dhcp-config)# network 192.168.10.0 255.255.255.0", "الشبكة التي تُوزَّع عناوينها"],
                ["R(dhcp-config)# default-router 192.168.10.1 / dns-server 8.8.8.8", "البوابة وخادم DNS للعملاء"],
                ["R(config)# ip dhcp excluded-address 192.168.10.1 192.168.10.10", "عناوين محجوزة لا تُوزَّع"],
              ],
            },
            {
              id: "m28-l07-p02-pc", type: "callout", origin: "book", kind: "remember", title: "في الحاسوب",
              spans: [L("ipconfig /release"), T(" لتحرير العنوان، "), L("ipconfig /renew"), T(" لطلب عنوان جديد من الخادم.")],
            },
            {
              // ENRICHMENT (Batch 9): REUSE of the existing m22 dhcp-dora visual (exact source match, PDF 259): the four
              // DORA stages the page lists (the pool-numbers visual is a different example, so it is NOT reused here).
              id: "m28-l07-p02-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m22/dhcp-dora", motion: true,
              source: src(259),
              title: "مخطط: مراحل DHCP — DORA",
              alt: "مخطط يعرض مراحل DHCP الأربع Discover ثم Offer ثم Request ثم ACK بترتيبها واتجاهاتها بين الجهاز والخادم، كما في قائمة الصفحة.",
              caption: "‏الطلب يبدأ من الجهاز، والخادم يردّ — بالترتيب DORA.",
            },
            {
              id: "m28-l07-p02-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("لاحظ الموجّه: السطر الأول والأخير في "), L("(config)#"), T(" والسطران الأوسطان في "), L("(dhcp-config)#"), T("، فالاستثناء "), L("excluded-address"), T(" يُكتب خارج المجموعة. أمرا "), L("ipconfig"), T(" يُكتبان في الحاسوب لا في الراوتر.")],
            },
            {
              id: "m28-l07-p02-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مهمّة: مجموعة DHCP كما في الكتاب",
              description: "أنت في وضع الإعداد العام للراوتر R. أنشئ المجموعة STUDENTS بشبكتها وبوابتها و DNS، واستثنِ العناوين 192.168.10.1 إلى 192.168.10.10. تُقيَّم الحالة النهائية. محاكاة تعليمية مبسّطة.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "المهمّة: ip dhcp pool STUDENTS ثم network 192.168.10.0 255.255.255.0 ثم default-router 192.168.10.1 ثم dns-server 8.8.8.8 ثم exit ثم ip dhcp excluded-address 192.168.10.1 192.168.10.10." },
              config: EX({
                kind: "task",
                device: "router",
                hostname: "R",
                startMode: "global",
                intro: "أنت في وضع الإعداد العام للراوتر R. نفّذ سطور صندوق الكتاب (الشرطة المائلة = أمران).",
                goals: [
                  { id: "g-net", label: "المجموعة STUDENTS توزّع الشبكة 192.168.10.0", condition: { kind: "dhcp-pool", name: "STUDENTS", prop: "network", value: "192.168.10.0" } },
                  { id: "g-mask", label: "قناع الشبكة 255.255.255.0", condition: { kind: "dhcp-pool", name: "STUDENTS", prop: "mask", value: "255.255.255.0" } },
                  { id: "g-gw", label: "البوابة 192.168.10.1", condition: { kind: "dhcp-pool", name: "STUDENTS", prop: "defaultRouter", value: "192.168.10.1" } },
                  { id: "g-dns", label: "خادم DNS 8.8.8.8", condition: { kind: "dhcp-pool", name: "STUDENTS", prop: "dnsServers", value: ["8.8.8.8"] } },
                  { id: "g-excl", label: "العناوين 192.168.10.1 إلى 192.168.10.10 مستثناة", condition: { kind: "dhcp-excluded", from: "192.168.10.1", to: "192.168.10.10" } },
                ],
                hints: ["ابدأ بـ ip dhcp pool STUDENTS ثم network و default-router و dns-server داخل المجموعة.", "الاستثناء خارج المجموعة: exit ثم ip dhcp excluded-address 192.168.10.1 192.168.10.10."],
                completion: "✓ أحسنت، المجموعة STUDENTS جاهزة والعناوين الأولى محجوزة كما في الكتاب.",
              }),
            },
            {
              id: "m28-l07-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما الخطوة الثانية في DORA؟",
                options: [opt("m28-l07-p02-q1-a", "Offer — الخادم يعرض IP", true), opt("m28-l07-p02-q1-b", "Request — العميل يطلب العنوان"), opt("m28-l07-p02-q1-c", "ACK — الخادم يؤكّد")],
                feedback: {
                  hints: ["قائمة DORA المرقّمة.", "الحرف O."],
                  correctFeedback: "صحيح — Offer.",
                  incorrectFeedback: "افحص الترتيب: Discover ثم Offer ثم Request ثم ACK.",
                  explanation: "العميل يبحث، الخادم يعرض، العميل يطلب، الخادم يؤكّد.",
                },
              },
            },
          ],
        },
        // PDF 260 — مصافحة TCP الثلاثية
        {
          id: "791381-m28-l07-p03",
          title: "مصافحة TCP الثلاثية",
          order: 3,
          source: src(260),
          keywords: ["SYN", "SYN-ACK", "ACK", "Three-way handshake", "رقم تسلسل", "اتصال موثوق"],
          blocks: [
            {
              id: "m28-l07-p03-steps", type: "list", origin: "book", variant: "ordered", title: "الخطوات الثلاث",
              items: [
                { id: "m28-l07-p03-s1", term: "1 · SYN", text: [T("العميل إلى الخادم: طلب بدء اتصال وتحديد رقم تسلسل.")] },
                { id: "m28-l07-p03-s2", term: "2 · SYN-ACK", text: [T("الخادم إلى العميل: موافقة + رقم تسلسله + تأكيد "), L("SYN"), T(".")] },
                { id: "m28-l07-p03-s3", term: "3 · ACK", text: [T("العميل إلى الخادم: تأكيد الردّ ويبدأ تبادل البيانات.")] },
              ],
            },
            {
              id: "m28-l07-p03-result", type: "callout", origin: "book", kind: "summary", title: "النتيجة",
              spans: [T("اتصال موثوق بين الجهازين قبل تبادل أي بيانات فعلية عبر "), L("TCP"), T(".")],
            },
            {
              // ENRICHMENT (Batch 9): SVG visual enrichment appended after the book content.
              id: "m28-l07-p03-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m28/tcp-three-way-handshake", motion: true,
              source: src(260),
              title: "مخطط: مصافحة TCP الثلاثية",
              alt: "مخطط يوضّح مصافحة TCP الثلاثية بالترتيب السببي: SYN من العميل، ثم SYN-ACK من الخادم، ثم ACK من العميل، ثم يبدأ تبادل البيانات.",
              caption: "‏SYN ثم SYN-ACK ثم ACK — ثم يبدأ تبادل البيانات.",
            },
            {
              id: "m28-l07-p03-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("هذه المصافحة هي معنى «يتصل أولًا» في جدول "), L("TCP"), T(" و "), L("UDP"), T(": الطرفان يتبادلان أرقام التسلسل قبل أي بيانات، ولذلك يستطيع كل طرف لاحقًا اكتشاف ما ضاع وطلب إعادته.")],
            },
            {
              id: "m28-l07-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "ما اسم الرسالة الثانية في المصافحة الثلاثية (من الخادم إلى العميل)؟", answer: "SYN-ACK",
                feedback: {
                  hints: ["الخطوة 2 في القائمة.", "موافقة وتأكيد معًا في اسم واحد."],
                  correctFeedback: "صحيح — SYN-ACK.",
                  incorrectFeedback: "افحص الخطوات: SYN ثم SYN-ACK ثم ACK.",
                  explanation: "الخادم يوافق (SYN) ويؤكّد طلب العميل (ACK) في رسالة واحدة.",
                },
              },
            },
            {
              id: "m28-l07-p03-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "تبادل البيانات الفعلية يبدأ بعد الرسالة الثالثة ACK.", answer: true,
                feedback: {
                  hints: ["الخطوة 3 في القائمة.", "ما الذي «يبدأ» بعد تأكيد الردّ؟"],
                  correctFeedback: "صحيح — بعد ACK يبدأ تبادل البيانات.",
                  incorrectFeedback: "افحص الخطوة 3: «تأكيد الردّ ويبدأ تبادل البيانات».",
                  explanation: "المصافحة تسبق البيانات؛ هذا ما يجعل TCP موثوقًا.",
                },
              },
            },
          ],
        },
        // PDF 261 — سيناريو تكاملي: فتح موقع
        {
          id: "791381-m28-l07-p04",
          title: "سيناريو تكاملي: فتح موقع",
          order: 4,
          source: src(261),
          keywords: ["DNS", "UDP 53", "ARP", "Broadcast", "L2", "TCP Handshake", "HTTP/HTTPS", "GET", "TLS", "80/443"],
          blocks: [
            {
              id: "m28-l07-p04-steps", type: "list", origin: "book", variant: "ordered", title: "أربع خطوات لفتح موقع",
              items: [
                { id: "m28-l07-p04-s1", term: "1 · DNS", text: [T("يسأل الحاسوب عن عنوان "), L("IP"), T(" للموقع.")], note: "الحاسوب إلى DNS · UDP 53" },
                { id: "m28-l07-p04-s2", term: "2 · ARP", text: [T("يجد عنوان "), L("MAC"), T(" للبوابة عبر "), L("Broadcast"), T(".")], note: "الحاسوب إلى GW · L2" },
                { id: "m28-l07-p04-s3", term: "3 · TCP Handshake", text: [T("يبني اتصالًا موثوقًا: "), L("SYN"), T(" ثم "), L("SYN-ACK"), T(" ثم "), L("ACK"), T(".")], note: "ثلاث خطوات · App" },
                { id: "m28-l07-p04-s4", term: "4 · HTTP/HTTPS", text: [T("يطلب الصفحة ("), L("GET"), T(") مع تشفير "), L("TLS"), T(" في "), L("HTTPS"), T(".")], note: "صفحة مشفّرة · 80/443" },
              ],
            },
            {
              id: "m28-l07-p04-idea", type: "callout", origin: "book", kind: "tip", title: "الفكرة",
              spans: [T("فتح موقع واحد يجمع "), L("DNS"), T(" و "), L("ARP"), T(" و "), L("TCP"), T(" و "), L("HTTP"), T(" معًا — مثال يربط كل البروتوكولات.")],
            },
            {
              // ENRICHMENT (Batch 9): SVG visual enrichment appended after the book content.
              id: "m28-l07-p04-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m28/web-opening-journey", motion: true,
              source: src(261),
              title: "مخطط: رحلة فتح موقع",
              alt: "مخطط يعرض خطوات فتح موقع بالترتيب المطبوع: DNS ثم ARP ثم مصافحة TCP ثم HTTP/HTTPS، كل خطوة تلي التي قبلها.",
              caption: "‏DNS ثم ARP ثم TCP ثم HTTP — رحلة سببية متتابعة.",
            },
            {
              id: "m28-l07-p04-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("كل خطوة تجيب سؤالًا: «ما عنوان الموقع؟» ("), L("DNS"), T(")، «كيف أصل إلى البوابة في شبكتي؟» ("), L("ARP"), T(")، «هل الخادم مستعدّ؟» ("), L("TCP"), T(")، ثم «أعطني الصفحة» ("), L("HTTP"), T("). لاحظ أن "), L("ARP"), T(" يسأل عن البوابة لا عن الموقع لأن الموقع خارج الشبكة المحلية.")],
            },
            {
              id: "m28-l07-p04-ws", type: "practice-table", origin: "teacher-enrichment", caption: "ورقة عمل: رتّب خطوات فتح الموقع (اختر رقم الخطوة)",
              headers: ["ماذا يحدث", "الخطوة"],
              columnDirs: ["rtl", "ltr"],
              rows: [
                ["يطلب الصفحة GET (مع TLS في HTTPS)", { kind: "select", options: ["1", "2", "3", "4"], key: "4" }],
                ["يسأل عن عنوان IP للموقع", { kind: "select", options: ["1", "2", "3", "4"], key: "1" }],
                ["يبني اتصالًا موثوقًا SYN / SYN-ACK / ACK", { kind: "select", options: ["1", "2", "3", "4"], key: "3" }],
                ["يجد MAC البوابة عبر Broadcast", { kind: "select", options: ["1", "2", "3", "4"], key: "2" }],
              ],
            },
            {
              id: "m28-l07-p04-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي بروتوكول يعمل عبر UDP على المنفذ 53 في هذا السيناريو؟",
                options: [opt("m28-l07-p04-q1-a", "DNS", true), opt("m28-l07-p04-q1-b", "ARP"), opt("m28-l07-p04-q1-c", "HTTP")],
                feedback: {
                  hints: ["الخطوة 1 وملاحظتها.", "الذي يترجم اسم الموقع إلى IP."],
                  correctFeedback: "صحيح — DNS.",
                  incorrectFeedback: "افحص ملاحظة الخطوة 1: UDP 53. ARP في الطبقة 2، و HTTP على 80/443.",
                  explanation: "DNS 53، HTTP 80، HTTPS 443، و ARP بلا منفذ لأنه في الطبقة الثانية.",
                },
              },
            },
          ],
        },
        // PDF 262 — أوامر CMD و Show (+ module review)
        {
          id: "791381-m28-l07-p05",
          title: "أوامر CMD و Show",
          order: 5,
          source: src(262),
          keywords: ["ping 8.8.8.8", "tracert", "ipconfig", "ipconfig /all", "nslookup", "arp -a", "show vlan brief", "show interfaces trunk", "show mac address-table", "show interfaces status", "show vtp status", "show spanning-tree"],
          blocks: [
            {
              id: "m28-l07-p05-cmd", type: "table", origin: "book",
              caption: "أوامر Windows / CMD",
              headers: ["الأمر", "الوظيفة"],
              columnDirs: ["ltr", "rtl"],
              rows: [["ping 8.8.8.8", "اختبار الاتصال"], ["tracert", "مسار الوصول"], ["ipconfig", "عرض عنوان IP"], ["ipconfig /all", "تفاصيل كاملة"], ["nslookup", "فحص DNS"], ["arp -a", "جدول MAC"]],
            },
            {
              id: "m28-l07-p05-show", type: "table", origin: "book",
              caption: "أوامر Show (الأجهزة)",
              headers: ["الأمر", "الوظيفة"],
              columnDirs: ["ltr", "rtl"],
              rows: [["show vlan brief", "VLANs ومنافذها"], ["show interfaces trunk", "منافذ Trunk"], ["show mac address-table", "جدول MAC"], ["show interfaces status", "حالة المنافذ"], ["show vtp status", "إعدادات VTP"], ["show spanning-tree", "معلومات STP"]],
            },
            {
              id: "m28-l07-p05-end", type: "callout", origin: "book", kind: "summary", title: "تمّ بحمد الله",
              spans: [T("تلخيص الشبكات الشامل — نموذج "), L("791381"), T(" · إعداد المعلّم وفيق نصار.")],
            },
            {
              // ENRICHMENT (Batch 9): SVG visual enrichment appended after the book content — a CONCEPTUAL decision map
              // (not a terminal) that maps a question to its command; the page's own simulator remains the live terminal.
              id: "m28-l07-p05-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m28/troubleshooting-command-map", motion: false,
              source: src(262),
              title: "مخطط: خريطة أوامر CMD و Show",
              alt: "خريطة قرار تربط سؤال الفحص بالأمر المناسب: أوامر CMD على الحاسوب مثل ping و tracert، وأوامر Show على جهاز الشبكة مثل show vlan brief و show vtp status، بلا مخرجات مزيّفة.",
              caption: "‏لكل سؤال أمره المناسب — على الحاسوب أو على جهاز الشبكة.",
            },
            {
              id: "m28-l07-p05-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("الجدول الأول يُكتب في موجّه أوامر الحاسوب ("), L("CMD"), T(")، والثاني في موجّه السويتش أو الراوتر بعد "), L("enable"), T(". المحاكي أدناه سويتش معدّ مسبقًا؛ من أوامر الكتاب يدعم "), L("show vlan brief"), T(" و "), L("show vtp status"), T("، والبقية تجرّبها على جهاز حقيقي أو Packet Tracer.")],
            },
            {
              id: "m28-l07-p05-ws", type: "practice-table", origin: "teacher-enrichment", caption: "ورقة عمل: اختر أمر CMD المناسب لكل مهمّة",
              headers: ["المهمّة", "الأمر"],
              columnDirs: ["rtl", "ltr"],
              rows: [["اختبار الاتصال بخادم 8.8.8.8", CMD("ping 8.8.8.8")], ["عرض تفاصيل كاملة عن إعدادات الشبكة", CMD("ipconfig /all")], ["فحص ترجمة DNS", CMD("nslookup")], ["عرض جدول MAC الذي يحفظه الحاسوب", CMD("arp -a")], ["معرفة مسار الوصول إلى الوجهة", CMD("tracert")]],
            },
            {
              id: "m28-l07-p05-ws2", type: "practice-table", origin: "teacher-enrichment", caption: "ورقة عمل: اختر أمر Show المناسب لكل وظيفة",
              headers: ["الوظيفة", "الأمر"],
              columnDirs: ["rtl", "ltr"],
              rows: [["منافذ Trunk", SHOW("show interfaces trunk")], ["إعدادات VTP", SHOW("show vtp status")], ["معلومات STP", SHOW("show spanning-tree")], ["VLANs ومنافذها", SHOW("show vlan brief")], ["حالة المنافذ", SHOW("show interfaces status")], ["جدول MAC", SHOW("show mac address-table")]],
            },
            {
              id: "m28-l07-p05-sim", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "تحدٍّ: افحص السويتش بأوامر Show",
              description: "سويتش معدّ مسبقًا (VLAN 10 SALES على f0/1-2، و VTP في المجال HFA). اعرض جدول الـ VLANs ثم حالة VTP. مخرجات المحاكاة مبسّطة وليست مخرجات جهاز حقيقي.",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "التحدّي: show vlan brief ثم show vtp status (بعد enable)." },
              config: EX({
                kind: "challenge",
                device: "switch",
                hostname: "Switch",
                startMode: "privileged",
                preset: { vlans: { "10": { name: "SALES" }, "20": { name: "HR" } }, interfaces: { "f0/1": { switchportMode: "access", accessVlan: 10 }, "f0/2": { switchportMode: "access", accessVlan: 10 }, "f0/24": { switchportMode: "trunk" } } },
                intro: "أنت في الوضع المميّز لسويتش معدّ مسبقًا. أجب بأمر Show المناسب من جدول الكتاب.",
                steps: [
                  { id: "s1", instruction: "اعرض الـ VLANs ومنافذها", expect: { command: "show", args: { what: "vlan-brief" } }, hints: ["السطر الأول في جدول أوامر Show.", "show vlan brief."] },
                  { id: "s2", instruction: "اعرض إعدادات VTP", expect: { command: "show", args: { what: "vtp-status" } }, hints: ["سطر «إعدادات VTP» في الجدول.", "show vtp status."] },
                ],
                completion: "✓ أحسنت، هذان أمران من جدول الكتاب؛ جرّب بقية أوامر Show على جهاز حقيقي.",
              }),
            },
            { id: "m28-l07-p05-review", type: "heading", origin: "teacher-enrichment", text: "مراجعة الوحدة", level: 3 },
            {
              id: "m28-l07-p05-r1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي قيمة AD تكون لمسار ثابت كتبته بالأمر ip route؟",
                options: [opt("m28-l07-p05-r1-a", "1", true), opt("m28-l07-p05-r1-b", "0"), opt("m28-l07-p05-r1-c", "110")],
                feedback: {
                  hints: ["صفحة «المسافة الإدارية AD».", "Connected = 0، و Static = …"],
                  correctFeedback: "صحيح — Static = 1.",
                  incorrectFeedback: "افحص جدول AD: Static = 1، Connected = 0، OSPF = 110.",
                  explanation: "المسار الثابت يأتي مباشرة بعد الشبكات المتصلة في الثقة.",
                },
              },
            },
            {
              id: "m28-l07-p05-r2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "ما Wildcard الذي يكتبه الكتاب لشبكة /24 في أوامر OSPF و EIGRP و ACL؟", answer: "0.0.0.255",
                feedback: {
                  hints: ["صفحة «قناع البدل Wildcard Mask».", "قناع 255.255.255.0 يقابله…"],
                  correctFeedback: "صحيح — 0.0.0.255.",
                  incorrectFeedback: "افحص جدول Wildcard: شبكة /24 تقابل 0.0.0.255.",
                  explanation: "كل خانة في Wildcard = 255 − خانة القناع.",
                },
              },
            },
            {
              id: "m28-l07-p05-r3", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "عند فتح موقع، ما أول بروتوكول يعمل بحسب السيناريو التكاملي؟",
                options: [opt("m28-l07-p05-r3-a", "DNS", true), opt("m28-l07-p05-r3-b", "ARP"), opt("m28-l07-p05-r3-c", "HTTP")],
                feedback: {
                  hints: ["صفحة «سيناريو تكاملي: فتح موقع».", "الخطوة رقم 1."],
                  correctFeedback: "صحيح — DNS أولًا.",
                  incorrectFeedback: "افحص ترتيب الخطوات: DNS ثم ARP ثم TCP Handshake ثم HTTP/HTTPS.",
                  explanation: "قبل أي شيء يحتاج الحاسوب إلى عنوان IP للموقع من DNS.",
                },
              },
            },
          ],
        },
      ],
    },
    // ── l08 كلمة الختام (PDF 263) — static, respectful; no quiz is forced on the closing word ───────────────
    {
      id: "791381-m28-l08",
      title: "كلمة الختام",
      order: 8,
      pages: [
        {
          id: "791381-m28-l08-p01",
          title: "كلمة الختام",
          order: 1,
          source: src(263),
          conversionNote: "كلمة الختام في الكتاب صفحة ثابتة بلا رقم مطبوع؛ تُعرض كما هي بلا تدريب مفروض. PDF 264 (الغلاف الخلفي: بيانات الكتاب والدفعات ورمز QR) ليست صفحة تعلّم ولم تُحوَّل.",
          keywords: ["كلمة الختام", "المؤلف", "الأستاذ وفيق نصار"],
          blocks: [
            { id: "m28-l08-p01-t1", type: "text", origin: "book", spans: [T("الحمد لله الذي وفّقنا وأعاننا على إتمام هذا الكتاب.")] },
            { id: "m28-l08-p01-t2", type: "text", origin: "book", spans: [T("نسأل الله أن يكون هذا العمل مرجعًا مفيدًا ومبسّطًا لطلابنا في فهم شبكات الاتصال.")] },
            { id: "m28-l08-p01-t3", type: "text", origin: "book", spans: [T("علم الشبكات واسع، وما في هذا الكتاب بداية تساعد الطالب على بناء أساس قوي للتعلّم والتطوّر.")] },
            { id: "m28-l08-p01-t4", type: "text", origin: "book", spans: [T("والسلام عليكم ورحمة الله وبركاته.")] },
            { id: "m28-l08-p01-author", type: "callout", origin: "book", kind: "summary", title: "المؤلف", spans: [T("الأستاذ وفيق نصار")] },
            {
              id: "m28-l08-p01-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("هذه آخر صفحة في الكتاب التفاعلي. صفحات «الملخّص الشامل» السابقة مصمّمة للمراجعة السريعة قبل الامتحان: عُد إليها من الفهرس متى احتجت، وجرّب أوراق العمل والمحاكي مرة أخرى بعد أيام لتثبيت ما تعلّمته.")],
            },
          ],
        },
      ],
    },
  ],
};

export default m28;
