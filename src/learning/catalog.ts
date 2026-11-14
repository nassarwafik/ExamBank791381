// Learning Materials catalog (المواد التعليمية) — library and course-overview METADATA.
//
// This is the ONE central place that owns course/book metadata for the Learning Materials product. The page and
// its cards read every string from here — nothing course-specific is hardcoded in JSX, so adding a second book
// later (e.g. 794589, 899371) is a data edit here, not a UI rewrite.
//
// The reading structure (Course → Module → Lesson → Page → Blocks) lives in each course's content manifest
// (`content/<courseId>/manifest.ts`), and the API's publishable list in `api/src/lib/learning-materials-registry.js`.
// `overviewBatches` here are the course overview's presentation labels only; their module membership and page
// ranges come from the manifest's `batches` (pinned equal by courseHomePremium.21el1b.test.ts), and a batch whose
// modules have no pages yet is shown as «قريبًا» (Phase L.0).

/** Whether a course can be opened (its overview and, when it has content, the Reader) or is still upcoming. */
export type LearningCourseStatus = "available" | "coming-soon";

/** A single high-level content section shown on the course overview (its id matches a manifest batch). */
export type LearningBatch = { id: string; label: string };

/** Minimal, forward-compatible course/book identity for the Learning Materials library. */
export type LearningCourse = {
  /** Canonical course id (also the owner's book number), e.g. "791381". */
  id: string;
  /** Short subject title, e.g. "شبكات الاتصال". */
  title: string;
  /** Product-facing title used on the overview, e.g. "كتاب 791381 — شبكات الاتصال". */
  productTitle: string;
  /** Curriculum subject, e.g. "أنظمة محوسبة". */
  subject: string;
  /** Target grades, e.g. "الصف العاشر / الحادي عشر". */
  grades: string;
  /** Author display name. */
  author: string;
  /** Academic year, e.g. "2026–2027". */
  year: string;
  /** Availability of the course entry. */
  status: LearningCourseStatus;
  /** One-line description shown on the card and the overview intro. */
  description: string;
  /** High-level content batches for the Phase-1 overview (labels only; no lessons/pages yet). */
  overviewBatches: LearningBatch[];
};

/**
 * The first course: the owner-provided networking book 791381. Its eight high-level presentation sections
 * (المقدمة · الأساسيات·الأعداد·IP · الأجهزة والرسائل · النماذج والبروتوكولات والأمان · برمجة السويتش و VLAN ·
 * الأمان·Wi-Fi·IPv6·DHCP · ACL·التوجيه·WAN · التلخيص) mirror the source book's organization at a high level — they
 * are overview labels only (not lessons/pages, and not a transcription of the 264-page source PDF, which stays the
 * authoritative content for future conversion).
 */
export const LEARNING_COURSES: LearningCourse[] = [
  {
    id: "791381",
    title: "شبكات الاتصال",
    productTitle: "كتاب 791381 — شبكات الاتصال",
    subject: "أنظمة محوسبة",
    grades: "الصف العاشر / الحادي عشر",
    author: "الأستاذ وفيق نصار",
    year: "2026–2027",
    status: "available",
    description: "كتاب تفاعلي في شبكات الاتصال يغطي الأساسيات والأجهزة والبروتوكولات والأمان والتوجيه خطوة بخطوة.",
    // Eight OWNER-approved high-level presentation sections in exact visible order (Phase 3). The middle six keep
    // their stable Phase-1/2 ids (b1..b6); "intro" (المقدمة) and "summary" (التلخيص) frame them and are the real
    // introductory / summary sections of the book (canonical modules for them are authored during conversion).
    overviewBatches: [
      { id: "intro", label: "المقدمة" },
      { id: "b1", label: "الأساسيات · الأعداد · IP" },
      { id: "b2", label: "الأجهزة والرسائل" },
      { id: "b3", label: "النماذج والبروتوكولات والأمان" },
      { id: "b4", label: "برمجة السويتش و VLAN" },
      { id: "b5", label: "الأمان · Wi-Fi · IPv6 · DHCP" },
      { id: "b6", label: "ACL · التوجيه · WAN" },
      { id: "summary", label: "التلخيص" },
    ],
  },
  /**
   * The second course: the owner's summary booklet «أوراق تلخيص للمراجعة» for the same networking book (نموذج 791381).
   * It is an independent course (its own id, manifest, modules and publication); the id `791381s` keeps the model
   * number visible while never colliding with `791381-…` ids. Its eight overview sections are the booklet's own
   * groups (the introduction, the six «دفعات» of its table of contents and «الملخص الشامل»).
   */
  {
    id: "791381s",
    title: "أوراق تلخيص شبكات الاتصال",
    productTitle: "أوراق تلخيص 791381 — شبكات الاتصال",
    subject: "أنظمة محوسبة",
    grades: "الصف العاشر / الحادي عشر",
    author: "الأستاذ وفيق نصار",
    year: "2026–2027",
    status: "available",
    description: "أوراق تلخيص للمراجعة: تلخيص الكتاب كاملاً · الصفحات 1–264، مع الملخّص الشامل: مراجعة نهائية لكل الوحدات في جداول.",
    overviewBatches: [
      { id: "intro", label: "المقدمة" },
      { id: "b1", label: "الأساسيات والأعداد وعناوين IP" },
      { id: "b2", label: "الأجهزة والرسائل" },
      { id: "b3", label: "النماذج والبروتوكولات والأمان" },
      { id: "b4", label: "برمجة السويتش و VLAN" },
      { id: "b5", label: "Wi-Fi و IPv6 و DHCP والأمان" },
      { id: "b6", label: "WAN والتوجيه و ACL" },
      { id: "summary", label: "الملخص الشامل" },
    ],
  },
  /**
   * 899371 P2 (docs/enterprise-899371-learning-plan.md §14) — the owner's C# question bank «مجمع أسئلة في أسس علم الحاسوب»
   * (نموذج 899371), for the eleventh grade, 2026–2027 (owner, 2026-11-09). An independent course generated from the owner's Word
   * source (scripts/convert-899371.mjs). Its six sections are the book's own chapter groups; a section whose chapters are not
   * converted yet is shown as «قريبًا».
   */
  {
    id: "899371",
    title: "أسس علم الحاسوب",
    productTitle: "مجمع أسئلة 899371 — أسس علم الحاسوب",
    subject: "علم الحاسوب",
    grades: "الصف الحادي عشر",
    author: "الأستاذ وفيق نصار",
    year: "2026–2027",
    status: "available",
    description: "رفيقك العملي في أسس علم الحاسوب بلغة C#: تلخيصات قصيرة وتمارين منتقاة من الفكرة إلى التطبيق، مع وظائف بيتية ووظائف برمجة لكل فصل.",
    overviewBatches: [
      { id: "intro", label: "المقدمة" },
      { id: "b1", label: "الأساسيات: الطباعة والمتغيرات والعوامل و Math" },
      { id: "b2", label: "الشرط والتكرار" },
      { id: "b3", label: "العمليات والنصوص" },
      { id: "b4", label: "المصفوفات" },
      { id: "b5", label: "الكائنات" },
    ],
  },
  /**
   * AUTO-A2 (docs/enterprise-automata-course-a2.md) — «الوحدة الخامسة: الأتمتة» (899271): the computational models of the CS
   * curriculum (automata, languages, push-down automata, Turing machines), translated to Arabic from the slides of the teacher-training
   * course «מודלים חישוביים», with the simulator on every machine. Generated by scripts/build-automata-course.mjs; its sections are
   * the manifest's batches (pinned equal by course899271.test.ts).
   */
  {
    id: "899271",
    title: "الأتمتة",
    productTitle: "الوحدة الخامسة — الأتمتة",
    subject: "علم الحاسوب",
    grades: "الصف الحادي عشر / الثاني عشر",
    author: "الأستاذ وفيق نصار",
    year: "2026–2027",
    status: "available",
    description: "النماذج الحسابية خطوة بخطوة: اللغات، الأوتومات المنتهي الحتمي وغير الحتمي، أوتومات المكدّس وآلة تورنغ — مع محاكٍ تفاعلي لكل آلة، أمثلة محلولة، وتدريبات من نمط البجروت.",
    overviewBatches: [
      // BEGIN 899271 (generated by scripts/build-automata-course.mjs — do not edit by hand)
      { id: "intro", label: "الكلمات واللغات" },
      { id: "b1", label: "الأوتومات المنتهي الحتمي" },
      { id: "b2", label: "غير الحتمي واللغات المنتظمة" },
      { id: "b3", label: "أوتومات المكدّس" },
      { id: "b4", label: "آلة تورنغ" },
      { id: "summary", label: "مراجعة وأسئلة بجروت" },
      // END 899271
    ],
  },
  /**
   * DS-A2 (docs/enterprise-data-structures-course.md) — «الوحدة الرابعة: مبنى المعطيات» (899271d): recursion, efficiency, chains of
   * cells, the stack, the queue and binary trees in C#, from the book «مقدّمة في مباني المعلومات بلغة C#», with a step-by-step trace of
   * the programs, an interactive lab for every structure and SVG drawings. An independent course (its own id; the model number
   * 899271 stays visible and `899271d-…` ids never collide with `899271-…`). Generated by scripts/build-ds-course.mjs; its sections
   * are the manifest's batches (pinned equal by course899271d.test.ts).
   */
  {
    id: "899271d",
    title: "مبنى المعطيات",
    productTitle: "الوحدة الرابعة — مبنى المعطيات",
    subject: "علم الحاسوب",
    grades: "الصف الحادي عشر / الثاني عشر",
    author: "الأستاذ وفيق نصار",
    year: "2026–2027",
    status: "available",
    description: "مباني المعطيات بلغة C# خطوة بخطوة: التراجعية، النجاعة، سلاسل الخلايا، الراصّة، الدور والأشجار الثنائية — مع تتبّع للبرامج، مختبر تفاعلي لكل مبنى، رسوم توضيحية، وأسئلة تتبّع وكتابة.",
    overviewBatches: [
      // BEGIN 899271d (generated by scripts/build-ds-course.mjs — do not edit by hand)
      { id: "b3", label: "الراصّة والدور" },
      // END 899271d
    ],
  },
];

/** Find a course by its canonical id (used by the page when an overview is opened). */
export function findLearningCourse(id: string | null | undefined): LearningCourse | undefined {
  if (!id) return undefined;
  return LEARNING_COURSES.find(c => c.id === id);
}
