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
          id: "791381-m01-l01",
          title: "مقدمة إلى الشبكات",
          order: 1,
          pages: [
            { id: "791381-m01-l01-p01", title: "ما هي الشبكة؟", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 8, printedPage: 6 }, keywords: ["شبكة", "network"] },
            { id: "791381-m01-l01-p02", title: "استخدامات الشبكة", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 9, printedPage: 7 } },
            { id: "791381-m01-l01-p03", title: "حسنات الشبكة", order: 3, source: { kind: "book", sourceId: "791381", pdfPageStart: 10, printedPage: 8 } },
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
          id: "791381-m02-l01",
          title: "أنظمة العد والتحويل",
          order: 1,
          pages: [
            { id: "791381-m02-l01-p01", title: "تحويل من الثنائي للعشري", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 16, printedPage: 14 }, keywords: ["binary", "decimal", "ثنائي", "عشري"] },
            { id: "791381-m02-l01-p02", title: "الميزان السادس عشر (Hex)", order: 2, source: { kind: "book", sourceId: "791381", pdfPageStart: 18, printedPage: 16 }, keywords: ["hex", "سادس عشر"] },
            { id: "791381-m02-l01-p03", title: "من السادس عشر إلى الثنائي", order: 3, source: { kind: "book", sourceId: "791381", pdfPageStart: 20, printedPage: 18 } },
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
  // The six Phase-1 overview "batches" are PRESENTATION groupings that each map to one OR MORE real modules (§29).
  // Every batch corresponds to real units in the source book; a batch whose modules are not yet in this PARTIAL
  // skeleton carries an empty `moduleIds` list for now (pending conversion) — an empty list means "not yet
  // represented in the skeleton", NOT that the batch has no content in the book.
  batches: [
    { id: "b1", label: "الأساسيات · الأعداد · IP", moduleIds: ["791381-m01", "791381-m02"] },
    { id: "b2", label: "الأجهزة والرسائل", moduleIds: [] },
    { id: "b3", label: "النماذج والبروتوكولات والأمان", moduleIds: [] },
    { id: "b4", label: "برمجة السويتش و VLAN", moduleIds: ["791381-m03", "791381-m04", "791381-m05"] },
    { id: "b5", label: "الأمان · Wi-Fi · IPv6 · DHCP", moduleIds: [] },
    { id: "b6", label: "ACL · التوجيه · WAN", moduleIds: ["791381-m06"] },
  ],
};

export default manifest;
