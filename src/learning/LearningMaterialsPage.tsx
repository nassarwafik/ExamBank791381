import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import SectionHeader from "../ui/SectionHeader";
import StatusBadge from "../ui/StatusBadge";
import { IconBook, IconChevronBack } from "../icons";
import { LEARNING_COURSES, findLearningCourse, type LearningCourse } from "./catalog";
import { hasCourseContent, loadCourseManifest } from "./content/registry";
import { batchFirstPageId, flattenPageRefs } from "./content/navigation";
import type { LearningCourseManifest } from "./content/types";
import { arabicCount, AVAILABLE_BOOKS, LESSONS } from "./arabicCount";
import { createTrainingClient, teacherTrainingHeaders } from "./training/trainingClient";
import "./learning.css";
import "./learning-library-premium.css";
import { lazyWithRetry } from "../lazyWithRetry";
import LibrarySearch from "./search/LibrarySearch";
import "./search/learning-library-search.css";

// The interactive reader (hosted by the shared Reader-plus-training wrapper) is code-split so it and the content
// layer it pulls never weigh down the library view.
const LearningReaderWithTraining = lazy(lazyWithRetry(() => import("./training/LearningReaderWithTraining"), "learning-reader-with-training"));

type View =
  | { kind: "library" }
  | { kind: "course"; courseId: string }
  // `initialPageId` is the Course-Overview section shortcut (a canonical pageId). Absent → «بدء القراءة»: the
  // Reader opens from its canonical beginning. Each reader open is a fresh mount, so a shortcut is never stale.
  | { kind: "reader"; courseId: string; initialPageId?: string; fromSearch?: boolean };

/**
 * Learning Materials (المواد التعليمية). Local state only (no router): the library of course cards, a course
 * overview (eight high-level sections), and the interactive Reader. Opening the library/overview issues ZERO
 * backend requests; the overview of a readable course loads only the course's code-split MANIFEST chunk (the same one
 * the Reader needs) for the section lesson counts and page ranges — never a module body or the Reader chunk. The Reader
 * performs no backend request for CONTENT (only code-split content imports). With a
 * teacher token the Reader additionally reads the trainings list once (Learning Practice) so the teacher can
 * preview and solve T01–T04 regardless of class publication; without a token it stays fully local.
 */
export default function LearningMaterialsPage({ token }: { token?: string } = {}) {
  const [view, setView] = useState<View>({ kind: "library" });
  const course = view.kind === "library" ? undefined : findLearningCourse(view.courseId);
  const client = useMemo(() => (token ? createTrainingClient(teacherTrainingHeaders(token)) : null), [token]);
  // Phase 21E L3-B — whole-course search ("all") is a TEACHER capability: this page is mounted only inside the
  // authenticated teacher app, and it is enabled only with the teacher session token present. The student portal never
  // reaches this page; its Reader searches exactly its released modules.
  const teacherSearch = Boolean(token);
  // Library search + filters survive opening a result in the Reader and coming back («العودة إلى نتائج البحث»).
  const [searchActive, setSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [subject, setSubject] = useState("");
  const [grade, setGrade] = useState("");

  // Open the Reader at a Course-Overview section's first canonical page. The section→pageId mapping lives in the
  // manifest (batches + reading order), which is the SAME code-split chunk the Reader is about to load — so this
  // triggers no extra eager bundle. A batch with no page is shown as «قريبًا» by the overview and is not openable; a
  // failed manifest load opens the book's canonical beginning, and the Reader then surfaces any genuine load error itself.
  const openSection = useCallback(async (courseId: string, batchId: string) => {
    try {
      const manifest = await loadCourseManifest(courseId);
      setView({ kind: "reader", courseId, initialPageId: batchFirstPageId(manifest, batchId) ?? undefined });
    } catch {
      setView({ kind: "reader", courseId });
    }
  }, []);

  if (course && view.kind === "reader") {
    const initialPageId = view.initialPageId;
    return (
      // `.eb-lm-reader` is the Learning-Materials-only desktop inset root (learning.css); the Reader itself is shared
      // with the student portal and stays untouched. `embedded`: the teacher shell already owns the page's <main>, so
      // the Reader's content column renders as a <div> (no nested <main>).
      <div className="eb-lm-reader">
        <Suspense fallback={<p className="eb-muted" role="status">جارٍ فتح القارئ التفاعلي...</p>}>
          <LearningReaderWithTraining
            courseId={course.id}
            initialPageId={initialPageId}
            onExit={() => setView(view.fromSearch ? { kind: "library" } : { kind: "course", courseId: course.id })}
            exitLabel={view.fromSearch ? "العودة إلى نتائج البحث" : "العودة إلى نظرة الكتاب"}
            client={client}
            actor="teacher"
            embedded
            searchScope={teacherSearch ? "all" : undefined}
          />
        </Suspense>
      </div>
    );
  }

  if (course) {
    return (
      <CourseOverview
        key={course.id}
        course={course}
        canRead={hasCourseContent(course.id)}
        onBack={() => setView({ kind: "library" })}
        onStartReading={() => setView({ kind: "reader", courseId: course.id })}
        onOpenSection={batchId => { void openSection(course.id, batchId); }}
      />
    );
  }

  const subjects = [...new Set(LEARNING_COURSES.map(c => c.subject))];
  const grades = [...new Set(LEARNING_COURSES.flatMap(courseGrades))];
  const matchesFilters = (c: LearningCourse) => (!subject || c.subject === subject) && (!grade || courseGrades(c).includes(grade));
  const availableCourses = LEARNING_COURSES.filter(c => c.status === "available").filter(matchesFilters);
  const upcomingCourses = LEARNING_COURSES.filter(c => c.status === "coming-soon").filter(matchesFilters);
  const searchableCourses = availableCourses.filter(c => hasCourseContent(c.id));
  return (
    <section className="eb-lm eb-lm-premium-library" aria-labelledby="eb-lm-title">
      <div className="eb-lm-library-hero">
        <p className="eb-lm-library-eyebrow">مكتبة التعلّم التفاعلي</p>
        <SectionHeader
          level={2}
          id="eb-lm-title"
          title="المواد التعليمية"
          description="كتب ومواد تعليمية تفاعلية تساعد الطلاب على الفهم والتدريب خطوة بخطوة."
        />
        <p className="eb-lm-library-count">{arabicCount(availableCourses.length, AVAILABLE_BOOKS)}</p>
      </div>
      <div className="eb-lm-filters" role="group" aria-label="تصفية المكتبة">
        <label className="eb-lm-filter">
          <span className="eb-lm-filter-label">المادة</span>
          <select className="eb-lm-filter-select" value={subject} onChange={e => setSubject(e.target.value)}>
            <option value="">كل المواد</option>
            {subjects.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="eb-lm-filter">
          <span className="eb-lm-filter-label">الصف</span>
          <select className="eb-lm-filter-select" value={grade} onChange={e => setGrade(e.target.value)}>
            <option value="">كل الصفوف</option>
            {grades.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
      </div>
      {teacherSearch && (
        <LibrarySearch
          courses={searchableCourses}
          active={searchActive}
          onActivate={() => setSearchActive(true)}
          query={searchQuery}
          onQueryChange={setSearchQuery}
          onOpen={hit => setView({ kind: "reader", courseId: hit.courseId, initialPageId: hit.pageId, fromSearch: true })}
        />
      )}
      {availableCourses.length === 0 && upcomingCourses.length === 0 && (
        <p className="eb-muted eb-lm-filter-empty" role="status">لا توجد كتب تطابق التصفية المختارة.</p>
      )}
      <ul className="eb-lm-grid" aria-label="الكتب والمواد التعليمية المتاحة">
        {availableCourses.map(c => (
          <li key={c.id}>
            <CourseCard course={c} onOpen={() => setView({ kind: "course", courseId: c.id })} />
          </li>
        ))}
      </ul>
      {upcomingCourses.length > 0 && (
        <section className="eb-lm-upcoming" aria-labelledby="eb-lm-upcoming-title">
          <h3 id="eb-lm-upcoming-title">قريبًا في المكتبة</h3>
          <ul className="eb-lm-grid">
            {upcomingCourses.map(c => (
              <li key={c.id}><CourseCard course={c} onOpen={() => {}} /></li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

/** A course's grade labels from the catalog's free-text field («الصف العاشر / الحادي عشر» → two grades). */
function courseGrades(course: LearningCourse): string[] {
  const parts = course.grades.split("/").map(g => g.trim()).filter(Boolean);
  const prefix = parts.find(g => g.startsWith("الصف ")) ? "الصف " : "";
  return parts.map(g => (prefix && !g.startsWith(prefix) ? prefix + g : g));
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
function CourseOverview({ course, canRead, onBack, onStartReading, onOpenSection }: { course: LearningCourse; canRead: boolean; onBack: () => void; onStartReading: () => void; onOpenSection: (batchId: string) => void }) {
  const [manifest, setManifest] = useState<LearningCourseManifest | null>(null);
  // Phase L.0 — the section details come from the manifest chunk; its load is visible (a status line) and a failure is
  // an alert with a retry instead of a silently detail-less list. The rows stay usable meanwhile: a section opened
  // before the manifest arrives (or after it failed) falls back to the Reader's canonical beginning, as before.
  const [manifestState, setManifestState] = useState<"loading" | "ready" | "error">(canRead ? "loading" : "ready");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!canRead) return;
    let active = true;
    loadCourseManifest(course.id).then(result => {
      if (active) { setManifest(result); setManifestState("ready"); }
    }).catch(() => { if (active) { setManifest(null); setManifestState("error"); } });
    return () => { active = false; };
  }, [course.id, canRead, attempt]);
  const sectionStats = useMemo(() => {
    if (!manifest) return new Map<string, { lessons: number; first: number; last: number } | null>();
    const flat = flattenPageRefs(manifest);
    return new Map((manifest.batches ?? []).map(batch => {
      const ids = new Set(batch.moduleIds);
      const pages = flat.filter(entry => ids.has(entry.module.id));
      const lessons = new Set(pages.map(entry => entry.lesson.id)).size;
      return [batch.id, pages.length ? { lessons, first: pages[0].index + 1, last: pages[pages.length - 1].index + 1 } : null] as const;
    }));
  }, [manifest]);
  // The details stay visible text inside the button; aria-describedby makes a screen reader announce them after the
  // short «فتح قسم …» name, which the aria-label would otherwise replace them with.
  const detailsIdPrefix = "eb-lm-batch-details-" + course.id + "-";
  // A section whose modules carry no pages yet (المقدمة today) is shown as «قريبًا» once the manifest PROVES it empty —
  // it never opens the Reader at another section's page. Until the manifest has loaded every row stays a live control.
  const isComingSoon = (batchId: string) => manifestState === "ready" && manifest !== null && sectionStats.get(batchId) === null;
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
        {/* When the book is readable the sections are a live index: each row is one control that opens the Reader at
            that section's first canonical page. When it is not (a future, unconverted course) the legacy static
            "قريبًا" list is kept unchanged. */}
        <SectionHeader
          level={3}
          title="محتوى الكتاب"
          description={canRead ? "اختر قسمًا للانتقال مباشرة إلى محتواه في القارئ التفاعلي." : "ستُتاح هذه الأقسام تفاعليًا في القارئ تدريجيًا."}
          count={course.overviewBatches.length}
        />
        {manifestState === "loading" && <p className="eb-muted eb-lm-batches-status" role="status">جارٍ تحميل تفاصيل الأقسام…</p>}
        {manifestState === "error" && (
          <div className="eb-lm-batches-error" role="alert">
            <span>تعذّر تحميل تفاصيل أقسام الكتاب. ما زال بإمكانك فتح القارئ.</span>
            <button type="button" className="eb-button is-small" onClick={() => { setManifestState("loading"); setAttempt(n => n + 1); }}>إعادة المحاولة</button>
          </div>
        )}
        <ul className="eb-lm-batch-list" aria-label="أقسام محتوى الكتاب">
          {course.overviewBatches.map((b, i) => (
            <li key={b.id} className={canRead && !isComingSoon(b.id) ? "eb-lm-batch eb-lm-batch--interactive" : "eb-lm-batch"}>
              {canRead && !isComingSoon(b.id) ? (
                <button
                  type="button"
                  className="eb-lm-batch-open"
                  onClick={() => onOpenSection(b.id)}
                  aria-label={"فتح قسم " + b.label}
                  aria-describedby={sectionStats.get(b.id) ? detailsIdPrefix + b.id : undefined}
                >
                  <span className="eb-lm-batch-index" aria-hidden="true">{i + 1}</span>
                  <span className="eb-lm-batch-label">{b.label}{sectionStats.get(b.id) && <small id={detailsIdPrefix + b.id} className="eb-lm-batch-details">{arabicCount(sectionStats.get(b.id)!.lessons, LESSONS)} · الصفحات {sectionStats.get(b.id)!.first}–{sectionStats.get(b.id)!.last}</small>}</span>
                  <span className="eb-lm-batch-action">
                    فتح القسم
                    <IconChevronBack size={16} aria-hidden="true" />
                  </span>
                </button>
              ) : (
                <>
                  <span className="eb-lm-batch-index" aria-hidden="true">{i + 1}</span>
                  <span className="eb-lm-batch-label">{b.label}</span>
                  <StatusBadge tone="neutral" className="eb-lm-batch-status">قريبًا</StatusBadge>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
