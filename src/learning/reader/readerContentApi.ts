// The content API the reader depends on — injectable (tests pass a fake with synthetic content, so the reader is exercised
// without any network). Kept in its own module so the reader component file only exports a component (fast-refresh friendly).
// Phase L.6a — the manifest and the list of modules that have a body come from the app; each module BODY comes from the API
// with the caller's session headers (moduleBodySource.ts), after the server's publication check.
import { loadCourseManifest, hasModuleContent } from "../content/registry";
import { loadModuleBody } from "../content/moduleBodySource";
import type { LearningCourseManifest, ContentModule } from "../content/types";

export type ReaderContentApi = {
  loadManifest: (courseId: string) => Promise<LearningCourseManifest>;
  hasModule: (courseId: string, moduleId: string) => boolean;
  loadModule: (courseId: string, moduleId: string) => Promise<ContentModule>;
};

/** The content API for one session: module bodies are requested with these headers (a student's or a teacher's). */
export function createContentApi(headers: Record<string, string> = {}): ReaderContentApi {
  return {
    loadManifest: loadCourseManifest,
    hasModule: hasModuleContent,
    loadModule: (courseId, moduleId) => loadModuleBody(courseId, moduleId, headers),
  };
}

/** The headerless default (a host without a session). In the app the server refuses it; in tests it reads the authored content. */
export const registryContentApi: ReaderContentApi = createContentApi();
