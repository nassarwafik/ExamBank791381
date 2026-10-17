import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LearningReaderWithTraining from "../learning/training/LearningReaderWithTraining";
import { createRestrictedReaderContentApi } from "../learning/reader/restrictedContentApi";
import { createTrainingClient, studentTrainingHeaders } from "../learning/training/trainingClient";
import { createStudyClient } from "../learning/study/studyClient";
import type { SearchHit } from "../learning/search/searchModel";
import { fetchReleasedModuleIds } from "./learningRelease";
import { createProgressClient, type ProgressClient } from "../learning/progress/progressClient";
import { mergeVisited } from "../learning/reader/visitedPages";
import { createAnnotationsClient, type AnnotationsClient } from "../learning/annotations/annotationsClient";

/** Phase L.3 — how long the Reader waits for the server's «last page» before opening at the beginning anyway. */
export const RESUME_WAIT_MS = 2500;
/** Phase L.3 — a page counts as read (and becomes the resume point) after this long on it. */
export const READ_DWELL_MS = 1500;

/**
 * The student's Reader = the SAME LearningReader (one Reader authority, no student fork) fed by a content API that
 * is restricted to the module ids the student's class has published, hosted by the shared Reader-plus-training
 * wrapper so the book's trainings (T01–T04) open the shared runner and return to the SAME page. Code-split by
 * StudentPortal: opening the portal loads neither this file nor any book body; the module bodies remain the
 * Reader's own lazy chunks and the runner is a further lazy chunk.
 */
export default function StudentReader({ courseId, allowedModuleIds, token, onExit, onTrainingSubmitted, onStudyPointsEarned, initialPageId, initialModuleId, onPageChange, studentId, progressClient, annotationsClient }: {
  courseId: string;
  allowedModuleIds: string[];
  token: string;
  onExit: () => void;
  onTrainingSubmitted?: () => void;
  /** Fired when the server awarded Study-Practice points (the portal refreshes Strength once on exit). */
  onStudyPointsEarned?: () => void;
  /** Phase 9A — «أكمل من حيث توقفت»: the page to open on first mount (validated by the Reader against the restricted
   *  manifest; unknown / unreleased → the book's first page). Absent → the book's beginning, exactly as before. */
  initialPageId?: string;
  /** Phase L.2 — a unit chosen in «موادي التعليمية»: the Reader opens at that unit's first page (validated against the
   *  restricted manifest — an unpublished unit simply opens the book's beginning). */
  initialModuleId?: string;
  /** Phase 9A — the Reader's page-change signal (the portal remembers this student's page on this device). */
  onPageChange?: (pageId: string) => void;
  /** Phase 21E L2-B — the authenticated student's server-issued id: scopes the device-local "visited" marks in the
   *  index to this student and course. Absent / empty → no marks are read, written or shown. */
  studentId?: string;
  /** Phase L.3 — the reading-progress transport (tests inject one); default: the student's own API client. */
  progressClient?: ProgressClient;
  /** Phase L.5 — the private-annotations transport (tests inject one); default: the student's own API client. */
  annotationsClient?: AnnotationsClient;
}) {
  const key = allowedModuleIds.join("|");
  const api = useMemo(() => createRestrictedReaderContentApi(courseId, allowedModuleIds), [courseId, key]);   // eslint-disable-line react-hooks/exhaustive-deps
  const client = useMemo(() => createTrainingClient(studentTrainingHeaders(token)), [token]);
  const study = useMemo(() => createStudyClient(studentTrainingHeaders(token)), [token]);
  // Phase 21E L3-B — in-book search is scoped to EXACTLY the released module ids this Reader was opened with (from the
  // authenticated release list the portal re-read on open) — never "all". Opening a result re-reads that list: a
  // module that is no longer released, or an entitlement that cannot be established, does not open.
  const searchScope = useMemo<ReadonlySet<string>>(() => new Set(allowedModuleIds.map(id => String(id || "").trim()).filter(Boolean)), [key]);   // eslint-disable-line react-hooks/exhaustive-deps
  const onSearchOpen = useCallback(async (hit: SearchHit) => {
    if (hit.courseId !== courseId || !searchScope.has(hit.moduleId)) return false;
    const fresh = await fetchReleasedModuleIds(token, courseId);
    return fresh !== null && fresh.has(hit.moduleId);
  }, [courseId, searchScope, token]);
  // ── Phase L.3: reading progress on the server (any device) ──────────────────────────────────────────────────────
  // Opening the book without a chosen page or unit resumes at the student's last page; the server's read marks join this
  // device's; a page the student stays on for READ_DWELL_MS is recorded as read and as the new resume point. Every
  // failure is quiet: the Reader opens at the beginning and keeps this device's own marks.
  const visitedScope = studentId && studentId.trim() ? "student:" + studentId.trim() : undefined;
  const progress = useMemo(() => progressClient ?? createProgressClient(studentTrainingHeaders(token)), [progressClient, token]);
  // Phase L.5 — bookmarks, private notes and highlights, kept on the server for this student only (any device).
  const annotations = useMemo(() => annotationsClient ?? createAnnotationsClient(studentTrainingHeaders(token)), [annotationsClient, token]);
  const explicitStart = Boolean(initialPageId || initialModuleId);
  const [resume, setResume] = useState<{ ready: boolean; pageId?: string }>(() => ({ ready: explicitStart }));
  useEffect(() => {
    let alive = true;
    const timer = window.setTimeout(() => { if (alive) setResume(r => (r.ready ? r : { ready: true })); }, RESUME_WAIT_MS);
    void progress.get(courseId).then(p => {
      if (!alive) return;
      if (p) mergeVisited(visitedScope, courseId, p.visited);
      setResume(r => (r.ready ? r : { ready: true, pageId: p?.lastPageId ?? undefined }));
    });
    return () => { alive = false; window.clearTimeout(timer); };
  }, [progress, courseId, visitedScope]);
  const dwellRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(dwellRef.current), []);
  const onPage = useCallback((pageId: string) => {
    onPageChange?.(pageId);
    window.clearTimeout(dwellRef.current);
    dwellRef.current = window.setTimeout(() => { void progress.visit(courseId, pageId); }, READ_DWELL_MS);
  }, [onPageChange, progress, courseId]);

  if (!resume.ready) return <p className="eb-muted eb-sp-status" role="status">جارٍ فتح المادة التعليمية...</p>;
  return (
    <LearningReaderWithTraining
      courseId={courseId}
      api={api}
      onExit={onExit}
      exitLabel="العودة إلى موادي التعليمية"
      client={client}
      actor="student"
      onTrainingSubmitted={onTrainingSubmitted}
      study={study}
      onStudyPointsEarned={onStudyPointsEarned}
      initialPageId={initialPageId ?? resume.pageId}
      initialModuleId={initialModuleId}
      onPageChange={onPage}
      visitedScope={visitedScope}
      searchScope={searchScope}
      onSearchOpen={onSearchOpen}
      annotations={annotations}
    />
  );
}
