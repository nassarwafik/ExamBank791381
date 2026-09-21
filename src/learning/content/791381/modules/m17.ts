// Learning Materials — Batch 5 phase: REAL converted body for Book 791381, module m17 (the book's section
// «أمان الشبكات», source PDF 108–115, complete). Stable id m17 (next free), order 13 (batch b3).
//
// PDF 107 is the book's «الجزء الثاني · أمان الشبكات» PART COVER — a structural page with no learner concept. It is NOT
// a learner page: it is represented as the start of this module's coarse source range (`source.pdfPageStart: 107`,
// `sourceNote`); the first learner page is PDF 108. The section has no «الوحدة N» opener, so none is invented.
// PDF 116 opens the next section («تجزئة البيانات», module m18).
//
// Book-derived blocks are origin:"book" and reproduce the RENDERED source: the PDF 108 definition + facts +
// «المطلوب للطالب», the attack cards (DoS/DDoS, Session Hijacking/MitM with the figure captions as text,
// Phishing/Spoofing), «الفرق» / «الوقاية» / «احذر», the PDF 112 facts + «الأمان يعني», the VPN / SSL-TLS-HTTPS / SSH
// facts and «متى نستعمله؟» / «تذكّر» boxes. Technical tokens are LTR code spans.
// SOURCE LEVEL: the book gives one idea per attack and one idea per protection — «اسم الهجوم + فكرته الأساسية، دون
// الدخول في تفاصيل تقنية». No attack mechanics, no tools, no defence configuration, no certificate / key details
// beyond the book's «كلمة مرور أو مفاتيح تشفير». Nothing from PDF 116+ (Segment/Packet/Frame, the 3-way handshake)
// or PDF 120+ (switch CLI / VLAN programming) appears here.
// PRINTED PAGE = the rendered page circle (PDF 108 prints «108» … PDF 115 prints «115»).

import type { ContentModule, ContentSource, InlineSpan, PracticeOption, PracticeTableSelectCell } from "../../types";

const CID = "791381";
const src = (pdf: number, printed?: number): ContentSource => ({ kind: "book", sourceId: CID, pdfPageStart: pdf, printedPage: printed });
const L = (text: string): InlineSpan => ({ text, dir: "ltr", style: "code" });
const T = (text: string): InlineSpan => ({ text });
const opt = (id: string, text: string, correct?: true): PracticeOption => (correct ? { id, text, correct } : { id, text });
const ATTACKS = ["DoS", "DDoS", "Session Hijacking", "MitM", "Phishing", "Spoofing"] as const;
const A = (key: (typeof ATTACKS)[number]): PracticeTableSelectCell => ({ kind: "select", options: [...ATTACKS], key });
const TOOLS = ["VPN", "SSL/TLS", "HTTPS", "SSH"] as const;
const S = (key: (typeof TOOLS)[number]): PracticeTableSelectCell => ({ kind: "select", options: [...TOOLS], key });

const m17: ContentModule = {
  id: "791381-m17",
  title: "أمان الشبكات",
  shortTitle: "أمان الشبكات",
  order: 13,
  source: { kind: "book", sourceId: CID, pdfPageStart: 107, pdfPageEnd: 115, sourceNote: "PDF 107 صفحة عنوان «الجزء الثاني · أمان الشبكات» (بلا محتوى تعليمي)؛ أول صفحة تعليمية هي PDF 108. لا توجد صفحة افتتاحية وحدة في هذا القسم." },
  lessons: [
    // ── l01 — attacks (PDF 108–111) ──────────────────────────────────────────────────────────────────────────
    {
      id: "791381-m17-l01",
      title: "القرصنة والهجمات على الشبكة",
      order: 1,
      pages: [
        // PDF 108 — القرصنة والهجمات على الشبكة
        {
          id: "791381-m17-l01-p01",
          title: "القرصنة والهجمات على الشبكة",
          order: 1,
          source: src(108, 108),
          keywords: ["القرصنة", "الهجمات", "أمان الشبكات"],
          blocks: [
            {
              id: "m17-l01-p01-def", type: "callout", origin: "book", kind: "important",
              spans: [T("هي محاولات غير قانونية للوصول إلى الشبكة أو تعطيلها.")],
            },
            {
              id: "m17-l01-p01-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m17-l01-p01-f1", text: [T("قد تستهدف المعلومات أو الخوادم أو المستخدمين.")] },
                { id: "m17-l01-p01-f2", text: [T("هدفنا أن نعرف الفكرة ونميّز نوع الهجوم.")] },
                { id: "m17-l01-p01-f3", text: [T("لكل هجوم اسم وفكرة أساسية بسيطة.")] },
              ],
            },
            {
              id: "m17-l01-p01-required", type: "callout", origin: "book", kind: "tip", title: "المطلوب للطالب",
              spans: [T("اسم الهجوم + فكرته الأساسية، دون الدخول في تفاصيل تقنية.")],
            },
            {
              id: "m17-l01-p01-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("في الصفحات التالية ستقرأ لكل هجوم اسمه بالإنجليزية وجملة واحدة تشرح فكرته، ثم ما الذي يجعل الهجوم أصعب. هذا كل المطلوب في هذا القسم: التمييز بين الأنواع، لا تفاصيل التنفيذ.")],
            },
            {
              id: "m17-l01-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "المطلوب من الطالب في هذا القسم هو معرفة اسم الهجوم وفكرته الأساسية دون تفاصيل تقنية.",
                answer: true,
                feedback: {
                  hints: ["افحص صندوق «المطلوب للطالب».", "«اسم الهجوم + فكرته الأساسية»."],
                  correctFeedback: "صحيح — الاسم والفكرة الأساسية فقط.",
                  incorrectFeedback: "افحص صندوق «المطلوب للطالب»: «اسم الهجوم + فكرته الأساسية، دون الدخول في تفاصيل تقنية».",
                  explanation: "هدف القسم أن نعرف الفكرة ونميّز نوع الهجوم.",
                },
              },
            },
            {
              id: "m17-l01-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما هي القرصنة والهجمات على الشبكة حسب الكتاب؟",
                options: [opt("m17-l01-p01-q2-a", "محاولات غير قانونية للوصول إلى الشبكة أو تعطيلها", true), opt("m17-l01-p01-q2-b", "أوامر لفحص الشبكة"), opt("m17-l01-p01-q2-c", "بروتوكولات لنقل البيانات")],
                feedback: {
                  hints: ["افحص الصندوق الأول في الصفحة.", "كلمتا «غير قانونية» و«تعطيلها»."],
                  correctFeedback: "أحسنت — محاولات غير قانونية للوصول أو التعطيل.",
                  incorrectFeedback: "افحص الصندوق الأول: «محاولات غير قانونية للوصول إلى الشبكة أو تعطيلها».",
                  explanation: "قد تستهدف المعلومات أو الخوادم أو المستخدمين.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 4): SVG visual enrichment appended after the book content.
              id: "m17-l01-p01-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m17/attack-targets", motion: true,
              source: src(108),
              title: "مخطط: أهداف الهجوم المحتملة",
              alt: "مخطط مفاهيمي يبيّن أن الهجوم على الشبكة قد يستهدف المستخدم أو المعلومات أو الخوادم.",
              caption: "قد يستهدف الهجوم: المستخدم أو المعلومات أو الخوادم.",
            },
          ],
        },
        // PDF 109 — DoS / DDoS
        {
          id: "791381-m17-l01-p02",
          title: "DoS / DDoS",
          order: 2,
          source: src(109, 109),
          keywords: ["DoS", "DDoS", "إغراق الخادم"],
          blocks: [
            {
              id: "m17-l01-p02-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m17-l01-p02-dos", term: "DoS", text: [T("إغراق الخادم بطلبات كثيرة من مصدر واحد حتى يتوقّف أو يبطؤ.")] },
                { id: "m17-l01-p02-ddos", term: "DDoS", text: [T("نفس الفكرة، لكن الهجوم يأتي من أجهزة كثيرة في نفس الوقت.")] },
              ],
            },
            {
              id: "m17-l01-p02-diff", type: "callout", origin: "book", kind: "important", title: "الفرق",
              spans: [L("DoS"), T(" من مصدر واحد، و "), L("DDoS"), T(" موزّع من أجهزة كثيرة — وهو أصعب في الإيقاف.")],
            },
            {
              id: "m17-l01-p02-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("الحرف "), L("D"), T(" الإضافي في "), L("DDoS"), T(" يعني «موزّع» (Distributed): الطلبات الكثيرة نفسها لكن من أجهزة كثيرة، ولهذا يصعب إيقافها بمنع مصدر واحد.")],
            },
            {
              id: "m17-l01-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "خادم توقّف بسبب طلبات كثيرة جاءت من أجهزة كثيرة في نفس الوقت. ما نوع الهجوم؟",
                options: [opt("m17-l01-p02-q1-a", "DoS"), opt("m17-l01-p02-q1-b", "DDoS", true)],
                feedback: {
                  hints: ["افحص كلمة «أجهزة كثيرة» في البطاقتين.", "«موزّع»."],
                  correctFeedback: "أحسنت — من أجهزة كثيرة = DDoS.",
                  incorrectFeedback: "افحص صندوق «الفرق»: DoS من مصدر واحد، و DDoS موزّع من أجهزة كثيرة.",
                  explanation: "DDoS أصعب في الإيقاف لأنه موزّع.",
                },
              },
            },
            {
              id: "m17-l01-p02-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "DoS يعني إغراق الخادم بطلبات كثيرة من مصدر واحد حتى يتوقّف أو يبطؤ.",
                answer: true,
                feedback: {
                  hints: ["افحص بطاقة DoS.", "«من مصدر واحد»."],
                  correctFeedback: "صحيح — DoS: مصدر واحد، إغراق بالطلبات.",
                  incorrectFeedback: "افحص بطاقة DoS: «إغراق الخادم بطلبات كثيرة من مصدر واحد حتى يتوقّف أو يبطؤ».",
                  explanation: "DDoS هي الفكرة نفسها من أجهزة كثيرة.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 4): SVG visual enrichment appended after the book content.
              id: "m17-l01-p02-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m17/dos-vs-ddos", motion: true,
              source: src(109),
              title: "مخطط: DoS مقابل DDoS",
              alt: "مخطط يقارن DoS حيث مصدر واحد يُغرق الخادم، بـ DDoS حيث أجهزة كثيرة تُغرق الخادم نفسه في آن واحد.",
              caption: "DoS: مصدر واحد · DDoS: مصادر كثيرة معًا.",
            },
          ],
        },
        // PDF 110 — Session Hijacking / MitM
        {
          id: "791381-m17-l01-p03",
          title: "Session Hijacking / MitM",
          order: 3,
          source: src(110, 110),
          keywords: ["Session Hijacking", "MitM", "اختطاف الجلسة", "الرجل في الوسط"],
          blocks: [
            {
              id: "m17-l01-p03-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m17-l01-p03-hijack", term: "اختطاف الجلسة", text: [T("المهاجم يسيطر على جلسة اتصال مفتوحة بين المستخدم والخادم.")], note: "الرسم: المستخدم — الخادم، والمهاجم يسيطر على الجلسة المفتوحة" },
                { id: "m17-l01-p03-mitm", term: "الرجل في الوسط MitM", text: [T("المهاجم يقف بين الطرفين ويعترض البيانات وقد يغيّرها.")], note: "الرسم: المستخدم — المهاجم في الوسط — الخادم؛ يقرأ البيانات وقد يغيّرها" },
              ],
            },
            {
              id: "m17-l01-p03-prevent", type: "callout", origin: "book", kind: "important", title: "الوقاية",
              spans: [T("التشفير ("), L("HTTPS"), T(" و "), L("VPN"), T(") يجعل اعتراض البيانات أو اختطاف الجلسة أصعب بكثير.")],
            },
            {
              id: "m17-l01-p03-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("الفرق بين الاثنين في مكان المهاجم: في اختطاف الجلسة يأخذ جلسة مفتوحة أصلًا ويتصرّف كأنه المستخدم، وفي الرجل في الوسط يجلس بين الطرفين فتمرّ البيانات عبره. "), L("VPN"), T(" الذي تذكره «الوقاية» تشرحه صفحة لاحقة في هذا القسم.")],
            },
            {
              id: "m17-l01-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "مهاجم يقف بين المستخدم والخادم ويقرأ البيانات وقد يغيّرها. ما اسم الهجوم؟",
                options: [opt("m17-l01-p03-q1-a", "الرجل في الوسط MitM", true), opt("m17-l01-p03-q1-b", "DoS"), opt("m17-l01-p03-q1-c", "اختطاف الجلسة")],
                feedback: {
                  hints: ["افحص كلمة «بين الطرفين».", "الاسم فيه كلمة «الوسط»."],
                  correctFeedback: "أحسنت — الرجل في الوسط يعترض البيانات وقد يغيّرها.",
                  incorrectFeedback: "افحص بطاقة MitM: «المهاجم يقف بين الطرفين ويعترض البيانات وقد يغيّرها». اختطاف الجلسة = السيطرة على جلسة مفتوحة.",
                  explanation: "MitM: في الوسط. اختطاف الجلسة: يسيطر على جلسة مفتوحة.",
                },
              },
            },
            {
              id: "m17-l01-p03-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما الذي يجعل اعتراض البيانات أو اختطاف الجلسة أصعب بكثير حسب صندوق «الوقاية»؟",
                options: [opt("m17-l01-p03-q2-a", "التشفير (HTTPS و VPN)", true), opt("m17-l01-p03-q2-b", "استخدام Hub بدل Switch"), opt("m17-l01-p03-q2-c", "إرسال طلبات كثيرة")],
                feedback: {
                  hints: ["افحص صندوق «الوقاية».", "كلمة واحدة تبدأ بـ «التـ…»."],
                  correctFeedback: "أحسنت — التشفير يجعل الاعتراض والاختطاف أصعب بكثير.",
                  incorrectFeedback: "افحص صندوق «الوقاية»: «التشفير (HTTPS و VPN) يجعل اعتراض البيانات أو اختطاف الجلسة أصعب بكثير».",
                  explanation: "البيانات المشفّرة لا يفهمها من يعترضها.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 4): SVG visual enrichment appended after the book content.
              id: "m17-l01-p03-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m17/hijacking-vs-mitm", motion: true,
              source: src(110),
              title: "مخطط: Session Hijacking مقابل MitM",
              alt: "مخطط بلوحتين: الاستيلاء على جلسة مفتوحة أصلًا، مقابل مهاجم يقف بين الطرفين فيمرّ كل شيء عبره.",
              caption: "الاستيلاء يأخذ جلسة قائمة · MitM يمرّ كل شيء عبر المهاجم.",
            },
          ],
        },
        // PDF 111 — Phishing / Spoofing
        {
          id: "791381-m17-l01-p04",
          title: "Phishing / Spoofing",
          order: 4,
          source: src(111, 111),
          keywords: ["Phishing", "Spoofing", "خداع", "تزييف"],
          blocks: [
            {
              id: "m17-l01-p04-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m17-l01-p04-phish", term: "Phishing", text: [T("خداع المستخدم بموقع أو رسالة تشبه جهة حقيقية للحصول على معلوماته.")] },
                { id: "m17-l01-p04-spoof", term: "Spoofing", text: [T("تزييف عنوان "), L("IP"), T(" أو بريد إلكتروني حتى يبدو وكأنه من جهة موثوقة.")] },
              ],
            },
            {
              id: "m17-l01-p04-warn", type: "callout", origin: "book", kind: "warning", title: "احذر",
              spans: [T("لا تثق بأي رابط أو رسالة قبل التأكّد من المصدر؛ كثير من الهجمات تبدأ بخداع بسيط.")],
            },
            {
              id: "m17-l01-p04-ex1", type: "example", origin: "teacher-enrichment", mode: "solved",
              title: "مثال محلول: رسالة تطلب كلمة المرور — أي هجوم؟",
              prompt: "وصلت طالبًا رسالة تشبه رسائل المدرسة وفيها رابط لصفحة تشبه موقع المدرسة تطلب كلمة المرور. ما اسم هذا الهجوم، وما التصرّف الصحيح؟",
              steps: [
                { text: "الرسالة والصفحة «تشبهان جهة حقيقية» وهدفهما «الحصول على معلوماته» — هذه بطاقة Phishing بالضبط." },
                { text: "لو كان عنوان المرسل نفسه مزيّفًا ليبدو من المدرسة، فذلك Spoofing: «تزييف … بريد إلكتروني حتى يبدو وكأنه من جهة موثوقة»." },
                { text: "التصرّف الصحيح من صندوق «احذر»: لا تثق بالرابط أو الرسالة قبل التأكّد من المصدر." },
              ],
              result: "الخداع بالصفحة المشابهة = Phishing · تزييف عنوان المرسل = Spoofing · القاعدة: تأكّد من المصدر أولًا",
              explanation: "كثير من الهجمات تبدأ بخداع بسيط، فالتأكّد من المصدر يوقفها في بدايتها.",
            },
            {
              id: "m17-l01-p04-match", type: "practice-table", origin: "teacher-enrichment",
              caption: "تحقّق من نفسك: ما اسم كل هجوم؟ (بكلمات الكتاب)",
              headers: ["الوصف", "اسم الهجوم"],
              columnDirs: ["rtl", "ltr"],
              rows: [
                ["إغراق الخادم بطلبات كثيرة من مصدر واحد.", A("DoS")],
                ["المهاجم يقف بين الطرفين ويعترض البيانات وقد يغيّرها.", A("MitM")],
                ["تزييف عنوان IP أو بريد إلكتروني ليبدو من جهة موثوقة.", A("Spoofing")],
                ["الهجوم يأتي من أجهزة كثيرة في نفس الوقت.", A("DDoS")],
                ["خداع المستخدم بموقع أو رسالة تشبه جهة حقيقية للحصول على معلوماته.", A("Phishing")],
                ["المهاجم يسيطر على جلسة اتصال مفتوحة بين المستخدم والخادم.", A("Session Hijacking")],
              ],
            },
            {
              id: "m17-l01-p04-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما الفرق بين Phishing و Spoofing حسب الكتاب؟",
                options: [opt("m17-l01-p04-q1-a", "Phishing خداع المستخدم بموقع أو رسالة مشابهة، و Spoofing تزييف عنوان IP أو بريد ليبدو موثوقًا", true), opt("m17-l01-p04-q1-b", "لا فرق؛ كلاهما إغراق للخادم"), opt("m17-l01-p04-q1-c", "Phishing يخصّ الكابلات و Spoofing يخصّ Wi-Fi")],
                feedback: {
                  hints: ["افحص البطاقتين: خداع مقابل تزييف.", "الإغراق بالطلبات هجوم آخر (DoS)."],
                  correctFeedback: "أحسنت — خداع المستخدم مقابل تزييف العنوان.",
                  incorrectFeedback: "افحص البطاقتين: Phishing «خداع المستخدم بموقع أو رسالة تشبه جهة حقيقية»، Spoofing «تزييف عنوان IP أو بريد إلكتروني».",
                  explanation: "الاثنان يعتمدان على أن يبدو الشيء حقيقيًا أو موثوقًا.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 4): SVG visual enrichment appended after the book content.
              id: "m17-l01-p04-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m17/phishing-vs-spoofing", motion: true,
              source: src(111),
              title: "مخطط: Phishing مقابل Spoofing",
              alt: "مخطط بلوحتين: رسالة مزيّفة تخدع المستخدم، مقابل تزييف هوية المصدر لتبدو من جهة موثوقة.",
              caption: "Phishing يخدع المستخدم · Spoofing يزيّف هوية المصدر.",
            },
          ],
        },
      ],
    },
    // ── l02 — secure communications (PDF 112–115) ────────────────────────────────────────────────────────────
    {
      id: "791381-m17-l02",
      title: "الاتصالات الآمنة",
      order: 2,
      pages: [
        // PDF 112 — الاتصالات الآمنة
        {
          id: "791381-m17-l02-p01",
          title: "الاتصالات الآمنة",
          order: 1,
          source: src(112, 112),
          keywords: ["الاتصالات الآمنة", "التشفير", "الهوية"],
          blocks: [
            {
              id: "m17-l02-p01-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m17-l02-p01-f1", text: [T("تهدف إلى حماية البيانات أثناء انتقالها.")] },
                { id: "m17-l02-p01-f2", text: [T("تستخدم التشفير حتى لا يقرأ الآخرون البيانات.")] },
                { id: "m17-l02-p01-f3", text: [T("أمثلة مهمة: "), L("VPN"), T("، "), L("SSL/TLS"), T("، "), L("SSH"), T(".")] },
                { id: "m17-l02-p01-f4", text: [T("تتحقّق أيضًا من هوية الطرف الآخر.")] },
              ],
            },
            {
              id: "m17-l02-p01-means", type: "callout", origin: "book", kind: "important", title: "الأمان يعني",
              spans: [T("حماية البيانات + التأكّد من هوية الطرف الآخر معًا.")],
            },
            {
              id: "m17-l02-p01-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("الأمان جانبان لا جانب واحد: أن لا يقرأ الآخرون البيانات (التشفير)، وأن تعرف مع من تتكلّم فعلًا (الهوية). الصفحات الثلاث التالية تشرح الأمثلة الثلاثة واحدًا واحدًا.")],
            },
            {
              id: "m17-l02-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ماذا يعني الأمان حسب صندوق «الأمان يعني»؟",
                options: [opt("m17-l02-p01-q1-a", "حماية البيانات + التأكّد من هوية الطرف الآخر معًا", true), opt("m17-l02-p01-q1-b", "حماية البيانات فقط"), opt("m17-l02-p01-q1-c", "سرعة أعلى في الشبكة")],
                feedback: {
                  hints: ["افحص صندوق «الأمان يعني».", "جانبان بكلمة «معًا»."],
                  correctFeedback: "أحسنت — حماية البيانات والتأكّد من الهوية معًا.",
                  incorrectFeedback: "افحص صندوق «الأمان يعني»: «حماية البيانات + التأكّد من هوية الطرف الآخر معًا».",
                  explanation: "التشفير وحده لا يكفي إن لم تتأكّد ممّن تتكلّم معه.",
                },
              },
            },
            {
              id: "m17-l02-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "الاتصالات الآمنة تستخدم التشفير حتى لا يقرأ الآخرون البيانات.",
                answer: true,
                feedback: {
                  hints: ["افحص السطر الثاني في قائمة الصفحة.", "كلمة «التشفير»."],
                  correctFeedback: "صحيح — التشفير يمنع الآخرين من قراءة البيانات.",
                  incorrectFeedback: "افحص قائمة الصفحة: «تستخدم التشفير حتى لا يقرأ الآخرون البيانات».",
                  explanation: "الأمثلة المهمة: VPN، SSL/TLS، SSH.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 4): SVG visual enrichment appended after the book content.
              id: "m17-l02-p01-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m17/secure-two-pillars", motion: true,
              source: src(112),
              title: "مخطط: ركيزتا الاتصال الآمن",
              alt: "مخطط يبيّن ركيزتي الأمان معًا: تشفير البيانات عبر قناة محميّة، والتحقق من هوية الطرف الآخر.",
              caption: "الأمان = تشفير البيانات + التحقق من هوية الطرف الآخر.",
            },
          ],
        },
        // PDF 113 — VPN
        {
          id: "791381-m17-l02-p02",
          title: "VPN",
          order: 2,
          source: src(113, 113),
          keywords: ["VPN", "اتصال آمن", "عمل عن بُعد", "Wi-Fi عامة"],
          blocks: [
            {
              id: "m17-l02-p02-facts", type: "list", origin: "book", variant: "checklist", title: "VPN",
              items: [
                { id: "m17-l02-p02-f1", text: [T("ينشئ اتصالًا آمنًا عبر الإنترنت.")] },
                { id: "m17-l02-p02-f2", text: [T("يشفّر البيانات أثناء انتقالها.")] },
                { id: "m17-l02-p02-f3", text: [T("يخفي عنوان "), L("IP"), T(" الحقيقي جزئيًا.")] },
                { id: "m17-l02-p02-f4", text: [T("مفيد للعمل عن بُعد والشبكات العامة.")] },
              ],
            },
            {
              id: "m17-l02-p02-when", type: "callout", origin: "book", kind: "tip", title: "متى نستعمله؟",
              spans: [T("عند العمل عن بُعد أو استخدام شبكات "), L("Wi-Fi"), T(" عامة غير موثوقة.")],
            },
            {
              id: "m17-l02-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "متى ينصح الكتاب باستعمال VPN؟",
                options: [opt("m17-l02-p02-q1-a", "عند العمل عن بُعد أو استخدام شبكات Wi-Fi عامة غير موثوقة", true), opt("m17-l02-p02-q1-b", "عند فحص الاتصال بأمر ping"), opt("m17-l02-p02-q1-c", "عند توزيع عناوين IP")],
                feedback: {
                  hints: ["افحص صندوق «متى نستعمله؟».", "شبكات عامة غير موثوقة."],
                  correctFeedback: "أحسنت — العمل عن بُعد والشبكات العامة غير الموثوقة.",
                  incorrectFeedback: "افحص صندوق «متى نستعمله؟»: «عند العمل عن بُعد أو استخدام شبكات Wi-Fi عامة غير موثوقة».",
                  explanation: "VPN ينشئ اتصالًا آمنًا عبر الإنترنت ويشفّر البيانات.",
                },
              },
            },
            {
              id: "m17-l02-p02-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "VPN يخفي عنوان IP الحقيقي جزئيًا.",
                answer: true,
                feedback: {
                  hints: ["افحص السطر الثالث في قائمة الصفحة.", "كلمة «جزئيًا»."],
                  correctFeedback: "صحيح — يخفيه جزئيًا.",
                  incorrectFeedback: "افحص قائمة الصفحة: «يخفي عنوان IP الحقيقي جزئيًا».",
                  explanation: "الكتاب يقول «جزئيًا» لا «كليًا».",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 4): SVG visual enrichment appended after the book content.
              id: "m17-l02-p02-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m17/vpn-tunnel", motion: true,
              source: src(113),
              title: "مخطط: نفق VPN المشفّر",
              alt: "مخطط يبيّن بيانات تبقى داخل نفق مشفّر وهي تعبر شبكة عامة غير موثوقة حتى تصل إلى وجهة خاصّة موثوقة.",
              caption: "VPN ينشئ نفقًا مشفّرًا يعبر الشبكة العامة بأمان.",
            },
          ],
        },
        // PDF 114 — SSL / TLS و HTTPS
        {
          id: "791381-m17-l02-p03",
          title: "SSL / TLS و HTTPS",
          order: 3,
          source: src(114, 114),
          keywords: ["SSL/TLS", "HTTPS", "القفل", "المتصفح"],
          blocks: [
            {
              id: "m17-l02-p03-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m17-l02-p03-f1", text: [L("SSL/TLS"), T(" يشفّر الاتصال بين المتصفح والخادم.")] },
                { id: "m17-l02-p03-f2", text: [L("HTTPS"), T(" هو "), L("HTTP"), T(" مع طبقة أمان.")] },
                { id: "m17-l02-p03-f3", text: [T("علامة القفل في المتصفح تعني اتصالًا آمنًا.")] },
                { id: "m17-l02-p03-f4", text: [T("يساعد على منع التجسّس والتلاعب بالبيانات.")] },
              ],
            },
            {
              id: "m17-l02-p03-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("اكتب "), L("HTTPS"), T(" بدل "), L("HTTP"), T(" عند الحديث عن المواقع الآمنة.")],
            },
            {
              id: "m17-l02-p03-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح",
              spans: [T("في قسم البروتوكولات تعلّمت أن "), L("HTTPS"), T(" نسخة آمنة من "), L("HTTP"), T(" تستعمل التشفير؛ هنا يسمّي الكتاب طبقة الأمان تلك: "), L("SSL/TLS"), T(". علامة القفل في المتصفح هي الدليل الذي تراه بعينك.")],
            },
            {
              id: "m17-l02-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ماذا تعني علامة القفل في المتصفح؟",
                options: [opt("m17-l02-p03-q1-a", "اتصالًا آمنًا (HTTPS)", true), opt("m17-l02-p03-q1-b", "أن الموقع بطيء"), opt("m17-l02-p03-q1-c", "أن الجهاز في Full Duplex")],
                feedback: {
                  hints: ["افحص السطر الثالث في قائمة الصفحة.", "القفل = آمن."],
                  correctFeedback: "أحسنت — القفل يعني اتصالًا آمنًا.",
                  incorrectFeedback: "افحص قائمة الصفحة: «علامة القفل في المتصفح تعني اتصالًا آمنًا».",
                  explanation: "HTTPS هو HTTP مع طبقة أمان (SSL/TLS).",
                },
              },
            },
            {
              id: "m17-l02-p03-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "اكتب اسم البروتوكول الذي يجب أن تكتبه بدل HTTP عند الحديث عن المواقع الآمنة (بالأحرف اللاتينية).",
                answer: "HTTPS",
                feedback: {
                  hints: ["افحص صندوق «تذكّر».", "حرف واحد إضافي في النهاية."],
                  correctFeedback: "صحيح — HTTPS.",
                  incorrectFeedback: "افحص صندوق «تذكّر»: «اكتب … بدل HTTP عند الحديث عن المواقع الآمنة».",
                  explanation: "HTTPS = HTTP مع طبقة أمان.",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 4): SVG visual enrichment appended after the book content.
              id: "m17-l02-p03-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m17/https-secure-channel", motion: true,
              source: src(114),
              title: "مخطط: SSL/TLS و HTTPS",
              alt: "مخطط يبيّن أن SSL/TLS يحمي القناة بين المتصفّح والخادم، وأن HTTPS هو HTTP مع طبقة أمان.",
              caption: "HTTPS = HTTP مع طبقة أمان تحمي الاتصال بين المتصفّح والخادم.",
            },
          ],
        },
        // PDF 115 — SSH
        {
          id: "791381-m17-l02-p04",
          title: "SSH",
          order: 4,
          source: src(115, 115),
          keywords: ["SSH", "Telnet", "إدارة عن بُعد", "مفاتيح تشفير"],
          blocks: [
            {
              id: "m17-l02-p04-facts", type: "list", origin: "book", variant: "checklist", title: "SSH",
              items: [
                { id: "m17-l02-p04-f1", text: [T("اتصال آمن لإدارة الأجهزة عن بُعد.")] },
                { id: "m17-l02-p04-f2", text: [T("يشفّر البيانات أثناء النقل.")] },
                { id: "m17-l02-p04-f3", text: [T("أكثر أمانًا من "), L("Telnet"), T(".")] },
                { id: "m17-l02-p04-f4", text: [T("يستخدم كلمة مرور أو مفاتيح تشفير.")] },
              ],
            },
            {
              id: "m17-l02-p04-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [L("SSH"), T(" آمن، و "), L("Telnet"), T(" غير آمن — فضّل "), L("SSH"), T(" دائمًا.")],
            },
            {
              id: "m17-l02-p04-match", type: "practice-table", origin: "teacher-enrichment",
              caption: "تحقّق من نفسك: أي أداة أمان لكل وصف؟ (بكلمات الكتاب)",
              headers: ["الوصف", "الأداة"],
              columnDirs: ["rtl", "ltr"],
              rows: [
                ["ينشئ اتصالًا آمنًا عبر الإنترنت ويخفي عنوان IP الحقيقي جزئيًا.", S("VPN")],
                ["اتصال آمن لإدارة الأجهزة عن بُعد، أكثر أمانًا من Telnet.", S("SSH")],
                ["يشفّر الاتصال بين المتصفح والخادم.", S("SSL/TLS")],
                ["HTTP مع طبقة أمان؛ علامة القفل في المتصفح.", S("HTTPS")],
              ],
            },
            {
              id: "m17-l02-p04-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ماذا يستخدم SSH للدخول حسب الكتاب؟",
                options: [opt("m17-l02-p04-q1-a", "كلمة مرور أو مفاتيح تشفير", true), opt("m17-l02-p04-q1-b", "عنوان Broadcast"), opt("m17-l02-p04-q1-c", "رسائل ping")],
                feedback: {
                  hints: ["افحص السطر الأخير في قائمة الصفحة.", "«كلمة مرور أو …»."],
                  correctFeedback: "أحسنت — كلمة مرور أو مفاتيح تشفير.",
                  incorrectFeedback: "افحص قائمة الصفحة: «يستخدم كلمة مرور أو مفاتيح تشفير».",
                  explanation: "SSH آمن لأنه يشفّر البيانات أثناء النقل.",
                },
              },
            },
            // ── closing review for the section (easy, medium, exam-like) ──
            {
              id: "m17-l02-p04-review", type: "heading", origin: "teacher-enrichment", level: 3, text: "مراجعة ختامية: أمان الشبكات",
            },
            {
              id: "m17-l02-p04-r1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي أداة من هذه هي اتصال آمن لإدارة الأجهزة عن بُعد؟",
                options: [opt("m17-l02-p04-r1-a", "SSH", true), opt("m17-l02-p04-r1-b", "Phishing"), opt("m17-l02-p04-r1-c", "DDoS")],
                feedback: {
                  hints: ["افحص صفحة SSH.", "الخياران الآخران هجومان لا أداتا أمان."],
                  correctFeedback: "أحسنت — SSH.",
                  incorrectFeedback: "افحص صفحة SSH: «اتصال آمن لإدارة الأجهزة عن بُعد». Phishing و DDoS هجومان.",
                  explanation: "ميّز بين أسماء الهجمات وأدوات الأمان.",
                },
              },
            },
            {
              id: "m17-l02-p04-r2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "سؤال بأسلوب الامتحان: طالب يستخدم Wi-Fi عامة في مقهى ويريد حماية بياناته أثناء انتقالها. ما الأداة الأنسب حسب الكتاب، ولماذا؟",
                options: [opt("m17-l02-p04-r2-a", "VPN، لأنه ينشئ اتصالًا آمنًا عبر الإنترنت ويشفّر البيانات، وهو مفيد للشبكات العامة", true), opt("m17-l02-p04-r2-b", "Telnet، لأنه سريع"), opt("m17-l02-p04-r2-c", "DoS، لأنه يوقف المهاجم")],
                feedback: {
                  hints: ["افحص صندوق «متى نستعمله؟» في صفحة VPN.", "Telnet غير آمن، و DoS هجوم."],
                  correctFeedback: "أحسنت — VPN للشبكات العامة غير الموثوقة.",
                  incorrectFeedback: "افحص صفحة VPN: «مفيد للعمل عن بُعد والشبكات العامة» و«عند … استخدام شبكات Wi-Fi عامة غير موثوقة».",
                  explanation: "VPN يشفّر البيانات أثناء انتقالها ويخفي عنوان IP الحقيقي جزئيًا.",
                },
              },
            },
            {
              id: "m17-l02-p04-r3", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "سؤال بأسلوب الامتحان: موقع يظهر فيه القفل في المتصفح، ورسالة أخرى تطلب كلمة المرور من رابط مشبوه. ما التمييز الصحيح؟",
                options: [opt("m17-l02-p04-r3-a", "القفل يعني HTTPS (اتصال آمن)، والرابط المشبوه قد يكون Phishing فلا نثق به قبل التأكّد من المصدر", true), opt("m17-l02-p04-r3-b", "القفل يعني هجوم MitM، والرابط آمن"), opt("m17-l02-p04-r3-c", "كلاهما آمنان دائمًا")],
                feedback: {
                  hints: ["افحص صفحة SSL / TLS و HTTPS وصندوق «احذر» في صفحة Phishing.", "القفل = آمن؛ الرابط المشبوه = تأكّد من المصدر."],
                  correctFeedback: "أحسنت — القفل اتصال آمن، والرابط المشبوه خداع محتمل.",
                  incorrectFeedback: "افحص: «علامة القفل في المتصفح تعني اتصالًا آمنًا» و«لا تثق بأي رابط أو رسالة قبل التأكّد من المصدر».",
                  explanation: "أداة أمان (HTTPS) مقابل هجوم بالخداع (Phishing).",
                },
              },
            },
          
            {
              // ENRICHMENT (Batch 4): SVG visual enrichment appended after the book content.
              id: "m17-l02-p04-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m14/ssh-vs-telnet", motion: true,
              source: src(115),
              title: "مخطط: SSH الآمن مقابل Telnet",
              alt: "المخطط نفسه من وحدة البروتوكولات: SSH يشفّر جلسة الإدارة عن بُعد بينما Telnet يرسل نصًا صريحًا، فـ SSH أكثر أمانًا.",
              caption: "SSH آمن ومشفّر للإدارة عن بُعد · أكثر أمانًا من Telnet.",
            },
          ],
        },
      ],
    },
  ],
};

export default m17;
