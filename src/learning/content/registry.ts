// Learning Materials — Phase 2: content registry / lazy loader.
//
// Chunking strategy (§16/§17): MODULE-LEVEL. The course MANIFEST (small TOC identities) is one lazy chunk per
// course; each MODULE BODY (its pages + blocks) is its own lazy chunk. The main app bundle imports NONE of this
// eagerly — everything is reached through statically-analyzable `import()` thunks that Vite can code-split. This
// keeps the 264+ page book (and future books 794589 / 899373 / …) out of the initial bundle, and lets the future
// Reader load only the manifest for a table of contents, then a single module body when the student opens it.
//
// Registering a new course/module is a data edit here — the Reader never changes.

import type { LearningCourseManifest, ContentModule } from "./types";

/** Thrown only for a genuinely unknown course/module id; normal content problems use the validator instead. */
export class LearningContentError extends Error {
  readonly code: "unknown-course" | "unknown-module";
  constructor(code: "unknown-course" | "unknown-module", message: string) {
    super(message);
    this.name = "LearningContentError";
    this.code = code;
  }
}

// Static `import()` thunks — Vite analyzes these at build time and emits one chunk each. Nothing is imported
// until the thunk is called, so listing a course here does NOT pull its manifest (or any page body) into memory.
type ManifestLoader = () => Promise<{ default: LearningCourseManifest }>;
type ModuleLoader = () => Promise<{ default: ContentModule }>;

const COURSE_MANIFESTS: Record<string, ManifestLoader> = {
  "791381": () => import("./791381/manifest"),
};

// Module BODY loaders per course. Phase 2 authors the manifest (TOC) but no converted module bodies yet, so this
// map is intentionally empty for 791381 — the wiring and types are proven; bodies arrive with content conversion
// in a later phase, each as its own `import("./791381/modules/<id>")` chunk registered here.
const COURSE_MODULE_LOADERS: Record<string, Record<string, ModuleLoader>> = {
  "791381": {},
};

/** Whether the registry knows a course's content (its manifest is registered). Pure, no import triggered. */
export function hasCourseContent(courseId: string): boolean {
  return Object.prototype.hasOwnProperty.call(COURSE_MANIFESTS, courseId);
}

/** The registered course ids. Pure, no import triggered. */
export function registeredCourseIds(): string[] {
  return Object.keys(COURSE_MANIFESTS);
}

/**
 * Load a course's lightweight manifest (TOC identities only). Triggers exactly ONE lazy chunk import for that
 * course's manifest and nothing else — no module bodies, no page blocks, no network.
 */
export async function loadCourseManifest(courseId: string): Promise<LearningCourseManifest> {
  const loader = COURSE_MANIFESTS[courseId];
  if (!loader) throw new LearningContentError("unknown-course", `no content registered for course "${courseId}"`);
  return (await loader()).default;
}

/** Whether a specific module BODY is registered (Phase 2: none yet for 791381). Pure, no import triggered. */
export function hasModuleContent(courseId: string, moduleId: string): boolean {
  return Boolean(COURSE_MODULE_LOADERS[courseId] && Object.prototype.hasOwnProperty.call(COURSE_MODULE_LOADERS[courseId], moduleId));
}

/** Load a single module BODY (its pages + blocks) as its own lazy chunk. Throws for an unknown course/module. */
export async function loadModuleContent(courseId: string, moduleId: string): Promise<ContentModule> {
  const perCourse = COURSE_MODULE_LOADERS[courseId];
  if (!perCourse) throw new LearningContentError("unknown-course", `no content registered for course "${courseId}"`);
  const loader = perCourse[moduleId];
  if (!loader) throw new LearningContentError("unknown-module", `no body registered for module "${moduleId}" of course "${courseId}"`);
  return (await loader()).default;
}
