// Phase 16A — the ONE extension seam a future question type uses (Phase 16B: every simulation / interactive runtime profile —
// network lab, function graph, projectile motion, circuit lab, chemical equation, algorithm trace, … — is a plugin family).
// A plugin is repository CODE that registers, at module level, ONE type FAMILY: its catalog definition (identity, CURRENT
// version, capabilities) and one executable implementation per supported version (defaults, validator, authoring editor,
// student renderer). The server grader is registered separately in api/src/lib/question-type-graders.js
// (registerGrader(key, version, handler)). Nothing central — Builder, composer, student page, grading dispatcher, Blueprint,
// sanitizer — changes to admit a type.
//
// Review Fix 1 / R1: every executable registration is version-bound. A future V2 is ADDITIVE: the family lists BOTH
// implementations and the catalog's `version` becomes 2; V1 keeps serving every stored V1 question.
// Registration is TRANSACTIONAL: if any step fails, every earlier step is undone (no catalog / defaults / validator /
// editor / renderer residue) and the error is rethrown. Returns the function that removes every registration again.
import { registerQuestionType, type QuestionTypeDefinition } from "../questionTypeCatalog";
import { registerTypeDefaults, type TypeDefaults } from "../questionTypeDefaults";
import { registerTypeValidator, type TypeValidator } from "../questionTypeValidation";
import { registerAuthoringEditor } from "./authoringRegistry";
import { registerStudentRenderer } from "./studentRegistry";
import type { AuthoringEditorComponent, StudentRendererComponent } from "./registryTypes";

export type QuestionTypeVersionImplementation = {
  /** Default shape for a NEW node created at this version (omit for none). */
  defaults?: TypeDefaults;
  /** Configuration / answer-key validator for THIS version's data shape (omit for none — the generic identity checks still run). */
  validate?: TypeValidator;
  Editor: AuthoringEditorComponent;
  StudentRenderer: StudentRendererComponent;
};
export type QuestionTypePlugin = {
  /** `definition.version` is the family's CURRENT version; `versions` must implement it and may implement older ones. */
  definition: QuestionTypeDefinition;
  versions: Record<number, QuestionTypeVersionImplementation>;
};

const isComponent = (c: unknown): boolean => typeof c === "function" || (!!c && typeof c === "object" && "$$typeof" in (c as object));

export function registerQuestionTypePlugin(plugin: QuestionTypePlugin): () => void {
  if (!plugin || typeof plugin !== "object" || !plugin.definition || typeof plugin.definition !== "object") throw new Error("question type plugin requires a definition");
  const { definition, versions } = plugin;
  const key = definition.key;
  const current = definition.version;
  // ── validate the whole family BEFORE touching any registry ─────────────────────────────────────────────────────────
  if (!versions || typeof versions !== "object") throw new Error("question type plugin requires versions for " + String(key));
  const entries = Object.keys(versions).map(v => [Number(v), versions[Number(v)]] as const);
  if (!entries.length) throw new Error("question type plugin " + String(key) + " implements no version");
  for (const [v, impl] of entries) {
    if (!Number.isInteger(v) || v < 1 || v > current) throw new Error("question type plugin " + String(key) + ": version " + v + " is outside 1.." + current);
    if (!impl || typeof impl !== "object") throw new Error("question type plugin " + String(key) + "@" + v + ": implementation required");
    if (!isComponent(impl.Editor)) throw new Error("question type plugin " + String(key) + "@" + v + ": Editor must be a component");
    if (!isComponent(impl.StudentRenderer)) throw new Error("question type plugin " + String(key) + "@" + v + ": StudentRenderer must be a component");
    if (impl.defaults !== undefined && typeof impl.defaults !== "function") throw new Error("question type plugin " + String(key) + "@" + v + ": defaults must be a function");
    if (impl.validate !== undefined && typeof impl.validate !== "function") throw new Error("question type plugin " + String(key) + "@" + v + ": validate must be a function");
  }
  if (!versions[current]) throw new Error("question type plugin " + String(key) + ": the current version " + current + " has no implementation");
  // ── transactional registration: any failure rolls back every earlier step ───────────────────────────────────────────
  const undo: (() => void)[] = [];
  const rollback = () => { for (const u of undo.splice(0).reverse()) { try { u(); } catch { /* best effort: keep unwinding */ } } };
  try {
    undo.push(registerQuestionType(definition));
    for (const [v, impl] of entries.sort((a, b) => a[0] - b[0])) {
      if (impl.defaults) undo.push(registerTypeDefaults(key, v, impl.defaults));
      if (impl.validate) undo.push(registerTypeValidator(key, v, impl.validate));
      undo.push(registerAuthoringEditor(key, v, impl.Editor));
      undo.push(registerStudentRenderer(key, v, impl.StudentRenderer));
    }
  } catch (e) {
    rollback();
    throw e;
  }
  return rollback;
}
