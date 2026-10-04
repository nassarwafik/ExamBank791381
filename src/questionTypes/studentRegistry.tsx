// Phase 16A — CODE-OWNED student runtime registry: (question type KEY, VERSION) → the response renderer the repository ships
// for that exact identity. StudentQuestionCard / CompoundQuestion resolve a renderer here and hand it ONE generic seam:
// onAnswer(next: Answer). Review Fix 1 / R1: a student assigned an old published revision gets the renderer of the EXACT
// stored version (absence = V1); a missing implementation resolves to nothing and the card renders a safe unsupported state —
// never the latest renderer, never a crash. Lookup is by canonical key (student payloads may carry lower-cased legacy
// spellings, so the catalog resolver is used) — never by anything else in exam data.
import { lazy } from "react";
import { questionTypeDefinition, createVersionedRegistry, resolveQuestionTypeKey, effectiveQuestionTypeVersion } from "../questionTypeCatalog";
import type { StudentRendererComponent } from "./registryTypes";

const renderers = createVersionedRegistry<StudentRendererComponent>("student renderer");
export const registerStudentRenderer = (key: string, version: number, renderer: StudentRendererComponent): (() => void) => renderers.register(key, version, renderer);
/** The registered renderer for EXACTLY the question's (type, effective version); legacy types have none — the card keeps its inline path. */
export function resolveStudentRenderer(rawType: unknown, storedVersion: unknown): { key: string; version: number; label: string; Renderer: StudentRendererComponent } | undefined {
  const hit = renderers.resolve(rawType, storedVersion);
  if (!hit) return undefined;
  return { key: hit.key, version: hit.version, label: questionTypeDefinition(hit.key)?.label ?? hit.key, Renderer: hit.impl };
}

/** True when the student runtime must FAIL CLOSED for this stored identity: a known type whose exact version has no
 *  registered implementation (a non-legacy type, or a legacy type at an unsupported version), or an UNKNOWN key carrying a
 *  `questionTypeVersion` (a registry-era type whose implementation is gone, e.g. an unregistered plugin). A pre-registry
 *  structured / legacy flat type ("open", "sequence", …) keeps its original inline path — the server grades those through
 *  its alias adapter and fails closed on everything else. */
export function studentUnsupported(rawType: unknown, storedVersion: unknown): boolean {
  const key = resolveQuestionTypeKey(rawType);
  const def = key ? questionTypeDefinition(key) : undefined;
  if (!def) return storedVersion !== undefined;
  return !def.legacy || effectiveQuestionTypeVersion(key, storedVersion) === undefined;
}

registerStudentRenderer("multipleSelect", 1, lazy(() => import("./student/MultipleSelectResponse")));
registerStudentRenderer("numericResponse", 1, lazy(() => import("./student/NumericResponseInput")));
registerStudentRenderer("matrix", 1, lazy(() => import("./student/MatrixResponse")));
registerStudentRenderer("categorization", 1, lazy(() => import("./student/CategorizationResponse")));
// Phase 16B-A — the sandboxed simulation host (lazy: loaded only when a simulation question is rendered).
registerStudentRenderer("simulation", 1, lazy(() => import("./student/SimulationResponse")));
// Phase 17A — the coding response + CodingEditor (lazy: loaded only when a coding question is rendered; student AND preview).
registerStudentRenderer("coding", 1, lazy(() => import("./student/CodingResponse")));
// Phase 17F-C2 RF1 — coding@2 renders exactly like coding@1 for the student (same lazy module; the policy is private teacher data).
registerStudentRenderer("coding", 2, lazy(() => import("./student/CodingResponse")));
