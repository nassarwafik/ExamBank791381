// Learning Materials — Phase 2: pure, deterministic navigation helpers for the future Reader.
//
// These operate on the lightweight MANIFEST (module→lesson→page identities), so the Reader can drive a full
// table of contents and prev/next without loading any page BODY. No React, no network. Ordering is authoritative
// by the `order` fields (module.order → lesson.order → page.order), with the id as a stable tiebreaker so the
// result is deterministic even if two siblings momentarily share an order (which the validator flags separately).
//
// IMPORTANT: navigation position (page N of M) is content ORDER — a different concept from the source PDF page,
// which lives only in `page.source` for traceability (§23).

import type { LearningCourseManifest, ModuleRef, LessonRef, PageRef } from "./types";

/** A page flattened into course reading order, with its ancestors and 0-based global index. */
export interface FlatPageRef {
  page: PageRef;
  lesson: LessonRef;
  module: ModuleRef;
  index: number;
}

const byOrderThenId = <T extends { order: number; id: string }>(a: T, b: T): number =>
  a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Modules in reading order. */
export function orderedModules(manifest: LearningCourseManifest): ModuleRef[] {
  return [...(manifest?.modules ?? [])].sort(byOrderThenId);
}

/** Every page across the course, in reading order, each tagged with ancestors + global index. Pure. */
export function flattenPageRefs(manifest: LearningCourseManifest): FlatPageRef[] {
  const flat: FlatPageRef[] = [];
  let index = 0;
  for (const module of orderedModules(manifest)) {
    for (const lesson of [...(module.lessons ?? [])].sort(byOrderThenId)) {
      for (const page of [...(lesson.pages ?? [])].sort(byOrderThenId)) {
        flat.push({ page, lesson, module, index: index++ });
      }
    }
  }
  return flat;
}

/** Direct id lookup for a module. */
export function findModule(manifest: LearningCourseManifest, moduleId: string): ModuleRef | undefined {
  return manifest?.modules?.find(m => m.id === moduleId);
}

/** Direct id lookup for a lesson, with its owning module. */
export function findLesson(
  manifest: LearningCourseManifest,
  lessonId: string,
): { module: ModuleRef; lesson: LessonRef } | undefined {
  for (const module of manifest?.modules ?? []) {
    const lesson = module.lessons?.find(l => l.id === lessonId);
    if (lesson) return { module, lesson };
  }
  return undefined;
}

/** Direct id lookup for a page, with its owning lesson + module. */
export function findPage(
  manifest: LearningCourseManifest,
  pageId: string,
): { module: ModuleRef; lesson: LessonRef; page: PageRef } | undefined {
  for (const module of manifest?.modules ?? []) {
    for (const lesson of module.lessons ?? []) {
      const page = lesson.pages?.find(p => p.id === pageId);
      if (page) return { module, lesson, page };
    }
  }
  return undefined;
}

/** The page before `pageId` in reading order, crossing lesson/module boundaries; null at the very first page. */
export function previousPage(manifest: LearningCourseManifest, pageId: string): PageRef | null {
  const flat = flattenPageRefs(manifest);
  const i = flat.findIndex(f => f.page.id === pageId);
  if (i <= 0) return null;
  return flat[i - 1].page;
}

/** The page after `pageId` in reading order, crossing lesson/module boundaries; null at the very last page. */
export function nextPage(manifest: LearningCourseManifest, pageId: string): PageRef | null {
  const flat = flattenPageRefs(manifest);
  const i = flat.findIndex(f => f.page.id === pageId);
  if (i < 0 || i >= flat.length - 1) return null;
  return flat[i + 1].page;
}

/** 1-based reading position of a page and the course total, or null if the page is unknown. */
export function pagePosition(manifest: LearningCourseManifest, pageId: string): { index: number; total: number } | null {
  const flat = flattenPageRefs(manifest);
  const i = flat.findIndex(f => f.page.id === pageId);
  if (i < 0) return null;
  return { index: i + 1, total: flat.length };
}

/**
 * The first canonical page (in reading order) that an overview "batch" (a presentation section that spans one or
 * more modules, §29) opens at: the earliest page — by the same module.order → lesson.order → page.order authority
 * as every other navigation helper — among ANY of the batch's modules. Returns `null` when the batch is unknown,
 * carries no modules of its own, or (defensively) none of its modules contribute a page: a batch without a
 * dedicated page has no canonical destination, so the CALLER decides what "no destination" means — the Reader's
 * own controlled fallback (unknown/absent `initialPageId` → the course's first page) then opens the book at its
 * canonical beginning. Pure; re-uses `flattenPageRefs`, never a re-implemented ordering.
 */
export function batchFirstPageId(manifest: LearningCourseManifest, batchId: string): string | null {
  const batch = manifest?.batches?.find(b => b.id === batchId);
  if (!batch || batch.moduleIds.length === 0) return null;
  const ids = new Set(batch.moduleIds);
  const first = flattenPageRefs(manifest).find(f => ids.has(f.module.id));
  return first ? first.page.id : null;
}
