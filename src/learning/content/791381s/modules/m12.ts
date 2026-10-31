// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 12 «المجالات والمفاهيم».
//
// Verbatim conversion of booklet PDF pages 34–37 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every converted block is origin:"book": nothing is added, removed or reworded. The Hub/Switch drawing and the
// STP triangle are crops of the booklet itself.
//
// Enrichment (docs/enterprise-791381s-enrichment-plan.md, Phases 2–5): teacher-enrichment blocks (visuals / activities reused from
// course 791381 after checking their labels against this section, and the end-of-unit «تدريبات الوحدة» lesson) are ADDED after the
// book blocks they explain. The book blocks above stay verbatim — pinned by the book lock (bookLock.test.ts).

import type { ContentModule, ContentSource } from "../../types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };

const m12: ContentModule = {
  id: "791381s-m12",
  title: "المجالات والمفاهيم",
  order: 12,
  lessons: [
    {
      id: "791381s-m12-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m12-l00-p01",
          title: "المجالات والمفاهيم",
          order: 1,
          layout: "opener",
          source: src(34),
          blocks: [
            {
              id: "m12-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الدفعة الثالثة · كتاب ص 98–106", unitNumber: "12", title: "المجالات والمفاهيم",
              subtitle: "التصادم، مجال البث، STP، الإرسال باتجاه واحد أو اتجاهين، Localhost و APIPA.",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m12-l01",
      title: "المجالات والمفاهيم",
      order: 1,
      pages: [
        {
          id: "791381s-m12-l01-p01",
          title: "مجال التصادم (Collision Domain)",
          order: 1,
          source: src(34, 35),
          blocks: [
            {
              id: "m12-l01-p01-def", type: "text", origin: "book",
              spans: [{ text: "منطقة في الشبكة يمكن أن يحدث فيها تصادم بين الرسائل.", style: "strong" }],
            },
            {
              id: "m12-l01-p01-eg", type: "text", origin: "book",
              spans: [{ text: "التصادم مثل طالبين يتكلّمان في نفس اللحظة: لا يفهم أحد شيئًا، ويجب أن يعيدا الكلام." }],
            },
            {
              id: "m12-l01-p01-points", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m12-l01-p01-pt1", text: [{ text: "يحدث التصادم عندما يرسل " }, { text: "أكثر من جهاز في نفس الوقت", style: "strong" }, { text: "." }] },
                { id: "m12-l01-p01-pt2", text: [{ text: "كان شائعًا في الشبكات القديمة التي تستخدم " }, { text: "Hub", style: "strong" }, { text: ": كل الأجهزة في مجال تصادم واحد." }] },
                { id: "m12-l01-p01-pt3", text: [{ text: "السويتش يقلّل التصادم لأن " }, { text: "كل منفذ مجال منفصل", style: "strong" }, { text: "، ويرسل غالبًا للمقصود فقط." }] },
              ],
            },
            {
              id: "m12-l01-p01-drawing", type: "diagram", origin: "book",
              src: "/learning-assets/791381s/5e3ffd15405adef3.png",
              alt: "رسمان: Hub متصل بثلاثة حواسيب يحيط بها خط متقطّع واحد مع عبارة «مجال تصادم واحد»؛ Switch متصل بثلاثة حواسيب يحيط بكل حاسوب خط متقطّع خاص به مع عبارة «كل منفذ = مجال مستقل»؛ وتحتهما عبارة «الخط المتقطّع = مجال تصادم».",
            },
            {
              // ENRICHMENT: SVG next to the booklet drawing — Hub = one shared collision domain (two senders at once
              // collide), Switch = one domain per port (two flows at once, no collision). Generic devices, no numbers.
              id: "m12-l01-p01-v-collision", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m16/collision-domains", motion: true,
              source: src(34, 35),
              title: "رسم توضيحي: Hub مقابل Switch",
              alt: "لوحتان: في الأولى Hub متصل بأربعة حواسيب داخل منطقة واحدة، وجهازان يرسلان في نفس الوقت فتتصادم رسالتاهما عند الـ Hub؛ في الثانية Switch متصل بأربعة حواسيب، حول كل حاسوب منطقة خاصة به، ورسالتان تعبران السويتش في نفس الوقت بلا تصادم.",
              caption: "مع Hub كل الأجهزة في مجال تصادم واحد؛ في السويتش كل منفذ مجال منفصل.",
            },
            {
              id: "m12-l01-p01-rule", type: "text", origin: "book",
              spans: [{ text: "قاعدة مهمة: كل منفذ في السويتش = مجال تصادم مستقل (Collision Domain)", style: "strong" }],
            },
          ],
        },
        {
          id: "791381s-m12-l01-p02",
          title: "مجال البث (Broadcast Domain)",
          order: 2,
          source: src(35),
          blocks: [
            {
              id: "m12-l01-p02-def", type: "text", origin: "book",
              spans: [{ text: "مجموعة أجهزة تستقبل رسائل البث (Broadcast) من بعضها.", style: "strong" }],
            },
            {
              id: "m12-l01-p02-intro", type: "text", origin: "book",
              spans: [{ text: "هو المنطقة التي «يُسمع» فيها إعلان البث. كلما كان المجال أكبر، كثرت الرسائل وازدحمت الشبكة." }],
            },
            {
              id: "m12-l01-p02-points", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m12-l01-p02-pt1", text: [{ text: "رسالة البث تصل لكل الأجهزة في نفس المجال، وتُستخدم لاكتشاف الأجهزة والخدمات." }] },
                { id: "m12-l01-p02-pt2", text: [{ text: "كثرة رسائل البث قد تسبّب ازدحامًا في الشبكة." }] },
              ],
            },
            {
              id: "m12-l01-p02-table", type: "table", origin: "book",
              headers: ["الجهاز", "ماذا يحدث؟", "الخلاصة"],
              rows: [
                ["Switch", "كل المنافذ غالبًا ضمن مجال بث واحد.", "البث ينتشر داخل السويتش."],
                ["Router", "كل منفذ في الراوتر = مجال بث مستقل.", "الراوتر يوقف البث بين الشبكات."],
                ["VLAN", "كل VLAN تعتبر مجال بث منفصل.", "تفصل الأقسام عن بعضها."],
              ],
            },
            {
              id: "m12-l01-p02-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [
                { text: "الراوتر و VLAN", style: "strong" },
                { text: " يفصلان مجالات البث عن بعضها، فتقلّ حركة المرور غير الضرورية." },
              ],
            },
            {
              // ENRICHMENT — interactive-diagram / network-domains / v1: both domain kinds (p01 + p02) and the page's
              // Switch / Router / VLAN table in one explorer. Every note is the booklet's own rule; the counts apply it.
              id: "m12-l01-p02-explorer", type: "interactive-diagram", origin: "teacher-enrichment",
              interactionType: "network-domains", version: 1,
              title: "استكشف مجالات التصادم ومجالات البث",
              description: "اختر الشبكة (Hub، Switch، Router، VLAN) واقرأ كم مجال تصادم وكم مجال بث فيها، مع القاعدة من الكتيّب لكل عدد.",
              source: src(34, 35),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "Hub بأربعة أجهزة: مجال تصادم واحد (كل الأجهزة في مجال تصادم واحد) ومجال بث واحد. Switch بأربعة أجهزة: 4 مجالات تصادم (كل منفذ في السويتش = مجال تصادم مستقل) ومجال بث واحد (كل المنافذ غالبًا ضمن مجال بث واحد). Router يربط سويتشين بجهازين لكل منهما: 6 مجالات تصادم (في كل سويتش منفذان للأجهزة ومنفذ للراوتر) ومجالا بث (كل منفذ في الراوتر = مجال بث مستقل). Switch مقسّم إلى VLAN 10 و VLAN 20: 4 مجالات تصادم ومجالا بث (كل VLAN تعتبر مجال بث منفصل)." },
              config: {
                scenarios: [
                  { id: "hub", name: "Hub", title: "أربعة أجهزة على Hub", collision: 1, broadcast: 1, collisionNote: "Hub: كل الأجهزة في مجال تصادم واحد.", broadcastNote: "رسالة البث تصل لكل الأجهزة في نفس المجال." },
                  { id: "switch", name: "Switch", title: "أربعة أجهزة على Switch", collision: 4, broadcast: 1, collisionNote: "كل منفذ في السويتش = مجال تصادم مستقل.", broadcastNote: "كل المنافذ غالبًا ضمن مجال بث واحد: البث ينتشر داخل السويتش." },
                  { id: "router", name: "Router", title: "Router يربط سويتشين", collision: 6, broadcast: 2, collisionNote: "كل منفذ في السويتش = مجال تصادم مستقل: في كل سويتش منفذان للأجهزة ومنفذ للراوتر.", broadcastNote: "كل منفذ في الراوتر = مجال بث مستقل: الراوتر يوقف البث بين الشبكات." },
                  { id: "vlan", name: "VLAN", title: "Switch مقسّم إلى VLAN 10 و VLAN 20", collision: 4, broadcast: 2, collisionNote: "كل منفذ في السويتش = مجال تصادم مستقل.", broadcastNote: "كل VLAN تعتبر مجال بث منفصل: تفصل الأقسام عن بعضها." },
                ],
                collisionLabel: "مجال تصادم", broadcastLabel: "مجال بث",
                showCollisionLabel: "أظهر مجالات التصادم", showBroadcastLabel: "أظهر مجالات البث",
                legend: "الخط المتقطّع = مجال تصادم، والخط الملوّن يحيط بكل مجال بث.",
              },
            },
          ],
        },
        {
          id: "791381s-m12-l01-p03",
          title: "بروتوكول STP",
          order: 3,
          source: src(36),
          blocks: [
            {
              id: "m12-l01-p03-intro", type: "text", origin: "book",
              spans: [{ text: "إذا كان بين السويتشات أكثر من طريق، قد تدور الرسالة بينها بلا نهاية وتملأ الشبكة. STP يمنع ذلك." }],
            },
            {
              id: "m12-l01-p03-def", type: "text", origin: "book",
              spans: [{ text: "STP يمنع حدوث الحلقات (Loops) في الشبكة.", style: "strong" }],
            },
            {
              id: "m12-l01-p03-points", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m12-l01-p03-pt1", text: [{ text: "يختار أفضل طريق لنقل البيانات." }] },
                { id: "m12-l01-p03-pt2", text: [{ text: "يعطّل الروابط الزائدة " }, { text: "مؤقتًا", style: "strong" }, { text: "." }] },
                { id: "m12-l01-p03-pt3", text: [{ text: "يحافظ على استقرار الشبكة." }] },
              ],
            },
            {
              id: "m12-l01-p03-drawing", type: "diagram", origin: "book",
              src: "/learning-assets/791381s/7db59e6d3cc13c7d.png",
              alt: "مثلث من ثلاثة سويتشات: SW1 في الأعلى متصل بـ SW2 و SW3، والرابط بين SW2 و SW3 خط متقطّع عليه علامة ⊗ مع عبارة «رابط معطّل مؤقتًا ← لا حلقة».",
            },
            {
              id: "m12-l01-p03-when", type: "text", origin: "book",
              spans: [
                { text: "متى؟", style: "strong" },
                { text: " مهم عند وجود أكثر من طريق بين السويتشات، حتى لا تدور البيانات في حلقة." },
              ],
            },
          ],
        },
        {
          id: "791381s-m12-l01-p04",
          title: "Half Duplex و Full Duplex",
          order: 4,
          source: src(36),
          blocks: [
            {
              id: "m12-l01-p04-intro", type: "text", origin: "book",
              spans: [{ text: "الكلمة Duplex تتكلّم عن اتجاه الإرسال: هل يمكن الإرسال والاستقبال معًا أم لا؟" }],
            },
            {
              id: "m12-l01-p04-table", type: "table", origin: "book",
              headers: ["النوع", "معناه", "مثال"],
              rows: [
                ["Half Duplex اتجاه واحد في كل مرة", "الجهاز يرسل أو يستقبل، لكن ليس في نفس الوقت.", "جهاز لاسلكي قديم (ووكي توكي)"],
                ["Full Duplex اتجاهان معًا", "الجهاز يرسل و يستقبل في نفس الوقت.", "مكالمة هاتفية، أو سويتش حديث"],
              ],
            },
            {
              // ENRICHMENT: SVG of the table's two rows — one shared line, one direction at a time vs two lanes at once.
              id: "m12-l01-p04-v-duplex", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m16/half-full-duplex", motion: true,
              source: src(36),
              title: "رسم توضيحي: Half Duplex و Full Duplex",
              alt: "لوحتان: في Half Duplex خط واحد بين الجهازين A و B، والرسالة تذهب في اتجاه ثم تعود في الاتجاه الآخر بعد أن تنتهي الأولى؛ في Full Duplex مساران بين A و B، ورسالتان تتحرّكان في الاتجاهين في نفس الوقت.",
              caption: "Half Duplex: يرسل أو يستقبل، لكن ليس في نفس الوقت. Full Duplex: يرسل ويستقبل في نفس الوقت.",
            },
          ],
        },
        {
          id: "791381s-m12-l01-p05",
          title: "Localhost و APIPA",
          order: 5,
          source: src(36, 37),
          blocks: [
            {
              id: "m12-l01-p05-intro", type: "text", origin: "book",
              spans: [{ text: "هذان عنوانان خاصّان يجب أن نعرفهما: الأول للجهاز نفسه، والثاني يظهر عند وجود مشكلة." }],
            },
            {
              id: "m12-l01-p05-cards", type: "list", origin: "book", variant: "cards",
              items: [
                {
                  id: "m12-l01-p05-c1", term: "Localhost",
                  text: [
                    { text: "يشير إلى " },
                    { text: "نفس الجهاز", style: "strong" },
                    { text: " الذي تعمل عليه. عنوانه: " },
                    { text: "127.0.0.1", style: "code" },
                    { text: " يُستخدم لاختبار المواقع والبرامج محليًا. " },
                    { text: "لا يحتاج", style: "strong" },
                    { text: " اتصالًا بالإنترنت." },
                  ],
                },
                {
                  id: "m12-l01-p05-c2", term: "APIPA",
                  text: [
                    { text: "عنوان IP يختاره الجهاز " },
                    { text: "لنفسه تلقائيًا", style: "strong" },
                    { text: ". يظهر عندما " },
                    { text: "لا يجد الجهاز خادم DHCP", style: "strong" },
                    { text: ". يبدأ دائمًا بـ " },
                    { text: "169.254.x.x", style: "code" },
                    { text: " اتصال مؤقت داخل الشبكة المحلية فقط." },
                  ],
                },
              ],
            },
            {
              id: "m12-l01-p05-warning", type: "callout", origin: "book", kind: "summary", title: "إشارة تحذير",
              spans: [
                { text: "إذا رأيت في " },
                { text: "ipconfig", style: "code" },
                { text: " عنوانًا يبدأ بـ " },
                { text: "169.254", style: "code" },
                { text: " فغالبًا هناك " },
                { text: "مشكلة في DHCP", style: "strong" },
                { text: "." },
              ],
            },
            {
              // ENRICHMENT: SVG of the «إشارة تحذير» box — the device finds no DHCP server, so it picks a 169.254.x.x
              // address for itself (the drawn address is just one 169.254 example), valid inside the local network only.
              id: "m12-l01-p05-v-apipa", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m16/apipa-fallback", motion: true,
              source: src(36, 37),
              title: "رسم توضيحي: متى يظهر عنوان APIPA؟",
              alt: "جهازك يرسل طلبًا نحو خادم DHCP مكتوب عليه «DHCP?»، فلا تأتي استجابة (علامة ✗ وعبارة «لا استجابة»)، ثم يظهر تحت جهازك عنوان يبدأ بـ 169.254 اختاره لنفسه، مع عبارة «يعمل داخل الشبكة المحلية فقط».",
              caption: "لا يجد الجهاز خادم DHCP، فيختار لنفسه تلقائيًا عنوانًا يبدأ بـ 169.254 — لذلك هو إشارة إلى مشكلة في DHCP.",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m12-l02",
      title: "تدريبات الوحدة",
      order: 2,
      pages: [
        {
          id: "791381s-m12-l02-p01",
          title: "تدريبات الوحدة: المجالات والمفاهيم",
          order: 1,
          layout: "practice",
          source: src(34, 37),
          blocks: [
            {
              id: "m12-l02-p01-q01", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "متى يحدث التصادم في الشبكة؟",
                options: [{ id: "a", text: "عندما يُطفأ السويتش." }, { id: "b", text: "عندما يرسل أكثر من جهاز في نفس الوقت.", correct: true }, { id: "c", text: "عندما يرسل جهاز واحد فقط." }, { id: "d", text: "عندما يستقبل الجهاز رسالة بث." }],
                feedback: { explanation: "يحدث التصادم عندما يرسل أكثر من جهاز في نفس الوقت — مثل طالبين يتكلّمان في نفس اللحظة: لا يفهم أحد شيئًا، ويجب أن يعيدا الكلام." },
              },
            },
            {
              id: "m12-l02-p01-q02", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "في الشبكات القديمة التي تستخدم Hub يكون لكل جهاز مجال تصادم خاص به.", answer: false, feedback: { explanation: "مع Hub كل الأجهزة في مجال تصادم واحد. السويتش هو الذي يقلّل التصادم لأن كل منفذ فيه مجال منفصل." } },
            },
            {
              id: "m12-l02-p01-q03", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "سويتش متصل به 6 حواسيب، كل حاسوب في منفذ. كم مجال تصادم؟",
                options: [{ id: "a", text: "1" }, { id: "b", text: "3" }, { id: "c", text: "6", correct: true }, { id: "d", text: "لا يوجد أي مجال تصادم" }],
                feedback: { explanation: "قاعدة مهمة: كل منفذ في السويتش = مجال تصادم مستقل. 6 منافذ مستعملة = 6 مجالات تصادم." },
              },
            },
            {
              id: "m12-l02-p01-q04", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "من يفصل مجالات البث عن بعضها، فتقلّ حركة المرور غير الضرورية؟",
                options: [{ id: "a", text: "الراوتر و VLAN", correct: true }, { id: "b", text: "Hub والسويتش" }, { id: "c", text: "الكابل فقط" }],
                feedback: { explanation: "تذكّر: الراوتر و VLAN يفصلان مجالات البث عن بعضها، فتقلّ حركة المرور غير الضرورية." },
              },
            },
            {
              id: "m12-l02-p01-q05", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "matching", prompt: "صِل كل جهاز بما يحدث لمجال البث فيه:",
                left: [{ id: "sw", text: "Switch" }, { id: "rt", text: "Router" }, { id: "vlan", text: "VLAN" }],
                right: [{ id: "r1", text: "كل منفذ = مجال بث مستقل، ويوقف البث بين الشبكات." }, { id: "r2", text: "كل واحدة تعتبر مجال بث منفصل، وتفصل الأقسام عن بعضها." }, { id: "r3", text: "كل المنافذ غالبًا ضمن مجال بث واحد، والبث ينتشر داخله." }],
                pairs: { sw: "r3", rt: "r1", vlan: "r2" },
                feedback: { explanation: "Switch: كل المنافذ غالبًا ضمن مجال بث واحد. Router: كل منفذ في الراوتر = مجال بث مستقل. VLAN: كل VLAN تعتبر مجال بث منفصل." },
              },
            },
            {
              id: "m12-l02-p01-q06", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "كلما كان مجال البث أكبر، كثرت الرسائل وازدحمت الشبكة.", answer: true, feedback: { explanation: "مجال البث هو المنطقة التي «يُسمع» فيها إعلان البث. كلما كان المجال أكبر، كثرت الرسائل وازدحمت الشبكة." } },
            },
            {
              id: "m12-l02-p01-q07", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ماذا يفعل STP بالروابط الزائدة بين السويتشات؟",
                options: [{ id: "a", text: "يحذفها نهائيًا." }, { id: "b", text: "يرسل عليها نسخة ثانية من الرسالة." }, { id: "c", text: "يجعلها مجال بث جديد." }, { id: "d", text: "يعطّلها مؤقتًا.", correct: true }],
                feedback: { explanation: "STP يمنع حدوث الحلقات (Loops): يختار أفضل طريق لنقل البيانات، ويعطّل الروابط الزائدة مؤقتًا، ويحافظ على استقرار الشبكة." },
              },
            },
            {
              id: "m12-l02-p01-q08", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "wordBank", prompt: "أكمل الفراغات من مخزن الكلمات:",
                segments: ["STP يمنع حدوث ", { blank: "b1" }, " في الشبكة: يختار ", { blank: "b2" }, " طريق لنقل البيانات، ويعطّل الروابط الزائدة ", { blank: "b3" }, "، ويحافظ على ", { blank: "b4" }, " الشبكة."],
                bank: ["الحلقات", "أفضل", "نهائيًا", "مؤقتًا", "استقرار", "التصادم"],
                answers: { b1: "الحلقات", b2: "أفضل", b3: "مؤقتًا", b4: "استقرار" },
                feedback: { explanation: "STP يمنع حدوث الحلقات (Loops) في الشبكة: يختار أفضل طريق لنقل البيانات، يعطّل الروابط الزائدة مؤقتًا، ويحافظ على استقرار الشبكة." },
              },
            },
            {
              id: "m12-l02-p01-q09", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "classify", prompt: "صنّف كل عبارة أو مثال: Half Duplex أم Full Duplex؟",
                groups: [{ id: "half", text: "Half Duplex · اتجاه واحد في كل مرة" }, { id: "full", text: "Full Duplex · اتجاهان معًا" }],
                items: [
                  { id: "i1", text: "جهاز لاسلكي قديم (ووكي توكي)" },
                  { id: "i2", text: "مكالمة هاتفية" },
                  { id: "i3", text: "الجهاز يرسل أو يستقبل، لكن ليس في نفس الوقت" },
                  { id: "i4", text: "سويتش حديث" },
                  { id: "i5", text: "الجهاز يرسل ويستقبل في نفس الوقت" },
                ],
                assign: { i1: "half", i2: "full", i3: "half", i4: "full", i5: "full" },
                feedback: { explanation: "Half Duplex: الجهاز يرسل أو يستقبل، لكن ليس في نفس الوقت (مثال: ووكي توكي). Full Duplex: الجهاز يرسل ويستقبل في نفس الوقت (مثال: مكالمة هاتفية، أو سويتش حديث)." },
              },
            },
            {
              id: "m12-l02-p01-q10", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ظهر في ipconfig عنوان يبدأ بـ 169.254. ما التفسير الأقرب؟",
                options: [{ id: "a", text: "الاتصال بالإنترنت ممتاز." }, { id: "b", text: "غالبًا هناك مشكلة في DHCP.", correct: true }, { id: "c", text: "الجهاز يختبر موقعًا على Localhost." }],
                feedback: { explanation: "إشارة تحذير: إذا رأيت في ipconfig عنوانًا يبدأ بـ 169.254 فغالبًا هناك مشكلة في DHCP — الجهاز لم يجد خادم DHCP فاختار لنفسه عنوان APIPA." },
              },
            },
            {
              id: "m12-l02-p01-q11", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "classify", prompt: "صنّف كل عبارة: هل هي عن Localhost أم عن APIPA؟",
                groups: [{ id: "local", text: "Localhost" }, { id: "apipa", text: "APIPA" }],
                items: [
                  { id: "i1", text: "عنوانه 127.0.0.1" },
                  { id: "i2", text: "يبدأ دائمًا بـ 169.254.x.x" },
                  { id: "i3", text: "يشير إلى نفس الجهاز الذي تعمل عليه" },
                  { id: "i4", text: "يظهر عندما لا يجد الجهاز خادم DHCP" },
                  { id: "i5", text: "يُستخدم لاختبار المواقع والبرامج محليًا" },
                  { id: "i6", text: "اتصال مؤقت داخل الشبكة المحلية فقط" },
                ],
                assign: { i1: "local", i2: "apipa", i3: "local", i4: "apipa", i5: "local", i6: "apipa" },
                feedback: { explanation: "Localhost: يشير إلى نفس الجهاز، عنوانه 127.0.0.1، ويُستخدم لاختبار المواقع والبرامج محليًا. APIPA: عنوان يختاره الجهاز لنفسه عندما لا يجد خادم DHCP، يبدأ دائمًا بـ 169.254.x.x، واتصال مؤقت داخل الشبكة المحلية فقط." },
              },
            },
            {
              id: "m12-l02-p01-q12", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "اختبار موقع على Localhost يحتاج اتصالًا بالإنترنت.", answer: false, feedback: { explanation: "Localhost يُستخدم لاختبار المواقع والبرامج محليًا، ولا يحتاج اتصالًا بالإنترنت." } },
            },
            { id: "m12-l02-p01-lib-t13", type: "library-training", origin: "teacher-enrichment", trainingId: "T13", label: "تدريب 13", requiredModuleId: "791381s-m12" },
          ],
        },
      ],
    },
  ],
};

export default m12;
