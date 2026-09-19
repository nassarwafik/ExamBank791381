// Class Learning Materials — PROGRESSIVE RELEASE: a pure, generic manifest filter.
//
// A student's Reader never sees a module the teacher has not published: the canonical course manifest is reduced
// to EXACTLY the allowed module ids before the Reader receives it. Everything the Reader derives — the TOC, the
// jump list, previous/next, the "page N of M" total — comes from this filtered manifest, so a hidden module is
// simply absent (no placeholder, no «قيد الإعداد», no locked entry, no title, no page in the count). A hidden MIDDLE
// module (m01 + m07 released, m02 hidden) reads straight from the last page of m01 to the first page of m07.

import type { LearningCourseManifest } from "./types";

/**
 * Return a NEW manifest containing only the modules whose id is in `allowedModuleIds` (canonical module order,
 * lessons/pages of the kept modules untouched, course metadata preserved). `batches` keep only kept module ids and
 * a batch whose modules are all hidden loses its references (becomes empty) rather than pointing at absent modules.
 * The input is never mutated. Unknown allowed ids are ignored; an empty allow-list yields a course with no modules.
 */
export function filterManifestByModuleIds(manifest: LearningCourseManifest, allowedModuleIds: readonly string[]): LearningCourseManifest {
  const allowed = new Set(allowedModuleIds.map(id => String(id || "").trim()).filter(Boolean));
  const modules = (manifest.modules ?? [])
    .filter(m => allowed.has(m.id))
    .map(m => ({ ...m, lessons: (m.lessons ?? []).map(l => ({ ...l, pages: (l.pages ?? []).map(p => ({ ...p })) })) }));
  const kept = new Set(modules.map(m => m.id));
  const out: LearningCourseManifest = { ...manifest, modules };
  if (manifest.batches) out.batches = manifest.batches.map(b => ({ ...b, moduleIds: (b.moduleIds ?? []).filter(id => kept.has(id)) }));
  return out;
}
