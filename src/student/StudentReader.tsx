import { useMemo } from "react";
import LearningReader from "../learning/reader/LearningReader";
import { createRestrictedReaderContentApi } from "../learning/reader/restrictedContentApi";

/**
 * The student's Reader = the SAME LearningReader (one Reader authority, no student fork) fed by a content API that
 * is restricted to the module ids the student's class has published. Code-split by StudentPortal: opening the
 * portal loads neither this file nor any book body; the module bodies remain the Reader's own lazy chunks.
 */
export default function StudentReader({ courseId, allowedModuleIds, onExit }: { courseId: string; allowedModuleIds: string[]; onExit: () => void }) {
  const key = allowedModuleIds.join("|");
  const api = useMemo(() => createRestrictedReaderContentApi(courseId, allowedModuleIds), [courseId, key]);   // eslint-disable-line react-hooks/exhaustive-deps
  return <LearningReader courseId={courseId} api={api} onExit={onExit} exitLabel="العودة إلى موادي التعليمية" />;
}
