// Phase L.6a — TEST ENVIRONMENT ONLY (vite.config.ts aliases moduleBodySource.ts to this file under VITEST): the authored module
// bodies, imported directly. The headers are ignored. Never reached by the production bundle.
import type { ContentModule } from "./types";
import { loadBundledModuleContent } from "./bundledModules";

export async function loadModuleBody(courseId: string, moduleId: string, headers: Record<string, string> = {}): Promise<ContentModule> {
  void headers;
  return loadBundledModuleContent(courseId, moduleId);
}
