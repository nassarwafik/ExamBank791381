// Phase 16A — CODE-OWNED authoring registry: question type KEY → the editor component the repository ships for it. Wave 1
// editors are lazy chunks (never in the initial graph); a plugin registers its editor at module level. Exam data never
// selects a module: every import() below is a literal relative path written here.
import { lazy } from "react";
import type { AuthoringEditorComponent } from "./registryTypes";

const editors = new Map<string, AuthoringEditorComponent>();
export function registerAuthoringEditor(key: string, editor: AuthoringEditorComponent): () => void {
  editors.set(key, editor);
  return () => { editors.delete(key); };
}
export const resolveAuthoringEditor = (key: unknown): AuthoringEditorComponent | undefined => (typeof key === "string" ? editors.get(key) : undefined);

registerAuthoringEditor("multipleSelect", lazy(() => import("./editors/MultipleSelectEditor")));
registerAuthoringEditor("numericResponse", lazy(() => import("./editors/NumericResponseEditor")));
registerAuthoringEditor("matrix", lazy(() => import("./editors/MatrixEditor")));
registerAuthoringEditor("categorization", lazy(() => import("./editors/CategorizationEditor")));
