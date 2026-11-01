// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 3 «عناوين IP».
//
// Verbatim conversion of booklet PDF pages 11–14 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every converted block is origin:"book": nothing is added, removed or reworded; bold runs are `strong`, monospace
// runs are `code`, printed box labels are the callout titles.
//
// Enrichment (docs/enterprise-791381s-enrichment-plan.md, Phases 2–4): teacher-enrichment blocks (visuals / activities reused from
// course 791381 after checking their labels against this section, and the end-of-unit «تدريبات الوحدة» lesson) are ADDED after the
// book blocks they explain. The book blocks above stay verbatim — pinned by the book lock (bookLock.test.ts).

import type { ContentModule, ContentSource } from "../../types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };

const m03: ContentModule = {
  id: "791381s-m03",
  title: "عناوين IP",
  order: 3,
  lessons: [
    {
      id: "791381s-m03-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m03-l00-p01",
          title: "عناوين IP",
          order: 1,
          layout: "opener",
          source: src(11),
          blocks: [
            {
              id: "m03-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الدفعة الأولى · الوحدة الثالثة · كتاب ص 24–33", unitNumber: "03", title: "عناوين IP",
              subtitle: "ما هو عنوان IP؟ متى يكون صالحًا؟ ما الفرق بين الخاص والعام؟",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m03-l01",
      title: "عناوين IP",
      order: 1,
      pages: [
        {
          id: "791381s-m03-l01-p01",
          title: "ما هو عنوان IP؟",
          order: 1,
          source: src(11),
          blocks: [
            {
              id: "m03-l01-p01-def", type: "text", origin: "book",
              spans: [{ text: "عنوان IP = رقم خاص لكل جهاز على الشبكة. يشبه عنوان البيت: بدون عنوان لا تصل الرسالة إلى المكان الصحيح.", style: "strong" }],
            },
            {
              id: "m03-l01-p01-role", type: "text", origin: "book",
              spans: [
                { text: "وظيفته:", style: "strong" },
                { text: " يحدّد مكان الجهاز على الشبكة، ويساعد في إرسال البيانات واستقبالها. " },
                { text: "كل جهاز يحتاج عنوانًا", style: "strong" },
                { text: " ليتواصل مع باقي الأجهزة." },
              ],
            },
            {
              id: "m03-l01-p01-v-identity", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m07/ip-identity", motion: true,
              source: src(11),
              title: "رسم توضيحي: عنوان لكل جهاز",
              alt: "رسم يبيّن شبكة متصلة بثلاثة أجهزة، يحمل كل منها عنوان IP مختلفًا (192.168.1.5 و 192.168.1.6 و 192.168.1.7)، ورسالة تصل إلى الجهاز صاحب العنوان 192.168.1.5.",
              caption: "كل جهاز يحتاج عنوانًا ليتواصل مع باقي الأجهزة: بدون عنوان لا تصل الرسالة إلى المكان الصحيح.",
            },
          ],
        },
        {
          id: "791381s-m03-l01-p02",
          title: "IPv4 و IPv6",
          order: 2,
          source: src(11),
          blocks: [
            {
              id: "m03-l01-p02-intro", type: "text", origin: "book",
              spans: [{ text: "عدد الأجهزة في العالم أصبح كبيرًا جدًا، وعناوين IPv4 لم تعد تكفي للجميع، لذلك ظهر IPv6 الذي فيه عدد عناوين أكبر بكثير." }],
            },
            {
              id: "m03-l01-p02-table", type: "table", origin: "book",
              headers: ["النوع", "الوصف", "مثال"],
              rows: [
                ["IPv4", "الأقدم والأكثر استعمالًا. يتكوّن من أرقام فقط.", "192.168.1.5"],
                ["IPv6", "الأحدث. يحتوي أرقامًا وحروفًا معًا.", "2001:db8::1"],
              ],
              columnDirs: ["rtl", "rtl", "ltr"],
            },
            {
              id: "m03-l01-p02-focus", type: "text", origin: "book",
              spans: [
                { text: "في هذه الأوراق نركّز على " },
                { text: "IPv4", style: "strong" },
                { text: " لأنه الأساس في التمارين والامتحانات." },
              ],
            },
          ],
        },
        {
          id: "791381s-m03-l01-p03",
          title: "مبنى عنوان IPv4",
          order: 3,
          source: src(11, 12),
          blocks: [
            {
              id: "m03-l01-p03-def", type: "text", origin: "book",
              spans: [{ text: "يتكوّن من 4 أقسام (اسم كل قسم: Octet)، بينها نقاط. كل قسم رقم من 0 إلى 255.", style: "strong" }],
            },
            {
              id: "m03-l01-p03-dots", type: "text", origin: "book",
              spans: [{ text: "النقاط تفصل بين الأقسام. لا يوجد قسم أكبر من 255، لأن كل قسم مكتوب بـ 8 بتات، وأكبر عدد في 8 صناديق هو 255." }],
            },
            {
              id: "m03-l01-p03-octets", type: "text", origin: "book",
              spans: [
                { text: "0–255", style: "code" },
                { text: " . " },
                { text: "0–255", style: "code" },
                { text: " . " },
                { text: "0–255", style: "code" },
                { text: " . " },
                { text: "0–255", style: "code" },
              ],
            },
            {
              id: "m03-l01-p03-examples", type: "text", origin: "book",
              spans: [
                { text: "كل قسم = 8 بتات (8 صناديق) ← لذلك أكبر رقم في القسم هو 255. أمثلة: " },
                { text: "192.168.100.10", style: "code" },
                { text: " · " },
                { text: "100.200.10.20", style: "code" },
              ],
            },
            {
              id: "m03-l01-p03-octets-activity", type: "interactive-diagram", origin: "teacher-enrichment",
              interactionType: "ipv4-octets", version: 1,
              title: "الأقسام الأربعة لعنوان IPv4",
              description: "اختر قسمًا من الأقسام الأربعة في المثال 192.168.100.10 لترى أنه قسم واحد من أربعة، وأن كل قسم رقم من 0 إلى 255.",
              source: src(11, 12),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "يتكوّن عنوان IPv4 من 4 أقسام (اسم كل قسم: Octet) بينها نقاط، وكل قسم رقم من 0 إلى 255 — مثل 192.168.100.10." },
              config: {
                address: "192.168.100.10",
                rangeText: "كل قسم رقم من 0 إلى 255.",
                caption: "اختر قسمًا من الأقسام الأربعة.",
                note: "4 أقسام (اسم كل قسم: Octet)، بينها نقاط.",
              },
            },
          ],
        },
        {
          id: "791381s-m03-l01-p04",
          title: "متى يكون عنوان IP غير صالح للحاسوب؟",
          order: 4,
          source: src(12, 13),
          blocks: [
            {
              id: "m03-l01-p04-intro", type: "text", origin: "book",
              spans: [{ text: "ليس كل عنوان مكتوب بشكل صحيح يمكن إعطاؤه لحاسوب. بعض العناوين محجوزة لاستعمالات خاصة، فلا نعطيها للأجهزة." }],
            },
            {
              id: "m03-l01-p04-rules", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m03-l01-p04-r1", text: [{ text: "✗ إذا " }, { text: "بدأ", style: "strong" }, { text: " بـ 0 أو 255." }] },
                { id: "m03-l01-p04-r2", text: [{ text: "✗ إذا " }, { text: "انتهى", style: "strong" }, { text: " بـ 0 أو 255." }] },
                { id: "m03-l01-p04-r3", text: [{ text: "✗ إذا كان أي قسم " }, { text: "أكبر من 255", style: "strong" }, { text: "." }] },
                { id: "m03-l01-p04-r4", text: [{ text: "✗ إذا بدأ بـ " }, { text: "127", style: "strong" }, { text: " (محجوز لـ Localhost)." }] },
                { id: "m03-l01-p04-r5", text: [{ text: "✗ إذا بدأ بـ " }, { text: "169.254", style: "strong" }, { text: " (محجوز لـ APIPA)." }] },
              ],
            },
            {
              id: "m03-l01-p04-warning", type: "callout", origin: "book", kind: "warning", title: "انتبه!",
              spans: [
                { text: "الرقم 255 ممنوع فقط في " },
                { text: "القسم الأول والأخير", style: "strong" },
                { text: ". إذا جاء في الوسط فالعنوان صالح، مثل " },
                { text: "192.255.10.10", style: "code" },
                { text: ". وكذلك 169 وحده مسموح، الممنوع هو " },
                { text: "169.254", style: "code" },
                { text: " فقط." },
              ],
            },
            { id: "m03-l01-p04-solved-label", type: "heading", origin: "book", level: 4, text: "أمثلة محلولة" },
            {
              id: "m03-l01-p04-solved-table", type: "table", origin: "book",
              headers: ["العنوان", "الحكم", "السبب"],
              rows: [
                ["192.168.10.1", "صالح ✓", "يحقّق كل القواعد."],
                ["192.255.10.10", "صالح ✓", "255 في الوسط مسموح."],
                ["192.168.10.255", "غير صالح ✗", "ينتهي بـ 255 (هذا عنوان البث Broadcast)."],
                ["192.168.300.10", "غير صالح ✗", "القسم 300 أكبر من 255."],
                ["127.11.10.1", "غير صالح ✗", "يبدأ بـ 127."],
                ["169.254.10.234", "غير صالح ✗", "يبدأ بـ 169.254 (APIPA)."],
              ],
              columnDirs: ["ltr", "rtl", "rtl"],
            },
          ],
        },
        {
          id: "791381s-m03-l01-p05",
          title: "عنوان عام وعنوان خاص",
          order: 5,
          source: src(13),
          blocks: [
            {
              id: "m03-l01-p05-intro", type: "text", origin: "book",
              spans: [{ text: "العنوان الخاص مثل رقم الغرفة داخل المدرسة: يعرفه من في المدرسة فقط. والعنوان العام مثل عنوان المدرسة في المدينة: يعرفه الجميع." }],
            },
            {
              id: "m03-l01-p05-cards", type: "list", origin: "book", variant: "cards",
              items: [
                {
                  id: "m03-l01-p05-c1", term: "عنوان عام (Public IP)",
                  text: [
                    { text: "يمكن الوصول إليه من الإنترنت. يُستخدم للمواقع والخوادم. " },
                    { text: "مثال:", style: "strong" },
                    { text: " " },
                    { text: "8.8.8.8", style: "code" },
                  ],
                },
                {
                  id: "m03-l01-p05-c2", term: "عنوان خاص (Private IP)",
                  text: [
                    { text: "يُستخدم داخل شبكة محلية فقط، مثل البيت أو المدرسة. " },
                    { text: "مثال:", style: "strong" },
                    { text: " " },
                    { text: "192.168.1.5", style: "code" },
                  ],
                },
              ],
            },
            {
              id: "m03-l01-p05-important", type: "text", origin: "book",
              spans: [{ text: "مهم:", style: "strong" }, { text: " العنوان الخاص لا يُستخدم مباشرة على الإنترنت، بل داخل الشبكة المحلية فقط." }],
            },
            {
              id: "m03-l01-p05-v-private-public", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m07/private-public", motion: true,
              source: src(13),
              title: "رسم توضيحي: خاص وعام",
              alt: "رسم يبيّن ثلاثة أجهزة بعناوين خاصة (192.168.1.5 و 192.168.1.6 و 192.168.1.20) داخل إطار «شبكة محلية — خاصة»، متصلة عبر راوتر بسحابة «إنترنت» عليها العنوان العام 8.8.8.8.",
              caption: "العنوان الخاص (مثل 192.168.1.5) يُستخدم داخل الشبكة المحلية فقط، والعنوان العام (مثل 8.8.8.8) يمكن الوصول إليه من الإنترنت.",
            },
            { id: "m03-l01-p05-ranges-heading", type: "heading", origin: "book", level: 3, text: "مجالات العناوين الخاصة (احفظها)" },
            {
              id: "m03-l01-p05-ranges", type: "table", origin: "book",
              headers: ["الفئة", "العنوان الخاص يبدأ بـ", "مثال"],
              rows: [
                ["Class A", "10.x.x.x", "10.0.0.1"],
                ["Class B", "172.16 ← 172.31 ← حتى", "172.23.100.13"],
                ["Class C", "192.168.x.x", "192.168.100.6"],
              ],
              columnDirs: ["rtl", "ltr", "ltr"],
            },
            { id: "m03-l01-p05-remember-label", type: "heading", origin: "book", level: 4, text: "تذكّر" },
            {
              id: "m03-l01-p05-remember-1", type: "text", origin: "book",
              spans: [
                { text: "إذا رأيت " },
                { text: "10", style: "strong" },
                { text: " أو " },
                { text: "192.168", style: "strong" },
                { text: " في البداية فغالبًا أنت أمام عنوان خاص. مع " },
                { text: "172", style: "strong" },
                { text: " انتبه: القسم الثاني يجب أن يكون بين " },
                { text: "16 و 31", style: "strong" },
                { text: " فقط." },
              ],
            },
            {
              id: "m03-l01-p05-remember-2", type: "text", origin: "book",
              spans: [
                { text: "لا تنخدع:", style: "strong" },
                { text: " " },
                { text: "192.167.100.2", style: "code" },
                { text: " عنوان " },
                { text: "عام", style: "strong" },
                { text: " (لأنه ليس 192.168). و " },
                { text: "172.32.1.1", style: "code" },
                { text: " عام (لأن 32 أكبر من 31)." },
              ],
            },
          ],
        },
        {
          id: "791381s-m03-l01-p06",
          title: "عنوان ثابت وعنوان متغيّر",
          order: 6,
          source: src(14),
          blocks: [
            {
              id: "m03-l01-p06-intro", type: "text", origin: "book",
              spans: [{ text: "بعض الأجهزة يجب أن نجدها دائمًا على نفس العنوان، مثل الطابعة التي يطبع عليها الجميع، لذلك نعطيها عنوانًا ثابتًا." }],
            },
            {
              id: "m03-l01-p06-table", type: "table", origin: "book",
              headers: ["النوع", "معناه", "مناسب لـ"],
              rows: [
                ["Static IP ثابت", "لا يتغيّر إلا إذا غيّرناه يدويًا.", "الطابعات، الكاميرات، الخوادم"],
                ["Dynamic IP متغيّر", "يتغيّر من وقت لآخر، وقد يتغيّر عند إعادة تشغيل المودم.", "البيوت والشركات الصغيرة"],
              ],
            },
            {
              id: "m03-l01-p06-memo", type: "text", origin: "book",
              spans: [{ text: "Static = ثابت · Dynamic = متغيّر", style: "strong" }],
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m03-l02",
      title: "تدريبات الوحدة",
      order: 2,
      pages: [
        {
          id: "791381s-m03-l02-p01",
          title: "تدريبات الوحدة: عناوين IP",
          order: 1,
          layout: "practice",
          source: src(11, 14),
          blocks: [
            {
              id: "m03-l02-p01-q01", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ما هو عنوان IP؟",
                options: [{ id: "a", text: "برنامج نتصفّح به المواقع." }, { id: "b", text: "رقم خاص لكل جهاز على الشبكة.", correct: true }, { id: "c", text: "كابل يربط الحاسوب بالشبكة." }, { id: "d", text: "كلمة مرور الشبكة." }],
                feedback: { explanation: "عنوان IP = رقم خاص لكل جهاز على الشبكة. يشبه عنوان البيت: بدون عنوان لا تصل الرسالة إلى المكان الصحيح." },
              },
            },
            {
              id: "m03-l02-p01-q02", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "لماذا ظهر IPv6؟",
                options: [{ id: "a", text: "لأن IPv4 يحتوي أرقامًا وحروفًا معًا." }, { id: "b", text: "لأن IPv4 هو الأحدث." }, { id: "c", text: "لأن عدد الأجهزة في العالم أصبح كبيرًا جدًا، وعناوين IPv4 لم تعد تكفي للجميع.", correct: true }],
                feedback: { explanation: "عدد الأجهزة في العالم أصبح كبيرًا جدًا، وعناوين IPv4 لم تعد تكفي للجميع، لذلك ظهر IPv6 الذي فيه عدد عناوين أكبر بكثير." },
              },
            },
            {
              id: "m03-l02-p01-q03", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "لماذا لا يوجد قسم في عنوان IPv4 أكبر من 255؟",
                options: [{ id: "a", text: "لأن النقاط تمنع ذلك." }, { id: "b", text: "لأن العنوان فيه 4 أقسام فقط." }, { id: "c", text: "لأن 255 محجوز لـ Localhost." }, { id: "d", text: "لأن كل قسم مكتوب بـ 8 بتات، وأكبر عدد في 8 صناديق هو 255.", correct: true }],
                feedback: { explanation: "لا يوجد قسم أكبر من 255، لأن كل قسم مكتوب بـ 8 بتات، وأكبر عدد في 8 صناديق هو 255." },
              },
            },
            {
              id: "m03-l02-p01-q04", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "أيّ عنوان من التالية صالح للحاسوب؟",
                options: [{ id: "a", text: "192.168.10.255" }, { id: "b", text: "127.11.10.1" }, { id: "c", text: "192.255.10.10", correct: true }, { id: "d", text: "169.254.10.234" }],
                feedback: { explanation: "192.255.10.10 صالح: الرقم 255 ممنوع فقط في القسم الأول والأخير، وفي الوسط مسموح. أما 192.168.10.255 فينتهي بـ 255، و 127.11.10.1 يبدأ بـ 127، و 169.254.10.234 يبدأ بـ 169.254 (APIPA)." },
              },
            },
            {
              id: "m03-l02-p01-q05", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "عنوان يبدأ بـ 172: متى يكون عنوانًا خاصًا؟",
                options: [{ id: "a", text: "عندما يكون القسم الثاني بين 16 و 31 فقط.", correct: true }, { id: "b", text: "عندما يكون القسم الثاني أكبر من 31." }, { id: "c", text: "دائمًا، مهما كان القسم الثاني." }, { id: "d", text: "عندما ينتهي بـ 255." }],
                feedback: { explanation: "مع 172 انتبه: القسم الثاني يجب أن يكون بين 16 و 31 فقط. لذلك 172.32.1.1 عام (لأن 32 أكبر من 31)." },
              },
            },
            {
              id: "m03-l02-p01-q06", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "العنوان 192.255.10.10 غير صالح لأن فيه الرقم 255.", answer: false, feedback: { explanation: "الرقم 255 ممنوع فقط في القسم الأول والأخير. إذا جاء في الوسط فالعنوان صالح، مثل 192.255.10.10." } },
            },
            {
              id: "m03-l02-p01-q07", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "العنوان الخاص يُستخدم مباشرة على الإنترنت.", answer: false, feedback: { explanation: "العنوان الخاص لا يُستخدم مباشرة على الإنترنت، بل داخل الشبكة المحلية فقط." } },
            },
            {
              id: "m03-l02-p01-q08", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "العنوان الثابت (Static IP) لا يتغيّر إلا إذا غيّرناه يدويًا.", answer: true, feedback: { explanation: "Static IP ثابت: لا يتغيّر إلا إذا غيّرناه يدويًا. أما Dynamic IP فيتغيّر من وقت لآخر، وقد يتغيّر عند إعادة تشغيل المودم." } },
            },
            {
              id: "m03-l02-p01-q09", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "wordBank", prompt: "أكمل الفراغات من مخزن الكلمات:",
                segments: ["يتكوّن عنوان IPv4 من ", { blank: "b1" }, " أقسام (اسم كل قسم: ", { blank: "b2" }, ")، بينها ", { blank: "b3" }, ". كل قسم رقم من 0 إلى ", { blank: "b4" }, "."],
                bank: ["255", "نقاط", "8", "Octet", "4", "حروف"],
                answers: { b1: "4", b2: "Octet", b3: "نقاط", b4: "255" },
                feedback: { explanation: "يتكوّن من 4 أقسام (اسم كل قسم: Octet)، بينها نقاط. كل قسم رقم من 0 إلى 255." },
              },
            },
            {
              id: "m03-l02-p01-q10", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "matching", prompt: "صِل كل عنوان غير صالح بسبب رفضه:",
                left: [{ id: "a1", text: "192.168.10.255" }, { id: "a2", text: "192.168.300.10" }, { id: "a3", text: "127.11.10.1" }, { id: "a4", text: "169.254.10.234" }],
                right: [{ id: "r1", text: "يبدأ بـ 127 (محجوز لـ Localhost)" }, { id: "r2", text: "يبدأ بـ 169.254 (APIPA)" }, { id: "r3", text: "ينتهي بـ 255 (عنوان البث Broadcast)" }, { id: "r4", text: "القسم 300 أكبر من 255" }],
                pairs: { a1: "r3", a2: "r4", a3: "r1", a4: "r2" },
                feedback: { explanation: "192.168.10.255 ينتهي بـ 255 (عنوان البث). 192.168.300.10: القسم 300 أكبر من 255. 127.11.10.1 يبدأ بـ 127 (Localhost). 169.254.10.234 يبدأ بـ 169.254 (APIPA)." },
              },
            },
            {
              id: "m03-l02-p01-q11", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "classify", prompt: "صنّف كل عنوان: خاص أم عام؟",
                groups: [{ id: "private", text: "عنوان خاص (Private IP)" }, { id: "public", text: "عنوان عام (Public IP)" }],
                items: [
                  { id: "i1", text: "10.0.0.1" },
                  { id: "i2", text: "8.8.8.8" },
                  { id: "i3", text: "172.23.100.13" },
                  { id: "i4", text: "192.167.100.2" },
                  { id: "i5", text: "192.168.100.6" },
                  { id: "i6", text: "172.32.1.1" },
                ],
                assign: { i1: "private", i2: "public", i3: "private", i4: "public", i5: "private", i6: "public" },
                feedback: { explanation: "الخاص يبدأ بـ 10، أو 172.16 حتى 172.31، أو 192.168. لذلك 192.167.100.2 عام (لأنه ليس 192.168)، و 172.32.1.1 عام (لأن 32 أكبر من 31)، و 8.8.8.8 مثال العنوان العام." },
              },
            },
            {
              id: "m03-l02-p01-q12", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "classify", prompt: "صنّف حسب الجدول: لأيّ نوع عنوان يناسب كلٌّ منها؟",
                groups: [{ id: "static", text: "Static IP ثابت" }, { id: "dynamic", text: "Dynamic IP متغيّر" }],
                items: [
                  { id: "i1", text: "الطابعات" },
                  { id: "i2", text: "البيوت" },
                  { id: "i3", text: "الخوادم" },
                  { id: "i4", text: "الشركات الصغيرة" },
                  { id: "i5", text: "الكاميرات" },
                ],
                assign: { i1: "static", i2: "dynamic", i3: "static", i4: "dynamic", i5: "static" },
                feedback: { explanation: "Static IP ثابت مناسب لـ الطابعات، الكاميرات، الخوادم. Dynamic IP متغيّر مناسب لـ البيوت والشركات الصغيرة." },
              },
            },
            // Phase 8C-3 — an advanced exam item (private store api/src/data/learning-exam-items/791381s.json; the official grader judges it).
            { id: "m03-l02-p01-x-adv-ip", type: "exam-item", origin: "teacher-enrichment", itemId: "m03-adv-ip", label: "تدريب متقدّم: صلاحية العناوين والعناوين الخاصة" },
            { id: "m03-l02-p01-lib-t03", type: "library-training", origin: "teacher-enrichment", trainingId: "T03", label: "تدريب 3", requiredModuleId: "791381s-m03" },
            { id: "m03-l02-p01-lib-t04", type: "library-training", origin: "teacher-enrichment", trainingId: "T04", label: "تدريب 4", requiredModuleId: "791381s-m03" },
          ],
        },
      ],
    },
  ],
};

export default m03;
