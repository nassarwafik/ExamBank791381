// Phase 16A — the ONE extension seam a future question type (Phase 16B: networkSimulation v1) uses. A plugin is repository
// CODE that registers, at module level: its catalog definition (identity / version / capabilities), its default shape, its
// validator, its authoring editor and its student renderer. The server grader is registered separately in
// api/src/lib/question-type-graders.js (registerGrader). Nothing central — Builder, composer, student page, grading
// dispatcher, Blueprint — changes to admit a new type. Returns the function that removes every registration again.
import { registerQuestionType, type QuestionTypeDefinition } from "../questionTypeCatalog";
import { registerTypeDefaults, type TypeDefaults } from "../questionTypeDefaults";
import { registerTypeValidator, type TypeValidator } from "../questionTypeValidation";
import { registerAuthoringEditor } from "./authoringRegistry";
import { registerStudentRenderer } from "./studentRegistry";
import type { AuthoringEditorComponent, StudentRendererComponent } from "./registryTypes";

export type QuestionTypePlugin = {
  definition: QuestionTypeDefinition;
  defaults: TypeDefaults;
  validate: TypeValidator;
  Editor: AuthoringEditorComponent;
  StudentRenderer: StudentRendererComponent;
};
export function registerQuestionTypePlugin(plugin: QuestionTypePlugin): () => void {
  const undo: (() => void)[] = [];
  undo.push(registerQuestionType(plugin.definition));
  const key = plugin.definition.key;
  undo.push(registerTypeDefaults(key, plugin.defaults));
  undo.push(registerTypeValidator(key, plugin.validate));
  undo.push(registerAuthoringEditor(key, plugin.Editor));
  undo.push(registerStudentRenderer(key, plugin.StudentRenderer));
  return () => { for (const u of undo.reverse()) u(); };
}
