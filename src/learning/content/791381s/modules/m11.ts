// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 11 «أوامر فحص الشبكة».
//
// Verbatim conversion of booklet PDF pages 32–34 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every converted block is origin:"book": nothing is added, removed or reworded.
//
// Enrichment (docs/enterprise-791381s-enrichment-plan.md, Phase 5): teacher-enrichment blocks (visuals / activities reused from
// course 791381 after checking their labels against this section, and the end-of-unit «تدريبات الوحدة» lesson) are ADDED after the
// book blocks they explain. The book blocks stay verbatim — pinned by the book lock (bookLock.test.ts).

import type { ContentModule, ContentSource } from "../../types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };

const m11: ContentModule = {
  id: "791381s-m11",
  title: "أوامر فحص الشبكة",
  order: 11,
  lessons: [
    {
      id: "791381s-m11-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m11-l00-p01",
          title: "أوامر فحص الشبكة",
          order: 1,
          layout: "opener",
          source: src(32),
          blocks: [
            {
              id: "m11-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الدفعة الثالثة · كتاب ص 93–97", unitNumber: "11", title: "أوامر فحص الشبكة",
              subtitle: "أوامر نكتبها في موجّه الأوامر لفحص الشبكة ومعرفة مكان الخلل.",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m11-l01",
      title: "أوامر فحص الشبكة",
      order: 1,
      pages: [
        {
          id: "791381s-m11-l01-p01",
          title: "الأمر ping",
          order: 1,
          source: src(32, 33),
          blocks: [
            {
              id: "m11-l01-p01-def", type: "text", origin: "book",
              spans: [{ text: "أوامر الشبكة تساعدنا في فحص الشبكة، ومعرفة الخلل، وتحديد مكانه. احفظ وظيفة الأمر أكثر من حفظ النص الطويل الذي يظهر.", style: "strong" }],
            },
            {
              id: "m11-l01-p01-eg", type: "text", origin: "book",
              spans: [{ text: "مثلًا: إذا لم يفتح الإنترنت، نكتب ping 8.8.8.8 — إذا وصل الرد فالاتصال بالإنترنت يعمل." }],
            },
            { id: "m11-l01-p01-cmd", type: "code", origin: "book", language: "cli", dir: "ltr", code: "C:\\> ping google.com" },
            {
              id: "m11-l01-p01-func", type: "text", origin: "book",
              spans: [
                { text: "الوظيفة:", style: "strong" },
                { text: " يفحص هل يوجد اتصال بين جهازك وجهاز آخر أو موقع، ويعرض أيضًا " },
                { text: "زمن الوصول", style: "strong" },
                { text: "." },
              ],
            },
            {
              id: "m11-l01-p01-mistake", type: "callout", origin: "book", kind: "summary", title: "خطأ شائع",
              spans: [
                { text: "نجاح " },
                { text: "ping", style: "code" },
                { text: " لا يعني أن كل الخدمات تعمل. يعني فقط أن الجهازين متصلان على مستوى الشبكة." },
              ],
            },
          ],
        },
        {
          id: "791381s-m11-l01-p02",
          title: "الأمر ipconfig",
          order: 2,
          source: src(33),
          blocks: [
            {
              id: "m11-l01-p02-intro", type: "text", origin: "book",
              spans: [{ text: "نستعمله أول شيء عند وجود مشكلة، لنرى هل حصل الجهاز على عنوان IP صحيح." }],
            },
            { id: "m11-l01-p02-cmd", type: "code", origin: "book", language: "cli", dir: "ltr", code: "C:\\> ipconfig /all" },
            {
              id: "m11-l01-p02-func", type: "text", origin: "book",
              spans: [
                { text: "الوظيفة:", style: "strong" },
                { text: " يعرض إعدادات الشبكة في جهازك: " },
                { text: "عنوان IP", style: "strong" },
                { text: "، " },
                { text: "قناع الشبكة", style: "strong" },
                { text: "، " },
                { text: "البوابة الافتراضية", style: "strong" },
                { text: "، و " },
                { text: "عنوان MAC", style: "strong" },
                { text: "." },
              ],
            },
          ],
        },
        {
          id: "791381s-m11-l01-p03",
          title: "الأمر tracert",
          order: 3,
          source: src(33),
          blocks: [
            {
              id: "m11-l01-p03-intro", type: "text", origin: "book",
              spans: [{ text: "يفيدنا لنعرف في أي مكان على الطريق تتوقّف الرسالة أو تتأخّر." }],
            },
            { id: "m11-l01-p03-cmd", type: "code", origin: "book", language: "cli", dir: "ltr", code: "C:\\> tracert google.com" },
            {
              id: "m11-l01-p03-func", type: "text", origin: "book",
              spans: [
                { text: "الوظيفة:", style: "strong" },
                { text: " يعرض الطريق الذي تسلكه الرسالة حتى تصل إلى الموقع، " },
                { text: "خطوة بعد خطوة", style: "strong" },
                { text: " (راوتر بعد راوتر)." },
              ],
            },
            {
              // ENRICHMENT: SVG — «خطوة بعد خطوة (راوتر بعد راوتر)»: the packet advances one router at a time to the site.
              id: "m11-l01-p03-v-tracert", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m15/tracert-hops", motion: true,
              source: src(33),
              title: "رسم توضيحي: tracert يعرض الطريق خطوة بعد خطوة",
              alt: "رسم فيه «جهازك» على اليسار و«الوجهة» على اليمين، وبينهما ثلاث محطات مرقّمة 1 و 2 و 3 (راوتر بعد راوتر)، ورزمة تتقدّم من محطة إلى التي بعدها حتى تصل إلى الوجهة.",
              caption: "tracert يعرض الطريق الذي تسلكه الرسالة حتى تصل إلى الموقع، راوترًا بعد راوتر.",
            },
          ],
        },
        {
          id: "791381s-m11-l01-p04",
          title: "الأمر nslookup",
          order: 4,
          source: src(33),
          blocks: [
            {
              id: "m11-l01-p04-intro", type: "text", origin: "book",
              spans: [{ text: "إذا فتح الموقع بالعنوان الرقمي ولم يفتح بالاسم، فغالبًا المشكلة في DNS." }],
            },
            { id: "m11-l01-p04-cmd", type: "code", origin: "book", language: "cli", dir: "ltr", code: "C:\\> nslookup google.com" },
            {
              id: "m11-l01-p04-func", type: "text", origin: "book",
              spans: [
                { text: "الوظيفة:", style: "strong" },
                { text: " يفحص خدمة " },
                { text: "DNS", style: "strong" },
                { text: "، ويعرض عنوان IP المرتبط باسم الموقع." },
              ],
            },
          ],
        },
        {
          id: "791381s-m11-l01-p05",
          title: "الأمر arp",
          order: 5,
          source: src(34),
          blocks: [
            {
              id: "m11-l01-p05-intro", type: "text", origin: "book",
              spans: [{ text: "يفيدنا لنعرف أي جهاز (MAC) موجود خلف كل عنوان IP في شبكتنا." }],
            },
            { id: "m11-l01-p05-cmd", type: "code", origin: "book", language: "cli", dir: "ltr", code: "C:\\> arp -a" },
            {
              id: "m11-l01-p05-func", type: "text", origin: "book",
              spans: [
                { text: "الوظيفة:", style: "strong" },
                { text: " يعرض جدولًا فيه عناوين IP وعناوين MAC التي عرفها الجهاز مؤخرًا." },
              ],
            },
            { id: "m11-l01-p05-quick-h", type: "heading", origin: "book", level: 3, text: "جدول سريع: ماذا أريد أن أعرف؟" },
            {
              id: "m11-l01-p05-quick", type: "table", origin: "book",
              headers: ["أريد أن أعرف...", "الأمر"],
              rows: [
                ["هل يوجد اتصال مع جهاز أو موقع؟", "ping"],
                ["ما هو عنوان IP والقناع والبوابة و MAC في جهازي؟", "ipconfig /all"],
                ["ما الطريق الذي تمرّ به الرسالة حتى الموقع؟", "tracert"],
                ["ما عنوان IP لموقع معيّن؟ هل DNS يعمل؟", "nslookup"],
                ["ما عناوين MAC التي يعرفها جهازي؟", "arp -a"],
              ],
              columnDirs: ["rtl", "ltr"],
            },
          ],
        },
      ],
    },
    {
      // «تدريبات الوحدة» — ADDED enrichment: an end-of-unit exercise page after the booklet's own pages. Every question is
      // answered by the section's printed text above (the explanation quotes it). The book pages are unchanged (book lock).
      id: "791381s-m11-l02",
      title: "تدريبات الوحدة",
      order: 2,
      pages: [
        {
          id: "791381s-m11-l02-p01",
          title: "تدريبات الوحدة: أوامر فحص الشبكة",
          order: 1,
          layout: "practice",
          source: src(32, 34),
          blocks: [
            {
              id: "m11-l02-p01-q01", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "إذا نجح الأمر ping إلى موقع، فهذا يعني أن كل خدمات الموقع تعمل.", answer: false, feedback: { explanation: "خطأ شائع: نجاح ping لا يعني أن كل الخدمات تعمل. يعني فقط أن الجهازين متصلان على مستوى الشبكة." } },
            },
            {
              id: "m11-l02-p01-q02", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "إضافة إلى فحص وجود اتصال بين جهازك وجهاز آخر أو موقع، ماذا يعرض الأمر ping أيضًا؟",
                options: [{ id: "a", text: "عنوان MAC لجهازك" }, { id: "b", text: "زمن الوصول", correct: true }, { id: "c", text: "الطريق راوترًا بعد راوتر" }, { id: "d", text: "جدول عناوين IP و MAC" }],
                feedback: { explanation: "ping يفحص هل يوجد اتصال بين جهازك وجهاز آخر أو موقع، ويعرض أيضًا زمن الوصول." },
              },
            },
            {
              id: "m11-l02-p01-q03", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "أيّ أمر نستعمله أول شيء عند وجود مشكلة، لنرى هل حصل الجهاز على عنوان IP صحيح؟",
                options: [{ id: "a", text: "tracert google.com" }, { id: "b", text: "nslookup google.com" }, { id: "c", text: "ipconfig /all", correct: true }, { id: "d", text: "arp -a" }],
                feedback: { explanation: "الأمر ipconfig نستعمله أول شيء عند وجود مشكلة، لنرى هل حصل الجهاز على عنوان IP صحيح؛ والأمر في الصفحة هو ipconfig /all." },
              },
            },
            {
              id: "m11-l02-p01-q04", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "الموقع يفتح عندما تكتب عنوانه الرقمي، ولا يفتح عندما تكتب اسمه. أين المشكلة غالبًا؟",
                options: [{ id: "a", text: "في DNS", correct: true }, { id: "b", text: "في الكابل: الجهاز غير متصل بالشبكة" }, { id: "c", text: "في ARP" }],
                feedback: { explanation: "إذا فتح الموقع بالعنوان الرقمي ولم يفتح بالاسم، فغالبًا المشكلة في DNS — ونفحص خدمة DNS بالأمر nslookup." },
              },
            },
            {
              id: "m11-l02-p01-q05", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "تريد أن تعرف في أي مكان على الطريق تتوقّف الرسالة أو تتأخّر. أيّ أمر تستعمل؟",
                options: [{ id: "a", text: "ping" }, { id: "b", text: "arp -a" }, { id: "c", text: "nslookup" }, { id: "d", text: "tracert", correct: true }],
                feedback: { explanation: "tracert يفيدنا لنعرف في أي مكان على الطريق تتوقّف الرسالة أو تتأخّر: يعرض الطريق خطوة بعد خطوة (راوتر بعد راوتر)." },
              },
            },
            {
              id: "m11-l02-p01-q06", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "الأمر nslookup يفحص خدمة DNS، ويعرض عنوان IP المرتبط باسم الموقع.", answer: true, feedback: { explanation: "وظيفة nslookup: يفحص خدمة DNS، ويعرض عنوان IP المرتبط باسم الموقع." } },
            },
            {
              id: "m11-l02-p01-q07", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "الأمر arp -a يعرض الطريق الذي تسلكه الرسالة حتى تصل إلى الموقع.", answer: false, feedback: { explanation: "arp -a يعرض جدولًا فيه عناوين IP وعناوين MAC التي عرفها الجهاز مؤخرًا. أما الطريق إلى الموقع فيعرضه tracert." } },
            },
            {
              id: "m11-l02-p01-q08", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "أيّ معلومة من التالية لا يعرضها الأمر ipconfig /all حسب الصفحة؟",
                options: [{ id: "a", text: "عنوان IP" }, { id: "b", text: "قناع الشبكة" }, { id: "c", text: "الطريق الذي تسلكه الرسالة حتى الموقع", correct: true }, { id: "d", text: "عنوان MAC" }],
                feedback: { explanation: "ipconfig /all يعرض إعدادات الشبكة في جهازك: عنوان IP، قناع الشبكة، البوابة الافتراضية، وعنوان MAC. الطريق حتى الموقع يعرضه tracert." },
              },
            },
            {
              id: "m11-l02-p01-q09", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "الأمر arp -a يفيدنا لنعرف:",
                options: [{ id: "a", text: "هل حصل الجهاز على عنوان IP صحيح" }, { id: "b", text: "عنوان IP المرتبط باسم الموقع" }, { id: "c", text: "أيّ جهاز (MAC) موجود خلف كل عنوان IP في شبكتنا", correct: true }],
                feedback: { explanation: "arp يفيدنا لنعرف أي جهاز (MAC) موجود خلف كل عنوان IP في شبكتنا." },
              },
            },
            {
              id: "m11-l02-p01-q10", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "matching", prompt: "صِل كل سؤال من الجدول السريع بالأمر الذي يجيب عنه:",
                left: [
                  { id: "q1", text: "هل يوجد اتصال مع جهاز أو موقع؟" },
                  { id: "q2", text: "ما هو عنوان IP والقناع والبوابة و MAC في جهازي؟" },
                  { id: "q3", text: "ما الطريق الذي تمرّ به الرسالة حتى الموقع؟" },
                  { id: "q4", text: "ما عنوان IP لموقع معيّن؟ هل DNS يعمل؟" },
                  { id: "q5", text: "ما عناوين MAC التي يعرفها جهازي؟" },
                ],
                right: [
                  { id: "r1", text: "nslookup" },
                  { id: "r2", text: "arp -a" },
                  { id: "r3", text: "ping" },
                  { id: "r4", text: "tracert" },
                  { id: "r5", text: "ipconfig /all" },
                ],
                pairs: { q1: "r3", q2: "r5", q3: "r4", q4: "r1", q5: "r2" },
                feedback: { explanation: "الجدول السريع: الاتصال ← ping؛ IP والقناع والبوابة و MAC ← ipconfig /all؛ الطريق ← tracert؛ عنوان IP لموقع و DNS ← nslookup؛ عناوين MAC التي يعرفها الجهاز ← arp -a." },
              },
            },
            {
              id: "m11-l02-p01-q11", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "wordBank", prompt: "أكمل وظيفة الأمر ipconfig /all من مخزن الكلمات:",
                segments: ["يعرض إعدادات الشبكة في جهازك: عنوان IP، ", { blank: "b1" }, " الشبكة، ", { blank: "b2" }, " الافتراضية، وعنوان ", { blank: "b3" }, "."],
                bank: ["البوابة", "زمن", "قناع", "MAC", "الطريق"],
                answers: { b1: "قناع", b2: "البوابة", b3: "MAC" },
                feedback: { explanation: "ipconfig /all يعرض إعدادات الشبكة في جهازك: عنوان IP، قناع الشبكة، البوابة الافتراضية، وعنوان MAC." },
              },
            },
            { id: "m11-l02-p01-lib-t12", type: "library-training", origin: "teacher-enrichment", trainingId: "T12", label: "تدريب 12", requiredModuleId: "791381s-m11" },
          ],
        },
      ],
    },
  ],
};

export default m11;
