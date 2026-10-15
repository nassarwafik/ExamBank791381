import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { IconSearch } from "../../icons";
import { lazyWithRetry } from "../../lazyWithRetry";
import { loadCourseManifest } from "../content/registry";
import type { LearningCourse } from "../catalog";
import type { SearchHit, SearchSource } from "./searchModel";

// The search panel is its own lazy chunk, loaded only when the teacher opens the library search.
const LearningSearchPanel = lazy(lazyWithRetry(() => import("./LearningSearchPanel"), "library-search-panel"));

/**
 * Phase 21E L3-B — the teacher's library-wide search (titles + keywords of every readable, filter-matching book). The
 * panel chunk and the books' MANIFEST chunks load only when the teacher opens the search — never a module body. The
 * query lives in the page, so «العودة إلى نتائج البحث» from the Reader restores it with focus back in the field.
 */
export default function LibrarySearch({ courses, active, onActivate, query, onQueryChange, onOpen }: {
  courses: LearningCourse[];
  active: boolean;
  onActivate: () => void;
  query: string;
  onQueryChange: (q: string) => void;
  onOpen: (hit: SearchHit) => void;
}) {
  const [sources, setSources] = useState<SearchSource[] | null>(null);
  const [failed, setFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const key = courses.map(c => c.id).join("|");
  useEffect(() => {
    if (!active) return;
    let alive = true;
    Promise.all(courses.map(async c => ({ courseId: c.id, courseTitle: c.productTitle, manifest: await loadCourseManifest(c.id), allowedModuleIds: "all" as const })))
      .then(list => { if (alive) { setSources(list); setFailed(false); } })
      .catch(() => { if (alive) { setSources(null); setFailed(true); } });
    return () => { alive = false; };
  }, [active, key]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="eb-lm-search" aria-labelledby="eb-lm-search-title">
      <h3 id="eb-lm-search-title" className="eb-lm-search-title">البحث في المكتبة</h3>
      {!active ? (
        <button type="button" className="eb-button eb-lm-search-open" onClick={onActivate}>
          <IconSearch size={18} aria-hidden="true" />ابحث في عناوين الدروس والصفحات
        </button>
      ) : (
        <Suspense fallback={<p className="eb-muted" role="status">جارٍ تحميل البحث...</p>}>
          <LearningSearchPanel
            sources={sources}
            availability={failed ? "unavailable" : "ready"}
            query={query}
            onQueryChange={onQueryChange}
            onOpen={onOpen}
            inputRef={inputRef}
            showCourseHeadings
            headingLevel={4}
            label="ابحث في عناوين الدروس والصفحات والكلمات المفتاحية في كتب المكتبة"
            autoFocus
          />
        </Suspense>
      )}
    </section>
  );
}
