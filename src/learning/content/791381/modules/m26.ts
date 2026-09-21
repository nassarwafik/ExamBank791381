// Learning Materials — Batch 10 phase: REAL converted body for Book 791381, module m26 (the book's section
// «الشبكة الواسعة WAN», source PDF 207–209 — three pages under the running header «الشبكة الواسعة WAN», no section
// cover). NEW stable id m26, reading `order` 25: after m25 («مراجعة الأوامر», order 24) and before m27
// («بروتوكولات التوجيه», order 26).
// Book-derived blocks are origin:"book": the PDF 207 definition + facts + «الخلاصة», the PDF 208 Frame Relay /
// ATM cards + goal + «تذكّر», the PDF 209 HDLC / Metro Ethernet cards + «شائع». No CLI on these pages, so no
// simulator exercise. SOURCE LEVEL: the book gives one-line definitions only — no speeds, encapsulation details,
// or provider terminology are added. SOURCE ORDER: nothing from PDF 210+ (routing protocols) appears here.
// PRINTED PAGE = page circle = PDF index (207, 208, 209).

import type { ContentModule, ContentSource, InlineSpan, PracticeOption, PracticeTableSelectCell } from "../../types";

const CID = "791381";
const src = (pdf: number, printed?: number): ContentSource => ({ kind: "book", sourceId: CID, pdfPageStart: pdf, printedPage: printed });
const L = (text: string): InlineSpan => ({ text, dir: "ltr", style: "code" });
const T = (text: string): InlineSpan => ({ text });
const opt = (id: string, text: string, correct?: true): PracticeOption => (correct ? { id, text, correct } : { id, text });
const TECHS = ["Frame Relay", "ATM", "HDLC", "Metro Ethernet"] as const;
const TC = (key: (typeof TECHS)[number]): PracticeTableSelectCell => ({ kind: "select", options: [...TECHS], key });

const m26: ContentModule = {
  id: "791381-m26",
  title: "الشبكة الواسعة WAN",
  shortTitle: "WAN",
  order: 25,
  source: { kind: "book", sourceId: CID, pdfPageStart: 207, pdfPageEnd: 209, sourceNote: "ثلاث صفحات تحت العنوان الجاري «الشبكة الواسعة WAN» (PDF 207–209) بلا صفحة عنوان خاصة. PDF 206 آخر صفحة في وحدة مراجعة الأوامر (m25)، و PDF 210 تبدأ وحدة «بروتوكولات التوجيه» (m27)." },
  lessons: [
    {
      id: "791381-m26-l01",
      title: "WAN وتقنياتها",
      order: 1,
      pages: [
        // PDF 207 — الشبكة الواسعة WAN
        {
          id: "791381-m26-l01-p01",
          title: "الشبكة الواسعة WAN",
          order: 1,
          source: src(207, 207),
          keywords: ["WAN", "الشبكة الواسعة", "ربط الفروع", "الألياف الضوئية"],
          blocks: [
            {
              id: "m26-l01-p01-def", type: "callout", origin: "book", kind: "important",
              spans: [L("WAN"), T(" شبكة تمتد عبر مسافات كبيرة: مدن، دول، أو قارات.")],
            },
            {
              id: "m26-l01-p01-facts", type: "list", origin: "book", variant: "checklist",
              items: [
                { id: "m26-l01-p01-f1", text: [T("تربط فروع الشركات والمؤسسات.")] },
                { id: "m26-l01-p01-f2", text: [T("تستخدم الألياف الضوئية والإنترنت والاتصالات السلكية واللاسلكية.")] },
                { id: "m26-l01-p01-f3", text: [T("مثال: ربط فرع المدرسة أو الشركة بالمقر الرئيسي.")] },
              ],
            },
            {
              id: "m26-l01-p01-summary", type: "callout", origin: "book", kind: "summary", title: "الخلاصة",
              spans: [L("WAN"), T(" تربط شبكات بعيدة مع بعضها عبر مسافات شاسعة.")],
            },
            {
              // ENRICHMENT (Batch 6): SVG visual enrichment appended after the book content.
              id: "m26-l01-p01-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m26/wan-vs-lan-scope", motion: false,
              source: src(207),
              title: "مخطط: نطاق LAN مقابل WAN",
              alt: "مخطط يقارن نطاق الشبكة المحلية LAN داخل مبنى واحد تملكه المؤسسة، بنطاق الشبكة الواسعة WAN التي تربط الفروع بالمقر الرئيسي عبر مسافات كبيرة.",
              caption: "‏LAN داخل مبنى واحد · WAN تربط الفروع بالمقر عبر مسافات كبيرة.",
            },
            {
              id: "m26-l01-p01-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [T("تذكّر الفرق مع "), L("LAN"), T(" من وحدة أنواع شبكات الاتصال: "), L("LAN"), T(" داخل مبنى واحد وتملكه المؤسسة، أما "), L("WAN"), T(" فتمرّ عبر خطوط شركات الاتصالات لتصل فروعًا متباعدة.")],
            },
            {
              id: "m26-l01-p01-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي مثال يطابق WAN بحسب الكتاب؟",
                options: [opt("m26-l01-p01-q1-a", "ربط فرع المدرسة بالمقر الرئيسي", true), opt("m26-l01-p01-q1-b", "ربط حاسوبين في غرفة واحدة"), opt("m26-l01-p01-q1-c", "ربط طابعة بحاسوب بكابل USB")],
                feedback: {
                  hints: ["السطر الأخير في قائمة الحقائق.", "مسافات كبيرة بين موقعين."],
                  correctFeedback: "صحيح — ربط فرع بالمقر الرئيسي.",
                  incorrectFeedback: "افحص السطر: «مثال: ربط فرع المدرسة أو الشركة بالمقر الرئيسي».",
                  explanation: "WAN تمتد عبر مدن أو دول؛ الحاسوبان في غرفة واحدة شبكة محلية.",
                },
              },
            },
            {
              id: "m26-l01-p01-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "WAN قد تمتد عبر قارات.", answer: true,
                feedback: {
                  hints: ["صندوق التعريف في أعلى الصفحة.", "مدن، دول، أو…"],
                  correctFeedback: "صحيح — مدن أو دول أو قارات.",
                  incorrectFeedback: "افحص التعريف: «تمتد عبر مسافات كبيرة: مدن، دول، أو قارات».",
                  explanation: "الشبكة الواسعة تربط شبكات بعيدة مهما كانت المسافة.",
                },
              },
            },
          ],
        },
        // PDF 208 — تقنيات WAN القديمة
        {
          id: "791381-m26-l01-p02",
          title: "تقنيات WAN القديمة",
          order: 2,
          source: src(208, 208),
          keywords: ["Frame Relay", "ATM", "Packet Switching", "Frames"],
          blocks: [
            {
              id: "m26-l01-p02-intro", type: "text", origin: "book",
              spans: [T("تقنيات استُخدمت لنقل البيانات بين المواقع البعيدة.")],
            },
            {
              id: "m26-l01-p02-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m26-l01-p02-c1", term: "Frame Relay", text: [T("ينقل البيانات على شكل "), L("Frames"), T(" ويعتمد على "), L("Packet Switching"), T(".")] },
                { id: "m26-l01-p02-c2", term: "ATM", text: [T("ينقل صوتًا وفيديو وبيانات معًا.")] },
              ],
            },
            {
              id: "m26-l01-p02-goal", type: "callout", origin: "book", kind: "important", title: "الهدف",
              spans: [T("نقل البيانات بين مواقع بعيدة بكفاءة.")],
            },
            {
              id: "m26-l01-p02-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [T("تقنيات "), L("WAN"), T(" القديمة تساعد في فهم فكرة الربط بين الفروع.")],
            },
            {
              // ENRICHMENT (Batch 8): SVG visual enrichment appended after the book content.
              id: "m26-l01-p02-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m26/frame-relay-vs-atm", motion: false,
              source: src(208),
              title: "مخطط: Frame Relay مقابل ATM",
              alt: "مخطط مقارنة كما في الكتاب: Frame Relay ينقل البيانات على شكل Frames ويعتمد على Packet Switching، و ATM ينقل صوتًا وفيديو وبيانات معًا.",
              caption: "‏Frame Relay ينقل Frames بـ Packet Switching · ATM يجمع الصوت والفيديو والبيانات.",
            },
            {
              id: "m26-l01-p02-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [L("Packet Switching"), T(" يعني تقطيع البيانات إلى وحدات صغيرة تُرسل كلٌّ منها عبر الشبكة على حدة — الفكرة نفسها التي رأيتها في تجزئة البيانات؛ "), L("Frame Relay"), T(" يسمّي هذه الوحدات "), L("Frames"), T(".")],
            },
            {
              id: "m26-l01-p02-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي تقنية ينقل صوتًا وفيديو وبيانات معًا بحسب الكتاب؟",
                options: [opt("m26-l01-p02-q1-a", "ATM", true), opt("m26-l01-p02-q1-b", "Frame Relay"), opt("m26-l01-p02-q1-c", "VLAN")],
                feedback: {
                  hints: ["البطاقة الثانية.", "ثلاثة أحرف."],
                  correctFeedback: "صحيح — ATM.",
                  incorrectFeedback: "افحص بطاقة ATM: «ينقل صوتًا وفيديو وبيانات معًا».",
                  explanation: "Frame Relay ينقل البيانات على شكل Frames، أما ATM فيجمع الصوت والفيديو والبيانات.",
                },
              },
            },
            {
              id: "m26-l01-p02-q2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "Frame Relay يعتمد على ____ Switching. (اكتب الكلمة الناقصة)", answer: "Packet",
                feedback: {
                  hints: ["البطاقة الأولى.", "الكلمة الإنجليزية لـ «حزمة»."],
                  correctFeedback: "صحيح — Packet Switching.",
                  incorrectFeedback: "افحص بطاقة Frame Relay: «يعتمد على Packet Switching».",
                  explanation: "التبديل بالحزم يرسل البيانات وحدات صغيرة كلٌّ على حدة.",
                },
              },
            },
          ],
        },
        // PDF 209 — HDLC و Metro Ethernet + worksheet + module review
        {
          id: "791381-m26-l01-p03",
          title: "HDLC و Metro Ethernet",
          order: 3,
          source: src(209, 209),
          keywords: ["HDLC", "Metro Ethernet", "ربط المواقع", "منطقة حضرية"],
          blocks: [
            {
              id: "m26-l01-p03-intro", type: "text", origin: "book",
              spans: [T("تقنيات أحدث لربط المواقع.")],
            },
            {
              id: "m26-l01-p03-cards", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m26-l01-p03-c1", term: "HDLC", text: [T("بروتوكول لربط الأجهزة عبر خطوط "), L("WAN"), T(".")] },
                { id: "m26-l01-p03-c2", term: "Metro Ethernet", text: [T("ربط مواقع متعددة داخل مدينة. يمتاز بالسرعة والاستقرار وسهولة التوسعة.")] },
              ],
            },
            {
              id: "m26-l01-p03-common", type: "callout", origin: "book", kind: "tip", title: "شائع",
              spans: [L("Metro Ethernet"), T(" شائع لربط فروع داخل منطقة حضرية واحدة.")],
            },
            {
              // ENRICHMENT (Batch 8): SVG visual enrichment appended after the book content.
              id: "m26-l01-p03-visual", type: "visual", origin: "teacher-enrichment",
              visualId: "791381/m26/hdlc-vs-metro", motion: false,
              source: src(209),
              title: "مخطط: HDLC مقابل Metro Ethernet",
              alt: "مخطط مقارنة كما في الكتاب: HDLC بروتوكول لربط الأجهزة عبر خطوط WAN، و Metro Ethernet يربط مواقع متعددة داخل مدينة بسرعة واستقرار وسهولة توسعة.",
              caption: "‏HDLC يربط الأجهزة عبر خطوط WAN · Metro Ethernet يربط مواقع المدينة.",
            },
            {
              id: "m26-l01-p03-note", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلّم",
              spans: [L("Metro"), T(" تعني «المدينة»: الفكرة أن تستعمل شركة الاتصالات تقنية "), L("Ethernet"), T(" نفسها التي تعرفها من الشبكة المحلية لتربط فروعًا متعددة في المدينة، ولذلك يسهل توسيعها.")],
            },
            {
              id: "m26-l01-p03-ws", type: "practice-table", origin: "teacher-enrichment", caption: "ورقة عمل: أي تقنية WAN يصفها كل سطر؟",
              headers: ["الوصف كما في الكتاب", "التقنية"],
              columnDirs: ["rtl", "ltr"],
              rows: [
                ["ينقل البيانات على شكل Frames ويعتمد على Packet Switching", TC("Frame Relay")],
                ["ينقل صوتًا وفيديو وبيانات معًا", TC("ATM")],
                ["بروتوكول لربط الأجهزة عبر خطوط WAN", TC("HDLC")],
                ["ربط مواقع متعددة داخل مدينة", TC("Metro Ethernet")],
              ],
            },
            {
              id: "m26-l01-p03-q1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "trueFalse", prompt: "Metro Ethernet يمتاز بالسرعة والاستقرار وسهولة التوسعة.", answer: true,
                feedback: {
                  hints: ["بطاقة Metro Ethernet.", "ثلاث ميزات ذكرها الكتاب."],
                  correctFeedback: "صحيح — السرعة والاستقرار وسهولة التوسعة.",
                  incorrectFeedback: "افحص بطاقة Metro Ethernet في الصفحة.",
                  explanation: "لهذا هو شائع لربط الفروع داخل منطقة حضرية واحدة.",
                },
              },
            },
            { id: "m26-l01-p03-review", type: "heading", origin: "teacher-enrichment", text: "مراجعة الوحدة", level: 3 },
            {
              id: "m26-l01-p03-r1", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "ما WAN بحسب تعريف الكتاب؟",
                options: [opt("m26-l01-p03-r1-a", "شبكة تمتد عبر مسافات كبيرة: مدن أو دول أو قارات", true), opt("m26-l01-p03-r1-b", "شبكة داخل مبنى واحد"), opt("m26-l01-p03-r1-c", "شبكة لاسلكية في غرفة")],
                feedback: {
                  hints: ["صفحة «الشبكة الواسعة WAN»، التعريف.", "الكلمة المفتاحية: مسافات كبيرة."],
                  correctFeedback: "صحيح — مسافات كبيرة.",
                  incorrectFeedback: "افحص تعريف WAN في الصفحة الأولى.",
                  explanation: "WAN تربط شبكات بعيدة مع بعضها عبر مسافات شاسعة.",
                },
              },
            },
            {
              id: "m26-l01-p03-r2", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "shortInput", prompt: "ما التقنية القديمة التي تنقل البيانات على شكل Frames؟ (بالإنجليزية)", answer: "Frame Relay",
                feedback: {
                  hints: ["صفحة «تقنيات WAN القديمة»، البطاقة الأولى.", "كلمتان، الأولى Frame."],
                  correctFeedback: "صحيح — Frame Relay.",
                  incorrectFeedback: "افحص بطاقات صفحة «تقنيات WAN القديمة».",
                  explanation: "Frame Relay يعتمد على Packet Switching.",
                },
              },
            },
            {
              id: "m26-l01-p03-r3", type: "practice", origin: "teacher-enrichment",
              question: {
                kind: "multipleChoice", prompt: "أي تقنية تربط مواقع متعددة داخل مدينة؟",
                options: [opt("m26-l01-p03-r3-a", "Metro Ethernet", true), opt("m26-l01-p03-r3-b", "HDLC"), opt("m26-l01-p03-r3-c", "ATM")],
                feedback: {
                  hints: ["صفحة «HDLC و Metro Ethernet».", "الكلمة Metro."],
                  correctFeedback: "صحيح — Metro Ethernet.",
                  incorrectFeedback: "افحص بطاقة Metro Ethernet.",
                  explanation: "HDLC بروتوكول لخطوط WAN، و ATM تقنية قديمة تنقل الصوت والفيديو والبيانات.",
                },
              },
            },
          ],
        },
      ],
    },
  ],
};

export default m26;
