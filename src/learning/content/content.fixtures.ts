// Learning Materials — Phase 2: SYNTHETIC TEST FIXTURES ONLY.
//
// These are architecture-test fixtures, NOT production content and NOT real lessons (§31). They are imported only
// by *.test.ts files. Each fixture exercises a different content SHAPE so the schema/validator/navigation are
// proven against the variety found in the source book, without converting any real page.

import {
  deriveManifest,
  type LearningCourseContent, type ContentPage, type ContentBlock, type ContentModule,
} from "./types";

// Every fixture uses courseId "791381" so it matches the Phase-1 catalog (no spurious unknown-course issue).
const COURSE_ID = "791381";

const src = (pdfPageStart: number): ContentPage["source"] => ({ kind: "book", sourceId: COURSE_ID, pdfPageStart });

// ── Fixture A — basic explanatory page: text + callout + image ──────────────────────────────────────────────
export const pageBasic: ContentPage = {
  id: "f-m01-l01-p01", title: "ما هي الشبكة؟", order: 1, source: src(8),
  blocks: [
    { id: "fa-b1", type: "heading", origin: "book", text: "ما هي الشبكة؟", level: 2 },
    { id: "fa-b2", type: "text", origin: "book", spans: [{ text: "الشبكة هي مجموعة أجهزة متصلة لتبادل " }, { text: "المعلومات", style: "term" }, { text: "." }] },
    { id: "fa-b3", type: "callout", origin: "book", kind: "summary", title: "الخلاصة", spans: [{ text: "بدون شبكة لا تتواصل الأجهزة بسهولة." }] },
    { id: "fa-b4", type: "image", origin: "book", src: "/learning/791381/network.png", alt: "رسم توضيحي لشبكة تربط عدة أجهزة" },
  ],
};

// ── Fixture B — binary worked example: solved example + table (book content) ─────────────────────────────────
export const pageBinary: ContentPage = {
  id: "f-m02-l01-p01", title: "تحويل من الثنائي للعشري", order: 1, source: src(16),
  blocks: [
    {
      id: "fb-b1", type: "example", mode: "solved", origin: "book", title: "مثال محلول", prompt: "حوّل 01111011 إلى العشري",
      steps: [{ text: "ضع كل رقم تحت قيمته" }, { text: "اجمع القيم التي تحتها 1" }], result: "123",
      explanation: "القيم المضيئة: 64 + 32 + 16 + 8 + 2 + 1 = 123.",
    },
    {
      id: "fb-b2", type: "table", origin: "book", caption: "الصناديق",
      headers: ["128", "64", "32", "16", "8", "4", "2", "1"],
      rows: [["0", "1", "1", "1", "1", "0", "1", "1"]],
    },
  ],
};

// ── Fixture C — CLI page: text + code block with dir:"ltr" inside an RTL lesson ──────────────────────────────
export const pageCli: ContentPage = {
  id: "f-m03-l01-p01", title: "برمجة المنافذ من CLI", order: 1, source: src(124),
  blocks: [
    { id: "fc-b1", type: "text", origin: "book", spans: [{ text: "نضبط المنفذ ثم نربطه بـ " }, { text: "VLAN", dir: "ltr", style: "code" }, { text: "." }] },
    { id: "fc-b2", type: "code", origin: "book", language: "cli", dir: "ltr", code: "Switch(config)# interface f0/1\nSwitch(config-if)# switchport mode access\nSwitch(config-if)# switchport access vlan 10" },
  ],
};

// ── Fixture D — practice page: multipleChoice with immediate-feedback fields (teacher enrichment) ────────────
export const pageQuiz: ContentPage = {
  id: "f-m03-l01-p02", title: "تدرّب: المنافذ", order: 2, source: src(125),
  blocks: [
    {
      id: "fd-b1", type: "practice", origin: "teacher-enrichment",
      question: {
        kind: "multipleChoice", prompt: "أي وضع يربط جهازًا نهائيًا واحدًا بالمنفذ؟",
        options: [
          { id: "fd-o1", text: "Access", correct: true },
          { id: "fd-o2", text: "Trunk" },
        ],
        feedback: {
          correctFeedback: "أحسنت — Access لجهاز واحد.",
          incorrectFeedback: "Trunk وصلة بين السويتشات، وليست لجهاز نهائي.",
          hint: "فكّر في عدد الأجهزة على المنفذ.",
          explanation: "Access لجهاز واحد، Trunk وصلة بين السويتشات.",
        },
      },
    },
  ],
};

// ── Fixture E — simulation placeholder: VLAN descriptor (teacher enrichment; no behavior/config) ─────────────
export const pageSimulation: ContentPage = {
  id: "f-m03-l01-p03", title: "محاكاة VLAN", order: 3, source: src(126),
  blocks: [
    { id: "fe-b1", type: "simulation", origin: "teacher-enrichment", simulationType: "vlan", title: "محاكاة توزيع المنافذ على VLANs", description: "ستتوفر لاحقًا." },
  ],
};

// ── Fixture F — a MIXED interactive page: faithful book blocks + clearly-separated teacher enrichment ────────
// Proves origin book vs teacher-enrichment coexist on one page; a clarification callout replaces any silent
// "correction"; a teacher-enrichment block may carry its own block-level source referencing the book page it builds on.
export const pageMixed: ContentPage = {
  id: "f-m03-l01-p04", title: "Access مقابل Trunk", order: 4, source: src(124), conversionNote: "صفحة كثيفة قُسّمت إلى صفحتين تفاعليتين.",
  blocks: [
    { id: "ff-b1", type: "heading", origin: "book", text: "Access مقابل Trunk", level: 2 },
    { id: "ff-b2", type: "text", origin: "book", spans: [{ text: "منفذ " }, { text: "Access", dir: "ltr", style: "term" }, { text: " لجهاز واحد، ومنفذ " }, { text: "Trunk", dir: "ltr", style: "term" }, { text: " وصلة بين السويتشات." }] },
    { id: "ff-b3", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلم", spans: [{ text: "المصدر يكتب المصطلح بحروف كبيرة؛ أبقيناه كما هو وأضفنا هذا التوضيح." }] },
    {
      id: "ff-b4", type: "example", origin: "teacher-enrichment", mode: "practice", title: "مثال للحل",
      source: { kind: "book", sourceId: "791381", pdfPageStart: 124 },
      prompt: "صنّف المنفذ الذي يربط سويتشين: Access أم Trunk؟", steps: [{ text: "حدّد عدد الأجهزة على الوصلة" }],
    },
  ],
};

/** A valid, multi-shape course — validation should return ZERO issues. */
export const validCourse: LearningCourseContent = {
  schemaVersion: 1,
  courseId: COURSE_ID,
  title: "شبكات الاتصال (اختبار)",
  direction: "rtl",
  modules: [
    { id: "f-m01", title: "أساسيات", order: 1, lessons: [{ id: "f-m01-l01", title: "مقدمة", order: 1, pages: [pageBasic] }] },
    { id: "f-m02", title: "الأعداد", order: 2, lessons: [{ id: "f-m02-l01", title: "التحويل", order: 1, pages: [pageBinary] }] },
    {
      id: "f-m03", title: "CLI و VLAN", order: 3,
      lessons: [{ id: "f-m03-l01", title: "المنافذ", order: 1, pages: [pageCli, pageQuiz, pageSimulation, pageMixed] }],
    },
  ],
};

/** Deep clone so a mutating test never poisons a shared fixture. */
export function cloneCourse(course: LearningCourseContent = validCourse): LearningCourseContent {
  return structuredClone(course);
}

// ── Navigation fixture: 2 modules × 2 lessons × 2+ pages ─────────────────────────────────────────────────────
function page(id: string, order: number, pdf: number): ContentPage {
  return { id, title: id, order, source: src(pdf), blocks: [{ id: id + "-b1", type: "text", origin: "book", spans: [{ text: id }] }] };
}
export const navCourse: LearningCourseContent = {
  schemaVersion: 1, courseId: COURSE_ID, title: "تنقل", direction: "rtl",
  modules: [
    {
      id: "n-m1", title: "M1", order: 1, lessons: [
        { id: "n-m1-l1", title: "L1", order: 1, pages: [page("n-m1-l1-p1", 1, 1), page("n-m1-l1-p2", 2, 2)] },
        { id: "n-m1-l2", title: "L2", order: 2, pages: [page("n-m1-l2-p1", 1, 3), page("n-m1-l2-p2", 2, 4)] },
      ],
    },
    {
      id: "n-m2", title: "M2", order: 2, lessons: [
        { id: "n-m2-l1", title: "L1", order: 1, pages: [page("n-m2-l1-p1", 1, 5), page("n-m2-l1-p2", 2, 6)] },
        { id: "n-m2-l2", title: "L2", order: 2, pages: [page("n-m2-l2-p1", 1, 7), page("n-m2-l2-p2", 2, 8)] },
      ],
    },
  ],
};
export const navManifest = deriveManifest(navCourse);

/** Convenience for block-level tests. */
export function blockById(course: LearningCourseContent, blockId: string): ContentBlock | undefined {
  for (const m of course.modules) for (const l of m.lessons) for (const p of l.pages) {
    const b = p.blocks.find(x => x.id === blockId);
    if (b) return b;
  }
  return undefined;
}
export type { ContentModule };
