// Class Learning Materials — the STUDENT's constrained content API.
//
// Authentication and entitlement stay OUTSIDE the generic LearningReader: the portal asks the server which module
// ids the student's class has published, and this adapter turns the base (registry) content API into one that can
// only ever see those modules:
//   loadManifest → the canonical manifest FILTERED to the allowed ids (so navigation cannot even name a hidden page)
//   hasModule    → false for anything not allowed (the Reader shows nothing loadable for it)
//   loadModule   → rejects BEFORE the underlying loader is invoked (no accidental lazy chunk import of a hidden body)
// The Reader itself is untouched — one Reader authority, no student fork.
//
// Phase L.6a — the AUTHORITY is the server: a module body is served by the API only while it is published to the student's
// persisted class (GET /api/learning-content/{course}/{module}); bodies are no longer public assets. This adapter is the
// client-side default-deny on top of it (no hidden page in the manifest, no request for a hidden module).

import { filterManifestByModuleIds } from "../content/filterManifest";
import { registryContentApi, type ReaderContentApi } from "./readerContentApi";

export class RestrictedModuleError extends Error {
  readonly code = "module-not-released" as const;
  constructor(moduleId: string) { super(`module "${moduleId}" is not released to this class`); this.name = "RestrictedModuleError"; }
}

/** Build a content API that exposes only `allowedModuleIds` of `courseId`, on top of `base` (the registry by default). */
export function createRestrictedReaderContentApi(courseId: string, allowedModuleIds: readonly string[], base: ReaderContentApi = registryContentApi): ReaderContentApi {
  const allowed = new Set(allowedModuleIds.map(id => String(id || "").trim()).filter(Boolean));
  const permitted = (c: string, moduleId: string) => c === courseId && allowed.has(moduleId);
  return {
    loadManifest: async c => filterManifestByModuleIds(await base.loadManifest(c), c === courseId ? [...allowed] : []),
    hasModule: (c, moduleId) => permitted(c, moduleId) && base.hasModule(c, moduleId),
    loadModule: (c, moduleId) => permitted(c, moduleId) ? base.loadModule(c, moduleId) : Promise.reject(new RestrictedModuleError(moduleId)),
  };
}
