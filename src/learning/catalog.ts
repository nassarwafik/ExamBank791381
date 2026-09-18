// Learning Materials — Phase 1 catalog (المواد التعليمية).
//
// This is the ONE central place that owns course/book metadata for the Learning Materials product. The page and
// its cards read every string from here — nothing course-specific is hardcoded in JSX, so adding a second book
// later (e.g. 794589, 899373) is a data edit here, not a UI rewrite.
//
// Phase 1 scope: a minimal, forward-compatible schema — enough to render the library card and a Phase-1 course
// overview (identity + high-level content batches marked "قريبًا"). It deliberately does NOT model the future
// reading structure. Phase 2 is expected to introduce, separately:
//
//     Course → Module → Lesson → Page → Blocks
//     (block families likely: text · image · callout · example · diagram · quiz · simulation · cli · table · flashcards)
//
// The fields below must not conflict with that direction: `overviewBatches` here are presentation labels for the
// Phase-1 overview only, NOT the lesson/page/block schema, which belongs to Phase 2 after design review.

/** Whether a course can be opened (Phase 1 opens a foundation overview, not a reader) or is still upcoming. */
export type LearningCourseStatus = "available" | "coming-soon";

/** A single high-level content batch shown on the Phase-1 course overview (label + non-interactive status). */
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
 * The first course: the owner-provided networking book 791381. The six batches mirror the existing book
 * organization at a high level — they are overview labels only (Phase 1 does not open pages or transcribe the
 * 264-page source PDF; that source stays the authoritative content for future conversion).
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
    overviewBatches: [
      { id: "b1", label: "الأساسيات · الأعداد · IP" },
      { id: "b2", label: "الأجهزة والرسائل" },
      { id: "b3", label: "النماذج والبروتوكولات والأمان" },
      { id: "b4", label: "برمجة السويتش و VLAN" },
      { id: "b5", label: "الأمان · Wi-Fi · IPv6 · DHCP" },
      { id: "b6", label: "ACL · التوجيه · WAN" },
    ],
  },
];

/** Find a course by its canonical id (used by the page when an overview is opened). */
export function findLearningCourse(id: string | null | undefined): LearningCourse | undefined {
  if (!id) return undefined;
  return LEARNING_COURSES.find(c => c.id === id);
}
