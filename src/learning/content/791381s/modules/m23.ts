// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 23 «حماية المنافذ Port Security».
//
// Verbatim conversion of booklet PDF pages 70–72 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every converted block is origin:"book": nothing is added, removed or reworded.
//
// Enrichment (docs/enterprise-791381s-enrichment-plan.md, Phase 6; the network lab: Phase 8B-3): teacher-enrichment blocks (a visual and CLI terminal
// simulations reused from course 791381 after checking their labels / commands against this section — each simulation types
// exactly the page's own command box, with `maximum 3` as printed here — and the end-of-unit «تدريبات الوحدة» lesson) are
// ADDED after the book blocks they explain. The book blocks stay verbatim — pinned by the book lock (bookLock.test.ts).

import type { ContentModule, ContentSource } from "../../types";
import type { CliExerciseConfig } from "../../../cli/types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };
const EX = (exercise: CliExerciseConfig): Record<string, unknown> => ({ ...exercise });

const m23: ContentModule = {
  id: "791381s-m23",
  title: "حماية المنافذ Port Security",
  order: 23,
  lessons: [
    {
      id: "791381s-m23-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m23-l00-p01",
          title: "حماية المنافذ Port Security",
          order: 1,
          layout: "opener",
          source: src(70),
          blocks: [
            {
              id: "m23-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الدفعة الخامسة · كتاب ص 180–184", unitNumber: "23", title: "حماية المنافذ Port Security",
              subtitle: "كيف نمنع جهازًا غريبًا من الاتصال بمنفذ في السويتش؟",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m23-l01",
      title: "حماية المنافذ Port Security",
      order: 1,
      pages: [
        {
          id: "791381s-m23-l01-p01",
          title: "ما هو Port Security؟",
          order: 1,
          source: src(70),
          blocks: [
            {
              id: "m23-l01-p01-def", type: "text", origin: "book",
              spans: [{ text: "Port Security خاصية في السويتش للتحكّم بمن يُسمح له بالاتصال بالمنفذ.", style: "strong" }],
            },
            {
              id: "m23-l01-p01-intro", type: "text", origin: "book",
              spans: [{ text: "تخيّل أن طالبًا أحضر حاسوبه من البيت ووصله بمنفذ في غرفة الحاسوب. مع Port Security يعرف السويتش أن هذا الجهاز غريب (من عنوان MAC الخاص به) فيمنعه." }],
            },
            {
              id: "m23-l01-p01-points", type: "list", origin: "book", variant: "plain",
              items: [
                {
                  id: "m23-l01-p01-pt1",
                  text: [{ text: "يعتمد غالبًا على " }, { text: "MAC Address", style: "strong" }, { text: "." }],
                },
                { id: "m23-l01-p01-pt2", text: [{ text: "إذا دخل جهاز غير مسموح به، يتم منعه." }] },
                { id: "m23-l01-p01-pt3", text: [{ text: "يُستخدم لحماية المنافذ من أجهزة مجهولة." }] },
              ],
            },
            {
              id: "m23-l01-p01-drawing", type: "diagram", origin: "book",
              src: "/learning-assets/791381s/64cc1cdfec70c0a6.png",
              alt: "رسمة: «Switch» فوقه عبارة «المنفذ يحفظ عنوان MAC المسموح»، وتحته ثلاثة حواسيب: «PC0 ✓» و«PC1 ✓» متصلان به، و«جهاز غريب ✗» على خطه علامة منع ⊗.",
            },
            {
              id: "m23-l01-p01-v-scenario", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m23/port-security-scenario", motion: false,
              source: src(70),
              title: "مخطط: المسموح يعمل، الغريب يُرفض",
              alt: "مخطط: Switch تحته عبارة «المنفذ يحفظ MAC المسموح»، يتصل به حاسوبان PC0 و PC1 بخط أخضر وبجانب كل منهما «يعمل»، و«جهاز غريب» بخط أحمر متقطّع وبجانبه «يُرفض».",
              caption: "المنفذ لا يقبل أي جهاز عشوائي، بل المسموح به فقط.",
            },
            {
              id: "m23-l01-p01-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [{ text: "Port Security = حماية المنفذ حسب الجهاز المتصل به. المنفذ لا يقبل أي جهاز عشوائي، بل المسموح به فقط." }],
            },
          ],
        },
        {
          id: "791381s-m23-l01-p02",
          title: "الطريقة الأولى: MAC ثابت",
          order: 2,
          source: src(71),
          blocks: [
            {
              id: "m23-l01-p02-intro", type: "text", origin: "book",
              spans: [{ text: "نكتب بأنفسنا عنوان MAC للجهاز المسموح. أي جهاز آخر يُمنع." }],
            },
            { id: "m23-l01-p02-cli-h", type: "heading", origin: "book", level: 4, text: "Switch CLI", dir: "ltr" },
            {
              id: "m23-l01-p02-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: [
                "① Switch(config)# interface f0/1",
                "② Switch(config-if)# switchport mode access",
                "③ Switch(config-if)# switchport port-security",
                "④ Switch(config-if)# switchport port-security mac-address 00A0.1234.5678",
                "⑤ Switch(config-if)# switchport port-security violation shutdown",
              ].join("\n"),
            },
            {
              id: "m23-l01-p02-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m23-l01-p02-s1", text: [{ text: "نختار المنفذ." }] },
                { id: "m23-l01-p02-s2", text: [{ text: "نجعله Access — Port Security يعمل على منافذ Access." }] },
                {
                  id: "m23-l01-p02-s3",
                  text: [{ text: "port-security", style: "strong" }, { text: ": نشغّل الحماية على المنفذ (بدون هذا السطر لا تعمل الحماية)." }],
                },
                {
                  id: "m23-l01-p02-s4",
                  text: [{ text: "mac-address", style: "strong" }, { text: ": نسمح فقط لعنوان MAC المكتوب." }],
                },
                {
                  id: "m23-l01-p02-s5",
                  text: [{ text: "violation shutdown", style: "strong" }, { text: ": إذا اتصل جهاز آخر، يُغلق المنفذ." }],
                },
              ],
            },
            {
              id: "m23-l01-p02-sim-static", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "مثال موجّه: MAC ثابت على المنفذ f0/1",
              description: "أنت في وضع الإعداد العام. نفّذ الأسطر الخمسة في صندوق الكتاب بالترتيب. المحاكي يتحقّق من الوضع ومن الأمر ويعطيك تلميحين عند الحاجة. محاكاة تعليمية مبسّطة، ليست جهازًا حقيقيًا.",
              source: src(71),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "interface f0/1 ثم switchport mode access ثم switchport port-security ثم switchport port-security mac-address 00A0.1234.5678 ثم switchport port-security violation shutdown." },
              config: EX({
                kind: "guided",
                device: "switch",
                startMode: "global",
                intro: "أنت في وضع الإعداد العام. نفّذ أسطر صندوق الكتاب بالترتيب.",
                steps: [
                  { id: "s1", instruction: "اختر المنفذ f0/1", expect: { command: "interface", args: { interfaces: ["f0/1"] } }, success: "✓ أحسنت، أنت الآن داخل المنفذ f0/1", hints: ["السطر ① في صندوق الكتاب.", "الأمر يبدأ بـ interface ويليه اسم المنفذ."] },
                  { id: "s2", instruction: "اجعل المنفذ Access", expect: { command: "switchport-mode", args: { mode: "access" } }, hints: ["السطر ② في صندوق الكتاب.", "الأمر يبدأ بـ switchport mode."] },
                  { id: "s3", instruction: "شغّل الحماية على المنفذ", expect: { command: "switchport-port-security" }, hints: ["السطر ③ في صندوق الكتاب: بدونه لا تعمل الحماية.", "switchport ثم port-security، بلا كلمات إضافية."] },
                  { id: "s4", instruction: "اسمح فقط للعنوان 00A0.1234.5678", expect: { command: "port-security-mac-address", args: { mac: "00A0.1234.5678" } }, hints: ["السطر ④ في صندوق الكتاب.", "الأمر يبدأ بـ switchport port-security mac-address ويليه العنوان."] },
                  { id: "s5", instruction: "اجعل المنفذ يُغلق إذا اتصل جهاز آخر", expect: { command: "port-security-violation", args: { action: "shutdown" } }, hints: ["السطر ⑤ في صندوق الكتاب.", "الأمر يبدأ بـ switchport port-security violation."] },
                ],
                completion: "✓ أحسنت — المنفذ f0/1 يسمح فقط للعنوان 00A0.1234.5678، وأي جهاز آخر يُغلق المنفذ.",
              }),
            },
            {
              id: "m23-l01-p02-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [
                { text: "violation shutdown", style: "strong" },
                { text: " يعني إغلاق المنفذ تمامًا عند دخول جهاز غير مسموح. وكلمة violation معناها: مخالفة." },
              ],
            },
          ],
        },
        {
          id: "791381s-m23-l01-p03",
          title: "الطريقة الثانية: Sticky MAC",
          order: 3,
          source: src(71, 72),
          blocks: [
            {
              id: "m23-l01-p03-intro", type: "text", origin: "book",
              spans: [{ text: "أحيانًا لا نعرف عنوان MAC للجهاز مسبقًا. مع Sticky يتعلّم السويتش وحده عنوان أول جهاز يتصل بالمنفذ، ويحفظه، ثم يسمح له فقط. ومعنى كلمة Sticky: لاصق." }],
            },
            { id: "m23-l01-p03-cli-h", type: "heading", origin: "book", level: 4, text: "Switch CLI", dir: "ltr" },
            {
              id: "m23-l01-p03-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: [
                "① Switch(config-if)# switchport port-security",
                "② Switch(config-if)# switchport port-security mac-address sticky",
              ].join("\n"),
            },
            {
              id: "m23-l01-p03-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                { id: "m23-l01-p03-s1", text: [{ text: "نشغّل الحماية على المنفذ." }] },
                {
                  id: "m23-l01-p03-s2",
                  text: [{ text: "sticky", style: "strong" }, { text: ": السويتش يتعلّم عنوان MAC تلقائيًا ويحفظه." }],
                },
              ],
            },
            {
              id: "m23-l01-p03-sim-sticky", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "تحدّي الأمر: شغّل الحماية واجعلها Sticky",
              description: "أنت داخل منفذ Access في وضع (config-if)#. اكتب الأمر المطلوب في كل سؤال؛ المحاكي لا يكشف الإجابة. محاكاة تعليمية مبسّطة.",
              source: src(71, 72),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "التحدّي: switchport port-security ثم switchport port-security mac-address sticky." },
              config: EX({
                kind: "challenge",
                device: "switch",
                startMode: "interface",
                startInterface: "f0/1",
                preset: { interfaces: { "f0/1": { switchportMode: "access" } } },
                intro: "أنت داخل منفذ Access في وضع (config-if)#.",
                steps: [
                  { id: "c1", instruction: "شغّل الحماية على المنفذ", expect: { command: "switchport-port-security" }, hints: ["السطر ① في صندوق الكتاب: كلمتان فقط.", "الأمر يبدأ بـ switchport ويليه اسم الخاصية."] },
                  { id: "c2", instruction: "اجعل السويتش يتعلّم عنوان MAC تلقائيًا ويحفظه", expect: { command: "port-security-sticky" }, hints: ["نفس بداية الأمر السابق مع كلمتين إضافيتين.", "ينتهي بالكلمة sticky."] },
                ],
                allowed: ["switchport-port-security", "port-security-sticky"],
                completion: "✓ صحيح — الحماية تعمل، والسويتش يتعلّم عنوان أول جهاز يتصل بالمنفذ ويحفظه.",
              }),
            },
          ],
        },
        {
          id: "791381s-m23-l01-p04",
          title: "تحديد عدد الأجهزة",
          order: 4,
          source: src(72),
          blocks: [
            {
              id: "m23-l01-p04-intro", type: "text", origin: "book",
              spans: [{ text: "نستطيع أن نحدّد كم جهازًا مسموح له أن يستعمل نفس المنفذ." }],
            },
            { id: "m23-l01-p04-cli-h", type: "heading", origin: "book", level: 4, text: "Switch CLI", dir: "ltr" },
            {
              id: "m23-l01-p04-cli", type: "code", origin: "book", language: "cli", dir: "ltr",
              code: [
                "① Switch(config-if)# switchport port-security maximum 3",
                "② Switch(config-if)# switchport port-security violation shutdown",
              ].join("\n"),
            },
            {
              id: "m23-l01-p04-steps", type: "list", origin: "book", variant: "ordered",
              items: [
                {
                  id: "m23-l01-p04-s1",
                  text: [{ text: "maximum 3", style: "strong" }, { text: ": نسمح بثلاثة أجهزة فقط على هذا المنفذ." }],
                },
                { id: "m23-l01-p04-s2", text: [{ text: "إذا زاد العدد تحدث مخالفة، فيُغلق المنفذ." }] },
              ],
            },
            {
              id: "m23-l01-p04-sim-maximum", type: "simulation", origin: "teacher-enrichment",
              simulationType: "cli-terminal", version: 1,
              title: "تحدّي الأمر: ثلاثة أجهزة فقط على المنفذ",
              description: "أنت داخل منفذ Access عليه الحماية، في وضع (config-if)#. اكتب الأمر المطلوب في كل سؤال؛ المحاكي لا يكشف الإجابة. محاكاة تعليمية مبسّطة.",
              source: src(72),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "التحدّي: switchport port-security maximum 3 ثم switchport port-security violation shutdown." },
              config: EX({
                kind: "challenge",
                device: "switch",
                startMode: "interface",
                startInterface: "f0/1",
                preset: { interfaces: { "f0/1": { switchportMode: "access", portSecurity: { enabled: true } } } },
                intro: "أنت داخل منفذ Access عليه الحماية، في وضع (config-if)#.",
                steps: [
                  { id: "c1", instruction: "اسمح بثلاثة أجهزة فقط على هذا المنفذ", expect: { command: "port-security-maximum", args: { maximum: 3 } }, hints: ["السطر ① في صندوق الكتاب.", "switchport port-security ثم كلمة تعني «الحد الأقصى» ثم العدد."] },
                  { id: "c2", instruction: "اجعل المنفذ يُغلق إذا زاد العدد", expect: { command: "port-security-violation", args: { action: "shutdown" } }, hints: ["السطر ② في صندوق الكتاب.", "الكلمة violation معناها مخالفة."] },
                ],
                allowed: ["port-security-maximum", "port-security-violation"],
                completion: "✓ صحيح — المنفذ يسمح بثلاثة أجهزة فقط، وإذا زاد العدد تحدث مخالفة فيُغلق.",
              }),
            },
            { id: "m23-l01-p04-h-summary", type: "heading", origin: "book", level: 4, text: "ملخّص Port Security" },
            {
              id: "m23-l01-p04-summary", type: "table", origin: "book",
              headers: ["port-security", "تشغيل الحماية"],
              rows: [
                ["mac-address 00A0.1234.5678", "السماح لجهاز محدّد"],
                ["mac-address sticky", "تعلّم الجهاز تلقائيًا"],
                ["maximum 3", "عدد الأجهزة المسموح"],
                ["violation shutdown", "العقوبة: إغلاق المنفذ"],
              ],
              columnDirs: ["ltr", "rtl"],
            },
          ],
        },
      ],
    },
    {
      // «تدريبات الوحدة» — ADDED enrichment: an end-of-unit exercise page after the booklet's own pages. Every question is
      // answered by the section's printed text above (the explanation quotes it). The book pages are unchanged (book lock).
      id: "791381s-m23-l02",
      title: "تدريبات الوحدة",
      order: 2,
      pages: [
        {
          id: "791381s-m23-l02-p01",
          title: "تدريبات الوحدة: حماية المنافذ Port Security",
          order: 1,
          layout: "practice",
          source: src(70, 72),
          blocks: [
            {
              id: "m23-l02-p01-q01", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "على ماذا يعتمد Port Security غالبًا ليعرف أن الجهاز غريب؟",
                options: [{ id: "a", text: "عنوان IP" }, { id: "b", text: "MAC Address", correct: true }, { id: "c", text: "اسم المستخدم" }, { id: "d", text: "رقم VLAN" }],
                feedback: { explanation: "Port Security يعتمد غالبًا على MAC Address: يعرف السويتش أن الجهاز غريب من عنوان MAC الخاص به فيمنعه." },
              },
            },
            {
              id: "m23-l02-p01-q02", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "المنفذ المحمي بـ Port Security يقبل أي جهاز عشوائي يتصل به.", answer: false, feedback: { explanation: "Port Security = حماية المنفذ حسب الجهاز المتصل به. المنفذ لا يقبل أي جهاز عشوائي، بل المسموح به فقط." } },
            },
            {
              id: "m23-l02-p01-q03", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "ordering", prompt: "رتّب أوامر الطريقة الأولى (MAC ثابت) كما في صندوق الكتاب:",
                items: [
                  { id: "viol", text: "switchport port-security violation shutdown" },
                  { id: "if", text: "interface f0/1" },
                  { id: "ps", text: "switchport port-security" },
                  { id: "mode", text: "switchport mode access" },
                  { id: "mac", text: "switchport port-security mac-address 00A0.1234.5678" },
                ],
                order: ["if", "mode", "ps", "mac", "viol"],
                feedback: { explanation: "نختار المنفذ (interface f0/1)، نجعله Access، نشغّل الحماية (switchport port-security)، نسمح فقط لعنوان MAC المكتوب، ثم violation shutdown: إذا اتصل جهاز آخر يُغلق المنفذ." },
              },
            },
            {
              id: "m23-l02-p01-q04", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ماذا يفعل الأمر switchport port-security violation shutdown؟",
                options: [{ id: "a", text: "يطفئ السويتش كله" }, { id: "b", text: "يحذف عنوان MAC المحفوظ" }, { id: "c", text: "يُغلق المنفذ إذا اتصل جهاز غير مسموح", correct: true }, { id: "d", text: "يجعل المنفذ Trunk" }],
                feedback: { explanation: "violation shutdown يعني إغلاق المنفذ تمامًا عند دخول جهاز غير مسموح. وكلمة violation معناها: مخالفة." },
              },
            },
            {
              id: "m23-l02-p01-q05", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "بدون السطر switchport port-security لا تعمل الحماية على المنفذ.", answer: true, feedback: { explanation: "port-security: نشغّل الحماية على المنفذ (بدون هذا السطر لا تعمل الحماية)." } },
            },
            {
              id: "m23-l02-p01-q06", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "classify", prompt: "صنّف كل عبارة: هل تصف الطريقة الأولى (MAC ثابت) أم الطريقة الثانية (Sticky MAC)؟",
                groups: [{ id: "static", text: "MAC ثابت" }, { id: "sticky", text: "Sticky MAC" }],
                items: [
                  { id: "i1", text: "نكتب بأنفسنا عنوان MAC للجهاز المسموح" },
                  { id: "i2", text: "السويتش يتعلّم وحده عنوان أول جهاز يتصل بالمنفذ" },
                  { id: "i3", text: "switchport port-security mac-address 00A0.1234.5678" },
                  { id: "i4", text: "switchport port-security mac-address sticky" },
                  { id: "i5", text: "نستعملها عندما لا نعرف عنوان MAC للجهاز مسبقًا" },
                ],
                assign: { i1: "static", i2: "sticky", i3: "static", i4: "sticky", i5: "sticky" },
                feedback: { explanation: "في الطريقة الأولى نكتب بأنفسنا عنوان MAC للجهاز المسموح (mac-address 00A0.1234.5678). أحيانًا لا نعرف عنوان MAC مسبقًا: مع Sticky يتعلّم السويتش وحده عنوان أول جهاز يتصل بالمنفذ ويحفظه (mac-address sticky)." },
              },
            },
            {
              id: "m23-l02-p01-q07", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ما معنى كلمة Sticky؟",
                options: [{ id: "a", text: "مخالفة" }, { id: "b", text: "ثابت" }, { id: "c", text: "غريب" }, { id: "d", text: "لاصق", correct: true }],
                feedback: { explanation: "مع Sticky يتعلّم السويتش وحده عنوان أول جهاز يتصل بالمنفذ، ويحفظه، ثم يسمح له فقط. ومعنى كلمة Sticky: لاصق." },
              },
            },
            {
              id: "m23-l02-p01-q08", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "matching", prompt: "صِل كل أمر من ملخّص Port Security بوظيفته:",
                left: [
                  { id: "ps", text: "port-security" },
                  { id: "mac", text: "mac-address 00A0.1234.5678" },
                  { id: "sticky", text: "mac-address sticky" },
                  { id: "max", text: "maximum 3" },
                  { id: "viol", text: "violation shutdown" },
                ],
                right: [
                  { id: "r1", text: "العقوبة: إغلاق المنفذ" },
                  { id: "r2", text: "عدد الأجهزة المسموح" },
                  { id: "r3", text: "تشغيل الحماية" },
                  { id: "r4", text: "تعلّم الجهاز تلقائيًا" },
                  { id: "r5", text: "السماح لجهاز محدّد" },
                ],
                pairs: { ps: "r3", mac: "r5", sticky: "r4", max: "r2", viol: "r1" },
                feedback: { explanation: "ملخّص Port Security: port-security تشغيل الحماية · mac-address 00A0.1234.5678 السماح لجهاز محدّد · mac-address sticky تعلّم الجهاز تلقائيًا · maximum 3 عدد الأجهزة المسموح · violation shutdown العقوبة: إغلاق المنفذ." },
              },
            },
            {
              id: "m23-l02-p01-q09", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "منفذ عليه switchport port-security maximum 3 و violation shutdown، واتصل به جهاز رابع. ماذا يحدث؟",
                options: [{ id: "a", text: "تحدث مخالفة، فيُغلق المنفذ", correct: true }, { id: "b", text: "يعمل الجهاز الرابع بشكل عادي" }, { id: "c", text: "يصبح الحد أربعة أجهزة تلقائيًا" }, { id: "d", text: "يُمنع الجهاز الأول فقط" }],
                feedback: { explanation: "maximum 3: نسمح بثلاثة أجهزة فقط على هذا المنفذ. إذا زاد العدد تحدث مخالفة، فيُغلق المنفذ." },
              },
            },
            {
              id: "m23-l02-p01-q10", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "wordBank", prompt: "أكمل الفراغات من مخزن الكلمات:",
                segments: ["Port Security يعمل على منافذ ", { blank: "b1" }, ". نحدّد كم جهازًا مسموح له أن يستعمل نفس المنفذ بالأمر switchport port-security ", { blank: "b2" }, " 3، وكلمة violation معناها: ", { blank: "b3" }, "."],
                bank: ["Access", "Trunk", "maximum", "مخالفة", "لاصق"],
                answers: { b1: "Access", b2: "maximum", b3: "مخالفة" },
                feedback: { explanation: "نجعل المنفذ Access — Port Security يعمل على منافذ Access. maximum 3: نسمح بثلاثة أجهزة فقط على هذا المنفذ. وكلمة violation معناها: مخالفة." },
              },
            },
            {
              id: "m23-l02-p01-q11", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "مع Sticky نكتب بأنفسنا عنوان MAC للجهاز المسموح قبل أن يتصل.", answer: false, feedback: { explanation: "مع Sticky يتعلّم السويتش وحده عنوان أول جهاز يتصل بالمنفذ ويحفظه؛ أما كتابة العنوان بأنفسنا فهي الطريقة الأولى: MAC ثابت." } },
            },
            {
              // Phase 8B-3 — a network lab on the curriculum network simulator (networkTopology@2) with this unit's own values; the
              // SERVER replays and judges it (checks, feedback and solution never reach the browser). Checked only — not counted in
              // Study Strength until the owner decides (§11.3). Proven by networkLab.contract.test.ts (no free credit, solution passes).
              id: "m23-l02-p01-lab-portsec", type: "simulation", origin: "teacher-enrichment", simulationType: "network-lab", version: 1, studyEligible: false,
              title: "مختبر شبكي: Port Security",
              description: "مختبر على محاكي الشبكات: احمِ منفذ السويتش من الأجهزة غير المسموح بها، ثم اضغط «تحقّق من الإعداد».",
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "interface f0/1 ثم switchport mode access ثم switchport port-security ثم switchport port-security mac-address sticky ثم switchport port-security maximum 3 ثم switchport port-security violation shutdown." },
              config: {
                topology: {"v":2,"devices":[{"id":"sw1","kind":"switch","label":"SW1","x":0.5,"y":0.2},{"id":"pc1","kind":"pc","label":"PC1","x":0.3,"y":0.8,"initial":{"v":2,"device":"host","adapters":{"eth0":{"mode":"static","address":"192.168.1.11","mask":"255.255.255.0","gateway":""}}}},{"id":"pc2","kind":"pc","label":"PC2","x":0.7,"y":0.8,"initial":{"v":2,"device":"host","adapters":{"eth0":{"mode":"static","address":"192.168.1.12","mask":"255.255.255.0","gateway":""}}}}],"links":[{"id":"a","a":{"deviceId":"sw1","port":"f0/1"},"b":{"deviceId":"pc1","port":"eth0"}},{"id":"b","a":{"deviceId":"sw1","port":"f0/2"},"b":{"deviceId":"pc2","port":"eth0"}}]},
                task: {
                  intro: "على السويتش SW1، المنفذ f0/1 (PC1): اجعله منفذ access، وشغّل عليه الحماية Port Security. دع السويتش يتعلّم عنوان MAC تلقائيًا (sticky)، واسمح بثلاثة أجهزة فقط، وعند المخالفة يُغلق المنفذ.",
                  goals: [{"id":"mode","label":"المنفذ f0/1 في وضع access"},{"id":"on","label":"الحماية switchport port-security مفعّلة على f0/1"},{"id":"sticky","label":"السويتش يتعلّم عنوان MAC تلقائيًا (sticky)"},{"id":"max","label":"مسموح بثلاثة أجهزة فقط على المنفذ (maximum 3)"},{"id":"viol","label":"عند المخالفة يُغلق المنفذ (violation shutdown)"}],
                },
                checks: [{"id":"mode","label":"المنفذ f0/1 في وضع access","weight":1,"kind":"switch.portMode","deviceId":"sw1","interface":"f0/1","value":"access"},{"id":"on","label":"الحماية switchport port-security مفعّلة على f0/1","weight":1,"kind":"switch.portSecurity","deviceId":"sw1","interface":"f0/1","value":true},{"id":"sticky","label":"السويتش يتعلّم عنوان MAC تلقائيًا (sticky)","weight":1,"kind":"switch.portSecuritySticky","deviceId":"sw1","interface":"f0/1","value":true},{"id":"max","label":"مسموح بثلاثة أجهزة فقط على المنفذ (maximum 3)","weight":1,"kind":"switch.portSecurityMaximum","deviceId":"sw1","interface":"f0/1","value":3},{"id":"viol","label":"عند المخالفة يُغلق المنفذ (violation shutdown)","weight":1,"kind":"switch.portSecurityViolation","deviceId":"sw1","interface":"f0/1","value":"shutdown"}],
                feedback: {
                  correctFeedback: "أحسنت! تحققت كل أهداف المختبر.",
                  incorrectFeedback: "لم تتحقق كل الأهداف بعد.",
                  hints: ["interface f0/1 ثم switchport mode access — الحماية تعمل على منفذ access.","switchport port-security (بدون هذا السطر لا تعمل الحماية) ثم switchport port-security mac-address sticky.","switchport port-security maximum 3 ثم switchport port-security violation shutdown."],
                  explanation: "Port Security يحمي منفذ السويتش: switchport port-security يشغّل الحماية، و sticky يجعل السويتش يتعلّم عنوان MAC تلقائيًا ويحفظه، و maximum 3 يسمح بثلاثة أجهزة فقط، و violation shutdown يُغلق المنفذ عند المخالفة.",
                },
                solution: [{"type":"switch.command","deviceId":"sw1","command":"enable"},{"type":"switch.command","deviceId":"sw1","command":"configure terminal"},{"type":"switch.command","deviceId":"sw1","command":"interface f0/1"},{"type":"switch.command","deviceId":"sw1","command":"switchport mode access"},{"type":"switch.command","deviceId":"sw1","command":"switchport port-security"},{"type":"switch.command","deviceId":"sw1","command":"switchport port-security mac-address sticky"},{"type":"switch.command","deviceId":"sw1","command":"switchport port-security maximum 3"},{"type":"switch.command","deviceId":"sw1","command":"switchport port-security violation shutdown"},{"type":"switch.command","deviceId":"sw1","command":"end"}],
              },
            },
          ],
        },
      ],
    },
  ],
};

export default m23;
