import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { IconSearch, IconClose } from "../../icons";
import { arabicCount, type ArabicCountForms } from "../arabicCount";
import {
  defaultSearchProviderFactory, highlightSegments, prepareSources, searchGrouped, searchTerms,
  type SearchHit, type SearchProviderFactory, type SearchSource,
} from "./searchModel";
import "./learning-search.css";

/** «نتيجة» agreed with its count (the live result announcement). */
const RESULTS: ArabicCountForms = {
  zero: "لا توجد نتائج",
  one: "نتيجة واحدة",
  two: "نتيجتان",
  few: "{n} نتائج",
  many: "{n} نتيجة",
  other: "{n} نتيجة",
};

export type LearningSearchPanelProps = {
  /** The searchable courses with their explicit release sets. `null` → the caller is still resolving them (manifest
   *  or permissions loading): the panel shows NO result until they are ready. */
  sources: SearchSource[] | null;
  /** "unavailable" → the caller could not establish what may be searched (missing / invalid / failed permissions):
   *  the panel shows a message and no result. */
  availability?: "ready" | "unavailable";
  query: string;
  onQueryChange: (query: string) => void;
  /** Open a result. The host re-checks the entitlement and navigates (or reports why it could not). */
  onOpen: (hit: SearchHit) => void;
  /** L3-7 — the provider behind the index; the default is the title/keyword provider. Swapping it changes no UI. */
  providerFactory?: SearchProviderFactory;
  /** A host-reported problem opening the last result (e.g. the module is no longer released). */
  openError?: string;
  /** True while the host is re-checking the entitlement for a result. */
  opening?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
  /** Show the course heading above each course's groups (the library search spans several courses). */
  showCourseHeadings?: boolean;
  label?: string;
  /** Heading level of the top grouping heading (course headings when shown, else module headings); the next level
   *  down is used for modules under courses. Default 3 (under a host's h2). */
  headingLevel?: 2 | 3 | 4;
  /** Focus the field when the panel mounts (the Reader's search dialog; a reopened panel restores focus here). */
  autoFocus?: boolean;
};

/**
 * Phase 21E L3-B — the search panel used by the Reader (in-book) and the teacher library. Lazy-loaded by its hosts.
 *
 * Indexes titles + keywords only (never a page body — opening search imports no module chunk), groups the results by
 * module → lesson in reading order, highlights the matched terms with <mark>, and announces the result count in a
 * polite live region. Keyboard: ↓ from the field moves into the results, ↑ / ↓ / Home / End move between them, ↑ on
 * the first result returns to the field, Enter in the field opens the first result, Escape in a non-empty field clears
 * it (an empty field lets Escape reach the host, which closes the panel).
 */
export default function LearningSearchPanel({
  sources, availability = "ready", query, onQueryChange, onOpen, providerFactory = defaultSearchProviderFactory,
  openError, opening = false, inputRef, showCourseHeadings = false, label = "ابحث في عناوين الدروس والصفحات والكلمات المفتاحية", autoFocus = false, headingLevel = 3,
}: LearningSearchPanelProps) {
  const uid = useId().replace(/:/g, "");
  const inputId = "eb-search-input-" + uid;
  const statusId = "eb-search-status-" + uid;
  const resultsId = "eb-search-results-" + uid;
  const localInputRef = useRef<HTMLInputElement | null>(null);
  const fieldRef = inputRef ?? localInputRef;
  const resultsRef = useRef<HTMLDivElement>(null);

  const ready = availability === "ready" && sources !== null;
  const prepared = useMemo(() => (ready && sources ? prepareSources(sources, providerFactory) : []), [ready, sources, providerFactory]);
  const terms = useMemo(() => searchTerms(query), [query]);
  const groups = useMemo(() => (ready && terms.length ? searchGrouped(prepared, query) : []), [ready, prepared, query, terms.length]);
  const count = groups.reduce((n, g) => n + g.count, 0);

  // The live region is filled one tick AFTER mount, so a reopened panel (search → open → back) announces its restored
  // result count instead of starting silent (a region that already holds text when it appears is not announced).
  const [announceReady, setAnnounceReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setAnnounceReady(true), 50); return () => clearTimeout(t); }, []);
  const announcement = !announceReady ? ""
    : availability === "unavailable" ? "البحث غير متاح الآن."
      : !ready ? "جارٍ تجهيز البحث..."
        : terms.length === 0 ? ""
          : count === 0 ? "لا توجد نتائج مطابقة." : arabicCount(count, RESULTS) + ".";

  const hits = () => [...(resultsRef.current?.querySelectorAll<HTMLButtonElement>("[data-search-hit]") ?? [])];
  const focusHit = (i: number) => { const all = hits(); if (all.length) all[Math.max(0, Math.min(all.length - 1, i))].focus(); };

  const onFieldKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { if (hits().length) { e.preventDefault(); focusHit(0); } }
    else if (e.key === "Escape" && query) { e.preventDefault(); e.stopPropagation(); onQueryChange(""); }
  };
  const onResultsKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const all = hits();
    const i = all.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); focusHit(i + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (i === 0) fieldRef.current?.focus(); else focusHit(i - 1); }
    else if (e.key === "Home") { e.preventDefault(); focusHit(0); }
    else if (e.key === "End") { e.preventDefault(); focusHit(all.length - 1); }
  };
  const firstHit = groups[0]?.modules[0]?.lessons[0]?.hits[0];

  return (
    <div className="eb-search" dir="rtl">
      <form role="search" className="eb-search-form" aria-label="البحث في المحتوى التعليمي" onSubmit={e => { e.preventDefault(); if (firstHit && !opening) onOpen(firstHit); }}>
        <label htmlFor={inputId} className="eb-search-label">{label}</label>
        <div className="eb-search-field">
          <IconSearch size={18} aria-hidden="true" className="eb-search-icon" />
          <input
            id={inputId}
            ref={fieldRef}
            className="eb-search-input"
            type="search"
            dir="auto"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            autoFocus={autoFocus}
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            onKeyDown={onFieldKeyDown}
            aria-describedby={statusId}
            aria-controls={resultsId}
            disabled={!ready && availability === "unavailable"}
          />
          {query && (
            <button type="button" className="eb-search-clear" aria-label="مسح البحث" onClick={() => { onQueryChange(""); fieldRef.current?.focus(); }}>
              <IconClose size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      </form>
      <p id={statusId} className="eb-search-status" role="status" aria-live="polite">{announcement}</p>
      {openError && <p className="eb-search-error" role="alert">{openError}</p>}

      <div id={resultsId} ref={resultsRef} className="eb-search-results" onKeyDown={onResultsKeyDown} aria-busy={opening || undefined}>
        {availability === "unavailable" ? (
          <p className="eb-search-note is-error">تعذّر التحقق من المحتوى المتاح لك، لذلك لا تُعرض نتائج.</p>
        ) : !ready ? (
          <p className="eb-search-note">جارٍ تجهيز فهرس البحث...</p>
        ) : terms.length === 0 ? (
          <p className="eb-search-note">اكتب كلمة من عنوان درس أو صفحة، مثل «الشبكة» أو «IP».</p>
        ) : count === 0 ? (
          <div className="eb-search-empty">
            <p className="eb-search-empty-title">لا توجد نتائج مطابقة</p>
            <p className="eb-search-note">جرّب كلمة أقصر أو تهجئة أخرى؛ البحث يتجاهل التشكيل والهمزات.</p>
          </div>
        ) : (
          groups.map(course => (
            <section key={course.courseId} className="eb-search-course" aria-labelledby={showCourseHeadings ? `${resultsId}-c-${course.courseId}` : undefined}>
              {showCourseHeadings && <Heading level={headingLevel} id={`${resultsId}-c-${course.courseId}`} className="eb-search-course-title">{course.courseTitle}</Heading>}
              {course.modules.map(mod => {
                const modId = `${resultsId}-m-${course.courseId}-${mod.moduleId}`;
                return (
                  <section key={mod.moduleId} className="eb-search-module" aria-labelledby={modId}>
                    <Heading level={showCourseHeadings ? headingLevel + 1 : headingLevel} id={modId} className="eb-search-module-title">{mod.moduleTitle}</Heading>
                    {mod.lessons.map(lesson => (
                      <div key={lesson.lessonId} className="eb-search-lesson">
                        <p className="eb-search-lesson-title" id={`${modId}-l-${lesson.lessonId}`}>{lesson.lessonTitle}</p>
                        <ul className="eb-search-hits" aria-labelledby={`${modId}-l-${lesson.lessonId}`}>
                          {lesson.hits.map(hit => (
                            <li key={hit.pageId}>
                              <button type="button" className="eb-search-hit" data-search-hit="" disabled={opening} onClick={() => onOpen(hit)}>
                                <span className="eb-search-hit-title"><Highlighted text={hit.title} terms={terms} /></span>
                                <span className="eb-search-hit-meta">
                                  <span>الصفحة {hit.ordinal} من {hit.total}</span>
                                  {hit.keyword && <span className="eb-search-hit-keyword">كلمة مفتاحية: <Highlighted text={hit.keyword} terms={terms} /></span>}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </section>
                );
              })}
            </section>
          ))
        )}
      </div>
    </div>
  );
}

function Heading({ level, ...rest }: { level: number; id: string; className: string; children: ReactNode }) {
  const Tag = (`h${Math.min(6, Math.max(2, level))}`) as "h2" | "h3" | "h4" | "h5" | "h6";
  return <Tag {...rest} />;
}

function Highlighted({ text, terms }: { text: string; terms: readonly string[] }) {
  return <>{highlightSegments(text, terms).map((s, i) => (s.match ? <mark key={i} className="eb-search-mark">{s.text}</mark> : <span key={i}>{s.text}</span>))}</>;
}
