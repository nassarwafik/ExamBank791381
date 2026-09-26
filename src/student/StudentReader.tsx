import { useMemo } from "react";
import LearningReaderWithTraining from "../learning/training/LearningReaderWithTraining";
import { createRestrictedReaderContentApi } from "../learning/reader/restrictedContentApi";
import { createTrainingClient, studentTrainingHeaders } from "../learning/training/trainingClient";
import { createStudyClient } from "../learning/study/studyClient";

/**
 * The student's Reader = the SAME LearningReader (one Reader authority, no student fork) fed by a content API that
 * is restricted to the module ids the student's class has published, hosted by the shared Reader-plus-training
 * wrapper so the book's trainings (T01–T04) open the shared runner and return to the SAME page. Code-split by
 * StudentPortal: opening the portal loads neither this file nor any book body; the module bodies remain the
 * Reader's own lazy chunks and the runner is a further lazy chunk.
 */
export default function StudentReader({ courseId, allowedModuleIds, token, onExit, onTrainingSubmitted, onStudyPointsEarned, initialPageId, onPageChange }: {
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
  /** Phase 9A — the Reader's page-change signal (the portal remembers this student's page on this device). */
  onPageChange?: (pageId: string) => void;
}) {
  const key = allowedModuleIds.join("|");
  const api = useMemo(() => createRestrictedReaderContentApi(courseId, allowedModuleIds), [courseId, key]);   // eslint-disable-line react-hooks/exhaustive-deps
  const client = useMemo(() => createTrainingClient(studentTrainingHeaders(token)), [token]);
  const study = useMemo(() => createStudyClient(studentTrainingHeaders(token)), [token]);
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
      initialPageId={initialPageId}
      onPageChange={onPageChange}
    />
  );
}
