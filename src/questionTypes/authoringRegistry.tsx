// Phase 16A — CODE-OWNED authoring registry: (question type KEY, VERSION) → the editor component the repository ships for that
// exact identity. Wave 1 editors are lazy chunks (never in the initial graph); a plugin registers its editors per version at
// module level. Review Fix 1 / R1: resolution is bound to BOTH key and version (absence = V1) — a stored V1 question always
// opens the V1 editor, a V2 question the V2 editor, an unsupported version resolves to NOTHING (the host shows an explicit
// unsupported-version state; there is no "latest" fallback). Exam data never selects a module: every import() below is a
// literal relative path written here.
import { lazy } from "react";
import { createVersionedRegistry } from "../questionTypeCatalog";
import type { AuthoringEditorComponent } from "./registryTypes";

const editors = createVersionedRegistry<AuthoringEditorComponent>("authoring editor");
export const registerAuthoringEditor = (key: string, version: number, editor: AuthoringEditorComponent): (() => void) => editors.register(key, version, editor);
/** The editor registered for EXACTLY (key, effective version of `storedVersion`); undefined when none exists. */
export const resolveAuthoringEditor = (key: unknown, storedVersion: unknown): AuthoringEditorComponent | undefined => editors.resolve(key, storedVersion)?.impl;

registerAuthoringEditor("multipleSelect", 1, lazy(() => import("./editors/MultipleSelectEditor")));
registerAuthoringEditor("numericResponse", 1, lazy(() => import("./editors/NumericResponseEditor")));
registerAuthoringEditor("matrix", 1, lazy(() => import("./editors/MatrixEditor")));
registerAuthoringEditor("categorization", 1, lazy(() => import("./editors/CategorizationEditor")));
// Phase 16B-A — the universal simulation package type (lazy: upload / library / preview UI never enters the initial graph).
registerAuthoringEditor("simulation", 1, lazy(() => import("./editors/SimulationEditor")));
// Phase 17A — coding@1 authoring (lazy: languages, starter code, public / hidden tests, limits never enter the initial graph).
registerAuthoringEditor("coding", 1, lazy(() => import("./editors/CodingQuestionEditor")));
// Phase 17F-C2 RF1 — coding@2 (explicit compile-error policy) uses the same lazy editor module, which reads the node's own version.
registerAuthoringEditor("coding", 2, lazy(() => import("./editors/CodingQuestionEditor")));
// Phase 18C — networkCli@1 authoring (lazy: the structured device-state tables and the try-out terminal never enter the initial graph).
registerAuthoringEditor("networkCli", 1, lazy(() => import("./editors/NetworkCliEditor")));
// Phase 19A — inlineCloze@1 authoring (lazy: the token editor never enters the initial graph).
registerAuthoringEditor("inlineCloze", 1, lazy(() => import("./editors/InlineClozeEditor")));
// Phase 19B — parametricNumeric@1 authoring (lazy: variables / constraints / expression editor and the sample preview).
registerAuthoringEditor("parametricNumeric", 1, lazy(() => import("./editors/ParametricNumericEditor")));
// Phase 19D — visual authoring (lazy: the region editor, label bank and mapping never enter the initial graph).
registerAuthoringEditor("hotspot", 1, lazy(() => import("./editors/HotspotEditor")));
registerAuthoringEditor("labelDiagram", 1, lazy(() => import("./editors/LabelDiagramEditor")));
registerAuthoringEditor("openResponse", 1, lazy(() => import("./editors/OpenResponseEditor")));
