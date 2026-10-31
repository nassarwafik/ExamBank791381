// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 27 «مفاهيم التوجيه Routing».
//
// Verbatim conversion of booklet PDF pages 82–84 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every converted block is origin:"book": nothing is added, removed or reworded.
//
// Enrichment (docs/enterprise-791381s-enrichment-plan.md, Phase 6): teacher-enrichment blocks (visuals and a CLI terminal
// simulation reused from course 791381 after checking their labels / commands against this section, and the end-of-unit
// «تدريبات الوحدة» lesson) are ADDED after the book blocks they explain. The book blocks stay verbatim — pinned by the book
// lock (bookLock.test.ts).

import type { ContentModule, ContentSource } from "../../types";
import type { CliExerciseConfig } from "../../../cli/types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };
const EX = (exercise: CliExerciseConfig): Record<string, unknown> => ({ ...exercise });

const m27: ContentModule = {
  id: "791381s-m27",
  title: "مفاهيم التوجيه Routing",
  order: 27,
  lessons: [
    {
      id: "791381s-m27-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m27-l00-p01",
          title: "مفاهيم التوجيه Routing",
          order: 1,
          layout: "opener",
          source: src(82),
          blocks: [
            {
              id: "m27-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الدفعة السادسة · كتاب ص 210–213", unitNumber: "27", title: "مفاهيم التوجيه Routing",
              subtitle: "كيف يختار الراوتر الطريق؟ وما الفرق بين Static وOSPF وEIGRP؟",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m27-l01",
      title: "مفاهيم التوجيه Routing",
      order: 1,
      pages: [
        {
          id: "791381s-m27-l01-p01",
          title: "ما هو التوجيه؟",
          order: 1,
          source: src(82),
          blocks: [
            {
              id: "m27-l01-p01-def", type: "text", origin: "book",
              spans: [{ text: "التوجيه = اختيار الطريق الذي تسلكه البيانات للوصول إلى الشبكة المطلوبة.", style: "strong" }],
            },
            {
              id: "m27-l01-p01-intro", type: "text", origin: "book",
              spans: [
                { text: "الراوتر يشبه " },
                { text: "شرطي المرور", style: "strong" },
                { text: ": يقرأ عنوان IP الوجهة في الحزمة، ثم يرسلها في أفضل طريق. يعرف الراوتر الطرق من " },
                { text: "جدول التوجيه", style: "strong" },
                { text: " (Routing Table)." },
              ],
            },
          ],
        },
        {
          id: "791381s-m27-l01-p02",
          title: "ثلاث طرق للتوجيه",
          order: 2,
          source: src(82),
          blocks: [
            {
              id: "m27-l01-p02-cards", type: "list", origin: "book", variant: "cards",
              items: [
                {
                  id: "m27-l01-p02-c1", term: "Static Route",
                  text: [{ text: "مسار يدوي يكتبه مدير الشبكة بنفسه. " }, { text: "يدوي · بسيط", style: "strong" }],
                },
                {
                  id: "m27-l01-p02-c2", term: "OSPF",
                  text: [{ text: "بروتوكول ذكي يختار الطريق حسب السرعة Bandwidth. " }, { text: "Link-State", style: "strong" }],
                },
                {
                  id: "m27-l01-p02-c3", term: "EIGRP",
                  text: [{ text: "بروتوكول من Cisco يعتمد على Bandwidth + Delay. " }, { text: "Cisco · متطوّر", style: "strong" }],
                },
              ],
            },
            {
              id: "m27-l01-p02-v-methods", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m27/routing-methods-overview", motion: false,
              source: src(82),
              title: "مخطط: ثلاث طرق للتوجيه",
              alt: "مخطط عنوانه «التوجيه: اختيار الطريق إلى الشبكة المطلوبة» وتحته ثلاثة صفوف: Static Route «مسار يدوي يكتبه المدير» وشارة «يدوي · بسيط»، و OSPF «يختار الطريق حسب السرعة / Bandwidth» وشارة «Link-State»، و EIGRP «من Cisco — يعتمد على Bandwidth + Delay» وشارة «Cisco · متطور».",
              caption: "Static مسار يدوي، و OSPF يختار حسب Bandwidth، و EIGRP من Cisco يعتمد على Bandwidth + Delay.",
            },
            {
              id: "m27-l01-p02-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [
                { text: "Static", style: "strong" },
                { text: " = يدوي. أما " },
                { text: "OSPF", style: "strong" },
                { text: " و" },
                { text: "EIGRP", style: "strong" },
                { text: " فهما توجيه تلقائي (Dynamic): الراوترات تتبادل معلومات الشبكات وحدها." },
              ],
            },
          ],
        },
        {
          id: "791381s-m27-l01-p03",
          title: "التوجيه الثابت Static Route",
          order: 3,
          source: src(82, 83),
          blocks: [
            {
              id: "m27-l01-p03-table", type: "table", origin: "book",
              headers: ["المزايا ✓", "العيوب ✗"],
              rows: [
                ["يتم تحديد المسار يدويًا بوضوح.", "غير مناسب للشبكات الكبيرة."],
                ["مناسب للشبكات الصغيرة والبسيطة.", "أي تغيير يحتاج تعديلًا يدويًا."],
                ["لا يستهلك موارد كثيرة من الراوتر.", "إذا نسي المدير تحديثه قد يحدث انقطاع."],
              ],
            },
            {
              id: "m27-l01-p03-v-static", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m27/static-route-path", motion: true,
              source: src(82, 83),
              title: "رسم متحرّك: مسار ثابت يحدّده المدير يدويًا",
              alt: "رسم متحرّك: «مدير الشبكة — يكتب المسار» متصل بـ Router، ومن الراوتر خط «مسار ثابت — يدوي بوضوح» إلى «الشبكة الهدف» تتحرّك عليه حزمة مرة واحدة؛ وتحته «يدوي بوضوح · مناسب للشبكات الصغيرة · لا يستهلك موارد كثيرة» و«أيّ تغيير يحتاج تعديلًا يدويًا من المدير».",
              caption: "في التوجيه الثابت يحدّد المدير المسار يدويًا، وأيّ تغيير يحتاج تعديلًا يدويًا.",
            },
            { id: "m27-l01-p03-cli-h", type: "heading", origin: "book", level: 4, text: "Router CLI", dir: "ltr" },
            {
              id: "m27-l01-p03-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: "① Router(config)# ip route 192.168.2.0 255.255.255.0 10.0.0.2",
            },
            {
              id: "m27-l01-p03-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m27-l01-p03-s1", text: [{ text: "ip route", style: "strong" }, { text: ": أمر كتابة مسار ثابت." }] },
                {
                  id: "m27-l01-p03-s2",
                  text: [{ text: "192.168.2.0 255.255.255.0", style: "strong" }, { text: ": الشبكة البعيدة التي نريد الوصول إليها، وقناعها." }],
                },
                {
                  id: "m27-l01-p03-s3",
                  text: [{ text: "10.0.0.2", style: "strong" }, { text: ": عنوان الراوتر التالي (Next Hop) الذي نرسل له الحزم." }],
                },
              ],
            },
            {
              id: "m27-l01-p03-sim-static", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مثال موجّه: كتابة مسار ثابت إلى الشبكة 192.168.2.0",
              description: "أنت في وضع الإعداد العام للراوتر. اكتب أمر صندوق الكتاب كما هو. محاكاة تعليمية مبسّطة، ليست جهازًا حقيقيًا.",
              source: src(82),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "الأمر: ip route 192.168.2.0 255.255.255.0 10.0.0.2" },
              config: EX({
                kind: "guided",
                device: "router",
                startMode: "global",
                intro: "اكتب مسارًا ثابتًا إلى الشبكة البعيدة 192.168.2.0 وقناعها 255.255.255.0، عبر الراوتر التالي 10.0.0.2.",
                steps: [
                  { id: "s1", instruction: "اكتب المسار الثابت: الشبكة 192.168.2.0 والقناع 255.255.255.0 و Next Hop هو 10.0.0.2", expect: { command: "ip-route", args: { network: "192.168.2.0", mask: "255.255.255.0", nextHop: "10.0.0.2" } }, success: "✓ أحسنت، كتبت مسارًا ثابتًا يدويًا إلى الشبكة 192.168.2.0", hints: ["السطر ① في صندوق الكتاب: الأمر يبدأ بـ ip route.", "ip route ثم الشبكة البعيدة ثم قناعها ثم عنوان Next Hop."] },
                ],
                completion: "✓ أحسنت، المسار الثابت مكتوب كما في الكتاب.",
              }),
            },
            {
              id: "m27-l01-p03-when", type: "callout", origin: "book", kind: "summary", title: "متى نستعمل Static؟",
              spans: [{ text: "في " }, { text: "الشبكات الصغيرة الثابتة", style: "strong" }, { text: " التي لا تتغيّر كثيرًا." }],
            },
          ],
        },
        {
          id: "791381s-m27-l01-p04",
          title: "Distance Vector و Link-State",
          order: 4,
          source: src(83),
          blocks: [
            {
              id: "m27-l01-p04-intro", type: "text", origin: "book",
              spans: [{ text: "البروتوكولات التلقائية نوعان، حسب الطريقة التي تعرف بها الطرق:" }],
            },
            {
              id: "m27-l01-p04-table", type: "table", origin: "book",
              headers: ["النوع", "كيف يعمل؟", "مثال"],
              rows: [
                ["Distance Vector", "يعتمد على Metric ويرسل تحديثات دورية (كل فترة).", "EIGRP"],
                ["Link-State", "يجمع معلومات عن الشبكة كلها ويرسل تحديثات عند التغيير فقط.", "OSPF"],
              ],
            },
            {
              id: "m27-l01-p04-v-updates", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m27/routing-update-types", motion: true,
              source: src(83),
              title: "رسم متحرّك: تحديثات دورية مقابل تحديث عند التغيير",
              alt: "رسم متحرّك من لوحتين: لوحة Distance Vector فيها «تحديثات دورية» و EIGRP وثلاث نقاط تضيء واحدة بعد الأخرى، ولوحة Link-State فيها «تحديث عند التغيير + خريطة كاملة» و OSPF ونقطة واحدة تضيء «عند حدوث تغيير فقط».",
              caption: "Distance Vector (مثل EIGRP) يرسل تحديثات دورية، و Link-State (مثل OSPF) يرسل عند التغيير فقط.",
            },
            {
              id: "m27-l01-p04-student", type: "callout", origin: "book", kind: "summary", title: "للطالب",
              spans: [
                { text: "ميّز فقط: " },
                { text: "OSPF = Link-State", style: "strong" },
                { text: "، و" },
                { text: "EIGRP = Distance Vector متطوّر", style: "strong" },
                { text: " — ويسمّى أحيانًا " },
                { text: "هجينًا (Hybrid)", style: "strong" },
                { text: " لأنه يجمع صفات النوعين." },
              ],
            },
          ],
        },
        {
          id: "791381s-m27-l01-p05",
          title: "المقياس Metric",
          order: 5,
          source: src(83, 84),
          blocks: [
            {
              id: "m27-l01-p05-def", type: "text", origin: "book",
              spans: [{ text: "Metric = قيمة تساعد الراوتر على اختيار أفضل طريق للوصول. الأصغر أفضل.", style: "strong" }],
            },
            {
              id: "m27-l01-p05-table", type: "table", origin: "book",
              headers: ["البروتوكول", "على ماذا يعتمد Metric؟"],
              rows: [
                ["OSPF", "على Bandwidth (سرعة الخط) فقط — ويسمّى Cost."],
                ["EIGRP", "على Bandwidth + Delay (السرعة + التأخير)."],
                ["RIP", "على عدد القفزات Hops (عدد الراوترات في الطريق)."],
              ],
            },
          ],
        },
        {
          id: "791381s-m27-l01-p06",
          title: "المسافة الإدارية AD",
          order: 6,
          source: src(84),
          blocks: [
            {
              id: "m27-l01-p06-def", type: "text", origin: "book",
              spans: [{ text: "AD (Administrative Distance) = درجة «الثقة» في مصدر المسار. كلما قلّ الرقم زادت الأولوية.", style: "strong" }],
            },
            {
              id: "m27-l01-p06-intro", type: "text", origin: "book",
              spans: [
                { text: "إذا عرف الراوتر " },
                { text: "نفس الشبكة", style: "strong" },
                { text: " من مصدرين مختلفين (مثلًا من OSPF ومن EIGRP)، يختار المصدر صاحب " },
                { text: "AD الأصغر", style: "strong" },
                { text: "." },
              ],
            },
            {
              id: "m27-l01-p06-table", type: "table", origin: "book",
              headers: ["المصدر", "Connected", "Static", "EIGRP", "OSPF", "RIP"],
              rows: [["AD", "0", "1", "90", "110", "120"]],
            },
            {
              id: "m27-l01-p06-v-ad", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m28/admin-distance-summary", motion: false,
              source: src(84),
              title: "مخطط: سُلّم المسافة الإدارية AD",
              alt: "مخطط عنوانه «المسافة الإدارية AD — الأصغر أوثق» وتحته خمسة صفوف من الأعلى: Connected 0، Static 1، EIGRP 90، OSPF 110، RIP 120.",
              caption: "كلما قلّ رقم AD زادت الأولوية: Connected 0 ثم Static 1 ثم EIGRP 90 ثم OSPF 110 ثم RIP 120.",
            },
            {
              id: "m27-l01-p06-order", type: "text", origin: "book",
              spans: [{ text: "الأولوية: Connected 0 \u200F←\u200F Static 1 \u200F←\u200F EIGRP 90 \u200F←\u200F OSPF 110 \u200F←\u200F RIP 120", style: "strong" }],
            },
            {
              id: "m27-l01-p06-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [
                { text: "Metric", style: "strong" },
                { text: " يقارن بين طرق داخل نفس البروتوكول، و" },
                { text: "AD", style: "strong" },
                { text: " يقارن بين بروتوكولات مختلفة. وفي الاثنين: " },
                { text: "الأصغر أفضل", style: "strong" },
                { text: "." },
              ],
            },
          ],
        },
      ],
    },
    {
      // «تدريبات الوحدة» — ADDED enrichment (owner decisions D2/D3/D6, docs/enterprise-791381s-enrichment-plan.md): an end-of-unit
      // exercise page after the booklet's own pages. Every question is answered by the section's printed text above (the
      // explanation quotes it); reveal mode shows the right answer and the explanation after each answer; study activities
      // count toward Strength. The book pages of this module are unchanged (book lock).
      id: "791381s-m27-l02",
      title: "تدريبات الوحدة",
      order: 2,
      pages: [
        {
          id: "791381s-m27-l02-p01",
          title: "تدريبات الوحدة: مفاهيم التوجيه Routing",
          order: 1,
          layout: "practice",
          source: src(82, 84),
          blocks: [
            {
              id: "m27-l02-p01-q01", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "من أين يعرف الراوتر الطرق؟",
                options: [{ id: "a", text: "من عنوان MAC" }, { id: "b", text: "من السويتش" }, { id: "c", text: "من جدول التوجيه (Routing Table)", correct: true }, { id: "d", text: "من كابل الشبكة" }],
                feedback: { explanation: "الراوتر يشبه شرطي المرور: يقرأ عنوان IP الوجهة في الحزمة، ثم يرسلها في أفضل طريق. يعرف الراوتر الطرق من جدول التوجيه (Routing Table)." },
              },
            },
            {
              id: "m27-l02-p01-q02", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "wordBank", prompt: "أكمل الفراغات من مخزن الكلمات:",
                segments: ["الراوتر يشبه ", { blank: "b1" }, ": يقرأ عنوان ", { blank: "b2" }, " الوجهة في الحزمة، ثم يرسلها في أفضل طريق. يعرف الراوتر الطرق من ", { blank: "b3" }, "."],
                bank: ["MAC", "جدول التوجيه", "شرطي المرور", "IP", "السويتش"],
                answers: { b1: "شرطي المرور", b2: "IP", b3: "جدول التوجيه" },
                feedback: { explanation: "الراوتر يشبه شرطي المرور: يقرأ عنوان IP الوجهة في الحزمة، ثم يرسلها في أفضل طريق. يعرف الراوتر الطرق من جدول التوجيه (Routing Table)." },
              },
            },
            {
              id: "m27-l02-p01-q03", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "matching", prompt: "صِل كل طريقة توجيه بوصفها:",
                left: [{ id: "static", text: "Static Route" }, { id: "ospf", text: "OSPF" }, { id: "eigrp", text: "EIGRP" }],
                right: [{ id: "r1", text: "بروتوكول من Cisco يعتمد على Bandwidth + Delay" }, { id: "r2", text: "مسار يدوي يكتبه مدير الشبكة بنفسه" }, { id: "r3", text: "بروتوكول ذكي يختار الطريق حسب السرعة Bandwidth" }],
                pairs: { static: "r2", ospf: "r3", eigrp: "r1" },
                feedback: { explanation: "Static Route: مسار يدوي يكتبه مدير الشبكة بنفسه. OSPF: بروتوكول ذكي يختار الطريق حسب السرعة Bandwidth. EIGRP: بروتوكول من Cisco يعتمد على Bandwidth + Delay." },
              },
            },
            {
              id: "m27-l02-p01-q04", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "OSPF و EIGRP توجيه تلقائي (Dynamic): الراوترات تتبادل معلومات الشبكات وحدها.", answer: true, feedback: { explanation: "Static = يدوي. أما OSPF و EIGRP فهما توجيه تلقائي (Dynamic): الراوترات تتبادل معلومات الشبكات وحدها." } },
            },
            {
              id: "m27-l02-p01-q05", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "classify", prompt: "صنّف كل عبارة عن التوجيه الثابت Static: ميزة أم عيب؟",
                groups: [{ id: "pro", text: "المزايا ✓" }, { id: "con", text: "العيوب ✗" }],
                items: [
                  { id: "i1", text: "غير مناسب للشبكات الكبيرة" },
                  { id: "i2", text: "لا يستهلك موارد كثيرة من الراوتر" },
                  { id: "i3", text: "أي تغيير يحتاج تعديلًا يدويًا" },
                  { id: "i4", text: "مناسب للشبكات الصغيرة والبسيطة" },
                  { id: "i5", text: "إذا نسي المدير تحديثه قد يحدث انقطاع" },
                  { id: "i6", text: "يتم تحديد المسار يدويًا بوضوح" },
                ],
                assign: { i1: "con", i2: "pro", i3: "con", i4: "pro", i5: "con", i6: "pro" },
                feedback: { explanation: "المزايا: يتم تحديد المسار يدويًا بوضوح، مناسب للشبكات الصغيرة والبسيطة، لا يستهلك موارد كثيرة من الراوتر. العيوب: غير مناسب للشبكات الكبيرة، أي تغيير يحتاج تعديلًا يدويًا، إذا نسي المدير تحديثه قد يحدث انقطاع." },
              },
            },
            {
              id: "m27-l02-p01-q06", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "في الأمر ip route 192.168.2.0 255.255.255.0 10.0.0.2 — ماذا يمثّل 10.0.0.2؟",
                options: [{ id: "a", text: "عنوان الراوتر التالي (Next Hop) الذي نرسل له الحزم", correct: true }, { id: "b", text: "الشبكة البعيدة التي نريد الوصول إليها" }, { id: "c", text: "قناع الشبكة البعيدة" }, { id: "d", text: "أمر كتابة مسار ثابت" }],
                feedback: { explanation: "ip route: أمر كتابة مسار ثابت. 192.168.2.0 255.255.255.0: الشبكة البعيدة التي نريد الوصول إليها، وقناعها. 10.0.0.2: عنوان الراوتر التالي (Next Hop) الذي نرسل له الحزم." },
              },
            },
            {
              id: "m27-l02-p01-q07", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "متى نستعمل التوجيه الثابت Static؟",
                options: [{ id: "a", text: "في الشبكات الكبيرة التي تتغيّر كثيرًا" }, { id: "b", text: "عندما نريد أن تتبادل الراوترات المعلومات وحدها" }, { id: "c", text: "عندما تكون الشبكة الإنترنت كله" }, { id: "d", text: "في الشبكات الصغيرة الثابتة التي لا تتغيّر كثيرًا", correct: true }],
                feedback: { explanation: "متى نستعمل Static؟ في الشبكات الصغيرة الثابتة التي لا تتغيّر كثيرًا." },
              },
            },
            {
              id: "m27-l02-p01-q08", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "classify", prompt: "صنّف كل عبارة: Distance Vector أم Link-State؟",
                groups: [{ id: "dv", text: "Distance Vector" }, { id: "ls", text: "Link-State" }],
                items: [
                  { id: "i1", text: "يرسل تحديثات عند التغيير فقط" },
                  { id: "i2", text: "يعتمد على Metric ويرسل تحديثات دورية (كل فترة)" },
                  { id: "i3", text: "يجمع معلومات عن الشبكة كلها" },
                  { id: "i4", text: "مثال: EIGRP" },
                  { id: "i5", text: "مثال: OSPF" },
                ],
                assign: { i1: "ls", i2: "dv", i3: "ls", i4: "dv", i5: "ls" },
                feedback: { explanation: "Distance Vector: يعتمد على Metric ويرسل تحديثات دورية (كل فترة)، مثال EIGRP. Link-State: يجمع معلومات عن الشبكة كلها ويرسل تحديثات عند التغيير فقط، مثال OSPF." },
              },
            },
            {
              id: "m27-l02-p01-q09", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "matching", prompt: "صِل كل بروتوكول بما يعتمد عليه Metric فيه:",
                left: [{ id: "ospf", text: "OSPF" }, { id: "eigrp", text: "EIGRP" }, { id: "rip", text: "RIP" }],
                right: [{ id: "r1", text: "عدد القفزات Hops (عدد الراوترات في الطريق)" }, { id: "r2", text: "Bandwidth + Delay (السرعة + التأخير)" }, { id: "r3", text: "Bandwidth (سرعة الخط) فقط — ويسمّى Cost" }],
                pairs: { ospf: "r3", eigrp: "r2", rip: "r1" },
                feedback: { explanation: "OSPF: على Bandwidth (سرعة الخط) فقط — ويسمّى Cost. EIGRP: على Bandwidth + Delay (السرعة + التأخير). RIP: على عدد القفزات Hops (عدد الراوترات في الطريق)." },
              },
            },
            {
              id: "m27-l02-p01-q10", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "في Metric القيمة الأكبر تعني طريقًا أفضل.", answer: false, feedback: { explanation: "Metric = قيمة تساعد الراوتر على اختيار أفضل طريق للوصول. الأصغر أفضل." } },
            },
            {
              id: "m27-l02-p01-q11", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "ordering", prompt: "رتّب مصادر المسار من الأعلى أولوية (AD الأصغر) إلى الأقل:",
                items: [{ id: "rip", text: "RIP" }, { id: "connected", text: "Connected" }, { id: "ospf", text: "OSPF" }, { id: "static", text: "Static" }, { id: "eigrp", text: "EIGRP" }],
                order: ["connected", "static", "eigrp", "ospf", "rip"],
                feedback: { explanation: "الأولوية: Connected 0 ‏←‏ Static 1 ‏←‏ EIGRP 90 ‏←‏ OSPF 110 ‏←‏ RIP 120. كلما قلّ الرقم زادت الأولوية." },
              },
            },
            {
              id: "m27-l02-p01-q12", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "عرف الراوتر نفس الشبكة من OSPF ومن EIGRP. أيّ مصدر يختار؟",
                options: [{ id: "a", text: "OSPF، لأن AD له 110 وهو الأكبر" }, { id: "b", text: "EIGRP، لأن AD له 90 وهو الأصغر", correct: true }, { id: "c", text: "يختار الاثنين معًا" }],
                feedback: { explanation: "إذا عرف الراوتر نفس الشبكة من مصدرين مختلفين (مثلًا من OSPF ومن EIGRP)، يختار المصدر صاحب AD الأصغر: EIGRP 90 أصغر من OSPF 110." },
              },
            },
          ],
        },
      ],
    },
  ],
};

export default m27;
