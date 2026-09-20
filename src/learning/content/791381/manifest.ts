// Learning Materials — Phase 2: content MANIFEST for book 791381 (شبكات الاتصال).
//
// SKELETON ONLY (§28). This is the lightweight table-of-contents: module / lesson / page IDENTITIES, titles and
// source references — and NO block bodies. Nothing here is converted book content; the module/lesson/page titles
// are derived from the actual source book (verified against the source PDF pages noted in each `source`), and the
// full page bodies (blocks) are deferred to a later conversion phase, each loaded as its own module chunk.
//
// It is deliberately PARTIAL: it covers a representative set of the book's real units (basics, number systems,
// switch CLI/VLAN, trunk / router-on-a-stick, the Cisco command reference, and ACLs) to prove the architecture
// spans every content shape and every batch — it is NOT the complete 264-page contents.
//
// ID policy: `791381` · `791381-mNN` · `791381-mNN-lNN` · `791381-mNN-lNN-pNN` — stable, human-debuggable, and
// independent of array position (never regenerated at runtime).
//
// STABLE MODULE IDS ARE IMMUTABLE IDENTIFIERS — they are NOT guaranteed to equal the source book's unit numbers or
// the module's current reading position. The explicit `order` field is the ONLY sequencing authority (the Reader,
// TOC and navigation sort by it). Example: the book's Unit 3 «عناوين IP» is module `791381-m07` (the next free id
// when it was converted in Phase 3E) with `order: 3`, while the historical Phase-2 skeleton `791381-m03` (switch
// CLI/VLAN, PDF 123+) keeps its id and simply moves to `order: 4`. Future real units continue with m08, m09, …
// and are placed by `order`. Never renumber or repurpose an existing id.

import { LEARNING_CONTENT_SCHEMA_VERSION, type LearningCourseManifest } from "../types";

const manifest: LearningCourseManifest = {
  schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION,
  courseId: "791381",
  title: "شبكات الاتصال",
  direction: "rtl",
  modules: [
    {
      id: "791381-m01",
      title: "أساسيات الشبكات",
      shortTitle: "الأساسيات",
      order: 1,
      lessons: [
        {
          // Phase 3B: unit-opener lesson added BEFORE the existing intro lesson (existing ids below are unchanged).
          id: "791381-m01-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381-m01-l00-p01", title: "أساسيات الشبكات", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 7 }, keywords: ["مقدمة", "الوحدة الأولى"] },
          ],
        },
        {
          id: "791381-m01-l01",
          title: "مقدمة إلى الشبكات",
          order: 1,
          pages: [
            { id: "791381-m01-l01-p01", title: "ما هي الشبكة؟", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 8, printedPage: 6 }, keywords: ["شبكة", "network"] },
            { id: "791381-m01-l01-p02", title: "استخدامات الشبكة", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 9, printedPage: 7 } },
            { id: "791381-m01-l01-p03", title: "حسنات الشبكة", order: 3, source: { kind: "book", sourceId: "791381", pdfPageStart: 10, printedPage: 8 } },
          ],
        },
        {
          // Phase 3B: PDF 11–13 appended as a new lesson (additive; no existing id renumbered).
          id: "791381-m01-l02",
          title: "أنواع الشبكات وبناؤها وإدارتها",
          order: 2,
          pages: [
            { id: "791381-m01-l02-p01", title: "أنواع الشبكات", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 11, printedPage: 9 }, keywords: ["PAN", "LAN", "WAN", "أنواع الشبكات"] },
            { id: "791381-m01-l02-p02", title: "احتياجات بناء شبكة", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 12, printedPage: 10 }, keywords: ["IP", "TCP/IP", "بروتوكول", "بنية تحتية"] },
            { id: "791381-m01-l02-p03", title: "إدارة الشبكة وصيانتها", order: 3, source: { kind: "book", sourceId: "791381", pdfPageStart: 13, printedPage: 11 }, keywords: ["ping", "ipconfig", "صيانة", "أمان"] },
          ],
        },
      ],
    },
    {
      id: "791381-m02",
      title: "الأعداد والموازين",
      shortTitle: "الأعداد",
      order: 2,
      lessons: [
        {
          // Phase 3B/3C/3D: unit-opener lesson for Unit 2 (PDF 14). The Unit-2 lesson (m02-l01) is now FULLY
          // converted (PDF 15–23), so m02 is a COMPLETE conversion (no `partial` flag on the module body).
          id: "791381-m02-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381-m02-l00-p01", title: "الأعداد والموازين", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 14 }, keywords: ["مقدمة", "الوحدة الثانية"] },
          ],
        },
        {
          // Phase 3C/3D: the full number-systems sequence PDF 15–23 in reading order. The three Phase-2 skeleton pages
          // (p01=PDF16, p02=PDF18, p03=PDF20) keep their STABLE IDs; only their `order` is adjusted to interleave the
          // newly-added pages (p02's title is corrected to the authoritative rendered source). p09 (PDF 23,
          // خلاصة التحويلات) is Unit 2's closing summary — converted in Phase 3D, completing the module.
          id: "791381-m02-l01",
          title: "أنظمة العد والتحويل",
          order: 1,
          pages: [
            { id: "791381-m02-l01-p04", title: "العشري والثنائي", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 15, printedPage: 13 }, keywords: ["decimal", "binary", "عشري", "ثنائي"] },
            { id: "791381-m02-l01-p01", title: "تحويل من الثنائي للعشري", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 16, printedPage: 14 }, keywords: ["binary", "decimal", "ثنائي", "عشري"] },
            { id: "791381-m02-l01-p05", title: "تحويل من العشري للثنائي", order: 3, source: { kind: "book", sourceId: "791381", pdfPageStart: 17, printedPage: 15 }, keywords: ["decimal", "binary", "تحويل"] },
            { id: "791381-m02-l01-p02", title: "النظام السادس عشري (Hex)", order: 4, source: { kind: "book", sourceId: "791381", pdfPageStart: 18, printedPage: 16 }, keywords: ["hex", "سادس عشر"] },
            { id: "791381-m02-l01-p06", title: "جدول السادس عشر والثنائي", order: 5, source: { kind: "book", sourceId: "791381", pdfPageStart: 19, printedPage: 17 }, keywords: ["hex", "binary", "جدول"] },
            { id: "791381-m02-l01-p03", title: "من السادس عشر إلى الثنائي", order: 6, source: { kind: "book", sourceId: "791381", pdfPageStart: 20, printedPage: 18 } },
            { id: "791381-m02-l01-p07", title: "من الثنائي إلى السادس عشر", order: 7, source: { kind: "book", sourceId: "791381", pdfPageStart: 21, printedPage: 19 }, keywords: ["binary", "hex", "تحويل"] },
            { id: "791381-m02-l01-p08", title: "تدريبات قصيرة", order: 8, source: { kind: "book", sourceId: "791381", pdfPageStart: 22, printedPage: 20 }, keywords: ["تدريب", "exercises"] },
            { id: "791381-m02-l01-p09", title: "خلاصة التحويلات", order: 9, source: { kind: "book", sourceId: "791381", pdfPageStart: 23, printedPage: 21 }, keywords: ["خلاصة", "تحويلات"] },
          ],
        },
      ],
    },
    {
      // Phase 3E: the book's REAL Unit 3 «عناوين IP» (PDF 24–33), complete. New stable id m07 (the next free id —
      // the historical m03 skeleton below is NOT reused); placed third by explicit `order`. Page ids are authored
      // once and immutable from here on.
      id: "791381-m07",
      title: "عناوين IP",
      shortTitle: "عناوين IP",
      order: 3,
      lessons: [
        {
          id: "791381-m07-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381-m07-l00-p01", title: "عناوين IP", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 24 }, keywords: ["مقدمة", "الوحدة الثالثة", "IP"] },
          ],
        },
        {
          id: "791381-m07-l01",
          title: "عنوان IP وبنية IPv4",
          order: 1,
          pages: [
            { id: "791381-m07-l01-p01", title: "ما هو عنوان IP؟", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 25, printedPage: 23 }, keywords: ["IP", "عنوان"] },
            { id: "791381-m07-l01-p02", title: "IPv4 و IPv6", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 26, printedPage: 24 }, keywords: ["IPv4", "IPv6"] },
            { id: "791381-m07-l01-p03", title: "مبنى عنوان IPv4", order: 3, source: { kind: "book", sourceId: "791381", pdfPageStart: 27, printedPage: 25 }, keywords: ["IPv4", "octet", "أقسام"] },
            { id: "791381-m07-l01-p04", title: "متى يكون عنوان IP غير صالح؟", order: 4, source: { kind: "book", sourceId: "791381", pdfPageStart: 28, printedPage: 26 }, keywords: ["صالح", "غير صالح", "Localhost", "APIPA"] },
            { id: "791381-m07-l01-p05", title: "تدريب: صالح أو غير صالح؟", order: 5, source: { kind: "book", sourceId: "791381", pdfPageStart: 29, printedPage: 27 }, keywords: ["تدريب", "صالح"] },
          ],
        },
        {
          id: "791381-m07-l02",
          title: "العناوين العامة والخاصة",
          order: 2,
          pages: [
            { id: "791381-m07-l02-p01", title: "عنوان خاص وعنوان عام", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 30, printedPage: 28 }, keywords: ["Public IP", "Private IP", "خاص", "عام"] },
            { id: "791381-m07-l02-p02", title: "مجالات العناوين الخاصة", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 31, printedPage: 29 }, keywords: ["Class A", "Class B", "Class C", "خاص"] },
            { id: "791381-m07-l02-p03", title: "تدريب: خاص أم عام؟", order: 3, source: { kind: "book", sourceId: "791381", pdfPageStart: 32, printedPage: 30 }, keywords: ["تدريب", "خاص", "عام"] },
            { id: "791381-m07-l02-p04", title: "Static IP و Dynamic IP", order: 4, source: { kind: "book", sourceId: "791381", pdfPageStart: 33, printedPage: 31 }, keywords: ["Static IP", "Dynamic IP", "ثابت", "متغير"] },
          ],
        },
      ],
    },
    {
      // Units 4–6 phase: the book's REAL Unit 4 «Class و Subnet و CIDR» (PDF 34–46), complete. New stable id m08
      // (the next free id), placed fourth by explicit `order`. Printed page = the rendered page circle.
      id: "791381-m08",
      title: "Class و Subnet و CIDR",
      shortTitle: "CIDR والفئات",
      order: 4,
      lessons: [
        {
          id: "791381-m08-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381-m08-l00-p01", title: "Class و Subnet و CIDR", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 34 }, keywords: ["مقدمة", "الوحدة الرابعة", "CIDR"] },
          ],
        },
        {
          id: "791381-m08-l01",
          title: "فئات العناوين والقناع الطبيعي",
          order: 1,
          pages: [
            { id: "791381-m08-l01-p01", title: "فئات العناوين", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 35, printedPage: 35 }, keywords: ["Class A", "Class B", "Class C", "فئات"] },
            { id: "791381-m08-l01-p02", title: "تدريب: لأي فئة ينتمي العنوان؟", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 36, printedPage: 36 }, keywords: ["تدريب", "الفئة"] },
            { id: "791381-m08-l01-p03", title: "قناع الشبكة Subnet Mask", order: 3, source: { kind: "book", sourceId: "791381", pdfPageStart: 37, printedPage: 37 }, keywords: ["Subnet Mask", "قناع"] },
            { id: "791381-m08-l01-p04", title: "القناع الطبيعي لكل فئة", order: 4, source: { kind: "book", sourceId: "791381", pdfPageStart: 38, printedPage: 38 }, keywords: ["القناع الطبيعي", "/8", "/16", "/24"] },
            { id: "791381-m08-l01-p05", title: "تدريب: ما هو قناع الشبكة؟", order: 5, source: { kind: "book", sourceId: "791381", pdfPageStart: 39, printedPage: 39 }, keywords: ["تدريب", "قناع الشبكة"] },
          ],
        },
        {
          id: "791381-m08-l02",
          title: "جزء الشبكة وجزء الجهاز و CIDR",
          order: 2,
          pages: [
            { id: "791381-m08-l02-p01", title: "جزء الشبكة وجزء الجهاز", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 40, printedPage: 40 }, keywords: ["جزء الشبكة", "جزء الجهاز", "/24"] },
            { id: "791381-m08-l02-p02", title: "ما هو CIDR؟", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 41, printedPage: 41 }, keywords: ["CIDR", "بتات الشبكة"] },
            { id: "791381-m08-l02-p03", title: "أمثلة على CIDR", order: 3, source: { kind: "book", sourceId: "791381", pdfPageStart: 42, printedPage: 42 }, keywords: ["CIDR", "مجال العناوين", "Broadcast"] },
          ],
        },
        {
          id: "791381-m08-l03",
          title: "الأجهزة في نفس الشبكة والبوابة الافتراضية",
          order: 3,
          pages: [
            { id: "791381-m08-l03-p01", title: "أجهزة في نفس الشبكة", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 43, printedPage: 43 }, keywords: ["نفس الشبكة", "PC1", "PC2"] },
            { id: "791381-m08-l03-p02", title: "تدريب: أعطِ عنوانًا لجهاز PC2", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 44, printedPage: 44 }, keywords: ["تدريب", "PC2"] },
            { id: "791381-m08-l03-p03", title: "البوابة الافتراضية Default Gateway", order: 3, source: { kind: "book", sourceId: "791381", pdfPageStart: 45, printedPage: 45 }, keywords: ["Default Gateway", "البوابة الافتراضية", "Router"] },
            { id: "791381-m08-l03-p04", title: "خلاصة سريعة", order: 4, source: { kind: "book", sourceId: "791381", pdfPageStart: 46 }, keywords: ["خلاصة", "نهاية الدفعة الأولى"] },
          ],
        },
      ],
    },
    {
      // Units 4–6 phase: the book's REAL Unit 5 «أجهزة الشبكات» (PDF 48–56), complete. PDF 47 (the batch-2 divider) is
      // structural — represented on the module body's source range, never as a learner page. Stable id m09, order 5.
      id: "791381-m09",
      title: "أجهزة الشبكات",
      shortTitle: "أجهزة الشبكات",
      order: 5,
      lessons: [
        {
          id: "791381-m09-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381-m09-l00-p01", title: "أجهزة الشبكات", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 48 }, keywords: ["مقدمة", "الوحدة الخامسة", "Hub", "Switch", "Router"] },
          ],
        },
        {
          id: "791381-m09-l01",
          title: "Hub و Switch",
          order: 1,
          pages: [
            { id: "791381-m09-l01-p01", title: "الأجهزة المستعملة في الشبكات", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 49, printedPage: 49 }, keywords: ["Hub", "Switch", "Router"] },
            { id: "791381-m09-l01-p02", title: "جهاز Hub", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 50, printedPage: 50 }, keywords: ["Hub", "ازدحام"] },
            { id: "791381-m09-l01-p03", title: "لماذا استُبدل Hub بـ Switch؟", order: 3, source: { kind: "book", sourceId: "791381", pdfPageStart: 51, printedPage: 51 }, keywords: ["Hub", "Switch", "مقارنة"] },
            { id: "791381-m09-l01-p04", title: "جهاز Switch", order: 4, source: { kind: "book", sourceId: "791381", pdfPageStart: 52, printedPage: 52 }, keywords: ["Switch", "MAC", "LAN"] },
            { id: "791381-m09-l01-p05", title: "مميزات Switch", order: 5, source: { kind: "book", sourceId: "791381", pdfPageStart: 53, printedPage: 53 }, keywords: ["Switch", "مميزات"] },
          ],
        },
        {
          id: "791381-m09-l02",
          title: "Router",
          order: 2,
          pages: [
            { id: "791381-m09-l02-p01", title: "جهاز Router", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 54, printedPage: 54 }, keywords: ["Router", "الإنترنت", "DHCP"] },
            { id: "791381-m09-l02-p02", title: "أهم خصائص Router", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 55, printedPage: 55 }, keywords: ["Router", "NAT", "DHCP", "توجيه"] },
          ],
        },
        {
          id: "791381-m09-l03",
          title: "خلاصة الأجهزة",
          order: 3,
          pages: [
            { id: "791381-m09-l03-p01", title: "خلاصة الأجهزة", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 56, printedPage: 56 }, keywords: ["خلاصة", "Hub", "Switch", "Router"] },
          ],
        },
      ],
    },
    {
      // Units 4–6 phase: the book's REAL Unit 6 «أنواع شبكات الاتصال» (PDF 57–60), complete. Stable id m10, order 6.
      // PDF 61 opens Unit 7 («الكوابل وعنوان MAC») and is NOT converted.
      id: "791381-m10",
      title: "أنواع شبكات الاتصال",
      shortTitle: "أنواع الشبكات",
      order: 6,
      lessons: [
        {
          id: "791381-m10-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381-m10-l00-p01", title: "أنواع شبكات الاتصال", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 57 }, keywords: ["مقدمة", "الوحدة السادسة", "أنواع الشبكات"] },
          ],
        },
        {
          id: "791381-m10-l01",
          title: "الشبكات البسيطة والتقليدية",
          order: 1,
          pages: [
            { id: "791381-m10-l01-p01", title: "أنواع الشبكات البسيطة", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 58, printedPage: 58 }, keywords: ["P2P", "نقطة لنقطة", "عقدة لعقدة"] },
            { id: "791381-m10-l01-p02", title: "الشبكات السلكية التقليدية", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 59, printedPage: 59 }, keywords: ["Bus", "Ring", "Collision"] },
          ],
        },
        {
          id: "791381-m10-l02",
          title: "الشبكات الحديثة",
          order: 2,
          pages: [
            { id: "791381-m10-l02-p01", title: "الشبكات الحديثة", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 60, printedPage: 60 }, keywords: ["Star", "Tree", "Hybrid"] },
          ],
        },
      ],
    },
    {
      // Units 7–8 phase: the book's REAL Unit 7 «الكوابل وعنوان MAC» (PDF 61–65), complete. Stable id m11, order 7.
      id: "791381-m11",
      title: "الكوابل وعنوان MAC",
      shortTitle: "الكوابل و MAC",
      order: 7,
      lessons: [
        {
          id: "791381-m11-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381-m11-l00-p01", title: "الكوابل وعنوان MAC", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 61 }, keywords: ["مقدمة", "الوحدة السابعة", "الكوابل", "MAC"] },
          ],
        },
        {
          id: "791381-m11-l01",
          title: "كوابل الشبكة",
          order: 1,
          pages: [
            { id: "791381-m11-l01-p01", title: "الكوابل المستعملة في الشبكات", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 62, printedPage: 62 }, keywords: ["UTP", "STP", "زوج ملتوي", "التشويش"] },
            { id: "791381-m11-l01-p02", title: "أنواع أخرى من الكوابل", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 63, printedPage: 63 }, keywords: ["Fiber Optic", "Coaxial", "ألياف بصرية", "كابل محوري"] },
          ],
        },
        {
          id: "791381-m11-l02",
          title: "عنوان MAC واستخداماته",
          order: 2,
          pages: [
            { id: "791381-m11-l02-p01", title: "عنوان MAC Address", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 64, printedPage: 64 }, keywords: ["MAC", "MAC Address", "سداسي عشري", "FF:FF:FF:FF:FF:FF"] },
            { id: "791381-m11-l02-p02", title: "استخدامات MAC Address", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 65, printedPage: 65 }, keywords: ["استخدامات MAC", "الأمان", "الجدار الناري"] },
          ],
        },
      ],
    },
    {
      // Units 7–8 phase: the book's REAL Unit 8 «أنواع الرسائل» (PDF 66–74) + the batch-2 summary page (PDF 75) as its
      // last lesson. Stable id m12, order 8. PDF 76 opens batch 3 and is NOT converted.
      id: "791381-m12",
      title: "أنواع الرسائل",
      shortTitle: "أنواع الرسائل",
      order: 8,
      lessons: [
        {
          id: "791381-m12-l00",
          title: "افتتاحية الوحدة",
          order: 0,
          pages: [
            { id: "791381-m12-l00-p01", title: "أنواع الرسائل", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 66 }, keywords: ["مقدمة", "الوحدة الثامنة", "أنواع الرسائل"] },
          ],
        },
        {
          id: "791381-m12-l01",
          title: "Unicast / Multicast / Broadcast",
          order: 1,
          pages: [
            { id: "791381-m12-l01-p01", title: "Unicast / Multicast / Broadcast", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 67, printedPage: 67 }, keywords: ["Unicast", "Multicast", "Broadcast"] },
            { id: "791381-m12-l01-p02", title: "Unicast و Multicast", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 68, printedPage: 68 }, keywords: ["Unicast", "Multicast", "بث فيديو"] },
            { id: "791381-m12-l01-p03", title: "Broadcast", order: 3, source: { kind: "book", sourceId: "791381", pdfPageStart: 69, printedPage: 69 }, keywords: ["Broadcast", "الراوتر", "FF:FF:FF:FF:FF:FF"] },
          ],
        },
        {
          id: "791381-m12-l02",
          title: "عنوان Broadcast والبروتوكولات",
          order: 2,
          pages: [
            { id: "791381-m12-l02-p01", title: "كيف نعرف عنوان Broadcast؟", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 70, printedPage: 70 }, keywords: ["عنوان Broadcast", "/8", "/16", "/24"] },
            { id: "791381-m12-l02-p02", title: "بروتوكولات تستعمل Broadcast", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 71, printedPage: 71 }, keywords: ["ARP", "DHCP", "RIP"] },
          ],
        },
        {
          id: "791381-m12-l03",
          title: "وحدات التخزين ومبنى الرسالة",
          order: 3,
          pages: [
            { id: "791381-m12-l03-p01", title: "وحدات التخزين", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 72, printedPage: 72 }, keywords: ["Bit", "Byte", "KB", "MB", "GB", "TB"] },
            { id: "791381-m12-l03-p02", title: "مبنى الرسائل في الشبكات", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 73, printedPage: 73 }, keywords: ["IP المصدر", "IP الهدف", "MAC المصدر", "MAC الهدف"] },
            { id: "791381-m12-l03-p03", title: "مبنى رسالة Broadcast", order: 3, source: { kind: "book", sourceId: "791381", pdfPageStart: 74, printedPage: 74 }, keywords: ["Broadcast Domain", "MAC الهدف"] },
          ],
        },
        {
          id: "791381-m12-l04",
          title: "خلاصة الدفعة الثانية",
          order: 4,
          pages: [
            { id: "791381-m12-l04-p01", title: "نهاية الدفعة الثانية — خلاصة سريعة", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 75 }, keywords: ["خلاصة", "الدفعة الثانية"] },
          ],
        },
      ],
    },
    {
      // Batch 3 phase: the book's REAL section «نماذج الاتصال · OSI و TCP/IP» (PDF 77–86; PDF 76 is the batch divider),
      // complete. Stable id m13, order 9. Batch 3 has no unit-opener page. PDF 87+ is Batch 4 (m14–m16).
      id: "791381-m13",
      title: "نماذج الاتصال: OSI و TCP/IP",
      shortTitle: "OSI و TCP/IP",
      order: 9,
      lessons: [
        {
          id: "791381-m13-l01",
          title: "نموذج OSI",
          order: 1,
          pages: [
            { id: "791381-m13-l01-p01", title: "ما هو نموذج OSI؟", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 77, printedPage: 77 }, keywords: ["OSI", "7 طبقات"] },
            { id: "791381-m13-l01-p02", title: "طبقات OSI السبع", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 78, printedPage: 78 }, keywords: ["Application", "Presentation", "Session", "Transport", "Network", "Data Link", "Physical"] },
            { id: "791381-m13-l01-p03", title: "طبقات OSI الأساسية", order: 3, source: { kind: "book", sourceId: "791381", pdfPageStart: 79, printedPage: 79 }, keywords: ["Physical", "Data Link", "Network", "Transport"] },
            { id: "791381-m13-l01-p04", title: "باقي طبقات OSI", order: 4, source: { kind: "book", sourceId: "791381", pdfPageStart: 80, printedPage: 80 }, keywords: ["Session", "Presentation", "Application"] },
          ],
        },
        {
          id: "791381-m13-l02",
          title: "نموذج TCP/IP",
          order: 2,
          pages: [
            { id: "791381-m13-l02-p01", title: "نموذج TCP/IP", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 81, printedPage: 81 }, keywords: ["TCP/IP", "4 طبقات"] },
            { id: "791381-m13-l02-p02", title: "طبقات TCP/IP الأربع", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 82, printedPage: 82 }, keywords: ["Application", "Transport", "Internet", "Link"] },
            { id: "791381-m13-l02-p03", title: "مقارنة سريعة: OSI و TCP/IP", order: 3, source: { kind: "book", sourceId: "791381", pdfPageStart: 83, printedPage: 83 }, keywords: ["مقارنة", "OSI", "TCP/IP"] },
          ],
        },
        {
          id: "791381-m13-l03",
          title: "TCP و UDP",
          order: 3,
          pages: [
            { id: "791381-m13-l03-p01", title: "TCP و UDP", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 84, printedPage: 84 }, keywords: ["TCP", "UDP", "Transport Layer"] },
            { id: "791381-m13-l03-p02", title: "متى نستخدم TCP؟", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 85, printedPage: 85 }, keywords: ["TCP", "موثوق"] },
            { id: "791381-m13-l03-p03", title: "متى نستخدم UDP؟", order: 3, source: { kind: "book", sourceId: "791381", pdfPageStart: 86, printedPage: 86 }, keywords: ["UDP", "السرعة"] },
          ],
        },
      ],
    },
    {
      // Batch 4 phase: the book's REAL section «البروتوكولات» (PDF 87–92), complete. Stable id m14, order 10.
      id: "791381-m14",
      title: "البروتوكولات",
      shortTitle: "البروتوكولات",
      order: 10,
      lessons: [
        {
          id: "791381-m14-l01",
          title: "ما هو البروتوكول؟ · DNS / HTTP / DHCP",
          order: 1,
          pages: [
            { id: "791381-m14-l01-p01", title: "أهم البروتوكولات", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 87, printedPage: 87 }, keywords: ["بروتوكول", "قاعدة", "لغة", "وظيفة"] },
            { id: "791381-m14-l01-p02", title: "DNS / HTTP / DHCP", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 88, printedPage: 88 }, keywords: ["DNS", "HTTP", "DHCP", "اسم الموقع", "صفحات الويب"] },
          ],
        },
        {
          id: "791381-m14-l02",
          title: "SMTP / FTP / TFTP · SSH / Telnet / NAT",
          order: 2,
          pages: [
            { id: "791381-m14-l02-p01", title: "SMTP / FTP / TFTP", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 89, printedPage: 89 }, keywords: ["SMTP", "FTP", "TFTP", "البريد", "نقل الملفات"] },
            { id: "791381-m14-l02-p02", title: "SSH / Telnet / NAT", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 90, printedPage: 90 }, keywords: ["SSH", "Telnet", "NAT", "تحكّم عن بُعد", "عنوان عام"] },
          ],
        },
        {
          id: "791381-m14-l03",
          title: "HTTPS / POP / IMAP / ICMP / ARP · نوع النقل",
          order: 3,
          pages: [
            { id: "791381-m14-l03-p01", title: "HTTPS / POP / IMAP / ICMP / ARP", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 91, printedPage: 91 }, keywords: ["HTTPS", "POP", "IMAP", "ICMP", "ARP"] },
            { id: "791381-m14-l03-p02", title: "البروتوكولات ونوع النقل", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 92, printedPage: 92 }, keywords: ["TCP", "UDP", "نوع النقل", "الموثوقية", "السرعة"] },
          ],
        },
      ],
    },
    {
      // Batch 4 phase: the book's REAL section «أوامر فحص الشبكة» (PDF 93–97), complete. Stable id m15, order 11.
      id: "791381-m15",
      title: "أوامر فحص الشبكة",
      shortTitle: "أوامر الشبكة",
      order: 11,
      lessons: [
        {
          id: "791381-m15-l01",
          title: "ping و ipconfig",
          order: 1,
          pages: [
            { id: "791381-m15-l01-p01", title: "أمر ping", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 93, printedPage: 93 }, keywords: ["ping", "اتصال", "زمن الوصول"] },
            { id: "791381-m15-l01-p02", title: "أمر ipconfig", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 94, printedPage: 94 }, keywords: ["ipconfig", "إعدادات الشبكة", "البوابة الافتراضية", "MAC"] },
          ],
        },
        {
          id: "791381-m15-l02",
          title: "tracert و nslookup و arp",
          order: 2,
          pages: [
            { id: "791381-m15-l02-p01", title: "أمر tracert", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 95, printedPage: 95 }, keywords: ["tracert", "الطريق", "خطوة بعد خطوة"] },
            { id: "791381-m15-l02-p02", title: "أمر nslookup", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 96, printedPage: 96 }, keywords: ["nslookup", "DNS", "اسم الموقع"] },
            { id: "791381-m15-l02-p03", title: "أمر arp", order: 3, source: { kind: "book", sourceId: "791381", pdfPageStart: 97, printedPage: 97 }, keywords: ["arp", "جدول", "IP", "MAC"] },
          ],
        },
      ],
    },
    {
      // Batch 4 phase: the book's REAL section «المجالات والمفاهيم» (PDF 98–105) + its PDF 106 trainings page, complete.
      // Stable id m16, order 12. PDF 107+ is Batch 5 (m17–m18).
      id: "791381-m16",
      title: "المجالات والمفاهيم",
      shortTitle: "المجالات والمفاهيم",
      order: 12,
      lessons: [
        {
          id: "791381-m16-l01",
          title: "مجال التصادم",
          order: 1,
          pages: [
            { id: "791381-m16-l01-p01", title: "Collision Domain", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 98, printedPage: 98 }, keywords: ["Collision Domain", "تصادم", "Hub", "Switch", "منفذ"] },
            { id: "791381-m16-l01-p02", title: "كيف يقلّل السويتش التصادم؟", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 99, printedPage: 99 }, keywords: ["Switch", "Hub", "تصادم", "المقصود فقط"] },
          ],
        },
        {
          id: "791381-m16-l02",
          title: "مجال البث",
          order: 2,
          pages: [
            { id: "791381-m16-l02-p01", title: "Broadcast Domain", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 100, printedPage: 100 }, keywords: ["Broadcast Domain", "Broadcast", "Router", "VLAN"] },
            { id: "791381-m16-l02-p02", title: "Broadcast Domain في Switch و Router", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 101, printedPage: 101 }, keywords: ["Broadcast Domain", "Switch", "Router", "VLAN"] },
          ],
        },
        {
          id: "791381-m16-l03",
          title: "STP و Duplex",
          order: 3,
          pages: [
            { id: "791381-m16-l03-p01", title: "بروتوكول STP", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 102, printedPage: 102 }, keywords: ["STP", "حلقات", "Loops", "سويتشات"] },
            { id: "791381-m16-l03-p02", title: "Half Duplex / Full Duplex", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 103, printedPage: 103 }, keywords: ["Half Duplex", "Full Duplex", "إرسال", "استقبال"] },
          ],
        },
        {
          id: "791381-m16-l04",
          title: "Localhost و APIPA",
          order: 4,
          pages: [
            { id: "791381-m16-l04-p01", title: "Localhost", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 104, printedPage: 104 }, keywords: ["Localhost", "127.0.0.1", "اختبار محلي"] },
            { id: "791381-m16-l04-p02", title: "APIPA", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 105, printedPage: 105 }, keywords: ["APIPA", "169.254", "DHCP"] },
          ],
        },
        {
          id: "791381-m16-l05",
          title: "تدريبات مراجعة سريعة",
          order: 5,
          pages: [
            { id: "791381-m16-l05-p01", title: "تدريبات مراجعة سريعة", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 106, printedPage: 106 }, keywords: ["تدريبات", "مراجعة", "QR"] },
          ],
        },
      ],
    },
    {
      // Batch 5 phase: the book's REAL section «أمان الشبكات» (PDF 108–115; PDF 107 is the «الجزء الثاني» part cover),
      // complete. Stable id m17, order 13.
      id: "791381-m17",
      title: "أمان الشبكات",
      shortTitle: "أمان الشبكات",
      order: 13,
      lessons: [
        {
          id: "791381-m17-l01",
          title: "القرصنة والهجمات على الشبكة",
          order: 1,
          pages: [
            { id: "791381-m17-l01-p01", title: "القرصنة والهجمات على الشبكة", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 108, printedPage: 108 }, keywords: ["القرصنة", "الهجمات", "أمان الشبكات"] },
            { id: "791381-m17-l01-p02", title: "DoS / DDoS", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 109, printedPage: 109 }, keywords: ["DoS", "DDoS", "إغراق الخادم"] },
            { id: "791381-m17-l01-p03", title: "Session Hijacking / MitM", order: 3, source: { kind: "book", sourceId: "791381", pdfPageStart: 110, printedPage: 110 }, keywords: ["Session Hijacking", "MitM", "اختطاف الجلسة", "الرجل في الوسط"] },
            { id: "791381-m17-l01-p04", title: "Phishing / Spoofing", order: 4, source: { kind: "book", sourceId: "791381", pdfPageStart: 111, printedPage: 111 }, keywords: ["Phishing", "Spoofing", "خداع", "تزييف"] },
          ],
        },
        {
          id: "791381-m17-l02",
          title: "الاتصالات الآمنة",
          order: 2,
          pages: [
            { id: "791381-m17-l02-p01", title: "الاتصالات الآمنة", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 112, printedPage: 112 }, keywords: ["الاتصالات الآمنة", "التشفير", "الهوية"] },
            { id: "791381-m17-l02-p02", title: "VPN", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 113, printedPage: 113 }, keywords: ["VPN", "اتصال آمن", "عمل عن بُعد", "Wi-Fi عامة"] },
            { id: "791381-m17-l02-p03", title: "SSL / TLS و HTTPS", order: 3, source: { kind: "book", sourceId: "791381", pdfPageStart: 114, printedPage: 114 }, keywords: ["SSL/TLS", "HTTPS", "القفل", "المتصفح"] },
            { id: "791381-m17-l02-p04", title: "SSH", order: 4, source: { kind: "book", sourceId: "791381", pdfPageStart: 115, printedPage: 115 }, keywords: ["SSH", "Telnet", "إدارة عن بُعد", "مفاتيح تشفير"] },
          ],
        },
      ],
    },
    {
      // Batch 5 phase: the book's REAL section «تجزئة البيانات» (PDF 116–118) + the PDF 119 end-of-batch trainings page,
      // complete. Stable id m18, order 14. PDF 120 («الدفعة الرابعة · برمجة السويتش و VLAN» cover) is the HARD STOP and is NOT converted.
      id: "791381-m18",
      title: "تجزئة البيانات",
      shortTitle: "تجزئة البيانات",
      order: 14,
      lessons: [
        {
          id: "791381-m18-l01",
          title: "Segment و Packet و Frame",
          order: 1,
          pages: [
            { id: "791381-m18-l01-p01", title: "تجزئة البيانات في OSI", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 116, printedPage: 116 }, keywords: ["تجزئة البيانات", "Segment", "Packet", "Frame", "غلاف"] },
            { id: "791381-m18-l01-p02", title: "Frame / Packet / Segment", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 117, printedPage: 117 }, keywords: ["Segment", "Packet", "Frame", "المنافذ", "IP", "MAC"] },
          ],
        },
        {
          id: "791381-m18-l02",
          title: "TCP 3-Way Handshake",
          order: 2,
          pages: [
            { id: "791381-m18-l02-p01", title: "TCP 3-Way Handshake", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 118, printedPage: 118 }, keywords: ["TCP", "3-Way Handshake", "SYN", "SYN-ACK", "ACK"] },
          ],
        },
        {
          id: "791381-m18-l03",
          title: "تدريبات نهاية الدفعة",
          order: 3,
          pages: [
            { id: "791381-m18-l03-p01", title: "تدريبات نهاية الدفعة", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 119 }, keywords: ["تدريبات", "نهاية الدفعة", "QR"] },
          ],
        },
      ],
    },
    {
      // m03 — COMPLETED IN PLACE (Batch 6): the historical Phase-2 skeleton module, now the book's section
      // «برمجة السويتش · CLI و VLAN» (source PDF 121–138; PDF 120 is the batch cover, metadata only in the body's
      // module source). Its id, title, lesson id/title and the two historical page ids, titles and source mappings
      // (`-l01-p01` = PDF 123 / printed 121, `-l01-p02` = PDF 124 / printed 122) are IMMUTABLE. PDF 121–122 precede
      // them in the book, so they are NEW stable page ids (`-l01-p03`, `-l01-p04`) placed first by explicit `order`;
      // the historical pages moved to orders 3–4 (ids are opaque — `order` sequences). New pages follow the
      // PRINTED PAGE = page circle = PDF index rule. Reading `order` stayed 15 (3 → 4 in Phase 3E; 4 → 7 when
      // Units 4–6 became m08–m10; 7 → 9 when Units 7–8 became m11–m12; 9 → 10 when Batch 3 became m13; 10 → 13 when
      // Batch 4 became m14–m16; 13 → 15 when Batch 5 became m17–m18).
      id: "791381-m03",
      title: "برمجة السويتش CLI و VLAN",
      shortTitle: "CLI و VLAN",
      order: 15,
      lessons: [
        {
          id: "791381-m03-l01",
          title: "مدخل إلى CLI و VLAN",
          order: 1,
          pages: [
            { id: "791381-m03-l01-p03", title: "برمجة السويتش — CLI", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 121, printedPage: 121 }, keywords: ["CLI", "واجهة الأوامر", "برمجة السويتش", "Command Line Interface"] },
            { id: "791381-m03-l01-p04", title: "الدخول إلى وضع البرمجة", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 122, printedPage: 122 }, keywords: ["enable", "configure terminal", "وضع الإعدادات", "الموجّه", "Switch CLI"] },
            // historical pages: id, title, source and keywords unchanged since the Phase-2 skeleton; ONLY `order` moved (1 → 3, 2 → 4)
            { id: "791381-m03-l01-p01", title: "منافذ السويتش", order: 3, source: { kind: "book", sourceId: "791381", pdfPageStart: 123, printedPage: 121 }, keywords: ["switch", "ports", "CLI"] },
            { id: "791381-m03-l01-p02", title: "برمجة المنافذ من CLI", order: 4, source: { kind: "book", sourceId: "791381", pdfPageStart: 124, printedPage: 122 }, keywords: ["access", "trunk", "VLAN"] },
          ],
        },
        {
          id: "791381-m03-l02",
          title: "مفهوم VLAN والمصطلحات",
          order: 2,
          pages: [
            { id: "791381-m03-l02-p01", title: "ما هي VLAN؟", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 125, printedPage: 125 }, keywords: ["VLAN", "تقسيم الشبكة", "شبكة افتراضية", "الإدارة", "المحاسبة"] },
            { id: "791381-m03-l02-p02", title: "مصطلحات مهمة في VLAN", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 126, printedPage: 126 }, keywords: ["VLAN ID", "VLAN 1", "Trunk", "1–4094", "Access"] },
            { id: "791381-m03-l02-p03", title: "فكرة VLAN", order: 3, source: { kind: "book", sourceId: "791381", pdfPageStart: 127, printedPage: 127 }, keywords: ["فكرة VLAN", "راوتر", "سويتش طبقة ثالثة", "فصل الشبكة"] },
            { id: "791381-m03-l02-p04", title: "جدول مثال VLAN", order: 4, source: { kind: "book", sourceId: "791381", pdfPageStart: 128, printedPage: 128 }, keywords: ["جدول VLAN", "192.168.10", "192.168.20", "/24", "Pc1-ADMIN", "Pc1-GAZ"] },
            { id: "791381-m03-l02-p05", title: "توزيع الأجهزة على VLAN", order: 5, source: { kind: "book", sourceId: "791381", pdfPageStart: 129, printedPage: 129 }, keywords: ["توزيع الأجهزة", "إعداد المنفذ", "VLAN 10", "VLAN 20"] },
          ],
        },
        {
          id: "791381-m03-l03",
          title: "إنشاء VLAN وربط المنافذ",
          order: 3,
          pages: [
            { id: "791381-m03-l03-p01", title: "إنشاء VLAN على السويتش", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 130, printedPage: 130 }, keywords: ["vlan 10", "name", "MNG", "GAZ", "إنشاء VLAN"] },
            { id: "791381-m03-l03-p02", title: "ربط المنافذ مع VLAN", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 131, printedPage: 131 }, keywords: ["interface range", "switchport mode access", "switchport access vlan", "ربط المنافذ"] },
            { id: "791381-m03-l03-p03", title: "توضيح Access Ports", order: 3, source: { kind: "book", sourceId: "791381", pdfPageStart: 132, printedPage: 132 }, keywords: ["Access Port", "VLAN واحدة", "Tag", "الأجهزة النهائية"] },
            { id: "791381-m03-l03-p04", title: "الواجهة SVI", order: 4, source: { kind: "book", sourceId: "791381", pdfPageStart: 133, printedPage: 133 }, keywords: ["SVI", "interface vlan", "ip address", "no shutdown", "Layer 3"] },
            { id: "791381-m03-l03-p05", title: "فكرة SVI و Gateway", order: 5, source: { kind: "book", sourceId: "791381", pdfPageStart: 134, printedPage: 134 }, keywords: ["Gateway", "Default Gateway", "نقطة خروج", "192.168.1.254"] },
          ],
        },
        {
          id: "791381-m03-l04",
          title: "Native / Tagged / Untagged",
          order: 4,
          pages: [
            { id: "791381-m03-l04-p01", title: "Native / Tagged / Untagged VLAN", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 135, printedPage: 135 }, keywords: ["Native VLAN", "Tagged VLAN", "Untagged VLAN", "Tag", "Trunk"] },
            { id: "791381-m03-l04-p02", title: "إعداد Native VLAN", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 136, printedPage: 136 }, keywords: ["switchport mode trunk", "switchport trunk native vlan", "vlan 99", "f0/24"] },
            { id: "791381-m03-l04-p03", title: "إعداد Tagged VLAN عبر Trunk", order: 3, source: { kind: "book", sourceId: "791381", pdfPageStart: 137, printedPage: 137 }, keywords: ["switchport trunk allowed vlan", "Tagged", "Trunk", "10,20"] },
            { id: "791381-m03-l04-p04", title: "إعداد Untagged / Access", order: 4, source: { kind: "book", sourceId: "791381", pdfPageStart: 138, printedPage: 138 }, keywords: ["Untagged", "Access", "switchport access vlan", "f0/1", "Trunk Port"] },
          ],
        },
      ],
    },
    {
      // m19 — Batch 7: the book's section «إدارة VLAN · VTP» (PDF 140–144; PDF 139 is the section cover, metadata only in
      // the body's module source). NEW stable id (the next free one — the m04 skeleton below is the DIFFERENT section that
      // starts at the PDF 145 cover); placed by explicit `order` 16, between m03 (15) and m04 (17).
      id: "791381-m19",
      title: "إدارة VLAN: VTP",
      shortTitle: "VTP",
      order: 16,
      lessons: [
        {
          id: "791381-m19-l01",
          title: "ما هو VTP وكيف يعمل",
          order: 1,
          pages: [
            { id: "791381-m19-l01-p01", title: "ما هو VTP؟", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 140, printedPage: 140 }, keywords: ["VTP", "VLAN Trunking Protocol", "Server", "Clients", "Cisco"] },
            { id: "791381-m19-l01-p02", title: "كيف يعمل VTP؟", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 141, printedPage: 141 }, keywords: ["خطوات تشغيل VTP", "Server", "Client", "تلقائيًا"] },
          ],
        },
        {
          id: "791381-m19-l02",
          title: "إعداد VTP",
          order: 2,
          pages: [
            { id: "791381-m19-l02-p01", title: "إعداد VTP: Server و Client", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 142, printedPage: 142 }, keywords: ["vtp mode server", "vtp domain", "vtp password", "vtp mode client"] },
            { id: "791381-m19-l02-p02", title: "إعداد VTP لباقي السويتشات", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 143, printedPage: 143 }, keywords: ["Client", "Domain", "باقي السويتشات", "Server"] },
            { id: "791381-m19-l02-p03", title: "تعريف VLAN على سويتش السيرفر", order: 3, source: { kind: "book", sourceId: "791381", pdfPageStart: 144, printedPage: 144 }, keywords: ["تعريف VLAN", "السيرفر", "العملاء", "تلقائيًا"] },
          ],
        },
      ],
    },
    {
      // m04 — COMPLETED IN PLACE (Batch 7): the historical Phase-2 skeleton module, now the book's section
      // «توجيه بين الشبكات · Trunk و Router on a Stick» (source PDF 146–156 + the PDF 157 end-of-batch trainings page;
      // PDF 145 is the section cover, metadata only in the body's module source). Its id, title, lesson id/title and the
      // historical page id, title and source mapping (`-l01-p01` = PDF 148 / printed 146) are IMMUTABLE. PDF 146–147
      // precede it in the book, so they are NEW stable page ids (`-l01-p02`, `-l01-p03`) placed first by explicit
      // `order`; the historical page moved to order 3; PDF 149–150 follow as `-l01-p04` / `-l01-p05` (ids are opaque —
      // `order` sequences). New pages follow the PRINTED PAGE = page circle = PDF index rule. Reading `order` 16 → 17
      // because the book's VTP section (m19, order 16) precedes this one.
      id: "791381-m04",
      title: "Trunk و Router on a Stick",
      shortTitle: "Trunk",
      order: 17,
      lessons: [
        {
          id: "791381-m04-l01",
          title: "الربط بين السويتشات والتوجيه",
          order: 1,
          pages: [
            { id: "791381-m04-l01-p02", title: "منافذ الربط بين السويتشات", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 146, printedPage: 146 }, keywords: ["منافذ الربط", "Trunk", "Sw1-HFA", "F0/23", "F0/24", "G0/0"] },
            { id: "791381-m04-l01-p03", title: "ما هو Trunk؟", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 147, printedPage: 147 }, keywords: ["Trunk", "Tag", "كابل واحد", "Access"] },
            // historical page: id, title, source and keywords unchanged since the Phase-2 skeleton; ONLY `order` moved (1 → 3)
            { id: "791381-m04-l01-p01", title: "أوامر Trunk", order: 3, source: { kind: "book", sourceId: "791381", pdfPageStart: 148, printedPage: 146 }, keywords: ["trunk", "dot1q"] },
            { id: "791381-m04-l01-p04", title: "أوامر Trunk — باقي السويتشات", order: 4, source: { kind: "book", sourceId: "791381", pdfPageStart: 149, printedPage: 149 }, keywords: ["Trunk", "المنفذ المقابل", "من الجهتين", "قاعدة"] },
            { id: "791381-m04-l01-p05", title: "Trunk على Sw6 مع الراوتر", order: 5, source: { kind: "book", sourceId: "791381", pdfPageStart: 150, printedPage: 150 }, keywords: ["Sw6", "الراوتر", "G0/0", "Router on a Stick"] },
          ],
        },
        {
          id: "791381-m04-l02",
          title: "Router on a Stick و Dot1Q",
          order: 2,
          pages: [
            { id: "791381-m04-l02-p01", title: "Router on a Stick", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 151, printedPage: 151 }, keywords: ["Router on a Stick", "Sub-Interface", "Inter-VLAN Routing", "Layer 2"] },
            { id: "791381-m04-l02-p02", title: "ما هو Dot1Q؟", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 152, printedPage: 152 }, keywords: ["Dot1Q", "Tag", "معيار", "Trunk"] },
            { id: "791381-m04-l02-p03", title: "إعداد Dot1Q على منفذ Trunk", order: 3, source: { kind: "book", sourceId: "791381", pdfPageStart: 153, printedPage: 153 }, keywords: ["interface g0/1", "switchport mode trunk", "switchport trunk allowed vlan", "10,20,30"] },
            { id: "791381-m04-l02-p04", title: "Router on a Stick — VLAN 10 / 20", order: 4, source: { kind: "book", sourceId: "791381", pdfPageStart: 154, printedPage: 154 }, keywords: ["interface g0/0.10", "encapsulation dot1Q", "ip address", "Sub-Interface", "Gateway"] },
            { id: "791381-m04-l02-p05", title: "Router on a Stick — VLAN 30 / 40", order: 5, source: { kind: "book", sourceId: "791381", pdfPageStart: 155, printedPage: 155 }, keywords: ["g0/0.30", "g0/0.40", "encapsulation dot1Q", "192.168.30.254", "192.168.40.254"] },
          ],
        },
        {
          id: "791381-m04-l03",
          title: "خلاصة الوحدة وتدريبات نهاية الدفعة",
          order: 3,
          pages: [
            { id: "791381-m04-l03-p01", title: "خلاصة الوحدة", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 156, printedPage: 156 }, keywords: ["خلاصة", "VLAN", "Trunk", "Dot1Q", "Router on a Stick"] },
            { id: "791381-m04-l03-p02", title: "تدريبات نهاية الدفعة", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 157 }, keywords: ["تدريبات", "نهاية الدفعة", "QR", "VLAN", "Trunk"] },
          ],
        },
      ],
    },
    {
      // m20 — Batch 8: the book's section «Wi-Fi · الشبكات اللاسلكية» (PDF 159–165; PDF 158 is the fifth-batch cover
      // «Wi-Fi و IPv6 و DHCP والأمان», metadata only in the body's module source). NEW stable id; explicit `order` 18,
      // after m04 (17). The m05 / m06 skeletons below are the DIFFERENT sections «مرجع أوامر Cisco» (PDF 193+) and «ACL».
      id: "791381-m20",
      title: "Wi-Fi والشبكات اللاسلكية",
      shortTitle: "Wi-Fi",
      order: 18,
      lessons: [
        {
          id: "791381-m20-l01",
          title: "DMZ و Wi-Fi",
          order: 1,
          pages: [
            { id: "791381-m20-l01-p01", title: "DMZ — المنطقة العازلة", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 159, printedPage: 159 }, keywords: ["DMZ", "المنطقة العازلة", "جدار حماية", "Web", "Mail", "DNS"] },
            { id: "791381-m20-l01-p02", title: "Wi-Fi — الشبكة اللاسلكية", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 160, printedPage: 160 }, keywords: ["Wi-Fi", "موجات الراديو", "التغطية", "التداخل", "الأمان"] },
            { id: "791381-m20-l01-p03", title: "أنواع الشبكات اللاسلكية", order: 3, source: { kind: "book", sourceId: "791381", pdfPageStart: 161, printedPage: 161 }, keywords: ["PAN", "WLAN", "WPAN", "WWAN", "Bluetooth", "4G / 5G"] },
          ],
        },
        {
          id: "791381-m20-l02",
          title: "SSID وأمان الشبكة اللاسلكية",
          order: 2,
          pages: [
            { id: "791381-m20-l02-p01", title: "SSID — اسم شبكة Wi-Fi", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 162, printedPage: 162 }, keywords: ["SSID", "اسم الشبكة", "Access Point", "إخفاء الشبكة"] },
            { id: "791381-m20-l02-p02", title: "أمان الشبكة اللاسلكية", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 163, printedPage: 163 }, keywords: ["أمان", "التنصّت", "Spoofing", "تشفير", "كلمة مرور قوية"] },
            { id: "791381-m20-l02-p03", title: "تقنيات حماية Wi-Fi", order: 3, source: { kind: "book", sourceId: "791381", pdfPageStart: 164, printedPage: 164 }, keywords: ["WEP", "WPA", "WPA2", "WPA3", "تشفير"] },
            { id: "791381-m20-l02-p04", title: "Access Point — نقطة الوصول", order: 4, source: { kind: "book", sourceId: "791381", pdfPageStart: 165, printedPage: 165 }, keywords: ["Access Point", "AP", "نقطة الوصول", "تغطية Wi-Fi", "Switch"] },
          ],
        },
      ],
    },
    {
      // m21 — Batch 8: the book's section «IPv6 والمنافذ» (PDF 166–168, no section cover). NEW stable id; order 19.
      id: "791381-m21",
      title: "IPv6 والمنافذ",
      shortTitle: "IPv6 والمنافذ",
      order: 19,
      lessons: [
        {
          id: "791381-m21-l01",
          title: "IPv6 والمنافذ المهمة",
          order: 1,
          pages: [
            { id: "791381-m21-l01-p01", title: "IPv6 — عنوان الجيل الجديد", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 166, printedPage: 166 }, keywords: ["IPv6", "IPv4", "128 بت", "Hexadecimal"] },
            { id: "791381-m21-l01-p02", title: "أمثلة اختصار IPv6", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 167, printedPage: 167 }, keywords: ["اختصار IPv6", "::", "الأصفار المتتالية", "2001:db8::ff00:42:8329"] },
            { id: "791381-m21-l01-p03", title: "Ports — المنافذ المهمة", order: 3, source: { kind: "book", sourceId: "791381", pdfPageStart: 168, printedPage: 168 }, keywords: ["Port", "HTTP 80", "HTTPS 443", "SSH 22", "DNS 53", "FTP 21", "Telnet 23"] },
          ],
        },
      ],
    },
    {
      // m22 — Batch 8: the book's section «بروتوكول DHCP» (PDF 169–179, no section cover). NEW stable id; order 20. The
      // three router pages (PDF 172–174) carry the first interactive CLI exercises (simulation / cli-terminal / v1).
      id: "791381-m22",
      title: "بروتوكول DHCP",
      shortTitle: "DHCP",
      order: 20,
      lessons: [
        {
          id: "791381-m22-l01",
          title: "ما هو DHCP",
          order: 1,
          pages: [
            { id: "791381-m22-l01-p01", title: "DHCP — مقدمة", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 169, printedPage: 169 }, keywords: ["DHCP", "توزيع تلقائي", "IP", "Gateway", "DNS"] },
            { id: "791381-m22-l01-p02", title: "مراحل عمل DHCP", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 170, printedPage: 170 }, keywords: ["Discover", "Offer", "Request", "ACK", "DORA"] },
            { id: "791381-m22-l01-p03", title: "مثال DHCP على الراوتر", order: 3, source: { kind: "book", sourceId: "791381", pdfPageStart: 171, printedPage: 171 }, keywords: ["192.168.1.0/24", "192.168.1.10", "192.168.1.50", "192.168.1.254", "الراوتر كخادم DHCP"] },
          ],
        },
        {
          id: "791381-m22-l02",
          title: "DHCP على الراوتر",
          order: 2,
          pages: [
            { id: "791381-m22-l02-p01", title: "DHCP على الراوتر — الجزء الأول", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 172, printedPage: 172 }, keywords: ["ip address", "no shutdown", "ip dhcp pool LAN", "network", "Router(dhcp-config)#"] },
            { id: "791381-m22-l02-p02", title: "DHCP على الراوتر — الجزء الثاني", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 173, printedPage: 173 }, keywords: ["default-router", "dns-server", "ip dhcp excluded-address", "8.8.8.8"] },
            { id: "791381-m22-l02-p03", title: "شرح أوامر DHCP", order: 3, source: { kind: "book", sourceId: "791381", pdfPageStart: 174, printedPage: 174 }, keywords: ["interface G0/0", "ip address", "network", "default-router", "dns-server", "وظيفة كل أمر"] },
            { id: "791381-m22-l02-p04", title: "DHCP — ملاحظات مهمة", order: 4, source: { kind: "book", sourceId: "791381", pdfPageStart: 175, printedPage: 175 }, keywords: ["العناوين المستثناة", "إعادة الاستخدام", "مدة العنوان", "APIPA", "169.254.x.x"] },
          ],
        },
        {
          id: "791381-m22-l03",
          title: "DHCP عن طريق Server",
          order: 3,
          pages: [
            { id: "791381-m22-l03-p01", title: "DHCP عن طريق Server", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 176, printedPage: 176 }, keywords: ["Server", "192.168.10.0/24", "Packet Tracer", "جهاز مركزي"] },
            { id: "791381-m22-l03-p02", title: "خطوة 1: الدخول للسيرفر", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 177, printedPage: 177 }, keywords: ["Server", "Services", "DHCP Service", "Packet Tracer"] },
            { id: "791381-m22-l03-p03", title: "خطوة 2: تشغيل DHCP", order: 3, source: { kind: "book", sourceId: "791381", pdfPageStart: 178, printedPage: 178 }, keywords: ["On", "Off", "تفعيل الخدمة"] },
            { id: "791381-m22-l03-p04", title: "خطوة 3: إدخال التعريفات", order: 4, source: { kind: "book", sourceId: "791381", pdfPageStart: 179, printedPage: 179 }, keywords: ["Default Gateway", "DNS Server", "Start IP", "Add", "Save", "Static"] },
          ],
        },
      ],
    },
    {
      // m23 — Batch 9: the book's section «Port Security» (PDF 180–184, no section cover). NEW stable id; order 21.
      id: "791381-m23",
      title: "Port Security",
      shortTitle: "Port Security",
      order: 21,
      lessons: [
        {
          id: "791381-m23-l01",
          title: "ما هو Port Security",
          order: 1,
          pages: [
            { id: "791381-m23-l01-p01", title: "Port Security", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 180, printedPage: 180 }, keywords: ["Port Security", "MAC Address", "حماية المنافذ", "جهاز غير مسموح"] },
            { id: "791381-m23-l01-p02", title: "سيناريو Port Security", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 181, printedPage: 181 }, keywords: ["سيناريو", "PC0", "PC1", "جهاز غريب", "Sticky", "MAC ثابت"] },
          ],
        },
        {
          id: "791381-m23-l02",
          title: "أوامر Port Security",
          order: 2,
          pages: [
            { id: "791381-m23-l02-p01", title: "Port Security — MAC ثابت", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 182, printedPage: 182 }, keywords: ["interface f0/1", "switchport mode access", "switchport port-security mac-address", "violation shutdown"] },
            { id: "791381-m23-l02-p02", title: "Port Security — Sticky MAC", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 183, printedPage: 183 }, keywords: ["switchport port-security", "mac-address sticky", "Sticky"] },
            { id: "791381-m23-l02-p03", title: "Port Security — عدد الأجهزة", order: 3, source: { kind: "book", sourceId: "791381", pdfPageStart: 184, printedPage: 184 }, keywords: ["switchport port-security maximum 3", "violation shutdown", "عدد الأجهزة"] },
          ],
        },
      ],
    },
    {
      // m24 — Batch 9: the book's section «حماية أجهزة Cisco» (PDF 185–191; PDF 191 is the closing QR trainings page).
      // NEW stable id; order 22.
      id: "791381-m24",
      title: "حماية أجهزة Cisco",
      shortTitle: "حماية الأجهزة",
      order: 22,
      lessons: [
        {
          id: "791381-m24-l01",
          title: "طرق الدخول إلى أجهزة Cisco",
          order: 1,
          pages: [
            { id: "791381-m24-l01-p01", title: "حماية السويتشات والراوترات", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 185, printedPage: 185 }, keywords: ["كلمات مرور", "Console", "VTY", "Enable", "الدخول غير المصرّح به"] },
            { id: "791381-m24-l01-p02", title: "طرق الدخول إلى أجهزة Cisco", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 186, printedPage: 186 }, keywords: ["Console", "VTY", "Enable", "line console 0", "line vty 0 4", "enable secret", "Telnet", "SSH"] },
          ],
        },
        {
          id: "791381-m24-l02",
          title: "كلمات المرور وعرض الإعدادات",
          order: 2,
          pages: [
            { id: "791381-m24-l02-p01", title: "كلمة مرور VTY", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 187, printedPage: 187 }, keywords: ["line vty 0 4", "password cisco123", "login", "SSH", "Telnet"] },
            { id: "791381-m24-l02-p02", title: "كلمة مرور Console", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 188, printedPage: 188 }, keywords: ["line console 0", "password cisco123", "login", "Packet Tracer"] },
            { id: "791381-m24-l02-p03", title: "تشفير كلمات المرور", order: 3, source: { kind: "book", sourceId: "791381", pdfPageStart: 189, printedPage: 189 }, keywords: ["service password-encryption", "enable secret cisco123", "enable password"] },
            { id: "791381-m24-l02-p04", title: "عرض الإعدادات", order: 4, source: { kind: "book", sourceId: "791381", pdfPageStart: 190, printedPage: 190 }, keywords: ["show running-config", "show startup-config", "الفحص", "الحفظ"] },
          ],
        },
        {
          id: "791381-m24-l03",
          title: "تدريبات نهاية القسم",
          order: 3,
          pages: [
            { id: "791381-m24-l03-p01", title: "تدريبات على DHCP و Security", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 191, printedPage: 191 }, keywords: ["تدريبات", "QR", "T23", "T24", "T25", "T26"] },
          ],
        },
      ],
    },
    {
      // m05 — COMPLETED IN PLACE (Batch 9): the historical Phase-2 skeleton module, now the book's section
      // «مرجع أوامر Cisco» (PDF 192–199). Its id, title, shortTitle, lesson `791381-m05-l01` id/title and the historical
      // page ids, titles and source mappings (`-l01-p01` = PDF 193 / printed 191, `-l01-p02` = PDF 194 / printed 192)
      // are IMMUTABLE. PDF 192 precedes them in the book, so it is the NEW stable page id `-l01-p03` placed first by
      // explicit `order`; the historical pages moved to orders 2 / 3 (ids are opaque — `order` sequences). New pages
      // follow the PRINTED PAGE = page circle = PDF index rule. Reading `order` 21 → 23 because the Batch-9 sections
      // Port Security (m23) and حماية أجهزة Cisco (m24) precede it in the book.
      id: "791381-m05",
      title: "مرجع أوامر Cisco",
      shortTitle: "أوامر Cisco",
      order: 23,
      lessons: [
        {
          id: "791381-m05-l01",
          title: "الأوامر الأساسية",
          order: 1,
          pages: [
            { id: "791381-m05-l01-p03", title: "أوامر السويتش والراوتر", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 192, printedPage: 192 }, keywords: ["CLI", "أوامر", "الامتحانات العملية", "نوع الجهاز والإصدار"] },
            { id: "791381-m05-l01-p01", title: "أوامر أساسية للجهاز", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 193, printedPage: 191 }, keywords: ["cisco", "cli"] },
            { id: "791381-m05-l01-p02", title: "أوامر VLAN و Trunk", order: 3, source: { kind: "book", sourceId: "791381", pdfPageStart: 194, printedPage: 192 }, keywords: ["vlan", "trunk"] },
          ],
        },
        {
          id: "791381-m05-l02",
          title: "VTP و Dot1Q و Port Security",
          order: 2,
          pages: [
            { id: "791381-m05-l02-p01", title: "VTP وكلمات مرور سريعة", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 195, printedPage: 195 }, keywords: ["vtp mode server", "vtp mode client", "enable secret cisco123", "line console 0", "line vty 0 4", "VTP domain"] },
            { id: "791381-m05-l02-p02", title: "Sub-Interface و Dot1Q", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 196, printedPage: 196 }, keywords: ["interface g0/0.10", "encapsulation dot1Q 10", "ip address 192.168.10.254", "Sub-Interface", "Gateway"] },
            { id: "791381-m05-l02-p03", title: "أوامر Port Security مختصرة", order: 3, source: { kind: "book", sourceId: "791381", pdfPageStart: 197, printedPage: 197 }, keywords: ["interface f0/1", "switchport mode access", "switchport port-security maximum 2", "violation shutdown"] },
          ],
        },
        {
          id: "791381-m05-l03",
          title: "أوامر الفحص وما بعد",
          order: 3,
          pages: [
            { id: "791381-m05-l03-p01", title: "أوامر الفحص المهمة", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 198, printedPage: 198 }, keywords: ["show", "show vlan brief", "show port-security", "show running-config", "show ip route"] },
            { id: "791381-m05-l03-p02", title: "OSPF / EIGRP / ACL — تذكير سريع", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 199, printedPage: 199 }, keywords: ["OSPF", "EIGRP", "ACL", "show access-lists", "الدفعة التالية"] },
          ],
        },
      ],
    },
    {
      id: "791381-m06",
      title: "قوائم التحكم ACL",
      shortTitle: "ACL",
      order: 24,
      lessons: [
        {
          id: "791381-m06-l01",
          title: "التحكم بالوصول",
          order: 1,
          pages: [
            { id: "791381-m06-l01-p01", title: "Extended ACL", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 227, printedPage: 225 }, keywords: ["acl", "extended"] },
          ],
        },
      ],
    },
  ],
  // The EIGHT Phase-3 overview "batches" are PRESENTATION groupings that each map to one OR MORE real modules (§29);
  // they are NOT themselves canonical modules. The order is the OWNER-approved visible order (intro … summary).
  // A batch whose modules are not yet in this PARTIAL skeleton carries an empty `moduleIds` for now — this means
  // "not yet represented in interactive content", NOT "empty in the book". Introduction and Summary are real book
  // sections whose canonical modules are authored during conversion, so they are empty here for now.
  batches: [
    { id: "intro", label: "المقدمة", moduleIds: [] },
    { id: "b1", label: "الأساسيات · الأعداد · IP", moduleIds: ["791381-m01", "791381-m02", "791381-m07", "791381-m08"] },
    { id: "b2", label: "الأجهزة والرسائل", moduleIds: ["791381-m09", "791381-m10", "791381-m11", "791381-m12"] },
    { id: "b3", label: "النماذج والبروتوكولات والأمان", moduleIds: ["791381-m13", "791381-m14", "791381-m15", "791381-m16", "791381-m17", "791381-m18"] },
    { id: "b4", label: "برمجة السويتش و VLAN", moduleIds: ["791381-m03", "791381-m19", "791381-m04"] },
    { id: "b5", label: "الأمان · Wi-Fi · IPv6 · DHCP", moduleIds: ["791381-m20", "791381-m21", "791381-m22", "791381-m23", "791381-m24", "791381-m05"] },
    { id: "b6", label: "ACL · التوجيه · WAN", moduleIds: ["791381-m06"] },
    { id: "summary", label: "التلخيص", moduleIds: [] },
  ],
};

export default manifest;
