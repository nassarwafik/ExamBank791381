import { lazy, Suspense } from "react";
import { lazyWithRetry } from "../lazyWithRetry";

// Class gradebook GB3 — the gradebook panel is its own lazy chunk, fetched when the students workspace shows a class. This wrapper is the
// only part in the Teacher Platform chunk; it keeps that chunk's one Suspense boundary (the Dashboard's, guarded by 8E-2) unchanged.
const ClassGradebookPanel = lazy(lazyWithRetry(() => import("./ClassGradebookPanel"), "class-gradebook"));

export default function LazyClassGradebook(props: { token: string; classroom: { classId: string; name: string } | null; classActive: boolean }) {
  if (!props.classroom) return null;
  return <Suspense fallback={null}><ClassGradebookPanel {...props} /></Suspense>;
}
