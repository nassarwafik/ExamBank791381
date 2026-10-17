// Learning Materials — Phase 2: content registry / lazy loader.
//
// The course MANIFEST (small TOC identities) is one lazy chunk per course, reached through a statically-analyzable `import()`
// thunk, so the main app bundle imports none of it eagerly. Phase L.6a — MODULE BODIES are no longer app chunks: the app knows
// only which module ids have a body (below); each body is served by the API after the publication check, and the authored
// bodies are loaded by bundledModules.ts in the build scripts and tests only.
//
// Registering a new course/module is a data edit here (and in bundledModules.ts) — the Reader never changes.

import type { LearningCourseManifest } from "./types";

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

const COURSE_MANIFESTS: Record<string, ManifestLoader> = {
  "791381": () => import("./791381/manifest"),
};

// The module ids that HAVE a body (791381: every manifest module). Phase L.6a — only the ids live in the app; each body is served
// by the API after the publication check (moduleBodySource.ts), and the authored bodies are loaded by bundledModules.ts in the
// build scripts and tests only. contentData.sync.test.ts pins this list to the authored modules and to the server's data.
export const COURSE_CONTENT_MODULE_IDS: Record<string, readonly string[]> = {
  "791381": [
    "791381-m01",
    "791381-m02",
    "791381-m07",
    "791381-m08",
    "791381-m09",
    "791381-m10",
    "791381-m11",
    "791381-m12",
    "791381-m13",
    "791381-m14",
    "791381-m15",
    "791381-m16",
    "791381-m17",
    "791381-m18",
    "791381-m03",
    "791381-m19",
    "791381-m04",
    "791381-m20",
    "791381-m21",
    "791381-m22",
    "791381-m23",
    "791381-m24",
    "791381-m05",
    "791381-m25",
    "791381-m26",
    "791381-m27",
    "791381-m06",
    "791381-m28",
  ],
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

/** Whether a specific module BODY exists (791381: every manifest module today). Pure, no import, no request. */
export function hasModuleContent(courseId: string, moduleId: string): boolean {
  return (COURSE_CONTENT_MODULE_IDS[courseId] ?? []).includes(moduleId);
}
