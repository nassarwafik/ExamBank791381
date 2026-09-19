// Learning Materials — Book 791381, module m02 (الأعداد والموازين). REAL converted body.
//
// Faithful native conversion of source PDF pages 14 (unit opener, Phase 3B) + 15–22 (number systems, Phase 3C) +
// 23 (conversions summary — the Unit-2 closing page, Phase 3D), 1 source page → 1 interactive page. Book-derived
// blocks are origin:"book"; the only teacher-enrichment block is a clarification note on the exercises page (the
// printed QR codes are not shown in the reader). Wording is kept faithful to the source (verified against the
// RENDERED pages). ALL numeric/technical strings (binary/decimal/hex, place values, equations) render LTR so RTL
// never reverses their digit order.
//
// This module is now COMPLETE: PDF 23 (خلاصة التحويلات) is the last page of Unit 2 (PDF 24 opens Unit 3, عناوين IP),
// and every page the manifest lists for m02 (PDF 14, 15–22, 23) now has a real body — so `partial` is dropped and an
// unexpectedly-absent page would again be a genuine integrity error rather than a "قيد الإعداد" state.

import type { ContentModule, ContentSource } from "../../types";

const src = (pdf: number, printed?: number): ContentSource => ({ kind: "book", sourceId: "791381", pdfPageStart: pdf, printedPage: printed });

const m02: ContentModule = {
  id: "791381-m02",
  title: "الأعداد والموازين",
  shortTitle: "الأعداد",
  order: 2,
  // Complete: every manifest page of m02 (PDF 14, 15–22, 23) is converted, so no `partial` flag.
  lessons: [
    // ── l00 — unit opener (PDF 14, from Phase 3B) ─────────────────────────────────────────────────────────────
    {
      id: "791381-m02-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381-m02-l00-p01",
          title: "الأعداد والموازين",
          order: 1,
          layout: "opener",
          source: src(14),
          blocks: [
            {
              id: "m02-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الوحدة الثانية", unitNumber: "02", title: "الأعداد والموازين",
              subtitle: "العشري، الثنائي، السادس عشر، والتحويل بينها.",
              goal: "الهدف: فكرة أساسية + مثال واضح + تدريب",
            },
          ],
        },
      ],
    },

    // ── l01 — number systems & conversion (PDF 15–23, all converted; PDF 23 filled in Phase 3D) ──────────────────
    // Reading order is the exact source sequence 15 → 22. The three Phase-2 skeleton pages (p01=PDF16, p02=PDF18,
    // p03=PDF20) keep their stable IDs; only their `order` is adjusted to interleave the newly-added pages.
    {
      id: "791381-m02-l01",
      title: "أنظمة العد والتحويل",
      order: 1,
      pages: [
        // PDF 15 — العشري والثنائي (new page)
        {
          id: "791381-m02-l01-p04",
          title: "العشري والثنائي",
          order: 1,
          source: src(15, 13),
          blocks: [
            {
              id: "m02-l01-p04-systems", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m02-l01-p04-d", term: "العدد العشري", text: [{ text: "النظام الذي نستعمله يوميًا، يستخدم الأرقام من 0 إلى 9. مثال: " }, { text: "123", dir: "ltr", style: "code" }] },
                { id: "m02-l01-p04-b", term: "العدد الثنائي", text: [{ text: "النظام الذي يفهمه الحاسوب، يستخدم رقمين فقط: 0 و1. مثال: " }, { text: "1010", dir: "ltr", style: "code" }] },
              ],
            },
            {
              id: "m02-l01-p04-computer", type: "callout", origin: "book", kind: "tip", title: "في الحاسوب",
              spans: [{ text: "الرقم 0 يعني إطفاء، والرقم 1 يعني تشغيل. كل البيانات في النهاية أصفار وآحاد." }],
            },
          ],
        },
        // PDF 16 — تحويل من الثنائي للعشري (existing id p01)
        {
          id: "791381-m02-l01-p01",
          title: "تحويل من الثنائي للعشري",
          order: 2,
          source: src(16, 14),
          blocks: [
            {
              id: "m02-l01-p01-method", type: "callout", origin: "book", kind: "important", title: "الطريقة",
              spans: [{ text: "نستخدم الصناديق: نضع كل رقم ثنائي تحت قيمته، ثم نجمع فقط القيم التي تحتها الرقم 1." }],
            },
            { id: "m02-l01-p01-ex", type: "text", origin: "book", spans: [{ text: "مثال: " }, { text: "01111011", dir: "ltr", style: "code" }] },
            {
              id: "m02-l01-p01-boxes", type: "table", origin: "book", dir: "ltr", caption: "الصناديق",
              headers: ["128", "64", "32", "16", "8", "4", "2", "1"],
              rows: [["0", "1", "1", "1", "1", "0", "1", "1"]],
            },
            { id: "m02-l01-p01-sum", type: "text", origin: "book", spans: [{ text: "64 + 32 + 16 + 8 + 2 + 1 = 123", dir: "ltr", style: "code" }] },
            {
              id: "m02-l01-p01-result", type: "callout", origin: "book", kind: "summary", title: "النتيجة",
              spans: [{ text: "إذن " }, { text: "01111011", dir: "ltr", style: "code" }, { text: " في الثنائي تساوي " }, { text: "123", dir: "ltr", style: "code" }, { text: " في العشري. اجمع قيم الصناديق المضيئة فقط." }],
            },
          ],
        },
        // PDF 17 — تحويل من العشري للثنائي (new page)
        {
          id: "791381-m02-l01-p05",
          title: "تحويل من العشري للثنائي",
          order: 3,
          source: src(17, 15),
          blocks: [
            {
              id: "m02-l01-p05-method", type: "callout", origin: "book", kind: "important", title: "الطريقة",
              spans: [{ text: "نختار الصناديق التي مجموعها يساوي العدد المطلوب، ونكتب 1 تحت المستعمَل و0 تحت غير المستعمَل." }],
            },
            { id: "m02-l01-p05-ex", type: "text", origin: "book", spans: [{ text: "مثال: حوّل " }, { text: "44", dir: "ltr", style: "code" }, { text: " إلى ثنائي" }] },
            {
              id: "m02-l01-p05-boxes", type: "table", origin: "book", dir: "ltr", caption: "الصناديق",
              headers: ["128", "64", "32", "16", "8", "4", "2", "1"],
              rows: [["0", "0", "1", "0", "1", "1", "0", "0"]],
            },
            { id: "m02-l01-p05-sum", type: "text", origin: "book", spans: [{ text: "32 + 8 + 4 = 44", dir: "ltr", style: "code" }] },
            {
              id: "m02-l01-p05-result", type: "callout", origin: "book", kind: "summary", title: "النتيجة",
              spans: [{ text: "إذن " }, { text: "44", dir: "ltr", style: "code" }, { text: " في العشري تساوي " }, { text: "00101100", dir: "ltr", style: "code" }, { text: " في الثنائي. اكتب 1 تحت كل صندوق استعملته." }],
            },
          ],
        },
        // PDF 18 — النظام السادس عشري (Hex) (existing id p02; title corrected to the authoritative rendered source)
        {
          id: "791381-m02-l01-p02",
          title: "النظام السادس عشري (Hex)",
          order: 4,
          source: src(18, 16),
          blocks: [
            {
              id: "m02-l01-p02-parts", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m02-l01-p02-idea", term: "الفكرة", text: [{ text: "نظام ترقيم يستخدم 16 رمزًا." }] },
                { id: "m02-l01-p02-digits", term: "الأرقام", text: [{ text: "من 0 إلى 9." }] },
                { id: "m02-l01-p02-letters", term: "الأحرف", text: [{ text: "A B C D E F", dir: "ltr", style: "code" }] },
              ],
            },
            { id: "m02-l01-p02-symbols", type: "text", origin: "book", spans: [{ text: "الرموز: " }, { text: "0 1 2 3 4 5 6 7 8 9 A B C D E F", dir: "ltr", style: "code" }] },
            {
              id: "m02-l01-p02-values", type: "table", origin: "book", dir: "ltr", caption: "قيم الأحرف",
              headers: ["A", "B", "C", "D", "E", "F"],
              rows: [["10", "11", "12", "13", "14", "15"]],
            },
            {
              id: "m02-l01-p02-why", type: "callout", origin: "book", kind: "tip", title: "لماذا Hex؟",
              spans: [{ text: "يُستعمل كثيرًا في الحوسبة لأنه يختصر الأعداد الثنائية الطويلة بشكل كبير." }],
            },
          ],
        },
        // PDF 19 — جدول السادس عشر والثنائي (new page). NOTE: the SOURCE table itself lists only 0–6 and 8–E
        // (it omits 7 and F); reproduced faithfully — not "completed".
        {
          id: "791381-m02-l01-p06",
          title: "جدول السادس عشر والثنائي",
          order: 5,
          source: src(19, 17),
          blocks: [
            {
              id: "m02-l01-p06-table", type: "table", origin: "book", caption: "من السادس عشر إلى الثنائي",
              headers: ["السادس عشر", "الثنائي"],
              rows: [
                ["0", "0000"], ["1", "0001"], ["2", "0010"], ["3", "0011"], ["4", "0100"], ["5", "0101"], ["6", "0110"],
                ["8", "1000"], ["9", "1001"], ["A", "1010"], ["B", "1011"], ["C", "1100"], ["D", "1101"], ["E", "1110"],
              ],
            },
            {
              id: "m02-l01-p06-key", type: "callout", origin: "book", kind: "remember", title: "احفظ الفكرة",
              spans: [{ text: "كل منزلة سادسية عشرية تساوي 4 بتات (أرقام) ثنائية بالضبط." }],
            },
          ],
        },
        // PDF 20 — من السادس عشر إلى الثنائي (existing id p03)
        {
          id: "791381-m02-l01-p03",
          title: "من السادس عشر إلى الثنائي",
          order: 6,
          source: src(20, 18),
          blocks: [
            {
              id: "m02-l01-p03-rule", type: "callout", origin: "book", kind: "important", title: "القاعدة",
              spans: [{ text: "نأخذ كل رمز Hex ونحوّله إلى 4 أرقام ثنائية حسب الجدول." }],
            },
            { id: "m02-l01-p03-ex", type: "text", origin: "book", spans: [{ text: "مثال: " }, { text: "A23F", dir: "ltr", style: "code" }] },
            {
              id: "m02-l01-p03-boxes", type: "table", origin: "book", dir: "ltr", caption: "كل رمز إلى 4 بتات",
              headers: ["A", "2", "3", "F"],
              rows: [["1010", "0010", "0011", "1111"]],
            },
            { id: "m02-l01-p03-result", type: "text", origin: "book", spans: [{ text: "A23F = 1010 0010 0011 1111", dir: "ltr", style: "code" }] },
            {
              id: "m02-l01-p03-other", type: "callout", origin: "book", kind: "tip", title: "مثال آخر",
              spans: [{ text: "9A2C5 = 1001 1010 0010 1100 0101", dir: "ltr", style: "code" }],
            },
            {
              id: "m02-l01-p03-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [{ text: "رتّب المجموعات من اليسار لليمين بنفس ترتيب رموز Hex دون خلط." }],
            },
          ],
        },
        // PDF 21 — من الثنائي إلى السادس عشر (new page)
        {
          id: "791381-m02-l01-p07",
          title: "من الثنائي إلى السادس عشر",
          order: 7,
          source: src(21, 19),
          blocks: [
            {
              id: "m02-l01-p07-steps", type: "list", origin: "book", variant: "ordered", title: "الطريقة",
              items: [
                { id: "m02-l01-p07-s1", text: [{ text: "نقسّم العدد الثنائي إلى مجموعات من 4 بتات من اليمين لليسار." }] },
                { id: "m02-l01-p07-s2", text: [{ text: "إذا كانت المجموعة الأخيرة ناقصة نضيف أصفارًا من اليسار." }] },
                { id: "m02-l01-p07-s3", text: [{ text: "نحوّل كل مجموعة إلى رمز Hex حسب الجدول." }] },
              ],
            },
            { id: "m02-l01-p07-exlabel", type: "text", origin: "book", spans: [{ text: "مثال" }] },
            {
              id: "m02-l01-p07-boxes", type: "table", origin: "book", dir: "ltr", caption: "كل 4 بتات إلى رمز",
              headers: ["0010", "0101", "1010", "1001"],
              rows: [["2", "5", "A", "9"]],
            },
            { id: "m02-l01-p07-result", type: "text", origin: "book", spans: [{ text: "0010 0101 1010 1001 = 25A9", dir: "ltr", style: "code" }] },
            {
              id: "m02-l01-p07-final", type: "callout", origin: "book", kind: "summary", title: "في الحل النهائي",
              spans: [{ text: "يجب أن تكون كل مجموعة مكوّنة من 4 أرقام بالضبط: أكمل بالأصفار عند الحاجة." }],
            },
          ],
        },
        // PDF 22 — تدريبات قصيرة (new page). The four exercises are solved electronically via printed QR codes; the
        // reader lists them (no QR image, no external link, no answers).
        {
          id: "791381-m02-l01-p08",
          title: "تدريبات قصيرة",
          order: 8,
          source: src(22, 20),
          blocks: [
            {
              id: "m02-l01-p08-list", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m02-l01-p08-t1", term: "تدريب 1", text: [{ text: "افتح الرمز بكاميرا الهاتف لحل التدريب إلكترونيًا مع التفسير ومراجعة الأخطاء." }] },
                { id: "m02-l01-p08-t2", term: "تدريب 2", text: [{ text: "افتح الرمز بكاميرا الهاتف لحل التدريب إلكترونيًا مع التفسير ومراجعة الأخطاء." }] },
                { id: "m02-l01-p08-t3", term: "تدريب 3", text: [{ text: "افتح الرمز بكاميرا الهاتف لحل التدريب إلكترونيًا مع التفسير ومراجعة الأخطاء." }] },
                { id: "m02-l01-p08-t4", term: "تدريب 4", text: [{ text: "افتح الرمز بكاميرا الهاتف لحل التدريب إلكترونيًا مع التفسير ومراجعة الأخطاء." }] },
              ],
            },
            {
              id: "m02-l01-p08-important", type: "callout", origin: "book", kind: "important", title: "مهم",
              spans: [{ text: "لا تحفظ الأجوبة فقط — احفظ طريقة الصناديق وجدول التحويل، فهي ما يُسأل عنه في الامتحان." }],
            },
            {
              id: "m02-l01-p08-qrnote", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلم",
              source: src(22, 20),
              spans: [{ text: "رموز التدريبات (QR) موجودة في الكتاب المطبوع وتُفتح بكاميرا الهاتف لحلّها إلكترونيًا؛ تعرض نسخة القراءة قائمة التدريبات فقط." }],
            },
          ],
        },
        // PDF 23 — خلاصة التحويلات (fills the existing p09 skeleton; the LAST page of Unit 2 — PDF 24 opens Unit 3).
        // The source's four badge labels use a compact "A ← B" arrow whose direction is bidi-ambiguous under RTL; the
        // conversion is preserved faithfully using the book's own directional phrasing ("من X إلى Y") so no
        // technical label can render reversed. The four method bodies and the closing callout are verbatim.
        {
          id: "791381-m02-l01-p09",
          title: "خلاصة التحويلات",
          order: 9,
          source: src(23, 21),
          blocks: [
            {
              id: "m02-l01-p09-summary", type: "list", origin: "book", variant: "cards", title: "الطرق الأربع",
              items: [
                { id: "m02-l01-p09-b2d", term: "من الثنائي إلى العشري", text: [{ text: "استعمل الصناديق ثم اجمع القيم التي تحتها 1." }] },
                { id: "m02-l01-p09-d2b", term: "من العشري إلى الثنائي", text: [{ text: "ابنِ العدد من قيم الصناديق ثم اكتب 1 أو 0." }] },
                { id: "m02-l01-p09-h2b", term: "من Hex إلى الثنائي", text: [{ text: "كل رمز Hex يتحوّل إلى 4 بتات." }] },
                { id: "m02-l01-p09-b2h", term: "من الثنائي إلى Hex", text: [{ text: "قسّم إلى مجموعات من 4 ثم استعمل الجدول." }] },
              ],
            },
            {
              id: "m02-l01-p09-why", type: "callout", origin: "book", kind: "important", title: "لماذا هذا مهم؟",
              spans: [
                { text: "هذه المهارات أساسية جدًا في أسئلة العناوين " },
                { text: "IPv4", dir: "ltr", style: "code" },
                { text: " و " },
                { text: "IPv6", dir: "ltr", style: "code" },
                { text: " وقناع الشبكة لاحقًا." },
              ],
            },
          ],
        },
      ],
    },
  ],
};

export default m02;
