// Learning Materials — Phase 3E: REAL converted body for Book 791381, module m07 (عناوين IP — the book's Unit 3).
//
// Faithful native conversion of source PDF pages 24–33 (Unit 3, complete), 1 source page → 1 interactive page.
// The module id is `m07` — the next free stable id — NOT `m03`: the historical Phase-2 skeleton `m03` (switch
// CLI/VLAN, PDF 123+) keeps its id; reading position comes from the explicit `order` (3) in the manifest.
//
// Book-derived blocks are origin:"book" and reproduce the RENDERED source wording (the PDF text layer is scrambled
// for RTL/mixed lines and was never trusted on its own). The book states simplified school-level IP rules (PDF 28,
// 31, 32) — they are converted AS WRITTEN; no outside networking nuance is substituted. Every IP address, range,
// IPv4/IPv6 token and PC label is an LTR code span or an LTR table column so digits and dots never reverse inside
// the RTL page. The two exercises (PDF 29, 32) are faithful blank worksheets — no answers, no evaluator, no
// checking (Phase 4). The only enrichment: the four-octet interactive diagram (PDF 27) and a "حل مع المعلم" reveal
// of PDF 28's own rules — both origin:"teacher-enrichment" with a source ASSOCIATION (association ≠ book origin).
// NOTHING here goes beyond PDF 33 (PDF 34 opens Unit 4 — CIDR / Subnet / Class — not started).

import type { ContentModule, ContentSource, InlineSpan } from "../../types";

const CID = "791381";
const src = (pdf: number, printed?: number): ContentSource => ({ kind: "book", sourceId: CID, pdfPageStart: pdf, printedPage: printed });
/** An LTR technical token (IP address, range, protocol name) — never reversed under RTL. */
const L = (text: string): InlineSpan => ({ text, dir: "ltr", style: "code" });

const m07: ContentModule = {
  id: "791381-m07",
  title: "عناوين IP",
  shortTitle: "عناوين IP",
  order: 3,
  // COMPLETE: every manifest page of m07 (PDF 24–33) has a body — no `partial` flag.
  lessons: [
    // ── l00 — unit opener (PDF 24) ───────────────────────────────────────────────────────────────────────────
    {
      id: "791381-m07-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381-m07-l00-p01",
          title: "عناوين IP",
          order: 1,
          layout: "opener",
          source: src(24),
          blocks: [
            {
              id: "m07-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الوحدة الثالثة", unitNumber: "03", title: "عناوين IP",
              subtitle: "ما هو عنوان IP؟ وما الفرق بين العام والخاص؟",
              goal: "الهدف: فكرة أساسية + مثال واضح + تدريب",
            },
          ],
        },
      ],
    },

    // ── l01 — what an IP address is, IPv4 structure and validity (PDF 25–29) ─────────────────────────────────
    {
      id: "791381-m07-l01",
      title: "عنوان IP وبنية IPv4",
      order: 1,
      pages: [
        // PDF 25 — ما هو عنوان IP؟
        {
          id: "791381-m07-l01-p01",
          title: "ما هو عنوان IP؟",
          order: 1,
          source: src(25, 23),
          blocks: [
            {
              // The house-address analogy is BOOK content (the definition card), not enrichment.
              id: "m07-l01-p01-def", type: "text", origin: "book",
              spans: [
                { text: "عنوان " }, L("IP"),
                { text: " هو رقم خاص لكل جهاز على الشبكة. يشبه عنوان البيت: بدون عنوان لا تصل الرسالة إلى المكان الصحيح." },
              ],
            },
            {
              id: "m07-l01-p01-role", type: "callout", origin: "book", kind: "important", title: "وظيفة العنوان",
              spans: [{ text: "يحدّد موقع الجهاز على الشبكة، ويساعد في إرسال واستقبال البيانات." }],
            },
            {
              id: "m07-l01-p01-sum", type: "callout", origin: "book", kind: "summary", title: "الخلاصة",
              spans: [{ text: "كل جهاز يحتاج عنوانًا ليتواصل مع باقي الأجهزة." }],
            },
          ],
        },
        // PDF 26 — IPv4 و IPv6
        {
          id: "791381-m07-l01-p02",
          title: "IPv4 و IPv6",
          order: 2,
          source: src(26, 24),
          blocks: [
            {
              id: "m07-l01-p02-versions", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m07-l01-p02-v4", term: "IPv4", text: [{ text: "الأقدم والأكثر استعمالًا، ويتكوّن من أرقام فقط. " }, L("192.168.1.5")] },
                { id: "m07-l01-p02-v6", term: "IPv6", text: [{ text: "الأحدث، ويحتوي أرقامًا وحروفًا معًا. " }, L("2001:db8::1")] },
              ],
            },
            {
              id: "m07-l01-p02-focus", type: "callout", origin: "book", kind: "important", title: "تركيزنا",
              spans: [
                { text: "في هذه الوحدة نركّز غالبًا على " }, L("IPv4"),
                { text: " لأنه الأساس في تدريبات الشبكات والامتحانات." },
              ],
            },
          ],
        },
        // PDF 27 — مبنى عنوان IPv4 (+ the unit's interactive diagram: the four octets)
        {
          id: "791381-m07-l01-p03",
          title: "مبنى عنوان IPv4",
          order: 3,
          source: src(27, 25),
          blocks: [
            {
              id: "m07-l01-p03-structure", type: "callout", origin: "book", kind: "important", title: "التركيب",
              spans: [
                { text: "يتكوّن عنوان " }, L("IPv4"), { text: " من 4 أقسام (" }, L("Octets"),
                { text: ")، كل قسم بين 0 و 255." },
              ],
            },
            { id: "m07-l01-p03-boxes", type: "text", origin: "book", spans: [L("0-255 . 0-255 . 0-255 . 0-255")] },
            {
              id: "m07-l01-p03-examples", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m07-l01-p03-e1", term: "مثال 1", text: [L("192.168.100.10")] },
                { id: "m07-l01-p03-e2", term: "مثال 2", text: [L("100.200.10.20")] },
                { id: "m07-l01-p03-e3", term: "مثال 3", text: [L("240.200.0.20")] },
              ],
            },
            {
              // The source WARNING is kept — four parts alone do not make an address valid; rules follow on PDF 28.
              id: "m07-l01-p03-warn", type: "callout", origin: "book", kind: "warning", title: "انتبه",
              spans: [{ text: "وجود 4 أقسام لا يعني أن العنوان صالح دائمًا للحاسوب؛ هناك قواعد إضافية سنراها في الشريحة التالية." }],
            },
            {
              // ENRICHMENT: interactive-diagram / ipv4-octets / v1 — see the FOUR parts of the book's first example.
              // Strictly PDF 27's concept (four octets, each 0–255): no validity rules, no CIDR/mask/class, no input.
              id: "m07-l01-p03-octets", type: "interactive-diagram", origin: "teacher-enrichment",
              interactionType: "ipv4-octets", version: 1,
              title: "الأقسام الأربعة لعنوان IPv4",
              description: "اختر قسمًا من الأقسام الأربعة لترى أنه جزء واحد من أربعة، وأن كل قسم عدد بين 0 و 255.",
              source: src(27, 25),
              capabilities: { fullscreen: true, reset: true, interactive: true },
              fallback: { text: "يتكوّن عنوان IPv4 من 4 أقسام تفصل بينها نقاط، وكل قسم بين 0 و 255 — مثل 192.168.100.10." },
              config: {
                address: "192.168.100.10",
                rangeText: "كل قسم بين 0 و 255.",
                caption: "اختر قسمًا من الأقسام الأربعة.",
                note: "أربعة أقسام تفصل بينها نقاط.",
              },
            },
          ],
        },
        // PDF 28 — متى يكون عنوان IP غير صالح؟ (the book's own school rules, as written)
        {
          id: "791381-m07-l01-p04",
          title: "متى يكون عنوان IP غير صالح؟",
          order: 4,
          source: src(28, 26),
          blocks: [
            {
              id: "m07-l01-p04-rules", type: "list", origin: "book", variant: "plain",
              items: [
                { id: "m07-l01-p04-r1", text: [{ text: "لا يبدأ العنوان بـ 0 أو 255." }] },
                { id: "m07-l01-p04-r2", text: [{ text: "لا ينتهي العنوان بـ 0 أو 255." }] },
                { id: "m07-l01-p04-r3", text: [{ text: "لا يزيد أي قسم عن 255، فالمجال من 0 إلى 255." }] },
                { id: "m07-l01-p04-r4", text: [{ text: "لا يبدأ بـ 127 لأنه " }, L("Localhost"), { text: "." }] },
                { id: "m07-l01-p04-r5", text: [{ text: "لا يكون من المجال " }, L("169.254.x.x"), { text: " (" }, L("APIPA"), { text: ")." }] },
              ],
            },
            {
              id: "m07-l01-p04-valid", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m07-l01-p04-ok", term: "مثال صالح", text: [L("192.168.10.1"), { text: " — يحقّق كل القواعد، صالح للاستخدام." }] },
              ],
            },
            {
              id: "m07-l01-p04-invalid", type: "list", origin: "book", variant: "plain", title: "مثال غير صالح",
              items: [
                { id: "m07-l01-p04-bad1", text: [L("192.168.10.255"), { text: " — ينتهي بـ 255، فهو عنوان البث " }, L("Broadcast"), { text: "." }] },
                { id: "m07-l01-p04-bad2", text: [L("192.168.300.10"), { text: " — القسم 300 أكبر من 255." }] },
              ],
            },
            {
              // The source's own nuance is preserved verbatim: 255 is forbidden in the FIRST and LAST part only.
              id: "m07-l01-p04-benefit", type: "callout", origin: "book", kind: "important", title: "الفائدة",
              spans: [
                { text: "هذه القواعد تساعدنا في اختيار عناوين صحيحة للحواسيب داخل الشبكة. وانتبه: الرقم 255 ممنوع في القسم الأول والأخير فقط؛ أما في الوسط — مثل " },
                L("192.255.10.10"), { text: " — فالعنوان صالح." },
              ],
            },
            {
              // ENRICHMENT: "حل مع المعلم" — reveal THIS page's rules one at a time (built-in guided/reveal/v1).
              // No new rules; no answers from the PDF 29 training.
              id: "m07-l01-p04-guided", type: "guided", origin: "teacher-enrichment",
              guidedType: "reveal", version: 1,
              title: "كيف نفحص إن كان العنوان صالحًا حسب قواعد هذه الصفحة؟",
              source: src(28, 26),
              capabilities: { fullscreen: true, reset: true },
              prompt: [{ text: "قبل أن تكشف الخطوات: ما القواعد التي نفحصها لنعرف إن كان عنوان " }, L("IP"), { text: " صالحًا؟ فكّر ثم اكشف القواعد واحدة واحدة." }],
              steps: [
                { id: "m07-l01-p04-g1", text: [{ text: "لا يبدأ العنوان بـ 0 أو 255." }] },
                { id: "m07-l01-p04-g2", text: [{ text: "لا ينتهي العنوان بـ 0 أو 255." }] },
                { id: "m07-l01-p04-g3", text: [{ text: "لا يزيد أي قسم عن 255، فالمجال من 0 إلى 255." }] },
                { id: "m07-l01-p04-g4", text: [{ text: "لا يبدأ بـ 127 لأنه " }, L("Localhost"), { text: "." }] },
                { id: "m07-l01-p04-g5", text: [{ text: "لا يكون من المجال " }, L("169.254.x.x"), { text: " (" }, L("APIPA"), { text: ")." }] },
              ],
              explanation: "الرقم 255 ممنوع في القسم الأول والأخير فقط؛ أما في الوسط — مثل 192.255.10.10 — فالعنوان صالح.",
            },
          ],
        },
        // PDF 29 — تدريب: صالح أو غير صالح؟ (blank worksheet — no answers, no checking)
        {
          id: "791381-m07-l01-p05",
          title: "تدريب: صالح أو غير صالح؟",
          order: 5,
          source: src(29, 27),
          blocks: [
            {
              id: "m07-l01-p05-table", type: "table", origin: "book",
              headers: ["العنوان", "صالح / غير صالح", "السبب"],
              columnDirs: ["ltr", "rtl", "rtl"],
              rows: [
                ["192.168.10.1", "", ""],
                ["192.255.10.10", "", ""],
                ["127.11.10.1", "", ""],
                ["169.169.10.10", "", ""],
                ["169.254.10.234", "", ""],
              ],
            },
            {
              id: "m07-l01-p05-how", type: "callout", origin: "book", kind: "tip", title: "طريقة الحل",
              spans: [{ text: "حلّ الجدول بنفسك أولًا، ثم راجع القواعد في الشريحة السابقة للتأكد." }],
            },
          ],
        },
      ],
    },

    // ── l02 — public vs private addresses, ranges, static vs dynamic (PDF 30–33) ──────────────────────────────
    {
      id: "791381-m07-l02",
      title: "العناوين العامة والخاصة",
      order: 2,
      pages: [
        // PDF 30 — عنوان خاص وعنوان عام
        {
          id: "791381-m07-l02-p01",
          title: "عنوان خاص وعنوان عام",
          order: 1,
          source: src(30, 28),
          blocks: [
            {
              id: "m07-l02-p01-kinds", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m07-l02-p01-public", term: "Public IP — عام", text: [{ text: "عنوان يمكن الوصول إليه من الإنترنت، يُستخدم للمواقع والسيرفرات. مثال: " }, L("8.8.8.8")] },
                { id: "m07-l02-p01-private", term: "Private IP — خاص", text: [{ text: "عنوان يُستخدم داخل شبكة محلية فقط، مثل البيت أو المدرسة. مثال: " }, L("192.168.1.5")] },
              ],
            },
            {
              id: "m07-l02-p01-important", type: "callout", origin: "book", kind: "important", title: "مهم",
              spans: [{ text: "العنوان الخاص لا يُستخدم مباشرة على الإنترنت العام، بل داخل الشبكة المحلية فقط." }],
            },
          ],
        },
        // PDF 31 — مجالات العناوين الخاصة (the table is reproduced exactly as rendered)
        {
          id: "791381-m07-l02-p02",
          title: "مجالات العناوين الخاصة",
          order: 2,
          source: src(31, 29),
          blocks: [
            {
              id: "m07-l02-p02-table", type: "table", origin: "book",
              headers: ["الفئة", "العنوان الخاص", "مثال"],
              columnDirs: ["ltr", "ltr", "ltr"],
              rows: [
                ["Class A", "10.x.x.x", "10.0.0.1"],
                ["Class B", "172.16 - 172.31", "172.23.100.13"],
                ["Class C", "192.168.x.x", "192.168.100.6"],
              ],
            },
            {
              id: "m07-l02-p02-benefit", type: "callout", origin: "book", kind: "tip", title: "الفائدة",
              spans: [{ text: "معرفة هذه المجالات تساعدك على التمييز السريع بين الشبكات الداخلية والعناوين العامة على الإنترنت." }],
            },
            {
              id: "m07-l02-p02-remember", type: "callout", origin: "book", kind: "remember", title: "تذكّر",
              spans: [{ text: "إذا رأيت " }, L("10"), { text: " أو " }, L("192.168"), { text: " فغالبًا أنت أمام عنوان خاص." }],
            },
            {
              id: "m07-l02-p02-172", type: "callout", origin: "book", kind: "warning", title: "انتبه لـ 172",
              spans: [{ text: "يجب أن يكون القسم الثاني بين 16 و 31 فقط ليكون العنوان خاصًا." }],
            },
          ],
        },
        // PDF 32 — تدريب: خاص أم عام؟ (blank worksheet — no answers, no checking)
        {
          id: "791381-m07-l02-p03",
          title: "تدريب: خاص أم عام؟",
          order: 3,
          source: src(32, 30),
          blocks: [
            {
              id: "m07-l02-p03-table", type: "table", origin: "book",
              headers: ["الجهاز", "العنوان", "خاص / عام"],
              columnDirs: ["ltr", "ltr", "rtl"],
              rows: [
                ["PC1", "192.167.100.2", ""],
                ["PC2", "10.100.10.10", ""],
                ["PC3", "172.16.32.30", ""],
                ["PC4", "220.100.100.100", ""],
                ["PC5", "9.10.11.12", ""],
              ],
            },
            {
              // The source's own warning (a hint, not a printed answer): 192.167 is not the 192.168 range.
              id: "m07-l02-p03-warn", type: "callout", origin: "book", kind: "warning", title: "لا تنخدع",
              spans: [
                { text: "العنوان " }, L("192.167"), { text: " ليس مثل " }, L("192.168"),
                { text: " — افحص الأرقام بدقة قبل الحكم." },
              ],
            },
          ],
        },
        // PDF 33 — Static IP / Dynamic IP — the LAST page of Unit 3 (PDF 34 opens Unit 4).
        // Title: the source renders «Static IP» as the rightmost token, so the logical RTL string is
        // "Static IP و Dynamic IP" (it reproduces the printed visual under the reader's RTL base direction).
        {
          id: "791381-m07-l02-p04",
          title: "Static IP و Dynamic IP",
          order: 4,
          source: src(33, 31),
          blocks: [
            {
              id: "m07-l02-p04-kinds", type: "list", origin: "book", variant: "cards",
              items: [
                { id: "m07-l02-p04-dynamic", term: "Dynamic IP", text: [{ text: "عنوان يتغيّر من وقت لآخر، وقد يتغيّر عند إعادة تشغيل المودم. مناسب للبيوت والشركات الصغيرة." }] },
                { id: "m07-l02-p04-static", term: "Static IP", text: [{ text: "عنوان ثابت لا يتغيّر إلا إذا غيّرناه يدويًا. مناسب للطابعات والكاميرات والسيرفرات." }] },
              ],
            },
            {
              // The book's closing comparison line. (The printed box is laid out with an LTR base direction — an
              // authoring artifact; the logical content is kept exactly and shown as normal RTL prose.)
              id: "m07-l02-p04-diff", type: "callout", origin: "book", kind: "summary", title: "الفرق الأساسي",
              spans: [L("Dynamic"), { text: " = متغيّر · " }, L("Static"), { text: " = ثابت" }],
            },
          ],
        },
      ],
    },
  ],
};

export default m07;
