// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 26 «الشبكة الواسعة WAN».
//
// Verbatim conversion of booklet PDF pages 80–81 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every converted block is origin:"book": nothing is added, removed or reworded.
//
// Enrichment (docs/enterprise-791381s-enrichment-plan.md, Phase 6): teacher-enrichment blocks (visuals reused from course
// 791381 after checking their labels against this section, and the end-of-unit «تدريبات الوحدة» lesson) are ADDED after the
// book blocks they explain. The book blocks stay verbatim — pinned by the book lock (bookLock.test.ts).

import type { ContentModule, ContentSource } from "../../types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };

const m26: ContentModule = {
  id: "791381s-m26",
  title: "الشبكة الواسعة WAN",
  order: 26,
  lessons: [
    {
      id: "791381s-m26-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m26-l00-p01",
          title: "الشبكة الواسعة WAN",
          order: 1,
          layout: "opener",
          source: src(80),
          blocks: [
            {
              id: "m26-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الدفعة السادسة · كتاب ص 207–209", unitNumber: "26", title: "الشبكة الواسعة WAN",
              subtitle: "كيف نربط فروعًا بعيدة في مدن ودول مختلفة؟",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m26-l01",
      title: "الشبكة الواسعة WAN",
      order: 1,
      pages: [
        {
          id: "791381s-m26-l01-p01",
          title: "ما هي WAN؟",
          order: 1,
          source: src(80),
          blocks: [
            {
              id: "m26-l01-p01-def", type: "text", origin: "book",
              spans: [{ text: "WAN = شبكة واسعة تمتد عبر مسافات كبيرة: مدن، دول، أو قارات.", style: "strong" }],
            },
            {
              id: "m26-l01-p01-intro", type: "text", origin: "book",
              spans: [
                { text: "تخيّل مدرسة لها فرع في مدينة أخرى. في كل فرع شبكة LAN صغيرة، و" },
                { text: "WAN", style: "strong" },
                { text: " هي التي تربط الشبكتين معًا مهما كانت المسافة بينهما." },
              ],
            },
            {
              id: "m26-l01-p01-drawing", type: "diagram", origin: "book",
              src: "/learning-assets/791381s/6a4e672a6166f8aa.png",
              alt: "رسم: شبكتان داخل إطارين متقطعين، في كل منهما Router متصل بحاسوبين؛ تحت اليمنى «LAN · المقر الرئيسي» وتحت اليسرى «LAN · الفرع». الراوتران متصلان بسحابة مكتوب عليها «WAN» وتحتها «مدن · دول · قارات».",
              caption: "كل فرع فيه LAN، وWAN تربط الفروع البعيدة مع بعضها",
            },
            {
              id: "m26-l01-p01-points", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m26-l01-p01-pt1", text: [{ text: "تربط " }, { text: "فروع الشركات والمؤسسات", style: "strong" }, { text: "." }] },
                { id: "m26-l01-p01-pt2", text: [{ text: "تستخدم الألياف الضوئية والإنترنت والاتصالات السلكية واللاسلكية." }] },
                { id: "m26-l01-p01-pt3", text: [{ text: "أكبر مثال على WAN هو " }, { text: "الإنترنت", style: "strong" }, { text: "." }] },
              ],
            },
            {
              id: "m26-l01-p01-example", type: "callout", origin: "book", kind: "tip", title: "مثال",
              spans: [{ text: "ربط فرع المدرسة أو الشركة بالمقر الرئيسي — حتى يستعمل الفرع نفس البرامج والملفات الموجودة في المقر." }],
            },
            {
              id: "m26-l01-p01-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [
                { text: "LAN", style: "strong" },
                { text: " تربط أجهزة في مكان واحد، و" },
                { text: "WAN", style: "strong" },
                { text: " تربط شبكات بعيدة مع بعضها عبر مسافات شاسعة." },
              ],
            },
          ],
        },
        {
          id: "791381s-m26-l01-p02",
          title: "تقنيات WAN القديمة",
          order: 2,
          source: src(81),
          blocks: [
            {
              id: "m26-l01-p02-intro", type: "text", origin: "book",
              spans: [
                { text: "تقنيات استُخدمت قديمًا لنقل البيانات بين المواقع البعيدة. الهدف منها: نقل البيانات بين مواقع بعيدة " },
                { text: "بكفاءة", style: "strong" },
                { text: "." },
              ],
            },
            {
              id: "m26-l01-p02-table", type: "table", origin: "book",
              headers: ["التقنية", "ماذا تفعل؟"],
              rows: [
                ["Frame Relay", "تنقل البيانات على شكل Frames وتعتمد على Packet Switching (تقسيم البيانات إلى حزم صغيرة)."],
                ["ATM", "تنقل صوتًا وفيديو وبيانات معًا على نفس الخط."],
              ],
            },
            {
              id: "m26-l01-p02-v-frame-atm", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m26/frame-relay-vs-atm", motion: false,
              source: src(81),
              title: "مخطط: Frame Relay و ATM",
              alt: "مخطط من بطاقتين: بطاقة Frame Relay فيها «Frames» و«ينقل البيانات على شكل Frames» و«يعتمد على Packet Switching»، وبطاقة ATM فيها «Voice · Video · Data» و«ينقل صوتًا وفيديو وبيانات معًا».",
              caption: "Frame Relay ينقل البيانات على شكل Frames بـ Packet Switching، و ATM ينقل الصوت والفيديو والبيانات معًا على نفس الخط.",
            },
            {
              id: "m26-l01-p02-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [{ text: "تقنيات WAN القديمة تساعدنا على فهم فكرة الربط بين الفروع." }],
            },
          ],
        },
        {
          id: "791381s-m26-l01-p03",
          title: "تقنيات WAN الأحدث",
          order: 3,
          source: src(81),
          blocks: [
            {
              id: "m26-l01-p03-cards", type: "list", origin: "book", variant: "cards",
              items: [
                {
                  id: "m26-l01-p03-c1", term: "HDLC",
                  text: [{ text: "بروتوكول لربط الأجهزة (الراوترات) عبر خطوط WAN. " }, { text: "ربط راوتر براوتر", style: "strong" }],
                },
                {
                  id: "m26-l01-p03-c2", term: "Metro Ethernet",
                  text: [
                    { text: "ربط مواقع متعددة " },
                    { text: "داخل مدينة واحدة", style: "strong" },
                    { text: ". سريع ومستقر وسهل التوسعة. " },
                    { text: "شائع اليوم", style: "strong" },
                  ],
                },
              ],
            },
            {
              id: "m26-l01-p03-v-hdlc-metro", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m26/hdlc-vs-metro", motion: false,
              source: src(81),
              title: "مخطط: HDLC و Metro Ethernet",
              alt: "مخطط من بطاقتين: بطاقة HDLC فيها «بروتوكول لربط الأجهزة عبر خطوط WAN»، وبطاقة Metro Ethernet فيها «ربط مواقع متعددة داخل مدينة» و«سرعة · استقرار · سهولة توسعة» و«شائع لربط الفروع في منطقة حضرية».",
              caption: "HDLC يربط راوترًا براوتر عبر خطوط WAN، و Metro Ethernet يربط مواقع متعددة داخل مدينة واحدة.",
            },
            {
              id: "m26-l01-p03-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [{ text: "Metro Ethernet", style: "strong" }, { text: " شائع لربط فروع داخل منطقة حضرية واحدة (مدينة)." }],
            },
            {
              id: "m26-l01-p03-exam", type: "text", origin: "book",
              spans: [{ text: "للامتحان: التقنيات القديمة Frame Relay وATM، والأحدث HDLC وMetro Ethernet", style: "strong" }],
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
      id: "791381s-m26-l02",
      title: "تدريبات الوحدة",
      order: 2,
      pages: [
        {
          id: "791381s-m26-l02-p01",
          title: "تدريبات الوحدة: الشبكة الواسعة WAN",
          order: 1,
          layout: "practice",
          source: src(80, 81),
          blocks: [
            {
              id: "m26-l02-p01-q01", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ما هي الشبكة الواسعة WAN؟",
                options: [{ id: "a", text: "شبكة تربط أجهزة في غرفة واحدة فقط." }, { id: "b", text: "شبكة واسعة تمتد عبر مسافات كبيرة: مدن، دول، أو قارات.", correct: true }, { id: "c", text: "كابل يربط الحاسوب بالطابعة." }, { id: "d", text: "برنامج لتصفّح المواقع." }],
                feedback: { explanation: "WAN = شبكة واسعة تمتد عبر مسافات كبيرة: مدن، دول، أو قارات." },
              },
            },
            {
              id: "m26-l02-p01-q02", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ما أكبر مثال على WAN؟",
                options: [{ id: "a", text: "شبكة غرفة الحاسوب" }, { id: "b", text: "سويتش المدرسة" }, { id: "c", text: "شبكة LAN في الفرع" }, { id: "d", text: "الإنترنت", correct: true }],
                feedback: { explanation: "أكبر مثال على WAN هو الإنترنت." },
              },
            },
            {
              id: "m26-l02-p01-q03", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "WAN تربط أجهزة في مكان واحد فقط.", answer: false, feedback: { explanation: "LAN تربط أجهزة في مكان واحد، و WAN تربط شبكات بعيدة مع بعضها عبر مسافات شاسعة." } },
            },
            {
              id: "m26-l02-p01-q04", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "أيّ تقنية تنقل صوتًا وفيديو وبيانات معًا على نفس الخط؟",
                options: [{ id: "a", text: "Frame Relay" }, { id: "b", text: "HDLC" }, { id: "c", text: "ATM", correct: true }, { id: "d", text: "Metro Ethernet" }],
                feedback: { explanation: "ATM: تنقل صوتًا وفيديو وبيانات معًا على نفس الخط." },
              },
            },
            {
              id: "m26-l02-p01-q05", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "أيّ تقنية شائعة اليوم لربط مواقع متعددة داخل مدينة واحدة؟",
                options: [{ id: "a", text: "Metro Ethernet", correct: true }, { id: "b", text: "ATM" }, { id: "c", text: "Frame Relay" }, { id: "d", text: "HDLC" }],
                feedback: { explanation: "Metro Ethernet: ربط مواقع متعددة داخل مدينة واحدة. سريع ومستقر وسهل التوسعة، وشائع اليوم." },
              },
            },
            {
              id: "m26-l02-p01-q06", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "HDLC بروتوكول لربط الأجهزة (الراوترات) عبر خطوط WAN: ربط راوتر براوتر.", answer: true, feedback: { explanation: "HDLC: بروتوكول لربط الأجهزة (الراوترات) عبر خطوط WAN — ربط راوتر براوتر." } },
            },
            {
              id: "m26-l02-p01-q07", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "تعتمد Frame Relay على Packet Switching. ماذا يعني ذلك؟",
                options: [{ id: "a", text: "نقل الصوت فقط" }, { id: "b", text: "تقسيم البيانات إلى حزم صغيرة", correct: true }, { id: "c", text: "ربط أجهزة في غرفة واحدة" }],
                feedback: { explanation: "Frame Relay تنقل البيانات على شكل Frames وتعتمد على Packet Switching (تقسيم البيانات إلى حزم صغيرة)." },
              },
            },
            {
              id: "m26-l02-p01-q08", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "matching", prompt: "صِل كل تقنية بوصفها:",
                left: [{ id: "fr", text: "Frame Relay" }, { id: "atm", text: "ATM" }, { id: "hdlc", text: "HDLC" }, { id: "metro", text: "Metro Ethernet" }],
                right: [{ id: "r1", text: "ربط مواقع متعددة داخل مدينة واحدة" }, { id: "r2", text: "تنقل البيانات على شكل Frames وتعتمد على Packet Switching" }, { id: "r3", text: "ربط راوتر براوتر عبر خطوط WAN" }, { id: "r4", text: "تنقل صوتًا وفيديو وبيانات معًا على نفس الخط" }],
                pairs: { fr: "r2", atm: "r4", hdlc: "r3", metro: "r1" },
                feedback: { explanation: "Frame Relay: Frames و Packet Switching. ATM: صوت وفيديو وبيانات معًا على نفس الخط. HDLC: ربط راوتر براوتر عبر خطوط WAN. Metro Ethernet: ربط مواقع متعددة داخل مدينة واحدة." },
              },
            },
            {
              id: "m26-l02-p01-q09", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "classify", prompt: "صنّف تقنيات WAN: قديمة أم أحدث؟",
                groups: [{ id: "old", text: "تقنيات قديمة" }, { id: "new", text: "تقنيات أحدث" }],
                items: [{ id: "i1", text: "HDLC" }, { id: "i2", text: "Frame Relay" }, { id: "i3", text: "Metro Ethernet" }, { id: "i4", text: "ATM" }],
                assign: { i1: "new", i2: "old", i3: "new", i4: "old" },
                feedback: { explanation: "للامتحان: التقنيات القديمة Frame Relay و ATM، والأحدث HDLC و Metro Ethernet." },
              },
            },
            {
              id: "m26-l02-p01-q10", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "classify", prompt: "صنّف كل عبارة: هل تصف LAN أم WAN؟",
                groups: [{ id: "lan", text: "LAN" }, { id: "wan", text: "WAN" }],
                items: [{ id: "i1", text: "تمتد عبر مدن ودول وقارات" }, { id: "i2", text: "تربط أجهزة في مكان واحد" }, { id: "i3", text: "تربط فروع الشركات والمؤسسات" }, { id: "i4", text: "أكبر مثال عليها الإنترنت" }],
                assign: { i1: "wan", i2: "lan", i3: "wan", i4: "wan" },
                feedback: { explanation: "LAN تربط أجهزة في مكان واحد، و WAN تربط شبكات بعيدة مع بعضها عبر مسافات شاسعة: تمتد عبر مدن ودول وقارات، وتربط فروع الشركات والمؤسسات، وأكبر مثال عليها الإنترنت." },
              },
            },
            {
              id: "m26-l02-p01-q11", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "wordBank", prompt: "أكمل الفراغات من مخزن الكلمات:",
                segments: ["WAN تمتد عبر مسافات كبيرة: مدن، دول، أو ", { blank: "b1" }, ". تربط ", { blank: "b2" }, " الشركات والمؤسسات، وتستخدم ", { blank: "b3" }, " والإنترنت والاتصالات السلكية واللاسلكية."],
                bank: ["الألياف الضوئية", "قارات", "غرف", "فروع", "بلوتوث"],
                answers: { b1: "قارات", b2: "فروع", b3: "الألياف الضوئية" },
                feedback: { explanation: "WAN = شبكة واسعة تمتد عبر مسافات كبيرة: مدن، دول، أو قارات. تربط فروع الشركات والمؤسسات، وتستخدم الألياف الضوئية والإنترنت والاتصالات السلكية واللاسلكية." },
              },
            },
            { id: "m26-l02-p01-lib-t22", type: "library-training", origin: "teacher-enrichment", trainingId: "T22", label: "تدريب 22", requiredModuleId: "791381s-m26" },
          ],
        },
      ],
    },
  ],
};

export default m26;
