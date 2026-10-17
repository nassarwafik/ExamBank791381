import { IconCheck, IconChevronBack } from "../../icons";
import type { ModuleRef } from "../content/types";
import { arabicCount, PAGES } from "../arabicCount";

/**
 * Phase L.1 — «محتويات الوحدة» on a unit-opener page: the unit's lessons (canonical order, the opener lesson itself
 * excluded), each one control that opens the lesson's first page, with its page count and — for a student with a
 * visited scope — a «تمت قراءته» mark once every page of the lesson was read on this device. It turns the mostly empty
 * opener slide into the unit's real starting point. Built from the manifest only: no module body is loaded.
 */
export default function UnitContents({ module, currentLessonId, onSelectPage, visited }: {
  module: ModuleRef;
  currentLessonId: string;
  onSelectPage: (pageId: string) => void;
  visited?: ReadonlySet<string>;
}) {
  const lessons = [...module.lessons]
    .filter(l => l.id !== currentLessonId && l.pages.length > 0)
    .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (lessons.length === 0) return null;
  const headingId = "learning-reader-unit-contents-" + module.id;
  return (
    <section className="learning-reader-unit-contents" aria-labelledby={headingId}>
      <h3 id={headingId} className="learning-reader-unit-contents-title">محتويات الوحدة</h3>
      <ol className="learning-reader-unit-contents-list">
        {lessons.map((lesson, i) => {
          const pages = [...lesson.pages].sort((a, b) => a.order - b.order);
          const done = !!visited && pages.every(p => visited.has(p.id));
          return (
            <li key={lesson.id}>
              <button type="button" className="learning-reader-unit-lesson" onClick={() => onSelectPage(pages[0].id)}>
                <span className="learning-reader-unit-lesson-index" aria-hidden="true">{i + 1}</span>
                <span className="learning-reader-unit-lesson-body">
                  <span className="learning-reader-unit-lesson-title">{lesson.title}</span>
                  <span className="learning-reader-unit-lesson-meta">
                    {arabicCount(pages.length, PAGES)}
                    {done && <span className="learning-reader-unit-lesson-done"><IconCheck size={14} aria-hidden="true" />تمت قراءته</span>}
                  </span>
                </span>
                <IconChevronBack size={16} className="learning-reader-unit-lesson-go" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
