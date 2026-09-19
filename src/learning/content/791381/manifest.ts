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
      // Historical Phase-2 skeleton (PDF 123+). Its ID and source mappings are immutable; only its reading `order`
      // shifts as real units are converted (3 → 4 in Phase 3E; 4 → 7 when Units 4–6 became m08–m10).
      id: "791381-m03",
      title: "برمجة السويتش CLI و VLAN",
      shortTitle: "CLI و VLAN",
      order: 7,
      lessons: [
        {
          id: "791381-m03-l01",
          title: "مدخل إلى CLI و VLAN",
          order: 1,
          pages: [
            { id: "791381-m03-l01-p01", title: "منافذ السويتش", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 123, printedPage: 121 }, keywords: ["switch", "ports", "CLI"] },
            { id: "791381-m03-l01-p02", title: "برمجة المنافذ من CLI", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 124, printedPage: 122 }, keywords: ["access", "trunk", "VLAN"] },
          ],
        },
      ],
    },
    {
      id: "791381-m04",
      title: "Trunk و Router on a Stick",
      shortTitle: "Trunk",
      order: 8,
      lessons: [
        {
          id: "791381-m04-l01",
          title: "الربط بين السويتشات والتوجيه",
          order: 1,
          pages: [
            { id: "791381-m04-l01-p01", title: "أوامر Trunk", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 148, printedPage: 146 }, keywords: ["trunk", "dot1q"] },
          ],
        },
      ],
    },
    {
      id: "791381-m05",
      title: "مرجع أوامر Cisco",
      shortTitle: "أوامر Cisco",
      order: 9,
      lessons: [
        {
          id: "791381-m05-l01",
          title: "الأوامر الأساسية",
          order: 1,
          pages: [
            { id: "791381-m05-l01-p01", title: "أوامر أساسية للجهاز", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 193, printedPage: 191 }, keywords: ["cisco", "cli"] },
            { id: "791381-m05-l01-p02", title: "أوامر VLAN و Trunk", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 194, printedPage: 192 }, keywords: ["vlan", "trunk"] },
          ],
        },
      ],
    },
    {
      id: "791381-m06",
      title: "قوائم التحكم ACL",
      shortTitle: "ACL",
      order: 10,
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
    { id: "b2", label: "الأجهزة والرسائل", moduleIds: ["791381-m09"] },
    { id: "b3", label: "النماذج والبروتوكولات والأمان", moduleIds: [] },
    { id: "b4", label: "برمجة السويتش و VLAN", moduleIds: ["791381-m03", "791381-m04", "791381-m05"] },
    { id: "b5", label: "الأمان · Wi-Fi · IPv6 · DHCP", moduleIds: [] },
    { id: "b6", label: "ACL · التوجيه · WAN", moduleIds: ["791381-m06"] },
    { id: "summary", label: "التلخيص", moduleIds: [] },
  ],
};

export default manifest;
