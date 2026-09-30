// Phase 16A — CODE-OWNED student runtime registry: question type KEY → the response renderer the repository ships for it.
// StudentQuestionCard / CompoundQuestion resolve a renderer here and hand it ONE generic seam: onAnswer(next: Answer). The
// Wave 1 renderers are lazy chunks; a plugin registers its renderer at module level. Lookup is by canonical key (student
// payloads may carry lower-cased legacy spellings, so the catalog resolver is used) — never by anything in exam data.
import { lazy } from "react";
import { resolveQuestionTypeKey, questionTypeDefinition } from "../questionTypeCatalog";
import type { StudentRendererComponent } from "./registryTypes";

const renderers = new Map<string, StudentRendererComponent>();
export function registerStudentRenderer(key: string, renderer: StudentRendererComponent): () => void {
  renderers.set(key, renderer);
  return () => { renderers.delete(key); };
}
/** The registered renderer for a question's type (legacy types have none — the card keeps its inline path). */
export function resolveStudentRenderer(rawType: unknown): { key: string; label: string; Renderer: StudentRendererComponent } | undefined {
  const key = resolveQuestionTypeKey(rawType);
  if (!key) return undefined;
  const Renderer = renderers.get(key);
  if (!Renderer) return undefined;
  return { key, label: questionTypeDefinition(key)?.label ?? key, Renderer };
}

registerStudentRenderer("multipleSelect", lazy(() => import("./student/MultipleSelectResponse")));
registerStudentRenderer("numericResponse", lazy(() => import("./student/NumericResponseInput")));
registerStudentRenderer("matrix", lazy(() => import("./student/MatrixResponse")));
registerStudentRenderer("categorization", lazy(() => import("./student/CategorizationResponse")));
