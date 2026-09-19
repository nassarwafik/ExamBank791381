import { lazy, Suspense, useMemo, useState } from "react";
import SectionHeader from "../ui/SectionHeader";
import StatusBadge from "../ui/StatusBadge";
import { IconBook, IconChevronBack } from "../icons";
import { LEARNING_COURSES, findLearningCourse, type LearningCourse } from "./catalog";
import { hasCourseContent } from "./content/registry";
import { createTrainingClient, teacherTrainingHeaders } from "./training/trainingClient";
import "./learning.css";

// The interactive reader (hosted by the shared Reader-plus-training wrapper) is code-split so it and the content
// layer it pulls never weigh down the library view.
const LearningReaderWithTraining = lazy(() => import("./training/LearningReaderWithTraining"));

type View =
  | { kind: "library" }
  | { kind: "course"; courseId: string }
  | { kind: "reader"; courseId: string };

/**
 * Learning Materials (المواد التعليمية). Local state only (no router): the library of course cards, a course
 * overview (eight high-level sections), and the interactive Reader. Opening the library/overview issues ZERO
 * network requests; the Reader performs no backend request for CONTENT (only code-split content imports). With a
 * teacher token the Reader additionally reads the trainings list once (Learning Practice) so the teacher can
 * preview and solve T01–T04 regardless of class publication; without a token it stays fully local.
 */
export default function LearningMaterialsPage({ token }: { token?: string } = {}) {
  const [view, setView] = useState<View>({ kind: "library" });
  const course = view.kind === "library" ? undefined : findLearningCourse(view.courseId);
  const client = useMemo(() => (token ? createTrainingClient(teacherTrainingHeaders(token)) : null), [token]);

  if (course && view.kind === "reader") {
    return (
      <Suspense fallback={<p className="eb-muted" role="status">جارٍ فتح القارئ التفاعلي...</p>}>
        <LearningReaderWithTraining
          courseId={course.id}
          onExit={() => setView({ kind: "course", courseId: course.id })}
          exitLabel="العودة إلى نظرة الكتاب"
          client={client}
          actor="teacher"
        />
      </Suspense>
    );
  }

  if (course) {
    return (
      <CourseOverview
        course={course}
        canRead={hasCourseContent(course.id)}
        onBack={() => setView({ kind: "library" })}
        onStartReading={() => setView({ kind: "reader", courseId: course.id })}
      />
    );
  }

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
            <CourseCard course={c} onOpen={() => setView({ kind: "course", courseId: c.id })} />
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

/** Course overview: identity + a short intro + the eight high-level content sections, and the reader entry point. */
function CourseOverview({ course, canRead, onBack, onStartReading }: { course: LearningCourse; canRead: boolean; onBack: () => void; onStartReading: () => void }) {
  return (
    <section className="eb-lm eb-lm-overview" aria-labelledby="eb-lm-course-title">
      <button type="button" className="eb-button is-quiet is-small eb-lm-back" onClick={onBack}>
        <IconChevronBack size={18} className="eb-flip-rtl" />
        العودة إلى المواد التعليمية
      </button>
      <SectionHeader
        level={2}
        id="eb-lm-course-title"
        title={course.productTitle}
        description={course.description}
        actions={canRead ? (
          <button type="button" className="eb-button is-primary eb-lm-read" onClick={onStartReading}>
            <IconBook size={18} aria-hidden="true" />بدء القراءة
          </button>
        ) : undefined}
      />
      <dl className="eb-lm-meta eb-lm-meta-wide">
        <div><dt>المادة</dt><dd>{course.subject}</dd></div>
        <div><dt>الصفوف</dt><dd>{course.grades}</dd></div>
        <div><dt>المؤلّف</dt><dd>{course.author}</dd></div>
        <div><dt>العام الدراسي</dt><dd>{course.year}</dd></div>
      </dl>
      <div className="eb-lm-batches">
        <SectionHeader level={3} title="محتوى الكتاب" description="ستُتاح هذه الأقسام تفاعليًا في القارئ تدريجيًا." count={course.overviewBatches.length} />
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
