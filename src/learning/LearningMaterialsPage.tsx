import { useState } from "react";
import SectionHeader from "../ui/SectionHeader";
import StatusBadge from "../ui/StatusBadge";
import { IconBook, IconChevronBack } from "../icons";
import { LEARNING_COURSES, findLearningCourse, type LearningCourse } from "./catalog";
import "./learning.css";

/**
 * Learning Materials (المواد التعليمية) — Phase 1 foundation.
 *
 * A top-level teacher destination (App owns the navigation; this page owns only its local library ⇄ overview
 * state via `selectedCourseId`). It renders the real course library from the catalog module and, on "فتح الكتاب",
 * a Phase-1 course overview (identity + six high-level content batches marked "قريبًا"). It intentionally does
 * NOT open a reader, a PDF, lessons/pages, questions or progress — those belong to later phases — and it issues
 * ZERO network requests: the catalog is frontend-owned static metadata.
 */
export default function LearningMaterialsPage() {
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const course = findLearningCourse(selectedCourseId);

  if (course) return <CourseOverview course={course} onBack={() => setSelectedCourseId(null)} />;

  return (
    <section className="eb-lm" aria-labelledby="eb-lm-title">
      <SectionHeader
        level={2}
        id="eb-lm-title"
        title="المواد التعليمية"
        description="كتب ومواد تعليمية تفاعلية تساعد الطلاب على الفهم والتدريب خطوة بخطوة."
      />
      <ul className="eb-lm-grid" aria-label="الكتب والمواد التعليمية">
        {LEARNING_COURSES.map(c => (
          <li key={c.id}>
            <CourseCard course={c} onOpen={() => setSelectedCourseId(c.id)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** One product entry in the library grid. */
function CourseCard({ course, onOpen }: { course: LearningCourse; onOpen: () => void }) {
  const available = course.status === "available";
  const headingId = "eb-lm-card-" + course.id;
  return (
    <article className="eb-lm-card" aria-labelledby={headingId}>
      <div className="eb-lm-cover" aria-hidden="true"><IconBook size={40} /></div>
      <div className="eb-lm-card-body">
        <p className="eb-lm-card-eyebrow">كتاب {course.id}</p>
        <h3 id={headingId} className="eb-lm-card-title">{course.title}</h3>
        <dl className="eb-lm-meta">
          <div><dt>المادة</dt><dd>{course.subject}</dd></div>
          <div><dt>الصفوف</dt><dd>{course.grades}</dd></div>
          <div><dt>المؤلّف</dt><dd>{course.author}</dd></div>
          <div><dt>العام الدراسي</dt><dd>{course.year}</dd></div>
        </dl>
        <p className="eb-lm-card-desc">{course.description}</p>
        <div className="eb-lm-card-foot">
          <StatusBadge tone={available ? "success" : "neutral"}>{available ? "متاح" : "قريبًا"}</StatusBadge>
          <button type="button" className="eb-button is-primary eb-lm-cta" onClick={onOpen} disabled={!available}>
            فتح الكتاب
          </button>
        </div>
      </div>
    </article>
  );
}

/** Phase-1 course overview: identity + a short intro + the six high-level content batches (non-interactive). */
function CourseOverview({ course, onBack }: { course: LearningCourse; onBack: () => void }) {
  return (
    <section className="eb-lm eb-lm-overview" aria-labelledby="eb-lm-course-title">
      <button type="button" className="eb-button is-quiet is-small eb-lm-back" onClick={onBack}>
        <IconChevronBack size={18} className="eb-flip-rtl" />
        العودة إلى المواد التعليمية
      </button>
      <SectionHeader level={2} id="eb-lm-course-title" title={course.productTitle} description={course.description} />
      <dl className="eb-lm-meta eb-lm-meta-wide">
        <div><dt>المادة</dt><dd>{course.subject}</dd></div>
        <div><dt>الصفوف</dt><dd>{course.grades}</dd></div>
        <div><dt>المؤلّف</dt><dd>{course.author}</dd></div>
        <div><dt>العام الدراسي</dt><dd>{course.year}</dd></div>
      </dl>
      <div className="eb-lm-batches">
        <SectionHeader level={3} title="محتوى الكتاب" description="ستُتاح هذه الأقسام تفاعليًا في مراحل قادمة." count={course.overviewBatches.length} />
        <ul className="eb-lm-batch-list" aria-label="أقسام محتوى الكتاب">
          {course.overviewBatches.map((b, i) => (
            <li key={b.id} className="eb-lm-batch">
              <span className="eb-lm-batch-index" aria-hidden="true">{i + 1}</span>
              <span className="eb-lm-batch-label">{b.label}</span>
              <StatusBadge tone="neutral" className="eb-lm-batch-status">قريبًا</StatusBadge>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
