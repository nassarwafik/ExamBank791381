// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 13 «أمان الشبكات».
//
// Verbatim conversion of booklet PDF pages 37–39 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every converted block is origin:"book": nothing is added, removed or reworded.
//
// Enrichment (docs/enterprise-791381s-enrichment-plan.md, Phases 2–5): teacher-enrichment blocks (visuals / activities reused from
// course 791381 after checking their labels against this section, and the end-of-unit «تدريبات الوحدة» lesson) are ADDED after the
// book blocks they explain. The book blocks above stay verbatim — pinned by the book lock (bookLock.test.ts).

import type { ContentModule, ContentSource } from "../../types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };

const m13: ContentModule = {
  id: "791381s-m13",
  title: "أمان الشبكات",
  order: 13,
  lessons: [
    {
      id: "791381s-m13-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m13-l00-p01",
          title: "أمان الشبكات",
          order: 1,
          layout: "opener",
          source: src(37),
          blocks: [
            {
              id: "m13-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الدفعة الثالثة · كتاب ص 107–115", unitNumber: "13", title: "أمان الشبكات",
              subtitle: "الهجمات الشائعة، وكيف نحمي البيانات أثناء انتقالها.",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m13-l01",
      title: "أمان الشبكات",
      order: 1,
      pages: [
        {
          id: "791381s-m13-l01-p01",
          title: "القرصنة والهجمات على الشبكة",
          order: 1,
          source: src(37, 38),
          blocks: [
            {
              id: "m13-l01-p01-def", type: "text", origin: "book",
              spans: [{ text: "الهجمات = محاولات غير قانونية للوصول إلى الشبكة أو تعطيلها. قد تستهدف المعلومات أو الخوادم أو المستخدمين.", style: "strong" }],
            },
            {
              id: "m13-l01-p01-intro", type: "text", origin: "book",
              spans: [{ text: "المهاجم قد يريد سرقة المعلومات، أو التجسّس عليها، أو تعطيل الخدمة حتى لا يستطيع الناس استعمالها." }],
            },
            {
              id: "m13-l01-p01-task", type: "text", origin: "book",
              spans: [
                { text: "المطلوب منك:", style: "strong" },
                { text: " اسم الهجوم + فكرته الأساسية فقط، بدون تفاصيل تقنية." },
              ],
            },
            {
              id: "m13-l01-p01-table", type: "table", origin: "book",
              headers: ["الهجوم", "فكرته الأساسية"],
              rows: [
                ["DoS حجب الخدمة", "إغراق الخادم بطلبات كثيرة من مصدر واحد حتى يتوقّف أو يبطؤ."],
                ["DDoS حجب الخدمة الموزّع", "نفس الفكرة، لكن الهجوم يأتي من أجهزة كثيرة في نفس الوقت — وهو أصعب في الإيقاف."],
                ["Session Hijacking اختطاف الجلسة", "المهاجم يسيطر على جلسة اتصال مفتوحة بين المستخدم والخادم."],
                ["MitM الرجل في الوسط", "المهاجم يقف بين الطرفين، يقرأ البيانات وقد يغيّرها."],
                ["Phishing التصيّد", "خداع المستخدم بموقع أو رسالة تشبه جهة حقيقية للحصول على معلوماته."],
                ["Spoofing التزييف", "تزييف عنوان IP أو بريد إلكتروني حتى يبدو وكأنه من جهة موثوقة."],
              ],
            },
            {
              // ENRICHMENT: SVG of two table rows students often mix up — Session Hijacking seizes an already-open
              // session; MitM stands between the two parties.
              id: "m13-l01-p01-v-hijack-mitm", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m17/hijacking-vs-mitm", motion: true,
              source: src(37, 38),
              title: "رسم توضيحي: Session Hijacking مقابل MitM",
              alt: "لوحتان: في Session Hijacking جلسة مفتوحة بين المستخدم والخادم، ثم يظهر المهاجم من الجانب ويسيطر عليها؛ في MitM المهاجم في الوسط بين المستخدم والخادم، وكل رسالة تمرّ من خلاله.",
              caption: "Session Hijacking: السيطرة على جلسة اتصال مفتوحة. MitM: المهاجم يقف بين الطرفين، يقرأ البيانات وقد يغيّرها.",
            },
            {
              id: "m13-l01-p01-phishing", type: "callout", origin: "book", kind: "tip", title: "مثال على Phishing",
              spans: [{ text: "تصلك رسالة «حسابك في البنك سيُغلق! اضغط هنا وأدخل كلمة المرور» — الرابط لموقع مزيّف يشبه موقع البنك." }],
            },
            { id: "m13-l01-p01-dos-h", type: "heading", origin: "book", level: 4, text: "الفرق بين DoS و DDoS" },
            {
              id: "m13-l01-p01-dos-1", type: "text", origin: "book",
              spans: [
                { text: "DoS: " },
                { text: "جهاز واحد", style: "strong" },
                { text: " يرسل طلبات كثيرة." },
              ],
            },
            {
              id: "m13-l01-p01-dos-2", type: "text", origin: "book",
              spans: [
                { text: "DDoS: " },
                { text: "آلاف الأجهزة", style: "strong" },
                { text: " ترسل معًا." },
              ],
            },
            {
              // ENRICHMENT: SVG of «الفرق بين DoS و DDoS» — one source vs many devices flooding the same server.
              id: "m13-l01-p01-v-dos", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m17/dos-vs-ddos", motion: true,
              source: src(37, 38),
              title: "رسم توضيحي: DoS مقابل DDoS",
              alt: "لوحتان: في DoS جهاز واحد يرسل طلبات كثيرة متتالية إلى خادم واحد؛ في DDoS أجهزة كثيرة ترسل الطلبات معًا إلى نفس الخادم.",
              caption: "DoS: جهاز واحد يرسل طلبات كثيرة. DDoS: أجهزة كثيرة ترسل معًا — وهو أصعب في الإيقاف.",
            },
            {
              id: "m13-l01-p01-beware", type: "callout", origin: "book", kind: "summary", title: "احذر",
              spans: [{ text: "لا تثق بأي رابط أو رسالة قبل التأكد من المصدر. كثير من الهجمات تبدأ بخداع بسيط." }],
            },
          ],
        },
        {
          id: "791381s-m13-l01-p02",
          title: "الاتصالات الآمنة",
          order: 2,
          source: src(38, 39),
          blocks: [
            {
              id: "m13-l01-p02-def", type: "text", origin: "book",
              spans: [{ text: "هدفها حماية البيانات أثناء انتقالها: تستخدم التشفير حتى لا يقرأ الآخرون البيانات، وتتحقّق من هوية الطرف الآخر.", style: "strong" }],
            },
            {
              // ENRICHMENT: SVG of the definition's two parts (and of «الأمان يعني» in «الوقاية»): encryption + identity check.
              id: "m13-l01-p02-v-pillars", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m17/secure-two-pillars", motion: true,
              source: src(38, 39),
              title: "رسم توضيحي: ركنا الاتصال الآمن",
              alt: "المرسِل والمستقبِل وبينهما قناة مشفّرة عليها قفل، والبيانات تعبرها؛ وتحت المستقبِل علامة تحقّق من الهوية.",
              caption: "الأمان = حماية البيانات بالتشفير + التأكد من هوية الطرف الآخر.",
            },
            {
              id: "m13-l01-p02-intro", type: "text", origin: "book",
              spans: [{ text: "الفكرة الأساسية هي التشفير: نحوّل البيانات إلى رموز لا يفهمها إلا المستقبِل الصحيح." }],
            },
            {
              id: "m13-l01-p02-cards", type: "list", origin: "book", variant: "cards",
              items: [
                {
                  id: "m13-l01-p02-c1", term: "VPN",
                  text: [{ text: "ينشئ اتصالًا آمنًا عبر الإنترنت. يشفّر البيانات أثناء انتقالها. يخفي عنوان IP الحقيقي جزئيًا. مفيد للعمل عن بُعد وشبكات Wi-Fi العامة." }],
                },
                {
                  id: "m13-l01-p02-c2", term: "SSL/TLS و HTTPS",
                  text: [{ text: "SSL/TLS يشفّر الاتصال بين المتصفح والخادم. " }, { text: "HTTPS\u00A0=\u00A0HTTP\u00A0+", dir: "ltr" }, { text: " طبقة أمان. علامة القفل 🔒 في المتصفح تعني اتصالًا آمنًا. يمنع التجسّس والتلاعب بالبيانات." }],
                },
                {
                  id: "m13-l01-p02-c3", term: "SSH",
                  text: [{ text: "اتصال آمن لإدارة الأجهزة عن بُعد. يشفّر البيانات أثناء النقل. أكثر أمانًا من Telnet. يستخدم كلمة مرور أو مفاتيح تشفير." }],
                },
              ],
            },
            {
              // ENRICHMENT: SVG of the «SSL/TLS و HTTPS» card — browser ↔ server over an SSL/TLS-protected channel, and
              // the card's own idea HTTPS = HTTP + طبقة أمان.
              id: "m13-l01-p02-v-https", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m17/https-secure-channel", motion: true,
              source: src(38, 39),
              title: "رسم توضيحي: HTTPS = HTTP + طبقة أمان",
              alt: "المتصفّح والخادم وبينهما قناة محميّة مكتوب عليها SSL/TLS، والطلب يعبرها من المتصفّح إلى الخادم؛ وتحتها معادلة: HTTP + SSL/TLS = HTTPS.",
              caption: "SSL/TLS يشفّر الاتصال بين المتصفح والخادم، و HTTPS هو HTTP مع طبقة الأمان هذه.",
            },
            {
              id: "m13-l01-p02-prevention", type: "callout", origin: "book", kind: "summary", title: "الوقاية",
              spans: [
                { text: "التشفير (HTTPS و VPN) يجعل اعتراض البيانات أو اختطاف الجلسة " },
                { text: "أصعب بكثير", style: "strong" },
                { text: ". " },
                { text: "الأمان يعني:", style: "strong" },
                { text: " حماية البيانات + التأكد من هوية الطرف الآخر." },
              ],
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m13-l02",
      title: "تدريبات الوحدة",
      order: 2,
      pages: [
        {
          id: "791381s-m13-l02-p01",
          title: "تدريبات الوحدة: أمان الشبكات",
          order: 1,
          layout: "practice",
          source: src(37, 39),
          blocks: [
            {
              id: "m13-l02-p01-q01", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "matching", prompt: "صِل كل هجوم بفكرته الأساسية:",
                left: [{ id: "dos", text: "DoS حجب الخدمة" }, { id: "ddos", text: "DDoS حجب الخدمة الموزّع" }, { id: "hij", text: "Session Hijacking اختطاف الجلسة" }, { id: "mitm", text: "MitM الرجل في الوسط" }, { id: "phish", text: "Phishing التصيّد" }, { id: "spoof", text: "Spoofing التزييف" }],
                right: [
                  { id: "r1", text: "المهاجم يقف بين الطرفين، يقرأ البيانات وقد يغيّرها." },
                  { id: "r2", text: "تزييف عنوان IP أو بريد إلكتروني حتى يبدو وكأنه من جهة موثوقة." },
                  { id: "r3", text: "إغراق الخادم بطلبات كثيرة من مصدر واحد حتى يتوقّف أو يبطؤ." },
                  { id: "r4", text: "المهاجم يسيطر على جلسة اتصال مفتوحة بين المستخدم والخادم." },
                  { id: "r5", text: "خداع المستخدم بموقع أو رسالة تشبه جهة حقيقية للحصول على معلوماته." },
                  { id: "r6", text: "نفس فكرة إغراق الخادم، لكن من أجهزة كثيرة في نفس الوقت." },
                ],
                pairs: { dos: "r3", ddos: "r6", hij: "r4", mitm: "r1", phish: "r5", spoof: "r2" },
                feedback: { explanation: "DoS: إغراق الخادم من مصدر واحد. DDoS: نفس الفكرة من أجهزة كثيرة في نفس الوقت. Session Hijacking: السيطرة على جلسة مفتوحة. MitM: الوقوف بين الطرفين. Phishing: خداع المستخدم بموقع أو رسالة تشبه جهة حقيقية. Spoofing: تزييف عنوان IP أو بريد إلكتروني." },
              },
            },
            {
              id: "m13-l02-p01-q02", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "خادم توقّف بسبب طلبات كثيرة جاءت من آلاف الأجهزة في نفس الوقت. ما نوع الهجوم؟",
                options: [{ id: "a", text: "DoS" }, { id: "b", text: "DDoS", correct: true }, { id: "c", text: "Spoofing" }, { id: "d", text: "MitM" }],
                feedback: { explanation: "DDoS: آلاف الأجهزة ترسل معًا — الهجوم يأتي من أجهزة كثيرة في نفس الوقت. أما DoS فجهاز واحد يرسل طلبات كثيرة." },
              },
            },
            {
              id: "m13-l02-p01-q03", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "تصلك رسالة «حسابك في البنك سيُغلق! اضغط هنا وأدخل كلمة المرور»، والرابط لموقع مزيّف يشبه موقع البنك. ما اسم هذا الهجوم؟",
                options: [{ id: "a", text: "DoS حجب الخدمة" }, { id: "b", text: "Session Hijacking اختطاف الجلسة" }, { id: "c", text: "Phishing التصيّد", correct: true }],
                feedback: { explanation: "هذا هو مثال الكتيّب على Phishing: خداع المستخدم بموقع أو رسالة تشبه جهة حقيقية للحصول على معلوماته." },
              },
            },
            {
              id: "m13-l02-p01-q04", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "في هجوم DoS ترسل آلاف الأجهزة الطلبات معًا.", answer: false, feedback: { explanation: "في DoS جهاز واحد يرسل طلبات كثيرة. آلاف الأجهزة التي ترسل معًا هي DDoS." } },
            },
            {
              id: "m13-l02-p01-q05", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "«المهاجم يقف بين الطرفين، يقرأ البيانات وقد يغيّرها» — أيّ هجوم هذا؟",
                options: [{ id: "a", text: "Spoofing التزييف" }, { id: "b", text: "DoS حجب الخدمة" }, { id: "c", text: "Phishing التصيّد" }, { id: "d", text: "MitM الرجل في الوسط", correct: true }],
                feedback: { explanation: "MitM الرجل في الوسط: المهاجم يقف بين الطرفين، يقرأ البيانات وقد يغيّرها." },
              },
            },
            {
              id: "m13-l02-p01-q06", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "هجوم DDoS أصعب في الإيقاف لأنه يأتي من أجهزة كثيرة في نفس الوقت.", answer: true, feedback: { explanation: "DDoS: نفس فكرة DoS، لكن الهجوم يأتي من أجهزة كثيرة في نفس الوقت — وهو أصعب في الإيقاف." } },
            },
            {
              id: "m13-l02-p01-q07", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "matching", prompt: "صِل كل وسيلة اتصال آمن بوصفها:",
                left: [{ id: "vpn", text: "VPN" }, { id: "https", text: "SSL/TLS و HTTPS" }, { id: "ssh", text: "SSH" }],
                right: [{ id: "r1", text: "اتصال آمن لإدارة الأجهزة عن بُعد، أكثر أمانًا من Telnet." }, { id: "r2", text: "يشفّر الاتصال بين المتصفح والخادم، وعلامته القفل 🔒 في المتصفح." }, { id: "r3", text: "اتصال آمن عبر الإنترنت، مفيد للعمل عن بُعد وشبكات Wi-Fi العامة." }],
                pairs: { vpn: "r3", https: "r2", ssh: "r1" },
                feedback: { explanation: "VPN: اتصال آمن عبر الإنترنت، مفيد للعمل عن بُعد وشبكات Wi-Fi العامة. SSL/TLS: يشفّر الاتصال بين المتصفح والخادم، وعلامة القفل 🔒 تعني اتصالًا آمنًا. SSH: اتصال آمن لإدارة الأجهزة عن بُعد، أكثر أمانًا من Telnet." },
              },
            },
            {
              id: "m13-l02-p01-q08", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "طالب يستخدم شبكة Wi-Fi عامة ويريد أن تكون بياناته مشفّرة أثناء انتقالها عبر الإنترنت. ما الأداة الأنسب حسب البطاقات؟",
                options: [{ id: "a", text: "VPN", correct: true }, { id: "b", text: "Telnet" }, { id: "c", text: "لا شيء، شبكة Wi-Fi العامة آمنة دائمًا" }],
                feedback: { explanation: "VPN ينشئ اتصالًا آمنًا عبر الإنترنت ويشفّر البيانات أثناء انتقالها، وهو مفيد للعمل عن بُعد وشبكات Wi-Fi العامة." },
              },
            },
            {
              id: "m13-l02-p01-q09", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "wordBank", prompt: "أكمل الفراغات من مخزن الكلمات:",
                segments: ["الفكرة الأساسية هي ", { blank: "b1" }, ": نحوّل البيانات إلى رموز لا يفهمها إلا المستقبِل الصحيح. والأمان يعني: حماية ", { blank: "b2" }, " + التأكد من ", { blank: "b3" }, " الطرف الآخر."],
                bank: ["التشفير", "البيانات", "هوية", "السرعة", "عنوان"],
                answers: { b1: "التشفير", b2: "البيانات", b3: "هوية" },
                feedback: { explanation: "الفكرة الأساسية هي التشفير: نحوّل البيانات إلى رموز لا يفهمها إلا المستقبِل الصحيح. الأمان يعني: حماية البيانات + التأكد من هوية الطرف الآخر." },
              },
            },
            {
              id: "m13-l02-p01-q10", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "حسب بطاقة «SSL/TLS و HTTPS»، ما هو HTTPS؟",
                options: [{ id: "a", text: "HTTP بدون أي تشفير" }, { id: "b", text: "HTTP + طبقة أمان", correct: true }, { id: "c", text: "اسم آخر لـ SSH" }, { id: "d", text: "هجوم يزيّف عنوان الموقع" }],
                feedback: { explanation: "HTTPS = HTTP + طبقة أمان. SSL/TLS يشفّر الاتصال بين المتصفح والخادم، ويمنع التجسّس والتلاعب بالبيانات." },
              },
            },
            {
              id: "m13-l02-p01-q11", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "SSH أقل أمانًا من Telnet.", answer: false, feedback: { explanation: "SSH اتصال آمن لإدارة الأجهزة عن بُعد، يشفّر البيانات أثناء النقل، وهو أكثر أمانًا من Telnet." } },
            },
            {
              id: "m13-l02-p01-q12", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "classify", prompt: "صنّف كل اسم: هل هو هجوم على الشبكة، أم وسيلة اتصال آمن؟",
                groups: [{ id: "attack", text: "هجوم على الشبكة" }, { id: "secure", text: "وسيلة اتصال آمن" }],
                items: [
                  { id: "i1", text: "DoS" },
                  { id: "i2", text: "VPN" },
                  { id: "i3", text: "Phishing" },
                  { id: "i4", text: "SSH" },
                  { id: "i5", text: "Spoofing" },
                  { id: "i6", text: "HTTPS" },
                ],
                assign: { i1: "attack", i2: "secure", i3: "attack", i4: "secure", i5: "attack", i6: "secure" },
                feedback: { explanation: "الهجمات: DoS و DDoS و Session Hijacking و MitM و Phishing و Spoofing. الاتصالات الآمنة: VPN و SSL/TLS و HTTPS و SSH — كلها تستخدم التشفير لحماية البيانات أثناء انتقالها." },
              },
            },
          ],
        },
      ],
    },
  ],
};

export default m13;
