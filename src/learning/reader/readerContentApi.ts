// The content API the reader depends on — defaulted to the Phase-2 registry, but injectable (tests pass a fake
// with synthetic content, so the reader is exercised without any network). Kept in its own module so the reader
// component file only exports a component (fast-refresh friendly).
import { loadCourseManifest, hasModuleContent, loadModuleContent } from "../content/registry";
import type { LearningCourseManifest, ContentModule } from "../content/types";

export type ReaderContentApi = {
  loadManifest: (courseId: string) => Promise<LearningCourseManifest>;
  hasModule: (courseId: string, moduleId: string) => boolean;
  loadModule: (courseId: string, moduleId: string) => Promise<ContentModule>;
};

export const registryContentApi: ReaderContentApi = {
  loadManifest: loadCourseManifest,
  hasModule: hasModuleContent,
  loadModule: loadModuleContent,
};
