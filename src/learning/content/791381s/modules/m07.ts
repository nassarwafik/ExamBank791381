// Learning Materials — «أوراق تلخيص للمراجعة» (791381s), section 7 «الكوابل وعنوان MAC».
//
// Verbatim conversion of booklet PDF pages 23–25 (the section header box → an opener page; each numbered sub-topic → one
// reader page). Every converted block is origin:"book": nothing is added, removed or reworded; bold runs are `strong`, printed box
// labels are the callout titles, the monospace MAC boxes are code blocks.
//
// Enrichment (docs/enterprise-791381s-enrichment-plan.md, Phases 2–4): teacher-enrichment blocks (visuals / activities reused from
// course 791381 after checking their labels against this section, and the end-of-unit «تدريبات الوحدة» lesson) are ADDED after the
// book blocks they explain. The book blocks above stay verbatim — pinned by the book lock (bookLock.test.ts).

import type { ContentModule, ContentSource } from "../../types";

const CID = "791381s";
const src = (pdf: number, end?: number): ContentSource =>
  end ? { kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end } : { kind: "book", sourceId: CID, pdfPageStart: pdf };

const m07: ContentModule = {
  id: "791381s-m07",
  title: "الكوابل وعنوان MAC",
  order: 7,
  lessons: [
    {
      id: "791381s-m07-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381s-m07-l00-p01",
          title: "الكوابل وعنوان MAC",
          order: 1,
          layout: "opener",
          source: src(23),
          blocks: [
            {
              id: "m07-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الدفعة الثانية · الوحدة السابعة · كتاب ص 61–65", unitNumber: "07", title: "الكوابل وعنوان MAC",
              subtitle: "كيف تنتقل البيانات؟ وما هو العنوان الفيزيائي للجهاز؟",
            },
          ],
        },
      ],
    },
    {
      id: "791381s-m07-l01",
      title: "الكوابل وعنوان MAC",
      order: 1,
      pages: [
        {
          id: "791381s-m07-l01-p01",
          title: "الكوابل المستعملة في الشبكات",
          order: 1,
          source: src(23, 24),
          blocks: [
            {
              id: "m07-l01-p01-def", type: "text", origin: "book",
              spans: [{ text: "الكوابل هي الطريق الذي تنتقل عبره البيانات بين الأجهزة.", style: "strong" }],
            },
            {
              id: "m07-l01-p01-intro", type: "text", origin: "book",
              spans: [{ text: "البيانات تنتقل في الكابل كإشارات كهربائية (في النحاس) أو كضوء (في الألياف). نوع الكابل يؤثّر على السرعة والمسافة والتشويش." }],
            },
            {
              id: "m07-l01-p01-table", type: "table", origin: "book",
              headers: ["الكابل", "اسمه بالعربية", "صفته", "يُستعمل لـ"],
              rows: [
                ["UTP", "زوج ملتوٍ غير محمي", "غلاف بلاستيكي فقط، بدون طبقة حماية. شائع ورخيص.", "شبكات البيت والمدرسة"],
                ["STP", "زوج ملتوٍ محمي", "فيه طبقة حماية معدنية. أفضل ضد التشويش.", "أماكن فيها تشويش"],
                ["Fiber Optic", "ألياف بصرية", "لبّ زجاجي ينقل الضوء. سرعة عالية جدًا.", "مسافات طويلة جدًا"],
                ["Coaxial", "كابل محوري", "موصّل نحاسي في المنتصف.", "التلفزيون والإنترنت عبر الكابل"],
              ],
            },
            {
              id: "m07-l01-p01-rule", type: "callout", origin: "book", kind: "summary", title: "قاعدة",
              spans: [
                { text: "كلما زادت " },
                { text: "الحماية والجودة", style: "strong" },
                { text: "، كان الكابل أفضل ضد التشويش وفقدان البيانات. الألياف البصرية تستعمل الضوء، لذلك سرعتها عالية جدًا." },
              ],
            },
            {
              // ENRICHMENT — interactive-diagram / cable-comparison / v1 (reused from 791381-m11): the four cables of the
              // table with the booklet's own traits; the scenarios are the table's «يُستعمل لـ» column.
              id: "m07-l01-p01-cables", type: "interactive-diagram", origin: "teacher-enrichment",
              interactionType: "cable-comparison", version: 1,
              title: "قارن واختر الكابل المناسب",
              description: "اضغط على كل كابل لتقرأ صفته كما وردت في الجدول، ثم اختر حالة وحدّد الكابل الذي يُستعمل لها.",
              source: src(23, 24),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "UTP: زوج ملتوٍ غير محمي، غلاف بلاستيكي فقط بدون طبقة حماية، شائع ورخيص، يُستعمل لشبكات البيت والمدرسة. STP: زوج ملتوٍ محمي، فيه طبقة حماية معدنية، أفضل ضد التشويش، يُستعمل في أماكن فيها تشويش. Fiber Optic: ألياف بصرية، لبّ زجاجي ينقل الضوء، سرعة عالية جدًا، يُستعمل لمسافات طويلة جدًا. Coaxial: كابل محوري، موصّل نحاسي في المنتصف، يُستعمل للتلفزيون والإنترنت عبر الكابل. القاعدة: كلما زادت الحماية والجودة، كان الكابل أفضل ضد التشويش وفقدان البيانات." },
              config: {
                cables: [
                  { id: "utp", name: "UTP", title: "زوج ملتوٍ غير محمي", traits: ["غلاف بلاستيكي فقط، بدون طبقة حماية.", "شائع ورخيص."], shield: false, kind: "pair" },
                  { id: "stp", name: "STP", title: "زوج ملتوٍ محمي", traits: ["فيه طبقة حماية معدنية.", "أفضل ضد التشويش."], shield: true, kind: "pair" },
                  { id: "fiber", name: "Fiber Optic", title: "ألياف بصرية", traits: ["لبّ زجاجي ينقل الضوء.", "سرعة عالية جدًا."], shield: false, kind: "fiber" },
                  { id: "coaxial", name: "Coaxial", title: "كابل محوري", traits: ["موصّل نحاسي في المنتصف."], shield: false, kind: "coaxial" },
                ],
                scenarios: [
                  { id: "home", prompt: "شبكة في البيت أو في المدرسة.", answer: "utp", why: "UTP شائع ورخيص، ويُستعمل لشبكات البيت والمدرسة." },
                  { id: "noisy", prompt: "شبكة في مكان فيه تشويش.", answer: "stp", why: "STP فيه طبقة حماية معدنية، فهو أفضل ضد التشويش." },
                  { id: "far", prompt: "وصلة لمسافة طويلة جدًا.", answer: "fiber", why: "الألياف البصرية لبّ زجاجي ينقل الضوء بسرعة عالية جدًا، وتُستعمل لمسافات طويلة جدًا." },
                  { id: "tv", prompt: "التلفزيون والإنترنت عبر الكابل.", answer: "coaxial", why: "الكابل المحوري (Coaxial) يُستعمل للتلفزيون والإنترنت عبر الكابل." },
                ],
                rule: "كلما زادت الحماية والجودة، كان الكابل أفضل ضد التشويش وفقدان البيانات.",
                scenarioNote: "الحالات مأخوذة من عمود «يُستعمل لـ» في الجدول.",
              },
            },
          ],
        },
        {
          id: "791381s-m07-l01-p02",
          title: "عنوان MAC (MAC Address)",
          order: 2,
          source: src(24, 25),
          blocks: [
            {
              id: "m07-l01-p02-def", type: "text", origin: "book",
              spans: [{ text: "عنوان MAC = رقم فيزيائي خاص بكرت الشبكة في الجهاز.", style: "strong" }],
            },
            {
              id: "m07-l01-p02-intro", type: "text", origin: "book",
              spans: [{ text: "كل كرت شبكة يأتي من المصنع وعليه رقم MAC خاص به، مثل رقم الهوية للإنسان." }],
            },
            {
              id: "m07-l01-p02-points", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m07-l01-p02-pt1", text: [{ text: "يكون " }, { text: "فريدًا", style: "strong" }, { text: " لكل جهاز تقريبًا." }] },
                { id: "m07-l01-p02-pt2", text: [{ text: "يتكوّن من " }, { text: "12 منزلة سادس عشرية", style: "strong" }, { text: " (Hex)." }] },
                { id: "m07-l01-p02-pt3", text: [{ text: "يعمل في " }, { text: "الطبقة الثانية", style: "strong" }, { text: " من نموذج OSI." }] },
                { id: "m07-l01-p02-pt4", text: [{ text: "يستخدمه " }, { text: "Switch", style: "strong" }, { text: " لمعرفة الجهاز المقصود." }] },
              ],
            },
            { id: "m07-l01-p02-mac", type: "code", origin: "book", language: "text", dir: "ltr", code: "A0:02:AF:2D:10:22" },
            {
              id: "m07-l01-p02-mac-note", type: "text", origin: "book",
              spans: [{ text: "مثال على عنوان MAC: 6 أزواج × 2 = 12 رمزًا" }],
            },
            { id: "m07-l01-p02-bcast", type: "code", origin: "book", language: "text", dir: "ltr", code: "FF:FF:FF:FF:FF:FF" },
            {
              id: "m07-l01-p02-bcast-note", type: "text", origin: "book",
              spans: [{ text: "عنوان البث (Broadcast) في MAC" }],
            },
            {
              // ENRICHMENT — interactive-diagram / mac-address-anatomy / v1 (reused from 791381-m11): the booklet's example
              // MAC as six pairs (6 × 2 = 12), the booklet's broadcast MAC, and a "which string has the MAC shape?" task
              // whose IP candidate is the booklet's own IP example (192.168.1.5).
              id: "m07-l01-p02-anatomy", type: "interactive-diagram", origin: "teacher-enrichment",
              interactionType: "mac-address-anatomy", version: 1,
              title: "شكل عنوان MAC",
              description: "اضغط على أي زوج لترى منزلتيه، واضغط «عنوان البث» لمقارنته بالمثال، ثم اختر النص الذي له شكل عنوان MAC.",
              source: src(24, 25),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "عنوان MAC رقم فيزيائي خاص بكرت الشبكة في الجهاز، يتكوّن من 12 منزلة سادس عشرية (Hex): 6 أزواج × 2 = 12 رمزًا، مثل A0:02:AF:2D:10:22. يعمل في الطبقة الثانية من نموذج OSI ويستخدمه Switch لمعرفة الجهاز المقصود. عنوان البث (Broadcast) في MAC هو FF:FF:FF:FF:FF:FF." },
              config: {
                example: "A0:02:AF:2D:10:22",
                broadcast: "FF:FF:FF:FF:FF:FF",
                broadcastLabel: "عنوان البث (Broadcast)",
                normalLabel: "مثال على عنوان MAC",
                facts: ["رقم فيزيائي خاص بكرت الشبكة في الجهاز", "يتكوّن من 12 منزلة سادس عشرية (Hex)", "يعمل في الطبقة الثانية من نموذج OSI", "يستخدمه Switch لمعرفة الجهاز المقصود"],
                hexDigits: "0 1 2 3 4 5 6 7 8 9 A B C D E F",
                task: {
                  prompt: "أي نص له شكل عنوان MAC (12 منزلة سادس عشرية في 6 أزواج)؟",
                  candidates: [
                    { value: "192.168.1.5", why: "هذا شكل عنوان IP كما في جدول المقارنة، وليس 12 منزلة سادس عشرية." },
                    { value: "A0:02:AF:2D:10:22", why: "6 أزواج × 2 = 12 رمزًا سادس عشريًا: هذا شكل عنوان MAC." },
                    { value: "A0:02:AF:2D", why: "4 أزواج فقط = 8 رموز؛ عنوان MAC يتكوّن من 12 منزلة." },
                  ],
                },
              },
            },
            { id: "m07-l01-p02-uses-h", type: "heading", origin: "book", level: 3, text: "استخدامات عنوان MAC" },
            {
              id: "m07-l01-p02-uses", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m07-l01-p02-u1", text: [{ text: "تمييز الأجهزة:", style: "strong" }, { text: " نعرف كل جهاز داخل الشبكة." }] },
                { id: "m07-l01-p02-u2", text: [{ text: "توجيه البيانات:", style: "strong" }, { text: " السويتش يستعمله ليرسل للمقصود." }] },
                { id: "m07-l01-p02-u3", text: [{ text: "الأمان:", style: "strong" }, { text: " يمكن منع أجهزة غير مسموحة." }] },
                { id: "m07-l01-p02-u4", text: [{ text: "إدارة الشبكة:", style: "strong" }, { text: " تتبّع الأجهزة وتنظيمها." }] },
                { id: "m07-l01-p02-u5", text: [{ text: "الجدار الناري:", style: "strong" }, { text: " قد يُستعمل للتحكم بالوصول." }] },
              ],
            },
            { id: "m07-l01-p02-ipmac-h", type: "heading", origin: "book", level: 3, text: "الفرق بين IP و MAC" },
            {
              id: "m07-l01-p02-ipmac", type: "table", origin: "book",
              headers: ["وجه المقارنة", "عنوان IP", "عنوان MAC"],
              rows: [
                ["نوعه", "عنوان منطقي (رقم في الشبكة)", "عنوان فيزيائي (في كرت الشبكة)"],
                ["هل يتغيّر؟", "قد يتغيّر", "ثابت غالبًا"],
                ["شكله", "192.168.1.5", "A0:02:AF:2D:10:22"],
                ["طبقة OSI", "الثالثة (الشبكة)", "الثانية (ربط البيانات)"],
                ["الجهاز الذي يستعمله", "Router", "Switch"],
              ],
            },
          ],
        },
      ],
    },
    {
      // «تدريبات الوحدة» — ADDED enrichment: an end-of-unit exercise page after the booklet's own pages. Every question is
      // answered by the section's printed text above (the explanation quotes it). The book pages are unchanged (book lock).
      id: "791381s-m07-l02",
      title: "تدريبات الوحدة",
      order: 2,
      pages: [
        {
          id: "791381s-m07-l02-p01",
          title: "تدريبات الوحدة: الكوابل وعنوان MAC",
          order: 1,
          layout: "practice",
          source: src(23, 25),
          blocks: [
            {
              id: "m07-l02-p01-q01", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "ما هي الكوابل في الشبكة؟",
                options: [{ id: "a", text: "أجهزة تحفظ البيانات داخلها." }, { id: "b", text: "الطريق الذي تنتقل عبره البيانات بين الأجهزة.", correct: true }, { id: "c", text: "برامج تحمي الشبكة من التشويش." }, { id: "d", text: "عناوين تميّز كل جهاز في الشبكة." }],
                feedback: { explanation: "الكوابل هي الطريق الذي تنتقل عبره البيانات بين الأجهزة." },
              },
            },
            {
              id: "m07-l02-p01-q02", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "أي كابل فيه لبّ زجاجي ينقل الضوء، وسرعته عالية جدًا؟",
                options: [{ id: "a", text: "UTP" }, { id: "b", text: "STP" }, { id: "c", text: "Coaxial" }, { id: "d", text: "Fiber Optic", correct: true }],
                feedback: { explanation: "Fiber Optic (ألياف بصرية): لبّ زجاجي ينقل الضوء. سرعة عالية جدًا." },
              },
            },
            {
              id: "m07-l02-p01-q03", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "من كم منزلة سادس عشرية (Hex) يتكوّن عنوان MAC؟",
                options: [{ id: "a", text: "6" }, { id: "b", text: "4" }, { id: "c", text: "12", correct: true }],
                feedback: { explanation: "عنوان MAC يتكوّن من 12 منزلة سادس عشرية (Hex): 6 أزواج × 2 = 12 رمزًا." },
              },
            },
            {
              id: "m07-l02-p01-q04", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "أي مما يلي مثال على عنوان MAC؟",
                options: [{ id: "a", text: "A0:02:AF:2D:10:22", correct: true }, { id: "b", text: "192.168.1.5" }, { id: "c", text: "A0:02:AF" }],
                feedback: { explanation: "مثال على عنوان MAC: A0:02:AF:2D:10:22 (6 أزواج × 2 = 12 رمزًا). أما 192.168.1.5 فهو شكل عنوان IP." },
              },
            },
            {
              id: "m07-l02-p01-q05", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "في أي طبقة من نموذج OSI يعمل عنوان MAC؟",
                options: [{ id: "a", text: "الطبقة الأولى" }, { id: "b", text: "الطبقة الثالثة (الشبكة)" }, { id: "c", text: "الطبقة الثانية (ربط البيانات)", correct: true }, { id: "d", text: "الطبقة السابعة" }],
                feedback: { explanation: "عنوان MAC يعمل في الطبقة الثانية من نموذج OSI (ربط البيانات)، أما IP ففي الثالثة (الشبكة)." },
              },
            },
            {
              id: "m07-l02-p01-q06", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "multipleChoice", prompt: "أي جهاز يستعمل عنوان MAC لمعرفة الجهاز المقصود ويرسل له البيانات؟",
                options: [{ id: "a", text: "Router" }, { id: "b", text: "Switch", correct: true }, { id: "c", text: "كابل Coaxial" }],
                feedback: { explanation: "يستخدمه Switch لمعرفة الجهاز المقصود: «السويتش يستعمله ليرسل للمقصود». أما Router فيستعمل عنوان IP." },
              },
            },
            {
              id: "m07-l02-p01-q07", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "كابل UTP فيه طبقة حماية معدنية تجعله أفضل ضد التشويش.", answer: false, feedback: { explanation: "UTP غلاف بلاستيكي فقط، بدون طبقة حماية. الكابل الذي فيه طبقة حماية معدنية وأفضل ضد التشويش هو STP." } },
            },
            {
              id: "m07-l02-p01-q08", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "FF:FF:FF:FF:FF:FF هو عنوان البث (Broadcast) في MAC.", answer: true, feedback: { explanation: "FF:FF:FF:FF:FF:FF — عنوان البث (Broadcast) في MAC." } },
            },
            {
              id: "m07-l02-p01-q09", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: { kind: "trueFalse", prompt: "عنوان IP ثابت غالبًا، أما عنوان MAC فقد يتغيّر.", answer: false, feedback: { explanation: "العكس: عنوان IP قد يتغيّر، أما عنوان MAC فثابت غالبًا." } },
            },
            {
              id: "m07-l02-p01-q10", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "matching", prompt: "صِل كل كابل بما يُستعمل له:",
                left: [{ id: "utp", text: "UTP" }, { id: "stp", text: "STP" }, { id: "fiber", text: "Fiber Optic" }, { id: "coax", text: "Coaxial" }],
                right: [{ id: "r1", text: "مسافات طويلة جدًا" }, { id: "r2", text: "التلفزيون والإنترنت عبر الكابل" }, { id: "r3", text: "شبكات البيت والمدرسة" }, { id: "r4", text: "أماكن فيها تشويش" }],
                pairs: { utp: "r3", stp: "r4", fiber: "r1", coax: "r2" },
                feedback: { explanation: "UTP: شبكات البيت والمدرسة. STP: أماكن فيها تشويش. Fiber Optic: مسافات طويلة جدًا. Coaxial: التلفزيون والإنترنت عبر الكابل." },
              },
            },
            {
              id: "m07-l02-p01-q11", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "classify", prompt: "صنّف كل صفة: هل هي لعنوان IP أم لعنوان MAC؟",
                groups: [{ id: "ip", text: "عنوان IP" }, { id: "mac", text: "عنوان MAC" }],
                items: [
                  { id: "i1", text: "عنوان منطقي (رقم في الشبكة)" },
                  { id: "i2", text: "عنوان فيزيائي (في كرت الشبكة)" },
                  { id: "i3", text: "ثابت غالبًا" },
                  { id: "i4", text: "قد يتغيّر" },
                  { id: "i5", text: "يستعمله Router" },
                  { id: "i6", text: "يستعمله Switch" },
                ],
                assign: { i1: "ip", i2: "mac", i3: "mac", i4: "ip", i5: "ip", i6: "mac" },
                feedback: { explanation: "عنوان IP: منطقي (رقم في الشبكة)، قد يتغيّر، الطبقة الثالثة، يستعمله Router. عنوان MAC: فيزيائي (في كرت الشبكة)، ثابت غالبًا، الطبقة الثانية، يستعمله Switch." },
              },
            },
            {
              id: "m07-l02-p01-q12", type: "practice", origin: "teacher-enrichment", reveal: true,
              question: {
                kind: "wordBank", prompt: "أكمل الفراغات من مخزن الكلمات:",
                segments: ["كلما زادت ", { blank: "b1" }, " و", { blank: "b2" }, "، كان الكابل أفضل ضد التشويش وفقدان البيانات. الألياف البصرية تستعمل ", { blank: "b3" }, "، لذلك سرعتها عالية جدًا."],
                bank: ["الضوء", "الحماية", "الإشارات الكهربائية", "الجودة"],
                answers: { b1: "الحماية", b2: "الجودة", b3: "الضوء" },
                feedback: { explanation: "قاعدة: كلما زادت الحماية والجودة، كان الكابل أفضل ضد التشويش وفقدان البيانات. الألياف البصرية تستعمل الضوء، لذلك سرعتها عالية جدًا." },
              },
            },
            { id: "m07-l02-p01-lib-t08", type: "library-training", origin: "teacher-enrichment", trainingId: "T08", label: "تدريب 8", requiredModuleId: "791381s-m07" },
          ],
        },
      ],
    },
  ],
};

export default m07;
