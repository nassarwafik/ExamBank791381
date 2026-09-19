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
      id: "791381-m03",
      title: "برمجة السويتش CLI و VLAN",
      shortTitle: "CLI و VLAN",
      order: 3,
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
      order: 4,
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
      order: 5,
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
      order: 6,
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
    { id: "b1", label: "الأساسيات · الأعداد · IP", moduleIds: ["791381-m01", "791381-m02"] },
    { id: "b2", label: "الأجهزة والرسائل", moduleIds: [] },
    { id: "b3", label: "النماذج والبروتوكولات والأمان", moduleIds: [] },
    { id: "b4", label: "برمجة السويتش و VLAN", moduleIds: ["791381-m03", "791381-m04", "791381-m05"] },
    { id: "b5", label: "الأمان · Wi-Fi · IPv6 · DHCP", moduleIds: [] },
    { id: "b6", label: "ACL · التوجيه · WAN", moduleIds: ["791381-m06"] },
    { id: "summary", label: "التلخيص", moduleIds: [] },
  ],
};

export default manifest;
